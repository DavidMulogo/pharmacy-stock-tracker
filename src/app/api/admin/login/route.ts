import { NextResponse } from "next/server";
import {
  adminSessionCookieName,
  createAdminSessionValue,
  getAdminSessionCookieOptions,
} from "@/lib/admin-session";
import { compareAdminPassword, getLockoutUntil, isLocked, recordAdminActivity, adminLockoutThreshold } from "@/lib/admin-security";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  const invalidMessage = "Invalid admin login.";

  try {
    const body = await request.json();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    const supabase = getSupabaseAdmin();
    const adminResult = await supabase
      .from("admin_users")
      .select("username, password_hash, full_name, role, active, session_version, failed_login_attempts, locked_until")
      .eq("username", username)
      .maybeSingle();

    if (adminResult.error) throw adminResult.error;

    if (adminResult.data) {
      const admin = adminResult.data;

      if (isLocked(admin.locked_until)) {
        await recordAdminActivity({
          username: admin.username,
          role: admin.role,
          action: "ADMIN_LOGIN_LOCKED",
          success: false,
          errorMessage: "Locked admin login attempted.",
        });
        return NextResponse.json({ error: "Admin account is temporarily locked. Try again later." }, { status: 423 });
      }

      const passwordMatches = await compareAdminPassword(password, admin.password_hash);

      if (!admin.active || !passwordMatches) {
        const nextFailures = Number(admin.failed_login_attempts || 0) + 1;
        const shouldLock = nextFailures >= adminLockoutThreshold;
        const updateResult = await supabase
          .from("admin_users")
          .update({
            failed_login_attempts: nextFailures,
            locked_until: shouldLock ? getLockoutUntil() : null,
          })
          .eq("username", admin.username);

        if (updateResult.error) throw updateResult.error;

        await recordAdminActivity({
          username: admin.username,
          role: admin.role,
          action: shouldLock ? "ADMIN_LOGIN_LOCKED" : "ADMIN_LOGIN_FAILED",
          success: false,
          errorMessage: shouldLock ? "Admin account locked after failed login attempts." : "Invalid admin login.",
        });

        return NextResponse.json(
          { error: shouldLock ? "Admin account is temporarily locked. Try again later." : invalidMessage },
          { status: 401 },
        );
      }

      const resetResult = await supabase
        .from("admin_users")
        .update({ failed_login_attempts: 0, locked_until: null })
        .eq("username", admin.username);

      if (resetResult.error) throw resetResult.error;

      await recordAdminActivity({
        username: admin.username,
        role: admin.role,
        action: "ADMIN_LOGIN_SUCCEEDED",
        success: true,
      });

      const response = NextResponse.json(
        { admin: { username: admin.username, fullName: admin.full_name, role: admin.role } },
        { status: 200 },
      );
      response.cookies.set(
        adminSessionCookieName,
        createAdminSessionValue({ username: admin.username, fullName: admin.full_name, role: admin.role, sessionVersion: admin.session_version }),
        getAdminSessionCookieOptions(),
      );
      return response;
    }

    await recordAdminActivity({
      username: username || "unknown",
      role: "UNKNOWN",
      action: "ADMIN_LOGIN_FAILED",
      success: false,
      errorMessage: "Invalid admin login.",
    });

    return NextResponse.json({ error: invalidMessage }, { status: 401 });
  } catch (error) {
    console.error("Admin login failed:", error);
    return NextResponse.json({ error: "Unable to log in." }, { status: 500 });
  }
}
