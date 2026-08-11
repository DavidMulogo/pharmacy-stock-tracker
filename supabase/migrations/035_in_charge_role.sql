alter table public.pharmacy_users drop constraint if exists pharmacy_users_role_check;
alter table public.pharmacy_users add constraint pharmacy_users_role_check
  check (role in ('OWNER', 'IN_CHARGE', 'PHARMACIST', 'TECHNICIAN'));

alter table public.pharmacy_sessions drop constraint if exists pharmacy_sessions_role_check;
alter table public.pharmacy_sessions add constraint pharmacy_sessions_role_check
  check (role is null or role in ('OWNER', 'IN_CHARGE', 'PHARMACIST', 'TECHNICIAN'));

create unique index if not exists pharmacy_users_one_active_in_charge_idx
  on public.pharmacy_users(pharmacy_id)
  where role = 'IN_CHARGE' and active = true;

create or replace function public.update_product_selling_prices_v1(
  p_pharmacy_id uuid, p_changed_by uuid, p_product_id uuid, p_unit_price numeric, p_pack_price numeric
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare product public.products%rowtype; actor public.pharmacy_users%rowtype; history_id uuid;
begin
  select * into actor from public.pharmacy_users where id=p_changed_by and pharmacy_id=p_pharmacy_id and active=true;
  if not found or actor.role not in ('OWNER','IN_CHARGE') then raise exception 'Only the Owner or In-Charge can change normal selling prices.'; end if;
  select * into product from public.products where id=p_product_id and pharmacy_id=p_pharmacy_id for update;
  if not found then raise exception 'Product not found for this pharmacy.'; end if;
  if p_unit_price is not null and p_unit_price<0 then raise exception 'Unit price cannot be negative.'; end if;
  if p_pack_price is not null and p_pack_price<0 then raise exception 'Pack price cannot be negative.'; end if;
  if product.selling_mode in ('UNIT','BOTH') and p_unit_price is null then raise exception 'A unit price is required for this product.'; end if;
  if product.selling_mode in ('PACK','BOTH') and p_pack_price is null then raise exception 'A pack price is required for this product.'; end if;
  if product.default_unit_price is not distinct from p_unit_price and product.default_pack_price is not distinct from p_pack_price then raise exception 'The selling prices have not changed.'; end if;
  update public.products set default_unit_price=p_unit_price,default_pack_price=p_pack_price,
    default_selling_price=coalesce(p_unit_price,p_pack_price/nullif(product.units_per_pack,0),0) where id=product.id;
  insert into public.product_price_history(pharmacy_id,product_id,changed_by,old_unit_price,new_unit_price,old_pack_price,new_pack_price)
    values(p_pharmacy_id,p_product_id,p_changed_by,product.default_unit_price,p_unit_price,product.default_pack_price,p_pack_price) returning id into history_id;
  return jsonb_build_object('history_id',history_id,'product_id',product.id,'product_name',product.product_name,
    'old_unit_price',product.default_unit_price,'new_unit_price',p_unit_price,'old_pack_price',product.default_pack_price,'new_pack_price',p_pack_price);
end; $$;

create or replace function public.void_sale_transaction_v1(p_pharmacy_id uuid,p_voided_by uuid,p_transaction_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_tx public.sale_transactions%rowtype;v_reason text:=btrim(coalesce(p_reason,''));v_count integer;
begin
 if char_length(v_reason)<3 or char_length(v_reason)>500 then raise exception 'A correction reason of 3 to 500 characters is required.' using errcode='22023';end if;
 if not exists(select 1 from public.pharmacy_users where id=p_voided_by and pharmacy_id=p_pharmacy_id and active=true and role in('OWNER','IN_CHARGE')) then raise exception 'Only an active Owner or In-Charge can void a sale.' using errcode='42501';end if;
 select * into v_tx from public.sale_transactions where id=p_transaction_id and pharmacy_id=p_pharmacy_id for update;
 if not found then raise exception 'Sale transaction was not found.' using errcode='22023';end if;
 if v_tx.status='VOIDED' then raise exception 'This transaction has already been voided.' using errcode='P0001';end if;
 update public.sale_transactions set status='VOIDED',voided_at=now(),voided_by=p_voided_by,void_reason=v_reason where id=p_transaction_id;
 update public.sales set voided_at=now(),voided_by=p_voided_by,void_reason=v_reason where transaction_id=p_transaction_id and pharmacy_id=p_pharmacy_id and voided_at is null;
 get diagnostics v_count=row_count;
 return jsonb_build_object('id',p_transaction_id,'line_count',v_count,'total_amount',v_tx.total_amount,'status','VOIDED');
end; $$;

create or replace function public.void_legacy_sale_v1(p_pharmacy_id uuid,p_voided_by uuid,p_sale_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sale public.sales%rowtype;v_reason text:=btrim(coalesce(p_reason,''));
begin
 if char_length(v_reason)<3 or char_length(v_reason)>500 then raise exception 'A correction reason of 3 to 500 characters is required.' using errcode='22023';end if;
 if not exists(select 1 from public.pharmacy_users where id=p_voided_by and pharmacy_id=p_pharmacy_id and active=true and role in('OWNER','IN_CHARGE')) then raise exception 'Only an active Owner or In-Charge can void a sale.' using errcode='42501';end if;
 select * into v_sale from public.sales where id=p_sale_id and pharmacy_id=p_pharmacy_id and transaction_id is null for update;
 if not found then raise exception 'Legacy sale was not found.' using errcode='22023';end if;
 if v_sale.voided_at is not null then raise exception 'This sale has already been voided.' using errcode='P0001';end if;
 update public.sales set voided_at=now(),voided_by=p_voided_by,void_reason=v_reason where id=p_sale_id;
 return jsonb_build_object('id',p_sale_id,'line_count',1,'total_amount',v_sale.total_sale,'status','VOIDED');
end; $$;

revoke all on function public.update_product_selling_prices_v1(uuid,uuid,uuid,numeric,numeric) from public,anon,authenticated;
revoke all on function public.void_sale_transaction_v1(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.void_legacy_sale_v1(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.update_product_selling_prices_v1(uuid,uuid,uuid,numeric,numeric) to service_role;
grant execute on function public.void_sale_transaction_v1(uuid,uuid,uuid,text) to service_role;
grant execute on function public.void_legacy_sale_v1(uuid,uuid,uuid,text) to service_role;
