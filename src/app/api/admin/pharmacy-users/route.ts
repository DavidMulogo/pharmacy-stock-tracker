import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-session";
import { recordAdminActivity } from "@/lib/admin-security";
import { getSupabaseAdmin } from "@/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function passwordError(password: string) {
  if (password.length < 8) return "Temporary password must contain at least 8 characters.";
  if (password.length > 128) return "Temporary password cannot exceed 128 characters.";
  return "";
}

export async function GET(request: Request) {
  const admin = await requireAdminSession("api/admin/pharmacy-users GET");
  if (admin instanceof NextResponse) return admin;

  const pharmacyId = new URL(request.url).searchParams.get("pharmacy_id") || "";
  if (!UUID_PATTERN.test(pharmacyId)) return NextResponse.json({ error: "Valid pharmacy id is required." }, { status: 400 });

  const result = await getSupabaseAdmin()
    .from("pharmacy_users")
    .select("id, pharmacy_id, full_name, username, role, active, last_login_at")
    .eq("pharmacy_id", pharmacyId)
    .order("role")
    .order("full_name");
  if (result.error) return NextResponse.json({ error: "Unable to load pharmacy users." }, { status: 500 });
  return NextResponse.json({ users: result.data || [] });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminSession("api/admin/pharmacy-users PATCH");
  if (admin instanceof NextResponse) return admin;

  const supabase = getSupabaseAdmin();
  let target: { id: string; pharmacy_id: string; full_name: string; username: string; role: string } | null = null;
  try {
    const body = await request.json();
    const userId = String(body.user_id || "").trim();
    const password = String(body.password || "");
    if (!UUID_PATTERN.test(userId)) return NextResponse.json({ error: "Valid staff user id is required." }, { status: 400 });
    const validationError = passwordError(password);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const userResult = await supabase
      .from("pharmacy_users")
      .select("id, pharmacy_id, full_name, username, role, active, pharmacy:pharmacies(pharmacy_name)")
      .eq("id", userId)
      .maybeSingle();
    if (userResult.error) throw userResult.error;
    if (!userResult.data) return NextResponse.json({ error: "Staff account was not found." }, { status: 404 });
    if (userResult.data.role === "OWNER") {
      return NextResponse.json({ error: "Use Reset owner password so the owner and pharmacy login remain synchronized." }, { status: 400 });
    }
    target = userResult.data;

    const passwordHash = await bcrypt.hash(password, 12);
    const updateResult = await supabase.from("pharmacy_users").update({ password_hash: passwordHash }).eq("id", userId).eq("pharmacy_id", target.pharmacy_id);
    if (updateResult.error) throw updateResult.error;

    const sessionResult = await supabase.from("pharmacy_sessions").delete().eq("pharmacy_user_id", userId);
    if (sessionResult.error) throw sessionResult.error;

    const pharmacyRelation = userResult.data.pharmacy;
    const pharmacy = Array.isArray(pharmacyRelation) ? pharmacyRelation[0] : pharmacyRelation;
    await recordAdminActivity({
      admin, action: "STAFF_PASSWORD_RESET", targetPharmacyId: target.pharmacy_id,
      targetPharmacyName: pharmacy?.pharmacy_name || null, success: true,
      metadata: { target_user_id: target.id, target_username: target.username, target_role: target.role },
    });
    return NextResponse.json({ ok: true, user: { id: target.id, full_name: target.full_name, username: target.username, role: target.role } });
  } catch (error) {
    await recordAdminActivity({
      admin, action: "STAFF_PASSWORD_RESET", targetPharmacyId: target?.pharmacy_id || null, success: false,
      errorMessage: error instanceof Error ? error.message : "Password reset failed.",
      metadata: target ? { target_user_id: target.id, target_username: target.username, target_role: target.role } : {},
    });
    return NextResponse.json({ error: "Unable to reset the staff password." }, { status: 500 });
  }
}
