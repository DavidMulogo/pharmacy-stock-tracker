import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/admin-session";
import { recordAdminActivity } from "@/lib/admin-security";
import { normalizePharmacyRow } from "@/lib/data";
import { getAdminNotificationSummary } from "@/lib/notifications";
import { getOnboardingSummary } from "@/lib/onboarding";
import { getPharmacyEntitlementObservationFromDatabase } from "@/lib/entitlements";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type { EntitlementMode, PharmacyBillingCycle, PharmacyPlan, PharmacyStatus } from "@/lib/types";

type PharmacyInsert = Database["public"]["Tables"]["pharmacies"]["Insert"];
type PharmacyUpdate = Database["public"]["Tables"]["pharmacies"]["Update"];
type PharmacyAccessInsert = Database["public"]["Tables"]["pharmacy_access"]["Insert"];
type PharmacyUserInsert = Database["public"]["Tables"]["pharmacy_users"]["Insert"];
type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;
type AdminCreateStep =
  | "precheck_code"
  | "insert_pharmacy"
  | "insert_pharmacy_access"
  | "insert_owner_user"
  | "revalidate_admin"
  | "rollback_pharmacy_users"
  | "rollback_pharmacy_access"
  | "rollback_pharmacy_settings"
  | "rollback_pharmacies";

const plans: PharmacyPlan[] = ["TRIAL", "STARTER", "BUSINESS", "MULTI_BRANCH", "ENTERPRISE"];
const statuses: PharmacyStatus[] = ["ACTIVE", "TRIAL", "EXPIRED", "SUSPENDED"];
const billingCycles: PharmacyBillingCycle[] = ["MONTHLY", "ANNUAL", "CUSTOM"];
const duplicateCodeMessage = "That pharmacy login code already exists. Please choose another code.";

function optionalDate(value: unknown) {
  const text = String(value || "").trim();
  return text ? text : null;
}

function getValidatedPlan(value: unknown): PharmacyPlan {
  const plan = String(value || "TRIAL") as PharmacyPlan;
  return plans.includes(plan) ? plan : "TRIAL";
}

function getValidatedStatus(value: unknown): PharmacyStatus {
  const status = String(value || "TRIAL") as PharmacyStatus;
  return statuses.includes(status) ? status : "TRIAL";
}

function getOptionalBillingCycle(value: unknown): PharmacyBillingCycle | null {
  const cycle = String(value || "") as PharmacyBillingCycle;
  return billingCycles.includes(cycle) ? cycle : null;
}

function getEntitlementMode(value: unknown): EntitlementMode {
  return value === "OBSERVE" ? "OBSERVE" : "OBSERVE";
}

function optionalNonNegativeNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : Number.NaN;
}

function logServerError(message: string, error: unknown) {
  console.error(message, error);

  const supabaseError = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown } | null | undefined;
  console.error({
    message: supabaseError?.message,
    details: supabaseError?.details,
    hint: supabaseError?.hint,
    code: supabaseError?.code,
  });
}

function errorResponse(error: unknown, logMessage: string, userMessage: string, status = 500) {
  logServerError(logMessage, error);
  return NextResponse.json({ error: userMessage }, { status });
}

function isUniqueViolation(error: unknown) {
  const supabaseError = error as { code?: unknown; message?: unknown } | null | undefined;
  return supabaseError?.code === "23505" || String(supabaseError?.message || "").toLowerCase().includes("duplicate key");
}

function isSuperAdmin(admin: { role: string }) {
  return admin.role.toUpperCase() === "SUPER_ADMIN" || admin.role.toUpperCase() === "SUPER-ADMIN";
}

function serializeOriginalError(error: unknown) {
  const supabaseError = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown } | null | undefined;

  return {
    code: supabaseError?.code,
    message: supabaseError?.message || (error instanceof Error ? error.message : undefined),
    details: supabaseError?.details,
    hint: supabaseError?.hint,
  };
}

