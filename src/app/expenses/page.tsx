import Link from "next/link";
import { redirect } from "next/navigation";
import { ExpensesClient } from "@/app/expenses/expenses-client";
import { getExpensesForPharmacy } from "@/lib/data";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Expenses | PharmaStock",
};

export default async function ExpensesPage() {
  const session = await authenticatePharmacyFromSessionCookie();
  if (!session) redirect("/");

  if (session.role === "TECHNICIAN") {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-950">
        <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6">
          <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold uppercase text-emerald-700">{session.pharmacy.pharmacy_name}</p>
              <h1 className="text-2xl font-black tracking-tight">Expenses</h1>
            </div>
            <Link className="rounded-md border border-slate-300 bg-white px-4 py-3 text-center text-sm font-bold text-slate-800" href="/">
              Back to POS
            </Link>
          </header>
          <section className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-rose-950">
            <h2 className="text-lg font-bold">Access restricted</h2>
            <p className="mt-2 text-sm font-semibold">Technicians cannot view expenses or net profit.</p>
          </section>
        </div>
      </main>
    );
  }

  const initialMonth = new Date().toISOString().slice(0, 7);
  const expenses = await getExpensesForPharmacy(session.pharmacy.id, initialMonth);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase text-emerald-700">{session.pharmacy.pharmacy_name}</p>
            <h1 className="text-2xl font-black tracking-tight">Expenses</h1>
            <p className="mt-1 text-sm font-semibold text-slate-600">{session.user.full_name} / {session.role}</p>
          </div>
          <Link className="rounded-md border border-slate-300 bg-white px-4 py-3 text-center text-sm font-bold text-slate-800" href="/">
            Back to POS
          </Link>
        </header>
        <ExpensesClient initialExpenses={expenses} initialMonth={initialMonth} />
      </div>
    </main>
  );
}
