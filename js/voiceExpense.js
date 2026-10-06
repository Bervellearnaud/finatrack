/* ==========================================================================
   FinaTrack CI — voiceExpense.js
   🎙️ « Parlez pour enregistrer une dépense » (§14 → §23)

   • utilise l'API Web Speech Recognition quand elle est disponible ;
   • analyse la phrase : montant, catégorie, date, description, paiement ;
   • NE JAMAIS enregistrer sans confirmation explicite de l'utilisateur ;
   • propose une saisie texte de secours si la reconnaissance vocale
     n'est pas disponible sur le navigateur.
   ========================================================================== */
(function (global) {
    "use strict";

    const U = global.FT.utils;
    const EXP = global.FT.expenses;
    const settings = function () { return global.FT.data.getSettings(); };

    /* ======================================================================
       1. DÉTECTION DU SUPPORT NAVIGATEUR (§15, §23)
       ====================================================================== */

    function getRecognitionCtor() {
        return global.SpeechRecognition || global.webkitSpeechRecognition || null;
    }

    function isSupported() {
        return !!getRecognitionCtor();
    }

    function supportState() {
        if (isSupported()) return { supported: true, message: "" };
        return {
            supported: false,
            message: "La saisie vocale n'est pas disponible sur ce navigateur. Utilisez la saisie manuelle ou la saisie texte ci-dessous."
        };
    }

    /* ======================================================================
       2. NORMALISATION & OUTILS DE TEXTE
       ====================================================================== */

    /** Retire les accents et normalise la ponctuation pour l'analyse. */
    function normalize(text) {
        return String(text || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")   // accents
            .replace(/[’'`´]/g, " ")
            .replace(/[^a-z0-9\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    /** Vérifie la présence d'un mot-clé entier (évite « eau » dans « beau »). */
    function hasKeyword(normalizedText, keyword) {
        const k = normalize(keyword);
        if (!k) return false;
        if (k.indexOf(" ") !== -1) return normalizedText.indexOf(k) !== -1;
        const pattern = new RegExp("(^|\\s)" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(s|es)?(\\s|$)");
        return pattern.test(normalizedText);
    }

    /* ======================================================================
       3. EXTRACTION DU MONTANT (§17)
       ====================================================================== */

    const FR_UNITS = {
        zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6,
        sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13,
        quatorze: 14, quinze: 15, seize: 16
    };
    const FR_TENS = {
        vingt: 20, trente: 30, quarante: 40, cinquante: 50,
        soixante: 60, quatrevingt: 80, quatrevingts: 80, cent: 100, cents: 100
    };

    /**
     * Convertit une suite de mots français en nombre.
     * « deux mille cinq cents » -> 2500 · « quinze mille » -> 15000
     * @param {string[]} tokens
     * @returns {number}
     */
    function frenchWordsToNumber(tokens) {
        let total = 0;
        let current = 0;
        let used = 0;

        for (let i = 0; i < tokens.length; i++) {
            const raw = tokens[i];
            const token = raw.replace(/-/g, "");

            if (token in FR_UNITS) {
                current += FR_UNITS[token];
                used++;
            } else if (token in FR_TENS) {
                const value = FR_TENS[token];
                if (value === 100) current = (current || 1) * 100;
                else if (current % 100 === 0 && current > 0) current += value; // quatre-vingt
                else current += value;
                used++;
            } else if (token === "dix" && tokens[i + 1] && /^(sept|huit|neuf)$/.test(tokens[i + 1])) {
                current += 10 + FR_UNITS[tokens[i + 1]];
                i++; used += 2;
            } else if ((token === "soixante" && tokens[i + 1] && /^(dix|onze|douze|treize|quatorze|quinze|seize)$/.test(tokens[i + 1]))) {
                current += 60 + (FR_UNITS[tokens[i + 1]] || (10 + ["dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"].indexOf(tokens[i + 1])));
                i++; used += 2;
            } else if (token === "mille") {
                total += (current || 1) * 1000;
                current = 0;
                used++;
            } else if (token === "million" || token === "millions") {
                total += (current || 1) * 1000000;
                current = 0;
                used++;
            } else {
                break; // mot non numérique : on s'arrête
            }
        }
        return used ? total + current : 0;
    }

    const CURRENCY_WORDS = [
        "franc", "francs", "fcfa", "f cfa", "f", "cfa", "frs", "fr", "euro", "euros",
        /* Argot ivoirien et usages locaux pour désigner l'argent */
        "balles", "balle", "krika", "krikas", "ble", "taman", "jeton", "pierre", "djè", "xof",
        "dollar", "dollars", "boules", "boule", "money", "cash", "net"
    ];

    /**
     * Extrait le montant d'une phrase (§17).
     * Gère : « 2 000 francs », « 2.500 », « 2k », « deux mille cinq cents francs ».
     * @param {string} text
     * @returns {{amount: number, raw: string, confidence: number, alternatives: number[]}}
     */
    function extractAmount(text) {
        const normalized = normalize(text);
        if (!normalized) return { amount: 0, raw: "", confidence: 0, alternatives: [] };

        const candidates = [];

        /* --- a) Chiffres écrits en toutes lettres (« deux mille ») --- */
        const words = normalized.split(" ");
        for (let i = 0; i < words.length; i++) {
            const w = words[i];
            const isNumberWord = (w.replace(/-/g, "") in FR_UNITS) ||
                (w.replace(/-/g, "") in FR_TENS) ||
                /^(mille|million|millions)$/.test(w) ||
                (w === "dix" && words[i + 1] && /^(sept|huit|neuf)$/.test(words[i + 1]));
            if (!isNumberWord) continue;

            /* On consomme la suite de mots numériques */
            let end = i;
            while (end < words.length) {
                const nxt = words[end].replace(/-/g, "");
                if (nxt in FR_UNITS || nxt in FR_TENS || /^(mille|million|millions)$/.test(nxt) ||
                    (nxt === "dix" && words[end + 1] && /^(sept|huit|neuf)$/.test(words[end + 1]))) {
                    end++;
                } else break;
            }
            const slice = words.slice(i, end);
            const value = frenchWordsToNumber(slice);
            if (value > 0) {
                const after = words.slice(end, end + 3).join(" ");
                const nearCurrency = /(franc|fcfa|f cfa|cfa|frs|boule|euro|dollar)/.test(after);
                candidates.push({
                    amount: value,
                    raw: slice.join(" "),
                    source: "mots",
                    score: 60 + (nearCurrency ? 35 : 0) + Math.min(slice.length * 2, 8)
                });
            }
            i = end - 1;
        }

        /* --- b) Chiffres --- */
        const digitPattern = /\d[\d\s.,]*\d|\d/g;
        let match;
        while ((match = digitPattern.exec(normalized)) !== null) {
            const raw = match[0].trim();
            let value = U.parseAmountInput(raw);

            /* Multiplicateur « k » / « mille » juste après : « 2k », « 15 mille » */
            const afterRaw = normalized.slice(match.index + raw.length, match.index + raw.length + 12);
            if (/^\s*k\b/.test(afterRaw)) value *= 1000;
            if (/^\s*milles?\b/.test(afterRaw) && value < 1000) value *= 1000;
            /* « 2 krika » = 2 000 FCFA (nouchi) */
            if (/^\s*krikas?\b/.test(afterRaw) && value < 1000) value *= 1000;
            if (/^\s*millions?\b/.test(afterRaw) && value < 1000) value *= 1000000;

            if (value <= 0) continue;

            const before = normalized.slice(Math.max(0, match.index - 18), match.index);
            const after = normalized.slice(match.index + raw.length, match.index + raw.length + 18);
            const nearCurrency = /(franc|fcfa|cfa|frs|boule|euro|dollar)/.test(after) ||
                /(franc|fcfa|cfa|frs|boule|euro|dollar)/.test(before);
            const nearAmountVerb = /(depense|paye|achete|donne|coute|couté|acheter|payer|donner|mise|mis)/.test(before);
            const looksLikeTime = /\d\s*h|\d\s*:\s*\d/.test(raw + after);

            candidates.push({
                amount: value,
                raw: raw,
                source: "chiffres",
                score: 55
                    + (nearCurrency ? 40 : 0)
                    + (nearAmountVerb ? 12 : 0)
                    - (looksLikeTime ? 45 : 0)
                    - (value > 50000000 ? 30 : 0)
            });
        }

        if (!candidates.length) return { amount: 0, raw: "", confidence: 0, alternatives: [] };

        candidates.sort(function (a, b) { return b.score - a.score || b.amount - a.amount; });
        const best = candidates[0];
        const alternatives = candidates.slice(1).map(function (c) { return c.amount; })
            .filter(function (v, i, arr) { return arr.indexOf(v) === i; }).slice(0, 3);

        return {
            amount: best.amount,
            raw: best.raw,
            source: best.source,
            confidence: Math.max(0, Math.min(1, best.score / 100)),
            alternatives: alternatives
        };
    }

    /* ======================================================================
       4. DÉTECTION DE LA CATÉGORIE (§18)
       ====================================================================== */

    const categoryKeywords = {
        Autres: [
            "amende", "controle", "controle de police", "faux frais", "imprevu", "divers",
            "perdu", "porte monnaie perdu", "pourboire", "casse", "depannage"
        ],
        Transport: [
            "taxi", "gbaka", "woro", "woro woro", "woroworo", "bus", "transport",
            "essence", "carburant", "gasoil", "diesel", "moto", "keke", "trotro", "car",
            "gare", "depot", "uber", "vip", "bush taxi", "taxi communal", "trajet", "deplacement",
            "pneu", "vidange", "mecanicien", "parking", "peage", "billet de bus",
            /* Réalités d'Abidjan */
            "sotra", "sotra express", "gbaka", "woro woro jaune", "taxi compteur", "taxi jaune",
            "carte de transport", "carte sotra", "badge sotra", "bateau bus", "bateau-bus", "stl",
            "navette lagunaire", "lagune", "terminus", "aller retour", "aller-retour",
            "yango", "covoiturage", "coursier", "gare routiere", "visite technique"
        ],
        Alimentation: [
            "repas", "restaurant", "dejeuner", "diner", "petit dejeuner", "nourriture",
            "manger", "maquis", "attieke", "garba", "riz", "poisson", "poulet", "viande",
            "beignet", "alloco", "kebab", "sandwich", "pain", "sauce", "soupe", "egusi",
            "chef", "fast food", "cafeteria", "cuisine", "marche", "legumes", "banane",
            "fruit", "eau a boire", "boisson", "tisane", "cafe", "petit pois", "igname",
            "foutou", "placali", "koule", "braise", "grillade", "bouffe", "gouter", "bouillon",
            /* Cuisine et commerces d'Abidjan */
            "choukouya", "kedjenou", "kédjenou", "sauce graine", "sauce claire",
            "koki", "akassa", "degue", "bouillie", "porc au four", "poisson braise", "poulet braise",
            "attieke poisson", "garba", "chez la vieille", "cocovico", "marché cocovico",
            "vendeuse de garba", "kiosque a garba"
        ],
        Logement: [
            "loyer", "maison", "appartement", "chambre", "logement", "caution", "bail",
            "quittance", "proprietaire", "keliba", "villa", "studio", "colocation", "construction"
        ],
        "Électricité": [
            "electricite", "courant", "cie", "cote d ivoire electricite", "facture courant",
            "compteur", "prepaid", "recharge compteur", "sodecie", "groupe electrogene",
            "ampoule", "prise", "electricien", "senelec",
            "cie ci", "recharge cie", "watt", "kwh", "groupe", "essence du groupe", "facture cie"
        ],
        Eau: [
            "eau", "sodeci", "facture eau", "robinet", "plombier", "bidon d eau", "sachet d eau",
            "forage", "pompe", "seau d eau", "sachet eau", "eau minerale",
            "chateau d eau", "citerne", "bidon d eau", "eau potable", "sachet"
        ],
        Communication: [
            "appel", "credit", "credit telephone", "telephone", "communication", "recharge",
            "recharge telephone", "orange credit", "mtn credit", "moov credit", "puces",
            "abonnement appel", "sms", "sonnerie",
            "credit orange", "credit mtn", "credit moov", "celtiis", "carte de recharge",
            "pass telephone", "unite", "credit tel", "max it"
        ],
        Internet: [
            "internet", "wifi", "forfait", "forfait internet", "data", "connexion", "giga",
            "gigas", "go", "fibre", "orange fibre", "cyber", "modem", "cle 4g", "hotspot",
            "abonnement internet", "netflix internet",
            "orange ci", "orange cote d ivoire", "pass data", "forfait orange", "cyber cafe",
            "box internet", "wifi maison", "cle 4g", "10 go", "fibre optique"
        ],
        "Santé": [
            "sante", "pharmacie", "medicament", "docteur", "medecin", "clinique", "hopital",
            "consultation", "analyse", "ordonnance", "infirmier", "vaccin", "paludisme",
            "palu", "carnet de sante", "laboratoire", "radio", "dentiste", "lunettes", "ophtalmo",
            "chu", "chu angre", "chu d angre", "pharmacie de garde", "sage femme", "accouchement",
            "test palu", "infirmerie"
        ],
        Shopping: [
            "achat", "vetement", "chaussure", "chaussures", "shopping", "habit",
            "pagne", "tissu", "sac", "montre", "pantalon", "chemise", "robe", "boubou",
            "bijou", "parfum", "cosmetique", "supermarche", "boutique", "telephone neuf",
            "accessoire", "valise", "foulard", "chapeau", "tenue",
            "la djibi", "djibi", "super u", "cash center", "carrefour market", "sicomex",
            "china mall", "showroom", "ustensiles", "electromenager", "meuble", "bazin",
            "wax", "pagne baoule", "marché", "grand marche"
        ],
        Loisirs: [
            "cinema", "sortie", "jeu", "jeux", "loisir", "biere", "boite", "concert", "match",
            "football", "playstation", "ps4", "bar", "clubbing", "fete", "anniversaire",
            "netflix film", "musee", "plage", "piscine", "abonnement jeu", "detente", "kermesse",
            "enjailler", "grand bassam", "grand-bassam", "assinie", "jacqueville", "sortie plage",
            "ciné", "maquis du soir"
        ],
        Famille: [
            "famille", "maman", "papa", "frere", "soeur", "grand frere", "petit frere",
            "grande soeur", "parents", "enfant", "enfants", "tante", "oncle", "cousin",
            "cousine", "grand mere", "grand pere", "soutien", "envoi a la famille",
            "femme", "mari", "epouse", "bebe", "naissance", "dot", "funerailles",
            /* Obligations sociales très courantes à Abidjan */
            "tontine", "cotisation", "cotisation deces", "deces", "levee de deuil", "enterrement",
            "mariage", "bapteme", "dote", "aide familiale", "envoi au village", "au village",
            "soutien maman", "soutien papa", "assistance"
        ],
        "Éducation": [
            "ecole", "frais scolaire", "frais scolaires", "inscription", "scolarite",
            "professeur", "cours", "formation", "universite", "cahier", "livre", "livres",
            "fourniture", "fournitures", "tuteur", "repetition", "examen", "concours",
            "frais de scolarite", "cartable", "uniforme", "bic", "stylo", "etudiant",
            /* École ivoirienne */
            "ecolage", "frais d ecolage", "frais ecolage", "tenue kaki", "kaki", "cahiers",
            "soutien scolaire", "cours de soutien", "cours du soir", "cantine", "fhb",
            "inp hb", "bts", "compo", "rentree scolaire"
        ],
        Abonnements: [
            "abonnement", "netflix", "spotify", "canal", "canal plus", "bouquet", "abonnement tv",
            "tv", "disney", "prime video", "youtube premium", "antenne", "abonnement mensuel",
            "assurance", "mutuelle", "cyber abonnement",
            /* Bouquets et services courants */
            "startimes", "canal plus", "abonnement canal", "djamo premium", "salle de sport",
            "abonnement fibre", "assurance sante", "mutuelle sante"
        ],
        Investissement: [
            "investissement", "investir", "epargne", "epargner", "action", "actions",
            "crypto", "bitcoin", "depot", "bourse", "assurance vie", "placement", "mobile money depot",
            "nepo", "capital", "business", "fonds",
            "tontine d epargne", "tontine epargne", "epargne tontine", "achat de marchandises",
            "marchandises", "stock du commerce", "terrain", "or", "titre", "obligation",
            "compte epargne", "plan epargne"
        ]
    };

    /**
     * Détecte la catégorie la plus probable (§18).
     * Retourne toujours une catégorie valide ; « Autres » par défaut.
     * @returns {{category: string, score: number, matches: string[], confidence: number}}
     */
    function detectCategory(text) {
        const normalized = normalize(text);
        const scores = {};

        Object.keys(categoryKeywords).forEach(function (category) {
            const keywords = categoryKeywords[category];
            let score = 0;
            const matches = [];

            keywords.forEach(function (keyword) {
                if (!hasKeyword(normalized, keyword)) return;
                /* Les mots-clés longs et spécifiques pèsent davantage. */
                const weight = Math.max(1, keyword.split(" ").length) * (keyword.length > 5 ? 2 : 1);
                score += weight;
                matches.push(keyword);
            });

            if (matches.length) scores[category] = { score: score, matches: matches };
        });

        const ranked = Object.keys(scores).sort(function (a, b) { return scores[b].score - scores[a].score; });
        if (!ranked.length) {
            return { category: "Autres", score: 0, matches: [], confidence: 0 };
        }

        const best = ranked[0];
        const runnerUp = ranked[1] ? scores[ranked[1]].score : 0;
        const margin = scores[best].score / (scores[best].score + runnerUp || 1);

        return {
            category: best,
            score: scores[best].score,
            matches: scores[best].matches,
            confidence: Math.max(0.35, Math.min(1, margin)),
            alternatives: ranked.slice(1, 3).map(function (c) { return { category: c, score: scores[c].score }; })
        };
    }

    /* ======================================================================
       5. DÉTECTION DE LA DATE (§19)
       ====================================================================== */

    const MONTH_NAMES_NORM = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet",
        "aout", "septembre", "octobre", "novembre", "decembre"];
    const WEEKDAY_NAMES_NORM = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

    /**
     * Détecte la date d'une dépense (§19).
     * @returns {{date: string, label: string, matched: string, confidence: number}}
     */
    function detectDate(text) {
        const normalized = normalize(text);
        const today = new Date();
        const todayISO = U.toISODate(today);

        const simple = [
            { keys: ["aujourd hui", "aujourdhui", "ce matin", "ce soir", "cet apres midi", "maintenant", "a l instant", "tout a l heure", "ce midi",
                     /* « tantôt » signifie « plus tôt dans la journée » en Côte d'Ivoire */
                     "tantot", "tantot meme", "ce matin meme", "je viens de payer", "a l heure la"], offset: 0, label: "Aujourd'hui", confidence: 0.92 },
            { keys: ["hier", "hier soir", "hier matin", "hier apres midi", "la journee d hier"], offset: -1, label: "Hier", confidence: 0.95 },
            { keys: ["avant hier", "avant-hier"], offset: -2, label: "Avant-hier", confidence: 0.9 },
            { keys: ["demain"], offset: 1, label: "Demain", confidence: 0.6 }
        ];

        for (let i = 0; i < simple.length; i++) {
            const entry = simple[i];
            for (let j = 0; j < entry.keys.length; j++) {
                if (normalized.indexOf(entry.keys[j]) !== -1) {
                    const d = U.addDays(today, entry.offset);
                    return { date: U.toISODate(d), label: entry.label, matched: entry.keys[j], confidence: entry.confidence };
                }
            }
        }

        /* « le 30 », « le 30 septembre », « 30/09 », « 30/09/2026 » */
        const numeric = /(\d{1,2})\s*[/-]\s*(\d{1,2})(?:\s*[/-]\s*(\d{2,4}))?/.exec(normalized);
        if (numeric) {
            const day = Number(numeric[1]);
            const month = Number(numeric[2]) - 1;
            let year = numeric[3] ? Number(numeric[3]) : today.getFullYear();
            if (year < 100) year += 2000;
            const d = new Date(year, month, day);
            if (!isNaN(d.getTime()) && day >= 1 && day <= 31 && month >= 0 && month <= 11) {
                return { date: U.toISODate(d), label: U.formatDate(U.toISODate(d)), matched: numeric[0], confidence: 0.85 };
            }
        }

        const dayMonth = /(le\s+)?(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)/.exec(normalized);
        if (dayMonth) {
            const day = Number(dayMonth[2]);
            const month = MONTH_NAMES_NORM.indexOf(dayMonth[3]);
            if (month > -1 && day >= 1 && day <= 31) {
                const d = new Date(today.getFullYear(), month, day);
                if (d > today) d.setFullYear(today.getFullYear() - 1);
                return { date: U.toISODate(d), label: U.formatDate(U.toISODate(d)), matched: dayMonth[0], confidence: 0.8 };
            }
        }

        /* « lundi », « mardi dernier » -> dernier jour correspondant */
        for (let w = 0; w < WEEKDAY_NAMES_NORM.length; w++) {
            if (hasKeyword(normalized, WEEKDAY_NAMES_NORM[w])) {
                const target = w;
                const current = today.getDay();
                let diff = current - target;
                if (diff <= 0) diff += 7;
                const d = U.addDays(today, -diff);
                return {
                    date: U.toISODate(d),
                    label: U.capitalize(WEEKDAY_NAMES_NORM[w]) + " dernier · " + U.formatDate(U.toISODate(d), { short: true }),
                    matched: WEEKDAY_NAMES_NORM[w],
                    confidence: 0.6
                };
            }
        }

        /* « la semaine dernière », « le mois dernier » */
        if (/semaine derniere|la semaine passee/.test(normalized)) {
            const d = U.addDays(today, -7);
            return { date: U.toISODate(d), label: "Il y a une semaine", matched: "semaine dernière", confidence: 0.5 };
        }
        if (/mois dernier|le mois passe/.test(normalized)) {
            const d = new Date(today.getFullYear(), today.getMonth() - 1, Math.min(today.getDate(), 28));
            return { date: U.toISODate(d), label: U.formatDate(U.toISODate(d)), matched: "mois dernier", confidence: 0.5 };
        }

        return { date: todayISO, label: "Aujourd'hui", matched: "", confidence: 0.4, fallback: true };
    }

    /* ======================================================================
       6. DESCRIPTION (§20)
       ====================================================================== */

    const STOP_WORDS = [
        "j ai", "jai", "je ai", "je", "j", "ai", "a", "au", "aux", "de", "du", "des", "le", "la",
        "les", "un", "une", "pour", "avec", "sur", "dans", "chez", "mon", "ma", "mes", "ce", "cet",
        "cette", "hier", "aujourd hui", "aujourdhui", "ce matin", "ce soir", "matin", "soir",
        "francs", "franc", "fcfa", "cfa", "frs", "f", "boule", "boules", "environ", "a peu pres",
        "depense", "depenser", "paye", "payer", "achete", "acheter", "donne", "donner", "coute",
        "regle", "regler", "reglee", "debite", "debiter", "retire", "retirer", "fait cadeau",
        "couté", "fait", "faire", "fais", "porte", "mise", "mis", "et", "puis", "encore", "aussi",
        "c est", "s est", "on", "nous", "y", "en", "l ai", "lai", "vient", "viens", "couté",
        "tranche", "rue", "voie", "carrefour", "aupres", "pres"
    ];

    /**
     * Extrait une description courte et lisible (§20).
     * « J'ai dépensé 2000 francs pour le taxi » -> « Taxi »
     */
    /** Noms propres locaux : la détection travaille sans accent, l'affichage les remet. */
    const LOCAL_PROPER_NOUNS = {
        adjame: "Adjamé", angre: "Angré", cocody: "Cocody", yopougon: "Yopougon",
        abobo: "Abobo", treichville: "Treichville", plateau: "Plateau", marcory: "Marcory",
        koumassi: "Koumassi", "port bouet": "Port-Bouët", bingerville: "Bingerville",
        attiecoube: "Attécoubé", yamoussoukro: "Yamoussoukro", bouake: "Bouaké",
        bassam: "Grand-Bassam", assinie: "Assinie", jacqueville: "Jacqueville",
        djibi: "La Djibi", sicomex: "Sicomex", cocovico: "Cocovico", "angre chateau": "Angré Château",
        cie: "CIE", sodeci: "SODECI", sotra: "SOTRA", celtiis: "Celtiis",
        orange: "Orange", wave: "Wave", djamo: "Djamo", moov: "Moov", mtn: "MTN",
        garba: "garba", attieke: "attiéké", alloco: "alloco", choukouya: "choukouya",
        kedjenou: "kédjenou", "degue": "dégué", "woro woro": "wôrô-wôrô", gbaka: "gbaka",
        tontine: "tontine", ecolage: "écolage"
    };

    function extractDescription(text, fallback, extras) {
        let s = " " + normalize(text) + " ";
        if (!s.trim()) return fallback || "Dépense";

        /* 0) Mots déjà utilisés ailleurs (moyen de paiement, date, mots-clés de
           catégorie) : les laisser dans la description la rendrait bruyante —
           « Tontine wave tantot » au lieu de « Tontine ». */
        const remove = [];
        if (extras) {
            if (extras.paymentMatched) remove.push(extras.paymentMatched);
            if (extras.dateMatched) remove.push(extras.dateMatched);
            /* Volontairement : on GARDE les mots de catégorie, ce sont eux qui
               décrivent le mieux la dépense (« tontine », « garba », « gbaka »). */
        }
        remove.forEach(function (word) {
            if (!word) return;
            const pattern = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            s = s.replace(new RegExp("(^|\\s)" + pattern + "(\\s|$)", "g"), " ");
        });

        /* 1) Retirer les montants chiffrés et en lettres */
        s = s.replace(/\d[\d\s.,]*\d|\d/g, " ");
        s = s.replace(/\b(deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|cent|cents|mille|millions?|un|une|zero)\b/g, " ");

        /* 2) Retirer devises et mots de remplissage */
        s = s.replace(/\b(francs?|fcfa|cfa|frs|euros?|dollars?|boules?|krikas?|balles?|ble|taman|jetons?|pierre|djè)\b/g, " ");
        STOP_WORDS.forEach(function (word) {
            s = s.replace(new RegExp("(^|\\s)" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\s|$)", "g"), " ");
        });

        /* 2b) Mots de paiement et de temps restants */
        s = s.replace(/\b(avec|via|par|en|de|du|au|aux|pour|mon|ma|mes|wave|djamo|moov|mtn|orange|cash|money|mobile|tantot|aujourd hui|hier|matin|soir|midi|ce|cet|cette)\b/g, " ");

        /* 2c) Restituer les accents des noms propres : la normalisation les a
           retirés pour la détection, mais « Adjame » s'écrit « Adjamé ».
           Les expressions composées sont traitées avant les mots isolés
           (« woro woro » → « wôrô-wôrô », « angre chateau » → « Angré Château »). */
        Object.keys(LOCAL_PROPER_NOUNS).forEach(function (key) {
            if (key.indexOf(" ") === -1) return;
            s = s.split(" " + key + " ").join(" " + LOCAL_PROPER_NOUNS[key] + " ");
        });
        s = s.replace(/\s+/g, " ").trim();
        s = s.split(" ").map(function (word) {
            return LOCAL_PROPER_NOUNS[word] || word;
        }).join(" ");

        /* 3) Nettoyer les mots d'une seule lettre restants */
        s = s.replace(/\s+/g, " ").trim();
        s = s.split(" ").filter(function (w) { return w.length > 1; }).join(" ").trim();

        if (!s) return fallback || "Dépense";

        /* 4) Formater : majuscule initiale, longueur maîtrisée */
        return U.capitalize(U.sanitizeText(s, 60));
    }

    /* ======================================================================
       7. MODE DE PAIEMENT DÉTECTÉ (bonus)
       ====================================================================== */

    function detectPaymentMethod(text) {
        const n = normalize(text);
        const patterns = [
            { method: "Orange Money", keys: ["orange money", "orange cash", "via orange", "avec orange"] },
            { method: "MTN Mobile Money", keys: ["mtn", "mtn money", "mobile money mtn"] },
            { method: "Moov Money", keys: ["moov", "moov money", "flooz"] },
            { method: "Wave", keys: ["wave", "avec wave", "via wave", "application wave"] },
            { method: "Djamo", keys: ["djamo", "carte djamo", "avec djamo"] },
            { method: "Carte bancaire", keys: ["carte", "carte bancaire", "carte bleue", "visa", "mastercard", "tpe"] },
            { method: "Virement bancaire", keys: ["virement", "banque", "ecobank", "sgci", "nsia", "bancaire", "cheque"] },
            { method: "Espèces", keys: ["especes", "cash", "liquide", "en main", "espece", "en especes", "au marche en main"] }
        ];

        for (let i = 0; i < patterns.length; i++) {
            for (let j = 0; j < patterns[i].keys.length; j++) {
                if (hasKeyword(n, patterns[i].keys[j])) {
                    return { method: patterns[i].method, matched: patterns[i].keys[j] };
                }
            }
        }
        return { method: "Espèces", matched: "", fallback: true };
    }

    /* ======================================================================
       8. ANALYSE COMPLÈTE D'UNE PHRASE
       ====================================================================== */

    /**
     * Transforme une phrase libre en transaction proposée (jamais enregistrée).
     * @param {string} transcript
     * @returns {Object} proposition + niveau de confiance global
     */
    function parseTranscript(transcript) {
        const text = U.sanitizeText(transcript, 400);
        const amountInfo = extractAmount(text);
        const categoryInfo = detectCategory(text);
        const dateInfo = detectDate(text);
        const paymentInfo = detectPaymentMethod(text);
        const description = extractDescription(text, categoryInfo.category !== "Autres"
            ? categoryInfo.category
            : "Dépense", {
            paymentMatched: paymentInfo.matched,
            dateMatched: dateInfo.matched,
            categoryMatches: categoryInfo.matches
        });

        /* Confiance globale : montant (50 %), catégorie (30 %), date/description (20 %) */
        const confidence = Math.max(0, Math.min(1,
            (amountInfo.amount > 0 ? 0.5 * Math.max(0.4, amountInfo.confidence) : 0) +
            (categoryInfo.category !== "Autres" ? 0.3 * categoryInfo.confidence : 0.05) +
            0.12 * (dateInfo.fallback ? 0.5 : dateInfo.confidence) +
            (description && description !== "Dépense" ? 0.08 : 0)
        ));

        return {
            transcript: text,
            amount: amountInfo.amount,
            amountRaw: amountInfo.raw,
            amountAlternatives: amountInfo.alternatives,
            category: categoryInfo.category,
            categoryMatches: categoryInfo.matches,
            date: dateInfo.date,
            dateLabel: dateInfo.label,
            dateMatched: dateInfo.matched,
            description: description,
            paymentMethod: paymentInfo.method,
            confidence: confidence,
            confidenceLevel: confidence >= 0.7 ? "high" : (confidence >= 0.45 ? "medium" : "low"),
            isComplete: amountInfo.amount > 0,
            parsedAt: new Date().toISOString()
        };
    }

    /* ======================================================================
       9. RECONNAISSANCE VOCALE (§15, §22)
       ====================================================================== */

    const voiceState = {
        recognition: null,
        listening: false,
        transcript: "",
        interim: "",
        parsed: null,
        error: null,
        modal: null
    };

    /** Démarre l'écoute. */
    function startVoiceRecognition() {
        const Ctor = getRecognitionCtor();
        if (!Ctor) {
            voiceState.error = "unsupported";
            renderStage();
            U.toast("Saisie vocale indisponible", "warn", "Utilisez la saisie texte ci-dessous.");
            return false;
        }
        if (voiceState.listening) return true;

        let recognition;
        try {
            recognition = new Ctor();
        } catch (e) {
            voiceState.error = "unsupported";
            renderStage();
            return false;
        }

        const cfg = settings();
        recognition.lang = cfg.voiceLanguage || "fr-FR";
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        voiceState.recognition = recognition;
        voiceState.transcript = "";
        voiceState.interim = "";
        voiceState.error = null;

        recognition.onstart = function () {
            voiceState.listening = true;
            renderStage();
        };

        recognition.onresult = function (event) {
            let interim = "";
            let finalText = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const res = event.results[i];
                if (res.isFinal) finalText += res[0].transcript;
                else interim += res[0].transcript;
            }
            if (finalText) voiceState.transcript += finalText;
            voiceState.interim = interim;
            renderStage();

            if (finalText) handleVoiceResult(voiceState.transcript);
        };

        recognition.onerror = function (event) {
            voiceState.listening = false;
            const code = event.error || "unknown";
            voiceState.error = code;

            if (code === "not-allowed" || code === "service-not-allowed") {
                voiceState.error = "not-allowed";
                U.toast("Microphone refusé", "error", "Autorisez l'accès au microphone dans votre navigateur.");
            } else if (code === "no-speech") {
                U.toast("Je n'ai rien entendu", "warn", "Parlez un peu plus près du micro et réessayez.");
            } else if (code === "audio-capture") {
                U.toast("Aucun microphone détecté", "error", "Vérifiez qu'un micro est branché ou autorisé.");
            } else if (code === "network") {
                U.toast("Réseau indisponible", "error", "La reconnaissance vocale a besoin d'une connexion.");
            } else if (code !== "aborted") {
                U.toast("Problème de reconnaissance vocale", "error", "Vous pouvez utiliser la saisie texte ci-dessous.");
            }
            renderStage();
        };

        recognition.onend = function () {
            voiceState.listening = false;
            renderStage();
        };

        try {
            recognition.start();
            voiceState.listening = true;
            renderStage();
            return true;
        } catch (e) {
            voiceState.listening = false;
            voiceState.error = "start-failed";
            renderStage();
            return false;
        }
    }

    /** Arrête l'écoute en cours. */
    function stopVoiceRecognition() {
        if (voiceState.recognition && voiceState.listening) {
            try { voiceState.recognition.stop(); } catch (e) { /* ignoré */ }
        }
        voiceState.listening = false;
        renderStage();
    }

    function abortRecognition() {
        if (voiceState.recognition) {
            try { voiceState.recognition.abort(); } catch (e) { /* ignoré */ }
        }
        voiceState.listening = false;
    }

    /**
     * Traite le texte reconnu (§15).
     * Affiche la confirmation — n'enregistre JAMAIS automatiquement (§21).
     */
    function handleVoiceResult(transcript) {
        const text = U.sanitizeText(transcript || voiceState.transcript, 400);
        if (!text) return null;

        voiceState.transcript = text;
        voiceState.parsed = parseTranscript(text);
        renderStage();
        return voiceState.parsed;
    }

    /* ======================================================================
       10. INTERFACE VOCALE (§16)
       ====================================================================== */

    function buildModal() {
        const titleId = "voiceTitle";
        const stage = U.el("div", { id: "voiceStage" });

        const panel = U.el("div", { class: "modal-panel", attrs: { "aria-labelledby": titleId } }, [
            U.el("div", { class: "modal-grip", attrs: { "aria-hidden": "true" } }),
            U.el("div", { class: "modal-head" }, [
                U.el("div", {}, [
                    U.el("h2", { id: titleId, text: "🎙️ Ajouter par la voix" }),
                    U.el("p", { class: "modal-sub", text: "Dites votre dépense naturellement. Rien n'est enregistré sans votre confirmation." })
                ]),
                U.el("button", {
                    class: "icon-btn", type: "button", text: "✕",
                    attrs: { "aria-label": "Fermer" },
                    on: { click: function () { closeVoiceModal(); } }
                })
            ]),
            stage
        ]);

        voiceState.modal = U.openModal(panel, {
            labelledBy: titleId,
            onClose: function () {
                abortRecognition();
                voiceState.modal = null;
            }
        });

        renderStage();
        return voiceState.modal;
    }

    function open() {
        buildModal();
        if (isSupported()) {
            setTimeout(function () { startVoiceRecognition(); }, 280);
        }
    }

    function closeVoiceModal() {
        if (voiceState.modal && voiceState.modal.close) voiceState.modal.close();
        voiceState.modal = null;
    }

    /** Reconstruit l'écran vocal selon l'état courant. */
    function renderStage() {
        const stage = U.qs("#voiceStage");
        if (!stage) return;
        U.clear(stage);

        const support = supportState();
        const parsed = voiceState.parsed;

        /* --- Message d'erreur / support --- */
        if (!support.supported) {
            stage.appendChild(U.el("div", { class: "alert warn" }, [
                U.el("span", { class: "alert-ico", text: "🎙️", attrs: { "aria-hidden": "true" } }),
                U.el("div", {}, [
                    U.el("div", { class: "alert-title", text: "La saisie vocale n'est pas disponible sur ce navigateur." }),
                    U.el("div", { class: "muted", text: "Utilisez la saisie manuelle, ou écrivez votre phrase ci-dessous : FinaTrack l'analysera comme une phrase dite à voix haute." })
                ])
            ]));
        } else if (voiceState.error === "not-allowed") {
            stage.appendChild(U.el("div", { class: "alert danger" }, [
                U.el("span", { class: "alert-ico", text: "🔒", attrs: { "aria-hidden": "true" } }),
                U.el("div", {}, [
                    U.el("div", { class: "alert-title", text: "L'accès au microphone a été refusé." }),
                    U.el("div", { class: "muted", text: "Vous pouvez autoriser le microphone dans les paramètres de votre navigateur, puis réessayer. La saisie texte ci-dessous fonctionne aussi." })
                ])
            ]));
        } else if (voiceState.error === "audio-capture") {
            stage.appendChild(U.el("div", { class: "alert danger" }, [
                U.el("span", { class: "alert-ico", text: "🎤", attrs: { "aria-hidden": "true" } }),
                U.el("div", {}, [
                    U.el("div", { class: "alert-title", text: "Aucun microphone n'a été détecté." }),
                    U.el("div", { class: "muted", text: "Branchez un microphone ou utilisez la saisie manuelle." })
                ])
            ]));
        }

        /* --- Scène micro --- */
        const micWrap = U.el("div", { class: "mic-wrap" + (voiceState.listening ? " is-listening" : "") }, [
            U.el("span", { class: "pulse-ring", attrs: { "aria-hidden": "true" } }),
            U.el("span", { class: "pulse-ring", attrs: { "aria-hidden": "true" } }),
            U.el("span", { class: "pulse-ring", attrs: { "aria-hidden": "true" } }),
            U.el("button", {
                class: "mic-btn" + (voiceState.listening ? " is-listening" : ""),
                type: "button",
                text: voiceState.listening ? "⏹" : "🎙️",
                attrs: {
                    id: "voiceMicBtn",
                    "aria-label": voiceState.listening ? "Arrêter l'écoute" : "Démarrer l'écoute",
                    "aria-pressed": voiceState.listening ? "true" : "false"
                },
                on: {
                    click: function () {
                        if (voiceState.listening) stopVoiceRecognition();
                        else { voiceState.parsed = null; startVoiceRecognition(); }
                    }
                }
            })
        ]);

        const stageBox = U.el("div", { class: "voice-stage" }, [
            micWrap,
            U.el("div", { class: "mic-hint", text: voiceState.listening ? "Écoute en cours…" : (support.supported ? "Appuyez pour parler" : "Saisie texte disponible") }),
            U.el("div", { class: "mic-sub", text: voiceState.listening
                ? "Parlez de votre dépense : montant, objet, date si besoin."
                : "Exemple : « J'ai dépensé 500 francs de gbaka pour Adjamé tantôt. »" }),
            voiceState.listening ? U.el("div", { class: "wave", attrs: { "aria-hidden": "true" } },
                [1, 2, 3, 4, 5, 6, 7].map(function () { return U.el("span"); })) : null,
            voiceState.listening ? U.el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Arrêter l'écoute", on: { click: stopVoiceRecognition } }) : null
        ]);
        stage.appendChild(stageBox);

        /* --- Transcription --- */
        if (voiceState.transcript || voiceState.interim) {
            stage.appendChild(U.el("div", { class: "transcript", style: { marginTop: "14px" }, attrs: { "aria-live": "polite" } }, [
                U.el("div", { class: "t-label", text: "Vous avez dit" }),
                U.el("div", { class: "t-text", text: '"' + voiceState.transcript + (voiceState.interim ? " " + voiceState.interim : "") + '"' })
            ]));
        }

        /* --- Confirmation (§21) --- */
        if (parsed) {
            stage.appendChild(showVoiceConfirmation(parsed));
        } else if (support.supported) {
            stage.appendChild(U.el("div", { class: "examples", style: { marginTop: "16px" } }, [
                U.el("span", { class: "help", style: { width: "100%" }, text: "Essayez par exemple :" })
            ].concat([
                "J'ai dépensé 2 000 francs pour le taxi.",
                "J'ai acheté un repas à 2 500 francs.",
                "J'ai payé 5 000 francs pour Internet.",
                "J'ai donné 10 000 francs à ma famille."
            ].map(function (phrase) {
                return U.el("button", {
                    class: "example-chip", type: "button", text: "« " + phrase + " »",
                    on: { click: function () { handleVoiceResult(phrase); } }
                });
            }))));
        }

        /* --- Saisie texte de secours (toujours disponible) --- */
        stage.appendChild(buildManualParseBox());
    }

    /** Zone de saisie texte : analyse la même grammaire que la voix. */
    function buildManualParseBox() {
        const input = U.el("input", {
            class: "input", type: "text", id: "voiceManualInput",
            placeholder: "Ou écrivez : « Taxi 2000 francs aujourd'hui »",
            attrs: { "aria-label": "Écrire une phrase à analyser" }
        });

        const form = U.el("form", { class: "row", style: { gap: "8px", marginTop: "16px" } }, [
            U.el("div", { class: "grow" }, [input]),
            U.el("button", { class: "btn btn-soft", type: "submit", text: "Analyser" })
        ]);

        form.addEventListener("submit", function (e) {
            e.preventDefault();
            const value = input.value.trim();
            if (!value) { input.focus(); return; }
            handleVoiceResult(value);
        });

        return U.el("div", {}, [
            U.el("div", { class: "divider" }),
            U.el("div", { class: "field-label", text: "Saisie texte (fonctionne partout)" }),
            form
        ]);
    }

    /**
     * Affiche la carte de confirmation d'une dépense vocale (§21).
     * L'utilisateur doit confirmer explicitement.
     */
    function showVoiceConfirmation(parsed) {
        const confidenceLabel = parsed.confidenceLevel === "high" ? "Détection fiable"
            : parsed.confidenceLevel === "medium" ? "Détection probable" : "Détection à vérifier";

        const rows = [
            { ico: "💵", label: "Montant", value: parsed.amount > 0 ? U.formatCurrency(parsed.amount) : "Non détecté" },
            { ico: U.categoryEmoji(parsed.category), label: "Catégorie", value: parsed.category },
            { ico: "📝", label: "Description", value: parsed.description },
            { ico: "📅", label: "Date", value: parsed.dateLabel + " · " + U.formatDate(parsed.date, { short: true }) },
            { ico: U.paymentEmoji(parsed.paymentMethod), label: "Paiement", value: parsed.paymentMethod + (parsed.paymentMethod === "Espèces" ? " (par défaut)" : "") }
        ];

        const card = U.el("div", { class: "detect-card", style: { marginTop: "16px" }, id: "voiceConfirmCard" }, [
            U.el("div", { class: "detect-head" }, [
                U.el("div", {}, [
                    U.el("div", { class: "dh-label", text: "Dépense détectée" }),
                    U.el("div", { class: "detect-amount num", text: parsed.amount > 0 ? U.formatCurrency(parsed.amount) : "Montant manquant" })
                ]),
                U.el("div", { class: "confidence " + (parsed.confidenceLevel === "high" ? "" : parsed.confidenceLevel), attrs: { title: "Confiance de l'analyse" } }, [
                    U.el("span", { class: "dot", attrs: { "aria-hidden": "true" } }),
                    U.el("span", { text: confidenceLabel })
                ])
            ]),
            U.el("div", { class: "detect-rows" }, rows.map(function (row) {
                return U.el("div", { class: "detect-row" }, [
                    U.el("span", { class: "dr-ico", text: row.ico, attrs: { "aria-hidden": "true" } }),
                    U.el("div", {}, [
                        U.el("div", { class: "dr-label", text: row.label }),
                        U.el("div", { class: "dr-value", text: row.value })
                    ])
                ]);
            })),
            U.el("div", { class: "detect-foot" }, [
                U.el("div", {
                    text: parsed.categoryMatches && parsed.categoryMatches.length
                        ? "Mots reconnus : " + parsed.categoryMatches.slice(0, 4).join(", ")
                        : "Aucun mot-clé de catégorie reconnu : « Autres » est proposé."
                }),
                parsed.amountAlternatives && parsed.amountAlternatives.length
                    ? U.el("div", { style: { marginTop: "4px" }, text: "Autres montants possibles : " + parsed.amountAlternatives.map(function (a) { return U.formatCurrency(a); }).join(" · ") })
                    : null
            ]),
            U.el("div", { class: "modal-foot", style: { padding: "0 var(--sp-4) var(--sp-4)", marginTop: "0" } }, [
                U.el("button", {
                    class: "btn btn-ghost", type: "button", text: "🎙️ Recommencer",
                    on: {
                        click: function () {
                            voiceState.parsed = null;
                            voiceState.transcript = "";
                            voiceState.interim = "";
                            renderStage();
                            if (isSupported()) startVoiceRecognition();
                        }
                    }
                }),
                U.el("button", {
                    class: "btn btn-soft", type: "button", text: "✏️ Modifier", dataset: { action: "voice-edit" },
                    on: { click: function () { openEditFromVoice(parsed); } }
                }),
                U.el("button", {
                    class: "btn btn-accent", type: "button", text: "✓ Confirmer", "data-autofocus": "",
                    on: { click: function () { confirmVoiceExpense(parsed); } }
                })
            ])
        ]);

        if (parsed.amount <= 0) {
            card.appendChild(U.el("div", { class: "alert warn", style: { margin: "0 16px 16px" } }, [
                U.el("span", { class: "alert-ico", text: "⚠️", attrs: { "aria-hidden": "true" } }),
                U.el("div", {}, [
                    U.el("div", { class: "alert-title", text: "Je n'ai pas identifié de montant." }),
                    U.el("div", { class: "muted", text: "Reformulez en précisant le montant, par exemple : « 2 000 francs pour le taxi », ou modifiez la dépense." })
                ])
            ]));
        }

        return card;
    }

    /** Enregistre la dépense vocale après confirmation explicite (§21). */
    function confirmVoiceExpense(parsed) {
        const data = parsed || voiceState.parsed;
        if (!data) return { ok: false };
        if (data.amount <= 0) {
            U.toast("Montant manquant", "warn", "Précisez le montant, ou modifiez la dépense.");
            return { ok: false };
        }

        const result = EXP.addExpense({
            amount: data.amount,
            category: data.category,
            description: data.description,
            date: data.date,
            paymentMethod: data.paymentMethod,
            source: "voice"
        });

        if (!result.ok) {
            U.toast("Enregistrement impossible", "error", Object.values(result.errors)[0]);
            return result;
        }

        closeVoiceModal();
        U.toast("Dépense vocale enregistrée", "success",
            U.formatCurrency(result.data.amount) + " · " + result.data.category + " · " + U.formatDate(result.data.date, { short: true }));
        U.bus.emit("voice:confirmed", result.data);

        /* Retour visuel vers le tableau de bord mis à jour */
        setTimeout(function () { U.scrollToTop(true); }, 120);
        return result;
    }

    /** Ouvre le formulaire classique prérempli (§21 « Modifier »). */
    function openEditFromVoice(parsed) {
        const data = parsed || voiceState.parsed;
        closeVoiceModal();
        const draft = {
            amount: data.amount || "",
            category: data.category,
            description: data.description !== "Dépense" ? data.description : "",
            date: data.date,
            paymentMethod: data.paymentMethod,
            source: "voice"
        };
        global.FT.app.openExpenseForm(null, draft);
    }

    /* ======================================================================
       11. EXPORTS
       ====================================================================== */
    const api = {
        // support
        isSupported: isSupported,
        supportState: supportState,
        // reconnaissance
        startVoiceRecognition: startVoiceRecognition,
        stopVoiceRecognition: stopVoiceRecognition,
        handleVoiceResult: handleVoiceResult,
        // analyse
        parseTranscript: parseTranscript,
        extractAmount: extractAmount,
        detectCategory: detectCategory,
        detectDate: detectDate,
        extractDescription: extractDescription,
        detectPaymentMethod: detectPaymentMethod,
        // interface
        open: open,
        close: closeVoiceModal,
        showVoiceConfirmation: showVoiceConfirmation,
        confirmVoiceExpense: confirmVoiceExpense,
        openEditFromVoice: openEditFromVoice,
        parse: parseTranscript,
        getState: function () { return voiceState; }
    };

    global.FT.voice = api;
    /* Raccourcis globaux demandés par la spécification (§15, §36) */
    global.startVoiceRecognition = startVoiceRecognition;
    global.stopVoiceRecognition = stopVoiceRecognition;
    global.handleVoiceResult = handleVoiceResult;
    global.extractAmount = extractAmount;
    global.detectCategory = detectCategory;
    global.detectDate = detectDate;
    global.extractDescription = extractDescription;
})(window);
