import { NextResponse } from "next/server";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { PilotFeedbackCategory, PilotFeedbackPriority } from "@/lib/types";

const categories: PilotFeedbackCategory[] = ["BUG", "CONFUSING", "SLOW", "SUGGESTION", "OTHER"];
const priorities: PilotFeedbackPriority[] = ["LOW", "NORMAL", "HIGH", "BLOCKER"];
const workflows = ["Dashboard", "Sell", "Products", "Add Stock", "Adjust Stock", "Expiry", "Sales", "Reports", "Notifications", "Onboarding", "Staff", "Backup", "Other"];

function cleanText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

export async function GET() {
  const session = await authenticatePharmacyFromSessionCookie();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const supabase = getSupabaseAdmin();
  let query = supabase.from("pilot_feedback").select("*").eq("pharmacy_id", session.pharmacy.id).order("created_at", { ascending: false }).limit(100);
  if (!(["OWNER", "IN_CHARGE"] as string[]).includes(session.role)) query = query.eq("submitted_by", session.user.id);
  const result = await query;
  if (result.error) return NextResponse.json({ error: "Unable to load feedback." }, { status: 500 });
  return NextResponse.json({ feedback: result.data || [] });
}

export async function POST(request: Request) {
  const session = await authenticatePharmacyFromSessionCookie();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const body = await request.json();
    const category = cleanText(body.category, 30).toUpperCase() as PilotFeedbackCategory;
    const priority = cleanText(body.priority, 20).toUpperCase() as PilotFeedbackPriority;
    const workflow = cleanText(body.workflow, 50);
    const title = cleanText(body.title, 120);
    const description = cleanText(body.description, 2000);
    const pagePath = cleanText(body.page_path, 200);
    if (!categories.includes(category)) return NextResponse.json({ error: "Choose a valid feedback type." }, { status: 400 });
    if (!priorities.includes(priority)) return NextResponse.json({ error: "Choose a valid urgency." }, { status: 400 });
    if (!workflows.includes(workflow)) return NextResponse.json({ error: "Choose where the issue happened." }, { status: 400 });
    if (title.length < 4) return NextResponse.json({ error: "Enter a short title of at least 4 characters." }, { status: 400 });
    if (description.length < 10) return NextResponse.json({ error: "Explain what happened using at least 10 characters." }, { status: 400 });
    const supabase = getSupabaseAdmin();
    const result = await supabase.from("pilot_feedback").insert({
      pharmacy_id: session.pharmacy.id,
      submitted_by: session.user.id,
      reporter_name: session.user.full_name,
      reporter_role: session.role,
      category,
      priority,
      workflow,
      title,
      description,
      page_path: pagePath.startsWith("/") ? pagePath : "",
      user_agent: cleanText(request.headers.get("user-agent"), 500),
    }).select("*").single();
    if (result.error) throw result.error;
    return NextResponse.json({ feedback: result.data, message: "Feedback sent to PharmaStock Admin." }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to submit feedback." }, { status: 400 });
  }
}
