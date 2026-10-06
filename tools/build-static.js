#!/usr/bin/env node
/* ==========================================================================
   FinaTrack CI — tools/build-static.js
   « Build » de déploiement.

   FinaTrack CI est une application 100 % statique : il n'y a rien à
   compiler. Ce script recopie donc les fichiers réellement servis (HTML,
   CSS, JS, manifeste, service worker, icônes) dans dist/, puis vérifie que
   le dossier est complet et que le service worker ne référence aucune
   ressource absente.

   Utilisation :
       npm run build          (ou : node tools/build-static.js)

   Résultat : dist/ — prêt à publier sur Netlify, Vercel, GitHub Pages,
   Cloudflare Pages, un simple serveur Apache/Nginx…

   Le script n'utilise que la bibliothèque standard de Node : il s'exécute
   aussi bien sur une machine de développement que dans un serveur de build.
   ========================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "dist");

/* --------------------------------------------------------------------------
   Ce qui est publié
   -------------------------------------------------------------------------- */

/* Éléments du site (tous obligatoires) */
const SITE_ENTRIES = [
    "index.html",
    "pages",
    "css",
    "js",
    "assets",
    "manifest.webmanifest",
    "sw.js"
];

/* Copiés seulement s'ils existent */
const OPTIONAL_ENTRIES = ["robots.txt", "favicon.ico", ".nojekyll", "_headers", "_redirects", "js/config.js"];

/* Fichiers indispensables dans dist/ : le build échoue s'il en manque un */
const REQUIRED = [
    "index.html",
    "pages/wallets.html",
    "pages/transactions.html",
    "pages/incomes.html",
    "pages/budget.html",
    "pages/analysis.html",
    "pages/settings.html",
    "pages/login.html",
    "css/style.css",
    "css/components.css",
    "css/responsive.css",
    "js/utils.js",
    "js/storage.js",
    "js/config.js",
    "js/auth.js",
    "js/supabase-sync.js",
    "js/supabase-adapter.js",
    "js/expenses.js",
    "js/incomes.js",
    "js/transactions.js",
    "js/payments.js",
    "js/budget.js",
    "js/dashboard.js",
    "js/analysis.js",
    "js/charts.js",
    "js/voiceExpense.js",
    "js/mobile.js",
    "js/app.js",
    "js/vendor/chart.umd.min.js",
    "manifest.webmanifest",
    "sw.js",
    "assets/icons/icon-32.png",
    "assets/icons/icon-180.png",
    "assets/icons/icon-192.png",
    "assets/icons/icon-512.png",
    "assets/icons/icon-512-maskable.png"
];

/* Fichiers de travail à ne jamais publier */
const IGNORED_NAMES = new Set([".DS_Store", "Thumbs.db", "__pycache__", ".git", ".netlify"]);

/* --------------------------------------------------------------------------
   Outils
   -------------------------------------------------------------------------- */

const problems = [];
const notes = [];

function ok(label) { console.log("  ✔ " + label); }
function warn(label) { notes.push(label); console.log("  ! " + label); }
function fail(label) { problems.push(label); console.log("  ✗ " + label); }

function rmrf(p) {
    fs.rmSync(p, { recursive: true, force: true });
}

function copyEntry(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).sort().forEach(function (name) {
            if (IGNORED_NAMES.has(name)) return;
            copyEntry(path.join(src, name), path.join(dest, name));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

function walk(dir) {
    const files = [];
    fs.readdirSync(dir).sort().forEach(function (name) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) files.push.apply(files, walk(full));
        else files.push(full);
    });
    return files;
}

function humanSize(bytes) {
    if (bytes < 1024) return bytes + " o";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " Ko";
    return (bytes / (1024 * 1024)).toFixed(1).replace(".", ",") + " Mo";
}

function exists(rel) {
    return fs.existsSync(path.join(OUT, rel));
}

/* Ressources déclarées dans le précache du service worker (sw.js) */
function precacheList() {
    const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
    const block = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
    if (!block) return null;
    return (block[1].match(/"(\.\/[^"]*)"/g) || []).map(function (s) {
        return s.slice(1, -1).replace(/^\.\//, "") || "index.html";
    });
}

