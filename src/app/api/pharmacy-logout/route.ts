import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  getExpiredPharmacySessionCookieOptions,
  getPharmacySessionTokenFromCookie,
  pharmacySessionCookieName,
  authenticatePharmacyFromSessionCookie,
} from "@/lib/pharmacy-session";
import { recordActivity } from "@/lib/activity-log";

export async function POST() {
  try {
    const sessionToken = await getPharmacySessionTokenFromCookie();
    const supabase = getSupabaseAdmin();

    if (sessionToken) {
      const session = await authenticatePharmacyFromSessionCookie();
      if (session) {
        await recordActivity(
          { pharmacyId: session.pharmacy.id, userId: session.user.id, name: session.user.full_name, role: session.role },
          { action: "LOGOUT", entityType: "pharmacy_session", description: "Signed out of PharmaStock." },
        );
      }
      const result = await supabase.from("pharmacy_sessions").delete().eq("session_token", sessionToken);
      if (result.error) throw result.error;
    }

    const response = NextResponse.json({ ok: true }, { status: 200 });
    response.cookies.set(pharmacySessionCookieName, "", getExpiredPharmacySessionCookieOptions());

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to log out.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
