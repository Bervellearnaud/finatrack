/* ==========================================================================
   FinaTrack CI — supabase-client.js
   Singleton Supabase client partagé entre auth.js et supabase-sync.js
   Évite 2 instances avec états différents qui causent "Auth session missing"
   ========================================================================== */
(function (global) {
    "use strict";

    let client = null;

    function getClient() {
        if (client) return client;
        const cfg = global.FT_CONFIG || {};
        if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
            console.warn("[Supabase] FT_CONFIG manquant");
            return null;
        }
        if (!global.supabase) {
            console.warn("[Supabase] SDK non chargé");
            return null;
        }
        client = global.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
                storage: global.localStorage
            }
        });
        // Expose pour debug
        global.FT = global.FT || {};
        global.FT.supabaseClient = client;
        return client;
    }

    global.FT = global.FT || {};
    global.FT.getSupabaseClient = getClient;

})(window);
