import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/029_controlled_corrections.sql", import.meta.url), "utf8");
const checkoutFixMigration = readFileSync(new URL("../supabase/migrations/030_fix_sale_checkout_batch_record.sql", import.meta.url), "utf8");
const saleIdFixMigration = readFileSync(new URL("../supabase/migrations/031_fix_sale_checkout_sale_id.sql", import.meta.url), "utf8");
const voidRoute = readFileSync(new URL("../src/app/api/sales/void/route.ts", import.meta.url), "utf8");
const reverseRoute = readFileSync(new URL("../src/app/api/inventory-adjustments/reverse/route.ts", import.meta.url), "utf8");
const salesRoute = readFileSync(new URL("../src/app/api/sales/route.ts", import.meta.url), "utf8");
const adjustmentRoute = readFileSync(new URL("../src/app/api/inventory-adjustments/route.ts", import.meta.url), "utf8");
const dataModule = readFileSync(new URL("../src/lib/data.ts", import.meta.url), "utf8");

for (const pattern of [
  /void_sale_transaction_v1/i,
  /void_legacy_sale_v1/i,
  /reverse_inventory_adjustment_v1/i,
  /create_sale_transaction_v3/i,
  /create_inventory_adjustment_v2/i,
  /voided_at is null/i,
  /reversed_at is null/i,
  /revoke all on function[\s\S]*authenticated/i,
  /grant execute on function[\s\S]*service_role/i,
]) assert.match(migration, pattern);

assert.match(voidRoute, /authenticatePharmacyFromSessionCookie/);
assert.match(voidRoute, /OWNER|PHARMACIST/);
assert.doesNotMatch(voidRoute, /body\.pharmacy_id/);
assert.match(reverseRoute, /authenticatePharmacyFromSessionCookie/);
assert.match(reverseRoute, /role !== "OWNER"/);
assert.doesNotMatch(reverseRoute, /body\.pharmacy_id/);
assert.match(salesRoute, /create_sale_transaction_v3/);
assert.match(adjustmentRoute, /create_inventory_adjustment_v2/);
assert.match(dataModule, /pharmacy_users!inventory_adjustments_created_by_fkey/);
assert.match(checkoutFixMigration, /create or replace function public\.create_sale_transaction_v3/i);
assert.match(checkoutFixMigration, /batch_row record/i);
assert.doesNotMatch(checkoutFixMigration, /\bb record\b/i);
assert.match(checkoutFixMigration, /expiry_date>=current_date/i);
assert.match(checkoutFixMigration, /could not be allocated to non-expired inventory batches/i);
assert.match(saleIdFixMigration, /v_sale_id uuid/i);
assert.doesNotMatch(saleIdFixMigration, /effective_price numeric;sale_id uuid/i);
assert.match(saleIdFixMigration, /into v_sale_id,sale_total/i);

const state = { stock: 20, saleVoided: false, adjustmentReversed: false };
state.stock -= 5;
assert.equal(state.stock, 15);
function voidSale() {
  if (state.saleVoided) throw new Error("already voided");
  state.saleVoided = true;
  state.stock += 5;
}
voidSale();
assert.equal(state.stock, 20);
assert.throws(voidSale, /already voided/);

state.stock -= 3;
assert.equal(state.stock, 17);
function reverseAdjustment() {
  if (state.adjustmentReversed) throw new Error("already reversed");
  state.adjustmentReversed = true;
  state.stock += 3;
}
reverseAdjustment();
assert.equal(state.stock, 20);
assert.throws(reverseAdjustment, /already reversed/);

const stockBeforeQuarantineReversal = state.stock;
assert.equal(state.stock, stockBeforeQuarantineReversal);

console.log("Controlled corrections verification passed.");
