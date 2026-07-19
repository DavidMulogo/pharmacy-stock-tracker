import { AdminPortal } from "@/app/admin/admin-portal";
import { authenticateAdminFromCookie } from "@/lib/admin-session";
import { normalizePharmacyRow } from "@/lib/data";
import { getOnboardingSummary } from "@/lib/onboarding";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Metadata } from "next";
import type { Pharmacy } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Admin | PharmaStock",
};

async function getAdminPharmacies(): Promise<Pharmacy[]> {
  const admin = await authenticateAdminFromCookie();
  if (!admin) return [];

  const supabase = getSupabaseAdmin();
  const result = await supabase.from("pharmacies").select("*").is("archived_at", null).order("created_at", { ascending: false });

  if (result.error) throw result.error;
  return Promise.all(
    (result.data || []).map(async (pharmacy) => {
      const normalized = normalizePharmacyRow(pharmacy);
      return {
        ...normalized,
        onboarding: await getOnboardingSummary(normalized.id),
      };
    }),
  );
}

export default async function AdminPage() {
  let admin: Awaited<ReturnType<typeof authenticateAdminFromCookie>> = null;
  let pharmacies: Pharmacy[] = [];

  try {
    admin = await authenticateAdminFromCookie();
    pharmacies = admin ? await getAdminPharmacies() : [];
  } catch {
    admin = null;
    pharmacies = [];
  }

  return <AdminPortal initialAdmin={admin} initialAuthenticated={Boolean(admin)} initialPharmacies={pharmacies} />;
}
