# PharmaStock Architecture

## Overview

PharmaStock is a Next.js, TypeScript, Tailwind CSS, and Supabase application. It is currently a Phase 1 multi-tenant SaaS system where one deployment can manage multiple pharmacies while isolating each pharmacy's operational data.

## SaaS Multi-Tenant Model

The `pharmacies` table is the tenant root. Pharmacy-owned records include products, inventory batches, sales, expenses, activity logs, pharmacy users, sessions, settings, and access credentials. Application queries must derive the active pharmacy from an authenticated session rather than trusting client-supplied tenant ids.

## Admin Portal

The `/admin` area is separate from pharmacy login. Admin users authenticate through database-backed admin accounts with bcrypt password checks and signed admin cookies. Admins manage pharmacies, subscriptions, archive/restore state, and super-admin permanent deletion.

## Pharmacy Login

Pharmacy staff log in with pharmacy code, username, and password. The pharmacy code resolves the tenant, while the username identifies the staff member inside that tenant. Archived, suspended, expired, or subscription-blocked pharmacies cannot access the system.

## Staff Login

Staff accounts live in `pharmacy_users` and belong to one pharmacy. Roles include `OWNER`, `PHARMACIST`, and `TECHNICIAN`. Owners can manage staff. Sessions include pharmacy id, staff user id, and role for future auditing.

## Sessions

Pharmacy sessions are stored in `pharmacy_sessions` and mirrored by HttpOnly cookies. Server helpers validate the cookie, session expiry, linked pharmacy, active staff user, and subscription access before returning authenticated pharmacy context.

Admin sessions use a signed cookie and validate against active `admin_users` records. The cookie includes `session_version`; changing an admin password increments the database version so existing cookies are rejected on the next admin request. Production requires an explicit `ADMIN_SESSION_SECRET`.

Admin login protection is stored on `admin_users` through `failed_login_attempts` and `locked_until`. Five failed attempts lock the account for 15 minutes. Successful login resets the counters. Admin bootstrap is one-time only, token-protected, and reads all bootstrap identity and password values from server-only environment variables.

## Subscription Enforcement

Subscription access is checked on login and existing session validation. The system blocks suspended accounts, expired trials, expired paid subscriptions, and explicit expired status. Allowed accounts near expiry can show warning banners in the app.

## Pharmacy Settings

Each pharmacy has one `pharmacy_settings` row containing business information, branding, inventory rules, sales rules, and localization. Settings APIs derive pharmacy ownership from the authenticated session.

## Onboarding

Each pharmacy can have one `pharmacy_onboarding` row. It stores when setup steps were reviewed and when onboarding was completed. Operational readiness is never trusted from the client: product and opening-stock requirements are computed from tenant-scoped `products` and `inventory_batches` counts.

The `/onboarding` page and `/api/onboarding` are OWNER-only and derive pharmacy and actor identity from the pharmacy session. Existing pharmacies are not blocked from selling or stock work; incomplete setup appears as a persistent guidance banner for Owners. Admin pharmacy lists show computed onboarding progress, but admin users cannot falsely mark product or stock requirements complete.

## Notifications

Notifications are tenant-scoped rows in `notifications` with deterministic `pharmacy_id + dedupe_key` uniqueness. The server synchronizes alerts from real product stock, batch expiry, pharmacy settings, and subscription state. Conditions that remain active update `last_seen_at`; conditions that disappear are marked `RESOLVED`; returning conditions reactivate through the same dedupe key.

Dashboard and notification page loads trigger sync in v1, and users can manually refresh from `/notifications`. There is no external scheduler, email, or SMS delivery yet. Notification APIs derive pharmacy and role from the session, validate notification ownership before marking read, and filter subscription alerts away from technicians server-side.

## Reports

The `/reports` area is a protected pharmacy staff surface. Report APIs authenticate through the pharmacy session helper, derive `pharmacy_id` from the validated session, and enforce report permissions server-side.

Report access by role:

- `OWNER`: sales, inventory, expiry, price overrides, expenses/profit, and staff activity
- `PHARMACIST`: sales, inventory, expiry, price overrides, and expenses/profit
- `TECHNICIAN`: inventory and expiry only

