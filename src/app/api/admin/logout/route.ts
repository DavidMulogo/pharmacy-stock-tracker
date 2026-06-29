import { NextResponse } from "next/server";
import { adminSessionCookieName, getExpiredAdminSessionCookieOptions } from "@/lib/admin-session";

export async function POST() {
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(adminSessionCookieName, "", getExpiredAdminSessionCookieOptions("/"));
  response.cookies.set(adminSessionCookieName, "", getExpiredAdminSessionCookieOptions("/admin"));

  return response;
}
