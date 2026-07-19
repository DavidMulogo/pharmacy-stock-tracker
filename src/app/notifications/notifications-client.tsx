"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDateTime } from "@/lib/format";
import type { Notification, NotificationCounts, NotificationFilter, NotificationSeverity, PharmacyUserRole } from "@/lib/types";

const filters: Array<{ id: NotificationFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "inventory", label: "Inventory" },
  { id: "expiry", label: "Expiry" },
  { id: "subscription", label: "Subscription" },
  { id: "resolved", label: "Resolved" },
];

const severityClass: Record<NotificationSeverity, string> = {
  INFO: "border-blue-200 bg-blue-50 text-blue-950",
  WARNING: "border-amber-200 bg-amber-50 text-amber-950",
  CRITICAL: "border-rose-200 bg-rose-50 text-rose-950",
};

function parseMessage(data: { error?: unknown }) {
  return typeof data.error === "string" ? data.error : "Unable to update notifications.";
}

function notificationLink(notification: Notification) {
  if (notification.type === "LOW_STOCK" || notification.type === "OUT_OF_STOCK") return "/";
  if (notification.type === "EXPIRING_SOON" || notification.type === "EXPIRED_BATCH") return "/";
  return "/onboarding";
}

export function NotificationsClient({
  initialNotifications,
  initialCounts,
  pharmacyName,
  role,
}: {
  initialNotifications: Notification[];
  initialCounts: NotificationCounts;
  pharmacyName: string;
  role: PharmacyUserRole;
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [counts, setCounts] = useState(initialCounts);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const visibleFilters = useMemo(
    () => filters.filter((item) => role !== "TECHNICIAN" || !["subscription"].includes(item.id)),
    [role],
  );

  async function load(nextFilter = filter) {
    setMessage("");
    setIsLoading(true);
    try {
      const response = await fetch(`/api/notifications?filter=${nextFilter}`);
      const result = await response.json();
      if (!response.ok) throw new Error(parseMessage(result));
      setNotifications(result.notifications || []);
      setCounts(result.counts || counts);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load notifications.");
    } finally {
      setIsLoading(false);
    }
  }

  async function action(payload: Record<string, string>) {
    setMessage("");
    setIsLoading(true);
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, filter }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(parseMessage(result));
      setNotifications(result.notifications || []);
      setCounts(result.counts || counts);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update notifications.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-xs font-black uppercase text-emerald-700">Notifications</p>
            <h1 className="text-2xl font-bold">{pharmacyName}</h1>
            <p className="mt-1 text-sm font-semibold text-slate-600">{counts.unread_active} unread active alert{counts.unread_active === 1 ? "" : "s"}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button className="rounded-md bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300" disabled={isLoading} onClick={() => action({ action: "refresh" })} type="button">
              Refresh
            </button>
            <button className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 disabled:bg-slate-100" disabled={isLoading || counts.unread_active === 0} onClick={() => action({ action: "mark_all_read" })} type="button">
              Mark All Read
            </button>
            <Link className="rounded-md border border-slate-300 bg-white px-4 py-3 text-center text-sm font-bold text-slate-800" href="/">
              Back to POS
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap gap-2">
          {visibleFilters.map((item) => (
            <button
              key={item.id}
              className={`rounded-md border px-3 py-2 text-sm font-bold ${filter === item.id ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-200 bg-white text-slate-700"}`}
              onClick={() => {
                setFilter(item.id);
                void load(item.id);
              }}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        {message ? <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800">{message}</p> : null}
        {isLoading ? <p className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">Loading notifications...</p> : null}

        {notifications.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-semibold text-slate-600">
            No notifications match this filter.
          </p>
        ) : (
          <div className="grid gap-3">
            {notifications.map((notification) => (
              <article key={notification.id} className={`rounded-lg border p-4 shadow-sm ${severityClass[notification.severity]}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-current px-2.5 py-1 text-xs font-black">{notification.severity}</span>
                      <span className="rounded-full border border-current px-2.5 py-1 text-xs font-black">{notification.status}</span>
                      {!notification.read_at && notification.status === "ACTIVE" ? <span className="rounded-full border border-current px-2.5 py-1 text-xs font-black">UNREAD</span> : null}
                    </div>
                    <h2 className="mt-3 text-lg font-bold">{notification.title}</h2>
                    <p className="mt-1 text-sm font-semibold">{notification.message}</p>
                    <p className="mt-2 text-xs font-bold opacity-80">Last seen {formatDateTime(notification.last_seen_at)}</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:min-w-36">
                    <Link className="rounded-md bg-white px-3 py-2 text-center text-sm font-bold text-slate-900" href={notificationLink(notification)}>
                      Open
                    </Link>
                    {!notification.read_at && notification.status === "ACTIVE" ? (
                      <button className="rounded-md border border-current px-3 py-2 text-sm font-bold" disabled={isLoading} onClick={() => action({ action: "mark_read", id: notification.id })} type="button">
                        Mark Read
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
