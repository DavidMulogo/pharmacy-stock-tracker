"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SellingMode } from "@/lib/types";

type Props = { productId: string; sellingMode: SellingMode; unitsPerPack: number; initialUnitPrice: number | null; initialPackPrice: number | null };
const inputValue = (value: number | null) => value == null ? "" : String(value);

export function PriceEditor(props: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [unitPrice, setUnitPrice] = useState(inputValue(props.initialUnitPrice));
  const [packPrice, setPackPrice] = useState(inputValue(props.initialPackPrice));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const usesUnits = props.sellingMode !== "PACK";
  const usesPacks = props.sellingMode !== "UNIT";
  const suggestedPackPrice = useMemo(() => {
    const unit = Number(unitPrice);
    return Number.isFinite(unit) && unit >= 0 ? unit * props.unitsPerPack : null;
  }, [props.unitsPerPack, unitPrice]);
  const changed = unitPrice !== inputValue(props.initialUnitPrice) || packPrice !== inputValue(props.initialPackPrice);
  const valid = (!usesUnits || unitPrice !== "") && (!usesPacks || packPrice !== "");

  function cancel() {
    setUnitPrice(inputValue(props.initialUnitPrice)); setPackPrice(inputValue(props.initialPackPrice)); setMessage(""); setEditing(false);
  }
  async function save() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/products/${props.productId}/prices`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit_price: usesUnits ? unitPrice : null, pack_price: usesPacks ? packPrice : null }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save prices.");
      setMessage("Normal selling prices updated. New sales will use these prices."); setEditing(false); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save prices."); }
    finally { setBusy(false); }
  }

  if (!editing) return <div className="mt-4 border-t border-slate-200 pt-4">
    <button type="button" onClick={() => setEditing(true)} className="rounded-md bg-emerald-700 px-4 py-2 font-bold text-white">Change normal selling prices</button>
    {message ? <p className="mt-2 text-sm font-semibold text-emerald-700">{message}</p> : null}
  </div>;

  return <div className="mt-4 border-t border-slate-200 pt-4">
    <h2 className="font-bold">Change normal selling prices</h2>
    <p className="mt-1 text-sm text-slate-600">These prices apply to future sales only. Earlier sales keep their original prices.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {usesUnits ? <label className="font-semibold">Unit price (TSh)<input type="number" min="0" step="0.01" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label> : null}
      {usesPacks ? <label className="font-semibold">Pack price (TSh)<input type="number" min="0" step="0.01" value={packPrice} onChange={(event) => setPackPrice(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label> : null}
    </div>
    {usesUnits && usesPacks && suggestedPackPrice != null ? <button type="button" onClick={() => setPackPrice(String(suggestedPackPrice))} className="mt-3 text-sm font-bold text-emerald-700">Use suggested pack price: TSh {suggestedPackPrice.toLocaleString("en-US")}</button> : null}
    {message ? <p className="mt-3 text-sm font-semibold text-red-700">{message}</p> : null}
    <div className="mt-4 flex gap-2">
      <button type="button" disabled={busy || !changed || !valid} onClick={save} className="rounded-md bg-emerald-700 px-4 py-2 font-bold text-white disabled:bg-slate-300">{busy ? "Saving..." : "Save prices"}</button>
      <button type="button" disabled={busy} onClick={cancel} className="rounded-md border border-slate-300 px-4 py-2 font-bold">Cancel</button>
    </div>
  </div>;
}
