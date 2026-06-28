import { AdminPortal } from "@/app/admin/admin-portal";
import { authenticateAdminFromCookie } from "@/lib/admin-session";
import { normalizePharmacyRow } from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Pharmacy } from "@/lib/types";

export const dynamic = "force-dynamic";

async function getAdminPharmacies(): Promise<Pharmacy[]> {
  const admin = await authenticateAdminFromCookie();
  if (!admin) return [];

  const supabase = getSupabaseAdmin();
  const result = await supabase.from("pharmacies").select("*").order("created_at", { ascending: false });

  if (result.error) throw result.error;
  return (result.data || []).map(normalizePharmacyRow);
}

export default async function AdminPage() {
  const admin = await authenticateAdminFromCookie();
  const pharmacies = await getAdminPharmacies();

  return <AdminPortal initialAuthenticated={Boolean(admin)} initialPharmacies={pharmacies} />;
}
