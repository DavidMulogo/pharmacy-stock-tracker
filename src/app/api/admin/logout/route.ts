import { NextResponse } from "next/server";
import { adminSessionCookieName, authenticateAdminFromCookie, getExpiredAdminSessionCookieOptions } from "@/lib/admin-session";
import { recordAdminActivity } from "@/lib/admin-security";

export async function POST() {
  const admin = await authenticateAdminFromCookie();

  if (admin) {
    await recordAdminActivity({
      admin,
      action: "ADMIN_LOGOUT",
      success: true,
    });
  }

  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(adminSessionCookieName, "", getExpiredAdminSessionCookieOptions("/"));
  response.cookies.set(adminSessionCookieName, "", getExpiredAdminSessionCookieOptions("/admin"));

  return response;
}
