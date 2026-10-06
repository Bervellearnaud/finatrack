#!/usr/bin/env node
/* ==========================================================================
   FinaTrack CI — tools/check-deploy.js
   Vérifications de déploiement (Netlify / Vercel / GitHub Pages).

   Le script contrôle la configuration (netlify.toml, package.json,
   .gitignore), puis exécute réellement « npm run build » et inspecte le
   dossier dist/ obtenu — exactement ce que Netlify publiera.

   Utilisation :
       npm run deploy:check       (ou : node tools/check-deploy.js)

   Code de sortie : 0 si tout est vert, 1 sinon.
   ========================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

/* --------------------------------------------------------------------------
   Mini framework (même présentation que tests/smoke.js)
   -------------------------------------------------------------------------- */
let passed = 0, failed = 0;
const failures = [];

function check(label, condition, detail) {
    if (condition) {
        passed++;
        console.log("  ✓ " + label);
    } else {
        failed++;
        failures.push(label + (detail ? " → " + detail : ""));
        console.log("  ✗ " + label + (detail ? "\n      " + detail : ""));
    }
}

function read(rel) {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
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

const PAGES = ["index.html", "pages/transactions.html", "pages/incomes.html",
    "pages/budget.html", "pages/analysis.html", "pages/settings.html", "pages/login.html"];

console.log("\nFinaTrack CI — vérifications de déploiement");
console.log("─".repeat(58));

/* --------------------------------------------------------------------------
   1. netlify.toml
   -------------------------------------------------------------------------- */
console.log("\n1. Configuration Netlify (netlify.toml)");

const hasToml = fs.existsSync(path.join(ROOT, "netlify.toml"));
check("netlify.toml présent à la racine du dépôt", hasToml);

const toml = hasToml ? read("netlify.toml") : "";
check("Publish directory = « dist »", /publish\s*=\s*"dist"/.test(toml));
check("Build command = « npm run build »", /command\s*=\s*"npm run build"/.test(toml));
check("Service worker jamais mis en cache longuement",
    /Cache-Control\s*=\s*"public, max-age=0, must-revalidate"/.test(toml));
check("Version de Node fixée pour le build", /NODE_VERSION\s*=\s*"2[0-9]"/.test(toml));
check("Téléchargement de Chromium évité sur Netlify (build rapide)",
    /PUPPETEER_SKIP_DOWNLOAD\s*=\s*"true"/.test(toml));
check("En-têtes de sécurité déclarés",
    /X-Content-Type-Options/.test(toml) && /Permissions-Policy/.test(toml));

/* --------------------------------------------------------------------------
   2. Dépôt et scripts
   -------------------------------------------------------------------------- */
console.log("\n2. Dépôt et scripts");

const gitignorePath = path.join(ROOT, ".gitignore");
const gitignore = fs.existsSync(gitignorePath) ? read(".gitignore") : "";
check(".gitignore présent", fs.existsSync(gitignorePath));
check("dist/ ignoré par git (produit du build)", /^dist\/?$/m.test(gitignore));
check("node_modules/ ignoré par git", /^node_modules\/?$/m.test(gitignore));

const pkg = JSON.parse(read("package.json"));
check("script « build » = build de déploiement",
    (pkg.scripts.build || "").indexOf("tools/build-static.js") !== -1,
    pkg.scripts.build);
check("script « deploy:check » disponible", !!pkg.scripts["deploy:check"]);
check("tools/build-static.js présent", fs.existsSync(path.join(ROOT, "tools/build-static.js")));

/* --------------------------------------------------------------------------
   3. Build réel
   -------------------------------------------------------------------------- */
console.log("\n3. Exécution du build de déploiement");

let buildOk = true;
let buildLog = "";
try {
    buildLog = execFileSync(process.execPath, [path.join(ROOT, "tools", "build-static.js")],
        { cwd: ROOT, encoding: "utf8" });
} catch (err) {
    buildOk = false;
    buildLog = String(err.stdout || "") + String(err.stderr || err.message || "");
}
check("« npm run build » se termine sans erreur", buildOk,
    buildOk ? "" : buildLog.trim().split("\n").slice(-3).join(" | "));

check("dist/index.html produit", fs.existsSync(path.join(DIST, "index.html")));
check("dist/ contient les 6 pages",
    PAGES.filter(function (p) { return p !== "index.html"; })
        .every(function (p) { return fs.existsSync(path.join(DIST, p)); }),
    "pages manquantes");

const css = fs.readdirSync(path.join(DIST, "css")).filter(function (f) { return f.endsWith(".css"); });
check("dist/css : 3 feuilles de style", css.length === 3, css.join(", "));

const JS_MODULES = ["utils", "storage", "config", "auth", "supabase-sync", "supabase-adapter", "expenses", "incomes", "transactions", "payments",
    "budget", "dashboard", "analysis", "charts", "voiceExpense", "mobile", "app"];
const jsMissing = JS_MODULES.filter(function (m) {
    return !fs.existsSync(path.join(DIST, "js", m + ".js"));
});
check("dist/js : les 17 modules sont présents", jsMissing.length === 0, jsMissing.join(", "));
check("dist/js/vendor : Chart.js embarqué (aucun CDN)",
    fs.existsSync(path.join(DIST, "js", "vendor", "chart.umd.min.js")));

check("dist/ : manifeste et service worker",
    fs.existsSync(path.join(DIST, "manifest.webmanifest")) && fs.existsSync(path.join(DIST, "sw.js")));

const icons = fs.readdirSync(path.join(DIST, "assets", "icons")).filter(function (f) { return f.endsWith(".png"); });
check("dist/assets/icons : 5 icônes", icons.length === 5, icons.join(", "));

const forbidden = ["tests", "tools", "screens", "preview", "node_modules", ".git"]
    .filter(function (d) { return fs.existsSync(path.join(DIST, d)); });
check("dist/ ne contient aucun dossier de travail", forbidden.length === 0, forbidden.join(", "));

const files = walk(DIST);
const size = files.reduce(function (s, f) { return s + fs.statSync(f).size; }, 0);
check("poids déployé raisonnable (< 5 Mo)", size < 5 * 1024 * 1024,
    Math.round(size / 1024) + " Ko");
check("poids déployé suffisant (site complet > 200 Ko)", size > 200 * 1024,
    Math.round(size / 1024) + " Ko");

/* --------------------------------------------------------------------------
   4. Contenu déployable
   -------------------------------------------------------------------------- */
console.log("\n4. Contenu réellement publié");

const external = [];
PAGES.forEach(function (rel) {
    const html = read(rel);
    const found = html.match(/(?:src|href)="https?:\/\/[^"]+"/g) || [];
    if (found.length) external.push(rel + " → " + found.length);
});
check("Aucune ressource externe dans les 7 pages (site autonome)", external.length === 0,
    external.join(" ; "));

const SW = read("sw.js");
const precacheBlock = SW.match(/const PRECACHE = \[([\s\S]*?)\];/);
const precache = precacheBlock
    ? (precacheBlock[1].match(/"(\.\/[^"]*)"/g) || []).map(function (s) {
        return s.slice(1, -1).replace(/^\.\//, "") || "index.html";
    })
    : [];

