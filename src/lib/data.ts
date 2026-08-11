import { getSupabaseAdmin } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { resolvePackPrice, resolveUnitPrice } from "@/lib/pricing";
import { summarizeExactGrossProfit } from "@/lib/cogs";
import type { BatchWithProduct, DashboardData, DashboardStats, Expense, ExpiryStatus, InventoryAdjustmentWithDetails, Pharmacy, Product, ProductWithStock, SaleWithProduct } from "@/lib/types";

const millisecondsPerDay = 86_400_000;
type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type PharmacyRow = Database["public"]["Tables"]["pharmacies"]["Row"];
type ProductStockSummaryRow = Database["public"]["Views"]["product_stock_summary"]["Row"];
type BatchExpirySummaryRow = Database["public"]["Views"]["batch_expiry_summary"]["Row"];
type SaleRow = Database["public"]["Tables"]["sales"]["Row"];
type SaleBatchAllocationRow = Database["public"]["Tables"]["sale_batch_allocations"]["Row"];
type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"];
type InventoryAdjustmentRow = Database["public"]["Tables"]["inventory_adjustments"]["Row"];
type SaleWithProductRow = SaleRow & {
  product: ProductRow | ProductRow[] | null;
};
type AdjustmentWithDetailsRow = InventoryAdjustmentRow & {
  product: ProductRow | ProductRow[] | null;
  batch: Database["public"]["Tables"]["inventory_batches"]["Row"] | Database["public"]["Tables"]["inventory_batches"]["Row"][] | null;
  creator: Pick<Database["public"]["Tables"]["pharmacy_users"]["Row"], "full_name"> | Pick<Database["public"]["Tables"]["pharmacy_users"]["Row"], "full_name">[] | null;
};

function getDaysToExpiry(expiryDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(`${expiryDate}T00:00:00`);
  expiry.setHours(0, 0, 0, 0);

  return Math.ceil((expiry.getTime() - today.getTime()) / millisecondsPerDay);
}

function normalizeNumber(value: number | string | null) {
  return Number(value || 0);
}

function normalizeOptionalNumber(value: number | string | null) {
  return value == null ? null : Number(value);
}

function normalizeExpiryWarningDays(value: number | string | null | undefined) {
  if (value == null) return 30;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 30;
}

function normalizeProduct(product: ProductStockSummaryRow): ProductWithStock {
  const rawUnitPrice = normalizeOptionalNumber(product.default_unit_price);
  const rawPackPrice = normalizeOptionalNumber(product.default_pack_price);
  const normalized = {
    ...product,
    units_per_pack: normalizeNumber(product.units_per_pack),
    default_selling_price: normalizeNumber(product.default_selling_price),
    default_unit_price: rawUnitPrice,
    default_pack_price: rawPackPrice,
    reorder_level: normalizeOptionalNumber(product.reorder_level),
    total_received: normalizeNumber(product.total_received),
    total_sold: normalizeNumber(product.total_sold),
    total_adjusted: normalizeNumber(product.total_adjusted),
    available_stock: normalizeNumber(product.available_stock),
    derived_unit_cost: normalizeOptionalNumber(product.derived_unit_cost),
  };
  const default_unit_price = resolveUnitPrice(normalized);
  const default_pack_price = resolvePackPrice(normalized);

  return {
    ...normalized,
    default_unit_price,
    default_pack_price,
    default_selling_price: default_unit_price ?? default_pack_price ?? normalized.default_selling_price,
  };
}

export function normalizePharmacyRow(pharmacy: PharmacyRow): Pharmacy {
  return {
    id: pharmacy.id,
    pharmacy_name: pharmacy.pharmacy_name,
    owner_name: pharmacy.owner_name,
    phone: pharmacy.phone,
    plan: pharmacy.plan || "TRIAL",
    status: pharmacy.status || "TRIAL",
    trial_ends_at: pharmacy.trial_ends_at,
    billing_cycle: pharmacy.billing_cycle ?? null,
    agreed_price_tzs: normalizeOptionalNumber(pharmacy.agreed_price_tzs),
    subscription_started_at: pharmacy.subscription_started_at ?? null,
    subscription_ends_at: pharmacy.subscription_ends_at,
    pilot_started_at: pharmacy.pilot_started_at ?? null,
    pilot_ends_at: pharmacy.pilot_ends_at ?? null,
    founding_price_ends_at: pharmacy.founding_price_ends_at ?? null,
    grace_period_ends_at: pharmacy.grace_period_ends_at ?? null,
    access_extension_ends_at: pharmacy.access_extension_ends_at ?? null,
    entitlement_mode: pharmacy.entitlement_mode || "OBSERVE",
    archived_at: pharmacy.archived_at ?? null,
    created_at: pharmacy.created_at,
  };
}

