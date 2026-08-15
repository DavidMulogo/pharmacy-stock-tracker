import { NextResponse } from "next/server";
import { authenticateAdminFromCookie } from "@/lib/admin-session";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { PilotFeedbackStatus } from "@/lib/types";

const statuses: PilotFeedbackStatus[] = ["NEW", "REVIEWING", "PLANNED", "RESOLVED", "CLOSED"];

function cleanText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

export async function GET(request: Request) {
  const admin = await authenticateAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
  const url = new URL(request.url);
  const status = cleanText(url.searchParams.get("status"), 20).toUpperCase();
  const supabase = getSupabaseAdmin();
  let query = supabase.from("pilot_feedback").select("*, pharmacy:pharmacies(pharmacy_name)").order("created_at", { ascending: false }).limit(500);
  if (status && status !== "ALL" && statuses.includes(status as PilotFeedbackStatus)) query = query.eq("status", status as PilotFeedbackStatus);
  const result = await query;
  if (result.error) return NextResponse.json({ error: "Unable to load pilot feedback." }, { status: 500 });
  const feedback = (result.data || []).map((item) => ({
    ...item,
    pharmacy_name: Array.isArray(item.pharmacy) ? item.pharmacy[0]?.pharmacy_name : item.pharmacy?.pharmacy_name,
    pharmacy: undefined,
  }));
  return NextResponse.json({ feedback });
}

export async function PATCH(request: Request) {
  const admin = await authenticateAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
  try {
    const body = await request.json();
    const id = cleanText(body.id, 80);
    const status = cleanText(body.status, 20).toUpperCase() as PilotFeedbackStatus;
    const adminNotes = cleanText(body.admin_notes, 2000);
    if (!id) return NextResponse.json({ error: "Feedback ID is required." }, { status: 400 });
    if (!statuses.includes(status)) return NextResponse.json({ error: "Choose a valid status." }, { status: 400 });
    const supabase = getSupabaseAdmin();
    const result = await supabase.from("pilot_feedback").update({
      status,
      admin_notes: adminNotes,
      reviewed_by_admin: admin.username,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", id).select("*").maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return NextResponse.json({ error: "Feedback report not found." }, { status: 404 });
    return NextResponse.json({ feedback: result.data, message: "Feedback updated." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update feedback." }, { status: 400 });
  }
}