async function rollbackPharmacyCreation(supabase: SupabaseAdminClient, pharmacyId: string) {
  console.error("Rolling back failed pharmacy creation", { pharmacy_id: pharmacyId });

  const rollbackSteps: Array<{
    label: string;
    failedStep: AdminCreateStep;
    run: () => PromiseLike<{ error: unknown }>;
  }> = [
    {
      label: "pharmacy_users",
      failedStep: "rollback_pharmacy_users",
      run: () => supabase.from("pharmacy_users").delete().eq("pharmacy_id", pharmacyId),
    },
    {
      label: "pharmacy_access",
      failedStep: "rollback_pharmacy_access",
      run: () => supabase.from("pharmacy_access").delete().eq("pharmacy_id", pharmacyId),
    },
    {
      label: "pharmacy_settings",
      failedStep: "rollback_pharmacy_settings",
      run: () => supabase.from("pharmacy_settings").delete().eq("pharmacy_id", pharmacyId),
    },
    {
      label: "pharmacy_onboarding",
      failedStep: "rollback_pharmacy_settings",
      run: () => supabase.from("pharmacy_onboarding").delete().eq("pharmacy_id", pharmacyId),
    },
    {
      label: "notifications",
      failedStep: "rollback_pharmacy_settings",
      run: () => supabase.from("notifications").delete().eq("pharmacy_id", pharmacyId),
    },
    {
      label: "pharmacies",
      failedStep: "rollback_pharmacies",
      run: () => supabase.from("pharmacies").delete().eq("id", pharmacyId),
    },
  ];

  for (const step of rollbackSteps) {
    console.error(`Rollback deleting ${step.label}...`);
    const result = await step.run();
    if (result.error) {
      console.error(`FAILED rollback at ${step.label}`, result.error);
      return { failedStep: step.failedStep, error: result.error };
    }
  }

  return null;
}

async function deletePharmacyPermanently(supabase: SupabaseAdminClient, pharmacyId: string) {
  const deleteStep = async (label: string, run: () => PromiseLike<{ error: unknown }>) => {
    console.info(`[api/admin/pharmacies:PATCH] permanent delete: ${label}`);
    const result = await run();
    if (result.error) {
      console.error(`FAILED permanent delete at ${label}`, result.error);
      throw result.error;
    }
  };

  const anySupabase = supabase as unknown as {
    from: (table: string) => {
      delete: () => {
        eq: (column: string, value: string) => PromiseLike<{ error: unknown }>;
        in: (column: string, values: string[]) => PromiseLike<{ error: unknown }>;
      };
    };
  };

  const salesResult = await supabase.from("sales").select("id").eq("pharmacy_id", pharmacyId);
  if (salesResult.error) {
    console.error("FAILED permanent delete sales lookup", salesResult.error);
    throw salesResult.error;
  }

  const saleIds = (salesResult.data || []).map((sale) => sale.id);
  if (saleIds.length > 0) {
    console.info("[api/admin/pharmacies:PATCH] permanent delete: sale_items by sale_id");
    const saleItemsBySaleResult = await anySupabase.from("sale_items").delete().in("sale_id", saleIds);
    if (saleItemsBySaleResult.error) {
      const message = serializeOriginalError(saleItemsBySaleResult.error).message || "";
      if (!String(message).toLowerCase().includes("sale_items")) {
        console.error("FAILED permanent delete at sale_items by sale_id", saleItemsBySaleResult.error);
        throw saleItemsBySaleResult.error;
      }
    }
  }

  console.info("[api/admin/pharmacies:PATCH] permanent delete: sale_items by pharmacy_id");
  const saleItemsByPharmacyResult = await anySupabase.from("sale_items").delete().eq("pharmacy_id", pharmacyId);
  if (saleItemsByPharmacyResult.error) {
    const message = serializeOriginalError(saleItemsByPharmacyResult.error).message || "";
    if (!String(message).toLowerCase().includes("sale_items")) {
      console.error("FAILED permanent delete at sale_items by pharmacy_id", saleItemsByPharmacyResult.error);
      throw saleItemsByPharmacyResult.error;
    }
  }

  await deleteStep("sale_batch_allocations", () => supabase.from("sale_batch_allocations").delete().eq("pharmacy_id", pharmacyId));
  await deleteStep("sales", () => supabase.from("sales").delete().eq("pharmacy_id", pharmacyId));
  await deleteStep("inventory_adjustments", () => supabase.from("inventory_adjustments").delete().eq("pharmacy_id", pharmacyId));
  await deleteStep("inventory_batches", () => supabase.from("inventory_batches").delete().eq("pharmacy_id", pharmacyId));
  await deleteStep("products", () => supabase.from("products").delete().eq("pharmacy_id", pharmacyId));
  await deleteStep("pharmacy_sessions", () => supabase.from("pharmacy_sessions").delete().eq("pharmacy_id", pharmacyId));
  await deleteStep("pharmacy_users", () => supabase.from("pharmacy_users").delete().eq("pharmacy_id", pharmacyId));
  await deleteStep("pharmacy_access", () => supabase.from("pharmacy_access").delete().eq("pharmacy_id", pharmacyId));
  await deleteStep("pharmacy_settings", () => supabase.from("pharmacy_settings").delete().eq("pharmacy_id", pharmacyId));
  await deleteStep("pharmacy_onboarding", () => supabase.from("pharmacy_onboarding").delete().eq("pharmacy_id", pharmacyId));
  await deleteStep("notifications", () => supabase.from("notifications").delete().eq("pharmacy_id", pharmacyId));
  await deleteStep("pharmacies", () => supabase.from("pharmacies").delete().eq("id", pharmacyId));
}

