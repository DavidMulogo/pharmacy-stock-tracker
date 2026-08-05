-- Fixes the controlled-corrections checkout RPC after migration 029.
-- A PL/pgSQL record variable named `b` conflicted with a SQL table alias before
-- the record was assigned. The corrected function uses an unambiguous variable
-- and also prevents expired batches from being locked or allocated to a sale.

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
  select coalesce(sum(ib.total_units_received),0)::integer into available from public.inventory_batches ib where ib.pharmacy_id=p_pharmacy_id and ib.product_id=v_product_id;
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
  if remaining>0 then raise exception 'Cart item % could not be allocated to non-expired inventory batches.',line using errcode='P0001';end if;
  total:=total+sale_total;sale_ids:=sale_ids||jsonb_build_array(sale_id);
 end loop;
 update public.sale_transactions set total_amount=total where id=tx;
 return jsonb_build_object('id',tx,'pharmacy_id',p_pharmacy_id,'created_by',p_created_by,'item_count',jsonb_array_length(p_items),'total_amount',total,'created_at',tx_time,'sale_ids',sale_ids);
end; $$;

revoke all on function public.create_sale_transaction_v3(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_sale_transaction_v3(uuid,uuid,jsonb) to service_role;
