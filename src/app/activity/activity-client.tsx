"use client";

import { useMemo, useState } from "react";
import { formatDateTime } from "@/lib/format";
import type { ActivityLog, ActivityLogAction } from "@/lib/types";

const actionLabels: Record<ActivityLogAction, string> = {
  LOGIN: "Login",
  LOGOUT: "Logout",
  SALE_CREATED: "Sale created",
  STOCK_ADDED: "Stock added",
  PRODUCTS_IMPORTED: "Products imported",
  STOCK_IMPORTED: "Stock imported",
  EXPENSE_CREATED: "Expense created",
  SETTINGS_UPDATED: "Settings updated",
  STAFF_CREATED: "Staff created",
  STAFF_UPDATED: "Staff updated",
  STAFF_DEACTIVATED: "Staff deactivated",
  STAFF_REACTIVATED: "Staff reactivated",
  STAFF_PASSWORD_RESET: "Password reset",
};

export function ActivityClient({ initialLogs }: { initialLogs: ActivityLog[] }) {
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const actors = useMemo(() => Array.from(new Set(initialLogs.map((log) => log.actor_name))).sort(), [initialLogs]);
  const logs = useMemo(
    () =>
      initialLogs.filter((log) => {
        const createdDate = log.created_at.slice(0, 10);
        return (!action || log.action === action) && (!actor || log.actor_name === actor) && (!from || createdDate >= from) && (!to || createdDate <= to);
      }),
    [action, actor, from, initialLogs, to],
  );

  return (
    <div className="grid gap-5">
      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-semibold">
          Action
          <select value={action} onChange={(event) => setAction(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3">
            <option value="">All actions</option>
            {Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Staff member
          <select value={actor} onChange={(event) => setActor(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3">
            <option value="">All staff</option>
            {actors.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">
          From
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3" />
        </label>
        <label className="text-sm font-semibold">
          To
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3" />
        </label>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="font-bold">{logs.length} activit{logs.length === 1 ? "y" : "ies"}</p>
        </div>
        {logs.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm font-semibold text-slate-600">No activity matches these filters.</p>
        ) : (
          <div className="divide-y divide-slate-200">
            {logs.map((log) => (
              <article key={log.id} className="grid gap-2 px-4 py-4 sm:grid-cols-[180px_1fr_auto] sm:items-start">
                <div>
                  <p className="font-bold">{log.actor_name}</p>
                  <p className="text-xs font-bold uppercase text-slate-500">{log.actor_role}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-950">{log.description}</p>
                  <p className="mt-1 text-xs font-bold uppercase text-emerald-700">{actionLabels[log.action]}</p>
                </div>
                <time className="text-sm font-semibold text-slate-600" dateTime={log.created_at}>{formatDateTime(log.created_at)}</time>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
