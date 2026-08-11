alter table public.pharmacies
  drop constraint if exists pharmacies_plan_check;

update public.pharmacies set plan = 'STARTER' where plan = 'BASIC';
update public.pharmacies set plan = 'BUSINESS' where plan = 'PRO';

alter table public.pharmacies
  add constraint pharmacies_plan_check
  check (plan in ('TRIAL', 'STARTER', 'BUSINESS', 'MULTI_BRANCH', 'ENTERPRISE')),
  add column if not exists billing_cycle text,
  add column if not exists agreed_price_tzs numeric(12, 2),
  add column if not exists subscription_started_at timestamptz,
  add column if not exists pilot_started_at timestamptz,
  add column if not exists pilot_ends_at timestamptz,
  add column if not exists founding_price_ends_at timestamptz,
  add column if not exists grace_period_ends_at timestamptz,
  add column if not exists access_extension_ends_at timestamptz,
  add column if not exists entitlement_mode text not null default 'OBSERVE';

alter table public.pharmacies
  drop constraint if exists pharmacies_billing_cycle_check,
  add constraint pharmacies_billing_cycle_check
    check (billing_cycle is null or billing_cycle in ('MONTHLY', 'ANNUAL', 'CUSTOM')),
  drop constraint if exists pharmacies_agreed_price_tzs_check,
  add constraint pharmacies_agreed_price_tzs_check
    check (agreed_price_tzs is null or agreed_price_tzs >= 0),
  drop constraint if exists pharmacies_entitlement_mode_check,
  add constraint pharmacies_entitlement_mode_check
    check (entitlement_mode in ('OBSERVE', 'ENFORCE'));

create table if not exists public.pharmacy_subscription_history (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  changed_by_admin text not null,
  change_reason text not null,
  previous_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pharmacy_subscription_history_pharmacy_created_idx
  on public.pharmacy_subscription_history(pharmacy_id, created_at desc);

alter table public.pharmacy_subscription_history enable row level security;
revoke all on public.pharmacy_subscription_history from anon, authenticated;

create or replace function public.update_pharmacy_subscription_v1(
  p_pharmacy_id uuid,
  p_changed_by_admin text,
  p_change_reason text,
  p_plan text,
  p_status text,
  p_billing_cycle text,
  p_agreed_price_tzs numeric,
  p_trial_ends_at timestamptz,
  p_subscription_started_at timestamptz,
  p_subscription_ends_at timestamptz,
  p_pilot_started_at timestamptz,
  p_pilot_ends_at timestamptz,
  p_founding_price_ends_at timestamptz,
  p_grace_period_ends_at timestamptz,
  p_access_extension_ends_at timestamptz,
  p_entitlement_mode text default 'OBSERVE'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous public.pharmacies%rowtype;
  v_updated public.pharmacies%rowtype;
  v_reason text := btrim(coalesce(p_change_reason, ''));
begin
  if btrim(coalesce(p_changed_by_admin, '')) = '' then
    raise exception 'Admin identity is required.' using errcode = 'P0001';
  end if;
  if v_reason = '' then
    raise exception 'A subscription change reason is required.' using errcode = 'P0001';
  end if;

  select * into v_previous from public.pharmacies where id = p_pharmacy_id for update;
  if not found then
    raise exception 'Pharmacy was not found.' using errcode = 'P0001';
  end if;

  update public.pharmacies
  set plan = p_plan,
      status = p_status,
      billing_cycle = p_billing_cycle,
      agreed_price_tzs = p_agreed_price_tzs,
      trial_ends_at = p_trial_ends_at,
      subscription_started_at = p_subscription_started_at,
      subscription_ends_at = p_subscription_ends_at,
      pilot_started_at = p_pilot_started_at,
      pilot_ends_at = p_pilot_ends_at,
      founding_price_ends_at = p_founding_price_ends_at,
      grace_period_ends_at = p_grace_period_ends_at,
      access_extension_ends_at = p_access_extension_ends_at,
      entitlement_mode = p_entitlement_mode
  where id = p_pharmacy_id
  returning * into v_updated;

  insert into public.pharmacy_subscription_history (
    pharmacy_id, changed_by_admin, change_reason, previous_values, new_values
  ) values (
    p_pharmacy_id,
    p_changed_by_admin,
    v_reason,
    jsonb_build_object(
      'plan', v_previous.plan, 'status', v_previous.status,
      'billing_cycle', v_previous.billing_cycle, 'agreed_price_tzs', v_previous.agreed_price_tzs,
      'trial_ends_at', v_previous.trial_ends_at, 'subscription_started_at', v_previous.subscription_started_at,
      'subscription_ends_at', v_previous.subscription_ends_at, 'pilot_started_at', v_previous.pilot_started_at,
      'pilot_ends_at', v_previous.pilot_ends_at, 'founding_price_ends_at', v_previous.founding_price_ends_at,
      'grace_period_ends_at', v_previous.grace_period_ends_at,
      'access_extension_ends_at', v_previous.access_extension_ends_at,
      'entitlement_mode', v_previous.entitlement_mode
    ),
    jsonb_build_object(
      'plan', v_updated.plan, 'status', v_updated.status,
      'billing_cycle', v_updated.billing_cycle, 'agreed_price_tzs', v_updated.agreed_price_tzs,
      'trial_ends_at', v_updated.trial_ends_at, 'subscription_started_at', v_updated.subscription_started_at,
      'subscription_ends_at', v_updated.subscription_ends_at, 'pilot_started_at', v_updated.pilot_started_at,
      'pilot_ends_at', v_updated.pilot_ends_at, 'founding_price_ends_at', v_updated.founding_price_ends_at,
      'grace_period_ends_at', v_updated.grace_period_ends_at,
      'access_extension_ends_at', v_updated.access_extension_ends_at,
      'entitlement_mode', v_updated.entitlement_mode
    )
  );

  return to_jsonb(v_updated);
end;
$$;

revoke all on function public.update_pharmacy_subscription_v1(
  uuid, text, text, text, text, text, numeric, timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.update_pharmacy_subscription_v1(
  uuid, text, text, text, text, text, numeric, timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, text
) to service_role;
