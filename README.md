# FinaTrack CI

> **« Comprenez où va votre argent. »**

Application web personnelle de suivi de dépenses et de revenus, pensée pour le contexte
ivoirien : petites dépenses quotidiennes, gbaka, maquis, mobile money, forfaits internet,
soutien à la famille, tontine, CIE, SODECI…

La fonctionnalité qui distingue le projet : **🎙️ « Parlez pour enregistrer une dépense »**.
Vous dites *« J'ai dépensé 2 000 francs pour le taxi aujourd'hui »* et FinaTrack propose
la transaction : montant, catégorie, description et date. **Rien n'est enregistré avant
votre confirmation.**

---

## 1. Présentation

FinaTrack CI est une **mini-fintech personnelle** entièrement côté navigateur (aucun backend),
pensée pour **Abidjan** — les repères, le vocabulaire vocal et les données d'exemple viennent
de **Cocody, Angré** :

- vos données restent **sur votre appareil** (LocalStorage) ;
- l'interface fonctionne **hors ligne** une fois la page chargée (Chart.js est embarqué) ;
- le design mélange **codes fintech** (dashboards, KPI, graphiques), **codes SaaS** (cartes
  arrondies, micro-interactions, composants réutilisables) et une **identité africaine
  contemporaine** (palette terre, motif losange/zigzag discret, typographie sobre) — sans folklore.

---

## 2. Fonctionnalités

### Suivi
- Solde disponible, revenus du mois, dépenses du mois, budget restant — **calculés dynamiquement**
- Section **« Où va mon argent ? »** : Revenus → Dépenses → Reste, puis répartition par catégorie
- Graphique **donut** de répartition des dépenses (15 catégories)
- Graphique des **dépenses des 7 derniers jours** (aujourd'hui mis en évidence)
- Évolution jour par jour, comparaison revenus/dépenses par mois, top catégories

### Transactions
- **Ajout rapide** (montant + catégorie, date du jour préremplie)
- **Ajout complet** (montant, catégorie, description, date, mode de paiement)
- **Ajout par la voix** 🎙️ (voir §6)
- **Modification** de chaque transaction (formulaire prérempli)
- **Suppression** avec confirmation explicite
- **Recherche instantanée** (description, catégorie, source, mode de paiement, montant, date)
- **Filtres combinables** : période (aujourd'hui, semaine, mois, mois précédent, 30 jours,
  personnalisée), type (tout / dépenses / revenus), catégorie, mode de paiement, montant min/max
- **Tri** (date, montant) et **export CSV** de la sélection

### Portefeuilles
- **Tous les moyens de paiement avec leur solde actualisé** sur le tableau de bord
  (départ + entrées − sorties), total disponible, nombre de mouvements, soldes négatifs signalés
- Ajustement des soldes de départ en une fenêtre, portefeuilles non suivis laissés vides
- Carte identique dans **Paramètres → Portefeuilles**

### Revenus
- Sources : Salaire, Freelance, Business, Prime, Vente, Cadeau, Autre
- Synthèse mensuelle, comparaison au mois précédent, répartition par source

### Budget
- Budget **mensuel par mois** (navigation mois précédent / suivant)
- Budget total · Dépensé · Restant, avec barre de progression
- Alertes **neutres et non culpabilisantes** : &lt; 70 % (info), 70–100 % (orange), &gt; 100 % (rouge)
- Rythme quotidien, marge par jour restant, **projection de fin de mois**, historique 12 mois
- Suggestion de budget calculée sur la moyenne des 3 derniers mois

### Analyse
- Revenus, Dépenses, Solde, Épargne, Taux d'épargne, Dépense moyenne quotidienne,
  Catégorie principale, Jour de dépense maximum, Dépense la plus élevée, Panier moyen
- **Mes principales dépenses** : catégories triées par montant décroissant
- Comparaison automatique avec la période précédente équivalente
- Pistes d'analyse neutres (rythme, panier moyen, concentration des dépenses)

### Paramètres
- Prénom, **devise** (FCFA, EUR, USD, GNF), **langue de la reconnaissance vocale**, thème **clair/sombre**,
  alertes budget on/off
- **Données de démonstration** ancrées à Angré : wôrô-wôrô, gbaka, tontine, facture CIE, écolage — chargement et suppression sélective
- **Export / import JSON**, effacement total avec confirmation
- Information de confidentialité + roadmap Supabase

### Lisibilité sur téléphone 👓
Le projet doit rester lisible **par n'importe quel utilisateur**, sur n'importe quel
téléphone. Trois principes, appliqués partout et mesurés automatiquement :

**1. Un plancher de taille de texte.** Aucun texte de l'application ne descend sous
**13 px** sur téléphone (`--fs-xs` et `--fs-sm` relevés dans une seule règle, en fin de
feuille `responsive.css`). Les libellés, métadonnées, pastilles, légendes de graphiques et
même les onglets de la barre du bas suivent ce plancher — la barre grandit en hauteur
plutôt que de rétrécir les mots.

**2. Des contrastes conformes WCAG AA.** La teinte de texte secondaire de la charte
(`#6B756F`) plafonnait à 3,87:1 sur les fonds pastel : illisible pour un petit libellé.
Deux variantes ont été ajoutées, mesurées par calcul de luminance :

| Variable | Usage | Ratio minimal |
|---|---|---|
| `--text-soft` `#5E6761` | textes secondaires, axes, légendes | **4,75:1** |
| `--success-ink` `#296E50` | libellés et montants de revenus | **5,20:1** |
| `--danger-ink` `#AC3F2E` | alertes, soldes négatifs, effacement | **4,86:1** |

Les teintes d'origine de la charte restent déclarées (`--text-muted`, `--success`,
`--danger`) et servent aux aplats, icônes et graphiques.

