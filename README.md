# FinaTrack CI — v3.2.3

> **« Comprenez où va votre argent. »**  
> App de suivi dépenses / revenus / épargne pensée pour **Abidjan — Cocody Angré**. 100% Supabase, offline-first, PWA installable, thème finance pro.

**Live :** https://finnatrack.netlify.app  
**Stack :** HTML5, CSS3 Vanilla, JavaScript ES6+ modulaire, Supabase, Chart.js  
**Aucun** React, Angular, Vue, Bootstrap, Tailwind.

---

## ✨ Nouveautés v3.2.x

- **v3.2.3** : Fix `addSaving undefined` depuis bouton + — `savings.js` manquait dans `index.html`
- **v3.2.2** : Fix mobile épargne bouton Enregistrer ne réagit pas — `type="button"` + `click` + `touchend`
- **v3.2.1** : Bottom-nav mobile remplace Paramètres par **Épargne** (Paramètres reste en topbar)
- **v3.2.0** : Thème **finance pro** — fond #F4F7F6, cartes blanches #FFFFFF, chiffres tabulaires mono, ombres banque, grille subtile, filigrane CFA
- **v3.1.1** : Fix date qui se fixait au scroll dans Transactions (sticky → static) + fix inner scroll mobile
- **v3.1.0** : Refonte thème sombre — contraste fort émeraude #2ECC8A / or #FFD93D, distinction claire/sombre immédiate
- **v3.0.2** : Fix 400 savings UUID → id TEXT + logs détaillés
- **v3.0.1** : Singleton Supabase client partagé (fix Auth session missing)
- **v3.0.0** : 100% Supabase Auth — plus de `finatrack_users` / `finatrack_session` local

---

## 1. Fonctionnalités

### Dashboard finance pro
- Solde réel, revenus/mois, dépenses/mois, budget restant, **épargne totale**
- « Où va mon argent ? » Revenus → Dépenses → Reste
- Donut 15 catégories, 7 derniers jours, évolution, top dépenses
- Soldes par portefeuille : `solde = départ + revenus - dépenses`
- Chiffres en **tabular-nums mono** comme une banque

### Transactions
- Ajout rapide, complet, vocal 🎙️
- Recherche instantanée, filtres combinables (période, type, catégorie, paiement, montant)
- Tri, export CSV, modif, suppression avec confirmation
- Groupement par date (fix sticky) ou par moyen de paiement
- Affichage mobile sans scroll interne — page qui scrolle naturellement

### Épargne 🐖 (v2.2+)
- Montant, objectif (Tontine, Projet maison, Scolarité, Urgence, Investissement, Voyage, Autre), cible, date, paiement, description
- Page `pages/savings.html` : total, objectifs avec % progression, historique
- 2 chemins : **onglet Épargne** (bottom-nav) **et** **+ > Épargne** (fab menu) — les 2 fonctionnent
- Dashboard KPI 🐖 Épargne totale

### Portefeuilles 💳
- 8 méthodes : Espèces, Wave, Orange Money, MTN MoMo, Moov, Djamo, Carte, Virement
- Pastilles colorées, totaux par méthode, filtre en un clic, total général

### Budget & Analyse
- Budget mensuel YYYY-MM, barre progression, alertes non culpabilisantes, projection fin de mois
- Analyse : 10 KPI, comparaison période précédente, pistes neutres

### Vocal
```
🎙️ "J'ai dépensé 2000 francs pour le taxi aujourd'hui"
→ 2000F / Transport / Taxi / aujourd'hui
→ Confirmation obligatoire
```
Comprend nouchi (krika=1000), lieux Abidjan (Cocovico, La Djibi), plats (garba, attiéké), mobile money.

### Thèmes
- **Clair finance pro** : #F4F7F6 fond, cartes blanches #FFFFFF, bordures #E2E8E5, ombres banque
- **Sombre banque privée** : #050A08 fond, cartes #0F1F1B, émeraude #2ECC8A + or #FFD93D qui claquent
- Distinction immédiate clair/sombre, chiffres tabulaires, grille subtile, filigrane CFA

### Mobile & PWA
- Installable Android/iOS/desktop, offline, service worker 43 fichiers
- Bottom-nav : Accueil / Portefeuilles / + / Transactions / **Épargne** (v3.2.1)
- Topbar : Analyses / Voix / Paramètres
- Gestes : feuilles glissantes, appui long + → vocal, haptique, safe-area

---

## 2. Stack

| Élément | Choix |
|---|---|
| Structure | HTML5 sémantique |
| Style | CSS3 variables, grid, flex — finance pro |
| Logique | JS Vanilla ES6+ IIFE modulaire |
| Persistance | Supabase Postgres + LocalStorage offline-first |
| Auth | Supabase Auth 100% (plus de local) |
| Graphiques | Chart.js 4.4.1 embarqué |
| PWA | manifest + sw.js v3.2.3 |

---

## 3. Palette finance pro

