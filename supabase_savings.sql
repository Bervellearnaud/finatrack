-- FinaTrack CI — Table Épargne (Savings)
-- À exécuter dans Supabase Dashboard > SQL Editor > Run

-- 1. Créer la table savings
create table if not exists public.savings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null default 0,
  goal text not null default 'Épargne',
  description text,
  target_amount numeric,
  current_amount numeric default 0,
  date date not null default current_date,
  payment_method text default 'Espèces',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Index
create index if not exists idx_savings_user_id on public.savings(user_id);
create index if not exists idx_savings_date on public.savings(date desc);

-- 3. RLS
alter table public.savings enable row level security;

drop policy if exists "Users can manage own savings" on public.savings;
create policy "Users can manage own savings"
on public.savings for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 4. Trigger updated_at
create or replace function public.handle_savings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_savings_updated_at on public.savings;
create trigger set_savings_updated_at
before update on public.savings
for each row execute function public.handle_savings_updated_at();

-- 5. Test
-- insert into public.savings (user_id, amount, goal, description) values (auth.uid(), 50000, 'Tontine', 'Tontine mensuelle');
-- select * from public.savings where user_id = auth.uid();
