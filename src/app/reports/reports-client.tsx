"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDate, formatDateTime, formatTZS } from "@/lib/format";
import type { ActivityLogAction, ExpiryStatus, OverrideFlag, PharmacyUserRole, SellType, StockStatus } from "@/lib/types";
import type { ReportType } from "@/lib/reports";
import type { ReactNode } from "react";

type SalesRow = {
  id: string;
  product: string;
  sell_type: SellType;
  quantity_entered: number;
  units_sold: number;
  price: number;
  total_sale: number;
  override_status: OverrideFlag;
  created_at: string;
};
type InventoryRow = {
  id: string;
  product: string;
  available_stock: number;
  stock_status: StockStatus;
  reorder_level: number;
  unit_cost: number;
  inventory_value: number;
};
type ExpiryRow = {
  id: string;
  product: string;
  batch_number: string;
  expiry_date: string;
  expiry_status: ExpiryStatus;
  days_to_expiry: number;
  remaining_stock: number | null;
};
type OverrideRow = {
  id: string;
  product: string;
  quantity_entered: number;
  sell_type: SellType;
  default_price: number;
  override_price: number;
  difference: number;
  created_at: string;
};
type ProfitRow = {
  id: string;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
};
type ActivityRow = {
  id: string;
  actor: string;
  role: PharmacyUserRole;
  action: ActivityLogAction;
  description: string;
  created_at: string;
};

type ReportData =
  | { type: "sales"; summary: { total_sales: number; units_sold: number; transactions: number }; rows: SalesRow[] }
  | { type: "inventory"; summary: { products: number; low_stock: number; out_of_stock: number; total_inventory_value: number }; rows: InventoryRow[] }
  | { type: "expiry"; summary: { batches: number; expired: number; expiring_soon: number }; rows: ExpiryRow[] }
  | { type: "overrides"; summary: { overrides: number; total_difference: number }; rows: OverrideRow[] }
  | { type: "profit"; summary: { total_sales: number; gross_profit: number; expenses: number; net_profit: number; expenses_by_category: Array<{ category: string; amount: number }> }; rows: ProfitRow[] }
  | { type: "activity"; summary: { activities: number; staff: number }; rows: ActivityRow[] };

const reportLabels: Record<ReportType, string> = {
  sales: "Sales",
  inventory: "Inventory",
  expiry: "Expiry",
  overrides: "Price Overrides",
  profit: "Expenses & Profit",
  activity: "Staff Activity",
};

function parseMessage(data: { error?: unknown; message?: unknown }) {
  if (typeof data.error === "string") return data.error;
  if (data.error && typeof data.error === "object" && "message" in data.error && typeof data.error.message === "string") return data.error.message;
  if (typeof data.message === "string") return data.message;
  return "Unable to load report.";
}

