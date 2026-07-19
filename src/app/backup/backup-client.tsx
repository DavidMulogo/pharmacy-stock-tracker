"use client";

import { useState } from "react";

type BackupValidationResult = {
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
  record_counts: Record<string, number>;
};

function responseMessage(data: { error?: unknown; message?: unknown }, fallback: string) {
  if (typeof data.error === "string") return data.error;
  if (data.error && typeof data.error === "object" && "message" in data.error && typeof data.error.message === "string") return data.error.message;
  if (typeof data.message === "string") return data.message;
  return fallback;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function filenameFromDisposition(disposition: string | null) {
  const match = disposition?.match(/filename="?([^"]+)"?/i);
  return match?.[1] || `pharmastock-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

export function BackupClient({ pharmacyName }: { pharmacyName: string }) {
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [isExporting, setIsExporting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validation, setValidation] = useState<BackupValidationResult | null>(null);

  async function exportBackup() {
    setIsExporting(true);
    setMessage("");
    setValidation(null);

    try {
      const response = await fetch("/api/backup/export", { method: "POST", credentials: "include" });

      if (!response.ok) {
        const data = await response.json();
        setMessageType("error");
        setMessage(responseMessage(data, "Unable to export backup."));
        return;
      }

      const blob = await response.blob();
      downloadBlob(blob, filenameFromDisposition(response.headers.get("Content-Disposition")));
      setMessageType("success");
      setMessage("Backup exported successfully.");
    } catch {
      setMessageType("error");
      setMessage("Unable to export backup. Check your connection and try again.");
    } finally {
      setIsExporting(false);
    }
  }

  async function validateBackup(file: File | null) {
    if (!file) return;

    setIsValidating(true);
    setMessage("");
    setValidation(null);

    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      const response = await fetch("/api/backup/validate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backup),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessageType("error");
        setMessage(responseMessage(data, "Unable to validate backup."));
        return;
      }

      setValidation(data.validation as BackupValidationResult);
      setMessageType(data.validation.valid ? "success" : "error");
      setMessage(data.validation.valid ? "Backup file is valid." : "Backup file is not valid.");
    } catch {
      setMessageType("error");
      setMessage("Upload a readable PharmaStock backup JSON file.");
    } finally {
      setIsValidating(false);
    }
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold">Export Backup</h2>
            <p className="mt-1 max-w-2xl text-sm font-semibold text-slate-600">
              Download a JSON backup for {pharmacyName}. Restore is not available yet.
            </p>
          </div>
          <button
            type="button"
            onClick={exportBackup}
            disabled={isExporting}
            className="rounded-md bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isExporting ? "Exporting..." : "Export JSON"}
          </button>
        </div>
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
          <p className="font-bold text-slate-950">Included</p>
          <p className="mt-1">Profile, settings, products, batches, sales, expenses, staff metadata, and activity logs.</p>
          <p className="mt-2 font-bold text-slate-950">Excluded</p>
          <p className="mt-1">Passwords, password hashes, session tokens, cookies, admin users, and admin credentials.</p>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">Validate Backup</h2>
        <p className="mt-1 text-sm font-semibold text-slate-600">Check a PharmaStock backup JSON file without restoring anything.</p>
        <label className="mt-4 block text-sm font-semibold">
          Backup JSON file
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => void validateBackup(event.target.files?.[0] || null)}
            disabled={isValidating}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base file:mr-4 file:rounded-md file:border-0 file:bg-emerald-700 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white"
          />
        </label>
        {isValidating ? <p className="mt-3 text-sm font-bold text-slate-600">Validating backup...</p> : null}
      </section>

      {message ? (
        <p className={`rounded-md border px-4 py-3 text-sm font-bold ${messageType === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
          {message}
        </p>
      ) : null}

      {validation ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold">Validation Results</h2>
              <p className="mt-1 text-sm font-semibold text-slate-600">{validation.pharmacy.pharmacy_name || "Unknown pharmacy"}</p>
            </div>
            <span className={`w-fit rounded-full border px-3 py-1 text-xs font-black ${validation.valid ? "border-emerald-200 bg-emerald-100 text-emerald-800" : "border-rose-200 bg-rose-100 text-rose-800"}`}>
              {validation.valid ? "VALID" : "INVALID"}
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-bold uppercase text-slate-500">Checksum</p>
              <p className="mt-1 font-bold">{validation.checksum.matches ? "Matches" : "Does not match"}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-bold uppercase text-slate-500">Pharmacy ID</p>
              <p className="mt-1 break-all font-bold">{validation.pharmacy.id || "Missing"}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(validation.record_counts).map(([name, count]) => (
              <div key={name} className="rounded-md border border-slate-200 px-3 py-2">
                <p className="text-xs font-bold uppercase text-slate-500">{name.replaceAll("_", " ")}</p>
                <p className="mt-1 text-xl font-black">{count}</p>
              </div>
            ))}
          </div>
          {validation.errors.length ? (
            <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">
              {validation.errors.map((error) => <p key={error}>{error}</p>)}
            </div>
          ) : null}
          {validation.warnings.length ? (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
              {validation.warnings.map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
