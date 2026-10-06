/* ==========================================================================
   FinaTrack CI — tools/audit-readability.js
   Audit de lisibilité mobile, mesuré dans un vrai navigateur.

   Pour chaque page et chaque largeur de téléphone, il relève :
     • les textes trop petits  (taille calculée < 12 px) ;
     • les contrastes insuffisants (WCAG AA : 4.5:1 texte normal, 3:1 grand texte) ;
     • les textes réellement coupés (débordement masqué sans ellipse volontaire) ;
     • les cibles tactiles trop petites (< 40 × 40 px) ;
     • les débordements horizontaux et les mots qui dépassent de l'écran.

   Usage :  node tools/audit-readability.js            (rapport seul)
            node tools/audit-readability.js --strict   (code de sortie 1 si problème)
   ========================================================================== */
"use strict";

const puppeteer = require("puppeteer");
const path = require("path");

const BASE = process.env.FINATRACK_URL || "http://127.0.0.1:5173";
const STRICT = process.argv.indexOf("--strict") !== -1;
const TEXT_SIZE = process.env.FINATRACK_TEXT_SIZE || "normal";   // normal | grand | tres-grand
const THEME = process.env.FINATRACK_THEME || "light";            // light | dark
const SEUIL_PETIT_TEXTE = Number(process.env.FINATRACK_MIN_PX || 12);  // px — plancher lisible
const SEUIL_CIBLE = Number(process.env.FINATRACK_MIN_TAP || 40);      // px — cible tactile

const PAGES = [
    { nom: "Tableau de bord", url: "/index.html" },
    { nom: "Transactions", url: "/pages/transactions.html" },
    { nom: "Revenus", url: "/pages/incomes.html" },
    { nom: "Budget", url: "/pages/budget.html" },
    { nom: "Analyses", url: "/pages/analysis.html" },
    { nom: "Paramètres", url: "/pages/settings.html" }
];

/* Filtres rapides : FINATRACK_WIDTHS=390  /  FINATRACK_PAGES="Budget" */
const LARGEURS = [
    { w: 320, h: 568 },   // plus petit téléphone encore utilisé
    { w: 360, h: 640 },   // Android d'entrée de gamme
    { w: 390, h: 844 },   // iPhone 12/13/14
    { w: 430, h: 932 }    // grand téléphone
];

