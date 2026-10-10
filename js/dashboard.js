/* ==========================================================================
   FinaTrack CI — dashboard.js
   LOT A AJUSTÉ : pages courtes, dense, lisible web/mobile, onglets Essentiel/Détails
   1. Solde réel gros chiffre (compact) / 2. Budget jauge / 3. Top3 ultra-compact / 4. Wallets
   ========================================================================== */
(function (global) {
    "use strict";

    const U = global.FT.utils;
    const data = global.FT.data;
    const EXP = global.FT.expenses;
    const INC = global.FT.incomes;
    const TX = global.FT.tx;
    const BUD = global.FT.budget;

    function calculateBalance() { return TX.calculateBalance(); }

    function getDashboardData() {
        const month = U.monthKey();
        const prevMonth = U.previousMonthKey();
        const monthIncome = INC.calculateMonthlyIncomes(month);
        const monthExpense = EXP.calculateMonthlyExpenses(month);
        const prevIncome = INC.calculateMonthlyIncomes(prevMonth);
        const prevExpense = EXP.calculateMonthlyExpenses(prevMonth);
        const expenses = data.getExpenses();
        const monthExpenses = expenses.filter(function (e) { return U.monthKey(e.date) === month; });
        const balance = TX.calculateBalance(month);
        const budgetState = BUD.getBudgetState(month);
        const byCategory = EXP.getExpensesByCategory(monthExpenses);
        const savings = TX.calculateSavings(month);
        const savingsRate = TX.calculateSavingsRate(month);
        return {
            month: month,
            monthLabel: U.monthLabel(month),
            globalBalance: TX.calculateBalance(),
            balance: balance,
            income: monthIncome,
            expense: monthExpense,
            previousIncome: prevIncome,
            previousExpense: prevExpense,
            incomeDelta: prevIncome > 0 ? (monthIncome - prevIncome) / prevIncome : null,
            expenseDelta: prevExpense > 0 ? (monthExpense - prevExpense) / prevExpense : null,
            savings: savings,
            savingsRate: savingsRate,
            budget: budgetState,
            byCategory: byCategory,
            topCategory: byCategory[0] || null,
            top3: byCategory.slice(0, 3),
            averageDaily: EXP.getAverageDailyExpense(monthExpenses, month),
            highestDay: EXP.getHighestSpendingDay(monthExpenses),
            todayExpense: EXP.calculateTodayExpenses(),
            weekExpense: EXP.calculateWeekExpenses(),
            transactionCount: data.getExpenses().length + data.getIncomes().length,
            monthExpenseCount: monthExpenses.length,
            monthExpenses: monthExpenses,
            hasData: data.getExpenses().length + data.getIncomes().length > 0,
            greetingName: (data.getSettings().userName || "").trim()
        };
    }

    function areaLabel() {
        // Système de localisation automatique : utilise FT.location si dispo, sinon settings.area, sinon ville
        try {
            if (global.FT.location) {
                const label = FT.location.getLabel();
                if (label) return label;
            }
        } catch (e) {}
        const settings = data.getSettings();
        const area = (settings.area || "").trim();
        return area || U.LOCAL_CONTEXT.city;
    }
    function greeting() {
        let h = new Date().getHours();
        try {
            const fmt = new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: "Africa/Abidjan" });
            const parts = fmt.formatToParts(new Date());
            const hp = parts.find(function(p){ return p.type==="hour"; });
            if (hp) h = parseInt(hp.value,10);
        } catch(e){}
        if (h < 5) return "Bonsoir";
        if (h < 12) return "Bonjour";
        if (h < 17) return "Bon après-midi";
        return "Bonsoir";
    }

    /* 1. SOLDE RÉEL — version compacte, cliquable pour détails (solde + revenu d'abord) */
    function renderHero(d) {
        const host = U.qs("#dashHero");
        if (!host) return;
        U.clear(host);
        const name = d.greetingName ? " " + d.greetingName : "";

        host.appendChild(U.el("div", {
            class: "hero hero-solde hero-compact is-clickable",
            attrs: { title: "Voir les détails", role: "button", tabindex: "0", "aria-label": "Solde " + U.formatCurrency(d.balance) + ", cliquer pour voir les détails" },
            on: {
                click: function (e) {
                    // Ne pas interférer avec les boutons d'action
                    if (e.target.closest("[data-action]")) return;
                    openDetails();
                },
                keydown: function (e) {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetails(); }
                }
            }
        }, [
            U.el("div", { class: "hero-motif", attrs: { "aria-hidden": "true" } }),
            U.el("div", { class: "hero-inner" }, [
                U.el("div", { class: "hero-compact-top" }, [
                    U.el("div", {}, [
                        U.el("div", { class: "hero-greeting", text: greeting() + name + " — " + areaLabel() }),
                        U.el("div", { class: "hero-solde-label", text: "Solde réel · " + d.monthLabel + " · cliquer pour détails" }),
                        U.el("div", { class: "hero-value-huge num", text: U.formatCurrency(d.balance) }),
                        U.el("div", { class: "hero-sub", text: "Reste " + U.formatCurrency(d.savings) + " · " + d.monthExpenseCount + " dépenses · Aujourd'hui " + U.formatCurrency(d.todayExpense) })
                    ]),
                    U.el("div", { class: "hero-compact-actions" }, [
                        U.el("button", { class: "btn btn-accent btn-sm", type: "button", text: "+ Dépense", dataset: { action: "add-expense" } }),
                        U.el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "🎙️", dataset: { action: "voice-add" }, attrs: { title: "Ajouter par la voix" }, style: { color: "#F2F7F4", borderColor: "rgba(255,255,255,.25)" } })
                    ])
                ])
            ])
        ]));
    }

    function openDetails() {
        const tabs = U.qs("#dashTabs");
        const essentiel = U.qs("#dashTabEssentiel");
        const details = U.qs("#dashTabDetails");
        if (tabs && essentiel && details) {
            // Passe à l'onglet Détails sur mobile, scroll vers détails sur desktop
            const btn = tabs.querySelector("[data-tab='details']");
            if (btn) btn.click();
            if (global.innerWidth >= 1024) {
                const target = U.qs("#dashTabDetails");
                if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
            } else {
                // Sur mobile, scroll vers le haut de la page détails
                if (details) details.scrollIntoView({ behavior: "smooth", block: "start" });
            }
            if (global.FT.mobile && global.FT.mobile.haptic) global.FT.mobile.haptic("light");
        }
    }

    /* KPI — ordre solde + revenu d'abord, cliquables pour détails */
    function kpiCard(config) {
        const isClickable = !!config.onClick;
        const base = U.el(isClickable ? "button" : "div", {
            class: "kpi " + (config.cls || "") + (isClickable ? " is-clickable" : ""),
            type: isClickable ? "button" : null,
            attrs: isClickable ? {
                title: config.clickTitle || "Voir les détails",
                "aria-label": config.label + " " + config.value + " — cliquer pour détails"
            } : {},
            on: isClickable ? { click: config.onClick } : {}
        }, [
            U.el("span", { class: "kpi-accent-rule", attrs: { "aria-hidden": "true" } }),
            U.el("div", { class: "kpi-top" }, [
                U.el("div", { class: "kpi-ico", text: config.emoji, attrs: { "aria-hidden": "true" } }),
                U.el("div", { class: "kpi-label", text: config.label })
            ]),
            U.el("div", { class: "kpi-value num", text: config.value }),
            config.sub ? U.el("div", { class: "kpi-sub", text: config.sub }) : null,
            config.footer || null
        ]);
        return base;
    }

    function renderKpis(d) {
        const host = U.qs("#dashKpis");
        if (!host) return;
        U.clear(host);

        const budgetSub = d.budget.hasBudget
            ? U.formatPercent(Math.min(d.budget.ratio, 9.99), 0) + " utilisé · " + U.formatCurrency(d.budget.budget)
            : "Définir budget";

        const budgetCard = kpiCard({
            cls: "kpi-budget",
            emoji: "🎯",
            label: "Budget restant",
            value: d.budget.hasBudget ? U.formatCurrency(d.budget.remaining) : "—",
            sub: budgetSub + " · cliquer pour détails",
            clickTitle: "Voir le détail du budget",
            onClick: openDetails,
            footer: d.budget.hasBudget ? U.el("div", { class: "progress thin", style: { marginTop: "8px" } }, [
                U.el("div", {
                    class: "progress-bar " + (d.budget.level === "over" ? "over" : d.budget.level === "warn" ? "warn" : ""),
                    style: { width: Math.min(100, Math.max(2, d.budget.percent)) + "%" }
                })
            ]) : null
        });

        // Ordre demandé : solde + revenu d'abord, puis clic pour détails
        const cards = [
            kpiCard({
                cls: "kpi-balance",
                emoji: "💰",
                label: "Solde disponible",
                value: U.formatCurrency(d.balance),
                sub: d.monthLabel + " · " + U.formatCurrency(d.savings) + " reste · détails →",
                clickTitle: "Voir les détails complets",
                onClick: openDetails
            }),
            kpiCard({
                cls: "kpi-income",
                emoji: "📈",
                label: "Revenus ce mois",
                value: U.formatCurrency(d.income),
                sub: (d.incomeDelta === null ? "—" : (d.incomeDelta >= 0 ? "+" : "") + U.formatPercent(d.incomeDelta, 0) + " vs dernier") + " · détails →",
                clickTitle: "Voir les revenus",
                onClick: function () {
                    if (global.FT.router && global.FT.router.navigate) {
                        global.FT.router.navigate("incomes");
                    } else {
                        global.location.href = "pages/incomes.html";
                    }
                }
            }),
            budgetCard,
            kpiCard({
                cls: "kpi-expense",
                emoji: "💸",
                label: "Dépenses ce mois",
                value: U.formatCurrency(d.expense),
                sub: (d.expenseDelta === null ? d.monthExpenseCount + " dépenses" : (d.expenseDelta >= 0 ? "+" : "") + U.formatPercent(d.expenseDelta, 0) + " vs dernier") + " · détails →",
                clickTitle: "Voir les dépenses",
                onClick: function () {
                    if (global.FT.router && global.FT.router.navigate) {
                        global.FT.router.navigate("transactions");
                    } else {
                        global.location.href = "pages/transactions.html";
                    }
                }
            })
        ];

        cards.forEach(function (card) { host.appendChild(card); });
    }

    /* 3. TOP 3 — ultra compact 3 colonnes même sur mobile (liste simple) */
    function renderTop3(d) {
        const host = U.qs("#dashTop3");
        if (!host) return;
        U.clear(host);

        if (!d.byCategory.length) {
            host.appendChild(U.el("div", { class: "empty", style: { padding: "16px 8px" } }, [
                U.el("div", { class: "empty-ico", text: "💸", attrs: { "aria-hidden": "true" } }),
                U.el("p", { class: "muted", text: "Vos 3 postes principaux apparaîtront ici." }),
                U.el("button", { class: "btn btn-primary btn-sm", type: "button", text: "+ J'ai dépensé", dataset: { action: "add-expense" } })
            ]));
            return;
        }

        const top3 = d.top3.length ? d.top3 : d.byCategory.slice(0, 3);
        const maxTotal = top3[0] ? top3[0].total : 1;

        const grid = U.el("div", { class: "top3-grid top3-compact" });
        top3.forEach(function (group, index) {
            const width = Math.max(12, Math.round((group.total / maxTotal) * 100));
            grid.appendChild(U.el("div", { class: "top3-card top3-mini" }, [
                U.el("div", { class: "top3-mini-ico", text: U.categoryEmoji(group.category), attrs: { "aria-hidden": "true" } }),
                U.el("div", { class: "top3-mini-name", text: group.category }),
                U.el("div", { class: "top3-mini-value num", text: U.formatCurrency(group.total) }),
                U.el("div", { class: "progress thin", style: { marginTop: "6px" } }, [
                    U.el("div", { class: "progress-bar", style: { width: width + "%", background: U.categoryColor(group.category) } })
                ])
            ]));
        });

        if (d.byCategory.length > 3) {
            const restTotal = d.byCategory.slice(3).reduce(function (t, g) { return t + g.total; }, 0);
            grid.appendChild(U.el("div", { class: "top3-card top3-mini is-rest" }, [
                U.el("div", { class: "top3-mini-ico", text: "📦" }),
                U.el("div", { class: "top3-mini-name", text: "Autres" }),
                U.el("div", { class: "top3-mini-value num", text: U.formatCurrency(restTotal) }),
                U.el("div", { class: "muted", style: { fontSize: "var(--fs-xs)", marginTop: "4px" }, text: "+" + (d.byCategory.length - 3) + " postes" })
            ]));
        }

        host.appendChild(grid);
    }

    function renderMoneyFlow(d) {
        const flowHost = U.qs("#dashFlow");
        const catHost = U.qs("#dashCategories");
        if (!flowHost || !catHost) return;

        U.clear(flowHost);
        [
            { cls: "is-income", ico: "📥", label: "Revenus", value: U.formatCurrency(d.income) },
            { cls: "is-expense", ico: "📤", label: "Dépenses", value: U.formatCurrency(d.expense) },
            { cls: "is-rest", ico: "💼", label: "Reste", value: U.formatCurrency(d.savings) }
        ].forEach(function (step, index) {
            flowHost.appendChild(U.el("div", { class: "flow-step " + step.cls }, [
                U.el("div", { class: "fs-ico", text: step.ico, attrs: { "aria-hidden": "true" } }),
                U.el("div", {}, [
                    U.el("div", { class: "fs-label", text: step.label }),
                    U.el("div", { class: "fs-value num", text: step.value })
                ])
            ]));
            if (index < 2) flowHost.appendChild(U.el("div", { class: "flow-arrow", text: "↓", attrs: { "aria-hidden": "true" } }));
        });

        flowHost.appendChild(U.el("div", { class: "progress-legend", style: { padding: "0 4px" } }, [
            U.el("span", { text: d.income > 0 ? "Taux d'épargne : " + U.formatPercent(d.savingsRate / 100, 1) : "Ajoutez un revenu pour calculer votre taux d'épargne" }),
            U.el("span", { text: d.monthExpenseCount + " dépense" + (d.monthExpenseCount > 1 ? "s" : "") + " ce mois" })
        ]));

        U.clear(catHost);
        if (!d.byCategory.length) {
            catHost.appendChild(U.el("div", { class: "empty", style: { padding: "16px 8px" } }, [
                U.el("p", { text: "Aucune dépense ce mois." }),
                U.el("button", { class: "btn btn-primary btn-sm", type: "button", text: "+ Ajouter", dataset: { action: "add-expense" } })
            ]));
            return;
        }

        const wrapper = U.el("div", { class: "cat-list" });
        const maxTotal = d.byCategory[0].total || 1;
        d.byCategory.forEach(function (group) {
            const width = Math.max(3, Math.round((group.total / maxTotal) * 100));
            wrapper.appendChild(U.el("div", { class: "cat-row" }, [
                U.el("div", { class: "cr-name" }, [
                    U.el("span", { class: "cat-emoji", text: U.categoryEmoji(group.category), attrs: { "aria-hidden": "true" } }),
                    U.el("span", { text: group.category }),
                    U.el("span", { class: "tag", text: Math.round(group.share * 100) + " %" })
                ]),
                U.el("div", { class: "cr-value", text: U.formatCurrency(group.total) }),
                U.el("div", { class: "cr-share" }, [
                    U.el("div", { class: "progress thin", attrs: { role: "progressbar", "aria-label": group.category, "aria-valuenow": String(Math.round(group.share * 100)), "aria-valuemin": "0", "aria-valuemax": "100" } }, [
                        U.el("div", { class: "progress-bar", style: { width: width + "%", background: U.categoryColor(group.category) } })
                    ])
                ])
            ]));
        });
        catHost.appendChild(wrapper);
    }

    function budgetGaugeSVG(percent, level) {
        const p = Math.max(0, Math.min(100, percent));
        const circ = 2 * Math.PI * 54;
        const dash = (p / 100) * circ;
        const color = level === "over" ? "var(--danger)" : level === "warn" ? "var(--secondary)" : "var(--success)";
        const bg = "var(--surface-3)";
        return '<svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="Budget ' + Math.round(p) + ' %"><circle cx="60" cy="60" r="54" fill="none" stroke="' + bg + '" stroke-width="12"/><circle cx="60" cy="60" r="54" fill="none" stroke="' + color + '" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + dash + ' ' + circ + '" transform="rotate(-90 60 60)"/><text x="60" y="56" text-anchor="middle" font-size="22" font-weight="800" fill="var(--text)">' + Math.round(p) + '%</text><text x="60" y="74" text-anchor="middle" font-size="13" font-weight="600" fill="var(--text-soft)">utilisé</text></svg>';
    }

    function renderBudgetStrip(d) {
        const host = U.qs("#dashBudget");
        if (!host) return;
        U.clear(host);
        const state = d.budget;
        const message = BUD.getBudgetMessage(state);
        const barClass = state.level === "over" ? "progress-bar over" : state.level === "warn" ? "progress-bar warn" : "progress-bar";

        const card = U.el("div", { class: "card card-lg budget-hero-card" }, []);
        const head = U.el("div", { class: "card-head" }, [
            U.el("h3", {}, [U.el("span", { text: "🎯" }), U.el("span", { text: "Budget de " + state.monthLabel })]),
            U.el("a", { class: "btn btn-ghost btn-sm", href: "pages/budget.html", text: "Gérer" })
        ]);
        card.appendChild(head);

        if (!state.hasBudget) {
            card.appendChild(U.el("div", { class: "budget-hero-empty" }, [
                U.el("div", { class: "budget-gauge-placeholder" }, [U.el("div", { class: "gauge-empty", text: "🎯" })]),
                U.el("div", { class: "budget-hero-info" }, [
                    U.el("div", { class: "alert info" }, [
                        U.el("span", { class: "alert-ico", text: message.icon }),
                        U.el("div", {}, [U.el("div", { class: "alert-title", text: message.title }), U.el("div", { class: "muted", text: message.text })])
                    ]),
                    U.el("a", { class: "btn btn-primary btn-sm", href: "pages/budget.html", style: { marginTop: "10px" }, text: "+ Définir budget" })
                ])
            ]));
            host.appendChild(card);
            return;
        }

        card.appendChild(U.el("div", { class: "budget-hero-layout" }, [
            U.el("div", { class: "budget-gauge-wrap", html: budgetGaugeSVG(state.percent, state.level) }),
            U.el("div", { class: "budget-hero-stats" }, [
                U.el("div", { class: "stat-grid", style: { gridTemplateColumns: "repeat(3, minmax(0,1fr))" } }, [
                    U.el("div", { class: "stat" }, [U.el("div", { class: "stat-label", text: "Budget" }), U.el("div", { class: "stat-value num", text: U.formatCurrency(state.budget) })]),
                    U.el("div", { class: "stat" }, [U.el("div", { class: "stat-label", text: "Dépensé" }), U.el("div", { class: "stat-value num", text: U.formatCurrency(state.spent) })]),
                    U.el("div", { class: "stat stat-highlight" }, [U.el("div", { class: "stat-label", text: "Restant" }), U.el("div", { class: "stat-value num " + (state.remaining < 0 ? "neg" : "pos"), text: U.formatCurrency(state.remaining) })])
                ]),
                U.el("div", { style: { marginTop: "12px" } }, [
                    U.el("div", { class: "progress hatch", attrs: { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.min(100, Math.round(state.percent))) } }, [
                        U.el("div", { class: barClass, style: { width: Math.min(100, Math.max(2, state.percent)) + "%" } })
                    ]),
                    U.el("div", { class: "progress-legend" }, [
                        U.el("span", { text: Math.round(state.percent) + " % consommé" }),
                        U.el("span", { text: state.daysLeft + " j restants" })
                    ])
                ])
            ])
        ]));

        card.appendChild(U.el("div", { style: { marginTop: "10px" } }, [
            U.el("div", { class: "alert " + (message.level === "info" ? "info" : message.level) }, [
                U.el("span", { class: "alert-ico", text: message.icon }),
                U.el("div", {}, [U.el("div", { class: "alert-title", text: message.title }), U.el("div", { class: "muted", text: message.text })])
            ])
        ]));

        host.appendChild(card);
    }

    function renderInsights(d) {
        const host = U.qs("#dashInsights");
        if (!host) return;
        U.clear(host);
        const insights = [];
        if (d.topCategory) insights.push({ ico: U.categoryEmoji(d.topCategory.category), title: "Poste principal", text: d.topCategory.category + " " + U.formatCurrency(d.topCategory.total) + " · " + Math.round(d.topCategory.share * 100) + " %" });
        if (d.todayExpense > 0) insights.push({ ico: "📅", title: "Aujourd'hui", text: U.formatCurrency(d.todayExpense) + " · moy " + U.formatCurrency(d.averageDaily) + "/j" });
        if (d.highestDay) insights.push({ ico: "📌", title: "Jour max", text: U.formatDate(d.highestDay.date) + " " + U.formatCurrency(d.highestDay.total) });
        if (d.income > 0) {
            const rate = U.round2(d.savingsRate);
            insights.push({ ico: rate >= 20 ? "🌱" : "⚖️", title: "Épargne", text: U.formatPercent(rate / 100, 0) + " · " + U.formatCurrency(d.savings) });
        }
        if (!insights.length) {
            host.appendChild(U.el("div", { class: "empty", style: { padding: "16px" } }, [U.el("p", { text: "Ajoutez des transactions pour voir des analyses." })]));
            return;
        }
        const list = U.el("div", { class: "stack" });
        insights.forEach(function (item) {
            list.appendChild(U.el("div", { class: "alert info" }, [
                U.el("span", { class: "alert-ico", text: item.ico }),
                U.el("div", {}, [U.el("div", { class: "alert-title", text: item.title }), U.el("div", { class: "muted", text: item.text })])
            ]));
        });
        host.appendChild(list);
    }

    function renderRecent() {
        const host = U.qs("#dashRecent");
        if (!host) return;
        U.clear(host);
        const recent = data.getAllTransactions().slice(0, 5);
        if (!recent.length) {
            host.appendChild(U.el("div", { class: "empty" }, [
                U.el("div", { class: "empty-ico", text: "📭" }),
                U.el("h3", { text: "Aucune transaction." }),
                U.el("p", { text: "Enregistrez votre première dépense." }),
                U.el("div", { class: "btn-row", style: { justifyContent: "center" } }, [
                    U.el("button", { class: "btn btn-accent btn-sm", type: "button", text: "🎙️ Voix", dataset: { action: "voice-add" } }),
                    U.el("button", { class: "btn btn-primary btn-sm", type: "button", text: "+ Dépense", dataset: { action: "add-expense" } })
                ])
            ]));
            return;
        }
        const list = U.el("div", { class: "tx-list" });
        recent.forEach(function (item) { list.appendChild(global.FT.tx.buildTransactionRow(item)); });
        host.appendChild(list);
    }

    function renderWallets() {
        const host = U.qs("#dashWallets");
        if (!host || !global.FT.payments) return;
        global.FT.payments.renderWallets(host, { onEdit: function () { global.FT.app.openWalletsForm(); }, showEdit: false });
    }

    function renderPayments(d) {
        const host = U.qs("#dashPayments");
        if (!host || !global.FT.payments) return;
        global.FT.payments.renderCompact(host, d.monthExpenses || [], { limit: 4 });
    }

    /* Onglets Essentiel / Détails — mobile = 2 pages courtes, web = tout visible */
    function initDashTabs() {
        const tabs = U.qs("#dashTabs");
        const essentiel = U.qs("#dashTabEssentiel");
        const details = U.qs("#dashTabDetails");
        if (!tabs || !essentiel || !details) return;

        function switchTab(name) {
            const isEssentiel = name === "essentiel";
            tabs.querySelectorAll("[data-tab]").forEach(function (btn) {
                const active = btn.dataset.tab === name;
                btn.classList.toggle("is-active", active);
                btn.setAttribute("aria-selected", active ? "true" : "false");
            });
            essentiel.hidden = !isEssentiel;
            essentiel.classList.toggle("is-active", isEssentiel);
            details.hidden = isEssentiel;
            details.classList.toggle("is-active", !isEssentiel);
            // Sur desktop on force tout visible, donc on ignore hidden
            if (global.innerWidth >= 1024) {
                essentiel.hidden = false;
                details.hidden = false;
            }
        }

        tabs.addEventListener("click", function (e) {
            const btn = e.target.closest("[data-tab]");
            if (!btn) return;
            switchTab(btn.dataset.tab);
        });

        // Desktop : tout visible, onglets masqués via CSS
        function handleResize() {
            if (global.innerWidth >= 1024) {
                essentiel.hidden = false;
                details.hidden = false;
                essentiel.classList.add("is-active");
                details.classList.add("is-active");
            } else {
                // Mobile : respecte l'onglet actif
                const activeBtn = tabs.querySelector(".is-active") || tabs.querySelector("[data-tab='essentiel']");
                switchTab(activeBtn ? activeBtn.dataset.tab : "essentiel");
            }
        }

        global.addEventListener("resize", U.debounce(handleResize, 120));
        handleResize();
    }

    function updateDashboard() {
        const page = U.qs('[data-page="dashboard"]');
        if (!page) return null;
        const d = getDashboardData();
        renderHero(d);
        renderBudgetStrip(d);
        renderKpis(d);
        renderTop3(d);
        renderMoneyFlow(d);
        renderWallets();
        renderPayments(d);
        renderInsights(d);
        renderRecent(d);
        return d;
    }

    function initDashboard() {
        const page = U.qs('[data-page="dashboard"]');
        if (!page) return;
        updateDashboard();
        initDashTabs();
        U.bus.on("data:changed", U.debounce(function () { updateDashboard(); }, 40));
        U.bus.on("wallets:changed", U.debounce(function () { updateDashboard(); }, 40));
        U.bus.on("theme:changed", function () { setTimeout(updateDashboard, 40); });
        const params = new URLSearchParams(global.location.search);
        if (params.get("action") === "new") global.FT.app.openExpenseForm();
        if (params.get("action") === "voice") global.FT.voice.open();
    }

    global.FT.dashboard = {
        getDashboardData: getDashboardData,
        renderWallets: renderWallets,
        renderTop3: renderTop3,
        areaLabel: areaLabel,
        updateDashboard: updateDashboard,
        calculateBalance: calculateBalance,
        initDashboard: initDashboard
    };
    global.calculateBalance = calculateBalance;
    global.updateDashboard = updateDashboard;
})(window);
