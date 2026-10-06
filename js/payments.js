/* ==========================================================================
   FinaTrack CI — payments.js
   Suivi par moyen de paiement : regroupement, totaux et répartition.

   Répond à trois besoins concrets :
     1. voir d'un coup d'œil AVEC QUOI chaque transaction a été payée ;
     2. RANGER toutes les transactions par moyen de paiement ;
     3. connaître la SOMME TOTALE dépensée et reçue par moyen de paiement,
        ainsi que le total général toutes méthodes confondues.
   ========================================================================== */
(function (global) {
    "use strict";

    const U = global.FT.utils;
    const data = global.FT.data;

    const UNKNOWN = "Non précisé";

    /* ======================================================================
       1. AGRÉGATIONS
       ====================================================================== */

    function sum(list) {
        return list.reduce(function (total, item) { return total + U.toNumber(item.amount); }, 0);
    }

    /**
     * Répartit une liste de transactions par moyen de paiement.
     * @param {Array} [list] par défaut : toutes les transactions
     * @returns {{rows: Array, totals: Object, methodsUsed: number}}
     */
    function getPaymentBreakdown(list) {
        const source = list || data.getAllTransactions();
        const groups = {};

        const totals = {
            total: 0, expense: 0, income: 0,
            count: 0, expenseCount: 0, incomeCount: 0,
            methodsUsed: 0, untracked: 0
        };

        source.forEach(function (item) {
            const key = item.paymentMethod || UNKNOWN;
            const amount = U.toNumber(item.amount);
            const isIncome = item.type === "income";

            if (!groups[key]) {
                groups[key] = {
                    method: key,
                    emoji: item.paymentMethod ? U.paymentEmoji(key) : "❔",
                    color: U.paymentColor(item.paymentMethod ? key : null),
                    total: 0, expense: 0, income: 0,
                    count: 0, expenseCount: 0, incomeCount: 0,
                    lastDate: "", firstDate: ""
                };
            }

            const group = groups[key];
            group.total = U.round2(group.total + amount);
            group.count += 1;
            if (isIncome) {
                group.income = U.round2(group.income + amount);
                group.incomeCount += 1;
            } else {
                group.expense = U.round2(group.expense + amount);
                group.expenseCount += 1;
            }
            if (!group.lastDate || item.date > group.lastDate) group.lastDate = item.date;
            if (!group.firstDate || item.date < group.firstDate) group.firstDate = item.date;

            totals.total = U.round2(totals.total + amount);
            totals.count += 1;
            if (isIncome) {
                totals.income = U.round2(totals.income + amount);
                totals.incomeCount += 1;
            } else {
                totals.expense = U.round2(totals.expense + amount);
                totals.expenseCount += 1;
            }
        });

        const rows = Object.keys(groups).map(function (key) {
            const group = groups[key];
            group.net = U.round2(group.income - group.expense);
            group.share = totals.total > 0 ? group.total / totals.total : 0;
            group.percent = group.share * 100;
            group.average = group.count ? U.round2(group.total / group.count) : 0;
            return group;
        }).sort(function (a, b) {
            /* Les méthodes sans montant précisé passent toujours en dernier */
            const aUnknown = a.method === UNKNOWN ? 1 : 0;
            const bUnknown = b.method === UNKNOWN ? 1 : 0;
            if (aUnknown !== bUnknown) return aUnknown - bUnknown;
            return b.total - a.total || a.method.localeCompare(b.method);
        });

        totals.methodsUsed = rows.filter(function (row) { return row.method !== UNKNOWN; }).length;
        totals.untracked = rows.filter(function (row) { return row.method === UNKNOWN; })
            .reduce(function (n, row) { return n + row.count; }, 0);

        return { rows: rows, totals: totals, methodsUsed: totals.methodsUsed };
    }

    /** Totaux généraux, toutes méthodes confondues. */
    function getPaymentTotals(list) {
        return getPaymentBreakdown(list).totals;
    }

    /**
     * Range les transactions en groupes par moyen de paiement.
     * @returns {Array<{method, emoji, color, items: Array, totals: Object}>}
     */
    function groupByPayment(list, options) {
        const opts = options || {};
        const source = (list || data.getAllTransactions()).slice();
        const byMethod = {};

        source.forEach(function (item) {
            const key = item.paymentMethod || UNKNOWN;
            if (!byMethod[key]) byMethod[key] = [];
            byMethod[key].push(item);
        });

        const order = getPaymentBreakdown(source).rows.map(function (row) { return row.method; });

        return order.map(function (method) {
            const items = byMethod[method] || [];
            const income = sum(items.filter(function (i) { return i.type === "income"; }));
            const expense = sum(items.filter(function (i) { return i.type === "expense"; }));
            return {
                method: method,
                emoji: method === UNKNOWN ? "❔" : U.paymentEmoji(method),
                color: U.paymentColor(method === UNKNOWN ? null : method),
                items: opts.sortItems === false ? items : items.slice().sort(function (a, b) {
                    if (a.date === b.date) return b.amount - a.amount;
                    return a.date < b.date ? 1 : -1;
                }),
                totals: {
                    count: items.length,
                    income: U.round2(income),
                    expense: U.round2(expense),
                    net: U.round2(income - expense),
                    total: U.round2(income + expense)
                }
            };
        });
    }

    /* ======================================================================
       1 bis. SOLDES PAR PORTEFEUILLE (tous les moyens de paiement)
       ----------------------------------------------------------------------
       solde actuel = solde de départ + revenus reçus − dépenses payées
       Le solde de départ se règle dans les Paramètres (ou depuis le tableau
       de bord) : sans lui, on ne voit que le mouvement enregistré.
       ====================================================================== */

    /**
     * Solde de chaque moyen de paiement, y compris ceux sans mouvement.
     * @param {Array} [list] transactions prises en compte (par défaut : toutes)
     * @returns {{rows: Array, totals: Object}}
     */
    function getWalletBalances(list) {
        const source = list || data.getAllTransactions();
        const breakdown = getPaymentBreakdown(source);
        const openings = data.getWallets() || {};
        const byMethod = {};
        breakdown.rows.forEach(function (row) { byMethod[row.method] = row; });

        const rows = U.PAYMENT_METHODS.map(function (method) {
            const row = byMethod[method];
            const opening = U.toNumber(openings[method] || 0);
            const income = row ? row.income : 0;
            const expense = row ? row.expense : 0;
            const balance = U.round2(opening + income - expense);
            return {
                method: method,
                emoji: U.paymentEmoji(method),
                color: U.paymentColor(method),
                opening: opening,
                hasOpening: Object.prototype.hasOwnProperty.call(openings, method),
                income: income,
                expense: expense,
                balance: balance,
                count: row ? row.count : 0,
                lastDate: row ? row.lastDate : "",
                negative: balance < 0,
                isEmpty: !row && !Object.prototype.hasOwnProperty.call(openings, method),
                movement: U.round2(income - expense)
            };
        });

        /* Marge : les transactions importées sans moyen de paiement ne peuvent
           pas être rattachées à un portefeuille ; on les signale à part. */
        const unknown = byMethod[UNKNOWN];
        if (unknown) {
            rows.push({
                method: UNKNOWN,
                emoji: "❔",
                color: U.paymentColor(null),
                opening: 0, hasOpening: false,
                income: unknown.income, expense: unknown.expense,
                balance: U.round2(unknown.income - unknown.expense),
                count: unknown.count, lastDate: unknown.lastDate,
                negative: false, isEmpty: false, untracked: true
            });
        }

        const tracked = rows.filter(function (row) { return !row.untracked; });
        const totals = {
            opening: U.round2(tracked.reduce(function (t, r) { return t + r.opening; }, 0)),
            income: U.round2(tracked.reduce(function (t, r) { return t + r.income; }, 0)),
            expense: U.round2(tracked.reduce(function (t, r) { return t + r.expense; }, 0)),
            balance: U.round2(tracked.reduce(function (t, r) { return t + r.balance; }, 0)),
            count: tracked.reduce(function (t, r) { return t + r.count; }, 0),
            active: tracked.filter(function (r) { return !r.isEmpty; }).length,
            negativeCount: tracked.filter(function (r) { return r.negative; }).length,
            untracked: unknown ? unknown.count : 0,
            untrackedBalance: unknown ? U.round2(unknown.income - unknown.expense) : 0
        };

        return { rows: rows, totals: totals };
    }

    function getWalletTotal() {
        return getWalletBalances().totals;
    }

    /** Solde d'un seul portefeuille. */
    function getWalletBalance(method) {
        const found = getWalletBalances().rows.filter(function (row) { return row.method === method; })[0];
        return found ? found.balance : 0;
    }

    /** Définit (ou efface) le solde de départ d'un portefeuille. */
    function setOpeningBalance(method, amount) {
        const value = data.setWallet(method, amount);
        U.bus.emit("data:changed", { type: "wallets", action: "update", method: method });
        /* Les écrans qui ne suivent pas data:changed (Paramètres, carte du
           tableau de bord) écoutent cet événement dédié. */
        U.bus.emit("wallets:changed", { action: "update", method: method });
        return value;
    }

    /* ======================================================================
       2. RENDU — CARTE DES TOTAUX PAR MOYEN DE PAIEMENT
       ====================================================================== */

    /**
     * Carte complète : une ligne par moyen de paiement + total général.
     * Un clic sur une ligne filtre la liste sur ce moyen de paiement.
     *
     * @param {string|Element} host cible
     * @param {Array} list transactions prises en compte (après filtres)
     * @param {{onSelect?: Function, compact?: boolean, title?: string}} [options]
     */
    function renderSummary(host, list, options) {
        const opts = options || {};
        const target = typeof host === "string" ? U.qs(host) : host;
        if (!target) return null;

        U.clear(target);

        const breakdown = getPaymentBreakdown(list);
        const rows = breakdown.rows;
        const totals = breakdown.totals;

        const card = U.el("div", { class: "card card-lg pay-summary" });

        const head = U.el("div", { class: "card-head" }, [
            U.el("h3", {}, [
                U.el("span", { text: "💳", attrs: { "aria-hidden": "true" } }),
                U.el("span", { text: opts.title || "Totaux par moyen de paiement" })
            ]),
            U.el("span", { class: "muted", style: { fontSize: "var(--fs-sm)" }, text: rows.length + (rows.length > 1 ? " moyens utilisés" : " moyen utilisé") })
        ]);
        card.appendChild(head);

        if (!rows.length) {
            card.appendChild(U.el("div", { class: "empty", style: { padding: "var(--sp-5)" } }, [
                U.el("div", { class: "empty-ico", text: "💳", attrs: { "aria-hidden": "true" } }),
                U.el("h3", { text: "Aucun moyen de paiement à comparer." }),
                U.el("p", { text: "Ajoutez une transaction en précisant le moyen de paiement (Wave, Orange Money, espèces…) pour voir la répartition." })
            ]));
            target.appendChild(card);
            return card;
        }

        const listEl = U.el("div", { class: "pay-rows" });
        rows.forEach(function (row) {
            const isUnknown = row.method === UNKNOWN;
            const rowEl = U.el(isUnknown || opts.onSelect === null ? "div" : "button", {
                class: "pay-row" + (isUnknown ? " is-unknown" : ""),
                type: isUnknown || opts.onSelect === null ? null : "button",
                dataset: { method: row.method },
                attrs: isUnknown ? {} : { title: "Voir les transactions payées avec " + row.method }
            }, [
                U.el("div", { class: "pay-row-head" }, [
                    U.el("span", { class: "pay-row-name" }, [
                        U.el("span", { class: "pay-dot", style: { background: row.color }, attrs: { "aria-hidden": "true" } }),
                        U.el("span", { text: row.emoji + " " + row.method }),
                        U.el("span", { class: "pay-row-count", text: row.count + (row.count > 1 ? " trans." : " trans.") })
                    ]),
                    U.el("span", { class: "pay-row-total", text: U.formatCurrency(row.total) })
                ]),
                U.el("div", { class: "pay-bar", attrs: { role: "presentation" } }, [
                    U.el("span", {
                        class: "pay-bar-fill",
                        style: { width: Math.max(2, row.percent).toFixed(1) + "%", background: row.color }
                    })
                ]),
                U.el("div", { class: "pay-row-meta" }, [
                    U.el("span", { text: Math.round(row.percent) + " % du total" }),
                    row.expenseCount ? U.el("span", { text: "Dépenses " + U.formatCurrency(row.expense) }) : null,
                    row.incomeCount ? U.el("span", { class: "pos", text: "Reçus " + U.formatCurrency(row.income) }) : null,
                    row.lastDate ? U.el("span", { text: "Dernier usage " + U.formatRelativeDate(row.lastDate) }) : null
                ])
            ]);

            if (!isUnknown && opts.onSelect !== null) {
                rowEl.addEventListener("click", function () {
                    if (typeof opts.onSelect === "function") opts.onSelect(row.method, row);
                    else if (global.FT.tx && global.FT.tx.applyExternalFilters) {
                        global.FT.tx.applyExternalFilters({ paymentMethod: row.method });
                        U.toast("Filtré sur " + row.method, "info", row.count + " transaction(s)");
                    }
                });
            }

            listEl.appendChild(rowEl);
        });
        card.appendChild(listEl);

        /* Total général, toutes méthodes confondues */
        card.appendChild(U.el("div", { class: "pay-grand" }, [
            U.el("div", { class: "pay-grand-main" }, [
                U.el("span", { class: "pay-grand-label", text: "Total général — tous moyens confondus" }),
                U.el("span", { class: "pay-grand-value", text: U.formatCurrency(totals.total) })
            ]),
            U.el("div", { class: "pay-grand-detail" }, [
                U.el("span", { text: totals.count + " transaction" + (totals.count > 1 ? "s" : "") }),
                U.el("span", { text: "Dépenses " + U.formatCurrency(totals.expense) + " (" + totals.expenseCount + ")" }),
                U.el("span", { class: "pos", text: "Revenus " + U.formatCurrency(totals.income) + " (" + totals.incomeCount + ")" }),
                U.el("span", { text: "Solde " + U.formatCurrency(U.round2(totals.income - totals.expense)) })
            ])
        ]));

        if (totals.untracked) {
            card.appendChild(U.el("p", { class: "help", style: { marginTop: "10px" },
                text: totals.untracked + " transaction(s) sans moyen de paiement renseigné. Modifiez-les pour un suivi complet." }));
        }

        target.appendChild(card);
        return card;
    }

    /* ======================================================================
       3. RENDU — ÉTIQUETTES DE GROUPE (liste rangée par moyen de paiement)
       ====================================================================== */

    /**
     * Bandeau de groupe utilisé quand la liste est rangée par moyen de paiement.
     * @param {{method, emoji, color, items, totals}} group
     */
    function buildGroupLabel(group) {
        return U.el("div", {
            class: "tx-group-label pay-group",
            style: { "--pay-color": group.color }
        }, [
            U.el("span", { class: "pay-dot", style: { background: group.color }, attrs: { "aria-hidden": "true" } }),
            U.el("span", { class: "pay-group-name", text: group.emoji + " " + group.method }),
            U.el("span", { class: "pay-group-count", text: group.totals.count + (group.totals.count > 1 ? " transactions" : " transaction") }),
            U.el("span", { class: "pay-group-total", text: U.formatCurrency(group.totals.total) })
        ]);
    }

    /* ======================================================================
       4. RENDU — VERSION COMPACTE (analyse, tableau de bord)
       ====================================================================== */

    /**
     * Liste condensée : les N premiers moyens de paiement + total général.
     * @param {string|Element} host
     * @param {Array} list
     * @param {{limit?: number, title?: string, onSelect?: Function}} [options]
     */
    function renderCompact(host, list, options) {
        const opts = options || {};
        const target = typeof host === "string" ? U.qs(host) : host;
        if (!target) return null;

        U.clear(target);

        const breakdown = getPaymentBreakdown(list);
        const limit = opts.limit || 4;
        const shown = breakdown.rows.slice(0, limit);
        const hidden = breakdown.rows.slice(limit).length;

        if (!shown.length) {
            target.appendChild(U.el("div", { class: "empty", style: { padding: "var(--sp-4) 0" } }, [
                U.el("div", { class: "empty-ico", text: "💳", attrs: { "aria-hidden": "true" } }),
                U.el("p", { class: "muted", text: "Aucune transaction à répartir pour l'instant." })
            ]));
            return target;
        }

        const wrap = U.el("div", { class: "pay-rows is-compact" });
        shown.forEach(function (row) {
            wrap.appendChild(U.el("div", { class: "pay-row is-static", dataset: { method: row.method } }, [
                U.el("div", { class: "pay-row-head" }, [
                    U.el("span", { class: "pay-row-name" }, [
                        U.el("span", { class: "pay-dot", style: { background: row.color }, attrs: { "aria-hidden": "true" } }),
                        U.el("span", { text: row.emoji + " " + row.method }),
                        U.el("span", { class: "pay-row-count", text: Math.round(row.percent) + " %" })
                    ]),
                    U.el("span", { class: "pay-row-total", text: U.formatCurrency(row.total) })
                ]),
                U.el("div", { class: "pay-bar" }, [
                    U.el("span", { class: "pay-bar-fill", style: { width: Math.max(2, row.percent).toFixed(1) + "%", background: row.color } })
                ])
            ]));
        });
        target.appendChild(wrap);

        target.appendChild(U.el("div", { class: "pay-grand is-compact" }, [
            U.el("span", { class: "pay-grand-label", text: "Total général" }),
            U.el("span", { class: "pay-grand-value", text: U.formatCurrency(breakdown.totals.total) })
        ]));

        if (hidden) {
            target.appendChild(U.el("p", { class: "help", style: { marginTop: "8px" },
                text: "+ " + hidden + " autre(s) moyen(s) de paiement — voir le détail sur la page Transactions." }));
        }

        return target;
    }

    /* ======================================================================
       4 bis. RENDU — SOLDES DES PORTEFEUILLES (tableau de bord)
       ====================================================================== */

    /**
     * Grille de tuiles : un portefeuille par moyen de paiement, avec son solde
     * actualisé. Tous les moyens sont affichés, même ceux sans mouvement.
     * @param {string|Element} host
     * @param {{onEdit?: Function, showEmpty?: boolean, limit?: number}} [options]
     */
    function renderWallets(host, options) {
        const opts = options || {};
        const target = typeof host === "string" ? U.qs(host) : host;
        if (!target) return null;

        U.clear(target);

        const result = getWalletBalances();
        const rows = opts.showEmpty === false
            ? result.rows.filter(function (row) { return !row.isEmpty; })
            : result.rows;
        const totals = result.totals;

        /* --- Bandeau de tête : solde total disponible --- */
        const head = U.el("div", { class: "wallet-total" + (totals.balance < 0 ? " is-negative" : "") }, [
            U.el("div", { class: "wallet-total-main" }, [
                U.el("span", { class: "wallet-total-label", text: "Total disponible" }),
                U.el("span", { class: "wallet-total-value", text: U.formatCurrency(totals.balance) })
            ]),
            U.el("div", { class: "wallet-total-detail" }, [
                U.el("span", { text: totals.active + " portefeuille" + (totals.active > 1 ? "s" : "") + " suivi" + (totals.active > 1 ? "s" : "") }),
                U.el("span", { text: "Entrées " + U.formatCurrency(totals.income) }),
                U.el("span", { text: "Sorties " + U.formatCurrency(totals.expense) }),
                totals.opening ? U.el("span", { text: "Soldes de départ " + U.formatCurrency(totals.opening) }) : null
            ])
        ]);
        target.appendChild(head);

        if (totals.negativeCount) {
            target.appendChild(U.el("div", { class: "alert warn", style: { marginTop: "12px" } }, [
                U.el("span", { class: "alert-ico", text: "⚠️", attrs: { "aria-hidden": "true" } }),
                U.el("div", {}, [
                    U.el("div", { class: "alert-title", text: totals.negativeCount + " portefeuille" + (totals.negativeCount > 1 ? "s" : "") + " à solde négatif" }),
                    U.el("div", { class: "muted", text: "Soit le solde de départ est trop bas, soit une dépense a été saisie deux fois. Un coup d'œil suffit généralement à corriger." })
                ])
            ]));
        }

        /* --- Tuiles cliquables : filtrent les transactions par moyen de paiement --- */
        const grid = U.el("div", { class: "wallet-grid" });
        rows.forEach(function (row) {
            const isClickable = !row.untracked;
            const tile = U.el(isClickable ? "button" : "div", {
                class: "wallet-tile" + (row.negative ? " is-negative" : "") + (row.isEmpty ? " is-empty" : "") + (row.untracked ? " is-untracked" : "") + (isClickable ? " is-clickable" : ""),
                type: isClickable ? "button" : null,
                style: { "--pay-color": row.color },
                dataset: { method: row.method, action: "filter-wallet" },
                attrs: {
                    title: row.untracked
                        ? "Transactions sans moyen de paiement (données importées)"
                        : "Filtrer les transactions : " + row.method + " · " + U.formatCurrency(row.balance),
                    "aria-label": row.untracked
                        ? row.method + " — " + row.count + " transactions"
                        : "Portefeuille " + row.method + ", solde " + U.formatCurrency(row.balance) + ", " + row.count + " mouvements. Cliquer pour filtrer."
                },
                on: isClickable ? {
                    click: function () {
                        if (global.FT.mobile && global.FT.mobile.haptic) global.FT.mobile.haptic("light");
                        if (typeof opts.onSelect === "function") {
                            opts.onSelect(row.method, row);
                        } else if (global.FT.tx && global.FT.tx.applyExternalFilters) {
                            global.FT.tx.applyExternalFilters({ paymentMethod: row.method });
                            U.toast("Filtré sur " + row.method, "info", row.count + " transaction(s) · " + U.formatCurrency(row.balance));
                            if (global.FT.router && global.FT.router.navigate) {
                                global.FT.router.navigate("transactions");
                            } else {
                                const txLink = U.qs('a[href*=\"transactions\"]');
                                if (txLink) txLink.click();
                                else location.hash = "#transactions";
                            }
                        } else {
                            /* Fallback : ouvre le détail du portefeuille */
                            U.toast(row.method, "info", "Solde " + U.formatCurrency(row.balance) + " · " + row.count + " mouvement(s)");
                        }
                    }
                } : {}
            }, [
                U.el("div", { class: "wallet-head" }, [
                    U.el("span", { class: "pay-dot", style: { background: row.color }, attrs: { "aria-hidden": "true" } }),
                    U.el("span", { class: "wallet-name", text: row.untracked ? "Non précisé" : (row.emoji + " " + row.method) })
                ]),
                U.el("div", { class: "wallet-value", text: U.formatCurrency(row.balance) }),
                U.el("div", { class: "wallet-meta" }, row.untracked
                    ? [U.el("span", { text: row.count + " transaction(s) sans moyen renseigné" })]
                    : [
                        U.el("span", { text: row.count ? row.count + " mouvement" + (row.count > 1 ? "s" : "") : "Aucun mouvement" }),
                        row.hasOpening ? U.el("span", { text: "départ " + U.formatCurrency(row.opening) }) : null,
                        row.negative ? U.el("span", { class: "neg", text: "solde négatif" }) : null
                    ].filter(Boolean)
                ),
                U.el("div", { class: "wallet-bar" }, [
                    U.el("span", {
                        class: "wallet-bar-in",
                        style: { width: shareOf(row.income, totals) + "%" }
                    }),
                    U.el("span", {
                        class: "wallet-bar-out",
                        style: { width: shareOf(row.expense, totals) + "%" }
                    })
                ])
            ]);
            grid.appendChild(tile);
        });
        target.appendChild(grid);

        /* --- Pied : action d'ajustement + marge --- */
        const foot = U.el("div", { class: "wallet-foot" }, [
            opts.showEdit === false ? null : U.el("button", {
                class: "btn btn-ghost btn-sm", type: "button", text: "✏️ Ajuster les soldes de départ",
                attrs: { "aria-label": "Modifier le solde de départ de chaque portefeuille" },
                on: {
                    click: function () {
                        if (typeof opts.onEdit === "function") opts.onEdit();
                        else if (global.FT.app && global.FT.app.openWalletsForm) global.FT.app.openWalletsForm();
                    }
                }
            }),
            U.el("span", { class: "help", text: "Solde = départ + entrées − sorties" })
        ]);
        target.appendChild(foot);

        if (totals.untracked) {
            target.appendChild(U.el("p", { class: "help", style: { marginTop: "6px" },
                text: totals.untracked + " transaction(s) sans moyen de paiement ne sont pas rattachées à un portefeuille." }));
        }

        return target;
    }

    /** Largeur d'une barre proportionnelle au plus gros flux affiché. */
    function shareOf(value, totals) {
        const max = Math.max(totals.income, totals.expense, 1);
        return Math.max(0, Math.min(100, (U.toNumber(value) / max) * 100)).toFixed(1);
    }

    /* ======================================================================
       5. EXPORT CSV — RÉPARTITION PAR MOYEN DE PAIEMENT
       ====================================================================== */

    function exportToCSV(list) {
        const breakdown = getPaymentBreakdown(list);
        if (!breakdown.rows.length) {
            U.toast("Rien à exporter", "info", "Aucune transaction à répartir.");
            return null;
        }

        const header = ["Moyen de paiement", "Nb transactions", "Total", "Depenses", "Nb depenses",
            "Revenus", "Nb revenus", "Part (%)"];
        const rows = breakdown.rows.map(function (row) {
            return [
                row.method,
                String(row.count),
                String(row.total).replace(".", ","),
                String(row.expense).replace(".", ","),
                String(row.expenseCount),
                String(row.income).replace(".", ","),
                String(row.incomeCount),
                row.percent.toFixed(1).replace(".", ",")
            ].join(";");
        });
        const totals = breakdown.totals;
        rows.push([
            "TOTAL GENERAL", String(totals.count), String(totals.total).replace(".", ","),
            String(totals.expense).replace(".", ","), String(totals.expenseCount),
            String(totals.income).replace(".", ","), String(totals.incomeCount), "100,0"
        ].join(";"));

        const csv = "\uFEFF" + header.join(";") + "\n" + rows.join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = U.el("a", { href: url, download: "finatrack-moyens-paiement-" + U.todayISO() + ".csv" });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        U.toast("Répartition exportée", "success", breakdown.rows.length + " moyen(s) de paiement");
        return csv;
    }

    /* ======================================================================
       6. API
       ====================================================================== */

    const api = {
        UNKNOWN: UNKNOWN,
        getPaymentBreakdown: getPaymentBreakdown,
        getPaymentTotals: getPaymentTotals,
        groupByPayment: groupByPayment,
        getWalletBalances: getWalletBalances,
        getWalletBalance: getWalletBalance,
        getWalletTotal: getWalletTotal,
        setOpeningBalance: setOpeningBalance,
        renderWallets: renderWallets,
        renderSummary: renderSummary,
        renderCompact: renderCompact,
        buildGroupLabel: buildGroupLabel,
        exportToCSV: exportToCSV
    };

    global.FT.payments = api;

    /* Fonctions globales du cahier des charges */
    global.getWalletBalances = getWalletBalances;
    global.getPaymentBreakdown = getPaymentBreakdown;
    global.getPaymentTotals = getPaymentTotals;
    global.groupByPayment = groupByPayment;
})(window);