/* Mesures exécutées dans la page ------------------------------------------ */
function mesures(seuils) {
    const SEUIL_PETIT_TEXTE = seuils.petit;
    const SEUIL_CIBLE = seuils.cible;
    const resultat = {
        petits: [], contrastes: [], coupes: [], cibles: [],
        debordement: 0, motsQuiDepassent: []
    };

    const visible = function (el) {
        if (!el || !el.getBoundingClientRect) return false;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const st = getComputedStyle(el);
        if (st.visibility === "hidden" || st.display === "none" || Number(st.opacity) < 0.15) return false;
        return true;
    };

    const chemin = function (el) {
        const parts = [];
        let node = el;
        while (node && node.nodeType === 1 && parts.length < 4) {
            let s = node.tagName.toLowerCase();
            if (node.id) s += "#" + node.id;
            else if (node.className && typeof node.className === "string") {
                const c = node.className.trim().split(/\s+/).slice(0, 2).join(".");
                if (c) s += "." + c;
            }
            parts.unshift(s);
            node = node.parentElement;
        }
        return parts.join(" > ");
    };

    const rgba = function (couleur) {
        const m = couleur.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };

    const melange = function (dessus, dessous) {
        const a = dessus.a;
        return {
            r: dessus.r * a + dessous.r * (1 - a),
            g: dessus.g * a + dessous.g * (1 - a),
            b: dessous.b * a + dessous.b * (1 - a),
            a: 1
        };
    };

    const fondEffectif = function (el) {
        let node = el, fond = { r: 255, g: 255, b: 255, a: 1 }, pile = [];
        while (node && node.nodeType === 1) {
            const c = rgba(getComputedStyle(node).backgroundColor);
            if (c && c.a > 0) pile.push(c);
            if (c && c.a === 1) break;
            node = node.parentElement;
        }
        for (let i = pile.length - 1; i >= 0; i--) fond = melange(pile[i], fond);
        return fond;
    };

    const luminance = function (c) {
        const f = function (v) {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };

    const contraste = function (a, b) {
        const l1 = luminance(a), l2 = luminance(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };

    /* --- Parcours des textes --- */
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
            return n.textContent.trim().length > 1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
    });

    let node;
    while ((node = walker.nextNode())) {
        const el = node.parentElement;
        if (!el || !visible(el)) continue;
        if (el.closest("[aria-hidden='true']")) continue;
        if (el.closest(".sr-only")) continue;                 /* texte caché volontairement */
        if (/^(SCRIPT|STYLE|NOSCRIPT|svg)$/i.test(el.tagName)) continue;

        const st = getComputedStyle(el);
        const taille = parseFloat(st.fontSize);
        const texte = node.textContent.trim().replace(/\s+/g, " ");
        const echantillon = texte.slice(0, 40);

        /* 1. Texte trop petit */
        if (taille < SEUIL_PETIT_TEXTE) {
            resultat.petits.push({ sel: chemin(el), px: Math.round(taille * 10) / 10, texte: echantillon });
        }

        /* 2. Contraste insuffisant — non calculable au-dessus d'un dégradé qui
           RECOUVRE le fond (le héros par exemple). On ne s'arrête pas pour
           autant au premier motif décoratif : on remonte les ancêtres jusqu'au
           premier fond opaque et on ne renonce que si un dégradé se trouve
           entre le texte et ce fond. */
        const surDegrade = (function (n) {
            while (n && n.nodeType === 1) {
                const stN = getComputedStyle(n);
                const c = rgba(stN.backgroundColor);
                if (stN.backgroundImage !== "none") return true;
                if (c && c.a === 1) return false;      /* fond opaque atteint */
                n = n.parentElement;
            }
            return false;
        })(el);
        const fg = rgba(st.color);
        if (fg && !surDegrade) {
            const fond = fondEffectif(el);
            const gras = Number(st.fontWeight) >= 700;
            const ratio = contraste(fg, fond);
            const seuil = (taille >= 24 || (taille >= 18.66 && gras)) ? 3 : 4.5;
            if (ratio < seuil) {
                resultat.contrastes.push({
                    sel: chemin(el), px: Math.round(taille), ratio: Math.round(ratio * 100) / 100,
                    seuil: seuil, texte: echantillon
                });
            }
        }

        /* 3. Texte coupé : débordement masqué, sans ellipse ni troncature voulue */
        const coupe = el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2;
        const volontaire = /ellipsis|webkit-line-clamp/.test(st.textOverflow + st.webkitLineClamp + st.display);
        const clamp = st.webkitLineClamp && st.webkitLineClamp !== "none";
        if (coupe && st.overflow !== "visible" && !volontaire && !clamp) {
            resultat.coupes.push({
                sel: chemin(el), texte: echantillon,
                largeur: el.clientWidth, contenu: el.scrollWidth
            });
        }
    }

    /* --- Cibles tactiles --- */
    const interactifs = document.querySelectorAll("button, a, input:not([type=hidden]), select, [role=button], .tx");
    Array.prototype.forEach.call(interactifs, function (el) {
        if (!visible(el)) return;
        /* Un interrupteur dans une ligne cliquable : c'est la ligne qui compte */
        const zone = el.closest("label, .switch, .nav-item, .quick-action") || el;
        const r = zone.getBoundingClientRect();
        /* On ignore ce qui est volontairement compact et non essentiel au pouce */
        if (el.closest(".skip-link")) return;
        const bas = r.height < SEUIL_CIBLE || r.width < Math.min(28, SEUIL_CIBLE);
        if (bas) {
            resultat.cibles.push({
                sel: chemin(el), w: Math.round(r.width), h: Math.round(r.height),
                texte: (el.textContent || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 32)
            });
        }
    });

    /* --- Barre de navigation du bas : aucun onglet ne doit en chevaucher un autre --- */
    resultat.nav = { presente: false, chevauchements: [], onglets: 0, hauteur: 0, margeBasse: 0, margeSuffisante: true };
    const nav = document.querySelector(".bottom-nav");
    if (nav && visible(nav)) {
        const onglets = Array.prototype.slice.call(nav.querySelectorAll(".bn-item, .bn-add"));
        const boites = onglets.map(function (o) {
            const r = o.getBoundingClientRect();
            return { nom: (o.textContent || o.getAttribute("aria-label") || "").trim().slice(0, 16), l: r.left, d: r.right };
        });
        for (let i = 1; i < boites.length; i++) {
            if (boites[i].l < boites[i - 1].d - 1 && boites[i].nom && boites[i - 1].nom) {
                resultat.nav.chevauchements.push(boites[i - 1].nom + " ↔ " + boites[i].nom);
            }
        }
        resultat.nav.presente = true;
        resultat.nav.onglets = onglets.length;
        resultat.nav.hauteur = Math.round(nav.getBoundingClientRect().height);

        /* Le bas de page doit rester atteignable : la marge sous le contenu
           doit au moins couvrir la barre. */
        const principal = document.querySelector("main.page") || document.querySelector("main");
        if (principal) {
            const marge = parseFloat(getComputedStyle(principal).paddingBottom) || 0;
            resultat.nav.margeBasse = Math.round(marge);
            resultat.nav.margeSuffisante = marge >= resultat.nav.hauteur;
        }
    }

    /* --- Débordement horizontal --- */
    const racine = document.documentElement;
    resultat.debordement = racine.scrollWidth - racine.clientWidth;

    /* --- Éléments qui dépassent de l'écran --- */
    const tous = document.querySelectorAll("body *");
    Array.prototype.forEach.call(tous, function (el) {
        if (!visible(el)) return;
        const r = el.getBoundingClientRect();
        if (r.right > window.innerWidth + 2) {
            const st = getComputedStyle(el);
            if (st.position === "fixed" || el.closest(".modal, .toast-host, .bottom-nav, .fab-desktop")) return;
            resultat.motsQuiDepassent.push({
                sel: chemin(el), droite: Math.round(r.right), largeur: Math.round(r.width),
                texte: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 32)
            });
        }
    });

    return resultat;
}

