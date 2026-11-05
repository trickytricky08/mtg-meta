/**
 * MTG Meta — client-side meta browser
 * Loads data/meta.json, switches format and sample snapshot, sorts the table,
 * and draws the matchup grid. Archetype names link out to MTGGoldfish.
 */

(() => {
  "use strict";

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const state = {
    data: null,
    formatId: null,
    snapshotDate: null,
    sort: "share-desc",
  };

  const els = {
    formatBar: document.getElementById("format-bar"),
    formatDesc: document.getElementById("format-desc"),
    snapshot: document.getElementById("snapshot"),
    snapshotNote: document.getElementById("snapshot-note"),
    sort: document.getElementById("sort"),
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
      els.stamp.textContent = "Sample snapshots · not tournament results";
    }

    state.formatId = state.data.formats[0]?.id ?? null;
    state.snapshotDate = currentSnapshot()?.date ?? null;
    renderFormatBar();
    bindControls();
    render();
  }

  function bindControls() {
    els.sort.addEventListener("change", () => {
      state.sort = els.sort.value;
      renderList();
    });

    els.snapshot.addEventListener("change", () => {
      state.snapshotDate = els.snapshot.value;
      render();
    });
  }

  function currentFormat() {
    return state.data.formats.find((fmt) => fmt.id === state.formatId);
  }

  function currentSnapshot() {
    return globalThis.MTGMetaMatchup.chooseSnapshot(currentFormat(), state.snapshotDate);
  }

  function formatSnapshotDate(iso) {
    const [year, month, day] = String(iso).split("-").map(Number);
    return `${MONTHS[month - 1]} ${day}, ${year}`;
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
        state.snapshotDate = currentSnapshot()?.date ?? null;
        renderFormatBar();
        render();
      });
      els.formatBar.appendChild(btn);
    }
  }

  function renderSnapshotSelect(fmt, snap) {
    const snaps = [...fmt.snapshots].sort((a, b) => b.date.localeCompare(a.date));
    const latest = snaps[0]?.date;
    els.snapshot.innerHTML = snaps
      .map((entry) => {
        const suffix = entry.date === latest ? " · latest" : "";
        return `<option value="${escapeAttr(entry.date)}">${escapeHtml(formatSnapshotDate(entry.date) + suffix)}</option>`;
      })
      .join("");
    els.snapshot.value = snap.date;
  }

  function render() {
    const fmt = currentFormat();
    const snap = currentSnapshot();
    if (!fmt || !snap) return;
    state.snapshotDate = snap.date;
    els.formatDesc.textContent = fmt.description || "";
    renderSnapshotSelect(fmt, snap);
    if (els.snapshotNote) {
      const decks = Number(snap.sampleSize).toLocaleString("en-US");
      els.snapshotNote.textContent =
        `Sample snapshot · ${formatSnapshotDate(snap.date)} · ${decks} decks. Not historical tournament results.`;
    }
    renderStats(snap);
    renderList();
    renderMatchups(snap);
  }

  function renderMatchups(snap) {
    if (!els.matchupScroll || !globalThis.MTGMetaMatchup) return;
    els.matchupScroll.dataset.format = state.formatId;
    els.matchupScroll.dataset.snapshot = snap.date;
    els.matchupScroll.innerHTML = globalThis.MTGMetaMatchup.renderMatchupTable(snap.archetypes);
  }

  function renderStats(snap) {
    const list = snap.archetypes;
    const totalShare = list.reduce((sum, arch) => sum + arch.share, 0);
    const avgWr =
      list.length === 0
        ? 0
        : list.reduce((sum, arch) => sum + arch.winRate, 0) / list.length;

    els.stats.innerHTML = `
      <div class="stat-pill"><strong>${list.length}</strong> archetype${list.length === 1 ? "" : "s"}</div>
      <div class="stat-pill">Coverage <strong>${totalShare.toFixed(1)}%</strong></div>
      <div class="stat-pill">Avg win rate <strong>${avgWr.toFixed(1)}%</strong></div>
    `;
  }

  function renderList() {
    const snap = currentSnapshot();
    if (!snap) return;
    els.tbody.dataset.snapshot = snap.date;
    els.tbody.innerHTML = globalThis.MTGMetaMatchup.renderArchetypeRows(snap.archetypes, state.sort);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, "&#39;");
  }

  init();
})();
