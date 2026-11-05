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

  const MANA = new Set(["W", "U", "B", "R", "G", "C"]);

  function buildMatchupGrid(archetypes) {
    const decks = [...(archetypes || [])].sort((a, b) => {
      const shareDelta = Number(b.share || 0) - Number(a.share || 0);
      if (shareDelta !== 0) return shareDelta;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });

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

  function chooseSnapshot(format, date) {
    const snaps = [...(format?.snapshots || [])].sort((a, b) =>
      String(b.date).localeCompare(String(a.date))
    );
    if (!snaps.length) return null;
    return snaps.find((snap) => snap.date === date) || snaps[0];
  }

  function sortArchetypes(archetypes, sortValue) {
    const list = [...(archetypes || [])];
    const [key, dir] = String(sortValue || "share-desc").split("-");
    const mult = dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      if (key === "name") return mult * String(a.name).localeCompare(String(b.name));
      return mult * (Number(a[key]) - Number(b[key]));
    });
    return list;
  }

  function renderArchetypeRows(archetypes, sortValue) {
    const list = sortArchetypes(archetypes, sortValue);
    if (list.length === 0) {
      return '<tr><td colspan="4"><div class="empty">No archetypes in this snapshot.</div></td></tr>';
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
              <div class="arch-cell">
                ${manaPips(arch.colors)}
                ${name}
              </div>
            </td>
            <td class="num" data-label="Share">
              <div class="share-bar">
                <div class="share-track" aria-hidden="true"><div class="share-fill" style="width:${barPct}%"></div></div>
                <span>${Number(arch.share).toFixed(1)}%</span>
              </div>
            </td>
            <td class="num" data-label="Win rate"><span class="win-rate${wrClass}">${Number(arch.winRate).toFixed(1)}%</span></td>
            <td data-label="Trend"><span class="trend ${escapeAttr(arch.trend)}">${trendIcon(arch.trend)} ${escapeHtml(arch.trendLabel)}</span></td>
          </tr>`;
      })
      .join("");
  }

  function trendIcon(trend) {
    if (trend === "up") return "↑";
    if (trend === "down") return "↓";
    return "→";
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
        return `<tr>
          <th scope="row" class="matchup-rowhead">${manaPips(deck.colors)}<span class="matchup-rowname">${escapeHtml(deck.name)}</span></th>
          ${cellsHtml}
        </tr>`;
      })
      .join("");

    return `<table class="matchup-table">
      <caption class="visually-hidden">Win rates read as row versus column. Each value is the row archetype's win rate against the column archetype. Diagonal cells are mirror matches. Sample snapshot rates, not historical tournament results.</caption>
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

  function manaPips(colors) {
    if (!Array.isArray(colors) || colors.length === 0) return "";
    const pips = colors
      .filter((color) => MANA.has(color))
      .map((color) => `<span class="mana-pip ${color}" title="${color}"></span>`)
      .join("");
    if (!pips) return "";
    return `<span class="mana" aria-hidden="true">${pips}</span>`;
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
    chooseSnapshot,
    sortArchetypes,
    renderArchetypeRows,
    formatWinRate,
    rateBand,
    renderMatchupTable,
  };
});
