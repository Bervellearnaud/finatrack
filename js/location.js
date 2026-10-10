/* ==========================================================================
   FinaTrack CI — location.js
   Système de localisation automatique (remplace la saisie manuelle de zone)
   - Utilise navigator.geolocation (GPS/WiFi) si disponible
   - Fallback : timezone Africa/Abidjan + ville par défaut
   - Stocke dans finatrack_location + settings.area (pour compatibilité)
   - Pas d'appel externe obligatoire (Nominatim en option, avec cache)
   ========================================================================== */
(function (global) {
    "use strict";

    const U = global.FT.utils;
    const data = global.FT.data;

    const STORAGE_KEY = "finatrack_location";
    const NOMINATIM_CACHE_KEY = "finatrack_nominatim_cache";

    function readLocation() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) { return null; }
    }

    function saveLocation(loc) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
            // Met aussi à jour settings.area pour compatibilité dashboard/bannière
            if (loc && loc.label) {
                const current = data.getSettings();
                if (current.area !== loc.label) {
                    data.saveSettings({ area: loc.label });
                }
            }
            U.bus.emit("location:changed", loc);
            return loc;
        } catch (e) { return null; }
    }

    function formatLabel(city, district) {
        if (city && district && city !== district) return district + " — " + city;
        if (district) return district;
        if (city) return city;
        return "Abidjan";
    }

    async function reverseGeocode(lat, lng) {
        // Cache pour éviter trop d'appels Nominatim
        try {
            const cacheRaw = localStorage.getItem(NOMINATIM_CACHE_KEY);
            if (cacheRaw) {
                const cache = JSON.parse(cacheRaw);
                const key = lat.toFixed(3) + "," + lng.toFixed(3);
                if (cache[key] && (Date.now() - cache[key].ts) < 7 * 24 * 3600 * 1000) {
                    return cache[key].data;
                }
            }
        } catch (e) {}

        // Essaie Nominatim (gratuit, pas de clé) — peut échouer offline
        try {
            const url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" + lat + "&lon=" + lng + "&zoom=14&addressdetails=1";
            const res = await fetch(url, { headers: { "Accept": "application/json" } });
            if (!res.ok) throw new Error("Nominatim " + res.status);
            const json = await res.json();
            const addr = json.address || {};
            const city = addr.city || addr.town || addr.municipality || addr.county || "Abidjan";
            const district = addr.suburb || addr.neighbourhood || addr.quarter || addr.village || "";
            const label = formatLabel(city, district);

            const result = { city: city, district: district, label: label, display: json.display_name || label };

            // Sauve en cache
            try {
                const cacheRaw = localStorage.getItem(NOMINATIM_CACHE_KEY);
                const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
                const key = lat.toFixed(3) + "," + lng.toFixed(3);
                cache[key] = { ts: Date.now(), data: result };
                localStorage.setItem(NOMINATIM_CACHE_KEY, JSON.stringify(cache));
            } catch (e) {}

            return result;
        } catch (e) {
            console.warn("[Location] reverse geocode failed", e.message);
            return null;
        }
    }

    function getCurrentPosition() {
        return new Promise(function (resolve, reject) {
            if (!navigator.geolocation) {
                reject(new Error("Géolocalisation non disponible"));
                return;
            }
            const opts = { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 };
            navigator.geolocation.getCurrentPosition(
                function (pos) {
                    resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
                },
                function (err) {
                    reject(err);
                },
                opts
            );
        });
    }

    async function detectLocation(opts) {
        const options = opts || {};
        const silent = !!options.silent;

        try {
            if (!silent) U.toast("Localisation en cours...", "info", "Autorisez l'accès à votre position si demandé.");

            const pos = await getCurrentPosition();
            let rev = await reverseGeocode(pos.lat, pos.lng);

            // Si reverse échoue, on garde quand même lat/lng avec label par défaut
            if (!rev) {
                rev = { city: "Abidjan", district: "", label: "Abidjan", display: pos.lat.toFixed(4) + ", " + pos.lng.toFixed(4) };
            }

            const loc = {
                lat: pos.lat,
                lng: pos.lng,
                accuracy: pos.accuracy,
                city: rev.city,
                district: rev.district,
                label: rev.label,
                display: rev.display,
                timestamp: new Date().toISOString(),
                source: "gps"
            };

            saveLocation(loc);

            if (!silent) U.toast("Position détectée", "success", loc.label);

            return loc;
        } catch (e) {
            console.warn("[Location] detect failed", e.message);
            if (!silent) {
                if (e.code === 1) {
                    U.toast("Localisation refusée", "warn", "Activez la localisation dans votre navigateur pour détecter votre zone automatiquement.");
                } else {
                    U.toast("Localisation impossible", "warn", "Vérifiez votre connexion ou saisissez votre zone manuellement.");
                }
            }
            // Fallback : timezone
            const fallback = getFallbackLocation();
            saveLocation(fallback);
            return fallback;
        }
    }

    function getFallbackLocation() {
        // Utilise timezone pour deviner, sinon Abidjan par défaut
        let city = "Abidjan";
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (tz && tz.indexOf("Abidjan") !== -1) city = "Abidjan";
        } catch (e) {}
        return {
            lat: null,
            lng: null,
            accuracy: null,
            city: city,
            district: "",
            label: city,
            display: city,
            timestamp: new Date().toISOString(),
            source: "fallback"
        };
    }

    function getLabel() {
        const loc = readLocation();
        if (loc && loc.label) return loc.label;
        const settings = data.getSettings();
        if (settings.area) return settings.area;
        return U.LOCAL_CONTEXT.city || "Abidjan";
    }

    // API publique
    global.FT.location = {
        read: readLocation,
        save: saveLocation,
        detect: detectLocation,
        getLabel: getLabel,
        getFallback: getFallbackLocation,
        reverseGeocode: reverseGeocode
    };

})(window);
