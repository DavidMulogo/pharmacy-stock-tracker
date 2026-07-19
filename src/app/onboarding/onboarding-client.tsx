"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatDate } from "@/lib/format";
import type { OnboardingProgress, OnboardingStepId, Pharmacy, PharmacySettings, PharmacyUser, PharmacyUserRole } from "@/lib/types";

type Notice = { type: "success" | "error"; message: string };
type ProfileForm = Pick<Pharmacy, "pharmacy_name" | "owner_name" | "phone"> &
  Pick<PharmacySettings, "address" | "region" | "district" | "email">;
type BusinessForm = Pick<
  PharmacySettings,
  "currency" | "timezone" | "low_stock_threshold" | "expiry_warning_days" | "allow_price_override" | "vat_percentage"
>;
type StaffForm = {
  full_name: string;
  username: string;
  password: string;
  role: PharmacyUserRole;
};

const roleOptions: PharmacyUserRole[] = ["PHARMACIST", "TECHNICIAN", "OWNER"];

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-800">
      {label}
      <input
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-emerald-600"
        min={type === "number" ? 0 : undefined}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-800">
      {label}
      <input className="h-5 w-5 accent-emerald-700" checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
    </label>
  );
}

function StepShell({
  title,
  detail,
  status,
  children,
}: {
  title: string;
  detail: string;
  status: "completed" | "current" | "pending";
  children: React.ReactNode;
}) {
  const badge =
    status === "completed"
      ? "border-emerald-200 bg-emerald-100 text-emerald-800"
      : status === "current"
        ? "border-blue-200 bg-blue-100 text-blue-800"
        : "border-slate-200 bg-slate-100 text-slate-700";

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">{detail}</p>
        </div>
        <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-black uppercase ${badge}`}>{status}</span>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function isReviewed(progress: OnboardingProgress, step: OnboardingStepId) {
  const key = `${step}_reviewed_at` as keyof OnboardingProgress["onboarding"];
  return Boolean(progress.onboarding[key]);
}

function requirementText(requirement: string) {
  if (requirement === "pharmacy profile") return "Review the pharmacy profile.";
  if (requirement === "business rules") return "Review business rules.";
  if (requirement === "one product") return "Add at least one product.";
  if (requirement === "one stock batch") return "Add at least one opening stock batch.";
  return requirement;
}

export function OnboardingClient({
  initialPharmacy,
  initialSettings,
  initialProgress,
  initialStaff,
}: {
  initialPharmacy: Pharmacy;
  initialSettings: PharmacySettings;
  initialProgress: OnboardingProgress;
  initialStaff: PharmacyUser[];
}) {
  const router = useRouter();
  const [pharmacy, setPharmacy] = useState(initialPharmacy);
  const [settings, setSettings] = useState(initialSettings);
  const [progress, setProgress] = useState(initialProgress);
  const [staff, setStaff] = useState(initialStaff);
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    pharmacy_name: initialPharmacy.pharmacy_name,
    owner_name: initialPharmacy.owner_name,
    phone: initialPharmacy.phone,
    address: initialSettings.address,
    region: initialSettings.region,
    district: initialSettings.district,
    email: initialSettings.email,
  });
  const [businessForm, setBusinessForm] = useState<BusinessForm>({
    currency: initialSettings.currency,
    timezone: initialSettings.timezone,
    low_stock_threshold: initialSettings.low_stock_threshold,
    expiry_warning_days: initialSettings.expiry_warning_days,
    allow_price_override: initialSettings.allow_price_override,
    vat_percentage: initialSettings.vat_percentage,
  });
  const [staffForm, setStaffForm] = useState<StaffForm>({ full_name: "", username: "", password: "", role: "PHARMACIST" });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const currentStep = useMemo(() => {
    if (!isReviewed(progress, "profile")) return "profile";
    if (!isReviewed(progress, "business_rules")) return "business_rules";
    if (progress.product_count <= 0) return "products";
    if (progress.inventory_batch_count <= 0) return "opening_stock";
    return progress.completed ? "done" : "subscription";
  }, [progress]);

  function stepStatus(step: OnboardingStepId, complete: boolean) {
    if (complete) return "completed";
    return currentStep === step ? "current" : "pending";
  }

  async function parseOnboardingResponse(response: Response, fallback: string) {
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || fallback);
    if (result.progress) setProgress(result.progress as OnboardingProgress);
    return result;
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "profile", ...profileForm }),
      });
      const result = await parseOnboardingResponse(response, "Unable to save profile.");
      setPharmacy(result.pharmacy as Pharmacy);
      setSettings({ ...settings, ...(result.settings as PharmacySettings) });
      setNotice({ type: "success", message: "Profile reviewed and saved." });
      router.refresh();
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to save profile." });
    } finally {
      setIsSaving(false);
    }
  }

  async function saveBusinessRules(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "business_rules", ...businessForm }),
      });
      const result = await parseOnboardingResponse(response, "Unable to save business rules.");
      setSettings({ ...settings, ...(result.settings as PharmacySettings) });
      setNotice({ type: "success", message: "Business rules reviewed and saved." });
      router.refresh();
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to save business rules." });
    } finally {
      setIsSaving(false);
    }
  }

  async function reviewStep(step: OnboardingStepId) {
    setNotice(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "review", step }),
      });
      await parseOnboardingResponse(response, "Unable to mark step reviewed.");
      setNotice({ type: "success", message: "Step reviewed." });
      router.refresh();
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to mark step reviewed." });
    } finally {
      setIsSaving(false);
    }
  }

  async function createStaff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(staffForm),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to create staff.");
      setStaff((current) => [...current, result.user as PharmacyUser]);
      setStaffForm({ full_name: "", username: "", password: "", role: "PHARMACIST" });
      await reviewStep("staff");
      setNotice({ type: "success", message: "Staff account created." });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to create staff." });
    } finally {
      setIsSaving(false);
    }
  }

  async function completeSetup() {
    setNotice(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      const result = await parseOnboardingResponse(response, "Unable to complete onboarding.");
      setNotice({ type: "success", message: result.message || "Onboarding completed." });
      router.refresh();
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to complete onboarding." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-700">PharmaStock Onboarding</p>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Set up {pharmacy.pharmacy_name}</h1>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                Finish the few essentials needed before daily selling, stock checks, and reporting feel smooth.
              </p>
            </div>
            <Link className="rounded-md border border-slate-300 bg-white px-4 py-3 text-center text-sm font-bold text-slate-800" href="/">
              Back to POS
            </Link>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black text-emerald-950">{progress.percent}% setup complete</p>
                <p className="mt-1 text-sm font-semibold text-emerald-900">
                  {progress.completed ? `Completed ${progress.completed_at ? formatDate(progress.completed_at) : ""}` : `${progress.reviewed_required_steps} of ${progress.required_steps} required items ready`}
                </p>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-white sm:w-64">
                <div className="h-full bg-emerald-700" style={{ width: `${progress.percent}%` }} />
              </div>
            </div>
          </div>
          {notice ? (
            <p className={`rounded-md border px-3 py-2 text-sm font-bold ${notice.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
              {notice.message}
            </p>
          ) : null}
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:px-6">
        <StepShell
          title="1. Pharmacy profile"
          detail="Confirm the basic business details customers, receipts, and staff will recognize."
          status={stepStatus("profile", isReviewed(progress, "profile"))}
        >
          <form className="grid gap-3 md:grid-cols-2" onSubmit={saveProfile}>
            <Input label="Pharmacy name" value={profileForm.pharmacy_name} onChange={(value) => setProfileForm({ ...profileForm, pharmacy_name: value })} />
            <Input label="Owner name" value={profileForm.owner_name} onChange={(value) => setProfileForm({ ...profileForm, owner_name: value })} />
            <Input label="Phone" value={profileForm.phone} onChange={(value) => setProfileForm({ ...profileForm, phone: value })} />
            <Input label="Email" value={profileForm.email} onChange={(value) => setProfileForm({ ...profileForm, email: value })} type="email" />
            <Input label="Region" value={profileForm.region} onChange={(value) => setProfileForm({ ...profileForm, region: value })} />
            <Input label="District" value={profileForm.district} onChange={(value) => setProfileForm({ ...profileForm, district: value })} />
            <div className="md:col-span-2">
              <Input label="Address" value={profileForm.address} onChange={(value) => setProfileForm({ ...profileForm, address: value })} />
            </div>
            <button className="w-fit rounded-md bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300 md:col-span-2" disabled={isSaving} type="submit">
              Save and Review Profile
            </button>
          </form>
        </StepShell>

        <StepShell
          title="2. Business rules"
          detail="Set the default stock warnings, price override behavior, VAT, currency, and timezone."
          status={stepStatus("business_rules", isReviewed(progress, "business_rules"))}
        >
          <form className="grid gap-3 md:grid-cols-2" onSubmit={saveBusinessRules}>
            <Input label="Currency" value={businessForm.currency} onChange={(value) => setBusinessForm({ ...businessForm, currency: value })} />
            <Input label="Timezone" value={businessForm.timezone} onChange={(value) => setBusinessForm({ ...businessForm, timezone: value })} />
            <Input label="Low-stock threshold" value={businessForm.low_stock_threshold} onChange={(value) => setBusinessForm({ ...businessForm, low_stock_threshold: Number(value) })} type="number" />
            <Input label="Expiry-warning days" value={businessForm.expiry_warning_days} onChange={(value) => setBusinessForm({ ...businessForm, expiry_warning_days: Number(value) })} type="number" />
            <Input label="VAT percentage" value={businessForm.vat_percentage} onChange={(value) => setBusinessForm({ ...businessForm, vat_percentage: Number(value) })} type="number" />
            <Toggle label="Allow price override" checked={businessForm.allow_price_override} onChange={(value) => setBusinessForm({ ...businessForm, allow_price_override: value })} />
            <button className="w-fit rounded-md bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300 md:col-span-2" disabled={isSaving} type="submit">
              Save and Review Rules
            </button>
          </form>
        </StepShell>

        <StepShell title="3. Staff" detail="Add coworkers now or keep a solo OWNER setup and come back later." status={stepStatus("staff", isReviewed(progress, "staff"))}>
          <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
            <div className="grid gap-2">
              {staff.map((user) => (
                <div key={user.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="font-bold">{user.full_name}</p>
                  <p className="text-sm font-semibold text-slate-600">{user.username} / {user.role} / {user.active ? "Active" : "Inactive"}</p>
                </div>
              ))}
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900">
                OWNER manages the pharmacy and reports. PHARMACIST can sell, manage stock, and view financial operations. TECHNICIAN can sell and check stock without expense or profit access.
              </div>
              <button className="w-fit rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 disabled:bg-slate-100" disabled={isSaving} type="button" onClick={() => reviewStep("staff")}>
                Skip for Now
              </button>
            </div>
            <form className="grid gap-3" onSubmit={createStaff}>
              <Input label="Full name" value={staffForm.full_name} onChange={(value) => setStaffForm({ ...staffForm, full_name: value })} />
              <Input label="Username" value={staffForm.username} onChange={(value) => setStaffForm({ ...staffForm, username: value })} />
              <Input label="Temporary password" value={staffForm.password} onChange={(value) => setStaffForm({ ...staffForm, password: value })} type="password" />
              <label className="block text-sm font-semibold text-slate-800">
                Role
                <select className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-emerald-600" value={staffForm.role} onChange={(event) => setStaffForm({ ...staffForm, role: event.target.value as PharmacyUserRole })}>
                  {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
              </label>
              <button className="w-fit rounded-md bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300" disabled={isSaving} type="submit">
                Create Staff
              </button>
            </form>
          </div>
        </StepShell>

        <StepShell title="4. Products" detail="Add at least one product manually or import products from CSV before completion." status={stepStatus("products", progress.product_count > 0)}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold text-slate-700">Product count: {progress.product_count}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link className="rounded-md bg-emerald-700 px-4 py-3 text-center text-sm font-bold text-white" href="/">Open Products / CSV</Link>
              <button className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 disabled:bg-slate-100" disabled={isSaving} type="button" onClick={() => reviewStep("products")}>
                Mark Workflow Reviewed
              </button>
            </div>
          </div>
        </StepShell>

        <StepShell title="5. Opening stock" detail="Receive at least one batch so stock availability, expiry tracking, and valuation can begin." status={stepStatus("opening_stock", progress.inventory_batch_count > 0)}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold text-slate-700">Inventory batch count: {progress.inventory_batch_count}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link className="rounded-md bg-emerald-700 px-4 py-3 text-center text-sm font-bold text-white" href="/">Open Add Stock / CSV</Link>
              <button className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 disabled:bg-slate-100" disabled={isSaving} type="button" onClick={() => reviewStep("opening_stock")}>
                Mark Workflow Reviewed
              </button>
            </div>
          </div>
        </StepShell>

        <StepShell title="6. Subscription readiness" detail="Review the current SaaS access status. Only PharmaStock Admin can activate or change subscription dates." status={stepStatus("subscription", isReviewed(progress, "subscription") || progress.completed)}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Plan" value={pharmacy.plan} />
            <Info label="Status" value={pharmacy.status} />
            <Info label="Trial ends" value={pharmacy.trial_ends_at ? formatDate(pharmacy.trial_ends_at) : "Not set"} />
            <Info label="Subscription ends" value={pharmacy.subscription_ends_at ? formatDate(pharmacy.subscription_ends_at) : "Not set"} />
          </div>
          <button className="mt-4 rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 disabled:bg-slate-100" disabled={isSaving} type="button" onClick={() => reviewStep("subscription")}>
            Mark Subscription Reviewed
          </button>
        </StepShell>

        <section className="sticky bottom-0 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
          {progress.missing_requirements.length ? (
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
              {progress.missing_requirements.map((item) => <p key={item}>{requirementText(item)}</p>)}
            </div>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-slate-600">
              Staff and subscription review are helpful, but completion requires profile review, business rules review, one product, and one stock batch.
            </p>
            <button className="rounded-md bg-emerald-700 px-5 py-3 text-sm font-bold text-white disabled:bg-slate-300" disabled={isSaving || !progress.can_complete} type="button" onClick={completeSetup}>
              {progress.completed ? "Completed" : "Complete Setup"}
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs font-black uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}
