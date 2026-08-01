create table if not exists public.sale_batch_allocations (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  inventory_batch_id uuid not null references public.inventory_batches(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_cost_at_sale numeric(12, 4) not null check (unit_cost_at_sale >= 0),
  cost_of_goods_sold numeric(12, 2) not null check (cost_of_goods_sold >= 0),
  created_at timestamptz not null default now()
);

create unique index if not exists sale_batch_allocations_sale_batch_unique_idx
  on public.sale_batch_allocations(sale_id, inventory_batch_id);

create index if not exists sale_batch_allocations_pharmacy_sale_idx
  on public.sale_batch_allocations(pharmacy_id, sale_id);

create index if not exists sale_batch_allocations_product_batch_idx
  on public.sale_batch_allocations(pharmacy_id, product_id, inventory_batch_id);

create index if not exists sale_batch_allocations_created_idx
  on public.sale_batch_allocations(pharmacy_id, created_at desc);
