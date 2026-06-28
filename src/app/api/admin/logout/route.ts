import { NextResponse } from "next/server";
import { adminSessionCookieName } from "@/lib/admin-session";

export async function POST() {
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(adminSessionCookieName, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/admin",
    maxAge: 0,
    expires: new Date(0),
  });

  return response;
}