check("sw.js : la liste PRECACHE est lisible", precache.length > 0);
check("sw.js : payments.js précaché (totaux par moyen de paiement hors ligne)",
    precache.indexOf("js/payments.js") !== -1);
check("sw.js : nom de cache versionné",
    /const VERSION\s*=\s*"finatrack-v\d+\.\d+\.\d+"/.test(SW));

const precacheAbsent = precache.filter(function (rel) {
    return !fs.existsSync(path.join(DIST, rel));
});
check("sw.js : toutes les ressources précachées existent dans dist/",
    precacheAbsent.length === 0, precacheAbsent.join(", "));

/* Tous les scripts chargés par les pages sont-ils précachés ? */
const loadedScripts = new Set();
PAGES.forEach(function (rel) {
    const html = read(rel);
    (html.match(/src="((?:\.\.\/)?js\/[^"]+)"/g) || []).forEach(function (m) {
        loadedScripts.add(m.replace(/^src="/, "").replace(/"$/, "").replace(/^\.\.\//, ""));
    });
});
const notPrecached = Array.from(loadedScripts).filter(function (s) {
    return precache.indexOf(s) === -1;
});
check("Mode hors ligne complet : tous les scripts des pages sont précachés",
    notPrecached.length === 0,
    notPrecached.join(", ") + " (" + loadedScripts.size + " scripts chargés)");

/* --------------------------------------------------------------------------
   5. Autres hébergeurs (Vercel, GitHub Pages)
   -------------------------------------------------------------------------- */
console.log("\n5. Autres hébergeurs (Vercel, GitHub Pages)");

const hasVercel = fs.existsSync(path.join(ROOT, "vercel.json"));
let vercel = null;
let vercelValid = false;
if (hasVercel) {
    try {
        vercel = JSON.parse(read("vercel.json"));
        vercelValid = true;
    } catch (err) {
        vercelValid = false;
    }
}
check("vercel.json présent et JSON valide", hasVercel && vercelValid,
    hasVercel ? "JSON illisible" : "fichier absent");

if (vercel) {
    check("Vercel : build « npm run build » et sortie « dist »",
        vercel.buildCommand === "npm run build" && vercel.outputDirectory === "dist",
        "buildCommand=" + vercel.buildCommand + " · outputDirectory=" + vercel.outputDirectory);

    const vHeaders = JSON.stringify(vercel.headers || []);
    check("Vercel : service worker sans cache long et en-têtes de sécurité",
        /sw\.js/.test(vHeaders) && /max-age=0, must-revalidate/.test(vHeaders) && /Permissions-Policy/.test(vHeaders));

    check("Vercel : téléchargement de Chromium évité pendant le build",
        !!(vercel.build && vercel.build.env && vercel.build.env.PUPPETEER_SKIP_DOWNLOAD === "true"));
}

check("GitHub Pages : .nojekyll à la racine (dossier publié tel quel)",
    fs.existsSync(path.join(ROOT, ".nojekyll")));
check("GitHub Pages : .nojekyll copié dans dist/", fs.existsSync(path.join(DIST, ".nojekyll")));

const absoluteLinks = [];
PAGES.forEach(function (rel) {
    const found = read(rel).match(/(?:src|href)="\/(?!\/)[^"]*"/g) || [];
    if (found.length) absoluteLinks.push(rel + " → " + found.slice(0, 2).join(", "));
});
check("GitHub Pages : aucun lien absolu (le sous-dossier /depot/ fonctionne)",
    absoluteLinks.length === 0, absoluteLinks.join(" ; "));

check("Guide utilisateur de déploiement (DEPLOIEMENT.md) présent",
    fs.existsSync(path.join(ROOT, "DEPLOIEMENT.md")));

/* --------------------------------------------------------------------------
   Résultat
   -------------------------------------------------------------------------- */
console.log("\n" + "─".repeat(58));
console.log("Vérifications de déploiement : " + passed + " ✓   |   Échecs : " + failed);
if (failed) {
    console.log("\nDétail des échecs :");
    failures.forEach(function (f) { console.log("  • " + f); });
}
console.log("─".repeat(58) + "\n");
process.exit(failed ? 1 : 0);
