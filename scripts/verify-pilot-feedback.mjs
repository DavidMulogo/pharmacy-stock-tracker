import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/040_pilot_feedback.sql", "utf8");
const pharmacyApi = readFileSync("src/app/api/feedback/route.ts", "utf8");
const adminApi = readFileSync("src/app/api/admin/feedback/route.ts", "utf8");
const client = readFileSync("src/app/feedback/feedback-client.tsx", "utf8");

assert.match(migration, /pharmacy_id uuid not null references public\.pharmacies/, "feedback is tenant-scoped");
assert.match(migration, /submitted_by uuid references public\.pharmacy_users/, "reporter is linked to staff identity");
assert.match(migration, /revoke all on public\.pilot_feedback from anon, authenticated/, "clients cannot bypass server authorization");
assert.match(pharmacyApi, /eq\("pharmacy_id", session\.pharmacy\.id\)/, "pharmacy reads are restricted to session tenant");
assert.match(pharmacyApi, /submitted_by: session\.user\.id/, "server derives reporter from the session");
assert.match(pharmacyApi, /request\.headers\.get\("user-agent"\)/, "device context is captured automatically");
assert.match(adminApi, /authenticateAdminFromCookie/, "admin queue requires authenticated admin");
assert.match(client, /Do not include patient names/, "form warns against sensitive patient data");
console.log("Pilot feedback verification passed.");
