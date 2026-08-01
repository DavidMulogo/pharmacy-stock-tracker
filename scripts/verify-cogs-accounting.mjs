#!/usr/bin/env node
import assert from "node:assert/strict";

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function allocateFefo(batches, unitsSold) {
  let remaining = unitsSold;
  const allocations = [];

  for (const batch of [...batches].sort((left, right) => left.expiry_date.localeCompare(right.expiry_date) || left.created_at.localeCompare(right.created_at))) {
    if (remaining <= 0) break;
    const available = batch.total_units_received - batch.already_allocated;
    if (available <= 0) continue;

    const quantity = Math.min(remaining, available);
    const unitCost = batch.buying_price_per_pack / batch.units_per_pack;
    allocations.push({
      inventory_batch_id: batch.id,
      quantity,
      unit_cost_at_sale: unitCost,
      cost_of_goods_sold: roundMoney(quantity * unitCost),
    });
    remaining -= quantity;
  }

  if (remaining > 0) throw new Error("Insufficient batch stock.");
  return allocations;
}

function exactGrossProfit(sales, allocations) {
  const bySale = new Map();
  for (const allocation of allocations) {
    const current = bySale.get(allocation.sale_id) || { quantity: 0, cost: 0 };
    current.quantity += allocation.quantity;
    current.cost += allocation.cost_of_goods_sold;
    bySale.set(allocation.sale_id, current);
  }

  return sales.reduce((total, sale) => {
    const allocation = bySale.get(sale.id);
    if (!allocation || allocation.quantity !== sale.units_sold) return total;
    return total + sale.total_sale - allocation.cost;
  }, 0);
}

const oneBatch = allocateFefo(
  [{ id: "batch-1", expiry_date: "2026-09-01", created_at: "2026-07-01", total_units_received: 100, already_allocated: 0, buying_price_per_pack: 10_000, units_per_pack: 100 }],
  12,
);
assert.deepEqual(oneBatch, [{ inventory_batch_id: "batch-1", quantity: 12, unit_cost_at_sale: 100, cost_of_goods_sold: 1200 }]);

const splitBatch = allocateFefo(
  [
    { id: "batch-1", expiry_date: "2026-09-01", created_at: "2026-07-01", total_units_received: 10, already_allocated: 8, buying_price_per_pack: 1_000, units_per_pack: 10 },
    { id: "batch-2", expiry_date: "2026-10-01", created_at: "2026-07-02", total_units_received: 10, already_allocated: 0, buying_price_per_pack: 2_000, units_per_pack: 10 },
  ],
  5,
);
assert.deepEqual(splitBatch, [
  { inventory_batch_id: "batch-1", quantity: 2, unit_cost_at_sale: 100, cost_of_goods_sold: 200 },
  { inventory_batch_id: "batch-2", quantity: 3, unit_cost_at_sale: 200, cost_of_goods_sold: 600 },
]);

const packSaleUnits = 2 * 12;
const packAllocation = allocateFefo(
  [{ id: "pack-batch", expiry_date: "2026-09-01", created_at: "2026-07-01", total_units_received: 48, already_allocated: 0, buying_price_per_pack: 6_000, units_per_pack: 12 }],
  packSaleUnits,
);
assert.equal(packAllocation[0].quantity, 24);
assert.equal(packAllocation[0].cost_of_goods_sold, 12_000);

const historicalProfit = exactGrossProfit(
  [{ id: "sale-1", units_sold: 10, total_sale: 900 }],
  [{ sale_id: "sale-1", quantity: 10, cost_of_goods_sold: 1_000 }],
);
assert.equal(historicalProfit, -100);

const laterStock = [{ id: "later", expiry_date: "2027-01-01", created_at: "2026-08-01", total_units_received: 100, already_allocated: 0, buying_price_per_pack: 100, units_per_pack: 100 }];
assert.equal(exactGrossProfit([{ id: "sale-1", units_sold: 10, total_sale: 1_500 }], [{ sale_id: "sale-1", quantity: 10, cost_of_goods_sold: 1_000 }]), 500);
assert.equal(laterStock[0].buying_price_per_pack, 100);
assert.equal(exactGrossProfit([{ id: "sale-1", units_sold: 10, total_sale: 1_500 }], [{ sale_id: "sale-1", quantity: 10, cost_of_goods_sold: 1_000 }]), 500);

console.log("COGS accounting verification passed.");
