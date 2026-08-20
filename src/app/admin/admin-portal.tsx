"use client";

import { useMemo, useState } from "react";
import { BrandLogo } from "@/app/brand-logo";
import { formatTZS } from "@/lib/format";
import type { EntitlementMode, Pharmacy, PharmacyBillingCycle, PharmacyPlan, PharmacyStatus } from "@/lib/types";

type PharmacyForm = {
  id: string;
  pharmacy_name: string;
  owner_name: string;
  phone: string;
  pharmacy_code: string;
  password: string;
};

type SubscriptionForm = {
  pharmacy_id: string;
  preset: SubscriptionPreset;
  start_date: string;
  show_advanced: boolean;
  plan: PharmacyPlan;
  status: PharmacyStatus;
  billing_cycle: "" | PharmacyBillingCycle;
  agreed_price_tzs: string;
  trial_ends_at: string;
  subscription_started_at: string;
  subscription_ends_at: string;
  pilot_started_at: string;
  pilot_ends_at: string;
  founding_price_ends_at: string;
  grace_period_ends_at: string;
  access_extension_ends_at: string;
  entitlement_mode: EntitlementMode;
  change_reason: string;
};

type SubscriptionPreset = "PILOT_30" | "STARTER_MONTHLY" | "STARTER_ANNUAL" | "BUSINESS_MONTHLY" | "BUSINESS_ANNUAL" | "CUSTOM";

const emptyForm: PharmacyForm = {
  id: "",
  pharmacy_name: "",
  owner_name: "",
  phone: "",
  pharmacy_code: "",
  password: "",
};

const emptySubscriptionForm: SubscriptionForm = {
  pharmacy_id: "",
  preset: "PILOT_30",
  start_date: "",
  show_advanced: false,
  plan: "TRIAL",
  status: "TRIAL",
  billing_cycle: "",
  agreed_price_tzs: "",
  trial_ends_at: "",
  subscription_started_at: "",
  subscription_ends_at: "",
  pilot_started_at: "",
  pilot_ends_at: "",
  founding_price_ends_at: "",
  grace_period_ends_at: "",
  access_extension_ends_at: "",
  entitlement_mode: "OBSERVE",
  change_reason: "",
};

const planOptions: PharmacyPlan[] = ["TRIAL", "STARTER", "BUSINESS", "MULTI_BRANCH", "ENTERPRISE"];
const statusOptions: PharmacyStatus[] = ["ACTIVE", "TRIAL", "EXPIRED", "SUSPENDED"];
const presetOptions: SubscriptionPreset[] = ["PILOT_30", "STARTER_MONTHLY", "STARTER_ANNUAL", "BUSINESS_MONTHLY", "BUSINESS_ANNUAL", "CUSTOM"];
const presetLabels: Record<SubscriptionPreset, string> = {
  PILOT_30: "30-day Business Pilot",
  STARTER_MONTHLY: "Starter Monthly — TSh 20,000",
  STARTER_ANNUAL: "Starter Annual — TSh 200,000",
  BUSINESS_MONTHLY: "Business Monthly — TSh 45,000",
  BUSINESS_ANNUAL: "Business Annual — TSh 450,000",
  CUSTOM: "Custom arrangement",
};

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function inferPreset(pharmacy: Pharmacy): SubscriptionPreset {
  if (pharmacy.status === "TRIAL" || pharmacy.plan === "TRIAL") return "PILOT_30";
  if (pharmacy.plan === "STARTER" && pharmacy.billing_cycle === "MONTHLY") return "STARTER_MONTHLY";
  if (pharmacy.plan === "STARTER" && pharmacy.billing_cycle === "ANNUAL") return "STARTER_ANNUAL";
  if (pharmacy.plan === "BUSINESS" && pharmacy.billing_cycle === "MONTHLY") return "BUSINESS_MONTHLY";
  if (pharmacy.plan === "BUSINESS" && pharmacy.billing_cycle === "ANNUAL") return "BUSINESS_ANNUAL";
  return "CUSTOM";
}