function csvEscape(value: string | number | null) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildCsv(headers: string[], rows: Array<Array<string | number | null>>) {
  return [headers.map(csvEscape).join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\n");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function reportCsv(report: ReportData) {
  if (report.type === "sales") {
    return buildCsv(
      ["Product", "Sell Type", "Quantity", "Units Sold", "Price", "Total Sale", "Override Status", "Date"],
      report.rows.map((row) => [row.product, row.sell_type, row.quantity_entered, row.units_sold, row.price, row.total_sale, row.override_status, formatDateTime(row.created_at)]),
    );
  }
  if (report.type === "inventory") {
    return buildCsv(
      ["Product", "Available Stock", "Stock Status", "Reorder Level", "Unit Cost", "Inventory Value"],
      report.rows.map((row) => [row.product, row.available_stock, row.stock_status, row.reorder_level, row.unit_cost, row.inventory_value]),
    );
  }
  if (report.type === "expiry") {
    return buildCsv(
      ["Product", "Batch Number", "Expiry Date", "Expiry Status", "Days To Expiry", "Remaining Stock"],
      report.rows.map((row) => [row.product, row.batch_number, row.expiry_date, row.expiry_status, row.days_to_expiry, row.remaining_stock]),
    );
  }
  if (report.type === "overrides") {
    return buildCsv(
      ["Product", "Quantity", "Sell Type", "Default Price", "Override Price", "Difference", "Date"],
      report.rows.map((row) => [row.product, row.quantity_entered, row.sell_type, row.default_price, row.override_price, row.difference, formatDateTime(row.created_at)]),
    );
  }
  if (report.type === "profit") {
    return buildCsv(
      ["Expense Date", "Category", "Description", "Amount"],
      report.rows.map((row) => [row.expense_date, row.category, row.description, row.amount]),
    );
  }
  return buildCsv(
    ["Actor", "Role", "Action", "Description", "Timestamp"],
    report.rows.map((row) => [row.actor, row.role, row.action, row.description, formatDateTime(row.created_at)]),
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-black text-slate-950">{value}</p>
    </div>
  );
}

export function ReportsClient({
  permittedReports,
  initialFrom,
  initialTo,
}: {
  permittedReports: ReportType[];
  initialFrom: string;
  initialTo: string;
}) {
  const [activeReport, setActiveReport] = useState<ReportType>(permittedReports[0] || "inventory");
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [expiryStatus, setExpiryStatus] = useState<ExpiryStatus | "ALL">("ALL");
  const [report, setReport] = useState<ReportData | null>(null);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const usesDateRange = activeReport !== "inventory" && activeReport !== "expiry";
  const rows = useMemo(() => report?.rows || [], [report]);

  useEffect(() => {
    async function loadReport() {
      setIsLoading(true);
      setMessage("");
      setSuccess("");

      try {
        const params = new URLSearchParams({ type: activeReport, from, to, expiryStatus });
        const response = await fetch(`/api/reports?${params.toString()}`, { credentials: "include" });
        const data = await response.json();

        if (!response.ok) {
          setReport(null);
          setMessage(parseMessage(data));
          return;
        }

        setReport(data.report as ReportData);
      } catch {
        setReport(null);
        setMessage("Unable to load report. Check your connection and try again.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadReport();
  }, [activeReport, expiryStatus, from, to]);

  async function exportReport() {
    if (!report || rows.length === 0) return;

    setIsExporting(true);
    setMessage("");
    setSuccess("");

    try {
      const response = await fetch("/api/reports/export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: activeReport, filters: { from, to, expiryStatus } }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(parseMessage(data));
        return;
      }

      downloadCsv(`pharmastock-${activeReport}-report.csv`, reportCsv(report));
      setSuccess(`${reportLabels[activeReport]} report exported.`);
    } catch {
      setMessage("Unable to export report. Check your connection and try again.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {permittedReports.map((reportType) => (
            <button
              key={reportType}
              type="button"
              onClick={() => setActiveReport(reportType)}
              className={`rounded-md border px-3 py-2 text-sm font-bold ${activeReport === reportType ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-200 bg-white text-slate-700"}`}
            >
              {reportLabels[reportType]}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {usesDateRange ? (
            <>
              <label className="text-sm font-semibold">
                From
                <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3" />
              </label>
              <label className="text-sm font-semibold">
                To
                <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3" />
              </label>
            </>
          ) : null}
          {activeReport === "expiry" ? (
            <label className="text-sm font-semibold">
              Expiry status
              <select value={expiryStatus} onChange={(event) => setExpiryStatus(event.target.value as ExpiryStatus | "ALL")} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3">
                <option value="ALL">All statuses</option>
                <option value="EXPIRED">Expired</option>
                <option value="EXPIRING SOON">Expiring soon</option>
                <option value="OK">OK</option>
              </select>
            </label>
          ) : null}
          <button
            type="button"
            onClick={exportReport}
            disabled={!report || rows.length === 0 || isExporting}
            className="self-end rounded-md bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isExporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </section>

      {message ? <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">{message}</p> : null}
      {success ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">{success}</p> : null}
      {isLoading ? <p className="rounded-md border border-slate-200 bg-white px-4 py-6 text-center text-sm font-bold text-slate-600">Loading report...</p> : null}

      {!isLoading && report ? (
        <>
          <ReportSummary report={report} />
          <ReportTable report={report} />
        </>
      ) : null}
    </div>
  );
}

function ReportSummary({ report }: { report: ReportData }) {
  if (report.type === "sales") {
    return (
      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Total sales" value={formatTZS(report.summary.total_sales)} />
        <SummaryCard label="Units sold" value={String(report.summary.units_sold)} />
        <SummaryCard label="Transactions" value={String(report.summary.transactions)} />
      </section>
    );
  }
  if (report.type === "inventory") {
    return (
      <section className="grid gap-3 sm:grid-cols-4">
        <SummaryCard label="Products" value={String(report.summary.products)} />
        <SummaryCard label="Low stock" value={String(report.summary.low_stock)} />
        <SummaryCard label="Out of stock" value={String(report.summary.out_of_stock)} />
        <SummaryCard label="Inventory value" value={formatTZS(report.summary.total_inventory_value)} />
      </section>
    );
  }
  if (report.type === "expiry") {
    return (
      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Batches" value={String(report.summary.batches)} />
        <SummaryCard label="Expired" value={String(report.summary.expired)} />
        <SummaryCard label="Expiring soon" value={String(report.summary.expiring_soon)} />
      </section>
    );
  }
  if (report.type === "overrides") {
    return (
      <section className="grid gap-3 sm:grid-cols-2">
        <SummaryCard label="Overrides" value={String(report.summary.overrides)} />
        <SummaryCard label="Total difference" value={formatTZS(report.summary.total_difference)} />
      </section>
    );
  }
  if (report.type === "profit") {
    return (
      <section className="grid gap-3 sm:grid-cols-4">
        <SummaryCard label="Sales" value={formatTZS(report.summary.total_sales)} />
        <SummaryCard label="Gross profit" value={formatTZS(report.summary.gross_profit)} />
        <SummaryCard label="Expenses" value={formatTZS(report.summary.expenses)} />
        <SummaryCard label="Net profit" value={formatTZS(report.summary.net_profit)} />
      </section>
    );
  }
  return (
    <section className="grid gap-3 sm:grid-cols-2">
      <SummaryCard label="Activities" value={String(report.summary.activities)} />
      <SummaryCard label="Staff members" value={String(report.summary.staff)} />
    </section>
  );
}

function ReportTable({ report }: { report: ReportData }) {
  if (report.rows.length === 0) {
    return <p className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm font-semibold text-slate-600">No records match this report.</p>;
  }

  return (
    <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-100 text-xs uppercase text-slate-600">
          <ReportHeader type={report.type} />
        </thead>
        <tbody className="divide-y divide-slate-200">
          <ReportRows report={report} />
        </tbody>
      </table>
    </section>
  );
}

function ReportHeader({ type }: { type: ReportData["type"] }) {
  const headers =
    type === "sales"
      ? ["Product", "Sell Type", "Qty", "Units", "Price", "Total", "Override", "Date"]
      : type === "inventory"
        ? ["Product", "Available", "Status", "Reorder", "Unit Cost", "Value"]
        : type === "expiry"
          ? ["Product", "Batch", "Expiry", "Status", "Days", "Remaining"]
          : type === "overrides"
            ? ["Product", "Qty", "Default", "Override", "Difference", "Date"]
            : type === "profit"
              ? ["Date", "Category", "Description", "Amount"]
              : ["Actor", "Role", "Action", "Description", "Timestamp"];

  return (
    <tr>
      {headers.map((header) => (
        <th key={header} className="px-4 py-3 font-black">
          {header}
        </th>
      ))}
    </tr>
  );
}

function ReportRows({ report }: { report: ReportData }) {
  if (report.type === "sales") {
    return report.rows.map((row) => (
      <tr key={row.id}>
        <Cell>{row.product}</Cell>
        <Cell>{row.sell_type}</Cell>
        <Cell>{row.quantity_entered}</Cell>
        <Cell>{row.units_sold}</Cell>
        <Cell>{formatTZS(row.price)}</Cell>
        <Cell>{formatTZS(row.total_sale)}</Cell>
        <Cell>{row.override_status}</Cell>
        <Cell>{formatDateTime(row.created_at)}</Cell>
      </tr>
    ));
  }
  if (report.type === "inventory") {
    return report.rows.map((row) => (
      <tr key={row.id}>
        <Cell>{row.product}</Cell>
        <Cell>{row.available_stock}</Cell>
        <Cell>{row.stock_status}</Cell>
        <Cell>{row.reorder_level}</Cell>
        <Cell>{formatTZS(row.unit_cost)}</Cell>
        <Cell>{formatTZS(row.inventory_value)}</Cell>
      </tr>
    ));
  }
  if (report.type === "expiry") {
    return report.rows.map((row) => (
      <tr key={row.id}>
        <Cell>{row.product}</Cell>
        <Cell>{row.batch_number}</Cell>
        <Cell>{formatDate(row.expiry_date)}</Cell>
        <Cell>{row.expiry_status}</Cell>
        <Cell>{row.days_to_expiry}</Cell>
        <Cell>{row.remaining_stock ?? "N/A"}</Cell>
      </tr>
    ));
  }
  if (report.type === "overrides") {
    return report.rows.map((row) => (
      <tr key={row.id}>
        <Cell>{row.product}</Cell>
        <Cell>{`${row.quantity_entered} ${row.sell_type}`}</Cell>
        <Cell>{formatTZS(row.default_price)}</Cell>
        <Cell>{formatTZS(row.override_price)}</Cell>
        <Cell>{formatTZS(row.difference)}</Cell>
        <Cell>{formatDateTime(row.created_at)}</Cell>
      </tr>
    ));
  }
  if (report.type === "profit") {
    return report.rows.map((row) => (
      <tr key={row.id}>
        <Cell>{formatDate(row.expense_date)}</Cell>
        <Cell>{row.category}</Cell>
        <Cell>{row.description || "No description"}</Cell>
        <Cell>{formatTZS(row.amount)}</Cell>
      </tr>
    ));
  }
  return report.rows.map((row) => (
    <tr key={row.id}>
      <Cell>{row.actor}</Cell>
      <Cell>{row.role}</Cell>
      <Cell>{row.action}</Cell>
      <Cell>{row.description}</Cell>
      <Cell>{formatDateTime(row.created_at)}</Cell>
    </tr>
  ));
}

function Cell({ children }: { children: ReactNode }) {
  return <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">{children}</td>;
}
