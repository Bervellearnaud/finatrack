#!/usr/bin/env node
/* ==========================================================================
   FinaTrack CI — tools/screenshots.js
   Captures d'écran réelles de l'application sur un profil de téléphone,
   pour vérifier visuellement l'adaptation mobile (rendu, zones sûres,
   navigation basse, fenêtres, mode hors ligne).

   Prérequis :
       npm install --no-save puppeteer
       python3 -m http.server 5173        # serveur local dans le dossier du projet

   Usage :
       node tools/screenshots.js [port]

   Produit les images dans screens/ :
       mobile-01-dashboard.png … mobile-06-parametres.png
       mobile-07-menu-ajout.png, mobile-08-vocal.png, mobile-09-hors-ligne.png
       mobile-10-petit-ecran.png (320 px), mobile-11-tablette.png (768 px)
   ========================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");

let puppeteer;
try {
    puppeteer = require("puppeteer");
} catch (e) {
    console.error("Puppeteer est requis : npm install --no-save puppeteer");
    process.exit(1);
}

const PORT = process.argv[2] || "5173";
const BASE = "http://localhost:" + PORT;
const OUT = path.join(__dirname, "..", "screens");

const IPHONE = {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
        "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
};

const SMALL = Object.assign({}, IPHONE, { width: 320, height: 568, deviceScaleFactor: 2 });
const TABLET = {
    width: 768,
    height: 1024,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
        "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
};

const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

/** Bilan de la vérification : les échecs font sortir le script en erreur. */
const failures = [];
function record(ok, label, detail) {
    if (!ok) failures.push(label + (detail ? " — " + detail : ""));
}

/**
 * Cadre un élément sur l'écran et attend la fin du défilement.
 * Le défilement « fluide » du navigateur prend un temps variable : on le
 * désactive pour la capture puis on attend que la position se stabilise.
 * @returns {Promise<number>} la position verticale atteinte
 */
async function scrollToCard(page, selector) {
    /* Cadrer un élément demande parfois deux tentatives : la fermeture d'une
       fenêtre restaure la position qu'occupait la page à son ouverture, ce qui
       peut ramener la vue en haut juste après notre défilement. On refait donc
       le geste tant que le cadrage n'est pas obtenu (3 essais au maximum). */
    const cadre = function (sel) {
        const el = document.querySelector(sel);
        if (!el) return null;
        const html = document.documentElement;
        const ancien = html.style.scrollBehavior;
        html.style.scrollBehavior = "auto";
        const y = Math.max(0, Math.round(el.getBoundingClientRect().top + (window.scrollY || 0) - 8));
        window.scrollTo(0, y);
        html.style.scrollBehavior = ancien;
        return { demande: y, position: Math.round(el.getBoundingClientRect().top) };
    };

    let resultat = { demande: -1, position: -9999 };
    for (let essai = 0; essai < 3; essai++) {
        resultat = await page.evaluate(cadre, selector) || resultat;
        /* On laisse le temps aux éventuels repositionnements, puis on relit */
        await sleep(450);
        let stabilise = -9999;
        for (let i = 0; i < 6; i++) {
            const courant = await page.evaluate(function (sel) {
                const el = document.querySelector(sel);
                return el ? Math.round(el.getBoundingClientRect().top) : -9999;
            }, selector);
            if (courant === stabilise) break;
            stabilise = courant;
            await sleep(150);
        }
        resultat.position = stabilise;
        if (Math.abs(stabilise) <= 24) break;
    }

    if (process.env.FINATRACK_DEBUG_SCROLL) {
        console.log("     [cadrage] " + JSON.stringify(resultat));
    }
    return resultat;
}

/** Même chose, mais imprime aussi les réussites (contrôles de lisibilité). */
function report(ok, label, detail) {
    console.log("  " + (ok ? "✓" : "✗") + " " + label + (detail ? " — " + detail : ""));
    if (!ok) failures.push(label + (detail ? " — " + detail : ""));
}

