create table if not exists public.pharmacy_sessions (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  session_token text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen timestamptz not null default now()
);

create unique index if not exists pharmacy_sessions_token_unique_idx
on public.pharmacy_sessions(session_token);

create index if not exists pharmacy_sessions_pharmacy_id_idx
on public.pharmacy_sessions(pharmacy_id);

create index if not exists pharmacy_sessions_expires_at_idx
on public.pharmacy_sessions(expires_at);
