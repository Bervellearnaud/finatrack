# FinaTrack CI — Connexion Supabase (guide complet)

Ce guide explique comment brancher FinaTrack CI (actuellement 100% LocalStorage) à Supabase **sans casser le build statique** et en gardant le mode hors-ligne.

L'architecture actuelle est déjà prévue pour ça : `js/storage.js` expose `FT.storage.setAdapter()` et `FT.data` est l'interface abstraite. On va juste créer un second adaptateur.

---

## 1. Créer le projet Supabase

1. Va sur https://supabase.com → New Project
2. Choisis région `eu-west-3` (Paris) ou proche d'Abidjan
3. Note :
   - `SUPABASE_URL` → `https://xxxxx.supabase.co`
   - `SUPABASE_ANON_KEY` → dans Project Settings > API

## 2. Schéma SQL (à coller dans SQL Editor)

```sql
-- Extension pour uid()
create extension if not exists "pgcrypto";

-- Table profils (lié à auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  area text default 'Cocody — Angré',
  created_at timestamptz default now()
);

-- Dépenses
create table expenses (
  id text primary key, -- on garde le format exp_xxxx pour compatibilité
  user_id uuid references auth.users(id) on delete cascade not null,
  amount numeric not null check (amount > 0),
  category text not null,
  description text,
  date date not null,
  payment_method text default 'Espèces',
  source text default 'manual',
  created_at timestamptz default now(),
  updated_at timestamptz
);

-- Revenus
create table incomes (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  amount numeric not null check (amount > 0),
  source text not null,
  description text,
  date date not null,
  payment_method text default 'Espèces',
  origin text default 'manual',
  created_at timestamptz default now(),
  updated_at timestamptz
);

-- Budgets par mois
create table budgets (
  user_id uuid references auth.users(id) on delete cascade not null,
  month text not null, -- format YYYY-MM
  amount numeric not null check (amount > 0),
  created_at timestamptz default now(),
  primary key (user_id, month)
);

-- Portefeuilles (soldes de départ)
create table wallets (
  user_id uuid references auth.users(id) on delete cascade not null,
  method text not null,
  amount numeric not null,
  primary key (user_id, method)
);

-- Settings (optionnel, 1 ligne par user)
create table settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  currency text default 'FCFA',
  theme text default 'light',
  text_size text default 'normal',
  voice_language text default 'fr-FR',
  area text,
  updated_at timestamptz default now()
);

-- Index
create index on expenses (user_id, date desc);
create index on incomes (user_id, date desc);
```

## 3. Activer RLS + Policies

```sql
alter table profiles enable row level security;
alter table expenses enable row level security;
alter table incomes enable row level security;
alter table budgets enable row level security;
alter table wallets enable row level security;
alter table settings enable row level security;

-- Chaque user ne voit que ses lignes
create policy "own rows" on expenses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on incomes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on budgets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on wallets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own profile" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);
```

## 4. Config côté FinaTrack

### 4.1 Ajouter le client Supabase (CDN, pas de build)

Dans chaque HTML, après `storage.js` :

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/dist/umd/supabase.min.js"></script>
<script src="js/config.js"></script>
<script src="js/supabase-adapter.js"></script>
```

`js/config.js` (à ne PAS committer, ajoute-le à .gitignore) :

```js
window.FT_CONFIG = {
  SUPABASE_URL: "https://xxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJ..."
};
```

Pour Netlify/Vercel, mets ces valeurs en variables d'environnement et génère `config.js` au build, ou injecte via `window.ENV`.

### 4.2 Adaptateur (voir `js/supabase-adapter.js` fourni)

L'adaptateur respecte la même interface que `localAdapter` mais en **async**. Il faut donc rendre `FT.data` async :

- `getExpenses()` → `await supabase.from('expenses').select()`
- `addExpense()` → `insert()`
- etc.

Deux stratégies possibles :

**A) Full async (recommandé pour Supabase) :**
Tu transformes `FT.data` pour que chaque méthode retourne une `Promise`. C'est déjà prévu dans le fichier template fourni — il suffit de `await FT.data.getExpenses()` partout (ou `.then`).

**B) Hybride offline-first :**
Garde LocalStorage comme cache, synchronise en arrière-plan vers Supabase quand `navigator.onLine`. C'est le plus robuste pour Abidjan (connexion instable).

Le template fourni implémente **A** avec fallback local.

### 4.3 Auth Supabase

Remplace `js/auth.js` local par Supabase Auth :

```js
const { data, error } = await supabase.auth.signUp({ email, password });
await supabase.auth.signInWithPassword({ email, password });
const { data: { user } } = await supabase.auth.getUser();
```

Tu peux garder `FT.auth` comme façade : à l'intérieur, appelle Supabase au lieu de LocalStorage. Le guard dans `app.js` reste identique (`FT.auth.requireAuth()`).

## 5. Déploiement

**Netlify :**
- Build command `npm run build`
- Publish `dist`
- Env vars : `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PUPPETEER_SKIP_DOWNLOAD=true`
- Génère `dist/js/config.js` depuis les env vars dans `tools/build-static.js` (exemple dans le template)

**Vercel :** pareil via `vercel.json` → `build.env`

**Sécurité :** n'expose que `anon_key`, jamais `service_role`. RLS fait le reste.

## 6. Migration des données locales

```js
// Une fois connecté à Supabase
const local = FT.storage.localAdapter.exportAll();
for (let e of local.expenses) await FT.data.addExpense(e);
for (let i of local.incomes) await FT.data.addIncome(i);
```

Bouton "Migrer vers cloud" à ajouter dans Paramètres.

## 7. Checklist finale

- [ ] Tables créées + RLS activé
- [ ] `config.js` avec URL/key
- [ ] `supabase-adapter.js` chargé après `storage.js`
- [ ] `FT.data.setAdapter(supabaseAdapter)` au boot si `FT_CONFIG` présent
- [ ] Auth Supabase branché
- [ ] Tests : `npm test` doit passer en mode local (le template détecte jsdom et reste en local)
- [ ] Build : `npm run build` inclut `config.js` et `supabase-adapter.js` dans `dist`

---

Besoin que je l'implémente directement ? Je peux créer `js/supabase-adapter.js` + `js/config.js` + modifier `storage.js` pour async + brancher l'auth Supabase.
