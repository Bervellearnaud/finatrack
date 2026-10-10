/* ==========================================================================
   FinaTrack CI — sw.js (service worker)
   Permet d'ouvrir l'application sur mobile sans connexion : les données vivent
   déjà dans LocalStorage, seule l'interface doit être mise en cache.

   Stratégies :
     • précache de la coquille applicative à l'installation ;
     • navigation : réseau d'abord (pour recevoir les mises à jour), repli sur
       le cache, puis sur la page d'accueil ;
     • autres ressources internes : cache d'abord, mise à jour en arrière-plan
       (stale-while-revalidate) ;
     • aucune requête vers un autre domaine n'est interceptée.
   ========================================================================== */

const VERSION = "finatrack-v1.9.2";   /* v1.9.2 : retire default Cocody sur profiles.area, zone libre */
const CACHE_NAME = VERSION + "-static";

/* Chemins relatifs : le service worker fonctionne aussi dans un sous-dossier
   (GitHub Pages : https://utilisateur.github.io/depot/) */
const PRECACHE = [
    "./",
    "./index.html",
    "./pages/wallets.html",
    "./pages/transactions.html",
    "./pages/incomes.html",
    "./pages/budget.html",
    "./pages/analysis.html",
    "./pages/settings.html",
    "./pages/login.html",
    "./css/style.css",
    "./css/components.css",
    "./css/responsive.css",
    "./js/utils.js",
    "./js/storage.js",
    "./js/config.js",
    "./js/auth.js",
    "./js/supabase-sync.js",
    "./js/supabase-adapter.js",
    "./js/expenses.js",
    "./js/incomes.js",
    "./js/transactions.js",
    "./js/payments.js",
    "./js/budget.js",
    "./js/dashboard.js",
    "./js/analysis.js",
    "./js/charts.js",
    "./js/voiceExpense.js",
    "./js/mobile.js",
    "./js/app.js",
    "./js/vendor/chart.umd.min.js",
    "./js/vendor/supabase.min.js",
    "./manifest.webmanifest",
    "./assets/icons/icon-32.png",
    "./assets/icons/icon-180.png",
    "./assets/icons/icon-192.png",
    "./assets/icons/icon-512.png",
    "./assets/icons/icon-512-maskable.png"
];

/* --------------------------------------------------------------------------
   Installation : mise en cache de la coquille
   -------------------------------------------------------------------------- */
self.addEventListener("install", function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            /* addAll échoue en bloc : on tolère les ressources manquantes */
            return Promise.all(PRECACHE.map(function (url) {
                return cache.add(new Request(url, { cache: "reload" })).catch(function () {
                    /* ressource absente : l'application fonctionnera quand même */
                });
            }));
        }).then(function () {
            return self.skipWaiting();
        })
    );
});

/* --------------------------------------------------------------------------
   Activation : nettoyage des anciennes versions
   -------------------------------------------------------------------------- */
self.addEventListener("activate", function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (key) {
                if (key !== CACHE_NAME && key.indexOf("finatrack-") === 0) {
                    return caches.delete(key);
                }
                return Promise.resolve();
            }));
        }).then(function () {
            return self.clients.claim();
        })
    );
});

/* --------------------------------------------------------------------------
   Interception des requêtes
   -------------------------------------------------------------------------- */
self.addEventListener("fetch", function (event) {
    const request = event.request;

    if (request.method !== "GET") return;

    const url = new URL(request.url);

    /* Uniquement le même domaine : on ne touche jamais aux tiers */
    if (url.origin !== self.location.origin) return;

    /* Navigations (ouverture d'une page) : réseau d'abord, cache en secours */
    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then(function (response) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
                    return response;
                })
                .catch(function () {
                    return caches.match(request).then(function (cached) {
                        return cached || caches.match("./index.html") || caches.match("./");
                    });
                })
        );
        return;
    }

    /* Autres ressources : cache d'abord, rafraîchissement en arrière-plan */
    event.respondWith(
        caches.match(request).then(function (cached) {
            const network = fetch(request).then(function (response) {
                if (response && response.status === 200 && response.type === "basic") {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
                }
                return response;
            }).catch(function () {
                return cached;
            });
            return cached || network;
        })
    );
});

/* --------------------------------------------------------------------------
   Messages de la page (mise à jour immédiate)
   -------------------------------------------------------------------------- */
self.addEventListener("message", function (event) {
    const data = event.data || {};
    if (data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
    if (data.type === "VERSION") {
        if (event.source && event.source.postMessage) {
            event.source.postMessage({ type: "VERSION", version: VERSION });
        }
    }
});
