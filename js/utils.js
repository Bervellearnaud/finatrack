/* ==========================================================================
   FinaTrack CI — utils.js
   Constantes, formatage, dates, DOM, bus d'événements, toasts, modales.
   « Comprenez où va votre argent. »
   ========================================================================== */
(function (global) {
    "use strict";

    /* ======================================================================
       1. CONSTANTES MÉTIER
       ====================================================================== */

    /* ======================================================================
       CONTEXTE LOCAL — Abidjan, Cocody Angré (Côte d'Ivoire)
       Toutes les valeurs ci-dessous sont paramétrables : modifier ce bloc
       suffit pour adapter l'application à une autre ville ou un autre pays.
       ====================================================================== */

    const LOCAL_CONTEXT = {
        country: "Côte d'Ivoire",
        countryCode: "CI",
        city: "Abidjan",
        commune: "Cocody",
        area: "Angré",
        /** Libellé par défaut proposé dans les Paramètres */
        defaultArea: "Cocody — Angré",
        locale: "fr-CI",
        /** Opérateurs mobile money réellement actifs en Côte d'Ivoire */
        mobileMoney: ["Orange Money", "MTN Mobile Money", "Moov Money", "Wave", "Djamo"],
        /** Repères utilisés dans les exemples et les conseils (FCFA) */
        priceRefs: {
            woroWoro: 300,          // trajet intra-commune
            gbaka: 500,             // trajet inter-communes
            garba: 700,             // repas de rue
            maquis: 2500,           // repas au maquis
            forfaitInternet: 5000,  // forfait mensuel 10 Go
            factureCie: 18000,      // facture d'électricité moyenne
            tontine: 25000,         // cotisation mensuelle courante
            loyer: 70000            // part de loyer d'un jeune actif
        }
    };

    /** Catégories de dépenses (§12) */
    const CATEGORIES = [
        "Alimentation",
        "Transport",
        "Logement",
        "Électricité",
        "Eau",
        "Communication",
        "Internet",
        "Santé",
        "Shopping",
        "Loisirs",
        "Famille",
        "Éducation",
        "Abonnements",
        "Investissement",
        "Autres"
    ];

    /** Modes de paiement (§12) */
    const PAYMENT_METHODS = [
        "Espèces",
        "Orange Money",
        "MTN Mobile Money",
        "Moov Money",
        "Wave",
        "Djamo",
        "Carte bancaire",
        "Virement bancaire",
        "Autre"
    ];

    /** Sources de revenus (§29 + réalités locales) */
    const INCOME_SOURCES = [
        "Salaire",
        "Freelance",
        "Business",
        "Prime",
        "Vente",
        "Cadeau",
        "Tontine",
        "Transfert reçu",
        "Autre"
    ];

    /**
     * Repères concrets pour chaque catégorie, dans la vie abidjanaise.
     * Affichés sous le champ « Catégorie » et dans les Paramètres : ils
     * aident à classer une dépense sans se tromper.
     */
    const CATEGORY_HINTS = {
        Alimentation: "Garba, attiéké poisson, alloco, maquis, marché Cocovico",
        Transport: "Wôrô-wôrô, gbaka, SOTRA, taxi compteur, bateau-bus",
        Logement: "Loyer, caution, gardien, petites réparations",
        "Électricité": "Facture ou recharge CIE, groupe électrogène",
        Eau: "Facture SODECI, bidon, sachets d'eau, citerne",
        Communication: "Crédit Orange, MTN, Moov ou Celtiis, appels",
        Internet: "Forfait Orange CI, Orange Fibre, pass data, cybercafé",
        "Santé": "Pharmacie (8e Tranche), CHU d'Angré, clinique, analyses",
        Shopping: "La Djibi, Sicomex, China Mall, pagne, chaussures, ustensiles",
        Loisirs: "Sortie, cinéma, plage (Grand-Bassam, Assinie), PlayStation",
        Famille: "Tontine, cotisation décès, mariage, dot, soutien aux parents",
        "Éducation": "Écolage, fournitures, tenue, cours de soutien, inscription",
        Abonnements: "Canal+, Startimes, Netflix, salle de sport",
        Investissement: "Épargne, achat de marchandises, stock du commerce",
        Autres: "Amendes, imprévus, frais divers"
    };

    /** Une phrase courte expliquant le contexte local, réutilisée dans l'interface. */
    const LOCAL_INTRO = "Repères adaptés à " + LOCAL_CONTEXT.city + " (" +
        LOCAL_CONTEXT.commune + ", " + LOCAL_CONTEXT.area + ") : montants en FCFA, " +
        "opérateurs mobile money et vocabulaire du quotidien.";

    const CATEGORY_EMOJI = {
        Alimentation: "🍛",
        Transport: "🚌",
        Logement: "🏠",
        "Électricité": "💡",
        Eau: "🚰",
        Communication: "📞",
        Internet: "🌐",
        "Santé": "🏥",
        Shopping: "🛍️",
        Loisirs: "🎮",
        Famille: "👨‍👩‍👧",
        "Éducation": "📚",
        Abonnements: "🔁",
        Investissement: "📈",
        Autres: "📦"
    };

    const CATEGORY_COLORS = {
        Alimentation: "#D98B39",
        Transport: "#123C32",
        Logement: "#A94A32",
        "Électricité": "#E7B84B",
        Eau: "#4C8C99",
        Communication: "#6E5AA6",
        Internet: "#2E7D5B",
        "Santé": "#C15874",
        Shopping: "#B5713A",
        Loisirs: "#6E8B3D",
        Famille: "#9C5D9B",
        "Éducation": "#3C6FB9",
        Abonnements: "#7A8794",
        Investissement: "#1E5A4A",
        Autres: "#9AA39D"
    };

    const PAYMENT_EMOJI = {
        "Espèces": "💵",
        "Orange Money": "🟠",
        "MTN Mobile Money": "🟡",
        "Moov Money": "🔵",
        "Wave": "🌊",
        "Djamo": "🟣",
        "Carte bancaire": "💳",
        "Virement bancaire": "🏦",
        "Autre": "🔁"
    };

    const SOURCE_EMOJI = {
        Salaire: "💰",
        Freelance: "💻",
        Business: "🏪",
        Prime: "🏆",
        Vente: "🏷️",
        Cadeau: "🎀",
        Tontine: "🤝",
        "Transfert reçu": "✈️",
        Autre: "📥"
    };

    /**
     * Couleur d'identification de chaque moyen de paiement.
     * Utilisée partout (pastille, barre, graphique) pour qu'un moyen de
     * paiement se reconnaisse au premier coup d'œil.
     */
    const PAYMENT_COLORS = {
        "Espèces": "#2E7D5B",
        "Orange Money": "#E8730C",
        "MTN Mobile Money": "#E7B84B",
        "Moov Money": "#2C6FB5",
        "Wave": "#00A7E1",
        "Djamo": "#7B4FA8",
        "Carte bancaire": "#A94A32",
        "Virement bancaire": "#123C32",
        "Autre": "#9AA39D"
    };

    /** Libellé court utilisé dans les pastilles compactes. */
    const PAYMENT_SIGLES = {
        "Espèces": "ESPÈCES",
        "Orange Money": "ORANGE",
        "MTN Mobile Money": "MTN",
        "Moov Money": "MOOV",
        "Wave": "WAVE",
        "Djamo": "DJAMO",
        "Carte bancaire": "CARTE",
        "Virement bancaire": "VIR.",
        "Autre": "AUTRE"
    };

    /* Confort de lecture : trois niveaux suffisent, et ils s'appliquent à tout
       le projet (toutes les tailles sont exprimées en rem sur une racine
       mise à l'échelle). Utile sur les petits écrans, pour les vues
       fatiguées et pour les utilisateurs qui agrandissent habituellement
       le texte de leur navigateur. */
    const TEXT_SIZES = [
        { value: "normal", label: "Normale", icon: "Aa", hint: "Taille par défaut, adaptée à la plupart des écrans." },
        { value: "grand", label: "Grande", icon: "Aa+", hint: "Textes 12 % plus grands, sans rien perdre à l'écran." },
        { value: "tres-grand", label: "Très grande", icon: "Aa++", hint: "Textes 25 % plus grands, pour lire sans forcer." }
    ];

    /**
     * Applique le confort de lecture choisi à toute l'application.
     * @param {string} size - "normal" | "grand" | "tres-grand"
     * @param {boolean} [persist] - enregistre le choix dans les paramètres
     */
    function applyTextSize(size, persist) {
        const value = TEXT_SIZES.some(function (t) { return t.value === size; }) ? size : "normal";
        const racine = document.documentElement;
        if (value === "normal") racine.removeAttribute("data-text-size");
        else racine.setAttribute("data-text-size", value);
        if (persist && FT.data) {
            FT.data.saveSettings({ textSize: value });
            bus.emit("textsize:changed", { size: value });
        }
        return value;
    }

    const CURRENCIES = [
        { code: "FCFA", label: "Franc CFA (FCFA)", locale: "fr-FR" },
        { code: "EUR", label: "Euro (€)", locale: "fr-FR" },
        { code: "USD", label: "Dollar US ($)", locale: "en-US" },
        { code: "GNF", label: "Franc guinéen (GNF)", locale: "fr-FR" }
    ];

    const MONTHS_FR = [
        "janvier", "février", "mars", "avril", "mai", "juin",
        "juillet", "août", "septembre", "octobre", "novembre", "décembre"
    ];

    const DAYS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
    const DAYS_SHORT_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

    const BUDGET_ALERT_LEVELS = {
        OK: { level: "ok", threshold: 0.7 },
        WARN: { level: "warn", threshold: 1 },
        OVER: { level: "over", threshold: Infinity }
    };

    /* ======================================================================
       2. NOMBRES & MONTANTS
       ====================================================================== */

    /** Arrondi sûr à 2 décimales — évite les erreurs de flottants. */
    function round2(n) {
        return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
    }

    /** Nombre -> nombre ; tolère les chaînes et retourne 0 si invalide. */
    function toNumber(value) {
        if (typeof value === "number") return isFinite(value) ? value : 0;
        if (value === null || value === undefined) return 0;
        const n = parseFloat(String(value).replace(/[^\d.,-]/g, "").replace(",", "."));
        return isFinite(n) ? n : 0;
    }

    /**
     * Analyse une saisie utilisateur en montant.
     * « 2 500 », « 2 500 FCFA », « 2.500 », « 2,5k », « 15 000frs » -> number
     * @param {string|number} input
     * @returns {number}
     */
    function parseAmountInput(input) {
        if (typeof input === "number") return isFinite(input) ? round2(input) : 0;
        if (!input) return 0;
        let s = String(input).toLowerCase().trim();

        // Multiplicateurs usuels
        const mult = /(\d+(?:[.,]\d+)?)\s*(k|m)\b/.exec(s);
        let factor = 1;
        if (mult) {
            factor = mult[2] === "k" ? 1000 : 1000000;
            s = s.replace(mult[0], mult[1]);
        }

        s = s.replace(/[^\d.,\s]/g, "");          // retire devises, lettres
        s = s.replace(/\s+/g, "");                 // retire espaces (séparateurs de milliers)

        // Cas « 2.500 » ou « 2 500 000 » : point/virgule utilisé comme séparateur de milliers
        const thousandsDot = /^\d{1,3}(\.\d{3})+$/.test(s);
        const thousandsComma = /^\d{1,3}(,\d{3})+$/.test(s);
        if (thousandsDot || thousandsComma) {
            s = s.replace(/[.,]/g, "");
        } else {
            // Sinon, la dernière virgule/point est le séparateur décimal
            const lastComma = s.lastIndexOf(",");
            const lastDot = s.lastIndexOf(".");
            const lastSep = Math.max(lastComma, lastDot);
            if (lastSep > -1) {
                const intPart = s.slice(0, lastSep).replace(/[.,]/g, "");
                const decPart = s.slice(lastSep + 1).replace(/[.,]/g, "");
                s = intPart + "." + decPart;
            }
        }

        const n = parseFloat(s);
        return isFinite(n) ? round2(n * factor) : 0;
    }

    /** 150000 -> "150 000" (séparateur d'espace, sans devise) */
    function formatNumber(amount, options) {
        const opts = options || {};
        const n = toNumber(amount);
        const decimals = opts.decimals !== undefined ? opts.decimals : (Math.abs(n % 1) > 0.001 ? 2 : 0);
        const fixed = Math.abs(n).toFixed(decimals);
        const parts = fixed.split(".");
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
        const sign = n < 0 ? "-" : (opts.plus ? "+" : "");
        return sign + parts.join(",") + (parts[1] ? "" : "");
    }

    /**
     * Formatage monétaire officiel de l'application (§34).
     * formatCurrency(150000) -> "150 000 FCFA"
     */
    function formatCurrency(amount, options) {
        const opts = options || {};
        const currency = opts.currency || getCurrency();
        const n = toNumber(amount);
        const value = formatNumber(Math.abs(n), { decimals: opts.decimals });
        const sign = n < 0 ? "-" : (opts.signed && n > 0 ? "+" : "");
        const symbols = { EUR: "€", USD: "$" };
        const suffix = symbols[currency] || (" " + currency);
        return symbols[currency]
            ? sign + value + " " + suffix
            : sign + value + (opts.compact ? "" : suffix);
    }

    /** Version courte pour les graphiques : 12,5k / 150k */
    function formatCompact(amount) {
        const n = Math.abs(toNumber(amount));
        if (n >= 1000000) return formatNumber(n / 1000000, { decimals: 1 }) + "M";
        if (n >= 1000) return formatNumber(n / 1000, { decimals: n % 1000 === 0 ? 0 : 1 }) + "k";
        return formatNumber(n);
    }

    function getCurrency() {
        try {
            const s = global.FT && FT.storage ? FT.storage.getSettings() : null;
            return (s && s.currency) || "FCFA";
        } catch (e) {
            return "FCFA";
        }
    }

    function currencySymbol() {
        const c = getCurrency();
        return { EUR: "€", USD: "$" }[c] || c;
    }

    /** Pourcentage borné et lisible : 0.428 -> "43 %" */
    function formatPercent(ratio, decimals) {
        const d = decimals === undefined ? 0 : decimals;
        const v = toNumber(ratio) * 100;
        return formatNumber(v, { decimals: d }) + " %";
    }

    /* ======================================================================
       3. DATES
       ====================================================================== */

    /** Date -> "2026-09-30" (clé locale, indépendante du fuseau) */
    function toISODate(date) {
        const d = date instanceof Date ? date : new Date(date);
        if (isNaN(d.getTime())) return "";
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return y + "-" + m + "-" + day;
    }

    function todayISO() {
        return toISODate(new Date());
    }

    /** "2026-09-30" -> Date à minuit local (évite les décalages UTC) */
    function fromISODate(iso) {
        if (!iso) return new Date(NaN);
        if (iso instanceof Date) return new Date(iso.getFullYear(), iso.getMonth(), iso.getDate());
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
        if (!m) return new Date(iso);
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }

    function isValidISODate(iso) {
        const d = fromISODate(iso);
        return !isNaN(d.getTime());
    }

    /** "2026-09-30" -> "30 septembre 2026" */
    function formatDate(iso, options) {
        const opts = options || {};
        const d = fromISODate(iso);
        if (isNaN(d.getTime())) return "—";
        const day = d.getDate();
        if (opts.short) return day + " " + MONTHS_FR[d.getMonth()].slice(0, 4) + ". " + d.getFullYear();
        if (opts.numeric) return String(day).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
        return day + " " + MONTHS_FR[d.getMonth()] + " " + d.getFullYear();
    }

    /** "Aujourd'hui", "Hier", sinon date complète */
    function formatRelativeDate(iso) {
        const today = todayISO();
        if (iso === today) return "Aujourd'hui";
        const y = new Date(); y.setDate(y.getDate() - 1);
        if (iso === toISODate(y)) return "Hier";
        const t = new Date(); t.setDate(t.getDate() + 1);
        if (iso === toISODate(t)) return "Demain";
        return formatDate(iso);
    }

    function monthKey(date) {
        const d = date ? fromISODate(date) : new Date();
        if (isNaN(d.getTime())) return "";
        return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    }

    function monthLabel(key) {
        const m = /^(\d{4})-(\d{2})$/.exec(String(key || ""));
        if (!m) return "";
        return MONTHS_FR[Number(m[2]) - 1] + " " + m[1];
    }

    function addDays(date, days) {
        const d = date instanceof Date ? new Date(date) : fromISODate(date);
        d.setDate(d.getDate() + days);
        return d;
    }

    function daysInMonth(key) {
        const m = /^(\d{4})-(\d{2})$/.exec(String(key || monthKey()));
        const y = m ? Number(m[1]) : new Date().getFullYear();
        const mo = m ? Number(m[2]) : new Date().getMonth() + 1;
        return new Date(y, mo, 0).getDate();
    }

    /** Lundi comme premier jour de la semaine */
    function startOfWeek(date) {
        const d = date instanceof Date ? new Date(date) : fromISODate(date);
        const day = d.getDay(); // 0 = dimanche
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        return d;
    }

    function startOfMonth(date) {
        const d = date instanceof Date ? date : fromISODate(date);
        return new Date(d.getFullYear(), d.getMonth(), 1);
    }

    function endOfMonth(date) {
        const d = date instanceof Date ? date : fromISODate(date);
        return new Date(d.getFullYear(), d.getMonth() + 1, 0);
    }

    function previousMonthKey(key) {
        const m = /^(\d{4})-(\d{2})$/.exec(String(key || monthKey()));
        const y = m ? Number(m[1]) : new Date().getFullYear();
        const mo = m ? Number(m[2]) : new Date().getMonth() + 1;
        const d = new Date(y, mo - 2, 1);
        return monthKey(d);
    }

    function isSameDay(isoA, isoB) {
        return fromISODate(isoA).getTime() === fromISODate(isoB).getTime();
    }

    function isWithin(iso, startISO, endISO) {
        const t = fromISODate(iso).getTime();
        return t >= fromISODate(startISO).getTime() && t <= fromISODate(endISO).getTime();
    }

    function dayNameShort(iso) {
        const d = fromISODate(iso);
        return DAYS_SHORT_FR[d.getDay()];
    }

    /* ======================================================================
       4. IDENTIFIANTS & SÉCURITÉ DES DONNÉES
       ====================================================================== */

    /** Identifiant unique lisible (compatible futures clés Supabase). */
    function uid(prefix) {
        const rand = Math.random().toString(36).slice(2, 8);
        const t = Date.now().toString(36);
        return (prefix ? prefix + "_" : "") + t + rand;
    }

    /** Neutralise toute injection HTML (§46). */
    function escapeHtml(value) {
        return String(value === null || value === undefined ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    /** Nettoyage des chaînes fournies par l'utilisateur ou la reconnaissance vocale. */
    function sanitizeText(value, maxLength) {
        let s = String(value === null || value === undefined ? "" : value);
        s = s.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
        const max = maxLength || 140;
        return s.length > max ? s.slice(0, max - 1) + "…" : s;
    }

    /** Met une majuscule à la première lettre. */
    function capitalize(s) {
        const str = String(s || "");
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /* ======================================================================
       5. DOM
       ====================================================================== */

    function qs(selector, root) {
        return (root || document).querySelector(selector);
    }

    function qsa(selector, root) {
        return Array.prototype.slice.call((root || document).querySelectorAll(selector));
    }

    /**
     * Fabrique d'éléments sûre (utilise textContent, jamais innerHTML brut).
     * el("div", { class: "card", dataset: { id: 3 } }, [el("h2", { text: "Salut" })])
     */
    function el(tag, props, children) {
        const node = document.createElement(tag);
        if (props) {
            Object.keys(props).forEach(function (key) {
                const val = props[key];
                if (val === null || val === undefined || val === false) return;
                if (key === "text") {
                    node.textContent = String(val);
                } else if (key === "html") {
                    node.innerHTML = val; // usage interne uniquement (contenu déjà échappé)
                } else if (key === "class" || key === "className") {
                    node.className = val;
                } else if (key === "dataset") {
                    Object.keys(val).forEach(function (d) { node.dataset[d] = val[d]; });
                } else if (key === "style" && typeof val === "object") {
                    Object.keys(val).forEach(function (s) {
                        /* Les variables CSS (--pay-color, --accent…) ne s'assignent
                           pas par affectation directe : il faut setProperty(). */
                        if (s.indexOf("--") === 0) node.style.setProperty(s, val[s]);
                        else node.style[s] = val[s];
                    });
                } else if (key === "on" && typeof val === "object") {
                    Object.keys(val).forEach(function (evt) { node.addEventListener(evt, val[evt]); });
                } else if (key === "attrs" && typeof val === "object") {
                    Object.keys(val).forEach(function (a) { node.setAttribute(a, val[a]); });
                } else if (key.indexOf("aria-") === 0 || key === "role" || key === "tabindex") {
                    node.setAttribute(key, val);
                } else if (key in node) {
                    /* Certaines propriétés DOM sont en lecture seule (form, list…) :
                       on retombe sur l'attribut HTML correspondant. */
                    try {
                        node[key] = val;
                    } catch (err) {
                        node.setAttribute(key, val);
                    }
                } else {
                    node.setAttribute(key, val);
                }
            });
        }
        appendChildren(node, children);
        return node;
    }

    function appendChildren(node, children) {
        if (children === null || children === undefined) return;
        if (!Array.isArray(children)) children = [children];
        children.forEach(function (child) {
            if (child === null || child === undefined || child === false) return;
            node.appendChild(typeof child === "string" || typeof child === "number"
                ? document.createTextNode(String(child))
                : child);
        });
    }

    function clear(node) {
        if (!node) return node;
        while (node.firstChild) node.removeChild(node.firstChild);
        return node;
    }

    function setText(selector, text, root) {
        const node = typeof selector === "string" ? qs(selector, root) : selector;
        if (node) node.textContent = text;
        return node;
    }

    function on(target, event, handler, options) {
        if (!target) return function () {};
        target.addEventListener(event, handler, options);
        return function off() { target.removeEventListener(event, handler, options); };
    }

    /** Délégation d'événements : on(action) pour [data-action] */
    function delegate(root, event, selector, handler) {
        return on(root, event, function (e) {
            const target = e.target.closest(selector);
            if (target && root.contains(target)) handler(e, target);
        });
    }

    function debounce(fn, wait) {
        let timer = null;
        return function () {
            const ctx = this, args = arguments;
            clearTimeout(timer);
            timer = setTimeout(function () { fn.apply(ctx, args); }, wait || 220);
        };
    }

    function prefersReducedMotion() {
        return global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    function scrollToTop(smooth) {
        global.scrollTo({ top: 0, behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto" });
    }

    /* ======================================================================
       6. BUS D'ÉVÉNEMENTS (rafraîchissements réactifs des vues)
       ====================================================================== */
    const bus = (function () {
        const listeners = {};
        return {
            on: function (event, handler) {
                (listeners[event] = listeners[event] || []).push(handler);
                return function off() {
                    listeners[event] = (listeners[event] || []).filter(function (h) { return h !== handler; });
                };
            },
            emit: function (event, payload) {
                (listeners[event] || []).forEach(function (handler) {
                    try { handler(payload); } catch (err) { console.error("[FinaTrack] Erreur dans un abonné « " + event + " » :", err); }
                });
                (listeners["*"] || []).forEach(function (handler) {
                    try { handler(event, payload); } catch (err) { /* silencieux */ }
                });
            }
        };
    })();

    /* ======================================================================
       7. NOTIFICATIONS TOAST (§39)
       ====================================================================== */
    const TOAST_ICONS = { success: "✓", error: "✕", info: "i", warn: "!" };

    function toastHost() {
        let host = qs("#toastHost");
        if (!host) {
            host = el("div", { id: "toastHost", class: "toast-host", attrs: { "aria-live": "polite", "aria-atomic": "false" } });
            document.body.appendChild(host);
        }
        return host;
    }

    /**
     * Affiche une notification.
     * @param {string} message
     * @param {"success"|"error"|"info"|"warn"} type
     * @param {string} [sub]
     */
    function toast(message, type, sub) {
        const kind = type || "success";
        const host = toastHost();
        const node = el("div", { class: "toast " + kind, role: "status" }, [
            el("div", { class: "tt-ico", text: TOAST_ICONS[kind] || "•", attrs: { "aria-hidden": "true" } }),
            el("div", {}, [
                el("div", { class: "tt-msg", text: sanitizeText(message, 140) }),
                sub ? el("div", { class: "tt-sub", text: sanitizeText(sub, 180) }) : null
            ]),
            el("button", {
                class: "tt-close", type: "button", text: "✕",
                attrs: { "aria-label": "Fermer la notification" },
                on: { click: function () { dismiss(); } }
            })
        ]);

        host.appendChild(node);
        const timer = setTimeout(dismiss, sub ? 4600 : 3200);

        function dismiss() {
            clearTimeout(timer);
            if (!node.parentNode) return;
            node.classList.add("is-out");
            setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 200);
        }
        return dismiss;
    }

    /**
     * Pastille de moyen de paiement, identifiable d'un coup d'œil.
     * @param {string} method
     * @param {{compact?: boolean, size?: string}} [options]
     */
    function paymentBadge(method, options) {
        const opts = options || {};
        const name = method || "Non précisé";
        return el("span", {
            class: "pay-badge" + (method ? "" : " is-empty") + (opts.size === "sm" ? " is-sm" : ""),
            style: method ? { "--pay-color": paymentColorOf(method) } : null,
            attrs: { title: "Payé avec : " + name }
        }, [
            el("span", { class: "pay-dot", style: { background: paymentColorOf(method) }, attrs: { "aria-hidden": "true" } }),
            el("span", { class: "pay-badge-label", text: opts.compact ? paymentSigleOf(method) : (name) })
        ]);
    }

    function paymentColorOf(method) {
        return PAYMENT_COLORS[method] || PAYMENT_COLORS.Autre;
    }

    function paymentSigleOf(method) {
        return PAYMENT_SIGLES[method] || String(method || "Autre").slice(0, 5).toUpperCase();
    }

    /* ======================================================================
       8. MODALES (§ accessible, bottom sheet mobile / fenêtre centrée desktop)
       ====================================================================== */
    const openModals = [];

    /* ----------------------------------------------------------------------
       Verrouillage du défilement d'arrière-plan.
       `overflow: hidden` sur <body> ne suffit pas sur iOS Safari (le fond
       continue de défiler) et, ailleurs, un focus automatique peut faire
       défiler la page entière. On fige donc le corps à sa position courante,
       puis on la restitue exactement à la fermeture.
       ---------------------------------------------------------------------- */
    let scrollLock = null;

    function lockScroll() {
        if (scrollLock) { scrollLock.count++; return; }
        const y = global.scrollY || global.pageYOffset || 0;
        scrollLock = { y: y, count: 1 };
        const body = document.body;
        body.style.position = "fixed";
        body.style.top = -y + "px";
        body.style.left = "0";
        body.style.right = "0";
        body.style.width = "100%";
        /* `html, body { height: 100% }` compte sur le défilement du document :
           une fois le corps figé, sa hauteur doit redevenir celle du contenu. */
        body.style.height = "auto";
        body.style.overflowY = "visible";
        body.dataset.scrollLocked = "1";
    }

    function unlockScroll() {
        if (!scrollLock) return;
        scrollLock.count--;
        if (scrollLock.count > 0) return;

        const y = scrollLock.y;
        scrollLock = null;

        const body = document.body;
        body.style.position = "";
        body.style.top = "";
        body.style.left = "";
        body.style.right = "";
        body.style.width = "";
        body.style.height = "";
        body.style.overflowY = "";
        body.dataset.scrollLocked = "0";

        /* Restauration sans animation : le défilement doux ferait « sauter » la vue */
        const html = document.documentElement;
        const previous = html.style.scrollBehavior;
        html.style.scrollBehavior = "auto";
        global.scrollTo(0, y);
        html.style.scrollBehavior = previous;
    }

    /** Position de défilement mémorisée (utile aux tests et au débogage). */
    function getScrollLock() { return scrollLock; }

    /**
     * @param {HTMLElement} panel
     * @param {{onClose?: Function, labelledBy?: string, center?: boolean}} [opts]
     */
    function openModal(panel, opts) {
        const options = opts || {};
        const previousFocus = document.activeElement;

        const overlay = el("div", { class: "modal-overlay", attrs: { tabindex: "-1" } });
        /* `is-open` bascule display: none → flex : sans cette classe, la fenêtre
           existe dans le DOM mais reste invisible. */
        const wrap = el("div", {
            class: "modal is-open" + (options.center ? " modal-center" : ""),
            attrs: { role: "dialog", "aria-modal": "true" }
        }, [overlay, panel]);
        if (options.labelledBy) wrap.setAttribute("aria-labelledby", options.labelledBy);

        document.body.appendChild(wrap);
        lockScroll();

        /* Une fenêtre en cours de fermeture reste animée quelques instants :
           si on en ouvre une autre entre-temps, l'ancienne doit disparaître
           immédiatement, sinon ses champs continuent de masquer les identifiants
           (getElementById renverrait le champ du formulaire précédent). */
        const closingModals = document.querySelectorAll(".modal.is-closing");
        Array.prototype.forEach.call(closingModals, function (stale) {
            if (stale.parentNode) stale.parentNode.removeChild(stale);
        });

        const entry = { wrap: wrap, panel: panel, onClose: options.onClose, previousFocus: previousFocus };

        let closed = false;

        function close() {
            if (closed) return;
            closed = true;
            entry.closed = true;
            wrap.classList.add("is-closing");
            panel.classList.add("is-closing");
            setTimeout(function () {
                if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
                unlockScroll();
                const idx = openModals.indexOf(entry);
                if (idx > -1) openModals.splice(idx, 1);
                if (!openModals.length && entry.previousFocus && entry.previousFocus.focus) {
                    try { entry.previousFocus.focus(); } catch (e) { /* ignore */ }
                }
                if (typeof entry.onClose === "function") entry.onClose();
            }, prefersReducedMotion() ? 0 : 180);
        }
        entry.close = close;

        overlay.addEventListener("click", close);

        // Piège de focus + fermeture au clavier (§41)
        wrap.addEventListener("keydown", function (e) {
            if (e.key === "Escape") { e.stopPropagation(); close(); return; }
            if (e.key !== "Tab") return;
            const focusables = qsa(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
                panel
            ).filter(function (n) { return n.offsetParent !== null || n === document.activeElement; });
            if (!focusables.length) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        });

        // Harmonisation : sur mobile, pas d'alignement centré pour un bottom-sheet
        if (global.innerWidth < 768) wrap.classList.remove("modal-center");

        /* Le focus initial ne doit jamais faire défiler la page : on protège
           la position une seconde fois, puis on restaure. */
        setTimeout(function () {
            const focusables = qsa('input, select, textarea, button', panel);
            const preferred = panel.querySelector("[data-autofocus]") || focusables[0];
            const saved = scrollLock ? scrollLock.y : global.scrollY;
            if (preferred) preferred.focus({ preventScroll: true });
            if (scrollLock && (global.scrollY || global.pageYOffset) !== saved) {
                global.scrollTo(0, saved);
            }
        }, 60);

        /* Sur mobile : fermeture par glissement vers le bas (bottom-sheet) */
        if (global.FT && global.FT.mobile && global.FT.mobile.attachSwipeToClose) {
            global.FT.mobile.attachSwipeToClose(panel, close);
        }

        openModals.push(entry);
        return entry;
    }

    function closeAllModals() {
        openModals.slice().forEach(function (m) { m.close(); });
    }

    /** Boîte de dialogue de confirmation personnalisée (§28) */
    function confirmDialog(config) {
        const cfg = config || {};
        return new Promise(function (resolve) {
            let settled = false;
            const titleId = uid("conf-title");

            const panel = el("div", { class: "modal-panel modal-narrow" }, [
                el("div", { class: "modal-grip", attrs: { "aria-hidden": "true" } }),
                el("div", { class: "modal-head" }, [
                    el("div", {}, [
                        el("h2", { id: titleId, text: cfg.title || "Confirmation" }),
                        cfg.message ? el("p", { class: "modal-sub", text: cfg.message }) : null
                    ]),
                    el("button", {
                        class: "icon-btn", type: "button", text: "✕",
                        attrs: { "aria-label": "Fermer" },
                        on: { click: function () { finish(false); } }
                    })
                ]),
                cfg.details ? el("div", { class: "card", style: { background: "var(--surface-2)" } }, [
                    el("div", { style: { fontWeight: "700" }, text: cfg.details.title || "" }),
                    cfg.details.subtitle ? el("div", { class: "muted", style: { fontSize: "0.85rem", marginTop: "2px" }, text: cfg.details.subtitle }) : null,
                    cfg.details.amount ? el("div", { style: { fontWeight: "800", marginTop: "8px" }, text: cfg.details.amount }) : null
                ]) : null,
                el("div", { class: "modal-foot" }, [
                    el("button", {
                        class: "btn btn-ghost", type: "button", text: cfg.cancelLabel || "Annuler",
                        on: { click: function () { finish(false); } }
                    }),
                    el("button", {
                        class: "btn " + (cfg.danger === false ? "btn-primary" : "btn-danger"), type: "button",
                        text: cfg.confirmLabel || "Confirmer", "data-autofocus": "",
                        on: { click: function () { finish(true); } }
                    })
                ])
            ]);

            const modal = openModal(panel, { labelledBy: titleId, center: true, onClose: function () { finish(false, true); } });

            function finish(value) {
                if (settled) return;
                settled = true;
                resolve(value);
                if (modal && modal.close) modal.close();
            }
        });
    }

    /* ======================================================================
       9. EXPORTS
       ====================================================================== */
    const utils = {
        // constantes
        CATEGORIES: CATEGORIES,
        CATEGORY_HINTS: CATEGORY_HINTS,
        LOCAL_CONTEXT: LOCAL_CONTEXT,
        LOCAL_INTRO: LOCAL_INTRO,
        categoryHint: function (category) { return CATEGORY_HINTS[category] || ""; },
        PAYMENT_METHODS: PAYMENT_METHODS,
        INCOME_SOURCES: INCOME_SOURCES,
        CATEGORY_EMOJI: CATEGORY_EMOJI,
        CATEGORY_COLORS: CATEGORY_COLORS,
        PAYMENT_EMOJI: PAYMENT_EMOJI,
        SOURCE_EMOJI: SOURCE_EMOJI,
        CURRENCIES: CURRENCIES,
        TEXT_SIZES: TEXT_SIZES,
        applyTextSize: applyTextSize,
        MONTHS_FR: MONTHS_FR,
        DAYS_FR: DAYS_FR,
        DAYS_SHORT_FR: DAYS_SHORT_FR,
        BUDGET_ALERT_LEVELS: BUDGET_ALERT_LEVELS,

        // nombres
        round2: round2,
        toNumber: toNumber,
        parseAmountInput: parseAmountInput,
        formatNumber: formatNumber,
        formatCurrency: formatCurrency,
        formatCompact: formatCompact,
        formatPercent: formatPercent,
        getCurrency: getCurrency,
        currencySymbol: currencySymbol,

        // dates
        toISODate: toISODate,
        todayISO: todayISO,
        fromISODate: fromISODate,
        isValidISODate: isValidISODate,
        formatDate: formatDate,
        formatRelativeDate: formatRelativeDate,
        monthKey: monthKey,
        monthLabel: monthLabel,
        addDays: addDays,
        daysInMonth: daysInMonth,
        startOfWeek: startOfWeek,
        startOfMonth: startOfMonth,
        endOfMonth: endOfMonth,
        previousMonthKey: previousMonthKey,
        isSameDay: isSameDay,
        isWithin: isWithin,
        dayNameShort: dayNameShort,

        // données
        uid: uid,
        escapeHtml: escapeHtml,
        sanitizeText: sanitizeText,
        capitalize: capitalize,

        // DOM
        qs: qs,
        qsa: qsa,
        el: el,
        clear: clear,
        setText: setText,
        on: on,
        delegate: delegate,
        debounce: debounce,
        prefersReducedMotion: prefersReducedMotion,
        scrollToTop: scrollToTop,

        // UI
        bus: bus,
        toast: toast,
        openModal: openModal,
        closeAllModals: closeAllModals,
        confirmDialog: confirmDialog,
        lockScroll: lockScroll,
        unlockScroll: unlockScroll,
        getScrollLock: getScrollLock,

        // catégories utilitaires
        categoryEmoji: function (name) { return CATEGORY_EMOJI[name] || CATEGORY_EMOJI.Autres; },
        categoryColor: function (name) { return CATEGORY_COLORS[name] || CATEGORY_COLORS.Autres; },
        paymentEmoji: function (name) { return PAYMENT_EMOJI[name] || "💳"; },
        paymentColor: function (name) { return paymentColorOf(name); },
        paymentSigle: function (name) { return paymentSigleOf(name); },
        paymentBadge: paymentBadge,
        PAYMENT_COLORS: PAYMENT_COLORS,
        sourceEmoji: function (name) { return SOURCE_EMOJI[name] || "📥"; }
    };

    global.FT = global.FT || {};
    global.FT.version = "1.5.0";
    global.FT.utils = utils;
    global.FT.constants = {
        CATEGORIES: CATEGORIES,
        PAYMENT_METHODS: PAYMENT_METHODS,
        INCOME_SOURCES: INCOME_SOURCES,
        CATEGORY_EMOJI: CATEGORY_EMOJI,
        CATEGORY_COLORS: CATEGORY_COLORS,
        CATEGORIES_TREE: null
    };

    /* Raccourcis globaux (facilitent l'usage côté console et la compatibilité) */
    global.formatCurrency = formatCurrency;
    global.formatNumber = formatNumber;
    global.formatDate = formatDate;
    global.parseAmountInput = parseAmountInput;
    global.escapeHtml = escapeHtml;
    global.showToast = toast;
})(window);
