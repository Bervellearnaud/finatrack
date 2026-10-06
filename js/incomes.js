/* ==========================================================================
   FinaTrack CI — incomes.js
   Domaine « revenus » : validation, CRUD, agrégations + vue de la page Revenus.
   ========================================================================== */
(function (global) {
    "use strict";

    const U = global.FT.utils;
    const data = global.FT.data;
    const EXP = global.FT.expenses;

    /* ======================================================================
       1. VALIDATION
       ====================================================================== */

    function validateIncome(input) {
        const raw = input || {};
        const errors = {};

        const amount = U.parseAmountInput(raw.amount);
        if (!raw.amount && raw.amount !== 0) {
            errors.amount = "Indiquez le montant reçu.";
        } else if (!isFinite(amount) || amount <= 0) {
            errors.amount = "Le montant doit être un nombre supérieur à 0.";
        }

        const source = U.sanitizeText(raw.source, 40);
        if (!source) {
            errors.source = "Choisissez la source du revenu.";
        } else if (U.INCOME_SOURCES.indexOf(source) === -1) {
            errors.source = "Cette source n'existe pas.";
        }

        const date = raw.date ? U.toISODate(U.fromISODate(raw.date)) : U.todayISO();
        if (!U.isValidISODate(date)) {
            errors.date = "Choisissez une date valide.";
        } else if (U.fromISODate(date) > U.addDays(U.todayISO(), 1)) {
            errors.date = "La date ne peut pas être dans le futur.";
        }

        const method = raw.paymentMethod ? U.sanitizeText(raw.paymentMethod, 40) : "";
        if (method && U.PAYMENT_METHODS.indexOf(method) === -1) {
            errors.paymentMethod = "Mode de réception inconnu.";
        }

        return {
            valid: Object.keys(errors).length === 0,
            errors: errors,
            value: {
                amount: amount,
                source: source || "Autre",
                description: U.sanitizeText(raw.description, 160),
                date: date,
                paymentMethod: method || "Espèces",
                origin: raw.origin === "voice" ? "voice" : "manual"
            }
        };
    }

    /* ======================================================================
       2. CRUD
       ====================================================================== */

    function addIncome(income) {
        const check = validateIncome(income);
        if (!check.valid) return { ok: false, errors: check.errors };

        const record = data.addIncome(check.value);
        if (!record) return { ok: false, errors: { global: "Enregistrement impossible." } };

        U.bus.emit("income:added", record);
        U.bus.emit("data:changed", { type: "income", action: "add", record: record });
        return { ok: true, data: record };
    }

    function updateIncome(id, patch) {
        const existing = getIncomeById(id);
        if (!existing) return { ok: false, errors: { global: "Ce revenu n'existe plus." } };

        const check = validateIncome(Object.assign({}, existing, patch));
        if (!check.valid) return { ok: false, errors: check.errors };

        const record = data.updateIncome(id, check.value);
        if (!record) return { ok: false, errors: { global: "La modification a échoué." } };

        U.bus.emit("income:updated", record);
        U.bus.emit("data:changed", { type: "income", action: "update", record: record });
        return { ok: true, data: record };
    }

    function deleteIncome(id) {
        const existing = getIncomeById(id);
        if (!existing) return { ok: false, errors: { global: "Ce revenu n'existe plus." } };
        const done = data.deleteIncome(id);
        if (done) {
            U.bus.emit("income:deleted", existing);
            U.bus.emit("data:changed", { type: "income", action: "delete", record: existing });
        }
        return { ok: done, data: existing };
    }

    /* ======================================================================
       3. LECTURES & CALCULS
       ====================================================================== */

    function getIncomes(options) {
        const opts = options || {};
        let list = data.getIncomes();
        if (opts.month) list = list.filter(function (i) { return U.monthKey(i.date) === opts.month; });
        if (opts.from) list = list.filter(function (i) { return i.date >= opts.from; });
        if (opts.to) list = list.filter(function (i) { return i.date <= opts.to; });
        return list.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    }

    function getIncomeById(id) {
        return data.getIncomes().filter(function (i) { return i.id === id; })[0] || null;
    }

    function calculateIncomesTotal(list) {
        return EXP.sum(list || data.getIncomes());
    }

    function calculateMonthlyIncomes(month) {
        const key = month || U.monthKey();
        return EXP.sum(data.getIncomes().filter(function (i) { return U.monthKey(i.date) === key; }));
    }

    function calculatePreviousMonthIncomes() {
        return calculateMonthlyIncomes(U.previousMonthKey());
    }

    /** Répartition par source, triée décroissante. */
    function getIncomesBySource(list) {
        const source = list || data.getIncomes();
        const total = EXP.sum(source);
        const groups = {};
        source.forEach(function (item) {
            const key = item.source || "Autre";
            if (!groups[key]) groups[key] = { source: key, total: 0, count: 0 };
            groups[key].total = U.round2(groups[key].total + U.toNumber(item.amount));
            groups[key].count += 1;
        });
        return Object.keys(groups).map(function (k) {
            const g = groups[k];
            g.share = total > 0 ? g.total / total : 0;
            return g;
        }).sort(function (a, b) { return b.total - a.total; });
    }

    /* ======================================================================
       4. VUE — PAGE « REVENUS »
       ====================================================================== */

    const state = {
        search: "",
        source: "all",
        period: "all",
        sort: "date-desc"
    };

    function periodRange(period) {
        const today = U.todayISO();
        switch (period) {
            case "today": return { from: today, to: today };
            case "week": return { from: U.toISODate(U.startOfWeek(new Date())), to: today };
            case "month": return { from: U.toISODate(U.startOfMonth(new Date())), to: U.toISODate(U.endOfMonth(new Date())) };
            case "prev-month": {
                const d = new Date(); d.setMonth(d.getMonth() - 1);
                return { from: U.toISODate(U.startOfMonth(d)), to: U.toISODate(U.endOfMonth(d)) };
            }
            default: return null;
        }
    }

    function applyFilters(list) {
        let result = list.slice();
        const range = periodRange(state.period);
        if (range) result = result.filter(function (i) { return i.date >= range.from && i.date <= range.to; });
        if (state.source !== "all") result = result.filter(function (i) { return i.source === state.source; });

        if (state.search.trim()) {
            const q = state.search.trim().toLowerCase();
            result = result.filter(function (i) {
                return [i.description, i.source, i.paymentMethod, U.formatDate(i.date)]
                    .join(" ").toLowerCase().indexOf(q) !== -1;
            });
        }
        if (state.sort === "date-asc") result.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
        else if (state.sort === "amount-desc") result.sort(function (a, b) { return b.amount - a.amount; });
        else if (state.sort === "amount-asc") result.sort(function (a, b) { return a.amount - b.amount; });
        else result.sort(function (a, b) { return a.date < b.date ? 1 : -1; });

        return result;
    }

    function renderSummary(host) {
        const month = U.monthKey();
        const monthTotal = calculateMonthlyIncomes(month);
        const prevTotal = calculatePreviousMonthIncomes();
        const allTotal = calculateIncomesTotal();
        const bySource = getIncomesBySource(data.getIncomes().filter(function (i) { return U.monthKey(i.date) === month; }));
        const mainSource = bySource[0];
        const delta = prevTotal > 0 ? ((monthTotal - prevTotal) / prevTotal) : null;

        const wrap = U.clear(host);
        const cards = [
            {
                label: "Revenus " + U.monthLabel(month),
                value: U.formatCurrency(monthTotal),
                sub: delta === null ? "Aucune comparaison disponible"
                    : (delta >= 0 ? "+" + U.formatPercent(delta, 1) + " vs " + U.monthLabel(U.previousMonthKey())
                                  : U.formatPercent(delta, 1) + " vs " + U.monthLabel(U.previousMonthKey())),
                cls: "kpi-income"
            },
            {
                label: "Total enregistré",
                value: U.formatCurrency(allTotal),
                sub: data.getIncomes().length + " revenu" + (data.getIncomes().length > 1 ? "s" : "") + " au total",
                cls: ""
            },
            {
                label: "Source principale",
                value: mainSource ? mainSource.source : "—",
                sub: mainSource ? U.formatCurrency(mainSource.total) + " ce mois" : "Aucun revenu ce mois",
                cls: ""
            }
        ];

        cards.forEach(function (c) {
            wrap.appendChild(U.el("div", { class: "kpi " + c.cls }, [
                U.el("div", { class: "kpi-top" }, [
                    U.el("div", { class: "kpi-ico", text: "💰" }),
                    U.el("div", { class: "kpi-label", text: c.label })
                ]),
                U.el("div", { class: "kpi-value num", text: c.value }),
                U.el("div", { class: "kpi-sub", text: c.sub })
            ]));
        });
    }

    function renderList(host, list) {
        const wrap = U.clear(host);
        if (!list.length) {
            wrap.appendChild(U.el("div", { class: "empty" }, [
                U.el("div", { class: "empty-ico", text: "💰", attrs: { "aria-hidden": "true" } }),
                U.el("h3", { text: "Aucun revenu à afficher." }),
                U.el("p", { text: "Ajoutez votre salaire, une vente ou une prestation pour suivre l'ensemble de votre argent." }),
                U.el("button", { class: "btn btn-primary", type: "button", text: "+ Ajouter un revenu", dataset: { action: "add-income" } })
            ]));
            return;
        }

        const listNode = U.el("div", { class: "tx-list" });
        let lastDate = null;
        list.forEach(function (income) {
            if (income.date !== lastDate) {
                lastDate = income.date;
                listNode.appendChild(U.el("div", { class: "tx-group-label", text: U.formatRelativeDate(income.date) + " · " + U.formatDate(income.date, { short: true }) }));
            }
            listNode.appendChild(global.FT.tx.buildTransactionRow(income));
        });
        wrap.appendChild(listNode);
    }

    /** Répartition visuelle des revenus par source (page Revenus). */
    function renderSources() {
        const host = U.qs("#incomeSources");
        if (!host) return;
        U.clear(host);

        const month = U.monthKey();
        const groups = getIncomesBySource(data.getIncomes().filter(function (i) { return U.monthKey(i.date) === month; }));

        if (!groups.length) {
            host.appendChild(U.el("p", { class: "muted", text: "Aucun revenu enregistré ce mois. Ajoutez votre salaire ou une vente pour voir la répartition." }));
            return;
        }

        const max = groups[0].total || 1;
        const list = U.el("div", { class: "cat-list" });
        groups.forEach(function (group) {
            list.appendChild(U.el("div", { class: "cat-row" }, [
                U.el("div", { class: "cr-name" }, [
                    U.el("span", { class: "cat-emoji", text: U.sourceEmoji(group.source), attrs: { "aria-hidden": "true" } }),
                    U.el("span", { text: group.source }),
                    U.el("span", { class: "tag income", text: Math.round(group.share * 100) + " %" })
                ]),
                U.el("div", { class: "cr-value", text: U.formatCurrency(group.total) }),
                U.el("div", { class: "cr-share" }, [
                    U.el("div", { class: "progress thin" }, [
                        U.el("div", { class: "progress-bar", style: { width: Math.max(3, Math.round((group.total / max) * 100)) + "%" } })
                    ])
                ])
            ]));
        });
        host.appendChild(list);
    }

    function refresh() {
        const summary = U.qs("#incomeSummary");
        const listHost = U.qs("#incomeList");
        const count = U.qs("#incomeCount");
        if (!summary || !listHost) return;

        renderSummary(summary);
        const filtered = applyFilters(data.getIncomes());
        renderList(listHost, filtered);
        renderSources();
        if (count) {
            count.textContent = filtered.length + " revenu" + (filtered.length > 1 ? "s" : "") +
                " · " + U.formatCurrency(EXP.sum(filtered));
        }
    }

    function buildToolbar() {
        const bar = U.qs("#incomeFilters");
        if (!bar) return;
        const wrap = U.clear(bar);

        const search = U.el("div", { class: "search-box toolbar-full" }, [
            U.el("span", { class: "search-ico", text: "🔍", attrs: { "aria-hidden": "true" } }),
            U.el("input", {
                class: "input", type: "search", id: "incomeSearch",
                placeholder: "Rechercher un revenu…",
                attrs: { "aria-label": "Rechercher un revenu" },
                on: {
                    input: U.debounce(function (e) { state.search = e.target.value; refresh(); }, 180)
                }
            })
        ]);

        const period = U.el("div", { class: "segmented", attrs: { role: "tablist", "aria-label": "Période" } });
        [["all", "Tout"], ["today", "Aujourd'hui"], ["week", "Cette semaine"], ["month", "Ce mois"], ["prev-month", "Mois dernier"]]
            .forEach(function (opt) {
                period.appendChild(U.el("button", {
                    type: "button", text: opt[1], class: state.period === opt[0] ? "is-active" : "",
                    dataset: { period: opt[0] },
                    attrs: { role: "tab", "aria-selected": state.period === opt[0] ? "true" : "false" },
                    on: {
                        click: function () { state.period = opt[0]; buildToolbar(); refresh(); }
                    }
                }));
            });

        const sourceSelect = U.el("select", {
            class: "select", attrs: { "aria-label": "Filtrer par source" },
            on: { change: function (e) { state.source = e.target.value; refresh(); } }
        }, [U.el("option", { value: "all", text: "Toutes les sources" })]
            .concat(U.INCOME_SOURCES.map(function (s) {
                return U.el("option", { value: s, text: s, selected: state.source === s });
            })));

        wrap.appendChild(search);
        wrap.appendChild(U.el("div", { class: "toolbar-full" }, [period]));
        wrap.appendChild(sourceSelect);
    }

    function initIncomesPage() {
        const page = U.qs('[data-page="incomes"]');
        if (!page) return;

        buildToolbar();
        refresh();

        U.bus.on("data:changed", function (payload) {
            if (payload && (payload.type === "income" || payload.type === "all")) refresh();
        });

        const params = new URLSearchParams(global.location.search);
        if (params.get("action") === "new") global.FT.app.openIncomeForm();
    }

    /* ======================================================================
       5. EXPORTS
       ====================================================================== */
    const api = {
        validateIncome: validateIncome,
        addIncome: addIncome,
        updateIncome: updateIncome,
        deleteIncome: deleteIncome,
        getIncomes: getIncomes,
        getIncomeById: getIncomeById,
        calculateIncomesTotal: calculateIncomesTotal,
        calculateMonthlyIncomes: calculateMonthlyIncomes,
        calculatePreviousMonthIncomes: calculatePreviousMonthIncomes,
        getIncomesBySource: getIncomesBySource,
        initIncomesPage: initIncomesPage,
        refreshIncomes: refresh
    };

    global.FT.incomes = api;
    global.addIncome = addIncome;
    global.updateIncome = updateIncome;
    global.deleteIncome = deleteIncome;
    global.calculateMonthlyIncomes = calculateMonthlyIncomes;
})(window);
