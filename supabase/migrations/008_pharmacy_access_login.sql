create table if not exists public.pharmacy_access (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  pharmacy_code text not null,
  password text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists pharmacy_access_code_unique_idx
on public.pharmacy_access (lower(btrim(pharmacy_code)));

create index if not exists pharmacy_access_pharmacy_id_idx
on public.pharmacy_access(pharmacy_id);
