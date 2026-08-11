# PharmaStock v1.0 Roadmap

PharmaStock is moving from an MVP pharmacy stock tracker into a multi-pharmacy SaaS platform for daily pharmacy operations.

## Completed Foundation

- Multi-pharmacy SaaS data separation
- Admin portal for pharmacy management
- Admin Security v1 with strong password changes, account lockout, secure bootstrap, and admin session invalidation
- Pharmacy and staff login without shared pharmacy passwords
- Secure sessions with HttpOnly cookies
- Bcrypt password hashing
- Subscription and trial enforcement
- Pharmacy settings
- Inventory, stock batches, sales, expiry tracking, and CSV import/export
- Atomic multi-item sales cart with FEFO batch allocation and immutable COGS
- Inventory adjustments for unfit, expired, damaged, missing, internally used, supplier-returned, and quarantined customer-return medicines
- Controlled sale voids and inventory-adjustment reversals with role checks, reasons, and audit history
- Owner-controlled normal selling-price changes with immutable automatic price history
- Exact final-total overrides at checkout without dispenser-side per-unit calculations
- Pharmacy archive, restore, and permanent delete controls
- Business analytics with expenses, gross profit, net profit, and best-selling products
- Reports v1 with sales, inventory, expiry, price override, expenses/profit, and staff activity exports
- Owner-only backup export with checksum validation
- Admin Restore v1 with merge-only non-destructive backup recovery
- Onboarding v1 with guided profile, rules, staff, products, stock, and subscription readiness
- In-app notifications for inventory, expiry, and subscription alerts
- Owner-only activity log for staff, sales, stock, imports, expenses, settings, and login events

## Next Phases

### Roles and Pricing Controls

Add a dedicated `IN_CHARGE` operational role and grant it controlled price-management rights. Add subscription entitlement rules for optional sale-price overrides while keeping normal product prices centrally managed.

### Advanced Reports

Expand Reports v1 with supplier and purchase reports after supplier and purchasing modules exist, plus scheduled report delivery and deeper valuation options.

### Backup Restore

Expand Admin Restore v1 with richer conflict review, correction- and transaction-aware sale restore, inventory-adjustment restore, weekly encrypted scheduled exports, retention controls, failure notifications, and admin recovery tooling. Current restore is merge-only, rejects backups containing voided sales, and intentionally does not overwrite or delete existing data.

### Onboarding

Expand Onboarding v1 with a master medicine catalog picker alongside CSV and manual entry, guided first-sale checks, and admin-side onboarding nudges.

### Notifications

Expand Notifications v1 with scheduled background sync, email/SMS delivery, staff/security notifications, quiet hours, and notification preferences.

### Mobile App

Build a mobile-first staff experience for selling, stock checks, expiry checks, and owner dashboard views.

### Supplier Portal

Add supplier records, purchase orders, receiving workflows, supplier pricing, and supplier performance history.

### AI

Introduce AI assistance for stock forecasting, reorder suggestions, anomaly detection, sales summaries, and natural-language reports.
