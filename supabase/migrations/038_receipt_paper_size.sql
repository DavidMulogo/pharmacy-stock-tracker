alter table public.pharmacy_settings
  add column if not exists receipt_paper_size text not null default 'THERMAL_80MM';

alter table public.pharmacy_settings
  drop constraint if exists pharmacy_settings_receipt_paper_size_check;

alter table public.pharmacy_settings
  add constraint pharmacy_settings_receipt_paper_size_check
  check (receipt_paper_size in ('THERMAL_58MM', 'THERMAL_80MM', 'A4'));

