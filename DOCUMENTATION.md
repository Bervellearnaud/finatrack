# FinaTrack CI — Documentation complète v3.0.2

> **« Comprenez où va votre argent. »**  
> App de suivi dépenses/revenus/épargne pensée pour **Abidjan — Cocody Angré**, 100% Supabase, offline-first, PWA installable.

---

## Sommaire
1. [Vue d'ensemble](#1-vue-densemble)
2. [Stack technique](#2-stack-technique)
3. [Palette & identité](#3-palette--identité)
4. [Fonctionnalités](#4-fonctionnalités)
5. [Architecture & structure](#5-architecture--structure)
6. [Auth 100% Supabase](#6-auth-100-supabase)
7. [Base de données Supabase](#7-base-de-données-supabase)
8. [Mode hybride offline-first](#8-mode-hybride-offline-first)
9. [Épargne](#9-épargne)
10. [PWA & Mobile](#10-pwa--mobile)
11. [Installation locale](#11-installation-locale)
12. [Configuration Supabase](#12-configuration-supabase)
13. [Build & Déploiement](#13-build--déploiement)
14. [Tests & audits](#14-tests--audits)
15. [Dépannage](#15-dépannage)
16. [Roadmap](#16-roadmap)

---

## 1. Vue d'ensemble

FinaTrack CI est une mini-fintech personnelle :

- **Sans serveur applicatif** : 100% statique (HTML/CSS/JS), compatible Vercel/Netlify/GitHub Pages
- **Données** : Supabase Postgres avec RLS (Row Level Security) — chaque user ne voit que ses lignes
- **Offline-first** : lecture instantanée depuis LocalStorage, écriture en miroir vers Supabase quand en ligne (idéal pour réseau instable à Abidjan)
- **Vocal** : "J'ai dépensé 2000 francs pour le taxi aujourd'hui" → proposition → confirmation obligatoire
- **Local** : montants réalistes (wôrô-wôrô 300F, garba 700F, tontine 25 000F), mobile money (Wave, Orange Money, MTN, Moov), vocabulaire nouchi (krika = 1000)

---

## 2. Stack technique

| Élément | Choix | Pourquoi |
|---|---|---|
| Structure | HTML5 sémantique | Sans framework |
| Style | CSS3 variables, grid, flex | Thème clair/sombre en un attribut |
| Logique | JS Vanilla ES6+ modulaire (IIFE) | Zéro build, code propre |
| Persistance | LocalStorage + Supabase | Offline + cloud |
| Auth | Supabase Auth | Plus de `finatrack_users` local |
| Graphiques | Chart.js 4.4.1 embarqué | Fonctionne hors ligne |
| PWA | manifest + sw.js | Installable, offline |
| Déploiement | `tools/build-static.js` → `dist/` | Vérifie 43 fichiers, 1 Mo |

**Interdit** : React, Angular, Vue, Bootstrap, Tailwind.

---

## 3. Palette & identité

```css
:root {
  --primary: #123C32; --primary-light: #1E5A4A;
  --secondary: #D98B39; --accent: #E7B84B; --earth: #A94A32;
  --background: #F5EFE3; --surface: #FCFAF6;
  --text: #17201D; --text-muted: #6B756F; --text-soft: #5E6761;
  --border: #DED8CC;
  --success: #2E7D5B; --success-ink: #296E50;
  --danger: #B94735; --danger-ink: #AC3F2E;
}
```
- Vert profond dominant, orange/ocre + or en accent
- Motifs géométriques africains subtils, jamais surchargé
- Lisibilité : plancher 13px sur mobile, contrastes WCAG AA 4.75:1 min, cibles ≥44px

---

## 4. Fonctionnalités

### Dashboard
- Solde, revenus/mois, dépenses/mois, budget restant, **épargne totale**
- "Où va mon argent ?" Revenus → Dépenses → Reste
- Donut catégories (15), 7 derniers jours, évolution
- Soldes par portefeuille : `solde = départ + revenus - dépenses`

### Transactions
- Ajout rapide, complet, vocal 🎙️
- Recherche instantanée, filtres combinables (période, type, catégorie, paiement, montant)
- Tri, export CSV, modification, suppression avec confirmation

### Épargne 🐖 (v2.2+)
- Montant, objectif (Tontine, projet maison, urgence...), cible, date, paiement, description
- Page `pages/savings.html` : total épargné, grilles objectifs avec progression %, historique
- Dashboard : KPI 🐖 Épargne totale
- Menu + (5 actions) : Dépense rapide, Voix, Dépense complète, Revenu, 🐖 Épargne

### Portefeuilles 💳
- 8 méthodes : Espèces, Wave, Orange Money, MTN MoMo, Moov, Djamo, Carte, Virement
- Pastilles colorées partout, totaux par méthode, filtre en un clic

### Budget
- Par mois YYYY-MM, barre progression, alertes non culpabilisantes (<70% info, 70-100% orange, >100% rouge)
- Rythme quotidien, projection fin de mois, historique 12 mois, suggestion moyenne 3 mois

### Analyse
- 10 KPI : Revenus, Dépenses, Solde, Épargne, Taux épargne, Moyenne/j, Catégorie principale, Jour max, Plus grosse dépense, Panier moyen
- Comparaison période précédente

### Paramètres
- Prénom, devise (FCFA/EUR/USD/GNF), langue vocale, thème, alertes
- Zone (Cocody — Angré), repères prix Abidjan
- Export/import JSON, effacement total
- Confort lecture : Normale / Grande (+12%) / Très grande (+25%)

### Vocal
```
🎙️ Micro → Web Speech API (fr-FR)
→ parseTranscript()
  - extractAmount() : "2 000" / "deux mille" / "2 krika" → 2000
  - detectCategory() : taxi, gbaka, maquis, attiéké, CIE...
  - detectDate() : aujourd'hui, hier, tantôt (=aujourd'hui)
  - extractDescription()
  - detectPaymentMethod() : Orange Money, Wave...
→ Carte "Dépense détectée" + confiance
→ [Recommencer] [Modifier] [✓ Confirmer] ← obligatoire
```

---

## 5. Architecture & structure

```
finatrack-ci/
├── index.html, pages/*.html (6 pages + savings)
├── manifest.webmanifest, sw.js (v3.0.2)
├── css/ style.css, components.css, responsive.css
├── js/
│   ├── config.js (FT_CONFIG SUPABASE_URL/ANON_KEY, généré au build)
│   ├── vendor/supabase.min.js
│   ├── supabase-client.js ← singleton partagé (v3.0.1)
│   ├── utils.js, storage.js, auth.js (100% Supabase v3.0.0)
│   ├── supabase-sync.js (hybride offline-first)
│   ├── supabase-adapter.js (full async, non utilisé par défaut)
│   ├── expenses.js, incomes.js, savings.js, wallets.js, budget.js
│   ├── dashboard.js, analysis.js, charts.js, transactions.js, payments.js
│   ├── voiceExpense.js, mobile.js, app.js
├── supabase_savings.sql (id TEXT, pas UUID)
├── supabase_fix.sql (RLS + contraintes uniques)
├── tools/build-static.js, check-deploy.js, audit-readability.js...
├── dist/ (43 fichiers, 1 Mo, généré)
├── netlify.toml, vercel.json, .nojekyll
└── DOCUMENTATION.md (ce fichier)
```

**Principes** :
1. Une seule couche données : `FT.data` (dataService), jamais localStorage direct
2. Domaine ≠ affichage : `expenses.js` ne touche pas le DOM
3. Réactivité par bus : `data:changed` → toutes les vues se rafraîchissent
4. Sécurité : `textContent`, `escapeHtml()`, pas d'écriture vocale auto

---

## 6. Auth 100% Supabase

**Avant v3.0.0** : `finatrack_users` + `finatrack_session` local → conflits, "User already registered", "Auth session missing", épargne mobile qui ne s'enregistre pas.

**Depuis v3.0.0** :

- `js/auth.js` : plus de `KEYS.USERS/SESSION`, plus de `hashPassword`
- `isAuthenticated()` → vérifie présence `sb-<project>-auth-token` dans localStorage
- `getCurrentUser()` → parse le token `sb-...-auth-token`, pas `finatrack_session`
- `getUserIdAsync()` → `supabase.auth.getSession()` (async)
- `registerSupabase()` / `loginSupabase()` → `supabase.auth.signUp / signInWithPassword`
- `logout()` → supprime tous `sb-`, `supabase`, `finatrack_` + `supabase.auth.signOut()`
- Guard dans `<head>` de chaque HTML : si pas de `sb-*-auth-token` → redirect `login.html`

```js
// Guard 100% Supabase (dans chaque HTML)
var hasSession = false;
for (var i=0;i<localStorage.length;i++){
  var k=localStorage.key(i);
  if (k && k.indexOf("sb-")===0 && k.indexOf("auth-token")!==-1){
    var raw=localStorage.getItem(k);
    if (raw && raw.length>20){ hasSession=true; break; }
  }
}
if (!hasSession) location.replace("login.html");
```

**Singleton** `js/supabase-client.js` (v3.0.1) : un seul client Supabase partagé entre `auth.js` et `supabase-sync.js` → évite 2 instances avec états différents qui causaient "Auth session missing".

---

## 7. Base de données Supabase

### Tables (id TEXT pour compatibilité uid() local)

**Schéma original** (`docs/SUPABASE_GUIDE.md`) :

```sql
create extension if not exists "pgcrypto";

create table expenses (
  id text primary key,
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
-- incomes idem, budgets (user_id, month) PK, wallets (user_id, method) PK, settings (user_id PK)
```

**Savings v3.0.2** (`supabase_savings.sql`) — **id TEXT, pas UUID** (fix 400) :

```sql
drop table if exists public.savings cascade;

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

create index idx_savings_user_id on public.savings(user_id);
create index idx_savings_date on public.savings(date desc);

alter table public.savings enable row level security;
create policy "Users can manage own savings" on public.savings for all
using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

**RLS + contraintes** (`supabase_fix.sql`) :

```sql
alter table expenses enable row level security;
-- ... idem incomes, budgets, wallets, settings, profiles, savings
create policy "Users can manage own expenses" on expenses for all
using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- ... idem autres tables

alter table wallets add constraint wallets_user_method_unique unique (user_id, method);
alter table budgets add constraint budgets_user_month_unique unique (user_id, month);
alter table settings alter column area drop default; -- fix Cocody forcé
alter table profiles alter column area drop default;
```

**À exécuter dans Supabase Dashboard > SQL Editor > Run** :
1. `supabase_savings.sql` (ou le schéma complet de `SUPABASE_GUIDE.md` si première install)
2. `supabase_fix.sql`

---

## 8. Mode hybride offline-first

`js/supabase-sync.js` — recommandé pour Abidjan :

- **Lecture** = LocalStorage instantané, marche hors ligne
- **Écriture** = Local + Supabase en arrière-plan si `navigator.onLine`
- **Au démarrage** : `pull()` depuis Supabase, fusion par `id` (ajoute manquants)
- **Wrap** : `FT.data.addExpense` → local puis `pushExpense()` en arrière-plan
- **Logs** : `push saving try`, `push saving ok`, ou erreur détaillée `{message, code, details, hint}`
- **Online/offline** : bandeau "Hors ligne", sync au retour réseau, `onAuthStateChange` → pull

```js
// Exemple push avec logs détaillés v3.0.2
const { data, error } = await c.from("savings").upsert(row, { onConflict: "id" }).select();
if (error) console.error({ message: error.message, code: error.code, details: error.details, hint: error.hint });
else console.info("push saving ok", row.id);
```

Si `FT_CONFIG` absent → mode local pur, aucun appel réseau.

---

## 9. Épargne

- Module `js/savings.js` : `FT.savings` CRUD via `FT.data` + fallback `finatrack_savings`
- Page `pages/savings.html` : total, objectifs avec % progression, historique, CTA
- Storage : `KEYS.SAVINGS`, `getSavings`/`saveSavings`
- Sync : pull/push dans `supabase-sync.js`, `wrapLocalWithSync()` pousse dernier item
- Nav : retiré de bottom-nav mobile (v2.2.2) → uniquement dans menu + (🪙 Épargne — Tontine, projet maison, urgence)
- Dashboard : KPI 🐖 Épargne totale

**Formulaire** `app.js:openSavingsForm()` : montant, objectif, cible, date, paiement, description.

---

## 10. PWA & Mobile

- `manifest.webmanifest` : nom, icônes 192/512 maskable, shortcuts (Voix, Rapide, Transactions, Budget)
- `sw.js` v3.0.2 : 43 ressources précachées (HTML, CSS, JS, Chart.js, icons, supabase-client.js, savings.js)
- `responsive.css` : 320/375/390/430/768/1024/1440, bottom-nav 4 tabs + fab central, safe-area insets
- `mobile.js` : feuilles glissantes, appui long + → vocal, haptique, zones sûres, `visualViewport`
- Installable Android (bandeau), iOS (Partager → Écran d'accueil), desktop (icône barre d'adresse)

---

## 11. Installation locale

```bash
git clone https://github.com/Bervellearnaud/finatrack.git
cd finatrack
python3 -m http.server 5173
# http://localhost:5173
```

Pas de `npm install` nécessaire sauf pour tests/build.

`js/config.js` est généré au build depuis env vars, ou crée-le à la main :

```js
window.FT_CONFIG = {
  SUPABASE_URL: "https://xxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJ..."
};
```

---

## 12. Configuration Supabase

1. Crée projet sur supabase.com (région eu-west-3 Paris proche Abidjan)
2. SQL Editor → colle schéma de `docs/SUPABASE_GUIDE.md` + `supabase_savings.sql` + `supabase_fix.sql` → Run
3. Auth → Settings → désactive email confirm si tu veux (ou garde)
4. Project Settings → API → copie URL + anon key → mets dans `js/config.js` ou env vars Netlify/Vercel `SUPABASE_URL` / `SUPABASE_ANON_KEY`
5. Le build génère `dist/js/config.js` depuis env vars (`tools/build-static.js`)

---

## 13. Build & Déploiement

```bash
npm run build        # → dist/ 43 fichiers, 1 Mo, vérifie 37 indispensables + 42 précachées
npm run deploy:check # 38 contrôles netlify.toml, vercel.json, dist/, offline, GitHub Pages
```

**Netlify** : `netlify.toml` prioritaire
- Base dir: vide (racine)
- Build: `npm run build`
- Publish: `dist`
- Env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PUPPETEER_SKIP_DOWNLOAD=true`

**Vercel** : `vercel.json` idem, import dépôt suffit.

**GitHub Pages** : `.nojekyll`, branche main, dossier root (liens relatifs).

---

## 14. Tests & audits

```bash
npm test             # 748 vérifs jsdom (format FCFA, wallets, vocal, CRUD, filtres, PWA...)
npm run parcours     # parcours réel Chromium 390x844 : démo → ajout → vocal → reload
npm run audit        # lisibilité mobile 6 pages x 4 largeurs x 3 tailles texte x clair/sombre
npm run screenshots  # captures 320/390/768 + contrôles layout
```

Audit lisibilité : 0 point en strict (`FINATRACK_MIN_PX=13 FINATRACK_MIN_TAP=44`).

---

## 15. Dépannage

### "Rien ne s'enregistre dans la BD" / 400 sur savings
**Cause** : `supabase_savings.sql` initial avait `id uuid` alors que `uid()` local génère `m3k9a8...` (TEXT) → Postgres 400 `invalid input syntax for type uuid`.
**Fix v3.0.2** : `id text primary key` + `onConflict: "id"` + logs détaillés.
**Action** :
1. SQL Editor → exécute nouveau `supabase_savings.sql` (drop + create TEXT) → **Run and enable RLS** (vert)
2. Console : `localStorage.clear(); sessionStorage.clear(); location.reload();`
3. Re-login, test + > Épargne → console doit afficher `push saving try` puis `ok`

### "Auth session missing" / "push ... skipped — no uid"
**Cause** : 2 clients Supabase séparés (auth.js + supabase-sync.js) avec états différents.
**Fix v3.0.1** : `js/supabase-client.js` singleton partagé.
**Action** : vide cache, re-login, vérifie `localStorage` contient `sb-<project>-auth-token`.

### "User already registered"
**Cause** : ancienne logique `finatrack_users` local.
**Fix v3.0.0** : supprimé, 100% Supabase Auth.

### "Potential issues detected — destructive operations"
Quand tu exécutes `supabase_savings.sql`, Supabase affiche "This query includes destructive operations" (drop table) + "creates a table without enabling RLS".
**Clique "Run and enable RLS" vert** → il active RLS avant, puis ton script ré-active RLS + policy → OK.

### "Failed to load resource 400" + "[Supabase Sync] push saving error Object"
Clique sur ▶ à côté de Object → copie `message`, `code`, `details`, `hint`. Depuis v3.0.2 on log détaillé.

### Hybride activé, pourquoi ?
Normal, c'est le mode offline-first pour Abidjan (local instantané + cloud miroir). Log renommé v3.0.2 : `activé — mode offline-first Abidjan`.

---

## 16. Roadmap

- [x] v2.2.0 : Épargne liée DB
- [x] v2.2.1 : Épargne dans bottom-nav mobile (5 tabs)
- [x] v2.2.2 : Épargne uniquement dans + menu (retiré nav mobile)
- [x] v3.0.0 : 100% Supabase Auth, plus de session locale
- [x] v3.0.1 : Singleton client Supabase, fix rien ne s'enregistre
- [x] v3.0.2 : Fix 400 uuid → id TEXT, logs détaillés
- [ ] Objectifs épargne par catégorie, rappels intelligents
- [ ] Budgets par catégorie
- [ ] Export comptable PDF
- [ ] Multi-profils (perso/business/tontine)

---

**Auteur** : FinaTrack CI — Abidjan Cocody Angré  
**Licence** : usage personnel, modifiable librement  
**Contact** : bervellearnaud@gmail.com
