/* ==========================================================================
   FinaTrack CI — supabase-adapter.js
   Adaptateur Supabase pour FT.storage / FT.data
   Compatible avec l'interface de localAdapter mais en async.

   Usage:
     1. Ajouter dans HTML après storage.js:
        <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
        <script src="js/config.js"></script>  // window.FT_CONFIG = { SUPABASE_URL, SUPABASE_ANON_KEY }
        <script src="js/supabase-adapter.js"></script>

     2. Au boot (dans app.js ou main):
        if (window.FT_CONFIG && FT_CONFIG.SUPABASE_URL) {
          await FT.supabaseAdapter.init();
          FT.data.setAdapter(FT.supabaseAdapter);
        }

   Notes:
     - RLS obligatoire côté Supabase (voir docs/SUPABASE_GUIDE.md)
     - Offline-first: si fetch échoue, on retombe sur localAdapter
     - Auth: utilise supabase.auth.getUser() pour user_id
   ========================================================================== */
(function (global) {
    "use strict";

    const U = global.FT.utils;
    const localAdapter = global.FT.storage.localAdapter;

    let supabase = null;
    let currentUserId = null;

    function getClient() {
        if (supabase) return supabase;
        const cfg = global.FT_CONFIG || {};
        if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
            console.warn("[Supabase] FT_CONFIG manquant");
            return null;
        }
        if (!global.supabase) {
            console.error("[Supabase] SDK non chargé — ajoute le CDN supabase-js");
            return null;
        }
        supabase = global.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
            auth: { persistSession: true, autoRefreshToken: true }
        });
        return supabase;
    }

    async function getUserId() {
        if (currentUserId) return currentUserId;
        const client = getClient();
        if (!client) return null;
        const { data: { user } } = await client.auth.getUser();
        if (user) currentUserId = user.id;
        return currentUserId;
    }

    async function withFallback(fn, fallbackFn) {
        try {
            return await fn();
        } catch (e) {
            console.warn("[Supabase] fallback local", e.message);
            return fallbackFn ? fallbackFn() : null;
        }
    }

    // Normalisation identique à storage.js
    function toExpenseRow(raw, userId) {
        return {
            id: raw.id,
            user_id: userId,
            amount: raw.amount,
            category: raw.category,
            description: raw.description,
            date: raw.date,
            payment_method: raw.paymentMethod || raw.payment_method || "Espèces",
            source: raw.source || "manual",
            created_at: raw.createdAt || raw.created_at,
            updated_at: raw.updatedAt || raw.updated_at
        };
    }

    function fromExpenseRow(row) {
        if (!row) return null;
        return {
            id: row.id,
            type: "expense",
            amount: Number(row.amount),
            category: row.category,
            description: row.description,
            date: row.date,
            paymentMethod: row.payment_method,
            source: row.source,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    function toIncomeRow(raw, userId) {
        return {
            id: raw.id,
            user_id: userId,
            amount: raw.amount,
            source: raw.source,
            description: raw.description,
            date: raw.date,
            payment_method: raw.paymentMethod || raw.payment_method || "Espèces",
            origin: raw.origin || "manual",
            created_at: raw.createdAt || raw.created_at,
            updated_at: raw.updatedAt || raw.updated_at
        };
    }

    function fromIncomeRow(row) {
        if (!row) return null;
        return {
            id: row.id,
            type: "income",
            amount: Number(row.amount),
            source: row.source,
            category: "Revenus",
            description: row.description,
            date: row.date,
            paymentMethod: row.payment_method,
            origin: row.origin,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    const supabaseAdapter = {
        name: "supabase",

        async init() {
            const client = getClient();
            if (!client) throw new Error("Supabase client non initialisé");
            const userId = await getUserId();
            if (!userId) console.warn("[Supabase] pas de session — login requis");
            // Écoute changement auth
            client.auth.onAuthStateChange(function (_event, session) {
                currentUserId = session && session.user ? session.user.id : null;
                U.bus.emit("auth:changed", { action: _event, userId: currentUserId });
            });
            return true;
        },

        /* ---------- EXPENSES ---------- */
        async getExpenses() {
            return withFallback(async function () {
                const client = getClient();
                const uid = await getUserId();
                if (!uid) return localAdapter.getExpenses();
                const { data, error } = await client.from("expenses").select("*").eq("user_id", uid).order("date", { ascending: false });
                if (error) throw error;
                return data.map(fromExpenseRow).filter(Boolean);
            }, function () { return localAdapter.getExpenses(); });
        },

        async addExpense(expense) {
            return withFallback(async function () {
                const client = getClient();
                const uid = await getUserId();
                if (!uid) return localAdapter.addExpense(expense);
                const norm = global.FT.storage.normalizeExpense(expense);
                if (!norm) return null;
                const row = toExpenseRow(norm, uid);
                const { data, error } = await client.from("expenses").insert(row).select().single();
                if (error) throw error;
                return fromExpenseRow(data);
            }, function () { return localAdapter.addExpense(expense); });
        },

        async updateExpense(id, patch) {
            return withFallback(async function () {
                const client = getClient();
                const uid = await getUserId();
                const { data, error } = await client.from("expenses").update({
                    amount: patch.amount,
                    category: patch.category,
                    description: patch.description,
                    date: patch.date,
                    payment_method: patch.paymentMethod,
                    updated_at: new Date().toISOString()
                }).eq("id", id).eq("user_id", uid).select().single();
                if (error) throw error;
                return fromExpenseRow(data);
            }, function () { return localAdapter.updateExpense(id, patch); });
        },

        async deleteExpense(id) {
            return withFallback(async function () {
                const client = getClient();
                const uid = await getUserId();
                const { error } = await client.from("expenses").delete().eq("id", id).eq("user_id", uid);
                if (error) throw error;
                return true;
            }, function () { return localAdapter.deleteExpense(id); });
        },

        /* ---------- INCOMES ---------- */
        async getIncomes() {
            return withFallback(async function () {
                const client = getClient();
                const uid = await getUserId();
                if (!uid) return localAdapter.getIncomes();
                const { data, error } = await client.from("incomes").select("*").eq("user_id", uid).order("date", { ascending: false });
                if (error) throw error;
                return data.map(fromIncomeRow).filter(Boolean);
            }, function () { return localAdapter.getIncomes(); });
        },

        async addIncome(income) {
            return withFallback(async function () {
                const client = getClient();
                const uid = await getUserId();
                if (!uid) return localAdapter.addIncome(income);
                const norm = global.FT.storage.normalizeIncome(income);
                if (!norm) return null;
                const row = toIncomeRow(norm, uid);
                const { data, error } = await client.from("incomes").insert(row).select().single();
                if (error) throw error;
                return fromIncomeRow(data);
            }, function () { return localAdapter.addIncome(income); });
        },

        async updateIncome(id, patch) {
            return withFallback(async function () {
                const client = getClient();
                const uid = await getUserId();
                const { data, error } = await client.from("incomes").update({
                    amount: patch.amount,
                    source: patch.source,
                    description: patch.description,
                    date: patch.date,
                    payment_method: patch.paymentMethod,
                    updated_at: new Date().toISOString()
                }).eq("id", id).eq("user_id", uid).select().single();
                if (error) throw error;
                return fromIncomeRow(data);
            }, function () { return localAdapter.updateIncome(id, patch); });
        },

        async deleteIncome(id) {
            return withFallback(async function () {
                const client = getClient();
                const uid = await getUserId();
                const { error } = await client.from("incomes").delete().eq("id", id).eq("user_id", uid);
                if (error) throw error;
                return true;
            }, function () { return localAdapter.deleteIncome(id); });
        },

        /* ---------- BUDGETS ---------- */
        async getBudgets() {
            return withFallback(async function () {
                const client = getClient();
                const uid = await getUserId();
                if (!uid) return localAdapter.getBudgets();
                const { data, error } = await client.from("budgets").select("*").eq("user_id", uid);
                if (error) throw error;
                const map = {};
                data.forEach(function (r) { map[r.month] = Number(r.amount); });
                return map;
            }, function () { return localAdapter.getBudgets(); });
        },

        async getBudget(month) {
            const budgets = await this.getBudgets();
            return budgets[month] || 0;
        },

        async setBudget(month, amount) {
            return withFallback(async function () {
                const client = getClient();
                const uid = await getUserId();
                if (!uid) return localAdapter.setBudget(month, amount);
                const val = U.toNumber(amount);
                if (val <= 0) {
                    await client.from("budgets").delete().eq("user_id", uid).eq("month", month);
                    return 0;
                }
                const { error } = await client.from("budgets").upsert({ user_id: uid, month: month, amount: val });
                if (error) throw error;
                return val;
            }, function () { return localAdapter.setBudget(month, amount); });
        },

        async getDefaultBudget() {
            const budgets = await this.getBudgets();
            const keys = Object.keys(budgets).sort();
            return keys.length ? budgets[keys[keys.length - 1]] : 0;
        },

        /* ---------- WALLETS ---------- */
        async getWallets() {
            return withFallback(async function () {
                const client = getClient();
                const uid = await getUserId();
                if (!uid) return localAdapter.getWallets();
                const { data, error } = await client.from("wallets").select("*").eq("user_id", uid);
                if (error) throw error;
                const map = {};
                data.forEach(function (r) { map[r.method] = Number(r.amount); });
                return map;
            }, function () { return localAdapter.getWallets(); });
        },

        async saveWallets(wallets) {
            // upsert chaque méthode
            const client = getClient();
            const uid = await getUserId();
            if (!uid) return localAdapter.saveWallets(wallets);
            const rows = Object.keys(wallets).map(function (m) { return { user_id: uid, method: m, amount: wallets[m] }; });
            const { error } = await client.from("wallets").upsert(rows);
            if (error) throw error;
            return wallets;
        },

        async getWallet(method) {
            const all = await this.getWallets();
            return all[method] || 0;
        },

        async setWallet(method, amount) {
            const client = getClient();
            const uid = await getUserId();
            if (!uid) return localAdapter.setWallet(method, amount);
            const val = U.toNumber(amount);
            if (!amount && amount !== 0) {
                await client.from("wallets").delete().eq("user_id", uid).eq("method", method);
                return 0;
            }
            await client.from("wallets").upsert({ user_id: uid, method: method, amount: val });
            return val;
        },

        /* ---------- SETTINGS ---------- */
        async getSettings() {
            return withFallback(async function () {
                const client = getClient();
                const uid = await getUserId();
                if (!uid) return localAdapter.getSettings();
                const { data, error } = await client.from("settings").select("*").eq("user_id", uid).maybeSingle();
                if (error) throw error;
                if (!data) return localAdapter.getSettings();
                return {
                    currency: data.currency || "FCFA",
                    theme: data.theme || "light",
                    textSize: data.text_size || "normal",
                    voiceLanguage: data.voice_language || "fr-FR",
                    area: data.area || "Cocody — Angré",
                    version: 1
                };
            }, function () { return localAdapter.getSettings(); });
        },

        async saveSettings(patch) {
            return withFallback(async function () {
                const client = getClient();
                const uid = await getUserId();
                if (!uid) return localAdapter.saveSettings(patch);
                const { error } = await client.from("settings").upsert({
                    user_id: uid,
                    currency: patch.currency,
                    theme: patch.theme,
                    text_size: patch.textSize,
                    voice_language: patch.voiceLanguage,
                    area: patch.area,
                    updated_at: new Date().toISOString()
                });
                if (error) throw error;
                return patch;
            }, function () { return localAdapter.saveSettings(patch); });
        },

        async clearAll() {
            // Ne supprime que côté Supabase pour le user courant
            const client = getClient();
            const uid = await getUserId();
            if (!uid) return localAdapter.clearAll();
            await client.from("expenses").delete().eq("user_id", uid);
            await client.from("incomes").delete().eq("user_id", uid);
            await client.from("budgets").delete().eq("user_id", uid);
            await client.from("wallets").delete().eq("user_id", uid);
            return true;
        },

        async exportAll() {
            const expenses = await this.getExpenses();
            const incomes = await this.getIncomes();
            const budgets = await this.getBudgets();
            const wallets = await this.getWallets();
            const settings = await this.getSettings();
            return { version: 1, exportedAt: new Date().toISOString(), expenses, incomes, budgets, wallets, settings };
        },

        async importAll(payload) {
            if (!payload) throw new Error("payload invalide");
            for (let e of (payload.expenses || [])) await this.addExpense(e);
            for (let i of (payload.incomes || [])) await this.addIncome(i);
            if (payload.budgets) {
                for (let m in payload.budgets) await this.setBudget(m, payload.budgets[m]);
            }
            if (payload.wallets) await this.saveWallets(payload.wallets);
            return { expenses: (payload.expenses || []).length, incomes: (payload.incomes || []).length };
        }
    };

    global.FT.supabaseAdapter = supabaseAdapter;

})(window);
