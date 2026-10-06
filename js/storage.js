/* ==========================================================================
   FinaTrack CI — storage.js
   Couche de persistance. Le MVP utilise LocalStorage (§35, §44) derrière une
   interface abstraite `dataService` : un futur adaptateur Supabase pourra
   remplacer LocalStorage sans réécrire le reste de l'application.

   Clés utilisées :
     finatrack_expenses  | finatrack_incomes | finatrack_budget | finatrack_settings
     finatrack_wallets   (soldes de départ par moyen de paiement)
   ========================================================================== */
(function (global) {
    "use strict";

    const U = global.FT.utils;

    const KEYS = {
        EXPENSES: "finatrack_expenses",
        INCOMES: "finatrack_incomes",
        BUDGET: "finatrack_budget",
        WALLETS: "finatrack_wallets",
        SETTINGS: "finatrack_settings",
        META: "finatrack_meta",
        VERSION: 1
    };

    const DEFAULT_SETTINGS = {
        currency: "FCFA",
        theme: "light",
        userName: "",
        demoLoaded: false,
        alertsEnabled: true,
        monthlyBudgetHint: 200000,
        area: "Cocody — Angré",
        voiceLanguage: "fr-FR",
        textSize: "normal",          /* confort de lecture : normal | grand | tres-grand */
        version: KEYS.VERSION
    };

    const DEFAULT_META = {
        schemaVersion: KEYS.VERSION,
        createdAt: null,
        lastUpdated: null
    };

    /* ======================================================================
       0. DISPONIBILITÉ DU STOCKAGE
       ====================================================================== */

    let available = null;

    /** Vérifie que LocalStorage est réellement utilisable (mode privé, quotas…). */
    function isAvailable() {
        if (available !== null) return available;
        try {
            const probe = "__finatrack_probe__";
            global.localStorage.setItem(probe, "1");
            global.localStorage.removeItem(probe);
            available = true;
        } catch (e) {
            available = false;
            console.warn("[FinaTrack] LocalStorage indisponible : les données ne seront pas conservées.", e);
        }
        return available;
    }

    /* Mémoire de secours si LocalStorage est bloqué (session courante uniquement) */
    const memoryStore = {};
    function driverGet(key) {
        if (!isAvailable()) return memoryStore[key] === undefined ? null : memoryStore[key];
        return global.localStorage.getItem(key);
    }
    function driverSet(key, value) {
        if (!isAvailable()) { memoryStore[key] = value; return true; }
        try {
            global.localStorage.setItem(key, value);
            return true;
        } catch (e) {
            console.error("[FinaTrack] Écriture impossible (quota atteint ?)", e);
            return false;
        }
    }
    function driverRemove(key) {
        if (!isAvailable()) { delete memoryStore[key]; return; }
        global.localStorage.removeItem(key);
    }

    /* ======================================================================
       1. LECTURE / ÉCRITURE BAS NIVEAU
       ====================================================================== */

    function read(key, fallback) {
        const raw = driverGet(key);
        if (raw === null || raw === undefined) return fallback;
        try {
            const parsed = JSON.parse(raw);
            return parsed === null ? fallback : parsed;
        } catch (e) {
            console.warn("[FinaTrack] Donnée corrompue pour « " + key + " », réinitialisation.", e);
            return fallback;
        }
    }

    function write(key, value) {
        const ok = driverSet(key, JSON.stringify(value));
        if (ok) {
            const meta = read(KEYS.META, DEFAULT_META) || DEFAULT_META;
            meta.schemaVersion = KEYS.VERSION;
            meta.lastUpdated = new Date().toISOString();
            if (!meta.createdAt) meta.createdAt = meta.lastUpdated;
            driverSet(KEYS.META, JSON.stringify(meta));
        }
        return ok;
    }

    function remove(key) {
        driverRemove(key);
    }

    /* ======================================================================
       2. NORMALISATION DES ENREGISTREMENTS
       ====================================================================== */

    /** Garantit la structure d'une dépense (§35). */
    function normalizeExpense(raw) {
        if (!raw || typeof raw !== "object") return null;
        const amount = U.toNumber(raw.amount);
        const date = U.isValidISODate(raw.date) ? U.toISODate(U.fromISODate(raw.date)) : U.todayISO();
        let category = U.sanitizeText(raw.category, 40);
        if (U.CATEGORIES.indexOf(category) === -1) category = "Autres";
        let method = U.sanitizeText(raw.paymentMethod, 40);
        if (!method) method = "Espèces";

        return {
            id: raw.id || U.uid("exp"),
            type: "expense",
            amount: U.round2(amount),
            category: category,
            description: U.sanitizeText(raw.description, 160) || U.capitalize(category),
            date: date,
            paymentMethod: method,
            source: raw.source === "voice" ? "voice" : "manual",
            createdAt: raw.createdAt || new Date().toISOString(),
            updatedAt: raw.updatedAt || null
        };
    }

    /** Garantit la structure d'un revenu (§35). */
    function normalizeIncome(raw) {
        if (!raw || typeof raw !== "object") return null;
        const amount = U.toNumber(raw.amount);
        const date = U.isValidISODate(raw.date) ? U.toISODate(U.fromISODate(raw.date)) : U.todayISO();
        let source = U.sanitizeText(raw.source, 40);
        if (U.INCOME_SOURCES.indexOf(source) === -1) source = "Autre";
        let method = U.sanitizeText(raw.paymentMethod, 40);
        if (!method) method = "Espèces";

        return {
            id: raw.id || U.uid("inc"),
            type: "income",
            amount: U.round2(amount),
            source: source,
            category: "Revenus",
            description: U.sanitizeText(raw.description, 160) || source,
            date: date,
            paymentMethod: method,
            origin: raw.origin === "voice" ? "voice" : "manual",
            createdAt: raw.createdAt || new Date().toISOString(),
            updatedAt: raw.updatedAt || null
        };
    }

    /* ======================================================================
       3. ADAPTATEUR LOCALSTORAGE
       L'interface ci-dessous est volontairement identique à celle qu'exposera
       un adaptateur Supabase (mêmes noms de méthodes, mêmes formes de données).
       ====================================================================== */

    const localAdapter = {
        name: "localStorage",

        /* ---------- DÉPENSES ---------- */
        getExpenses: function () {
            const list = read(KEYS.EXPENSES, []);
            return Array.isArray(list) ? list.map(normalizeExpense).filter(Boolean) : [];
        },
        saveExpenses: function (list) {
            return write(KEYS.EXPENSES, (list || []).map(normalizeExpense).filter(Boolean));
        },
        addExpense: function (expense) {
            const list = localAdapter.getExpenses();
            const record = normalizeExpense(expense);
            if (!record) return null;
            list.push(record);
            localAdapter.saveExpenses(list);
            return record;
        },
        updateExpense: function (id, patch) {
            const list = localAdapter.getExpenses();
            let updated = null;
            const next = list.map(function (item) {
                if (item.id !== id) return item;
                updated = normalizeExpense(Object.assign({}, item, patch, {
                    id: item.id,
                    createdAt: item.createdAt,
                    updatedAt: new Date().toISOString()
                }));
                return updated;
            });
            if (updated) localAdapter.saveExpenses(next);
            return updated;
        },
        deleteExpense: function (id) {
            const list = localAdapter.getExpenses();
            const next = list.filter(function (item) { return item.id !== id; });
            if (next.length === list.length) return false;
            localAdapter.saveExpenses(next);
            return true;
        },

        /* ---------- REVENUS ---------- */
        getIncomes: function () {
            const list = read(KEYS.INCOMES, []);
            return Array.isArray(list) ? list.map(normalizeIncome).filter(Boolean) : [];
        },
        saveIncomes: function (list) {
            return write(KEYS.INCOMES, (list || []).map(normalizeIncome).filter(Boolean));
        },
        addIncome: function (income) {
            const list = localAdapter.getIncomes();
            const record = normalizeIncome(income);
            if (!record) return null;
            list.push(record);
            localAdapter.saveIncomes(list);
            return record;
        },
        updateIncome: function (id, patch) {
            const list = localAdapter.getIncomes();
            let updated = null;
            const next = list.map(function (item) {
                if (item.id !== id) return item;
                updated = normalizeIncome(Object.assign({}, item, patch, {
                    id: item.id,
                    createdAt: item.createdAt,
                    updatedAt: new Date().toISOString()
                }));
                return updated;
            });
            if (updated) localAdapter.saveIncomes(next);
            return updated;
        },
        deleteIncome: function (id) {
            const list = localAdapter.getIncomes();
            const next = list.filter(function (item) { return item.id !== id; });
            if (next.length === list.length) return false;
            localAdapter.saveIncomes(next);
            return true;
        },

        /* ---------- BUDGET ---------- */
        /** Structure : { "2026-09": 100000, "2026-08": 90000 } (§35 : par mois) */
        getBudgets: function () {
            const data = read(KEYS.BUDGET, {});
            return data && typeof data === "object" && !Array.isArray(data) ? data : {};
        },
        getBudget: function (month) {
            const m = month || U.monthKey();
            const budgets = localAdapter.getBudgets();
            const value = U.toNumber(budgets[m]);
            return value > 0 ? value : 0;
        },
        setBudget: function (month, amount) {
            const m = month || U.monthKey();
            const budgets = localAdapter.getBudgets();
            const value = U.toNumber(amount);
            if (value <= 0) {
                delete budgets[m];
            } else {
                budgets[m] = U.round2(value);
            }
            write(KEYS.BUDGET, budgets);
            return value;
        },
        /** Budget par défaut : dernier budget défini, sinon 0 */
        getDefaultBudget: function () {
            const budgets = localAdapter.getBudgets();
            const keys = Object.keys(budgets).sort();
            if (!keys.length) return 0;
            return U.toNumber(budgets[keys[keys.length - 1]]);
        },

        /* ---------- PORTEFEUILLES (soldes de départ par moyen de paiement) ---------- */
        getWallets: function () {
            return normalizeWallets(read(KEYS.WALLETS, {}));
        },
        saveWallets: function (wallets) {
            const clean = normalizeWallets(wallets);
            write(KEYS.WALLETS, clean);
            return clean;
        },
        getWallet: function (method) {
            const wallets = localAdapter.getWallets();
            return U.toNumber(wallets[method] || 0);
        },
        setWallet: function (method, amount) {
            if (!method) return 0;
            const wallets = localAdapter.getWallets();
            const value = U.toNumber(amount);
            if (amount === "" || amount === null || amount === undefined || !isFinite(value)) {
                delete wallets[method];
            } else {
                wallets[method] = U.round2(value);
            }
            write(KEYS.WALLETS, wallets);
            return wallets[method] || 0;
        },

        /* ---------- PARAMÈTRES ---------- */
        getSettings: function () {
            const stored = read(KEYS.SETTINGS, {});
            const merged = Object.assign({}, DEFAULT_SETTINGS, stored && typeof stored === "object" ? stored : {});
            /* Valeur inconnue (sauvegarde ancienne, import manuel) → normale */
            if (["normal", "grand", "tres-grand"].indexOf(merged.textSize) === -1) merged.textSize = "normal";
            return merged;
        },
        saveSettings: function (patch) {
            const merged = Object.assign({}, localAdapter.getSettings(), patch || {});
            merged.version = KEYS.VERSION;
            write(KEYS.SETTINGS, merged);
            return merged;
        },

        /* ---------- MAINTENANCE ---------- */
        clearAll: function () {
            remove(KEYS.EXPENSES);
            remove(KEYS.INCOMES);
            remove(KEYS.BUDGET);
            remove(KEYS.WALLETS);
            remove(KEYS.SETTINGS);
            remove(KEYS.META);
            return true;
        },
        exportAll: function () {
            return {
                version: KEYS.VERSION,
                exportedAt: new Date().toISOString(),
                expenses: localAdapter.getExpenses(),
                incomes: localAdapter.getIncomes(),
                budgets: localAdapter.getBudgets(),
                wallets: localAdapter.getWallets(),
                settings: localAdapter.getSettings()
            };
        },
        importAll: function (payload) {
            if (!payload || typeof payload !== "object") throw new Error("Fichier de sauvegarde invalide.");
            const expenses = Array.isArray(payload.expenses) ? payload.expenses : [];
            const incomes = Array.isArray(payload.incomes) ? payload.incomes : [];
            localAdapter.saveExpenses(expenses);
            localAdapter.saveIncomes(incomes);
            if (payload.budgets && typeof payload.budgets === "object") write(KEYS.BUDGET, payload.budgets);
            if (payload.wallets && typeof payload.wallets === "object") write(KEYS.WALLETS, normalizeWallets(payload.wallets));
            if (payload.settings && typeof payload.settings === "object") localAdapter.saveSettings(payload.settings);
            return { expenses: expenses.length, incomes: incomes.length };
        }
    };

    /**
     * Normalise les soldes de départ des portefeuilles.
     * Structure : { "Espèces": 15000, "Wave": 40000, … }
     * Les montants négatifs (découverts) sont acceptés ; les valeurs vides
     * ou non numériques sont ignorées.
     */
    function normalizeWallets(input) {
        const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
        const clean = {};
        U.PAYMENT_METHODS.forEach(function (method) {
            if (!(method in source)) return;
            const value = U.toNumber(source[method]);
            if (source[method] === "" || source[method] === null || source[method] === undefined) return;
            if (!isFinite(value)) return;
            clean[method] = U.round2(value);
        });
        return clean;
    }

    /* ======================================================================
       4. INTERFACE ABSTRAITE `dataService` (§44)
       ----------------------------------------------------------------------
       Un adaptateur Supabase implémentera exactement les mêmes méthodes :

         const supabaseAdapter = {
             name: "supabase",
             getExpenses: () => supabase.from("expenses").select("*").order("date", {ascending:false}),
             addExpense: (e) => supabase.from("expenses").insert(e).select().single(),
             ...
         };

       puis : FT.storage.setAdapter(supabaseAdapter)
       Les vues ne connaissent que `dataService.<méthode>`, jamais LocalStorage.
       ====================================================================== */

    let adapter = localAdapter;

    function setAdapter(nextAdapter) {
        if (!nextAdapter) return adapter;
        adapter = nextAdapter;
        U.bus.emit("storage:adapter", { name: adapter.name });
        return adapter;
    }

    const dataService = {
        /** @returns {string} nom de l'adaptateur actif */
        get adapterName() { return adapter.name; },
        setAdapter: setAdapter,

        getExpenses: function () { return adapter.getExpenses() || []; },
        saveExpenses: function (list) { return adapter.saveExpenses(list); },
        addExpense: function (expense) { return adapter.addExpense(expense); },
        updateExpense: function (id, patch) { return adapter.updateExpense(id, patch); },
        deleteExpense: function (id) { return adapter.deleteExpense(id); },

        getIncomes: function () { return adapter.getIncomes() || []; },
        saveIncomes: function (list) { return adapter.saveIncomes(list); },
        addIncome: function (income) { return adapter.addIncome(income); },
        updateIncome: function (id, patch) { return adapter.updateIncome(id, patch); },
        deleteIncome: function (id) { return adapter.deleteIncome(id); },

        getBudget: function (month) { return adapter.getBudget(month); },
        getBudgets: function () { return adapter.getBudgets() || {}; },
        setBudget: function (month, amount) { return adapter.setBudget(month, amount); },
        getDefaultBudget: function () { return adapter.getDefaultBudget(); },

        getWallets: function () { return adapter.getWallets() || {}; },
        saveWallets: function (wallets) { return adapter.saveWallets(wallets); },
        getWallet: function (method) { return adapter.getWallet ? adapter.getWallet(method) : 0; },
        setWallet: function (method, amount) { return adapter.setWallet(method, amount); },

        getSettings: function () { return adapter.getSettings(); },
        saveSettings: function (patch) { return adapter.saveSettings(patch); },

        clearAll: function () { return adapter.clearAll(); },
        exportAll: function () { return adapter.exportAll(); },
        importAll: function (payload) { return adapter.importAll(payload); },

        /** Toutes les transactions (dépenses + revenus) triées par date décroissante */
        getAllTransactions: function () {
            const expenses = dataService.getExpenses();
            const incomes = dataService.getIncomes();
            return expenses.concat(incomes).sort(function (a, b) {
                if (a.date === b.date) return String(b.createdAt).localeCompare(String(a.createdAt));
                return a.date < b.date ? 1 : -1;
            });
        }
    };

    /* ======================================================================
       5. EXPORTS
       ====================================================================== */

    global.FT.storage = {
        KEYS: KEYS,
        DEFAULT_SETTINGS: DEFAULT_SETTINGS,
        isAvailable: isAvailable,
        read: read,
        write: write,
        remove: remove,
        normalizeExpense: normalizeExpense,
        normalizeIncome: normalizeIncome,
        localAdapter: localAdapter,
        setAdapter: setAdapter,
        getSettings: function () { return dataService.getSettings(); },
        saveSettings: function (patch) { return dataService.saveSettings(patch); }
    };

    global.FT.data = dataService;
    global.dataService = dataService; // accès global demandé par la spécification (§44)

    /* Raccourcis de lecture fréquents */
    global.getExpenses = dataService.getExpenses;
    global.getIncomes = dataService.getIncomes;
})(window);
