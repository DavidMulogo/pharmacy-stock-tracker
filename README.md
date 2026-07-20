# PharmaStock MVP

A mobile-first pharmacy stock tracking MVP built with Next.js, TypeScript, Tailwind CSS, and Supabase.

## Features

- Sell screen with product search, stock visibility, default price, optional price override, and stock-limit validation.
- Products screen with available stock and stock status.
- Product detail pages with batches and sales.
- Add Stock screen for recording inventory batches.
- Expiry screen showing only expired and expiring-soon batches.
- Sales history with sale detail pages.
- Business analytics and an expense ledger with role-aware financial visibility.
- Reports for sales, inventory, expiry, price overrides, expenses/profit, and staff activity with CSV export.
- Owner-only backup export and backup validation for pharmacy data.
- Admin-only merge restore for validated pharmacy backups.
- Owner-only onboarding checklist for new pharmacies.
- In-app notifications for stock, expiry, and subscription alerts.
- Owner-only activity logs for important staff and operational actions.
- Supabase SQL migration with generated columns and views for stock, expiry, and sales calculations.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a Supabase project.

3. Run the SQL migrations in `supabase/migrations` in numeric order using the Supabase SQL editor or CLI.

4. Load seed data from `supabase/seed.sql`.

5. Copy `.env.example` to `.env.local` and fill in your Supabase values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_SESSION_SECRET=generate-a-long-random-secret
```

6. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Admin Security

Admin accounts live in `admin_users` and use bcrypt password hashes. The `/admin` portal includes Change Password, requires strong passwords, locks accounts after repeated failed logins, and invalidates old admin cookies after password changes.

Set a strong `ADMIN_SESSION_SECRET` before deployment. Production does not allow the development fallback. Generate one with a command such as:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

To create the first admin, set these server-only variables temporarily, call `POST /api/admin/bootstrap` with the matching token in the `x-admin-bootstrap-token` header or JSON body, then remove the bootstrap variables from the deployment:

```bash
ADMIN_BOOTSTRAP_TOKEN=one-time-bootstrap-token
ADMIN_BOOTSTRAP_USERNAME=your-admin-username
ADMIN_BOOTSTRAP_FULL_NAME="Your Admin Name"
ADMIN_BOOTSTRAP_PASSWORD="A-strong-temporary-password-123!"
```

If your deployment ever used the old public default admin password, log in and rotate it immediately from `/admin`, then remove all bootstrap variables after the first admin exists.

## Database Logic

Inventory batches use a generated `total_units_received` column:

```sql
packs_received * units_per_pack
```

Sales use generated columns for:

- `effective_selling_price`
- `total_sale`
- `override_flag`

The `product_stock_summary` database view calculates available stock as:

```text
sum(inventory_batches.total_units_received) - sum(sales.units_sold)
```

Stock statuses:

- `OUT OF STOCK` when available stock is `<= 0`
- `LOW STOCK` when available stock is `> 0` and `<= product.reorder_level`
- `OK` when available stock is `> product.reorder_level`

Available stock is always measured in the product's base unit. If a product's reorder level is missing, the database view treats it as `0`.

Expiry statuses use each pharmacy's `expiry_warning_days` setting, falling back to 30 days only when the setting is missing:

- `EXPIRED` when expiry date is before today
- `EXPIRING SOON` when expiry date is within the configured warning window
- `OK` otherwise

All product stock, expiry, and sales totals are fetched from Supabase on the server. After a sale or stock addition, the affected pages are revalidated and the dashboard refreshes with current database values.

## Reports

The `/reports` page is protected by the pharmacy staff session. The server derives `pharmacy_id` from the authenticated session for every report API request.

- `OWNER`: all reports, including staff activity.
- `PHARMACIST`: sales, inventory, expiry, price overrides, and expenses/profit.
- `TECHNICIAN`: inventory and expiry only.

CSV export logs a `REPORT_EXPORTED` activity event. Viewing reports and changing filters are not logged.

## Onboarding

The `/onboarding` page is available to pharmacy `OWNER` accounts only. It helps a new pharmacy review profile details, business rules, staff options, product setup, opening stock, and subscription readiness without blocking existing daily operations.

Completion is calculated server-side from the authenticated pharmacy session. The app never accepts a client-supplied `pharmacy_id` or client completion flag. Required completion items are:

- Profile/settings reviewed
- Business rules reviewed
- At least one product
- At least one inventory batch

Staff setup remains optional for solo pharmacies. Subscription values are read-only for pharmacy users and remain managed by PharmaStock Admin. Until completion, Owners see a setup-progress banner in the main POS with a Continue Setup button.

## Notifications

The `/notifications` page shows in-app alerts generated server-side from the authenticated pharmacy's own data. V1 covers low stock, out of stock, expiring soon batches, expired batches, trial ending soon, subscription ending soon, and subscription expired.

Notifications sync when the dashboard or notifications page loads and when a user presses Refresh. Duplicate alerts are prevented with tenant-scoped deterministic keys, and resolved alerts are retained for history. Email, SMS, and scheduled background delivery are not implemented yet.

Role access:

- `OWNER`: all notifications
- `PHARMACIST`: inventory, expiry, and subscription notifications
- `TECHNICIAN`: inventory and expiry notifications only

## Backup

The `/backup` page is available to pharmacy `OWNER` accounts only. Backup export is generated server-side from the authenticated pharmacy session; client-supplied `pharmacy_id` values are never accepted.

The backup JSON includes pharmacy profile, pharmacy settings, products, inventory batches, sales, expenses, staff metadata, and activity logs. It excludes password hashes, plain-text passwords, session tokens, cookies, admin users, and admin credentials.

Each backup includes a deterministic SHA-256 checksum. The validation endpoint checks format, schema version, pharmacy identity, required datasets, record counts, and checksum.

Admin Restore v1 is available inside `/admin`. It restores only missing records for the same pharmacy id and never deletes or overwrites existing data. It restores pharmacy settings when missing, products, inventory batches, sales, and expenses. It does not restore staff accounts, historical activity logs, sessions, passwords, password hashes, cookies, access credentials, admin users, or admin credentials.
