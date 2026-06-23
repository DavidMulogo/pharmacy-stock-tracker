create extension if not exists "pgcrypto";

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  generic_name text not null,
  brand_name text not null,
  dosage_form text not null,
  base_unit text not null,
  pack_type text not null,
  units_per_pack integer not null check (units_per_pack > 0),
  default_selling_price numeric(12, 2) not null check (default_selling_price >= 0),
  reorder_level integer not null default 0 check (reorder_level >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  batch_number text not null,
  expiry_date date not null,
  packs_received integer not null check (packs_received > 0),
  units_per_pack integer not null check (units_per_pack > 0),
  total_units_received integer generated always as (packs_received * units_per_pack) stored,
  buying_price numeric(12, 2) not null check (buying_price >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  quantity_sold integer not null check (quantity_sold > 0),
  default_price numeric(12, 2) not null check (default_price >= 0),
  final_selling_price numeric(12, 2) null check (final_selling_price is null or final_selling_price >= 0),
  effective_selling_price numeric(12, 2) generated always as (coalesce(final_selling_price, default_price)) stored,
  total_sale numeric(12, 2) generated always as (quantity_sold * coalesce(final_selling_price, default_price)) stored,
  override_flag text generated always as (
    case
      when final_selling_price is null or final_selling_price = default_price then 'NORMAL'
      else 'OVERRIDDEN'
    end
  ) stored,
  created_at timestamptz not null default now(),
  constraint sales_override_flag_check check (override_flag in ('NORMAL', 'OVERRIDDEN'))
);

create index if not exists inventory_batches_product_id_idx on public.inventory_batches(product_id);
create index if not exists inventory_batches_expiry_date_idx on public.inventory_batches(expiry_date);
create index if not exists sales_product_id_idx on public.sales(product_id);
create index if not exists sales_created_at_idx on public.sales(created_at desc);

create or replace view public.product_stock_summary as
select
  p.id,
  p.product_name,
  p.generic_name,
  p.brand_name,
  p.dosage_form,
  p.base_unit,
  p.pack_type,
  p.units_per_pack,
  p.default_selling_price,
  p.reorder_level,
  p.created_at,
  coalesce(received.total_received, 0)::integer as total_received,
  coalesce(sold.total_sold, 0)::integer as total_sold,
  (coalesce(received.total_received, 0) - coalesce(sold.total_sold, 0))::integer as available_stock,
  case
    when coalesce(received.total_received, 0) - coalesce(sold.total_sold, 0) <= 0 then 'OUT OF STOCK'
    when coalesce(received.total_received, 0) - coalesce(sold.total_sold, 0) <= p.reorder_level then 'LOW STOCK'
    else 'OK'
  end as stock_status
from public.products p
left join (
  select product_id, sum(total_units_received) as total_received
  from public.inventory_batches
  group by product_id
) received on received.product_id = p.id
left join (
  select product_id, sum(quantity_sold) as total_sold
  from public.sales
  group by product_id
) sold on sold.product_id = p.id;

create or replace view public.batch_expiry_summary as
select
  b.*,
  case
    when b.expiry_date < current_date then 'EXPIRED'
    when b.expiry_date <= current_date + interval '30 days' then 'EXPIRING SOON'
    else 'OK'
  end as expiry_status
from public.inventory_batches b;
