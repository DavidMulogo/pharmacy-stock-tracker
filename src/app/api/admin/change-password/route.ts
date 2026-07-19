import { NextResponse } from "next/server";
import {
  adminSessionCookieName,
  getExpiredAdminSessionCookieOptions,
  requireAdminSession,
} from "@/lib/admin-session";
import {
  compareAdminPassword,
  hashAdminPassword,
  recordAdminActivity,
  validateAdminPasswordStrength,
} from "@/lib/admin-security";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  const admin = await requireAdminSession("api/admin/change-password POST");
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await request.json();
    const currentPassword = String(body.current_password || "");
    const newPassword = String(body.new_password || "");
    const confirmPassword = String(body.confirm_password || "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json({ error: "Current password, new password, and confirmation are required." }, { status: 400 });
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: "New password and confirmation must match." }, { status: 400 });
    }

    const strength = validateAdminPasswordStrength(newPassword);
    if (!strength.valid) {
      return NextResponse.json({ error: strength.errors.join(" ") }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const result = await supabase
      .from("admin_users")
      .select("username, password_hash, role, session_version")
      .eq("username", admin.username)
      .maybeSingle();

    if (result.error) throw result.error;
    if (!result.data) {
      return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
    }

    const currentMatches = await compareAdminPassword(currentPassword, result.data.password_hash);
    if (!currentMatches) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }

    const reusesCurrentPassword = await compareAdminPassword(newPassword, result.data.password_hash);
    if (reusesCurrentPassword) {
      return NextResponse.json({ error: "New password must be different from the current password." }, { status: 400 });
    }

    const passwordHash = await hashAdminPassword(newPassword);
    const updateResult = await supabase
      .from("admin_users")
      .update({
        password_hash: passwordHash,
        session_version: Number(result.data.session_version || 1) + 1,
        failed_login_attempts: 0,
        locked_until: null,
      })
      .eq("username", admin.username);

    if (updateResult.error) throw updateResult.error;

    await recordAdminActivity({
      admin,
      action: "ADMIN_PASSWORD_CHANGED",
      success: true,
    });

    const response = NextResponse.json({ ok: true, message: "Password changed. Log in again with the new password." }, { status: 200 });
    response.cookies.set(adminSessionCookieName, "", getExpiredAdminSessionCookieOptions("/"));
    response.cookies.set(adminSessionCookieName, "", getExpiredAdminSessionCookieOptions("/admin"));
    return response;
  } catch (error) {
    console.error("Admin password change failed:", error);
    return NextResponse.json({ error: "Unable to change password." }, { status: 500 });
  }
}
