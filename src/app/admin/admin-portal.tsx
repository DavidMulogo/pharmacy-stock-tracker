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

type AdminApiResponse = {
  admin?: { username: string; fullName: string | null; role: string };
  error?: string | { message?: string };
  message?: string;
  pharmacy?: Pharmacy;
  pharmacies?: Pharmacy[];
};

type RestoreCounts = Record<string, number>;
type RestorePreview = {
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
    checksum: {
      expected: string | null;
      actual: string | null;
      matches: boolean;
    };
    pharmacy: {
      id: string | null;
      pharmacy_name: string | null;
    };
    record_counts: RestoreCounts;
  };
  target_pharmacy: Pharmacy;
  confirmation_label: string;
  checksum: string | null;
  can_restore: boolean;
  missing_counts: RestoreCounts;
  skipped_counts: RestoreCounts;
  unsupported_counts: Record<string, number>;
};
type RestoreApiResponse = {
  error?: string | { message?: string };
  message?: string;
  preview?: RestorePreview;
  restored?: {
    restored_counts: RestoreCounts;
    skipped_counts: RestoreCounts;
  };
};

function getAdminResponseMessage(data: AdminApiResponse, fallback: string) {
  return typeof data.error === "string" ? data.error : data.error?.message || data.message || fallback;
}

function getRestoreResponseMessage(data: RestoreApiResponse, fallback: string) {
  return typeof data.error === "string" ? data.error : data.error?.message || data.message || fallback;
}

function isSuperAdmin(admin: { role: string } | null) {
  const role = admin?.role.toUpperCase() || "";
  return role === "SUPER_ADMIN" || role === "SUPER-ADMIN";
}

