import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductDetail } from "@/lib/data";
import { formatDate, formatDateTime, formatOptionalTZS, formatTZS } from "@/lib/format";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";

export const dynamic = "force-dynamic";

export default async function ProductDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await authenticatePharmacyFromSessionCookie();
  if (!session) notFound();

  const detail = await getProductDetail(id, session.pharmacy.id);
  if (!detail) notFound();

  const { product, batches, sales } = detail;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm font-bold text-emerald-700">Back to dashboard</Link>
        <section className="mt-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold">{product.product_name}</h1>
              <p className="mt-1 text-slate-600">{product.generic_name} - {product.brand_name} - {product.dosage_form}</p>
            </div>
            <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
              {product.stock_status}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Available" value={`${product.available_stock} ${product.base_unit}`} />
            <Metric label="Received" value={String(product.total_received)} />
            <Metric label="Sold" value={String(product.total_sold)} />
            <Metric label="Reorder" value={String(product.reorder_level)} />
            <Metric label="Pack type" value={product.pack_type} />
            <Metric label="Units/pack" value={String(product.units_per_pack)} />
            <Metric label="Selling mode" value={product.selling_mode} />
            <Metric label="Unit price" value={formatOptionalTZS(product.default_unit_price)} />
            <Metric label="Pack price" value={formatOptionalTZS(product.default_pack_price)} />
            <Metric label="Unit cost" value={product.derived_unit_cost == null ? "-" : formatTZS(product.derived_unit_cost)} />
            <Metric label="Created" value={formatDate(product.created_at)} />
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Batches</h2>
          <div className="mt-3 grid gap-3">
            {batches.map((batch) => (
              <div key={batch.id} className="rounded-md border border-slate-200 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-semibold">Batch {batch.batch_number}</p>
                  <span className="text-sm font-bold text-slate-700">{batch.expiry_status}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  Expires {batch.expiry_date} - {batch.packs_received} packs - {batch.total_units_received} units - unit cost{" "}
                  {batch.derived_unit_cost == null ? "-" : formatTZS(batch.derived_unit_cost)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Recent Sales</h2>
          <div className="mt-3 grid gap-3">
            {sales.map((sale) => (
              <Link key={sale.id} href={`/sales/${sale.id}`} className="rounded-md border border-slate-200 p-3 hover:border-emerald-300">
                <p className="font-semibold">
                  {sale.quantity_entered} {sale.sell_type === "PACK" ? "pack" : "unit"} - {formatTZS(sale.total_sale)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {sale.units_sold} units deducted - {formatDateTime(sale.created_at)} - {sale.override_flag}
                </p>
              </Link>
            ))}
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
