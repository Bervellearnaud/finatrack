# Déploiement — FinaTrack CI

Guide pas à pas. FinaTrack CI est **100 % statique** : aucun serveur, aucune base de
données, aucune variable d'environnement. Le déploiement revient donc à publier un dossier
de fichiers.

---

## 1. Avant de publier (2 minutes)

```bash
npm install           # jsdom + puppeteer (outils de développement uniquement)
npm test              # 748 vérifications — doit finir à 0 échec
npm run deploy:check  # 38 contrôles : build réel + contenu qui sera publié
```

`npm run deploy:check` exécute réellement le build, puis inspecte `dist/` : 6 pages,
3 feuilles CSS, 13 modules JS + Chart.js, manifeste, service worker, 5 icônes, absence de
ressource externe et couverture hors ligne. **Si les 38 contrôles passent, le déploiement
passera.**

---

## 2. Ce qui est publié, ce qui ne l'est jamais

| Publié (`dist/`) | Jamais publié |
| --- | --- |
| `index.html`, `pages/*.html` (6 pages) | `tests/` (vérifications jsdom) |
| `css/` (3 feuilles), `js/` (13 modules + `vendor/chart.umd.min.js`) | `tools/` (build, captures, audit) |
| `manifest.webmanifest`, `sw.js` | `screens/` (captures de référence) |
| `assets/icons/` (5 icônes) | `node_modules/`, `.git/`, `.netlify/`, `.vercel/` |

Le dossier `dist/` est **généré** : il n'est pas commité (voir `.gitignore`) et il est
reconstruit à chaque déploiement.

---

## 3. Netlify (recommandé)

Rien à configurer dans le tableau de bord : le fichier **`netlify.toml`** fournit le build
et le dossier publié, et **il est prioritaire sur les réglages de l'interface**.

| Réglage Netlify | Valeur |
| --- | --- |
| Base directory | *(vide — la racine du dépôt)* |
| Build command | `npm run build` |
| Publish directory | `dist` |

### Méthode 1 — dépôt Git (recommandée)

1. Netlify → **Add new site** → **Import an existing project** → choisis ton dépôt ;
2. laisse les champs tels quels, clique **Deploy site** ;
3. chaque `git push` redéploie automatiquement.

> Après avoir ajouté `netlify.toml` à un site existant : **Deploys → Trigger deploy →
> Clear cache and deploy site**, pour que Netlify relise la configuration.

### Méthode 2 — ligne de commande

```bash
npm run build
npm i -g netlify-cli
netlify deploy --dir dist --prod      # ou : npm run deploy:netlify
```

### Méthode 3 — glisser-déposer (sans Git)

```bash
npm run build
```

puis glisse le dossier **`dist/`** sur <https://app.netlify.com/drop>.

---

## 4. Vercel

Le fichier **`vercel.json`** fournit la même configuration (build + `dist` + en-têtes).

**Dépôt Git :** *New Project* → import du dépôt → Framework Preset **Other** → Deploy.
Vercel lit `vercel.json` et n'a besoin d'aucun réglage manuel.

**Ligne de commande :**

```bash
npm run build
npx vercel --prod        # ou : npm run deploy:vercel
```

---

## 5. GitHub Pages

Aucun build n'est nécessaire : tous les liens du projet sont **relatifs**, donc le site
fonctionne tel quel dans un sous-dossier (`https://<utilisateur>.github.io/<depot>/`).
Le fichier **`.nojekyll`** garantit que le dossier est publié sans transformation.

1. pousser le projet sur GitHub ;
2. **Settings → Pages → Source : Deploy from a branch** ;
3. branche `main`, dossier **/ (root)** → Save.

**Variante (publier `dist/` via GitHub Actions)** — à créer seulement si tu préfères
publier le dossier généré, dans `.github/workflows/deploy.yml` :

```yaml
name: Déploiement
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Puis : **Settings → Pages → Source : GitHub Actions**.

---

## 6. Après la mise en ligne — 5 vérifications

1. **La page s'ouvre** et le tableau de bord s'affiche (aucun écran blanc).
2. **Les icônes de l'application** apparaissent dans l'onglet (sinon : le dossier
   `assets/icons/` n'a pas été publié).
3. **Installation** : sur téléphone, le navigateur propose « Ajouter à l'écran d'accueil ».
4. **Hors ligne** : coupe les données mobiles, recharge la page → l'application s'ouvre
   toujours (service worker).
5. **Microphone** : le bouton 🎙️ fonctionne — l'accès au micro exige **HTTPS**
   (Netlify, Vercel et GitHub Pages le fournissent automatiquement).

---

## 7. Dépannage express

| Message | Cause | Solution |
| --- | --- | --- |
| `Deploy did not succeed: Deploy directory 'dist' does not exist` | Site réglé sur `npm run build` + `dist` sans que le build produise `dist/` (réglage hérité d'un autre projet) | Vérifier que `netlify.toml` est à la **racine** du dépôt, puis **Clear cache and deploy site** |
| `Build script returned non-zero exit code: 2` | Le build a échoué ou a produit un dossier vide | Lancer `npm run deploy:check` en local : il exécute le build et liste précisément ce qui manque |
| `command not found: python3` | L'ancien script `build` utilisait Python (icônes, aperçu) | Plus le cas : le build de déploiement est **Node uniquement** (`tools/build-static.js`). Pour régénérer les icônes/aperçu : `npm run assets` |
| Le site affiche une ancienne version après un déploiement | Service worker qui sert le cache | Normal : le nouveau `sw.js` prend la main puis recharge. En cas de doute : vider les données du site, ou publier avec une version incrémentée |
| Les pages `pages/*.html` renvoient 404 | Liens absolus (`/pages/...`) | Non présent dans ce projet : les liens sont relatifs. Vérifier qu'aucun outil n'a réécrit les chemins |
| Le déploiement est très lent | Téléchargement de Chromium (Puppeteer) pendant l'installation | Déjà évité côté Netlify et Vercel (`PUPPETEER_SKIP_DOWNLOAD`) |

---

## 8. Mises à jour du site

1. modifier le code ;
2. `npm test` puis `npm run deploy:check` ;
3. **incrémenter la version du cache** dans `sw.js` (`VERSION = "finatrack-v1.2.x"`) pour
   que les téléphones déjà installés reçoivent la mise à jour ;
4. publier (`git push`, ou `npm run deploy:netlify` / `npm run deploy:vercel`).

> Les données des utilisateurs vivent dans le navigateur (LocalStorage) : un déploiement
> ne les touche jamais. Le service worker ne supprime que **ses propres** caches.

---

## 9. Compatibilité hôte statique

| Hébergeur | Configuration | Fourni |
| --- | --- | --- |
| Netlify | `npm run build` + `dist` | `netlify.toml` |
| Vercel | `npm run build` + `dist` | `vercel.json` |
| GitHub Pages | publication directe (racine) | `.nojekyll` |
| Cloudflare Pages, Apache, Nginx… | publier `dist/` | — |

Dans tous les cas : **aucun backend, aucune variable d'environnement, aucune dépendance à
l'installation** n'est requise côté hébergeur.
