create table if not exists public.product_price_history (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  changed_by uuid references public.pharmacy_users(id) on delete set null,
  old_unit_price numeric(12, 2),
  new_unit_price numeric(12, 2),
  old_pack_price numeric(12, 2),
  new_pack_price numeric(12, 2),
  created_at timestamptz not null default now(),
  constraint product_price_history_unit_prices_check check ((old_unit_price is null or old_unit_price >= 0) and (new_unit_price is null or new_unit_price >= 0)),
  constraint product_price_history_pack_prices_check check ((old_pack_price is null or old_pack_price >= 0) and (new_pack_price is null or new_pack_price >= 0))
);

create index if not exists product_price_history_product_created_idx
  on public.product_price_history(pharmacy_id, product_id, created_at desc);

create or replace function public.update_product_selling_prices_v1(
  p_pharmacy_id uuid, p_changed_by uuid, p_product_id uuid, p_unit_price numeric, p_pack_price numeric
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  product public.products%rowtype;
  actor public.pharmacy_users%rowtype;
  history_id uuid;
begin
  select * into actor from public.pharmacy_users
  where id = p_changed_by and pharmacy_id = p_pharmacy_id and active = true;
  if not found or actor.role <> 'OWNER' then raise exception 'Only the pharmacy owner can change normal selling prices.'; end if;

  select * into product from public.products
  where id = p_product_id and pharmacy_id = p_pharmacy_id for update;
  if not found then raise exception 'Product not found for this pharmacy.'; end if;
  if p_unit_price is not null and p_unit_price < 0 then raise exception 'Unit price cannot be negative.'; end if;
  if p_pack_price is not null and p_pack_price < 0 then raise exception 'Pack price cannot be negative.'; end if;
  if product.selling_mode in ('UNIT', 'BOTH') and p_unit_price is null then raise exception 'A unit price is required for this product.'; end if;
  if product.selling_mode in ('PACK', 'BOTH') and p_pack_price is null then raise exception 'A pack price is required for this product.'; end if;
  if product.default_unit_price is not distinct from p_unit_price and product.default_pack_price is not distinct from p_pack_price then
    raise exception 'The selling prices have not changed.';
  end if;

  update public.products set
    default_unit_price = p_unit_price,
    default_pack_price = p_pack_price,
    default_selling_price = coalesce(p_unit_price, p_pack_price / nullif(product.units_per_pack, 0), 0)
  where id = product.id;

  insert into public.product_price_history (
    pharmacy_id, product_id, changed_by, old_unit_price, new_unit_price, old_pack_price, new_pack_price
  ) values (
    p_pharmacy_id, p_product_id, p_changed_by, product.default_unit_price, p_unit_price, product.default_pack_price, p_pack_price
  ) returning id into history_id;

  return jsonb_build_object(
    'history_id', history_id, 'product_id', product.id, 'product_name', product.product_name,
    'old_unit_price', product.default_unit_price, 'new_unit_price', p_unit_price,
    'old_pack_price', product.default_pack_price, 'new_pack_price', p_pack_price
  );
end;
$$;

revoke all on function public.update_product_selling_prices_v1(uuid, uuid, uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function public.update_product_selling_prices_v1(uuid, uuid, uuid, numeric, numeric) to service_role;
