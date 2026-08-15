create table if not exists public.pilot_feedback (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  submitted_by uuid references public.pharmacy_users(id) on delete set null,
  reporter_name text not null,
  reporter_role text not null,
  category text not null check (category in ('BUG', 'CONFUSING', 'SLOW', 'SUGGESTION', 'OTHER')),
  priority text not null default 'NORMAL' check (priority in ('LOW', 'NORMAL', 'HIGH', 'BLOCKER')),
  workflow text not null,
  title text not null check (char_length(btrim(title)) between 4 and 120),
  description text not null check (char_length(btrim(description)) between 10 and 2000),
  page_path text not null default '',
  user_agent text not null default '',
  status text not null default 'NEW' check (status in ('NEW', 'REVIEWING', 'PLANNED', 'RESOLVED', 'CLOSED')),
  admin_notes text not null default '',
  reviewed_by_admin text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pilot_feedback_pharmacy_created_idx
  on public.pilot_feedback(pharmacy_id, created_at desc);
create index if not exists pilot_feedback_admin_queue_idx
  on public.pilot_feedback(status, priority, created_at desc);

alter table public.pilot_feedback enable row level security;
revoke all on public.pilot_feedback from anon, authenticated;
