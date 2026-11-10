/**
 * Pure parsers for MTGGoldfish paper metagame tiles and tournament pages.
 * No network. The live fetch lives in scrape.mjs.
 *
 * Metagame shares and deck counts come from the paper archetype tiles.
 * Win rates and matchup cells are demo fillers: those pages do not publish
 * them, and the homepage still needs the existing schema.
 */

const RATE_STEPS = [];
for (let step = 0; step <= 24; step += 1) {
  const value = Math.round((40.4 + step * 0.8) * 10) / 10;
  if (value !== 50) RATE_STEPS.push(value);
}

const WINDOW_DAYS = [7, 14, 30, 90];

export function decodeHtml(value) {
  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function hash32(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function dayShift(days) {
  const index = WINDOW_DAYS.indexOf(Number(days));
  if (index < 0) throw new Error(`Unexpected window length: ${days}`);
  return index;
}

function pairRate(days, leftId, rightId) {
  const lowerId = leftId < rightId ? leftId : rightId;
  const higherId = leftId < rightId ? rightId : leftId;
  const base = hash32(`${lowerId}|${higherId}`) % RATE_STEPS.length;
  const index = (base + dayShift(days)) % RATE_STEPS.length;
  const lowerRate = RATE_STEPS[index];
  return leftId < rightId ? lowerRate : Math.round((100 - lowerRate) * 10) / 10;
}

function demoWinRate(days, id) {
  const offset = (hash32(`${id}|wr`) + dayShift(days) * 7) % 68;
  return Math.round((47.6 + offset * 0.1) * 10) / 10;
}

export function parseMetagameTiles(html) {
  const tiles = [];
  const chunks = String(html).split(/<div class=["']archetype-tile["']/).slice(1);
  for (const chunk of chunks) {
    const link = chunk.match(
      /class=["']deck-price-paper["'][^>]*>\s*<a href=["']([^"']+)["'][^>]*>\s*([^<]+?)\s*<\/a>/
    );
    if (!link) continue;
    const slug = link[1].match(/\/archetype\/([^"'#]+)/);
    const stat = chunk.match(
      /class=["']archetype-tile-statistic-value["']>\s*([\d.]+)%\s*<span class=["']archetype-tile-statistic-value-extra-data["']>\s*\(([\d,]+)\)/
    );
    if (!slug || !stat) continue;
    const share = Number(stat[1]);
    const deckCount = Number(stat[2].replace(/,/g, ""));
    if (!Number.isFinite(share) || !Number.isFinite(deckCount)) continue;
    tiles.push({
      id: slug[1],
      name: decodeHtml(link[2]),
      share,
      deckCount,
      goldfishUrl: `https://www.mtggoldfish.com/archetype/${slug[1]}`,
    });
  }
  return tiles;
}

export function demoFill(tiles, days, minShare) {
  const qualifiedIds = tiles.filter((tile) => tile.share >= minShare).map((tile) => tile.id);
  return tiles.map((tile) => {
    const matchups = {};
    if (tile.share >= minShare) {
      for (const otherId of qualifiedIds) {
        if (otherId === tile.id) continue;
        matchups[otherId] = pairRate(days, tile.id, otherId);
      }
    }
    return {
      id: tile.id,
      name: tile.name,
      share: tile.share,
      deckCount: tile.deckCount,
      goldfishUrl: tile.goldfishUrl,
      winRate: demoWinRate(days, tile.id),
      matchups,
    };
  });
}

export function buildWindow(days, tiles, minShare) {
  const unique = [];
  const seen = new Set();
  for (const tile of tiles) {
    if (seen.has(tile.id)) continue;
    seen.add(tile.id);
    unique.push(tile);
  }
  if (unique.length === 0) throw new Error(`No archetypes parsed for the ${days}-day window`);
  const archetypes = demoFill(unique, days, minShare);
  const sampleSize = archetypes.reduce((sum, arch) => sum + arch.deckCount, 0);
  return { days: Number(days), sampleSize, archetypes };
}

export function refreshMeta(existing, windowsByFormat, retrieved) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(retrieved)) {
    throw new Error(`Retrieval date must be YYYY-MM-DD, got ${retrieved}`);
  }
  const next = structuredClone(existing);
  next.asOf = retrieved;
  next.source = { ...next.source, retrieved };
  if (typeof next.disclaimer === "string") {
    next.disclaimer = next.disclaimer.replace(/\d{4}-\d{2}-\d{2}/g, retrieved);
  }
  next.formats = next.formats.map((format) => {
    const windows = windowsByFormat[format.id];
    if (!Array.isArray(windows) || windows.map((win) => win.days).join(",") !== "7,14,30,90") {
      throw new Error(`Expected 7, 14, 30, and 90 day windows for ${format.id}`);
    }
    return { ...format, windows };
  });
  return next;
}

export function parseTournamentIndex(html) {
  const events = [];
  const seen = new Set();
  const re =
    /<a href="\/tournament\/(\d+)"[^>]*>\s*([^<]+?)\s*<\/a>\s*<nobr>\s*on\s+(\d{4}-\d{2}-\d{2})\s*<\/nobr>/g;
  for (const match of String(html).matchAll(re)) {
    if (seen.has(match[1])) continue;
    seen.add(match[1]);
    events.push({
      id: match[1],
      name: decodeHtml(match[2]),
      date: match[3],
      goldfishUrl: `https://www.mtggoldfish.com/tournament/${match[1]}`,
    });
  }
  return events;
}

function parseDeckRows(tableHtml) {
  const rows = [];
  const re =
    /<tr[^>]*class="[^"]*tournament-decklist-(?:odd|event)[^"]*"[^>]*>([\s\S]*?)<\/tr>/g;
  for (const match of tableHtml.matchAll(re)) {
    const row = match[1];
    const placeMatch = row.match(/<td[^>]*>\s*([\s\S]*?)\s*<\/td>/);
    const deckMatch = row.match(/<a href="(\/deck\/\d+)"[^>]*>\s*([^<]+?)\s*<\/a>/);
    if (!placeMatch || !deckMatch) continue;
    const playerMatch = row.match(/<a href="\/player\/[^"]+"[^>]*>\s*([^<]+?)\s*<\/a>/);
    const entry = {
      place: decodeHtml(placeMatch[1]),
      archetype: decodeHtml(deckMatch[2]),
      goldfishUrl: `https://www.mtggoldfish.com${deckMatch[1]}`,
    };
    if (playerMatch) entry.player = decodeHtml(playerMatch[1]);
    rows.push(entry);
  }
  return rows;
}

export function parseTournamentPage(html) {
  const source = String(html);
  const formatMatch = source.match(/Format:\s*([^<\n]+)/);
  const dateMatch = source.match(/Date:\s*(\d{4}-\d{2}-\d{2})/);
  const formatAt = source.search(/Format:/);
  const beforeFormat = formatAt >= 0 ? source.slice(0, formatAt) : source;
  const headings = [...beforeFormat.matchAll(/<h2>\s*([^<]+?)\s*<\/h2>/g)];
  const tableMatch = source.match(/<table class="table-tournament">[\s\S]*?<\/table>/);
  if (!tableMatch) throw new Error("Tournament page has no deck table");
  const sourceMatch = source.match(/Source:\s*<a href="(https?:\/\/[^"]+)"/);
  const page = {
    name: headings.length ? decodeHtml(headings[headings.length - 1][1]) : "",
    decks: parseDeckRows(tableMatch[0]),
  };
  if (formatMatch) page.format = decodeHtml(formatMatch[1]).toLowerCase();
  if (dateMatch) page.date = dateMatch[1];
  if (sourceMatch) page.sourceUrl = sourceMatch[1];
  return page;
}

function isWinnerPlace(place) {
  return place === "1" || /^1st$/i.test(place);
}

export function toTournamentEvent(page, id) {
  const eventId = String(id);
  if (!page.name) throw new Error(`Tournament ${eventId} has no name`);
  if (!page.format) throw new Error(`Tournament ${eventId} has no format`);
  if (!page.decks.length) throw new Error(`Tournament ${eventId} has no decks`);
  const top8 = page.decks.slice(0, 8).map((deck) => {
    const row = {
      place: deck.place,
      archetype: deck.archetype,
    };
    if (deck.player) row.player = deck.player;
    row.goldfishUrl = deck.goldfishUrl;
    return row;
  });
  const counts = new Map();
  for (const row of top8) counts.set(row.archetype, (counts.get(row.archetype) || 0) + 1);
  const archetypeBreakdown = [...counts.entries()]
    .map(([archetype, count]) => ({ archetype, count }))
    .sort((a, b) => b.count - a.count || a.archetype.localeCompare(b.archetype));
  const event = {
    id: eventId,
    name: page.name,
    format: page.format,
  };
  if (page.date) event.date = page.date;
  event.goldfishUrl = `https://www.mtggoldfish.com/tournament/${eventId}`;
  if (page.sourceUrl) event.sourceUrl = page.sourceUrl;
  const winner = top8.find((row) => isWinnerPlace(row.place));
  if (winner) event.winner = { ...winner };
  event.top8 = top8;
  event.archetypeBreakdown = archetypeBreakdown;
  return event;
}

export const TOURNAMENT_NOTES =
  "Events are the recent Standard, Modern, and Pioneer tournaments linked from MTGGoldfish's format tournament lists. top8 is the first eight decks in the order Goldfish printed them, and it is shorter when the page lists fewer than eight. place is the Place cell text. winner is present only when a row is marked 1st. League pages usually show records such as 5 - 0 for several players and no 1st, so those events omit winner. archetype is the deck label on that row; Goldfish sometimes prints a color code such as UB instead of an archetype title, and those labels are kept as printed. archetypeBreakdown counts those labels inside top8. goldfishUrl is the deck or tournament page Goldfish linked. Fields Goldfish did not show are omitted. This file is not the paper metagame snapshot in meta.json.";

export function buildTournamentFile(events, retrieved) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(retrieved)) {
    throw new Error(`Retrieval date must be YYYY-MM-DD, got ${retrieved}`);
  }
  const sorted = [...events].sort(
    (a, b) =>
      String(b.date || "").localeCompare(String(a.date || "")) ||
      String(a.format).localeCompare(String(b.format)) ||
      String(a.name).localeCompare(String(b.name)) ||
      String(a.id).localeCompare(String(b.id))
  );
  return {
    dataKind: "goldfish-tournaments",
    retrieved,
    source: {
      name: "MTGGoldfish",
      retrieved,
      pages: [
        "https://www.mtggoldfish.com/tournaments/standard",
        "https://www.mtggoldfish.com/tournaments/modern",
        "https://www.mtggoldfish.com/tournaments/pioneer",
      ],
    },
    notes: TOURNAMENT_NOTES,
    events: sorted,
  };
}
