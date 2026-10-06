/* ==========================================================================
   FinaTrack CI — analysis.js
   Page « Analyse financière » (§32) et « Mes principales dépenses » (§33).
   Indicateurs, comparaisons de périodes et conseils neutres.
   ========================================================================== */
(function (global) {
    "use strict";

    const U = global.FT.utils;
    const data = global.FT.data;
    const EXP = global.FT.expenses;
    const INC = global.FT.incomes;
    const TX = global.FT.tx;

    const state = { period: "month", customFrom: "", customTo: "" };

    const PERIODS = [
        { id: "month", label: "Ce mois" },
        { id: "prev-month", label: "Mois dernier" },
        { id: "quarter", label: "3 derniers mois" },
        { id: "year", label: "Cette année" },
        { id: "all", label: "Tout" },
        { id: "custom", label: "Personnalisée" }
    ];

    /* ======================================================================
       1. PÉRIODES
       ====================================================================== */
    function resolvePeriod(period, customFrom, customTo) {
        const today = U.todayISO();
        const now = new Date();
        switch (period) {
            case "month":
                return { from: U.toISODate(U.startOfMonth(now)), to: U.toISODate(U.endOfMonth(now)), label: U.monthLabel(U.monthKey()) };
            case "prev-month": {
                const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                return { from: U.toISODate(U.startOfMonth(d)), to: U.toISODate(U.endOfMonth(d)), label: U.monthLabel(U.monthKey(d)) };
            }
            case "quarter": {
                const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                return { from: U.toISODate(U.startOfMonth(d)), to: today, label: "3 derniers mois" };
            }
            case "year":
                return { from: now.getFullYear() + "-01-01", to: today, label: "Année " + now.getFullYear() };
            case "custom":
                return { from: customFrom || null, to: customTo || null, label: "Période personnalisée" };
            default:
                return { from: null, to: null, label: "Tout l'historique" };
        }
    }

    /** Période équivalente précédente (pour comparer). */
    function previousRange(range) {
        if (!range.from || !range.to) return { from: null, to: null };
        const from = U.fromISODate(range.from);
        const to = U.fromISODate(range.to);
        const days = Math.max(1, Math.round((to - from) / 86400000) + 1);
        return {
            from: U.toISODate(U.addDays(from, -days)),
            to: U.toISODate(U.addDays(from, -1))
        };
    }

    /* ======================================================================
       2. CALCULS
       ====================================================================== */

    /** Rassemble tous les indicateurs demandés (§32). */
    function computeAnalysis(range) {
        const expenses = data.getExpenses().filter(function (e) {
            return (!range.from || e.date >= range.from) && (!range.to || e.date <= range.to);
        });
        const incomes = data.getIncomes().filter(function (i) {
            return (!range.from || i.date >= range.from) && (!range.to || i.date <= range.to);
        });

        const income = EXP.sum(incomes);
        const expense = EXP.sum(expenses);
        const savings = U.round2(income - expense);
        const savingsRate = income > 0 ? U.round2(((income - expense) / income) * 100) : 0;
        const byCategory = EXP.getExpensesByCategory(expenses);
        const activeDays = EXP.countActiveDays(expenses);

        const first = expenses.concat(incomes).reduce(function (min, item) {
            return !min || item.date < min ? item.date : min;
        }, null);
        const last = expenses.concat(incomes).reduce(function (max, item) {
            return !max || item.date > max ? item.date : max;
        }, null);

        let periodDays = 0;
        if (range.from && range.to) {
            periodDays = Math.round((U.fromISODate(range.to) - U.fromISODate(range.from)) / 86400000) + 1;
        } else if (first && last) {
            periodDays = Math.round((U.fromISODate(last) - U.fromISODate(first)) / 86400000) + 1;
        }

        const averageDaily = activeDays > 0 ? U.round2(expense / Math.max(1, Math.min(periodDays || activeDays, activeDays === 0 ? 1 : periodDays || activeDays))) : 0;

        return {
            income: income,
            expense: expense,
            savings: savings,
            savingsRate: savingsRate,
            balance: savings,
            byCategory: byCategory,
            topCategory: byCategory[0] || null,
            averageDaily: EXP.getAverageDailyExpense(expenses) || averageDaily,
            averagePerTransaction: expenses.length ? U.round2(expense / expenses.length) : 0,
            highestDay: EXP.getHighestSpendingDay(expenses),
            highestWeekday: EXP.getHighestSpendingWeekday(expenses),
            largestExpense: EXP.getLargestExpense(expenses),
            activeDays: activeDays,
            periodDays: periodDays,
            expenseCount: expenses.length,
            incomeCount: incomes.length,
            averageIncome: incomes.length ? U.round2(income / incomes.length) : 0,
            expenses: expenses,
            incomes: incomes
        };
    }

    /* Comparaison avec la période précédente. */
    function computeComparison(range) {
        const prev = previousRange(range);
        if (!prev.from) return null;
        const current = computeAnalysis(range);
        const before = computeAnalysis(prev);
        if (!before.expense && !before.income) return null;

        return {
            range: prev,
            expenseDelta: before.expense > 0 ? (current.expense - before.expense) / before.expense : null,
            incomeDelta: before.income > 0 ? (current.income - before.income) / before.income : null,
            expenseBefore: before.expense,
            incomeBefore: before.income,
            savingsBefore: before.savings,
            categoryMoves: current.byCategory.map(function (group) {
                const previousGroup = before.byCategory.filter(function (g) { return g.category === group.category; })[0];
                const previousTotal = previousGroup ? previousGroup.total : 0;
                return {
                    category: group.category,
                    total: group.total,
                    previousTotal: previousTotal,
                    delta: previousTotal > 0 ? (group.total - previousTotal) / previousTotal : (group.total > 0 ? 1 : 0)
                };
            }).sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); })
        };
    }

    /* ======================================================================
       3. RENDU
       ====================================================================== */

    function statCard(label, value, options) {
        const opts = options || {};
        return U.el("div", { class: "stat" }, [
            U.el("div", { class: "stat-label", text: label }),
            U.el("div", { class: "stat-value num " + (opts.cls || ""), text: value }),
            opts.sub ? U.el("div", { class: "muted", style: { fontSize: "var(--fs-sm)", marginTop: "4px" }, text: opts.sub }) : null
        ]);
    }

    function renderStats(stats, comparison) {
        const host = U.qs("#analysisStats");
        if (!host) return;
        U.clear(host);

        const expenseSub = comparison && comparison.expenseDelta !== null
            ? (comparison.expenseDelta >= 0 ? "+" : "") + U.formatPercent(comparison.expenseDelta, 1) + " vs période précédente"
            : "Aucune comparaison disponible";

        const incomeSub = comparison && comparison.incomeDelta !== null
            ? (comparison.incomeDelta >= 0 ? "+" : "") + U.formatPercent(comparison.incomeDelta, 1) + " vs période précédente"
            : "Aucune comparaison disponible";

        const cards = [
            statCard("Revenus", U.formatCurrency(stats.income), { cls: "pos", sub: stats.incomeCount + " entrée" + (stats.incomeCount > 1 ? "s" : "") }),
            statCard("Dépenses", U.formatCurrency(stats.expense), { cls: "neg", sub: stats.expenseCount + " dépense" + (stats.expenseCount > 1 ? "s" : "") }),
            statCard("Solde", U.formatCurrency(stats.savings), { cls: stats.savings >= 0 ? "pos" : "neg", sub: incomeSub }),
            statCard("Épargne", U.formatCurrency(stats.savings), { sub: "Revenus − dépenses" }),
            statCard("Taux d'épargne", U.formatPercent(stats.savingsRate / 100, 1), { sub: "Part des revenus conservée" }),
            statCard("Dépense moyenne / jour", U.formatCurrency(stats.averageDaily), { sub: stats.activeDays + " jour" + (stats.activeDays > 1 ? "s" : "") + " avec dépenses" }),
            statCard("Catégorie principale", stats.topCategory ? stats.topCategory.category : "—", {
                sub: stats.topCategory ? U.formatCurrency(stats.topCategory.total) + " · " + Math.round(stats.topCategory.share * 100) + " % du total" : "Aucune dépense sur la période"
            }),
            statCard("Jour de dépense maximum", stats.highestDay ? U.formatDate(stats.highestDay.date, { short: true }) : "—", {
                sub: stats.highestDay ? U.formatCurrency(stats.highestDay.total) + (stats.highestWeekday ? " · " + U.capitalize(stats.highestWeekday.day) : "") : "—"
            }),
            statCard("Dépense la plus élevée", stats.largestExpense ? U.formatCurrency(stats.largestExpense.amount) : "—", {
                sub: stats.largestExpense ? U.capitalize(stats.largestExpense.description || stats.largestExpense.category) + " · " + U.formatDate(stats.largestExpense.date, { short: true }) : "—"
            }),
            statCard("Dépense moyenne / transaction", U.formatCurrency(stats.averagePerTransaction), {
                sub: stats.expenseCount + " transaction" + (stats.expenseCount > 1 ? "s" : "")
            }),
            statCard("Revenu moyen", U.formatCurrency(stats.averageIncome), {
                sub: stats.incomeCount ? "sur " + stats.incomeCount + " entrée" + (stats.incomeCount > 1 ? "s" : "") : "Aucun revenu"
            }),
            statCard("Revenus vs Dépenses", stats.expense > 0 && stats.income > 0 ? U.formatPercent(stats.expense / stats.income, 0) : "—", {
                sub: "Part des revenus consommée"
            })
        ];

        cards.forEach(function (card) { host.appendChild(card); });

        /* Petite phrase d'analyse neutre */
        const summary = U.el("div", { class: "alert info" });
        let message;
        if (!stats.expense && !stats.income) {
            message = { title: "Pas encore de données sur cette période", text: "Ajoutez des transactions ou choisissez une autre période pour voir votre analyse." };
        } else if (stats.savingsRate >= 20) {
            message = { title: "Vous conservez " + U.formatPercent(stats.savingsRate / 100, 1) + " de vos revenus", text: "C'est un bon rythme. Ces " + U.formatCurrency(stats.savings) + " peuvent servir d'épargne de précaution ou d'investissement." };
        } else if (stats.savingsRate >= 0) {
            message = { title: "Votre solde de période est positif", text: "Vous conservez " + U.formatCurrency(stats.savings) + " (" + U.formatPercent(stats.savingsRate / 100, 1) + " de vos revenus). Observer " + (stats.topCategory ? stats.topCategory.category.toLowerCase() : "vos postes principaux") + " est souvent le levier le plus simple." };
        } else {
            message = { title: "Vos dépenses dépassent vos revenus de " + U.formatCurrency(Math.abs(stats.savings)), text: "Ce n'est qu'une photo de la période : comparez avec la période précédente pour voir la tendance, sans jugement." };
        }

        summary.appendChild(U.el("span", { class: "alert-ico", text: "🧭", attrs: { "aria-hidden": "true" } }));
        summary.appendChild(U.el("div", {}, [
            U.el("div", { class: "alert-title", text: message.title }),
            U.el("div", { class: "muted", text: message.text })
        ]));
        host.appendChild(U.el("div", { style: { gridColumn: "1 / -1" } }, [summary]));
    }

    /** §33 — Mes principales dépenses : catégories triées par montant décroissant. */
    /** Transactions de la période analysée (dépenses + revenus). */
    function periodTransactions(range) {
        const from = range.from, to = range.to;
        return data.getAllTransactions().filter(function (item) {
            if (from && item.date < from) return false;
            if (to && item.date > to) return false;
            return true;
        });
    }

    /**
     * Répartition détaillée par moyen de paiement sur la période analysée :
     * chaque ligne affiche le total de la méthode et sa part.
     */
    function renderPayments(stats, range) {
        const host = U.qs("#analysisPayments");
        if (!host || !global.FT.payments) return;
        U.clear(host);

        const list = periodTransactions(range);
        global.FT.payments.renderSummary(host, list, {
            title: "Détail par moyen de paiement",
            onSelect: function (method) {
                global.FT.tx.applyExternalFilters({ paymentMethod: method, period: "all" });
                U.toast("Transactions " + method, "info", "Ouvertes dans la page Transactions.");
            }
        });
    }

    function renderTopCategories(stats) {
        const host = U.qs("#analysisTopCategories");
        if (!host) return;
        U.clear(host);

        if (!stats.byCategory.length) {
            host.appendChild(U.el("div", { class: "empty", style: { padding: "24px 8px" } }, [
                U.el("div", { class: "empty-ico", text: "🏆", attrs: { "aria-hidden": "true" } }),
                U.el("p", { text: "Aucune dépense sur la période sélectionnée." })
            ]));
            return;
        }

        const max = stats.byCategory[0].total || 1;
        const list = U.el("div", { class: "cat-list" });

        stats.byCategory.forEach(function (group, index) {
            const rank = U.el("span", { class: "rank-no" + (index === 0 ? " gold" : ""), text: String(index + 1) });
            list.appendChild(U.el("div", { class: "cat-row" }, [
                U.el("div", { class: "cr-name" }, [
                    rank,
                    U.el("span", { class: "cat-emoji", text: U.categoryEmoji(group.category), attrs: { "aria-hidden": "true" } }),
                    U.el("span", { text: group.category }),
                    U.el("span", { class: "tag", text: group.count + " op." })
                ]),
                U.el("div", { class: "cr-value" }, [
                    U.el("span", { text: U.formatCurrency(group.total) }),
                    U.el("span", { class: "muted", style: { fontSize: "var(--fs-sm)", marginLeft: "6px" }, text: Math.round(group.share * 100) + " %" })
                ]),
                U.el("div", { class: "cr-share" }, [
                    U.el("div", { class: "progress thin" }, [
                        U.el("div", {
                            class: "progress-bar",
                            style: {
                                width: Math.max(3, Math.round((group.total / max) * 100)) + "%",
                                background: "linear-gradient(90deg, " + U.categoryColor(group.category) + ", " + U.categoryColor(group.category) + "b3)"
                            }
                        })
                    ])
                ])
            ]));
        });

        host.appendChild(list);

        if (stats.topCategory) {
            host.appendChild(U.el("p", {
                class: "muted",
                style: { fontSize: "0.84rem", marginTop: "14px" },
                text: "À retenir : " + stats.topCategory.category + " pèse " + Math.round(stats.topCategory.share * 100) + " % de vos dépenses sur la période."
            }));
        }
    }

    /** Comparaison par catégorie avec la période précédente. */
    function renderComparison(comparison) {
        const host = U.qs("#analysisComparison");
        if (!host) return;
        U.clear(host);

        if (!comparison) {
            host.appendChild(U.el("p", { class: "muted", text: "Pas assez d'historique pour comparer avec la période précédente." }));
            return;
        }

        const moves = comparison.categoryMoves.filter(function (m) { return Math.abs(m.delta) > 0.05; }).slice(0, 6);
        if (!moves.length) {
            host.appendChild(U.el("p", { class: "muted", text: "Vos dépenses par catégorie sont stables par rapport à la période précédente." }));
            return;
        }

        const list = U.el("div", { class: "stack", style: { gap: "10px" } });
        moves.forEach(function (move) {
            const up = move.delta > 0;
            const pct = move.delta * 100;
            list.appendChild(U.el("div", { class: "row-between" }, [
                U.el("div", { class: "row", style: { gap: "10px", minWidth: "0" } }, [
                    U.el("span", { class: "cat-emoji", text: U.categoryEmoji(move.category), attrs: { "aria-hidden": "true" } }),
                    U.el("div", { style: { minWidth: "0" } }, [
                        U.el("div", { style: { fontWeight: "650", fontSize: "0.9rem" }, text: move.category }),
                        U.el("div", { class: "muted", style: { fontSize: "var(--fs-sm)" }, text: "avant : " + U.formatCurrency(move.previousTotal) })
                    ])
                ]),
                U.el("div", { style: { textAlign: "right" } }, [
                    U.el("div", { style: { fontWeight: "750" }, text: U.formatCurrency(move.total) }),
                    U.el("div", { class: up ? "neg" : "pos", style: { fontSize: "var(--fs-sm)", fontWeight: "700" }, text: (up ? "▲ +" : "▼ ") + U.formatPercent(Math.abs(pct) / 100, 0) })
                ])
            ]));
        });
        host.appendChild(list);
        host.appendChild(U.el("p", { class: "muted", style: { fontSize: "var(--fs-sm)", marginTop: "12px" },
            text: "Comparaison avec la période précédente équivalente : " + (comparison.range.from ? U.formatDate(comparison.range.from, { short: true }) + " → " + U.formatDate(comparison.range.to, { short: true }) : "—") + "." }));
    }

    /** Jauge d'épargne visuelle (SVG sans dépendance). */
    function renderGauge(stats) {
        const host = U.qs("#analysisGauge");
        if (!host) return;
        U.clear(host);

        const ratio = Math.max(-1, Math.min(1, stats.savingsRate / 100));
        const radius = 52;
        const circumference = 2 * Math.PI * radius;
        const positiveRatio = Math.max(0, ratio);
        const dash = circumference * positiveRatio;

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("width", "140");
        svg.setAttribute("height", "140");
        svg.setAttribute("viewBox", "0 0 140 140");
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", "Taux d'épargne : " + U.formatPercent(ratio, 1));

        const track = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        track.setAttribute("cx", "70"); track.setAttribute("cy", "70"); track.setAttribute("r", String(radius));
        track.setAttribute("fill", "none"); track.setAttribute("stroke-width", "12");
        track.setAttribute("class", "gauge-track");

        const value = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        value.setAttribute("cx", "70"); value.setAttribute("cy", "70"); value.setAttribute("r", String(radius));
        value.setAttribute("fill", "none"); value.setAttribute("stroke-width", "12");
        value.setAttribute("class", "gauge-val");
        value.setAttribute("stroke-dasharray", dash + " " + circumference);
        value.setAttribute("stroke", stats.savingsRate < 0 ? "var(--earth)" : (stats.savingsRate >= 20 ? "var(--success)" : "var(--secondary)"));

        svg.appendChild(track);
        svg.appendChild(value);

        const label = U.el("div", { class: "gauge-label", text: stats.savingsRate >= 0 ? "Taux d'épargne" : "Déficit de la période" });
        const valueLabel = U.el("div", { style: { fontSize: "1.35rem", fontWeight: "800", letterSpacing: "-0.02em" }, text: U.formatPercent(ratio, 1) });

        host.appendChild(U.el("div", { class: "gauge" }, [svg, valueLabel, label]));
        host.appendChild(U.el("p", {
            class: "muted",
            style: { fontSize: "0.84rem", textAlign: "center", marginTop: "10px" },
            text: stats.income > 0
                ? "Sur " + U.formatCurrency(stats.income) + " de revenus, vous avez conservé " + U.formatCurrency(stats.savings) + "."
                : "Ajoutez un revenu sur la période pour calculer un taux d'épargne."
        }));
    }

    /* ======================================================================
       4. POINT D'ENTRÉE
       ====================================================================== */

    function buildPeriodSelector() {
        const host = U.qs("#analysisPeriod");
        if (!host) return;
        U.clear(host);

        const seg = U.el("div", { class: "segmented", attrs: { role: "tablist", "aria-label": "Période d'analyse" } });
        PERIODS.forEach(function (p) {
            seg.appendChild(U.el("button", {
                type: "button", text: p.label, class: state.period === p.id ? "is-active" : "",
                attrs: { role: "tab", "aria-selected": state.period === p.id ? "true" : "false" },
                on: {
                    click: function () { state.period = p.id; buildPeriodSelector(); refresh(); }
                }
            }));
        });
        host.appendChild(seg);

        if (state.period === "custom") {
            host.appendChild(U.el("div", { class: "row", style: { gap: "8px", marginTop: "10px" } }, [
                U.el("div", { class: "field grow" }, [
                    U.el("label", { for: "anFrom", text: "Du" }),
                    U.el("input", { class: "input", type: "date", id: "anFrom", value: state.customFrom,
                        on: { change: function (e) { state.customFrom = e.target.value; refresh(); } } })
                ]),
                U.el("div", { class: "field grow" }, [
                    U.el("label", { for: "anTo", text: "Au" }),
                    U.el("input", { class: "input", type: "date", id: "anTo", value: state.customTo,
                        on: { change: function (e) { state.customTo = e.target.value; refresh(); } } })
                ])
            ]));
        }
    }

    function refresh() {
        const range = resolvePeriod(state.period, state.customFrom, state.customTo);
        const stats = computeAnalysis(range);
        const comparison = computeComparison(range);

        U.setText("#analysisPeriodLabel", "Période analysée : " + range.label +
            (range.from ? " (" + U.formatDate(range.from, { short: true }) + " → " + U.formatDate(range.to || U.todayISO(), { short: true }) + ")" : ""));

        renderStats(stats, comparison);
        renderTopCategories(stats);
        renderPayments(stats, range);
        renderComparison(comparison);
        renderGauge(stats);
        renderInsights(stats, range);

        if (global.FT.charts && global.FT.charts.isAvailable()) {
            const trendCanvas = U.qs("#chartTrend30");
            if (trendCanvas) {
                global.FT.charts.clearEmptyOverlay(trendCanvas);
                const days = range.from && range.to
                    ? Math.max(7, Math.min(90, Math.round((U.fromISODate(range.to) - U.fromISODate(range.from)) / 86400000) + 1))
                    : 30;
                global.FT.charts.renderTrendLine("#chartTrend30", { days: days, endDate: range.to || U.todayISO() });
            }
            const compareCanvas = U.qs("#chartMonthlyCompare");
            if (compareCanvas) {
                global.FT.charts.clearEmptyOverlay(compareCanvas);
                global.FT.charts.renderIncomeExpenseBars("#chartMonthlyCompare", { months: state.period === "year" ? 12 : 6 });
            }
            const catCanvas = U.qs("#chartCategoryBars");
            if (catCanvas) {
                global.FT.charts.clearEmptyOverlay(catCanvas);
                global.FT.charts.renderCategoryBars("#chartCategoryBars", {
                    groups: global.FT.expenses.getExpensesByCategory(stats.expenses)
                });
            }
            const payCanvas = U.qs("#chartPaymentBars");
            if (payCanvas) {
                global.FT.charts.clearEmptyOverlay(payCanvas);
                /* Toutes les transactions de la période (dépenses ET revenus),
                   réparties par moyen de paiement. */
                global.FT.charts.renderPaymentBars("#chartPaymentBars", {
                    list: stats.transactions || periodTransactions(range)
                });
            }
        }
    }

    /** Conseils simples et non culpabilisants (§31 esprit). */
    function renderInsights(stats, range) {
        const host = U.qs("#analysisInsights");
        if (!host) return;
        U.clear(host);

        const tips = [];

        if (stats.topCategory && stats.topCategory.share > 0.35) {
            tips.push({
                ico: U.categoryEmoji(stats.topCategory.category),
                title: stats.topCategory.category + " concentre " + Math.round(stats.topCategory.share * 100) + " % de vos dépenses",
                text: "C'est votre poste le plus important sur la période. Suivre son évolution mois après mois suffit souvent à reprendre la main."
            });
        }
        if (stats.highestWeekday && stats.expense > 0) {
            tips.push({
                ico: "📅",
                title: U.capitalize(stats.highestWeekday.day) + " est votre jour le plus dépensier",
                text: "Vous y dépensez en moyenne " + U.formatCurrency(stats.highestWeekday.total / Math.max(1, stats.activeDays / 7)) + ". Anticiper ce jour peut lisser votre budget."
            });
        }
        if (stats.averageDaily > 0 && stats.periodDays >= 7) {
            tips.push({
                ico: "🧮",
                title: "Rythme moyen : " + U.formatCurrency(stats.averageDaily) + " par jour",
                text: "Sur " + stats.periodDays + " jours, cela représente environ " + U.formatCurrency(stats.averageDaily * 30) + " par mois si le rythme reste identique."
            });
        }
        if (stats.expenseCount > 0 && stats.averagePerTransaction > 0) {
            tips.push({
                ico: "🧾",
                title: "Panier moyen de " + U.formatCurrency(stats.averagePerTransaction),
                text: "Réparti sur " + stats.expenseCount + " transactions. Les petites dépenses fréquentes pèsent vite : les regrouper par catégorie rend le tout plus lisible."
            });
        }
        /* Repère local : le transport est le premier poste caché à Abidjan.
           On le traduit en trajets concrets plutôt qu'en chiffre abstrait. */
        const transport = (stats.byCategory || []).filter(function (row) { return row.category === "Transport"; })[0];
        if (transport && transport.total > 0 && U.LOCAL_CONTEXT) {
            const unit = U.LOCAL_CONTEXT.priceRefs.gbaka || 500;
            const trips = Math.round(transport.total / unit);
            if (trips >= 2) {
                tips.push({
                    ico: "🚌",
                    title: "Transport : " + U.formatCurrency(transport.total) + " sur la période",
                    text: "Soit environ " + trips + " trajets en gbaka (à " + U.formatCurrency(unit) + "). Les wôrô-wôrô et gbaka se cumulent vite : les noter chaque jour évite les mauvaises surprises en fin de mois."
                });
            }
        }
        if (stats.income > 0 && stats.incomeCount === 1) {
            tips.push({
                ico: "📥",
                title: "Un seul revenu sur la période",
                text: "Enregistrer chaque entrée d'argent (vente, freelance, cadeau) rend le solde et le taux d'épargne beaucoup plus justes."
            });
        }
        if (!tips.length) {
            tips.push({
                ico: "🌱",
                title: "Encore un peu de données et l'analyse s'affinera",
                text: "Ajoutez quelques transactions pour faire apparaître vos tendances, votre jour le plus dépensier et votre panier moyen."
            });
        }

        const list = U.el("div", { class: "stack", style: { gap: "10px" } });
        tips.slice(0, 5).forEach(function (tip) {
            list.appendChild(U.el("div", { class: "alert info" }, [
                U.el("span", { class: "alert-ico", text: tip.ico, attrs: { "aria-hidden": "true" } }),
                U.el("div", {}, [
                    U.el("div", { class: "alert-title", text: tip.title }),
                    U.el("div", { class: "muted", text: tip.text })
                ])
            ]));
        });
        host.appendChild(list);
    }

    function initAnalysisPage() {
        const page = U.qs('[data-page="analysis"]');
        if (!page) return;
        buildPeriodSelector();
        refresh();
        U.bus.on("data:changed", U.debounce(refresh, 60));
    }

    /* ======================================================================
       5. EXPORTS
       ====================================================================== */
    global.FT.analysis = {
        resolvePeriod: resolvePeriod,
        computeAnalysis: computeAnalysis,
        computeComparison: computeComparison,
        initAnalysisPage: initAnalysisPage,
        refresh: refresh,
        getState: function () { return state; }
    };
})(window);
