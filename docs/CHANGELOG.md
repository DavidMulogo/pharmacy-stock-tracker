# Changelog

## v0.7.0-alpha

### Added

- Reports v1 with sales, inventory, expiry, price override, expenses/profit, and staff activity reports
- CSV export from each permitted report
- Owner-only pharmacy backup export as a JSON file
- Backup validation with format, schema version, pharmacy identity, dataset, record count, and checksum checks
- Business analytics with sales, gross profit, expenses, net profit, and best-selling products
- Expense ledger for owners and pharmacists
- Tenant-scoped activity log migration and audit helper
- Owner-only activity viewer with action, staff, and date filters
- Audit events for login/logout, sales, stock receipts, CSV imports, expenses, settings, and staff management
- `REPORT_EXPORTED` audit action for explicit report exports
- `BACKUP_EXPORTED` and `BACKUP_VALIDATED` audit actions for successful explicit backup actions

### Security

- Activity actor and pharmacy identity are derived from authenticated server sessions
- Technicians remain blocked from expenses and net-profit information
- Activity logs are restricted to pharmacy owners
- Report APIs enforce role permissions server-side and derive pharmacy scope from the authenticated session
- Backup APIs are owner-only, derive pharmacy scope from the authenticated session, and exclude passwords, hashes, sessions, cookies, admin users, and credentials

### Not Included

- Backup restore is not implemented yet

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
