/* ==========================================================================
   FinaTrack CI — charts.js
   Graphiques Chart.js (§10, §11). Données 100 % dynamiques, recalculées à
   chaque changement de données. Gère l'absence de Chart.js (mode dégradé).
   ========================================================================== */
(function (global) {
    "use strict";

    const U = global.FT.utils;
    const EXP = global.FT.expenses;
    const INC = global.FT.incomes;
    const TX = global.FT.tx;

    /** Registre des instances pour destruction/mise à jour propres. */
    const registry = {};

    function isAvailable() {
        return typeof global.Chart !== "undefined";
    }

    /** Palette lue depuis la feuille de style (cohérence avec le thème). */
    function cssVar(name, fallback) {
        try {
            const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            return value || fallback;
        } catch (e) {
            return fallback;
        }
    }

    function theme() {
        return {
            text: cssVar("--text", "#17201D"),
            muted: cssVar("--text-soft", "#5E6761"),   /* teinte AA pour axes et légendes */
            border: cssVar("--border", "#DED8CC"),
            surface: cssVar("--surface", "#FCFAF6"),
            primary: cssVar("--primary", "#123C32"),
            secondary: cssVar("--secondary", "#D98B39"),
            accent: cssVar("--accent", "#E7B84B"),
            earth: cssVar("--earth", "#A94A32"),
            success: cssVar("--success", "#2E7D5B"),
            font: cssVar("--font", "Inter, system-ui, sans-serif").replace(/"/g, "")
        };
    }

    /**
     * Taille de police d'un texte dessiné dans un canvas (donc en pixels et non
     * en rem) : elle suit le confort de lecture choisi par l'utilisateur, pour
     * que les axes et les légendes grandissent comme le reste de l'interface.
     * @param {number} base - taille voulue au niveau de lecture normal
     */
    function px(base) {
        try {
            const brut = global.getComputedStyle(document.documentElement).getPropertyValue("--read-scale");
            const valeur = parseFloat(brut);
            const echelle = isFinite(valeur) && valeur > 0 ? valeur : 1;
            return Math.round(base * echelle);
        } catch (e) {
            return base;
        }
    }

    let defaultsApplied = false;
    function applyDefaults() {
        if (!isAvailable()) return;
        const t = theme();
        global.Chart.defaults.font.family = t.font;
        global.Chart.defaults.font.size = px(13);
        global.Chart.defaults.color = t.muted;
        global.Chart.defaults.animation = U.prefersReducedMotion() ? false : { duration: 550, easing: "easeOutQuart" };
        global.Chart.defaults.plugins.legend.display = false;
        defaultsApplied = true;
    }

    /** Plugin maison : total affiché au centre du donut. */
    const centerTextPlugin = {
        id: "ftCenterText",
        afterDraw: function (chart, args, options) {
            if (!options || !options.display) return;
            const meta = chart.getDatasetMeta(0);
            if (!meta || !meta.data || !meta.data.length) return;
            const ctx = chart.ctx;
            const x = meta.data[0].x;
            const y = meta.data[0].y;
            const t = theme();

            ctx.save();
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            ctx.fillStyle = t.muted;
            ctx.font = "700 " + px(12) + "px " + t.font;
            ctx.fillText(String(options.label || "").toUpperCase(), x, y - 15);

            ctx.fillStyle = t.text;
            ctx.font = "800 " + px(19) + "px " + t.font;
            ctx.fillText(options.value || "", x, y + 6);
            ctx.restore();
        }
    };

    function currencyTooltipLabel(context) {
        const label = context.label || context.dataset.label || "";
        const value = context.parsed && typeof context.parsed === "object"
            ? (context.parsed.y !== undefined ? context.parsed.y : context.parsed.x)
            : context.parsed;
        return label + " : " + U.formatCurrency(value);
    }

    function baseOptions(extra) {
        const t = theme();
        return Object.assign({
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "#17201D",
                    titleColor: "#F5EFE3",
                    bodyColor: "#E9E3D6",
                    padding: 10,
                    cornerRadius: 10,
                    displayColors: true,
                    boxPadding: 4,
                    callbacks: { label: currencyTooltipLabel }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    border: { color: t.border },
                    ticks: { color: t.muted, font: { size: px(12), weight: "600" } }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: t.border, drawTicks: false },
                    border: { display: false },
                    ticks: {
                        color: t.muted,
                        font: { size: px(12) },
                        padding: 6,
                        callback: function (value) { return U.formatCompact(value); }
                    }
                }
            }
        }, extra || {});
    }

    function destroy(key) {
        if (registry[key] && typeof registry[key].destroy === "function") {
            registry[key].destroy();
        }
        delete registry[key];
    }

    function getCanvas(selectorOrElement) {
        const node = typeof selectorOrElement === "string" ? U.qs(selectorOrElement) : selectorOrElement;
        if (!node) return null;
        return node.tagName === "CANVAS" ? node : node.querySelector("canvas");
    }

    /** Message de repli si Chart.js n'a pas pu être chargé. */
    function showFallback(host, message) {
        if (!host) return;
        const box = host.closest(".card") || host.parentNode;
        if (box && !box.querySelector(".chart-fallback")) {
            box.appendChild(U.el("p", { class: "muted chart-fallback", style: { fontSize: "var(--fs-sm)", marginTop: "10px" }, text: message }));
        }
    }

    /* ======================================================================
       1. DONUT — RÉPARTITION DES DÉPENSES PAR CATÉGORIE (§10)
       ====================================================================== */
    function renderCategoryDonut(selector, options) {
        const canvas = getCanvas(selector);
        if (!canvas) return null;
        const opts = options || {};
        const host = canvas.parentNode;
        const key = "donut:" + (canvas.id || "chart");

        const expenses = opts.expenses || EXP.getExpenses({ month: opts.month || U.monthKey() });
        const groups = EXP.getExpensesByCategory(expenses);

        if (!isAvailable()) {
            showFallback(host, "Le graphique nécessite Chart.js. Les totaux par catégorie restent disponibles ci-dessous.");
            return null;
        }
        applyDefaults();
        destroy(key);

        if (!groups.length) {
            renderEmptyChart(canvas, "Aucune dépense sur cette période");
            return null;
        }

        const total = EXP.sum(expenses);
        const labels = groups.map(function (g) { return g.category; });
        const values = groups.map(function (g) { return g.total; });
        const colors = groups.map(function (g) { return U.categoryColor(g.category); });

        registry[key] = new global.Chart(canvas.getContext("2d"), {
            type: "doughnut",
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors,
                    borderColor: theme().surface,
                    borderWidth: 2,
                    hoverOffset: 6,
                    spacing: 1
                }]
            },
            options: Object.assign(baseOptions(), {
                cutout: "64%",
                scales: {},
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "#17201D",
                        padding: 10,
                        cornerRadius: 10,
                        callbacks: {
                            label: function (context) {
                                const value = context.parsed || 0;
                                const share = total > 0 ? Math.round((value / total) * 100) : 0;
                                return context.label + " : " + U.formatCurrency(value) + " (" + share + " %)";
                            }
                        }
                    },
                    ftCenterText: {
                        display: true,
                        label: "Total dépensé",
                        value: U.formatCurrency(total).replace(" " + U.getCurrency(), " " + U.getCurrency())
                    }
                }
            }),
            plugins: [centerTextPlugin]
        });

        if (opts.legendHost) renderLegend(opts.legendHost, groups, total);
        return registry[key];
    }

    /** Légende personnalisée (HTML) : plus lisible que celle de Chart.js sur mobile. */
    function renderLegend(selector, groups, total) {
        const host = typeof selector === "string" ? U.qs(selector) : selector;
        if (!host) return;
        const wrap = U.clear(host);
        const grandTotal = total || groups.reduce(function (a, g) { return a + g.total; }, 0);

        groups.forEach(function (g) {
            const share = grandTotal > 0 ? Math.round(g.share * 100) : 0;
            wrap.appendChild(U.el("div", { class: "legend-item" }, [
                U.el("span", { class: "legend-dot", style: { background: U.categoryColor(g.category) }, attrs: { "aria-hidden": "true" } }),
                U.el("span", { text: U.categoryEmoji(g.category) + " " + g.category + " · " + share + " %" }),
                U.el("span", { class: "lv", text: U.formatCurrency(g.total) })
            ]));
        });
    }

    /** Message centré quand un graphique n'a pas de données (état vide graphique). */
    function renderEmptyChart(canvas, message) {
        const parent = canvas.parentNode;
        const previous = parent.querySelector(".chart-empty-overlay");
        if (previous) previous.parentNode.removeChild(previous);

        canvas.style.display = "none";
        parent.appendChild(U.el("div", {
            class: "empty chart-empty-overlay",
            style: { position: "absolute", inset: "0", padding: "0", placeContent: "center" }
        }, [
            U.el("div", { class: "empty-ico", text: "📊", attrs: { "aria-hidden": "true" } }),
            U.el("p", { text: message || "Pas encore de données à afficher." })
        ]));
    }

    function clearEmptyOverlay(canvas) {
        const parent = canvas.parentNode;
        const previous = parent.querySelector(".chart-empty-overlay");
        if (previous) previous.parentNode.removeChild(previous);
        canvas.style.display = "";
    }

    /* ======================================================================
       2. BARRES — DÉPENSES DES 7 DERNIERS JOURS (§11)
       ====================================================================== */
    function renderDailyBars(selector, options) {
        const canvas = getCanvas(selector);
        if (!canvas) return null;
        const opts = options || {};
        const key = "daily:" + (canvas.id || "chart");
        const days = opts.days || 7;
        const series = opts.series || EXP.getExpensesByDay(days, opts.endDate);

        if (!isAvailable()) {
            showFallback(canvas.parentNode, "Le graphique nécessite Chart.js.");
            return null;
        }
        applyDefaults();
        destroy(key);
        clearEmptyOverlay(canvas);

        const hasData = series.some(function (p) { return p.total > 0; });
        if (!hasData) {
            renderEmptyChart(canvas, "Aucune dépense sur les " + days + " derniers jours.");
            return null;
        }

        const t = theme();
        const todayKey = U.todayISO();
        const max = Math.max.apply(null, series.map(function (p) { return p.total; }));

        registry[key] = new global.Chart(canvas.getContext("2d"), {
            type: "bar",
            data: {
                labels: series.map(function (p) { return p.label; }),
                datasets: [{
                    data: series.map(function (p) { return p.total; }),
                    backgroundColor: series.map(function (p) {
                        return p.date === todayKey ? t.secondary : t.primary;
                    }),
                    hoverBackgroundColor: t.accent,
                    borderRadius: 7,
                    borderSkipped: false,
                    maxBarThickness: 38
                }]
            },
            options: Object.assign(baseOptions(), {
                scales: {
                    x: {
                        grid: { display: false },
                        border: { color: t.border },
                        ticks: {
                            color: t.muted,
                            font: { size: px(12), weight: "700" },
                            callback: function (value, index) {
                                const point = series[index];
                                return point && point.date === todayKey ? "Auj." : this.getLabelForValue(value);
                            }
                        }
                    },
                    y: Object.assign(baseOptions().scales.y, { suggestedMax: max * 1.15 })
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "#17201D",
                        padding: 10,
                        cornerRadius: 10,
                        callbacks: {
                            title: function (items) {
                                const idx = items[0].dataIndex;
                                return series[idx] ? series[idx].fullLabel || series[idx].label : "";
                            },
                            label: function (context) {
                                return "Dépenses : " + U.formatCurrency(context.parsed.y);
                            }
                        }
                    }
                }
            })
        });

        return registry[key];
    }

    /* ======================================================================
       3. COURBE — ÉVOLUTION SUR 30 JOURS (page Analyse)
       ====================================================================== */
    function renderTrendLine(selector, options) {
        const canvas = getCanvas(selector);
        if (!canvas) return null;
        const opts = options || {};
        const key = "trend:" + (canvas.id || "chart");
        const series = opts.series || EXP.getExpensesByDay(30, opts.endDate);

        if (!isAvailable()) {
            showFallback(canvas.parentNode, "Le graphique nécessite Chart.js.");
            return null;
        }
        applyDefaults();
        destroy(key);
        clearEmptyOverlay(canvas);

        if (!series.some(function (p) { return p.total > 0; })) {
            renderEmptyChart(canvas, "Pas encore assez de données sur 30 jours.");
            return null;
        }

        const t = theme();
        const ctx = canvas.getContext("2d");
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height || 240);
        gradient.addColorStop(0, "rgba(217, 139, 57, 0.32)");
        gradient.addColorStop(1, "rgba(217, 139, 57, 0.02)");

        registry[key] = new global.Chart(ctx, {
            type: "line",
            data: {
                labels: series.map(function (p) { return U.formatDate(p.date, { numeric: true }).slice(0, 5); }),
                datasets: [{
                    data: series.map(function (p) { return p.total; }),
                    borderColor: t.secondary,
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.34,
                    borderWidth: 2.5,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: t.primary
                }]
            },
            options: Object.assign(baseOptions(), {
                scales: {
                    x: Object.assign(baseOptions().scales.x, {
                        ticks: { color: t.muted, font: { size: px(11), weight: "600" }, maxRotation: 0, autoSkipPadding: 18 }
                    }),
                    y: baseOptions().scales.y
                }
            })
        });
        return registry[key];
    }

    /* ======================================================================
       4. BARRES — REVENUS VS DÉPENSES (page Analyse)
       ====================================================================== */
    function renderIncomeExpenseBars(selector, options) {
        const canvas = getCanvas(selector);
        if (!canvas) return null;
        const opts = options || {};
        const key = "compare:" + (canvas.id || "chart");
        const months = opts.months || 6;

        if (!isAvailable()) {
            showFallback(canvas.parentNode, "Le graphique nécessite Chart.js.");
            return null;
        }
        applyDefaults();
        destroy(key);
        clearEmptyOverlay(canvas);

        /* 6 derniers mois, du plus ancien au plus récent */
        const labels = [];
        const keys = [];
        let cursor = U.monthKey();
        for (let i = 0; i < months; i++) {
            labels.unshift(U.monthLabel(cursor).split(" ")[0].slice(0, 4) + ".");
            keys.unshift(cursor);
            cursor = U.previousMonthKey(cursor);
        }
        const incomeSeries = keys.map(function (k) { return INC.calculateMonthlyIncomes(k); });
        const expenseSeries = keys.map(function (k) { return EXP.calculateMonthlyExpenses(k); });

        if (!incomeSeries.some(Boolean) && !expenseSeries.some(Boolean)) {
            renderEmptyChart(canvas, "Aucune donnée sur les " + months + " derniers mois.");
            return null;
        }

        const t = theme();
        registry[key] = new global.Chart(canvas.getContext("2d"), {
            type: "bar",
            data: {
                labels: labels,
                datasets: [
                    {
                        label: "Revenus",
                        data: incomeSeries,
                        backgroundColor: t.success,
                        borderRadius: 6,
                        borderSkipped: false,
                        maxBarThickness: 26
                    },
                    {
                        label: "Dépenses",
                        data: expenseSeries,
                        backgroundColor: t.earth,
                        borderRadius: 6,
                        borderSkipped: false,
                        maxBarThickness: 26
                    }
                ]
            },
            options: Object.assign(baseOptions(), {
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "#17201D",
                        padding: 10,
                        cornerRadius: 10,
                        callbacks: { label: currencyTooltipLabel }
                    }
                }
            })
        });
        return registry[key];
    }

    /* ======================================================================
       5. MINI-BARRES DE CATÉGORIE (barre horizontale Chart.js)
       ====================================================================== */
    function renderCategoryBars(selector, options) {
        const canvas = getCanvas(selector);
        if (!canvas) return null;
        const opts = options || {};
        const key = "catbars:" + (canvas.id || "chart");
        const groups = opts.groups || EXP.getExpensesByCategory(EXP.getExpenses({ month: opts.month || U.monthKey() }));

        if (!isAvailable()) return null;
        applyDefaults();
        destroy(key);
        clearEmptyOverlay(canvas);

        if (!groups.length) {
            renderEmptyChart(canvas, "Aucune dépense à comparer.");
            return null;
        }

        const top = groups.slice(0, 8).reverse();
        const t = theme();

        registry[key] = new global.Chart(canvas.getContext("2d"), {
            type: "bar",
            data: {
                labels: top.map(function (g) { return U.categoryEmoji(g.category) + " " + g.category; }),
                datasets: [{
                    data: top.map(function (g) { return g.total; }),
                    backgroundColor: top.map(function (g) { return U.categoryColor(g.category); }),
                    borderRadius: 6,
                    borderSkipped: false,
                    maxBarThickness: 22
                }]
            },
            options: Object.assign(baseOptions(), {
                indexAxis: "y",
                scales: {
                    x: Object.assign(baseOptions().scales.y, { grid: { color: t.border, drawTicks: false } }),
                    y: {
                        grid: { display: false },
                        border: { display: false },
                        ticks: { color: t.muted, font: { size: px(12), weight: "600" } }
                    }
                }
            })
        });
        return registry[key];
    }

    /* ======================================================================
       6. ORCHESTRATION
       ====================================================================== */

    /** Met à jour les graphiques présents sur la page courante. */
    /**
     * Montants par moyen de paiement (barres horizontales).
     * Chaque barre reprend la couleur d'identification du moyen de paiement.
     */
    function renderPaymentBars(selector, options) {
        const canvas = getCanvas(selector);
        if (!canvas) return null;
        const opts = options || {};
        const key = "paybars:" + (canvas.id || "chart");

        if (!isAvailable()) return null;
        applyDefaults();
        destroy(key);
        clearEmptyOverlay(canvas);

        if (!global.FT.payments) {
            renderEmptyChart(canvas, "Répartition indisponible.");
            return null;
        }

        /* Par défaut : les dépenses du mois affiché (comme « Dépenses par catégorie ») */
        const scope = opts.list || EXP.getExpenses({ month: opts.month || U.monthKey() });
        const breakdown = global.FT.payments.getPaymentBreakdown(scope);
        const rows = breakdown.rows.filter(function (row) { return row.total > 0; });

        if (!rows.length) {
            renderEmptyChart(canvas, "Aucune dépense par moyen de paiement.");
            return null;
        }

        const top = rows.slice(0, 8).reverse();
        const t = theme();

        registry[key] = new global.Chart(canvas.getContext("2d"), {
            type: "bar",
            data: {
                labels: top.map(function (row) {
                    return (row.method === global.FT.payments.UNKNOWN ? "❔ " : row.emoji + " ") + row.method;
                }),
                datasets: [{
                    data: top.map(function (row) { return row.total; }),
                    backgroundColor: top.map(function (row) { return row.color; }),
                    borderRadius: 6,
                    borderSkipped: false,
                    maxBarThickness: 24
                }]
            },
            options: Object.assign(baseOptions(), {
                indexAxis: "y",
                scales: {
                    x: Object.assign(baseOptions().scales.y, { grid: { color: t.border, drawTicks: false } }),
                    y: {
                        grid: { display: false },
                        border: { display: false },
                        ticks: { color: t.muted, font: { size: px(12), weight: "600" } }
                    }
                },
                plugins: Object.assign({}, baseOptions().plugins, {
                    tooltip: Object.assign({}, baseOptions().plugins.tooltip, {
                        callbacks: {
                            label: function (ctx) {
                                const row = top[ctx.dataIndex];
                                const parts = [U.formatCurrency(row.total)];
                                if (row.expenseCount) parts.push("dépenses : " + U.formatCurrency(row.expense));
                                if (row.incomeCount) parts.push("reçus : " + U.formatCurrency(row.income));
                                parts.push(row.count + " transaction" + (row.count > 1 ? "s" : ""));
                                return parts.join(" · ");
                            }
                        }
                    })
                })
            })
        });
        return registry[key];
    }

    function updateCharts() {
        if (U.qs("#chartCategoryDonut") || U.qs("#donutLegend")) {
            const canvas = U.qs("#chartCategoryDonut");
            if (canvas) { clearEmptyOverlay(canvas); renderCategoryDonut("#chartCategoryDonut", { legendHost: "#donutLegend" }); }
        }
        if (U.qs("#chartDailyBars")) {
            clearEmptyOverlay(U.qs("#chartDailyBars"));
            renderDailyBars("#chartDailyBars", { days: 7 });
        }
        if (U.qs("#chartTrend30")) {
            clearEmptyOverlay(U.qs("#chartTrend30"));
            renderTrendLine("#chartTrend30", { days: 30 });
        }
        if (U.qs("#chartMonthlyCompare")) {
            clearEmptyOverlay(U.qs("#chartMonthlyCompare"));
            renderIncomeExpenseBars("#chartMonthlyCompare", { months: 6 });
        }
        if (U.qs("#chartCategoryBars")) {
            clearEmptyOverlay(U.qs("#chartCategoryBars"));
            renderCategoryBars("#chartCategoryBars");
        }
        if (U.qs("#chartPaymentBars")) {
            clearEmptyOverlay(U.qs("#chartPaymentBars"));
            renderPaymentBars("#chartPaymentBars");
        }
    }

    function destroyAll() {
        Object.keys(registry).forEach(destroy);
    }

    function initCharts() {
        if (!isAvailable()) {
            console.warn("[FinaTrack] Chart.js indisponible : les graphiques sont désactivés, les calculs restent exacts.");
            return;
        }
        updateCharts();
        U.bus.on("data:changed", function () {
            /* Rafraîchissement différé pour laisser le DOM se mettre à jour d'abord */
            setTimeout(updateCharts, 30);
        });
        U.bus.on("theme:changed", function () {
            destroyAll();
            setTimeout(updateCharts, 30);
        });
    }

    /* ======================================================================
       7. EXPORTS
       ====================================================================== */
    global.FT.charts = {
        isAvailable: isAvailable,
        renderCategoryDonut: renderCategoryDonut,
        renderDailyBars: renderDailyBars,
        renderTrendLine: renderTrendLine,
        renderIncomeExpenseBars: renderIncomeExpenseBars,
        renderCategoryBars: renderCategoryBars,
        renderPaymentBars: renderPaymentBars,
        renderLegend: renderLegend,
        renderEmptyChart: renderEmptyChart,
        clearEmptyOverlay: clearEmptyOverlay,
        updateCharts: updateCharts,
        destroyAll: destroyAll,
        initCharts: initCharts
    };

    global.updateCharts = updateCharts;
})(window);