/* --------------------------------------------------------------------------
   Build
   -------------------------------------------------------------------------- */

console.log("\nFinaTrack CI — build de déploiement");
console.log("─".repeat(58));

/* 1. Copie du site -------------------------------------------------------- */
rmrf(OUT);
fs.mkdirSync(OUT, { recursive: true });

const copied = [];

SITE_ENTRIES.concat(OPTIONAL_ENTRIES).forEach(function (rel) {
    const src = path.join(ROOT, rel);
    const mandatory = SITE_ENTRIES.indexOf(rel) !== -1;

    if (!fs.existsSync(src)) {
        if (mandatory) fail("élément introuvable : " + rel);
        return;
    }
    copyEntry(src, path.join(OUT, rel));
    copied.push(rel);
});

copied.forEach(function (rel) {
    const full = path.join(OUT, rel);
    if (fs.statSync(full).isDirectory()) {
        const n = walk(full).length;
        ok(rel + "/  →  " + n + " fichier" + (n > 1 ? "s" : ""));
    } else {
        ok(rel);
    }
});

/* 1b. Génération de js/config.js depuis les variables d'environnement (Supabase) */
try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
    const outConfig = path.join(OUT, "js", "config.js");
    if (url && key) {
        const content = "window.FT_CONFIG = { SUPABASE_URL: " + JSON.stringify(url) + ", SUPABASE_ANON_KEY: " + JSON.stringify(key) + " };\n";
        fs.mkdirSync(path.join(OUT, "js"), { recursive: true });
        fs.writeFileSync(outConfig, content, "utf8");
        ok("js/config.js généré depuis env vars (Supabase)");
    } else if (!fs.existsSync(outConfig)) {
        // Pas de config — mode local uniquement, on crée un fichier vide pour éviter 404
        fs.mkdirSync(path.join(OUT, "js"), { recursive: true });
        fs.writeFileSync(outConfig, "window.FT_CONFIG = window.FT_CONFIG || {};\n", "utf8");
        ok("js/config.js vide (mode local, Supabase désactivé)");
    }
} catch (e) {
    warn("génération config.js échouée: " + e.message);
}

/* 2. Fichiers indispensables --------------------------------------------- */
const missing = REQUIRED.filter(function (rel) { return !exists(rel); });
if (missing.length) fail("fichiers manquants dans dist/ : " + missing.join(", "));
else ok(REQUIRED.length + " fichiers indispensables présents");

/* 3. Cohérence du service worker ----------------------------------------- */
const precache = precacheList();
if (!precache) {
    fail("liste PRECACHE illisible dans sw.js");
} else {
    const absent = precache.filter(function (rel) { return !exists(rel); });
    if (absent.length) fail("précachés mais absents de dist/ : " + absent.join(", "));
    else ok("service worker : " + precache.length + " ressources précachées, toutes présentes");
}

/* 4. Aucune dépendance externe (l'app doit fonctionner hors ligne) -------- */
const external = [];
walk(OUT).filter(function (f) { return f.endsWith(".html"); }).forEach(function (file) {
    const html = fs.readFileSync(file, "utf8");
    const found = html.match(/(?:src|href)="https?:\/\/[^"]+"/g) || [];
    if (found.length) {
        external.push(path.relative(OUT, file) + " → " + found.join(", "));
    }
});
if (external.length) warn("ressources externes détectées : " + external.join(" ; "));
else ok("aucune ressource externe dans les pages HTML (déployable hors ligne)");

/* 5. Verdict -------------------------------------------------------------- */
const files = walk(OUT);
const totalSize = files.reduce(function (sum, f) { return sum + fs.statSync(f).size; }, 0);

console.log("─".repeat(58));

if (problems.length) {
    console.log("BUILD ÉCHOUÉ — " + problems.length + " problème" + (problems.length > 1 ? "s" : "") + " :");
    problems.forEach(function (p) { console.log("  • " + p); });
    process.exit(1);
}

console.log("dist/ prêt : " + files.length + " fichiers, " + humanSize(totalSize));
console.log("Netlify  : build « npm run build »  ·  publish « dist »  (voir netlify.toml)");
console.log("Contrôle : npm run deploy:check\n");
process.exit(0);
