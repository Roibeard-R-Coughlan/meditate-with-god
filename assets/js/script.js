/*jshint esversion: 8 */
(function () {
    "use strict";

    // Point this at your API's origin if it's hosted separately from the front end.
    // By default the app assumes the API lives on the same origin (e.g. Hostinger,
    // where server/src/index.js serves both the API and this static site).
    // When no API is reachable at all (e.g. a plain GitHub Pages demo) the app falls
    // back to the static catalog below; premium entries remain visible and locked.
    const API_BASE = window.MEDITATE_WITH_GOD_API_BASE || window.STILLPOINT_API_BASE || "/api";
    const STATIC_CATALOG_URL = "assets/data/meditations.json";
    const TOKEN_KEY = "meditate-with-god.token";

    const state = {
        catalog: { categories: [], meditations: [] },
        activeCategory: "all",
        token: localStorage.getItem(TOKEN_KEY) || null,
        user: null,
        current: null, // currently open meditation
        duration: 600,
        apiAvailable: false,
        paymentsEnabled: false,
        authMode: "login",
        playRequestId: 0,
        previousFocus: null,
    };

    // ---------- DOM references ----------
    const catalogGrid = document.getElementById("catalog-grid");
    const categoryChips = document.getElementById("category-chips");
    const accountBtn = document.getElementById("account-btn");
    const proBadge = document.getElementById("pro-badge");
    const buyProBtn = document.getElementById("buy-pro-btn");

    const playerOverlay = document.getElementById("player-overlay");
    const playerClose = document.getElementById("player-close");
    const playerTitle = document.getElementById("player-title");
    const playerBackdrop = document.getElementById("player-backdrop");
    const timeSelectContainer = document.getElementById("time-select");
    const song = document.querySelector(".song");
    const playBtn = document.getElementById("player-play");
    const playIcon = playBtn.querySelector("img");
    const replayBtn = document.getElementById("player-replay");
    const outline = document.querySelector(".moving-outline circle");
    const timeDisplay = document.getElementById("player-time");
    const playerError = document.getElementById("player-error");

    const authDialog = document.getElementById("auth-dialog");
    const authForm = document.getElementById("auth-form");
    const authTitle = document.getElementById("auth-title");
    const authEmail = document.getElementById("auth-email");
    const authPassword = document.getElementById("auth-password");
    const authError = document.getElementById("auth-error");
    const authSubmit = document.getElementById("auth-submit");
    const authToggle = document.getElementById("auth-toggle");
    const authCancel = document.getElementById("auth-cancel");

    const outlineLength = outline.getTotalLength();
    outline.style.strokeDasharray = outlineLength;
    outline.style.strokeDashoffset = outlineLength;

    // ---------- API helpers ----------
    async function apiFetch(path, options = {}) {
        const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
        if (state.token) headers.Authorization = `Bearer ${state.token}`;
        const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Request failed");
        return body;
    }

    async function loadCatalog() {
        try {
            const data = await apiFetch("/meditations");
            state.apiAvailable = true;
            state.catalog = data;
        } catch (_err) {
            state.apiAvailable = false;
            const res = await fetch(STATIC_CATALOG_URL);
            state.catalog = await res.json();
        }
        renderCategories();
        renderCatalog();
    }

    async function loadCurrentUser() {
        if (!state.token) return;
        try {
            const { user } = await apiFetch("/auth/me");
            state.user = user;
        } catch (_err) {
            state.token = null;
            localStorage.removeItem(TOKEN_KEY);
        }
        renderAccountUI();
    }

    async function loadPaymentsStatus() {
        try {
            const { enabled } = await apiFetch("/checkout/status");
            state.paymentsEnabled = enabled;
        } catch (_err) {
            state.paymentsEnabled = false;
        }
        renderPaymentsUI();
    }

    function renderPaymentsUI() {
        if (!buyProBtn) return;
        buyProBtn.disabled = !state.paymentsEnabled;
        buyProBtn.textContent = state.paymentsEnabled ? "Get Pro Pack" : "Pro Pack coming soon";
        buyProBtn.title = state.paymentsEnabled ? "" : "Payments are not available yet.";
    }

    // ---------- Rendering ----------
    function renderCategories() {
        const categories = [{ id: "all", name: "All" }, ...state.catalog.categories];
        categoryChips.innerHTML = "";
        categories.forEach((cat) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "chip" + (state.activeCategory === cat.id ? " is-active" : "");
            btn.textContent = cat.name;
            btn.dataset.category = cat.id;
            btn.addEventListener("click", () => {
                state.activeCategory = cat.id;
                renderCategories();
                renderCatalog();
            });
            categoryChips.appendChild(btn);
        });
    }

    function renderCatalog() {
        const items = state.catalog.meditations.filter(
            (m) => state.activeCategory === "all" || m.category === state.activeCategory
        );

        catalogGrid.innerHTML = "";
        if (!items.length) {
            catalogGrid.innerHTML = '<p class="catalog-loading">No meditations in this category yet.</p>';
            return;
        }

        items.forEach((m) => {
            const card = document.createElement("article");
            card.className = "meditation-card";
            card.tabIndex = 0;
            card.setAttribute("role", "button");

            const locked = m.isPremium && !(state.user && state.user.hasPro);
            const comingSoon = m.isComingSoon === true;
            const badgeText = comingSoon
                ? (locked ? "Pro · Coming soon" : "Coming soon")
                : (locked ? "Pro" : "");
            const ariaAction = locked ? "Unlock" : (comingSoon ? "Preview" : "Play");
            card.setAttribute("aria-label", `${ariaAction} ${m.title}`);
            const categoryName = (state.catalog.categories.find((c) => c.id === m.category) || {}).name || m.category;

            card.innerHTML = `
                ${badgeText ? `<span class="meditation-card__lock">${badgeText}</span>` : ""}
                <div class="meditation-card__image"><img src="${m.image}" alt="" loading="lazy"></div>
                <div class="meditation-card__body">
                    <span class="meditation-card__tag">${categoryName}</span>
                    <h3 class="meditation-card__title">${m.title}</h3>
                    <p class="meditation-card__desc">${m.description}</p>
                </div>
            `;

            card.addEventListener("click", () => openMeditation(m, locked, comingSoon));
            card.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openMeditation(m, locked, comingSoon);
                }
            });
            catalogGrid.appendChild(card);
        });
    }

    function renderAccountUI() {
        proBadge.hidden = !(state.user && state.user.hasPro);
        accountBtn.textContent = state.user ? "Log out" : "Log in";
        renderCatalog();
    }

    // ---------- Player ----------
    function openMeditation(meditation, locked, comingSoon) {
        if (locked) {
            document.getElementById("pricing").scrollIntoView({ behavior: "smooth" });
            return;
        }
        if (comingSoon) return;
        if (!meditation) return;
        const durations = Array.isArray(meditation.durations)
            ? meditation.durations.filter((seconds) => Number.isFinite(seconds) && seconds > 0)
            : [];
        if (typeof meditation.audio !== "string" || !meditation.audio.trim() || !durations.length) {
            return; // Do not open a player with no playable session selected.
        }

        state.current = meditation;
        state.duration = durations[durations.length - 1];
        state.previousFocus = document.activeElement;
        state.playRequestId += 1;

        playerTitle.textContent = meditation.title;
        playerBackdrop.src = meditation.image;
        song.src = meditation.audio;
        song.load();
        song.currentTime = 0;
        resetProgress();
        setPlayingState(false);
        clearPlayerError();

        renderTimeOptions(durations);
        playerOverlay.hidden = false;
        document.body.classList.add("player-open");
        playerClose.focus();
    }

    function renderTimeOptions(durations) {
        timeSelectContainer.innerHTML = "";
        durations.forEach((seconds) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = seconds % 60 === 0 ? `${seconds / 60} min` : formatTime(seconds);
            const isActive = seconds === state.duration;
            btn.classList.toggle("is-active", isActive);
            btn.setAttribute("aria-pressed", String(isActive));
            btn.addEventListener("click", () => {
                state.playRequestId += 1;
                song.pause();
                state.duration = seconds;
                song.currentTime = 0;
                resetProgress();
                setPlayingState(false);
                [...timeSelectContainer.children].forEach((option) => {
                    const selected = option === btn;
                    option.classList.toggle("is-active", selected);
                    option.setAttribute("aria-pressed", String(selected));
                });
            });
            timeSelectContainer.appendChild(btn);
        });
    }

    function formatTime(totalSeconds) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor(totalSeconds % 60);
        return `${minutes}:${String(seconds).padStart(2, "0")}`;
    }

    function closePlayer() {
        state.playRequestId += 1;
        song.pause();
        state.current = null;
        song.removeAttribute("src");
        song.load();
        setPlayingState(false);
        clearPlayerError();
        playerOverlay.hidden = true;
        document.body.classList.remove("player-open");
        if (state.previousFocus && state.previousFocus.isConnected) state.previousFocus.focus();
        state.previousFocus = null;
    }

    function setPlayingState(isPlaying) {
        playIcon.src = isPlaying ? "assets/icons/pause.png" : "assets/icons/play.png";
        playBtn.setAttribute("aria-label", isPlaying ? "Pause meditation" : "Play meditation");
    }

    function clearPlayerError() {
        playerError.textContent = "";
        playerError.hidden = true;
    }

    function showPlayerError(message) {
        playerError.textContent = message;
        playerError.hidden = false;
    }

    function resetProgress() {
        outline.style.strokeDashoffset = outlineLength;
        timeDisplay.textContent = formatTime(state.duration);
    }

    async function togglePlay() {
        if (!state.current || !song.getAttribute("src")) {
            setPlayingState(false);
            showPlayerError("Select a meditation before pressing play.");
            return;
        }
        if (song.paused) {
            clearPlayerError();
            const requestId = ++state.playRequestId;
            try {
                await song.play();
                if (requestId !== state.playRequestId || playerOverlay.hidden || song.paused) {
                    song.pause();
                    return;
                }
                setPlayingState(true);
            } catch (_err) {
                if (requestId !== state.playRequestId) return;
                setPlayingState(false);
                showPlayerError("This meditation could not be played. Check your connection and try again.");
            }
        } else {
            state.playRequestId += 1;
            song.pause();
            setPlayingState(false);
        }
    }

    playBtn.addEventListener("click", togglePlay);
    replayBtn.addEventListener("click", () => {
        if (!state.current || !song.getAttribute("src")) {
            showPlayerError("Select a meditation before replaying.");
            return;
        }
        clearPlayerError();
        try {
            song.currentTime = 0;
            resetProgress();
        } catch (_err) {
            showPlayerError("This meditation could not be restarted. Please try again.");
        }
    });
    playerClose.addEventListener("click", closePlayer);
    playerOverlay.addEventListener("click", (e) => {
        if (e.target === playerOverlay) closePlayer();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !playerOverlay.hidden) closePlayer();
    });

    song.addEventListener("error", () => {
        if (!state.current || playerOverlay.hidden) return;
        state.playRequestId += 1;
        setPlayingState(false);
        showPlayerError("This meditation could not be loaded. Check your connection and try again.");
    });
    song.addEventListener("pause", () => setPlayingState(false));
    song.addEventListener("ended", () => {
        song.currentTime = 0;
        resetProgress();
        setPlayingState(false);
    });

    song.ontimeupdate = () => {
        const elapsed = state.duration - song.currentTime;
        outline.style.strokeDashoffset = outlineLength - (song.currentTime / state.duration) * outlineLength;
        timeDisplay.textContent = formatTime(Math.max(elapsed, 0));

        if (song.currentTime >= state.duration) {
            song.pause();
            song.currentTime = 0;
            resetProgress();
            setPlayingState(false);
        }
    };

    // ---------- Auth ----------
    function openAuth(mode) {
        state.authMode = mode;
        authTitle.textContent = mode === "login" ? "Log in" : "Create your account";
        authSubmit.textContent = mode === "login" ? "Log in" : "Sign up";
        authToggle.textContent = mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in";
        authError.hidden = true;
        authForm.reset();
        authDialog.showModal();
    }

    accountBtn.addEventListener("click", () => {
        if (state.user) {
            state.token = null;
            state.user = null;
            localStorage.removeItem(TOKEN_KEY);
            renderAccountUI();
        } else {
            openAuth("login");
        }
    });

    authCancel.addEventListener("click", () => authDialog.close());
    authToggle.addEventListener("click", () => openAuth(state.authMode === "login" ? "register" : "login"));

    authForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        authError.hidden = true;
        try {
            const path = state.authMode === "login" ? "/auth/login" : "/auth/register";
            const data = await apiFetch(path, {
                method: "POST",
                body: JSON.stringify({ email: authEmail.value, password: authPassword.value }),
            });
            state.token = data.token;
            state.user = data.user;
            localStorage.setItem(TOKEN_KEY, data.token);
            authDialog.close();
            renderAccountUI();
            await loadCatalog();
        } catch (err) {
            authError.textContent = err.message;
            authError.hidden = false;
        }
    });

    // ---------- Checkout ----------
    if (buyProBtn) buyProBtn.addEventListener("click", async () => {
        if (!state.apiAvailable) {
            alert("Connect this page to the Meditate With God API (see server/README.md) to enable purchases.");
            return;
        }
        if (!state.paymentsEnabled) {
            alert("Payments are not available yet.");
            return;
        }
        if (!state.user) {
            openAuth("login");
            return;
        }
        try {
            const { url } = await apiFetch("/checkout/create-session", { method: "POST" });
            window.location.href = url;
        } catch (err) {
            alert(err.message);
        }
    });

    // ---------- Boot ----------
    (async function init() {
        await loadCurrentUser();
        await loadCatalog();
        await loadPaymentsStatus();

        const params = new URLSearchParams(window.location.search);
        if (params.get("purchase") === "success") {
            await loadCurrentUser();
            alert("Thanks! Your Pro Pack is unlocked.");
        }
    })();
})();

