/* ==========================================================================
   FinaTrack CI — app.js
   Amorçage de l'application, formulaires (dépense, revenu, ajout rapide),
   navigation, page Paramètres, données de démonstration, thème.
   ========================================================================== */
(function (global) {
    "use strict";

    const U = global.FT.utils;
    const data = global.FT.data;
    const EXP = global.FT.expenses;
    const INC = global.FT.incomes;
    const BUD = global.FT.budget;

    /* ======================================================================
       1. NAVIGATION
       ====================================================================== */

    function currentPageName() {
        const pageNode = U.qs("[data-page]");
        return pageNode ? pageNode.dataset.page : "dashboard";
    }

    function markActiveNav() {
        const current = currentPageName();
        U.qsa("[data-nav]").forEach(function (link) {
            const target = link.dataset.nav;
            if (target === current) link.setAttribute("aria-current", "page");
            else link.removeAttribute("aria-current");
        });
        const title = U.qs("#topbarTitle");
        if (title) {
            const label = {
                dashboard: "Tableau de bord",
                transactions: "Transactions",
                incomes: "Revenus",
                budget: "Budget",
                analysis: "Analyses",
                settings: "Paramètres"
            }[current];
            if (label) title.textContent = label;
        }
        document.title = (title && title.textContent ? title.textContent + " · " : "") + "FinaTrack CI — Comprenez où va votre argent";
    }

    /* ======================================================================
       2. CHAMPS RÉUTILISABLES
       ====================================================================== */

    /** Champ montant avec raccourcis. */
    function amountField(config) {
        const cfg = config || {};
        const input = U.el("input", {
            class: "input", type: "text", inputmode: "decimal", id: cfg.id || "amount",
            placeholder: cfg.placeholder || "Ex. 2 000", autocomplete: "off", "data-autofocus": cfg.autofocus ? "" : null,
            value: cfg.value ? U.formatNumber(cfg.value) : ""
        });

        const field = U.el("div", { class: "field", id: (cfg.id || "amount") + "Field" }, [
            U.el("label", { for: cfg.id || "amount", html: (cfg.label || "Montant") + ' <span class="req" aria-hidden="true">*</span>' }),
            U.el("div", { class: "amount-field" }, [
                input,
                U.el("span", { class: "suffix", text: U.currencySymbol() })
            ]),
            U.el("div", { class: "error-msg", attrs: { role: "alert" } }),
            U.el("div", { class: "amount-suggest", style: { marginTop: "8px" } },
                (cfg.presets || [500, 1000, 2000, 5000, 10000, 25000]).map(function (value) {
                    return U.el("button", {
                        class: "chip", type: "button", text: U.formatNumber(value),
                        on: { click: function () { input.value = U.formatNumber(value); input.focus(); } }
                    });
                }))
        ]);

        /* Formatage lisible quand on quitte le champ */
        input.addEventListener("blur", function () {
            const parsed = U.parseAmountInput(input.value);
            if (parsed > 0) input.value = U.formatNumber(parsed);
        });

        return { field: field, input: input };
    }

    /** Champ catégorie : sélecteur natif + pastilles rapides. */
    function categoryField(config) {
        const cfg = config || {};
        const select = U.el("select", { class: "select", id: cfg.id || "category" },
            U.CATEGORIES.map(function (category) {
                return U.el("option", {
                    value: category, text: U.categoryEmoji(category) + " " + category,
                    selected: category === (cfg.value || "Alimentation")
                });
            }));

        const quick = ["Alimentation", "Transport", "Logement", "Internet", "Loisirs", "Famille", "Santé", "Autres"];
        const chips = U.el("div", { class: "chip-select", style: { marginTop: "8px" } },
            quick.map(function (category) {
                return U.el("button", {
                    class: "chip" + (category === cfg.value ? " is-active" : ""), type: "button",
                    text: U.categoryEmoji(category) + " " + category,
                    attrs: { "aria-pressed": category === cfg.value ? "true" : "false" },
                    on: {
                        click: function (e) {
                            select.value = category;
                            U.qsa(".chip", chips).forEach(function (chip) { chip.classList.remove("is-active"); chip.setAttribute("aria-pressed", "false"); });
                            e.currentTarget.classList.add("is-active");
                            e.currentTarget.setAttribute("aria-pressed", "true");
                        }
                    }
                });
            }));

        /* Repère local : exemples concrets tirés du quotidien abidjanais */
        const hint = U.el("p", { class: "field-hint", text: U.categoryHint(select.value) });

        function syncHint() {
            const context = U.categoryHint(select.value);
            U.clear(hint);
            if (context) hint.appendChild(U.el("span", { text: "Dans votre quotidien : " }));
            hint.appendChild(U.el("span", { text: context }));
        }

        select.addEventListener("change", function () {
            syncHint();
            U.qsa(".chip", chips).forEach(function (chip) {
                const isActive = chip.textContent.indexOf(select.value) !== -1;
                chip.classList.toggle("is-active", isActive);
                chip.setAttribute("aria-pressed", isActive ? "true" : "false");
            });
        });

        const field = U.el("div", { class: "field", id: (cfg.id || "category") + "Field" }, [
            U.el("label", { for: cfg.id || "category", html: (cfg.label || "Catégorie") + ' <span class="req" aria-hidden="true">*</span>' }),
            select,
            U.el("div", { class: "error-msg", attrs: { role: "alert" } }),
            chips,
            hint
        ]);

        syncHint();

        return { field: field, select: select, hint: hint };
    }

    /** Champ mode de paiement. */
    function paymentField(config) {
        const cfg = config || {};
        return U.el("div", { class: "field", id: (cfg.id || "payment") + "Field" }, [
            U.el("label", { for: cfg.id || "payment", text: cfg.label || "Mode de paiement" }),
            U.el("select", { class: "select", id: cfg.id || "payment" },
                U.PAYMENT_METHODS.map(function (method) {
                    return U.el("option", {
                        value: method, text: U.paymentEmoji(method) + " " + method,
                        selected: method === (cfg.value || "Espèces")
                    });
                }))
        ]);
    }

    /** Champ date avec raccourcis Aujourd'hui / Hier. */
    function dateField(config) {
        const cfg = config || {};
        const input = U.el("input", {
            class: "input", type: "date", id: cfg.id || "date", value: cfg.value || U.todayISO(),
            max: U.toISODate(U.addDays(new Date(), 1))
        });

        const chips = U.el("div", { class: "chip-select", style: { marginTop: "8px" } }, [
            U.el("button", { class: "chip", type: "button", text: "Aujourd'hui", on: { click: function () { input.value = U.todayISO(); } } }),
            U.el("button", { class: "chip", type: "button", text: "Hier", on: { click: function () { input.value = U.toISODate(U.addDays(new Date(), -1)); } } })
        ]);

        return {
            field: U.el("div", { class: "field", id: (cfg.id || "date") + "Field" }, [
                U.el("label", { for: cfg.id || "date", html: (cfg.label || "Date") + ' <span class="req" aria-hidden="true">*</span>' }),
                input,
                U.el("div", { class: "error-msg", attrs: { role: "alert" } }),
                chips
            ]),
            input: input
        };
    }

    function descriptionField(config) {
        const cfg = config || {};
        return U.el("div", { class: "field", id: (cfg.id || "description") + "Field" }, [
            U.el("label", { for: cfg.id || "description", text: cfg.label || "Description" }),
            U.el("input", {
                class: "input", type: "text", id: cfg.id || "description", maxlength: "160",
                placeholder: cfg.placeholder || "Ex. Taxi pour le travail", value: cfg.value || ""
            }),
            U.el("div", { class: "help", text: cfg.help || "Facultatif — aidez-vous à reconnaître la dépense plus tard." })
        ]);
    }

    /** Affiche les erreurs de validation près des champs concernés. */
    function showFormErrors(form, errors) {
        const box = U.qs(".form-error", form);
        if (box) { box.textContent = ""; box.classList.remove("is-shown"); }

        ["amount", "category", "date", "payment", "source", "description"].forEach(function (key) {
            const field = U.qs("#" + key + "Field", form);
            if (!field) return;
            const msg = U.qs(".error-msg", field);
            const hasError = !!errors[key];
            field.classList.toggle("has-error", hasError);
            if (msg) {
                msg.textContent = errors[key] || "";
                msg.classList.toggle("is-shown", hasError);
            }
        });

        if (errors.global && box) {
            box.textContent = errors.global;
            box.classList.add("is-shown");
        }

        /* Focus sur le premier champ en erreur (accessibilité) */
        const firstKey = Object.keys(errors)[0];
        if (firstKey && firstKey !== "global") {
            const input = U.qs("#" + firstKey, form);
            if (input) { input.focus(); if (input.select) input.select(); }
        } else {
            const box2 = U.qs(".form-error", form);
            if (box2) box2.focus();
        }
    }

    function clearFormErrors(form) {
        U.qsa(".has-error", form).forEach(function (node) { node.classList.remove("has-error"); });
        U.qsa(".error-msg.is-shown", form).forEach(function (node) { node.classList.remove("is-shown"); });
        const box = U.qs(".form-error", form);
        if (box) box.classList.remove("is-shown");
    }

    /* ======================================================================
       3. FORMULAIRE DÉPENSE (ajout / modification)
       ====================================================================== */

    /**
     * Ouvre le formulaire de dépense.
     * @param {Object|null} record  dépense existante à modifier
     * @param {Object} [draft]      préremplissage (ex. issue de la voix)
     */
    function openExpenseForm(record, draft) {
        const source = record || draft || {};
        const isEdit = !!record;
        const titleId = "expenseFormTitle";

        const amount = amountField({
            id: "amount", label: "Montant", value: source.amount || "", autofocus: !isEdit,
            presets: [500, 1000, 2000, 5000, 10000, 25000]
        });
        const category = categoryField({ id: "category", label: "Catégorie", value: source.category || "Alimentation" });
        const date = dateField({ id: "date", label: "Date", value: source.date || U.todayISO() });
        const description = descriptionField({
            id: "description", label: "Description", value: source.description || "",
            placeholder: "Ex. Taxi pour le travail"
        });
        const payment = paymentField({ id: "payment", label: "Mode de paiement", value: source.paymentMethod || "Espèces" });

        const form = U.el("form", { class: "form", novalidate: "novalidate", id: "expenseForm" }, [
            amount.field,
            U.el("div", { class: "form-grid" }, [category.field, date.field]),
            description,
            payment,
            U.el("div", { class: "form-error", attrs: { role: "alert", tabindex: "-1" } })
        ]);

        const panel = U.el("div", { class: "modal-panel", attrs: { "aria-labelledby": titleId } }, [
            U.el("div", { class: "modal-grip", attrs: { "aria-hidden": "true" } }),
            U.el("div", { class: "modal-head" }, [
                U.el("div", {}, [
                    U.el("h2", { id: titleId, text: isEdit ? "✏️ Modifier la dépense" : "💸 Ajouter une dépense" }),
                    U.el("p", { class: "modal-sub", text: isEdit ? "Mettez à jour les informations puis enregistrez." : "Quelques secondes suffisent pour garder une trace claire." })
                ]),
                U.el("button", { class: "icon-btn", type: "button", text: "✕", attrs: { "aria-label": "Fermer" }, on: { click: function () { modal.close(); } } })
            ]),
            form,
            U.el("div", { class: "modal-foot" }, [
                U.el("button", { class: "btn btn-ghost", type: "button", text: "Annuler", on: { click: function () { modal.close(); } } }),
                U.el("button", {
                    class: "btn btn-primary", type: "submit", form: "expenseForm",
                    text: isEdit ? "Enregistrer les modifications" : "✓ Enregistrer la dépense"
                }),
                !isEdit ? U.el("button", {
                    class: "btn btn-accent", type: "button", text: "🎙️", attrs: { "aria-label": "Ajouter par la voix", title: "Ajouter par la voix" },
                    on: { click: function () { modal.close(); global.FT.voice.open(); } }
                }) : null
            ])
        ]);

        const modal = U.openModal(panel, { labelledBy: titleId });

        form.addEventListener("submit", function (e) {
            e.preventDefault();
            clearFormErrors(form);

            const payload = {
                amount: amount.input.value,
                category: category.select.value,
                description: U.qs("#description", form).value,
                date: date.input.value,
                paymentMethod: payment.querySelector("#payment").value,
                source: source.source === "voice" ? "voice" : "manual"
            };

            const result = isEdit
                ? EXP.updateExpense(record.id, payload)
                : EXP.addExpense(payload);

            if (!result.ok) {
                showFormErrors(form, result.errors);
                U.toast("Vérifiez le formulaire", "error", Object.values(result.errors)[0]);
                return;
            }

            modal.close();
            U.toast(isEdit ? "Transaction modifiée" : "Dépense enregistrée", "success",
                U.formatCurrency(result.data.amount) + " · " + result.data.category);
        });

        return modal;
    }

    /* ======================================================================
       4. FORMULAIRE REVENU (§29)
       ====================================================================== */

    function openIncomeForm(record, draft) {
        const source = record || draft || {};
        const isEdit = !!record;
        const titleId = "incomeFormTitle";

        const amount = amountField({
            id: "amount", label: "Montant reçu", value: source.amount || "",
            presets: [25000, 50000, 100000, 150000, 200000, 500000]
        });

        const sourceSelect = U.el("select", { class: "select", id: "source" },
            U.INCOME_SOURCES.map(function (s) {
                return U.el("option", { value: s, text: U.sourceEmoji(s) + " " + s, selected: s === (source.source || "Salaire") });
            }));

        const fieldSource = U.el("div", { class: "field", id: "sourceField" }, [
            U.el("label", { for: "source", html: 'Source <span class="req" aria-hidden="true">*</span>' }),
            sourceSelect,
            U.el("div", { class: "error-msg", attrs: { role: "alert" } })
        ]);

        const date = dateField({ id: "date", label: "Date de réception", value: source.date || U.todayISO() });
        const description = descriptionField({
            id: "description", label: "Description", value: source.description || "",
            placeholder: "Ex. Salaire de septembre", help: "Facultatif — précisez l'origine du revenu."
        });
        const payment = paymentField({ id: "payment", label: "Mode de réception", value: source.paymentMethod || "Espèces" });

        const form = U.el("form", { class: "form", novalidate: "novalidate", id: "incomeForm" }, [
            amount.field,
            U.el("div", { class: "form-grid" }, [fieldSource, date.field]),
            description,
            payment,
            U.el("div", { class: "form-error", attrs: { role: "alert", tabindex: "-1" } })
        ]);

        const panel = U.el("div", { class: "modal-panel", attrs: { "aria-labelledby": titleId } }, [
            U.el("div", { class: "modal-grip", attrs: { "aria-hidden": "true" } }),
            U.el("div", { class: "modal-head" }, [
                U.el("div", {}, [
                    U.el("h2", { id: titleId, text: isEdit ? "✏️ Modifier le revenu" : "💰 Ajouter un revenu" }),
                    U.el("p", { class: "modal-sub", text: "Salaire, vente, freelance, aide reçue… tout compte." })
                ]),
                U.el("button", { class: "icon-btn", type: "button", text: "✕", attrs: { "aria-label": "Fermer" }, on: { click: function () { modal.close(); } } })
            ]),
            form,
            U.el("div", { class: "modal-foot" }, [
                U.el("button", { class: "btn btn-ghost", type: "button", text: "Annuler", on: { click: function () { modal.close(); } } }),
                U.el("button", {
                    class: "btn btn-primary", type: "submit", form: "incomeForm",
                    text: isEdit ? "Enregistrer les modifications" : "✓ Enregistrer le revenu"
                })
            ])
        ]);

        const modal = U.openModal(panel, { labelledBy: titleId });

        form.addEventListener("submit", function (e) {
            e.preventDefault();
            clearFormErrors(form);

            const payload = {
                amount: amount.input.value,
                source: sourceSelect.value,
                description: U.qs("#description", form).value,
                date: date.input.value,
                paymentMethod: payment.querySelector("#payment").value
            };

            const result = isEdit ? INC.updateIncome(record.id, payload) : INC.addIncome(payload);
            if (!result.ok) {
                showFormErrors(form, result.errors);
                U.toast("Vérifiez le formulaire", "error", Object.values(result.errors)[0]);
                return;
            }

            modal.close();
            U.toast(isEdit ? "Transaction modifiée" : "Revenu enregistré", "success",
                "+" + U.formatCurrency(result.data.amount) + " · " + result.data.source);
        });

        return modal;
    }

    /* ======================================================================
       5. AJOUT RAPIDE (§13)
       ====================================================================== */

    function openQuickAdd() {
        const titleId = "quickAddTitle";
        const amount = amountField({
            id: "amount", label: "Montant", autofocus: true,
            presets: [500, 1000, 2000, 2500, 5000, 10000]
        });
        const category = categoryField({ id: "category", label: "Catégorie", value: "Transport" });

        const more = U.el("div", { class: "stack hidden", style: { gap: "14px" } }, [
            descriptionField({ id: "description", label: "Description (facultatif)", placeholder: "Ex. Taxi Yopougon → Plateau" }),
            paymentField({ id: "payment", label: "Payé avec (facultatif)", value: "Espèces" })
        ]);

        const toggleMore = U.el("button", {
            class: "btn btn-ghost btn-sm", type: "button", text: "+ Plus d'options",
            attrs: { "aria-expanded": "false" },
            on: {
                click: function (e) {
                    const hidden = more.classList.toggle("hidden");
                    e.currentTarget.textContent = hidden ? "+ Plus d'options" : "− Moins d'options";
                    e.currentTarget.setAttribute("aria-expanded", hidden ? "false" : "true");
                }
            }
        });

        const form = U.el("form", { class: "form", novalidate: "novalidate", id: "quickForm" }, [
            amount.field,
            category.field,
            more,
            toggleMore,
            U.el("div", { class: "form-error", attrs: { role: "alert", tabindex: "-1" } })
        ]);

        const panel = U.el("div", { class: "modal-panel modal-narrow", attrs: { "aria-labelledby": titleId } }, [
            U.el("div", { class: "modal-grip", attrs: { "aria-hidden": "true" } }),
            U.el("div", { class: "modal-head" }, [
                U.el("div", {}, [
                    U.el("h2", { id: titleId, text: "⚡ Ajouter une dépense" }),
                    U.el("p", { class: "modal-sub", text: "Montant, catégorie, c'est enregistré. La date est aujourd'hui par défaut." })
                ]),
                U.el("button", { class: "icon-btn", type: "button", text: "✕", attrs: { "aria-label": "Fermer" }, on: { click: function () { modal.close(); } } })
            ]),
            form,
            U.el("div", { class: "modal-foot" }, [
                U.el("button", { class: "btn btn-ghost", type: "button", text: "Annuler", on: { click: function () { modal.close(); } } }),
                U.el("button", { class: "btn btn-primary", type: "submit", form: "quickForm", text: "Enregistrer" })
            ])
        ]);

        const modal = U.openModal(panel, { labelledBy: titleId });

        form.addEventListener("submit", function (e) {
            e.preventDefault();
            clearFormErrors(form);

            const descriptionInput = U.qs("#description", form);
            const paymentSelect = U.qs("#payment", form);

            const result = EXP.addExpense({
                amount: amount.input.value,
                category: category.select.value,
                description: descriptionInput ? descriptionInput.value : "",
                date: U.todayISO(),
                paymentMethod: paymentSelect ? paymentSelect.value : "Espèces",
                source: "manual"
            });

            if (!result.ok) {
                showFormErrors(form, result.errors);
                return;
            }
            modal.close();
            U.toast("Dépense enregistrée", "success", U.formatCurrency(result.data.amount) + " · " + result.data.category);
        });

        return modal;
    }

    /** Menu d'ajout du bouton « + » central. */
    function openAddMenu() {
        const titleId = "addMenuTitle";
        const actions = [
            {
                ico: "⚡", title: "Dépense rapide", desc: "Montant + catégorie, en 5 secondes", cls: "",
                run: function () { modal.close(); openQuickAdd(); }
            },
            {
                ico: "🎙️", title: "Ajouter par la voix", desc: "« J'ai dépensé 2 000 francs pour le taxi »", cls: "is-voice",
                run: function () { modal.close(); global.FT.voice.open(); }
            },
            {
                ico: "💸", title: "Dépense complète", desc: "Avec description, date et mode de paiement", cls: "",
                run: function () { modal.close(); openExpenseForm(); }
            },
            {
                ico: "💰", title: "Revenu", desc: "Salaire, vente, freelance, cadeau", cls: "",
                run: function () { modal.close(); openIncomeForm(); }
            }
        ];

        const panel = U.el("div", { class: "modal-panel modal-narrow", attrs: { "aria-labelledby": titleId } }, [
            U.el("div", { class: "modal-grip", attrs: { "aria-hidden": "true" } }),
            U.el("div", { class: "modal-head" }, [
                U.el("div", {}, [
                    U.el("h2", { id: titleId, text: "Ajouter une transaction" }),
                    U.el("p", { class: "modal-sub", text: "Choisissez votre méthode — la plus rapide reste la voix." })
                ]),
                U.el("button", { class: "icon-btn", type: "button", text: "✕", attrs: { "aria-label": "Fermer" }, on: { click: function () { modal.close(); } } })
            ]),
            U.el("div", { class: "quick-actions" }, actions.map(function (action, index) {
                return U.el("button", {
                    class: "quick-action " + action.cls, type: "button",
                    attrs: index === 1 ? { "data-autofocus": "" } : {},
                    on: { click: action.run }
                }, [
                    U.el("span", { class: "qa-ico", text: action.ico, attrs: { "aria-hidden": "true" } }),
                    U.el("span", {}, [
                        U.el("span", { class: "qa-title", style: { display: "block" }, text: action.title }),
                        U.el("span", { class: "qa-desc", text: action.desc })
                    ]),
                    U.el("span", { class: "qa-chev", text: "›", attrs: { "aria-hidden": "true" } })
                ]);
            }))
        ]);

        const modal = U.openModal(panel, { labelledBy: titleId });
        return modal;
    }

    /* ======================================================================
       6. DONNÉES DE DÉMONSTRATION (§42)
       ====================================================================== */

    function demoRecords() {
        const today = new Date();
        const day = function (offset) { return U.toISODate(U.addDays(today, -offset)); };
        const month = U.monthKey();

        /* Scénario : jeune actif locataire à Cocody — Angré.
           Montants alignés sur les prix réels d'Abidjan (2026) : wôrô-wôrô
           200-500 F, gbaka 200-500 F, garba 500-1 000 F, maquis 1 000-2 500 F,
           forfait internet 5 000 F/10 Go, facture CIE 15 000-100 000 F,
           tontine 10 000-50 000 F/mois, loyer 2 pièces à Angré ≈ 70 000 F. */
        const expenses = [
            { amount: 70000, category: "Logement", description: "Loyer — Angré Château (2 pièces)", date: day(8), paymentMethod: "Virement bancaire" },
            { amount: 18500, category: "Électricité", description: "Facture CIE du mois", date: day(7), paymentMethod: "Orange Money" },
            { amount: 9000, category: "Eau", description: "Facture SODECI", date: day(7), paymentMethod: "Wave" },
            { amount: 25000, category: "Famille", description: "Tontine du mois", date: day(6), paymentMethod: "Wave" },
            { amount: 5000, category: "Internet", description: "Forfait Orange CI — 10 Go", date: day(5), paymentMethod: "Orange Money" },
            { amount: 10000, category: "Abonnements", description: "Canal+ Access", date: day(5), paymentMethod: "Carte bancaire" },
            { amount: 10000, category: "Éducation", description: "Cours de soutien — maths", date: day(4), paymentMethod: "Espèces" },
            { amount: 500, category: "Transport", description: "Gbaka Angré → Adjamé", date: day(3), paymentMethod: "Espèces" },
            { amount: 700, category: "Alimentation", description: "Garba au marché Cocovico", date: day(3), paymentMethod: "Espèces" },
            { amount: 12000, category: "Shopping", description: "Pagne et chaussures — marché", date: day(2), paymentMethod: "MTN Mobile Money" },
            { amount: 4500, category: "Santé", description: "Pharmacie 8e Tranche — palu", date: day(2), paymentMethod: "Espèces" },
            { amount: 2500, category: "Alimentation", description: "Attiéké poisson au maquis", date: day(1), paymentMethod: "Espèces" },
            { amount: 2000, category: "Communication", description: "Crédit Orange CI", date: day(1), paymentMethod: "Orange Money" },
            { amount: 400, category: "Transport", description: "Wôrô-wôrô Angré 7e Tranche → Cocody", date: U.todayISO(), paymentMethod: "Espèces" }
        ];

        /* Toutes les dates de la démonstration doivent tomber dans le mois
           courant, sinon le tableau de bord affiche « Revenus 0 FCFA » en début
           de mois (les revenus sembleraient appartenir au mois précédent). */
        const now = new Date();
        const todayDay = now.getDate();
        const inThisMonth = function (item) {
            if (U.monthKey(item.date) === month) return;
            const wanted = Math.max(1, Math.min(Number(item.date.slice(-2)), todayDay));
            item.date = U.toISODate(new Date(now.getFullYear(), now.getMonth(), wanted));
        };

        expenses.forEach(inThisMonth);

        const incomes = [
            { amount: 220000, source: "Salaire", description: "Salaire du mois", date: U.toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), paymentMethod: "Virement bancaire" },
            { amount: 45000, source: "Freelance", description: "Site vitrine pour un client à Cocody", date: day(12), paymentMethod: "Wave" },
            { amount: 25000, source: "Vente", description: "Vente de marchandises à la boutique", date: day(4), paymentMethod: "Espèces" }
        ];

        incomes.forEach(inThisMonth);

        /* Soldes de départ déclarés : ce que le foyer avait sur chaque compte
           avant le début du mois. Ils rendent les portefeuilles crédibles dès
           le premier lancement (sans eux, tout moyen sans revenu afficherait
           un solde négatif). */
        const wallets = {
            "Espèces": 15000,
            "Orange Money": 30000,
            "MTN Mobile Money": 30000,
            "Moov Money": 12000,
            "Wave": 8000,
            "Djamo": 15000,
            "Carte bancaire": 40000,
            "Virement bancaire": 150000
        };

        return { expenses: expenses, incomes: incomes, budget: 200000, wallets: wallets };
    }

    /**
     * Charge les données de démonstration.
     * @returns {{expenses: number, incomes: number}}
     */
    function loadDemoData() {
        const demo = demoRecords();
        const ids = { expenses: [], incomes: [] };

        demo.expenses.forEach(function (item) {
            const result = EXP.addExpense(item);
            if (result.ok) ids.expenses.push(result.data.id);
        });
        demo.incomes.forEach(function (item) {
            const result = INC.addIncome(item);
            if (result.ok) ids.incomes.push(result.data.id);
        });

        BUD.setBudget(U.monthKey(), demo.budget);

        /* Portefeuilles : soldes de départ de la démo */
        if (demo.wallets) {
            Object.keys(demo.wallets).forEach(function (method) {
                data.setWallet(method, demo.wallets[method]);
            });
            U.bus.emit("wallets:changed", { action: "demo-load" });
        }

        const settings = data.getSettings();
        data.saveSettings({
            demoLoaded: true,
            demoIds: ids.expenses.concat(ids.incomes),
            monthlyBudgetHint: demo.budget
        });

        U.bus.emit("data:changed", { type: "all", action: "demo-load" });
        return { expenses: ids.expenses.length, incomes: ids.incomes.length };
    }

    /** Supprime uniquement les transactions créées en mode démo. */
    function removeDemoData() {
        const settings = data.getSettings();
        const ids = settings.demoIds || [];
        if (!ids.length) {
            data.saveSettings({ demoLoaded: false });
            return 0;
        }
        let removed = 0;
        ids.forEach(function (id) {
            if (data.deleteExpense(id) || data.deleteIncome(id)) removed++;
        });
        /* Les soldes de départ de la démo partent avec elle : on ne laisse
           pas des montants inventés dans les paramètres de l'utilisateur. */
        U.PAYMENT_METHODS.forEach(function (method) {
            if (data.getWallet(method)) data.setWallet(method, "");
        });

        data.saveSettings({ demoLoaded: false, demoIds: [] });
        U.bus.emit("wallets:changed", { action: "demo-remove" });
        U.bus.emit("data:changed", { type: "all", action: "demo-remove" });
        return removed;
    }

    function hasDemoData() {
        const settings = data.getSettings();
        return !!(settings.demoIds && settings.demoIds.length);
    }

    /**
     * Fenêtre d'ajustement des soldes de départ de chaque portefeuille.
     * Un champ par moyen de paiement ; laisser vide = portefeuille non suivi.
     */
    function openWalletsForm() {
        const wallets = data.getWallets();
        const balances = global.FT.payments ? global.FT.payments.getWalletBalances() : { rows: [] };
        const byMethod = {};
        balances.rows.forEach(function (row) { byMethod[row.method] = row; });

        const inputs = {};

        const grid = U.el("div", { class: "wallet-form" }, U.PAYMENT_METHODS.map(function (method) {
            const row = byMethod[method] || { income: 0, expense: 0, balance: 0, count: 0, color: U.paymentColor(method) };
            const input = U.el("input", {
                class: "input", type: "text", inputmode: "numeric", id: "wallet_" + method.replace(/[^A-Za-z]/g, ""),
                placeholder: "0",
                value: Object.prototype.hasOwnProperty.call(wallets, method) ? U.formatNumber(wallets[method]) : "",
                attrs: { "aria-label": "Solde de départ — " + method }
            });
            inputs[method] = input;

            /* Formatage lisible quand on quitte le champ */
            input.addEventListener("blur", function () {
                const parsed = U.parseAmountInput(input.value);
                input.value = input.value.trim() === "" ? "" : U.formatNumber(parsed);
            });

            return U.el("div", { class: "wallet-form-row", style: { "--pay-color": row.color } }, [
                U.el("label", { for: input.id, class: "wallet-form-label" }, [
                    U.el("span", { class: "pay-dot", style: { background: row.color }, attrs: { "aria-hidden": "true" } }),
                    U.el("span", { text: U.paymentEmoji(method) + " " + method })
                ]),
                input,
                U.el("span", {
                    class: "wallet-form-hint",
                    text: "Solde actuel " + U.formatCurrency(row.balance) +
                        (row.count ? " · " + row.count + " mouvement" + (row.count > 1 ? "s" : "") : "")
                })
            ]);
        }));

        let entry = null;
        const foot = U.el("div", { class: "modal-foot" }, [
            U.el("button", { class: "btn btn-ghost", type: "button", text: "Annuler", on: { click: function () { if (entry) entry.close(); } } }),
            U.el("button", {
                class: "btn btn-ghost", type: "button", text: "Tout effacer",
                on: {
                    click: function () {
                        U.PAYMENT_METHODS.forEach(function (m) { inputs[m].value = ""; });
                        U.toast("Champs vidés", "info", "Enregistrez pour confirmer.");
                    }
                }
            }),
            U.el("button", { class: "btn btn-primary", type: "submit", text: "Enregistrer les soldes" })
        ]);

        const form = U.el("form", { class: "modal-body stack", novalidate: true, id: "walletsForm" }, [
            U.el("div", { class: "alert info" }, [
                U.el("span", { class: "alert-ico", text: "💡", attrs: { "aria-hidden": "true" } }),
                U.el("div", {}, [
                    U.el("div", { class: "alert-title", text: "Indiquez ce que vous avez aujourd'hui sur chaque compte" }),
                    U.el("div", { class: "muted", text: "Enregistrez le montant que contient chaque portefeuille maintenant : l'application y ajoutera ensuite les entrées et retranchera les dépenses. Laissez vide ce que vous ne voulez pas suivre." })
                ])
            ]),
            grid,
            U.el("div", { class: "form-error", attrs: { role: "alert" } }),
            foot
        ]);

        const panel = U.el("div", { class: "modal-panel modal-wide", attrs: { "aria-labelledby": "walletsTitle" } }, [
            U.el("div", { class: "modal-grip", attrs: { "aria-hidden": "true" } }),
            U.el("div", { class: "modal-head" }, [
                U.el("div", {}, [
                    U.el("h2", { id: "walletsTitle", text: "💰 Ajuster les soldes de départ" }),
                    U.el("p", { class: "muted", text: "Le solde affiché = ce montant + les revenus reçus − les dépenses payées par ce moyen." })
                ]),
                U.el("button", { class: "icon-btn", type: "button", text: "✕", attrs: { "aria-label": "Fermer" }, on: { click: function () { if (entry) entry.close(); } } })
            ]),
            form
        ]);

        entry = U.openModal(panel);

        form.addEventListener("submit", function (e) {
            e.preventDefault();
            let saved = 0;

            U.PAYMENT_METHODS.forEach(function (method) {
                const raw = inputs[method].value.trim();
                const previous = Object.prototype.hasOwnProperty.call(data.getWallets(), method);
                if (raw === "") {
                    if (previous) data.setWallet(method, "");
                } else {
                    data.setWallet(method, U.parseAmountInput(raw));
                    saved++;
                }
            });

            entry.close();
            U.toast("Portefeuilles mis à jour", "success", saved + " solde(s) de départ enregistré(s)");
            U.bus.emit("wallets:changed", { action: "update", count: saved });
            U.bus.emit("data:changed", { type: "wallets", action: "update" });
            if (global.FT.mobile && global.FT.mobile.haptic) global.FT.mobile.haptic("medium");
        });

        const first = U.qs("input", panel);
        if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 80);

        return entry;
    }

    function openSavingsForm(record) {
        const isEdit = !!(record && record.id);
        const defaults = {
            amount: "",
            goal: "Tontine",
            description: "",
            targetAmount: "",
            date: U.todayISO(),
            paymentMethod: "Espèces"
        };
        const initial = isEdit ? record : defaults;

        const amountInput = U.el("input", {
            class: "input", type: "text", inputmode: "decimal", id: "savingsAmount",
            value: initial.amount ? U.formatNumber(initial.amount) : "",
            placeholder: "Ex. 20 000", "data-autofocus": ""
        });
        const goalSelect = U.el("select", { class: "select", id: "savingsGoal" }, [
            "Tontine", "Projet maison", "Scolarité", "Urgence", "Investissement", "Voyage", "Autre"
        ].map(function (g) {
            return U.el("option", { value: g, text: g, selected: (initial.goal || "Tontine") === g });
        }));
        const targetInput = U.el("input", {
            class: "input", type: "text", inputmode: "decimal", id: "savingsTarget",
            value: initial.targetAmount ? U.formatNumber(initial.targetAmount) : "",
            placeholder: "Ex. 500 000 (optionnel)"
        });
        const descInput = U.el("input", {
            class: "input", type: "text", id: "savingsDesc",
            value: initial.description || "",
            placeholder: "Ex. Tontine mensuelle - Adjamé"
        });
        const dateInput = U.el("input", {
            class: "input", type: "date", id: "savingsDate",
            value: initial.date || U.todayISO()
        });
        const paySelect = U.el("select", { class: "select", id: "savingsPay" },
            U.PAYMENT_METHODS.map(function (m) {
                return U.el("option", { value: m, text: U.paymentEmoji(m) + " " + m, selected: (initial.paymentMethod || "Espèces") === m });
            })
        );

        let entry = null;
        const form = U.el("form", { class: "modal-body stack", novalidate: true }, [
            U.el("div", { class: "form-grid" }, [
                U.el("div", { class: "field" }, [
                    U.el("label", { for: "savingsAmount", text: "Montant déposé" }),
                    U.el("div", { class: "amount-field" }, [
                        amountInput,
                        U.el("span", { class: "suffix", text: U.currencySymbol() })
                    ]),
                    U.el("div", { class: "error-msg", id: "savingsAmountErr" })
                ]),
                U.el("div", { class: "field" }, [
                    U.el("label", { for: "savingsGoal", text: "Objectif" }),
                    goalSelect
                ]),
                U.el("div", { class: "field" }, [
                    U.el("label", { for: "savingsTarget", text: "Objectif cible (optionnel)" }),
                    targetInput,
                    U.el("div", { class: "help", text: "Ex: 500 000F pour projet maison" })
                ]),
                U.el("div", { class: "field" }, [
                    U.el("label", { for: "savingsDate", text: "Date" }),
                    dateInput
                ]),
                U.el("div", { class: "field" }, [
                    U.el("label", { for: "savingsPay", text: "Moyen de paiement" }),
                    paySelect
                ]),
                U.el("div", { class: "field", style: { gridColumn: "1 / -1" } }, [
                    U.el("label", { for: "savingsDesc", text: "Description (optionnel)" }),
                    descInput
                ])
            ]),
            U.el("div", { class: "modal-foot" }, [
                U.el("button", { class: "btn btn-ghost", type: "button", text: "Annuler", on: { click: function () { if (entry) entry.close(); } } }),
                U.el("button", { class: "btn btn-primary", type: "submit", text: isEdit ? "Mettre à jour" : "Enregistrer l'épargne" })
            ])
        ]);

        const panel = U.el("div", { class: "modal-panel", attrs: { "aria-labelledby": "savingsTitle" } }, [
            U.el("div", { class: "modal-grip" }),
            U.el("div", { class: "modal-head" }, [
                U.el("div", {}, [
                    U.el("h2", { id: "savingsTitle", text: isEdit ? "Modifier l'épargne" : "🐖 Nouvelle épargne" }),
                    U.el("p", { class: "muted", text: "Chaque dépôt alimente ton objectif. Lié à la table savings en base." })
                ]),
                U.el("button", { class: "icon-btn", type: "button", text: "✕", on: { click: function () { if (entry) entry.close(); } } })
            ]),
            form
        ]);

        entry = U.openModal(panel);

        form.addEventListener("submit", function (e) {
            e.preventDefault();
            const payload = {
                amount: amountInput.value,
                goal: goalSelect.value,
                targetAmount: targetInput.value,
                description: descInput.value,
                date: dateInput.value,
                paymentMethod: paySelect.value
            };
            const result = isEdit ? global.FT.savings.updateSaving(record.id, payload) : global.FT.savings.addSaving(payload);
            if (!result.ok) {
                const errBox = U.qs("#savingsAmountErr", form);
                if (errBox) errBox.textContent = result.errors.amount || result.errors.goal || "Vérifiez le formulaire";
                U.toast("Vérifiez le formulaire", "error", Object.values(result.errors)[0]);
                return;
            }
            entry.close();
            U.toast(isEdit ? "Épargne modifiée" : "Épargne enregistrée", "success", U.formatCurrency(result.data.amount) + " · " + result.data.goal);
        });

        return entry;
    }

    /** Invitation au premier lancement — retirée sur demande : on garde juste Bonjour + prénom */
    function maybeOfferDemo() {
        // Plus de fenêtre de bienvenue avec données d'exemple — le salut personnalisé suffit
        return null;
    }

    /* ======================================================================
       7. PAGE PARAMÈTRES (§43, §49)
       ====================================================================== */

    function renderSettingsPage() {
        const host = U.qs("#settingsContent");
        if (!host) return;
        U.clear(host);

        const settings = data.getSettings();
        const expenses = data.getExpenses();
        const incomes = data.getIncomes();
        const storageOk = global.FT.storage.isAvailable();

        /* --- Profil & devise --- */
        const nameInput = U.el("input", {
            class: "input", type: "text", id: "settingName", maxlength: "40",
            placeholder: "Ex. Awa", value: settings.userName || ""
        });
        const currencySelect = U.el("select", { class: "select", id: "settingCurrency" },
            U.CURRENCIES.map(function (c) {
                return U.el("option", { value: c.code, text: c.label, selected: c.code === settings.currency });
            }));
        const voiceSelect = U.el("select", { class: "select", id: "settingVoiceLang" }, [
            U.el("option", { value: "fr-FR", text: "Français (France)", selected: settings.voiceLanguage === "fr-FR" }),
            U.el("option", { value: "fr-CI", text: "Français (Côte d'Ivoire)", selected: settings.voiceLanguage === "fr-CI" }),
            U.el("option", { value: "en-US", text: "English (US)", selected: settings.voiceLanguage === "en-US" })
        ]);

        // --- Localisation automatique (remplace saisie manuelle zone) ---
        const currentLoc = (global.FT.location && FT.location.read()) || null;
        const locLabel = currentLoc ? currentLoc.label : (settings.area || "Non détectée");
        const locDetail = currentLoc ? (currentLoc.display || "") : "";
        const locationCard = U.el("div", { class: "field" }, [
            U.el("label", { text: "📍 Ma position (auto)" }),
            U.el("div", { class: "card", style: { padding: "12px", background: "var(--surface)" } }, [
                U.el("div", { style: { fontWeight: "700", fontSize: "1rem" }, text: locLabel }),
                locDetail ? U.el("div", { class: "muted", style: { fontSize: ".82rem", marginTop: "4px" }, text: locDetail }) : null,
                currentLoc && currentLoc.timestamp ? U.el("div", { class: "muted", style: { fontSize: ".75rem", marginTop: "4px" }, text: "Mise à jour : " + new Date(currentLoc.timestamp).toLocaleString("fr-FR") }) : null,
                U.el("div", { class: "btn-row", style: { marginTop: "10px" } }, [
                    U.el("button", {
                        class: "btn btn-primary btn-sm", type: "button", text: "📍 Détecter ma position",
                        on: {
                            click: async function () {
                                try {
                                    const btn = this;
                                    btn.disabled = true;
                                    btn.textContent = "Détection...";
                                    const loc = await FT.location.detect();
                                    U.toast("Position mise à jour", "success", loc.label);
                                    renderSettingsPage();
                                } catch (e) {
                                    U.toast("Erreur localisation", "error", e.message);
                                }
                            }
                        }
                    }),
                    U.el("button", {
                        class: "btn btn-ghost btn-sm", type: "button", text: "Effacer",
                        on: {
                            click: function () {
                                try { localStorage.removeItem("finatrack_location"); } catch (e) {}
                                data.saveSettings({ area: "" });
                                U.toast("Position effacée", "info", "Retour à Abidjan par défaut");
                                renderSettingsPage();
                            }
                        }
                    })
                ])
            ]),
            U.el("div", { class: "help", text: "Utilise le GPS de ton téléphone si tu autorises. Aucune saisie manuelle nécessaire." })
        ]);

        /* --- Auth obligatoire --- */
        const currentUser = global.FT.auth ? global.FT.auth.getCurrentUser() : null;
        const authCard = U.el("div", { class: "card card-lg", id: "settingsAuth" }, [
            U.el("div", { class: "card-head" }, [
                U.el("h3", {}, [U.el("span", { text: "🔐" }), U.el("span", { text: "Compte & connexion" })]),
                currentUser ? U.el("span", { class: "tag", text: "Connecté" }) : U.el("span", { class: "tag", text: "Non connecté" })
            ]),
            currentUser
                ? U.el("div", { class: "stack", style: { gap: "8px" } }, [
                    U.el("div", { class: "alert info" }, [
                        U.el("span", { class: "alert-ico", text: "👋" }),
                        U.el("div", {}, [
                            U.el("div", { class: "alert-title", text: "Connecté en tant que " + currentUser.name }),
                            U.el("div", { class: "muted", text: currentUser.email + " · session locale sécurisée" })
                        ])
                    ]),
                    U.el("div", { class: "btn-row" }, [
                        U.el("button", {
                            class: "btn btn-ghost btn-sm", type: "button", text: "Se déconnecter",
                            on: {
                                click: function () {
                                    U.confirmDialog({
                                        title: "Se déconnecter ?",
                                        message: "Vous devrez vous reconnecter pour accéder à l'application. Vos données restent enregistrées localement.",
                                        confirmLabel: "Se déconnecter"
                                    }).then(function (ok) {
                                        if (!ok) return;
                                        // Logout est async quand Supabase est configuré, on attend puis on redirige
                                        Promise.resolve(global.FT.auth.logout()).then(function () {
                                            global.location.href = global.FT.auth.getLoginPath() + "?logout=1";
                                        }).catch(function () {
                                            global.location.href = global.FT.auth.getLoginPath() + "?logout=1";
                                        });
                                    });
                                }
                            }
                        })
                    ])
                ])
                : U.el("div", { class: "stack" }, [
                    U.el("p", { class: "muted", text: "Vous n'êtes pas connecté. L'accès à l'application nécessite une connexion." }),
                    U.el("a", { class: "btn btn-primary btn-sm", href: "login.html", text: "Aller à la connexion" })
                ])
        ]);

        const profileCard = U.el("div", { class: "card card-lg", id: "settingsCard" }, [
            U.el("div", { class: "card-head" }, [U.el("h3", {}, [U.el("span", { text: "👤" }), U.el("span", { text: "Profil & préférences" })])]),
            U.el("div", { class: "form-grid" }, [
                U.el("div", { class: "field" }, [
                    U.el("label", { for: "settingName", text: "Votre prénom (facultatif)" }),
                    nameInput,
                    U.el("div", { class: "help", text: "Utilisé pour personnaliser l'accueil." })
                ]),
                U.el("div", { class: "field" }, [
                    U.el("label", { for: "settingCurrency", text: "Devise" }),
                    currencySelect
                ]),
                U.el("div", { class: "field" }, [
                    U.el("label", { for: "settingVoiceLang", text: "Langue de la reconnaissance vocale" }),
                    voiceSelect,
                    U.el("div", { class: "help", text: "La reconnaissance vocale fonctionne mieux avec la langue réellement parlée." })
                ]),
                locationCard
            ]),
            U.el("div", { class: "btn-row", style: { marginTop: "16px" } }, [
                U.el("button", {
                    class: "btn btn-primary", type: "button", text: "Enregistrer les préférences",
                    on: {
                        click: function () {
                            // Zone gérée automatiquement par le système de localisation
                            data.saveSettings({
                                userName: U.sanitizeText(nameInput.value, 40),
                                currency: currencySelect.value,
                                voiceLanguage: voiceSelect.value
                            });
                            U.toast("Préférences enregistrées", "success");
                            markActiveNav();
                            U.bus.emit("data:changed", { type: "settings", action: "update" });
                            renderSettingsPage();
                        }
                    }
                })
            ])
        ]);

        /* --- Confort de lecture : la taille du texte pour tout le projet --- */
        const currentTextSize = data.getSettings().textSize || "normal";
        const textButtons = U.TEXT_SIZES.map(function (option) {
            return U.el("button", {
                type: "button",
                class: "text-size-choice" + (option.value === currentTextSize ? " is-active" : ""),
                dataset: { size: option.value },
                attrs: {
                    "aria-pressed": option.value === currentTextSize ? "true" : "false",
                    "aria-label": "Taille de texte " + option.label
                },
                on: {
                    click: function () {
                        U.applyTextSize(option.value, true);
                        renderSettingsPage();
                        U.toast("Confort de lecture : " + option.label, "info",
                            option.value === "normal" ? "Taille d'origine rétablie." : "Les textes du projet sont agrandis partout.");
                        if (global.FT.mobile && global.FT.mobile.haptic) global.FT.mobile.haptic("light");
                    }
                }
            }, [
                U.el("span", { class: "tsc-icon", text: option.icon, attrs: { "aria-hidden": "true" } }),
                U.el("span", { class: "tsc-label", text: option.label })
            ]);
        });

        const readingCard = U.el("div", { class: "card card-lg", id: "settingsReading" }, [
            U.el("div", { class: "card-head" }, [
                U.el("h3", {}, [U.el("span", { text: "👓" }), U.el("span", { text: "Confort de lecture" })]),
                U.el("span", { class: "tag", text: (U.TEXT_SIZES.filter(function (t) { return t.value === currentTextSize; })[0] || U.TEXT_SIZES[0]).label })
            ]),
            U.el("p", { class: "muted", text: "Choisissez la taille des textes de l'application. Le réglage s'applique à toutes les pages, sur téléphone comme sur ordinateur, et reste enregistré pour vos prochaines visites." }),
            U.el("div", { class: "text-size-grid", attrs: { role: "group", "aria-label": "Taille des textes" } }, textButtons),
            U.el("dl", { class: "meta-list", style: { marginTop: "12px" } },
                U.TEXT_SIZES.reduce(function (lignes, option) {
                    lignes.push(U.el("dt", { text: option.label }));
                    lignes.push(U.el("dd", { text: option.hint }));
                    return lignes;
                }, [])),
            U.el("p", { class: "field-hint", text: "Astuce : le zoom de votre navigateur reste disponible et se combine à ce réglage." })
        ]);

        /* Portefeuilles retirés des Paramètres — maintenant onglet dédié 💳 */
        /* Repères locaux retirés sur demande utilisateur */

        const storedKb = (JSON.stringify({
            e: expenses, i: incomes, b: data.getBudgets(), s: settings
        }).length / 1024);

        /* --- Apparence --- */
        const themeToggle = U.el("input", {
            type: "checkbox", id: "settingTheme", checked: settings.theme === "dark",
            attrs: { role: "switch" }
        });
        themeToggle.addEventListener("change", function () {
            applyTheme(themeToggle.checked ? "dark" : "light", true);
            renderSettingsPage();
        });

        const alertsToggle = U.el("input", {
            type: "checkbox", id: "settingAlerts", checked: settings.alertsEnabled !== false,
            attrs: { role: "switch" }
        });
        alertsToggle.addEventListener("change", function () {
            data.saveSettings({ alertsEnabled: alertsToggle.checked });
            U.toast(alertsToggle.checked ? "Alertes budget activées" : "Alertes budget désactivées", "info");
        });

        const appearanceCard = U.el("div", { class: "card card-lg" }, [
            U.el("div", { class: "card-head" }, [U.el("h3", {}, [U.el("span", { text: "🎨" }), U.el("span", { text: "Apparence & alertes" })])]),
            U.el("div", { class: "switch" }, [
                U.el("div", { class: "switch-text" }, [
                    U.el("div", { class: "st-title" }, [U.el("label", { for: "settingTheme", text: "Thème sombre" })]),
                    U.el("div", { class: "st-desc", text: "Reposant pour les consultations du soir. Le thème clair reste celui par défaut." })
                ]),
                themeToggle
            ]),
            U.el("div", { class: "divider" }),
            U.el("div", { class: "switch" }, [
                U.el("div", { class: "switch-text" }, [
                    U.el("div", { class: "st-title" }, [U.el("label", { for: "settingAlerts", text: "Alertes de budget" })]),
                    U.el("div", { class: "st-desc", text: "Messages d'information lorsque vous approchez de votre budget mensuel." })
                ]),
                alertsToggle
            ])
        ]);

        /* --- Données --- */
        const dataCard = U.el("div", { class: "card card-lg" }, [
            U.el("div", { class: "card-head" }, [
                U.el("h3", {}, [U.el("span", { text: "💾" }), U.el("span", { text: "Mes données" })]),
                U.el("span", { class: "tag", text: global.FT.data.adapterName })
            ]),
            U.el("div", { class: "stat-grid", style: { gridTemplateColumns: "repeat(3, minmax(0,1fr))" } }, [
                U.el("div", { class: "stat" }, [U.el("div", { class: "stat-label", text: "Dépenses" }), U.el("div", { class: "stat-value", text: String(expenses.length) })]),
                U.el("div", { class: "stat" }, [U.el("div", { class: "stat-label", text: "Revenus" }), U.el("div", { class: "stat-value", text: String(incomes.length) })]),
                U.el("div", { class: "stat" }, [U.el("div", { class: "stat-label", text: "Volume" }), U.el("div", { class: "stat-value", text: storedKb.toFixed(1) + " Ko" })])
            ]),
            U.el("div", { class: "stack", style: { marginTop: "16px", gap: "12px" } }, [
                U.el("div", { class: "btn-row" }, [
                    U.el("button", {
                        class: "btn btn-ghost btn-sm", type: "button", text: "⬇︎ Exporter (JSON)",
                        on: { click: exportJSON }
                    }),
                    U.el("button", {
                        class: "btn btn-ghost btn-sm", type: "button", text: "⬆︎ Importer",
                        on: { click: function () { U.qs("#importFile").click(); } }
                    }),
                    U.el("input", { type: "file", id: "importFile", accept: "application/json,.json", class: "hidden", on: { change: importJSON } })
                ]),
                U.el("button", {
                    class: "btn btn-ghost btn-sm", type: "button", text: "🔄 Vider le cache et recharger",
                    on: {
                        click: function(){
                            U.confirmDialog({
                                title: "Vider le cache ?",
                                message: "Cela force la mise à jour de l'application (utile si une modification ne s'affiche pas). Vos données restent intactes.",
                                confirmLabel: "Vider et recharger"
                            }).then(function(ok){
                                if (!ok) return;
                                try {
                                    if ('caches' in window) {
                                        caches.keys().then(function(keys){ keys.forEach(function(k){ caches.delete(k); }); });
                                    }
                                    if (navigator.serviceWorker) {
                                        navigator.serviceWorker.getRegistrations().then(function(regs){ regs.forEach(function(r){ r.unregister(); }); });
                                    }
                                } catch(e){}
                                setTimeout(function(){ window.location.reload(true); }, 500);
                            });
                        }
                    }
                }),
                U.el("button", {
                    class: "btn btn-danger-soft btn-sm", type: "button", text: "⚠️ Effacer toutes les données",
                    on: {
                        click: function () {
                            U.confirmDialog({
                                title: "Effacer toutes vos données ?",
                                message: "Dépenses, revenus, budgets et préférences seront supprimés définitivement de ce navigateur. Pensez à exporter une sauvegarde avant.",
                                confirmLabel: "Tout effacer",
                                danger: true
                            }).then(function (ok) {
                                if (!ok) return;
                                data.clearAll();
                                applyTheme("light", true);
                                U.toast("Toutes les données ont été effacées", "info", "Vous repartez d'une base vide.");
                                U.bus.emit("data:changed", { type: "all", action: "clear" });
                                renderSettingsPage();
                            });
                        }
                    }
                })
            ]),
            !storageOk ? U.el("div", { class: "alert warn", style: { marginTop: "14px" } }, [
                U.el("span", { class: "alert-ico", text: "⚠️", attrs: { "aria-hidden": "true" } }),
                U.el("div", {}, [
                    U.el("div", { class: "alert-title", text: "Stockage local indisponible" }),
                    U.el("div", { class: "muted", text: "Votre navigateur (navigation privée ?) bloque LocalStorage. Les données ne seront pas conservées après fermeture." })
                ])
            ]) : null
        ]);

        /* --- Catégories & paiements --- */
        const categoriesCard = U.el("div", { class: "card card-lg" }, [
            U.el("div", { class: "card-head" }, [U.el("h3", {}, [U.el("span", { text: "🏷️" }), U.el("span", { text: "Catégories de dépenses" })])]),
            U.el("div", { class: "chip-select" }, U.CATEGORIES.map(function (c) {
                return U.el("span", { class: "chip", text: U.categoryEmoji(c) + " " + c, attrs: { title: U.categoryHint(c) } });
            })),
            U.el("ul", { class: "stack local-hints", style: { marginTop: "12px", gap: "6px", fontSize: "var(--fs-sm)" } },
                U.CATEGORIES.map(function (c) {
                    return U.el("li", {}, [
                        U.el("strong", { text: U.categoryEmoji(c) + " " + c + " — " }),
                        U.el("span", { class: "muted", text: U.categoryHint(c) })
                    ]);
                })),
            U.el("div", { class: "card-head", style: { marginTop: "20px" } }, [U.el("h3", {}, [U.el("span", { text: "💳" }), U.el("span", { text: "Moyens de paiement" })])]),
            U.el("div", { class: "chip-select" }, U.PAYMENT_METHODS.map(function (m) {
                return U.el("span", { class: "chip", text: U.paymentEmoji(m) + " " + m });
            })),
            U.el("p", { class: "muted", style: { fontSize: "var(--fs-sm)", marginTop: "14px" }, text: "Les catégories et moyens de paiement sont adaptés au contexte ivoirien (mobile money, gbaka, maquis, CIE, SODECI…)." })
        ]);

        /* Confidentialité retirée sur demande — plus de carte */

        /* --- À propos — ne garder que la version --- */
        const aboutCard = U.el("div", { class: "card card-lg" }, [
            U.el("div", { class: "card-head" }, [U.el("h3", {}, [U.el("span", { text: "ℹ️" }), U.el("span", { text: "À propos" })])]),
            U.el("dl", { class: "meta-list" }, [
                U.el("dt", { text: "Version" }),
                U.el("dd", { text: (global.FT.version || "1.4.0") + " — FinaTrack CI" })
            ])
        ]);

        /* Carte « Application mobile » : installation, hors ligne, état de l'appareil */
        const mobileCard = (global.FT.mobile && !data.getSettings().isDesktop)
            ? global.FT.mobile.settingsCard()
            : null;

        const grid = U.el("div", { class: "grid grid-2 uneven" }, [
            U.el("div", { class: "stack" }, [authCard, mobileCard, readingCard, profileCard, appearanceCard, categoriesCard].filter(Boolean)),
            U.el("div", { class: "stack" }, [dataCard, aboutCard])
        ]);
        host.appendChild(grid);

        /* --- Sauvegarde / restauration --- */
        function exportJSON() {
            try {
                const payload = data.exportAll();
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = U.el("a", { href: url, download: "finatrack-sauvegarde-" + U.todayISO() + ".json" });
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                U.toast("Sauvegarde exportée", "success", "Conservez ce fichier en lieu sûr.");
            } catch (e) {
                U.toast("Export impossible", "error", e.message);
            }
        }

        function importJSON(e) {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function () {
                try {
                    const payload = JSON.parse(reader.result);
                    const counts = data.importAll(payload);
                    U.toast("Sauvegarde restaurée", "success", counts.expenses + " dépenses, " + counts.incomes + " revenus");
                    U.bus.emit("data:changed", { type: "all", action: "import" });
                } catch (err) {
                    U.toast("Fichier illisible", "error", "Le fichier JSON n'est pas valide.");
                }
            };
            reader.readAsText(file);
            e.target.value = "";
        }
    }

    /* ======================================================================
       8. THÈME (§43)
       ====================================================================== */

    function applyTheme(theme, persist) {
        const value = theme === "dark" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", value);
        const meta = U.qs('meta[name="theme-color"]');
        if (meta) meta.setAttribute("content", value === "dark" ? "#0F1513" : "#123C32");
        if (persist) {
            data.saveSettings({ theme: value });
            U.bus.emit("theme:changed", { theme: value });
        }
    }

    function initTheme() {
        const settings = data.getSettings();
        const prefersDark = global.matchMedia && global.matchMedia("(prefers-color-scheme: dark)").matches;
        applyTheme(settings.theme === "dark" ? "dark" : (settings.theme === "auto" && prefersDark ? "dark" : "light"), false);
    }

    /* ======================================================================
       9. AMORÇAGE
       ====================================================================== */

    /**
     * Un seul point d'entrée pour toutes les actions déclaratives du HTML
     * (boutons du menu, du tableau de bord, des barres latérales, etc.).
     * Évite les handlers dupliqués et garantit que chaque bouton fonctionne.
     */
    function initGlobalActions() {
        const actions = {
            "add-expense": function () { openExpenseForm(); },
            "add-income": function () { openIncomeForm(); },
            "add-saving": function () { openSavingsForm(); },
            "open-savings-form": function () { openSavingsForm(); },
            "voice-add": function () { global.FT.voice.open(); },
            "quick-add": function () { openQuickAdd(); },
            "open-add-menu": function () { openAddMenu(); },
            "edit-wallets": function () { openWalletsForm(); },
            "install-app": function () {
                if (global.FT.mobile) global.FT.mobile.promptInstall();
                else U.toast("Installation indisponible", "info", "Ouvrez FinaTrack dans un navigateur mobile pour l'installer.");
            }
        };

        U.delegate(document.body, "click", "[data-action]", function (e, target) {
            const handler = actions[target.dataset.action];
            if (!handler) return;
            e.preventDefault();
            handler(e, target);
        });
    }

    function initKeyboardShortcuts() {
        document.addEventListener("keydown", function (e) {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const tag = (e.target.tagName || "").toLowerCase();
            if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;
            if (U.qsa(".modal").length) return;

            switch (e.key) {
                case "n": case "N":
                    e.preventDefault(); openExpenseForm(); break;
                case "v": case "V":
                    e.preventDefault(); global.FT.voice.open(); break;
                case "r": case "R":
                    e.preventDefault(); openIncomeForm(); break;
                case "/": {
                    const search = U.qs("#txSearch") || U.qs("#incomeSearch");
                    if (search) { e.preventDefault(); search.focus(); }
                    break;
                }
                default: break;
            }
        });
    }

    function initPageModules() {
        const page = currentPageName();

        /* Le tableau de bord et l'analyse écoutent déjà les événements globaux. */
        if (page === "dashboard") global.FT.dashboard.initDashboard();
        if (page === "wallets") {
            // Page dédiée Portefeuilles — rendu géré inline dans wallets.html + bus events
            if (global.FT.dashboard) global.FT.dashboard.renderWallets && global.FT.dashboard.renderWallets();
        }
        if (page === "transactions") global.FT.tx.initTransactionsPage();
        if (page === "incomes") global.FT.incomes.initIncomesPage();
        if (page === "budget") global.FT.budget.initBudgetPage();
        if (page === "analysis") global.FT.analysis.initAnalysisPage();
        if (page === "settings") {
            renderSettingsPage();
            /* Le rendu des Paramètres suit toute modification des portefeuilles
               (le rendu lui-même est idempotent : un seul abonnement actif). */
            if (!global.FT.__walletsWired) {
                global.FT.__walletsWired = true;
                U.bus.on("wallets:changed", function () { renderSettingsPage(); });
            }
        }

        /* Graphiques présents sur la page courante */
        global.FT.charts.initCharts();
    }

    function init() {
        /* Auth obligatoire : redirige vers login si pas de session (sauf sur login.html) */
        try {
            if (global.FT.auth && global.location.pathname.indexOf("login.html") === -1) {
                if (!global.FT.auth.isAuthenticated()) {
                    global.FT.auth.requireAuth();
                    return;
                }
                // Si Supabase configuré mais session Supabase manquante (ex: compte supprimé ou localStorage vidé partiellement),
                // on force une reconnexion au lieu d'afficher un dashboard vide avec erreurs "Auth session missing"
                if (global.FT_CONFIG && global.FT_CONFIG.SUPABASE_URL) {
                    const sess = global.FT.auth.getSession && global.FT.auth.getSession();
                    if (sess && sess.provider === "supabase") {
                        const supa = global.FT.auth.getSupa && global.FT.auth.getSupa();
                        if (supa) {
                            supa.auth.getSession().then(function(res){
                                const hasSession = !!(res && res.data && res.data.session);
                                if (!hasSession) {
                                    console.warn("[Auth] Session locale présente mais pas de session Supabase — redirection login");
                                    try { localStorage.removeItem("finatrack_session"); } catch(e){}
                                    global.FT.auth.requireAuth();
                                }
                            });
                        }
                    }
                }
            }
        } catch (e) { /* ignore */ }

        /* Amorçage idempotent : si le script était chargé deux fois (balise
           dupliquée, rechargement partiel), on ne relie pas les gestionnaires
           une seconde fois — sinon chaque clic ouvrirait deux fenêtres. */
        if (global.FT.booted) {
            markActiveNav();
            return;
        }
        global.FT.booted = true;

        markActiveNav();
        initTheme();
        /* Supabase hybride : si FT_CONFIG présent, init sync offline-first */
        try {
            if (global.FT.supabaseSync) {
                global.FT.supabaseSync.init().then(function (ok) {
                    if (ok) {
                        console.info("[FinaTrack] Supabase sync activé");
                        // Si on veut passer en full Supabase async, décommenter :
                        // if (global.FT.supabaseAdapter) FT.data.setAdapter(global.FT.supabaseAdapter);
                    }
                });
            }
        } catch (e) { console.warn("[Supabase] init failed", e); }
        /* Confort de lecture : appliqué avant tout rendu pour éviter un
           « saut » de mise en page au chargement. */
        U.applyTextSize(data.getSettings().textSize, false);
        initGlobalActions();
        initKeyboardShortcuts();
        initPageModules();

        /* Message de bienvenue personnalisé avec nom + salutation selon l'heure d'Abidjan */
        (function showWelcomeIfNeeded(){
            try {
                const flag = localStorage.getItem("finatrack_show_welcome");
                if (!flag) return;
                localStorage.removeItem("finatrack_show_welcome");
                const user = (global.FT.auth && FT.auth.getCurrentUser && FT.auth.getCurrentUser()) || null;
                const rawName = (user && (user.name || user.email)) || "là";
                const firstName = rawName.split("@")[0].split(" ")[0];
                // Heure d'Abidjan
                let hour = new Date().getHours();
                try {
                    const fmt = new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: "Africa/Abidjan" });
                    const parts = fmt.formatToParts(new Date());
                    const hPart = parts.find(function(p){ return p.type==="hour"; });
                    if (hPart) hour = parseInt(hPart.value,10);
                } catch(e){}
                let greet = "Bonjour";
                if (hour >= 12 && hour < 17) greet = "Bon après-midi";
                else if (hour >= 17 || hour < 5) greet = "Bonsoir";
                const emoji = hour < 12 ? "☀️" : hour < 17 ? "🌤️" : "🌙";
                // Toast principal
                setTimeout(function(){
                    U.toast(greet + " " + firstName + " " + emoji, "success", "Bienvenue sur FinaTrack CI — votre argent, clair et local.");
                }, 400);
                // Bannière de bienvenue dans le dashboard si présent
                setTimeout(function(){
                    const hero = document.getElementById("dashHero");
                    if (!hero) return;
                    // Crée une bannière au-dessus du hero si pas déjà présente
                    if (document.getElementById("welcomeBanner")) return;
                    // Zone non fixe — prend la zone de l'utilisateur depuis settings, pas Cocody en dur
                    let areaLabel = "Abidjan";
                    try {
                        const s = data.getSettings();
                        areaLabel = (s.area || U.LOCAL_CONTEXT.defaultArea || "Abidjan").trim();
                    } catch(e){}
                    const banner = U.el("div", { id:"welcomeBanner", class:"welcome-banner", role:"status", style:{ marginBottom:"16px", padding:"14px 18px", borderRadius:"14px", background:"linear-gradient(135deg,#123C32 0%,#1E5A4A 100%)", color:"#F6F2E8", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"12px", boxShadow:"0 6px 18px rgba(18,60,50,.22)", border:"1px solid rgba(231,184,75,.25)" }}, [
                        U.el("div", { style:{ display:"flex", alignItems:"center", gap:"12px" }}, [
                            U.el("span", { style:{ fontSize:"28px" }, text: emoji }),
                            U.el("div", {}, [
                                U.el("div", { style:{ fontWeight:"800", fontSize:"1.05rem", letterSpacing:"-.01em" }, text: greet + " " + firstName + " !"}),
                                U.el("div", { style:{ opacity:".85", fontSize:".88rem", marginTop:"2px" }, text: "Content de vous revoir — " + areaLabel + " · " + new Date().toLocaleDateString("fr-FR",{ weekday:"long", day:"numeric", month:"long"})})
                            ])
                        ]),
                        U.el("button", { class:"btn btn-ghost btn-sm", type:"button", text:"✕", attrs:{ "aria-label":"Fermer" }, style:{ color:"#F6F2E8", borderColor:"rgba(255,255,255,.2)" }, on:{ click:function(){ banner.remove(); } } })
                    ]);
                    hero.parentNode.insertBefore(banner, hero);
                    // Auto-disparition après 8s
                    setTimeout(function(){ if (banner.parentNode) { banner.style.transition="opacity .4s, transform .4s"; banner.style.opacity="0"; banner.style.transform="translateY(-8px)"; setTimeout(function(){ banner.remove(); }, 420); } }, 8000);
                }, 600);
            } catch(e){ console.warn("welcome failed", e); }
        })();

        /* Avertissement si LocalStorage est bloqué */
        if (!global.FT.storage.isAvailable()) {
            U.toast("Stockage local indisponible", "warn", "Les données ne seront pas conservées après fermeture du navigateur.");
        }

        /* Ouverture automatique d'un formulaire depuis "?action=" */
        const params = new URLSearchParams(global.location.search);
        const action = params.get("action");
        if (action === "voice") setTimeout(function () { global.FT.voice.open(); }, 350);
        else if (action === "income") setTimeout(openIncomeForm, 250);
        else if (action === "quick") setTimeout(openQuickAdd, 250);

        /* Premier lancement : proposer le mode démo (§42) */
        setTimeout(maybeOfferDemo, 600);

        console.info("%cFinaTrack CI", "color:#1E5A4A;font-weight:800;font-size:14px", "« Comprenez où va votre argent. » — version 1.6.0");
    }

    /* ======================================================================
       10. EXPORTS
       ====================================================================== */
    global.FT.app = {
        openExpenseForm: openExpenseForm,
        openIncomeForm: openIncomeForm,
        openSavingsForm: openSavingsForm,
        openQuickAdd: openQuickAdd,
        openWalletsForm: openWalletsForm,
        openAddMenu: openAddMenu,
        loadDemoData: loadDemoData,
        removeDemoData: removeDemoData,
        hasDemoData: hasDemoData,
        applyTheme: applyTheme,
        applyTextSize: U.applyTextSize, fluidTextSize: function (size) { return U.applyTextSize(size, true); },
        renderSettingsPage: renderSettingsPage,
        markActiveNav: markActiveNav,
        amountField: amountField,
        maybeOfferDemo: maybeOfferDemo
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})(window);
