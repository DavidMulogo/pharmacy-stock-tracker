"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReorderLevelForm({
  productId,
  initialReorderLevel,
  onSaved,
}: {
  productId: string;
  initialReorderLevel: number | null;
  onSaved?: () => Promise<void> | void;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialReorderLevel == null ? "" : String(initialReorderLevel));
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [isSaving, setIsSaving] = useState(false);
  const parsed = value.trim() === "" ? null : Number(value);
  const invalid = parsed !== null && (!Number.isInteger(parsed) || parsed < 0);

  async function save() {
    if (invalid) {
      setMessageType("error");
      setMessage("Enter a whole number zero or greater.");
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      const response = await fetch(`/api/products/${productId}/reorder-level`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reorder_level: parsed }),
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.error || "Unable to update reorder level.");

      setMessageType("success");
      setMessage(parsed == null ? "Reorder level cleared." : "Reorder level saved.");
      await onSaved?.();
      router.refresh();
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "Unable to update reorder level.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
      <label className="block text-sm font-semibold text-slate-800">
        Reorder level in base units
        <input
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-emerald-600"
          min="0"
          onChange={(event) => setValue(event.target.value)}
          placeholder="Configure reorder level"
          type="number"
          value={value}
        />
      </label>
      {invalid ? <p className="mt-2 text-sm font-semibold text-rose-700">Enter a whole number zero or greater.</p> : null}
      {message ? <p className={`mt-2 text-sm font-semibold ${messageType === "success" ? "text-emerald-700" : "text-rose-700"}`}>{message}</p> : null}
      <button
        className="mt-3 rounded-md bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300"
        disabled={isSaving || invalid}
        onClick={save}
        type="button"
      >
        {isSaving ? "Saving..." : "Configure reorder level"}
      </button>
    </div>
  );
}
