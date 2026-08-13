"use client";

export function PrintReceiptButton() {
  return (
    <button className="rounded-md bg-emerald-700 px-5 py-3 font-bold text-white print:hidden" type="button" onClick={() => window.print()}>
      Print Receipt
    </button>
  );
}
