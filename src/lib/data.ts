import { getSupabaseAdmin } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { resolvePackPrice, resolveUnitPrice } from "@/lib/pricing";
import type { BatchWithProduct, DashboardData, DashboardStats, Expense, ExpiryStatus, Pharmacy, Product, ProductWithStock, SaleWithProduct } from "@/lib/types";

const millisecondsPerDay = 86_400_000;
type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type PharmacyRow = Database["public"]["Tables"]["pharmacies"]["Row"];
type ProductStockSummaryRow = Database["public"]["Views"]["product_stock_summary"]["Row"];
type BatchExpirySummaryRow = Database["public"]["Views"]["batch_expiry_summary"]["Row"];
type SaleRow = Database["public"]["Tables"]["sales"]["Row"];
type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"];
type SaleWithProductRow = SaleRow & {
  product: ProductRow | ProductRow[] | null;
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

function normalizeProduct(product: ProductStockSummaryRow): ProductWithStock {
  const rawUnitPrice = normalizeOptionalNumber(product.default_unit_price);
  const rawPackPrice = normalizeOptionalNumber(product.default_pack_price);
  const normalized = {
    ...product,
    units_per_pack: normalizeNumber(product.units_per_pack),
    default_selling_price: normalizeNumber(product.default_selling_price),
    default_unit_price: rawUnitPrice,
    default_pack_price: rawPackPrice,
    reorder_level: normalizeNumber(product.reorder_level),
    total_received: normalizeNumber(product.total_received),
    total_sold: normalizeNumber(product.total_sold),
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
    subscription_ends_at: pharmacy.subscription_ends_at,
    archived_at: pharmacy.archived_at,
    created_at: pharmacy.created_at,
  };
}

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function getMonthRange() {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
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
      expiring_soon_batches: 0,
      total_inventory_value: 0,
      todays_sales: 0,
      month_sales: 0,
      todays_gross_profit: 0,
      month_gross_profit: 0,
      month_expenses: 0,
      month_net_profit: 0,
      best_selling_products: [],
    },
    products: [],
    batches: [],
    expiringBatches: [],
    sales: [],
  };
}

async function getDashboardStats(pharmacyId: string, options: { includeFinancials?: boolean } = {}): Promise<DashboardStats> {
  const supabase = getSupabaseAdmin();
  const today = getTodayRange();
  const month = getMonthRange();
  const includeFinancials = options.includeFinancials !== false;
  const [
    productsCountResult,
    lowStockResult,
    outOfStockResult,
    expiringSoonResult,
    inventoryValueResult,
    todaysSalesResult,
    monthSalesResult,
    monthExpensesResult,
  ] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("pharmacy_id", pharmacyId),
    supabase.from("product_stock_summary").select("id", { count: "exact", head: true }).eq("pharmacy_id", pharmacyId).eq("stock_status", "LOW STOCK"),
    supabase.from("product_stock_summary").select("id", { count: "exact", head: true }).eq("pharmacy_id", pharmacyId).eq("stock_status", "OUT OF STOCK"),
    supabase.from("batch_expiry_summary").select("id", { count: "exact", head: true }).eq("pharmacy_id", pharmacyId).eq("expiry_status", "EXPIRING SOON"),
    supabase.from("product_stock_summary").select("id, product_name, available_stock, derived_unit_cost").eq("pharmacy_id", pharmacyId),
    supabase.from("sales").select("product_id, units_sold, total_sale").eq("pharmacy_id", pharmacyId).gte("created_at", today.start).lt("created_at", today.end),
    supabase.from("sales").select("product_id, units_sold, total_sale").eq("pharmacy_id", pharmacyId).gte("created_at", month.start).lt("created_at", month.end),
    includeFinancials
      ? supabase.from("expenses").select("amount").eq("pharmacy_id", pharmacyId).gte("expense_date", month.startDate).lt("expense_date", month.endDate)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (productsCountResult.error) throw productsCountResult.error;
  if (lowStockResult.error) throw lowStockResult.error;
  if (outOfStockResult.error) throw outOfStockResult.error;
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
  const calculateGrossProfit = (sales: { product_id: string; units_sold: number | string | null; total_sale: number | string | null }[]) =>
    includeFinancials
      ? sales.reduce((total, sale) => {
          const cost = costByProductId.get(sale.product_id)?.derived_unit_cost || 0;
          return total + normalizeNumber(sale.total_sale) - normalizeNumber(sale.units_sold) * cost;
        }, 0)
      : 0;
  const todaysSales = todaysSalesResult.data || [];
  const monthSales = monthSalesResult.data || [];
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

  const todaysGrossProfit = calculateGrossProfit(todaysSales);
  const monthGrossProfit = calculateGrossProfit(monthSales);
  const monthExpenses = includeFinancials
    ? (monthExpensesResult.data || []).reduce((total, expense) => total + normalizeNumber(expense.amount), 0)
    : 0;

  return {
    total_products: productsCountResult.count || 0,
    low_stock_items: lowStockResult.count || 0,
    out_of_stock_items: outOfStockResult.count || 0,
    expiring_soon_batches: expiringSoonResult.count || 0,
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
    best_selling_products: Array.from(bestSellingByProduct.values())
      .sort((a, b) => b.units_sold - a.units_sold)
      .slice(0, 5),
  };
}

export async function getDashboardData(pharmacyId?: string, options: { includeFinancials?: boolean } = {}): Promise<DashboardData> {
  if (!pharmacyId) return emptyDashboardData();

  const supabase = getSupabaseAdmin();
  const [stats, productsResult, batchesResult, salesResult] = await Promise.all([
    getDashboardStats(pharmacyId, options),
    supabase.from("product_stock_summary").select("*").eq("pharmacy_id", pharmacyId).order("product_name"),
    supabase.from("batch_expiry_summary").select("*").eq("pharmacy_id", pharmacyId).order("expiry_date", { ascending: true }),
    supabase
      .from("sales")
      .select("*, product:products(*)")
      .eq("pharmacy_id", pharmacyId)
      .order("created_at", { ascending: false }),
  ]);

  if (productsResult.error) throw productsResult.error;
  if (batchesResult.error) throw batchesResult.error;
  if (salesResult.error) throw salesResult.error;

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
      product_id: sale.product_id,
      sell_type: sale.sell_type,
      quantity_entered: normalizeNumber(sale.quantity_entered),
      units_sold: normalizeNumber(sale.units_sold),
      quantity_sold: normalizeNumber(sale.quantity_sold),
      default_price: normalizeNumber(sale.default_price),
      override_price: sale.override_price === null ? null : normalizeNumber(sale.override_price),
      effective_price: normalizeNumber(sale.effective_price),
      final_selling_price: sale.final_selling_price === null ? null : normalizeNumber(sale.final_selling_price),
      effective_selling_price: normalizeNumber(sale.effective_selling_price),
      total_sale: normalizeNumber(sale.total_sale),
      override_flag: sale.override_flag,
      created_at: sale.created_at,
      product: product as Product,
    };
  });

  return {
    stats,
    products,
    batches,
    expiringBatches: batches.filter((batch) => batch.expiry_status !== "OK"),
    sales,
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
