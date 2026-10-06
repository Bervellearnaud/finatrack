/* ==========================================================================
   FinaTrack CI — transactions.js
   Vue unifiée dépenses + revenus : recherche (§25), filtres combinables (§26),
   modification (§27), suppression (§28), statistiques globales.
   ========================================================================== */
(function (global) {
    "use strict";

    const U = global.FT.utils;
    const data = global.FT.data;
    const EXP = global.FT.expenses;
    const INC = global.FT.incomes;

    /* ======================================================================
       1. STATISTIQUES GLOBALES
       ====================================================================== */

    /**
     * Solde disponible = total revenus - total dépenses (§8).
     * @param {string} [month] clé "AAAA-MM" (optionnelle : sinon tout l'historique)
     */
    function calculateBalance(month) {
        return U.round2(calculateTotalIncome(month) - calculateTotalExpense(month));
    }

    function calculateTotalIncome(month) {
        return month
            ? INC.calculateMonthlyIncomes(month)
            : INC.calculateIncomesTotal();
    }

    function calculateTotalExpense(month) {
        return month
            ? EXP.calculateMonthlyExpenses(month)
            : EXP.calculateExpensesTotal();
    }

    /** Épargne = revenus - dépenses (§32) */
    function calculateSavings(month) {
        return U.round2(calculateTotalIncome(month) - calculateTotalExpense(month));
    }

    /** Taux d'épargne = ((revenus - dépenses) / revenus) * 100 (§32) */
    function calculateSavingsRate(month) {
        const income = calculateTotalIncome(month);
        if (income <= 0) return 0;
        return U.round2(((income - calculateTotalExpense(month)) / income) * 100);
    }

    /** Statistiques complètes d'une période — utilisées par Dashboard & Analyse. */
    function getPeriodStats(range) {
        const opts = range || {};
        const expenses = opts.expenses || filterExpensesInRange(opts.from, opts.to);
        const incomes = opts.incomes || filterIncomesInRange(opts.from, opts.to);

        const income = EXP.sum(incomes);
        const expense = EXP.sum(expenses);
        const savings = U.round2(income - expense);
        const rate = income > 0 ? U.round2((savings / income) * 100) : 0;
        const byCategory = EXP.getExpensesByCategory(expenses);

        return {
            from: opts.from || null,
            to: opts.to || null,
            income: income,
            expense: expense,
            balance: savings,
            savings: savings,
            savingsRate: rate,
            transactionCount: expenses.length + incomes.length,
            expenseCount: expenses.length,
            incomeCount: incomes.length,
            byCategory: byCategory,
            topCategory: byCategory[0] || null,
            averageDaily: EXP.getAverageDailyExpense(expenses),
            highestDay: EXP.getHighestSpendingDay(expenses),
            highestWeekday: EXP.getHighestSpendingWeekday(expenses),
            largestExpense: EXP.getLargestExpense(expenses),
            activeDays: EXP.countActiveDays(expenses)
        };
    }

    function filterExpensesInRange(from, to) {
        return data.getExpenses().filter(function (e) {
            return (!from || e.date >= from) && (!to || e.date <= to);
        });
    }

    function filterIncomesInRange(from, to) {
        return data.getIncomes().filter(function (i) {
            return (!from || i.date >= from) && (!to || i.date <= to);
        });
    }

    /* ======================================================================
       2. PÉRIODES & FILTRES (§26)
       ====================================================================== */

    const PERIODS = [
        { id: "all", label: "Tout l'historique" },
        { id: "today", label: "Aujourd'hui" },
        { id: "week", label: "Cette semaine" },
        { id: "month", label: "Ce mois" },
        { id: "prev-month", label: "Mois précédent" },
        { id: "last-30", label: "30 derniers jours" },
        { id: "custom", label: "Personnalisée" }
    ];

    /** Renvoie l'intervalle {from,to} correspondant à un identifiant de période. */
    function resolvePeriod(period, customFrom, customTo) {
        const today = U.todayISO();
        switch (period) {
            case "today":
                return { from: today, to: today };
            case "week":
                return { from: U.toISODate(U.startOfWeek(new Date())), to: today };
            case "month":
                return { from: U.toISODate(U.startOfMonth(new Date())), to: U.toISODate(U.endOfMonth(new Date())) };
            case "prev-month": {
                const d = new Date();
                d.setDate(1);
                d.setMonth(d.getMonth() - 1);
                return { from: U.toISODate(U.startOfMonth(d)), to: U.toISODate(U.endOfMonth(d)) };
            }
            case "last-30":
                return { from: U.toISODate(U.addDays(new Date(), -29)), to: today };
            case "custom":
                return { from: customFrom || null, to: customTo || null };
            default:
                return { from: null, to: null };
        }
    }

    const DEFAULT_FILTERS = {
        search: "",
        type: "all",          // all | expense | income
        category: "all",
        paymentMethod: "all",
        /* Rangement de la liste : par date (défaut) ou par moyen de paiement */
        groupBy: "date",
        period: "all",
        customFrom: "",
        customTo: "",
        minAmount: "",
        maxAmount: "",
        sort: "date-desc"
    };

    function sanitizeFilters(filters) {
        return Object.assign({}, DEFAULT_FILTERS, filters || {});
    }

    /** Recherche plein texte (§25) : description, catégorie, source, mode de paiement, date. */
    function searchTransactions(list, query) {
        const q = String(query || "").trim().toLowerCase();
        if (!q) return list;
        const normalized = q.replace(/\u202f|\u00a0/g, " ");
        return list.filter(function (item) {
            const haystack = [
                item.description,
                item.category,
                item.source,
                item.paymentMethod,
                U.formatDate(item.date),
                U.formatDate(item.date, { short: true }),
                item.amount,
                U.formatNumber(item.amount)
            ].join(" ").toLowerCase();
            return haystack.indexOf(normalized) !== -1;
        });
    }

    /**
     * Applique l'ensemble des filtres à une liste de transactions (§26).
     * Les filtres sont combinables.
     */
    function filterTransactions(list, filters) {
        const f = sanitizeFilters(filters);
        let result = (list || []).slice();

        // Type
        if (f.type !== "all") {
            const wanted = f.type === "income" ? "income" : "expense";
            result = result.filter(function (item) { return item.type === wanted; });
        }

        // Période
        if (f.period && f.period !== "all") {
            const range = resolvePeriod(f.period, f.customFrom, f.customTo);
            if (range.from) result = result.filter(function (i) { return i.date >= range.from; });
            if (range.to) result = result.filter(function (i) { return i.date <= range.to; });
        }

        // Catégorie (les revenus ont la catégorie « Revenus »)
        if (f.category && f.category !== "all") {
            result = result.filter(function (i) { return (i.category || "") === f.category; });
        }

        // Mode de paiement
        if (f.paymentMethod && f.paymentMethod !== "all") {
            result = result.filter(function (i) { return i.paymentMethod === f.paymentMethod; });
        }

        // Montants
        const min = f.minAmount === "" ? null : U.parseAmountInput(f.minAmount);
        const max = f.maxAmount === "" ? null : U.parseAmountInput(f.maxAmount);
        if (min !== null) result = result.filter(function (i) { return i.amount >= min; });
        if (max !== null && max > 0) result = result.filter(function (i) { return i.amount <= max; });

        // Recherche
        result = searchTransactions(result, f.search);

        // Tri
        switch (f.sort) {
            case "date-asc":
                result.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
                break;
            case "amount-desc":
                result.sort(function (a, b) { return b.amount - a.amount; });
                break;
            case "amount-asc":
                result.sort(function (a, b) { return a.amount - b.amount; });
                break;
            default:
                result.sort(function (a, b) {
                    if (a.date === b.date) return String(b.createdAt).localeCompare(String(a.createdAt));
                    return a.date < b.date ? 1 : -1;
                });
        }
        return result;
    }

    /** Compte les filtres actifs (pour l'indicateur visuel). */
    function countActiveFilters(filters) {
        const f = sanitizeFilters(filters);
        let n = 0;
        if (f.search) n++;
        if (f.type !== "all") n++;
        if (f.category !== "all") n++;
        if (f.paymentMethod !== "all") n++;
        if (f.period !== "all") n++;
        if (f.minAmount !== "") n++;
        if (f.maxAmount !== "") n++;
        return n;
    }

    /* ======================================================================
       3. SUPPRESSION UNIFIÉE (§28)
       ====================================================================== */

    /**
     * Supprime une transaction après confirmation.
     * @param {Object} transaction - enregistrement complet (avec .type et .id)
     * @returns {Promise<boolean>}
     */
    function deleteTransaction(transaction) {
        if (!transaction || !transaction.id) return Promise.resolve(false);

        const isIncome = transaction.type === "income";
        return U.confirmDialog({
            title: "Supprimer cette transaction ?",
            message: isIncome
                ? "Ce revenu sera retiré de votre historique. Cette action est définitive."
                : "Cette dépense sera retirée de votre historique. Cette action est définitive.",
            confirmLabel: "Supprimer",
            cancelLabel: "Annuler",
            details: {
                title: U.capitalize(transaction.description || (isIncome ? transaction.source : transaction.category)),
                subtitle: U.formatDate(transaction.date, { short: true }) + " · " + (isIncome ? "Revenu" : (transaction.category || "Dépense")),
                amount: (isIncome ? "+" : "-") + U.formatCurrency(transaction.amount)
            }
        }).then(function (confirmed) {
            if (!confirmed) return false;

            const result = isIncome
                ? INC.deleteIncome(transaction.id)
                : EXP.deleteExpense(transaction.id);

            if (result.ok) {
                U.bus.emit("transaction:deleted", transaction);
                U.toast("Transaction supprimée", "success", (isIncome ? "+" : "-") + U.formatCurrency(transaction.amount));
            } else {
                U.toast("Suppression impossible", "error", result.errors && result.errors.global);
            }
            return result.ok;
        });
    }

    /** Ouvre le formulaire prérempli pour modification (§27). */
    function editTransaction(transaction) {
        if (!transaction) return;
        if (transaction.type === "income") global.FT.app.openIncomeForm(transaction);
        else global.FT.app.openExpenseForm(transaction);
    }

    /* ======================================================================
       4. RENDU DES LIGNES DE TRANSACTION
       ====================================================================== */

    /**
     * Construit la ligne DOM d'une transaction (sûr : textContent partout).
     * @param {Object} item
     * @param {{compact?: boolean}} [options]
     */
    function buildTransactionRow(item, options) {
        const opts = options || {};
        const isIncome = item.type === "income";
        const emoji = isIncome
            ? U.sourceEmoji(item.source)
            : U.categoryEmoji(item.category);
        const title = item.description || (isIncome ? item.source : item.category);

        const meta = [
            U.el("span", { class: "tag " + (isIncome ? "income" : "expense"), text: isIncome ? (item.source || "Autre") : (item.category || "Autres") }),
            U.el("span", { text: U.formatRelativeDate(item.date) })
        ];
        /* Le moyen de paiement est toujours affiché sous forme de pastille
           colorée : on voit d'un coup d'œil avec quoi la dépense a été payée. */
        meta.push(U.paymentBadge(item.paymentMethod, { size: "sm" }));
        if (item.source === "voice" || item.origin === "voice") {
            meta.push(U.el("span", { class: "tag", text: "🎙️ Voix" }));
        }

        const actions = [];
        if (!opts.compact) {
            actions.push(U.el("button", {
                class: "icon-btn sm", type: "button", text: "✏️",
                attrs: { "aria-label": "Modifier : " + title, title: "Modifier" },
                on: { click: function (e) { e.stopPropagation(); editTransaction(item); } }
            }));
        }
        actions.push(U.el("button", {
            class: "icon-btn sm danger", type: "button", text: "🗑️",
            attrs: { "aria-label": "Supprimer : " + title, title: "Supprimer" },
            on: { click: function (e) { e.stopPropagation(); deleteTransaction(item); } }
        }));

        const row = U.el("div", {
            class: "tx" + (opts.compact ? " is-compact" : ""), dataset: { id: item.id, type: item.type },
            attrs: {
                tabindex: opts.compact ? null : "0",
                role: opts.compact ? null : "button",
                "aria-label": title + " " + (isIncome ? "plus " : "moins ") + U.formatCurrency(item.amount) +
                    " · payé avec " + (item.paymentMethod || "moyen non précisé") +
                    (opts.compact ? "" : " · appuyez pour modifier")
            },
            on: {
                /* Sur téléphone, la ligne entière ouvre le formulaire : plus besoin
                   de viser le petit crayon, et la colonne d'actions s'allège. */
                click: function () {
                    if (!opts.compact) editTransaction(item);
                },
                keydown: function (e) {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); editTransaction(item); }
                }
            }
        }, [
            U.el("div", { class: "tx-ico" + (isIncome ? " is-income" : ""), text: emoji, attrs: { "aria-hidden": "true" } }),
            U.el("div", { class: "tx-main" }, [
                U.el("div", { class: "tx-title", text: title }),
                U.el("div", { class: "tx-meta" }, meta)
            ]),
            U.el("div", {}, [
                U.el("div", { class: "tx-amount" + (isIncome ? " is-income" : ""), text: (isIncome ? "+" : "-") + U.formatCurrency(item.amount) }),
                U.el("div", { class: "tx-actions" }, actions)
            ])
        ]);

        return row;
    }

    /** Ligne de tableau (desktop / tablette). */
    function buildTransactionTableRow(item) {
        const isIncome = item.type === "income";
        const title = item.description || (isIncome ? item.source : item.category);

        return U.el("tr", { dataset: { id: item.id, type: item.type } }, [
            U.el("td", { class: "nowrap", text: U.formatDate(item.date, { numeric: true }) }),
            U.el("td", {}, [
                U.el("div", { style: { fontWeight: "600" }, text: title }),
                U.el("div", { class: "muted", style: { fontSize: "var(--fs-sm)" }, text: isIncome ? U.sourceEmoji(item.source) + " " + (item.source || "Autre") : U.categoryEmoji(item.category) + " " + (item.category || "Autres") })
            ]),
            U.el("td", { class: "nowrap" }, [U.paymentBadge(item.paymentMethod, { size: "sm" })]),
            U.el("td", { class: "ta" + (isIncome ? " pos" : "") , text: (isIncome ? "+" : "-") + U.formatCurrency(item.amount) }),
            U.el("td", { class: "tc" }, [
                U.el("button", {
                    class: "icon-btn sm", type: "button", text: "✏️",
                    attrs: { "aria-label": "Modifier " + title, title: "Modifier" },
                    on: { click: function () { editTransaction(item); } }
                }),
                U.el("button", {
                    class: "icon-btn sm danger", type: "button", text: "🗑️",
                    attrs: { "aria-label": "Supprimer " + title, title: "Supprimer" },
                    on: { click: function () { deleteTransaction(item); } }
                })
            ])
        ]);
    }

    /** Groupe une liste par date (décroissante) et renvoie les nœuds prêts à insérer. */
    function buildGroupedList(list, options) {
        const opts = options || {};
        const fragment = document.createDocumentFragment();

        /* Rangement par moyen de paiement : un bandeau par méthode, avec le
           nombre de transactions et le total de la méthode. */
        if ((opts.groupBy || state.groupBy) === "payment" && global.FT.payments) {
            global.FT.payments.groupByPayment(list).forEach(function (group) {
                fragment.appendChild(global.FT.payments.buildGroupLabel(group));
                group.items.forEach(function (item) {
                    fragment.appendChild(buildTransactionRow(item, opts));
                });
            });
            return fragment;
        }

        let lastDate = null;
        list.forEach(function (item) {
            if (item.date !== lastDate) {
                lastDate = item.date;
                fragment.appendChild(U.el("div", { class: "tx-group-label", text: U.formatRelativeDate(item.date) + " · " + U.formatDate(item.date, { short: true }) }));
            }
            fragment.appendChild(buildTransactionRow(item, opts));
        });
        return fragment;
    }

    /* ======================================================================
       5. PAGE « MES TRANSACTIONS »
       ====================================================================== */

    const state = sanitizeFilters({});

    function buildToolbar() {
        const host = U.qs("#txFilters");
        if (!host) return;
        const wrap = U.clear(host);

        /* Recherche instantanée */
        const search = U.el("div", { class: "search-box toolbar-full" }, [
            U.el("span", { class: "search-ico", text: "🔍", attrs: { "aria-hidden": "true" } }),
            U.el("input", {
                class: "input", type: "search", id: "txSearch", value: state.search,
                placeholder: "Rechercher une transaction…",
                attrs: { "aria-label": "Rechercher une transaction" },
                on: {
                    input: U.debounce(function (e) {
                        state.search = e.target.value;
                        refresh();
                    }, 160)
                }
            }),
            state.search ? U.el("button", {
                class: "icon-btn sm clear-btn", type: "button", text: "✕",
                attrs: { "aria-label": "Effacer la recherche" },
                on: { click: function () { state.search = ""; buildToolbar(); refresh(); } }
            }) : null
        ]);

        /* Type */
        const typeSeg = U.el("div", { class: "segmented", attrs: { role: "tablist", "aria-label": "Type de transaction" } });
        [["all", "Tous"], ["expense", "Dépenses"], ["income", "Revenus"]].forEach(function (opt) {
            typeSeg.appendChild(U.el("button", {
                type: "button", text: opt[1], class: state.type === opt[0] ? "is-active" : "",
                attrs: { role: "tab", "aria-selected": state.type === opt[0] ? "true" : "false" },
                on: { click: function () { state.type = opt[0]; buildToolbar(); refresh(); } }
            }));
        });

        /* Période */
        const periodSeg = U.el("div", { class: "segmented", attrs: { role: "tablist", "aria-label": "Période" } });
        PERIODS.filter(function (p) { return p.id !== "custom"; }).forEach(function (p) {
            periodSeg.appendChild(U.el("button", {
                type: "button", text: p.label, class: state.period === p.id ? "is-active" : "",
                attrs: { role: "tab", "aria-selected": state.period === p.id ? "true" : "false" },
                on: { click: function () { state.period = p.id; buildToolbar(); refresh(); } }
            }));
        });
        periodSeg.appendChild(U.el("button", {
            type: "button", text: "📅 Personnalisée", class: state.period === "custom" ? "is-active" : "",
            on: { click: function () { state.period = "custom"; buildToolbar(); refresh(); } }
        }));

        /* Catégorie */
        const categorySelect = U.el("select", {
            class: "select", attrs: { "aria-label": "Filtrer par catégorie" },
            on: { change: function (e) { state.category = e.target.value; refresh(); } }
        }, [U.el("option", { value: "all", text: "Toutes les catégories" })]
            .concat(U.CATEGORIES.map(function (c) {
                return U.el("option", { value: c, text: U.categoryEmoji(c) + " " + c, selected: state.category === c });
            }))
            .concat([U.el("option", { value: "Revenus", text: "💰 Revenus", selected: state.category === "Revenus" })]));

        /* Mode de paiement */
        const methodSelect = U.el("select", {
            class: "select", attrs: { "aria-label": "Filtrer par mode de paiement" },
            on: { change: function (e) { state.paymentMethod = e.target.value; refresh(); } }
        }, [U.el("option", { value: "all", text: "Tous les modes de paiement" })]
            .concat(U.PAYMENT_METHODS.map(function (m) {
                return U.el("option", { value: m, text: U.paymentEmoji(m) + " " + m, selected: state.paymentMethod === m });
            })));

        /* Tri */
        const sortSelect = U.el("select", {
            class: "select", attrs: { "aria-label": "Trier les transactions" },
            on: { change: function (e) { state.sort = e.target.value; refresh(); } }
        }, [
            U.el("option", { value: "date-desc", text: "Plus récentes d'abord", selected: state.sort === "date-desc" }),
            U.el("option", { value: "date-asc", text: "Plus anciennes d'abord", selected: state.sort === "date-asc" }),
            U.el("option", { value: "amount-desc", text: "Montant décroissant", selected: state.sort === "amount-desc" }),
            U.el("option", { value: "amount-asc", text: "Montant croissant", selected: state.sort === "amount-asc" })
        ]);

        /* Rangement de la liste */
        const groupSelect = U.el("select", {
            class: "select", id: "txGroupBy", attrs: { "aria-label": "Ranger les transactions" },
            on: { change: function (e) { state.groupBy = e.target.value; refresh(); } }
        }, [
            U.el("option", { value: "date", text: "📅 Ranger par date", selected: state.groupBy === "date" }),
            U.el("option", { value: "payment", text: "💳 Ranger par moyen de paiement", selected: state.groupBy === "payment" })
        ]);

        /* Montants min / max */
        const amountWrap = U.el("div", { class: "row", style: { gap: "8px" } }, [
            U.el("input", {
                class: "input", type: "number", inputmode: "numeric", min: "0", placeholder: "Montant min",
                value: state.minAmount, attrs: { "aria-label": "Montant minimum" },
                on: { change: function (e) { state.minAmount = e.target.value; refresh(); } }
            }),
            U.el("input", {
                class: "input", type: "number", inputmode: "numeric", min: "0", placeholder: "Montant max",
                value: state.maxAmount, attrs: { "aria-label": "Montant maximum" },
                on: { change: function (e) { state.maxAmount = e.target.value; refresh(); } }
            })
        ]);

        wrap.appendChild(search);
        wrap.appendChild(U.el("div", { class: "toolbar-full stack", style: { gap: "10px" } }, [
            U.el("div", { class: "row wrap", style: { justifyContent: "space-between", gap: "10px" } }, [
                U.el("span", { class: "hint", style: { fontSize: "var(--fs-sm)", color: "var(--text-soft)", fontWeight: "700" }, text: "TYPE" }),
                typeSeg
            ]),
            U.el("div", { class: "row wrap", style: { justifyContent: "space-between", gap: "10px" } }, [
                U.el("span", { class: "hint", style: { fontSize: "var(--fs-sm)", color: "var(--text-soft)", fontWeight: "700" }, text: "PÉRIODE" }),
                periodSeg
            ])
        ]));

        const customRange = U.el("div", { class: "row toolbar-full", style: { gap: "8px" } }, [
            U.el("div", { class: "field grow" }, [
                U.el("label", { for: "txFrom", text: "Du" }),
                U.el("input", {
                    class: "input", type: "date", id: "txFrom", value: state.customFrom,
                    on: { change: function (e) { state.customFrom = e.target.value; refresh(); } }
                })
            ]),
            U.el("div", { class: "field grow" }, [
                U.el("label", { for: "txTo", text: "Au" }),
                U.el("input", {
                    class: "input", type: "date", id: "txTo", value: state.customTo,
                    on: { change: function (e) { state.customTo = e.target.value; refresh(); } }
                })
            ])
        ]);
        if (state.period === "custom") wrap.appendChild(customRange);

        wrap.appendChild(categorySelect);
        wrap.appendChild(methodSelect);
        wrap.appendChild(sortSelect);
        wrap.appendChild(groupSelect);
        wrap.appendChild(amountWrap);

        const activeCount = countActiveFilters(state);
        wrap.appendChild(U.el("div", { class: "row-between toolbar-full", style: { gap: "10px", flexWrap: "wrap" } }, [
            U.el("span", { class: "filter-summary", id: "txFilterSummary" }),
            U.el("div", { class: "btn-row", style: { flex: "0 0 auto" } }, [
                U.el("button", {
                    class: "btn btn-ghost btn-sm", type: "button", text: "↺ Réinitialiser" + (activeCount ? " (" + activeCount + ")" : ""),
                    on: {
                        click: function () {
                            Object.keys(DEFAULT_FILTERS).forEach(function (k) { state[k] = DEFAULT_FILTERS[k]; });
                            buildToolbar(); refresh();
                            U.toast("Filtres réinitialisés", "info");
                        }
                    }
                }),
                U.el("button", {
                    class: "btn btn-ghost btn-sm", type: "button", text: "⬇︎ CSV",
                    attrs: { title: "Exporter les transactions affichées en CSV" },
                    on: { click: exportVisibleToCSV }
                }),
                U.el("button", {
                    class: "btn btn-ghost btn-sm", type: "button", text: "💳 CSV des totaux",
                    attrs: { title: "Exporter les totaux par moyen de paiement" },
                    on: {
                        click: function () {
                            if (global.FT.payments) {
                                global.FT.payments.exportToCSV(filterTransactions(data.getAllTransactions(), state));
                            }
                        }
                    }
                })
            ])
        ]));
    }

    function refresh() {
        const listHost = U.qs("#txList");
        if (!listHost) return;

        const all = data.getAllTransactions();
        const filtered = filterTransactions(all, state);
        const host = U.clear(listHost);

        /* Résumé + totaux de la sélection */
        const summary = U.qs("#txFilterSummary");
        if (summary) {
            const income = EXP.sum(filtered.filter(function (i) { return i.type === "income"; }));
            const expense = EXP.sum(filtered.filter(function (i) { return i.type === "expense"; }));
            summary.textContent = filtered.length + " transaction" + (filtered.length > 1 ? "s" : "") +
                " · Revenus " + U.formatCurrency(income) + " · Dépenses " + U.formatCurrency(expense) +
                " · Solde " + U.formatCurrency(income - expense);
        }

        listHost.dataset.groupBy = state.groupBy;
        const count = U.qs("#txCount");
        if (count) count.textContent = filtered.length + (filtered.length > 1 ? " résultats" : " résultat");

        /* Totaux par moyen de paiement, recalculés sur la sélection courante :
           les filtres (période, catégorie, type…) s'appliquent donc aussi ici. */
        const paymentsHost = U.qs("#txPaymentSummary");
        if (paymentsHost && global.FT.payments) {
            global.FT.payments.renderSummary(paymentsHost, filtered, {
                title: "Totaux par moyen de paiement",
                onSelect: function (method) {
                    state.paymentMethod = method;
                    buildToolbar();
                    refresh();
                    U.toast("Filtré sur " + method, "info", "Retirez le filtre pour tout revoir.");
                }
            });
        }

        if (!all.length) {
            host.appendChild(U.el("div", { class: "empty" }, [
                U.el("div", { class: "empty-ico", text: "💸", attrs: { "aria-hidden": "true" } }),
                U.el("h3", { text: "Aucune transaction pour le moment." }),
                U.el("p", { text: "Commencez à enregistrer vos dépenses pour comprendre où va votre argent." }),
                U.el("div", { class: "btn-row" }, [
                    U.el("button", { class: "btn btn-primary", type: "button", text: "+ Ajouter une dépense", dataset: { action: "add-expense" } }),
                    U.el("button", { class: "btn btn-accent", type: "button", text: "🎙️ Ajouter par la voix", dataset: { action: "voice-add" } })
                ])
            ]));
            return;
        }

        if (!filtered.length) {
            host.appendChild(U.el("div", { class: "empty" }, [
                U.el("div", { class: "empty-ico", text: "🔍", attrs: { "aria-hidden": "true" } }),
                U.el("h3", { text: "Aucun résultat." }),
                U.el("p", { text: "Essayez un autre mot-clé ou élargissez vos filtres." }),
                U.el("button", {
                    class: "btn btn-ghost", type: "button", text: "Réinitialiser les filtres",
                    on: { click: function () { Object.keys(DEFAULT_FILTERS).forEach(function (k) { state[k] = DEFAULT_FILTERS[k]; }); buildToolbar(); refresh(); } }
                })
            ]));
            return;
        }

        /* Vue mobile : liste groupée par jour */
        const grouped = U.el("div", { class: "tx-list" });
        grouped.appendChild(buildGroupedList(filtered));
        host.appendChild(grouped);

        /* Vue desktop : tableau détaillé */
        const tableWrap = U.el("div", { class: "table-wrap" });
        const tbody = U.el("tbody");
        filtered.forEach(function (item) { tbody.appendChild(buildTransactionTableRow(item)); });
        tableWrap.appendChild(U.el("table", { class: "table-detail" }, [
            U.el("caption", { class: "sr-only", text: "Liste des transactions filtrées" }),
            U.el("thead", {}, [U.el("tr", {}, [
                U.el("th", { text: "Date" }),
                U.el("th", { text: "Description" }),
                U.el("th", { text: "Paiement" }),
                U.el("th", { style: { textAlign: "right" }, text: "Montant" }),
                U.el("th", { style: { textAlign: "center" }, text: "Actions" })
            ])]),
            tbody
        ]));
        host.appendChild(tableWrap);
    }

    /** Export CSV des transactions affichées (bonus productivité). */
    function exportVisibleToCSV() {
        const filtered = filterTransactions(data.getAllTransactions(), state);
        if (!filtered.length) { U.toast("Rien à exporter", "info", "Aucune transaction dans la sélection."); return; }

        const header = ["Date", "Type", "Categorie", "Description", "Mode", "Montant", "Devise"];
        const rows = filtered.map(function (item) {
            return [
                item.date,
                item.type === "income" ? "Revenu" : "Depense",
                item.type === "income" ? (item.source || "") : (item.category || ""),
                (item.description || "").replace(/;/g, ","),
                item.paymentMethod || "",
                String(item.amount).replace(".", ","),
                U.getCurrency()
            ].join(";");
        });
        const csv = "\uFEFF" + header.join(";") + "\n" + rows.join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = U.el("a", { href: url, download: "finatrack-transactions-" + U.todayISO() + ".csv" });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        U.toast("Export CSV généré", "success", filtered.length + " transaction(s) exportée(s)");
    }

    function initTransactionsPage() {
        const page = U.qs('[data-page="transactions"]');
        if (!page) return;

        buildToolbar();
        refresh();

        U.bus.on("data:changed", function () { refresh(); });

        const params = new URLSearchParams(global.location.search);
        const filter = params.get("filter");
        if (filter === "expenses") state.type = "expense";
        if (filter === "incomes") state.type = "income";
        if (filter === "month") state.period = "month";
        if (filter) { buildToolbar(); refresh(); }
        if (params.get("action") === "new") global.FT.app.openExpenseForm();
    }

    /* ======================================================================
       6. EXPORTS
       ====================================================================== */
    const api = {
        PERIODS: PERIODS,
        DEFAULT_FILTERS: DEFAULT_FILTERS,
        resolvePeriod: resolvePeriod,
        calculateBalance: calculateBalance,
        calculateTotalIncome: calculateTotalIncome,
        calculateTotalExpense: calculateTotalExpense,
        calculateSavings: calculateSavings,
        calculateSavingsRate: calculateSavingsRate,
        getPeriodStats: getPeriodStats,
        filterTransactions: filterTransactions,
        searchTransactions: searchTransactions,
        countActiveFilters: countActiveFilters,
        deleteTransaction: deleteTransaction,
        editTransaction: editTransaction,
        buildTransactionRow: buildTransactionRow,
        buildTransactionTableRow: buildTransactionTableRow,
        buildGroupedList: buildGroupedList,
        initTransactionsPage: initTransactionsPage,
        refresh: refresh,
        exportVisibleToCSV: exportVisibleToCSV,
        setGroupBy: function (value) {
            state.groupBy = value === "payment" ? "payment" : "date";
            buildToolbar();
            refresh();
        },
        getState: function () { return state; },
        applyExternalFilters: function (patch) {
            Object.assign(state, patch || {});
            buildToolbar();
            refresh();
        }
    };

    global.FT.tx = api;
    global.calculateBalance = calculateBalance;
    global.calculateSavingsRate = calculateSavingsRate;
    global.filterTransactions = filterTransactions;
    global.searchTransactions = searchTransactions;
    global.deleteTransaction = deleteTransaction;
    global.getTransactions = function () { return data.getAllTransactions(); };
})(window);
