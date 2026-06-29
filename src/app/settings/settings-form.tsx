"use client";

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { PharmacySettings } from "@/lib/types";

type SettingsFormState = Omit<PharmacySettings, "id" | "pharmacy_id" | "created_at" | "updated_at">;

function toFormState(settings: PharmacySettings): SettingsFormState {
  return {
    registration_number: settings.registration_number,
    license_number: settings.license_number,
    address: settings.address,
    region: settings.region,
    district: settings.district,
    email: settings.email,
    logo_url: settings.logo_url,
    receipt_header: settings.receipt_header,
    receipt_footer: settings.receipt_footer,
    receipt_prefix: settings.receipt_prefix,
    low_stock_threshold: settings.low_stock_threshold,
    expiry_warning_days: settings.expiry_warning_days,
    allow_negative_stock: settings.allow_negative_stock,
    allow_duplicate_batches: settings.allow_duplicate_batches,
    allow_price_override: settings.allow_price_override,
    max_discount: settings.max_discount,
    vat_percentage: settings.vat_percentage,
    currency: settings.currency,
    timezone: settings.timezone,
  };
}

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

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-semibold text-slate-800">
      {label}
      <textarea
        className="mt-1 min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-emerald-600"
        onChange={(event) => onChange(event.target.value)}
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  );
}

export function SettingsForm({ initialSettings }: { initialSettings: PharmacySettings }) {
  const [form, setForm] = useState<SettingsFormState>(() => toFormState(initialSettings));
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [isSaving, setIsSaving] = useState(false);

  function update<K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to save settings.");
      }

      setForm(toFormState(result.settings as PharmacySettings));
      setMessageType("success");
      setMessage("Settings saved successfully.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Unable to save settings.";
      setMessageType("error");
      setMessage(text);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={saveSettings}>
      <Section title="Business Information">
        <Input label="Registration number" value={form.registration_number} onChange={(value) => update("registration_number", value)} />
        <Input label="License number" value={form.license_number} onChange={(value) => update("license_number", value)} />
        <Input label="Email" value={form.email} onChange={(value) => update("email", value)} type="email" />
        <Input label="Region" value={form.region} onChange={(value) => update("region", value)} />
        <Input label="District" value={form.district} onChange={(value) => update("district", value)} />
        <TextArea label="Address" value={form.address} onChange={(value) => update("address", value)} />
      </Section>

      <Section title="Branding">
        <Input label="Logo URL" value={form.logo_url} onChange={(value) => update("logo_url", value)} />
        <Input label="Receipt prefix" value={form.receipt_prefix} onChange={(value) => update("receipt_prefix", value)} />
        <Input label="Receipt header" value={form.receipt_header} onChange={(value) => update("receipt_header", value)} />
        <Input label="Receipt footer" value={form.receipt_footer} onChange={(value) => update("receipt_footer", value)} />
      </Section>

      <Section title="Inventory Settings">
        <Input
          label="Low stock threshold"
          value={form.low_stock_threshold}
          onChange={(value) => update("low_stock_threshold", Number(value))}
          type="number"
        />
        <Input
          label="Expiry warning days"
          value={form.expiry_warning_days}
          onChange={(value) => update("expiry_warning_days", Number(value))}
          type="number"
        />
        <Toggle label="Allow negative stock" checked={form.allow_negative_stock} onChange={(value) => update("allow_negative_stock", value)} />
        <Toggle label="Allow duplicate batches" checked={form.allow_duplicate_batches} onChange={(value) => update("allow_duplicate_batches", value)} />
      </Section>

      <Section title="Sales Settings">
        <Toggle label="Allow price override" checked={form.allow_price_override} onChange={(value) => update("allow_price_override", value)} />
        <Input label="Max discount (%)" value={form.max_discount} onChange={(value) => update("max_discount", Number(value))} type="number" />
        <Input label="VAT percentage" value={form.vat_percentage} onChange={(value) => update("vat_percentage", Number(value))} type="number" />
      </Section>

      <Section title="Localization">
        <Input label="Currency" value={form.currency} onChange={(value) => update("currency", value)} />
        <Input label="Timezone" value={form.timezone} onChange={(value) => update("timezone", value)} />
      </Section>

      <div className="sticky bottom-0 flex flex-col gap-3 border-t border-slate-200 bg-slate-50 py-4 sm:flex-row sm:items-center sm:justify-between">
        {message ? (
          <p className={`text-sm font-bold ${messageType === "success" ? "text-emerald-700" : "text-rose-700"}`}>{message}</p>
        ) : (
          <p className="text-sm font-semibold text-slate-600">Changes apply to the logged-in pharmacy only.</p>
        )}
        <button className="rounded-md bg-emerald-700 px-5 py-3 text-sm font-bold text-white disabled:bg-slate-300" disabled={isSaving} type="submit">
          {isSaving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </form>
  );
}
