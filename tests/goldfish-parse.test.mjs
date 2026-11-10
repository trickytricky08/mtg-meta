import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTournamentFile,
  buildWindow,
  demoFill,
  parseMetagameTiles,
  parseTournamentIndex,
  parseTournamentPage,
  refreshMeta,
  toTournamentEvent,
} from "../scripts/goldfish/parse.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (name) => fs.readFileSync(path.join(root, "tests/fixtures", name), "utf8");

test("paper metagame tiles keep the archetype link, share, and deck count", () => {
  const tiles = parseMetagameTiles(fixture("metagame-tiles.html"));
  assert.deepEqual(
    tiles.map((tile) => ({
      id: tile.id,
      name: tile.name,
      share: tile.share,
      deckCount: tile.deckCount,
      goldfishUrl: tile.goldfishUrl,
    })),
    [
      {
        id: "standard-mono-green-landfall-woe",
        name: "Mono-Green Landfall",
        share: 12.9,
        deckCount: 453,
        goldfishUrl: "https://www.mtggoldfish.com/archetype/standard-mono-green-landfall-woe",
      },
      {
        id: "standard-dimir-midrange-woe",
        name: "Dimir Midrange",
        share: 10.9,
        deckCount: 383,
        goldfishUrl: "https://www.mtggoldfish.com/archetype/standard-dimir-midrange-woe",
      },
    ]
  );
  assert.equal(tiles.some((tile) => tile.name === "Icetill Explorer"), false);
});

test("single-quoted turbo-stream tiles parse the same way", () => {
  const html = `
    <div class='archetype-tile' id='28136'>
      <span class='deck-price-online'><a href='/archetype/standard-mono-green-landfall-woe#online'>Mono-Green Landfall</a></span>
      <span class='deck-price-paper'><a href='/archetype/standard-mono-green-landfall-woe#paper'>Mono-Green Landfall</a></span>
      <div class='archetype-tile-statistic-value'>
        12.9%
        <span class='archetype-tile-statistic-value-extra-data'>(453)</span>
      </div>
    </div>`;
  const tiles = parseMetagameTiles(html);
  assert.equal(tiles.length, 1);
  assert.equal(tiles[0].id, "standard-mono-green-landfall-woe");
  assert.equal(tiles[0].share, 12.9);
  assert.equal(tiles[0].deckCount, 453);
});

test("demo matchups follow the existing schema and change with the window", () => {
  const tiles = parseMetagameTiles(fixture("metagame-tiles.html"));
  tiles.push({
    id: "standard-tiny-woe",
    name: "Tiny",
    share: 0.4,
    deckCount: 2,
    goldfishUrl: "https://www.mtggoldfish.com/archetype/standard-tiny-woe",
  });
  const week = buildWindow(7, tiles, 1.2);
  const month = buildWindow(30, tiles, 1.2);
  assert.equal(week.sampleSize, 453 + 383 + 2);
  const landfall = week.archetypes[0];
  const dimir = week.archetypes[1];
  const tiny = week.archetypes[2];
  assert.deepEqual(tiny.matchups, {});
  assert.equal(typeof tiny.winRate, "number");
  assert.deepEqual(Object.keys(landfall.matchups), ["standard-dimir-midrange-woe"]);
  assert.ok(Math.abs(landfall.matchups[dimir.id] + dimir.matchups[landfall.id] - 100) < 1e-6);
  assert.notEqual(landfall.matchups[dimir.id], dimir.matchups[landfall.id]);
  assert.notEqual(landfall.matchups[dimir.id], month.archetypes[0].matchups[dimir.id]);
  assert.equal(landfall.goldfishUrl, `https://www.mtggoldfish.com/archetype/${landfall.id}`);
  const filled = demoFill(tiles.slice(0, 2), 14, 1.2);
  assert.equal(filled[0].matchups[filled[1].id] + filled[1].matchups[filled[0].id], 100);
});

test("refreshMeta keeps the schema and only moves the retrieval stamps", () => {
  const existing = {
    dataKind: "goldfish-windows",
    asOf: "2026-11-05",
    source: {
      name: "MTGGoldfish",
      slice: "paper",
      retrieved: "2026-11-05",
      page: "https://www.mtggoldfish.com/metagame/",
    },
    metrics: { share: "mtggoldfish-paper", winRate: "demo", matchups: "demo" },
    disclaimer: "Retrieved 2026-11-05. Win rates are demo estimates, not tournament results.",
    display: { minShare: 1.2, maxArchetypes: 15, defaultWindowDays: 30, windowDays: [7, 14, 30, 90] },
    formats: [
      {
        id: "standard",
        name: "Standard",
        description: "Rotating constructed format using the most recent sets.",
        windows: [],
      },
    ],
  };
  const windows = [7, 14, 30, 90].map((days) => buildWindow(days, parseMetagameTiles(fixture("metagame-tiles.html")), 1.2));
  const next = refreshMeta(existing, { standard: windows }, "2026-11-10");
  assert.equal(next.asOf, "2026-11-10");
  assert.equal(next.source.retrieved, "2026-11-10");
  assert.equal(next.source.slice, "paper");
  assert.equal(next.source.page, existing.source.page);
  assert.equal(next.metrics.winRate, "demo");
  assert.match(next.disclaimer, /2026-11-10/);
  assert.equal(next.disclaimer.includes("2026-11-05"), false);
  assert.equal(next.formats[0].description, existing.formats[0].description);
  assert.deepEqual(next.display, existing.display);
  assert.deepEqual(
    next.formats[0].windows.map((win) => win.days),
    [7, 14, 30, 90]
  );
});

