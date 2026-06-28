"use client";

import { useMemo, useState } from "react";
import type { Pharmacy, PharmacyPlan, PharmacyStatus } from "@/lib/types";

type PharmacyForm = {
  id: string;
  pharmacy_name: string;
  owner_name: string;
  phone: string;
  pharmacy_code: string;
  password: string;
  plan: PharmacyPlan;
  status: PharmacyStatus;
  trial_ends_at: string;
  subscription_ends_at: string;
};

const emptyForm: PharmacyForm = {
  id: "",
  pharmacy_name: "",
  owner_name: "",
  phone: "",
  pharmacy_code: "",
  password: "",
  plan: "TRIAL",
  status: "TRIAL",
  trial_ends_at: "",
  subscription_ends_at: "",
};

const planOptions: PharmacyPlan[] = ["TRIAL", "BASIC", "PRO", "ENTERPRISE"];
const statusOptions: PharmacyStatus[] = ["ACTIVE", "TRIAL", "EXPIRED", "SUSPENDED"];

function toDateInput(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

export function AdminPortal({
  initialAuthenticated,
  initialPharmacies,
}: {
  initialAuthenticated: boolean;
  initialPharmacies: Pharmacy[];
}) {
  const [isAuthenticated, setIsAuthenticated] = useState(initialAuthenticated);
  const [pharmacies, setPharmacies] = useState(initialPharmacies);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<PharmacyForm>(emptyForm);
  const [resetPassword, setResetPassword] = useState("");
  const [resetPharmacyId, setResetPharmacyId] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const stats = useMemo(
    () => ({
      total: pharmacies.length,
      active: pharmacies.filter((pharmacy) => pharmacy.status === "ACTIVE").length,
      suspended: pharmacies.filter((pharmacy) => pharmacy.status === "SUSPENDED").length,
      trial: pharmacies.filter((pharmacy) => pharmacy.status === "TRIAL").length,
      expired: pharmacies.filter((pharmacy) => pharmacy.status === "EXPIRED").length,
    }),
    [pharmacies],
  );
  const filteredPharmacies = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return pharmacies;

    return pharmacies.filter((pharmacy) =>
      [pharmacy.pharmacy_name, pharmacy.owner_name, pharmacy.phone, pharmacy.plan, pharmacy.status].some((value) =>
        value.toLowerCase().includes(text),
      ),
    );
  }, [pharmacies, query]);

  async function loadPharmacies() {
    const response = await fetch("/api/admin/pharmacies");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load pharmacies.");
    setPharmacies(result.pharmacies || []);
  }

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.error || "Invalid admin login.");

      setIsAuthenticated(true);
      setUsername("");
      setPassword("");
      await loadPharmacies();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to log in.");
    } finally {
      setIsLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setIsAuthenticated(false);
    setPharmacies([]);
  }

  function editPharmacy(pharmacy: Pharmacy) {
    setForm({
      id: pharmacy.id,
      pharmacy_name: pharmacy.pharmacy_name,
      owner_name: pharmacy.owner_name,
      phone: pharmacy.phone,
      pharmacy_code: "",
      password: "",
      plan: pharmacy.plan,
      status: pharmacy.status,
      trial_ends_at: toDateInput(pharmacy.trial_ends_at),
      subscription_ends_at: toDateInput(pharmacy.subscription_ends_at),
    });
  }

  async function submitPharmacy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsLoading(true);

    try {
      const isEditing = Boolean(form.id);
      const response = await fetch("/api/admin/pharmacies", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, action: "update" }),
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.error || "Unable to save pharmacy.");

      setForm(emptyForm);
      setMessage(isEditing ? "Pharmacy updated." : "Pharmacy created.");
      await loadPharmacies();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save pharmacy.");
    } finally {
      setIsLoading(false);
    }
  }

  async function pharmacyAction(id: string, action: "suspend" | "reactivate") {
    setMessage("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/pharmacies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.error || "Unable to update pharmacy.");

      await loadPharmacies();
      setMessage(action === "suspend" ? "Pharmacy suspended." : "Pharmacy reactivated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update pharmacy.");
    } finally {
      setIsLoading(false);
    }
  }

  async function submitPasswordReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/pharmacies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: resetPharmacyId, action: "reset-password", password: resetPassword }),
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.error || "Unable to reset password.");

      setResetPharmacyId("");
      setResetPassword("");
      setMessage("Pharmacy password reset.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to reset password.");
    } finally {
      setIsLoading(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
        <section className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase text-emerald-700">PharmaStock Admin</p>
          <h1 className="mt-2 text-2xl font-bold">Admin Login</h1>
          <form className="mt-5 grid gap-4" onSubmit={submitLogin}>
            <Input label="Admin username" value={username} onChange={setUsername} />
            <Input label="Admin password" value={password} onChange={setPassword} type="password" />
            {message ? <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{message}</p> : null}
            <button className="rounded-md bg-emerald-700 px-4 py-3 font-bold text-white disabled:bg-slate-300" disabled={isLoading} type="submit">
              {isLoading ? "Logging in..." : "Log In"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-700">PharmaStock Admin</p>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          </div>
          <button className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800" type="button" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi label="Total pharmacies" value={stats.total} tone="bg-white border-slate-200" />
          <Kpi label="Active" value={stats.active} tone="bg-emerald-50 border-emerald-200" />
          <Kpi label="Suspended" value={stats.suspended} tone="bg-rose-50 border-rose-200" />
          <Kpi label="Trial" value={stats.trial} tone="bg-blue-50 border-blue-200" />
          <Kpi label="Expired" value={stats.expired} tone="bg-orange-50 border-orange-200" />
        </div>

        {message ? <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">{message}</p> : null}

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold">{form.id ? "Edit Pharmacy" : "Create Pharmacy"}</h2>
          <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={submitPharmacy}>
            <Input label="Pharmacy name" value={form.pharmacy_name} onChange={(value) => setForm({ ...form, pharmacy_name: value })} />
            <Input label="Owner name" value={form.owner_name} onChange={(value) => setForm({ ...form, owner_name: value })} />
            <Input label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
            {!form.id ? <Input label="Login code" value={form.pharmacy_code} onChange={(value) => setForm({ ...form, pharmacy_code: value })} /> : null}
            {!form.id ? <Input label="Login password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} type="password" /> : null}
            <Select label="Plan" value={form.plan} options={planOptions} onChange={(value) => setForm({ ...form, plan: value as PharmacyPlan })} />
            <Select label="Status" value={form.status} options={statusOptions} onChange={(value) => setForm({ ...form, status: value as PharmacyStatus })} />
            <Input label="Trial ends" value={form.trial_ends_at} onChange={(value) => setForm({ ...form, trial_ends_at: value })} type="date" />
            <Input label="Subscription ends" value={form.subscription_ends_at} onChange={(value) => setForm({ ...form, subscription_ends_at: value })} type="date" />
            <div className="flex gap-2 self-end lg:col-span-4">
              <button className="rounded-md bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300" disabled={isLoading} type="submit">
                {form.id ? "Save Pharmacy" : "Create Pharmacy"}
              </button>
              {form.id ? (
                <button className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800" type="button" onClick={() => setForm(emptyForm)}>
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-bold">Pharmacies</h2>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600 sm:max-w-xs"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search pharmacies"
            />
          </div>

          <div className="mt-4 grid gap-3">
            {filteredPharmacies.length ? (
              filteredPharmacies.map((pharmacy) => (
                <article key={pharmacy.id} className="rounded-md border border-slate-200 p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="font-bold">{pharmacy.pharmacy_name}</h3>
                      <p className="text-sm text-slate-600">{pharmacy.owner_name} - {pharmacy.phone}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">
                        {pharmacy.plan} / {pharmacy.status}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-bold" type="button" onClick={() => editPharmacy(pharmacy)}>
                        Edit
                      </button>
                      {pharmacy.status === "SUSPENDED" ? (
                        <button className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800" type="button" onClick={() => pharmacyAction(pharmacy.id, "reactivate")}>
                          Reactivate
                        </button>
                      ) : (
                        <button className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800" type="button" onClick={() => pharmacyAction(pharmacy.id, "suspend")}>
                          Suspend
                        </button>
                      )}
                      <button className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800" type="button" onClick={() => setResetPharmacyId(pharmacy.id)}>
                        Reset password
                      </button>
                    </div>
                  </div>
                  {resetPharmacyId === pharmacy.id ? (
                    <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={submitPasswordReset}>
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-emerald-600"
                        value={resetPassword}
                        onChange={(event) => setResetPassword(event.target.value)}
                        type="password"
                        placeholder="New pharmacy password"
                      />
                      <button className="rounded-md bg-blue-700 px-3 py-2 text-sm font-bold text-white" type="submit">
                        Save password
                      </button>
                    </form>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-slate-300 p-6 text-center font-semibold text-slate-600">No pharmacies found.</p>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${tone}`}>
      <p className="text-xs font-bold uppercase text-slate-600">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <select
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
