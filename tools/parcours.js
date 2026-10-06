/* Parcours réel de l'application, comme un utilisateur : première visite,
   ajout d'une dépense au doigt, dépense vocale (avec confirmation obligatoire). */
const puppeteer = require("puppeteer");
const B = process.env.FINATRACK_URL || "http://127.0.0.1:5173";
const t = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const page = await browser.newPage();
    const erreurs = [];
    page.on("pageerror", e => erreurs.push("pageerror : " + e.message));
    page.on("console", m => { if (m.type() === "error") erreurs.push("console : " + m.text()); });
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const etapes = [];
    const note = (ok, label, detail) => etapes.push((ok ? "  ✓ " : "  ✗ ") + label + (detail ? " — " + detail : ""));

    /* 1. Première visite : login obligatoire puis démonstration proposée */
    await page.goto(B + "/index.html", { waitUntil: "networkidle2" });
    await page.evaluate(() => localStorage.clear());
    await page.goto(B + "/pages/login.html", { waitUntil: "networkidle2" });
    await page.evaluate(() => {
        // Crée un compte de test directement via localStorage pour le parcours
        var users = [{ id: "usr_parcours", email: "parcours@finatrack.local", name: "Parcours", passwordHash: "h_test", createdAt: new Date().toISOString() }];
        localStorage.setItem("finatrack_users", JSON.stringify(users));
        localStorage.setItem("finatrack_session", JSON.stringify({ userId: "usr_parcours", email: "parcours@finatrack.local", createdAt: new Date().toISOString(), token: "sess_parcours" }));
        localStorage.setItem("finatrack_settings", JSON.stringify({ demoLoaded: false }));
    });
    await page.goto(B + "/index.html", { waitUntil: "networkidle2" });
    await t(900);
    const accueil = await page.evaluate(() => ({
        fenetre: !!document.querySelector(".modal.is-open"),
        texte: (document.querySelector(".modal-panel") || {}).textContent || "",
        granulaire: /exemples/i.test(document.body.textContent)
    }));
    note(accueil.fenetre && /exemples/i.test(accueil.texte), "Première visite : la démonstration est proposée (après login)");
    await page.screenshot({ path: "screens/run-01-premiere-visite.png" });

    /* 2. Chargement de la démonstration */
    await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find(b => /exemples/i.test(b.textContent)).click();
    });
    await t(1200);
    const demo = await page.evaluate(() => {
        const d = window.FT.dashboard.getDashboardData();
        const w = window.FT.payments.getWalletBalances();
        return {
            depenses: window.FT.data.getExpenses().length,
            revenus: window.FT.data.getIncomes().length,
            kpiRevenus: d.income, kpiDepenses: d.expense, solde: d.balance,
            budget: d.budget.hasBudget ? d.budget.budget : 0,
            portefeuilles: w.totals.active, totalDispo: w.totals.balance, negatifs: w.totals.negativeCount,
            tuiles: document.querySelectorAll("#dashWallets .wallet-tile").length,
            heures: document.querySelector("#dashKpis").textContent.replace(/\s+/g, " ").slice(0, 90)
        };
    });
    note(demo.depenses === 14 && demo.revenus === 3, "Démonstration chargée", demo.depenses + " dépenses · " + demo.revenus + " revenus");
    note(demo.kpiRevenus > 0 && demo.solde > 0, "Indicateurs cohérents",
        "revenus " + demo.kpiRevenus + " · dépenses " + demo.kpiDepenses + " · solde " + demo.solde + " FCFA");
    note(demo.tuiles === 9, "9 portefeuilles affichés", demo.portefeuilles + " suivis · total " + demo.totalDispo + " FCFA · " + demo.negatifs + " négatif(s)");

    /* 3. Ajout d'une dépense au doigt, via le bouton + central */
    await page.evaluate(() => document.querySelector('[data-action="open-add-menu"]').click());
    await t(500);
    const menu = await page.evaluate(() => (document.querySelector(".modal-panel") || {}).textContent || "");
    note(/Dépense complète/.test(menu) && /Dépense rapide/.test(menu) && /voix/.test(menu),
        "Menu + : 4 méthodes proposées (rapide, voix, complète, revenu)");
    await page.evaluate(() => {
        Array.from(document.querySelectorAll(".modal-panel .quick-action"))
            .find(b => /Dépense complète/.test(b.textContent)).click();
    });
    await t(700);
    const avant = await page.evaluate(() => window.FT.payments.getWalletBalance("Espèces"));
    await page.evaluate(() => {
        const m = document.querySelector("#amount");
        m.value = "2000";
        m.dispatchEvent(new Event("input", { bubbles: true }));
        const c = document.querySelector("#category");
        c.value = "Transport";
        c.dispatchEvent(new Event("change", { bubbles: true }));
        const p = document.querySelector("#payment");
        p.value = "Espèces";
        p.dispatchEvent(new Event("change", { bubbles: true }));
        document.querySelector("#expenseForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await t(900);
    const apres = await page.evaluate(() => ({
        solde: window.FT.payments.getWalletBalance("Espèces"),
        total: window.FT.data.getExpenses().length,
        toast: (document.querySelector(".toast") || {}).textContent || "",
        derniere: (document.querySelector("#dashRecent") || {}).textContent || ""
    }));
    note(apres.total === 15, "Dépense enregistrée par le formulaire", apres.total + " dépenses au total");
    note(avant - apres.solde === 2000, "Le portefeuille Espèces baisse de 2 000 FCFA", avant + " → " + apres.solde + " FCFA");
    note(/2000|2 000/.test(apres.derniere.replace(/\s/g, "")), "La dépense apparaît sur le tableau de bord");
    await page.screenshot({ path: "screens/run-02-apres-ajout.png" });

    /* 4. Dépense vocale : détection puis confirmation OBLIGATOIRE */
    const voix = await page.evaluate(async () => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        /* Exactement le chemin d'un vrai micro : la fenêtre vocale est ouverte,
           puis la phrase reconnue arrive dans handleVoiceResult(), qui analyse
           et propose la confirmation — aucun enregistrement automatique. */
        window.FT.voice.open();
        await wait(450);
        window.FT.voice.handleVoiceResult("J'ai dépensé 2 000 francs pour le taxi");
        await wait(800);
        const carte = document.querySelector("#voiceConfirmCard");
        const analyse = window.FT.voice.getState().parsed;
        return {
            fenetre: !!carte,
            texte: carte ? carte.textContent.replace(/\s+/g, " ").slice(0, 240) : "",
            montant: analyse ? analyse.amount : null,
            categorie: analyse ? analyse.category : null,
            description: analyse ? analyse.description : null,
            avantEnregistrement: window.FT.data.getExpenses().length
        };
    });
    note(voix.montant === 2000, "Vocal : montant détecté", "« 2 000 francs » → " + voix.montant + " FCFA");
    note(voix.categorie === "Transport", "Vocal : catégorie déduite", String(voix.categorie) + " · description « " + voix.description + " »");
    note(/Confirmer/i.test(voix.texte) && /Modifier/i.test(voix.texte),
        "Vocal : les deux choix sont proposés (Modifier / Confirmer)");
    note(voix.avantEnregistrement === 15, "Aucun enregistrement automatique — confirmation requise",
        voix.avantEnregistrement + " dépenses inchangées");
    await page.screenshot({ path: "screens/run-03-vocal-confirmation.png" });

    /* 5. Confirmation explicite */
    await page.evaluate(() => {
        Array.from(document.querySelectorAll(".modal button")).find(b => /Confirmer/.test(b.textContent)).click();
    });
    await t(1000);
    const final = await page.evaluate(() => ({
        total: window.FT.data.getExpenses().length,
        solde: window.FT.payments.getWalletBalance("Espèces"),
        toast: (document.querySelector(".toast") || {}).textContent || ""
    }));
    note(final.total === 16, "Vocal confirmé et enregistré", final.total + " dépenses");
    note(/Dépense enregistrée/.test(final.toast) && /2\s?000/.test(final.toast.replace(/\u202f|\u00a0/g, " ")),
        "Message de confirmation affiché", final.toast.replace(/\s+/g, " ").slice(0, 60));

    /* 6. Persistance : on recharge la page, tout doit être là */
    await page.reload({ waitUntil: "networkidle2" });
    await t(1000);
    const apresReload = await page.evaluate(() => ({
        total: window.FT.data.getExpenses().length,
        solde: window.FT.payments.getWalletTotal().balance,
        tuiles: document.querySelectorAll("#dashWallets .wallet-tile").length
    }));
    note(apresReload.total === 16, "Données conservées après rechargement", apresReload.total + " dépenses");
    note(apresReload.tuiles === 9, "Portefeuilles recomposés", "total disponible " + apresReload.solde + " FCFA");

    console.log("\n▶ Parcours réel de l'application (390 × 844, Chromium)");
    etapes.forEach(e => console.log(e));
    console.log("\nErreurs JavaScript : " + (erreurs.length ? erreurs.slice(0, 5).join(" | ") : "aucune"));
    const echecs = etapes.filter(e => e.indexOf("✗") !== -1).length;
    console.log("Résultat : " + (etapes.length - echecs) + " ✓ / " + echecs + " ✗");
    await browser.close();
    process.exit(echecs || erreurs.length ? 1 : 0);
})();
