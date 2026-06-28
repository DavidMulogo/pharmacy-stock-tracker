import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type AdminUserInsert = Database["public"]["Tables"]["admin_users"]["Insert"];

export async function POST() {
  try {
    const supabase = getSupabaseAdmin();
    const existingAdmins = await supabase.from("admin_users").select("id", { count: "exact", head: true });

    if (existingAdmins.error) throw existingAdmins.error;
    if ((existingAdmins.count || 0) > 0) {
      return NextResponse.json({ error: "Admin bootstrap is already complete." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash("Admin@123", 12);
    const adminPayload: AdminUserInsert = {
      username: "admin",
      full_name: "David Mulogo",
      role: "super_admin",
      password_hash: passwordHash,
      active: true,
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
