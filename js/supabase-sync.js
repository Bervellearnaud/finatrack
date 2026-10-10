/* ==========================================================================
   FinaTrack CI — supabase-sync.js
   Mode hybride offline-first (recommandé pour Abidjan)
   - Lecture = LocalStorage (instantané, marche hors ligne)
   - Écriture = Local + Supabase en arrière-plan si en ligne
   - Au démarrage : pull depuis Supabase et fusion dans Local
   ========================================================================== */
(function (global) {
    "use strict";

    const U = global.FT.utils;
    const local = global.FT.storage.localAdapter;

    let client = null;
    let userId = null;
    let enabled = false;

    function getClient() {
        if (client) return client;
        const cfg = global.FT_CONFIG || {};
        if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return null;
        if (!global.supabase) {
            console.warn("[Supabase Sync] SDK non chargé");
            return null;
        }
        client = global.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
            auth: { persistSession: true, autoRefreshToken: true }
        });
        return client;
    }

    async function getUserId(force) {
        if (userId && !force) return userId;
        const c = getClient();
        if (!c) return null;
        try {
            // 1. Essaie session (plus rapide, en cache)
            const { data: { session } } = await c.auth.getSession();
            if (session && session.user) {
                userId = session.user.id;
                return userId;
            }
            // 2. Sinon getUser (appel réseau)
            const { data: { user }, error } = await c.auth.getUser();
            if (error) {
                console.warn("[Supabase Sync] getUser error", error.message);
            }
            if (user) {
                userId = user.id;
                return userId;
            }
        } catch (e) {
            console.warn("[Supabase Sync] getUserId failed", e.message);
        }
        return userId;
    }

    function isOnline() {
        return global.navigator ? global.navigator.onLine : true;
    }

    function toRowExpense(e, uid) {
        return {
            id: e.id,
            user_id: uid,
            amount: e.amount,
            category: e.category,
            description: e.description,
            date: e.date,
            payment_method: e.paymentMethod,
            source: e.source || "manual",
            created_at: e.createdAt,
            updated_at: e.updatedAt
        };
    }

    function toRowIncome(i, uid) {
        return {
            id: i.id,
            user_id: uid,
            amount: i.amount,
            source: i.source,
            description: i.description,
            date: i.date,
            payment_method: i.paymentMethod,
            origin: i.origin || "manual",
            created_at: i.createdAt,
            updated_at: i.updatedAt
        };
    }

    async function pull() {
        const c = getClient();
        const uid = await getUserId();
        if (!c || !uid || !isOnline()) return;
        try {
            // Expenses
            const { data: expRemote } = await c.from("expenses").select("*").eq("user_id", uid);
            if (expRemote && expRemote.length) {
                const localExp = local.getExpenses();
                const localIds = new Set(localExp.map(function (e) { return e.id; }));
                const toAdd = expRemote.filter(function (r) { return !localIds.has(r.id); }).map(function (r) {
                    return {
                        id: r.id,
                        amount: Number(r.amount),
                        category: r.category,
                        description: r.description,
                        date: r.date,
                        paymentMethod: r.payment_method,
                        source: r.source,
                        createdAt: r.created_at,
                        updatedAt: r.updated_at
                    };
                });
                if (toAdd.length) {
                    const merged = localExp.concat(toAdd);
                    local.saveExpenses(merged);
                    console.info("[Supabase Sync] pull expenses +" + toAdd.length);
                }
            }
            // Incomes
            const { data: incRemote } = await c.from("incomes").select("*").eq("user_id", uid);
            if (incRemote && incRemote.length) {
                const localInc = local.getIncomes();
                const localIds = new Set(localInc.map(function (i) { return i.id; }));
                const toAdd = incRemote.filter(function (r) { return !localIds.has(r.id); }).map(function (r) {
                    return {
                        id: r.id,
                        amount: Number(r.amount),
                        source: r.source,
                        description: r.description,
                        date: r.date,
                        paymentMethod: r.payment_method,
                        origin: r.origin,
                        createdAt: r.created_at,
                        updatedAt: r.updated_at
                    };
                });
                if (toAdd.length) {
                    const merged = localInc.concat(toAdd);
                    local.saveIncomes(merged);
                    console.info("[Supabase Sync] pull incomes +" + toAdd.length);
                }
            }
            // Budgets
            const { data: budRemote } = await c.from("budgets").select("*").eq("user_id", uid);
            if (budRemote) {
                const map = {};
                budRemote.forEach(function (r) { map[r.month] = Number(r.amount); });
                const localBud = local.getBudgets();
                const merged = Object.assign({}, localBud, map);
                // Sauvegarde directe via driver
                try { global.localStorage.setItem("finatrack_budget", JSON.stringify(merged)); } catch (e) {}
            }
            // Wallets
            const { data: walRemote } = await c.from("wallets").select("*").eq("user_id", uid);
            if (walRemote) {
                const map = {};
                walRemote.forEach(function (r) { map[r.method] = Number(r.amount); });
                const localWal = local.getWallets();
                const merged = Object.assign({}, localWal, map);
                try { global.localStorage.setItem("finatrack_wallets", JSON.stringify(merged)); } catch (e) {}
                if (walRemote.length) console.info("[Supabase Sync] pull wallets +" + walRemote.length);
            }
            // Settings
            try {
                const { data: setRemote } = await c.from("settings").select("*").eq("user_id", uid).maybeSingle();
                if (setRemote) {
                    const mergedSettings = {
                        currency: setRemote.currency || "FCFA",
                        theme: setRemote.theme || "light",
                        textSize: setRemote.text_size || "normal",
                        voiceLanguage: setRemote.voice_language || "fr-FR",
                        area: setRemote.area || "Cocody — Angré",
                        alertsEnabled: setRemote.alerts_enabled !== false
                    };
                    try { global.localStorage.setItem("finatrack_settings", JSON.stringify(mergedSettings)); } catch (e) {}
                    console.info("[Supabase Sync] pull settings");
                }
            } catch (e) { console.warn("[Supabase Sync] pull settings failed", e.message); }
            // Profiles (just log, not critical for app)
            try {
                const { data: profRemote } = await c.from("profiles").select("*").eq("id", uid).maybeSingle();
                if (profRemote) console.info("[Supabase Sync] pull profile", profRemote.email);
            } catch (e) {}

            U.bus.emit("data:changed", { type: "all", action: "pull" });
        } catch (e) {
            console.warn("[Supabase Sync] pull failed", e.message);
        }
    }

    async function pushExpense(e) {
        const c = getClient();
        let uid = await getUserId();
        if (!uid) uid = await getUserId(true);
        if (!c || !uid || !isOnline()) {
            console.warn("[Supabase Sync] push expense skipped — no uid", { uid: uid, online: isOnline() });
            return;
        }
        try {
            const { error } = await c.from("expenses").upsert(toRowExpense(e, uid));
            if (error) console.error("[Supabase Sync] push expense error", error);
            else console.info("[Supabase Sync] push expense ok", e.id);
        } catch (err) { console.error("[Supabase Sync] push expense failed", err.message, err); }
    }

    async function pushIncome(i) {
        const c = getClient();
        let uid = await getUserId();
        if (!uid) uid = await getUserId(true);
        if (!c || !uid || !isOnline()) {
            console.warn("[Supabase Sync] push income skipped — no uid");
            return;
        }
        try {
            const { error } = await c.from("incomes").upsert(toRowIncome(i, uid));
            if (error) console.error("[Supabase Sync] push income error", error);
            else console.info("[Supabase Sync] push income ok", i.id);
        } catch (err) { console.error("[Supabase Sync] push income failed", err.message, err); }
    }

    async function pushBudget(month, amount) {
        const c = getClient();
        let uid = await getUserId();
        if (!uid) uid = await getUserId(true);
        if (!c || !uid || !isOnline()) {
            console.warn("[Supabase Sync] push budget skipped — no uid");
            return;
        }
        try {
            let res;
            if (amount <= 0) res = await c.from("budgets").delete().eq("user_id", uid).eq("month", month);
            else res = await c.from("budgets").upsert({ user_id: uid, month: month, amount: amount });
            if (res.error) console.error("[Supabase Sync] push budget error", res.error);
            else console.info("[Supabase Sync] push budget ok", month, amount);
        } catch (e) { console.error("[Supabase Sync] push budget failed", e.message, e); }
    }

    async function pushWallet(method, amount) {
        const c = getClient();
        let uid = await getUserId();
        if (!uid) uid = await getUserId(true);
        if (!c || !uid || !isOnline()) {
            console.warn("[Supabase Sync] push wallet skipped — no uid", { method: method, amount: amount, uid: uid });
            if (!uid) {
                try {
                    if (global.FT && FT.utils && FT.utils.toast) {
                        FT.utils.toast("Session Supabase manquante", "warn", "Déconnectez-vous puis reconnectez-vous pour synchroniser les portefeuilles.");
                    }
                } catch(e){}
            }
            return;
        }
        try {
            let res;
            if (!amount && amount !== 0) {
                res = await c.from("wallets").delete().eq("user_id", uid).eq("method", method);
            } else {
                res = await c.from("wallets").upsert({ user_id: uid, method: method, amount: amount }, { onConflict: "user_id,method" });
            }
            if (res.error) console.error("[Supabase Sync] push wallet error", res.error, { method: method, amount: amount });
            else console.info("[Supabase Sync] push wallet ok", method, amount);
        } catch (e) { console.error("[Supabase Sync] push wallet failed", e.message, e); }
    }

    async function pushSettings(settings) {
        const c = getClient();
        let uid = await getUserId();
        if (!uid) uid = await getUserId(true);
        if (!c || !uid || !isOnline()) {
            console.warn("[Supabase Sync] push settings skipped — no uid");
            return;
        }
        try {
            const baseRow = {
                user_id: uid,
                currency: settings.currency || "FCFA",
                theme: settings.theme || "light",
                text_size: settings.textSize || "normal",
                voice_language: settings.voiceLanguage || "fr-FR",
                area: settings.area || "Cocody — Angré",
                updated_at: new Date().toISOString()
            };
            // Essaie avec alerts_enabled, sinon sans (colonne peut manquer)
            let rowWithAlert = Object.assign({}, baseRow, { alerts_enabled: settings.alertsEnabled !== false });
            let { error } = await c.from("settings").upsert(rowWithAlert, { onConflict: "user_id" });
            if (error && error.message && error.message.toLowerCase().indexOf("alerts_enabled") !== -1) {
                console.warn("[Supabase Sync] alerts_enabled column missing, retry without");
                const res2 = await c.from("settings").upsert(baseRow, { onConflict: "user_id" });
                if (res2.error) console.error("[Supabase Sync] push settings error", res2.error);
                else console.info("[Supabase Sync] push settings ok (without alerts_enabled)");
                return;
            }
            if (error) console.error("[Supabase Sync] push settings error", error);
            else console.info("[Supabase Sync] push settings ok");
        } catch (e) { console.error("[Supabase Sync] push settings failed", e.message, e); }
    }

    function wrapLocalWithSync() {
        const data = global.FT.data;
        if (!data || data.__supabaseWrapped) return;
        data.__supabaseWrapped = true;

        const origAddExp = data.addExpense.bind(data);
        data.addExpense = function (exp) {
            const rec = origAddExp(exp);
            if (rec) pushExpense(rec);
            return rec;
        };
        const origUpdExp = data.updateExpense.bind(data);
        data.updateExpense = function (id, patch) {
            const rec = origUpdExp(id, patch);
            if (rec) pushExpense(rec);
            return rec;
        };
        const origDelExp = data.deleteExpense.bind(data);
        data.deleteExpense = function (id) {
            const ok = origDelExp(id);
            if (ok) {
                const c = getClient();
                getUserId().then(function (uid) {
                    if (c && uid && isOnline()) c.from("expenses").delete().eq("id", id).eq("user_id", uid);
                });
            }
            return ok;
        };

        const origAddInc = data.addIncome.bind(data);
        data.addIncome = function (inc) {
            const rec = origAddInc(inc);
            if (rec) pushIncome(rec);
            return rec;
        };
        const origUpdInc = data.updateIncome.bind(data);
        data.updateIncome = function (id, patch) {
            const rec = origUpdInc(id, patch);
            if (rec) pushIncome(rec);
            return rec;
        };
        const origDelInc = data.deleteIncome.bind(data);
        data.deleteIncome = function (id) {
            const ok = origDelInc(id);
            if (ok) {
                const c = getClient();
                getUserId().then(function (uid) {
                    if (c && uid && isOnline()) c.from("incomes").delete().eq("id", id).eq("user_id", uid);
                });
            }
            return ok;
        };

        const origSetBudget = data.setBudget.bind(data);
        data.setBudget = function (month, amount) {
            const v = origSetBudget(month, amount);
            pushBudget(month, v);
            return v;
        };

        const origSetWallet = data.setWallet.bind(data);
        data.setWallet = function (method, amount) {
            const v = origSetWallet(method, amount);
            pushWallet(method, amount === "" ? null : v);
            return v;
        };

        const origSaveSettings = data.saveSettings ? data.saveSettings.bind(data) : null;
        if (origSaveSettings) {
            data.saveSettings = function (patch) {
                const v = origSaveSettings(patch);
                // Récupère settings complets après merge
                try {
                    const full = data.getSettings();
                    pushSettings(full);
                } catch (e) {}
                return v;
            };
        }
    }

    async function init() {
        const c = getClient();
        if (!c) {
            console.info("[Supabase Sync] désactivé — FT_CONFIG manquant");
            return false;
        }
        enabled = true;
        // Récupère session
        let uid = await getUserId(true);
        if (!uid) {
            // Si on a une session locale mais pas de session Supabase, on force reconnexion
            try {
                const localSess = global.localStorage.getItem("finatrack_session");
                if (localSess) {
                    console.warn("[Supabase Sync] Session locale présente mais pas de session Supabase — reconnexion requise");
                    // On ne supprime pas tout de suite, on laisse l'utilisateur se reconnecter
                    // Mais on nettoie le cache userId pour retenter au prochain login
                    userId = null;
                }
            } catch(e){}
        }
        // Pull initial
        await pull();
        // Wrap les méthodes locales
        wrapLocalWithSync();

        // Sync périodique quand on revient en ligne
        global.addEventListener("online", function () { pull(); });
        // Écoute auth
        c.auth.onAuthStateChange(function (event, session) {
            userId = session && session.user ? session.user.id : null;
            if (event === "SIGNED_IN") pull();
            U.bus.emit("auth:changed", { action: event, userId: userId });
        });

        console.info("[Supabase Sync] hybride activé (local = source, cloud = miroir)");
        return true;
    }

    global.FT.supabaseSync = {
        init: init,
        pull: pull,
        getClient: getClient,
        isEnabled: function () { return enabled; }
    };

})(window);
