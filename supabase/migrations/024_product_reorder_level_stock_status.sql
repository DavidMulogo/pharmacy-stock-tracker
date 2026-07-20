alter table public.products
  alter column reorder_level set default 0;

update public.products
set reorder_level = 0
where reorder_level is null;

create or replace view public.product_stock_summary as
with received as (
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
),
sold as (
  select
    pharmacy_id,
    product_id,
    sum(coalesce(units_sold, quantity_sold)) as total_sold
  from public.sales
  group by pharmacy_id, product_id
),
stock as (
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
    coalesce(p.reorder_level, 0) as reorder_level,
    p.created_at,
    coalesce(received.total_received, 0) as total_received,
    coalesce(sold.total_sold, 0) as total_sold,
    coalesce(received.total_received, 0) - coalesce(sold.total_sold, 0) as available_stock,
    received.derived_unit_cost
  from public.products p
  left join received on received.product_id = p.id and received.pharmacy_id is not distinct from p.pharmacy_id
  left join sold on sold.product_id = p.id and sold.pharmacy_id is not distinct from p.pharmacy_id
)
select
  id,
  pharmacy_id,
  product_name,
  generic_name,
  brand_name,
  dosage_form,
  base_unit,
  pack_type,
  units_per_pack,
  default_selling_price,
  selling_mode,
  default_unit_price,
  default_pack_price,
  reorder_level,
  created_at,
  total_received::integer as total_received,
  total_sold::integer as total_sold,
  available_stock::integer as available_stock,
  derived_unit_cost,
  case
    when available_stock <= 0 then 'OUT OF STOCK'
    when available_stock > 0 and available_stock <= reorder_level then 'LOW STOCK'
    else 'OK'
  end as stock_status
from stock;
