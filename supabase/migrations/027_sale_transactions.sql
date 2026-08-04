create table if not exists public.sale_transactions (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  created_by uuid null references public.pharmacy_users(id) on delete set null,
  item_count integer not null check (item_count > 0),
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists sale_transactions_pharmacy_created_idx
  on public.sale_transactions(pharmacy_id, created_at desc);

alter table public.sales
  add column if not exists transaction_id uuid null references public.sale_transactions(id) on delete restrict,
  add column if not exists line_number integer null check (line_number is null or line_number > 0);

create unique index if not exists sales_transaction_line_unique_idx
  on public.sales(transaction_id, line_number)
  where transaction_id is not null;

create index if not exists sales_transaction_idx
  on public.sales(pharmacy_id, transaction_id)
  where transaction_id is not null;

create or replace function public.create_sale_transaction_v1(
  p_pharmacy_id uuid,
  p_created_by uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transaction_id uuid;
  v_transaction_created_at timestamptz;
  v_item jsonb;
  v_line_number integer := 0;
  v_product_id uuid;
  v_product record;
  v_sell_type text;
  v_quantity_entered integer;
  v_units_sold integer;
  v_override_price numeric;
  v_default_price numeric;
  v_effective_price numeric;
  v_sale_id uuid;
  v_sale_total numeric;
  v_total_amount numeric := 0;
  v_available_stock integer;
  v_historical_unallocated integer;
  v_remaining integer;
  v_batch record;
  v_batch_allocated integer;
  v_batch_available integer;
  v_reserved integer;
  v_allocated integer;
  v_unit_cost numeric;
  v_sale_ids jsonb := '[]'::jsonb;
begin
  if p_pharmacy_id is null then
    raise exception 'Pharmacy is required.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item to the sale.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'A sale cannot contain more than 50 items.' using errcode = '22023';
  end if;

  if p_created_by is not null and not exists (
    select 1
    from public.pharmacy_users
    where id = p_created_by
      and pharmacy_id = p_pharmacy_id
      and active = true
  ) then
    raise exception 'The staff account is not active for this pharmacy.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as entry(value)
    where nullif(entry.value->>'product_id', '') is null
       or nullif(entry.value->>'sell_type', '') is null
       or nullif(entry.value->>'quantity_entered', '') is null
  ) then
    raise exception 'Every cart item requires a product, sell type, and quantity.' using errcode = '22023';
  end if;

  -- Lock every relevant batch in a stable order. Concurrent carts for the same
  -- product must wait and re-check stock after the earlier transaction commits.
  perform batch.id
  from public.inventory_batches batch
  where batch.pharmacy_id = p_pharmacy_id
    and batch.product_id in (
      select distinct (entry.value->>'product_id')::uuid
      from jsonb_array_elements(p_items) as entry(value)
    )
  order by batch.product_id, batch.expiry_date, batch.created_at, batch.id
  for update;

  insert into public.sale_transactions (pharmacy_id, created_by, item_count, total_amount)
  values (p_pharmacy_id, p_created_by, jsonb_array_length(p_items), 0)
  returning id, created_at into v_transaction_id, v_transaction_created_at;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_line_number := v_line_number + 1;

    begin
      v_product_id := (v_item->>'product_id')::uuid;
      v_quantity_entered := (v_item->>'quantity_entered')::integer;
      v_override_price := case
        when v_item->>'override_price' is null or btrim(v_item->>'override_price') = '' then null
        else (v_item->>'override_price')::numeric
      end;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Cart item % contains an invalid product, quantity, or price.', v_line_number using errcode = '22023';
    end;

    v_sell_type := upper(v_item->>'sell_type');

    if v_quantity_entered <= 0 then
      raise exception 'Cart item % quantity must be a whole number greater than zero.', v_line_number using errcode = '22023';
    end if;

    if v_sell_type not in ('UNIT', 'PACK') then
      raise exception 'Cart item % has an invalid sell type.', v_line_number using errcode = '22023';
    end if;

    if v_override_price is not null and v_override_price < 0 then
      raise exception 'Cart item % override price must be zero or greater.', v_line_number using errcode = '22023';
    end if;

    select
      product.id,
      product.selling_mode,
      product.units_per_pack,
      coalesce(product.default_unit_price, product.default_pack_price / nullif(product.units_per_pack, 0), product.default_selling_price) as unit_price,
      coalesce(product.default_pack_price, product.default_unit_price * product.units_per_pack) as pack_price
    into v_product
    from public.products product
    where product.id = v_product_id
      and product.pharmacy_id = p_pharmacy_id;

    if not found then
      raise exception 'Cart item % product was not found for this pharmacy.', v_line_number using errcode = '22023';
    end if;

    if v_product.selling_mode = 'UNIT' and v_sell_type <> 'UNIT' then
      raise exception 'Cart item % can only be sold by unit.', v_line_number using errcode = '22023';
    end if;

    if v_product.selling_mode = 'PACK' and v_sell_type <> 'PACK' then
      raise exception 'Cart item % can only be sold by pack.', v_line_number using errcode = '22023';
    end if;

    v_units_sold := case
      when v_sell_type = 'PACK' then v_quantity_entered * v_product.units_per_pack
      else v_quantity_entered
    end;
    v_default_price := case when v_sell_type = 'PACK' then v_product.pack_price else v_product.unit_price end;

    if v_default_price is null then
      raise exception 'Cart item % does not have a price for this sell type.', v_line_number using errcode = '22023';
    end if;

    v_effective_price := coalesce(v_override_price, v_default_price);

    select
      coalesce((select sum(batch.total_units_received) from public.inventory_batches batch where batch.pharmacy_id = p_pharmacy_id and batch.product_id = v_product_id), 0)::integer
      - coalesce((select sum(sale.units_sold) from public.sales sale where sale.pharmacy_id = p_pharmacy_id and sale.product_id = v_product_id), 0)::integer
    into v_available_stock;

    if v_units_sold > v_available_stock then
      raise exception 'Cart item % has insufficient stock. Only % units are available.', v_line_number, v_available_stock using errcode = 'P0001';
    end if;

    insert into public.sales (
      pharmacy_id,
      transaction_id,
      line_number,
      product_id,
      sell_type,
      quantity_entered,
      units_sold,
      quantity_sold,
      default_price,
      override_price,
      effective_price,
      final_selling_price,
      created_at
    )
    values (
      p_pharmacy_id,
      v_transaction_id,
      v_line_number,
      v_product_id,
      v_sell_type,
      v_quantity_entered,
      v_units_sold,
      v_units_sold,
      v_default_price,
      v_override_price,
      v_effective_price,
      v_override_price,
      v_transaction_created_at
    )
    returning id, total_sale into v_sale_id, v_sale_total;

    select coalesce(sum(greatest(sale.units_sold - coalesce(allocated.quantity, 0), 0)), 0)::integer
    into v_historical_unallocated
    from public.sales sale
    left join (
      select allocation.sale_id, sum(allocation.quantity)::integer as quantity
      from public.sale_batch_allocations allocation
      where allocation.pharmacy_id = p_pharmacy_id
        and allocation.product_id = v_product_id
      group by allocation.sale_id
    ) allocated on allocated.sale_id = sale.id
    where sale.pharmacy_id = p_pharmacy_id
      and sale.product_id = v_product_id
      and sale.id <> v_sale_id;

    v_remaining := v_units_sold;

    for v_batch in
      select batch.*
      from public.inventory_batches batch
      where batch.pharmacy_id = p_pharmacy_id
        and batch.product_id = v_product_id
      order by batch.expiry_date, batch.created_at, batch.id
    loop
      select coalesce(sum(allocation.quantity), 0)::integer
      into v_batch_allocated
      from public.sale_batch_allocations allocation
      where allocation.pharmacy_id = p_pharmacy_id
        and allocation.inventory_batch_id = v_batch.id;

      v_batch_available := v_batch.total_units_received - v_batch_allocated;

      if v_historical_unallocated > 0 and v_batch_available > 0 then
        v_reserved := least(v_batch_available, v_historical_unallocated);
        v_batch_available := v_batch_available - v_reserved;
        v_historical_unallocated := v_historical_unallocated - v_reserved;
      end if;

      if v_remaining > 0 and v_batch_available > 0 then
        v_allocated := least(v_remaining, v_batch_available);
        v_unit_cost := coalesce(v_batch.buying_price_per_pack, v_batch.buying_price, 0) / nullif(v_batch.units_per_pack, 0);

        insert into public.sale_batch_allocations (
          pharmacy_id,
          sale_id,
          product_id,
          inventory_batch_id,
          quantity,
          unit_cost_at_sale,
          cost_of_goods_sold,
          created_at
        )
        values (
          p_pharmacy_id,
          v_sale_id,
          v_product_id,
          v_batch.id,
          v_allocated,
          coalesce(v_unit_cost, 0),
          round(v_allocated * coalesce(v_unit_cost, 0), 2),
          v_transaction_created_at
        );

        v_remaining := v_remaining - v_allocated;
      end if;

      exit when v_remaining = 0 and v_historical_unallocated = 0;
    end loop;

    if v_remaining > 0 then
      raise exception 'Cart item % could not be allocated to inventory batches.', v_line_number using errcode = 'P0001';
    end if;

    v_total_amount := v_total_amount + v_sale_total;
    v_sale_ids := v_sale_ids || jsonb_build_array(v_sale_id);
  end loop;

  update public.sale_transactions
  set total_amount = v_total_amount
  where id = v_transaction_id;

  return jsonb_build_object(
    'id', v_transaction_id,
    'pharmacy_id', p_pharmacy_id,
    'created_by', p_created_by,
    'item_count', jsonb_array_length(p_items),
    'total_amount', v_total_amount,
    'created_at', v_transaction_created_at,
    'sale_ids', v_sale_ids
  );
end;
$$;

revoke all on function public.create_sale_transaction_v1(uuid, uuid, jsonb) from public;
revoke all on function public.create_sale_transaction_v1(uuid, uuid, jsonb) from anon;
revoke all on function public.create_sale_transaction_v1(uuid, uuid, jsonb) from authenticated;
grant execute on function public.create_sale_transaction_v1(uuid, uuid, jsonb) to service_role;
