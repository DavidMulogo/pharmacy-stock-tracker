import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { FeedbackClient } from "@/app/feedback/feedback-client";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pilot Feedback | PharmaStock" };

export default async function FeedbackPage() {
  const session = await authenticatePharmacyFromSessionCookie();
  if (!session) redirect("/");
  const supabase = getSupabaseAdmin();
  let query = supabase.from("pilot_feedback").select("*").eq("pharmacy_id", session.pharmacy.id).order("created_at", { ascending: false }).limit(100);
  if (!(["OWNER", "IN_CHARGE"] as string[]).includes(session.role)) query = query.eq("submitted_by", session.user.id);
  const result = await query;
  if (result.error) throw result.error;
  return <FeedbackClient initialFeedback={result.data || []} pharmacyName={session.pharmacy.pharmacy_name} />;
}
