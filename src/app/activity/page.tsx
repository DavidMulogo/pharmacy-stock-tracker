import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ActivityClient } from "@/app/activity/activity-client";
import { getActivityLogs } from "@/lib/activity-log";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Activity Log | PharmaStock" };

export default async function ActivityPage() {
  const session = await authenticatePharmacyFromSessionCookie();
  if (!session || session.role !== "OWNER") redirect("/");

  const logs = await getActivityLogs(session.pharmacy.id, { limit: 500 });

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase text-emerald-700">{session.pharmacy.pharmacy_name}</p>
            <h1 className="text-2xl font-black tracking-tight">Activity Log</h1>
            <p className="mt-1 text-sm font-semibold text-slate-600">Review important staff and business actions.</p>
          </div>
          <Link className="rounded-md border border-slate-300 bg-white px-4 py-3 text-center text-sm font-bold text-slate-800" href="/">Back to POS</Link>
        </header>
        <ActivityClient initialLogs={logs} />
      </div>
    </main>
  );
}

