alter table public.pharmacies
  add column if not exists archived_at timestamptz;

create index if not exists pharmacies_archived_at_idx
on public.pharmacies(archived_at);
