import { NextResponse } from "next/server";
import {
  adminSessionCookieName,
  createAdminSessionValue,
  getAdminSessionCookieOptions,
} from "@/lib/admin-session";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Admin credentials are not configured." }, { status: 500 });
    }

    if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid admin login." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true }, { status: 200 });
    response.cookies.set(adminSessionCookieName, createAdminSessionValue(username), getAdminSessionCookieOptions());
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to log in.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