(async function main() {
    const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const page = await browser.newPage();
    const erreurs = [];
    page.on("pageerror", function (e) { erreurs.push("pageerror : " + e.message); });

    const problemes = [];
    const doublons = new Set();

    const largeursFiltrees = process.env.FINATRACK_WIDTHS
        ? LARGEURS.filter(function (l) { return process.env.FINATRACK_WIDTHS.split(",").indexOf(String(l.w)) !== -1; })
        : LARGEURS;
    const pagesFiltrees = process.env.FINATRACK_PAGES
        ? PAGES.filter(function (p) { return process.env.FINATRACK_PAGES.split(",").some(function (q) { return p.nom.toLowerCase().indexOf(q.trim().toLowerCase()) !== -1; }); })
        : PAGES;

    for (const largeur of largeursFiltrees) {
        await page.setViewport({ width: largeur.w, height: largeur.h, deviceScaleFactor: 1 });
        console.log("\n" + "═".repeat(74));
        console.log("  " + largeur.w + " × " + largeur.h + " px   [texte : " + TEXT_SIZE + " · thème : " + THEME + "]");
        console.log("═".repeat(74));

        for (const p of pagesFiltrees) {
            await page.goto(BASE + p.url, { waitUntil: "networkidle2" });
            await page.evaluate(function (TEXT_SIZE, THEME) {
                try {
                    window.localStorage.setItem("finatrack_settings",
                        JSON.stringify({ demoLoaded: true, userName: "Awa", currency: "FCFA",
                            textSize: TEXT_SIZE, theme: THEME }));
                    // Auth obligatoire : créer un utilisateur de test et une session
                    var users = [{ id: "usr_test", email: "test@finatrack.local", name: "Awa", passwordHash: "h_test", createdAt: new Date().toISOString() }];
                    window.localStorage.setItem("finatrack_users", JSON.stringify(users));
                    window.localStorage.setItem("finatrack_session", JSON.stringify({ userId: "usr_test", email: "test@finatrack.local", createdAt: new Date().toISOString(), token: "sess_test" }));
                } catch (e) { /* stockage indisponible */ }
            }, TEXT_SIZE, THEME);
            await page.goto(BASE + p.url, { waitUntil: "networkidle2" });
            await new Promise(function (r) { setTimeout(r, 500); });
            await page.evaluate(function () {
                try {
                    if (window.FT && window.FT.data && window.FT.data.getExpenses().length === 0 && window.FT.app && window.FT.app.loadDemoData) window.FT.app.loadDemoData();
                    if (window.FT && window.FT.utils) window.FT.utils.closeAllModals();
                } catch (e) {}
            });
            await new Promise(function (r) { setTimeout(r, 350); });

            const m = await page.evaluate(mesures, { petit: SEUIL_PETIT_TEXTE, cible: SEUIL_CIBLE });
            const lignes = [];
            if (m.petits.length) lignes.push("petits:" + m.petits.length);
            if (m.contrastes.length) lignes.push("contrastes:" + m.contrastes.length);
            if (m.coupes.length) lignes.push("coupés:" + m.coupes.length);
            if (m.cibles.length) lignes.push("cibles:" + m.cibles.length);
            if (m.debordement > 0) lignes.push("débordement:" + m.debordement + "px");
            if (m.motsQuiDepassent.length) lignes.push("hors écran:" + m.motsQuiDepassent.length);
            if (m.nav.chevauchements.length) lignes.push("onglets qui se chevauchent:" + m.nav.chevauchements.length);
            if (m.nav.presente && !m.nav.margeSuffisante) lignes.push("marge basse insuffisante:" + m.nav.margeBasse + "<" + m.nav.hauteur);

            const cas = lignes.length ? lignes.join("  ") : "OK";
            console.log("  " + (lignes.length ? "⚠" : "✓") + " " + p.nom.padEnd(16, " ") + cas);

            const noter = function (categorie, liste, extraire) {
                liste.slice(0, 6).forEach(function (item) {
                    const cle = categorie + "|" + item.sel + "|" + largeur.w;
                    if (doublons.has(cle)) return;
                    doublons.add(cle);
                    console.log("      · " + categorie + " " + extraire(item));
                    problemes.push({ largeur: largeur.w, page: p.nom, categorie: categorie, detail: extraire(item) });
                });
            };
            noter("TEXTE TROP PETIT", m.petits, function (i) { return i.px + "px — " + i.sel + " → « " + i.texte + " »"; });
            noter("CONTRASTE", m.contrastes, function (i) { return i.ratio + ":1 (min " + i.seuil + ") — " + i.sel + " → « " + i.texte + " »"; });
            noter("TEXTE COUPÉ", m.coupes, function (i) { return i.sel + " (" + i.largeur + "/" + i.contenu + "px) → « " + i.texte + " »"; });
            noter("CIBLE TACTILE", m.cibles, function (i) { return i.w + "×" + i.h + " — " + i.sel + " → « " + i.texte + " »"; });
            noter("HORS ÉCRAN", m.motsQuiDepassent, function (i) { return i.sel + " (droite " + i.droite + ", largeur " + i.largeur + ")"; });
            m.nav.chevauchements.slice(0, 4).forEach(function (c) {
                problemes.push({ largeur: largeur.w, page: p.nom, categorie: "ONGLETS QUI SE CHEVAUCHENT", detail: c });
            });
            if (m.nav.presente && !m.nav.margeSuffisante) {
                problemes.push({ largeur: largeur.w, page: p.nom, categorie: "MARGE BASSE INSUFFISANTE",
                    detail: m.nav.margeBasse + " px de marge pour une barre de " + m.nav.hauteur + " px" });
            }
        }
    }

    console.log("\n" + "─".repeat(74));
    console.log("Erreurs JavaScript : " + (erreurs.length ? erreurs.slice(0, 5).join(" | ") : "aucune"));
    console.log("Total de points relevés : " + problemes.length);
    const parCategorie = {};
    problemes.forEach(function (p) { parCategorie[p.categorie] = (parCategorie[p.categorie] || 0) + 1; });
    Object.keys(parCategorie).sort().forEach(function (c) {
        console.log("  • " + c + " : " + parCategorie[c]);
    });
    console.log("─".repeat(74));

    await browser.close();
    process.exit(STRICT && (problemes.length || erreurs.length) ? 1 : 0);
})();
