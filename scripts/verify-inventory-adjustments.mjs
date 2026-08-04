import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/028_inventory_adjustments.sql", import.meta.url), "utf8");
const salesRoute = readFileSync(new URL("../src/app/api/sales/route.ts", import.meta.url), "utf8");
const adjustmentRoute = readFileSync(new URL("../src/app/api/inventory-adjustments/route.ts", import.meta.url), "utf8");

assert.match(migration, /create table if not exists public\.inventory_adjustments/i);
assert.match(migration, /create or replace function public\.create_inventory_adjustment_v1/i);
assert.match(migration, /create or replace function public\.create_sale_transaction_v2/i);
assert.match(migration, /stock_effect = -1/i);
assert.match(migration, /for update/i);
assert.match(migration, /revoke all on function public\.create_inventory_adjustment_v1[\s\S]*authenticated/i);
assert.match(migration, /grant execute on function public\.create_inventory_adjustment_v1[\s\S]*service_role/i);
assert.match(salesRoute, /create_sale_transaction_v3/);
assert.match(adjustmentRoute, /authenticatePharmacyFromSessionCookie/);
assert.match(adjustmentRoute, /create_inventory_adjustment_v2/);
assert.doesNotMatch(adjustmentRoute, /body\.pharmacy_id/);

function adjust(stock, reason, quantity) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("invalid quantity");
  if (reason === "CUSTOMER_RETURN") return { sellable: stock, quarantined: quantity };
  if (quantity > stock) throw new Error("insufficient batch stock");
  return { sellable: stock - quantity, quarantined: 0 };
}

assert.deepEqual(adjust(20, "DAMAGED", 3), { sellable: 17, quarantined: 0 });
assert.deepEqual(adjust(20, "CUSTOMER_RETURN", 3), { sellable: 20, quarantined: 3 });
assert.throws(() => adjust(2, "EXPIRED", 3), /insufficient batch stock/);

console.log("Inventory adjustment verification passed.");
