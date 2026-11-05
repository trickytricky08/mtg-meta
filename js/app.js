/**
 * MTG Meta — client-side meta browser
 * Loads data/meta.json and shows one trailing sample window at a time.
 * Archetype names link out to MTGGoldfish. The table and matchup grid use
 * the same decks: meta share of at least the configured minimum, capped
 * at the configured maximum. Share and Win rate headers order both the
 * table and the matchup grid. Default order is share, high to low.
 */

(() => {
  "use strict";

  const state = {
    data: null,
    formatId: null,
    windowDays: 30,
    sortKey: "share",
    sortDir: "desc",
  };

  const els = {
    formatBar: document.getElementById("format-bar"),
    formatDesc: document.getElementById("format-desc"),
    window: document.getElementById("window"),
    windowNote: document.getElementById("window-note"),
    stats: document.getElementById("stats"),
    tbody: document.getElementById("archetype-body"),
    tableWrap: document.getElementById("table-wrap"),
    stamp: document.getElementById("meta-stamp"),
    matchupScroll: document.getElementById("matchup-scroll"),
  };

  async function init() {
    try {
      const res = await fetch("data/meta.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.data = await res.json();
    } catch (err) {
      els.tableWrap.innerHTML =
        `<div class="empty">Could not load <code>data/meta.json</code>. ` +
        `Serve this folder over HTTP (see README). <br><small>${escapeHtml(String(err))}</small></div>`;
      if (els.matchupScroll) {
        els.matchupScroll.innerHTML =
          `<div class="empty">Matchup grid unavailable until meta data loads.</div>`;
      }
      return;
    }

    if (els.stamp) {
      els.stamp.textContent = "Sample windows · not tournament results";
    }

    state.formatId = state.data.formats[0]?.id ?? null;
    state.windowDays = Number(state.data.display?.defaultWindowDays ?? 30);
    if (els.window) els.window.value = String(state.windowDays);
    renderFormatBar();
    bindControls();
    render();
  }

  function bindControls() {
    els.window.addEventListener("change", () => {
      state.windowDays = Number(els.window.value);
      render();
    });

    els.tableWrap.addEventListener("click", (event) => {
      const button = event.target.closest("[data-sort]");
      if (!button) return;
      const key = button.dataset.sort;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "desc" ? "asc" : "desc";
      } else {
        state.sortKey = key;
        state.sortDir = "desc";
      }
      render();
    });
  }

  function currentFormat() {
    return state.data.formats.find((fmt) => fmt.id === state.formatId);
  }

  function currentWindow() {
    return globalThis.MTGMetaMatchup.chooseWindow(currentFormat(), state.windowDays);
  }

  function shownArchetypes(win) {
    const visible = globalThis.MTGMetaMatchup.visibleArchetypes(
      win?.archetypes,
      state.data.display
    );
    return globalThis.MTGMetaMatchup.orderArchetypes(visible, {
      key: state.sortKey,
      dir: state.sortDir,
    });
  }

  function renderFormatBar() {
    els.formatBar.innerHTML = "";
    for (const fmt of state.data.formats) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "format-btn" + (fmt.id === state.formatId ? " active" : "");
      btn.textContent = fmt.name;
      btn.setAttribute("aria-pressed", fmt.id === state.formatId ? "true" : "false");
      btn.addEventListener("click", () => {
        if (state.formatId === fmt.id) return;
        state.formatId = fmt.id;
        renderFormatBar();
        render();
      });
      els.formatBar.appendChild(btn);
    }
  }

  function render() {
    const fmt = currentFormat();
    const win = currentWindow();
    if (!fmt || !win) return;
    state.windowDays = win.days;
    if (els.window) els.window.value = String(win.days);
    els.formatDesc.textContent = fmt.description || "";
    const shown = shownArchetypes(win);
    renderSortHeaders();
    renderNote(win, shown);
    renderStats(shown);
    renderList(shown, win);
    renderMatchups(shown, win);
  }

  function renderSortHeaders() {
    const labels = { share: "share", winRate: "win rate" };
    document.querySelectorAll(".sort-header").forEach((button) => {
      const key = button.dataset.sort;
      const active = key === state.sortKey;
      const th = button.closest("th");
      th.setAttribute(
        "aria-sort",
        active ? (state.sortDir === "asc" ? "ascending" : "descending") : "none"
      );
      button.setAttribute("aria-pressed", active ? "true" : "false");
      const direction = state.sortDir === "asc" ? "ascending" : "descending";
      button.setAttribute(
        "aria-label",
        active ? `Sort by ${labels[key]}, ${direction}` : `Sort by ${labels[key]}`
      );
      const arrow = button.querySelector(".sort-arrow");
      if (arrow) arrow.textContent = active ? (state.sortDir === "asc" ? "↑" : "↓") : "↕";
    });
  }

  function renderNote(win, shown) {
    if (!els.windowNote) return;
    const minShare = state.data.display?.minShare ?? 1.2;
    const maxArchetypes = state.data.display?.maxArchetypes ?? 15;
    const qualified = (win.archetypes || []).filter((arch) => arch.share >= minShare).length;
    const capNote =
      qualified > shown.length ? ` Top ${maxArchetypes} by share.` : "";
    const decks = Number(win.sampleSize).toLocaleString("en-US");
    const asOf = state.data.asOf ? ` through ${state.data.asOf}` : "";
    els.windowNote.textContent =
      `Sample window · last ${win.days} days${asOf} · ${decks} decks. ` +
      `Decks at ${minShare}% share or more.${capNote} Not historical tournament results.`;
  }

  function renderMatchups(shown, win) {
    if (!els.matchupScroll || !globalThis.MTGMetaMatchup) return;
    els.matchupScroll.dataset.format = state.formatId;
    els.matchupScroll.dataset.window = String(win.days);
    els.matchupScroll.innerHTML = globalThis.MTGMetaMatchup.renderMatchupTable(shown);
  }

  function renderStats(shown) {
    const totalShare = shown.reduce((sum, arch) => sum + arch.share, 0);
    const avgWr =
      shown.length === 0
        ? 0
        : shown.reduce((sum, arch) => sum + arch.winRate, 0) / shown.length;

    els.stats.innerHTML = `
      <div class="stat-pill"><strong>${shown.length}</strong> archetype${shown.length === 1 ? "" : "s"}</div>
      <div class="stat-pill">Coverage <strong>${totalShare.toFixed(1)}%</strong></div>
      <div class="stat-pill">Avg win rate <strong>${avgWr.toFixed(1)}%</strong></div>
    `;
  }

  function renderList(shown, win) {
    els.tbody.dataset.window = String(win.days);
    els.tbody.innerHTML = globalThis.MTGMetaMatchup.renderArchetypeRows(shown);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  init();
})();
