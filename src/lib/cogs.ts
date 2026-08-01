import type { Database } from "@/lib/database.types";
import { getSupabaseAdmin } from "@/lib/supabase";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;
type InventoryBatchRow = Database["public"]["Tables"]["inventory_batches"]["Row"];
type SaleBatchAllocationRow = Database["public"]["Tables"]["sale_batch_allocations"]["Row"];
type SaleBatchAllocationInsert = Database["public"]["Tables"]["sale_batch_allocations"]["Insert"];

type AllocationInput = {
  pharmacyId: string;
  productId: string;
  unitsSold: number;
  createdAt?: string;
};

type ExistingSaleForProfit = {
  id: string;
  total_sale: number | string | null;
  units_sold: number | string | null;
};

function normalizeNumber(value: number | string | null | undefined) {
  return Number(value || 0);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function unitCostForBatch(batch: Pick<InventoryBatchRow, "buying_price_per_pack" | "buying_price" | "units_per_pack">) {
  const buyingPricePerPack = normalizeNumber(batch.buying_price_per_pack ?? batch.buying_price);
  const unitsPerPack = normalizeNumber(batch.units_per_pack);
  return unitsPerPack > 0 ? buyingPricePerPack / unitsPerPack : 0;
}

export async function allocateSaleBatches(
  supabase: SupabaseAdmin,
  input: AllocationInput,
): Promise<Array<Omit<SaleBatchAllocationInsert, "sale_id">>> {
  const [batchesResult, allocationsResult] = await Promise.all([
    supabase
      .from("inventory_batches")
      .select("id, pharmacy_id, product_id, expiry_date, total_units_received, units_per_pack, buying_price, buying_price_per_pack, created_at")
      .eq("pharmacy_id", input.pharmacyId)
      .eq("product_id", input.productId)
      .order("expiry_date", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("sale_batch_allocations")
      .select("sale_id, inventory_batch_id, quantity")
      .eq("pharmacy_id", input.pharmacyId)
      .eq("product_id", input.productId),
  ]);

  if (batchesResult.error) throw batchesResult.error;
  if (allocationsResult.error) throw allocationsResult.error;

  const allocatedByBatch = new Map<string, number>();
  for (const allocation of allocationsResult.data || []) {
    allocatedByBatch.set(
      allocation.inventory_batch_id,
      (allocatedByBatch.get(allocation.inventory_batch_id) || 0) + normalizeNumber(allocation.quantity),
    );
  }

  const existingSalesResult = await supabase
    .from("sales")
    .select("id, units_sold")
    .eq("pharmacy_id", input.pharmacyId)
    .eq("product_id", input.productId);
  if (existingSalesResult.error) throw existingSalesResult.error;

  const allocatedBySaleId = new Map<string, number>();
  for (const allocation of allocationsResult.data || []) {
    allocatedBySaleId.set(allocation.sale_id, (allocatedBySaleId.get(allocation.sale_id) || 0) + normalizeNumber(allocation.quantity));
  }

  let unallocatedHistoricalUnits = 0;
  for (const sale of existingSalesResult.data || []) {
    unallocatedHistoricalUnits += Math.max(0, normalizeNumber(sale.units_sold) - (allocatedBySaleId.get(sale.id) || 0));
  }

  const batchAvailability = ((batchesResult.data || []) as InventoryBatchRow[]).map((batch) => ({
    batch,
    available: normalizeNumber(batch.total_units_received) - (allocatedByBatch.get(batch.id) || 0),
  }));

  for (const item of batchAvailability) {
    if (unallocatedHistoricalUnits <= 0) break;
    const reserved = Math.min(item.available, unallocatedHistoricalUnits);
    item.available -= reserved;
    unallocatedHistoricalUnits -= reserved;
  }

  let remainingUnits = input.unitsSold;
  const allocations: Array<Omit<SaleBatchAllocationInsert, "sale_id">> = [];

  for (const { batch, available } of batchAvailability) {
    if (remainingUnits <= 0) break;

    const availableInBatch = available;
    if (availableInBatch <= 0) continue;

    const quantity = Math.min(remainingUnits, availableInBatch);
    const unitCost = unitCostForBatch(batch);
    allocations.push({
      pharmacy_id: input.pharmacyId,
      product_id: input.productId,
      inventory_batch_id: batch.id,
      quantity,
      unit_cost_at_sale: unitCost,
      cost_of_goods_sold: roundMoney(quantity * unitCost),
      created_at: input.createdAt,
    });
    remainingUnits -= quantity;
  }

  if (remainingUnits > 0) {
    throw new Error(`Unable to allocate ${remainingUnits} units to inventory batches.`);
  }

  return allocations;
}

export function summarizeExactGrossProfit(
  sales: ExistingSaleForProfit[],
  allocations: Pick<SaleBatchAllocationRow, "sale_id" | "quantity" | "cost_of_goods_sold">[],
) {
  const allocationSummaryBySaleId = new Map<string, { quantity: number; costOfGoodsSold: number }>();
  for (const allocation of allocations) {
    const current = allocationSummaryBySaleId.get(allocation.sale_id) || { quantity: 0, costOfGoodsSold: 0 };
    current.quantity += normalizeNumber(allocation.quantity);
    current.costOfGoodsSold += normalizeNumber(allocation.cost_of_goods_sold);
    allocationSummaryBySaleId.set(allocation.sale_id, current);
  }

  let exactSalesRevenue = 0;
  let exactCostOfGoodsSold = 0;
  let incompleteSales = 0;

  for (const sale of sales) {
    const allocation = allocationSummaryBySaleId.get(sale.id);
    const unitsSold = normalizeNumber(sale.units_sold);
    if (!allocation || allocation.quantity !== unitsSold) {
      incompleteSales += 1;
      continue;
    }

    exactSalesRevenue += normalizeNumber(sale.total_sale);
    exactCostOfGoodsSold += allocation.costOfGoodsSold;
  }

  return {
    exactSalesRevenue,
    exactCostOfGoodsSold,
    grossProfit: exactSalesRevenue - exactCostOfGoodsSold,
    incompleteSales,
  };
}
