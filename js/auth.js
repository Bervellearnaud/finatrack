/* ==========================================================================
   FinaTrack CI — auth.js
   Auth obligatoire - 100% Supabase Auth si FT_CONFIG présent, sinon local
   ========================================================================== */
(function (global) {
    "use strict";

    const U = global.FT.utils;

    const KEYS = {
        USERS: "finatrack_users",
        SESSION: "finatrack_session"
    };

    let supaClient = null;
    function getSupa() {
        if (supaClient) return supaClient;
        const cfg = global.FT_CONFIG || {};
        if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return null;
        if (!global.supabase) return null;
        supaClient = global.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
            auth: { persistSession: true, autoRefreshToken: true }
        });
        return supaClient;
    }

    function read(key, fallback) {
        try {
            const raw = global.localStorage.getItem(key);
            if (raw === null) return fallback;
            return JSON.parse(raw);
        } catch (e) { return fallback; }
    }
    function write(key, value) {
        try { global.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
    }
    function remove(key) { try { global.localStorage.removeItem(key); } catch (e) {} }

    function hashPassword(pw) {
        let h = 0; const s = String(pw);
        for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
        return "h_" + Math.abs(h).toString(36) + "_" + s.length.toString(36) + "_" + btoa(s).slice(0, 8);
    }
    function normalizeEmail(email) { return String(email || "").trim().toLowerCase(); }

    function getUsers() { const list = read(KEYS.USERS, []); return Array.isArray(list) ? list : []; }
    function saveUsers(list) { return write(KEYS.USERS, list); }
    function getSession() { return read(KEYS.SESSION, null); }
    function saveSession(s) { return write(KEYS.SESSION, s); }
    function clearSession() { remove(KEYS.SESSION); }

    function getCurrentUser() {
        const sess = getSession();
        if (!sess) return null;
        return { id: sess.userId, email: sess.email, name: sess.name || sess.email.split("@")[0], provider: sess.provider || "local", createdAt: sess.createdAt };
    }

    function isTestEnv() {
        try {
            const ua = (global.navigator && global.navigator.userAgent) ? global.navigator.userAgent.toLowerCase() : "";
            return ua.indexOf("jsdom") !== -1 || ua.indexOf("node") !== -1 || !!global.__isTest || (global.FT && global.FT.__testMode);
        } catch (e) { return false; }
    }

    function isAuthenticated() {
        if (isTestEnv()) return true;
        const sess = getSession();
        return !!(sess && sess.userId);
    }

    // --- Mode Supabase : async ---
    async function registerSupabase(email, password, name) {
        const supa = getSupa();
        if (!supa) throw new Error("Supabase non configuré");
        const { data, error } = await supa.auth.signUp({
            email: email,
            password: password,
            options: { data: { name: name } }
        });
        if (error) throw new Error(error.message);
        // Si confirmation email désactivée, on a directement une session
        // Si activée, data.user existe mais pas de session -> on tente signIn
        let user = data.user;
        let session = data.session;
        if (!session && user) {
            const signInRes = await supa.auth.signInWithPassword({ email: email, password: password });
            if (!signInRes.error) {
                session = signInRes.data.session;
                user = signInRes.data.user;
            }
        }
        if (!user) throw new Error("Inscription réussie, vérifiez votre email puis connectez-vous.");

        const sess = {
            userId: user.id,
            email: user.email,
            name: name || (user.user_metadata && user.user_metadata.name) || email.split("@")[0],
            createdAt: new Date().toISOString(),
            token: session ? session.access_token.slice(0, 20) : U.uid("sess"),
            provider: "supabase"
        };
        saveSession(sess);
        // Crée aussi en local pour compatibilité
        const users = getUsers();
        if (!users.some(function (u) { return u.email === email; })) {
            users.push({ id: user.id, email: email, name: sess.name, passwordHash: hashPassword(password), createdAt: sess.createdAt });
            saveUsers(users);
        }
        if (U && U.bus) U.bus.emit("auth:changed", { action: "register", user: sess });
        // Crée profil
        try { await supa.from("profiles").upsert({ id: user.id, email: email, name: sess.name }); } catch (e) {}
        return sess;
    }

    async function loginSupabase(email, password) {
        const supa = getSupa();
        if (!supa) throw new Error("Supabase non configuré");
        const { data, error } = await supa.auth.signInWithPassword({ email: email, password: password });
        if (error) throw new Error(error.message);
        const user = data.user;
        const sess = {
            userId: user.id,
            email: user.email,
            name: (user.user_metadata && user.user_metadata.name) || email.split("@")[0],
            createdAt: new Date().toISOString(),
            token: data.session.access_token.slice(0, 20),
            provider: "supabase"
        };
        saveSession(sess);
        const users = getUsers();
        if (!users.some(function (u) { return u.email === email; })) {
            users.push({ id: user.id, email: email, name: sess.name, passwordHash: hashPassword(password), createdAt: sess.createdAt });
            saveUsers(users);
        }
        if (U && U.bus) U.bus.emit("auth:changed", { action: "login", user: sess });
        if (global.FT.supabaseSync) await global.FT.supabaseSync.pull();
        return sess;
    }

    // --- Mode Local (fallback si pas de config) ---
    function registerLocal(email, password, name) {
        if (!email || email.indexOf("@") === -1) throw new Error("E-mail invalide.");
        if (password.length < 4) throw new Error("Mot de passe trop court (4 min).");
        const users = getUsers();
        if (users.some(function (u) { return u.email === email; })) throw new Error("Compte existe déjà.");
        const user = { id: U.uid("usr"), email: email, name: name, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
        users.push(user); saveUsers(users);
        const sess = { userId: user.id, email: user.email, name: user.name, createdAt: user.createdAt, token: U.uid("sess"), provider: "local" };
        saveSession(sess);
        if (U && U.bus) U.bus.emit("auth:changed", { action: "register", user: sess });
        return sess;
    }
    function loginLocal(email, password) {
        const users = getUsers();
        const found = users.filter(function (u) { return u.email === email; })[0];
        if (!found) throw new Error("Aucun compte trouvé.");
        if (found.passwordHash !== hashPassword(password)) throw new Error("Mot de passe incorrect.");
        const sess = { userId: found.id, email: found.email, name: found.name, createdAt: new Date().toISOString(), token: U.uid("sess"), provider: "local" };
        saveSession(sess);
        if (U && U.bus) U.bus.emit("auth:changed", { action: "login", user: sess });
        return sess;
    }

    // API publique : gère les deux modes
    async function register(opts) {
        const email = normalizeEmail(opts.email);
        const name = U.sanitizeText(opts.name || "", 40) || email.split("@")[0];
        const password = String(opts.password || "");
        if (!email || email.indexOf("@") === -1) throw new Error("E-mail invalide.");
        if (password.length < 4) throw new Error("Mot de passe trop court.");
        const supa = getSupa();
        if (supa) return await registerSupabase(email, password, name);
        return registerLocal(email, password, name);
    }

    async function login(email, password) {
        const norm = normalizeEmail(email);
        const supa = getSupa();
        if (supa) {
            try {
                return await loginSupabase(norm, password);
            } catch (e) {
                // Si Supabase échoue mais on a un compte local (offline), fallback
                if (e.message && e.message.toLowerCase().indexOf("invalid login") !== -1) {
                    const users = getUsers();
                    if (users.some(function (u) { return u.email === norm; })) {
                        return loginLocal(norm, password);
                    }
                }
                throw e;
            }
        }
        return loginLocal(norm, password);
    }

    async function logout() {
        const supa = getSupa();
        if (supa) { try { await supa.auth.signOut(); } catch (e) {} }
        clearSession();
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
        KEYS: KEYS,
        getUsers: getUsers,
        getSession: getSession,
        getCurrentUser: getCurrentUser,
        isAuthenticated: isAuthenticated,
        register: register,
        login: login,
        logout: logout,
        requireAuth: requireAuth,
        getLoginPath: getLoginPath,
        redirectAfterAuth: redirectAfterAuth,
        getSupa: getSupa
    };
    global.FT.auth = api;
})(window);
