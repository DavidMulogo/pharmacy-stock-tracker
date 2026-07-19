create table if not exists public.pharmacy_onboarding (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null unique references public.pharmacies(id) on delete cascade,
  started_at timestamptz not null default now(),
  profile_reviewed_at timestamptz,
  business_rules_reviewed_at timestamptz,
  staff_reviewed_at timestamptz,
  products_reviewed_at timestamptz,
  opening_stock_reviewed_at timestamptz,
  subscription_reviewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pharmacy_onboarding_pharmacy_id_idx
on public.pharmacy_onboarding(pharmacy_id);
