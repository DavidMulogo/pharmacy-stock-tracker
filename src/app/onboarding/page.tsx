import { redirect } from "next/navigation";
import { OnboardingClient } from "@/app/onboarding/onboarding-client";
import { authenticatePharmacyFromSessionCookie, normalizePharmacyUser } from "@/lib/pharmacy-session";
import { getOnboardingProgress } from "@/lib/onboarding";
import { getPharmacySettings } from "@/lib/pharmacy-settings";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await authenticatePharmacyFromSessionCookie();
  if (!session) redirect("/");
  if (session.role !== "OWNER") redirect("/");

  const actor = {
    pharmacyId: session.pharmacy.id,
    userId: session.user.id,
    name: session.user.full_name,
    role: session.role,
  };
  const supabase = getSupabaseAdmin();
  const [progress, settings, staffResult] = await Promise.all([
    getOnboardingProgress(session.pharmacy.id, actor),
    getPharmacySettings(session.pharmacy.id, session.pharmacy.pharmacy_name),
    supabase.from("pharmacy_users").select("*").eq("pharmacy_id", session.pharmacy.id).order("created_at", { ascending: true }),
  ]);

  if (staffResult.error) throw staffResult.error;

  return (
    <OnboardingClient
      initialPharmacy={session.pharmacy}
      initialProgress={progress}
      initialSettings={settings}
      initialStaff={(staffResult.data || []).map(normalizePharmacyUser)}
    />
  );
}