export async function GET(request: Request) {
  const admin = await requireAdminSession("api/admin/pharmacies GET");
  if (admin instanceof NextResponse) return admin;

  try {
    const supabase = getSupabaseAdmin();
    const searchParams = new URL(request.url).searchParams;
    const historyPharmacyId = searchParams.get("history");
    if (historyPharmacyId) {
      const historyResult = await supabase
        .from("pharmacy_subscription_history")
        .select("*")
        .eq("pharmacy_id", historyPharmacyId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (historyResult.error) throw historyResult.error;
      return NextResponse.json({ subscription_history: historyResult.data || [] }, { status: 200 });
    }
    const showArchived = searchParams.get("archived") === "1";
    let query = supabase.from("pharmacies").select("*").order("created_at", { ascending: false });
    if (!showArchived) query = query.is("archived_at", null);
    const result = await query;

    if (result.error) throw result.error;

    const pharmacies = await Promise.all(
      (result.data || []).map(async (pharmacy) => {
        const normalized = normalizePharmacyRow(pharmacy);
        return {
          ...normalized,
          onboarding: await getOnboardingSummary(normalized.id),
          notification_summary: getAdminNotificationSummary(normalized),
          entitlement_observation: await getPharmacyEntitlementObservationFromDatabase(normalized),
        };
      }),
    );

    return NextResponse.json({ pharmacies }, { status: 200 });
  } catch (error) {
    return errorResponse(error, "Admin pharmacies load failed:", "Unable to load pharmacies.");
  }
}

export async function POST(request: Request) {
  const admin = await requireAdminSession("api/admin/pharmacies POST");
  if (admin instanceof NextResponse) return admin;

  const supabase = getSupabaseAdmin();
  let createdPharmacyId: string | null = null;
  let failedStep: AdminCreateStep = "precheck_code";

  try {
    const body = await request.json();
    const pharmacyName = String(body.pharmacy_name || "").trim();
    const ownerName = String(body.owner_name || "").trim();
    const phone = String(body.phone || "").trim();
    const pharmacyCode = String(body.pharmacy_code || "").trim();
    const password = String(body.password || "");

    if (!pharmacyName || !ownerName || !phone || !pharmacyCode || !password) {
      return NextResponse.json({ error: "Complete pharmacy, owner, phone, code, and password." }, { status: 400 });
    }

    failedStep = "precheck_code";
    const existingCodeResult = await supabase.from("pharmacy_access").select("id").ilike("pharmacy_code", pharmacyCode).limit(1);
    if (existingCodeResult.error) {
      console.error("FAILED at pharmacy_access uniqueness check", existingCodeResult.error);
      throw existingCodeResult.error;
    }
    if ((existingCodeResult.data || []).length > 0) {
      return NextResponse.json({ error: duplicateCodeMessage }, { status: 400 });
    }

    const payload: PharmacyInsert = {
      pharmacy_name: pharmacyName,
      owner_name: ownerName,
      phone,
      plan: "TRIAL",
      status: "TRIAL",
      trial_ends_at: optionalDate(body.trial_ends_at) || new Date(Date.now() + 30 * 86_400_000).toISOString(),
      entitlement_mode: "OBSERVE",
    };
    failedStep = "insert_pharmacy";
    console.info("[api/admin/pharmacies:POST] creating pharmacy", {
      pharmacy_name: payload.pharmacy_name,
      owner_name: payload.owner_name,
      phone: payload.phone,
      plan: payload.plan,
      status: payload.status,
      trial_ends_at: payload.trial_ends_at,
      subscription_ends_at: payload.subscription_ends_at,
    });
    const pharmacyResult = await supabase.from("pharmacies").insert(payload).select("*").single();

    if (pharmacyResult.error) {
      console.error("FAILED at pharmacies", pharmacyResult.error);
      throw pharmacyResult.error;
    }
    createdPharmacyId = pharmacyResult.data.id;

    const passwordHash = await bcrypt.hash(password, 12);
    const accessPayload: PharmacyAccessInsert = {
      pharmacy_id: createdPharmacyId,
      pharmacy_code: pharmacyCode,
      password,
      password_hash: passwordHash,
    };
    failedStep = "insert_pharmacy_access";
    console.info("[api/admin/pharmacies:POST] creating pharmacy_access", {
      pharmacy_id: accessPayload.pharmacy_id,
      pharmacy_code: accessPayload.pharmacy_code,
      has_password: Boolean(accessPayload.password),
      has_password_hash: Boolean(accessPayload.password_hash),
    });
    const accessResult = await supabase.from("pharmacy_access").insert(accessPayload).select("id").single();

    if (accessResult.error) {
      console.error("FAILED at pharmacy_access", accessResult.error);
      if (isUniqueViolation(accessResult.error)) {
        const rollbackFailure = await rollbackPharmacyCreation(supabase, createdPharmacyId);
        if (rollbackFailure) {
          logServerError(`Admin pharmacy rollback failed at ${rollbackFailure.failedStep}:`, rollbackFailure.error);
          return NextResponse.json({ error: "Unable to create pharmacy. No changes were saved." }, { status: 500 });
        }
        return NextResponse.json({ error: duplicateCodeMessage }, { status: 400 });
      }
      throw accessResult.error;
    }

    const userPayload: PharmacyUserInsert = {
      pharmacy_id: createdPharmacyId,
      full_name: ownerName,
      username: "owner",
      password_hash: passwordHash,
      role: "OWNER",
      active: true,
    };
    failedStep = "insert_owner_user";
    console.info("[api/admin/pharmacies:POST] creating pharmacy_users", {
      pharmacy_id: userPayload.pharmacy_id,
      full_name: userPayload.full_name,
      username: userPayload.username,
      role: userPayload.role,
      active: userPayload.active,
      has_password_hash: Boolean(userPayload.password_hash),
    });
    const userResult = await supabase.from("pharmacy_users").insert(userPayload).select("id").single();

    if (userResult.error) {
      console.error("FAILED at pharmacy_users", userResult.error);
      throw userResult.error;
    }

    failedStep = "revalidate_admin";
    revalidatePath("/admin");
    return NextResponse.json({ pharmacy: normalizePharmacyRow(pharmacyResult.data) }, { status: 201 });
  } catch (error) {
    if (createdPharmacyId) {
      const rollbackFailure = await rollbackPharmacyCreation(supabase, createdPharmacyId);
      if (rollbackFailure) {
        logServerError(`Admin pharmacy creation failed at ${failedStep}:`, error);
        logServerError(`Admin pharmacy rollback failed at ${rollbackFailure.failedStep}:`, rollbackFailure.error);
        return NextResponse.json({ error: "Unable to create pharmacy. No changes were saved." }, { status: 500 });
      }
    }

    logServerError(`Admin pharmacy creation failed at ${failedStep}:`, error);
    return NextResponse.json({ error: "Unable to create pharmacy. No changes were saved." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdminSession("api/admin/pharmacies PATCH");
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await request.json();
    const id = String(body.id || "").trim();
    const action = String(body.action || "update");
    const confirmationCode = String(body.confirmationCode || "").trim();

    if (!id) {
      return NextResponse.json({ error: "Pharmacy id is required." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    if (action === "subscription") {
      const price = optionalNonNegativeNumber(body.agreed_price_tzs);
      const reason = String(body.change_reason || "").trim();
      if (!reason) return NextResponse.json({ error: "Enter a reason for the subscription change." }, { status: 400 });
      if (Number.isNaN(price)) return NextResponse.json({ error: "Agreed price must be zero or a positive amount." }, { status: 400 });
      if (body.entitlement_mode === "ENFORCE") {
        return NextResponse.json({ error: "Enforcement is not available yet. Keep this pharmacy in observation mode." }, { status: 400 });
      }

      const rpcResult = await supabase.rpc("update_pharmacy_subscription_v1", {
        p_pharmacy_id: id,
        p_changed_by_admin: admin.username,
        p_change_reason: reason,
        p_plan: getValidatedPlan(body.plan),
        p_status: getValidatedStatus(body.status),
        p_billing_cycle: getOptionalBillingCycle(body.billing_cycle),
        p_agreed_price_tzs: price,
        p_trial_ends_at: optionalDate(body.trial_ends_at),
        p_subscription_started_at: optionalDate(body.subscription_started_at),
        p_subscription_ends_at: optionalDate(body.subscription_ends_at),
        p_pilot_started_at: optionalDate(body.pilot_started_at),
        p_pilot_ends_at: optionalDate(body.pilot_ends_at),
        p_founding_price_ends_at: optionalDate(body.founding_price_ends_at),
        p_grace_period_ends_at: optionalDate(body.grace_period_ends_at),
        p_access_extension_ends_at: optionalDate(body.access_extension_ends_at),
        p_entitlement_mode: getEntitlementMode(body.entitlement_mode),
      });
      if (rpcResult.error) throw rpcResult.error;

      const updatedResult = await supabase.from("pharmacies").select("*").eq("id", id).single();
      if (updatedResult.error) throw updatedResult.error;
      const pharmacy = normalizePharmacyRow(updatedResult.data);
      await recordAdminActivity({
        admin,
        action: "SUBSCRIPTION_UPDATED",
        targetPharmacyId: id,
        targetPharmacyName: pharmacy.pharmacy_name,
        success: true,
        metadata: { plan: pharmacy.plan, status: pharmacy.status, billing_cycle: pharmacy.billing_cycle, entitlement_mode: pharmacy.entitlement_mode, change_reason: reason },
      });
      revalidatePath("/admin");
      return NextResponse.json({
        pharmacy: { ...pharmacy, entitlement_observation: await getPharmacyEntitlementObservationFromDatabase(pharmacy) },
        message: "Subscription saved in observation mode.",
      });
    }

    if (action === "reset-password") {
      const password = String(body.password || "");
      if (!password) return NextResponse.json({ error: "New password is required." }, { status: 400 });
      if (password.length < 8) return NextResponse.json({ error: "New password must contain at least 8 characters." }, { status: 400 });
      if (password.length > 128) return NextResponse.json({ error: "New password cannot exceed 128 characters." }, { status: 400 });

      const pharmacyResult = await supabase.from("pharmacies").select("pharmacy_name").eq("id", id).maybeSingle();
      if (pharmacyResult.error) throw pharmacyResult.error;
      if (!pharmacyResult.data) return NextResponse.json({ error: "Pharmacy was not found." }, { status: 404 });

      const passwordHash = await bcrypt.hash(password, 12);
      console.info("[api/admin/pharmacies:PATCH] database operation: pharmacy_access update password", {
        pharmacy_id: id,
        has_password: Boolean(password),
        has_password_hash: Boolean(passwordHash),
      });
      const accessResult = await supabase
        .from("pharmacy_access")
        .update({ password, password_hash: passwordHash })
        .eq("pharmacy_id", id)
        .select("id");

      if (accessResult.error) throw accessResult.error;

      console.info("[api/admin/pharmacies:PATCH] database operation: pharmacy_users update owner password", {
        pharmacy_id: id,
        role: "OWNER",
        has_password_hash: Boolean(passwordHash),
      });
      const ownerResult = await supabase
        .from("pharmacy_users")
        .update({ password_hash: passwordHash })
        .eq("pharmacy_id", id)
        .eq("role", "OWNER")
        .select("id");

      if (ownerResult.error) throw ownerResult.error;
      const ownerIds = (ownerResult.data || []).map((owner) => owner.id);
      if (ownerIds.length === 0) return NextResponse.json({ error: "No owner account was found for this pharmacy." }, { status: 404 });

      const sessionResult = await supabase.from("pharmacy_sessions").delete().in("pharmacy_user_id", ownerIds);
      if (sessionResult.error) throw sessionResult.error;
      await recordAdminActivity({
        admin, action: "OWNER_PASSWORD_RESET", targetPharmacyId: id,
        targetPharmacyName: pharmacyResult.data.pharmacy_name, success: true,
        metadata: { target_user_ids: ownerIds, target_role: "OWNER" },
      });
      return NextResponse.json({ ok: true, message: "Owner password reset and active owner sessions signed out." }, { status: 200 });
    }

    if (action === "archive") {
      const result = await supabase
        .from("pharmacies")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();

      if (result.error) throw result.error;

      await supabase.from("pharmacy_sessions").delete().eq("pharmacy_id", id);
      revalidatePath("/admin");
      return NextResponse.json({ pharmacy: normalizePharmacyRow(result.data), message: "Pharmacy archived." }, { status: 200 });
    }

    if (action === "restore") {
      const result = await supabase
        .from("pharmacies")
        .update({ archived_at: null })
        .eq("id", id)
        .select("*")
        .single();

      if (result.error) throw result.error;

      revalidatePath("/admin");
      return NextResponse.json({ pharmacy: normalizePharmacyRow(result.data), message: "Pharmacy restored." }, { status: 200 });
    }

    if (action === "delete-permanently") {
      if (!isSuperAdmin(admin)) {
        return NextResponse.json({ error: "Only super admins can permanently delete pharmacies." }, { status: 403 });
      }

      const pharmacyResult = await supabase.from("pharmacies").select("pharmacy_name").eq("id", id).maybeSingle();
      if (pharmacyResult.error) throw pharmacyResult.error;
      if (!pharmacyResult.data) {
        return NextResponse.json({ error: "Pharmacy was not found." }, { status: 404 });
      }

      const accessResult = await supabase.from("pharmacy_access").select("pharmacy_code").eq("pharmacy_id", id).maybeSingle();
      if (accessResult.error) throw accessResult.error;
      const pharmacyCode = accessResult.data?.pharmacy_code || "";
      const expectedConfirmation = pharmacyCode || pharmacyResult.data.pharmacy_name;

      if (confirmationCode !== expectedConfirmation) {
        return NextResponse.json(
          {
            error: pharmacyCode
              ? "Type the pharmacy login code exactly to delete permanently."
              : "Login code is missing. Type the pharmacy name exactly to delete permanently.",
          },
          { status: 400 },
        );
      }

      await deletePharmacyPermanently(supabase, id);
      revalidatePath("/admin");
      return NextResponse.json({ message: "Pharmacy permanently deleted." }, { status: 200 });
    }

    const update: PharmacyUpdate =
      action === "suspend"
        ? { status: "SUSPENDED" }
        : action === "reactivate"
          ? { status: "ACTIVE" }
          : {
              pharmacy_name: String(body.pharmacy_name || "").trim(),
              owner_name: String(body.owner_name || "").trim(),
              phone: String(body.phone || "").trim(),
            };

    if (action === "update" && (!update.pharmacy_name || !update.owner_name || !update.phone)) {
      return NextResponse.json({ error: "Pharmacy name, owner, and phone are required." }, { status: 400 });
    }

    console.info("[api/admin/pharmacies:PATCH] database operation: pharmacies update", { id, action, update });
    const result = await supabase.from("pharmacies").update(update).eq("id", id).select("*").single();

    if (result.error) throw result.error;

    revalidatePath("/admin");
    return NextResponse.json({ pharmacy: normalizePharmacyRow(result.data) }, { status: 200 });
  } catch (error) {
    return errorResponse(error, "Admin pharmacy update failed:", "Unable to update pharmacy.");
  }
}
