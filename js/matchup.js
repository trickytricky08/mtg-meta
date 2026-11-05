/**
 * MTG Meta — matchup grid model and table markup.
 * Loaded in the browser before app.js, and required by node:test.
 *
 * Cell (row, column) is the row archetype's win rate against the column archetype.
 * The diagonal is a mirror, not a win rate.
 */
(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.MTGMetaMatchup = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function nextSort(current, clickedKey) {
    const key = clickedKey === "winRate" ? "winRate" : "share";
    const active = current?.key === key && (current.dir === "asc" || current.dir === "desc");
    if (!active) return { key, dir: "desc" };
    if (current.dir === "desc") return { key, dir: "asc" };
    return { key: null, dir: null };
  }

  function effectiveSort(sort) {
    if (sort?.key === "winRate" && (sort.dir === "asc" || sort.dir === "desc")) {
      return { key: "winRate", dir: sort.dir };
    }
    if (sort?.key === "share" && (sort.dir === "asc" || sort.dir === "desc")) {
      return { key: "share", dir: sort.dir };
    }
    return { key: "share", dir: "desc" };
  }

  function orderArchetypes(archetypes, sort) {
    const key = sort?.key === "winRate" ? "winRate" : "share";
    const dir = sort?.dir === "asc" ? 1 : -1;
    return [...(archetypes || [])].sort((a, b) => {
      const delta = (Number(a[key]) - Number(b[key])) * dir;
      if (delta !== 0) return delta;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }

  function buildMatchupGrid(archetypes) {
    const decks = [...(archetypes || [])];

    const cells = decks.map((row) =>
      decks.map((col) => {
        const base = {
          rowId: row.id,
          colId: col.id,
          rowName: row.name,
          colName: col.name,
        };
        if (row.id === col.id) {
          return { ...base, kind: "mirror" };
        }
        const raw = row.matchups ? row.matchups[col.id] : undefined;
        const value = typeof raw === "number" ? raw : Number(raw);
        if (raw == null || raw === "" || Number.isNaN(value)) {
          return { ...base, kind: "missing" };
        }
        return { ...base, kind: "rate", value };
      })
    );

    return { decks, cells };
  }

  function chooseWindow(format, days) {
    const windows = format?.windows || [];
    const wanted = Number(days);
    return (
      windows.find((win) => win.days === wanted) ||
      windows.find((win) => win.days === 30) ||
      windows[0] ||
      null
    );
  }

  function visibleArchetypes(archetypes, rules) {
    const minShare = Number(rules?.minShare ?? 1.2);
    const maxArchetypes = Number(rules?.maxArchetypes ?? 15);
    return [...(archetypes || [])]
      .filter((arch) => Number(arch.share) >= minShare)
      .sort(
        (a, b) =>
          Number(b.share) - Number(a.share) ||
          String(a.name).localeCompare(String(b.name))
      )
      .slice(0, maxArchetypes);
  }

  function renderArchetypeRows(archetypes) {
    const list = archetypes || [];
    if (list.length === 0) {
      return '<tr><td colspan="3"><div class="empty">No archetypes in this window.</div></td></tr>';
    }
    const maxShare = Math.max(...list.map((arch) => arch.share), 1);
    return list
      .map((arch) => {
        const wrClass = arch.winRate >= 53 ? " hot" : arch.winRate < 51 ? " cold" : "";
        const barPct = Math.round((arch.share / maxShare) * 100);
        const name = arch.goldfishUrl
          ? `<a class="arch-name" href="${escapeAttr(arch.goldfishUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(arch.name)}</a>`
          : `<span class="arch-name">${escapeHtml(arch.name)}</span>`;
        return `<tr data-id="${escapeAttr(arch.id)}">
            <td>
              <div class="arch-cell">${name}</div>
            </td>
            <td class="num" data-label="Share">
              <div class="share-bar">
                <div class="share-track" aria-hidden="true"><div class="share-fill" style="width:${barPct}%"></div></div>
                <span>${Number(arch.share).toFixed(1)}%</span>
              </div>
            </td>
            <td class="num" data-label="Win rate"><span class="win-rate${wrClass}">${Number(arch.winRate).toFixed(1)}%</span></td>
          </tr>`;
      })
      .join("");
  }

  function formatWinRate(value) {
    return `${Number(value).toFixed(1)}%`;
  }

  function rateBand(value) {
    const n = Number(value);
    if (n >= 56) return "wr-high";
    if (n >= 52) return "wr-up";
    if (n <= 44) return "wr-low";
    if (n <= 48) return "wr-down";
    return "wr-even";
  }

  function renderMatchupTable(archetypes) {
    const { decks, cells } = buildMatchupGrid(archetypes);
    if (decks.length === 0) {
      return '<div class="empty">No archetypes in this format.</div>';
    }

    const colHeads = decks
      .map(
        (deck) =>
          `<th scope="col" class="matchup-col" title="${escapeAttr(deck.name)}"><span>${escapeHtml(deck.name)}</span></th>`
      )
      .join("");

    const body = cells
      .map((row, index) => {
        const deck = decks[index];
        const cellsHtml = row.map(renderCell).join("");
        const wrClass = deck.winRate >= 53 ? " hot" : deck.winRate < 51 ? " cold" : "";
        const rate = deck.winRate == null ? "" : formatWinRate(deck.winRate);
        return `<tr>
          <th scope="row" class="matchup-rowhead">
            <span class="matchup-rowlabel">
              <span class="matchup-rowname">${escapeHtml(deck.name)}</span>
              <span class="matchup-rowrate${wrClass}">${rate}</span>
            </span>
          </th>
          ${cellsHtml}
        </tr>`;
      })
      .join("");

    return `<table class="matchup-table">
      <caption class="visually-hidden">Win rates read as row versus column. Each value is the row archetype's win rate against the column archetype. Diagonal cells are mirror matches. Sample window rates, not historical tournament results.</caption>
      <thead>
        <tr>
          <th scope="col" class="matchup-corner"><span class="corner-row">Row</span><span class="corner-vs">vs</span><span class="corner-col">Column</span></th>
          ${colHeads}
        </tr>
      </thead>
      <tbody>
        ${body}
      </tbody>
    </table>`;
  }

  function renderCell(cell) {
    const attrs = `data-row="${escapeAttr(cell.rowId)}" data-col="${escapeAttr(cell.colId)}"`;
    if (cell.kind === "mirror") {
      return `<td class="matchup-cell mirror" ${attrs} title="Mirror">Mirror</td>`;
    }
    if (cell.kind !== "rate") {
      return `<td class="matchup-cell missing" ${attrs} title="No sample rate">—</td>`;
    }
    const text = formatWinRate(cell.value);
    const title = `${cell.rowName} vs ${cell.colName}: ${text}`;
    return `<td class="matchup-cell ${rateBand(cell.value)}" ${attrs} title="${escapeAttr(title)}">${text}</td>`;
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

  return {
    buildMatchupGrid,
    nextSort,
    effectiveSort,
    orderArchetypes,
    chooseWindow,
    visibleArchetypes,
    renderArchetypeRows,
    formatWinRate,
    rateBand,
    renderMatchupTable,
  };
});
