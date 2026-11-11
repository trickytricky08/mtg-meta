/**
 * MTG Meta — tournament list shaping and drawer markup.
 * Loaded in the browser before tournaments-page.js, and required by node:test.
 *
 * The page re-reads data/tournaments.json. Optional fields are omitted when
 * Goldfish did not publish them. A later data refresh can add them without a
 * UI change:
 *
 *   playerCount — non-negative integer. Shown only when present. Never
 *     inferred from the event name ("Challenge 32" is not a player count).
 *
 *   bracket — omitted when no bracket was published. Shape:
 *     {
 *       "rounds": [
 *         {
 *           "round": "QF",
 *           "matches": [
 *             {
 *               "players": [
 *                 { "player": "Ada", "archetype": "Dimir Midrange", "wins": 2, "losses": 0 },
 *                 { "player": "Bea", "archetype": "Living End", "wins": 0, "losses": 2 }
 *               ],
 *               "winner": "Ada"
 *             }
 *           ]
 *         }
 *       ]
 *     }
 *   round is QF (quarterfinals), SF (semifinals), or F (final). Each match has
 *   two players. wins and losses are game counts. winner is the player string
 *   of the player who won the match. Rounds with no published matches are
 *   omitted. See README for the full note.
 *
 * Place text is shown as the source printed it. Ordering understands exact
 * places ("1st", "2"), place bands ("3rd-4th", "5th-8th", "3-4"), and league
 * records ("5 - 0"). Ties keep the source order.
 */
