create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  full_name text,
  role text not null default 'SUPER_ADMIN',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_users_active_idx
on public.admin_users(active);

create or replace function public.set_admin_users_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists admin_users_set_updated_at on public.admin_users;

create trigger admin_users_set_updated_at
before update on public.admin_users
for each row
execute function public.set_admin_users_updated_at();

-- First admin setup:
-- 1. Generate a bcrypt hash outside SQL, for example in a local trusted script or Node REPL:
--    await bcrypt.hash('your-temporary-password', 12)
-- 2. Insert the admin using the generated hash:
--    insert into public.admin_users (username, password_hash, full_name)
--    values ('admin', '<bcrypt-hash-here>', 'System Admin');
-- 3. Do not commit real passwords or real password hashes into source control.
