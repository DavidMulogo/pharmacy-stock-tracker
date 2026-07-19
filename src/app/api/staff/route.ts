import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { authenticatePharmacyFromSessionCookie, normalizePharmacyUser } from "@/lib/pharmacy-session";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type { PharmacyUserRole } from "@/lib/types";
import { recordActivity } from "@/lib/activity-log";

type PharmacyUserInsert = Database["public"]["Tables"]["pharmacy_users"]["Insert"];
type PharmacyUserUpdate = Database["public"]["Tables"]["pharmacy_users"]["Update"];

const roles: PharmacyUserRole[] = ["OWNER", "PHARMACIST", "TECHNICIAN"];

function text(value: unknown) {
  return String(value || "").trim();
}

function getRole(value: unknown): PharmacyUserRole {
  const role = String(value || "TECHNICIAN") as PharmacyUserRole;
  return roles.includes(role) ? role : "TECHNICIAN";
}

async function requireOwner() {
  const session = await authenticatePharmacyFromSessionCookie();
  if (!session) {
    return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }
  if (session.role !== "OWNER") {
    return { response: NextResponse.json({ error: "Only pharmacy owners can manage staff." }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const auth = await requireOwner();
  if (auth.response) return auth.response;

  try {
    const supabase = getSupabaseAdmin();
    const result = await supabase
      .from("pharmacy_users")
      .select("*")
      .eq("pharmacy_id", auth.session.pharmacy.id)
      .order("created_at", { ascending: true });

    if (result.error) throw result.error;
    return NextResponse.json({ staff: (result.data || []).map(normalizePharmacyUser) }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load staff.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireOwner();
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const fullName = text(body.full_name);
    const username = text(body.username);
    const password = String(body.password || "");

    if (!fullName || !username || !password) {
      return NextResponse.json({ error: "Full name, username, and password are required." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const payload: PharmacyUserInsert = {
      pharmacy_id: auth.session.pharmacy.id,
      full_name: fullName,
      username,
      password_hash: passwordHash,
      role: getRole(body.role),
      active: true,
    };

    const supabase = getSupabaseAdmin();
    const result = await supabase.from("pharmacy_users").insert(payload).select("*").single();

    if (result.error) throw result.error;

    await recordActivity(
      { pharmacyId: auth.session.pharmacy.id, userId: auth.session.user.id, name: auth.session.user.full_name, role: auth.session.role },
      {
        action: "STAFF_CREATED",
        entityType: "pharmacy_user",
        entityId: result.data.id,
        description: `Created staff account for ${result.data.full_name}.`,
        metadata: { username: result.data.username, role: result.data.role },
      },
    );

    revalidatePath("/staff");
    return NextResponse.json({ user: normalizePharmacyUser(result.data) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create staff user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireOwner();
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const id = text(body.id);
    const action = text(body.action) || "update";

    if (!id) {
      return NextResponse.json({ error: "Staff user id is required." }, { status: 400 });
    }

    if (action === "deactivate" && id === auth.session.user.id) {
      return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    if (action === "reset-password") {
      const password = String(body.password || "");
      if (!password) return NextResponse.json({ error: "New password is required." }, { status: 400 });

      const passwordHash = await bcrypt.hash(password, 12);
      const result = await supabase
        .from("pharmacy_users")
        .update({ password_hash: passwordHash })
        .eq("id", id)
        .eq("pharmacy_id", auth.session.pharmacy.id)
        .select("*")
        .single();

      if (result.error) throw result.error;
      await recordActivity(
        { pharmacyId: auth.session.pharmacy.id, userId: auth.session.user.id, name: auth.session.user.full_name, role: auth.session.role },
        {
          action: "STAFF_PASSWORD_RESET",
          entityType: "pharmacy_user",
          entityId: result.data.id,
          description: `Reset the password for ${result.data.full_name}.`,
        },
      );
      return NextResponse.json({ user: normalizePharmacyUser(result.data) }, { status: 200 });
    }

    const update: PharmacyUserUpdate =
      action === "deactivate"
        ? { active: false }
        : action === "reactivate"
          ? { active: true }
          : {
              full_name: text(body.full_name),
              username: text(body.username),
              role: getRole(body.role),
              active: body.active === false ? false : true,
            };

    if (action === "update" && (!update.full_name || !update.username)) {
      return NextResponse.json({ error: "Full name and username are required." }, { status: 400 });
    }

    const result = await supabase
      .from("pharmacy_users")
      .update(update)
      .eq("id", id)
      .eq("pharmacy_id", auth.session.pharmacy.id)
      .select("*")
      .single();

    if (result.error) throw result.error;

    const activityAction = action === "deactivate" ? "STAFF_DEACTIVATED" : action === "reactivate" ? "STAFF_REACTIVATED" : "STAFF_UPDATED";
    await recordActivity(
      { pharmacyId: auth.session.pharmacy.id, userId: auth.session.user.id, name: auth.session.user.full_name, role: auth.session.role },
      {
        action: activityAction,
        entityType: "pharmacy_user",
        entityId: result.data.id,
        description: `${action === "deactivate" ? "Deactivated" : action === "reactivate" ? "Reactivated" : "Updated"} staff account for ${result.data.full_name}.`,
        metadata: { username: result.data.username, role: result.data.role, active: result.data.active },
      },
    );

    revalidatePath("/staff");
    return NextResponse.json({ user: normalizePharmacyUser(result.data) }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update staff user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
