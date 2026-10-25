# Mockups FinaTrack CI

Visuels de présentation de l'application — **ce sont de vraies captures de l'app**,
pas des maquettes inventées : chaque écran est rendu dans Chrome puis habillé
(cadre téléphone / fenêtre navigateur) sur fond crème avec la frise bogolan discrète.

## Contenu

| Fichier | Format | Usage |
|---|---|---|
| `01-accueil-mobile-et-web.png` | 1920×1180 | Duo mobile + web — présentation principale |
| `02-transactions-mobile-et-web.png` | 1920×1180 | Duo mobile + web |
| `03-budget-mobile-et-web.png` | 1920×1180 | Duo mobile + web |
| `04-analyses-mobile-et-web.png` | 1920×1180 | Duo mobile + web |
| `05-epargne-mobile-et-web.png` | 1920×1180 | Duo mobile + web |
| `06-portefeuilles-mobile-et-web.png` | 1920×1180 | Duo mobile + web |
| `07-planche-mobile.png` | 1820×~1650 | 6 écrans mobiles en grille |
| `08-planche-web.png` | 1860×~1600 | 4 écrans web en grille |
| `09-banniere.png` | 1920×1080 | Bannière 16:9 — réseaux sociaux, en-tête de page |
| `10-mobile-trio.png` | 1700×~970 | 3 téléphones côte à côte — accueil, budget, épargne |

`bruts/` contient les captures non habillées (16 fichiers, mobile 390×844 et desktop
1440×900). Ce dossier est ignoré par git : il se régénère.

## Régénérer

```bash
# 1. serveur local (racine du projet)
python3 -m http.server 5173

# 2. captures réelles des écrans
npm install --no-save puppeteer     # une fois
node tools/mockups.js 5173          # → mockups/bruts/

# 3. habillage
python3 tools/make-mockups.py       # → mockups/*.png
```

`tools/mockups.js` contourne l'authentification (`window.__isTest`) et coupe tout
appel réseau externe : les captures sont locales, reproductibles et ne touchent
jamais la base Supabase.

## Charte respectée

- Palette de la marque : `#123C32`, `#1E5A4A`, `#D98B39`, `#E7B84B`, `#A94A32`, fond `#F5EFE3`
- Typographie des mockups : DejaVu Sans (les captures gardent la police de l'app)
- Motif bogolan en frise haute uniquement, à faible opacité — jamais sur le contenu
- Le nom affiché est « Awa », jeu de données de démonstration

## Note

Les emojis de l'interface (🏠💸💰…) apparaissent en glyphes monochromes dans les
captures : le serveur de capture n'a pas la police Noto Color Emoji. Sur un
vrai appareil ils sont en couleur. Ajouter `fonts-noto-color-emoji` sur la
machine de capture règle le rendu.
