/* ==========================================================================
   FinaTrack CI — mobile.js
   Adaptation mobile avancée :
     1. détection de l'appareil et du mode « application installée » ;
     2. hauteur de fenêtre fiable (barre d'adresse mobile, clavier virtuel) ;
     3. barrage anti-zoom iOS sur les champs de saisie ;
     4. retour haptique léger sur les actions clés ;
     5. fermeture des fenêtres par glissement vers le bas (bottom-sheet) ;
     6. indicateur hors ligne (l'application continue de fonctionner) ;
     7. installation sur l'écran d'accueil (PWA) : avantage + instructions iOS ;
     8. enregistrement du service worker et gestion des mises à jour.

   Aucun impact sur le rendu ordinateur : tout est conditionné au tactile ou
   à la présence des API concernées.
   ========================================================================== */
(function (global) {
    "use strict";

    const U = global.FT.utils;
    const doc = document;
    const root = doc.documentElement;

    /* ======================================================================
       1. DÉTECTION DE L'APPAREIL
       ====================================================================== */

    const ua = global.navigator.userAgent || "";

    const isTouch = (function () {
        const coarse = global.matchMedia && global.matchMedia("(pointer: coarse)").matches;
        return ("ontouchstart" in global) || global.navigator.maxTouchPoints > 0 || coarse;
    })();

    const isIOS = /iPad|iPhone|iPod/.test(ua) ||
        (global.navigator.platform === "MacIntel" && global.navigator.maxTouchPoints > 1);

    const isAndroid = /Android/i.test(ua);

    const isStandalone = (function () {
        const displayMode = global.matchMedia && global.matchMedia("(display-mode: standalone)").matches;
        const displayModeFullscreen = global.matchMedia && global.matchMedia("(display-mode: fullscreen)").matches;
        return !!(displayMode || displayModeFullscreen || global.navigator.standalone === true);
    })();

    const canVibrate = typeof global.navigator.vibrate === "function";

    /** Le module s'active-t-il ? (mobile/tablette, ou en mode application) */
    const isMobileContext = isTouch || global.innerWidth < 1024 || isStandalone;

    /* ======================================================================
       2. HAUTEUR DE FENÊTRE FIABLE  (--vh)
       La barre d'adresse mobile et le clavier virtuel font varier 100vh :
       on expose une mesure fiable aux feuilles de style.
       ====================================================================== */

    let resizeTimer = null;

    function setViewportHeight() {
        const height = (global.visualViewport && global.visualViewport.height) || global.innerHeight;
        root.style.setProperty("--vh", (height * 0.01).toFixed(3) + "px");
        root.style.setProperty("--vw", (global.innerWidth * 0.01).toFixed(3) + "px");
    }

    function initViewportHeight() {
        setViewportHeight();
        const schedule = function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                setViewportHeight();
                updateKeyboardState();
            }, 90);
        };
        global.addEventListener("resize", schedule, { passive: true });
        global.addEventListener("orientationchange", function () {
            setTimeout(setViewportHeight, 260); // la rotation n'est pas immédiate
        }, { passive: true });
        if (global.visualViewport) {
            global.visualViewport.addEventListener("resize", schedule, { passive: true });
        }
    }

    /* ======================================================================
       3. CLAVIER VIRTUEL
       Quand le clavier s'ouvre, on masque la barre de navigation basse pour
       libérer l'espace de saisie (sinon elle recouvre le champ actif).
       ====================================================================== */

    function updateKeyboardState() {
        if (!global.visualViewport) return;
        const lost = global.innerHeight - global.visualViewport.height;
        const keyboardOpen = lost > 160;
        root.classList.toggle("kb-open", keyboardOpen);
        /* Positionne la fenêtre modale au-dessus du clavier */
        if (keyboardOpen && global.visualViewport.offsetTop > 0) {
            root.style.setProperty("--kb-offset", global.visualViewport.offsetTop + "px");
        }
    }

    /* ======================================================================
       4. ANTI-ZOOM iOS SUR LES CHAMPS
       iOS zoome automatiquement dès qu'un champ fait moins de 16 px.
       Plutôt que d'agrandir tous les champs (ce qui casserait la mise en
       page), on force 16 px uniquement pendant la saisie, sur iOS.
       ====================================================================== */

    function initZoomGuard() {
        if (!isIOS) return;
        const CLASS = "ios-zoom-guard";

        doc.addEventListener("focusin", function (e) {
            const field = e.target;
            if (!field || !/^(INPUT|SELECT|TEXTAREA)$/.test(field.tagName)) return;
            const size = parseFloat(global.getComputedStyle(field).fontSize) || 0;
            if (size > 0 && size < 16) field.classList.add(CLASS);
        });

        doc.addEventListener("focusout", function (e) {
            if (e.target && e.target.classList) e.target.classList.remove(CLASS);
        });
    }

    /* ======================================================================
       5. RETOUR HAPTIQUE
       Micro-vibrations discrètes : confirmation d'enregistrement, de
       suppression, appui sur le bouton « + » ou sur le micro.
       ====================================================================== */

    const HAPTIC = { light: 8, medium: 14, heavy: [10, 30, 10] };

    function haptic(pattern) {
        if (!canVibrate) return false;
        if (!isMobileContext) return false;
        try {
            global.navigator.vibrate(pattern || HAPTIC.light);
            return true;
        } catch (e) {
            return false;
        }
    }

    function initHaptics() {
        if (!canVibrate) return;

        /* Retour léger sur les boutons d'action */
        U.delegate(doc.body, "click", ".fab-btn, .mic-btn, .btn-accent, .bn-add .fab-btn", function () {
            haptic(HAPTIC.light);
        });

        /* Retours métier, branchés sur le bus d'événements */
        U.bus.on("expense:added", function () { haptic(HAPTIC.medium); });
        U.bus.on("income:added", function () { haptic(HAPTIC.medium); });
        U.bus.on("expense:updated", function () { haptic(HAPTIC.light); });
        U.bus.on("income:updated", function () { haptic(HAPTIC.light); });
        U.bus.on("expense:deleted", function () { haptic(HAPTIC.heavy); });
        U.bus.on("income:deleted", function () { haptic(HAPTIC.heavy); });
        U.bus.on("budget:updated", function () { haptic(HAPTIC.light); });
        U.bus.on("voice:confirmed", function () { haptic([12, 40, 12]); });
    }

    /* ======================================================================
       6. FERMETURE PAR GLISSEMENT (bottom-sheet)
       On glisse la poignée (ou le haut de la fenêtre) vers le bas, comme dans
       les applications mobiles natives. Le geste est ignoré si le contenu est
       déjà défilé, ou si la fenêtre est centrée (écran large).
       ====================================================================== */

    function attachSwipeToClose(panel, close) {
        if (!isMobileContext || !isTouch || !panel || typeof close !== "function") return;
        if (global.innerWidth >= 768) return;

        const THRESHOLD = 110;     // distance de fermeture
        const MAX_DOWN = 180;      // étirement maximal de la fenêtre
        let startY = 0;
        let currentY = 0;
        let tracking = false;
        let dragging = false;

        function onDown(e) {
            if (e.button !== undefined && e.button !== 0) return;
            const target = e.target;
            const inGrip = !!(target.closest && target.closest(".modal-grip"));
            /* La poignée est toujours saisissable ; ailleurs, on part du haut
               de la fenêtre et seulement si le contenu n'est pas défilé. */
            if (!inGrip) {
                if (panel.scrollTop > 6) return;
                const rect = panel.getBoundingClientRect();
                if (e.clientY - rect.top > 96) return;
            }
            tracking = true;
            dragging = false;
            startY = e.clientY;
            currentY = startY;
            panel.style.transition = "none";
        }

        function onMove(e) {
            if (!tracking) return;
            currentY = e.clientY;
            const delta = currentY - startY;

            if (!dragging) {
                if (delta < 8) return;          // on laisse passer les taps
                dragging = true;
                panel.classList.add("is-dragging");
            }
            const resisted = Math.min(MAX_DOWN, delta * (delta > THRESHOLD ? 0.45 : 0.75));
            panel.style.transform = "translateY(" + resisted + "px)";
        }

        function onUp(e) {
            if (!tracking) return;
            /* Certains navigateurs n'émettent pas de dernier pointermove :
               on récupère la position de relâchement quand elle est fournie. */
            if (e && typeof e.clientY === "number") currentY = e.clientY;
            tracking = false;
            panel.style.transition = "";
            panel.classList.remove("is-dragging");

            if (dragging && currentY - startY > THRESHOLD) {
                panel.style.transform = "";
                haptic(HAPTIC.light);
                close();
            } else {
                panel.style.transform = "";
            }
            dragging = false;
        }

        panel.addEventListener("pointerdown", onDown);
        panel.addEventListener("pointermove", onMove);
        panel.addEventListener("pointerup", onUp);
        panel.addEventListener("pointercancel", onUp);
    }

    /* ======================================================================
       7. INDICATEUR HORS LIGNE
       L'application fonctionne sans réseau (données locales) : on le dit,
       et on rassure plutôt que d'alarmer.
       ====================================================================== */

    let offlineBar = null;

    function buildOfflineBar() {
        if (offlineBar) return offlineBar;
        offlineBar = U.el("div", {
            id: "offlineBar",
            class: "offline-bar",
            attrs: { role: "status", "aria-live": "polite" }
        }, [
            U.el("span", { class: "ob-ico", text: "📴", attrs: { "aria-hidden": "true" } }),
            U.el("span", { class: "ob-text", text: "Hors ligne — vos données restent sur l'appareil et tout continue de fonctionner." })
        ]);

        const host = U.qs(".main-wrap") || doc.body;
        const page = U.qs(".page", host);
        if (page) host.insertBefore(offlineBar, page);
        else host.appendChild(offlineBar);
        return offlineBar;
    }

    function updateConnectivity(state) {
        const online = state === undefined ? global.navigator.onLine !== false : state;
        root.classList.toggle("is-offline", !online);

        if (!online) {
            const bar = buildOfflineBar();
            bar.classList.add("is-visible");
        } else {
            if (offlineBar) offlineBar.classList.remove("is-visible");
            const wasOffline = root.dataset.wasOffline === "1";
            if (wasOffline) {
                U.toast("Connexion rétablie", "success", "Vos données locales n'ont jamais été interrompues.");
            }
        }
        root.dataset.wasOffline = online ? "0" : "1";
    }

    function initConnectivity() {
        root.dataset.wasOffline = global.navigator.onLine === false ? "1" : "0";
        updateConnectivity();
        global.addEventListener("online", function () { updateConnectivity(true); });
        global.addEventListener("offline", function () { updateConnectivity(false); });
    }

    /* ======================================================================
       8. INSTALLATION SUR L'ÉCRAN D'ACCUEIL (PWA)
       ====================================================================== */

    let deferredPrompt = null;

    function initInstallPrompt() {
        global.addEventListener("beforeinstallprompt", function (event) {
            event.preventDefault();
            deferredPrompt = event;
            showInstallButtons();
        });

        global.addEventListener("appinstalled", function () {
            deferredPrompt = null;
            hideInstallButtons();
            U.toast("Application installée", "success", "FinaTrack est maintenant sur votre écran d'accueil.");
        });
    }

    function showInstallButtons() {
        U.qsa('[data-action="install-app"]').forEach(function (button) {
            if (button.dataset.alwaysVisible === "1") return;
            button.hidden = false;
        });
    }

    function hideInstallButtons() {
        U.qsa('[data-action="install-app"]').forEach(function (button) {
            if (button.dataset.alwaysVisible === "1") return;
            button.hidden = true;
        });
    }

    /** Lance l'invitation d'installation, ou explique la marche à suivre. */
    function promptInstall() {
        if (isStandalone) {
            U.toast("Déjà installée", "info", "FinaTrack est ouverte en mode application sur cet appareil.");
            return Promise.resolve("already-installed");
        }
        if (deferredPrompt) {
            deferredPrompt.prompt();
            return deferredPrompt.userChoice.then(function (choice) {
                const accepted = choice && choice.outcome === "accepted";
                U.toast(accepted ? "Installation lancée" : "Installation annulée",
                    accepted ? "success" : "info",
                    accepted ? "Retrouvez FinaTrack sur votre écran d'accueil." : "Vous pouvez réessayer depuis les Paramètres.");
                if (accepted) deferredPrompt = null;
                return choice && choice.outcome;
            });
        }
        /* Pas d'invitation automatique disponible (iOS, ou déjà refusée) */
        showInstallInstructions();
        return Promise.resolve("instructions");
    }

    function showInstallInstructions() {
        const titleId = "installHelpTitle";
        const steps = isIOS
            ? [
                "Ouvrez cette page dans Safari (l'ajout à l'écran d'accueil n'existe pas dans Chrome sur iPhone).",
                "Appuyez sur le bouton Partager ⬆︎ en bas de l'écran.",
                "Choisissez « Sur l'écran d'accueil ».",
                "Validez avec « Ajouter » : l'icône FinaTrack apparaît avec vos autres applications."
            ]
            : [
                "Ouvrez le menu de votre navigateur (les trois points, en haut à droite).",
                "Choisissez « Installer l'application » ou « Ajouter à l'écran d'accueil ».",
                "Validez : FinaTrack s'ouvre ensuite en plein écran, comme une application."
            ];

        const panel = U.el("div", { class: "modal-panel modal-narrow", attrs: { "aria-labelledby": titleId } }, [
            U.el("div", { class: "modal-grip", attrs: { "aria-hidden": "true" } }),
            U.el("div", { class: "modal-head" }, [
                U.el("div", {}, [
                    U.el("h2", { id: titleId, text: "📲 Installer FinaTrack" }),
                    U.el("p", { class: "modal-sub", text: "Icône sur l'écran d'accueil, ouverture plein écran, et utilisation sans connexion." })
                ]),
                U.el("button", { class: "icon-btn", type: "button", text: "✕", attrs: { "aria-label": "Fermer" }, on: { click: function () { modal.close(); } } })
            ]),
            U.el("ol", { class: "install-steps" }, steps.map(function (step, index) {
                return U.el("li", {}, [
                    U.el("span", { class: "step-no", text: String(index + 1) }),
                    U.el("span", { text: step })
                ]);
            })),
            U.el("div", { class: "alert info", style: { marginTop: "16px" } }, [
                U.el("span", { class: "alert-ico", text: "🔒", attrs: { "aria-hidden": "true" } }),
                U.el("div", {}, [
                    U.el("div", { class: "alert-title", text: "Vos données ne bougent pas" }),
                    U.el("div", { class: "muted", text: "L'installation ne change rien au stockage : tout reste dans le navigateur de cet appareil." })
                ])
            ]),
            U.el("div", { class: "modal-foot" }, [
                U.el("button", { class: "btn btn-primary", type: "button", text: "J'ai compris", "data-autofocus": "", on: { click: function () { modal.close(); } } })
            ])
        ]);

        const modal = U.openModal(panel, { labelledBy: titleId, center: true });
        return modal;
    }

    /** Carte « Application mobile » de la page Paramètres. */
    function settingsCard() {
        const online = global.navigator.onLine !== false;
        const swReady = !!swRegistration;

        const statusRow = function (label, value, tone) {
            return U.el("div", { class: "row-between", style: { gap: "12px", padding: "8px 0" } }, [
                U.el("span", { class: "muted", style: { fontSize: "0.85rem" }, text: label }),
                U.el("span", { class: "tag " + (tone || ""), text: value })
            ]);
        };

        const card = U.el("div", { class: "card card-lg" }, [
            U.el("div", { class: "card-head" }, [
                U.el("h3", {}, [U.el("span", { text: "📲" }), U.el("span", { text: "Application mobile" })]),
                U.el("span", { class: "tag " + (isStandalone ? "income" : "budget"), text: isStandalone ? "Installée" : "Navigateur" })
            ]),
            U.el("p", { class: "muted", style: { fontSize: "0.88rem" },
                text: isStandalone
                    ? "FinaTrack est ouverte en mode application : plein écran, sans barre d'adresse."
                    : "Installez FinaTrack pour l'ouvrir en plein écran depuis votre écran d'accueil, même sans connexion." }),
            U.el("div", { class: "btn-row", style: { marginTop: "14px" } }, [
                isStandalone
                    ? null
                    : U.el("button", {
                        class: "btn btn-accent", type: "button", text: "📲 Installer l'application",
                        dataset: { action: "install-app", alwaysVisible: "1" },
                        on: { click: function () { promptInstall(); } }
                    }),
                U.el("button", {
                    class: "btn btn-ghost", type: "button", text: "❔ Comment faire ?",
                    on: { click: showInstallInstructions }
                })
            ]),
            U.el("div", { class: "divider" }),
            U.el("div", { class: "field-label", text: "État sur cet appareil" }),
            U.el("div", { class: "stack", style: { gap: "2px", marginTop: "6px" } }, [
                statusRow("Type d'appareil", isStandalone ? "Application installée" : (isIOS ? "iPhone / iPad" : (isAndroid ? "Android" : (isTouch ? "Tactile" : "Ordinateur"))), "income"),
                statusRow("Connexion", online ? "En ligne" : "Hors ligne", online ? "income" : "budget"),
                statusRow("Saisie vocale", global.FT.voice && global.FT.voice.isSupported() ? "Disponible" : "Indisponible", global.FT.voice && global.FT.voice.isSupported() ? "income" : ""),
                statusRow("Fonctionnement hors ligne", swReady ? "Actif" : "Non actif", swReady ? "income" : ""),
                swReady ? statusRow("Version de l'application", swVersion, "") : null,
                statusRow("Thème du système", isTouch ? (isIOS ? "iOS" : "Mobile") : "Bureau", "")
            ]),
            isTouch ? U.el("p", { class: "muted", style: { fontSize: "var(--fs-sm)", marginTop: "10px" },
                text: "Astuces : glissez une fenêtre vers le bas pour la fermer, appuyez longuement sur le bouton + pour choisir votre méthode d'ajout." }) : null
        ]);

        /* Appui long sur le bouton « + » : accès direct à la voix */
        if (isTouch) {
            U.qsa(".fab-btn, .bn-add").forEach(function (node) {
                let timer = null;
                let triggered = false;
                const start = function () {
                    triggered = false;
                    timer = setTimeout(function () {
                        triggered = true;
                        haptic(HAPTIC.medium);
                        if (global.FT.voice) global.FT.voice.open();
                    }, 550);
                };
                const cancel = function () { clearTimeout(timer); };
                node.addEventListener("touchstart", start, { passive: true });
                node.addEventListener("touchend", cancel);
                node.addEventListener("touchmove", cancel, { passive: true });
                node.addEventListener("touchcancel", cancel);
                node.addEventListener("click", function (e) {
                    if (triggered) { e.preventDefault(); e.stopPropagation(); }
                }, true);
            });

            /* L'appui long est aussi annoncé aux lecteurs d'écran */
            U.qsa('.fab-btn').forEach(function (button) {
                const label = button.getAttribute("aria-label") || "Ajouter une transaction";
                button.setAttribute("aria-label", label + " — appui long pour la voix");
            });
        }

        return card;
    }

    /* ======================================================================
       9. SERVICE WORKER : MODE HORS LIGNE ET MISES À JOUR
       ====================================================================== */

    let swRegistration = null;
    let swVersion = "1.0.0";

    /* État de mise à jour du service worker */
    const reloadState = { hadController: false, updated: false, reloaded: false };

    /**
     * Faut-il recharger la page quand le service worker prend le contrôle ?
     * Règle : uniquement pour une mise à jour acceptée sur une page déjà
     * contrôlée — jamais à la première installation.
     * @param {boolean} hadController la page était déjà contrôlée
     * @param {boolean} updated      une mise à jour a été annoncée et acceptée
     */
    function shouldReloadOnControllerChange(hadController, updated) {
        return !!(hadController && updated);
    }

    function initServiceWorker() {
        const meta = U.qs('meta[name="finatrack-sw"]');
        if (!meta || !("serviceWorker" in global.navigator)) return;

        /* Un service worker exige https:// ou localhost */
        if (global.location.protocol === "file:") {
            console.info("[FinaTrack] Mode fichier local : le fonctionnement hors ligne nécessite un serveur (https ou localhost).");
            return;
        }

        const swUrl = meta.getAttribute("content");
        /* Première visite : la page n'est encore contrôlée par personne. Sinon,
           un service worker est déjà actif (mise à jour de version). */
        const hadController = !!global.navigator.serviceWorker.controller;
        reloadState.hadController = hadController;
        reloadState.reloaded = false;

        global.navigator.serviceWorker.register(swUrl, { scope: "./" })
            .then(function (registration) {
                swRegistration = registration;

                if (registration.waiting) announceUpdate(registration);

                registration.addEventListener("updatefound", function () {
                    const installing = registration.installing;
                    if (!installing) return;
                    installing.addEventListener("statechange", function () {
                        if (installing.state === "installed" && global.navigator.serviceWorker.controller) {
                            announceUpdate(registration);
                        }
                    });
                });
            })
            .catch(function (error) {
                console.info("[FinaTrack] Service worker non enregistré :", error && error.message);
            });

        /* Changement de contrôleur : on ne recharge JAMAIS lors d'une première
           installation (sinon la page se rechargerait sous les yeux de
           l'utilisateur, en fermant sa fenêtre ouverte). On recharge seulement
           lorsqu'une mise à jour a été annoncée et acceptée. */
        global.navigator.serviceWorker.addEventListener("controllerchange", function () {
            if (!shouldReloadOnControllerChange(reloadState.hadController, reloadState.updated)) return;
            reloadState.reloaded = true;
            global.location.reload();
        });
    }

    function announceUpdate(registration) {
        U.toast("Nouvelle version disponible", "info", "Appuyez ici pour mettre à jour FinaTrack.");
        const host = U.qs("#toastHost");
        const lastToast = host && host.lastElementChild;
        if (lastToast) {
            lastToast.style.cursor = "pointer";
            lastToast.addEventListener("click", function () {
                reloadState.updated = true;   // rechargement voulu par l'utilisateur
                if (registration.waiting) {
                    registration.waiting.postMessage({ type: "SKIP_WAITING" });
                } else {
                    reloadState.reloaded = true;
                    global.location.reload();
                }
            });
        }
    }

    /* ======================================================================
       10. DIVERS MOBILES
       ====================================================================== */

    /** Évite le double-tap zoom sur les commandes (déjà géré par le viewport,
       mais certains navigateurs anciens restent sensibles). */
    function initTapGuards() {
        let lastTouch = 0;
        doc.addEventListener("touchend", function (e) {
            const target = e.target;
            if (target && target.closest && target.closest("button, a, .tx, .chip, .segmented button")) {
                const now = Date.now();
                if (now - lastTouch < 320) e.preventDefault();
                lastTouch = now;
            }
        }, { passive: false });

        /* Les champs « nombre » ouvrent le pavé numérique adapté */
        U.qsa('input[type="number"]').forEach(function (input) {
            if (!input.getAttribute("inputmode")) input.setAttribute("inputmode", "decimal");
        });
    }

    /* ======================================================================
       OUVERTURE EN HAUT DE PAGE
       Certains navigateurs mobiles déplacent la vue juste après le chargement
       (ancrage de défilement lors du rendu des cartes, restauration de
       l'historique, mise en page asynchrone des graphiques). On neutralise ces
       sauts : l'application s'ouvre toujours en haut, sauf si l'utilisateur a
       lui-même fait défiler la page.
       ====================================================================== */

    let userInteracted = false;

    function initScrollGuard() {
        try {
            if ("scrollRestoration" in global.history) {
                global.history.scrollRestoration = "manual";
            }
        } catch (e) { /* non bloquant */ }

        ["touchstart", "wheel", "keydown", "pointerdown", "mousedown"].forEach(function (evt) {
            global.addEventListener(evt, function () { userInteracted = true; }, { passive: true });
        });

        const settle = function () {
            if (userInteracted) return;
            if (document.body.dataset.scrollLocked === "1") return;
            const y = global.scrollY || global.pageYOffset || 0;
            if (y > 4) {
                const html = root;
                const previous = html.style.scrollBehavior;
                html.style.scrollBehavior = "auto";
                global.scrollTo(0, 0);
                html.style.scrollBehavior = previous;
            }
        };

        /* Deux passes : après le premier rendu, puis après les graphiques */
        setTimeout(settle, 260);
        setTimeout(settle, 1100);
        global.addEventListener("load", function () { setTimeout(settle, 120); });
    }

    /** Repère de défilement sur les sélecteurs segmentés (périodes, types…) :
       sur téléphone, la rangée peut dépasser la largeur de l'écran ; un léger
       dégradé à droite indique qu'il reste des choix à faire défiler. */
    function initSegmentedHints() {
        const elements = U.qsa(".segmented");
        if (!elements.length) return;

        const update = function (segment) {
            const remaining = segment.scrollWidth - segment.clientWidth - segment.scrollLeft;
            segment.classList.toggle("can-scroll-right", remaining > 4);
            segment.classList.toggle("is-scrolled-end", remaining <= 4);
        };

        elements.forEach(function (segment) {
            if (segment.dataset.hintReady === "1") return;
            segment.dataset.hintReady = "1";
            segment.addEventListener("scroll", function () { update(segment); }, { passive: true });
            update(segment);
            /* La mise en page peut se stabiliser après le rendu initial */
            setTimeout(function () { update(segment); }, 350);
        });

        global.addEventListener("resize", function () {
            elements.forEach(update);
        }, { passive: true });
        global.addEventListener("orientationchange", function () {
            setTimeout(function () { elements.forEach(update); }, 350);
        }, { passive: true });
    }

    /** Aligne la fin du contenu au-dessus de la navigation basse + zone sûre. */
    function syncSafeArea() {
        const nav = U.qs(".bottom-nav");
        if (!nav) return;
        const rect = nav.getBoundingClientRect();
        root.style.setProperty("--nav-real-h", Math.round(rect.height) + "px");
    }

    /* ======================================================================
       11. AMORÇAGE
       ====================================================================== */

    function init() {
        root.classList.toggle("is-touch", isTouch);
        root.classList.toggle("is-ios", isIOS);
        root.classList.toggle("is-android", isAndroid);
        if (isStandalone) root.classList.add("is-standalone");

        initViewportHeight();
        initZoomGuard();
        initHaptics();
        initConnectivity();
        initInstallPrompt();
        initServiceWorker();
        initTapGuards();
        initSegmentedHints();
        initScrollGuard();
        syncSafeArea();
        global.addEventListener("resize", syncSafeArea, { passive: true });
        global.addEventListener("orientationchange", function () { setTimeout(syncSafeArea, 300); }, { passive: true });
        updateKeyboardState();

        /* Les listes de filtres peuvent être rendues après l'amorçage : on
           réapplique le repère de défilement à chaque rafraîchissement. */
        U.bus.on("data:changed", function () { setTimeout(initSegmentedHints, 60); });

        /* La page Paramètres reçoit sa carte « Application mobile » */
        U.bus.on("settings:refresh", function () { /* géré par app.js */ });
    }

    /* Le module est chargé après app.js : on complète l'amorçage. */
    if (doc.readyState === "loading") {
        doc.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    /* ======================================================================
       12. EXPORTS
       ====================================================================== */
    global.FT.mobile = {
        isTouch: isTouch,
        isIOS: isIOS,
        isAndroid: isAndroid,
        isStandalone: isStandalone,
        canVibrate: canVibrate,
        isMobileContext: isMobileContext,
        haptic: haptic,
        HAPTIC: HAPTIC,
        promptInstall: promptInstall,
        showInstallInstructions: showInstallInstructions,
        settingsCard: settingsCard,
        attachSwipeToClose: attachSwipeToClose,
        initSegmentedHints: initSegmentedHints,
        updateConnectivity: updateConnectivity,
        setViewportHeight: setViewportHeight,
        initScrollGuard: initScrollGuard,
        getOfflineBar: function () { return offlineBar; },
        getSWRegistration: function () { return swRegistration; },
        getSWVersion: function () { return swVersion; },
        shouldReloadOnControllerChange: shouldReloadOnControllerChange,
        getReloadState: function () { return reloadState; }
    };
})(window);
