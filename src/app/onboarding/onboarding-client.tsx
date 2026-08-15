"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatDate } from "@/lib/format";
import type { MasterMedicine, OnboardingProgress, OnboardingStepId, Pharmacy, PharmacySettings, PharmacyUser, PharmacyUserRole } from "@/lib/types";

type Notice = { type: "success" | "error"; message: string };
type ProfileForm = Pick<Pharmacy, "pharmacy_name" | "owner_name" | "phone"> &
  Pick<PharmacySettings, "address" | "region" | "district" | "email">;
type BusinessForm = Pick<
  PharmacySettings,
  "currency" | "timezone" | "expiry_warning_days" | "allow_price_override" | "vat_percentage"
>;
type StaffForm = {
  full_name: string;
  username: string;
  password: string;
  role: PharmacyUserRole;
};
type CatalogSelection = { default_unit_price: string; default_pack_price: string; reorder_level: string };

const roleOptions: PharmacyUserRole[] = ["IN_CHARGE", "PHARMACIST", "TECHNICIAN", "OWNER"];

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
    expiry_warning_days: initialSettings.expiry_warning_days,
    allow_price_override: initialSettings.allow_price_override,
    vat_percentage: initialSettings.vat_percentage,
  });
  const [staffForm, setStaffForm] = useState<StaffForm>({ full_name: "", username: "", password: "", role: "PHARMACIST" });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [catalog, setCatalog] = useState<MasterMedicine[]>([]);
  const [catalogImportedIds, setCatalogImportedIds] = useState<string[]>([]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("ALL");
  const [catalogSelections, setCatalogSelections] = useState<Record<string, CatalogSelection>>({});

  const currentStep = useMemo(() => {
    if (!isReviewed(progress, "profile")) return "profile";
    if (!isReviewed(progress, "business_rules")) return "business_rules";
    if (progress.product_count <= 0) return "products";
    if (progress.inventory_batch_count <= 0) return "opening_stock";
    return progress.completed ? "done" : "subscription";
  }, [progress]);

  const filteredCatalog = useMemo(() => {
    const terms = catalogSearch.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return catalog.filter((medicine) => {
      if (catalogCategory !== "ALL" && medicine.category !== catalogCategory) return false;
      if (!terms.length) return true;
      const haystack = `${medicine.product_name} ${medicine.generic_name} ${medicine.strength} ${medicine.dosage_form}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [catalog, catalogCategory, catalogSearch]);

  const catalogCategories = useMemo(
    () => [...new Set(catalog.map((medicine) => medicine.category || "Other"))].sort(),
    [catalog],
  );

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

  async function openCatalog() {
    setCatalogOpen(true);
    if (catalogLoaded) return;
    setIsSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/onboarding/catalog");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load medicine catalogue.");
      setCatalog(result.medicines as MasterMedicine[]);
      setCatalogImportedIds(result.imported_ids as string[]);
      setCatalogLoaded(true);
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to load medicine catalogue." });
    } finally {
      setIsSaving(false);
    }
  }

  function toggleCatalogMedicine(medicine: MasterMedicine) {
    setCatalogSelections((current) => {
      if (current[medicine.id]) {
        const next = { ...current };
        delete next[medicine.id];
        return next;
      }
      return { ...current, [medicine.id]: { default_unit_price: "", default_pack_price: "", reorder_level: "0" } };
    });
  }

  function updateCatalogSelection(id: string, field: keyof CatalogSelection, value: string) {
    setCatalogSelections((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
  }

  async function importCatalogMedicines() {
    setIsSaving(true);
    setNotice(null);
    try {
      const selections = Object.entries(catalogSelections).map(([master_medicine_id, values]) => ({ master_medicine_id, ...values }));
      const response = await fetch("/api/onboarding/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selections }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to add catalogue medicines.");
      setProgress(result.progress as OnboardingProgress);
      setCatalogImportedIds((current) => [...new Set([...current, ...Object.keys(catalogSelections)])]);
      setCatalogSelections({});
      setNotice({ type: "success", message: `Added ${result.imported} medicine${result.imported === 1 ? "" : "s"}. Next, receive their stock batches.` });
      router.refresh();
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to add catalogue medicines." });
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
          detail="Set expiry warnings, price override behavior, VAT, currency, and timezone."
          status={stepStatus("business_rules", isReviewed(progress, "business_rules"))}
        >
          <form className="grid gap-3 md:grid-cols-2" onSubmit={saveBusinessRules}>
            <Input label="Currency" value={businessForm.currency} onChange={(value) => setBusinessForm({ ...businessForm, currency: value })} />
            <Input label="Timezone" value={businessForm.timezone} onChange={(value) => setBusinessForm({ ...businessForm, timezone: value })} />
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
                OWNER controls the business and finances. IN_CHARGE manages daily sales, stock, pricing, and ordinary staff access. PHARMACIST and TECHNICIAN can sell and handle stock without financial control.
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

        <StepShell title="4. Products" detail="Choose common medicines from PharmaStock, import CSV, or add products manually." status={stepStatus("products", progress.product_count > 0)}>
          <div className="grid gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-bold text-slate-700">Product count: {progress.product_count}</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button className="rounded-md bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300" disabled={isSaving} type="button" onClick={() => void (catalogOpen ? setCatalogOpen(false) : openCatalog())}>
                  {catalogOpen ? "Close Medicine Catalogue" : "Choose from Medicine Catalogue"}
                </button>
                <Link className="rounded-md border border-emerald-300 bg-white px-4 py-3 text-center text-sm font-bold text-emerald-800" href="/">Manual / CSV</Link>
              </div>
            </div>
            {catalogOpen ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950">
                  This is a shared library, not this pharmacy&apos;s inventory. Only checked medicines are added to the pharmacy. Enter selling prices now; buying cost, quantity, batch number, and expiry are recorded under Opening Stock.
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_16rem]">
                  <input className="w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-emerald-600" value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Search medicine, generic name, strength, or dosage form" />
                  <select className="w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-emerald-600" value={catalogCategory} onChange={(event) => setCatalogCategory(event.target.value)}>
                    <option value="ALL">All categories</option>
                    {catalogCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </div>
                <p className="mt-2 text-sm font-bold text-slate-700">{filteredCatalog.length} medicines · {Object.keys(catalogSelections).length} selected</p>
                <div className="mt-3 grid max-h-[34rem] gap-2 overflow-y-auto pr-1">
                  {filteredCatalog.map((medicine) => {
                    const imported = catalogImportedIds.includes(medicine.id);
                    const selected = catalogSelections[medicine.id];
                    return (
                      <div key={medicine.id} className={`rounded-md border p-3 ${imported ? "border-slate-200 bg-slate-100" : selected ? "border-emerald-400 bg-white" : "border-emerald-100 bg-white"}`}>
                        <div className="flex items-start gap-3">
                          <input className="mt-1 h-5 w-5 accent-emerald-700" checked={Boolean(selected)} disabled={imported} onChange={() => toggleCatalogMedicine(medicine)} type="checkbox" />
                          <div className="min-w-0 flex-1">
                            <p className="font-bold">{medicine.product_name}</p>
                            <p className="text-sm font-semibold text-slate-600">{medicine.generic_name} · {medicine.dosage_form} · {medicine.units_per_pack} {medicine.base_unit}{medicine.units_per_pack === 1 ? "" : "s"}/{medicine.pack_type}</p>
                            {imported ? <p className="mt-1 text-xs font-black uppercase text-slate-500">Already added</p> : null}
                          </div>
                        </div>
                        {selected ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            {medicine.default_selling_mode !== "PACK" ? <Input label={`Price per ${medicine.base_unit}`} value={selected.default_unit_price} onChange={(value) => updateCatalogSelection(medicine.id, "default_unit_price", value)} type="number" /> : null}
                            {medicine.default_selling_mode !== "UNIT" ? <Input label={`Price per ${medicine.pack_type}`} value={selected.default_pack_price} onChange={(value) => updateCatalogSelection(medicine.id, "default_pack_price", value)} type="number" /> : null}
                            <Input label={`Low-stock level (${medicine.base_unit}s)`} value={selected.reorder_level} onChange={(value) => updateCatalogSelection(medicine.id, "reorder_level", value)} type="number" />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {catalogLoaded && !filteredCatalog.length ? <p className="rounded-md bg-white p-3 text-sm font-semibold text-slate-600">No matching medicine. Add it manually or use CSV.</p> : null}
                </div>
                <button className="mt-3 rounded-md bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300" disabled={isSaving || Object.keys(catalogSelections).length === 0} type="button" onClick={importCatalogMedicines}>
                  Add {Object.keys(catalogSelections).length || "Selected"} Medicine{Object.keys(catalogSelections).length === 1 ? "" : "s"}
                </button>
              </div>
            ) : null}
          </div>
        </StepShell>

        <StepShell title="5. Opening stock" detail="Receive at least one batch so stock availability, expiry tracking, and valuation can begin." status={stepStatus("opening_stock", progress.inventory_batch_count > 0)}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold text-slate-700">Inventory batch count: {progress.inventory_batch_count}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link className="rounded-md bg-emerald-700 px-4 py-3 text-center text-sm font-bold text-white" href="/">Open Add Stock / CSV</Link>
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
