import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getPharmacySessionCookieOptions, pharmacySessionCookieName, pharmacySessionMaxAgeSeconds } from "@/lib/pharmacy-session";
import type { Database } from "@/lib/database.types";

type PharmacyRow = Database["public"]["Tables"]["pharmacies"]["Row"];
type PharmacyAccessRow = Database["public"]["Tables"]["pharmacy_access"]["Row"] & {
  pharmacy: PharmacyRow | PharmacyRow[] | null;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const login = String(body.pharmacy_code || body.pharmacy_name || body.login || "").trim();
    const password = String(body.password || "");

    if (!login) {
      return NextResponse.json({ error: "Enter pharmacy code or pharmacy name." }, { status: 400 });
    }

    if (!password) {
      return NextResponse.json({ error: "Enter pharmacy password." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const result = await supabase.from("pharmacy_access").select("*, pharmacy:pharmacies(*)");

    if (result.error) throw result.error;

    const normalizedLogin = normalize(login);
    const access = ((result.data || []) as PharmacyAccessRow[]).find((item) => {
      const pharmacy = Array.isArray(item.pharmacy) ? item.pharmacy[0] : item.pharmacy;
      return normalize(item.pharmacy_code) === normalizedLogin || normalize(pharmacy?.pharmacy_name || "") === normalizedLogin;
    });

    const passwordMatches = access?.password_hash
      ? await bcrypt.compare(password, access.password_hash)
      : access?.password === password;

    if (!access || !passwordMatches) {
      return NextResponse.json({ error: "Invalid pharmacy login." }, { status: 401 });
    }

    const pharmacy = Array.isArray(access.pharmacy) ? access.pharmacy[0] : access.pharmacy;
    if (!pharmacy) {
      return NextResponse.json({ error: "Pharmacy login is not linked to a pharmacy." }, { status: 404 });
    }

    const sessionToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + pharmacySessionMaxAgeSeconds * 1000);
    const sessionResult = await supabase
      .from("pharmacy_sessions")
      .insert({
        pharmacy_id: pharmacy.id,
        session_token: sessionToken,
        expires_at: expiresAt.toISOString(),
      })
      .select("id")
      .single();

    if (sessionResult.error) throw sessionResult.error;

    const response = NextResponse.json({ pharmacy, session: { expires_at: expiresAt.toISOString() } }, { status: 200 });
    response.cookies.set(pharmacySessionCookieName, sessionToken, getPharmacySessionCookieOptions(expiresAt));

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to log in.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
