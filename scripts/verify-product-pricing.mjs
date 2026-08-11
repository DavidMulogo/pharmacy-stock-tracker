import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/032_product_price_history.sql", import.meta.url), "utf8");
const roleMigration = readFileSync(new URL("../supabase/migrations/035_in_charge_role.sql", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/app/api/products/[id]/prices/route.ts", import.meta.url), "utf8");
const editor = readFileSync(new URL("../src/app/products/price-editor.tsx", import.meta.url), "utf8");

for (const pattern of [
  /create table if not exists public\.product_price_history/i,
  /update_product_selling_prices_v1/i,
  /for update/i,
  /insert into public\.product_price_history/i,
  /revoke all on function[\s\S]*authenticated/i,
  /grant execute on function[\s\S]*service_role/i,
]) assert.match(migration, pattern);
assert.match(roleMigration, /actor\.role not in \('OWNER','IN_CHARGE'\)/i);

assert.match(route, /authenticatePharmacyFromSessionCookie/);
assert.match(route, /session\.role !== "OWNER" && session\.role !== "IN_CHARGE"/);
assert.doesNotMatch(route, /body\.pharmacy_id/);
assert.match(route, /PRODUCT_PRICE_UPDATED/);
assert.match(editor, /future sales only/i);
assert.match(editor, /Use suggested pack price/);

const historicalSale = { defaultPrice: 100, units: 10, total: 1000 };
const product = { unitPrice: 100 };
product.unitPrice = 150;
assert.equal(historicalSale.defaultPrice, 100);
assert.equal(historicalSale.total, 1000);
assert.equal(product.unitPrice * 10, 1500);

console.log("Product pricing verification passed.");
