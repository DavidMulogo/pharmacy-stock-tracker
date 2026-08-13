create table if not exists public.master_medicines (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  generic_name text not null,
  brand_name text not null default '',
  strength text not null default '',
  dosage_form text not null,
  base_unit text not null,
  pack_type text not null,
  units_per_pack integer not null check (units_per_pack > 0),
  default_selling_mode text not null default 'BOTH' check (default_selling_mode in ('UNIT', 'PACK', 'BOTH')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists master_medicines_identity_idx
  on public.master_medicines(lower(btrim(product_name)), lower(btrim(dosage_form)), units_per_pack);
create index if not exists master_medicines_search_idx
  on public.master_medicines(active, lower(product_name), lower(generic_name));

alter table public.products add column if not exists master_medicine_id uuid references public.master_medicines(id) on delete set null;
create unique index if not exists products_pharmacy_master_medicine_unique_idx
  on public.products(pharmacy_id, master_medicine_id)
  where pharmacy_id is not null and master_medicine_id is not null;

alter table public.master_medicines enable row level security;
revoke all on public.master_medicines from anon, authenticated;

insert into public.master_medicines
  (product_name, generic_name, strength, dosage_form, base_unit, pack_type, units_per_pack, default_selling_mode)
values
  ('Paracetamol 500 mg Tablets', 'Paracetamol', '500 mg', 'Tablet', 'tablet', 'strip', 10, 'BOTH'),
  ('Paracetamol 120 mg/5 mL Oral Suspension', 'Paracetamol', '120 mg/5 mL', 'Oral suspension', 'bottle', 'bottle', 1, 'PACK'),
  ('Amoxicillin 500 mg Capsules', 'Amoxicillin', '500 mg', 'Capsule', 'capsule', 'blister pack', 10, 'BOTH'),
  ('Amoxicillin 250 mg/5 mL Oral Suspension', 'Amoxicillin', '250 mg/5 mL', 'Oral suspension', 'bottle', 'bottle', 1, 'PACK'),
  ('Metronidazole 400 mg Tablets', 'Metronidazole', '400 mg', 'Tablet', 'tablet', 'strip', 10, 'BOTH'),
  ('Ciprofloxacin 500 mg Tablets', 'Ciprofloxacin', '500 mg', 'Tablet', 'tablet', 'blister pack', 10, 'BOTH'),
  ('Azithromycin 500 mg Tablets', 'Azithromycin', '500 mg', 'Tablet', 'tablet', 'blister pack', 3, 'BOTH'),
  ('Cetirizine 10 mg Tablets', 'Cetirizine', '10 mg', 'Tablet', 'tablet', 'strip', 10, 'BOTH'),
  ('Loratadine 10 mg Tablets', 'Loratadine', '10 mg', 'Tablet', 'tablet', 'blister pack', 10, 'BOTH'),
  ('Omeprazole 20 mg Capsules', 'Omeprazole', '20 mg', 'Capsule', 'capsule', 'blister pack', 14, 'BOTH'),
  ('Diclofenac 50 mg Tablets', 'Diclofenac sodium', '50 mg', 'Tablet', 'tablet', 'blister pack', 10, 'BOTH'),
  ('Ibuprofen 400 mg Tablets', 'Ibuprofen', '400 mg', 'Tablet', 'tablet', 'blister pack', 10, 'BOTH'),
  ('ORS Sachets', 'Oral rehydration salts', '', 'Powder for oral solution', 'sachet', 'box', 20, 'BOTH'),
  ('Zinc Sulfate 20 mg Dispersible Tablets', 'Zinc sulfate', '20 mg', 'Dispersible tablet', 'tablet', 'blister pack', 10, 'BOTH'),
  ('Salbutamol 100 mcg Inhaler', 'Salbutamol', '100 mcg/dose', 'Inhaler', 'inhaler', 'inhaler', 1, 'PACK'),
  ('Amlodipine 5 mg Tablets', 'Amlodipine', '5 mg', 'Tablet', 'tablet', 'blister pack', 30, 'BOTH'),
  ('Metformin 500 mg Tablets', 'Metformin', '500 mg', 'Tablet', 'tablet', 'blister pack', 10, 'BOTH'),
  ('Co-trimoxazole 480 mg Tablets', 'Sulfamethoxazole/Trimethoprim', '400 mg/80 mg', 'Tablet', 'tablet', 'blister pack', 10, 'BOTH'),
  ('Hydrocortisone 1% Cream', 'Hydrocortisone', '1%', 'Cream', 'tube', 'tube', 1, 'PACK'),
  ('Clotrimazole 1% Cream', 'Clotrimazole', '1%', 'Cream', 'tube', 'tube', 1, 'PACK')
on conflict do nothing;
