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
    when b.expiry_date <= current_date + (coalesce(ps.expiry_warning_days, 30)::text || ' days')::interval then 'EXPIRING SOON'
    else 'OK'
  end as expiry_status
from public.inventory_batches b
left join public.pharmacy_settings ps on ps.pharmacy_id = b.pharmacy_id;
