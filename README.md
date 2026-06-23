# PharmaStock MVP

A mobile-first pharmacy stock tracking MVP built with Next.js, TypeScript, Tailwind CSS, and Supabase.

## Features

- Sell screen with product search, stock visibility, default price, optional price override, and stock-limit validation.
- Products screen with available stock and stock status.
- Product detail pages with batches and sales.
- Add Stock screen for recording inventory batches.
- Expiry screen showing only expired and expiring-soon batches.
- Sales history with sale detail pages.
- Supabase SQL migration with generated columns and views for stock, expiry, and sales calculations.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a Supabase project.

3. Run the migration in `supabase/migrations/001_pharmacy_stock.sql` using the Supabase SQL editor or CLI.

4. Load seed data from `supabase/seed.sql`.

5. Copy `.env.example` to `.env.local` and fill in your Supabase values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

6. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

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
sum(inventory_batches.total_units_received) - sum(sales.quantity_sold)
```

Stock statuses:

- `OUT OF STOCK` when available stock is `<= 0`
- `LOW STOCK` when available stock is `<= reorder_level`
- `OK` otherwise

Expiry statuses:

- `EXPIRED` when expiry date is before today
- `EXPIRING SOON` when expiry date is within 30 days
- `OK` otherwise

All product stock, expiry, and sales totals are fetched from Supabase on the server. After a sale or stock addition, the affected pages are revalidated and the dashboard refreshes with current database values.
