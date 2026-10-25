#!/usr/bin/env node
/* ==========================================================================
   FinaTrack CI — tools/mockups.js
   Capture les VRAIS écrans de l'application (mobile + desktop) puis les
   habille en mockups : cadre téléphone, fenêtre navigateur, packshot.

   Prérequis :
       npm install --no-save puppeteer
       python3 -m http.server 5173

   Usage : node tools/mockups.js [port]

   Sortie : mockups/bruts/*.png  (captures) et mockups/*.png (habillés)
   ========================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const PORT = process.argv[2] || "5173";
const BASE = "http://127.0.0.1:" + PORT;
const ROOT = path.join(__dirname, "..");
const RAW = path.join(ROOT, "mockups", "bruts");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Écrans : [fichier, url, titre] */
const PAGES = [
    ["dashboard", "/index.html", "Tableau de bord"],
    ["transactions", "/pages/transactions.html", "Transactions"],
    ["revenus", "/pages/incomes.html", "Revenus"],
    ["budget", "/pages/budget.html", "Budget"],
    ["epargne", "/pages/savings.html", "Épargne"],
    ["analyse", "/pages/analysis.html", "Analyse"],
    ["portefeuilles", "/pages/wallets.html", "Portefeuilles"],
    ["parametres", "/pages/settings.html", "Paramètres"],
];

const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 2 };
const MOBILE = {
    width: 390, height: 844, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true,
};

/** Contourne l'authentification pour les captures. */
async function newPage(browser, viewport) {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.evaluateOnNewDocument(function () {
        window.__isTest = true;
        /* Session factice en local : évite la redirection vers login.html
           et coupe le client Supabase (aucune requête réseau pendant la capture). */
        try {
            Object.defineProperty(window, "FT_CONFIG", {
                configurable: true,
                get: function () { return undefined; },
                set: function () {
                    Object.defineProperty(window, "FT_CONFIG", { value: {}, writable: true, configurable: true });
                },
            });
            localStorage.setItem("finatrack_session", JSON.stringify({
                userId: "capture", email: "awa@finatrack.ci", name: "Awa", provider: "local",
            }));
            localStorage.setItem("finatrack_settings", JSON.stringify({
                demoLoaded: true, userName: "Awa", currency: "FCFA", showLocation: false,
            }));
        } catch (e) {}
    });
    /* Coupe tout appel réseau externe : la capture reste locale et rapide. */
    await page.setRequestInterception(true);
    page.on("request", function (req) {
        const u = req.url();
        if (u.indexOf("http://127.0.0.1") === 0 || u.indexOf("http://localhost") === 0 ||
            u.indexOf("data:") === 0 || u.indexOf("blob:") === 0) {
            req.continue();
        } else {
            req.abort();
        }
    });
    return page;
}

async function prepare(page) {
    await page.evaluate(function () {
        try {
            document.querySelectorAll(".modal-panel .icon-btn").forEach(function (b) { b.click(); });
            document.querySelectorAll(".modal-overlay").forEach(function (o) { o.click(); });
        } catch (e) {}
    });
    await sleep(400);
    await page.evaluate(function () {
        try {
            if (window.FT && window.FT.app && window.FT.app.loadDemoData) {
                const has = window.FT.data && window.FT.data.getExpenses && window.FT.data.getExpenses().length;
                if (!has) window.FT.app.loadDemoData();
            }
            if (window.FT && window.FT.utils && window.FT.utils.closeAllModals) window.FT.utils.closeAllModals();
            /* Retire les messages fugaces (toasts) : bruit visuel dans un mockup. */
            document.querySelectorAll(".toast, .toast-container, [class*='toast']").forEach(function (n) { n.remove(); });
        } catch (e) {}
    });
    await sleep(900);
    await page.evaluate(function () { window.scrollTo(0, 0); });
    await sleep(400);
}

async function capture(browser, viewport, suffix) {
    const made = [];
    for (const [name, url, title] of PAGES) {
        const page = await newPage(browser, viewport);
        try {
            await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 30000 });
        } catch (e) {
            console.log("  ! " + name + " : " + e.message);
        }
        await sleep(1200);
        await prepare(page);
        const file = path.join(RAW, name + "-" + suffix + ".png");
        await page.screenshot({ path: file });
        const st = fs.statSync(file);
        console.log("  ✓ " + name + "-" + suffix + ".png  (" + (st.size / 1024).toFixed(0) + " Ko)");
        made.push({ name, title, file, suffix });
        await page.close();
    }
    return made;
}

(async function main() {
    fs.mkdirSync(RAW, { recursive: true });
    const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
    });

    console.log("→ Desktop 1440×900");
    await capture(browser, DESKTOP, "desktop");
    console.log("→ Mobile 390×844");
    await capture(browser, MOBILE, "mobile");

    await browser.close();
    fs.writeFileSync(
        path.join(ROOT, "mockups", "index.json"),
        JSON.stringify(PAGES.map((p) => ({ name: p[0], title: p[2] })), null, 2)
    );
    console.log("\nTerminé → mockups/bruts/");
})();
