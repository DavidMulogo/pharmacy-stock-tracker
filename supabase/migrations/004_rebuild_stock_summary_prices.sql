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
  coalesce(p.default_unit_price, p.default_pack_price / nullif(p.units_per_pack, 0), p.default_selling_price) as default_selling_price,
  p.selling_mode,
  coalesce(p.default_unit_price, p.default_pack_price / nullif(p.units_per_pack, 0)) as default_unit_price,
  coalesce(p.default_pack_price, p.default_unit_price * p.units_per_pack) as default_pack_price,
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
