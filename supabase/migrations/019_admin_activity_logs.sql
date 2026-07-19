create table if not exists public.admin_activity_logs (
  id uuid primary key default gen_random_uuid(),
  admin_username text not null,
  admin_role text not null,
  action text not null,
  target_pharmacy_id uuid references public.pharmacies(id) on delete set null,
  target_pharmacy_name text,
  backup_checksum text,
  restored_counts jsonb not null default '{}'::jsonb,
  skipped_counts jsonb not null default '{}'::jsonb,
  success boolean not null default true,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists admin_activity_logs_created_idx
  on public.admin_activity_logs(created_at desc);

create index if not exists admin_activity_logs_target_pharmacy_idx
  on public.admin_activity_logs(target_pharmacy_id, created_at desc);

create index if not exists admin_activity_logs_action_idx
  on public.admin_activity_logs(action, created_at desc);

create or replace function public.restore_pharmastock_backup_v1(
  p_target_pharmacy_id uuid,
  p_backup jsonb,
  p_fail_after text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_count integer := 0;
  products_count integer := 0;
  batches_count integer := 0;
  sales_count integer := 0;
  expenses_count integer := 0;
  settings_total integer := 0;
  products_total integer := 0;
  batches_total integer := 0;
  sales_total integer := 0;
  expenses_total integer := 0;
begin
  if not exists (select 1 from public.pharmacies where id = p_target_pharmacy_id) then
    raise exception 'target pharmacy not found';
  end if;

  if nullif(p_backup #>> '{pharmacy,id}', '')::uuid is distinct from p_target_pharmacy_id then
    raise exception 'backup pharmacy does not match target pharmacy';
  end if;

  settings_total := case when p_backup #> '{datasets,pharmacy_settings}' is null or p_backup #> '{datasets,pharmacy_settings}' = 'null'::jsonb then 0 else 1 end;
  products_total := coalesce(jsonb_array_length(p_backup #> '{datasets,products}'), 0);
  batches_total := coalesce(jsonb_array_length(p_backup #> '{datasets,inventory_batches}'), 0);
  sales_total := coalesce(jsonb_array_length(p_backup #> '{datasets,sales}'), 0);
  expenses_total := coalesce(jsonb_array_length(p_backup #> '{datasets,expenses}'), 0);

  if settings_total = 1 and not exists (select 1 from public.pharmacy_settings where pharmacy_id = p_target_pharmacy_id) then
    insert into public.pharmacy_settings (
      id,
      pharmacy_id,
      registration_number,
      license_number,
      address,
      region,
      district,
      email,
      logo_url,
      receipt_header,
      receipt_footer,
      receipt_prefix,
      low_stock_threshold,
      expiry_warning_days,
      allow_negative_stock,
      allow_duplicate_batches,
      allow_price_override,
      max_discount,
      vat_percentage,
      currency,
      timezone,
      created_at,
      updated_at
    )
    select
      coalesce(nullif(setting->>'id', '')::uuid, gen_random_uuid()),
      p_target_pharmacy_id,
      coalesce(setting->>'registration_number', ''),
      coalesce(setting->>'license_number', ''),
      coalesce(setting->>'address', ''),
      coalesce(setting->>'region', ''),
      coalesce(setting->>'district', ''),
      coalesce(setting->>'email', ''),
      coalesce(setting->>'logo_url', ''),
      coalesce(setting->>'receipt_header', 'PharmaStock'),
      coalesce(setting->>'receipt_footer', 'Thank you for your purchase.'),
      coalesce(setting->>'receipt_prefix', 'RCP'),
      coalesce((setting->>'low_stock_threshold')::integer, 10),
      coalesce((setting->>'expiry_warning_days')::integer, 30),
      coalesce((setting->>'allow_negative_stock')::boolean, false),
      coalesce((setting->>'allow_duplicate_batches')::boolean, false),
      coalesce((setting->>'allow_price_override')::boolean, true),
      coalesce((setting->>'max_discount')::numeric, 0),
      coalesce((setting->>'vat_percentage')::numeric, 0),
      coalesce(setting->>'currency', 'TZS'),
      coalesce(setting->>'timezone', 'Africa/Dar_es_Salaam'),
      coalesce((setting->>'created_at')::timestamptz, now()),
      coalesce((setting->>'updated_at')::timestamptz, now())
    from (select p_backup #> '{datasets,pharmacy_settings}' as setting) s;

    get diagnostics settings_count = row_count;
  end if;

  if p_fail_after = 'settings' then
    raise exception 'forced restore failure after settings';
  end if;

  with inserted as (
    insert into public.products (
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
      created_at
    )
    select
      item.id,
      p_target_pharmacy_id,
      item.product_name,
      item.generic_name,
      item.brand_name,
      item.dosage_form,
      item.base_unit,
      item.pack_type,
      item.units_per_pack,
      item.default_selling_price,
      item.selling_mode,
      item.default_unit_price,
      item.default_pack_price,
      item.reorder_level,
      item.created_at
    from jsonb_to_recordset(coalesce(p_backup #> '{datasets,products}', '[]'::jsonb)) as item(
      id uuid,
      pharmacy_id uuid,
      product_name text,
      generic_name text,
      brand_name text,
      dosage_form text,
      base_unit text,
      pack_type text,
      units_per_pack integer,
      default_selling_price numeric,
      selling_mode text,
      default_unit_price numeric,
      default_pack_price numeric,
      reorder_level integer,
      created_at timestamptz
    )
    where item.pharmacy_id = p_target_pharmacy_id
      and not exists (select 1 from public.products existing where existing.id = item.id)
    on conflict do nothing
    returning id
  )
  select count(*) into products_count from inserted;

  if p_fail_after = 'products' then
    raise exception 'forced restore failure after products';
  end if;

  with inserted as (
    insert into public.inventory_batches (
      id,
      pharmacy_id,
      product_id,
      batch_number,
      expiry_date,
      packs_received,
      units_per_pack,
      buying_price,
      buying_price_per_pack,
      created_at
    )
    select
      item.id,
      p_target_pharmacy_id,
      item.product_id,
      item.batch_number,
      item.expiry_date,
      item.packs_received,
      item.units_per_pack,
      coalesce(item.buying_price, item.buying_price_per_pack, 0),
      coalesce(item.buying_price_per_pack, item.buying_price, 0),
      item.created_at
    from jsonb_to_recordset(coalesce(p_backup #> '{datasets,inventory_batches}', '[]'::jsonb)) as item(
      id uuid,
      pharmacy_id uuid,
      product_id uuid,
      batch_number text,
      expiry_date date,
      packs_received integer,
      units_per_pack integer,
      buying_price numeric,
      buying_price_per_pack numeric,
      created_at timestamptz
    )
    where item.pharmacy_id = p_target_pharmacy_id
      and exists (select 1 from public.products product where product.id = item.product_id and product.pharmacy_id = p_target_pharmacy_id)
      and not exists (select 1 from public.inventory_batches existing where existing.id = item.id)
    on conflict do nothing
    returning id
  )
  select count(*) into batches_count from inserted;

  if p_fail_after = 'inventory_batches' then
    raise exception 'forced restore failure after inventory_batches';
  end if;

  with inserted as (
    insert into public.sales (
      id,
      pharmacy_id,
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
    select
      item.id,
      p_target_pharmacy_id,
      item.product_id,
      item.sell_type,
      item.quantity_entered,
      item.units_sold,
      item.quantity_sold,
      item.default_price,
      item.override_price,
      item.effective_price,
      item.final_selling_price,
      item.created_at
    from jsonb_to_recordset(coalesce(p_backup #> '{datasets,sales}', '[]'::jsonb)) as item(
      id uuid,
      pharmacy_id uuid,
      product_id uuid,
      sell_type text,
      quantity_entered integer,
      units_sold integer,
      quantity_sold integer,
      default_price numeric,
      override_price numeric,
      effective_price numeric,
      final_selling_price numeric,
      created_at timestamptz
    )
    where item.pharmacy_id = p_target_pharmacy_id
      and exists (select 1 from public.products product where product.id = item.product_id and product.pharmacy_id = p_target_pharmacy_id)
      and not exists (select 1 from public.sales existing where existing.id = item.id)
    on conflict do nothing
    returning id
  )
  select count(*) into sales_count from inserted;

  if p_fail_after = 'sales' then
    raise exception 'forced restore failure after sales';
  end if;

  with inserted as (
    insert into public.expenses (
      id,
      pharmacy_id,
      expense_date,
      category,
      description,
      amount,
      created_by,
      created_at,
      updated_at
    )
    select
      item.id,
      p_target_pharmacy_id,
      item.expense_date,
      item.category,
      coalesce(item.description, ''),
      item.amount,
      case
        when exists (select 1 from public.pharmacy_users staff where staff.id = item.created_by and staff.pharmacy_id = p_target_pharmacy_id) then item.created_by
        else null
      end,
      item.created_at,
      item.updated_at
    from jsonb_to_recordset(coalesce(p_backup #> '{datasets,expenses}', '[]'::jsonb)) as item(
      id uuid,
      pharmacy_id uuid,
      expense_date date,
      category text,
      description text,
      amount numeric,
      created_by uuid,
      created_at timestamptz,
      updated_at timestamptz
    )
    where item.pharmacy_id = p_target_pharmacy_id
      and not exists (select 1 from public.expenses existing where existing.id = item.id)
    on conflict do nothing
    returning id
  )
  select count(*) into expenses_count from inserted;

  if p_fail_after = 'expenses' then
    raise exception 'forced restore failure after expenses';
  end if;

  return jsonb_build_object(
    'restored_counts', jsonb_build_object(
      'pharmacy_settings', settings_count,
      'products', products_count,
      'inventory_batches', batches_count,
      'sales', sales_count,
      'expenses', expenses_count
    ),
    'skipped_counts', jsonb_build_object(
      'pharmacy_settings', greatest(settings_total - settings_count, 0),
      'products', greatest(products_total - products_count, 0),
      'inventory_batches', greatest(batches_total - batches_count, 0),
      'sales', greatest(sales_total - sales_count, 0),
      'expenses', greatest(expenses_total - expenses_count, 0),
      'staff', coalesce(jsonb_array_length(p_backup #> '{datasets,staff}'), 0),
      'activity_logs', coalesce(jsonb_array_length(p_backup #> '{datasets,activity_logs}'), 0)
    )
  );
end;
$$;

revoke all on function public.restore_pharmastock_backup_v1(uuid, jsonb, text) from public;
revoke all on function public.restore_pharmastock_backup_v1(uuid, jsonb, text) from anon;
revoke all on function public.restore_pharmastock_backup_v1(uuid, jsonb, text) from authenticated;
grant execute on function public.restore_pharmastock_backup_v1(uuid, jsonb, text) to service_role;
