import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/027_sale_transactions.sql", import.meta.url), "utf8");

assert.match(migration, /create table if not exists public\.sale_transactions/i);
assert.match(migration, /create or replace function public\.create_sale_transaction_v1/i);
assert.match(migration, /for update/i);
assert.match(migration, /insert into public\.sale_batch_allocations/i);
assert.match(migration, /revoke all on function public\.create_sale_transaction_v1[\s\S]*from authenticated/i);
assert.match(migration, /grant execute on function public\.create_sale_transaction_v1[\s\S]*to service_role/i);

function completeCart(database, items) {
  const next = structuredClone(database);
  const allocations = [];
  let total = 0;

  for (const item of items) {
    const product = next.products.find((candidate) => candidate.id === item.product_id);
    if (!product) throw new Error("product missing");

    const units = item.sell_type === "PACK" ? item.quantity * product.units_per_pack : item.quantity;
    const productBatches = next.batches
      .filter((batch) => batch.product_id === product.id)
      .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
    const available = productBatches.reduce((sum, batch) => sum + batch.available, 0);
    if (units > available) throw new Error("insufficient stock");

    let remaining = units;
    for (const batch of productBatches) {
      if (remaining === 0) break;
      const quantity = Math.min(remaining, batch.available);
      batch.available -= quantity;
      remaining -= quantity;
      allocations.push({ product_id: product.id, batch_id: batch.id, quantity, cogs: quantity * batch.unit_cost });
    }

    const price = item.override_price ?? (item.sell_type === "PACK" ? product.pack_price : product.unit_price);
    total += item.quantity * price;
  }

  next.transactions.push({ item_count: items.length, total });
  next.allocations.push(...allocations);
  return next;
}

const initial = {
  products: [
    { id: "paracetamol", units_per_pack: 10, unit_price: 500, pack_price: 5000 },
    { id: "amoxicillin", units_per_pack: 20, unit_price: 1000, pack_price: 20000 },
  ],
  batches: [
    { id: "para-later", product_id: "paracetamol", expiry_date: "2027-06-01", available: 30, unit_cost: 300 },
    { id: "para-first", product_id: "paracetamol", expiry_date: "2027-01-01", available: 8, unit_cost: 250 },
    { id: "amox", product_id: "amoxicillin", expiry_date: "2027-03-01", available: 40, unit_cost: 700 },
  ],
  transactions: [],
  allocations: [],
};

const completed = completeCart(initial, [
  { product_id: "paracetamol", sell_type: "UNIT", quantity: 10, override_price: null },
  { product_id: "amoxicillin", sell_type: "PACK", quantity: 1, override_price: 18000 },
]);

assert.equal(completed.transactions.length, 1);
assert.deepEqual(completed.transactions[0], { item_count: 2, total: 23000 });
assert.deepEqual(
  completed.allocations.map(({ batch_id, quantity }) => ({ batch_id, quantity })),
  [
    { batch_id: "para-first", quantity: 8 },
    { batch_id: "para-later", quantity: 2 },
    { batch_id: "amox", quantity: 20 },
  ],
);
assert.equal(initial.transactions.length, 0);
assert.equal(initial.batches.find((batch) => batch.id === "para-first").available, 8);

let failed = false;
try {
  completeCart(initial, [
    { product_id: "paracetamol", sell_type: "UNIT", quantity: 5, override_price: null },
    { product_id: "amoxicillin", sell_type: "PACK", quantity: 3, override_price: null },
  ]);
} catch (error) {
  failed = error instanceof Error && error.message === "insufficient stock";
}

assert.equal(failed, true);
assert.equal(initial.transactions.length, 0);
assert.equal(initial.allocations.length, 0);

console.log("Sale cart verification passed.");