type CalendarDate = { year: number; month: number; day: number };

function timeZoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

function localMidnightUtc(date: CalendarDate, timeZone: string) {
  const desired = Date.UTC(date.year, date.month - 1, date.day);
  let candidate = desired;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const actual = timeZoneParts(new Date(candidate), timeZone);
    const offset = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second) - candidate;
    candidate = desired - offset;
  }
  return new Date(candidate);
}

function localDateText(date: CalendarDate) {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function getTodayRange(timeZone: string) {
  const current = timeZoneParts(new Date(), timeZone);
  const startDate = { year: current.year, month: current.month, day: current.day };
  const nextDate = new Date(Date.UTC(current.year, current.month - 1, current.day + 1));
  const endDate = { year: nextDate.getUTCFullYear(), month: nextDate.getUTCMonth() + 1, day: nextDate.getUTCDate() };
  return { start: localMidnightUtc(startDate, timeZone).toISOString(), end: localMidnightUtc(endDate, timeZone).toISOString() };
}

function getMonthRange(timeZone: string) {
  const current = timeZoneParts(new Date(), timeZone);
  const startDate = { year: current.year, month: current.month, day: 1 };
  const nextMonth = new Date(Date.UTC(current.year, current.month, 1));
  const endDate = { year: nextMonth.getUTCFullYear(), month: nextMonth.getUTCMonth() + 1, day: 1 };
  return {
    start: localMidnightUtc(startDate, timeZone).toISOString(),
    end: localMidnightUtc(endDate, timeZone).toISOString(),
    startDate: localDateText(startDate),
    endDate: localDateText(endDate),
  };
}

function normalizeExpense(expense: ExpenseRow): Expense {
  return {
    id: expense.id,
    pharmacy_id: expense.pharmacy_id,
    expense_date: expense.expense_date,
    category: expense.category,
    description: expense.description,
    amount: normalizeNumber(expense.amount),
    created_by: expense.created_by,
    created_at: expense.created_at,
    updated_at: expense.updated_at,
  };
}

export async function getPharmacies(): Promise<Pharmacy[]> {
  const supabase = getSupabaseAdmin();
  const result = await supabase.from("pharmacies").select("*").is("archived_at", null).order("pharmacy_name");

  if (result.error) throw result.error;
  return (result.data || []).map((pharmacy: PharmacyRow) => normalizePharmacyRow(pharmacy));
}

function emptyDashboardData(): DashboardData {
  return {
    stats: {
      total_products: 0,
      low_stock_items: 0,
      out_of_stock_items: 0,
      reorder_level_unconfigured_items: 0,
      expiring_soon_batches: 0,
      expiry_warning_days: 30,
      total_inventory_value: 0,
      todays_sales: 0,
      month_sales: 0,
      todays_gross_profit: 0,
      month_gross_profit: 0,
      month_expenses: 0,
      month_net_profit: 0,
      todays_profit_incomplete_sales: 0,
      month_profit_incomplete_sales: 0,
      best_selling_products: [],
    },
    products: [],
    batches: [],
    expiringBatches: [],
    sales: [],
    adjustments: [],
  };
}

async function getDashboardStats(pharmacyId: string, options: { includeFinancials?: boolean } = {}): Promise<DashboardStats> {
  const supabase = getSupabaseAdmin();
  const settingsResult = await supabase.from("pharmacy_settings").select("expiry_warning_days, timezone").eq("pharmacy_id", pharmacyId).maybeSingle();
  if (settingsResult.error) throw settingsResult.error;
  let timeZone = settingsResult.data?.timezone || "Africa/Dar_es_Salaam";
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
  } catch {
    timeZone = "Africa/Dar_es_Salaam";
  }
  const today = getTodayRange(timeZone);
  const month = getMonthRange(timeZone);
  const includeFinancials = options.includeFinancials !== false;
  const [
    productsCountResult,
    lowStockResult,
    outOfStockResult,
    reorderUnconfiguredResult,
    expiringSoonResult,
    inventoryValueResult,
    todaysSalesResult,
    monthSalesResult,
    monthExpensesResult,
  ] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("pharmacy_id", pharmacyId),
    supabase.from("product_stock_summary").select("id", { count: "exact", head: true }).eq("pharmacy_id", pharmacyId).eq("stock_status", "LOW STOCK"),
    supabase.from("product_stock_summary").select("id", { count: "exact", head: true }).eq("pharmacy_id", pharmacyId).eq("stock_status", "OUT OF STOCK"),
    supabase.from("product_stock_summary").select("id", { count: "exact", head: true }).eq("pharmacy_id", pharmacyId).eq("reorder_level_configured", false),
    supabase.from("batch_expiry_summary").select("id", { count: "exact", head: true }).eq("pharmacy_id", pharmacyId).eq("expiry_status", "EXPIRING SOON").gt("available_stock", 0),
    supabase.from("product_stock_summary").select("id, product_name, available_stock, derived_unit_cost").eq("pharmacy_id", pharmacyId),
    supabase.from("sales").select("id, product_id, units_sold, total_sale").eq("pharmacy_id", pharmacyId).is("voided_at", null).gte("created_at", today.start).lt("created_at", today.end),
    supabase.from("sales").select("id, product_id, units_sold, total_sale").eq("pharmacy_id", pharmacyId).is("voided_at", null).gte("created_at", month.start).lt("created_at", month.end),
    includeFinancials
      ? supabase.from("expenses").select("amount").eq("pharmacy_id", pharmacyId).gte("expense_date", month.startDate).lt("expense_date", month.endDate)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (productsCountResult.error) throw productsCountResult.error;
  if (lowStockResult.error) throw lowStockResult.error;
  if (outOfStockResult.error) throw outOfStockResult.error;
  if (reorderUnconfiguredResult.error) throw reorderUnconfiguredResult.error;
  if (expiringSoonResult.error) throw expiringSoonResult.error;
  if (inventoryValueResult.error) throw inventoryValueResult.error;
  if (todaysSalesResult.error) throw todaysSalesResult.error;
  if (monthSalesResult.error) throw monthSalesResult.error;
  if (monthExpensesResult.error) throw monthExpensesResult.error;

  const costByProductId = new Map(
    (inventoryValueResult.data || []).map((product) => [
      product.id,
      {
        product_name: product.product_name,
        derived_unit_cost: normalizeNumber(product.derived_unit_cost),
      },
    ]),
  );
  const todaysSales = todaysSalesResult.data || [];
  const monthSales = monthSalesResult.data || [];
  const allocationSaleIds = Array.from(new Set([...todaysSales, ...monthSales].map((sale) => sale.id)));
  let saleAllocations: SaleBatchAllocationRow[] = [];
  if (includeFinancials && allocationSaleIds.length > 0) {
    const allocationResult = await supabase
      .from("sale_batch_allocations")
      .select("sale_id, quantity, cost_of_goods_sold")
      .eq("pharmacy_id", pharmacyId)
      .in("sale_id", allocationSaleIds);
    if (allocationResult.error) throw allocationResult.error;
    saleAllocations = (allocationResult.data || []) as SaleBatchAllocationRow[];
  }
  const bestSellingByProduct = new Map<string, { product_id: string; product_name: string; units_sold: number; total_sale: number }>();

  monthSales.forEach((sale) => {
    const product = costByProductId.get(sale.product_id);
    const current = bestSellingByProduct.get(sale.product_id) || {
      product_id: sale.product_id,
      product_name: product?.product_name || "Unknown product",
      units_sold: 0,
      total_sale: 0,
    };

    current.units_sold += normalizeNumber(sale.units_sold);
    current.total_sale += normalizeNumber(sale.total_sale);
    bestSellingByProduct.set(sale.product_id, current);
  });

  const todaysProfit = includeFinancials ? summarizeExactGrossProfit(todaysSales, saleAllocations) : null;
  const monthProfit = includeFinancials ? summarizeExactGrossProfit(monthSales, saleAllocations) : null;
  const todaysGrossProfit = todaysProfit?.grossProfit || 0;
  const monthGrossProfit = monthProfit?.grossProfit || 0;
  const monthExpenses = includeFinancials
    ? (monthExpensesResult.data || []).reduce((total, expense) => total + normalizeNumber(expense.amount), 0)
    : 0;

  return {
    total_products: productsCountResult.count || 0,
    low_stock_items: lowStockResult.count || 0,
    out_of_stock_items: outOfStockResult.count || 0,
    reorder_level_unconfigured_items: reorderUnconfiguredResult.count || 0,
    expiring_soon_batches: expiringSoonResult.count || 0,
    expiry_warning_days: normalizeExpiryWarningDays(settingsResult.data?.expiry_warning_days),
    total_inventory_value: (inventoryValueResult.data || []).reduce(
      (total, product) => total + normalizeNumber(product.available_stock) * normalizeNumber(product.derived_unit_cost),
      0,
    ),
    todays_sales: todaysSales.reduce((total, sale) => total + normalizeNumber(sale.total_sale), 0),
    month_sales: monthSales.reduce((total, sale) => total + normalizeNumber(sale.total_sale), 0),
    todays_gross_profit: todaysGrossProfit,
    month_gross_profit: monthGrossProfit,
    month_expenses: monthExpenses,
    month_net_profit: monthGrossProfit - monthExpenses,
    todays_profit_incomplete_sales: todaysProfit?.incompleteSales || 0,
    month_profit_incomplete_sales: monthProfit?.incompleteSales || 0,
    best_selling_products: Array.from(bestSellingByProduct.values())
      .sort((a, b) => b.units_sold - a.units_sold)
      .slice(0, 5),
  };
}