**3. Rien n'est coupé ni tronqué.** Sur téléphone, les boutons et les libellés passent à la
ligne (`white-space: normal`), les filtres s'enroulent au lieu de défiler latéralement
(plus de contenu caché hors écran), et les zones tactiles font au moins **44 × 44 px**
(recommandation Apple). Les onglets du bas reçoivent des colonnes proportionnelles
(« Trans-actions » et « Para-mètres » ont plus de place qu'« Accueil ») avec des césures
françaises prévues dans le libellé.

**Le réglage « Confort de lecture »** (Paramètres → 👓) propose trois niveaux —
**Normale**, **Grande** (+12 %), **Très grande** (+25 %) — appliqués à *tout* le projet
via la taille de police de la racine (`--read-scale`) : pages, fenêtres, graphiques et
barre de navigation. Il est enregistré et s'applique dès l'ouverture des pages suivantes.
Le zoom du navigateur reste disponible et se combine au réglage.

**Mesuré, pas supposé** : un audit automatisé (`node tools/audit-readability.js`) parcourt
les 6 pages sur 4 largeurs (320, 360, 390, 430 px) et relève les textes trop petits, les
contrastes insuffisants (calcul de luminance réel, dégradés exclus), les textes réellement
coupés, les cibles tactiles trop petites, les éléments hors écran, les onglets qui se
chevauchent et les marges basses insuffisantes. Résultat actuel : **0 point**, aux trois
niveaux de lecture et en thème clair comme en thème sombre.

```bash
node tools/audit-readability.js                       # audit standard
FINATRACK_MIN_PX=13 FINATRACK_MIN_TAP=44 node tools/audit-readability.js   # barème strict
FINATRACK_TEXT_SIZE=tres-grand FINATRACK_THEME=dark node tools/audit-readability.js
```

### Mobile & installation
- **Installable** sur Android, iOS et ordinateur (PWA) — plein écran, icône dédiée, raccourcis
- **Fonctionne hors ligne** : service worker, bandeau d'état, données conservées sur l'appareil
- **Gestes** : feuilles glissantes, appui long sur le bouton **+** pour dicter, retour haptique
- Navigation basse à 5 entrées, zones sûres (encoches), cibles tactiles ≥ 44 px dès 320 px

### Suivi par moyen de paiement 💳

Savoir **avec quoi** chaque dépense a été payée est aussi important que son montant.
FinaTrack CI organise donc les transactions autour du moyen de paiement.

**1. Chaque transaction affiche son moyen de paiement** sous forme de pastille colorée
(bleu Wave, orange Orange Money, jaune MTN, bleu Moov, violet Djamo, vert espèces…).
La couleur est reprise partout : liste, tableau détaillé, graphiques et barres de répartition.

**2. Toutes les transactions se rangent par moyen de paiement.** Sélecteur
*« 💳 Ranger par moyen de paiement »* dans la page Transactions :
chaque méthode ouvre un bandeau affichant son nom, son nombre de transactions
et son total, puis ses transactions (les plus récentes d'abord).

**3. Les totaux par moyen de paiement** apparaissent à trois endroits :

| Où | Ce qu'on y trouve |
|---|---|
| **Tableau de bord** | les 4 principaux moyens du mois, leur part, le total général |
| **Transactions** | une ligne par méthode (total, part en %, dépenses, revenus, dernier usage) + **total général toutes méthodes confondues** |
| **Analyse** | graphique en barres colorées + détail complet sur la période choisie |

**4. Le total général** (« Total général — tous moyens confondus ») additionne tout :
dépenses **et** revenus, avec le nombre de transactions, les sous-totaux par nature et le
solde. Il se recalcule à chaque fois que les filtres changent (période, catégorie, type…),
et la somme des lignes égale toujours ce total (vérifié automatiquement).

**5. Filtrage en un geste.** Appuyer sur une ligne de la carte des totaux filtre
immédiatement la liste sur ce moyen de paiement ; les totaux se recalculent en direct.
Un filtre classique « Mode de paiement » reste disponible.

**6. Export dédié.** Le bouton *« 💳 CSV des totaux »* produit un fichier avec une ligne
par moyen de paiement (nombre, total, dépenses, revenus, part) et la ligne
`TOTAL GENERAL`, prête pour un tableur.

**Transactions sans moyen renseigné** : les données importées d'une ancienne version
peuvent ne pas en avoir. Elles sont regroupées sous « Non précisé », affichées en dernier
et jamais noyées dans les totaux — un rappel indique combien restent à compléter.

### Soldes des portefeuilles 💰

Le tableau de bord affiche **tous les moyens de paiement avec leur solde actualisé**,
pas seulement ceux qui ont bougé pendant le mois.

**La règle de calcul**, affichée telle quelle dans l'application :

```text
solde affiché = solde de départ + revenus reçus par ce moyen − dépenses payées avec lui
```

- **Total disponible** en tête de carte : la somme des soldes de tous les portefeuilles,
  avec le nombre de portefeuilles suivis, le total des entrées, des sorties et des soldes
  de départ. Il se met à jour en direct dès qu'une transaction est ajoutée, modifiée ou
  supprimée.
- **Une tuile par moyen de paiement** (les 8 méthodes + Djamo) : nom, solde, nombre de
  mouvements, part des entrées et des sorties, et la couleur du moyen de paiement.
- **Les portefeuilles sans mouvement restent affichés**, en retrait (`0 FCFA`), pour qu'on
  voie d'un coup d'œil ce qui est suivi et ce qui ne l'est pas.
- **Tout est visible même quand le total est négatif** : les soldes négatifs sont signalés
  (tuile rouge + bandeau d'explication bienveillant), car cela veut dire soit que le solde
  de départ est trop bas, soit qu'une dépense a été saisie deux fois.
- **Ajuster les soldes de départ** : bouton *« ✏️ Ajuster »* du tableau de bord (ou
  Paramètres → Portefeuilles). On y indique ce que contient chaque compte aujourd'hui,
  chiffre par chiffre, sans rien saisir deux fois. Laisser un champ vide = portefeuille non
  suivi. Les montants acceptent les séparateurs (`120 000`, `120.000`, `120000`) et un
  signe moins pour un découvert (`-5 000`).
- **Persistance dédiée** : clé `finatrack_wallets` (`{"Wave": 40000, …}`), incluse dans
  l'export/import JSON et effacée avec les autres données.
- **La démonstration** arrive avec des soldes de départ réalistes (espèces 15 000 F,
  Wave 8 000 F, Orange Money 30 000 F, virement bancaire 150 000 F…) : le total disponible
  affiché est de **419 900 FCFA** et aucun portefeuille n'est en négatif. Retirer la
  démonstration retire aussi ces montants — rien d'inventé ne reste dans les paramètres.

---

### Transverse
- Formatage monétaire unique : `formatCurrency(150000)` → **« 150 000 FCFA »**
- Notifications **toast** : dépense enregistrée, transaction modifiée, transaction supprimée,
  budget mis à jour, dépense vocale enregistrée…
- **États vides** explicites avec appel à l'action
- Validation des saisies avec messages compréhensibles
- Accessibilité : labels, focus visible, navigation clavier (Tab, Entrée, Espace, Échap),
  contrastes, zones tactiles ≥ 44 px, `aria-*` sur les composants interactifs

---

### Ancrage local : Abidjan — Cocody, Angré 🇨🇮

FinaTrack CI n'est pas une application générique traduite : elle est réglée sur la vie
quotidienne d'un habitant de **Cocody, Angré**. Concrètement, cela change quatre choses.

**1. Les montants sont ceux d'Abidjan (2026).** Les repères de prix utilisés dans les
exemples, les conseils et les données d'exemple proviennent de sources publiques :

| Poste | Montant courant | Détail |
|---|---|---|
| Wôrô-wôrô (trajet de quartier) | 200 – 500 FCFA | 300 F typique ; véhicules **jaunes** à Cocody |
| Gbaka (entre communes) | 200 – 500 FCFA | jusqu'à 700 F pour les longs trajets |
| SOTRA (bus, express) | 300 – 500 FCFA | desserte d'Angré vers le Plateau |
| Taxi compteur | 1 500 – 5 000 FCFA | tarif à négocier selon le trafic |
| Garba (repas de rue) | 300 – 1 200 FCFA | 500 – 700 F au comptoir |
| Repas au maquis | 1 000 – 2 500 FCFA | attiéké-poisson en maquis : 3 000 – 5 000 F |
| Forfait internet | 5 000 FCFA / 10 Go | Orange CI ; fibre à partir de 15 000 F/mois |
| Facture CIE | 15 000 – 100 000 FCFA | 28,84 F/kWh jusqu'à 80 kWh, puis 50 F/kWh |
| Tontine mensuelle | 10 000 – 50 000 FCFA | cotisations quotidiennes de 5 000 F possibles |
| Loyer 2 pièces à Angré | ≈ 70 000 FCFA | Angré Château / 7e tranche, jeune actif |

**2. Les moyens de paiement suivent le terrain.** Les quatre opérateurs mobile money
réellement actifs en Côte d'Ivoire sont présents — **Orange Money** (réseau le plus
dense, menu `#144#`), **MTN MoMo** (`*155#`), **Moov Money**, **Wave** (application,
envoi à 1 %, retrait gratuit) — aux côtés de **Djamo** (carte Visa des jeunes Ivoiriens),
des espèces, de la carte et du virement bancaires.

**3. Le vocabulaire vocal est ivoirien.** Le moteur de reconnaissance comprend les mots
du quotidien, pas seulement le français standard :

| Vous dites | Compris comme |
|---|---|
| « J'ai payé 300 francs de wôrô-wôrô pour Angré 7e Tranche » | Dépense 300 F · **Transport** |
| « J'ai acheté du garba à 700 francs au marché Cocovico » | Dépense 700 F · **Alimentation** |
| « J'ai payé 25 000 de tontine ce mois » | Dépense 25 000 F · **Famille** |
| « J'ai réglé la facture CIE de 18 500 francs » | Dépense 18 500 F · **Électricité** |
| « J'ai payé 90 000 d'écolage pour la rentrée » | Dépense 90 000 F · **Éducation** |
| « J'ai payé l'eau SODECI 9 000 tantôt » | Dépense 9 000 F · **Eau** · *aujourd'hui* |
| « J'ai pris du pagne à La Djibi pour 12 000 » | Dépense 12 000 F · **Shopping** |
| « J'ai payé 5 000 de forfait Orange, 10 Go » | Dépense 5 000 F · **Internet** |
| « J'ai payé 2 krika pour le taxi » | Dépense **2 000 F** (argot nouchi) · **Transport** |

Sont également reconnus les lieux et enseignes du quartier (Cocovico, La Djibi, Sicomex,
China Mall, CHU d'Angré, Pharmacie 8e Tranche), les plats (attiéké, alloco, choukouya,
kédjenou, dégué, foutou), les moyens de paiement annoncés à l'oral, et les expressions de
temps locales — « **tantôt** » (plus tôt dans la journée) équivaut à *aujourd'hui*.

**4. L'application parle de votre quartier.** La zone affichée sur l'accueil est
paramétrable (Paramètres → *Ma zone*, par défaut « Cocody — Angré »), une page de repères
de prix est intégrée aux Paramètres, et l'analyse traduit le poste transport en nombre de
trajets (« 900 F ≈ 2 trajets en gbaka ») plutôt qu'en chiffre abstrait.

**Adapter à une autre ville ou à un autre pays** : tout tient dans le bloc
`LOCAL_CONTEXT` de `js/utils.js` (ville, commune, quartier, opérateurs, repères de prix)
et dans `CATEGORY_HINTS` (exemples par catégorie). Aucune autre modification n'est
nécessaire : l'interface, les formulaires et les conseils se mettent à jour tout seuls.

*Sources des repères de prix : `blog.iambeezy.app` (tarifs gbaka et wôrô-wôrô 2026,
facture CIE 2026, forfaits Orange CI 2026), `budgetabidjan.com` (budget transport
mensuel), `abidjanaccueil.com` (taxi et bateau-bus), `travelwithhello.com` et
`thingstodoinabidjan.com` (prix des repas), `vyroom.io` et `appartlocci.com` (vie et
commerces d'Angré), `momocalc.com` et `digitalmag.ci` (frais mobile money et cartes
prépayées), France Info (argot nouchi).*

## 3. Technologies

| Élément | Choix | Pourquoi |
|---|---|---|
| Structure | **HTML5** | sémantique, sans framework |
| Style | **CSS3** (variables, grid, flex, container-free) | thème clair/sombre en un attribut |
| Logique | **JavaScript Vanilla ES6+** (IIFE modulaires) | zéro build, compatible hébergement statique |
| Persistance | **LocalStorage** | aucune installation, confidentialité maximale |
| Graphiques | **Chart.js 4.4.1** (embarqué localement) | léger, sans dépendance, fonctionne hors ligne |
| Mobile | **PWA** : manifeste + service worker + icônes | installable sur l'écran d'accueil, utilisable hors ligne |
| Tests | **jsdom** (fonctionnel) + **Puppeteer** (navigateur réel) | vérifie le comportement *et* le rendu |

**Aucun** React, Angular, Vue, Bootstrap ou Tailwind.

---

## 4. Architecture

```text
finatrack-ci/
├── index.html                 # Tableau de bord
├── pages/
│   ├── transactions.html      # Mes transactions (recherche + filtres)
│   ├── incomes.html           # Mes revenus
│   ├── budget.html            # Mon budget
│   ├── analysis.html          # Analyse financière
│   └── settings.html          # Paramètres
├── manifest.webmanifest       # Application installable (nom, icônes, raccourcis)
├── sw.js                      # Service worker (fonctionnement hors ligne)
├── css/
│   ├── style.css              # tokens, reset, layout, shell, sections
│   ├── components.css         # boutons, formulaires, modales, toasts, vocal…
│   └── responsive.css         # 320 · 375 · 390 · 430 · 768 · 1024 · 1440
├── js/
│   ├── utils.js               # constantes, formatage FCFA, dates, DOM sûr, toasts, modales, bus
│   ├── storage.js             # persistance + interface abstraite `dataService`
│   ├── expenses.js            # domaine dépenses (validation, CRUD, agrégations)
│   ├── incomes.js             # domaine revenus + vue page Revenus
│   ├── transactions.js        # recherche, filtres, modification, suppression, stats globales
│   ├── payments.js            # 💳 totaux, rangement et répartition par moyen de paiement
│   ├── budget.js              # budget mensuel, alertes, projections, historique
│   ├── dashboard.js           # tableau de bord + « Où va mon argent ? »
│   ├── analysis.js            # analyse financière + top dépenses
│   ├── charts.js              # Chart.js (donut, 7 jours, tendance, comparaison, catégories)
│   ├── voiceExpense.js        # 🎙️ reconnaissance vocale + analyse de phrase + confirmation
│   ├── mobile.js              # 📱 gestes, zones sûres, secousses, installation, hors ligne
│   ├── app.js                 # amorçage, formulaires, ajout rapide, paramètres, démo
│   └── vendor/chart.umd.min.js
├── tests/
│   └── smoke.js               # 748 vérifications fonctionnelles (jsdom)
├── tools/
│   ├── build-static.js        # « build » de déploiement : compose dist/ et vérifie son contenu
│   ├── check-deploy.js        # vérifie netlify.toml, dist/ et le service worker (npm run deploy:check)
│   ├── build-preview.py       # génère la version mono-fichier
│   ├── make-icons.py          # régénère les icônes PNG (bibliothèque standard uniquement)
│   ├── screenshots.js         # captures + contrôles de mise en page en navigateur réel
│   ├── audit-readability.js   # audit de lisibilité mobile (tailles, contrastes, cibles)
│   └── parcours.js            # parcours utilisateur réel (démonstration → ajout → vocal)
├── preview/
│   └── finatrack-ci-preview.html   # démo autonome (CSS + JS + Chart.js intégrés)
├── screens/                   # captures de référence (téléphone, tablette, hors ligne)
├── assets/
│   ├── icons/                 # icônes de l'application (32 · 180 · 192 · 512 · maskable)
│   └── images/
├── netlify.toml               # build « npm run build » + publish « dist » (prioritaire sur l'interface)
├── vercel.json                # mêmes réglages pour Vercel (build, dist, en-têtes)
├── .nojekyll                  # GitHub Pages : publication du dossier telle quelle
├── DEPLOIEMENT.md             # guide pas à pas : Netlify, Vercel, GitHub Pages, dépannage
├── package.json               # scripts de développement (test, captures, icônes, aperçu)
└── README.md
```

### Principes

1. **Une seule couche d'accès aux données** : personne n'appelle `localStorage` directement,
   tout passe par `FT.data` (`dataService`). Les vues ne connaissent que cette interface.
2. **Domaine séparé de l'affichage** : `expenses.js`, `incomes.js`, `budget.js` ne touchent pas
   au DOM ; `dashboard.js`, `analysis.js`, `app.js` ne font que du rendu.
3. **Réactivité par bus d'événements** : toute écriture émet `data:changed`, et chaque vue se
   rafraîchit (dashboard, graphiques, budget, analyses…). Un seul point de vérité, zéro recalcul inutile.
4. **Sécurité par construction** : les éléments sont créés via une fabrique DOM qui utilise
   `textContent` (aucun `innerHTML` avec des données utilisateur), `escapeHtml()` reste disponible
   pour les rares cas de gabarits.
5. **Aucune écriture automatique non confirmée** : une analyse vocale n'est jamais enregistrée
   sans un clic explicite sur « Confirmer ».

### API interne (extraits)

```javascript
// Écritures (toutes validées, toutes événementielles)
addExpense({ amount, category, description, date, paymentMethod })   // -> { ok, data | errors }
addIncome({ amount, source, description, date, paymentMethod })
updateExpense(id, patch) / updateIncome(id, patch)
deleteTransaction(transaction)                                       // avec confirmation

// Lectures & calculs
calculateBalance(month)
calculateMonthlyExpenses(month) / calculateMonthlyIncomes(month)
calculateSavingsRate(month)
calculateBudgetRemaining(month)
filterTransactions(list, filters) / searchTransactions(list, query)
formatCurrency(150000)                                               // "150 000 FCFA"

// Vocal
startVoiceRecognition() / stopVoiceRecognition() / handleVoiceResult(text)
extractAmount(text) / detectCategory(text) / detectDate(text) / extractDescription(text)

// Rendu
updateDashboard() / updateCharts() / showVoiceConfirmation(parsed)
```

---

## 5. Installation & utilisation

### Installation

Aucun build, aucune dépendance à installer.

```bash
git clone <votre-depot> finatrack-ci
cd finatrack-ci
```

**Option A — ouvrir directement** : double-cliquez sur `index.html`.
*(La reconnaissance vocale nécessite un contexte sécurisé : `localhost` ou `https`.)*

**Option B — serveur local** (recommandé) :

```bash
python3 -m http.server 5173
# puis ouvrez http://localhost:5173
```

ou

```bash
npx serve .
```

### Premier lancement

FinaTrack propose de **charger des données de démonstration** (salaire, transport, alimentation,
internet, loisirs…) ou de **commencer à zéro**. Les données de démo sont supprimables d'un clic
dans **Paramètres → Mes données**, sans toucher à vos propres saisies.

### Utilisation en 6 étapes

```text
1. Consulter son solde            -> Tableau de bord
2. Voir où va l'argent            -> « Où va mon argent ? » + donut
3. Ajouter une dépense            -> bouton + (ajout rapide ou complet)
4. Ou appuyer sur 🎙️ et parler    -> « J'ai dépensé 2 000 francs pour le taxi »
5. Confirmer la proposition       -> la transaction est enregistrée
6. Tout se met à jour             -> dashboard, graphiques, budget, analyses
```

### Raccourcis clavier (desktop)

| Touche | Action |
|---|---|
| `N` | Nouvelle dépense |
| `V` | Ajout par la voix |
| `R` | Nouveau revenu |
| `/` | Aller à la recherche |
| `Échap` | Fermer la fenêtre ouverte |

---

## 6. Fonctionnement de la saisie vocale

### Chaîne de traitement

```text
🎙️ Micro
   ↓  (API Web Speech Recognition, langue configurable — fr-FR par défaut)
Transcription en direct
   ↓  parseTranscript()
Montant        extractAmount()        « 2 000 » / « deux mille » / « 2k »
Catégorie      detectCategory()       mots-clés ivoiriens (taxi, gbaka, maquis, attiéké, CIE…)
Date           detectDate()           aujourd'hui, hier, ce matin, ce soir, lundi…
Description    extractDescription()   « Taxi »
Paiement       detectPaymentMethod()  Orange Money, Wave, MTN, Moov, espèces, carte…
   ↓
Carte « Dépense détectée » + niveau de confiance
   ↓
[ Recommencer ]   [ Modifier ]   [ ✓ Confirmer ]   ← obligatoire
   ↓
Enregistrement + toast « Dépense vocale enregistrée »
```

### Exemples pris en charge

| Vous dites | Montant | Catégorie | Description |
|---|---|---|---|
| « J'ai dépensé 1500 francs pour le transport. » | 1 500 | Transport | Transport |
| « J'ai acheté un repas à 2500 francs. » | 2 500 | Alimentation | Repas |
| « Taxi 2000 francs. » | 2 000 | Transport | Taxi |
| « J'ai payé 5000 francs pour Internet. » | 5 000 | Internet | Internet |
| « J'ai donné 10000 francs à ma famille. » | 10 000 | Famille | Famille |
| « J'ai dépensé 3000 francs au maquis. » | 3 000 | Alimentation | Maquis |
| « J'ai acheté une paire de chaussures à 15000 francs. » | 15 000 | Shopping | Paire de chaussures |
| « J'ai payé 300 francs de wôrô-wôrô pour Angré 7e Tranche. » | 300 | Transport | Wôrô-wôrô |
| « J'ai dépensé 500 dans le gbaka pour Adjamé. » | 500 | Transport | Gbaka |
| « J'ai acheté du garba à 700 francs au marché Cocovico. » | 700 | Alimentation | Garba |
| « J'ai payé 25 000 de tontine ce mois. » | 25 000 | Famille | Tontine |
| « J'ai réglé la facture CIE de 18 500 francs avec Orange Money. » | 18 500 | Électricité | Facture CIE |
| « J'ai payé 90 000 d'écolage pour la rentrée. » | 90 000 | Éducation | Écolage |
| « J'ai payé l'eau SODECI 9 000 tantôt. » | 9 000 | Eau | (aujourd'hui) |
| « J'ai payé 2 krika pour le taxi. » | 2 000 | Transport | Taxi |
| « Dépense de 15 milles pour les marchandises. » | 15 000 | Investissement | Marchandises |

### Saisie texte de secours

Si la reconnaissance vocale n'est pas disponible (ou si vous préférez taper), la fenêtre vocale
propose un champ texte : la phrase est analysée **avec exactement la même grammaire**. Pratique
pour tester l'analyse dans tous les navigateurs.

### Limites de la reconnaissance vocale (à connaître)

- **Navigateur** : l'API est supportée par Chrome, Edge, Safari et la plupart des navigateurs
  Android ; en revanche **Firefox ne la prend pas en charge** (la saisie texte reste disponible).
- **Contexte sécurisé obligatoire** : `https://` ou `localhost`. Un simple fichier ouvert en
  `file://` n'aura pas accès au microphone.
- **Connexion internet** : dans Chrome, la reconnaissance est traitée côté serveur par le moteur
  du navigateur. Sans réseau, elle échoue (message explicite affiché).
- **Bruit ambiant** : un environnement bruyant (marché, gbaka, maquis) dégrade la transcription.
  Parlez à 20–30 cm du micro.
- **Langue et accents** : la langue correspond à celle choisie dans les Paramètres. Les termes
  locaux (wôrô-wôrô, attiéké, gbaka) peuvent être transcrits de plusieurs façons ; les mots-clés
  gèrent les variantes courantes, mais **l'utilisateur peut toujours corriger**.
- **Nombres** : « deux mille cinq cents » et « 2 500 » sont gérés ; les phrases très longues avec
  plusieurs montants retiennent le montant le plus probable et affichent les autres possibilités.
- **Aucune écriture automatique** : par conception, une détection vocale doit être **confirmée**.

---

## 7. Déploiement

Le projet est **100 % statique** : aucun serveur applicatif, aucune variable d'environnement.

> Guide pas à pas, vérifications après mise en ligne et dépannage express :
> **[`DEPLOIEMENT.md`](DEPLOIEMENT.md)**.

### Vercel

```bash
npm i -g vercel
cd finatrack-ci
vercel          # déploiement de préproduction
vercel --prod   # déploiement de production
```

Ou via l'interface web : *New Project* → import du dépôt Git → **Framework Preset : Other** →
*Build Command* : `npm run build`, *Output Directory* : `dist` → Deploy.

Ces réglages sont aussi fournis dans le fichier **`vercel.json`** (build, dossier publié,
en-têtes de sécurité, pas de téléchargement de Chromium) : l'import du dépôt suffit, aucun
réglage manuel n'est nécessaire.

### Netlify

Un fichier **`netlify.toml`** est fourni à la racine du dépôt. Il est **prioritaire sur les
réglages de l'interface Netlify** : il n'y a donc rien à configurer à la main dans le
tableau de bord.

| Réglage Netlify | Valeur |
| --- | --- |
| Base directory | *(vide — la racine du dépôt)* |
| Build command | `npm run build` |
| Publish directory | `dist` |

`npm run build` **ne compile rien** : il recopie simplement le site dans `dist/` et vérifie
que tout est complet (`tools/build-static.js`). Le dossier `dist/` est **généré** : il n'est
pas commité (`.gitignore`), et il est reconstruit à chaque déploiement.

**Méthode 1 — dépôt Git (recommandée)**

1. Netlify → *Add new site* → *Import an existing project* → choisis le dépôt ;
2. laisse les champs tels quels : le `netlify.toml` fournit le build et le dossier publié ;
3. *Deploy site* — chaque `git push` redéploie automatiquement.

**Méthode 2 — ligne de commande**

```bash
npm run build                       # produit dist/
npm i -g netlify-cli
netlify deploy --dir dist --prod    # ou : npm run deploy:netlify
```

**Méthode 3 — glisser-déposer (sans Git)**

```bash
npm run build
```

puis glisse le dossier **`dist/`** sur <https://app.netlify.com/drop>.

> **Dépannage — `Deploy did not succeed: Deploy directory 'dist' does not exist`**
> Cette erreur arrive quand le site est réglé sur `npm run build` + `dist` alors qu'aucun
> `netlify.toml` n'existe et que le build ne produit aucun `dist/` (réglage hérité d'un
> autre projet, `commandOrigin: config` dans le journal Netlify).
> 1. vérifie que `netlify.toml` est bien présent à la **racine** du dépôt (ce fichier corrige
>    le réglage : il a priorité sur l'interface) ;
> 2. si tes fichiers sont dans un sous-dossier du dépôt, renseigne *Base directory* ;
> 3. en local, lance **`npm run deploy:check`** : il exécute réellement le build de
>    déploiement et indique précisément ce qui manquerait à Netlify.

### GitHub Pages

Le dépôt contient un fichier **`.nojekyll`** : GitHub Pages publie le dossier tel quel, sans
transformation. Aucun build n'est nécessaire.

1. pousser le projet sur GitHub ;
2. *Settings → Pages → Source : Deploy from a branch* ;
3. branche `main`, dossier `/ (root)` ;
4. l'application est servie sur `https://<utilisateur>.github.io/<depot>/`
   (vérifié automatiquement : **aucun lien absolu** dans les six pages, les chemins relatifs
   fonctionnent donc dans un sous-dossier).

*Variante* : pour publier le dossier `dist/` via GitHub Actions, un workflow prêt à copier
est fourni dans `DEPLOIEMENT.md` (§5).

> Astuce : pour un sous-dossier GitHub Pages, conservez les liens **relatifs** (déjà le cas)
> afin que `index.html` et `pages/*.html` continuent de se trouver.

---

## 8. Version mobile & installation sur téléphone (PWA)

FinaTrack CI n'est pas seulement « responsive » : l'application s'installe comme une
application native, fonctionne sans réseau et exploite les gestes du téléphone.

### Installation

| Appareil | Marche à suivre |
|---|---|
| **Android (Chrome / Edge / Samsung)** | Un bandeau **« Installer »** apparaît en bas de l'écran, ou utilisez le bouton d'installation de la barre supérieure. Sinon : menu ⋮ → **« Installer l'application »**. |
| **iPhone / iPad (Safari)** | Bouton **Partager** → **« Sur l'écran d'accueil »** → **Ajouter**. Le mode pas-à-pas s'affiche dans l'application (bouton d'installation de la barre supérieure). |
| **Ordinateur (Chrome / Edge)** | Icône d'installation dans la barre d'adresse, ou bouton de la barre supérieure. |

Après installation : icône **F** verte sur l'écran d'accueil, ouverture plein écran sans
barre d'adresse, et **quatre raccourcis** (appui long sur l'icône) : *Ajout par la voix*,
*Ajout rapide*, *Transactions*, *Budget*.

### Fonctionnement hors ligne

Un **service worker** (`sw.js`) met en cache la coquille de l'application (HTML, CSS,
JavaScript, Chart.js, icônes). Résultat :

- première visite : la coquille est enregistrée ;
- ensuite : l'application démarre **sans réseau** et continue d'écrire vos données ;
- un bandeau **« Hors ligne — vos données restent sur l'appareil »** s'affiche pendant
  la coupure, puis disparaît au retour du réseau ;
- une **nouvelle version** n'est jamais imposée : un message propose la mise à jour,
  que vous acceptez d'un appui.

### Adaptation tactile

| Élément | Comportement |
|---|---|
| **Navigation** | barre fixe en bas (Accueil · Transactions · **+** · Analyse · Paramètres), bouton central surélevé ; la barre s'efface quand le clavier s'ouvre |
| **Fenêtres** | présentées en **feuille glissante** ancrée en bas ; fermeture en glissant vers le bas ou en touchant l'arrière-plan |
| **Bouton +** | ouvre le menu d'ajout ; **appui long** (0,5 s) → saisie vocale directe |
| **Microphone** | cible de 96 px de diamètre, vibration à l'écoute et à la confirmation |
| **Retour haptique** | vibration courte à l'enregistrement, moyenne à la modification, motif à la confirmation vocale |
| **Zones sûres** | encoches, barre d'accueil iOS et barres système respectées (`env(safe-area-inset-*)`) |
| **Hauteur d'écran** | variable `--vh` recalculée : plus de barre tronquée quand le clavier s'ouvre |
| **Zoom involontaire** | champs de saisie à 16 px au focus sur iOS |
| **Petits écrans** | mise en page vérifiée dès **320 px**, segments de filtre défilables avec repère visuel |
| **Mouvements réduits** | animations neutralisées si le système le demande (`prefers-reduced-motion`) |

L'affichage sur ordinateur est inchangé : barre latérale complète à partir de 1024 px.

---

## 9. Évolution vers Supabase (architecture préparée)

Le MVP persiste dans LocalStorage **derrière une interface abstraite** : `FT.data` (`dataService`).
Remplacer LocalStorage par Supabase ne demande donc **aucune réécriture des vues**.

```javascript
// js/storage.js — adaptateur actuel
const localAdapter = {
    name: "localStorage",
    getExpenses() { /* LocalStorage */ },
    addExpense(expense) { /* LocalStorage */ },
    // …
};
```

```javascript
// futur adaptateur (mêmes noms, mêmes formes de données)
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const supabaseAdapter = {
    name: "supabase",
    async getExpenses() {
        const { data, error } = await supabase
            .from("expenses")
            .select("*")
            .order("date", { ascending: false });
        if (error) throw error;
        return data;
    },
    async addExpense(expense) {
        const { data, error } = await supabase.from("expenses").insert(expense).select().single();
        if (error) throw error;
        return data;
    }
    // updateExpense, deleteExpense, getIncomes, setBudget, …
};

FT.data.setAdapter(supabaseAdapter);   // bascule en une ligne
```

### Schéma PostgreSQL envisagé

```sql
create table profiles (
    id uuid primary key references auth.users on delete cascade,
    full_name text,
    currency text default 'FCFA',
    created_at timestamptz default now()
);

create table expenses (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users on delete cascade not null,
    amount numeric(14,2) not null check (amount > 0),
    category text not null,
    description text,
    date date not null,
    payment_method text,
    source text default 'manual',
    created_at timestamptz default now(),
    updated_at timestamptz
);

create table incomes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users on delete cascade not null,
    amount numeric(14,2) not null check (amount > 0),
    source text not null,
    description text,
    date date not null,
    payment_method text,
    created_at timestamptz default now()
);

create table budgets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users on delete cascade not null,
    month char(7) not null,             -- '2026-09'
    amount numeric(14,2) not null,
    unique (user_id, month)
);

-- Sécurité par ligne (RLS) : chacun ne voit que ses données
alter table expenses enable row level security;
create policy "expenses_owner" on expenses
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### Feuille de route

| Étape | Contenu |
|---|---|
| 1 | Auth Supabase (e-mail / téléphone) + profils |
| 2 | Synchronisation des dépenses/revenus/budgets via `supabaseAdapter` |
| 3 | Mode hors ligne avec file d'attente puis synchro (PWA + service worker) |
| 4 | Objectifs d'épargne, budgets par catégorie, rappels intelligents |
| 5 | Export comptable (CSV/PDF), multi-profils (personnel / business / tontine) |

---

## 10. Tests

### Tests automatisés (jsdom)

```bash
npm install          # jsdom + puppeteer (dépendances de développement)
npm run serve        # lance l'application sur http://localhost:5173
npm test             # ou : node tests/smoke.js
npm run parcours     # parcours réel dans un vrai navigateur (voir plus bas)
npm run audit        # audit de lisibilité mobile
npm run screenshots  # captures d'écran + contrôles de mise en page
npm run build        # « build » de déploiement → dist/ (recopie, aucune compilation)
npm run deploy:check # vérifie netlify.toml, dist/ et le service worker
```

`tests/smoke.js` charge réellement les pages du projet dans un DOM simulé et exécute
**748 vérifications** (19 groupes) : formatage FCFA, soldes des portefeuilles
(départ + entrées − sorties, tuiles, totaux, formulaire d'ajustement, mise à jour en
direct),, parsing des phrases vocales, validation des
formulaires, CRUD dépenses/revenus, recherche et filtres combinés, seuils d'alerte du
budget, KPI du tableau de bord, indicateurs d'analyse, états vides, persistance
LocalStorage, bascule d'adaptateur (préparation Supabase), structure des six pages,
version mono-fichier, application installable (manifeste, icônes, service worker),
gestes tactiles, verrouillage du défilement des fenêtres, **lisibilité mobile** (plancher
typographique, contrastes AA, cibles tactiles, trois niveaux de confort de lecture et leur
persistance) et parcours utilisateur complets.

```text
Tests réussis : 748   |   Échecs : 0
```

### Vérifications de déploiement (`npm run deploy:check`)

`tools/check-deploy.js` rejoue le build de déploiement puis inspecte le dossier `dist/`
obtenu — exactement ce que l'hébergeur publiera — en **38 contrôles** : configuration
`netlify.toml` et `vercel.json` (dossier publié `dist`, cache du service worker, en-têtes de
sécurité, build sans Chromium), scripts npm et `.gitignore`, contenu de `dist/` (6 pages,
3 feuilles CSS, 13 modules JS + Chart.js, manifeste, service worker, 5 icônes, aucun dossier
de travail), absence de toute ressource externe dans les pages, **couverture hors ligne** du
service worker (tous les scripts chargés par les pages sont bien précachés) et compatibilité
**GitHub Pages** (`.nojekyll`, aucun lien absolu).

```text
Vérifications de déploiement : 38 ✓   |   Échecs : 0
```

Les captures d'écran du dossier `screens/` sont régénérées ainsi :

```bash
npm run screenshots        # nécessite un serveur local (npm start) et Puppeteer
```

Le script parcourt l'application sur un profil de **téléphone (390 × 844)**, un **petit
téléphone (320 × 568)** et une **tablette (768 × 1024)**, ouvre chaque fenêtre (ajout
rapide, dépense, menu +, vocal, confirmation, **ajustement des soldes**), vérifie qu'elle
est **réellement affichée**, contrôle l'absence de débordement horizontal, l'absence de nom
tronqué dans les tuiles de portefeuille et toute erreur JavaScript.

### Parcours réel dans un navigateur (`npm run parcours`)

`tools/parcours.js` joue le rôle d'un utilisateur sur un téléphone simulé
(390 × 844, Chromium) et vérifie que **l'application fonctionne vraiment**,
pas seulement que le code est correct :

1. première visite → la démonstration est proposée ;
2. démonstration chargée (14 dépenses, 3 revenus, budget 200 000 F) et indicateurs cohérents ;
3. les 9 portefeuilles s'affichent, aucun solde négatif (total disponible 419 900 FCFA) ;
4. menu **+** → les 4 méthodes d'ajout sont proposées ;
5. **dépense ajoutée par le formulaire** → le portefeuille Espèces baisse exactement de 2 000 FCFA ;
6. **dépense vocale** : « J'ai dépensé 2 000 francs pour le taxi » → montant 2 000, catégorie
   Transport, description « Taxi », et **rien n'est enregistré** tant que l'utilisateur n'a pas
   confirmé ;
7. confirmation explicite → la dépense est enregistrée et le message s'affiche ;
8. rechargement de la page → **toutes les données sont conservées**.

Le script échoue (code de sortie 1) à la moindre erreur JavaScript ou incohérence de calcul.

### Version mono-fichier (démo autonome)

```bash
python3 tools/build-preview.py
# → preview/finatrack-ci-preview.html (730 Ko, aucune ressource externe)
```

Le script intègre le CSS, les 13 modules JavaScript et Chart.js dans un seul fichier HTML,
puis ajoute un petit routeur qui permet de naviguer entre les six écrans sans serveur.
Idéal pour partager la démo par e-mail ou l'ouvrir dans un environnement sans réseau.
(Le projet multi-pages `index.html` + `pages/*.html` reste la version de référence.)

### Tests manuels effectués

- **Dépenses** : ajout, modification, suppression, recherche, filtres (type, période, catégorie,
  paiement, montants), tri, export CSV.
- **Revenus** : ajout, modification, suppression, synthèse, répartition par source.
- **Calculs** : solde, total dépenses, total revenus, épargne, taux d'épargne, budget restant,
  moyennes, jour maximum, projections.
- **Portefeuilles** : solde par moyen de paiement (départ + entrées − sorties), total
  disponible, tuiles des 9 moyens, soldes négatifs signalés, ajustement des soldes de départ
  et répercussion immédiate sur le tableau de bord — vérifié aussi en navigateur réel
  (`screens/wallet-01-mobile.png`, `screens/wallet-02-formulaire.png`).
- **Graphiques** : donut par catégorie, 7 derniers jours, tendance, revenus vs dépenses,
  catégories — recalculés après chaque écriture.
- **Voix** : phrases de référence ci-dessus + refus du microphone + navigateur sans support +
  absence de parole captée.
- **Responsive** : 320 / 375 / 390 / 430 / 768 / 1024 / 1440 px, portrait et paysage —
  vérifié sur navigateur réel (Chromium, profil téléphone) et non seulement en CSS.
- **Lisibilité** : 6 pages × 4 largeurs, aux trois niveaux de confort de lecture et en
  thème sombre — tailles minimales, contrastes calculés, cibles tactiles, onglets de la
  barre du bas, marge sous la barre (`node tools/audit-readability.js`). Captures :
  `screens/lisible-01-confort-lecture.png`, `lisible-02-tres-grand-320.png`,
  `lisible-03-barre-320-*.png`.
- **État vide** : première ouverture, filtres sans résultat, période sans donnée.
- **Voix (navigation)** : Chrome / Edge / Safari / Android — et repli texte sur Firefox.
- **Hors ligne** : application fonctionnelle sans réseau (service worker + Chart.js embarqué),
  bandeau d'état affiché puis masqué au retour du réseau.
- **Fenêtres** : ouverture réellement visible (feuille ancrée en bas), fermeture au glissement,
  focus neutre — vérifié automatiquement par `npm run screenshots`.
- **Saisie au clavier** : la barre de navigation s'efface, la page ne se décale pas,
  le champ reste visible au-dessus du clavier.

---

## 11. Confidentialité

> **Vos données sont enregistrées localement dans votre navigateur. Elles ne sont pas
> synchronisées avec un serveur.**

Conséquences à connaître :

- vider les données du navigateur ou changer d'appareil ne transfère rien ;
- **exportez régulièrement** votre sauvegarde JSON (Paramètres → Mes données) ;
- aucun traqueur, aucune requête réseau, aucune donnée envoyée à un tiers.

---

## 12. Licence & crédits

Projet personnel — utilisable, modifiable et partageable librement.
Design, code et documentation : **FinaTrack CI**.
Police et graphiques : système et Chart.js (MIT).
