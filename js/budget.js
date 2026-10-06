/* ==========================================================================
   FinaTrack CI — budget.js
   Budget mensuel (§30) : définition, suivi, alertes progressive (§31),
   projection de fin de mois et historique.
   ========================================================================== */
(function (global) {
    "use strict";

    const U = global.FT.utils;
    const data = global.FT.data;
    const EXP = global.FT.expenses;

    /* ======================================================================
       1. LECTURE / ÉCRITURE
       ====================================================================== */

    /** Budget défini pour un mois (0 si non défini). */
    function getBudget(month) {
        return data.getBudget(month || U.monthKey());
    }

    /**
     * Définit le budget d'un mois.
     * @returns {{ok: boolean, errors?: Object, amount?: number, month?: string}}
     */
    function setBudget(month, amount) {
        const key = month || U.monthKey();
        const value = U.parseAmountInput(amount);

        if (!amount && amount !== 0) return { ok: false, errors: { amount: "Indiquez un montant de budget." } };
        if (!isFinite(value) || value <= 0) return { ok: false, errors: { amount: "Le budget doit être supérieur à 0 FCFA." } };
        if (value > 1000000000) return { ok: false, errors: { amount: "Ce montant semble trop élevé." } };

        data.setBudget(key, value);
        U.bus.emit("budget:updated", { month: key, amount: value });
        U.bus.emit("data:changed", { type: "budget", action: "update", record: { month: key, amount: value } });
        return { ok: true, amount: value, month: key };
    }

    function clearBudget(month) {
        const key = month || U.monthKey();
        data.setBudget(key, 0);
        U.bus.emit("budget:updated", { month: key, amount: 0 });
        U.bus.emit("data:changed", { type: "budget", action: "clear", record: { month: key } });
        return { ok: true };
    }

    /* ======================================================================
       2. CALCULS
       ====================================================================== */

    /**
     * État complet du budget pour un mois.
     * @returns {Object} {month, budget, spent, remaining, ratio, percent, level, status, projection, daysLeft, dailyAllowance}
     */
    function getBudgetState(month) {
        const key = month || U.monthKey();
        const budget = getBudget(key);
        const spent = EXP.calculateMonthlyExpenses(key);
        const income = global.FT.incomes.calculateMonthlyIncomes(key);
        const remaining = U.round2(budget - spent);
        const ratio = budget > 0 ? spent / budget : 0;

        const isCurrentMonth = key === U.monthKey();
        const daysTotal = U.daysInMonth(key);
        const daysPassed = isCurrentMonth ? new Date().getDate() : daysTotal;
        const daysLeft = Math.max(0, daysTotal - daysPassed);

        /* Projection : rythme actuel prolongé jusqu'à la fin du mois */
        const dailyRate = daysPassed > 0 ? spent / daysPassed : 0;
        const projection = U.round2(dailyRate * daysTotal);

        return {
            month: key,
            monthLabel: U.monthLabel(key),
            budget: budget,
            spent: spent,
            income: income,
            remaining: remaining,
            ratio: ratio,
            percent: U.round2(ratio * 100),
            level: budgetLevel(ratio, budget),
            hasBudget: budget > 0,
            isCurrentMonth: isCurrentMonth,
            daysTotal: daysTotal,
            daysPassed: daysPassed,
            daysLeft: daysLeft,
            dailyRate: U.round2(dailyRate),
            projection: projection,
            projectedOverspend: budget > 0 ? U.round2(projection - budget) : 0,
            dailyAllowance: daysLeft > 0 ? U.round2(Math.max(0, remaining) / daysLeft) : 0
        };
    }

    /** Niveau d'alerte : ok (< 70 %), warn (70–100 %), over (> 100 %) (§31) */
    function budgetLevel(ratio, budget) {
        if (!budget || budget <= 0) return "none";
        if (ratio > 1) return "over";
        if (ratio >= 0.7) return "warn";
        return "ok";
    }

    /** Restant à dépenser (peut être négatif). */
    function calculateBudgetRemaining(month) {
        const state = getBudgetState(month);
        return state.hasBudget ? state.remaining : 0;
    }

    /** Message d'alerte neutre et non culpabilisant (§31). */
    function getBudgetMessage(state) {
        const s = state || getBudgetState();
        if (!s.hasBudget) {
            return {
                level: "info",
                icon: "🎯",
                title: "Aucun budget défini pour " + s.monthLabel,
                text: "Définissez un budget mensuel pour suivre votre rythme de dépenses. Un budget est un repère, pas une contrainte."
            };
        }

        const percent = Math.round(s.percent);
        if (s.level === "over") {
            return {
                level: "danger",
                icon: "🔸",
                title: "Budget dépassé de " + U.formatCurrency(Math.abs(s.remaining)),
                text: "Vous avez utilisé " + percent + " % de votre budget de " + U.monthLabel(s.month) +
                      ". Ce n'est pas grave : notez simplement ce qui a pesé le plus, et ajustez le budget ou les priorités pour la suite."
            };
        }
        if (s.level === "warn") {
            return {
                level: "warn",
                icon: "🟠",
                title: "Vous avez utilisé " + percent + " % de votre budget",
                text: "Il vous reste " + U.formatCurrency(s.remaining) + " et " + s.daysLeft + " jour" + (s.daysLeft > 1 ? "s" : "") +
                      " dans le mois. Vous pouvez répartir environ " + U.formatCurrency(s.dailyAllowance) + " par jour si vous le souhaitez."
            };
        }
        return {
            level: "ok",
            icon: "🌿",
            title: "Vous êtes à " + percent + " % de votre budget",
            text: "Il vous reste " + U.formatCurrency(s.remaining) + " pour " + s.daysLeft + " jour" + (s.daysLeft > 1 ? "s" : "") +
                  ". Vous êtes dans un rythme confortable."
        };
    }

    /** Budget suggéré à partir de la moyenne des 3 derniers mois de dépenses. */
    function suggestBudget() {
        const suggestions = [];
        let cursor = U.monthKey();
        for (let i = 0; i < 3; i++) {
            const spent = EXP.calculateMonthlyExpenses(cursor);
            if (spent > 0) suggestions.push(spent);
            cursor = U.previousMonthKey(cursor);
        }
        if (!suggestions.length) return 0;
        const avg = suggestions.reduce(function (a, b) { return a + b; }, 0) / suggestions.length;
        return Math.ceil(avg / 5000) * 5000; // arrondi confortable aux 5 000 FCFA
    }

    /** Historique des budgets connus avec le montant réellement dépensé. */
    function getBudgetHistory() {
        const budgets = data.getBudgets();
        const expenseMonths = {};
        data.getExpenses().forEach(function (e) {
            expenseMonths[U.monthKey(e.date)] = true;
        });
        const months = {};
        Object.keys(budgets).forEach(function (m) { months[m] = true; });
        Object.keys(expenseMonths).forEach(function (m) { months[m] = true; });

        return Object.keys(months).sort().reverse().map(function (m) {
            const spent = EXP.calculateMonthlyExpenses(m);
            const budget = U.toNumber(budgets[m]);
            return {
                month: m,
                label: U.monthLabel(m),
                budget: budget,
                spent: spent,
                remaining: U.round2(budget - spent),
                ratio: budget > 0 ? spent / budget : 0,
                level: budgetLevel(budget > 0 ? spent / budget : 0, budget)
            };
        }).slice(0, 12);
    }

    /* ======================================================================
       3. VUE — PAGE « MON BUDGET »
       ====================================================================== */

    let viewingMonth = U.monthKey();

    function renderBudgetPage() {
        const host = U.qs("#budgetContent");
        if (!host) return;

        const state = getBudgetState(viewingMonth);
        const message = getBudgetMessage(state);
        U.clear(host);

        /* --- Formulaire de définition --- */
        const form = U.el("form", { class: "form", novalidate: "novalidate" }, [
            U.el("div", { class: "row-between wrap" }, [
                U.el("div", {}, [
                    U.el("div", { class: "field-label", text: "Mois concerné" }),
                    U.el("div", { style: { fontWeight: "800", fontSize: "1.05rem" }, text: state.monthLabel + (state.isCurrentMonth ? " (en cours)" : "") })
                ]),
                U.el("div", { class: "btn-row", style: { flex: "0 0 auto" } }, [
                    U.el("button", {
                        class: "btn btn-ghost btn-sm", type: "button", text: "◀",
                        attrs: { "aria-label": "Mois précédent" },
                        on: { click: function () { viewingMonth = U.previousMonthKey(viewingMonth); renderBudgetPage(); } }
                    }),
                    U.el("button", {
                        class: "btn btn-ghost btn-sm", type: "button", text: "Mois suivant ▶",
                        attrs: { "aria-label": "Mois suivant" },
                        on: {
                            click: function () {
                                const next = U.monthKey(new Date(U.fromISODate(viewingMonth + "-01").getFullYear(), U.fromISODate(viewingMonth + "-01").getMonth() + 1, 1));
                                if (next > U.monthKey()) return;
                                viewingMonth = next;
                                renderBudgetPage();
                            }
                        }
                    })
                ])
            ]),
            U.el("div", { class: "field", id: "budgetField" }, [
                U.el("label", { for: "budgetInput", text: "Budget mensuel" }),
                U.el("div", { class: "amount-field" }, [
                    U.el("input", {
                        class: "input", id: "budgetInput", type: "text", inputmode: "decimal",
                        value: state.budget > 0 ? U.formatNumber(state.budget) : "",
                        placeholder: "Ex. 100 000", "data-autofocus": "", autocomplete: "off"
                    }),
                    U.el("span", { class: "suffix", text: U.currencySymbol() })
                ]),
                U.el("div", { class: "error-msg", id: "budgetError", attrs: { role: "alert" } }),
                U.el("div", { class: "help", text: "Un budget est un repère, pas une contrainte. Vous pouvez le modifier à tout moment." })
            ]),
            U.el("div", { class: "amount-suggest" }, [
                U.el("span", { class: "help", style: { width: "100%" }, text: "Suggestions rapides :" }),
                U.el("button", { class: "chip", type: "button", text: "50 000", on: { click: function () { quickFill(50000); } } }),
                U.el("button", { class: "chip", type: "button", text: "100 000", on: { click: function () { quickFill(100000); } } }),
                U.el("button", { class: "chip", type: "button", text: "150 000", on: { click: function () { quickFill(150000); } } }),
                U.el("button", { class: "chip", type: "button", text: "200 000", on: { click: function () { quickFill(200000); } } }),
                suggestBudget() > 0 ? U.el("button", {
                    class: "chip", type: "button", text: "≈ " + U.formatCurrency(suggestBudget()) + " (moyenne 3 mois)",
                    on: { click: function () { quickFill(suggestBudget()); } }
                }) : null
            ]),
            U.el("div", { class: "btn-row" }, [
                U.el("button", { class: "btn btn-primary", type: "submit", text: "Enregistrer le budget" }),
                state.budget > 0 ? U.el("button", {
                    class: "btn btn-ghost", type: "button", text: "Retirer le budget",
                    on: {
                        click: function () {
                            U.confirmDialog({
                                title: "Retirer ce budget ?",
                                message: "Le suivi budgétaire sera désactivé pour " + state.monthLabel + ". Vos transactions ne sont pas supprimées.",
                                confirmLabel: "Retirer"
                            }).then(function (ok) {
                                if (!ok) return;
                                clearBudget(viewingMonth);
                                U.toast("Budget retiré", "info", state.monthLabel);
                                renderBudgetPage();
                            });
                        }
                    }
                }) : null
            ])
        ]);

        form.addEventListener("submit", function (e) {
            e.preventDefault();
            const input = U.qs("#budgetInput", form);
            const errorBox = U.qs("#budgetError", form);
            const field = U.qs("#budgetField", form);
            const result = setBudget(viewingMonth, input.value);

            if (!result.ok) {
                field.classList.add("has-error");
                errorBox.textContent = result.errors.amount || "Montant invalide.";
                errorBox.classList.add("is-shown");
                input.focus();
                return;
            }
            field.classList.remove("has-error");
            errorBox.classList.remove("is-shown");
            U.toast("Budget mis à jour", "success", state.monthLabel + " · " + U.formatCurrency(result.amount));
            renderBudgetPage();
        });

        function quickFill(value) {
            const input = U.qs("#budgetInput", form);
            input.value = U.formatNumber(value);
            input.focus();
        }

        host.appendChild(U.el("div", { class: "grid grid-2 uneven", style: { alignItems: "start" } }, [
            U.el("div", { class: "card card-lg" }, [
                U.el("div", { class: "card-head" }, [U.el("h3", {}, [U.el("span", { text: "🎯" }), U.el("span", { text: "Définir mon budget" })])] ),
                form
            ]),
            buildProgressCard(state, message)
        ]));

        host.appendChild(buildHistoryCard());
    }

    function buildProgressCard(state, message) {
        const barClass = state.level === "over" ? "progress-bar over" : (state.level === "warn" ? "progress-bar warn" : "progress-bar");
        const width = Math.min(100, Math.max(state.hasBudget ? 2 : 0, state.percent));

        const card = U.el("div", { class: "card card-lg" }, [
            U.el("div", { class: "card-head" }, [
                U.el("h3", {}, [U.el("span", { text: "📊" }), U.el("span", { text: "Suivi du budget" })]),
                U.el("span", { class: "tag " + (state.level === "over" ? "expense" : state.level === "warn" ? "budget" : "income"), text: state.hasBudget ? Math.round(state.percent) + " %" : "Non défini" })
            ])
        ]);

        if (!state.hasBudget) {
            card.appendChild(U.el("div", { class: "empty", style: { padding: "24px 8px" } }, [
                U.el("div", { class: "empty-ico", text: "🎯", attrs: { "aria-hidden": "true" } }),
                U.el("p", { text: "Aucun budget pour " + state.monthLabel + ". Définissez un montant pour activer le suivi et les alertes." })
            ]));
            return card;
        }

        const stats = U.el("div", { class: "stat-grid", style: { gridTemplateColumns: "repeat(3, minmax(0,1fr))" } }, [
            U.el("div", { class: "stat" }, [
                U.el("div", { class: "stat-label", text: "Budget total" }),
                U.el("div", { class: "stat-value num", text: U.formatCurrency(state.budget) })
            ]),
            U.el("div", { class: "stat" }, [
                U.el("div", { class: "stat-label", text: "Dépensé" }),
                U.el("div", { class: "stat-value num", text: U.formatCurrency(state.spent) })
            ]),
            U.el("div", { class: "stat" }, [
                U.el("div", { class: "stat-label", text: "Restant" }),
                U.el("div", { class: "stat-value num " + (state.remaining < 0 ? "neg" : "pos"), text: U.formatCurrency(state.remaining) })
            ])
        ]);

        card.appendChild(stats);
        card.appendChild(U.el("div", { style: { marginTop: "18px" } }, [
            U.el("div", { class: "progress hatch", attrs: { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.min(100, Math.round(state.percent))), "aria-label": "Consommation du budget" } }, [
                U.el("div", { class: barClass, style: { width: width + "%" } })
            ]),
            U.el("div", { class: "progress-legend" }, [
                U.el("span", { text: U.formatCurrency(state.spent) + " dépensés" }),
                U.el("span", { text: U.formatCurrency(Math.max(0, state.remaining)) + " restants" })
            ])
        ]));

        card.appendChild(U.el("div", { style: { marginTop: "18px" } }, [
            U.el("div", { class: "alert " + (message.level === "info" ? "info" : message.level) }, [
                U.el("span", { class: "alert-ico", text: message.icon, attrs: { "aria-hidden": "true" } }),
                U.el("div", {}, [
                    U.el("div", { class: "alert-title", text: message.title }),
                    U.el("div", { class: "muted", text: message.text })
                ])
            ])
        ]));

        /* Détails utiles */
        const details = U.el("div", { class: "stat-grid", style: { gridTemplateColumns: "repeat(2, minmax(0,1fr))", marginTop: "16px" } }, [
            U.el("div", { class: "stat" }, [
                U.el("div", { class: "stat-label", text: "Rythme quotidien" }),
                U.el("div", { class: "stat-value num", text: U.formatCurrency(state.dailyRate) })
            ]),
            U.el("div", { class: "stat" }, [
                U.el("div", { class: "stat-label", text: "Jours restants" }),
                U.el("div", { class: "stat-value num", text: state.daysLeft + " j" })
            ]),
            U.el("div", { class: "stat" }, [
                U.el("div", { class: "stat-label", text: "Marge par jour" }),
                U.el("div", { class: "stat-value num", text: U.formatCurrency(state.dailyAllowance) })
            ]),
            U.el("div", { class: "stat" }, [
                U.el("div", { class: "stat-label", text: "Projection fin de mois" }),
                U.el("div", { class: "stat-value num " + (state.projection > state.budget ? "neg" : "pos"), text: U.formatCurrency(state.projection) })
            ])
        ]);
        card.appendChild(details);

        if (state.projection > state.budget && state.isCurrentMonth) {
            card.appendChild(U.el("div", { class: "alert info", style: { marginTop: "14px" } }, [
                U.el("span", { class: "alert-ico", text: "🔮", attrs: { "aria-hidden": "true" } }),
                U.el("div", {}, [
                    U.el("div", { class: "alert-title", text: "À ce rythme : " + U.formatCurrency(state.projection) + " en fin de mois" }),
                    U.el("div", { class: "muted", text: "Soit " + U.formatCurrency(state.projectedOverspend) + " de plus que votre budget. Rien d'urgent : c'est une estimation basée sur vos dépenses actuelles." })
                ])
            ]));
        }

        return card;
    }

    function buildHistoryCard() {
        const history = getBudgetHistory();
        const card = U.el("div", { class: "card card-lg" }, [
            U.el("div", { class: "card-head" }, [
                U.el("h3", {}, [U.el("span", { text: "🗓️" }), U.el("span", { text: "Historique des budgets" })]),
                U.el("span", { class: "hint", text: "12 derniers mois" })
            ])
        ]);

        if (!history.length) {
            card.appendChild(U.el("p", { class: "muted", text: "Aucun historique pour le moment. Vos budgets et vos dépenses apparaîtront ici mois après mois." }));
            return card;
        }

        const list = U.el("div", { class: "cat-list" });
        history.forEach(function (entry) {
            const width = entry.budget > 0 ? Math.min(100, Math.max(2, entry.ratio * 100)) : Math.min(100, Math.max(2, entry.spent > 0 ? 100 : 0));
            const barClass = "progress-bar" + (entry.level === "over" ? " over" : entry.level === "warn" ? " warn" : "");
            list.appendChild(U.el("div", { class: "cat-row" }, [
                U.el("div", { class: "cr-name" }, [
                    U.el("span", { class: "cat-emoji", text: entry.month === U.monthKey() ? "📍" : "🗓️", attrs: { "aria-hidden": "true" } }),
                    U.el("span", { text: entry.label })
                ]),
                U.el("div", { class: "cr-value", text: entry.budget > 0 ? U.formatCurrency(entry.spent) + " / " + U.formatCurrency(entry.budget) : U.formatCurrency(entry.spent) + " dépensés" }),
                U.el("div", { class: "cr-share progress thin" }, [U.el("div", { class: barClass, style: { width: width + "%" } })])
            ]));
        });
        card.appendChild(list);
        return card;
    }

    function initBudgetPage() {
        const page = U.qs('[data-page="budget"]');
        if (!page) return;
        viewingMonth = U.monthKey();
        renderBudgetPage();
        U.bus.on("data:changed", function (payload) {
            if (payload && payload.type === "budget") return; // évite la boucle de rendu
            renderBudgetPage();
        });
    }

    /* ======================================================================
       4. EXPORTS
       ====================================================================== */
    const api = {
        getBudget: getBudget,
        setBudget: setBudget,
        clearBudget: clearBudget,
        getBudgetState: getBudgetState,
        budgetLevel: budgetLevel,
        calculateBudgetRemaining: calculateBudgetRemaining,
        getBudgetMessage: getBudgetMessage,
        suggestBudget: suggestBudget,
        getBudgetHistory: getBudgetHistory,
        initBudgetPage: initBudgetPage,
        renderBudgetPage: renderBudgetPage
    };

    global.FT.budget = api;
    global.setBudget = setBudget;
    global.calculateBudgetRemaining = calculateBudgetRemaining;
})(window);
