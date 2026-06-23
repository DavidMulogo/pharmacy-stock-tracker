alter table public.products
  add column if not exists selling_mode text not null default 'UNIT',
  add column if not exists default_unit_price numeric(12, 2),
  add column if not exists default_pack_price numeric(12, 2);

update public.products
set
  default_unit_price = coalesce(default_unit_price, default_selling_price),
  default_pack_price = coalesce(default_pack_price, default_selling_price * units_per_pack)
where default_unit_price is null or default_pack_price is null;

alter table public.products
  alter column default_unit_price set not null,
  alter column default_pack_price set not null;

alter table public.products
  drop constraint if exists products_selling_mode_check,
  add constraint products_selling_mode_check check (selling_mode in ('UNIT', 'PACK', 'BOTH')),
  drop constraint if exists products_default_unit_price_check,
  add constraint products_default_unit_price_check check (default_unit_price >= 0),
  drop constraint if exists products_default_pack_price_check,
  add constraint products_default_pack_price_check check (default_pack_price >= 0);

alter table public.sales
  add column if not exists sell_type text not null default 'UNIT',
  add column if not exists quantity_entered integer,
  add column if not exists units_sold integer,
  add column if not exists override_price numeric(12, 2) null check (override_price is null or override_price >= 0),
  add column if not exists effective_price numeric(12, 2);

update public.sales
set
  quantity_entered = coalesce(quantity_entered, quantity_sold),
  units_sold = coalesce(units_sold, quantity_sold),
  override_price = coalesce(override_price, final_selling_price),
  effective_price = coalesce(effective_price, effective_selling_price)
where quantity_entered is null or units_sold is null or effective_price is null;

alter table public.sales
  alter column quantity_entered set not null,
  alter column units_sold set not null,
  alter column effective_price set not null,
  drop constraint if exists sales_sell_type_check,
  add constraint sales_sell_type_check check (sell_type in ('UNIT', 'PACK')),
  drop constraint if exists sales_quantity_entered_check,
  add constraint sales_quantity_entered_check check (quantity_entered > 0),
  drop constraint if exists sales_units_sold_check,
  add constraint sales_units_sold_check check (units_sold > 0),
  drop constraint if exists sales_effective_price_check,
  add constraint sales_effective_price_check check (effective_price >= 0);

alter table public.sales
  drop column if exists total_sale;

alter table public.sales
  add column total_sale numeric(12, 2) generated always as (quantity_entered * effective_price) stored;

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
  p.selling_mode,
  p.default_unit_price,
  p.default_pack_price,
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
  select product_id, sum(coalesce(units_sold, quantity_sold)) as total_sold
  from public.sales
  group by product_id
) sold on sold.product_id = p.id;
