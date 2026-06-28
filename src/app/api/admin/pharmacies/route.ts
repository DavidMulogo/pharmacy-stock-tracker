import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { authenticateAdminFromCookie } from "@/lib/admin-session";
import { normalizePharmacyRow } from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type { PharmacyPlan, PharmacyStatus } from "@/lib/types";

type PharmacyInsert = Database["public"]["Tables"]["pharmacies"]["Insert"];
type PharmacyUpdate = Database["public"]["Tables"]["pharmacies"]["Update"];
type PharmacyAccessInsert = Database["public"]["Tables"]["pharmacy_access"]["Insert"];

const plans: PharmacyPlan[] = ["TRIAL", "BASIC", "PRO", "ENTERPRISE"];
const statuses: PharmacyStatus[] = ["ACTIVE", "TRIAL", "EXPIRED", "SUSPENDED"];

async function requireAdmin() {
  const admin = await authenticateAdminFromCookie();
  return admin ? null : NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
}

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

export async function GET() {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const supabase = getSupabaseAdmin();
    const result = await supabase.from("pharmacies").select("*").order("created_at", { ascending: false });

    if (result.error) throw result.error;

    return NextResponse.json({ pharmacies: (result.data || []).map(normalizePharmacyRow) }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load pharmacies.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

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
    const pharmacyResult = await supabase.from("pharmacies").insert(payload).select("*").single();

    if (pharmacyResult.error) throw pharmacyResult.error;

    const passwordHash = await bcrypt.hash(password, 12);
    const accessPayload: PharmacyAccessInsert = {
      pharmacy_id: pharmacyResult.data.id,
      pharmacy_code: pharmacyCode,
      password,
      password_hash: passwordHash,
    };
    const accessResult = await supabase.from("pharmacy_access").insert(accessPayload).select("id").single();

    if (accessResult.error) throw accessResult.error;

    revalidatePath("/admin");
    return NextResponse.json({ pharmacy: normalizePharmacyRow(pharmacyResult.data) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create pharmacy.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

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
      const accessResult = await supabase
        .from("pharmacy_access")
        .update({ password, password_hash: passwordHash })
        .eq("pharmacy_id", id)
        .select("id");

      if (accessResult.error) throw accessResult.error;
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

    const result = await supabase.from("pharmacies").update(update).eq("id", id).select("*").single();

    if (result.error) throw result.error;

    revalidatePath("/admin");
    return NextResponse.json({ pharmacy: normalizePharmacyRow(result.data) }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update pharmacy.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