```css
/* Clair */
--primary: #123C32; --primary-light: #1E5A4A;
--secondary: #D98B39; --accent: #E7B84B;
--background: #F4F7F6; --surface: #FFFFFF;
--text: #0E1E1A; --border: #E2E8E5;
--success: #0E8A5A; --danger: #D93D4A;

/* Sombre */
--background: #050A08; --surface: #0F1F1B;
--primary: #2ECC8A; --accent: #FFD93D;
--text: #E8F5EF;
```

Chiffres : `font-variant-numeric: tabular-nums; font-family: SF Mono`

---

## 4. Architecture

```
├── index.html (dashboard) + pages/*.html (6 + savings)
├── css/ style.css (finance pro), components.css, responsive.css
├── js/
│   ├── config.js (FT_CONFIG, généré au build)
│   ├── vendor/supabase.min.js
│   ├── supabase-client.js (singleton v3.0.1)
│   ├── utils.js, storage.js, auth.js (100% Supabase v3.0.0)
│   ├── supabase-sync.js (hybride offline-first, logs détaillés)
│   ├── savings.js (ajouté partout v3.2.3)
│   ├── expenses.js, incomes.js, wallets.js, budget.js
│   ├── dashboard.js, transactions.js, payments.js, analysis.js, charts.js
│   ├── voiceExpense.js, mobile.js, app.js
├── supabase_savings.sql (id TEXT, pas UUID — fix 400)
├── supabase_fix.sql (RLS + contraintes uniques)
├── tools/build-static.js → dist/ 43 fichiers
├── sw.js v3.2.3
└── DOCUMENTATION.md (doc complète)
```

Principes : `FT.data` seule couche données, domaine ≠ affichage, bus `data:changed`, `textContent` sécurisé, pas d'écriture vocale auto.

---

## 5. Installation

```bash
git clone https://github.com/Bervellearnaud/finatrack.git
cd finatrack
python3 -m http.server 5173
# http://localhost:5173
```

`js/config.js` généré au build depuis env vars, ou crée-le :

```js
window.FT_CONFIG = {
  SUPABASE_URL: "https://xxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJ..."
};
```

---

## 6. Supabase

### Tables (id TEXT pour compat uid() local)

```sql
-- expenses, incomes id text primary key, user_id uuid
-- budgets (user_id, month) PK, wallets (user_id, method) PK
-- savings v3.0.2 : id text primary key (fix 400)
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
alter table public.savings enable row level security;
create policy "Users can manage own savings" on public.savings for all
using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### Setup
1. Supabase Dashboard > SQL Editor > Run `supabase_savings.sql` + `supabase_fix.sql` → **Run and enable RLS** vert
2. Auth > Settings > copie URL + anon key → env vars `SUPABASE_URL` / `SUPABASE_ANON_KEY`
3. Build génère `dist/js/config.js`

### Auth 100% Supabase (v3.0.0+)
- Plus de `finatrack_users` / `finatrack_session`
- Guard dans `<head>` vérifie `sb-*-auth-token`, pas local
- `isAuthenticated()` → présence token, `getCurrentUser()` → parse token, `logout()` → supprime tous `sb-` + `finatrack_`
- Singleton `supabase-client.js` partagé entre `auth.js` et `supabase-sync.js`

---

## 7. Mode hybride offline-first

`supabase-sync.js` : lecture LocalStorage instantanée, écriture Local + Supabase en arrière-plan si online. Pull au démarrage, wrap `addExpense` → `pushExpense`, logs `push saving try/ok` avec détails `{message, code, details, hint}`.

Si `FT_CONFIG` absent → mode local pur.

---

## 8. Build & Déploiement

```bash
npm run build        # → dist/ 43 fichiers, 1 Mo
npm run deploy:check # 38 contrôles
```

**Netlify** : `netlify.toml` Build `npm run build`, Publish `dist`, Env `SUPABASE_URL`, `SUPABASE_ANON_KEY`  
**Vercel** : `vercel.json` idem  
**GitHub Pages** : `.nojekyll`, root

---

## 9. Tests

```bash
npm test             # 748 vérifs jsdom
npm run parcours     # parcours réel Chromium 390x844
npm run audit        # lisibilité mobile 6 pages x 4 largeurs
```

---

## 10. Dépannage

**Épargne mobile ne s'enregistre pas / 400** : table était en UUID alors que uid local est TEXT → exécute nouveau `supabase_savings.sql` (id TEXT) + vide cache `localStorage.clear()`

**Auth session missing / push skipped no uid** : 2 clients séparés → fix singleton v3.0.1, vide cache, re-login

**addSaving undefined depuis bouton +** : `savings.js` manquait dans index.html → fix v3.2.3

**Date qui se fixe au scroll** : sticky + inner scroll → fix v3.1.1 static + overflow visible

**Potential issues detected — destructive operations** : clique **Run and enable RLS** vert

---

## 11. Changelog

Voir `DOCUMENTATION.md` pour détail complet. Dernier : v3.2.3 fix addSaving undefined.

---

**Auteur** : FinaTrack CI — Abidjan Cocody Angré  
**Contact** : bervellearnaud@gmail.com  
**Licence** : usage personnel, modifiable librement
