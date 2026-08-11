alter table public.admin_activity_logs
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists admin_activity_logs_password_resets_idx
  on public.admin_activity_logs(action, created_at desc)
  where action in ('OWNER_PASSWORD_RESET', 'STAFF_PASSWORD_RESET');
