import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getPharmacySessionCookieOptions, pharmacySessionCookieName, pharmacySessionMaxAgeSeconds } from "@/lib/pharmacy-session";
import { getPharmacyAccessMessage, getPharmacyAccessStatus } from "@/lib/subscription";
import type { Database } from "@/lib/database.types";

type PharmacyRow = Database["public"]["Tables"]["pharmacies"]["Row"];
type PharmacyAccessRow = Database["public"]["Tables"]["pharmacy_access"]["Row"] & {
  pharmacy: PharmacyRow | PharmacyRow[] | null;
};
type PharmacyUserRow = Database["public"]["Tables"]["pharmacy_users"]["Row"];

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const login = String(body.pharmacy_code || body.pharmacy_name || body.login || "").trim();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    if (!login) {
      return NextResponse.json({ error: "Enter pharmacy code." }, { status: 400 });
    }

    if (!username) {
      return NextResponse.json({ error: "Enter staff username." }, { status: 400 });
    }

    if (!password) {
      return NextResponse.json({ error: "Enter staff password." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const result = await supabase.from("pharmacy_access").select("*, pharmacy:pharmacies(*)");

    if (result.error) throw result.error;

    const normalizedLogin = normalize(login);
    const access = ((result.data || []) as PharmacyAccessRow[]).find((item) => {
      return normalize(item.pharmacy_code) === normalizedLogin;
    });

    if (!access) {
      return NextResponse.json({ error: "Invalid pharmacy login." }, { status: 401 });
    }

    const pharmacy = Array.isArray(access.pharmacy) ? access.pharmacy[0] : access.pharmacy;
    if (!pharmacy) {
      return NextResponse.json({ error: "Pharmacy login is not linked to a pharmacy." }, { status: 404 });
    }

    const accessStatus = getPharmacyAccessStatus({
      plan: pharmacy.plan || "TRIAL",
      status: pharmacy.status || "TRIAL",
      trial_ends_at: pharmacy.trial_ends_at,
      subscription_ends_at: pharmacy.subscription_ends_at,
    });

    if (accessStatus !== "ALLOWED") {
      return NextResponse.json({ error: getPharmacyAccessMessage(accessStatus) }, { status: 403 });
    }

    const userResult = await supabase
      .from("pharmacy_users")
      .select("*")
      .eq("pharmacy_id", pharmacy.id);

    if (userResult.error) throw userResult.error;

    const normalizedUsername = normalize(username);
    const user = ((userResult.data || []) as PharmacyUserRow[]).find((item) => normalize(item.username) === normalizedUsername) || null;
    const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;

    if (!user || !user.active || !passwordMatches) {
      return NextResponse.json({ error: "Invalid staff login." }, { status: 401 });
    }

    const sessionToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + pharmacySessionMaxAgeSeconds * 1000);
    const sessionResult = await supabase
      .from("pharmacy_sessions")
      .insert({
        pharmacy_id: pharmacy.id,
        pharmacy_user_id: user.id,
        role: user.role,
        session_token: sessionToken,
        expires_at: expiresAt.toISOString(),
      })
      .select("id")
      .single();

    if (sessionResult.error) throw sessionResult.error;

    await supabase.from("pharmacy_users").update({ last_login_at: new Date().toISOString() }).eq("id", user.id);

    const response = NextResponse.json({ pharmacy, user, session: { expires_at: expiresAt.toISOString(), role: user.role } }, { status: 200 });
    response.cookies.set(pharmacySessionCookieName, sessionToken, getPharmacySessionCookieOptions(expiresAt));

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to log in.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
