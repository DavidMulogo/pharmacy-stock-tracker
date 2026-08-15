"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDateTime } from "@/lib/format";
import type { PilotFeedback, PilotFeedbackCategory, PilotFeedbackPriority } from "@/lib/types";

const categories: Array<{ value: PilotFeedbackCategory; label: string }> = [
  { value: "BUG", label: "Something is not working" },
  { value: "CONFUSING", label: "Something is confusing" },
  { value: "SLOW", label: "A workflow feels slow" },
  { value: "SUGGESTION", label: "I have a suggestion" },
  { value: "OTHER", label: "Other feedback" },
];
const priorities: Array<{ value: PilotFeedbackPriority; label: string }> = [
  { value: "NORMAL", label: "Normal — I can continue working" },
  { value: "HIGH", label: "High — seriously affects my work" },
  { value: "BLOCKER", label: "Blocker — I cannot continue" },
  { value: "LOW", label: "Low — small inconvenience" },
];
const workflows = ["Dashboard", "Sell", "Products", "Add Stock", "Adjust Stock", "Expiry", "Sales", "Reports", "Notifications", "Onboarding", "Staff", "Backup", "Other"];

export function FeedbackClient({ initialFeedback, pharmacyName }: { initialFeedback: PilotFeedback[]; pharmacyName: string }) {
  const [feedback, setFeedback] = useState(initialFeedback);
  const [category, setCategory] = useState<PilotFeedbackCategory>("BUG");
  const [priority, setPriority] = useState<PilotFeedbackPriority>("NORMAL");
  const [workflow, setWorkflow] = useState("Sell");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSaving(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, priority, workflow, title, description, page_path: window.location.pathname }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to send feedback.");
      setFeedback((current) => [result.feedback as PilotFeedback, ...current]);
      setTitle("");
      setDescription("");
      setPriority("NORMAL");
      setMessage(result.message || "Feedback sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to send feedback.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto grid max-w-4xl gap-5 px-4 py-6 sm:px-6">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase text-emerald-700">Pilot Feedback</p>
            <h1 className="text-2xl font-black">Help us improve PharmaStock</h1>
            <p className="mt-1 text-sm font-semibold text-slate-600">{pharmacyName}</p>
          </div>
          <Link className="rounded-md border border-slate-300 bg-white px-4 py-3 text-center text-sm font-bold" href="/">Back to POS</Link>
        </header>

        <form className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" onSubmit={submit}>
          <div>
            <h2 className="text-lg font-black">Report an experience</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">Short and honest feedback is enough. Tell us what you tried, what happened, and what you expected.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Feedback type" value={category} onChange={(value) => setCategory(value as PilotFeedbackCategory)} options={categories} />
            <Select label="Urgency" value={priority} onChange={(value) => setPriority(value as PilotFeedbackPriority)} options={priorities} />
          </div>
          <label className="text-sm font-bold">
            Where did it happen?
            <select className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base" value={workflow} onChange={(event) => setWorkflow(event.target.value)}>
              {workflows.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-sm font-bold">
            Short title
            <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3 text-base" maxLength={120} minLength={4} required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Example: Product search is difficult on my phone" />
          </label>
          <label className="text-sm font-bold">
            What happened?
            <textarea className="mt-1 min-h-32 w-full rounded-md border border-slate-300 px-3 py-3 text-base" maxLength={2000} minLength={10} required value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What were you trying to do? What happened? What would make it easier?" />
          </label>
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">Do not include patient names, phone numbers, prescriptions, passwords, or other private information.</p>
          {message ? <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-900">{message}</p> : null}
          <button className="rounded-md bg-emerald-700 px-4 py-3 font-bold text-white disabled:bg-slate-300" disabled={isSaving} type="submit">{isSaving ? "Sending..." : "Send Feedback"}</button>
        </form>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-black">Submitted feedback</h2>
          <div className="mt-3 grid gap-3">
            {feedback.length ? feedback.map((item) => (
              <article className="rounded-md border border-slate-200 p-3" key={item.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-black">{item.title}</p>
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-black text-blue-800">{item.status}</span>
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-600">{item.workflow} · {item.category} · {item.priority} · {formatDateTime(item.created_at)}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{item.description}</p>
                {item.admin_notes ? <p className="mt-2 rounded-md bg-emerald-50 p-2 text-sm font-semibold text-emerald-900">Admin response: {item.admin_notes}</p> : null}
              </article>
            )) : <p className="rounded-md border border-dashed border-slate-300 p-5 text-center text-sm font-semibold text-slate-600">No feedback submitted yet.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="text-sm font-bold">{label}<select className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}
