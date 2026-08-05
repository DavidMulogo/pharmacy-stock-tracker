alter table public.sale_transactions
  add column if not exists status text not null default 'COMPLETED' check (status in ('COMPLETED', 'VOIDED')),
  add column if not exists voided_at timestamptz null,
  add column if not exists voided_by uuid null references public.pharmacy_users(id) on delete set null,
  add column if not exists void_reason text not null default '' check (char_length(void_reason) <= 500);

alter table public.sales
  add column if not exists voided_at timestamptz null,
  add column if not exists voided_by uuid null references public.pharmacy_users(id) on delete set null,
  add column if not exists void_reason text not null default '' check (char_length(void_reason) <= 500);

alter table public.inventory_adjustments
  add column if not exists reversed_at timestamptz null,
  add column if not exists reversed_by uuid null references public.pharmacy_users(id) on delete set null,
  add column if not exists reversal_reason text not null default '' check (char_length(reversal_reason) <= 500);

create index if not exists sales_active_pharmacy_created_idx on public.sales(pharmacy_id, created_at desc) where voided_at is null;
create index if not exists adjustments_active_pharmacy_created_idx on public.inventory_adjustments(pharmacy_id, created_at desc) where reversed_at is null;

create or replace function public.void_sale_transaction_v1(p_pharmacy_id uuid, p_voided_by uuid, p_transaction_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_tx public.sale_transactions%rowtype; v_reason text:=btrim(coalesce(p_reason,'')); v_count integer;
begin
  if char_length(v_reason)<3 or char_length(v_reason)>500 then raise exception 'A correction reason of 3 to 500 characters is required.' using errcode='22023'; end if;
  if not exists(select 1 from public.pharmacy_users where id=p_voided_by and pharmacy_id=p_pharmacy_id and active=true and role in ('OWNER','PHARMACIST')) then
    raise exception 'Only an active Owner or Pharmacist can void a sale.' using errcode='42501';
  end if;
  select * into v_tx from public.sale_transactions where id=p_transaction_id and pharmacy_id=p_pharmacy_id for update;
  if not found then raise exception 'Sale transaction was not found.' using errcode='22023'; end if;
  if v_tx.status='VOIDED' then raise exception 'This transaction has already been voided.' using errcode='P0001'; end if;
  update public.sale_transactions set status='VOIDED',voided_at=now(),voided_by=p_voided_by,void_reason=v_reason where id=p_transaction_id;
  update public.sales set voided_at=now(),voided_by=p_voided_by,void_reason=v_reason where transaction_id=p_transaction_id and pharmacy_id=p_pharmacy_id and voided_at is null;
  get diagnostics v_count=row_count;
  return jsonb_build_object('id',p_transaction_id,'line_count',v_count,'total_amount',v_tx.total_amount,'status','VOIDED');
end; $$;

create or replace function public.void_legacy_sale_v1(p_pharmacy_id uuid, p_voided_by uuid, p_sale_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sale public.sales%rowtype; v_reason text:=btrim(coalesce(p_reason,''));
begin
  if char_length(v_reason)<3 or char_length(v_reason)>500 then raise exception 'A correction reason of 3 to 500 characters is required.' using errcode='22023'; end if;
  if not exists(select 1 from public.pharmacy_users where id=p_voided_by and pharmacy_id=p_pharmacy_id and active=true and role in ('OWNER','PHARMACIST')) then
    raise exception 'Only an active Owner or Pharmacist can void a sale.' using errcode='42501';
  end if;
  select * into v_sale from public.sales where id=p_sale_id and pharmacy_id=p_pharmacy_id and transaction_id is null for update;
  if not found then raise exception 'Legacy sale was not found.' using errcode='22023'; end if;
  if v_sale.voided_at is not null then raise exception 'This sale has already been voided.' using errcode='P0001'; end if;
  update public.sales set voided_at=now(),voided_by=p_voided_by,void_reason=v_reason where id=p_sale_id;
  return jsonb_build_object('id',p_sale_id,'line_count',1,'total_amount',v_sale.total_sale,'status','VOIDED');
end; $$;

create or replace function public.reverse_inventory_adjustment_v1(p_pharmacy_id uuid,p_reversed_by uuid,p_adjustment_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_adjustment public.inventory_adjustments%rowtype; v_reason text:=btrim(coalesce(p_reason,''));
begin
  if char_length(v_reason)<3 or char_length(v_reason)>500 then raise exception 'A reversal reason of 3 to 500 characters is required.' using errcode='22023'; end if;
  if not exists(select 1 from public.pharmacy_users where id=p_reversed_by and pharmacy_id=p_pharmacy_id and active=true and role='OWNER') then
    raise exception 'Only an active Owner can reverse an inventory adjustment.' using errcode='42501';
  end if;
  select * into v_adjustment from public.inventory_adjustments where id=p_adjustment_id and pharmacy_id=p_pharmacy_id for update;
  if not found then raise exception 'Inventory adjustment was not found.' using errcode='22023'; end if;
  if v_adjustment.reversed_at is not null then raise exception 'This adjustment has already been reversed.' using errcode='P0001'; end if;
  update public.inventory_adjustments set reversed_at=now(),reversed_by=p_reversed_by,reversal_reason=v_reason where id=p_adjustment_id;
  return jsonb_build_object('id',p_adjustment_id,'reason',v_adjustment.reason,'quantity',v_adjustment.quantity,'stock_effect',v_adjustment.stock_effect,'status','REVERSED');
end; $$;

revoke all on function public.void_sale_transaction_v1(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.void_legacy_sale_v1(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.reverse_inventory_adjustment_v1(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.void_sale_transaction_v1(uuid,uuid,uuid,text) to service_role;
grant execute on function public.void_legacy_sale_v1(uuid,uuid,uuid,text) to service_role;
grant execute on function public.reverse_inventory_adjustment_v1(uuid,uuid,uuid,text) to service_role;

create or replace view public.product_stock_summary as
with received as (
 select pharmacy_id,product_id,sum(total_units_received) total_received,
 case when sum(total_units_received)>0 then sum(coalesce(buying_price_per_pack,buying_price)*packs_received)/sum(total_units_received) else null end derived_unit_cost
 from public.inventory_batches group by pharmacy_id,product_id
), sold as (
 select pharmacy_id,product_id,sum(coalesce(units_sold,quantity_sold)) total_sold from public.sales where voided_at is null group by pharmacy_id,product_id
), adjusted as (
 select pharmacy_id,product_id,sum(quantity) total_adjusted from public.inventory_adjustments where stock_effect=-1 and reversed_at is null group by pharmacy_id,product_id
), stock as (
 select p.*,coalesce(r.total_received,0) total_received,coalesce(s.total_sold,0) total_sold,coalesce(a.total_adjusted,0) total_adjusted,
 coalesce(r.total_received,0)-coalesce(s.total_sold,0)-coalesce(a.total_adjusted,0) available_stock,r.derived_unit_cost
 from public.products p left join received r on r.product_id=p.id and r.pharmacy_id is not distinct from p.pharmacy_id
 left join sold s on s.product_id=p.id and s.pharmacy_id is not distinct from p.pharmacy_id
 left join adjusted a on a.product_id=p.id and a.pharmacy_id is not distinct from p.pharmacy_id
)
select id,pharmacy_id,product_name,generic_name,brand_name,dosage_form,base_unit,pack_type,units_per_pack,
 coalesce(default_unit_price,default_pack_price/nullif(units_per_pack,0),default_selling_price) default_selling_price,selling_mode,
 coalesce(default_unit_price,default_pack_price/nullif(units_per_pack,0)) default_unit_price,
 coalesce(default_pack_price,default_unit_price*units_per_pack) default_pack_price,reorder_level,created_at,
 total_received::integer,total_sold::integer,available_stock::integer,derived_unit_cost,
 case when available_stock<=0 then 'OUT OF STOCK' when reorder_level is not null and available_stock<=reorder_level then 'LOW STOCK'
 when reorder_level is not null and available_stock>reorder_level then 'OK' else null end stock_status,
 reorder_level is not null reorder_level_configured,total_adjusted::integer total_adjusted from stock;

create or replace view public.batch_expiry_summary as
with allocated as (
 select a.inventory_batch_id,sum(a.quantity) quantity from public.sale_batch_allocations a join public.sales s on s.id=a.sale_id
 where s.voided_at is null group by a.inventory_batch_id
), adjusted as (
 select inventory_batch_id,sum(quantity) quantity from public.inventory_adjustments where stock_effect=-1 and reversed_at is null and inventory_batch_id is not null group by inventory_batch_id
)
select b.id,b.pharmacy_id,b.product_id,b.batch_number,b.expiry_date,b.packs_received,b.units_per_pack,b.total_units_received,
 coalesce(b.buying_price_per_pack,b.buying_price) buying_price_per_pack,coalesce(b.buying_price_per_pack,b.buying_price) buying_price,
 coalesce(b.buying_price_per_pack,b.buying_price)/nullif(b.units_per_pack,0) derived_unit_cost,b.created_at,
 case when b.expiry_date<current_date then 'EXPIRED'
 when b.expiry_date<=current_date+(coalesce(ps.expiry_warning_days,30)::text||' days')::interval then 'EXPIRING SOON' else 'OK' end expiry_status,
 greatest(b.total_units_received-coalesce(sa.quantity,0)-coalesce(ia.quantity,0),0)::integer available_stock
from public.inventory_batches b left join public.pharmacy_settings ps on ps.pharmacy_id=b.pharmacy_id
left join allocated sa on sa.inventory_batch_id=b.id left join adjusted ia on ia.inventory_batch_id=b.id;

create or replace function public.create_inventory_adjustment_v2(
 p_pharmacy_id uuid,p_created_by uuid,p_product_id uuid,p_inventory_batch_id uuid,p_reason text,p_quantity integer,p_note text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_reason text:=upper(btrim(coalesce(p_reason,''))); v_note text:=btrim(coalesce(p_note,'')); v_effect smallint;
 v_row public.inventory_adjustments%rowtype; b record; available integer:=0; batch_available integer; historical integer;
 allocated integer; adjusted integer; reserved integer;
begin
 if p_pharmacy_id is null or p_product_id is null then raise exception 'Pharmacy and product are required.' using errcode='22023'; end if;
 if v_reason not in ('DAMAGED','EXPIRED','CUSTOMER_RETURN','SUPPLIER_RETURN','MISSING','INTERNAL_USE','OTHER') then raise exception 'Select a valid adjustment reason.' using errcode='22023'; end if;
 if p_quantity is null or p_quantity<=0 then raise exception 'Quantity must be a whole number greater than zero.' using errcode='22023'; end if;
 if char_length(v_note)>500 then raise exception 'Note cannot exceed 500 characters.' using errcode='22023'; end if;
 if not exists(select 1 from public.products where id=p_product_id and pharmacy_id=p_pharmacy_id) then raise exception 'Product was not found for this pharmacy.' using errcode='22023'; end if;
 if p_created_by is not null and not exists(select 1 from public.pharmacy_users where id=p_created_by and pharmacy_id=p_pharmacy_id and active=true) then raise exception 'The staff account is not active for this pharmacy.' using errcode='42501'; end if;
 v_effect:=case when v_reason='CUSTOMER_RETURN' then 0 else -1 end;
 if v_effect=-1 and p_inventory_batch_id is null then raise exception 'Select the batch that will be reduced.' using errcode='22023'; end if;
 if p_inventory_batch_id is not null then
  perform id from public.inventory_batches where id=p_inventory_batch_id and pharmacy_id=p_pharmacy_id and product_id=p_product_id for update;
  if not found then raise exception 'Batch was not found for this product and pharmacy.' using errcode='22023'; end if;
 end if;
 if v_effect=-1 then
  select coalesce(sum(greatest(s.units_sold-coalesce(x.quantity,0),0)),0)::integer into historical
  from public.sales s left join (
   select a.sale_id,sum(a.quantity)::integer quantity from public.sale_batch_allocations a join public.sales active_sale on active_sale.id=a.sale_id
   where a.pharmacy_id=p_pharmacy_id and a.product_id=p_product_id and active_sale.voided_at is null group by a.sale_id
  ) x on x.sale_id=s.id
  where s.pharmacy_id=p_pharmacy_id and s.product_id=p_product_id and s.voided_at is null;
  for b in select * from public.inventory_batches where pharmacy_id=p_pharmacy_id and product_id=p_product_id order by expiry_date,created_at,id loop
   select coalesce(sum(a.quantity),0)::integer into allocated from public.sale_batch_allocations a join public.sales s on s.id=a.sale_id
    where a.pharmacy_id=p_pharmacy_id and a.inventory_batch_id=b.id and s.voided_at is null;
   select coalesce(sum(quantity),0)::integer into adjusted from public.inventory_adjustments
    where pharmacy_id=p_pharmacy_id and inventory_batch_id=b.id and stock_effect=-1 and reversed_at is null;
   batch_available:=greatest(b.total_units_received-allocated-adjusted,0);
   if historical>0 and batch_available>0 then reserved:=least(batch_available,historical);batch_available:=batch_available-reserved;historical:=historical-reserved;end if;
   if b.id=p_inventory_batch_id then available:=batch_available;exit;end if;
  end loop;
  if p_quantity>available then raise exception 'Only % units remain available in the selected batch.',available using errcode='P0001'; end if;
 end if;
 insert into public.inventory_adjustments(pharmacy_id,product_id,inventory_batch_id,created_by,reason,quantity,stock_effect,note)
 values(p_pharmacy_id,p_product_id,p_inventory_batch_id,p_created_by,v_reason,p_quantity,v_effect,v_note) returning * into v_row;
 return jsonb_build_object('id',v_row.id,'pharmacy_id',v_row.pharmacy_id,'product_id',v_row.product_id,'inventory_batch_id',v_row.inventory_batch_id,
  'created_by',v_row.created_by,'reason',v_row.reason,'quantity',v_row.quantity,'stock_effect',v_row.stock_effect,'note',v_row.note,'created_at',v_row.created_at);
end; $$;

revoke all on function public.create_inventory_adjustment_v2(uuid,uuid,uuid,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.create_inventory_adjustment_v2(uuid,uuid,uuid,uuid,text,integer,text) to service_role;

create or replace function public.create_sale_transaction_v3(p_pharmacy_id uuid,p_created_by uuid,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 tx uuid;tx_time timestamptz;item jsonb;line integer:=0;v_product_id uuid;product record;sell_type text;qty integer;units integer;
 override_price numeric;default_price numeric;effective_price numeric;sale_id uuid;sale_total numeric;total numeric:=0;available integer;
 historical integer;remaining integer;batch_row record;allocated integer;adjusted integer;batch_available integer;reserved integer;take integer;unit_cost numeric;
 sale_ids jsonb:='[]'::jsonb;
begin
 if p_pharmacy_id is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Pharmacy and at least one cart item are required.' using errcode='22023';end if;
 if jsonb_array_length(p_items)>50 then raise exception 'A sale cannot contain more than 50 items.' using errcode='22023';end if;
 if p_created_by is not null and not exists(select 1 from public.pharmacy_users where id=p_created_by and pharmacy_id=p_pharmacy_id and active=true) then raise exception 'The staff account is not active for this pharmacy.' using errcode='42501';end if;
 perform 1 from public.inventory_batches ib where ib.pharmacy_id=p_pharmacy_id and ib.expiry_date>=current_date and ib.product_id in
  (select distinct(e.value->>'product_id')::uuid from jsonb_array_elements(p_items)e(value)) order by ib.product_id,ib.expiry_date,ib.created_at,ib.id for update;
 insert into public.sale_transactions(pharmacy_id,created_by,item_count,total_amount) values(p_pharmacy_id,p_created_by,jsonb_array_length(p_items),0) returning id,created_at into tx,tx_time;
 for item in select value from jsonb_array_elements(p_items) loop
  line:=line+1;
  begin
   v_product_id:=(item->>'product_id')::uuid;qty:=(item->>'quantity_entered')::integer;
   override_price:=case when nullif(btrim(item->>'override_price'),'') is null then null else(item->>'override_price')::numeric end;
  exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Cart item % contains invalid values.',line using errcode='22023';end;
  sell_type:=upper(item->>'sell_type');
  if qty<=0 or sell_type not in('UNIT','PACK') or(override_price is not null and override_price<0) then raise exception 'Cart item % has an invalid quantity, sell type, or price.',line using errcode='22023';end if;
  select p.id,p.selling_mode,p.units_per_pack,
   coalesce(p.default_unit_price,p.default_pack_price/nullif(p.units_per_pack,0),p.default_selling_price) unit_price,
   coalesce(p.default_pack_price,p.default_unit_price*p.units_per_pack) pack_price into product
   from public.products p where p.id=v_product_id and p.pharmacy_id=p_pharmacy_id;
  if not found then raise exception 'Cart item % product was not found.',line using errcode='22023';end if;
  if(product.selling_mode='UNIT' and sell_type<>'UNIT')or(product.selling_mode='PACK' and sell_type<>'PACK')then raise exception 'Cart item % uses an unavailable selling mode.',line using errcode='22023';end if;
  units:=case when sell_type='PACK' then qty*product.units_per_pack else qty end;
  default_price:=case when sell_type='PACK' then product.pack_price else product.unit_price end;
  if default_price is null then raise exception 'Cart item % does not have a price.',line using errcode='22023';end if;
  effective_price:=coalesce(override_price,default_price);
  select coalesce(sum(b.total_units_received),0)::integer into available from public.inventory_batches b where b.pharmacy_id=p_pharmacy_id and b.product_id=v_product_id;
  available:=available
   -coalesce((select sum(s.units_sold)::integer from public.sales s where s.pharmacy_id=p_pharmacy_id and s.product_id=v_product_id and s.voided_at is null),0)
   -coalesce((select sum(a.quantity)::integer from public.inventory_adjustments a where a.pharmacy_id=p_pharmacy_id and a.product_id=v_product_id and a.stock_effect=-1 and a.reversed_at is null),0);
  if units>available then raise exception 'Cart item % has insufficient stock. Only % units are available.',line,available using errcode='P0001';end if;
  insert into public.sales(pharmacy_id,transaction_id,line_number,product_id,sell_type,quantity_entered,units_sold,quantity_sold,default_price,override_price,effective_price,final_selling_price,created_at)
   values(p_pharmacy_id,tx,line,v_product_id,sell_type,qty,units,units,default_price,override_price,effective_price,override_price,tx_time) returning id,total_sale into sale_id,sale_total;
  select coalesce(sum(greatest(s.units_sold-coalesce(x.quantity,0),0)),0)::integer into historical
   from public.sales s left join(
    select a.sale_id,sum(a.quantity)::integer quantity from public.sale_batch_allocations a join public.sales active_sale on active_sale.id=a.sale_id
    where a.pharmacy_id=p_pharmacy_id and a.product_id=v_product_id and active_sale.voided_at is null group by a.sale_id
   )x on x.sale_id=s.id where s.pharmacy_id=p_pharmacy_id and s.product_id=v_product_id and s.id<>sale_id and s.voided_at is null;
  remaining:=units;
  for batch_row in select * from public.inventory_batches where pharmacy_id=p_pharmacy_id and product_id=v_product_id and expiry_date>=current_date order by expiry_date,created_at,id loop
   select coalesce(sum(a.quantity),0)::integer into allocated from public.sale_batch_allocations a join public.sales active_sale on active_sale.id=a.sale_id
    where a.pharmacy_id=p_pharmacy_id and a.inventory_batch_id=batch_row.id and active_sale.voided_at is null;
   select coalesce(sum(quantity),0)::integer into adjusted from public.inventory_adjustments
    where pharmacy_id=p_pharmacy_id and inventory_batch_id=batch_row.id and stock_effect=-1 and reversed_at is null;
   batch_available:=greatest(batch_row.total_units_received-allocated-adjusted,0);
   if historical>0 and batch_available>0 then reserved:=least(batch_available,historical);batch_available:=batch_available-reserved;historical:=historical-reserved;end if;
   if remaining>0 and batch_available>0 then
    take:=least(remaining,batch_available);unit_cost:=coalesce(batch_row.buying_price_per_pack,batch_row.buying_price,0)/nullif(batch_row.units_per_pack,0);
    insert into public.sale_batch_allocations(pharmacy_id,sale_id,product_id,inventory_batch_id,quantity,unit_cost_at_sale,cost_of_goods_sold,created_at)
     values(p_pharmacy_id,sale_id,v_product_id,batch_row.id,take,coalesce(unit_cost,0),round(take*coalesce(unit_cost,0),2),tx_time);
    remaining:=remaining-take;
   end if;
   exit when remaining=0 and historical=0;
  end loop;
  if remaining>0 then raise exception 'Cart item % could not be allocated to inventory batches.',line using errcode='P0001';end if;
  total:=total+sale_total;sale_ids:=sale_ids||jsonb_build_array(sale_id);
 end loop;
 update public.sale_transactions set total_amount=total where id=tx;
 return jsonb_build_object('id',tx,'pharmacy_id',p_pharmacy_id,'created_by',p_created_by,'item_count',jsonb_array_length(p_items),'total_amount',total,'created_at',tx_time,'sale_ids',sale_ids);
end; $$;

revoke all on function public.create_sale_transaction_v3(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_sale_transaction_v3(uuid,uuid,jsonb) to service_role;
