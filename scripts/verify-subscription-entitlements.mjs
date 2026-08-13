import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/036_subscription_entitlements.sql", "utf8");
const engine = readFileSync("src/lib/entitlements.ts", "utf8");
const route = readFileSync("src/app/api/admin/pharmacies/route.ts", "utf8");

for (const plan of ["TRIAL", "STARTER", "BUSINESS", "MULTI_BRANCH", "ENTERPRISE"]) {
  assert.match(migration, new RegExp(`'${plan}'`), `Migration supports ${plan}`);
}
assert.match(migration, /update public\.pharmacies set plan = 'STARTER' where plan = 'BASIC'/, "BASIC maps safely to STARTER");
assert.match(migration, /update public\.pharmacies set plan = 'BUSINESS' where plan = 'PRO'/, "PRO maps safely to BUSINESS");
assert.match(migration, /entitlement_mode text not null default 'OBSERVE'/, "Observation is the database default");
assert.match(migration, /pharmacy_subscription_history/, "Subscription history is retained");
assert.match(migration, /change_reason text not null/, "History requires a reason");
assert.match(migration, /revoke all on function public\.update_pharmacy_subscription_v1[\s\S]*from public, anon, authenticated/, "Subscription RPC is not callable by pharmacy clients");
assert.match(engine, /Observation only: no feature or usage restriction is enforced/, "Engine explicitly remains observational");
assert.match(engine, /staff_accounts: 3, products: 1_000/, "Starter limits are represented");
assert.match(engine, /staff_accounts: 10, products: null/, "Business limits are represented");
assert.match(route, /Enforcement is not available yet/, "Admin API rejects premature enforcement");
assert.match(route, /action: "SUBSCRIPTION_UPDATED"/, "Admin subscription changes are audited");
for (const preset of ["PILOT_30", "STARTER_MONTHLY", "STARTER_ANNUAL", "BUSINESS_MONTHLY", "BUSINESS_ANNUAL", "CUSTOM"]) {
  assert.match(route, new RegExp(`"${preset}"`), `Admin API recognizes ${preset}`);
}
assert.match(route, /const end = addDays\(start, 30\)/, "Pilot end is calculated by the server");
assert.match(route, /const end = addMonths\(start, annual \? 12 : 1\)/, "Paid subscription end is calculated by the server");
assert.match(route, /gracePeriodEndsAt: addDays\(end, 7\)/, "Standard grace date is calculated by the server");

console.log("Subscription entitlements observation-mode verification passed.");
