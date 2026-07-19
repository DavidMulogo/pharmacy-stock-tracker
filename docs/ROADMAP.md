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
- Pharmacy archive, restore, and permanent delete controls
- Business analytics with expenses, gross profit, net profit, and best-selling products
- Reports v1 with sales, inventory, expiry, price override, expenses/profit, and staff activity exports
- Owner-only backup export with checksum validation
- Admin Restore v1 with merge-only non-destructive backup recovery
- Onboarding v1 with guided profile, rules, staff, products, stock, and subscription readiness
- Owner-only activity log for staff, sales, stock, imports, expenses, settings, and login events

## Next Phases

### Advanced Reports

Expand Reports v1 with supplier and purchase reports after supplier and purchasing modules exist, plus scheduled report delivery and deeper valuation options.

### Backup Restore

Expand Admin Restore v1 with richer conflict review, scheduled exports, and admin recovery tooling. Current restore is merge-only and intentionally does not overwrite or delete existing data.

### Onboarding

Expand Onboarding v1 with richer import templates, guided first-sale checks, sample products, and admin-side onboarding nudges.

### Notifications

Add low-stock, expiry, subscription, trial, and staff/security notifications by in-app alerts first, then email/SMS later.

### Mobile App

Build a mobile-first staff experience for selling, stock checks, expiry checks, and owner dashboard views.

### Supplier Portal

Add supplier records, purchase orders, receiving workflows, supplier pricing, and supplier performance history.

### AI

Introduce AI assistance for stock forecasting, reorder suggestions, anomaly detection, sales summaries, and natural-language reports.
