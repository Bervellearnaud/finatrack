-- FinaTrack CI — Fix RLS pour toutes les tables
-- A exécuter dans Supabase Dashboard > SQL Editor > New Query > Run

-- 1. Activer RLS sur toutes les tables
alter table expenses enable row level security;
alter table incomes enable row level security;
alter table budgets enable row level security;
alter table wallets enable row level security;
alter table settings enable row level security;
alter table profiles enable row level security;

-- 2. Supprimer anciennes policies
drop policy if exists "Users can manage own expenses" on expenses;
drop policy if exists "Users can manage own incomes" on incomes;
drop policy if exists "Users can manage own budgets" on budgets;
drop policy if exists "Users can manage own wallets" on wallets;
drop policy if exists "Users can manage own settings" on settings;
drop policy if exists "Users can manage own profiles" on profiles;
drop policy if exists "Enable all for authenticated" on expenses;
drop policy if exists "Enable all for authenticated" on incomes;
drop policy if exists "Enable all for authenticated" on budgets;
drop policy if exists "Enable all for authenticated" on wallets;
drop policy if exists "Enable all for authenticated" on settings;

-- 3. Créer policies complètes (all = SELECT + INSERT + UPDATE + DELETE)
create policy "Users can manage own expenses"
on expenses for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can manage own incomes"
on incomes for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can manage own budgets"
on budgets for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can manage own wallets"
on wallets for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can manage own settings"
on settings for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can manage own profiles"
on profiles for all
using (auth.uid() = id)
with check (auth.uid() = id);

-- 4. Vérifier que les tables ont les bonnes colonnes
-- wallets doit avoir une contrainte unique sur (user_id, method) pour upsert
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wallets_user_method_unique'
  ) then
    alter table wallets add constraint wallets_user_method_unique unique (user_id, method);
  end if;
exception when duplicate_table then null;
end $$;

-- budgets unique sur (user_id, month)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'budgets_user_month_unique'
  ) then
    alter table budgets add constraint budgets_user_month_unique unique (user_id, month);
  end if;
exception when duplicate_table then null;
end $$;

-- settings : colonnes manquantes et contrainte unique
do $$
begin
  -- ajoute colonnes si elles n'existent pas
  if not exists (select 1 from information_schema.columns where table_name='settings' and column_name='currency') then
    alter table settings add column currency text default 'FCFA';
  end if;
  if not exists (select 1 from information_schema.columns where table_name='settings' and column_name='theme') then
    alter table settings add column theme text default 'light';
  end if;
  if not exists (select 1 from information_schema.columns where table_name='settings' and column_name='text_size') then
    alter table settings add column text_size text default 'normal';
  end if;
  if not exists (select 1 from information_schema.columns where table_name='settings' and column_name='voice_language') then
    alter table settings add column voice_language text default 'fr-FR';
  end if;
  if not exists (select 1 from information_schema.columns where table_name='settings' and column_name='area') then
    alter table settings add column area text default 'Cocody — Angré';
  end if;
  if not exists (select 1 from information_schema.columns where table_name='settings' and column_name='alerts_enabled') then
    alter table settings add column alerts_enabled boolean default true;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='settings' and column_name='updated_at') then
    alter table settings add column updated_at timestamptz default now();
  end if;
  -- contrainte unique user_id
  if not exists (select 1 from pg_constraint where conname = 'settings_user_unique') then
    alter table settings add constraint settings_user_unique unique (user_id);
  end if;
exception when others then null;
end $$;

-- profiles : retire default Cocody — Angré sur area, laisse vide / nullable
do $$
begin
  -- retire default fixe sur area
  alter table profiles alter column area drop default;
  -- permet null si ce n'est pas déjà le cas (au cas où)
  -- alter table profiles alter column area drop not null; -- optionnel
exception when others then
  -- si colonne n'existe pas, on la crée sans default
  if not exists (select 1 from information_schema.columns where table_name='profiles' and column_name='area') then
    alter table profiles add column area text;
  end if;
end $$;

-- Nettoie les profils existants qui ont Cocody — Angré par défaut alors qu'ils ne l'ont pas choisi
-- Décommente si tu veux les vider :
-- update profiles set area = null where area = 'Cocody — Angré';

-- 5. Test rapide : compte les lignes par table pour l'utilisateur courant
-- (à exécuter connecté)
-- select 'expenses' as tbl, count(*) from expenses where user_id = auth.uid()
-- union all select 'incomes', count(*) from incomes where user_id = auth.uid()
-- union all select 'budgets', count(*) from budgets where user_id = auth.uid()
-- union all select 'wallets', count(*) from wallets where user_id = auth.uid()
-- union all select 'settings', count(*) from settings where user_id = auth.uid();