function presetPrice(preset: SubscriptionPreset) {
  return ({ PILOT_30: "0", STARTER_MONTHLY: "20000", STARTER_ANNUAL: "200000", BUSINESS_MONTHLY: "45000", BUSINESS_ANNUAL: "450000", CUSTOM: "" })[preset];
}

type AdminApiResponse = {
  admin?: { username: string; fullName: string | null; role: string };
  error?: string | { message?: string };
  message?: string;
  pharmacy?: Pharmacy;
  pharmacies?: Pharmacy[];
  users?: AdminPharmacyUser[];
  subscription_history?: SubscriptionHistory[];
};

type SubscriptionHistory = {
  id: string;
  changed_by_admin: string;
  change_reason: string;
  previous_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  created_at: string;
};

type AdminPharmacyUser = {
  id: string;
  pharmacy_id: string;
  full_name: string;
  username: string;
  role: string;
  active: boolean;
  last_login_at: string | null;
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
  const [subscriptionForm, setSubscriptionForm] = useState<SubscriptionForm>(emptySubscriptionForm);
  const [subscriptionHistory, setSubscriptionHistory] = useState<SubscriptionHistory[]>([]);
  const [resetPassword, setResetPassword] = useState("");
  const [resetPharmacyId, setResetPharmacyId] = useState("");
  const [staffPanelPharmacyId, setStaffPanelPharmacyId] = useState("");
  const [pharmacyUsers, setPharmacyUsers] = useState<AdminPharmacyUser[]>([]);
  const [resetStaffUserId, setResetStaffUserId] = useState("");
  const [resetStaffPassword, setResetStaffPassword] = useState("");
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
    });
  }

  function editSubscription(pharmacy: Pharmacy) {
    setSubscriptionForm({
      pharmacy_id: pharmacy.id,
      preset: inferPreset(pharmacy),
      start_date: toDateInput(pharmacy.pilot_started_at || pharmacy.subscription_started_at) || todayInput(),
      show_advanced: false,
      plan: pharmacy.plan,
      status: pharmacy.status,
      billing_cycle: pharmacy.billing_cycle || "",
      agreed_price_tzs: pharmacy.agreed_price_tzs == null ? "" : String(pharmacy.agreed_price_tzs),
      trial_ends_at: toDateInput(pharmacy.trial_ends_at),
      subscription_started_at: toDateInput(pharmacy.subscription_started_at),
      subscription_ends_at: toDateInput(pharmacy.subscription_ends_at),
      pilot_started_at: toDateInput(pharmacy.pilot_started_at),
      pilot_ends_at: toDateInput(pharmacy.pilot_ends_at),
      founding_price_ends_at: toDateInput(pharmacy.founding_price_ends_at),
      grace_period_ends_at: toDateInput(pharmacy.grace_period_ends_at),
      access_extension_ends_at: toDateInput(pharmacy.access_extension_ends_at),
      entitlement_mode: pharmacy.entitlement_mode,
      change_reason: "",
    });
    void loadSubscriptionHistory(pharmacy.id);
    window.setTimeout(() => document.getElementById("subscription-management")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function loadSubscriptionHistory(pharmacyId: string) {
    try {
      const response = await fetch(`/api/admin/pharmacies?history=${encodeURIComponent(pharmacyId)}`, { credentials: "include" });
      const result = (await response.json()) as AdminApiResponse;
      if (!response.ok) throw new Error(getAdminResponseMessage(result, "Unable to load subscription history."));
      setSubscriptionHistory(result.subscription_history || []);
    } catch (error) {
      setSubscriptionHistory([]);
      setMessage(error instanceof Error ? error.message : "Unable to load subscription history.");
    }
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

  async function submitSubscription(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/pharmacies", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: subscriptionForm.pharmacy_id, action: "subscription", ...subscriptionForm }),
      });
      const result = (await response.json()) as AdminApiResponse;
      if (!response.ok) throw new Error(getAdminResponseMessage(result, "Unable to update subscription."));
      if (result.pharmacy) {
        setPharmacies((current) => current.map((pharmacy) => pharmacy.id === result.pharmacy?.id ? result.pharmacy : pharmacy));
        editSubscription(result.pharmacy);
      }
      setMessage(result.message || "Subscription updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update subscription.");
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
      setMessage(result.message || "Owner password reset.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to reset password.");
    } finally {
      setIsLoading(false);
    }
  }

  async function toggleStaffPanel(pharmacyId: string) {
    if (staffPanelPharmacyId === pharmacyId) {
      setStaffPanelPharmacyId("");
      setPharmacyUsers([]);
      setResetStaffUserId("");
      setResetStaffPassword("");
      return;
    }
    setMessage("");
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/pharmacy-users?pharmacy_id=${encodeURIComponent(pharmacyId)}`, { credentials: "include" });
      const result = (await response.json()) as AdminApiResponse;
      if (!response.ok) throw new Error(getAdminResponseMessage(result, "Unable to load pharmacy users."));
      setStaffPanelPharmacyId(pharmacyId);
      setPharmacyUsers(result.users || []);
      setResetStaffUserId("");
      setResetStaffPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load pharmacy users.");
    } finally {
      setIsLoading(false);
    }
  }

  async function submitStaffPasswordReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/pharmacy-users", {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: resetStaffUserId, password: resetStaffPassword }),
      });
      const result = (await response.json()) as AdminApiResponse & { user?: AdminPharmacyUser };
      if (!response.ok) throw new Error(getAdminResponseMessage(result, "Unable to reset staff password."));
      setResetStaffUserId("");
      setResetStaffPassword("");
      setMessage(`Password reset for ${result.user?.full_name || "staff member"}. Existing sessions were signed out.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to reset staff password.");
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
          <BrandLogo compact />
          <p className="mt-3 text-xs font-bold uppercase tracking-wide text-blue-700">Administration</p>
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
      <header className="brand-app-header border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <BrandLogo compact />
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-blue-700">Administration</p>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="mt-1 text-sm font-semibold text-slate-600">
              Logged in as {admin?.fullName || admin?.username || "Admin"}
            </p>
          </div>
          <div className="flex gap-2">
            <a className="rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800" href="/admin/feedback">Pilot Feedback</a>
            <button className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800" type="button" onClick={logout}>Log out</button>
          </div>
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

        <section id="subscription-management" className="scroll-mt-4 rounded-lg border border-blue-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-bold">Subscription Management</h2>
            <p className="text-sm font-semibold text-slate-600">
              Observation mode calculates plan access and usage but does not block pharmacy features. Every saved change requires a reason and creates subscription history.
            </p>
          </div>
          <Select
            label="Pharmacy"
            value={subscriptionForm.pharmacy_id}
            options={["", ...pharmacies.map((pharmacy) => pharmacy.id)]}
            onChange={(value) => {
              const pharmacy = pharmacies.find((item) => item.id === value);
              if (pharmacy) editSubscription(pharmacy);
              else setSubscriptionForm(emptySubscriptionForm);
            }}
            optionLabels={{ "": "Choose pharmacy", ...Object.fromEntries(pharmacies.map((pharmacy) => [pharmacy.id, pharmacy.pharmacy_name])) }}
          />
          {subscriptionForm.pharmacy_id ? (
            <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={submitSubscription}>
              <div className="sm:col-span-2">
                <Select
                  label="Subscription type"
                  value={subscriptionForm.preset}
                  options={presetOptions}
                  onChange={(value) => {
                    const preset = value as SubscriptionPreset;
                    setSubscriptionForm({ ...subscriptionForm, preset, agreed_price_tzs: presetPrice(preset), show_advanced: preset === "CUSTOM" });
                  }}
                  optionLabels={presetLabels}
                />
              </div>
              <Input label="Start date" value={subscriptionForm.start_date} onChange={(value) => setSubscriptionForm({ ...subscriptionForm, start_date: value })} type="date" />
              <Input label="Agreed price (TZS)" value={subscriptionForm.agreed_price_tzs} onChange={(value) => setSubscriptionForm({ ...subscriptionForm, agreed_price_tzs: value })} type="number" />
              <div className="lg:col-span-4">
                <Input label="Required change reason" value={subscriptionForm.change_reason} onChange={(value) => setSubscriptionForm({ ...subscriptionForm, change_reason: value })} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-3 text-sm lg:col-span-4">
                <p className="font-bold text-blue-900">Observation mode · No pharmacy features will be blocked.</p>
                <button className="rounded-md border border-blue-300 bg-white px-3 py-2 text-sm font-bold text-blue-800" type="button" onClick={() => setSubscriptionForm({ ...subscriptionForm, show_advanced: !subscriptionForm.show_advanced })}>
                  {subscriptionForm.show_advanced ? "Hide advanced options" : "Advanced options"}
                </button>
              </div>
              {subscriptionForm.show_advanced ? (
                <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-4">
                  {subscriptionForm.preset === "CUSTOM" ? (
                    <>
                      <Select label="Plan" value={subscriptionForm.plan} options={planOptions} onChange={(value) => setSubscriptionForm({ ...subscriptionForm, plan: value as PharmacyPlan })} />
                      <Select label="Status" value={subscriptionForm.status} options={statusOptions} onChange={(value) => setSubscriptionForm({ ...subscriptionForm, status: value as PharmacyStatus })} />
                      <Select label="Billing cycle" value={subscriptionForm.billing_cycle} options={["", "MONTHLY", "ANNUAL", "CUSTOM"]} onChange={(value) => setSubscriptionForm({ ...subscriptionForm, billing_cycle: value as SubscriptionForm["billing_cycle"] })} optionLabels={{ "": "Not set" }} />
                      <Input label="Trial ends" value={subscriptionForm.trial_ends_at} onChange={(value) => setSubscriptionForm({ ...subscriptionForm, trial_ends_at: value })} type="date" />
                      <Input label="Subscription ends" value={subscriptionForm.subscription_ends_at} onChange={(value) => setSubscriptionForm({ ...subscriptionForm, subscription_ends_at: value })} type="date" />
                      <Input label="Pilot ends" value={subscriptionForm.pilot_ends_at} onChange={(value) => setSubscriptionForm({ ...subscriptionForm, pilot_ends_at: value })} type="date" />
                    </>
                  ) : null}
                  <Input label="Founding price ends" value={subscriptionForm.founding_price_ends_at} onChange={(value) => setSubscriptionForm({ ...subscriptionForm, founding_price_ends_at: value })} type="date" />
                  {subscriptionForm.preset === "CUSTOM" ? <Input label="Grace period ends" value={subscriptionForm.grace_period_ends_at} onChange={(value) => setSubscriptionForm({ ...subscriptionForm, grace_period_ends_at: value })} type="date" /> : null}
                  <Input label="Temporary extension ends" value={subscriptionForm.access_extension_ends_at} onChange={(value) => setSubscriptionForm({ ...subscriptionForm, access_extension_ends_at: value })} type="date" />
                </div>
              ) : null}
              {pharmacies.find((pharmacy) => pharmacy.id === subscriptionForm.pharmacy_id)?.entitlement_observation ? (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm lg:col-span-4">
                  {(() => {
                    const observation = pharmacies.find((pharmacy) => pharmacy.id === subscriptionForm.pharmacy_id)?.entitlement_observation;
                    if (!observation) return null;
                    return (
                      <>
                        <p className="font-black text-blue-950">Observation: {observation.plan} · {observation.mode}</p>
                        <p className="mt-1 text-blue-900">Active staff: {observation.usage.staff_accounts}{observation.limits.staff_accounts === null ? "" : ` / ${observation.limits.staff_accounts}`} · Products: {observation.usage.products}{observation.limits.products === null ? "" : ` / ${observation.limits.products}`}</p>
                        <p className="mt-1 font-semibold text-blue-900">{observation.would_block.length ? `Would flag: ${observation.would_block.join(", ")}` : "No usage-limit conflicts detected."}</p>
                      </>
                    );
                  })()}
                </div>
              ) : null}
              <div className="flex gap-2 lg:col-span-4">
                <button className="rounded-md bg-blue-700 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300" disabled={isLoading || !subscriptionForm.change_reason.trim()} type="submit">Save Subscription</button>
                <button className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-bold" type="button" onClick={() => setSubscriptionForm(emptySubscriptionForm)}>Cancel</button>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 lg:col-span-4">
                <h3 className="font-black">Recent subscription history</h3>
                <div className="mt-2 grid gap-2">
                  {subscriptionHistory.length ? subscriptionHistory.map((entry) => (
                    <div key={entry.id} className="rounded-md border border-slate-200 bg-white p-2 text-sm">
                      <p className="font-bold">{entry.change_reason}</p>
                      <p className="text-slate-600">{entry.changed_by_admin} · {new Date(entry.created_at).toLocaleString()}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-600">
                        {String(entry.previous_values.plan || "-")} → {String(entry.new_values.plan || "-")} · {String(entry.previous_values.status || "-")} → {String(entry.new_values.status || "-")}
                      </p>
                    </div>
                  )) : <p className="text-sm text-slate-500">No subscription changes recorded yet.</p>}
                </div>
              </div>
            </form>
          ) : null}
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
                      <p className="mt-1 text-xs font-bold text-blue-700">
                        Entitlements: {pharmacy.entitlement_mode}
                        {pharmacy.billing_cycle ? ` · ${pharmacy.billing_cycle}` : ""}
                        {pharmacy.agreed_price_tzs == null ? "" : ` · ${formatTZS(pharmacy.agreed_price_tzs)}`}
                      </p>
                      {pharmacy.entitlement_observation?.would_block.length ? (
                        <p className="mt-1 text-xs font-bold text-amber-700">Observation flags: {pharmacy.entitlement_observation.would_block.join(", ")}</p>
                      ) : null}
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
                      <button className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800" type="button" onClick={() => editSubscription(pharmacy)}>
                        Subscription
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
                        Reset owner password
                      </button>
                      <button className="rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-bold text-violet-800" type="button" onClick={() => toggleStaffPanel(pharmacy.id)}>
                        {staffPanelPharmacyId === pharmacy.id ? "Close staff access" : "Staff access"}
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
                        placeholder="New owner password (8+ characters)"
                      />
                      <button className="rounded-md bg-blue-700 px-3 py-2 text-sm font-bold text-white" type="submit">
                        Save password
                      </button>
                    </form>
                  ) : null}
                  {staffPanelPharmacyId === pharmacy.id ? (
                    <div className="mt-3 rounded-md border border-violet-200 bg-violet-50 p-3">
                      <h4 className="font-black text-violet-950">Pharmacy user access</h4>
                      <p className="mt-1 text-sm text-violet-800">Reset employee access only after verifying the support request. Password values are never displayed or logged.</p>
                      <div className="mt-3 grid gap-2">
                        {pharmacyUsers.map((user) => (
                          <div key={user.id} className="rounded-md border border-violet-200 bg-white p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="font-bold">{user.full_name}</p>
                                <p className="text-sm text-slate-600">{user.username} · {user.role} · {user.active ? "Active" : "Inactive"}</p>
                              </div>
                              {user.role === "OWNER" ? (
                                <span className="text-xs font-bold text-slate-500">Use Reset owner password</span>
                              ) : (
                                <button type="button" onClick={() => { setResetStaffUserId(user.id); setResetStaffPassword(""); }} className="rounded-md border border-violet-300 px-3 py-2 text-sm font-bold text-violet-800">
                                  Reset password
                                </button>
                              )}
                            </div>
                            {resetStaffUserId === user.id ? (
                              <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={submitStaffPasswordReset}>
                                <input type="password" minLength={8} maxLength={128} required value={resetStaffPassword} onChange={(event) => setResetStaffPassword(event.target.value)} placeholder="Temporary password (8+ characters)" className="rounded-md border border-violet-300 px-3 py-2" />
                                <button disabled={isLoading || resetStaffPassword.length < 8} className="rounded-md bg-violet-700 px-3 py-2 text-sm font-bold text-white disabled:bg-slate-300" type="submit">Save and sign out user</button>
                                <button type="button" onClick={() => { setResetStaffUserId(""); setResetStaffPassword(""); }} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold">Cancel</button>
                              </form>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
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
