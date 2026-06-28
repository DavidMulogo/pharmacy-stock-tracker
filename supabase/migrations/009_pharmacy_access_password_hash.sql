alter table public.pharmacy_access
  add column if not exists password_hash text;

create index if not exists pharmacy_access_password_hash_idx
on public.pharmacy_access(password_hash)
where password_hash is not null;
