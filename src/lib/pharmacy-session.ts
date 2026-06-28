import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type { Pharmacy } from "@/lib/types";

export const pharmacySessionCookieName = "pharmacy_session";
export const pharmacySessionMaxAgeSeconds = 60 * 60 * 24 * 7;

type PharmacyRow = Database["public"]["Tables"]["pharmacies"]["Row"];
type PharmacySessionRow = Database["public"]["Tables"]["pharmacy_sessions"]["Row"] & {
  pharmacy: PharmacyRow | PharmacyRow[] | null;
};

function normalizePharmacy(pharmacy: PharmacyRow): Pharmacy {
  return {
    id: pharmacy.id,
    pharmacy_name: pharmacy.pharmacy_name,
    owner_name: pharmacy.owner_name,
    phone: pharmacy.phone,
    created_at: pharmacy.created_at,
  };
}

export function getPharmacySessionCookieOptions(expiresAt?: Date) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: pharmacySessionMaxAgeSeconds,
    expires: expiresAt,
  };
}

export async function getPharmacySessionTokenFromCookie() {
  const cookieStore = await cookies();
  return cookieStore.get(pharmacySessionCookieName)?.value || "";
}

export async function authenticatePharmacyFromSessionCookie(): Promise<{ pharmacy: Pharmacy; sessionToken: string } | null> {
  const sessionToken = await getPharmacySessionTokenFromCookie();
  if (!sessionToken) return null;

  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("pharmacy_sessions")
    .select("*, pharmacy:pharmacies(*)")
    .eq("session_token", sessionToken)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (result.error || !result.data) return null;

  const session = result.data as PharmacySessionRow;
  const pharmacy = Array.isArray(session.pharmacy) ? session.pharmacy[0] : session.pharmacy;
  if (!pharmacy) return null;

  await supabase.from("pharmacy_sessions").update({ last_seen: new Date().toISOString() }).eq("id", session.id);

  return {
    pharmacy: normalizePharmacy(pharmacy),
    sessionToken,
  };
}
