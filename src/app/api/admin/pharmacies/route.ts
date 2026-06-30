import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/admin-session";
import { normalizePharmacyRow } from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type { PharmacyPlan, PharmacyStatus } from "@/lib/types";

type PharmacyInsert = Database["public"]["Tables"]["pharmacies"]["Insert"];
type PharmacyUpdate = Database["public"]["Tables"]["pharmacies"]["Update"];
type PharmacyAccessInsert = Database["public"]["Tables"]["pharmacy_access"]["Insert"];
type PharmacyUserInsert = Database["public"]["Tables"]["pharmacy_users"]["Insert"];

const plans: PharmacyPlan[] = ["TRIAL", "BASIC", "PRO", "ENTERPRISE"];
const statuses: PharmacyStatus[] = ["ACTIVE", "TRIAL", "EXPIRED", "SUSPENDED"];

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

function debugErrorResponse(error: unknown, message: string) {
  console.error(message, error);

  const supabaseError = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown } | null | undefined;
  console.error({
    message: supabaseError?.message,
    details: supabaseError?.details,
    hint: supabaseError?.hint,
    code: supabaseError?.code,
  });

  return NextResponse.json(
    {
      error,
      serialized: JSON.stringify(error, null, 2),
    },
    { status: 500 },
  );
}

export async function GET() {
  console.info("[api/admin/pharmacies:GET] authenticating admin request");
  const admin = await requireAdminSession("api/admin/pharmacies GET");
  if (admin instanceof NextResponse) {
    console.warn("[api/admin/pharmacies:GET] admin authentication failed; returning debug 401");
    return admin;
  }
  console.info("[api/admin/pharmacies:GET] admin authentication succeeded", { username: admin.username, role: admin.role });

  try {
    const supabase = getSupabaseAdmin();
    console.info("[api/admin/pharmacies:GET] database operation: pharmacies select all ordered by created_at desc");
    const result = await supabase.from("pharmacies").select("*").order("created_at", { ascending: false });

    if (result.error) throw result.error;

    return NextResponse.json({ pharmacies: (result.data || []).map(normalizePharmacyRow) }, { status: 200 });
  } catch (error) {
    return debugErrorResponse(error, "Admin pharmacies load failed:");
  }
}

export async function POST(request: Request) {
  console.info("[api/admin/pharmacies:POST] authenticating admin request");
  const admin = await requireAdminSession("api/admin/pharmacies POST");
  if (admin instanceof NextResponse) {
    console.warn("[api/admin/pharmacies:POST] admin authentication failed; returning debug 401");
    return admin;
  }
  console.info("[api/admin/pharmacies:POST] admin authentication succeeded", { username: admin.username, role: admin.role });

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

    const payload: PharmacyInsert = {
      pharmacy_name: pharmacyName,
      owner_name: ownerName,
      phone,
      plan: getValidatedPlan(body.plan),
      status: getValidatedStatus(body.status),
      trial_ends_at: optionalDate(body.trial_ends_at),
      subscription_ends_at: optionalDate(body.subscription_ends_at),
    };
    const supabase = getSupabaseAdmin();
    console.log("Creating pharmacy...");
    console.info("[api/admin/pharmacies:POST] database operation: pharmacies insert", {
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

    const passwordHash = await bcrypt.hash(password, 12);
    const accessPayload: PharmacyAccessInsert = {
      pharmacy_id: pharmacyResult.data.id,
      pharmacy_code: pharmacyCode,
      password,
      password_hash: passwordHash,
    };
    console.log("Creating pharmacy_access...");
    console.info("[api/admin/pharmacies:POST] database operation: pharmacy_access insert", {
      pharmacy_id: accessPayload.pharmacy_id,
      pharmacy_code: accessPayload.pharmacy_code,
      has_password: Boolean(accessPayload.password),
      has_password_hash: Boolean(accessPayload.password_hash),
    });
    const accessResult = await supabase.from("pharmacy_access").insert(accessPayload).select("id").single();

    if (accessResult.error) {
      console.error("FAILED at pharmacy_access", accessResult.error);
      throw accessResult.error;
    }

    const userPayload: PharmacyUserInsert = {
      pharmacy_id: pharmacyResult.data.id,
      full_name: ownerName,
      username: pharmacyCode,
      password_hash: passwordHash,
      role: "OWNER",
      active: true,
    };
    console.log("Creating pharmacy_users...");
    console.info("[api/admin/pharmacies:POST] database operation: pharmacy_users insert", {
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

    revalidatePath("/admin");
    return NextResponse.json({ pharmacy: normalizePharmacyRow(pharmacyResult.data) }, { status: 201 });
  } catch (error) {
    return debugErrorResponse(error, "Admin pharmacy creation failed:");
  }
}

export async function PATCH(request: Request) {
  console.info("[api/admin/pharmacies:PATCH] authenticating admin request");
  const admin = await requireAdminSession("api/admin/pharmacies PATCH");
  if (admin instanceof NextResponse) {
    console.warn("[api/admin/pharmacies:PATCH] admin authentication failed; returning debug 401");
    return admin;
  }
  console.info("[api/admin/pharmacies:PATCH] admin authentication succeeded", { username: admin.username, role: admin.role });

  try {
    const body = await request.json();
    const id = String(body.id || "").trim();
    const action = String(body.action || "update");

    if (!id) {
      return NextResponse.json({ error: "Pharmacy id is required." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    if (action === "reset-password") {
      const password = String(body.password || "");
      if (!password) return NextResponse.json({ error: "New password is required." }, { status: 400 });

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
      return NextResponse.json({ ok: true }, { status: 200 });
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
              plan: getValidatedPlan(body.plan),
              status: getValidatedStatus(body.status),
              trial_ends_at: optionalDate(body.trial_ends_at),
              subscription_ends_at: optionalDate(body.subscription_ends_at),
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
    return debugErrorResponse(error, "Admin pharmacy update failed:");
  }
}
