create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  type text not null check (type in (
    'LOW_STOCK',
    'OUT_OF_STOCK',
    'EXPIRING_SOON',
    'EXPIRED_BATCH',
    'TRIAL_EXPIRING',
    'SUBSCRIPTION_EXPIRING',
    'SUBSCRIPTION_EXPIRED'
  )),
  severity text not null check (severity in ('INFO', 'WARNING', 'CRITICAL')),
  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  dedupe_key text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'RESOLVED')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  read_at timestamptz,
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pharmacy_id, dedupe_key)
);

create index if not exists notifications_active_unread_idx
on public.notifications(pharmacy_id, status, read_at, severity, last_seen_at desc)
where status = 'ACTIVE';

create index if not exists notifications_pharmacy_status_idx
on public.notifications(pharmacy_id, status, last_seen_at desc);
