import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getPharmacyAccessStatus } from "@/lib/subscription";
import type { Database } from "@/lib/database.types";
import type { Pharmacy, PharmacyUser } from "@/lib/types";

export const pharmacySessionCookieName = "pharmacy_session";
export const pharmacySessionMaxAgeSeconds = 60 * 60 * 24 * 7;

type PharmacyRow = Database["public"]["Tables"]["pharmacies"]["Row"];
type PharmacyUserRow = Database["public"]["Tables"]["pharmacy_users"]["Row"];
type PharmacySessionRow = Database["public"]["Tables"]["pharmacy_sessions"]["Row"] & {
  pharmacy: PharmacyRow | PharmacyRow[] | null;
  pharmacy_user: PharmacyUserRow | PharmacyUserRow[] | null;
};

function normalizePharmacy(pharmacy: PharmacyRow): Pharmacy {
  return {
    id: pharmacy.id,
    pharmacy_name: pharmacy.pharmacy_name,
    owner_name: pharmacy.owner_name,
    phone: pharmacy.phone,
    plan: pharmacy.plan || "TRIAL",
    status: pharmacy.status || "TRIAL",
    trial_ends_at: pharmacy.trial_ends_at,
    subscription_ends_at: pharmacy.subscription_ends_at,
    archived_at: pharmacy.archived_at ?? null,
    created_at: pharmacy.created_at,
  };
}

export function normalizePharmacyUser(user: PharmacyUserRow): PharmacyUser {
  return {
    id: user.id,
    pharmacy_id: user.pharmacy_id,
    full_name: user.full_name,
    username: user.username,
    role: user.role,
    active: Boolean(user.active),
    last_login_at: user.last_login_at,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

export function getPharmacySessionCookieOptions(expiresAt?: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: pharmacySessionMaxAgeSeconds,
    expires: expiresAt,
  };
}

export function getExpiredPharmacySessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  };
}

export async function getPharmacySessionTokenFromCookie() {
  const cookieStore = await cookies();
  return cookieStore.get(pharmacySessionCookieName)?.value || "";
}

export async function authenticatePharmacyFromSessionCookie(): Promise<{
  pharmacy: Pharmacy;
  user: PharmacyUser;
  role: PharmacyUser["role"];
  sessionToken: string;
} | null> {
  const sessionToken = await getPharmacySessionTokenFromCookie();
  if (!sessionToken) return null;

  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("pharmacy_sessions")
    .select("*, pharmacy:pharmacies(*), pharmacy_user:pharmacy_users(*)")
    .eq("session_token", sessionToken)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (result.error || !result.data) return null;

  const session = result.data as PharmacySessionRow;
  const pharmacy = Array.isArray(session.pharmacy) ? session.pharmacy[0] : session.pharmacy;
  const user = Array.isArray(session.pharmacy_user) ? session.pharmacy_user[0] : session.pharmacy_user;
  if (!pharmacy) return null;
  if (pharmacy.archived_at) {
    await supabase.from("pharmacy_sessions").delete().eq("id", session.id);
    return null;
  }
  if (!user || !user.active || user.pharmacy_id !== pharmacy.id) {
    await supabase.from("pharmacy_sessions").delete().eq("id", session.id);
    return null;
  }

  const normalizedPharmacy = normalizePharmacy(pharmacy);
  if (getPharmacyAccessStatus(normalizedPharmacy) !== "ALLOWED") {
    await supabase.from("pharmacy_sessions").delete().eq("id", session.id);
    return null;
  }

  await supabase.from("pharmacy_sessions").update({ last_seen: new Date().toISOString() }).eq("id", session.id);

  const normalizedUser = normalizePharmacyUser(user);
  return {
    pharmacy: normalizedPharmacy,
    user: normalizedUser,
    role: normalizedUser.role,
    sessionToken,
  };
}
