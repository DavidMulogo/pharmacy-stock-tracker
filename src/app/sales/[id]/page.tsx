import Link from "next/link";
import { notFound } from "next/navigation";
import { getSaleDetail } from "@/lib/data";
import { formatDateTime, formatTZS } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SaleDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pharmacy_id?: string }>;
}) {
  const { id } = await params;
  const { pharmacy_id } = await searchParams;
  const detail = await getSaleDetail(id, pharmacy_id);
  if (!detail) notFound();

  const { sale } = detail;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-bold text-emerald-700">Back to dashboard</Link>
        <section className="mt-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Sale Detail</h1>
              <p className="mt-1 text-slate-600">{sale.product.product_name}</p>
            </div>
            <span className="w-fit rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">
              {sale.override_flag}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <Metric label="Product" value={sale.product.product_name} />
            <Metric label="Sell type" value={sale.sell_type} />
            <Metric label="Quantity" value={`${sale.quantity_entered} ${sale.sell_type === "PACK" ? "Pack" : "Unit"}`} />
            <Metric label="Units sold" value={String(sale.units_sold)} />
            <Metric label="Default price" value={formatTZS(sale.default_price)} />
            <Metric label="Override price" value={sale.override_price == null ? "Not applied" : formatTZS(sale.override_price)} />
            <Metric label="Effective price" value={formatTZS(sale.effective_price)} />
            <Metric label="Total sale" value={formatTZS(sale.total_sale)} />
            <Metric label="Override flag" value={sale.override_flag} />
            <Metric label="Date" value={formatDateTime(sale.created_at)} />
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words font-bold text-slate-950">{value}</p>
    </div>
  );
}
