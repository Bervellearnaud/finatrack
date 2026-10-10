/* ==========================================================================
   FinaTrack CI — savings.js
   Domaine Épargne : objectifs, dépôts, suivi
   Lié à la table Supabase savings (user_id, amount, goal, target_amount, etc.)
   ========================================================================== */
(function (global) {
    "use strict";

    const U = global.FT.utils;
    const data = global.FT.data;

    function validateSaving(input) {
        const raw = input || {};
        const errors = {};
        const amount = U.parseAmountInput(raw.amount);
        if (!raw.amount && raw.amount !== 0) {
            errors.amount = "Indiquez le montant.";
        } else if (!isFinite(amount) || amount <= 0) {
            errors.amount = "Le montant doit être > 0.";
        }
        const goal = U.sanitizeText(raw.goal, 40) || "Épargne";
        if (!goal) errors.goal = "Indiquez un objectif.";
        const date = raw.date ? U.toISODate(U.fromISODate(raw.date)) : U.todayISO();
        if (!U.isValidISODate(date)) errors.date = "Date invalide.";

        const target = raw.targetAmount !== undefined && raw.targetAmount !== "" ? U.parseAmountInput(raw.targetAmount) : null;
        if (raw.targetAmount && (!isFinite(target) || target <= 0)) {
            errors.targetAmount = "Objectif cible invalide.";
        }

        const value = {
            amount: amount,
            goal: goal,
            description: U.sanitizeText(raw.description, 120),
            targetAmount: target,
            date: date,
            paymentMethod: raw.paymentMethod || "Espèces"
        };

        return { valid: Object.keys(errors).length === 0, errors: errors, value: value };
    }

    function addSaving(input) {
        const res = validateSaving(input);
        if (!res.valid) return { ok: false, errors: res.errors };
        const now = new Date().toISOString();
        const rec = {
            id: U.uid("sav"),
            amount: res.value.amount,
            goal: res.value.goal,
            description: res.value.description,
            targetAmount: res.value.targetAmount,
            currentAmount: res.value.amount,
            date: res.value.date,
            paymentMethod: res.value.paymentMethod,
            createdAt: now,
            updatedAt: now
        };
        // Sauvegarde via data layer (local + sync)
        const list = data.getSavings ? data.getSavings() : [];
        list.push(rec);
        if (data.saveSavings) data.saveSavings(list);
        else {
            try { localStorage.setItem("finatrack_savings", JSON.stringify(list)); } catch (e) {}
        }
        U.bus.emit("data:changed", { type: "savings", action: "add", record: rec });
        return { ok: true, data: rec };
    }

    function updateSaving(id, patch) {
        const list = data.getSavings ? data.getSavings() : [];
        const idx = list.findIndex(function (s) { return s.id === id; });
        if (idx === -1) return { ok: false, errors: { global: "Épargne introuvable" } };
        const merged = Object.assign({}, list[idx], patch, { updatedAt: new Date().toISOString() });
        const res = validateSaving(merged);
        if (!res.valid) return { ok: false, errors: res.errors };
        list[idx] = Object.assign({}, list[idx], {
            amount: res.value.amount,
            goal: res.value.goal,
            description: res.value.description,
            targetAmount: res.value.targetAmount,
            date: res.value.date,
            paymentMethod: res.value.paymentMethod,
            updatedAt: new Date().toISOString()
        });
        if (data.saveSavings) data.saveSavings(list);
        else {
            try { localStorage.setItem("finatrack_savings", JSON.stringify(list)); } catch (e) {}
        }
        U.bus.emit("data:changed", { type: "savings", action: "update", record: list[idx] });
        return { ok: true, data: list[idx] };
    }

    function deleteSaving(id) {
        const list = data.getSavings ? data.getSavings() : [];
        const idx = list.findIndex(function (s) { return s.id === id; });
        if (idx === -1) return { ok: false, errors: { global: "Épargne introuvable" } };
        const removed = list.splice(idx, 1)[0];
        if (data.saveSavings) data.saveSavings(list);
        else {
            try { localStorage.setItem("finatrack_savings", JSON.stringify(list)); } catch (e) {}
        }
        U.bus.emit("data:changed", { type: "savings", action: "delete", record: removed });
        return { ok: true };
    }

    function getSavingsByGoal() {
        const list = data.getSavings ? data.getSavings() : [];
        const groups = {};
        list.forEach(function (s) {
            const g = s.goal || "Épargne";
            if (!groups[g]) groups[g] = { goal: g, total: 0, count: 0, target: s.targetAmount || 0, items: [] };
            groups[g].total += U.toNumber(s.amount);
            groups[g].count++;
            if (s.targetAmount) groups[g].target = Math.max(groups[g].target, s.targetAmount);
            groups[g].items.push(s);
        });
        return Object.values(groups).sort(function (a, b) { return b.total - a.total; });
    }

    function getTotalSavings() {
        const list = data.getSavings ? data.getSavings() : [];
        return list.reduce(function (t, s) { return t + U.toNumber(s.amount); }, 0);
    }

    const api = {
        validateSaving: validateSaving,
        addSaving: addSaving,
        updateSaving: updateSaving,
        deleteSaving: deleteSaving,
        getSavingsByGoal: getSavingsByGoal,
        getTotalSavings: getTotalSavings
    };

    global.FT.savings = api;

})(window);
