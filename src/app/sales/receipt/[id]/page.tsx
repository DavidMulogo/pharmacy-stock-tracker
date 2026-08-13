import Link from "next/link";
import { notFound } from "next/navigation";
import { getSaleTransactionReceipt } from "@/lib/data";
import { formatDateTime, formatTZS } from "@/lib/format";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import { getPharmacySettings } from "@/lib/pharmacy-settings";
import { PrintReceiptButton } from "./print-button";

export const dynamic = "force-dynamic";

export default async function SaleReceipt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await authenticatePharmacyFromSessionCookie();
  if (!session) notFound();

  const [receipt, settings] = await Promise.all([
    getSaleTransactionReceipt(id, session.pharmacy.id),
    getPharmacySettings(session.pharmacy.id, session.pharmacy.pharmacy_name),
  ]);
  if (!receipt) notFound();

  const { transaction, lines } = receipt;
  const reference = `${settings.receipt_prefix}-${transaction.id.slice(0, 8).toUpperCase()}`;
  const receiptWidth = settings.receipt_paper_size === "THERMAL_58MM"
    ? "max-w-[58mm]"
    : settings.receipt_paper_size === "A4"
      ? "max-w-3xl"
      : "max-w-[80mm]";
  const location = [settings.address, settings.district, settings.region].filter(Boolean).join(", ");

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-950 print:bg-white print:p-0">
      <div className={`mx-auto ${receiptWidth}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link className="font-bold text-emerald-700" href="/">Back to POS</Link>
          <PrintReceiptButton />
        </div>
        <section className="bg-white p-6 shadow-sm print:p-0 print:shadow-none">
          <header className="border-b border-dashed border-slate-400 pb-4 text-center">
            <h1 className="text-2xl font-black">{settings.receipt_header || session.pharmacy.pharmacy_name}</h1>
            {location ? <p className="mt-1 text-sm">{location}</p> : null}
            {session.pharmacy.phone ? <p className="mt-1 text-sm">{session.pharmacy.phone}</p> : null}
            {settings.email ? <p className="text-sm">{settings.email}</p> : null}
            <p className="mt-3 font-bold">SALES RECEIPT</p>
            <p className="text-sm">Transaction #{reference}</p>
            <p className="text-sm">{formatDateTime(transaction.created_at)}</p>
          </header>

          {transaction.status === "VOIDED" ? (
            <div className="my-4 border-y-2 border-rose-700 py-2 text-center font-black text-rose-700">VOIDED</div>
          ) : null}

          <div className="divide-y divide-dashed divide-slate-300">
            {lines.map((line) => (
              <div className="py-3" key={line.id}>
                <p className="font-bold">{line.product_name}</p>
                <div className="mt-1 flex justify-between gap-3 text-sm">
                  <span>{line.quantity_entered} {line.sell_type === "PACK" ? "pack" : "unit"} × {formatTZS(line.effective_price)}</span>
                  <strong>{formatTZS(line.total_sale)}</strong>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex justify-between border-y-2 border-slate-900 py-3 text-xl font-black">
            <span>TOTAL</span>
            <span>{formatTZS(transaction.total_amount)}</span>
          </div>
          <footer className="pt-5 text-center text-sm">
            <p className="font-bold">{settings.receipt_footer || "Thank you for your purchase."}</p>
            <p className="mt-1 text-slate-600">Keep this receipt for your records.</p>
          </footer>
        </section>
      </div>
    </main>
  );
}
