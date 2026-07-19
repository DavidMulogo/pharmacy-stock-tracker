alter table public.admin_users
  add column if not exists session_version integer not null default 1,
  add column if not exists failed_login_attempts integer not null default 0,
  add column if not exists locked_until timestamptz;

alter table public.admin_users
  drop constraint if exists admin_users_session_version_check,
  add constraint admin_users_session_version_check check (session_version >= 1),
  drop constraint if exists admin_users_failed_login_attempts_check,
  add constraint admin_users_failed_login_attempts_check check (failed_login_attempts >= 0);

create index if not exists admin_users_locked_until_idx
on public.admin_users(locked_until)
where locked_until is not null;