/** Prépare la session : données de démonstration, fenêtres fermées. */
async function prepare(page) {
    await page.evaluate(function () {
        document.querySelectorAll(".modal-panel .icon-btn").forEach(function (b) { b.click(); });
        document.querySelectorAll(".modal-overlay").forEach(function (o) { o.click(); });
    });
    await sleep(300);
    await page.evaluate(function () {
        window.localStorage.setItem("finatrack_settings", JSON.stringify({ demoLoaded: true, userName: "Awa", currency: "FCFA" }));
        if (window.FT.data.getExpenses().length === 0) window.FT.app.loadDemoData();
        window.FT.utils.closeAllModals();
    });
    await sleep(500);
}

async function shot(page, name, options) {
    const opts = options || {};
    /* `keepScroll` : on garde la position courante (capture d'une section
       précise, comme la carte des portefeuilles). */
    if (!opts.full && !opts.keepScroll) {
        await page.evaluate(function () { window.scrollTo(0, 0); });
        await sleep(160);
    }
    await page.screenshot({
        path: path.join(OUT, name + ".png"),
        fullPage: !!opts.full
    });
    const stats = fs.statSync(path.join(OUT, name + ".png"));
    console.log("  ✓ " + name + ".png  (" + (stats.size / 1024).toFixed(0) + " Ko" + (opts.full ? ", page entière" : "") + ")");
}

/**
 * Vérifie qu'une fenêtre modale est réellement visible dans le navigateur
 * (classe `is-open`, panneau ancré en bas de l'écran). Un simple contrôle du
 * DOM ne suffirait pas : display:none laisserait l'élément présent mais invisible.
 */
async function checkModal(page, label) {
    const report = await page.evaluate(function () {
        const modal = document.querySelector(".modal");
        const panel = document.querySelector(".modal-panel");
        if (!modal || !panel) return { present: false };
        const rect = panel.getBoundingClientRect();
        const style = window.getComputedStyle(modal);
        const panelStyle = window.getComputedStyle(panel);
        return {
            present: true,
            display: style.display,
            visible: style.display !== "none" && style.visibility !== "hidden",
            panelHeight: Math.round(rect.height),
            panelWidth: Math.round(rect.width),
            anchoredBottom: Math.abs(rect.bottom - window.innerHeight) < 4,
            insideViewport: rect.top > -2 && rect.bottom <= window.innerHeight + 2,
            opacity: parseFloat(panelStyle.opacity),
            interactive: panel.querySelectorAll("button, input, select").length
        };
    });

    const ok = report.present && report.visible && report.panelHeight > 120 &&
        report.panelWidth > 200 && report.insideViewport && report.interactive > 0;
    record(ok, "Fenêtre affichée : " + label, JSON.stringify(report));
    console.log("  " + (ok ? "✓" : "✗") + " " + label + " — visible " +
        report.panelWidth + "×" + report.panelHeight + "px, " + report.interactive + " commande(s)" +
        (report.anchoredBottom ? ", ancrée en bas" : ""));
    return ok;
}

