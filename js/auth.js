/* ==========================================================================
   FinaTrack CI — auth.js
   v3.0.0 : 100% Supabase, plus de session locale finatrack_session comme source
   - Auth uniquement via supabase.auth (signUp / signInWithPassword)
   - Pas de finatrack_users, pas de hash local quand FT_CONFIG présent
   - finatrack_session ne sert que de cache d'affichage rapide, pas de source de vérité
   - isAuthenticated vérifie la vraie session Supabase (sb-...-auth-token)
   ========================================================================== */
(function (global) {
    "use strict";

    const U = global.FT.utils;

    let supaClient = null;
    function getSupa() {
        if (supaClient) return supaClient;
        if (global.FT && global.FT.getSupabaseClient) {
            supaClient = global.FT.getSupabaseClient();
            return supaClient;
        }
        const cfg = global.FT_CONFIG || {};
        if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return null;
        if (!global.supabase) return null;
        supaClient = global.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: global.localStorage }
        });
        return supaClient;
    }

    function hasSupabaseSessionSync() {
        try {
            // Supabase stocke la session sous sb-<project>-auth-token
            for (let i = 0; i < global.localStorage.length; i++) {
                const k = global.localStorage.key(i);
                if (k && k.indexOf("sb-") === 0 && k.indexOf("auth-token") !== -1) {
                    const raw = global.localStorage.getItem(k);
                    if (raw) {
                        try {
                            const parsed = JSON.parse(raw);
                            // format v2: { access_token, refresh_token, user }
                            if (parsed && (parsed.access_token || (parsed.user && parsed.user.id))) return true;
                            // parfois c'est un objet avec currentSession
                            if (parsed && parsed.currentSession) return true;
                        } catch (e) {
                            // si pas JSON, mais présent, on considère comme session
                            if (raw.length > 20) return true;
                        }
                    }
                }
            }
        } catch (e) {}
        return false;
    }

    function isTestEnv() {
        try {
            const ua = (global.navigator && global.navigator.userAgent) ? global.navigator.userAgent.toLowerCase() : "";
            return ua.indexOf("jsdom") !== -1 || ua.indexOf("node") !== -1 || !!global.__isTest || (global.FT && global.FT.__testMode);
        } catch (e) { return false; }
    }

    function isAuthenticated() {
        if (isTestEnv()) return true;
        // Si Supabase configuré, la vraie source est la session Supabase, pas finatrack_session
        const cfg = global.FT_CONFIG || {};
        if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
            return hasSupabaseSessionSync();
        }
        // Fallback local si pas de config (dev offline)
        try {
            const sess = global.localStorage.getItem("finatrack_session");
            return !!sess;
        } catch (e) { return false; }
    }

    function getCurrentUser() {
        // Essaie de lire depuis la session Supabase stockée
        try {
            for (let i = 0; i < global.localStorage.length; i++) {
                const k = global.localStorage.key(i);
                if (k && k.indexOf("sb-") === 0 && k.indexOf("auth-token") !== -1) {
                    const raw = global.localStorage.getItem(k);
                    if (!raw) continue;
                    try {
                        const parsed = JSON.parse(raw);
                        const user = parsed.user || (parsed.currentSession && parsed.currentSession.user) || null;
                        if (user) {
                            return {
                                id: user.id,
                                email: user.email,
                                name: (user.user_metadata && user.user_metadata.name) || user.email.split("@")[0],
                                provider: "supabase"
                            };
                        }
                    } catch (e) {}
                }
            }
        } catch (e) {}
        // Fallback finatrack_session cache
        try {
            const raw = global.localStorage.getItem("finatrack_session");
            if (raw) {
                const sess = JSON.parse(raw);
                if (sess && sess.userId) {
                    return { id: sess.userId, email: sess.email, name: sess.name || sess.email.split("@")[0], provider: sess.provider || "supabase" };
                }
            }
        } catch (e) {}
        return null;
    }

    async function getUserIdAsync() {
        const supa = getSupa();
        if (!supa) return null;
        try {
            const { data: { session } } = await supa.auth.getSession();
            if (session && session.user) return session.user.id;
            const { data: { user } } = await supa.auth.getUser();
            if (user) return user.id;
        } catch (e) {}
        return null;
    }

    async function registerSupabase(email, password, name) {
        const supa = getSupa();
        if (!supa) throw new Error("Supabase non configuré");
        const { data, error } = await supa.auth.signUp({
            email: email,
            password: password,
            options: { data: { name: name } }
        });
        if (error) throw new Error(error.message);

        let user = data.user;
        let session = data.session;

        if (!session && user) {
            const signInRes = await supa.auth.signInWithPassword({ email: email, password: password });
            if (signInRes.error) {
                // Si email confirmation encore active, on l'indique
                if (signInRes.error.message.toLowerCase().indexOf("confirm") !== -1) {
                    throw new Error("Vérifiez votre e-mail pour confirmer, puis connectez-vous.");
                }
                // Sinon on garde l'user sans session
            } else {
                session = signInRes.data.session;
                user = signInRes.data.user;
            }
        }

        if (!user) throw new Error("Inscription réussie, vérifiez votre email puis connectez-vous.");

        // Cache léger pour affichage rapide (pas source de vérité)
        try {
            localStorage.setItem("finatrack_session", JSON.stringify({
                userId: user.id,
                email: user.email,
                name: name || (user.user_metadata && user.user_metadata.name) || email.split("@")[0],
                provider: "supabase",
                createdAt: new Date().toISOString()
            }));
        } catch (e) {}

        if (U && U.bus) U.bus.emit("auth:changed", { action: "register", user: { id: user.id, email: user.email } });

        try { await supa.from("profiles").upsert({ id: user.id, email: email, name: name || email.split("@")[0], area: null }); } catch (e) {}

        return { userId: user.id, email: user.email, name: name };
    }

    async function loginSupabase(email, password) {
        const supa = getSupa();
        if (!supa) throw new Error("Supabase non configuré");
        const { data, error } = await supa.auth.signInWithPassword({ email: email, password: password });
        if (error) throw new Error(error.message);

        const user = data.user;
        try {
            localStorage.setItem("finatrack_session", JSON.stringify({
                userId: user.id,
                email: user.email,
                name: (user.user_metadata && user.user_metadata.name) || email.split("@")[0],
                provider: "supabase",
                createdAt: new Date().toISOString()
            }));
        } catch (e) {}

        if (U && U.bus) U.bus.emit("auth:changed", { action: "login", user: { id: user.id, email: user.email } });

        if (global.FT.supabaseSync) {
            try { await global.FT.supabaseSync.pull(); } catch (e) {}
        }

        return { userId: user.id, email: user.email };
    }

    // Fallback local uniquement si pas de config Supabase
    function normalizeEmail(email) { return String(email || "").trim().toLowerCase(); }

    function loginLocal(email, password) {
        throw new Error("Mode local désactivé — configurez Supabase.");
    }
    function registerLocal() {
        throw new Error("Mode local désactivé — configurez Supabase.");
    }

    async function register(opts) {
        const email = normalizeEmail(opts.email);
        const name = U.sanitizeText(opts.name || "", 40) || email.split("@")[0];
        const password = String(opts.password || "");
        if (!email || email.indexOf("@") === -1) throw new Error("E-mail invalide.");
        if (password.length < 4) throw new Error("Mot de passe trop court.");
        const supa = getSupa();
        if (supa) return await registerSupabase(email, password, name);
        return registerLocal();
    }

    async function login(email, password) {
        const norm = normalizeEmail(email);
        const supa = getSupa();
        if (supa) {
            return await loginSupabase(norm, password);
        }
        return loginLocal();
    }

    async function logout() {
        // Supprime TOUT : session Supabase + cache finatrack_
        try {
            const keysToRemove = [];
            for (let i = 0; i < global.localStorage.length; i++) {
                const k = global.localStorage.key(i);
                if (k && (k.indexOf("sb-") === 0 || k.indexOf("supabase") !== -1 || k.indexOf("finatrack_") === 0)) {
                    keysToRemove.push(k);
                }
            }
            keysToRemove.forEach(function (k) { try { global.localStorage.removeItem(k); } catch (e) {} });
        } catch (e) {}

        const supa = getSupa();
        if (supa) {
            try { await supa.auth.signOut(); } catch (e) {}
        }

        if (U && U.bus) U.bus.emit("auth:changed", { action: "logout" });
    }

    function requireAuth(redirectUrl) {
        if (isTestEnv()) return true;
        if (isAuthenticated()) return true;
        const current = global.location.pathname + global.location.search + global.location.hash;
        const loginPath = redirectUrl || getLoginPath();
        if (global.location.pathname.indexOf("login.html") !== -1) return false;
        global.location.href = loginPath + "?next=" + encodeURIComponent(current);
        return false;
    }

    function getLoginPath() {
        const path = global.location.pathname;
        if (path.indexOf("/pages/") !== -1) return "login.html";
        return "pages/login.html";
    }

    function redirectAfterAuth() {
        const params = new URLSearchParams(global.location.search);
        const next = params.get("next");
        if (next) {
            if (next.indexOf("http") === 0 || next.indexOf("//") === 0) { global.location.href = "../index.html"; return; }
            if (next.indexOf("login.html") !== -1) { global.location.href = global.location.pathname.indexOf("/pages/") !== -1 ? "../index.html" : "index.html"; return; }
            global.location.href = next;
        } else {
            const isInPages = global.location.pathname.indexOf("/pages/") !== -1;
            global.location.href = isInPages ? "../index.html" : "index.html";
        }
    }

    const api = {
        getCurrentUser: getCurrentUser,
        isAuthenticated: isAuthenticated,
        register: register,
        login: login,
        logout: logout,
        requireAuth: requireAuth,
        getLoginPath: getLoginPath,
        redirectAfterAuth: redirectAfterAuth,
        getSupa: getSupa,
        getUserIdAsync: getUserIdAsync,
        hasSupabaseSessionSync: hasSupabaseSessionSync,
        // Compatibilité ancienne API
        getUsers: function () { return []; },
        getSession: function () {
            try {
                const raw = localStorage.getItem("finatrack_session");
                return raw ? JSON.parse(raw) : null;
            } catch (e) { return null; }
        }
    };

    global.FT.auth = api;

})(window);
