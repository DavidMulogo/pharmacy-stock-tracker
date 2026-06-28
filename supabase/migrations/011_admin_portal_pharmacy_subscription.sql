alter table public.pharmacies
  add column if not exists plan text not null default 'TRIAL',
  add column if not exists status text not null default 'TRIAL',
  add column if not exists trial_ends_at timestamptz,
  add column if not exists subscription_ends_at timestamptz;

alter table public.pharmacies
  drop constraint if exists pharmacies_plan_check,
  add constraint pharmacies_plan_check check (plan in ('TRIAL', 'BASIC', 'PRO', 'ENTERPRISE')),
  drop constraint if exists pharmacies_status_check,
  add constraint pharmacies_status_check check (status in ('ACTIVE', 'TRIAL', 'EXPIRED', 'SUSPENDED'));

create index if not exists pharmacies_plan_idx on public.pharmacies(plan);
create index if not exists pharmacies_status_idx on public.pharmacies(status);