/** Contrôle automatique de l'absence de défilement horizontal. */
async function checkLayout(page, label, deviceWidth) {
    const report = await page.evaluate(function (deviceWidth) {
        const doc = document.documentElement;
        const reference = deviceWidth || window.innerWidth;
        const overflowing = [];
        document.querySelectorAll("main.page *").forEach(function (node) {
            const rect = node.getBoundingClientRect();
            if (rect.width === 0) return;
            /* Ignore ce qui vit dans un conteneur défilable horizontalement
               (les sélecteurs de période, par exemple, défilent volontairement) */
            let parent = node.parentElement;
            let scrollable = false;
            while (parent) {
                const overflowX = window.getComputedStyle(parent).overflowX;
                if (overflowX === "auto" || overflowX === "scroll") { scrollable = true; break; }
                parent = parent.parentElement;
            }
            if (scrollable) return;
            if (rect.right > reference + 1) {
                overflowing.push((String(node.className) || node.tagName) + " → " + Math.round(rect.right) + "px (réf. " + reference + ")");
            }
        });
        /* Éléments interactifs trop petits pour un doigt */
        const small = [];
        document.querySelectorAll("button, a[href], .tx, .chip").forEach(function (node) {
            const rect = node.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            if (rect.height < 32 && node.offsetParent !== null) {
                small.push(node.tagName.toLowerCase() + "." + (node.className || "").split(" ")[0] + " (" + Math.round(rect.height) + "px)");
            }
        });
        return {
            device: reference,
            horizontalScroll: window.innerWidth > reference + 1,
            scrollWidth: doc.scrollWidth,
            viewport: window.innerWidth,
            overflowing: overflowing.slice(0, 5),
            smallTargets: small.slice(0, 6)
        };
    });

    const ok = !report.horizontalScroll && !report.overflowing.length;
    record(ok, label, "débordements : " + report.overflowing.join(" | "));
    console.log("  " + (ok ? "✓" : "✗") + " " + label + " — appareil " + report.device +
        "px / fenêtre " + report.viewport + "px / contenu " + report.scrollWidth + "px" +
        (report.overflowing.length ? "\n      débordements : " + report.overflowing.join(" | ") : "") +
        (report.smallTargets.length ? "\n      cibles < 32px : " + report.smallTargets.join(" | ") : ""));
    return ok;
}

