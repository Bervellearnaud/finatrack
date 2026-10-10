-- FinaTrack CI — Table Épargne (Savings) — FIX 400 uuid error
-- À exécuter dans Supabase Dashboard > SQL Editor > Run
-- Compatible avec uid() local (ex: m123abc) => id TEXT, pas UUID

-- 1. Supprime ancienne table si elle était en UUID (elle était vide car insert échouait)
drop table if exists public.savings cascade;

-- 2. Créer la table savings avec id TEXT
create table public.savings (
  id text primary key,
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

-- 3. Index
create index if not exists idx_savings_user_id on public.savings(user_id);
create index if not exists idx_savings_date on public.savings(date desc);

-- 4. RLS
alter table public.savings enable row level security;

drop policy if exists "Users can manage own savings" on public.savings;
create policy "Users can manage own savings"
on public.savings for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 5. Trigger updated_at
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

-- 6. Vérif
-- select * from public.savings where user_id = auth.uid();
