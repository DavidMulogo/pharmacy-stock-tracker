import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./seed-pilot-pharmacy.mjs", import.meta.url), "utf8");
assert.match(source, /if \(!args\.apply\)/, "seed must be dry-run by default");
assert.match(source, /existingPharmacy\.length \|\| existingCode\.length/, "seed must reject duplicate pharmacy identity");
assert.match(source, /role: "IN_CHARGE"/, "seed includes an In-Charge");
assert.match(source, /role: "PHARMACIST"/, "seed includes a Pharmacist");
assert.match(source, /role: "TECHNICIAN"/, "seed includes Technicians");
assert.match(source, /entitlement_mode: "OBSERVE"/, "pilot does not enforce subscription limits");
assert.match(source, /Products: 0; opening batches: 0/, "fresh pilot starts without tenant products or stock");
assert.match(source, /products_reviewed_at: null/, "product onboarding remains incomplete");
assert.match(source, /completed_at: null/, "pilot must complete real onboarding");
assert.doesNotMatch(source, /PRODUCT_CONFIG/, "seed does not silently prefill a pharmacy inventory");
assert.match(source, /Products, batches, sales, expenses, corrections, and feedback were intentionally not created/, "pilot analytics remain clean");
assert.match(source, /const tables = \[/, "rollback defines explicit tenant tables");
assert.match(source, /"inventory_batches",\s+"products"/, "rollback removes batch and product test data explicitly");
assert.match(source, /rollbackNewPilot\(supabase, pharmacyId\)/, "failed creation rolls back the new tenant");
console.log("Pilot pharmacy seed verification passed.");
