import { getActivityLogs } from "@/lib/activity-log";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type { ExpiryStatus, OverrideFlag, PharmacyUserRole, SellType, StockStatus } from "@/lib/types";

export type ReportType = "sales" | "inventory" | "expiry" | "overrides" | "profit" | "activity";

export type ReportFilters = {
  from: string;
  to: string;
  expiryStatus?: ExpiryStatus | "ALL";
};

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type SaleRow = Database["public"]["Tables"]["sales"]["Row"];
type ProductStockSummaryRow = Database["public"]["Views"]["product_stock_summary"]["Row"];
type BatchExpirySummaryRow = Database["public"]["Views"]["batch_expiry_summary"]["Row"];
type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"];
type SaleWithProductRow = SaleRow & {
  product: Pick<ProductRow, "product_name"> | Pick<ProductRow, "product_name">[] | null;
};

const reportPermissions = {
  OWNER: ["sales", "inventory", "expiry", "overrides", "profit", "activity"],
  PHARMACIST: ["sales", "inventory", "expiry", "overrides", "profit"],
  TECHNICIAN: ["inventory", "expiry"],
} satisfies Record<PharmacyUserRole, ReportType[]>;

export function getPermittedReports(role: PharmacyUserRole): ReportType[] {
  return reportPermissions[role];
}

export function canAccessReport(role: PharmacyUserRole, reportType: ReportType) {
  return getPermittedReports(role).includes(reportType);
}

export function isReportType(value: string): value is ReportType {
  return ["sales", "inventory", "expiry", "overrides", "profit", "activity"].includes(value);
}

function normalizeNumber(value: number | string | null) {
  return Number(value || 0);
}

