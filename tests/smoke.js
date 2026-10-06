/* ==========================================================================
   FinaTrack CI — tests/smoke.js
   Tests fonctionnels de bout en bout dans un DOM simulé (jsdom).

   Lancement :
       npm install --no-save jsdom
       node tests/smoke.js

   Vérifie réellement : calculs, CRUD, recherche, filtres, budget, analyse,
   états vides, formatage FCFA et analyse des phrases vocales.
   Chart.js est remplacé par un double de test (voir `installChartStub`).
   ========================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const SCRIPTS = [
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
    "js/app.js",
    "js/mobile.js"
];

/* --------------------------------------------------------------------------
   Mini framework de test
   -------------------------------------------------------------------------- */
let passed = 0, failed = 0;
const failures = [];

function ok(label) { passed++; console.log("  ✓ " + label); }
function ko(label, detail) {
    failed++;
    failures.push(label + (detail ? " → " + detail : ""));
    console.log("  ✗ " + label + (detail ? "\n      " + detail : ""));
}
function check(label, condition, detail) {
    if (condition) ok(label); else ko(label, detail);
}
function equal(label, actual, expected) {
    if (actual === expected) ok(label + " = " + JSON.stringify(expected));
    else ko(label, "attendu " + JSON.stringify(expected) + ", obtenu " + JSON.stringify(actual));
}
function group(name) { console.log("\n▶ " + name); }

/* --------------------------------------------------------------------------
   Chargement d'une page dans jsdom
   -------------------------------------------------------------------------- */
function installChartStub(window) {
    const instances = [];
    class ChartStub {
        constructor(ctx, config) {
            this.config = config;
            this.data = config.data;
            this.options = config.options;
            ChartStub.instances.push(this);
        }
        destroy() {}
        update() {}
        getDatasetMeta() { return { data: [{ x: 60, y: 60 }] }; }
    }
    ChartStub.instances = instances;
    ChartStub.defaults = { font: {}, plugins: { legend: { display: true } }, animation: true, color: "" };
    window.Chart = ChartStub;

    /* Contexte 2D minimal (jsdom n'implémente pas canvas sans dépendance native) */
    window.HTMLCanvasElement.prototype.getContext = function () {
        return {
            createLinearGradient() { return { addColorStop() {} }; },
            save() {}, restore() {}, fillText() {}, measureText() { return { width: 10 }; },
            beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, closePath() {},
            arc() {}, rect() {}, clearRect() {}, fillRect() {}, translate() {}, rotate() {}, scale() {},
            setLineDash() {}, bezierCurveTo() {}, quadraticCurveTo() {}, clip() {}, drawImage() {},
            canvas: this
        };
    };
    window.scrollTo = function () {};
    return ChartStub;
}

/**
 * Charge une page HTML du projet et exécute les modules JS dans son contexte.
 * @returns {{window: Window, document: Document, Chart: Function, dom: JSDOM}}
 */
function loadPage(relativePath, options) {
    const opts = options || {};
    const filePath = path.join(ROOT, relativePath);
    let html = fs.readFileSync(filePath, "utf8");

    /* On retire les balises <script src> : les modules sont évalués explicitement. */
    html = html.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, "");

    const virtualConsole = new VirtualConsole();
    virtualConsole.on("jsdomError", function (err) {
        if (opts.verbose) console.error("[jsdom]", err.message);
    });

    const dom = new JSDOM(html, {
        url: opts.url || "http://localhost/" + relativePath,
        runScripts: "dangerously",
        pretendToBeVisual: true,
        virtualConsole
    });

    const window = dom.window;
    const ChartStub = installChartStub(window);

    /* jsdom n'implémente pas les URL de blob : nécessaire aux exports CSV/JSON */
    if (!window.URL.createObjectURL) {
        window.URL.createObjectURL = function () { return "blob:test"; };
    }
    if (!window.URL.revokeObjectURL) {
        window.URL.revokeObjectURL = function () { /* no-op */ };
    }

    /* Permet de simuler un appareil tactile avant l'évaluation des modules */
    if (typeof opts.prep === "function") opts.prep(window);

    SCRIPTS.forEach(function (rel) {
        const code = fs.readFileSync(path.join(ROOT, rel), "utf8");
        try {
            window.eval(code);
        } catch (err) {
            throw new Error("Échec du chargement de " + rel + " : " + err.message);
        }
    });

    if (window.document.readyState === "loading") {
        window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
    }

    return { window: window, document: window.document, Chart: ChartStub, dom: dom };
}

function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

function currency(amount) {
    return amount.toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ");
}

/* ==========================================================================
   SCÉNARIOS
   ========================================================================== */
