import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  adminSessionCookieName,
  createAdminSessionValue,
  getAdminSessionCookieOptions,
} from "@/lib/admin-session";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    const supabase = getSupabaseAdmin();
    const adminResult = await supabase
      .from("admin_users")
      .select("username, password_hash, full_name, role, active")
      .eq("username", username)
      .maybeSingle();

    if (adminResult.error) throw adminResult.error;

    if (adminResult.data) {
      const admin = adminResult.data;
      const passwordMatches = await bcrypt.compare(password, admin.password_hash);

      if (!admin.active || !passwordMatches) {
        return NextResponse.json({ error: "Invalid admin login." }, { status: 401 });
      }

      const response = NextResponse.json(
        { admin: { username: admin.username, fullName: admin.full_name, role: admin.role } },
        { status: 200 },
      );
      response.cookies.set(
        adminSessionCookieName,
        createAdminSessionValue({ username: admin.username, fullName: admin.full_name, role: admin.role }),
        getAdminSessionCookieOptions(),
      );
      return response;
    }

    if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Admin user not found." }, { status: 401 });
    }

    if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid admin login." }, { status: 401 });
    }

    const response = NextResponse.json(
      { admin: { username, fullName: "Environment Admin", role: "SUPER_ADMIN" } },
      { status: 200 },
    );
    response.cookies.set(
      adminSessionCookieName,
      createAdminSessionValue({ username, fullName: "Environment Admin", role: "SUPER_ADMIN" }),
      getAdminSessionCookieOptions(),
    );
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to log in.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
