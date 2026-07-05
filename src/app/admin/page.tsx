import { AdminPortal } from "@/app/admin/admin-portal";
import { authenticateAdminFromCookie } from "@/lib/admin-session";
import { normalizePharmacyRow } from "@/lib/data";
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
  return (result.data || []).map(normalizePharmacyRow);
}

export default async function AdminPage() {
  try {
    const admin = await authenticateAdminFromCookie();
    const pharmacies = admin ? await getAdminPharmacies() : [];

    return <AdminPortal initialAdmin={admin} initialAuthenticated={Boolean(admin)} initialPharmacies={pharmacies} />;
  } catch {
    return <AdminPortal initialAdmin={null} initialAuthenticated={false} initialPharmacies={[]} />;
  }
}