(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.MTGTournaments = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const FORMATS = [
    { id: "standard", name: "Standard" },
    { id: "pioneer", name: "Pioneer" },
    { id: "modern", name: "Modern" },
  ];

  const TYPE_RULES = [
    [/league/i, "League"],
    [/challenge/i, "Challenge"],
    [/qualifier|\bptq\b|\brc\b|regional championship/i, "Qualifier"],
    [/prelim/i, "Preliminary"],
    [/showcase/i, "Showcase"],
  ];

  const TYPE_ORDER = ["Challenge", "League", "Qualifier", "Preliminary", "Showcase", "Other"];

  const ROUNDS = [
    { id: "QF", label: "Quarterfinals", aliases: ["qf", "quarterfinal", "quarterfinals", "quarters"] },
    { id: "SF", label: "Semifinals", aliases: ["sf", "semifinal", "semifinals", "semis"] },
    { id: "F", label: "Final", aliases: ["f", "final", "finals"] },
  ];

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_LONG = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  function eventType(event) {
    const name = String(event?.name || "");
    for (const [pattern, label] of TYPE_RULES) {
      if (pattern.test(name)) return label;
    }
    return "Other";
  }

  function eventTypesIn(events) {
    const present = new Set((events || []).map(eventType));
    return TYPE_ORDER.filter((label) => present.has(label));
  }

  function knownPlayerCount(event) {
    const value = event?.playerCount;
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
    if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
    return null;
  }

  function normalizeFormat(value) {
    const id = String(value || "").trim().toLowerCase();
    return FORMATS.some((fmt) => fmt.id === id) ? id : "standard";
  }

  function normalizeType(value, available) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw || raw === "all") return "";
    const found = (available || TYPE_ORDER).find((label) => label.toLowerCase() === raw);
    return found || "";
  }

  function validDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
  }

  function compareEvents(a, b) {
    const date = String(b?.date || "").localeCompare(String(a?.date || ""));
    if (date) return date;
    const name = String(a?.name || "").localeCompare(String(b?.name || ""));
    if (name) return name;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  }

  function listEvents(events, filters) {
    const format = filters?.format ? normalizeFormat(filters.format) : "";
    const type = filters?.type ? String(filters.type).trim().toLowerCase() : "";
    const from = validDate(filters?.from);
    const to = validDate(filters?.to);
    if (from && to && from > to) return [];
    const filtered = (events || []).filter((event) => {
      if (format && String(event?.format || "").toLowerCase() !== format) return false;
      if (type && eventType(event).toLowerCase() !== type) return false;
      const date = validDate(event?.date);
      if ((from || to) && !date) return false;
      if (from && date < from) return false;
      if (to && date > to) return false;
      return true;
    });
    return [...filtered].sort(compareEvents);
  }

  function placeKey(place) {
    const text = String(place ?? "").trim();
    if (/(?:\d+)(?:st|nd|rd|th)\b/i.test(text)) {
      const rank = text.match(/(\d+)/);
      return { group: 0, rank: rank ? Number(rank[1]) : 999 };
    }
    const spaced = text.match(/^(\d+)\s+[-–—]\s+(\d+)$/);
    if (spaced) return { group: 1, wins: Number(spaced[1]), losses: Number(spaced[2]) };
    const pair = text.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (pair) {
      const left = Number(pair[1]);
      const right = Number(pair[2]);
      if (left < right) return { group: 0, rank: left };
      return { group: 1, wins: left, losses: right };
    }
    if (/^\d+$/.test(text)) return { group: 0, rank: Number(text) };
    return { group: 2, rank: 0 };
  }

  function comparePlaces(a, b) {
    const ka = placeKey(a);
    const kb = placeKey(b);
    if (ka.group !== kb.group) return ka.group - kb.group;
    if (ka.group === 0) return ka.rank - kb.rank;
    if (ka.group === 1) {
      if (ka.wins !== kb.wins) return kb.wins - ka.wins;
      return ka.losses - kb.losses;
    }
    return 0;
  }

  function orderFinishers(rows) {
    return (rows || [])
      .map((row, index) => ({ row, index }))
      .sort((a, b) => comparePlaces(a.row?.place, b.row?.place) || a.index - b.index)
      .map((entry) => entry.row);
  }

  function gameCount(value) {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
    if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
    return null;
  }

  function normalizePlayer(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      player: typeof raw.player === "string" ? raw.player.trim() : "",
      archetype: typeof raw.archetype === "string" ? raw.archetype.trim() : "",
      wins: gameCount(raw.wins),
      losses: gameCount(raw.losses),
    };
  }

  function samePlayer(player, winner) {
    if (!player || !winner) return false;
    return player === winner || player.toLowerCase() === winner.toLowerCase();
  }

  function resolveWinner(players, winner) {
    if (typeof winner === "number" && players[winner]) return players[winner];
    if (winner && typeof winner === "object" && typeof winner.player === "string") {
      return resolveWinner(players, winner.player);
    }
    if (typeof winner === "string" && winner.trim()) {
      const found = players.find((player) => samePlayer(player.player, winner.trim()));
      if (found) return found;
    }
    if (players.length === 2 && players[0].wins != null && players[1].wins != null && players[0].wins !== players[1].wins) {
      return players[0].wins > players[1].wins ? players[0] : players[1];
    }
    return null;
  }

  function normalizeMatch(raw) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.players) || raw.players.length !== 2) {
      return null;
    }
    const players = raw.players.map(normalizePlayer);
    if (players.some((player) => !player)) return null;
    const winner = resolveWinner(players, raw.winner);
    return {
      players: players.map((player) => ({ ...player, won: winner != null && player === winner })),
      winner: winner ? winner.player || winner.archetype : "",
    };
  }

  function roundSpec(raw) {
    const token = String(raw?.round || raw?.id || raw?.name || "").trim().toLowerCase();
    return ROUNDS.find((spec) => spec.aliases.includes(token)) || null;
  }

  function normalizeBracket(bracket) {
    const rounds = bracket && typeof bracket === "object" ? bracket.rounds : null;
    if (!Array.isArray(rounds)) return null;
    const buckets = new Map(ROUNDS.map((spec) => [spec.id, []]));
    for (const raw of rounds) {
      const spec = roundSpec(raw);
      if (!spec || !Array.isArray(raw.matches)) continue;
      for (const match of raw.matches) {
        const normalized = normalizeMatch(match);
        if (normalized) buckets.get(spec.id).push(normalized);
      }
    }
    const kept = ROUNDS.map((spec) => ({
      id: spec.id,
      label: spec.label,
      matches: buckets.get(spec.id),
    })).filter((round) => round.matches.length > 0);
    return kept.length ? { rounds: kept } : null;
  }

  function hasBracket(event) {
    return normalizeBracket(event?.bracket) != null;
  }

  function formatShortDate(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!match) return String(iso || "");
    const month = MONTHS[Number(match[2]) - 1];
    if (!month) return String(iso);
    return `${month} ${Number(match[3])}`;
  }

  function formatLongDate(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!match) return String(iso || "");
    const month = MONTHS_LONG[Number(match[2]) - 1];
    if (!month) return String(iso);
    return `${month} ${Number(match[3])}, ${match[1]}`;
  }

  function formatName(id) {
    const found = FORMATS.find((fmt) => fmt.id === String(id || "").toLowerCase());
    return found ? found.name : String(id || "");
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

  function safeUrl(url) {
    try {
      const parsed = new URL(String(url));
      if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.href;
    } catch {
      /* not a URL */
    }
    return "";
  }

  function externalLink(url, label, className) {
    const href = safeUrl(url);
    const text = escapeHtml(label);
    if (!href) return text;
    return `<a class="${className}" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  }

  function dash() {
    return '<span class="muted">—</span>';
  }

  function renderEventRows(events, openId, emptyMessage) {
    const rows = events || [];
    if (!rows.length) {
      const message = emptyMessage || "No events in this range.";
      return `<tr class="event-empty"><td colspan="5"><div class="empty">${escapeHtml(message)}</div></td></tr>`;
    }
    const open = openId == null ? "" : String(openId);
    return rows.map((event) => {
      const id = String(event?.id ?? "");
      const count = knownPlayerCount(event);
      const winner = event?.winner && event.winner.archetype ? escapeHtml(event.winner.archetype) : dash();
      const chip = hasBracket(event) ? '<span class="bracket-chip">Bracket</span>' : "";
      const selected = open && open === id;
      const label = `Open ${event?.name || "event"}`;
      return `<tr class="event-row${selected ? " is-open" : ""}" tabindex="0" data-event-id="${escapeAttr(id)}" aria-label="${escapeAttr(label)}"${selected ? ' aria-current="true"' : ""}>
        <td class="event-date" data-label="Date"><time datetime="${escapeAttr(event?.date || "")}">${escapeHtml(formatShortDate(event?.date))}</time></td>
        <td class="event-name" data-label="Event"><span class="event-title">${escapeHtml(event?.name || "Untitled")}</span>${chip}</td>
        <td class="event-type" data-label="Type">${escapeHtml(eventType(event))}</td>
        <td class="event-winner" data-label="Winner">${winner}</td>
        <td class="num event-players" data-label="Players">${count == null ? '<span class="muted" title="Player count not published">—</span>' : escapeHtml(String(count))}</td>
      </tr>`;
    }).join("");
  }

  function sideLabel(player) {
    return player.player || player.archetype || "Unknown";
  }

  function scoreText(match) {
    const [left, right] = match.players;
    const winner = match.players.find((player) => player.won);
    const loser = winner ? match.players.find((player) => player !== winner) : null;
    if (winner && loser && winner.wins != null && loser.wins != null) return `${winner.wins}–${loser.wins}`;
    if (left.wins != null && right.wins != null) return `${left.wins}–${right.wins}`;
    return "";
  }

  function renderMatch(match) {
    const players = match.players.map((player) => {
      const score = player.wins == null ? "–" : String(player.wins);
      return `<div class="bracket-player${player.won ? " is-winner" : ""}">
        <span class="bp-arch">${player.archetype ? escapeHtml(player.archetype) : dash()}</span>
        <span class="bp-name">${player.player ? escapeHtml(player.player) : dash()}</span>
        <span class="bp-score">${escapeHtml(score)}</span>
      </div>`;
    }).join("");
    const winner = match.players.find((player) => player.won);
    const loser = winner ? match.players.find((player) => player !== winner) : null;
    const score = scoreText(match);
    const result = winner && loser
      ? `<p class="bracket-result">${escapeHtml(sideLabel(winner))} def. ${escapeHtml(sideLabel(loser))}${score ? ` <span class="bp-score">${escapeHtml(score)}</span>` : ""}</p>`
      : "";
    return `<li class="bracket-match">${players}${result}</li>`;
  }

  function renderBracket(bracket) {
    const normalized = normalizeBracket(bracket);
    if (!normalized) return `<p class="bracket-missing">Bracket not available for this event</p>`;
    const rounds = normalized.rounds.map((round) => `<section class="bracket-round" data-round="${round.id}">
        <h3 class="bracket-round-label">${escapeHtml(round.label)}</h3>
        <ol class="bracket-matches">${round.matches.map(renderMatch).join("")}</ol>
      </section>`).join("");
    return `<section class="bracket" aria-label="Bracket">${rounds}</section>`;
  }

  function renderDrawer(event) {
    const count = knownPlayerCount(event);
    const bits = [
      formatLongDate(event?.date),
      formatName(event?.format),
      eventType(event),
    ].filter(Boolean);
    if (count != null) bits.push(`${count} player${count === 1 ? "" : "s"}`);
    const links = [];
    if (safeUrl(event?.goldfishUrl)) {
      links.push(externalLink(event.goldfishUrl, "Event on MTGGoldfish", "text-link"));
    }
    if (safeUrl(event?.sourceUrl)) {
      links.push(externalLink(event.sourceUrl, "Source", "text-link source-link"));
    }
    const finishers = orderFinishers(event?.top8);
    const finisherRows = finishers.length
      ? finishers.map((row) => {
          const archetype = row?.archetype
            ? externalLink(row.goldfishUrl, row.archetype, "arch-name")
            : dash();
          return `<tr>
            <td class="finish-place">${row?.place ? escapeHtml(row.place) : dash()}</td>
            <td>${archetype}</td>
            <td>${row?.player ? escapeHtml(row.player) : dash()}</td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="3"><div class="empty">No top 8 was published for this event.</div></td></tr>`;
    const fixture = event?.devFixture
      ? `<p class="fixture-flag">Dev fixture — not part of the weekly results.</p>`
      : "";
    return `<div class="drawer-head">
      <div class="drawer-heading">
        <p class="drawer-kicker">${escapeHtml(bits.join(" · "))}</p>
        <h2 id="drawer-title">${escapeHtml(event?.name || "Event")}</h2>
        ${fixture}
      </div>
      <button type="button" class="drawer-close" id="drawer-close">Close</button>
    </div>
    ${links.length ? `<p class="drawer-links">${links.join('<span class="link-dot" aria-hidden="true">·</span>')}</p>` : ""}
    <section class="drawer-section" aria-labelledby="finishers-heading">
      <h3 id="finishers-heading">Top 8</h3>
      <table class="finish-table">
        <thead>
          <tr>
            <th scope="col">Place</th>
            <th scope="col">Archetype</th>
            <th scope="col">Player</th>
          </tr>
        </thead>
        <tbody>${finisherRows}</tbody>
      </table>
    </section>
    <section class="drawer-section" aria-labelledby="bracket-heading">
      <h3 id="bracket-heading">Bracket</h3>
      ${renderBracket(event?.bracket)}
    </section>`;
  }

  return {
    FORMATS,
    TYPE_ORDER,
    eventType,
    eventTypesIn,
    knownPlayerCount,
    normalizeFormat,
    normalizeType,
    validDate,
    compareEvents,
    listEvents,
    placeKey,
    comparePlaces,
    orderFinishers,
    normalizeBracket,
    hasBracket,
    formatShortDate,
    formatLongDate,
    formatName,
    escapeHtml,
    safeUrl,
    renderEventRows,
    renderBracket,
    renderDrawer,
  };
});
