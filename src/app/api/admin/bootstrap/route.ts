import { NextResponse } from "next/server";
import { hashAdminPassword, validateAdminPasswordStrength } from "@/lib/admin-security";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type AdminUserInsert = Database["public"]["Tables"]["admin_users"]["Insert"];

export async function POST(request: Request) {
  try {
    const bootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
    const bootstrapUsername = process.env.ADMIN_BOOTSTRAP_USERNAME?.trim();
    const bootstrapFullName = process.env.ADMIN_BOOTSTRAP_FULL_NAME?.trim() || null;
    const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || "";
    const submittedToken = request.headers.get("x-admin-bootstrap-token") || String((await request.json().catch(() => ({}))).token || "");

    if (!bootstrapToken || submittedToken !== bootstrapToken) {
      return NextResponse.json({ error: "Admin bootstrap is not available." }, { status: 403 });
    }
    if (!bootstrapUsername || !bootstrapPassword) {
      return NextResponse.json({ error: "Admin bootstrap environment variables are incomplete." }, { status: 500 });
    }

    const strength = validateAdminPasswordStrength(bootstrapPassword);
    if (!strength.valid) {
      return NextResponse.json({ error: "Bootstrap password does not meet the admin password policy." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const existingAdmins = await supabase.from("admin_users").select("id", { count: "exact", head: true });

    if (existingAdmins.error) throw existingAdmins.error;
    if ((existingAdmins.count || 0) > 0) {
      return NextResponse.json({ error: "Admin bootstrap is already complete." }, { status: 409 });
    }

    const passwordHash = await hashAdminPassword(bootstrapPassword);
    const adminPayload: AdminUserInsert = {
      username: bootstrapUsername,
      full_name: bootstrapFullName,
      role: "SUPER_ADMIN",
      password_hash: passwordHash,
      active: true,
      session_version: 1,
      failed_login_attempts: 0,
      locked_until: null,
    };
    const result = await supabase.from("admin_users").insert(adminPayload).select("id, username, full_name, role").single();

    if (result.error) {
      if (result.error.code === "23505") {
        return NextResponse.json({ error: "Admin bootstrap is already complete." }, { status: 409 });
      }
      throw result.error;
    }

    return NextResponse.json({ admin: result.data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to bootstrap admin.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
