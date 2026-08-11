import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/034_admin_password_reset_audit.sql", import.meta.url), "utf8");
const userRoute = readFileSync(new URL("../src/app/api/admin/pharmacy-users/route.ts", import.meta.url), "utf8");
const pharmacyRoute = readFileSync(new URL("../src/app/api/admin/pharmacies/route.ts", import.meta.url), "utf8");
const portal = readFileSync(new URL("../src/app/admin/admin-portal.tsx", import.meta.url), "utf8");

assert.match(migration, /add column if not exists metadata jsonb/i);
assert.match(userRoute, /requireAdminSession/);
assert.match(userRoute, /select\("id, pharmacy_id, full_name, username, role, active, last_login_at"\)/);
assert.doesNotMatch(userRoute, /select\([^\n]*password_hash/);
assert.match(userRoute, /bcrypt\.hash\(password, 12\)/);
assert.match(userRoute, /pharmacy_sessions"\)\.delete\(\)\.eq\("pharmacy_user_id", userId\)/);
assert.match(userRoute, /STAFF_PASSWORD_RESET/);
assert.doesNotMatch(userRoute, /metadata:[^\n]*password/i);
assert.match(pharmacyRoute, /OWNER_PASSWORD_RESET/);
assert.match(pharmacyRoute, /pharmacy_sessions"\)\.delete\(\)\.in\("pharmacy_user_id", ownerIds\)/);
assert.match(portal, /Staff access/);
assert.match(portal, /Reset owner password/);

console.log("Admin password recovery verification passed.");
