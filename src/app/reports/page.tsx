import Link from "next/link";
import { redirect } from "next/navigation";
import { ReportsClient } from "@/app/reports/reports-client";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import { getPermittedReports } from "@/lib/reports";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reports | PharmaStock",
};

function currentMonthRange() {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  return {
    from: start.toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  };
}

export default async function ReportsPage() {
  const session = await authenticatePharmacyFromSessionCookie();
  if (!session) redirect("/");

  const range = currentMonthRange();

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase text-emerald-700">{session.pharmacy.pharmacy_name}</p>
            <h1 className="text-2xl font-black tracking-tight">Reports</h1>
            <p className="mt-1 text-sm font-semibold text-slate-600">{session.user.full_name} / {session.role}</p>
          </div>
          <Link className="rounded-md border border-slate-300 bg-white px-4 py-3 text-center text-sm font-bold text-slate-800" href="/">
            Back to POS
          </Link>
        </header>
        <ReportsClient permittedReports={getPermittedReports(session.role)} initialFrom={range.from} initialTo={range.to} />
      </div>
    </main>
  );
}