export async function getDashboardData(pharmacyId?: string, options: { includeFinancials?: boolean } = {}): Promise<DashboardData> {
  if (!pharmacyId) return emptyDashboardData();

  const supabase = getSupabaseAdmin();
  const [stats, productsResult, batchesResult, salesResult, adjustmentsResult] = await Promise.all([
    getDashboardStats(pharmacyId, options),
    supabase.from("product_stock_summary").select("*").eq("pharmacy_id", pharmacyId).order("product_name"),
    supabase.from("batch_expiry_summary").select("*").eq("pharmacy_id", pharmacyId).order("expiry_date", { ascending: true }),
    supabase
      .from("sales")
      .select("*, product:products(*)")
      .eq("pharmacy_id", pharmacyId)
      .order("created_at", { ascending: false }),
    supabase
      .from("inventory_adjustments")
      .select("*, product:products(*), batch:inventory_batches(*), creator:pharmacy_users!inventory_adjustments_created_by_fkey(full_name)")
      .eq("pharmacy_id", pharmacyId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (productsResult.error) throw productsResult.error;
  if (batchesResult.error) throw batchesResult.error;
  if (salesResult.error) throw salesResult.error;
  if (adjustmentsResult.error) throw adjustmentsResult.error;

  const products = (productsResult.data || []).map((product) => normalizeProduct(product));
  const productById = new Map<string, Product>(products.map((product) => [product.id, product]));

  const batchRows: BatchExpirySummaryRow[] = batchesResult.data || [];
  const batches = batchRows
    .map<BatchWithProduct | null>((batch) => {
      const product = productById.get(batch.product_id);
      if (!product) return null;

      return {
        id: batch.id,
        pharmacy_id: batch.pharmacy_id,
        product_id: batch.product_id,
        batch_number: batch.batch_number,
        expiry_date: batch.expiry_date,
        packs_received: normalizeNumber(batch.packs_received),
        units_per_pack: normalizeNumber(batch.units_per_pack),
        total_units_received: normalizeNumber(batch.total_units_received),
        buying_price_per_pack: normalizeNumber(batch.buying_price_per_pack),
        derived_unit_cost: normalizeOptionalNumber(batch.derived_unit_cost),
        available_stock: normalizeNumber(batch.available_stock),
        created_at: batch.created_at,
        product,
        expiry_status: batch.expiry_status as ExpiryStatus,
        days_to_expiry: getDaysToExpiry(batch.expiry_date),
      };
    })
    .filter((batch): batch is BatchWithProduct => Boolean(batch));

  const saleRows = (salesResult.data || []) as SaleWithProductRow[];
  const sales = saleRows.map<SaleWithProduct>((sale) => {
    const product = Array.isArray(sale.product) ? sale.product[0] : sale.product;

    return {
      id: sale.id,
      pharmacy_id: sale.pharmacy_id,
      transaction_id: sale.transaction_id,
      line_number: sale.line_number,
      product_id: sale.product_id,
      sell_type: sale.sell_type,
      quantity_entered: normalizeNumber(sale.quantity_entered),
      units_sold: normalizeNumber(sale.units_sold),
      quantity_sold: normalizeNumber(sale.quantity_sold),
      default_price: normalizeNumber(sale.default_price),
      override_price: sale.override_price === null ? null : normalizeNumber(sale.override_price),
      override_total: sale.override_total === null ? null : normalizeNumber(sale.override_total),
      effective_price: normalizeNumber(sale.effective_price),
      final_selling_price: sale.final_selling_price === null ? null : normalizeNumber(sale.final_selling_price),
      effective_selling_price: normalizeNumber(sale.effective_selling_price),
      total_sale: normalizeNumber(sale.total_sale),
      override_flag: sale.override_flag,
      created_at: sale.created_at,
      voided_at: sale.voided_at,
      voided_by: sale.voided_by,
      void_reason: sale.void_reason,
      product: product as Product,
    };
  });

  const adjustments = ((adjustmentsResult.data || []) as AdjustmentWithDetailsRow[]).map<InventoryAdjustmentWithDetails>((adjustment) => {
    const product = Array.isArray(adjustment.product) ? adjustment.product[0] : adjustment.product;
    const batch = Array.isArray(adjustment.batch) ? adjustment.batch[0] : adjustment.batch;
    const creator = Array.isArray(adjustment.creator) ? adjustment.creator[0] : adjustment.creator;
    return {
      id: adjustment.id,
      pharmacy_id: adjustment.pharmacy_id,
      product_id: adjustment.product_id,
      inventory_batch_id: adjustment.inventory_batch_id,
      created_by: adjustment.created_by,
      reason: adjustment.reason,
      quantity: normalizeNumber(adjustment.quantity),
      stock_effect: adjustment.stock_effect,
      note: adjustment.note,
      created_at: adjustment.created_at,
      reversed_at: adjustment.reversed_at,
      reversed_by: adjustment.reversed_by,
      reversal_reason: adjustment.reversal_reason,
      product: product as Product,
      batch: batch || null,
      staff_name: creator?.full_name || "Former staff member",
    };
  });

  return {
    stats,
    products,
    batches,
    expiringBatches: batches.filter((batch) => batch.expiry_status !== "OK" && batch.available_stock > 0),
    sales,
    adjustments,
  };
}

export async function getExpensesForPharmacy(pharmacyId: string, month?: string): Promise<Expense[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase.from("expenses").select("*").eq("pharmacy_id", pharmacyId);

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const startDate = `${month}-01`;
    const end = new Date(`${startDate}T00:00:00.000Z`);
    end.setUTCMonth(end.getUTCMonth() + 1);
    query = query.gte("expense_date", startDate).lt("expense_date", end.toISOString().slice(0, 10));
  }

  const result = await query.order("expense_date", { ascending: false }).order("created_at", { ascending: false });
  if (result.error) throw result.error;

  return ((result.data || []) as ExpenseRow[]).map(normalizeExpense);
}

export async function getProductDetail(id: string, pharmacyId?: string) {
  const data = await getDashboardData(pharmacyId);
  const product = data.products.find((item) => item.id === id);
  if (!product) return null;

  return {
    product,
    batches: data.batches.filter((batch) => batch.product_id === id),
    sales: data.sales.filter((sale) => sale.product_id === id),
  };
}

export async function getSaleDetail(id: string, pharmacyId?: string) {
  const data = await getDashboardData(pharmacyId);
  const sale = data.sales.find((item) => item.id === id);
  return sale ? { sale } : null;
}
