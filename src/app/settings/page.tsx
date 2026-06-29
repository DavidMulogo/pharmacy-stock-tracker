import Link from "next/link";
import { redirect } from "next/navigation";
import { SettingsForm } from "@/app/settings/settings-form";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import { getPharmacySettings } from "@/lib/pharmacy-settings";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings | PharmaStock",
};

export default async function SettingsPage() {
  const session = await authenticatePharmacyFromSessionCookie();
  if (!session) redirect("/");

  const settings = await getPharmacySettings(session.pharmacy.id, session.pharmacy.pharmacy_name);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase text-emerald-700">{session.pharmacy.pharmacy_name}</p>
            <h1 className="text-2xl font-black tracking-tight">Pharmacy Settings</h1>
          </div>
          <Link className="rounded-md border border-slate-300 bg-white px-4 py-3 text-center text-sm font-bold text-slate-800" href="/">
            Back to POS
          </Link>
        </header>
        <SettingsForm initialSettings={settings} />
      </div>
    </main>
  );
}
