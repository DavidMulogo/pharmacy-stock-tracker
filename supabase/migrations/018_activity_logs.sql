create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  actor_user_id uuid references public.pharmacy_users(id) on delete set null,
  actor_name text not null,
  actor_role text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_pharmacy_created_idx
  on public.activity_logs(pharmacy_id, created_at desc);

create index if not exists activity_logs_pharmacy_action_idx
  on public.activity_logs(pharmacy_id, action, created_at desc);

create index if not exists activity_logs_actor_idx
  on public.activity_logs(actor_user_id, created_at desc);