test("tournament index ignores the view-all link and keeps the event date", () => {
  const events = parseTournamentIndex(fixture("tournament-index.html"));
  assert.deepEqual(events.map((event) => [event.id, event.name, event.date]), [
    ["67899", "Standard League 2026-11-09", "2026-11-09"],
    ["67904", "Standard Challenge 16 2026-11-08", "2026-11-08"],
  ]);
  assert.equal(events[1].goldfishUrl, "https://www.mtggoldfish.com/tournament/67904");
});

test("a challenge page records the top 8, the 1st-place winner, and the printed labels", () => {
  const page = parseTournamentPage(fixture("tournament-challenge.html"));
  const event = toTournamentEvent(page, "67904");
  assert.equal(event.name, "Standard Challenge 16 2026-11-08");
  assert.equal(event.format, "standard");
  assert.equal(event.date, "2026-11-08");
  assert.equal(event.goldfishUrl, "https://www.mtggoldfish.com/tournament/67904");
  assert.equal(
    event.sourceUrl,
    "https://www.mtgo.com/decklist/standard-challenge-16-2026-11-0812857702"
  );
  assert.equal(event.top8.length, 8);
  assert.deepEqual(event.winner, {
    place: "1st",
    archetype: "Selesnya Landfall",
    player: "KillTheDrake",
    goldfishUrl: "https://www.mtggoldfish.com/deck/8036299",
  });
  assert.equal(event.top8[1].archetype, "UB");
  assert.equal(event.top8[1].player, "karatedom");
  assert.equal(event.top8[1].place, "2nd");
  const lifegain = event.archetypeBreakdown.find((row) => row.archetype === "Lifegain");
  assert.equal(lifegain.count, 2);
  assert.equal(event.top8.some((row) => row.place === "9th"), false);
});

test("a league page keeps records and players and does not invent a winner", () => {
  const page = parseTournamentPage(fixture("tournament-league.html"));
  const event = toTournamentEvent(page, "67899");
  assert.equal(event.name, "Standard League 2026-11-09");
  assert.equal(event.date, "2026-11-09");
  assert.equal(event.winner, undefined);
  assert.equal(event.sourceUrl, undefined);
  assert.deepEqual(
    event.top8.map((row) => [row.place, row.archetype, row.player]),
    [
      ["5 - 0", "Mono-Green Landfall", "Frankcontropelo03"],
      ["5 - 0", "Boros Dragons", "Jack-Z"],
    ]
  );
  assert.equal(event.top8.length < 8, true);
});

test("the weekly workflow scrapes both datasets and commits only when data changed", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/goldfish-data.yml"), "utf8");
  const workflows = fs.readdirSync(path.join(root, ".github/workflows"));
  assert.deepEqual(workflows, ["goldfish-data.yml"]);
  assert.match(workflow, /cron:\s*"17 6 \* \* 0"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /contents:\s*write/);
  assert.match(workflow, /node scripts\/goldfish\/scrape\.mjs/);
  assert.match(workflow, /git diff --cached --quiet/);
  assert.match(workflow, /data\/meta\.json data\/tournaments\.json/);
  assert.equal(workflow.includes("pull-requests:"), false);
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(index, /class="site-nav"/);
  assert.match(index, /href="tournaments.html"/);
  assert.equal(index.includes("data/tournaments.json"), false);
  assert.equal(index.includes("js/tournaments"), false);
});

test("seeded tournament file matches the scraper schema", () => {
  const data = JSON.parse(fs.readFileSync(path.join(root, "data/tournaments.json"), "utf8"));
  assert.equal(data.dataKind, "goldfish-tournaments");
  assert.match(data.retrieved, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(data.source.name, "MTGGoldfish");
  assert.equal(data.source.retrieved, data.retrieved);
  assert.ok(data.events.length >= 3);
  const formats = new Set(data.events.map((event) => event.format));
  assert.deepEqual([...formats].sort(), ["modern", "pioneer", "standard"]);
  const challenge = data.events.find((event) => event.id === "67904");
  assert.ok(challenge, "seed should include the scraped Standard Challenge 67904");
  assert.equal(challenge.winner.archetype, "Selesnya Landfall");
  assert.equal(challenge.winner.player, "KillTheDrake");
  assert.equal(challenge.top8.length, 8);
  for (const event of data.events) {
    assert.match(event.id, /^\d+$/);
    assert.ok(event.name);
    assert.match(event.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(event.goldfishUrl, /^https:\/\/www\.mtggoldfish\.com\/tournament\/\d+$/);
    assert.ok(event.top8.length >= 1 && event.top8.length <= 8);
    const counts = new Map();
    for (const row of event.top8) {
      assert.ok(row.place);
      assert.ok(row.archetype);
      assert.match(row.goldfishUrl, /^https:\/\/www\.mtggoldfish\.com\/deck\/\d+$/);
      counts.set(row.archetype, (counts.get(row.archetype) || 0) + 1);
      if (/^1st$/i.test(row.place)) {
        assert.deepEqual(event.winner, row);
      }
    }
    if (!event.top8.some((row) => /^1st$/i.test(row.place))) {
      assert.equal(event.winner, undefined);
    }
    assert.deepEqual(
      event.archetypeBreakdown.map((row) => [row.archetype, row.count]).sort(),
      [...counts.entries()].sort()
    );
  }
  const file = buildTournamentFile(data.events, data.retrieved);
  assert.equal(file.notes, data.notes);
});
