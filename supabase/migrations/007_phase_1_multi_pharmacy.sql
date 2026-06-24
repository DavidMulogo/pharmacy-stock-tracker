create table if not exists public.pharmacies (
  id uuid primary key default gen_random_uuid(),
  pharmacy_name text not null,
  owner_name text not null,
  phone text not null,
  created_at timestamptz not null default now()
);

alter table public.products
  add column if not exists pharmacy_id uuid references public.pharmacies(id) on delete set null;

alter table public.inventory_batches
  add column if not exists pharmacy_id uuid references public.pharmacies(id) on delete set null;

alter table public.sales
  add column if not exists pharmacy_id uuid references public.pharmacies(id) on delete set null;

create index if not exists products_pharmacy_id_idx on public.products(pharmacy_id);
create index if not exists inventory_batches_pharmacy_id_idx on public.inventory_batches(pharmacy_id);
create index if not exists sales_pharmacy_id_idx on public.sales(pharmacy_id);

drop index if exists inventory_batches_product_batch_expiry_unique_idx;

create unique index if not exists inventory_batches_pharmacy_product_batch_expiry_unique_idx
on public.inventory_batches (pharmacy_id, product_id, lower(btrim(batch_number)), expiry_date)
where pharmacy_id is not null;

create or replace view public.product_stock_summary as
select
  p.id,
  p.pharmacy_id,
  p.product_name,
  p.generic_name,
  p.brand_name,
  p.dosage_form,
  p.base_unit,
  p.pack_type,
  p.units_per_pack,
  coalesce(p.default_unit_price, p.default_pack_price / nullif(p.units_per_pack, 0), p.default_selling_price) as default_selling_price,
  p.selling_mode,
  coalesce(p.default_unit_price, p.default_pack_price / nullif(p.units_per_pack, 0)) as default_unit_price,
  coalesce(p.default_pack_price, p.default_unit_price * p.units_per_pack) as default_pack_price,
  p.reorder_level,
  p.created_at,
  coalesce(received.total_received, 0)::integer as total_received,
  coalesce(sold.total_sold, 0)::integer as total_sold,
  (coalesce(received.total_received, 0) - coalesce(sold.total_sold, 0))::integer as available_stock,
  received.derived_unit_cost,
  case
    when coalesce(received.total_received, 0) - coalesce(sold.total_sold, 0) <= 0 then 'OUT OF STOCK'
    when coalesce(received.total_received, 0) - coalesce(sold.total_sold, 0) <= p.reorder_level then 'LOW STOCK'
    else 'OK'
  end as stock_status
from public.products p
left join (
  select
    pharmacy_id,
    product_id,
    sum(total_units_received) as total_received,
    case
      when sum(total_units_received) > 0 then
        sum(coalesce(buying_price_per_pack, buying_price) * packs_received) / sum(total_units_received)
      else null
    end as derived_unit_cost
  from public.inventory_batches
  group by pharmacy_id, product_id
) received on received.product_id = p.id and received.pharmacy_id is not distinct from p.pharmacy_id
left join (
  select pharmacy_id, product_id, sum(coalesce(units_sold, quantity_sold)) as total_sold
  from public.sales
  group by pharmacy_id, product_id
) sold on sold.product_id = p.id and sold.pharmacy_id is not distinct from p.pharmacy_id;

create or replace view public.batch_expiry_summary as
select
  b.id,
  b.pharmacy_id,
  b.product_id,
  b.batch_number,
  b.expiry_date,
  b.packs_received,
  b.units_per_pack,
  b.total_units_received,
  coalesce(b.buying_price_per_pack, b.buying_price) as buying_price_per_pack,
  coalesce(b.buying_price_per_pack, b.buying_price) as buying_price,
  coalesce(b.buying_price_per_pack, b.buying_price) / nullif(b.units_per_pack, 0) as derived_unit_cost,
  b.created_at,
  case
    when b.expiry_date < current_date then 'EXPIRED'
    when b.expiry_date <= current_date + interval '30 days' then 'EXPIRING SOON'
    else 'OK'
  end as expiry_status
from public.inventory_batches b;
