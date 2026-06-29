import Link from "next/link";
import { redirect } from "next/navigation";
import { StaffManager } from "@/app/staff/staff-manager";
import { authenticatePharmacyFromSessionCookie, normalizePharmacyUser } from "@/lib/pharmacy-session";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Staff | PharmaStock",
};

export default async function StaffPage() {
  const session = await authenticatePharmacyFromSessionCookie();
  if (!session) redirect("/");
  if (session.role !== "OWNER") redirect("/");

  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("pharmacy_users")
    .select("*")
    .eq("pharmacy_id", session.pharmacy.id)
    .order("created_at", { ascending: true });

  if (result.error) throw result.error;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase text-emerald-700">{session.pharmacy.pharmacy_name}</p>
            <h1 className="text-2xl font-black tracking-tight">Staff Management</h1>
          </div>
          <Link className="rounded-md border border-slate-300 bg-white px-4 py-3 text-center text-sm font-bold text-slate-800" href="/">
            Back to POS
          </Link>
        </header>
        <StaffManager currentUserId={session.user.id} initialStaff={(result.data || []).map(normalizePharmacyUser)} />
      </div>
    </main>
  );
}
