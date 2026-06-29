create table if not exists public.pharmacy_settings (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null unique references public.pharmacies(id) on delete cascade,
  registration_number text not null default '',
  license_number text not null default '',
  address text not null default '',
  region text not null default '',
  district text not null default '',
  email text not null default '',
  logo_url text not null default '',
  receipt_header text not null default 'PharmaStock',
  receipt_footer text not null default 'Thank you for your purchase.',
  receipt_prefix text not null default 'RCP',
  low_stock_threshold integer not null default 10,
  expiry_warning_days integer not null default 30,
  allow_negative_stock boolean not null default false,
  allow_duplicate_batches boolean not null default false,
  allow_price_override boolean not null default true,
  max_discount numeric(10, 2) not null default 0,
  vat_percentage numeric(10, 2) not null default 0,
  currency text not null default 'TZS',
  timezone text not null default 'Africa/Dar_es_Salaam',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pharmacy_settings_low_stock_threshold_check check (low_stock_threshold >= 0),
  constraint pharmacy_settings_expiry_warning_days_check check (expiry_warning_days >= 0),
  constraint pharmacy_settings_max_discount_check check (max_discount >= 0 and max_discount <= 100),
  constraint pharmacy_settings_vat_percentage_check check (vat_percentage >= 0 and vat_percentage <= 100)
);

create index if not exists pharmacy_settings_pharmacy_id_idx on public.pharmacy_settings(pharmacy_id);

create or replace function public.set_pharmacy_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_pharmacy_settings_updated_at on public.pharmacy_settings;
create trigger set_pharmacy_settings_updated_at
before update on public.pharmacy_settings
for each row
execute function public.set_pharmacy_settings_updated_at();

create or replace function public.create_default_pharmacy_settings()
returns trigger
language plpgsql
as $$
begin
  insert into public.pharmacy_settings (pharmacy_id, receipt_header)
  values (new.id, new.pharmacy_name)
  on conflict (pharmacy_id) do nothing;

  return new;
end;
$$;

drop trigger if exists create_default_pharmacy_settings on public.pharmacies;
create trigger create_default_pharmacy_settings
after insert on public.pharmacies
for each row
execute function public.create_default_pharmacy_settings();

insert into public.pharmacy_settings (pharmacy_id, receipt_header)
select pharmacies.id, pharmacies.pharmacy_name
from public.pharmacies
where not exists (
  select 1
  from public.pharmacy_settings
  where pharmacy_settings.pharmacy_id = pharmacies.id
);
