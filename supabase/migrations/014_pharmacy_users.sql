create table if not exists public.pharmacy_users (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  full_name text not null,
  username text not null,
  password_hash text not null,
  role text not null default 'TECHNICIAN',
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pharmacy_users_role_check check (role in ('OWNER', 'PHARMACIST', 'TECHNICIAN'))
);

create unique index if not exists pharmacy_users_username_unique_idx
on public.pharmacy_users(pharmacy_id, lower(btrim(username)));

create index if not exists pharmacy_users_pharmacy_id_idx on public.pharmacy_users(pharmacy_id);
create index if not exists pharmacy_users_active_idx on public.pharmacy_users(active);

create or replace function public.set_pharmacy_users_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_pharmacy_users_updated_at on public.pharmacy_users;
create trigger set_pharmacy_users_updated_at
before update on public.pharmacy_users
for each row
execute function public.set_pharmacy_users_updated_at();

insert into public.pharmacy_users (pharmacy_id, full_name, username, password_hash, role, active)
select
  pharmacies.id,
  pharmacies.owner_name,
  pharmacy_access.pharmacy_code,
  pharmacy_access.password_hash,
  'OWNER',
  true
from public.pharmacies
join public.pharmacy_access on pharmacy_access.pharmacy_id = pharmacies.id
where pharmacy_access.password_hash is not null
  and not exists (
    select 1
    from public.pharmacy_users
    where pharmacy_users.pharmacy_id = pharmacies.id
      and lower(btrim(pharmacy_users.username)) = lower(btrim(pharmacy_access.pharmacy_code))
  );

alter table public.pharmacy_sessions
  add column if not exists pharmacy_user_id uuid references public.pharmacy_users(id) on delete set null,
  add column if not exists role text;

alter table public.pharmacy_sessions
  drop constraint if exists pharmacy_sessions_role_check,
  add constraint pharmacy_sessions_role_check check (role is null or role in ('OWNER', 'PHARMACIST', 'TECHNICIAN'));

create index if not exists pharmacy_sessions_pharmacy_user_id_idx
on public.pharmacy_sessions(pharmacy_user_id);
