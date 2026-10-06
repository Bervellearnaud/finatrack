#!/usr/bin/env python3
# ==========================================================================
# FinaTrack CI — tools/build-preview.py
#
# Construit une version MONO-FICHIER de l'application (CSS, JavaScript et
# Chart.js intégrés) dans preview/finatrack-ci-preview.html.
#
# Utilité :
#   • partager la démo par e-mail ou dans un aperçu sans serveur ;
#   • consulter l'application depuis un environnement sans accès réseau
#     (les ressources sont intégrées, aucun CDN n'est appelé) ;
#   • naviguer entre les 6 écrans grâce à un petit routeur de prévisualisation.
#
# Usage :
#     python3 tools/build-preview.py
#
# Le projet multi-pages reste la version de référence : index.html + pages/*.html
# ==========================================================================

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "preview" / "finatrack-ci-preview.html"

CSS_FILES = ["css/style.css", "css/components.css", "css/responsive.css"]
JS_FILES = [
    "js/vendor/chart.umd.min.js",
    "js/utils.js",
    "js/storage.js",
    "js/expenses.js",
    "js/incomes.js",
    "js/transactions.js",
    "js/payments.js",
    "js/budget.js",
    "js/dashboard.js",
    "js/analysis.js",
    "js/charts.js",
    "js/voiceExpense.js",
    "js/app.js",
    "js/mobile.js",
]
PAGES = {
    "dashboard": "index.html",
    "transactions": "pages/transactions.html",
    "incomes": "pages/incomes.html",
    "budget": "pages/budget.html",
    "analysis": "pages/analysis.html",
    "settings": "pages/settings.html",
}

TITLES = {
    "dashboard": "Tableau de bord",
    "transactions": "Transactions",
    "incomes": "Revenus",
    "budget": "Budget",
    "analysis": "Analyses",
    "settings": "Paramètres",
}


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def extract_main(html):
    match = re.search(r"<main\b[^>]*>.*?</main>", html, flags=re.S)
    if not match:
        raise SystemExit("Bloc <main> introuvable dans la page.")
    return match.group(0)


def extract_document(html):
    match = re.search(r"<!DOCTYPE html>.*?</html>", html, flags=re.S)
    return match.group(0) if match else html


def build():
    shell = extract_document(read("index.html"))

    # 1. Feuilles de style intégrées
    for css in CSS_FILES:
        shell = shell.replace(
            '<link rel="stylesheet" href="%s">' % css,
            "<style>\n/* ==== %s ==== */\n%s\n</style>" % (css, read(css)),
        )

    # 2. Scripts intégrés
    for js in JS_FILES:
        shell = shell.replace(
            '<script src="%s"></script>' % js,
            "<script>\n/* ==== %s ==== */\n%s\n</script>" % (js, read(js)),
        )

    # 3. En version mono-fichier, le manifeste et le service worker sont
    #    inutiles (aucun serveur, aucune icône à installer) : on retire les
    #    balises correspondantes pour ne pas provoquer de requêtes inutiles.
    shell = re.sub(
        r'<link rel="manifest"[^>]*>\s*',
        "",
        shell,
    )
    shell = re.sub(
        r'<meta name="finatrack-sw"[^>]*>\s*',
        "",
        shell,
    )
    shell = re.sub(
        r'\s*<script src="js/mobile\.js"></script>',
        "",
        shell,
    )

    # 3. Gabarits des autres écrans (repris tels quels depuis pages/*.html)
    templates = {}
    for name, rel in PAGES.items():
        body = extract_main(read(rel))
        templates[name] = body.replace('data-page="%s"' % name, 'data-page="%s"' % name).strip()

    templates_js = ",\n".join(
        '        "%s": %s' % (name, repr(html).replace("\\n", "\\n"))
        for name, html in templates.items()
    )

    router = """
<!-- ==========================================================================
     Routeur de prévisualisation (uniquement pour cette version mono-fichier).
     Dans le projet multi-pages, la navigation se fait normalement entre
     index.html et pages/*.html.
     ========================================================================== -->
<script>
(function () {
    "use strict";
    var U = window.FT.utils;
    var PAGES = {
%s
    };
    var TITLES = %s;
    var visited = { dashboard: true }; /* app.js a déjà amorcé le tableau de bord */

    var initialisers = {
        dashboard: function () { window.FT.dashboard.initDashboard(); },
        transactions: function () { window.FT.tx.initTransactionsPage(); },
        incomes: function () { window.FT.incomes.initIncomesPage(); },
        budget: function () { window.FT.budget.initBudgetPage(); },
        analysis: function () { window.FT.analysis.initAnalysisPage(); },
        settings: function () { window.FT.app.renderSettingsPage(); }
    };
    var refreshers = {
        dashboard: function () { window.FT.dashboard.updateDashboard(); },
        transactions: function () { window.FT.tx.refresh(); },
        incomes: function () { window.FT.incomes.refreshIncomes(); },
        budget: function () { window.FT.budget.renderBudgetPage(); },
        analysis: function () { window.FT.analysis.refresh(); },
        settings: function () { window.FT.app.renderSettingsPage(); }
    };

    function pageFromHref(href) {
        if (!href) return null;
        var clean = href.split("?")[0].split("#")[0];
        if (clean.slice(-5) !== ".html") return null;
        var file = clean.split("/").pop().replace(".html", "");
        return file === "index" ? "dashboard" : file;
    }

    function render(page, push) {
        var main = document.querySelector("main.page");
        if (!main) return;
        if (!PAGES[page]) page = "dashboard";

        main.setAttribute("data-page", page);
        main.innerHTML = PAGES[page];

        if (!visited[page]) { visited[page] = true; initialisers[page](); }
        else { refreshers[page](); }

        U.setText("#topbarTitle", TITLES[page] || "FinaTrack CI");
        window.FT.app.markActiveNav();
        if (window.FT.charts && window.FT.charts.isAvailable()) {
            window.FT.charts.destroyAll();
            window.FT.charts.updateCharts();
        }
        U.scrollToTop(false);
        if (push && window.location.hash !== "#/" + page) window.location.hash = "#/" + page;
    }

    function currentPage() {
        var fromHash = (window.location.hash || "").replace("#/", "");
        return fromHash && PAGES[fromHash] ? fromHash : "dashboard";
    }

    /* Interception des liens internes : navigation instantanée, sans serveur */
    U.delegate(document.body, "click", "a[href]", function (event, link) {
        var page = pageFromHref(link.getAttribute("href"));
        if (!page) return;
        event.preventDefault();
        render(page, true);
    });

    window.addEventListener("hashchange", function () { render(currentPage(), false); });

    render(currentPage(), false);
})();
</script>
""" % (templates_js, "{ " + ", ".join('"%s": "%s"' % (k, v) for k, v in TITLES.items()) + " }")

    shell = shell.replace("</body>", router + "\n</body>")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(shell, encoding="utf-8")

    size_kb = OUT.stat().st_size / 1024
    remaining = re.findall(r'(?:href|src)="(?!#|data:|mailto:)([^"]+)"', shell)
    external = [r for r in remaining if r.endswith((".css", ".js"))]
    print("Aperçu généré : %s (%.0f Ko)" % (OUT.relative_to(ROOT), size_kb))
    print("Ressources externes restantes : %s" % (external or "aucune"))


if __name__ == "__main__":
    build()
