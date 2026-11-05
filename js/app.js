/**
 * MTG Meta — client-side meta browser
 * Loads data/meta.json, filters/sorts archetypes, shows detail and matchup grid.
 */

(() => {
  "use strict";

  const state = {
    data: null,
    formatId: null,
    query: "",
    sort: "share-desc",
    selectedId: null,
  };

  const els = {
    formatBar: document.getElementById("format-bar"),
    formatDesc: document.getElementById("format-desc"),
    search: document.getElementById("search"),
    sort: document.getElementById("sort"),
    stats: document.getElementById("stats"),
    tbody: document.getElementById("archetype-body"),
    tableWrap: document.getElementById("table-wrap"),
    detail: document.getElementById("detail"),
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

    if (els.stamp && state.data.updated) {
      els.stamp.textContent = `Sample data · updated ${state.data.updated}`;
    }

    state.formatId = state.data.formats[0]?.id ?? null;
    renderFormatBar();
    bindControls();
    render();
  }

  function bindControls() {
    els.search.addEventListener("input", () => {
      state.query = els.search.value.trim().toLowerCase();
      renderList();
    });

    els.sort.addEventListener("change", () => {
      state.sort = els.sort.value;
      renderList();
    });

    els.detail.addEventListener("click", (e) => {
      if (e.target.closest("[data-close-detail]")) {
        state.selectedId = null;
        els.detail.classList.remove("visible");
        highlightSelected();
      }
    });
  }

  function currentFormat() {
    return state.data.formats.find((f) => f.id === state.formatId);
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
        state.selectedId = null;
        els.detail.classList.remove("visible");
        renderFormatBar();
        render();
      });
      els.formatBar.appendChild(btn);
    }
  }

  function render() {
    const fmt = currentFormat();
    if (!fmt) return;
    els.formatDesc.textContent = fmt.description || "";
    renderStats(fmt);
    renderList();
    renderMatchups(fmt);
  }

  function renderMatchups(fmt) {
    if (!els.matchupScroll || !globalThis.MTGMetaMatchup) return;
    els.matchupScroll.dataset.format = fmt.id;
    els.matchupScroll.innerHTML = globalThis.MTGMetaMatchup.renderMatchupTable(fmt.archetypes);
  }

  function renderStats(fmt) {
    const list = filteredSorted(fmt);
    const totalShare = list.reduce((s, a) => s + a.share, 0);
    const avgWr =
      list.length === 0
        ? 0
        : list.reduce((s, a) => s + a.winRate, 0) / list.length;

    els.stats.innerHTML = `
      <div class="stat-pill"><strong>${list.length}</strong> archetype${list.length === 1 ? "" : "s"} shown</div>
      <div class="stat-pill">Coverage <strong>${totalShare.toFixed(1)}%</strong></div>
      <div class="stat-pill">Avg win rate <strong>${avgWr.toFixed(1)}%</strong></div>
    `;
  }

  function filteredSorted(fmt) {
    let list = [...fmt.archetypes];
    if (state.query) {
      list = list.filter((a) => a.name.toLowerCase().includes(state.query));
    }
    const [key, dir] = state.sort.split("-");
    const mult = dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      if (key === "name") return mult * a.name.localeCompare(b.name);
      return mult * (a[key] - b[key]);
    });
    return list;
  }

  function renderList() {
    const fmt = currentFormat();
    if (!fmt) return;

    const list = filteredSorted(fmt);
    renderStats(fmt);

    if (list.length === 0) {
      els.tbody.innerHTML = "";
      const empty = document.createElement("tr");
      empty.innerHTML = `<td colspan="5"><div class="empty">No archetypes match “${escapeHtml(state.query)}”.</div></td>`;
      els.tbody.appendChild(empty);
      return;
    }

    const maxShare = Math.max(...fmt.archetypes.map((a) => a.share), 1);

    els.tbody.innerHTML = list
      .map((a) => {
        const selected = a.id === state.selectedId ? " selected" : "";
        const wrClass =
          a.winRate >= 53 ? " hot" : a.winRate < 51 ? " cold" : "";
        const barPct = Math.round((a.share / maxShare) * 100);
        return `
          <tr class="${selected}" data-id="${escapeAttr(a.id)}" tabindex="0" role="button" aria-label="View ${escapeAttr(a.name)}">
            <td>
              <div class="arch-cell">
                ${manaPips(a.colors)}
                <span class="arch-name">${escapeHtml(a.name)}</span>
              </div>
            </td>
            <td class="num" data-label="Share">
              <div class="share-bar">
                <div class="share-track" aria-hidden="true"><div class="share-fill" style="width:${barPct}%"></div></div>
                <span>${a.share.toFixed(1)}%</span>
              </div>
            </td>
            <td class="num" data-label="Win rate"><span class="win-rate${wrClass}">${a.winRate.toFixed(1)}%</span></td>
            <td data-label="Trend"><span class="trend ${escapeAttr(a.trend)}">${trendIcon(a.trend)} ${escapeHtml(a.trendLabel)}</span></td>
            <td class="num" data-label="">→</td>
          </tr>
        `;
      })
      .join("");

    els.tbody.querySelectorAll("tr[data-id]").forEach((row) => {
      const open = () => selectArchetype(row.dataset.id);
      row.addEventListener("click", open);
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
    });
  }

  function selectArchetype(id) {
    const fmt = currentFormat();
    const arch = fmt?.archetypes.find((a) => a.id === id);
    if (!arch) return;

    state.selectedId = id;
    highlightSelected();
    renderDetail(arch);
  }

  function highlightSelected() {
    els.tbody.querySelectorAll("tr[data-id]").forEach((row) => {
      row.classList.toggle("selected", row.dataset.id === state.selectedId);
    });
  }

  function renderDetail(arch) {
    const cards = (arch.highlights || [])
      .map(
        (c) => `
      <li>
        <span class="qty">${c.count}×</span>
        <span>${escapeHtml(c.name)}</span>
        <span class="role">${escapeHtml(c.role || "")}</span>
      </li>`
      )
      .join("");

    els.detail.innerHTML = `
      <div class="detail-header">
        <h2>${manaPips(arch.colors)} ${escapeHtml(arch.name)}</h2>
        <div style="display:flex;align-items:center;gap:0.5rem">
          <div class="detail-meta">
            <span class="chip">Share <strong>${arch.share.toFixed(1)}%</strong></span>
            <span class="chip">Win rate <strong>${arch.winRate.toFixed(1)}%</strong></span>
            <span class="chip trend ${escapeAttr(arch.trend)}">${trendIcon(arch.trend)} ${escapeHtml(arch.trendLabel)}</span>
          </div>
          <button type="button" class="close-detail" data-close-detail aria-label="Close detail">×</button>
        </div>
      </div>
      <p class="detail-desc">${escapeHtml(arch.description)}</p>
      <div class="detail-grid">
        <div class="panel">
          <h3>Maindeck highlights</h3>
          <ul class="card-list">${cards}</ul>
        </div>
        <div class="panel">
          <h3>Sideboard notes</h3>
          <p class="sideboard-notes">${escapeHtml(arch.sideboardNotes || "—")}</p>
        </div>
      </div>
    `;
    els.detail.classList.add("visible");
    els.detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function manaPips(colors) {
    if (!colors || !colors.length) return "";
    return `<span class="mana" aria-hidden="true">${colors
      .map((c) => `<span class="mana-pip ${escapeAttr(c)}" title="${escapeAttr(c)}"></span>`)
      .join("")}</span>`;
  }

  function trendIcon(trend) {
    if (trend === "up") return "↑";
    if (trend === "down") return "↓";
    return "→";
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
