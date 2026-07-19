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

Admin sessions use a signed cookie and validate against active `admin_users` records.

## Subscription Enforcement

Subscription access is checked on login and existing session validation. The system blocks suspended accounts, expired trials, expired paid subscriptions, and explicit expired status. Allowed accounts near expiry can show warning banners in the app.

## Pharmacy Settings

Each pharmacy has one `pharmacy_settings` row containing business information, branding, inventory rules, sales rules, and localization. Settings APIs derive pharmacy ownership from the authenticated session.

## Reports

The `/reports` area is a protected pharmacy staff surface. Report APIs authenticate through the pharmacy session helper, derive `pharmacy_id` from the validated session, and enforce report permissions server-side.

Report access by role:

- `OWNER`: sales, inventory, expiry, price overrides, expenses/profit, and staff activity
- `PHARMACIST`: sales, inventory, expiry, price overrides, and expenses/profit
- `TECHNICIAN`: inventory and expiry only

CSV export is intentionally audited with `REPORT_EXPORTED`; ordinary report views and filter changes are not logged.

## Database Structure Overview

- `admin_users`: SaaS owner/admin accounts
- `pharmacies`: tenant root and subscription state
- `pharmacy_access`: pharmacy login code and legacy/shared access support
- `pharmacy_users`: individual pharmacy staff accounts
- `pharmacy_sessions`: authenticated pharmacy staff sessions
- `pharmacy_settings`: one-to-one pharmacy configuration
- `products`: pharmacy-scoped product catalog
- `inventory_batches`: pharmacy-scoped stock receiving batches
- `sales`: pharmacy-scoped sales history
- `expenses`: pharmacy-scoped operating expenses
- `activity_logs`: immutable pharmacy-scoped audit trail with actor snapshots
- `product_stock_summary`: stock aggregation view
- `batch_expiry_summary`: expiry aggregation view
- Reports are query-backed from the existing pharmacy-owned tables and views; no supplier or purchase report tables exist yet.

## Tenant Isolation Rules

- Protected pharmacy APIs authenticate through the pharmacy session helper.
- The server derives `pharmacy_id` from the session.
- Client-supplied `pharmacy_id` is not trusted for protected pharmacy operations.
- Admin APIs use the shared admin session helper.
- Default pharmacy lists exclude archived pharmacies.
- Archived pharmacies cannot log in and existing archived-pharmacy sessions are invalidated.
- Permanent deletion removes pharmacy-owned records by `pharmacy_id` before deleting the pharmacy row.
- Activity records derive pharmacy and actor identity from authenticated server sessions and are visible only to the pharmacy owner.
