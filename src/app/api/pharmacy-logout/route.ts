import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  getPharmacySessionTokenFromCookie,
  pharmacySessionCookieName,
} from "@/lib/pharmacy-session";

export async function POST() {
  try {
    const sessionToken = await getPharmacySessionTokenFromCookie();
    const supabase = getSupabaseAdmin();

    if (sessionToken) {
      const result = await supabase.from("pharmacy_sessions").delete().eq("session_token", sessionToken);
      if (result.error) throw result.error;
    }

    const response = NextResponse.json({ ok: true }, { status: 200 });
    response.cookies.set(pharmacySessionCookieName, "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to log out.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
