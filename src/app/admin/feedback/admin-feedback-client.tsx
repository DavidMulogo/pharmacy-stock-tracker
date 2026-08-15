"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatDateTime } from "@/lib/format";
import type { PilotFeedback, PilotFeedbackStatus } from "@/lib/types";

const statuses: Array<"ALL" | PilotFeedbackStatus> = ["ALL", "NEW", "REVIEWING", "PLANNED", "RESOLVED", "CLOSED"];

export function AdminFeedbackClient() {
  const [feedback, setFeedback] = useState<PilotFeedback[]>([]);
  const [statusFilter, setStatusFilter] = useState<"ALL" | PilotFeedbackStatus>("ALL");
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { status: PilotFeedbackStatus; admin_notes: string }>>({});
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function loadFeedback() {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/feedback?status=${statusFilter}`, { credentials: "include" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load feedback.");
      const rows = result.feedback as PilotFeedback[];
      setFeedback(rows);
      setDrafts(Object.fromEntries(rows.map((item) => [item.id, { status: item.status, admin_notes: item.admin_notes }])))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load feedback.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/admin/feedback?status=${statusFilter}`, { credentials: "include" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load feedback.");
        return result.feedback as PilotFeedback[];
      })
      .then((rows) => {
        if (!active) return;
        setFeedback(rows);
        setDrafts(Object.fromEntries(rows.map((item) => [item.id, { status: item.status, admin_notes: item.admin_notes }])));
        setIsLoading(false);
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Unable to load feedback.");
        setIsLoading(false);
      });
    return () => { active = false; };
  }, [statusFilter]);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return feedback;
    return feedback.filter((item) => `${item.pharmacy_name} ${item.reporter_name} ${item.title} ${item.description} ${item.workflow}`.toLowerCase().includes(text));
  }, [feedback, query]);

  async function save(item: PilotFeedback) {
    setMessage("");
    setIsLoading(true);
    try {
      const draft = drafts[item.id] || { status: item.status, admin_notes: item.admin_notes };
      const response = await fetch("/api/admin/feedback", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, ...draft }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update feedback.");
      setMessage("Feedback updated.");
      await loadFeedback();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update feedback.");
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-6 sm:px-6">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-bold uppercase text-emerald-700">PharmaStock Admin</p><h1 className="text-2xl font-black">Pilot Feedback Queue</h1><p className="mt-1 text-sm font-semibold text-slate-600">Review real pharmacy experiences and track follow-up.</p></div>
          <Link className="rounded-md border border-slate-300 bg-white px-4 py-3 text-center text-sm font-bold" href="/admin">Back to Admin</Link>
        </header>
        <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[16rem_1fr_auto]">
          <label className="text-sm font-bold">Status<select className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label className="text-sm font-bold">Search<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pharmacy, staff, workflow, or words" /></label>
          <button className="self-end rounded-md bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300" disabled={isLoading} onClick={() => void loadFeedback()} type="button">Refresh</button>
        </section>
        {message ? <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-900">{message}</p> : null}
        <section className="grid gap-3">
          {visible.length ? visible.map((item) => {
            const draft = drafts[item.id] || { status: item.status, admin_notes: item.admin_notes };
            return <article className={`rounded-lg border bg-white p-4 shadow-sm ${item.priority === "BLOCKER" ? "border-rose-300" : item.priority === "HIGH" ? "border-amber-300" : "border-slate-200"}`} key={item.id}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-black uppercase text-emerald-700">{item.pharmacy_name}</p><h2 className="text-lg font-black">{item.title}</h2><p className="text-sm font-semibold text-slate-600">{item.reporter_name} / {item.reporter_role} · {item.workflow} · {formatDateTime(item.created_at)}</p></div><div className="flex gap-1"><Badge text={item.category} /><Badge text={item.priority} /></div></div>
              <p className="mt-3 whitespace-pre-wrap text-sm">{item.description}</p>
              <details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer font-bold">Technical context</summary><p className="mt-1 break-all">{item.page_path || "No page recorded"}</p><p className="mt-1 break-all">{item.user_agent || "No device details"}</p></details>
              <div className="mt-4 grid gap-3 sm:grid-cols-[14rem_1fr_auto]">
                <label className="text-sm font-bold">Status<select className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3" value={draft.status} onChange={(event) => setDrafts({ ...drafts, [item.id]: { ...draft, status: event.target.value as PilotFeedbackStatus } })}>{statuses.filter((status) => status !== "ALL").map((status) => <option key={status}>{status}</option>)}</select></label>
                <label className="text-sm font-bold">Admin response / notes<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3" maxLength={2000} value={draft.admin_notes} onChange={(event) => setDrafts({ ...drafts, [item.id]: { ...draft, admin_notes: event.target.value } })} placeholder="Visible to the pharmacy reporter" /></label>
                <button className="self-end rounded-md bg-blue-700 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300" disabled={isLoading} onClick={() => void save(item)} type="button">Save</button>
              </div>
            </article>;
          }) : <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center font-semibold text-slate-600">{isLoading ? "Loading feedback..." : "No feedback matches this view."}</p>}
        </section>
      </div>
    </main>
  );
}

function Badge({ text }: { text: string }) { return <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-black">{text}</span>; }
