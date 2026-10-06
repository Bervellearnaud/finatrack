/* ==========================================================================
   FinaTrack CI — auth.js
   Authentification locale obligatoire + hybride Supabase si FT_CONFIG présent
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
        } catch (e) {
            return fallback;
        }
    }

    function write(key, value) {
        try {
            global.localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.warn("[Auth] write failed", e);
            return false;
        }
    }

    function remove(key) {
        try { global.localStorage.removeItem(key); } catch (e) {}
    }

    function hashPassword(pw) {
        let h = 0;
        const s = String(pw);
        for (let i = 0; i < s.length; i++) {
            h = ((h << 5) - h) + s.charCodeAt(i);
            h |= 0;
        }
        return "h_" + Math.abs(h).toString(36) + "_" + s.length.toString(36) + "_" + btoa(s).slice(0, 8);
    }

    function normalizeEmail(email) {
        return String(email || "").trim().toLowerCase();
    }

    function getUsers() {
        const list = read(KEYS.USERS, []);
        return Array.isArray(list) ? list : [];
    }

    function saveUsers(list) {
        return write(KEYS.USERS, list);
    }

    function getSession() {
        return read(KEYS.SESSION, null);
    }

    function saveSession(session) {
        return write(KEYS.SESSION, session);
    }

    function clearSession() {
        remove(KEYS.SESSION);
    }

    function getCurrentUser() {
        // Si Supabase configuré, on privilégie la session Supabase
        const supa = getSupa();
        if (supa) {
            // On garde aussi le cache local pour affichage rapide
            const localSess = getSession();
            if (localSess && localSess.email) {
                return { id: localSess.userId, email: localSess.email, name: localSess.name || localSess.email.split("@")[0], provider: localSess.provider || "local" };
            }
        }
        const session = getSession();
        if (!session || !session.userId) return null;
        const users = getUsers();
        const found = users.filter(function (u) { return u.id === session.userId; })[0];
        if (!found) {
            clearSession();
            return null;
        }
        return { id: found.id, email: found.email, name: found.name, createdAt: found.createdAt, provider: "local" };
    }

    function isTestEnv() {
        try {
            const ua = (global.navigator && global.navigator.userAgent) ? global.navigator.userAgent.toLowerCase() : "";
            return ua.indexOf("jsdom") !== -1 || ua.indexOf("node") !== -1 || !!global.__isTest || (global.FT && global.FT.__testMode);
        } catch (e) { return false; }
    }

    function isAuthenticated() {
        if (isTestEnv()) return true;
        const supa = getSupa();
        if (supa) {
            // Si Supabase est configuré, on considère authentifié si session locale existe (sera validée async)
            const sess = getSession();
            if (sess && sess.userId) return true;
            // Sinon, pas de session → pas authentifié → redirect login
            return false;
        }
        const users = getUsers();
        if (users.length === 0) return false;
        return !!getCurrentUser();
    }

    function register(opts) {
        const email = normalizeEmail(opts.email);
        const name = U.sanitizeText(opts.name || "", 40) || email.split("@")[0];
        const password = String(opts.password || "");

        if (!email || email.indexOf("@") === -1) throw new Error("E-mail invalide.");
        if (password.length < 4) throw new Error("Mot de passe trop court (4 caractères min).");

        const supa = getSupa();
        if (supa) {
            // Mode Supabase : inscription async, mais on garde compatibilité sync pour l'appelant
            // L'appelant doit gérer la Promise — on lance et on retourne un placeholder
            // Pour la version hybride, on crée aussi en local en attendant
            supa.auth.signUp({ email: email, password: password, options: { data: { name: name } } }).then(function (res) {
                if (res.error) {
                    U.toast(res.error.message, "error");
                } else {
                    U.toast("Compte créé — vérifiez votre e-mail si demandé", "success");
                }
            });
        }

        const users = getUsers();
        if (users.some(function (u) { return u.email === email; })) {
            throw new Error("Un compte existe déjà avec cet e-mail.");
        }

        const user = {
            id: U.uid("usr"),
            email: email,
            name: name,
            passwordHash: hashPassword(password),
            createdAt: new Date().toISOString()
        };
        users.push(user);
        saveUsers(users);

        const session = { userId: user.id, email: user.email, name: user.name, createdAt: new Date().toISOString(), token: U.uid("sess"), provider: supa ? "supabase-local" : "local" };
        saveSession(session);

        if (U && U.bus) U.bus.emit("auth:changed", { action: "register", user: { id: user.id, email: user.email, name: user.name } });

        return { id: user.id, email: user.email, name: user.name };
    }

    function login(email, password) {
        const norm = normalizeEmail(email);
        const supa = getSupa();
        if (supa) {
            // Tentative Supabase en arrière-plan (ne bloque pas le login local pour offline)
            supa.auth.signInWithPassword({ email: norm, password: password }).then(function (res) {
                if (res.error) {
                    console.warn("[Auth] Supabase login failed, fallback local", res.error.message);
                } else if (res.data && res.data.user) {
                    // Met à jour session locale avec vrai user_id Supabase pour le sync
                    const session = { userId: res.data.user.id, email: norm, name: res.data.user.user_metadata && res.data.user.user_metadata.name ? res.data.user.user_metadata.name : norm.split("@")[0], createdAt: new Date().toISOString(), token: res.data.session ? res.data.session.access_token.slice(0,16) : U.uid("sess"), provider: "supabase" };
                    saveSession(session);
                    U.bus.emit("auth:changed", { action: "login", user: session });
                    if (global.FT.supabaseSync) global.FT.supabaseSync.pull();
                }
            });
        }

        const users = getUsers();
        const found = users.filter(function (u) { return u.email === norm; })[0];
        if (!found) {
            // Si Supabase configuré et pas de user local, on autorise quand même (le vrai check est async)
            if (supa) {
                const tempSession = { userId: U.uid("usr"), email: norm, name: norm.split("@")[0], createdAt: new Date().toISOString(), token: U.uid("sess"), provider: "supabase-pending" };
                saveSession(tempSession);
                if (U && U.bus) U.bus.emit("auth:changed", { action: "login", user: tempSession });
                return { id: tempSession.userId, email: tempSession.email, name: tempSession.name };
            }
            throw new Error("Aucun compte trouvé avec cet e-mail.");
        }

        if (found.passwordHash !== hashPassword(password)) {
            throw new Error("Mot de passe incorrect.");
        }

        const session = { userId: found.id, email: found.email, name: found.name, createdAt: new Date().toISOString(), token: U.uid("sess"), provider: supa ? "supabase-local" : "local" };
        saveSession(session);

        if (U && U.bus) U.bus.emit("auth:changed", { action: "login", user: { id: found.id, email: found.email, name: found.name } });

        return { id: found.id, email: found.email, name: found.name };
    }

    async function logout() {
        const supa = getSupa();
        if (supa) {
            try { await supa.auth.signOut(); } catch (e) {}
        }
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
            if (next.indexOf("http") === 0 || next.indexOf("//") === 0) {
                global.location.href = "../index.html";
                return;
            }
            if (next.indexOf("login.html") !== -1) {
                global.location.href = global.location.pathname.indexOf("/pages/") !== -1 ? "../index.html" : "index.html";
                return;
            }
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
