import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/037_master_medicine_catalog.sql", "utf8");
const route = readFileSync("src/app/api/onboarding/catalog/route.ts", "utf8");
const client = readFileSync("src/app/onboarding/onboarding-client.tsx", "utf8");

assert.match(migration, /create table if not exists public\.master_medicines/, "Master catalogue table exists");
assert.match(migration, /products_pharmacy_master_medicine_unique_idx/, "A pharmacy cannot import the same master medicine twice");
assert.match(migration, /revoke all on public\.master_medicines from anon, authenticated/, "Catalogue is not directly writable by pharmacy clients");
assert.match(route, /session\.role !== "OWNER"/, "Catalogue onboarding is Owner-only");
assert.match(route, /pharmacy_id: auth\.session\.pharmacy\.id/, "Imported products derive tenant from the session");
assert.match(route, /enter at least one selling price/, "Pharmacy-specific selling price is required");
assert.match(route, /Buying price/i, "Route source acknowledges buying-price separation");
assert.doesNotMatch(route, /medicine\.default_unit_price|medicine\.default_pack_price/, "Catalogue never supplies another pharmacy's prices");
assert.match(client, /Buying cost, batch number, quantity, and expiry are recorded later under Opening Stock/, "UI explains catalogue versus batch data");
assert.match(client, /Manual \/ CSV/, "Existing product onboarding options remain available");

console.log("Master medicine catalogue verification passed.");
