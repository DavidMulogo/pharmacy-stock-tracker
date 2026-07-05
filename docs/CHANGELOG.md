# Changelog

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