function toDateRange(filters: Pick<ReportFilters, "from" | "to">) {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(filters.from) ? filters.from : new Date().toISOString().slice(0, 10);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(filters.to) ? filters.to : from;
  const end = new Date(`${to}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    from,
    to,
    fromTimestamp: `${from}T00:00:00.000Z`,
    toTimestamp: end.toISOString(),
    fromDate: from,
    toDateExclusive: end.toISOString().slice(0, 10),
  };
}

function productName(product: SaleWithProductRow["product"]) {
  const item = Array.isArray(product) ? product[0] : product;
  return item?.product_name || "Unknown product";
}

export async function getReportData(pharmacyId: string, reportType: ReportType, filters: ReportFilters) {
  if (reportType === "sales") return getSalesReport(pharmacyId, filters);
  if (reportType === "inventory") return getInventoryReport(pharmacyId);
  if (reportType === "expiry") return getExpiryReport(pharmacyId, filters);
  if (reportType === "overrides") return getOverrideReport(pharmacyId, filters);
  if (reportType === "profit") return getExpenseProfitReport(pharmacyId, filters);
  return getStaffActivityReport(pharmacyId, filters);
}

async function getSalesReport(pharmacyId: string, filters: ReportFilters) {
  const supabase = getSupabaseAdmin();
  const range = toDateRange(filters);
  const result = await supabase
    .from("sales")
    .select("*, product:products(product_name)")
    .eq("pharmacy_id", pharmacyId)
    .gte("created_at", range.fromTimestamp)
    .lt("created_at", range.toTimestamp)
    .order("created_at", { ascending: false });

  if (result.error) throw result.error;
  const rows = ((result.data || []) as SaleWithProductRow[]).map((sale) => ({
    id: sale.id,
    product: productName(sale.product),
    sell_type: sale.sell_type as SellType,
    quantity_entered: normalizeNumber(sale.quantity_entered),
    units_sold: normalizeNumber(sale.units_sold),
    price: normalizeNumber(sale.effective_price),
    total_sale: normalizeNumber(sale.total_sale),
    override_status: sale.override_flag as OverrideFlag,
    created_at: sale.created_at,
  }));

  return {
    type: "sales" as const,
    filters: range,
    summary: {
      total_sales: rows.reduce((total, row) => total + row.total_sale, 0),
      units_sold: rows.reduce((total, row) => total + row.units_sold, 0),
      transactions: rows.length,
    },
    rows,
  };
}

async function getInventoryReport(pharmacyId: string) {
  const supabase = getSupabaseAdmin();
  const result = await supabase.from("product_stock_summary").select("*").eq("pharmacy_id", pharmacyId).order("product_name");

  if (result.error) throw result.error;
  const rows = ((result.data || []) as ProductStockSummaryRow[]).map((product) => {
    const availableStock = normalizeNumber(product.available_stock);
    const unitCost = normalizeNumber(product.derived_unit_cost);

    return {
      id: product.id,
      product: product.product_name,
      available_stock: availableStock,
      stock_status: product.stock_status as StockStatus,
      reorder_level: normalizeNumber(product.reorder_level),
      unit_cost: unitCost,
      inventory_value: availableStock * unitCost,
    };
  });

  return {
    type: "inventory" as const,
    summary: {
      products: rows.length,
      low_stock: rows.filter((row) => row.stock_status === "LOW STOCK").length,
      out_of_stock: rows.filter((row) => row.stock_status === "OUT OF STOCK").length,
      total_inventory_value: rows.reduce((total, row) => total + row.inventory_value, 0),
    },
    rows,
  };
}

async function getExpiryReport(pharmacyId: string, filters: ReportFilters) {
  const supabase = getSupabaseAdmin();
  let query = supabase.from("batch_expiry_summary").select("*").eq("pharmacy_id", pharmacyId);
  if (filters.expiryStatus && filters.expiryStatus !== "ALL") query = query.eq("expiry_status", filters.expiryStatus);

  const [batchesResult, productsResult] = await Promise.all([
    query.order("expiry_date", { ascending: true }),
    supabase.from("product_stock_summary").select("id, product_name, available_stock").eq("pharmacy_id", pharmacyId),
  ]);

  if (batchesResult.error) throw batchesResult.error;
  if (productsResult.error) throw productsResult.error;

  const productById = new Map(
    ((productsResult.data || []) as ProductStockSummaryRow[]).map((product) => [
      product.id,
      { product_name: product.product_name, available_stock: normalizeNumber(product.available_stock) },
    ]),
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rows = ((batchesResult.data || []) as BatchExpirySummaryRow[]).map((batch) => {
    const product = productById.get(batch.product_id);
    const expiry = new Date(`${batch.expiry_date}T00:00:00`);
    expiry.setHours(0, 0, 0, 0);

    return {
      id: batch.id,
      product: product?.product_name || "Unknown product",
      batch_number: batch.batch_number,
      expiry_date: batch.expiry_date,
      expiry_status: batch.expiry_status as ExpiryStatus,
      days_to_expiry: Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000),
      remaining_stock: product?.available_stock ?? null,
    };
  });

  return {
    type: "expiry" as const,
    summary: {
      batches: rows.length,
      expired: rows.filter((row) => row.expiry_status === "EXPIRED").length,
      expiring_soon: rows.filter((row) => row.expiry_status === "EXPIRING SOON").length,
    },
    rows,
  };
}

async function getOverrideReport(pharmacyId: string, filters: ReportFilters) {
  const supabase = getSupabaseAdmin();
  const range = toDateRange(filters);
  const result = await supabase
    .from("sales")
    .select("*, product:products(product_name)")
    .eq("pharmacy_id", pharmacyId)
    .eq("override_flag", "OVERRIDDEN")
    .gte("created_at", range.fromTimestamp)
    .lt("created_at", range.toTimestamp)
    .order("created_at", { ascending: false });

  if (result.error) throw result.error;
  const rows = ((result.data || []) as SaleWithProductRow[]).map((sale) => ({
    id: sale.id,
    product: productName(sale.product),
    quantity_entered: normalizeNumber(sale.quantity_entered),
    sell_type: sale.sell_type as SellType,
    default_price: normalizeNumber(sale.default_price),
    override_price: normalizeNumber(sale.override_price),
    difference: normalizeNumber(sale.override_price) - normalizeNumber(sale.default_price),
    created_at: sale.created_at,
  }));

  return {
    type: "overrides" as const,
    filters: range,
    summary: {
      overrides: rows.length,
      total_difference: rows.reduce((total, row) => total + row.difference, 0),
    },
    rows,
  };
}

async function getExpenseProfitReport(pharmacyId: string, filters: ReportFilters) {
  const supabase = getSupabaseAdmin();
  const range = toDateRange(filters);
  const [salesResult, productsResult, expensesResult] = await Promise.all([
    supabase
      .from("sales")
      .select("product_id, units_sold, total_sale")
      .eq("pharmacy_id", pharmacyId)
      .gte("created_at", range.fromTimestamp)
      .lt("created_at", range.toTimestamp),
    supabase.from("product_stock_summary").select("id, derived_unit_cost").eq("pharmacy_id", pharmacyId),
    supabase
      .from("expenses")
      .select("*")
      .eq("pharmacy_id", pharmacyId)
      .gte("expense_date", range.fromDate)
      .lt("expense_date", range.toDateExclusive)
      .order("expense_date", { ascending: false }),
  ]);

  if (salesResult.error) throw salesResult.error;
  if (productsResult.error) throw productsResult.error;
  if (expensesResult.error) throw expensesResult.error;

  const costByProductId = new Map(((productsResult.data || []) as ProductStockSummaryRow[]).map((product) => [product.id, normalizeNumber(product.derived_unit_cost)]));
  const sales = salesResult.data || [];
  const totalSales = sales.reduce((total, sale) => total + normalizeNumber(sale.total_sale), 0);
  const grossProfit = sales.reduce((total, sale) => total + normalizeNumber(sale.total_sale) - normalizeNumber(sale.units_sold) * (costByProductId.get(sale.product_id) || 0), 0);
  const expenseRows = ((expensesResult.data || []) as ExpenseRow[]).map((expense) => ({
    id: expense.id,
    expense_date: expense.expense_date,
    category: expense.category,
    description: expense.description,
    amount: normalizeNumber(expense.amount),
  }));
  const expensesByCategory = new Map<string, number>();

  expenseRows.forEach((expense) => {
    expensesByCategory.set(expense.category, (expensesByCategory.get(expense.category) || 0) + expense.amount);
  });

  const totalExpenses = expenseRows.reduce((total, expense) => total + expense.amount, 0);

  return {
    type: "profit" as const,
    filters: range,
    summary: {
      total_sales: totalSales,
      gross_profit: grossProfit,
      expenses: totalExpenses,
      net_profit: grossProfit - totalExpenses,
      expenses_by_category: Array.from(expensesByCategory.entries()).map(([category, amount]) => ({ category, amount })),
    },
    rows: expenseRows,
  };
}

async function getStaffActivityReport(pharmacyId: string, filters: ReportFilters) {
  const logs = await getActivityLogs(pharmacyId, { from: filters.from, to: filters.to, limit: 500 });

  return {
    type: "activity" as const,
    filters,
    summary: {
      activities: logs.length,
      staff: new Set(logs.map((log) => log.actor_user_id || log.actor_name)).size,
    },
    rows: logs.map((log) => ({
      id: log.id,
      actor: log.actor_name,
      role: log.actor_role,
      action: log.action,
      description: log.description,
      created_at: log.created_at,
    })),
  };
}