function toDateInput(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

export function AdminPortal({
  initialAdmin,
  initialAuthenticated,
  initialPharmacies,
}: {
  initialAdmin: { username: string; fullName: string | null; role: string } | null;
  initialAuthenticated: boolean;
  initialPharmacies: Pharmacy[];
}) {
  const [isAuthenticated, setIsAuthenticated] = useState(initialAuthenticated);
  const [admin, setAdmin] = useState(initialAdmin);
  const [pharmacies, setPharmacies] = useState(initialPharmacies);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<PharmacyForm>(emptyForm);
  const [resetPassword, setResetPassword] = useState("");
  const [resetPharmacyId, setResetPharmacyId] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [deletePharmacyId, setDeletePharmacyId] = useState("");
  const [deleteConfirmationCode, setDeleteConfirmationCode] = useState("");
  const [restorePharmacyId, setRestorePharmacyId] = useState("");
  const [restoreBackup, setRestoreBackup] = useState<unknown>(null);
  const [restoreFileName, setRestoreFileName] = useState("");
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [currentAdminPassword, setCurrentAdminPassword] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [confirmAdminPassword, setConfirmAdminPassword] = useState("");
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

  async function loadPharmacies(includeArchived = showArchived) {
    const response = await fetch(`/api/admin/pharmacies${includeArchived ? "?archived=1" : ""}`, { credentials: "include" });
    const result = (await response.json()) as AdminApiResponse;
    if (!response.ok) throw new Error(getAdminResponseMessage(result, "Unable to load pharmacies."));
    setPharmacies(result.pharmacies || []);
  }

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = (await response.json()) as AdminApiResponse;

      if (!response.ok) throw new Error(getAdminResponseMessage(result, "Invalid admin login."));

      setIsAuthenticated(true);
      setAdmin(result.admin || { username, fullName: null, role: "SUPER_ADMIN" });
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
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    setIsAuthenticated(false);
    setAdmin(null);
    setPharmacies([]);
  }

  async function submitAdminPasswordChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentAdminPassword,
          new_password: newAdminPassword,
          confirm_password: confirmAdminPassword,
        }),
      });
      const result = (await response.json()) as AdminApiResponse;

      if (!response.ok) throw new Error(getAdminResponseMessage(result, "Unable to change password."));

      setCurrentAdminPassword("");
      setNewAdminPassword("");
      setConfirmAdminPassword("");
      setIsAuthenticated(false);
      setAdmin(null);
      setPharmacies([]);
      setMessage(result.message || "Password changed. Log in again with the new password.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to change password.");
    } finally {
      setIsLoading(false);
    }
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

  async function toggleArchived(value: boolean) {
    setShowArchived(value);
    setMessage("");
    setIsLoading(true);
    try {
      await loadPharmacies(value);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load pharmacies.");
    } finally {
      setIsLoading(false);
    }
  }

  async function submitPharmacy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsLoading(true);

    try {
      const isEditing = Boolean(form.id);
      const response = await fetch("/api/admin/pharmacies", {
        method: isEditing ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, action: "update" }),
      });
      const result = (await response.json()) as AdminApiResponse;

      if (!response.ok) throw new Error(getAdminResponseMessage(result, isEditing ? "Unable to update pharmacy." : "Unable to create pharmacy."));

      setForm(emptyForm);
      setMessage(isEditing ? "Pharmacy updated." : "Pharmacy created.");
      const savedPharmacy = result.pharmacy;
      if (savedPharmacy) {
        setPharmacies((current) =>
          isEditing
            ? current.map((pharmacy) => (pharmacy.id === savedPharmacy.id ? savedPharmacy : pharmacy))
            : [savedPharmacy, ...current],
        );
      }
      try {
        await loadPharmacies();
      } catch (reloadError) {
        console.error("Admin pharmacies reload failed after save:", reloadError);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save pharmacy.");
    } finally {
      setIsLoading(false);
    }
  }

  async function pharmacyAction(id: string, action: "suspend" | "reactivate" | "archive" | "restore") {
    setMessage("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/pharmacies", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const result = (await response.json()) as AdminApiResponse;

      if (!response.ok) throw new Error(getAdminResponseMessage(result, "Unable to update pharmacy."));

      await loadPharmacies();
      setMessage(result.message || (action === "suspend" ? "Pharmacy suspended." : action === "reactivate" ? "Pharmacy reactivated." : action === "archive" ? "Pharmacy archived." : "Pharmacy restored."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update pharmacy.");
    } finally {
      setIsLoading(false);
    }
  }

  async function deletePermanently(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/pharmacies", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: deletePharmacyId,
          action: "delete-permanently",
          confirmationCode: deleteConfirmationCode,
        }),
      });
      const result = (await response.json()) as AdminApiResponse;

      if (!response.ok) throw new Error(getAdminResponseMessage(result, "Unable to permanently delete pharmacy."));

      setDeletePharmacyId("");
      setDeleteConfirmationCode("");
      await loadPharmacies();
      setMessage(result.message || "Pharmacy permanently deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to permanently delete pharmacy.");
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
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: resetPharmacyId, action: "reset-password", password: resetPassword }),
      });
      const result = (await response.json()) as AdminApiResponse;

      if (!response.ok) throw new Error(getAdminResponseMessage(result, "Unable to reset password."));

      setResetPharmacyId("");
      setResetPassword("");
      setMessage("Pharmacy password reset.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to reset password.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadRestoreFile(file: File | null) {
    setRestorePreview(null);
    setRestoreConfirmation("");
    setRestoreBackup(null);
    setRestoreFileName(file?.name || "");
    setMessage("");

    if (!file) return;

    try {
      setRestoreBackup(JSON.parse(await file.text()));
    } catch {
      setMessage("Upload a readable PharmaStock backup JSON file.");
    }
  }

  async function dryRunRestore(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setRestorePreview(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/restore", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "dry-run", pharmacy_id: restorePharmacyId, backup: restoreBackup }),
      });
      const result = (await response.json()) as RestoreApiResponse;

      if (!response.ok) throw new Error(getRestoreResponseMessage(result, "Unable to preview restore."));

      setRestorePreview(result.preview || null);
      setMessage(result.preview?.can_restore ? "Dry run complete. Review the preview before restoring." : "Dry run found validation errors.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to preview restore.");
    } finally {
      setIsLoading(false);
    }
  }

  async function executeRestore() {
    setMessage("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/restore", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "restore", pharmacy_id: restorePharmacyId, backup: restoreBackup, confirmation: restoreConfirmation }),
      });
      const result = (await response.json()) as RestoreApiResponse;

      if (!response.ok) throw new Error(getRestoreResponseMessage(result, "Unable to restore backup."));

      setMessage(result.message || "Backup restored.");
      setRestoreConfirmation("");
      setRestorePreview(null);
      await loadPharmacies();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to restore backup.");
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
            <p className="mt-1 text-sm font-semibold text-slate-600">
              Logged in as {admin?.fullName || admin?.username || "Admin"}
            </p>
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
          <h2 className="text-lg font-bold">Change Admin Password</h2>
          <form className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={submitAdminPasswordChange}>
            <Input label="Current password" value={currentAdminPassword} onChange={setCurrentAdminPassword} type="password" />
            <Input label="New password" value={newAdminPassword} onChange={setNewAdminPassword} type="password" />
            <Input label="Confirm new password" value={confirmAdminPassword} onChange={setConfirmAdminPassword} type="password" />
            <div className="sm:col-span-3">
              <button className="rounded-md bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300" disabled={isLoading} type="submit">
                Change Password
              </button>
            </div>
          </form>
        </section>

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
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-bold">Restore Pharmacy Backup</h2>
            <p className="text-sm font-semibold text-slate-600">
              Merge-only restore for missing records. Existing records are skipped, and staff, sessions, credentials, and activity history are not restored.
            </p>
          </div>
          <form className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto]" onSubmit={dryRunRestore}>
            <Select
              label="Target pharmacy"
              value={restorePharmacyId}
              options={["", ...pharmacies.map((pharmacy) => pharmacy.id)]}
              onChange={(value) => {
                setRestorePharmacyId(value);
                setRestorePreview(null);
                setRestoreConfirmation("");
              }}
              optionLabels={{
                "": "Choose pharmacy",
                ...Object.fromEntries(pharmacies.map((pharmacy) => [pharmacy.id, pharmacy.pharmacy_name])),
              }}
            />
            <label className="block text-sm font-semibold">
              Backup JSON
              <input
                accept="application/json,.json"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base file:mr-3 file:rounded-md file:border-0 file:bg-emerald-700 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white"
                onChange={(event) => void loadRestoreFile(event.target.files?.[0] || null)}
                type="file"
              />
              {restoreFileName ? <span className="mt-1 block text-xs font-bold text-slate-500">{restoreFileName}</span> : null}
            </label>
            <button className="self-end rounded-md bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300" disabled={isLoading || !restorePharmacyId || !restoreBackup} type="submit">
              Preview Restore
            </button>
          </form>
          {restorePreview ? (
            <div className="mt-4 grid gap-4">
              <div className={`rounded-md border px-4 py-3 text-sm font-bold ${restorePreview.can_restore ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
                {restorePreview.can_restore ? "Backup is valid for the selected pharmacy." : "Backup cannot be restored until validation errors are fixed."}
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                <RestoreCountPanel title="Will insert" counts={restorePreview.missing_counts} />
                <RestoreCountPanel title="Will skip" counts={restorePreview.skipped_counts} />
                <RestoreCountPanel title="Unsupported" counts={restorePreview.unsupported_counts} />
              </div>
              {restorePreview.validation.errors.length ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">
                  {restorePreview.validation.errors.map((error) => <p key={error}>{error}</p>)}
                </div>
              ) : null}
              {restorePreview.validation.warnings.length ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                  {restorePreview.validation.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                </div>
              ) : null}
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-bold text-slate-800">
                  Type <span className="font-black text-slate-950">{restorePreview.confirmation_label}</span> to execute restore.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    className="rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600"
                    value={restoreConfirmation}
                    onChange={(event) => setRestoreConfirmation(event.target.value)}
                    placeholder="Exact confirmation"
                  />
                  <button
                    className="rounded-md bg-red-700 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300"
                    disabled={isLoading || !restorePreview.can_restore || restoreConfirmation !== restorePreview.confirmation_label}
                    type="button"
                    onClick={executeRestore}
                  >
                    Execute Restore
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-bold">Pharmacies</h2>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <input
                  checked={showArchived}
                  className="h-4 w-4 accent-emerald-700"
                  onChange={(event) => void toggleArchived(event.target.checked)}
                  type="checkbox"
                />
                Show archived
              </label>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600 sm:max-w-xs"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search pharmacies"
              />
            </div>
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
                      {pharmacy.archived_at ? <p className="mt-1 text-xs font-bold uppercase text-rose-700">Archived</p> : null}
                      {pharmacy.onboarding ? (
                        <p className={`mt-2 w-fit rounded-full border px-2.5 py-1 text-xs font-black uppercase ${pharmacy.onboarding.completed ? "border-emerald-200 bg-emerald-100 text-emerald-800" : "border-blue-200 bg-blue-100 text-blue-800"}`}>
                          Setup {pharmacy.onboarding.completed ? "complete" : `${pharmacy.onboarding.percent}%`}
                        </p>
                      ) : null}
                      {pharmacy.notification_summary ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {pharmacy.notification_summary.expired_subscription ? <AdminAlertBadge label="Expired subscription" tone="rose" /> : null}
                          {pharmacy.notification_summary.trial_ending_soon ? <AdminAlertBadge label="Trial ending soon" tone="amber" /> : null}
                          {pharmacy.notification_summary.subscription_ending_soon ? <AdminAlertBadge label="Subscription ending soon" tone="amber" /> : null}
                          {pharmacy.notification_summary.suspended ? <AdminAlertBadge label="Suspended" tone="rose" /> : null}
                          {pharmacy.notification_summary.onboarding_incomplete ? <AdminAlertBadge label="Setup incomplete" tone="blue" /> : null}
                        </div>
                      ) : null}
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
                      {pharmacy.archived_at ? (
                        <button className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800" type="button" onClick={() => pharmacyAction(pharmacy.id, "restore")}>
                          Restore
                        </button>
                      ) : (
                        <button className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800" type="button" onClick={() => pharmacyAction(pharmacy.id, "archive")}>
                          Archive
                        </button>
                      )}
                      <button className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800" type="button" onClick={() => setResetPharmacyId(pharmacy.id)}>
                        Reset password
                      </button>
                      {isSuperAdmin(admin) ? (
                        <button
                          className="rounded-md border border-red-400 bg-red-50 px-3 py-2 text-sm font-bold text-red-800"
                          type="button"
                          onClick={() => {
                            setDeletePharmacyId(pharmacy.id);
                            setDeleteConfirmationCode("");
                          }}
                        >
                          Delete Permanently
                        </button>
                      ) : null}
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
                  {deletePharmacyId === pharmacy.id ? (
                    <form className="mt-3 grid gap-2 rounded-md border border-red-200 bg-red-50 p-3 sm:grid-cols-[1fr_auto_auto]" onSubmit={deletePermanently}>
                      <input
                        className="rounded-md border border-red-200 px-3 py-2 text-base outline-none focus:border-red-600"
                        placeholder="Type login code or pharmacy name"
                        value={deleteConfirmationCode}
                        onChange={(event) => setDeleteConfirmationCode(event.target.value)}
                      />
                      <button className="rounded-md bg-red-700 px-3 py-2 text-sm font-bold text-white disabled:bg-slate-300" disabled={isLoading} type="submit">
                        Confirm Delete
                      </button>
                      <button
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800"
                        type="button"
                        onClick={() => {
                          setDeletePharmacyId("");
                          setDeleteConfirmationCode("");
                        }}
                      >
                        Cancel
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

function RestoreCountPanel({ title, counts }: { title: string; counts: Record<string, number> }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="text-sm font-black text-slate-950">{title}</p>
      <div className="mt-2 grid gap-1 text-sm font-semibold text-slate-700">
        {Object.entries(counts).map(([key, value]) => (
          <div key={key} className="flex justify-between gap-3">
            <span>{key.replaceAll("_", " ")}</span>
            <span>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminAlertBadge({ label, tone }: { label: string; tone: "amber" | "blue" | "rose" }) {
  const classes = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
  } satisfies Record<typeof tone, string>;

  return <span className={`rounded-full border px-2 py-1 text-xs font-black uppercase ${classes[tone]}`}>{label}</span>;
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
  optionLabels = {},
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  optionLabels?: Record<string, string>;
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
            {optionLabels[option] || option}
          </option>
        ))}
      </select>
    </label>
  );
}
