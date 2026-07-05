with legacy_pharmacies as (
  select pharmacies.id
  from public.pharmacies
  where not exists (
    select 1
    from public.pharmacy_users
    where pharmacy_users.pharmacy_id = pharmacies.id
  )
),
default_staff(username, full_name, role, password_hash) as (
  values
    ('owner', 'Pharmacy Owner', 'OWNER', '$2b$12$83PblQrYckHsOAv9Fc/yzOXQejUmpnaAFDP03z/AaY7sJL1tfhqda'),
    ('pharmacist', 'Staff Pharmacist', 'PHARMACIST', '$2b$12$83PblQrYckHsOAv9Fc/yzOXQejUmpnaAFDP03z/AaY7sJL1tfhqda'),
    ('technician', 'Pharmacy Technician', 'TECHNICIAN', '$2b$12$83PblQrYckHsOAv9Fc/yzOXQejUmpnaAFDP03z/AaY7sJL1tfhqda')
)
insert into public.pharmacy_users (pharmacy_id, username, full_name, role, password_hash, active)
select
  legacy_pharmacies.id,
  default_staff.username,
  default_staff.full_name,
  default_staff.role,
  default_staff.password_hash,
  true
from legacy_pharmacies
cross join default_staff
on conflict do nothing;