CSV export is intentionally audited with `REPORT_EXPORTED`; ordinary report views and filter changes are not logged.

## Backup

The `/backup` area is restricted to pharmacy `OWNER` accounts. Backup APIs authenticate through the pharmacy session helper, derive `pharmacy_id` and actor identity from the session, and never accept tenant identifiers from the client.

Backup export is generated server-side as one JSON file. Included datasets are pharmacy profile, pharmacy settings, products, inventory batches, sales, expenses, staff metadata, and activity logs. Excluded data includes password hashes, plain-text passwords, session tokens, cookies, admin users, admin credentials, and pharmacy access credentials.

Each backup has `format: "pharmastock-backup"`, `schema_version: 1`, record counts, and a deterministic SHA-256 checksum over the payload. Validation checks format, schema version, pharmacy identity, required datasets, record counts, and checksum.

Successful explicit backup exports log `BACKUP_EXPORTED`. Successful validations log `BACKUP_VALIDATED`. Activity metadata stores only high-level counts and checksum status, never the full backup payload.

Admin Restore v1 lives inside `/admin` and uses the admin session helper, not pharmacy staff auth. The selected target pharmacy, backup pharmacy id, and existing database pharmacy must match. Restore is merge-only and non-destructive: it inserts missing pharmacy settings, products, inventory batches, sales, and expenses while skipping existing records. Staff metadata and historical pharmacy activity logs from backups are unsupported and are never restored. Sessions, cookies, pharmacy access credentials, password hashes, plain-text passwords, admin users, and admin credentials are never restored.

The actual restore write uses the `restore_pharmastock_backup_v1` PostgreSQL RPC so inserts run atomically and roll back on failure. Execute permission is revoked from `anon` and `authenticated`; server code calls it with the service role. Admin restore attempts are recorded in `admin_activity_logs` with admin identity, target pharmacy, backup checksum, restored/skipped counts, success state, and error message, but never the uploaded payload.

## Database Structure Overview

- `admin_users`: SaaS owner/admin accounts
- `admin_activity_logs`: SaaS-owner audit trail for admin actions such as backup restore
- `pharmacies`: tenant root and subscription state
- `pharmacy_access`: pharmacy login code and legacy/shared access support
- `pharmacy_users`: individual pharmacy staff accounts
- `pharmacy_sessions`: authenticated pharmacy staff sessions
- `pharmacy_settings`: one-to-one pharmacy configuration
- `pharmacy_onboarding`: tenant-scoped setup review and completion timestamps
- `notifications`: tenant-scoped in-app alert inbox with active, unread, and resolved states
- `products`: pharmacy-scoped product catalog
- `inventory_batches`: pharmacy-scoped stock receiving batches
- `sales`: pharmacy-scoped sales history
- `expenses`: pharmacy-scoped operating expenses
- `activity_logs`: immutable pharmacy-scoped audit trail with actor snapshots
- `product_stock_summary`: stock aggregation view
- `batch_expiry_summary`: expiry aggregation view
- Reports are query-backed from the existing pharmacy-owned tables and views; no supplier or purchase report tables exist yet.
- Backup export is query-backed from existing pharmacy-owned tables and does not require separate backup tables.
- Admin restore is merge-only through `restore_pharmastock_backup_v1` and writes admin audit rows to `admin_activity_logs`.

## Tenant Isolation Rules

- Protected pharmacy APIs authenticate through the pharmacy session helper.
- The server derives `pharmacy_id` from the session.
- Client-supplied `pharmacy_id` is not trusted for protected pharmacy operations.
- Admin APIs use the shared admin session helper.
- Default pharmacy lists exclude archived pharmacies.
- Archived pharmacies cannot log in and existing archived-pharmacy sessions are invalidated.
- Permanent deletion removes pharmacy-owned records by `pharmacy_id` before deleting the pharmacy row.
- Activity records derive pharmacy and actor identity from authenticated server sessions and are visible only to the pharmacy owner.
- Onboarding completion derives required operational checks from server-side tenant data, not client flags.
- Notification generation and read actions derive tenant and role from authenticated sessions.
