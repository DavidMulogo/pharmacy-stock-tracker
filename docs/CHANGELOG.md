# Changelog

## v0.7.0-alpha

### Added

- Approved commercial subscription definition for Starter, Business, future Multi-Branch, and Enterprise plans, including pilot pricing, entitlement boundaries, annual pricing, expiry policy, and data-safety rules; enforcement is not implemented yet
- Subscription Entitlements v1 observation mode with legacy-plan migration, billing/pilot/founding/extension fields, central feature and usage calculations, Admin subscription controls, required change reasons, immutable history, and explicit rejection of premature enforcement
- Onboarding v1 with owner-only setup checklist, persistent setup banner, server-calculated progress, and admin onboarding visibility
- In-App Notifications v1 with stock, expiry, subscription alerts, unread counts, filters, read actions, and admin summary badges
- Admin Security v1 with Change Password, stronger admin password policy, account lockout, session-version invalidation, secure one-time bootstrap, and admin login/logout/password audit events
- Reports v1 with sales, inventory, expiry, price override, expenses/profit, and staff activity reports
- CSV export from each permitted report
- Owner-only pharmacy backup export as a JSON file
- Backup validation with format, schema version, pharmacy identity, dataset, record count, and checksum checks
- Admin Restore v1 for merge-only backup recovery
- Admin restore audit log table and `BACKUP_RESTORED` admin action
- Business analytics with sales, gross profit, expenses, net profit, and best-selling products
- Owner-only expense ledger
- Tenant-scoped activity log migration and audit helper
- Owner-only activity viewer with action, staff, and date filters
- Audit events for login/logout, sales, stock receipts, CSV imports, expenses, settings, and staff management
- `REPORT_EXPORTED` audit action for explicit report exports
- `BACKUP_EXPORTED` and `BACKUP_VALIDATED` audit actions for successful explicit backup actions
- `ONBOARDING_STARTED`, `ONBOARDING_STEP_REVIEWED`, and `ONBOARDING_COMPLETED` activity events
- Multi-item sales cart with one atomic checkout, per-item pricing, quantity controls, and transaction grouping
- `sale_transactions`, sale-line transaction links, and service-role-only `create_sale_transaction_v1` RPC
- Inventory Adjustments v1 for damaged, expired, supplier-returned, missing, internally used, other, and quarantined customer-return stock
- Batch-safe adjustment RPC, immutable adjustment history, staff audit events, and adjustment-aware stock calculations
- Controlled Corrections v1 with soft sale voids, inventory-adjustment reversals, mandatory reasons, and correction audit events
- Product Selling Prices v1 with owner-only normal unit/pack price editing and automatic price history
- Final-total sale overrides so staff enter the exact negotiated line amount without calculating a per-unit override
- Admin-assisted OWNER and employee password recovery with individual staff selection
- Dedicated `IN_CHARGE` role with one active In-Charge per pharmacy and operational management permissions

### Improved

- Sales history and sales reports now group cart lines by transaction while retaining line-level product details
- Dashboard inventory, notifications, expiry availability, sales checkout, inventory reports, and new backups account for stock adjustments
- Stock, revenue, profit, reports, notifications, and checkout now consistently exclude voided sales and reversed adjustments
- Checkout no longer has PL/pgSQL record/column name collisions and never allocates a new sale to an expired batch
- Dashboard day and month totals now use each pharmacy's configured timezone instead of the Vercel server timezone
- Normal price changes apply only to future sales; historical sale lines retain their original price snapshots
- Override reports now compare the normal line total with the exact overridden final total
- Password resets now revoke the affected user sessions immediately
- Financial dashboards, expenses, settings, backups, subscription alerts, and activity logs are now explicitly OWNER-only
- Sell product results now appear only after typing, are limited to 20 visible matches, and require explicit medicine selection
- Mobile, tablet, and desktop Add Stock product selection now uses a searchable product picker with multi-word matching, bounded results, and explicit selection
- Add Stock starts without an assumed product and keeps Save Batch disabled until a product is explicitly selected
- Sales report transaction counts now group cart lines under their customer transaction

### Security

- Onboarding APIs are OWNER-only and derive pharmacy identity from the authenticated session
- Onboarding completion rejects client-supplied completion flags and requires real tenant product and inventory-batch records
- Notification APIs derive tenant and role from the authenticated session and prevent technicians from accessing subscription alerts
- Admin bootstrap no longer contains public default credentials and requires server-only bootstrap environment variables
- Admin session cookies are invalidated after password changes by `admin_users.session_version`
- Admin login failures lock accounts after repeated attempts without exposing username enumeration details
- Activity actor and pharmacy identity are derived from authenticated server sessions
- Technicians remain blocked from expenses and net-profit information
- Activity logs are restricted to pharmacy owners
- Report APIs enforce role permissions server-side and derive pharmacy scope from the authenticated session
- Backup APIs are owner-only, derive pharmacy scope from the authenticated session, and exclude passwords, hashes, sessions, cookies, admin users, and credentials
- Admin restore authenticates with admin sessions, verifies selected pharmacy against backup pharmacy id, and restores only missing settings, products, batches, sales, and expenses
- Admin restore excludes staff accounts, historical activity logs, sessions, passwords, hashes, cookies, access credentials, admin users, and admin credentials
- Restore writes run through a service-role-only PostgreSQL RPC for atomic rollback on failure
- Cart checkout derives pharmacy and staff identity from the session; the database revalidates tenant products, prices, selling modes, and stock under batch locks
- Adjustment APIs derive pharmacy and staff identity from the session; service-role-only RPCs lock and revalidate tenant batches before reducing stock
- Sale voids are limited to Owners and In-Charge staff; adjustment reversals are Owner-only; correction RPCs reject repeat actions under database locks
- Normal price changes are limited to Owners and In-Charge staff, tenant-scoped, and atomically write both the product price and price-history record
- Admin password-recovery audits store target account identifiers and roles but never passwords or password hashes

### Not Included

- Destructive restore, overwrite restore, staff restore, activity log restore, correction-aware sale restore, inventory-adjustment restore, and supplier/purchase restore are not implemented

## v0.6.0-alpha

### Added

- Multi-pharmacy SaaS mode with tenant-scoped pharmacy data
- Admin portal for managing pharmacies
- Database-backed admin users with bcrypt authentication
- Secure persistent admin and pharmacy sessions
- Subscription and trial enforcement
- Individual staff accounts with roles
- Pharmacy settings module
- Archive, restore, and permanent delete for pharmacies
- Inventory products, stock batches, sales, expiry, and dashboard modules
- CSV import/export for products, stock summary, sales, expiry, and inventory batches

### Improved

- Stock aggregation from Supabase queries
- Unit and pack selling logic
- Price fallback and missing price UX
- Duplicate inventory batch protection
- Admin API authentication consistency
- Multi-tenant API isolation
- Pharmacy creation rollback and safer deletion behavior

### Security

- Bcrypt password hashing for admin, pharmacy, and staff credentials
- HttpOnly session cookies
- Pharmacy access blocked for archived, suspended, expired, or subscription-expired accounts
- Super-admin-only permanent pharmacy deletion with explicit confirmation