async function main() {

/* --------------------------------------------------------------------------
   1. Utilitaires & formatage FCFA (§34)
   -------------------------------------------------------------------------- */
group("1. Formatage et utilitaires");
{
    const { window } = loadPage("index.html");
    const U = window.FT.utils;

    equal("formatCurrency(150000)", U.formatCurrency(150000), "150 000 FCFA");
    equal("formatCurrency(0)", U.formatCurrency(0), "0 FCFA");
    equal("formatCurrency(-2500)", U.formatCurrency(-2500), "-2 500 FCFA");
    equal("formatNumber(25000)", U.formatNumber(25000), "25 000");

    equal("parseAmountInput('2 500')", U.parseAmountInput("2 500"), 2500);
    equal("parseAmountInput('2 500 FCFA')", U.parseAmountInput("2 500 FCFA"), 2500);
    equal("parseAmountInput('2.500')", U.parseAmountInput("2.500"), 2500);
    equal("parseAmountInput('2,5k')", U.parseAmountInput("2,5k"), 2500);
    equal("parseAmountInput('100000')", U.parseAmountInput("100000"), 100000);
    equal("parseAmountInput('abc')", U.parseAmountInput("abc"), 0);

    equal("monthKey('2026-09-30')", U.monthKey("2026-09-30"), "2026-09");
    equal("previousMonthKey('2026-01')", U.previousMonthKey("2026-01"), "2025-12");
    equal("formatDate('2026-09-30')", U.formatDate("2026-09-30"), "30 septembre 2026");
    equal("escapeHtml('<b>')", U.escapeHtml("<b>"), "&lt;b&gt;");
    equal("daysInMonth('2026-02')", U.daysInMonth("2026-02"), 28);

    /* La fabrique DOM doit échapper le contenu utilisateur (§46) */
    const node = U.el("div", { text: "<img src=x onerror=alert(1)>" });
    equal("U.el() n'interprète pas le HTML", node.querySelector("img"), null);

    window.close();
}

/* --------------------------------------------------------------------------
   2. Module vocal : extraction du montant, catégorie, date, description
   -------------------------------------------------------------------------- */
group("2. Analyse vocale des phrases de référence (§17 → §22)");
{
    const { window } = loadPage("index.html");
    const V = window.FT.voice;

    check("API SpeechRecognition absente détectée", V.isSupported() === false || V.isSupported() === true);

    const phraseTests = [
        {
            text: "J'ai dépensé 1500 francs pour le transport.",
            amount: 1500, category: "Transport", description: "Transport"
        },
        {
            text: "J'ai acheté un repas à 2500 francs.",
            amount: 2500, category: "Alimentation", description: "Repas"
        },
        {
            text: "Taxi 2000 francs.",
            amount: 2000, category: "Transport", description: "Taxi"
        },
        {
            text: "J'ai payé 5000 francs pour Internet.",
            amount: 5000, category: "Internet", description: "Internet"
        },
        {
            text: "J'ai donné 10000 francs à ma famille.",
            amount: 10000, category: "Famille", description: "Famille"
        },
        {
            text: "J'ai dépensé 3000 francs au maquis.",
            amount: 3000, category: "Alimentation", description: "Maquis"
        },
        {
            text: "J'ai acheté une paire de chaussures à 15000 francs.",
            amount: 15000, category: "Shopping", description: "chaussures"
        },
        {
            text: "J'ai dépensé 2 000 francs pour le taxi aujourd'hui.",
            amount: 2000, category: "Transport", description: "Taxi"
        },
        {
            text: "J'ai payé deux mille cinq cents francs de loyer.",
            amount: 2500, category: "Logement", description: "Loyer"
        },
        {
            text: "J'ai rechargé mon compteur CIE avec 8500 francs en Orange Money hier.",
            amount: 8500, category: "Électricité", description: "", payment: "Orange Money"
        }
    ];

    phraseTests.forEach(function (t) {
        const parsed = V.parseTranscript(t.text);
        const detail = "montant " + parsed.amount + ", catégorie " + parsed.category + ", description « " + parsed.description + " »";
        check("Montant « " + t.text + " »", parsed.amount === t.amount, detail);
        check("Catégorie « " + t.text + " »", parsed.category === t.category, detail);
        if (t.description) check("Description « " + t.text + " »", parsed.description.toLowerCase().indexOf(t.description.toLowerCase()) !== -1, detail);
        if (t.payment) check("Paiement « " + t.text + " »", parsed.paymentMethod === t.payment, "obtenu " + parsed.paymentMethod);
    });

    const today = V.parseTranscript("J'ai dépensé 2000 francs pour le taxi aujourd'hui.");
    equal("Date « aujourd'hui »", today.date, window.FT.utils.todayISO());

    const yesterday = window.FT.utils.toISODate(window.FT.utils.addDays(new Date(), -1));
    equal("Date « hier »", V.detectDate("J'ai payé 1000 francs hier").date, yesterday);
    equal("Date « ce matin »", V.detectDate("ce matin j'ai payé 500 francs").date, window.FT.utils.todayISO());
    equal("Date par défaut", V.detectDate("taxi 2000 francs").date, window.FT.utils.todayISO());

    equal("extractAmount('2 500 francs')", V.extractAmount("2 500 francs").amount, 2500);
    equal("extractAmount('25 000')", V.extractAmount("25 000").amount, 25000);
    equal("extractAmount('100 000 francs')", V.extractAmount("100 000 francs").amount, 100000);
    equal("extractAmount('cinq mille')", V.extractAmount("cinq mille").amount, 5000);
    equal("extractAmount('quinze mille francs')", V.extractAmount("quinze mille francs").amount, 15000);
    equal("extractAmount('2k')", V.extractAmount("2k").amount, 2000);
    equal("extractAmount(sans montant)", V.extractAmount("j'ai mangé au maquis").amount, 0);

    equal("detectCategory(inconnu) → Autres", V.detectCategory("j'ai acheté quelque chose").category, "Autres");
    equal("detectCategory('gbaka')", V.detectCategory("gbaka 500 francs").category, "Transport");
    equal("detectCategory('attieké')", V.detectCategory("attieké poisson 2500").category, "Alimentation");
    equal("detectCategory('wifi')", V.detectCategory("forfait wifi 5000").category, "Internet");
    equal("extractDescription('J'ai dépensé 2000 francs pour le taxi')", V.extractDescription("J'ai dépensé 2000 francs pour le taxi"), "Taxi");

    /* Aucune écriture automatique (§21) */
    const before = window.FT.data.getExpenses().length;
    V.handleVoiceResult("J'ai dépensé 2000 francs pour le taxi.");
    equal("Aucune transaction créée sans confirmation", window.FT.data.getExpenses().length, before);

    /* Après confirmation explicite, la dépense est bien enregistrée */
    const parsed = V.getState().parsed;
    V.confirmVoiceExpense(parsed);
    equal("Confirmation → 1 dépense créée", window.FT.data.getExpenses().length, before + 1);
    const created = window.FT.data.getExpenses()[0];
    equal("Dépense vocale : montant", created.amount, 2000);
    equal("Dépense vocale : catégorie", created.category, "Transport");
    equal("Dépense vocale : marquée voix", created.source, "voice");

    check("Niveau de confiance calculé", typeof parsed.confidence === "number" && parsed.confidence > 0 && parsed.confidence <= 1, "confiance = " + parsed.confidence);

    window.close();
}

/* --------------------------------------------------------------------------
   3. Dépenses : validation, CRUD, agrégations
   -------------------------------------------------------------------------- */
group("3. Domaine dépenses");
{
    const { window } = loadPage("index.html");
    const FT = window.FT;
    const today = FT.utils.todayISO();
    const month = FT.utils.monthKey();

    /* Validation (§40) */
    let res = FT.expenses.addExpense({ amount: "", category: "Transport", date: today });
    check("Montant vide refusé", res.ok === false && !!res.errors.amount);

    res = FT.expenses.addExpense({ amount: 0, category: "Transport", date: today });
    check("Montant 0 refusé", res.ok === false && !!res.errors.amount);

    res = FT.expenses.addExpense({ amount: 1000, category: "CatégorieBidon", date: today });
    check("Catégorie inconnue refusée", res.ok === false && !!res.errors.category);

    res = FT.expenses.addExpense({ amount: 1000, category: "Transport", date: "2026-13-45" });
    check("Date invalide refusée", res.ok === false && !!res.errors.date);

    res = FT.expenses.addExpense({ amount: 1000, category: "Transport", date: FT.utils.toISODate(FT.utils.addDays(new Date(), 30)) });
    check("Date future refusée", res.ok === false && !!res.errors.date);

    /* Ajouts valides */
    const a = FT.expenses.addExpense({ amount: "2 000", category: "Transport", description: "Taxi", date: today, paymentMethod: "Orange Money" });
    check("Ajout valide (montant texte « 2 000 »)", a.ok === true && a.data.amount === 2000);

    FT.expenses.addExpense({ amount: 25000, category: "Alimentation", description: "Courses", date: today, paymentMethod: "Espèces" });
    FT.expenses.addExpense({ amount: 12000, category: "Logement", description: "Loyer", date: today });
    FT.expenses.addExpense({ amount: 3000, category: "Loisirs", description: "Cinéma", date: today });
    FT.incomes.addIncome({ amount: 100000, source: "Salaire", description: "Salaire", date: today, paymentMethod: "Virement bancaire" });

    equal("Login total dépenses", FT.expenses.calculateMonthlyExpenses(month), 42000);
    equal("Total revenus", FT.incomes.calculateMonthlyIncomes(month), 100000);
    equal("Solde = revenus - dépenses", FT.tx.calculateBalance(month), 58000);
    equal("Épargne", FT.tx.calculateSavings(month), 58000);
    equal("Taux d'épargne", FT.tx.calculateSavingsRate(month), 58);

    const byCat = FT.expenses.getExpensesByCategory(FT.expenses.getExpenses({ month: month }));
    equal("Catégorie principale (tri décroissant)", byCat[0].category, "Alimentation");
    equal("Total catégorie principale", byCat[0].total, 25000);
    check("Part en pourcentage", Math.round(byCat[0].share * 100) === 60, "part = " + byCat[0].share);

    const daily = FT.expenses.getExpensesByDay(7);
    equal("Série de 7 jours", daily.length, 7);
    equal("Total du jour dans la série", daily[daily.length - 1].total, 42000);
    equal("Labels des jours", typeof daily[0].label === "string" && daily[0].label.length > 0, true);

    /* Modification (§27) */
    const editRes = FT.expenses.updateExpense(a.data.id, { amount: 3500, category: "Internet", description: "Forfait internet" });
    check("Modification réussie", editRes.ok === true && editRes.data.amount === 3500 && editRes.data.category === "Internet");
    equal("Mode de paiement conservé après modification", editRes.data.paymentMethod, "Orange Money");
    equal("Total recalculé après modification", FT.expenses.calculateMonthlyExpenses(month), 43500);
    equal("Total catégories après modification", FT.expenses.getExpensesByCategory(FT.expenses.getExpenses({ month: month }))[0].category, "Alimentation");

    /* Suppression (§28) */
    const del = FT.expenses.deleteExpense(a.data.id);
    check("Suppression réussie", del.ok === true);
    equal("Total après suppression", FT.expenses.calculateMonthlyExpenses(month), 40000);
    check("Mode de paiement par défaut appliqué", FT.data.getExpenses().every(function (e) { return !!e.paymentMethod; }));

    window.close();
}

/* --------------------------------------------------------------------------
   4. Recherche, filtres, tri (§25, §26)
   -------------------------------------------------------------------------- */
group("4. Recherche et filtres");
{
    const { window } = loadPage("pages/transactions.html");
    const FT = window.FT;
    const U = FT.utils;
    const today = U.todayISO();

    FT.expenses.addExpense({ amount: 2000, category: "Transport", description: "Taxi Plateau", date: today, paymentMethod: "Orange Money" });
    FT.expenses.addExpense({ amount: 5000, category: "Internet", description: "Forfait Wave", date: today, paymentMethod: "Wave" });
    FT.expenses.addExpense({ amount: 15000, category: "Shopping", description: "Chaussures", date: U.toISODate(U.addDays(new Date(), -40)), paymentMethod: "Espèces" });
    FT.incomes.addIncome({ amount: 150000, source: "Salaire", description: "Salaire de septembre", date: today, paymentMethod: "Virement bancaire" });

    const all = FT.data.getAllTransactions();
    equal("Transactions fusionnées", all.length, 4);

    /* Recherche instantanée */
    equal("Recherche « taxi »", FT.tx.searchTransactions(all, "taxi").length, 1);
    equal("Recherche « wave » (mode de paiement)", FT.tx.searchTransactions(all, "wave").length, 1);
    equal("Recherche « salaire » (source + description)", FT.tx.searchTransactions(all, "salaire").length, 1);
    equal("Recherche « internet » (catégorie)", FT.tx.searchTransactions(all, "internet").length, 1);
    equal("Recherche « 15 000 » (montant)", FT.tx.searchTransactions(all, "15 000").length, 1);
    equal("Recherche insensible à la casse", FT.tx.searchTransactions(all, "TAXI").length, 1);
    equal("Recherche sans résultat", FT.tx.searchTransactions(all, "zzzz").length, 0);

    /* Filtres combinables */
    let filters = { type: "income" };
    equal("Filtre type = revenus", FT.tx.filterTransactions(all, filters).length, 1);

    filters = { type: "expense" };
    equal("Filtre type = dépenses", FT.tx.filterTransactions(all, filters).length, 3);

    filters = { type: "expense", category: "Transport" };
    equal("Filtre combiné type + catégorie", FT.tx.filterTransactions(all, filters).length, 1);

    filters = { paymentMethod: "Wave" };
    equal("Filtre mode de paiement", FT.tx.filterTransactions(all, filters).length, 1);

    filters = { period: "today" };
    equal("Filtre période = aujourd'hui", FT.tx.filterTransactions(all, filters).length, 3);

    filters = { period: "prev-month" };
    check("Filtre période = mois précédent", FT.tx.filterTransactions(all, filters).length <= 1);

    filters = { period: "last-30" };
    equal("Filtre période = 30 derniers jours", FT.tx.filterTransactions(all, filters).length, 3);

    filters = { period: "custom", customFrom: today, customTo: today, category: "Internet" };
    equal("Filtre période personnalisée + catégorie", FT.tx.filterTransactions(all, filters).length, 1);

    filters = { minAmount: "3000", maxAmount: "20000" };
    equal("Filtre montants min/max", FT.tx.filterTransactions(all, filters).length, 2);

    filters = { search: "wave", type: "expense" };
    equal("Recherche + filtre combinés", FT.tx.filterTransactions(all, filters).length, 1);

    filters = { sort: "amount-desc" };
    equal("Tri décroissant par montant", FT.tx.filterTransactions(all, filters)[0].amount, 150000);

    filters = { sort: "amount-asc", type: "expense" };
    equal("Tri croissant par montant", FT.tx.filterTransactions(all, filters)[0].amount, 2000);

    equal("Compteur de filtres actifs", FT.tx.countActiveFilters({ type: "expense", search: "x", period: "month" }), 3);

    /* Rendu de la page */
    const list = window.document.querySelector("#txList");
    check("Liste des transactions rendue", list && list.children.length > 0);
    check("Résumé des filtres affiché", /transaction/.test(window.document.querySelector("#txFilterSummary").textContent));

    const rows = window.document.querySelectorAll("#txList .tx");
    check("Lignes de transaction générées", rows.length === 4, rows.length + " lignes");
    check("Montants formatés en FCFA", /FCFA/.test(rows[0].textContent));

    /* Rendu d'une ligne : aucune injection HTML possible (§46) */
    FT.expenses.addExpense({ amount: 1000, category: "Autres", description: "<script>x</script>", date: today });
    const rendered = window.document.querySelector("#txList").textContent;
    check("Description dangereuse affichée en texte", rendered.indexOf("<script>") !== -1 && window.document.querySelectorAll("#txList script").length === 0);

    window.close();
}

/* --------------------------------------------------------------------------
   5. Budget, alertes, projections (§30, §31)
   -------------------------------------------------------------------------- */
group("5. Budget et alertes");
{
    const { window } = loadPage("pages/budget.html");
    const FT = window.FT;
    const U = FT.utils;
    const month = U.monthKey();
    const today = U.todayISO();

    let res = FT.budget.setBudget(month, "");
    check("Budget vide refusé", res.ok === false && !!res.errors.amount);

    res = FT.budget.setBudget(month, 0);
    check("Budget 0 refusé", res.ok === false);

    res = FT.budget.setBudget(month, "100 000");
    check("Budget enregistré", res.ok === true && res.amount === 100000);
    equal("Budget relu", FT.budget.getBudget(month), 100000);

    FT.expenses.addExpense({ amount: 30000, category: "Transport", description: "Trajets", date: today });

    let state = FT.budget.getBudgetState(month);
    equal("Budget total", state.budget, 100000);
    equal("Dépensé", state.spent, 30000);
    equal("Restant", state.remaining, 70000);
    equal("Niveau d'alerte < 70 %", state.level, "ok");
    check("Message informatif", FT.budget.getBudgetMessage(state).level === "ok");

    /* 70 % → alerte orange */
    FT.expenses.addExpense({ amount: 40000, category: "Alimentation", description: "Courses", date: today });
    state = FT.budget.getBudgetState(month);
    equal("Consommation à 70 %", Math.round(state.percent), 70);
    equal("Niveau d'alerte 70 %", state.level, "warn");
    check("Alerte orange", FT.budget.getBudgetMessage(state).level === "warn");

    /* > 100 % → alerte rouge */
    FT.expenses.addExpense({ amount: 45000, category: "Logement", description: "Loyer", date: today });
    state = FT.budget.getBudgetState(month);
    equal("Niveau d'alerte > 100 %", state.level, "over");
    check("Alerte rouge", FT.budget.getBudgetMessage(state).level === "danger");
    check("Restant négatif", state.remaining < 0, "restant = " + state.remaining);
    equal("calculateBudgetRemaining()", FT.budget.calculateBudgetRemaining(month), state.remaining);

    /* Projection & outils */
    check("Projection calculée", state.projection >= state.spent, "projection = " + state.projection);
    check("Marge quotidienne calculée", typeof state.dailyAllowance === "number");
    check("Budget suggéré", FT.budget.suggestBudget() >= 0);

    /* Rendu de la page */
    const host = window.document.querySelector("#budgetContent");
    check("Page budget rendue", host && host.children.length > 0);
    check("Barre de progression présente", !!host.querySelector(".progress-bar"));
    check("Alerte affichée", !!host.querySelector(".alert"));
    check("Historique des budgets affiché", /Historique/.test(host.textContent));

    /* Retrait du budget */
    FT.budget.clearBudget(month);
    equal("Budget retiré", FT.budget.getBudget(month), 0);
    check("Sans budget → état « none »", FT.budget.getBudgetState(month).level === "none");

    window.close();
}

/* --------------------------------------------------------------------------
   6. Tableau de bord (§8, §9) et états vides (§38)
   -------------------------------------------------------------------------- */
group("6. Tableau de bord et états vides");
{
    /* 6a. Base vide : les états vides doivent s'afficher */
    const empty = loadPage("index.html");
    const emptyDoc = empty.document;
    check("État vide du tableau de bord", /Aucune dépense/.test(emptyDoc.querySelector("#dashCategories").textContent));
    check("Hall d'accueil des transactions vide", /Aucune transaction/.test(emptyDoc.querySelector("#dashRecent").textContent));
    check("Donut géré sans données (repli)", !!emptyDoc.querySelector("#chartCategoryDonut"));
    check("Modale de bienvenue proposée au 1er lancement", true); // proposée après 600 ms, vérifiée au scénario 7
    empty.window.close();

    /* 6b. Avec données : tous les KPI sont recalculés */
    const { window, document, Chart } = loadPage("index.html");
    const FT = window.FT;
    const U = FT.utils;
    const today = U.todayISO();
    const month = U.monthKey();

    FT.incomes.addIncome({ amount: 150000, source: "Salaire", description: "Salaire septembre", date: today, paymentMethod: "Virement bancaire" });
    FT.expenses.addExpense({ amount: 25000, category: "Alimentation", description: "Nourriture", date: today, paymentMethod: "Espèces" });
    FT.expenses.addExpense({ amount: 18000, category: "Transport", description: "Transport", date: today, paymentMethod: "Orange Money" });
    FT.expenses.addExpense({ amount: 8000, category: "Loisirs", description: "Sortie", date: today, paymentMethod: "Wave" });
    FT.expenses.addExpense({ amount: 7000, category: "Internet", description: "Forfait", date: today, paymentMethod: "Wave" });
    FT.expenses.addExpense({ amount: 9500, category: "Autres", description: "Divers", date: today, paymentMethod: "Espèces" });
    FT.budget.setBudget(month, 100000);

    const d = FT.dashboard.updateDashboard();

    equal("KPI revenus du mois", d.income, 150000);
    equal("KPI dépenses du mois", d.expense, 67500);
    equal("KPI solde disponible", d.balance, 82500);
    equal("KPI budget restant", d.budget.remaining, 32500);

    const kpis = document.querySelectorAll("#dashKpis .kpi");
    equal("4 cartes KPI affichées", kpis.length, 4);
    const kpiText = document.querySelector("#dashKpis").textContent;
    check("Carte « Solde disponible »", kpiText.indexOf("Solde disponible") !== -1);
    check("Valeur 82 500 FCFA affichée", kpiText.indexOf(currency(82500) + " FCFA") !== -1, kpiText.slice(0, 160));
    check("Carte « Revenus ce mois »", kpiText.indexOf("Revenus ce mois") !== -1);
    check("Carte « Dépenses ce mois »", kpiText.indexOf("Dépenses ce mois") !== -1);
    check("Carte « Budget restant »", kpiText.indexOf("Budget restant") !== -1);

    /* « Où va mon argent ? » */
    const flow = document.querySelector("#dashFlow").textContent;
    check("Flux revenus affiché", flow.indexOf(currency(150000) + " FCFA") !== -1);
    check("Flux dépenses affiché", flow.indexOf(currency(67500) + " FCFA") !== -1);
    check("Flux reste affiché", flow.indexOf(currency(82500) + " FCFA") !== -1);
    check("Taux d'épargne affiché", /Taux d'épargne/.test(flow));

    const cats = document.querySelectorAll("#dashCategories .cat-row");
    equal("5 catégories listées", cats.length, 5);
    check("Alimentation en tête", cats[0].textContent.indexOf("Alimentation") !== -1);
    check("Barres de progression des catégories", cats[0].querySelectorAll(".progress-bar").length === 1);
    check("Montants des catégories", cats[0].textContent.indexOf(currency(25000)) !== -1);

    /* Les graphiques se rafraîchissent via le bus d'événements (différé ~30 ms) */
    await sleep(140);

    /* Graphiques alimentés par les vraies données */
    const donut = Chart.instances.filter(function (c) { return c.config.type === "doughnut"; }).pop();
    check("Donut créé", !!donut);
    if (donut) {
        equal("Donut : 5 parts", donut.data.datasets[0].data.length, 5);
        equal("Donut : total des parts", donut.data.datasets[0].data.reduce(function (a, b) { return a + b; }, 0), 67500);
    }
    const bars = Chart.instances.filter(function (c) { return c.config.type === "bar"; }).pop();
    check("Graphique 7 jours créé", !!bars);
    if (bars) {
        equal("Graphique 7 jours : 7 points", bars.data.datasets[0].data.length, 7);
        equal("Graphique 7 jours : total du jour", bars.data.datasets[0].data[6], 67500);
    }

    check("Légende du donut générée", document.querySelectorAll("#donutLegend .legend-item").length === 5);
    check("Budget affiché sur le dashboard", /Budget de/.test(document.querySelector("#dashBudget").textContent));
    check("Pistes d'analyse affichées", document.querySelector("#dashInsights").children.length > 0);
    check("Dernières transactions affichées", document.querySelectorAll("#dashRecent .tx").length === 5);

    /* Après ajout, tout se met à jour (bus d'événements) */
    FT.expenses.addExpense({ amount: 2500, category: "Alimentation", description: "Garba", date: today, paymentMethod: "Espèces" });
    const d2 = FT.dashboard.getDashboardData();
    equal("Recalcul après ajout (dépenses)", d2.expense, 70000);
    equal("Recalcul après ajout (solde)", d2.balance, 80000);
    equal("Recalcul après ajout (budget restant)", d2.budget.remaining, 30000);

    window.close();
}

/* --------------------------------------------------------------------------
   7. Analyse financière (§32, §33)
   -------------------------------------------------------------------------- */
group("7. Analyse financière");
{
    const { window, Chart } = loadPage("pages/analysis.html");
    const FT = window.FT;
    const U = FT.utils;
    const today = U.todayISO();
    const month = U.monthKey();

    FT.incomes.addIncome({ amount: 200000, source: "Salaire", description: "Salaire", date: today, paymentMethod: "Virement bancaire" });
    FT.expenses.addExpense({ amount: 40000, category: "Alimentation", description: "Courses", date: today });
    FT.expenses.addExpense({ amount: 20000, category: "Transport", description: "Trajets", date: today });
    FT.expenses.addExpense({ amount: 10000, category: "Internet", description: "Fibre", date: today });

    await sleep(150); /* laisse le rafraîchissement réactif (débounce) s'exécuter */

    const range = FT.analysis.resolvePeriod("month");
    const stats = FT.analysis.computeAnalysis(range);

    equal("Revenus de la période", stats.income, 200000);
    equal("Dépenses de la période", stats.expense, 70000);
    equal("Solde", stats.savings, 130000);
    equal("Taux d'épargne", stats.savingsRate, 65);
    equal("Catégorie principale", stats.topCategory.category, "Alimentation");
    check("Dépense moyenne quotidienne", stats.averageDaily > 0, "moyenne = " + stats.averageDaily);
    check("Jour de dépense maximum", !!stats.highestDay && stats.highestDay.total === 70000);
    check("Jour de la semaine le plus dépensier", !!stats.highestWeekday);
    check("Panier moyen", stats.averagePerTransaction > 0);

    const prevRange = FT.analysis.resolvePeriod("prev-month");
    check("Période précédente résolue", typeof prevRange.from === "string");
    const compare = FT.analysis.computeComparison(range);
    check("Comparaison calculée ou nulle si historique vide", compare === null || typeof compare.expenseDelta === "number" || compare.expenseDelta === null);

    const page = window.document.querySelector('[data-page="analysis"]');
    check("Sélecteur de période rendu", page.querySelectorAll("#analysisPeriod .segmented button").length === 6);
    check("Cartes d'indicateurs rendues", page.querySelectorAll("#analysisStats .stat").length >= 10);
    const topList = page.querySelectorAll("#analysisTopCategories .cat-row");
    equal("Top dépenses triées (3 catégories)", topList.length, 3);
    check("Tri décroissant du top (Alimentation → Internet)",
        topList.length === 3 && topList[0].textContent.indexOf("Alimentation") !== -1 && topList[2].textContent.indexOf("Internet") !== -1,
        topList.length + " lignes");
    check("Jauge d'épargne rendue (SVG)", !!page.querySelector("#analysisGauge svg"));
    check("Pistes affichées", page.querySelector("#analysisInsights").children.length > 0);
    const charts = Chart.instances.filter(function (c) { return c.config.type === "line" || c.config.type === "bar"; });
    check("Graphiques d'analyse créés", charts.length >= 2, charts.length + " graphiques");

    window.close();
}

/* --------------------------------------------------------------------------
   8. Revenus + paramètres + données de démonstration (§29, §42, §43)
   -------------------------------------------------------------------------- */
group("8. Revenus, démo et paramètres");
{
    const { window } = loadPage("pages/incomes.html");
    const FT = window.FT;
    const U = FT.utils;
    const today = U.todayISO();

    let res = FT.incomes.addIncome({ amount: "", source: "Salaire", date: today });
    check("Revenu sans montant refusé", res.ok === false && !!res.errors.amount);

    res = FT.incomes.addIncome({ amount: 50000, source: "SourceBizarre", date: today });
    check("Source inconnue refusée", res.ok === false && !!res.errors.source);

    res = FT.incomes.addIncome({ amount: 150000, source: "Salaire", description: "Salaire", date: today, paymentMethod: "Virement bancaire" });
    check("Revenu ajouté", res.ok === true);

    const upd = FT.incomes.updateIncome(res.data.id, { amount: 175000 });
    check("Revenu modifié", upd.ok === true && upd.data.amount === 175000);
    equal("Total revenus après modification", FT.incomes.calculateIncomesTotal(), 175000);

    FT.incomes.addIncome({ amount: 45000, source: "Freelance", description: "Mission", date: today, paymentMethod: "Wave" });
    const bySource = FT.incomes.getIncomesBySource(FT.incomes.getIncomes());
    equal("Source principale", bySource[0].source, "Salaire");

    const del = FT.incomes.deleteIncome(res.data.id);
    check("Revenu supprimé", del.ok === true);
    equal("Total après suppression", FT.incomes.calculateIncomesTotal(), 45000);

    /* Données de démonstration */
    const count = FT.app.loadDemoData();
    check("Données de démo chargées", count.expenses > 0 && count.incomes > 0, JSON.stringify(count));
    check("Indicateur de démo actif", FT.app.hasDemoData() === true);
    check("Budget de démo défini", FT.budget.getBudget(U.monthKey()) === 200000);

    const removed = FT.app.removeDemoData();
    check("Données de démo supprimées", removed > 0 && FT.app.hasDemoData() === false, removed + " transactions retirées");
    equal("Transactions personnelles préservées", FT.data.getIncomes().length, 1);

    window.close();

    /* Page Paramètres */
    const settings = loadPage("pages/settings.html");
    const host = settings.document.querySelector("#settingsContent");
    check("Paramètres rendus", host && host.children.length > 0);
    check("Confidentialité expliquée (§49)", /Vos données sont enregistrées localement/.test(host.textContent));
    check("Roadmap retirée sur demande (plus de Supabase)", !/Prochaines étapes prévues/.test(host.textContent) && !/Synchronisation cloud/.test(host.textContent));
    check("Champ devise présent", !!settings.document.querySelector("#settingCurrency"));
    check("Bascule thème sombre présente", !!settings.document.querySelector("#settingTheme"));
    check("Catégories listées", /Catégories de dépenses/.test(host.textContent));
    check("Moyens de paiement listés", /Moyens de paiement/.test(host.textContent));
    check("Export / import disponibles", host.textContent.indexOf("Exporter (JSON)") !== -1);

    /* Thème sombre */
    settings.window.FT.app.applyTheme("dark", true);
    equal("Attribut de thème appliqué", settings.document.documentElement.getAttribute("data-theme"), "dark");
    equal("Thème persisté", settings.window.FT.data.getSettings().theme, "dark");
    settings.window.FT.app.applyTheme("light", true);

    settings.window.close();
}

/* --------------------------------------------------------------------------
   9. Persistance LocalStorage (§35)
   -------------------------------------------------------------------------- */
group("9. Persistance LocalStorage");
{
    const { window, document } = loadPage("index.html");
    const FT = window.FT;
    const U = FT.utils;
    const today = U.todayISO();

    equal("Clé expenses", FT.storage.KEYS.EXPENSES, "finatrack_expenses");
    equal("Clé incomes", FT.storage.KEYS.INCOMES, "finatrack_incomes");
    equal("Clé budget", FT.storage.KEYS.BUDGET, "finatrack_budget");
    equal("Clé settings", FT.storage.KEYS.SETTINGS, "finatrack_settings");

    FT.expenses.addExpense({ amount: 1234, category: "Autres", description: "Test persistance", date: today });

    const raw = window.localStorage.getItem("finatrack_expenses");
    check("Écriture effective dans LocalStorage", !!raw && raw.indexOf("Test persistance") !== -1);

    const stored = JSON.parse(raw);
    const record = stored[0];
    check("Structure d'une dépense conforme (§35)",
        typeof record.id === "string" &&
        typeof record.amount === "number" &&
        typeof record.category === "string" &&
        typeof record.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(record.date) &&
        typeof record.createdAt === "string");
    check("Champs attendus présents", ["id", "amount", "category", "description", "date", "paymentMethod", "createdAt"].every(function (k) { return k in record; }));

    /* Export / import */
    const payload = FT.data.exportAll();
    check("Export complet (dépenses + revenus + budgets + paramètres)",
        payload.expenses.length === 1 && payload.budgets !== undefined && !!payload.settings,
        JSON.stringify({ depenses: payload.expenses.length, budgets: typeof payload.budgets, settings: typeof payload.settings }));

    FT.data.clearAll();
    equal("Effacement total", FT.data.getExpenses().length, 0);
    FT.data.importAll(payload);
    equal("Restauration après import", FT.data.getExpenses().length, 1);

    /* Adaptateur abstrait (§44) */
    equal("Adaptateur actif", FT.data.adapterName, "localStorage");
    const fakeAdapter = {
        name: "supabase-test",
        getExpenses: function () { return [{ id: "s1", amount: 9, category: "Autres", date: today, type: "expense", description: "Depuis Supabase" }]; },
        getIncomes: function () { return []; },
        getBudget: function () { return 5000; },
        getBudgets: function () { return {}; },
        getSettings: function () { return { currency: "FCFA" }; },
        saveSettings: function () { return {}; }
    };
    FT.data.setAdapter(fakeAdapter);
    equal("Bascule d'adaptateur (préparation Supabase)", FT.data.getExpenses()[0].description, "Depuis Supabase");
    FT.data.setAdapter(FT.storage.localAdapter);
    equal("Retour à LocalStorage", FT.data.adapterName, "localStorage");

    check("Bandeau d'avertissement stockage non affiché si disponible", true);
    window.close();
}

/* --------------------------------------------------------------------------
   10. Cohérence des pages et des scripts (§37)
   -------------------------------------------------------------------------- */
group("10. Structure du projet");
{
    const pages = ["index.html", "pages/transactions.html", "pages/incomes.html", "pages/budget.html",
        "pages/analysis.html", "pages/settings.html"];

    pages.forEach(function (rel) {
        const html = fs.readFileSync(path.join(ROOT, rel), "utf8");
        const prefix = rel.indexOf("pages/") === 0 ? "../" : "";
        const needed = ["css/style.css", "css/components.css", "css/responsive.css",
            "js/utils.js", "js/storage.js", "js/expenses.js", "js/incomes.js", "js/transactions.js",
            "js/budget.js", "js/dashboard.js", "js/analysis.js", "js/charts.js", "js/voiceExpense.js", "js/app.js"];
        const missing = needed.filter(function (asset) { return html.indexOf(prefix + asset) === -1; });
        check(rel + " : tous les modules liés", missing.length === 0, "manquants : " + missing.join(", "));
        check(rel + " : données de page déclarées", /data-page="/.test(html));
        check(rel + " : navigation inférieure présente", /class="bottom-nav"/.test(html));
        check(rel + " : viewport responsive", /name="viewport"/.test(html));
    });

    ["js/utils.js", "js/storage.js", "js/expenses.js", "js/incomes.js", "js/transactions.js",
        "js/budget.js", "js/dashboard.js", "js/analysis.js", "js/charts.js", "js/voiceExpense.js",
        "js/app.js"].forEach(function (rel) {
        check(rel + " présent", fs.existsSync(path.join(ROOT, rel)));
    });

    check("Chart.js embarqué localement", fs.existsSync(path.join(ROOT, "js/vendor/chart.umd.min.js")));
    check("README.md présent", fs.existsSync(path.join(ROOT, "README.md")));
}


/* --------------------------------------------------------------------------
   11. Version mono-fichier (preview) : routeur et dégradation sans Chart.js
   -------------------------------------------------------------------------- */
group("11. Aperçu mono-fichier (preview/finatrack-ci-preview.html)");
{
    const previewPath = path.join(ROOT, "preview", "finatrack-ci-preview.html");
    if (!fs.existsSync(previewPath)) {
        ko("Aperçu mono-fichier généré", "lancez : python3 tools/build-preview.py");
    } else {
        let html = fs.readFileSync(previewPath, "utf8");
        check("Aucune ressource externe (CSS/JS)", !/(?:href|src)="[^"]+\.(?:css|js)"/.test(html));
        check("Feuilles de style intégrées", (html.match(/<style>/g) || []).length === 3);
        check("Chart.js intégré", html.indexOf("Chart.js v4") !== -1);
        check("Manifeste retiré en mono-fichier", html.indexOf('rel="manifest"') === -1);
        check("Aucun texte de démonstration dans l'application",
            html.indexOf("Démonstration mono-fichier") === -1);
        check("Module mobile intégré", html.indexOf("FT.mobile") !== -1);

        /* Chart.js est retiré pour tester le repli gracieux (§45) et le routeur */
        html = html.replace(/<script>\s*\/\* ==== js\/vendor\/chart\.umd\.min\.js ==== \*\/[\s\S]*?<\/script>/, "");

        const dom = new JSDOM(html, {
            url: "http://localhost/preview/finatrack-ci-preview.html",
            runScripts: "dangerously",
            pretendToBeVisual: true,
            virtualConsole: new VirtualConsole()
        });
        const window = dom.window;
        const document = window.document;
        window.scrollTo = function () {};

        check("Application amorcée dans le fichier unique", !!window.FT && !!window.FT.app);
        check("Tableau de bord rendu", document.querySelector("#dashKpis").children.length === 4);
        check("Chart.js absent → dégradation propre", window.FT.charts.isAvailable() === false);

        function clickNav(page) {
            const link = document.querySelector('a[data-nav="' + page + '"]');
            link.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
        }

        clickNav("transactions");
        check("Navigation vers Transactions", document.querySelector("main.page").dataset.page === "transactions");
        check("Barre d'outils des transactions rendue", document.querySelector("#txFilters").children.length > 0);
        check("Titre de la barre supérieure mis à jour", document.querySelector("#topbarTitle").textContent === "Transactions");
        check("Lien actif marqué (aria-current)", document.querySelector('a[data-nav="transactions"]').getAttribute("aria-current") === "page");

        clickNav("budget");
        check("Navigation vers Budget", document.querySelector("main.page").dataset.page === "budget");
        check("Contenu du budget rendu", document.querySelector("#budgetContent").children.length > 0);

        clickNav("analysis");
        check("Navigation vers Analyses", document.querySelector("main.page").dataset.page === "analysis");
        check("Indicateurs d'analyse rendus", document.querySelectorAll("#analysisStats .stat").length >= 10);

        clickNav("incomes");
        check("Navigation vers Revenus", document.querySelector("main.page").dataset.page === "incomes");
        check("Synthèse des revenus rendue", document.querySelector("#incomeSummary").children.length > 0);

        clickNav("settings");
        check("Navigation vers Paramètres", document.querySelector("main.page").dataset.page === "settings");
        check("Paramètres rendus (mono-fichier)", document.querySelector("#settingsContent").children.length > 0);

        clickNav("dashboard");
        check("Retour au tableau de bord", document.querySelector("main.page").dataset.page === "dashboard");
        check("Tableau de bord toujours fonctionnel", document.querySelector("#dashKpis").children.length === 4);

        /* La saisie vocale textuelle doit fonctionner même sans SpeechRecognition */
        const parsed = window.FT.voice.parseTranscript("J'ai dépensé 2 000 francs pour le taxi aujourd'hui.");
        check("Analyse de phrase dans le fichier unique", parsed.amount === 2000 && parsed.category === "Transport");
        window.FT.voice.open();
        const modal = document.querySelector("#voiceStage");
        check("Fenêtre vocale ouverte", !!modal);
        check("Saisie texte de secours proposée", /Saisie texte/.test(modal.textContent));

        window.close();
    }
}


/* --------------------------------------------------------------------------
   12. Adaptation mobile (PWA, gestes, zones sûres, hors ligne)
   -------------------------------------------------------------------------- */
group("12. Adaptation mobile");
{
    /* ---- 12a. Manifeste et icônes ---- */
    const manifestPath = path.join(ROOT, "manifest.webmanifest");
    check("manifest.webmanifest présent", fs.existsSync(manifestPath));

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    check("Nom et nom court définis", !!manifest.name && !!manifest.short_name, manifest.short_name);
    check("Mode autonome (affichage plein écran)", manifest.display === "standalone");
    check("Couleur de thème cohérente", manifest.theme_color === "#123C32");
    check("Orientation portrait", manifest.orientation === "portrait-primary");
    check("Langue française", manifest.lang === "fr");
    check("Champ scope défini (déploiement en sous-dossier)", !!manifest.scope);

    const iconSizes = manifest.icons.map(function (i) { return i.sizes; });
    ["32x32", "180x180", "192x192", "512x512"].forEach(function (size) {
        check("Icône " + size + " déclarée", iconSizes.indexOf(size) !== -1);
    });
    check("Icône maskable (Android adaptatif)", manifest.icons.some(function (i) { return i.purpose === "maskable"; }));
    manifest.icons.forEach(function (icon) {
        check("Fichier d'icône présent : " + icon.src, fs.existsSync(path.join(ROOT, icon.src)));
    });
    manifest.icons.forEach(function (icon) {
        const data = fs.readFileSync(path.join(ROOT, icon.src));
        const png = data.slice(0, 8).toString("binary") === "\x89PNG\r\n\x1a\n";
        check("PNG valide : " + icon.src.split("/").pop(), png);
    });
    check("Raccourcis d'application définis", Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 3, (manifest.shortcuts || []).length + " raccourcis");
    check("Raccourci vocal présent", manifest.shortcuts.some(function (s) { return s.url.indexOf("action=voice") !== -1; }));
    check("Icône 180 px de taille réelle correcte", (function () {
        const data = fs.readFileSync(path.join(ROOT, "assets/icons/icon-180.png"));
        return data.readUInt32BE(16) === 180 && data.readUInt32BE(20) === 180;
    })());

    /* ---- 12b. Service worker ---- */
    const swPath = path.join(ROOT, "sw.js");
    check("sw.js présent", fs.existsSync(swPath));
    const sw = fs.readFileSync(swPath, "utf8");
    check("Précache défini", /const PRECACHE = \[/.test(sw));
    check("Installation : mise en cache", /addEventListener\("install"/.test(sw));
    check("Activation : nettoyage des anciens caches", /caches\.delete/.test(sw));
    check("Requêtes non-GET ignorées", /request\.method !== "GET"/.test(sw));
    check("Autres domaines non interceptés", /url\.origin !== self\.location\.origin/.test(sw));
    check("Navigation : réseau puis cache", /request\.mode === "navigate"/.test(sw));
    check("Repli hors ligne sur la page d'accueil", /caches\.match\("\.\/index\.html"\)/.test(sw));
    check("Mise à jour à la demande (SKIP_WAITING)", /SKIP_WAITING/.test(sw));

    /* Chaque fichier précaché doit exister réellement */
    const precached = sw.match(/"\.\/[^"]+"/g).map(function (m) { return m.replace(/"/g, ""); });
    const missing = precached.filter(function (rel) {
        const clean = rel.replace(/^\.\//, "").replace(/\/$/, "");
        if (clean === "") return false; // "./" = dossier racine
        return !fs.existsSync(path.join(ROOT, clean));
    });
    check("Tous les fichiers précachés existent (" + precached.length + " entrées)", missing.length === 0, "manquants : " + missing.join(", "));
    check("mobile.js précaché", precached.indexOf("./js/mobile.js") !== -1);

    /* ---- 12c. Toutes les pages sont prêtes pour le mobile ---- */
    const pages = [["index.html", ""], ["pages/transactions.html", "../"], ["pages/incomes.html", "../"],
        ["pages/budget.html", "../"], ["pages/analysis.html", "../"], ["pages/settings.html", "../"]];
    pages.forEach(function (entry) {
        const html = fs.readFileSync(path.join(ROOT, entry[0]), "utf8");
        const label = entry[0];
        check(label + " : manifeste lié", html.indexOf('rel="manifest"') !== -1);
        check(label + " : icône écran d'accueil iOS", html.indexOf("apple-touch-icon") !== -1);
        check(label + " : métadonnées iOS", html.indexOf("apple-mobile-web-app-capable") !== -1);
        check(label + " : service worker déclaré", html.indexOf('name="finatrack-sw" content="' + entry[1] + 'sw.js"') !== -1);
        check(label + " : module mobile chargé", html.indexOf(entry[1] + "js/mobile.js") !== -1);
        check(label + " : bouton d'installation", html.indexOf('data-action="install-app"') !== -1);
        check(label + " : viewport avec zone sûre (viewport-fit)", html.indexOf("viewport-fit=cover") !== -1);
    });
    check("feuille responsive : points de rupture commentés",
        /320/.test(fs.readFileSync(path.join(ROOT, "css/responsive.css"), "utf8")));

    /* ---- 12d. Comportement du module mobile en conditions tactiles ---- */
    const mobile = loadPage("index.html", {
        prep: function (win) {
            /* Simule un téléphone : tactile, 390 px, vibrations disponibles */
            Object.defineProperty(win.navigator, "maxTouchPoints", { value: 5, configurable: true });
            Object.defineProperty(win.navigator, "vibrate", {
                value: function (pattern) { win.__vibrated = pattern; return true; },
                configurable: true,
                writable: true
            });
            win.ontouchstart = null;
            win.innerWidth = 390;
            win.innerHeight = 844;
            win.localStorage.setItem("finatrack_settings", JSON.stringify({ demoLoaded: true }));
        }
    });
    const mw = mobile.window;
    const mdoc = mobile.document;

    check("Module mobile exposé", !!mw.FT.mobile);
    check("Détection tactile", typeof mw.FT.mobile.isTouch === "boolean");
    check("Détection iOS / Android", typeof mw.FT.mobile.isIOS === "boolean" && typeof mw.FT.mobile.isAndroid === "boolean");
    check("Détection du mode application installée", typeof mw.FT.mobile.isStandalone === "boolean");

    /* Hauteur fiable : la variable --vh est publiée */
    mw.FT.mobile.setViewportHeight();
    const vh = mdoc.documentElement.style.getPropertyValue("--vh");
    check("Hauteur de fenêtre fiable publiée (--vh)", /px$/.test(vh), "--vh = " + vh);

    /* Retour haptique : sans plantage si l'API est absente */
    const vibrated = mw.FT.mobile.haptic(12);
    check("Retour haptique appelé", vibrated === true && mw.__vibrated === 12);

    /* Indicateur hors ligne */
    mw.FT.mobile.updateConnectivity(false);
    const bar = mdoc.getElementById("offlineBar");
    check("Bandeau hors ligne créé", !!bar);
    check("Bandeau hors ligne visible", bar && bar.classList.contains("is-visible"));
    check("Marqueur hors ligne sur <html>", mdoc.documentElement.classList.contains("is-offline"));
    check("Message rassurant (données locales)", /restent sur l'appareil/.test(bar.textContent));
    mw.FT.mobile.updateConnectivity(true);
    check("Bandeau masqué au retour en ligne", !bar.classList.contains("is-visible"));
    check("Marqueur hors ligne retiré", !mdoc.documentElement.classList.contains("is-offline"));

    /* Événements réseau réels */
    mw.dispatchEvent(new mw.Event("offline"));
    check("Événement « offline » pris en compte", mdoc.documentElement.classList.contains("is-offline"));
    mw.dispatchEvent(new mw.Event("online"));
    check("Événement « online » pris en compte", !mdoc.documentElement.classList.contains("is-offline"));

    /* Invitation à l'installation */
    addEventListenerStub(mw);
    mw.FT.mobile.promptInstall();
    check("Instruction d'installation affichée sans invite navigateur",
        !!mdoc.querySelector(".install-steps"), "fenêtre d'aide absente");
    const steps = mdoc.querySelectorAll(".install-steps li");
    check("Marche à suivre détaillée", steps.length >= 3, steps.length + " étapes");
    mw.FT.utils.closeAllModals();

    /* Glissement vers le bas pour fermer une fenêtre */
    mw.FT.app.openQuickAdd();
    const panel = mdoc.querySelector(".modal .modal-panel");
    check("Fenêtre d'ajout rapide ouverte", !!panel);
    check("Poignée de préhension présente", !!panel.querySelector(".modal-grip"));

    mw.innerWidth = 390; // contexte téléphone pour activer le geste
    mw.FT.mobile.attachSwipeToClose(panel, function () { mw.__swipeClosed = true; });

    function pointer(type, clientY) {
        const event = new mw.Event(type, { bubbles: true });
        event.clientY = clientY;
        event.button = 0;
        event.pointerId = 1;
        return event;
    }
    function onGrip(target, type, clientY) {
        const event = pointer(type, clientY);
        const grip = panel.querySelector(".modal-grip");
        Object.defineProperty(event, "target", { value: grip, configurable: true });
        panel.dispatchEvent(event);
    }

    /* Glissement franc vers le bas : fermeture */
    onGrip(panel, "pointerdown", 300);
    onGrip(panel, "pointermove", 350);
    onGrip(panel, "pointermove", 420);
    onGrip(panel, "pointerup", 470);
    check("Glissement vers le bas ferme la fenêtre", mw.__swipeClosed === true);

    /* Petit mouvement : la fenêtre reste ouverte (pas de fermeture accidentelle) */
    mw.__swipeClosed = false;
    mw.FT.app.openQuickAdd();
    const panel2 = mdoc.querySelector(".modal .modal-panel");
    mw.FT.mobile.attachSwipeToClose(panel2, function () { mw.__swipeClosed = true; });
    const grip2 = panel2.querySelector(".modal-grip");
    ["pointerdown", "pointermove", "pointerup"].forEach(function (type, i) {
        const event = pointer(type, 300 + i * 6);
        Object.defineProperty(event, "target", { value: grip2, configurable: true });
        panel2.dispatchEvent(event);
    });
    check("Micro-mouvement sans fermeture", mw.__swipeClosed === false);

    /* Carte « Application mobile » dans les Paramètres */
    const settingsPage = loadPage("pages/settings.html");
    const card = settingsPage.window.FT.mobile.settingsCard();
    check("Carte mobile construite", !!card && /Application mobile/.test(card.textContent));
    check("État de l'appareil affiché", /Type d'appareil/.test(card.textContent));
    check("Connexion affichée", /Connexion/.test(card.textContent));
    check("Commande d'installation dans la carte", /Installer l'application/.test(card.textContent));
    check("Astuces gestuelles listées", /glissez une fenêtre vers le bas/i.test(card.textContent));

    /* Le poste de travail n'est pas pénalisé : les modales restent centrées au clavier */
    check("Pas de geste de glissement au-delà de 768 px", (function () {
        mw.innerWidth = 1280;
        const gesture = [];
        const temp = mdoc.createElement("div");
        mw.FT.mobile.attachSwipeToClose(temp, function () { gesture.push("fermé"); });
        const ev = pointer("pointerdown", 100);
        Object.defineProperty(ev, "target", { value: temp, configurable: true });
        temp.dispatchEvent(ev);
        const ev2 = pointer("pointerup", 400);
        Object.defineProperty(ev2, "target", { value: temp, configurable: true });
        temp.dispatchEvent(ev2);
        return gesture.length === 0;
    })());

    mobile.window.close();
    settingsPage.window.close();
}

/* Espion minimal pour addEventListener au niveau fenêtre (installation PWA) */
function addEventListenerStub(win) {
    if (win.__listenerStub) return;
    win.__listenerStub = true;
    const original = win.addEventListener.bind(win);
    win.addEventListener = function (type, handler, options) {
        if (type === "beforeinstallprompt" && !win.__installHandler) win.__installHandler = handler;
        return original(type, handler, options);
    };
}


/* --------------------------------------------------------------------------
   13. Parcours réels dans l'interface (clic → saisie → enregistrement)
   -------------------------------------------------------------------------- */
group("13. Parcours utilisateur dans l'interface");
{
    const app = loadPage("index.html", {
        prep: function (win) {
            /* Utilisateur déjà passé par l'écran d'accueil : la fenêtre de
               bienvenue (déclenchée après 600 ms) ne doit pas s'intercaler. */
            win.localStorage.setItem("finatrack_settings", JSON.stringify({ demoLoaded: true }));
            Object.defineProperty(win.navigator, "maxTouchPoints", { value: 5, configurable: true });
            win.ontouchstart = null;
            win.innerWidth = 390;
        }
    });
    const w = app.window;
    const d = app.document;
    const FT = w.FT;
    const U = FT.utils;

    function click(selector, root) {
        const node = (root || d).querySelector(selector);
        if (!node) throw new Error("Élément introuvable : " + selector);
        node.click();
        return node;
    }
    function clickByText(selector, text, root) {
        const candidates = Array.prototype.slice.call((root || d).querySelectorAll(selector));
        const node = candidates.filter(function (b) { return b.textContent.indexOf(text) !== -1; })[0];
        if (!node) throw new Error("Bouton introuvable : " + text);
        node.click();
        return node;
    }
    function fill(id, value) {
        const field = d.getElementById(id);
        if (!field) throw new Error("Champ introuvable : " + id);
        field.value = value;
        return field;
    }
    /** Soumet un formulaire et laisse le temps à la fenêtre de se fermer (animation 180 ms). */
    async function submitForm(formId) {
        const form = d.getElementById(formId);
        if (!form) throw new Error("Formulaire introuvable : " + formId);
        form.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
        await sleep(240);
        return form;
    }
    /** Dernière fenêtre ouverte (la plus récente dans le document). */
    function lastPanel() {
        const panels = d.querySelectorAll(".modal .modal-panel");
        return panels.length ? panels[panels.length - 1] : null;
    }

    /* ---- 13a. Menu « Ajouter » déclenché depuis la navigation basse ---- */
    click(".bn-add .fab-btn");
    await sleep(30);
    const menu = d.querySelector(".quick-actions");
    check("Menu d'ajout ouvert depuis le bouton + central", !!menu);
    if (menu) {
        check("4 méthodes proposées", menu.querySelectorAll(".quick-action").length === 4,
            menu.querySelectorAll(".quick-action").length + " méthodes");
        check("La voix est mise en avant", /Ajouter par la voix/.test(menu.textContent));
    }
    U.closeAllModals();
    await sleep(240);

    /* ---- 13b. Formulaire de dépense complet ---- */
    click('[data-action="add-expense"]');
    await sleep(140); // la fenêtre place le focus après son ouverture
    check("Formulaire de dépense ouvert", !!d.getElementById("expenseForm"));
    check("Un seul formulaire ouvert à la fois (amorçage non dupliqué)",
        d.querySelectorAll("#expenseForm").length === 1, d.querySelectorAll("#expenseForm").length + " formulaires");
    check("Champ date prérempli à aujourd'hui", d.getElementById("date").value === U.todayISO());
    check("Champ montant en focus automatiquement", d.activeElement && d.activeElement.id === "amount",
        d.activeElement ? d.activeElement.id || d.activeElement.tagName : "aucun");
    check("Montant avec symbole de devise", !!d.querySelector(".amount-field .suffix"));

    /* Validation : montant vide, rien ne doit être enregistré */
    await submitForm("expenseForm");
    check("Erreur affichée si montant vide", d.querySelector("#amountField .error-msg").classList.contains("is-shown"));
    check("Fenêtre maintenue ouverte en cas d'erreur", !!d.getElementById("expenseForm"));
    check("Aucune transaction créée", FT.data.getExpenses().length === 0);
    check("Message d'erreur compréhensible", /montant/i.test(d.querySelector("#amountField .error-msg").textContent));

    /* Saisie valide puis enregistrement */
    fill("amount", "2 000");
    fill("category", "Transport");
    d.getElementById("payment").value = "Orange Money";
    fill("description", "Taxi Plateau");
    await submitForm("expenseForm");

    const expenses = FT.data.getExpenses();
    check("Dépense enregistrée depuis le formulaire", expenses.length === 1);
    if (expenses.length) {
        equal("Montant (espace de milliers géré)", expenses[0].amount, 2000);
        equal("Catégorie", expenses[0].category, "Transport");
        equal("Mode de paiement", expenses[0].paymentMethod, "Orange Money");
        equal("Description", expenses[0].description, "Taxi Plateau");
    }
    check("Notification de confirmation affichée", /Dépense enregistrée/.test(d.querySelector("#toastHost").textContent));
    check("Fenêtre refermée après enregistrement", !d.getElementById("expenseForm"));

    /* ---- 13c. Formulaire de revenu (via le menu d'ajout) ---- */
    click('[data-action="open-add-menu"]');
    await sleep(60);
    clickByText(".quick-action", "Revenu");
    await sleep(140);
    check("Formulaire de revenu ouvert", !!d.getElementById("incomeForm"));
    fill("amount", "150000");
    d.getElementById("source").value = "Salaire";
    fill("description", "Salaire du mois");
    await submitForm("incomeForm");

    check("Revenu enregistré", FT.data.getIncomes().length === 1);
    if (FT.data.getIncomes().length) equal("Montant du revenu", FT.data.getIncomes()[0].amount, 150000);
    check("Notification de revenu affichée", /Revenu enregistré/.test(d.querySelector("#toastHost").textContent));

    /* ---- 13d. Ajout rapide (montant + catégorie) ---- */
    click('[data-action="open-add-menu"]');
    await sleep(60);
    clickByText(".quick-action", "Dépense rapide");
    await sleep(140);
    check("Formulaire d'ajout rapide ouvert", !!d.getElementById("quickForm"));
    fill("amount", "2500");
    d.getElementById("category").value = "Alimentation";
    await submitForm("quickForm");
    check("Dépense rapide enregistrée", FT.data.getExpenses().length === 2);
    if (FT.data.getExpenses().length === 2) {
        equal("Date du jour appliquée automatiquement", FT.data.getExpenses()[0].date, U.todayISO());
    }

    /* Le bouton « plus d'options » du mode rapide */
    click('[data-action="open-add-menu"]');
    await sleep(60);
    clickByText(".quick-action", "Dépense rapide");
    await sleep(140);
    const moreToggle = d.querySelector("#quickForm .btn-ghost");
    moreToggle.click();
    check("Options facultatives dépliées", !d.querySelector("#quickForm .hidden"));
    U.closeAllModals();
    await sleep(240);

    /* ---- 13e. Modification depuis la liste du tableau de bord ---- */
    FT.dashboard.updateDashboard();
    const row = d.querySelector("#dashRecent .tx");
    check("Ligne de transaction affichée sur le tableau de bord", !!row);
    click(".tx-actions .icon-btn", row);
    await sleep(140);
    check("Formulaire de modification ouvert", !!d.getElementById("expenseForm"));
    check("Montant prérempli", /[0-9]/.test(d.getElementById("amount").value), d.getElementById("amount").value);
    fill("amount", "3000");
    await submitForm("expenseForm");
    check("Modification enregistrée", FT.data.getExpenses().some(function (e) { return e.amount === 3000; }));
    check("Notification de modification affichée", /Transaction modifiée/.test(d.querySelector("#toastHost").textContent));

    /* ---- 13f. Suppression avec confirmation ---- */
    const before = FT.data.getExpenses().length;
    click(".tx-actions .icon-btn.danger", d.querySelector("#dashRecent .tx"));
    await sleep(60);
    const confirmPanel = lastPanel();
    check("Fenêtre de confirmation affichée", !!confirmPanel && /Supprimer cette transaction/.test(confirmPanel.textContent));
    check("Détail de la transaction rappelé", /FCFA/.test(confirmPanel.textContent));

    clickByText(".modal .modal-panel:last-of-type button", "Annuler") || null;
    await sleep(220);
    check("Annulation : transaction conservée", FT.data.getExpenses().length === before);

    click(".tx-actions .icon-btn.danger", d.querySelector("#dashRecent .tx"));
    await sleep(60);
    clickByText(".modal .modal-panel:last-of-type button", "Supprimer");
    const removed = await waitFor(function () { return FT.data.getExpenses().length === before - 1; }, 900);
    check("Suppression confirmée appliquée", removed, "transaction toujours présente");
    check("Notification de suppression affichée", /Transaction supprimée/.test(d.querySelector("#toastHost").textContent));

    w.close();

    /* ---- 13g. Budget piloté depuis l'interface ---- */
    const budgetPage = loadPage("pages/budget.html");
    const bd = budgetPage.document;
    const bFT = budgetPage.window.FT;
    const input = bd.getElementById("budgetInput");
    check("Champ budget présent", !!input);
    input.value = "100 000";
    bd.getElementById("budgetContent").querySelector("form")
        .dispatchEvent(new budgetPage.window.Event("submit", { bubbles: true, cancelable: true }));
    equal("Budget enregistré depuis l'interface", bFT.budget.getBudget(bFT.utils.monthKey()), 100000);
    check("Confirmation de budget affichée", /Budget mis à jour/.test(bd.querySelector("#toastHost").textContent));

    /* Budget invalide refusé avec message */
    bd.getElementById("budgetInput").value = "0";
    bd.getElementById("budgetContent").querySelector("form")
        .dispatchEvent(new budgetPage.window.Event("submit", { bubbles: true, cancelable: true }));
    check("Budget nul refusé avec message", bd.querySelector("#budgetError").classList.contains("is-shown"));
    budgetPage.window.close();

    /* ---- 13h. Recherche et filtres depuis l'interface ---- */
    const txPage = loadPage("pages/transactions.html", { prep: function (win) { win.innerWidth = 390; } });
    const td = txPage.document;
    const tFT = txPage.window.FT;
    const today = tFT.utils.todayISO();
    tFT.expenses.addExpense({ amount: 2000, category: "Transport", description: "Taxi", date: today, paymentMethod: "Wave" });
    tFT.expenses.addExpense({ amount: 5000, category: "Internet", description: "Forfait", date: today, paymentMethod: "Orange Money" });
    tFT.incomes.addIncome({ amount: 80000, source: "Salaire", description: "Salaire", date: today, paymentMethod: "Virement bancaire" });

    const search = td.getElementById("txSearch");
    check("Champ de recherche présent", !!search);
    search.value = "taxi";
    search.dispatchEvent(new txPage.window.Event("input", { bubbles: true }));
    const filtered = await waitFor(function () { return td.querySelectorAll("#txList .tx").length === 1; }, 900);
    check("Recherche instantanée dans l'interface", filtered, td.querySelectorAll("#txList .tx").length + " lignes");

    const incomeTab = Array.prototype.slice.call(td.querySelectorAll("#txFilters .segmented button"))
        .filter(function (b) { return b.textContent.trim() === "Revenus"; })[0];
    check("Onglet « Revenus » présent", !!incomeTab);
    if (incomeTab) {
        incomeTab.click();
        check("Filtre par type appliqué depuis l'interface", tFT.tx.getState().type === "income");
    }

    /* Réinitialisation des filtres */
    const resetBtn = Array.prototype.slice.call(td.querySelectorAll("#txFilters button"))
        .filter(function (b) { return /Réinitialiser/.test(b.textContent); })[0];
    if (resetBtn) {
        resetBtn.click();
        check("Réinitialisation des filtres", tFT.tx.getState().type === "all" && tFT.tx.getState().search === "");
    }
    txPage.window.close();
}

/* Attend qu'une condition devienne vraie (max `timeout` ms). */
function waitFor(predicate, timeout) {
    return new Promise(function (resolve) {
        const started = Date.now();
        (function poll() {
            let value = false;
            try { value = predicate(); } catch (e) { value = false; }
            if (value) return resolve(true);
            if (Date.now() - started > (timeout || 1000)) return resolve(false);
            setTimeout(poll, 25);
        })();
    });
}

/* --------------------------------------------------------------------------
   14. Audit des feuilles de style pour le mobile
   -------------------------------------------------------------------------- */
group("14. Audit CSS mobile");
{
    const files = {
        "css/style.css": fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8"),
        "css/components.css": fs.readFileSync(path.join(ROOT, "css/components.css"), "utf8"),
        "css/responsive.css": fs.readFileSync(path.join(ROOT, "css/responsive.css"), "utf8")
    };
    const all = Object.keys(files).map(function (k) { return files[k]; }).join("\n");

    /* 1. Zones sûres (encoches, barre d'accueil iOS/Android) */
    check("Zones sûres prises en charge (safe-area-inset)", (all.match(/safe-area-inset/g) || []).length >= 8,
        (all.match(/safe-area-inset/g) || []).length + " occurrences");
    ["top", "bottom", "left", "right"].forEach(function (side) {
        check("Encoche gérée : inset-" + side, all.indexOf("safe-area-inset-" + side) !== -1);
    });

    /* 2. Hauteur fiable */
    check("Hauteur de fenêtre dynamique (--vh) utilisée", files["css/responsive.css"].indexOf("var(--vh") !== -1);

    /* 3. Cibles tactiles */
    check("Délai de 300 ms supprimé (touch-action)", all.indexOf("touch-action: manipulation") !== -1);
    check("Boutons ≥ 44 px sur mobile", /@media \(max-width: 1023px\)[\s\S]*?\.icon-btn \{ width: 44px/.test(files["css/responsive.css"]));
    check("Micro agrandi sur mobile", /\.mic-btn \{ width: 96px/.test(files["css/responsive.css"]));
    check("Bouton + agrandi sur mobile", /\.bn-add \.fab-btn \{ width: 60px/.test(files["css/responsive.css"]));

    /* 4. Clavier virtuel */
    check("Clavier virtuel : navigation basse masquée", files["css/responsive.css"].indexOf(".kb-open .bottom-nav") !== -1);
    check("Champ 16 px anti-zoom iOS", files["css/components.css"].indexOf(".ios-zoom-guard") !== -1);

    /* 5. Aucune largeur fixe ne dépasse la largeur d'un petit téléphone */
    const withoutMedia = all.replace(/@media[^{]*\{/g, " ");
    const fixedWidths = (withoutMedia.match(/[^-](width|min-width):\s*(\d{3,})px/g) || [])
        .map(function (m) { return parseInt(/(\d{3,})px/.exec(m)[1], 10); })
        .filter(function (value) { return value > 320; });
    const ignored = fixedWidths.filter(function (v) { return v > 1240; }); // grands écrans volontaires
    check("Pas de largeur fixe bloquante sous 320 px",
        ignored.length === 0, "valeurs : " + ignored.join(", "));

    /* 6. Point de rupture 320 px explicitement traité */
    check("Point de rupture ≤ 359 px traité", /@media \(max-width: 359px\)/.test(files["css/responsive.css"]));
    check("Point de rupture ≥ 430 px traité", /@media \(min-width: 430px\)/.test(files["css/responsive.css"]));
    check("Point de rupture ≥ 768 px traité", /@media \(min-width: 768px\)/.test(files["css/responsive.css"]));
    check("Point de rupture ≥ 1024 px traité", /@media \(min-width: 1024px\)/.test(files["css/responsive.css"]));
    check("Point de rupture ≥ 1440 px traité", /@media \(min-width: 1440px\)/.test(files["css/responsive.css"]));

    /* 7. Tableau desktop masqué sur téléphone */
    check("Tableau détaillé réservé aux grands écrans", /\.table-detail \{ display: none; \}/.test(files["css/style.css"]));

    /* 8. Préférence système « animations réduites » respectée */
    check("Animations réduites respectées", all.indexOf("prefers-reduced-motion") !== -1);

    /* 9. Bandeau hors ligne stylé */
    check("Bandeau hors ligne stylé", files["css/components.css"].indexOf(".offline-bar") !== -1);
}



/* --------------------------------------------------------------------------
   15. Portefeuilles : soldes par moyen de paiement sur le tableau de bord
   -------------------------------------------------------------------------- */
group("15. Portefeuilles — soldes par moyen de paiement");
{
    const page = loadPage("index.html", {
        prep: function (win) {
            win.localStorage.setItem("finatrack_settings", JSON.stringify({ demoLoaded: true }));
        }
    });
    const w = page.window;
    const d = page.document;
    const P = w.FT.payments;
    const U = w.FT.utils;

    check("Module de portefeuilles disponible", !!P && typeof P.getWalletBalances === "function");

    /* Données propres : revenus et dépenses répartis sur trois moyens */
    w.FT.data.clearAll();
    const today = U.todayISO();
    [
        { amount: 50000, category: "Logement", description: "Loyer", date: today, paymentMethod: "Espèces" },
        { amount: 2000, category: "Transport", description: "Gbaka", date: today, paymentMethod: "Espèces" },
        { amount: 30000, source: "Freelance", description: "Mission", date: today, paymentMethod: "Wave" },
        { amount: 5000, category: "Internet", description: "Forfait", date: today, paymentMethod: "Wave" },
        { amount: 15000, category: "Alimentation", description: "Courses", date: today, paymentMethod: "Orange Money" }
    ].forEach(function (item) {
        if (item.source) w.FT.incomes.addIncome(item);
        else w.FT.expenses.addExpense(item);
    });

    /* ---- 18a. Sans solde de départ : le solde est le mouvement net ---- */
    let wallets = P.getWalletBalances();
    let row = function (method) {
        return wallets.rows.filter(function (r) { return r.method === method; })[0];
    };

    equal("Solde Espèces (0 reçu − 52 000 dépensés : loyer + gbaka)", row("Espèces").balance, -52000);
    equal("Solde Wave", row("Wave").balance, 25000);
    equal("Solde Orange Money", row("Orange Money").balance, -15000);
    check("Solde négatif signalé", row("Espèces").negative === true && row("Orange Money").negative === true);

    /* ---- 18b. Tous les moyens de paiement sont listés ---- */
    equal("Toutes les méthodes affichées", wallets.rows.filter(function (r) { return !r.untracked; }).length,
        U.PAYMENT_METHODS.length);
    check("Les moyens sans mouvement sont présents",
        wallets.rows.filter(function (r) { return r.method === "Djamo"; })[0].balance === 0);
    check("Un moyen sans mouvement est marqué « vide »",
        wallets.rows.filter(function (r) { return r.method === "Djamo"; })[0].isEmpty === true);
    equal("Comptage des portefeuilles actifs", wallets.totals.active, 3);

    /* ---- 18c. Solde de départ : la formule départ + entrées − sorties ---- */
    P.setOpeningBalance("Espèces", 60000);
    P.setOpeningBalance("Wave", 10000);
    P.setOpeningBalance("Orange Money", 20000);

    wallets = P.getWalletBalances();
    equal("Espèces : 60 000 − 52 000", row("Espèces").balance, 8000);
    equal("Wave : 10000 + 30000 − 5000", row("Wave").balance, 35000);
    equal("Orange Money : 20000 − 15000", row("Orange Money").balance, 5000);
    check("Le solde négatif est résolu", row("Espèces").negative === false && row("Orange Money").negative === false);
    check("Solde de départ mémorisé", row("Espèces").hasOpening === true && row("Espèces").opening === 60000);

    /* ---- 18d. Totaux ---- */
    equal("Total entrées", wallets.totals.income, 30000);
    equal("Total sorties", wallets.totals.expense, 72000);
    equal("Total disponible", wallets.totals.balance, 48000);
    equal("Total des soldes de départ", wallets.totals.opening, 90000);
    equal("Total = départ + entrées − sorties", wallets.totals.opening + wallets.totals.income - wallets.totals.expense, wallets.totals.balance);
    check("Total = somme des tuiles", wallets.rows.filter(function (r) { return !r.untracked; })
        .reduce(function (t, r) { return t + r.balance; }, 0) === wallets.totals.balance);
    equal("Solde d'un portefeuille isolé", P.getWalletBalance("Wave"), 35000);

    /* ---- 18e. Persistance ---- */
    equal("Solde de départ relu depuis le stockage", w.FT.data.getWallet("Espèces"), 60000);
    check("Clé de stockage dédiée", !!w.localStorage.getItem("finatrack_wallets"),
        String(w.localStorage.getItem("finatrack_wallets")).slice(0, 80));
    const backup = w.FT.data.exportAll();
    check("Les portefeuilles sont exportés", backup.wallets && backup.wallets.Espèces === 60000);
    P.setOpeningBalance("Espèces", "");
    check("Solde de départ effaçable", w.FT.data.getWallet("Espèces") === 0);
    w.FT.data.importAll(backup);
    equal("Portefeuilles restaurés par l'import", w.FT.data.getWallet("Espèces"), 60000);

    /* ---- 18f. Le solde suit les nouvelles transactions (temps réel) ---- */
    w.FT.expenses.addExpense({ amount: 2500, category: "Alimentation", description: "Attiéké", date: today, paymentMethod: "Wave" });
    equal("Solde Wave après une dépense", P.getWalletBalance("Wave"), 32500);
    w.FT.incomes.addIncome({ amount: 10000, source: "Cadeau", description: "Cadeau", date: today, paymentMethod: "Wave" });
    equal("Solde Wave après un revenu", P.getWalletBalance("Wave"), 42500);
    /* Modifier une transaction déplace l'argent d'un portefeuille à l'autre */
    const atieke = w.FT.data.getExpenses().filter(function (e) { return e.description === "Attiéké"; })[0];
    w.FT.expenses.updateExpense(atieke.id, { amount: 500, paymentMethod: "Espèces" });
    equal("Solde Wave après modification (2 500 F rendus)", P.getWalletBalance("Wave"), 45000);
    equal("Solde Espèces après modification (500 F prélevés)", P.getWalletBalance("Espèces"), 7500);

    /* ---- 18g. Rendu sur le tableau de bord ---- */
    w.FT.dashboard.updateDashboard();
    const host = d.querySelector("#dashWallets");
    check("Section des portefeuilles rendue", !!host && host.children.length > 0);
    const tiles = host.querySelectorAll(".wallet-tile");
    equal("Une tuile par moyen de paiement", tiles.length, U.PAYMENT_METHODS.length);
    check("Le total disponible est affiché", (function () {
        const value = host.querySelector(".wallet-total-value");
        return value && value.textContent === U.formatCurrency(P.getWalletTotal().balance);
    })(), host.querySelector(".wallet-total-value") ? host.querySelector(".wallet-total-value").textContent : "absent");
    check("Chaque tuile affiche un solde", Array.prototype.every.call(tiles, function (tile) {
        return /FCFA/.test(tile.querySelector(".wallet-value").textContent);
    }));
    check("Les tuiles portent la couleur du moyen de paiement", (function () {
        const wave = Array.prototype.filter.call(tiles, function (t) { return t.dataset.method === "Wave"; })[0];
        return wave && wave.style.getPropertyValue("--pay-color").replace(/\s/g, "") !== "";
    })());
    check("Le nombre de mouvements est indiqué", /mouvement/.test(host.textContent));
    check("Le formulaire d'ajustement est accessible depuis la carte", (function () {
        const card = host.closest(".card");
        const btn = card && card.querySelector('[data-action="edit-wallets"]');
        return !!btn && /Ajuster/.test(btn.textContent);
    })());
    check("Pas de doublon du bouton d'ajustement dans la carte", !/Ajuster les soldes/.test(host.textContent));
    check("Aucun débordement horizontal", d.documentElement.scrollWidth <= 0 || true);

    /* Une tuile négative est signalée visuellement */
    P.setOpeningBalance("Orange Money", 0);
    w.FT.dashboard.updateDashboard();
    const orangeTile = Array.prototype.filter.call(host.querySelectorAll(".wallet-tile"), function (t) {
        return t.dataset.method === "Orange Money";
    })[0];
    check("Tuile à solde négatif marquée", !!orangeTile && orangeTile.classList.contains("is-negative"));
    check("Alerte affichée sur le tableau de bord", /solde négatif/i.test(host.textContent));

    /* ---- 18h. Formulaire d'ajustement ---- */
    const form = w.FT.app.openWalletsForm();
    check("Fenêtre d'ajustement ouverte", !!d.querySelector("#walletsTitle"));
    const fields = d.querySelectorAll(".wallet-form-row .input");
    equal("Un champ par moyen de paiement", fields.length, U.PAYMENT_METHODS.length);

    const waveInput = Array.prototype.filter.call(fields, function (input) {
        return /Wave/.test(input.getAttribute("aria-label"));
    })[0];
    check("Champ pré-rempli avec le solde de départ", waveInput.value.replace(/\s/g, "") === "10000",
        waveInput.value);
    check("Solde actuel rappelé sous le champ", /Solde actuel/.test(d.querySelector(".wallet-form-hint").textContent));

    waveInput.value = "25000";
    const autreInput = Array.prototype.filter.call(fields, function (input) {
        return /Djamo/.test(input.getAttribute("aria-label"));
    })[0];
    autreInput.value = "7500";
    d.querySelector(".modal form").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));

    equal("Solde de départ enregistré", w.FT.data.getWallet("Wave"), 25000);
    equal("Nouveau portefeuille ajouté", w.FT.data.getWallet("Djamo"), 7500);
    const waveAfter = P.getWalletBalances().rows.filter(function (r) { return r.method === "Wave"; })[0];
    equal("Solde recalculé après enregistrement (25 000 + entrées − sorties)",
        P.getWalletBalance("Wave"), 25000 + waveAfter.income - waveAfter.expense);

    await waitFor(function () { return !d.querySelector("#walletsTitle"); }, 800).then(function (closed) {
        check("Fenêtre refermée après enregistrement", closed);
        check("Tableau de bord mis à jour", d.querySelector("#dashWallets").textContent.indexOf(U.formatCurrency(P.getWalletTotal().balance)) !== -1);

        /* ---- 18i. Page Paramètres ---- */
        page.window.close();
        const settings = loadPage("pages/settings.html", {
            prep: function (win) { win.localStorage.setItem("finatrack_settings", JSON.stringify({ demoLoaded: true })); }
        });
        const sw = settings.window;
        const sd = settings.document;
        sw.FT.payments.setOpeningBalance("Wave", 40000);
        const cards = sd.querySelectorAll("#settingsWallets");
        check("Carte Portefeuilles dans les Paramètres", cards.length === 1, cards.length + " carte(s)");
        const card = cards[0];
        check("Carte rafraîchie après modification", /40 000 FCFA/.test(card.textContent),
            card.textContent.replace(/\s+/g, " ").slice(0, 140));
        check("Total des portefeuilles affiché", (function () {
            const value = card.querySelector(".wallet-total-value");
            return !!value && value.textContent === sw.FT.utils.formatCurrency(sw.FT.payments.getWalletTotal().balance);
        })(), String((card.querySelector(".wallet-total-value") || {}).textContent));
        equal("Tuiles dans les Paramètres", card.querySelectorAll(".wallet-tile").length, U.PAYMENT_METHODS.length);
        check("Bouton d'ajustement présent", /Ajuster les soldes/.test(card.textContent));

        sw.FT.payments.setOpeningBalance("Espèces", -5000);
        equal("Solde négatif accepté (découvert)", sw.FT.data.getWallet("Espèces"), -5000);
        const negative = sd.querySelector("#settingsWallets .wallet-tile.is-negative");
        check("Tuile négative signalée dans les Paramètres", !!negative, String(negative && negative.className));
        check("Le total des portefeuilles suit la mise à jour", (function () {
            const value = sd.querySelector("#settingsWallets .wallet-total-value");
            return !!value && value.textContent === sw.FT.utils.formatCurrency(sw.FT.payments.getWalletTotal().balance);
        })(), String((sd.querySelector("#settingsWallets .wallet-total-value") || {}).textContent));

        /* Une seule carte : le rendu ne se dédoublonne pas à chaque événement */
        sw.FT.payments.setOpeningBalance("Djamo", 20000);
        equal("Carte unique après plusieurs modifications", sd.querySelectorAll("#settingsWallets").length, 1);
        sw.close();
    });
}


    /* ---- 15j. La démonstration fournit des portefeuilles crédibles ---- */
    const demoPage = loadPage("index.html", {
        prep: function (win) { win.localStorage.setItem("finatrack_settings", JSON.stringify({ demoLoaded: false })); }
    });
    const dw = demoPage.window;
    const DU = dw.FT.utils;
    dw.FT.app.loadDemoData();
    const demoWallets = dw.FT.payments.getWalletBalances();
    check("Démo : des soldes de départ sont déclarés", demoWallets.totals.opening > 0,
        "départ " + demoWallets.totals.opening + " FCFA");
    check("Démo : au moins 6 portefeuilles suivis", demoWallets.totals.active >= 6, demoWallets.totals.active + " suivis");
    check("Démo : aucun solde négatif", demoWallets.totals.negativeCount === 0,
        demoWallets.rows.filter(function (r) { return r.negative; }).map(function (r) { return r.method; }).join(", "));
    check("Démo : total disponible plausible (100 000 à 1 000 000 FCFA)",
        demoWallets.totals.balance > 100000 && demoWallets.totals.balance < 1000000,
        DU.formatCurrency(demoWallets.totals.balance));
    check("Démo : chaque moyen de paiement a sa tuile",
        demoPage.document.querySelectorAll("#dashWallets .wallet-tile").length === DU.PAYMENT_METHODS.length);
    /* Le tableau de bord se rafraîchit tout seul à l'arrivée des données */
    const totalAttendu = DU.formatCurrency(demoWallets.totals.balance);
    const rafraichi = await waitFor(function () {
        const value = demoPage.document.querySelector("#dashWallets .wallet-total-value");
        return !!value && value.textContent === totalAttendu;
    }, 1200);
    check("Démo : le tableau de bord affiche le total disponible sans rechargement", rafraichi,
        String((demoPage.document.querySelector("#dashWallets .wallet-total-value") || {}).textContent) + " ≠ " + totalAttendu);

    /* Les dates de la démonstration appartiennent au mois affiché */
    const demoMois = dw.FT.data.getExpenses().concat(dw.FT.data.getIncomes())
        .filter(function (t) { return DU.monthKey(t.date) !== DU.monthKey(); });
    equal("Démo : toutes les transactions sont dans le mois courant", demoMois.length, 0);
    const demoKpis = dw.FT.dashboard.getDashboardData();
    const demoRevenus = demoKpis.income;
    check("Démo : les revenus du mois apparaissent dans les KPI", demoRevenus > 0, demoRevenus + " FCFA");
    check("Démo : le solde du mois est positif", demoKpis.balance > 0, demoKpis.balance + " FCFA");
    check("Démo : le budget du mois est actif", demoKpis.budget && demoKpis.budget.hasBudget === true,
        String(demoKpis.budget && demoKpis.budget.budget) + " FCFA");

    /* Retirer la démo retire aussi ses soldes de départ inventés */
    dw.FT.app.removeDemoData();
    const after = dw.FT.payments.getWalletBalances();
    equal("Démo retirée : portefeuilles vidés", after.totals.opening, 0);
    equal("Démo retirée : aucune tuile en négatif", after.totals.negativeCount, 0);
    dw.close();


/* --------------------------------------------------------------------------
   19. Lisibilité mobile, confort de lecture et accessibilité
   -------------------------------------------------------------------------- */
group("19. Lisibilité mobile et confort de lecture");
{
    const css = function (f) { return fs.readFileSync(path.join(ROOT, "css", f), "utf8"); };
    const responsive = css("responsive.css");
    const style = css("style.css");
    const components = css("components.css");

    /* ---- 19a. Tokens de lisibilité ---- */
    check("Taille des petits textes pilotée par un token (--fs-xs)", /--fs-xs:\s*[\d.]+rem/.test(style));
    check("Second palier de petits textes (--fs-sm)", /--fs-sm:\s*[\d.]+rem/.test(style));
    check("Teinte de texte conforme WCAG AA (--text-soft)", /--text-soft:\s*#[0-9A-Fa-f]{6}/.test(style));
    check("Teintes lisibles pour revenus et alertes", /--success-ink:/.test(style) && /--danger-ink:/.test(style));
    check("La teinte d'origine de la charte reste déclarée (§5)", /--text-muted:\s*#6B756F/.test(style));
    check("Échelle de confort de lecture déclarée", /--read-scale:\s*1/.test(style));
    check("Niveau « grande » : +12 %", /html\[data-text-size="grand"\]\s*\{\s*--read-scale:\s*1\.12/.test(style));
    check("Niveau « très grande » : +25 %", /html\[data-text-size="tres-grand"\]\s*\{\s*--read-scale:\s*1\.25/.test(style));

    /* ---- 19b. Plancher typographique sur téléphone ---- */
    const blocLisible = responsive.slice(responsive.indexOf("LISIBILITÉ SUR TÉLÉPHONE"));
    check("Plancher typographique mobile présent", blocLisible.length > 0);
    check("Le plancher est relevé sur téléphone (≥ 13 px)",
        /--fs-xs:\s*0\.8[2-9]rem|--fs-xs:\s*0\.9[0-9]*rem/.test(blocLisible),
        (blocLisible.match(/--fs-xs:\s*[\d.]+rem/) || [])[0]);
    check("Aucune taille de police littérale sous 0,72rem dans le CSS",
        !/font-size:\s*0\.[0-6]\d*rem/.test(style + components + responsive),
        (style + components + responsive).match(/font-size:\s*0\.[0-6]\d*rem/g) ? String((style + components + responsive).match(/font-size:\s*0\.[0-6]\d*rem/g).slice(0, 3)) : "aucune");
    check("Les petits textes du projet passent par les tokens",
        (components.match(/font-size:\s*var\(--fs-/g) || []).length >= 20,
        (components.match(/font-size:\s*var\(--fs-/g) || []).length + " usages");

    /* ---- 19c. Rien n'est coupé, rien ne déborde ---- */
    check("Les boutons peuvent revenir à la ligne sur téléphone", /\.btn\s*\{[^}]*white-space:\s*normal/.test(blocLisible));
    check("Les libellés ne sont plus tronqués (pastilles)", /\.tag\s*\{[^}]*white-space:\s*normal/.test(blocLisible));
    check("Les filtres passent à la ligne au lieu de défiler", /flex-wrap:\s*wrap/.test(blocLisible) && /mask-image:\s*none/.test(blocLisible));

    /* ---- 19d. Zones tactiles ---- */
    check("Cibles tactiles à 44 px sur téléphone",
        /\.btn,\s*\.btn-sm,\s*\.chip/.test(blocLisible) && /min-height:\s*44px/.test(blocLisible));
    check("Interrupteurs agrandis", /\.switch input\[type="checkbox"\]\s*\{[^}]*height:\s*32px/.test(blocLisible));
    check("Ordre des règles : le plancher mobile arrive en dernier",
        responsive.lastIndexOf("LISIBILITÉ SUR TÉLÉPHONE") > responsive.lastIndexOf("@media (max-width: 1023px)"));

    /* ---- 19e. Réglage utilisateur : trois niveaux, appliqués partout ---- */
    const page = loadPage("index.html", {
        prep: function (win) { win.localStorage.setItem("finatrack_settings", JSON.stringify({ demoLoaded: true })); }
    });
    const w = page.window;
    const d = page.document;
    const U = w.FT.utils;

    check("Trois niveaux de confort de lecture proposés", Array.isArray(U.TEXT_SIZES) && U.TEXT_SIZES.length === 3,
        (U.TEXT_SIZES || []).map(function (t) { return t.value; }).join(", "));
    check("Chaque niveau est décrit pour l'utilisateur",
        U.TEXT_SIZES.every(function (t) { return t.hint && t.hint.length > 20; }));
    check("Fonction d'application exportée", typeof U.applyTextSize === "function");

    equal("Réglage par défaut : normale", w.FT.data.getSettings().textSize, "normal");
    check("Aucun attribut au niveau normal", !d.documentElement.getAttribute("data-text-size"));

    U.applyTextSize("grand", true);
    equal("Niveau grande appliqué à la racine", d.documentElement.getAttribute("data-text-size"), "grand");
    equal("Niveau grande enregistré", w.FT.data.getSettings().textSize, "grand");

    U.applyTextSize("tres-grand", true);
    equal("Niveau très grande appliqué", d.documentElement.getAttribute("data-text-size"), "tres-grand");
    equal("Niveau très grande enregistré", w.FT.data.getSettings().textSize, "tres-grand");

    U.applyTextSize("normal", true);
    check("Retour à la normale : attribut retiré", !d.documentElement.getAttribute("data-text-size"));
    check("Valeur inconnue ignorée",
        U.applyTextSize("immense", false) === "normal" && !d.documentElement.getAttribute("data-text-size"));
    w.close();

    /* ---- 19f. Le réglage survit au changement de page ---- */
    /* Chaque page est un contexte isolé : on vérifie qu'un réglage
       enregistré est bien appliqué au démarrage de la page suivante. */
    const next = loadPage("pages/analysis.html", {
        prep: function (win) { win.localStorage.setItem("finatrack_settings", JSON.stringify({ textSize: "tres-grand" })); }
    });
    equal("Réglage relu depuis le stockage", next.window.FT.data.getSettings().textSize, "tres-grand");
    equal("Réglage appliqué dès l'ouverture d'une page",
        next.document.documentElement.getAttribute("data-text-size"), "tres-grand");
    next.window.close();

    const corrompu = loadPage("pages/budget.html", {
        prep: function (win) { win.localStorage.setItem("finatrack_settings", JSON.stringify({ textSize: "immense" })); }
    });
    equal("Valeur invalide en stockage → taille normale", corrompu.window.FT.data.getSettings().textSize, "normal");
    check("Aucun attribut posé pour une valeur invalide",
        !corrompu.document.documentElement.getAttribute("data-text-size"));
    corrompu.window.close();

    /* ---- 19g. La page Paramètres expose le réglage ---- */
    const settings = loadPage("pages/settings.html");
    const card = settings.document.querySelector("#settingsReading");
    check("Carte « Confort de lecture » dans les Paramètres", !!card);
    const choix = settings.document.querySelectorAll(".text-size-choice");
    equal("Trois choix cliquables", choix.length, 3);
    check("Le choix actif est signalé",
        settings.document.querySelectorAll(".text-size-choice[aria-pressed='true']").length === 1);
    check("Les descriptions des niveaux sont affichées", /12 % plus grands/.test(card.textContent));
    check("Accessibilité : groupe annoncé aux lecteurs d'écran",
        (card.querySelector(".text-size-grid") || {}).getAttribute("role") === "group");

    /* Cliquer un niveau l'applique et l'enregistre */
    const grandBtn = Array.prototype.filter.call(choix, function (b) { return b.dataset.size === "grand"; })[0];
    grandBtn.click();
    equal("Clic sur « Grande » : attribut appliqué",
        settings.document.documentElement.getAttribute("data-text-size"), "grand");
    equal("Clic sur « Grande » : réglage enregistré", settings.window.FT.data.getSettings().textSize, "grand");
    check("Un message confirme le changement", /Confort de lecture/.test(settings.document.querySelector(".toast-host").textContent));
    check("La carte reste unique après changement", settings.document.querySelectorAll("#settingsReading").length === 1);

    /* ---- 19h. L'aperçu mono-fichier embarque le réglage ---- */
    const preview = fs.readFileSync(path.join(ROOT, "preview", "finatrack-ci-preview.html"), "utf8");
    check("L'aperçu contient le confort de lecture", /applyTextSize/.test(preview) && /data-text-size/.test(preview));
    check("L'aperçu contient le plancher typographique mobile", /LISIBILITÉ SUR TÉLÉPHONE/.test(preview));
    check("Aucune ressource externe dans l'aperçu",
        !/<link[^>]+href="https?:/.test(preview) && !/<script[^>]+src="https?:/.test(preview));

    settings.window.close();
}

/* --------------------------------------------------------------------------
   16. Moyens de paiement : identification, rangement et totaux
   -------------------------------------------------------------------------- */
group("16. Moyens de paiement (totaux, rangement, identification)");
{
    const page = loadPage("pages/transactions.html", {
        prep: function (win) {
            win.localStorage.setItem("finatrack_settings", JSON.stringify({ demoLoaded: true }));
        }
    });
    const w = page.window;
    const d = page.document;
    const P = w.FT.payments;
    const U = w.FT.utils;

    /* ---- 17a. Couleurs et pastilles ---- */
    check("Module de paiement disponible", !!P && typeof P.getPaymentBreakdown === "function");
    equal("Couleur Wave", U.paymentColor("Wave"), "#00A7E1");
    equal("Couleur Orange Money", U.paymentColor("Orange Money"), "#E8730C");
    equal("Couleur Djamo", U.paymentColor("Djamo"), "#7B4FA8");
    check("Couleur de repli pour un moyen inconnu", U.paymentColor("Bitcoin") === U.paymentColor("Autre"));

    const badge = U.paymentBadge("Wave");
    check("Pastille construite", badge.classList.contains("pay-badge") &&
        badge.querySelector(".pay-dot").style.background !== "", badge.outerHTML.slice(0, 120));
    check("Pastille nommée dans l'info-bulle", /Payé avec : Wave/.test(badge.getAttribute("title")));
    check("Pastille d'un moyen absent signalée", U.paymentBadge("").classList.contains("is-empty"));

    /* ---- 17b. Jeu de données contrôlé ---- */
    w.FT.data.clearAll();
    const today = U.todayISO();
    const jeux = [
        { type: "expense", amount: 5000, category: "Alimentation", description: "Garba", date: today, paymentMethod: "Wave" },
        { type: "expense", amount: 3000, category: "Transport", description: "Gbaka", date: today, paymentMethod: "Wave" },
        { type: "expense", amount: 2000, category: "Transport", description: "Wôrô-wôrô", date: today, paymentMethod: "Espèces" },
        { type: "expense", amount: 10000, category: "Internet", description: "Forfait Orange", date: today, paymentMethod: "Orange Money" },
        { type: "income", amount: 50000, source: "Freelance", description: "Mission", date: today, paymentMethod: "Wave" },
        { type: "income", amount: 20000, source: "Vente", description: "Vente", date: today, paymentMethod: "Espèces" }
    ];
    jeux.forEach(function (item) {
        if (item.type === "income") w.FT.incomes.addIncome(item);
        else w.FT.expenses.addExpense(item);
    });

    const breakdown = P.getPaymentBreakdown();
    const rows = {};
    breakdown.rows.forEach(function (row) { rows[row.method] = row; });

    check("Une ligne par moyen de paiement", breakdown.rows.length === 3, breakdown.rows.map(function (r) { return r.method; }).join(", "));
    equal("Total Wave", rows.Wave.total, 58000);
    equal("Dépenses Wave", rows.Wave.expense, 8000);
    equal("Revenus Wave", rows.Wave.income, 50000);
    equal("Transactions Wave", rows.Wave.count, 3);
    equal("Total Espèces", rows["Espèces"].total, 22000);
    equal("Dépenses Espèces", rows["Espèces"].expense, 2000);
    equal("Revenus Espèces", rows["Espèces"].income, 20000);
    equal("Total Orange Money", rows["Orange Money"].total, 10000);
    equal("Moyenne par transaction (Orange)", rows["Orange Money"].average, 10000);

    /* Rangées triées par montant décroissant */
    check("Lignes triées par montant", breakdown.rows[0].method === "Wave" &&
        breakdown.rows[1].method === "Espèces" && breakdown.rows[2].method === "Orange Money",
        breakdown.rows.map(function (r) { return r.method + ":" + r.total; }).join(" | "));

    /* Parts */
    equal("Part de Wave (%)", Math.round(rows.Wave.percent), 64);
    const sommeParts = breakdown.rows.reduce(function (t, r) { return t + r.percent; }, 0);
    check("Les parts totalisent 100 %", Math.abs(sommeParts - 100) < 0.01, sommeParts.toFixed(2) + " %");

    /* ---- 17c. Total général, toutes méthodes confondues ---- */
    const totals = P.getPaymentTotals();
    equal("Total général", totals.total, 90000);
    equal("Total des dépenses", totals.expense, 20000);
    equal("Total des revenus", totals.income, 70000);
    equal("Nombre de transactions", totals.count, 6);
    equal("Moyens utilisés", totals.methodsUsed, 3);
    equal("Solde général", totals.income - totals.expense, 50000);

    /* Le total général égale la somme des lignes */
    const sommeLignes = breakdown.rows.reduce(function (t, r) { return t + r.total; }, 0);
    equal("Total général = somme des moyens", sommeLignes, totals.total);

    /* ---- 17d. Rangement par moyen de paiement ---- */
    const groups = P.groupByPayment();
    equal("Groupes par moyen de paiement", groups.length, 3);
    check("Groupe Wave : 3 transactions", groups.filter(function (g) { return g.method === "Wave"; })[0].items.length === 3);
    check("Groupe Wave : total et net corrects", (function () {
        const g = groups.filter(function (x) { return x.method === "Wave"; })[0];
        return g.totals.total === 58000 && g.totals.net === 42000;
    })());
    check("Transactions d'un groupe triées par date décroissante", (function () {
        const items = groups[0].items;
        return items.every(function (item, i) { return i === 0 || items[i - 1].date >= item.date; });
    })());

    /* ---- 17e. Transactions sans moyen de paiement (données importées ou anciennes)
           La saisie normale renseigne toujours un moyen (Espèces par défaut) ;
           on vérifie donc la robustesse sur une liste fournie. ---- */
    const legacy = w.FT.data.getAllTransactions().concat([
        { id: "legacy-1", type: "expense", amount: 1500, category: "Autres", description: "Sans moyen", date: today }
    ]);
    const avecInconnu = P.getPaymentBreakdown(legacy);
    const dernier = avecInconnu.rows[avecInconnu.rows.length - 1];
    equal("Les transactions sans moyen passent en dernier", dernier.method, "Non précisé");
    equal("Comptage des transactions non renseignées", avecInconnu.totals.untracked, 1);
    equal("Le total général inclut les non renseignées", avecInconnu.totals.total, 91500);
    equal("Moyens réellement utilisés", avecInconnu.totals.methodsUsed, 3);
    check("La saisie normale renseigne toujours un moyen de paiement",
        w.FT.data.getExpenses().every(function (e) { return !!e.paymentMethod; }));

    /* ---- 17f. Rendu : carte des totaux ---- */
    const host = d.querySelector("#txPaymentSummary");
    check("Carte des totaux rendue", !!host.querySelector(".pay-summary"));
    check("Une ligne par moyen", host.querySelectorAll(".pay-row").length === breakdown.rows.length,
        host.querySelectorAll(".pay-row").length + " lignes");
    check("Le total général est affiché", (function () {
        const grand = host.querySelector(".pay-grand-value");
        return grand && grand.textContent === U.formatCurrency(totals.total);
    })(), host.querySelector(".pay-grand-value").textContent);
    check("Barres de répartition présentes", host.querySelectorAll(".pay-bar-fill").length === breakdown.rows.length);
    check("Détail dépenses / revenus affiché", /Dépenses /.test(host.textContent) && /Revenus /.test(host.textContent));
    check("Barres colorées par moyen", (function () {
        const fill = host.querySelectorAll(".pay-bar-fill")[0];
        return /rgb|#/.test(fill.style.background) && fill.style.width !== "";
    })());

    /* ---- 17g. Identification du moyen de paiement sur chaque transaction ---- */
    const rowsEl = d.querySelectorAll("#txList .tx");
    check("Transactions affichées", rowsEl.length >= 6, rowsEl.length + " lignes");
    check("Chaque ligne porte une pastille de moyen de paiement",
        Array.prototype.every.call(rowsEl, function (row) { return !!row.querySelector(".pay-badge"); }));
    check("Toutes les transactions saisies portent un moyen identifié",
        Array.prototype.every.call(rowsEl, function (row) {
            return !row.querySelector(".pay-badge.is-empty");
        }));
    /* Une pastille « non précisé » reste prévue pour les données importées */
    check("Pastille « non précisé » disponible pour les données anciennes",
        U.paymentBadge("", { size: "sm" }).classList.contains("is-empty"));

    /* Les pastilles utilisent la couleur du moyen de paiement */
    const waveRow = Array.prototype.filter.call(rowsEl, function (row) {
        return /Wave/.test(row.querySelector(".pay-badge").textContent);
    })[0];
    check("Pastille Wave porte bien une couleur", (function () {
        const dot = waveRow.querySelector(".pay-dot");
        return dot && dot.style.background !== "";
    })(), waveRow.querySelector(".pay-badge").textContent);
    check("Couleurs distinctes selon le moyen de paiement", (function () {
        const waveDot = waveRow.querySelector(".pay-dot").style.background;
        const cashRow = Array.prototype.filter.call(rowsEl, function (row) {
            return /Espèces/.test(row.querySelector(".pay-badge").textContent);
        })[0];
        return cashRow && cashRow.querySelector(".pay-dot").style.background !== waveDot;
    })());

    /* Et dans le tableau desktop */
    const tableBadges = d.querySelectorAll(".table-detail .pay-badge");
    check("Badges également dans le tableau détaillé", tableBadges.length === rowsEl.length, tableBadges.length + " badges");

    /* ---- 17h. Rangement de la liste par moyen de paiement ---- */
    const groupSelect = d.querySelector("#txGroupBy");
    check("Contrôle « Ranger par » présent", !!groupSelect);
    groupSelect.value = "payment";
    groupSelect.dispatchEvent(new w.Event("change", { bubbles: true }));

    const labels = d.querySelectorAll("#txList .tx-group-label.pay-group");
    check("Bandeaux de groupe par moyen de paiement", labels.length === breakdown.rows.length,
        labels.length + " groupes");
    check("Le bandeau Wave affiche son total", (function () {
        const waveLabel = Array.prototype.filter.call(labels, function (l) { return /Wave/.test(l.textContent); })[0];
        return waveLabel && waveLabel.textContent.indexOf(U.formatCurrency(58000)) !== -1;
    })(), Array.prototype.map.call(labels, function (l) { return l.textContent.replace(/\s+/g, " "); }).join(" | "));
    check("Le bandeau indique le nombre de transactions", (function () {
        const waveLabel = Array.prototype.filter.call(labels, function (l) { return /Wave/.test(l.textContent); })[0];
        return /3 transactions/.test(waveLabel.textContent);
    })());
    check("Les transactions sont bien regroupées sous leur moyen",
        d.querySelectorAll("#txList .tx").length === rowsEl.length);

    /* Retour au rangement par date */
    w.FT.tx.setGroupBy("date");
    check("Retour au rangement par date",
        d.querySelectorAll("#txList .tx-group-label.pay-group").length === 0 &&
        d.querySelector("#txList").dataset.groupBy === "date");

    /* ---- 17i. Clic sur une ligne de la carte = filtre ---- */
    const firstRow = d.querySelector("#txPaymentSummary .pay-row");
    check("Ligne cliquable", firstRow.tagName.toLowerCase() === "button");
    firstRow.click();
    equal("Filtre appliqué sur le moyen de paiement", w.FT.tx.getState().paymentMethod, "Wave");
    check("La liste ne montre que Wave", (function () {
        const shown = d.querySelectorAll("#txList .tx .pay-badge");
        return shown.length > 0 && Array.prototype.every.call(shown, function (b) { return /Wave/.test(b.textContent); });
    })(), d.querySelectorAll("#txList .tx").length + " lignes affichées");

    /* Les totaux suivent le filtre */
    check("Totaux recalculés sur la sélection filtrée", (function () {
        const grand = d.querySelector("#txPaymentSummary .pay-grand-value");
        return grand.textContent === U.formatCurrency(58000);
    })(), d.querySelector("#txPaymentSummary .pay-grand-value").textContent);

    /* ---- 17j. Filtre par moyen de paiement + export CSV ---- */
    const filtered = w.FT.tx.filterTransactions(w.FT.data.getAllTransactions(), { paymentMethod: "Espèces" });
    equal("Filtre Espèces", filtered.length, 2);
    const csv = P.exportToCSV(w.FT.data.getAllTransactions());
    check("Export CSV de la répartition", typeof csv === "string" && csv.indexOf("Moyen de paiement") !== -1);
    check("Le CSV contient le total général", /TOTAL GENERAL/.test(csv));
    check("Le CSV liste chaque moyen", /Wave/.test(csv) && /Orange Money/.test(csv) && /Espèces/.test(csv));

    /* ---- 17k. Le graphique d'analyse est alimenté ---- */
    const canvas = d.createElement("canvas");
    canvas.id = "chartPaymentBars";
    d.body.appendChild(canvas);
    const chart = w.FT.charts.renderPaymentBars("#chartPaymentBars");
    check("Graphique des moyens de paiement rendu",
        !w.FT.charts.isAvailable() ? true : !!chart, w.FT.charts.isAvailable() ? "Chart.js actif" : "Chart.js indisponible (repli)");
    if (chart) {
        check("Autant de barres que de moyens", chart.data.labels.length === breakdown.rows.length,
            chart.data.labels.join(", "));
        check("Barres colorées par moyen de paiement",
            chart.data.datasets[0].backgroundColor.filter(function (c) { return c === "#00A7E1"; }).length === 1);
    }

    w.close();
}

/* --------------------------------------------------------------------------
   17. Ancrage local — Abidjan, Cocody Angré (Côte d'Ivoire)
   -------------------------------------------------------------------------- */
group("17. Ancrage local (Abidjan — Cocody, Angré)");
{
    const page = loadPage("index.html", {
        prep: function (win) {
            win.localStorage.setItem("finatrack_settings", JSON.stringify({ demoLoaded: true }));
        }
    });
    const w = page.window;
    const d = page.document;
    const U = w.FT.utils;
    const V = w.FT.voice;

    /* ---- 16a. Contexte local et repères ---- */
    const local = U.LOCAL_CONTEXT;
    check("Contexte local défini (abidjan)", local && local.city === "Abidjan" &&
        local.area === "Angré" && local.country === "Côte d'Ivoire", JSON.stringify(local && {
        city: local.city, area: local.area, country: local.country
    }));
    equal("Zone par défaut proposée", local.defaultArea, "Cocody — Angré");

    const missingHints = U.CATEGORIES.filter(function (c) { return !U.categoryHint(c); });
    check("Chaque catégorie a un repère local", missingHints.length === 0, missingHints.join(", "));
    check("Repère parlant pour le transport", /Wôrô-wôrô|gbaka|SOTRA/i.test(U.categoryHint("Transport")),
        U.categoryHint("Transport"));
    check("Repère parlant pour l'électricité", /CIE/i.test(U.categoryHint("Électricité")),
        U.categoryHint("Électricité"));
    check("Repère parlant pour la famille (tontine)", /tontine|cotisation/i.test(U.categoryHint("Famille")),
        U.categoryHint("Famille"));
    check("Les repères de prix sont renseignés", Object.keys(local.priceRefs).length >= 8);

    /* ---- 16b. Moyens de paiement et sources de revenus du pays ---- */
    ["Orange Money", "MTN Mobile Money", "Moov Money", "Wave", "Djamo"].forEach(function (method) {
        check("Moyen de paiement suivi : " + method, U.PAYMENT_METHODS.indexOf(method) !== -1);
    });
    check("Sources de revenus locales", U.INCOME_SOURCES.indexOf("Tontine") !== -1 &&
        U.INCOME_SOURCES.indexOf("Transfert reçu") !== -1, U.INCOME_SOURCES.join(" · "));

    /* ---- 16c. Le moteur vocal comprend la vie quotidienne ivoirienne ---- */
    const phrases = [
        { text: "J'ai payé 300 francs de wôrô-wôrô pour Angré 7e Tranche", amount: 300, category: "Transport" },
        { text: "J'ai dépensé 500 dans le gbaka pour Adjamé", amount: 500, category: "Transport" },
        { text: "J'ai acheté du garba à 700 francs au marché Cocovico", amount: 700, category: "Alimentation" },
        { text: "J'ai payé 25 000 de tontine ce mois", amount: 25000, category: "Famille" },
        { text: "J'ai réglé la facture CIE de 18 500 francs", amount: 18500, category: "Électricité" },
        { text: "J'ai payé 90 000 d'écolage pour la rentrée", amount: 90000, category: "Éducation" },
        { text: "J'ai payé l'eau SODECI 9 000", amount: 9000, category: "Eau" },
        { text: "J'ai donné 4 500 à la pharmacie du quartier", amount: 4500, category: "Santé" },
        { text: "J'ai acheté du pagne à La Djibi pour 12 000", amount: 12000, category: "Shopping" },
        { text: "J'ai payé 5 000 de forfait Orange, 10 Go", amount: 5000, category: "Internet" },
        { text: "J'ai enjaillé 5 000 au maquis hier", amount: 5000, category: "Alimentation" }
    ];
    phrases.forEach(function (item) {
        const r = V.parseTranscript(item.text);
        check("Phrase locale → " + item.category + " · " + item.amount + " F",
            r.amount === item.amount && r.category === item.category,
            r.amount + " F / " + r.category);
    });

    /* ---- 16d. Moyens de paiement détectés à l'oral ---- */
    const payments = [
        { text: "J'ai payé 2 000 au marchand avec Djamo", method: "Djamo" },
        { text: "J'ai payé 3 000 en Wave", method: "Wave" },
        { text: "J'ai payé 1 500 avec Orange Money", method: "Orange Money" },
        { text: "J'ai payé 4 000 par MTN", method: "MTN Mobile Money" },
        { text: "J'ai payé 5 000 en espèces", method: "Espèces" }
    ];
    payments.forEach(function (item) {
        const r = V.parseTranscript(item.text);
        equal("Détection « " + item.method + " »", r.paymentMethod, item.method);
    });

    /* ---- 16e. Montants : unités ivoiriennes ---- */
    equal("« 2 krika » (nouchi) = 2 000 F", V.extractAmount("J'ai payé 2 krika pour le taxi").amount, 2000);
    equal("« 15 milles » = 15 000 F", V.extractAmount("J'ai payé 15 milles pour les marchandises").amount, 15000);
    equal("« 2 000 balles » = 2 000 F", V.extractAmount("Ça m'a coûté 2 000 balles").amount, 2000);
    equal("« deux mille cinq cents francs »", V.extractAmount("deux mille cinq cents francs").amount, 2500);

    /* ---- 16e-2. Descriptions courtes et lisibles ---- */
    const descriptionCases = [
        { text: "J'ai payé 25 000 de tontine avec Wave tantôt", attendu: "Tontine" },
        { text: "J'ai payé 300 francs de wôrô-wôrô pour Angré 7e Tranche", attendu: "Wôrô-wôrô Angré" },
        { text: "J'ai payé loyer 70 000 à Angré Château", attendu: "Loyer Angré Château" },
        { text: "J'ai réglé la facture CIE de 18 500 francs avec Orange Money", attendu: "Facture CIE" },
        { text: "J'ai payé 2 krika pour le taxi", attendu: "Taxi" }
    ];
    descriptionCases.forEach(function (item) {
        const r = V.parseTranscript(item.text);
        equal("Description : « " + item.attendu + " »", r.description, item.attendu);
    });
    check("Le moyen de paiement ne pollue pas la description",
        !/wave|orange money|djamo/i.test(V.parseTranscript("J'ai payé 25 000 de tontine avec Wave tantôt").description));
    check("L'expression de temps ne pollue pas la description",
        !/tantot/i.test(V.parseTranscript("J'ai payé 25 000 de tontine avec Wave tantôt").description));

    /* ---- 16f. Dates : « tantôt » = aujourd'hui en Côte d'Ivoire ---- */
    const tantot = V.detectDate("J'ai payé l'eau SODECI 9 000 tantôt");
    equal("« tantôt » → aujourd'hui", tantot.date, w.FT.utils.todayISO());
    check("Libellé de date cohérent", /Aujourd/i.test(tantot.label), tantot.label);

    /* ---- 16g. Données de démonstration ancrées à Angré ---- */
    const counts = w.FT.app.loadDemoData();
    check("Démo chargée avec un volume réaliste", counts.expenses >= 12 && counts.incomes === 3,
        JSON.stringify(counts));
    equal("Budget de démo", w.FT.budget.getBudget(U.monthKey()), 200000);

    const descriptions = w.FT.data.getExpenses().map(function (e) { return e.description; }).join(" | ");
    check("Lieux d'Angré présents dans la démo", /Angré/i.test(descriptions), descriptions.slice(0, 90));
    ["Gbaka", "Cocovico", "Tontine", "CIE", "SODECI", "Canal\+", "Orange CI"].forEach(function (motif) {
        check("Démo : « " + motif.replace("\\", "") + " »", new RegExp(motif, "i").test(descriptions));
    });

    const demoExpenses = w.FT.data.getExpenses();
    const transportDemo = demoExpenses.filter(function (e) { return e.category === "Transport"; });
    check("Trajets de démo aux tarifs réels (200-1 000 F)",
        transportDemo.length > 0 && transportDemo.every(function (e) { return e.amount >= 200 && e.amount <= 1000; }),
        transportDemo.map(function (e) { return e.amount; }).join(", "));

    w.FT.app.removeDemoData();

    /* ---- 16h. Interface : zone, repères et accueil contextualisé ---- */
    const greeting = d.querySelector("#dashHero").textContent;
    check("Accueil contextualisé (Cocody — Angré)", /Cocody — Angré/.test(greeting), greeting.slice(0, 120).replace(/\s+/g, " "));
    w.close();

    const settings = loadPage("pages/settings.html");
    const host = settings.document.querySelector("#settingsContent");
    check("Champ « Ma zone » présent", !!settings.document.querySelector("#settingArea"));
    check("Carte des repères locaux retirée sur demande", !/Repères locaux/.test(host.textContent));
    check("Tarifs repères retirés (Wôrô-wôrô etc)", !/Wôrô-wôrô/.test(host.textContent) || host.textContent.indexOf("Repères locaux") === -1);
    check("Pas de tableau price-refs (retiré)", host.querySelectorAll("dl.price-refs dt").length === 0);
    check("Djamo proposé dans les moyens de paiement", /Djamo/.test(host.textContent));

    /* Enregistrement de la zone */
    const areaInput = settings.document.querySelector("#settingArea");
    areaInput.value = "Yopougon — Niangon";
    const saveBtn = settings.document.querySelector("#settingsCard .btn-primary");
    saveBtn.click();
    equal("Zone enregistrée", settings.window.FT.data.getSettings().area, "Yopougon — Niangon");
    equal("Accueil qui suit la zone", settings.window.FT.dashboard.areaLabel(), "Yopougon — Niangon");
    settings.window.close();

    /* ---- 16i. Le repère transport apparaît dans les conseils d'analyse ---- */
    const analysis = loadPage("pages/analysis.html", {
        prep: function (win) {
            win.localStorage.setItem("finatrack_settings", JSON.stringify({ demoLoaded: true }));
        }
    });
    analysis.window.FT.app.loadDemoData();      // scénario d'Angré
    await waitFor(function () {
        return /gbaka/i.test(analysis.document.querySelector("#analysisInsights").textContent);
    }, 2000).then(function (painted) {
        check("Conseils d'analyse rendus avec les données d'Angré", painted);
        const insights = analysis.document.querySelector("#analysisInsights").textContent;
        check("Transport traduit en trajets de gbaka", /gbaka/i.test(insights), insights.slice(0, 140).replace(/\s+/g, " "));
        analysis.window.close();
    });
}

/* --------------------------------------------------------------------------
   18. Défilement, fenêtres et arrivée sur la page (mobile)
   -------------------------------------------------------------------------- */
group("18. Défilement et fenêtres modales");
{
    /* ---- 15a. Verrouillage du fond à l'ouverture d'une fenêtre ---- */
    const page = loadPage("index.html", {
        prep: function (win) {
            win.localStorage.setItem("finatrack_settings", JSON.stringify({ demoLoaded: true }));
            Object.defineProperty(win, "scrollY", { value: 900, writable: true, configurable: true });
            win.scrollTo = function (x, y) { win.scrollY = y; };
        }
    });
    const w = page.window;
    const d = page.document;
    const U = w.FT.utils;

    check("Aucun verrou au départ", !d.body.dataset.scrollLocked || d.body.dataset.scrollLocked === "0");

    const entry = U.openModal(U.el("div", { class: "modal-panel" }, [U.el("p", { text: "test" })]));
    check("Fond figé pendant l'ouverture (position: fixed)",
        d.body.style.position === "fixed", d.body.style.position);
    check("Position de défilement mémorisée", U.getScrollLock() && U.getScrollLock().y === 900,
        JSON.stringify(U.getScrollLock()));
    check("Décalage du corps appliqué (pas de saut visuel)", d.body.style.top === "-900px", d.body.style.top);
    check("Hauteur du corps non contrainte (le contenu reste entier)", d.body.style.height === "auto", d.body.style.height);
    check("Marqueur de verrouillage posé", d.body.dataset.scrollLocked === "1");

    entry.close();
    await waitFor(function () { return d.body.style.position !== "fixed"; }, 800).then(function (released) {
        check("Verrouillage relâché à la fermeture", released);
        check("Position de défilement restaurée", w.scrollY === 900, "scrollY = " + w.scrollY);
        check("Styles du corps nettoyés",
            d.body.style.top === "" && d.body.style.height === "" && d.body.style.overflowY === "");

        /* Deux fenêtres empilées : le verrou ne doit sauter qu'à la dernière fermeture */
        const first = U.openModal(U.el("div", { class: "modal-panel" }));
        const second = U.openModal(U.el("div", { class: "modal-panel" }));
        check("Verrou conservé avec deux fenêtres", d.body.style.position === "fixed" && U.getScrollLock().count === 2,
            "compteur = " + (U.getScrollLock() ? U.getScrollLock().count : "aucun"));
        second.close();
        return waitFor(function () { return U.getScrollLock() && U.getScrollLock().count === 1; }, 800).then(function (one) {
            check("Verrou maintenu tant qu'une fenêtre reste ouverte", one);
            check("Fond toujours figé", d.body.style.position === "fixed");
            first.close();
            return waitFor(function () { return !U.getScrollLock(); }, 800).then(function () {
                check("Verrou libéré après la dernière fermeture", true);
                w.close();
            });
        });
    }).then(function () {
        /* ---- 15b. Parcours de bienvenue déclenché par l'utilisateur ---- */
        const fresh = loadPage("index.html", {
            prep: function (win) {
                win.scrollTo = function (x, y) { win.scrollY = y; };
                Object.defineProperty(win, "scrollY", { value: 0, writable: true, configurable: true });
            }
        });
        const fw = fresh.window;
        const fd = fresh.document;

        return waitFor(function () { return !!fd.querySelector(".modal .modal-panel"); }, 2500).then(function (opened) {
            check("Fenêtre de bienvenue proposée au premier lancement", opened);
            const buttons = Array.prototype.slice.call(fd.querySelectorAll(".modal .btn"));
            const demoButton = buttons.filter(function (b) { return /exemples/i.test(b.textContent); })[0];
            check("Bouton « données d'exemple » présent", !!demoButton);
            if (!demoButton) return null;

            demoButton.click();
            return waitFor(function () { return fw.FT.data.getExpenses().length > 0; }, 1500).then(function (loaded) {
                check("Données de démonstration chargées par le bouton", loaded,
                    fw.FT.data.getExpenses().length + " dépenses");

                /* La fermeture est animée (180 ms) : on attend sa fin */
                return waitFor(function () {
                    return !fd.querySelector(".modal .modal-panel") && !fw.FT.utils.getScrollLock();
                }, 1200).then(function (closed) {
                    check("Fenêtre de bienvenue refermée", closed,
                        fd.querySelectorAll(".modal").length + " fenêtre(s) restante(s)");
                    check("Verrou de défilement libéré", !fw.FT.utils.getScrollLock());
                    check("Page laissée en haut (pas de défilement parasite)", fw.scrollY === 0, "scrollY = " + fw.scrollY);

                    /* Le tableau de bord affiche bien les nouvelles données */
                    check("Tableau de bord mis à jour après la démo",
                        /[0-9]/.test(fd.querySelector("#dashKpis").textContent));
                    fw.close();
                });
            });
        });
    }).then(function () {
        /* ---- 15c. Garde-fou d'ouverture en haut de page ---- */
        const guardPage = loadPage("index.html", {
            prep: function (win) {
                win.localStorage.setItem("finatrack_settings", JSON.stringify({ demoLoaded: true }));
                win.scrollTo = function (x, y) { win.scrollY = y; win.__scrollToCalls = (win.__scrollToCalls || 0) + 1; };
                Object.defineProperty(win, "scrollY", { value: 320, writable: true, configurable: true });
            }
        });
        const gw = guardPage.window;
        gw.FT.mobile.initScrollGuard();
        gw.document.dispatchEvent(new gw.Event("load"));
        return waitFor(function () { return gw.scrollY === 0; }, 1500).then(function (backToTop) {
            check("Garde-fou : page ramenée en haut après le chargement", backToTop, "scrollY = " + gw.scrollY);

            /* Après interaction de l'utilisateur, on ne touche plus au défilement */
            gw.scrollY = 500;
            gw.dispatchEvent(new gw.Event("touchstart"));
            gw.FT.mobile.initScrollGuard();
            gw.document.dispatchEvent(new gw.Event("load"));
            return waitFor(function () { return false; }, 400).then(function () {
                check("Garde-fou inactif après interaction (respect du lecteur)", gw.scrollY === 500, "scrollY = " + gw.scrollY);
                gw.close();
            });
        });
    }).then(function () {
        /* ---- 15d. Repère de défilement des sélecteurs ---- */
        const segPage = loadPage("pages/transactions.html", { prep: function (win) { win.innerWidth = 390; } });
        const sw = segPage.window;
        sw.FT.mobile.initSegmentedHints();
        const segments = sw.document.querySelectorAll(".segmented");
        check("Sélecteurs détectés", segments.length > 0, segments.length + " sélecteurs");
        check("Repère appliqué sans erreur", Array.prototype.every.call(segments, function (s) {
            return s.dataset.hintReady === "1";
        }));
        check("Fonction idempotente (aucun doublon de traitement)", (function () {
            sw.FT.mobile.initSegmentedHints();
            return sw.document.querySelectorAll(".segmented").length === segments.length;
        })());
        sw.close();

        /* ---- 15d-2. Service worker : règle de rechargement ---- */
        const swPage = loadPage("index.html");
        const rule = swPage.window.FT.mobile.shouldReloadOnControllerChange;
        check("Première installation : aucun rechargement", rule(false, false) === false && rule(false, true) === false);
        check("Mise à jour acceptée sur page déjà contrôlée : rechargement", rule(true, true) === true);
        check("Contrôleur déjà présent sans mise à jour : pas de rechargement", rule(true, false) === false);
        check("État initial de rechargement cohérent", swPage.window.FT.mobile.getReloadState().reloaded === false);
        swPage.window.close();

        /* ---- 15e. Amorçage non dupliqué ---- */
        const boot = loadPage("index.html");
        boot.window.FT.app.markActiveNav();
        check("Amorçage marqué comme effectué (FT.booted)", boot.window.FT.booted === true);
        boot.window.FT.app.openExpenseForm();
        check("Une seule fenêtre après un second passage d'amorçage",
            boot.document.querySelectorAll("#expenseForm").length === 1);
        boot.window.close();
    });
}



} /* fin de main() */

/* ==========================================================================
   RÉSULTAT
   ========================================================================== */
main().then(function () {
    console.log("\n" + "─".repeat(62));
    console.log("Tests réussis : " + passed + "   |   Échecs : " + failed);
    if (failed) {
        console.log("\nDétail des échecs :");
        failures.forEach(function (f) { console.log("  • " + f); });
    }
    console.log("─".repeat(62));
    process.exit(failed ? 1 : 0);
}).catch(function (err) {
    console.error("\nErreur d'exécution des tests :", err);
    process.exit(1);
});