(async function main() {
    fs.mkdirSync(OUT, { recursive: true });

    const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--allow-file-access-from-files"]
    });

    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", function (e) { errors.push("pageerror : " + e.message); });
    page.on("console", function (msg) {
        if (msg.type() === "error") errors.push("console : " + msg.text());
    });

    /* ---------- Téléphone 390 × 844 ---------- */
    console.log("\n📱 Téléphone (390 × 844)");
    await page.setViewport(IPHONE);
    await page.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(1000);              // laisse passer la fenêtre de bienvenue
    await prepare(page);

    await shot(page, "mobile-01-dashboard");
    const layoutOk = await checkLayout(page, "Tableau de bord", IPHONE.width);
    record(layoutOk, "Mise en page du tableau de bord");

    /* La page doit s'ouvrir en haut */
    const topOnLoad = await page.evaluate(function () { return Math.round(window.scrollY); });
    record(topOnLoad === 0, "Ouverture en haut de page", "scrollY = " + topOnLoad);
    console.log("  " + (topOnLoad === 0 ? "✓" : "✗") + " Ouverture en haut de page (scrollY = " + topOnLoad + ")");

    /* ---------- Confort de lecture : la lisibilité, mesurée ---------- */
    await page.goto(BASE + "/pages/settings.html", { waitUntil: "load" });
    await prepare(page);
    /* Le « garde-fou » anti-saut de défilement replace la page en haut pendant
       les deux premières secondes. On le laisse passer, puis on simule un geste
       de l'utilisateur (molette = doigt) avant de cadrer la carte à montrer. */
    await sleep(1500);
    /* Un vrai appui (et non un événement souris, ignoré par un navigateur
       tactile) : c'est ce qui indique à l'application que l'utilisateur est
       présent et lève son garde-fou anti-saut de défilement. */
    await page.touchscreen.tap(200, 500);
    await sleep(200);

    /* On écarte le bandeau « nouvelle version » du service worker avant la
       capture : il masquerait la carte qu'on veut montrer. */
    await page.evaluate(function () {
        Array.prototype.slice.call(document.querySelectorAll(".toast .icon-btn, .toast button"))
            .forEach(function (b) { b.click(); });
    });
    await sleep(300);
    const cadrage = await scrollToCard(page, "#settingsReading");
    report(Math.abs(cadrage.position) <= 24, "La carte « Confort de lecture » est bien cadrée dans la capture",
        "haut de la carte à " + cadrage.position + " px du haut de l'écran (demandé : " + cadrage.demande + ")");

    const lecture = await page.evaluate(function () {
        const card = document.querySelector("#settingsReading");
        if (!card) return { present: false };
        const petits = Array.prototype.slice.call(document.querySelectorAll("body *")).filter(function (el) {
            if (!el.textContent || !el.textContent.trim()) return false;
            if (el.children.length) return false;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return false;
            if (el.closest(".sr-only, [aria-hidden='true']")) return false;
            return parseFloat(getComputedStyle(el).fontSize) < 13;
        });
        return {
            present: true,
            choix: card.querySelectorAll(".text-size-choice").length,
            actif: (card.querySelector(".text-size-choice.is-active") || {}).textContent,
            textesSous13px: petits.length,
            exemplePetit: petits.slice(0, 3).map(function (el) { return Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10 + "px « " + el.textContent.trim().slice(0, 22) + " »"; }),
            debordement: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
    });
    report(lecture.present, "Carte « Confort de lecture » présente dans les Paramètres");
    report(lecture.choix === 3, "Trois niveaux de lecture proposés", String(lecture.choix));
    report(lecture.textesSous13px === 0, "Aucun texte sous 13 px sur la page Paramètres",
        lecture.textesSous13px + " élément(s) : " + (lecture.exemplePetit || []).join(" · "));
    await sleep(250);
    await shot(page, "lisible-01-confort-lecture", { keepScroll: true });

    /* Le niveau « Très grande » doit tenir sur un écran de 320 px */
    await page.setViewport(SMALL);
    await page.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(900);
    await prepare(page);
    await page.evaluate(function () { window.FT.utils.applyTextSize("tres-grand", true); });
    await sleep(500);
    const grand = await page.evaluate(function () {
        return {
            racine: parseFloat(getComputedStyle(document.documentElement).fontSize),
            debordement: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            horsEcran: Array.prototype.slice.call(document.querySelectorAll("body *")).filter(function (el) {
                const r = el.getBoundingClientRect();
                if (r.width === 0) return false;
                if (el.closest(".bottom-nav, .fab-desktop, .toast-host, .modal")) return false;
                return r.right > window.innerWidth + 2;
            }).length
        };
    });
    report(grand.racine >= 20, "Texte « Très grande » : racine à " + grand.racine + " px");
    report(grand.debordement <= 0, "Très grande police sans débordement à 320 px", grand.debordement + " px");
    report(grand.horsEcran === 0, "Aucun élément hors écran en très grande police", grand.horsEcran + " élément(s)");
    await shot(page, "lisible-02-tres-grand-320");
    await page.evaluate(function () { window.FT.utils.applyTextSize("normal", true); });
    await page.setViewport(IPHONE);
    await sleep(300);

    /* ---------- Portefeuilles : soldes par moyen de paiement ---------- */
    await page.evaluate(function () { document.querySelector("#dashWallets").closest("section").scrollIntoView({ block: "start" }); });
    await sleep(400);
    await shot(page, "wallet-01-mobile", { keepScroll: true });
    const wallets = await page.evaluate(function () {
        const host = document.querySelector("#dashWallets");
        const tiles = Array.prototype.slice.call(host.querySelectorAll(".wallet-tile"));
        const methodes = window.FT.utils.PAYMENT_METHODS.length;
        return {
            methodes: methodes,
            tuiles: tiles.length,
            vides: tiles.filter(function (t) { return t.classList.contains("is-empty"); }).length,
            coupees: tiles.filter(function (t) {
                const n = t.querySelector(".wallet-name");
                return n.scrollWidth > n.clientWidth + 1;
            }).length,
            total: host.querySelector(".wallet-total-value").textContent,
            debordement: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
    });
    report(wallets.tuiles === wallets.methodes, "Une tuile par moyen de paiement",
        wallets.tuiles + " / " + wallets.methodes);
    report(wallets.coupees === 0, "Aucun nom de portefeuille tronqué", wallets.coupees + " tronqué(s)");
    report(/FCFA/.test(wallets.total), "Total disponible affiché", wallets.total);
    report(wallets.debordement <= 0, "Aucun débordement horizontal sur les portefeuilles",
        wallets.debordement + " px");

    /* Fenêtre d'ajustement des soldes */
    await page.evaluate(function () {
        /* Bouton d'en-tête de la carte « Mes portefeuilles » */
        document.querySelector('[data-action="edit-wallets"]').click();
    });
    await sleep(450);
    await checkModal(page, "Fenêtre d'ajustement des soldes de départ");
    const walletForm = await page.evaluate(function () {
        const panel = document.querySelector(".modal-panel");
        const submit = Array.prototype.slice.call(panel.querySelectorAll("button"))
            .filter(function (b) { return /Enregistrer/.test(b.textContent); })[0];
        panel.scrollTop = panel.scrollHeight;
        const r = submit.getBoundingClientRect();
        const p = panel.getBoundingClientRect();
        return {
            champs: document.querySelectorAll(".wallet-form-row .input").length,
            methodes: window.FT.utils.PAYMENT_METHODS.length,
            atteignable: r.top >= p.top - 1 && r.bottom <= p.bottom + 1 && r.height > 30
        };
    });
    report(walletForm.champs === walletForm.methodes, "Un champ par moyen de paiement",
        walletForm.champs + " / " + walletForm.methodes);
    report(walletForm.atteignable, "Bouton d'enregistrement atteignable après défilement");
    await shot(page, "wallet-02-formulaire");
    await page.evaluate(function () { window.FT.utils.closeAllModals(); });
    await sleep(400);


    /* Menu « Ajouter » depuis le bouton + central */
    await page.evaluate(function () { document.querySelector('[data-action="open-add-menu"]').click(); });
    await sleep(450);
    await checkModal(page, "Menu « Ajouter » (bouton + central)");
    await shot(page, "mobile-07-menu-ajout");
    await page.evaluate(function () { window.FT.utils.closeAllModals(); });
    await sleep(400);

    /* Formulaire de dépense complet */
    await page.evaluate(function () { window.FT.app.openExpenseForm(); });
    await sleep(400);
    await checkModal(page, "Formulaire d'ajout de dépense");
    await shot(page, "mobile-06-depense");
    await page.evaluate(function () { window.FT.utils.closeAllModals(); });
    await sleep(400);

    /* Ajout rapide */
    await page.evaluate(function () { window.FT.app.openQuickAdd(); });
    await sleep(400);
    await checkModal(page, "Ajout rapide (montant + catégorie)");
    await shot(page, "mobile-07b-ajout-rapide");
    await page.evaluate(function () { window.FT.utils.closeAllModals(); });
    await sleep(400);

    /* Interface vocale + détection d'une phrase */
    await page.evaluate(function () { window.FT.voice.open(); });
    await sleep(600);
    await page.evaluate(function () {
        const input = document.querySelector("#voiceManualInput");
        input.value = "J'ai dépensé 2 000 francs pour le taxi aujourd'hui.";
        input.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await sleep(500);
    await checkModal(page, "Interface vocale");
    const detection = await page.evaluate(function () {
        const card = document.querySelector("#voiceConfirmCard");
        return card ? card.textContent : "";
    });
    const detected = /2 000 FCFA/.test(detection) && /Transport/.test(detection) && /Taxi/.test(detection);
    record(detected, "Détection vocale affichée", detection.slice(0, 120));
    console.log("  " + (detected ? "✓" : "✗") + " Détection vocale : montant, catégorie et description affichés");
    await shot(page, "mobile-08-vocal");
    await page.evaluate(function () { window.FT.utils.closeAllModals(); });
    await sleep(400);

    /* Suppression d'une transaction : confirmation visible */
    await page.evaluate(function () {
        const row = document.querySelector("#dashRecent .tx .icon-btn.danger");
        if (row) row.click();
    });
    await sleep(400);
    await checkModal(page, "Confirmation de suppression");
    await shot(page, "mobile-12-confirmation");
    await page.evaluate(function () {
        const cancel = Array.prototype.filter.call(
            document.querySelectorAll(".modal button"),
            function (b) { return /Annuler/.test(b.textContent); }
        )[0];
        if (cancel) cancel.click();
    });
    await sleep(450);

    /* Écran Transactions */
    await page.goto(BASE + "/pages/transactions.html", { waitUntil: "load" });
    await sleep(700);
    await prepare(page);
    await shot(page, "mobile-02-transactions");
    await checkLayout(page, "Transactions", IPHONE.width);

    /* Saisie dans la recherche + clavier virtuel masqué */
    await page.evaluate(function () {
        const search = document.querySelector("#txSearch");
        search.value = "transport";
        search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(500);
    await shot(page, "mobile-02b-recherche");

    /* Écran Revenus */
    await page.goto(BASE + "/pages/incomes.html", { waitUntil: "load" });
    await sleep(700);
    await prepare(page);
    await shot(page, "mobile-13-revenus");
    await checkLayout(page, "Revenus", IPHONE.width);

    /* Écran Budget */
    await page.goto(BASE + "/pages/budget.html", { waitUntil: "load" });
    await sleep(700);
    await prepare(page);
    await shot(page, "mobile-03-budget");
    await checkLayout(page, "Budget", IPHONE.width);

    /* Écran Analyses */
    await page.goto(BASE + "/pages/analysis.html", { waitUntil: "load" });
    await sleep(900);
    await prepare(page);
    await shot(page, "mobile-04-analyses");
    await checkLayout(page, "Analyses", IPHONE.width);

    /* Écran Paramètres */
    await page.goto(BASE + "/pages/settings.html", { waitUntil: "load" });
    await sleep(700);
    await prepare(page);
    await shot(page, "mobile-05-parametres");
    await checkLayout(page, "Paramètres", IPHONE.width);

    /* Mode hors ligne */
    await page.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(800);
    await prepare(page);
    await page.setOfflineMode(true);
    await page.evaluate(function () { window.dispatchEvent(new Event("offline")); });
    await sleep(500);
    await shot(page, "mobile-09-hors-ligne");
    await page.setOfflineMode(false);

    /* ---------- Petit téléphone 320 px ---------- */
    console.log("\n📱 Petit téléphone (320 × 568)");
    await page.setViewport(SMALL);
    await page.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(900);
    await prepare(page);
    await shot(page, "mobile-10-petit-ecran");
    await checkLayout(page, "Tableau de bord 320 px", SMALL.width);

    await page.goto(BASE + "/pages/transactions.html", { waitUntil: "load" });
    await sleep(800);
    await prepare(page);
    await checkLayout(page, "Transactions 320 px", SMALL.width);

    /* ---------- Tablette 768 px ---------- */
    console.log("\n💻 Tablette (768 × 1024)");
    await page.setViewport(TABLET);
    await page.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(900);
    await prepare(page);
    await shot(page, "mobile-11-tablette");
    await checkLayout(page, "Tableau de bord tablette", TABLET.width);

    /* ---------- Rapport ---------- */
    console.log("\n" + "─".repeat(60));
    if (errors.length) {
        console.log("Erreurs JavaScript détectées :");
        errors.slice(0, 10).forEach(function (e) { console.log("  ✗ " + e); });
    } else {
        console.log("✓ Aucune erreur JavaScript sur l'ensemble du parcours");
    }
    if (failures.length) {
        console.log("\nPoints à corriger :");
        failures.forEach(function (f) { console.log("  ✗ " + f); });
    } else {
        console.log("✓ Mise en page et fenêtres conformes sur tous les formats testés");
    }
    console.log("Captures enregistrées dans : " + path.relative(path.join(__dirname, ".."), OUT));
    console.log("─".repeat(60));

    await browser.close();
    process.exit(errors.length || failures.length ? 1 : 0);
})();
