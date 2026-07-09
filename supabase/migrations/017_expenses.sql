create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  expense_date date not null,
  category text not null,
  description text not null default '',
  amount numeric(12, 2) not null,
  created_by uuid references public.pharmacy_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_category_check check (
    category in ('Rent', 'Salary', 'Electricity', 'Water', 'Internet', 'Transport', 'Repairs', 'Supplies', 'Other')
  ),
  constraint expenses_amount_check check (amount >= 0)
);

create index if not exists expenses_pharmacy_date_idx on public.expenses(pharmacy_id, expense_date desc);
create index if not exists expenses_pharmacy_category_idx on public.expenses(pharmacy_id, category);
create index if not exists expenses_created_by_idx on public.expenses(created_by);

create or replace function public.set_expenses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at
before update on public.expenses
for each row
execute function public.set_expenses_updated_at();
