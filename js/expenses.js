/* ==========================================================================
   FinaTrack CI — expenses.js
   Domaine « dépenses » : validation, CRUD, agrégations et statistiques.
   Toutes les écritures passent par FT.data (couche abstraite).
   ========================================================================== */
(function (global) {
    "use strict";

    const U = global.FT.utils;
    const data = global.FT.data;

    /* ======================================================================
       1. VALIDATION (§40)
       ====================================================================== */

    /**
     * Valide les données d'une dépense.
     * @returns {{valid: boolean, errors: Object<string,string>, value: Object}}
     */
    function validateExpense(input) {
        const raw = input || {};
        const errors = {};

        const amount = U.parseAmountInput(raw.amount);
        if (!raw.amount && raw.amount !== 0) {
            errors.amount = "Indiquez le montant de la dépense.";
        } else if (!isFinite(amount) || amount <= 0) {
            errors.amount = "Le montant doit être un nombre supérieur à 0.";
        } else if (amount > 1000000000) {
            errors.amount = "Ce montant semble trop élevé. Vérifiez votre saisie.";
        }

        const category = U.sanitizeText(raw.category, 40);
        if (!category) {
            errors.category = "Choisissez une catégorie.";
        } else if (U.CATEGORIES.indexOf(category) === -1) {
            errors.category = "Cette catégorie n'existe pas.";
        }

        const date = raw.date ? U.toISODate(U.fromISODate(raw.date)) : U.todayISO();
        if (!U.isValidISODate(date)) {
            errors.date = "Choisissez une date valide.";
        } else if (U.fromISODate(date) > U.addDays(U.todayISO(), 1)) {
            errors.date = "La date ne peut pas être dans le futur.";
        }

        const method = raw.paymentMethod ? U.sanitizeText(raw.paymentMethod, 40) : "";
        if (method && U.PAYMENT_METHODS.indexOf(method) === -1) {
            errors.paymentMethod = "Mode de paiement inconnu.";
        }

        return {
            valid: Object.keys(errors).length === 0,
            errors: errors,
            value: {
                amount: amount,
                category: category || "Autres",
                description: U.sanitizeText(raw.description, 160),
                date: date,
                paymentMethod: method || "Espèces",
                source: raw.source === "voice" ? "voice" : "manual"
            }
        };
    }

    /* ======================================================================
       2. CRUD
       ====================================================================== */

    /**
     * Ajoute une dépense après validation.
     * @returns {{ok: true, data: Object} | {ok: false, errors: Object}}
     */
    function addExpense(expense) {
        const check = validateExpense(expense);
        if (!check.valid) return { ok: false, errors: check.errors };

        const record = data.addExpense(check.value);
        if (!record) {
            return { ok: false, errors: { global: "Enregistrement impossible. Vérifiez l'espace disponible dans votre navigateur." } };
        }
        U.bus.emit("expense:added", record);
        U.bus.emit("data:changed", { type: "expense", action: "add", record: record });
        return { ok: true, data: record };
    }

    /**
     * Modifie une dépense existante (§27).
     * @returns {{ok: true, data: Object} | {ok: false, errors: Object}}
     */
    function updateExpense(id, patch) {
        const existing = getExpenseById(id);
        if (!existing) return { ok: false, errors: { global: "Cette dépense n'existe plus." } };

        const merged = Object.assign({}, existing, patch);
        const check = validateExpense(merged);
        if (!check.valid) return { ok: false, errors: check.errors };

        const record = data.updateExpense(id, check.value);
        if (!record) return { ok: false, errors: { global: "La modification a échoué." } };

        U.bus.emit("expense:updated", record);
        U.bus.emit("data:changed", { type: "expense", action: "update", record: record });
        return { ok: true, data: record };
    }

    /** Supprime une dépense (§28). */
    function deleteExpense(id) {
        const existing = getExpenseById(id);
        if (!existing) return { ok: false, errors: { global: "Cette dépense n'existe plus." } };
        const done = data.deleteExpense(id);
        if (done) {
            U.bus.emit("expense:deleted", existing);
            U.bus.emit("data:changed", { type: "expense", action: "delete", record: existing });
        }
        return { ok: done, data: existing };
    }

    /* ======================================================================
       3. LECTURES
       ====================================================================== */

    function getExpenses(options) {
        const opts = options || {};
        let list = data.getExpenses();
        if (opts.month) list = list.filter(function (e) { return U.monthKey(e.date) === opts.month; });
        if (opts.from) list = list.filter(function (e) { return e.date >= opts.from; });
        if (opts.to) list = list.filter(function (e) { return e.date <= opts.to; });
        return list.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    }

    function getExpenseById(id) {
        return data.getExpenses().filter(function (e) { return e.id === id; })[0] || null;
    }

    /* ======================================================================
       4. CALCULS & AGRÉGATIONS
       ====================================================================== */

    function sum(list) {
        return U.round2((list || []).reduce(function (total, item) { return total + U.toNumber(item.amount); }, 0));
    }

    /** Total des dépenses (filtre optionnel) */
    function calculateExpensesTotal(list) {
        return sum(list || data.getExpenses());
    }

    /** Dépenses du mois courant (§8) */
    function calculateMonthlyExpenses(month) {
        const key = month || U.monthKey();
        return sum(data.getExpenses().filter(function (e) { return U.monthKey(e.date) === key; }));
    }

    /** Dépenses du mois précédent */
    function calculatePreviousMonthExpenses() {
        return calculateMonthlyExpenses(U.previousMonthKey());
    }

    /** Dépenses d'aujourd'hui */
    function calculateTodayExpenses() {
        const today = U.todayISO();
        return sum(data.getExpenses().filter(function (e) { return e.date === today; }));
    }

    /** Dépenses de la semaine en cours (lundi -> aujourd'hui) */
    function calculateWeekExpenses() {
        const start = U.toISODate(U.startOfWeek(new Date()));
        const today = U.todayISO();
        return sum(data.getExpenses().filter(function (e) { return e.date >= start && e.date <= today; }));
    }

    /**
     * Répartition par catégorie, triée du montant le plus élevé au plus faible.
     * @returns {Array<{category, total, count, share, percent}>}
     */
    function getExpensesByCategory(list) {
        const source = list || data.getExpenses();
        const total = sum(source);
        const groups = {};

        source.forEach(function (item) {
            const key = item.category || "Autres";
            if (!groups[key]) groups[key] = { category: key, total: 0, count: 0 };
            groups[key].total = U.round2(groups[key].total + U.toNumber(item.amount));
            groups[key].count += 1;
        });

        return Object.keys(groups).map(function (key) {
            const g = groups[key];
            g.share = total > 0 ? g.total / total : 0;
            g.percent = g.share * 100;
            return g;
        }).sort(function (a, b) { return b.total - a.total; });
    }

    /**
     * Série des N derniers jours (par défaut 7) pour le graphique d'évolution (§11).
     * @returns {Array<{date, label, total}>}
     */
    function getExpensesByDay(days, endDate) {
        const count = days || 7;
        const source = data.getExpenses();
        const end = endDate ? U.fromISODate(endDate) : new Date();

        const series = [];
        for (let i = count - 1; i >= 0; i--) {
            const d = U.addDays(end, -i);
            const key = U.toISODate(d);
            series.push({
                date: key,
                label: U.dayNameShort(key),
                fullLabel: U.formatDate(key, { short: true }),
                total: 0
            });
        }

        const index = {};
        series.forEach(function (point) { index[point.date] = point; });

        source.forEach(function (item) {
            const point = index[item.date];
            if (point) point.total = U.round2(point.total + U.toNumber(item.amount));
        });

        return series;
    }

    /** Moyenne quotidienne des dépenses sur le mois (ou sur la liste fournie). */
    function getAverageDailyExpense(list, month) {
        const key = month || U.monthKey();
        const source = list || data.getExpenses().filter(function (e) { return U.monthKey(e.date) === key; });
        if (!source.length) return 0;

        const days = {};
        source.forEach(function (e) { days[e.date] = true; });
        const activeDays = Object.keys(days).length || 1;

        const reference = U.monthKey() === key ? new Date().getDate() : U.daysInMonth(key);
        const divisor = Math.max(activeDays, Math.min(reference, U.daysInMonth(key)));
        return U.round2(sum(source) / (divisor || 1));
    }

    /** Jour (date) où l'on a le plus dépensé sur la période. */
    function getHighestSpendingDay(list) {
        const source = list || data.getExpenses();
        if (!source.length) return null;
        const days = {};
        source.forEach(function (e) { days[e.date] = U.round2((days[e.date] || 0) + U.toNumber(e.amount)); });
        const best = Object.keys(days).sort(function (a, b) { return days[b] - days[a]; })[0];
        return best ? { date: best, total: days[best], label: U.formatDate(best) } : null;
    }

    /** Jour de la semaine le plus coûteux (lundi, mardi…) */
    function getHighestSpendingWeekday(list) {
        const source = list || data.getExpenses();
        if (!source.length) return null;
        const totals = new Array(7).fill(0);
        source.forEach(function (e) {
            const d = U.fromISODate(e.date);
            if (isNaN(d.getTime())) return;
            totals[d.getDay()] = U.round2(totals[d.getDay()] + U.toNumber(e.amount));
        });
        let bestIdx = 0;
        totals.forEach(function (v, i) { if (v > totals[bestIdx]) bestIdx = i; });
        return { index: bestIdx, day: U.DAYS_FR[bestIdx], total: totals[bestIdx] };
    }

    /** Dépense la plus élevée enregistrée. */
    function getLargestExpense(list) {
        const source = (list || data.getExpenses()).slice();
        if (!source.length) return null;
        return source.sort(function (a, b) { return b.amount - a.amount; })[0];
    }

    /** Nombre de jours couverts par une liste de dépenses. */
    function countActiveDays(list) {
        const days = {};
        (list || []).forEach(function (e) { days[e.date] = true; });
        return Object.keys(days).length;
    }

    /* ======================================================================
       5. EXPORTS
       ====================================================================== */
    const api = {
        validateExpense: validateExpense,
        addExpense: addExpense,
        updateExpense: updateExpense,
        deleteExpense: deleteExpense,
        getExpenses: getExpenses,
        getExpenseById: getExpenseById,
        calculateExpensesTotal: calculateExpensesTotal,
        calculateMonthlyExpenses: calculateMonthlyExpenses,
        calculatePreviousMonthExpenses: calculatePreviousMonthExpenses,
        calculateTodayExpenses: calculateTodayExpenses,
        calculateWeekExpenses: calculateWeekExpenses,
        getExpensesByCategory: getExpensesByCategory,
        getExpensesByDay: getExpensesByDay,
        getAverageDailyExpense: getAverageDailyExpense,
        getHighestSpendingDay: getHighestSpendingDay,
        getHighestSpendingWeekday: getHighestSpendingWeekday,
        getLargestExpense: getLargestExpense,
        countActiveDays: countActiveDays,
        sum: sum
    };

    global.FT.expenses = api;
    /* Raccourcis globaux demandés par la spécification (§36) */
    global.addExpense = addExpense;
    global.updateExpense = updateExpense;
    global.deleteExpense = deleteExpense;
    global.calculateMonthlyExpenses = calculateMonthlyExpenses;
})(window);
