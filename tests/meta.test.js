const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildMatchupGrid,
  orderArchetypes,
  chooseWindow,
  visibleArchetypes,
  renderArchetypeRows,
  formatWinRate,
  rateBand,
  renderMatchupTable,
} = require("../js/matchup.js");

const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/meta.json"), "utf8")
);
const indexHtml = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
const rules = data.display;

const KEPT_LINKS = {
  "standard/domain-ramp": "https://www.mtggoldfish.com/archetype/standard-domain-dmu",
  "standard/azorius-control": "https://www.mtggoldfish.com/archetype/standard-azorius-control-woe",
  "standard/boros-aggro": "https://www.mtggoldfish.com/archetype/standard-boros-aggro-woe",
  "standard/dimir-midrange": "https://www.mtggoldfish.com/archetype/standard-dimir-midrange-woe",
  "standard/golgari-midrange": "https://www.mtggoldfish.com/archetype/standard-golgari-midrange-woe",
  "standard/izzet-prowess": "https://www.mtggoldfish.com/archetype/standard-izzet-prowess-woe",
  "modern/rakdos-scam": "https://www.mtggoldfish.com/archetype/modern-rakdos-scam/decks",
  "modern/iw-control": "https://www.mtggoldfish.com/archetype/modern-izzet-control",
  "modern/affinity": "https://www.mtggoldfish.com/archetype/modern-affinity",
  "modern/amulet-titan": "https://www.mtggoldfish.com/archetype/amulet-titan",
  "modern/yawgmoth":
    "https://www.mtggoldfish.com/archetype/modern-yawgmoth-9bd3dc9a-1da1-442e-9b88-6ef2a027e80b",
  "modern/hammer-time": "https://www.mtggoldfish.com/archetype/modern-hammer-time",
  "modern/living-end": "https://www.mtggoldfish.com/archetype/modern-living-end",
  "pioneer/rakdos-midrange": "https://www.mtggoldfish.com/archetype/pioneer-rakdos-midrange",
  "pioneer/izzet-phoenix":
    "https://www.mtggoldfish.com/archetype/izzet-phoenix-57eb17e3-2b71-4301-99a6-45002ffcfadb",
  "pioneer/azorius-control": "https://www.mtggoldfish.com/archetype/pioneer-azorius-control",
  "pioneer/mono-green-devotion": "https://www.mtggoldfish.com/archetype/pioneer-nykthos-ramp",
  "pioneer/amalia-combo":
    "https://www.mtggoldfish.com/archetype/pioneer-abzan-amalia-combo/decks",
  "pioneer/boros-convoke": "https://www.mtggoldfish.com/archetype/pioneer-boros-convoke",
};

function formatById(id) {
  const fmt = data.formats.find((entry) => entry.id === id);
  assert.ok(fmt, id);
  return fmt;
}

function windowOf(fmt, days) {
  const win = fmt.windows.find((entry) => entry.days === days);
  assert.ok(win, `${fmt.id} ${days}`);
  return win;
}

function shown(fmtId, days) {
  return visibleArchetypes(windowOf(formatById(fmtId), days).archetypes, rules);
}

function cell(grid, rowId, colId) {
  const row = grid.decks.findIndex((deck) => deck.id === rowId);
  const col = grid.decks.findIndex((deck) => deck.id === colId);
  assert.ok(row >= 0 && col >= 0, `${rowId} vs ${colId}`);
  return grid.cells[row][col];
}

test("dataset is three formats of trailing sample windows", () => {
  assert.equal(data.dataKind, "sample-windows");
  assert.match(data.disclaimer, /not historical tournament results/i);
  assert.equal(data.refresh.replace, "formats[].windows");
  assert.equal(rules.minShare, 1.2);
  assert.equal(rules.maxArchetypes, 15);
  assert.equal(rules.defaultWindowDays, 30);
  assert.deepEqual(rules.windowDays, [7, 14, 30, 90]);
  assert.deepEqual(
    data.formats.map((fmt) => fmt.id),
    ["standard", "modern", "pioneer"]
  );
});

test("each format has 7, 14, 30, and 90 day windows with growing samples", () => {
  for (const fmt of data.formats) {
    assert.deepEqual(
      fmt.windows.map((win) => win.days),
      [7, 14, 30, 90]
    );
    const sizes = fmt.windows.map((win) => win.sampleSize);
    assert.deepEqual(sizes, [...sizes].sort((a, b) => a - b));
    assert.ok(sizes[0] < sizes[3]);
    for (const win of fmt.windows) {
      assert.ok(win.archetypes.length > 15, `${fmt.id} ${win.days}`);
    }
  }
});

test("visible decks are at least 1.2% share and never more than 15", () => {
  for (const fmt of data.formats) {
    const counts = [];
    for (const days of [7, 14, 30, 90]) {
      const win = windowOf(fmt, days);
      const below = win.archetypes.filter((arch) => arch.share < 1.2);
      const qualified = win.archetypes.filter((arch) => arch.share >= 1.2);
      const visible = visibleArchetypes(win.archetypes, rules);
      counts.push(visible.length);
      if (days === 7) assert.ok(below.length > 0, fmt.id);
      if (days === 90) {
        qualified.sort((a, b) => b.share - a.share);
        assert.ok(qualified.length > 15, fmt.id);
        assert.equal(visible.length, 15);
        assert.ok(qualified[15].share >= 1.2);
        assert.equal(
          visible.some((arch) => arch.id === qualified[15].id),
          false
        );
      }
      for (const arch of visible) assert.ok(arch.share >= 1.2);
      assert.deepEqual(
        visible.map((arch) => arch.share),
        [...visible.map((arch) => arch.share)].sort((a, b) => b - a)
      );
    }
    assert.deepEqual(new Set(counts).size, 4, fmt.id);
  }
});

test("the four windows show different decks and different matchup rates", () => {
  for (const fmt of data.formats) {
    const lists = [7, 14, 30, 90].map((days) =>
      shown(fmt.id, days)
        .map((arch) => arch.id)
        .join("|")
    );
    assert.equal(new Set(lists).size, 4, fmt.id);
    const short = windowOf(fmt, 7);
    const mid = windowOf(fmt, 30);
    const deck = short.archetypes[0];
    const opponent = Object.keys(deck.matchups)[0];
    const other = mid.archetypes.find((arch) => arch.id === deck.id);
    assert.notEqual(deck.matchups[opponent], other.matchups[opponent]);
    assert.notEqual(deck.share, other.share);
  }
});

test("kept Goldfish URLs stay on the same pages across windows", () => {
  for (const fmt of data.formats) {
    for (const win of fmt.windows) {
      const ids = new Set();
      for (const arch of win.archetypes) {
        assert.ok(!ids.has(arch.id));
        ids.add(arch.id);
        assert.equal(arch.trend, undefined);
        assert.equal(arch.colors, undefined);
        assert.match(arch.goldfishUrl, /^https:\/\/www\.mtggoldfish\.com\/archetype\/.+/);
        const kept = KEPT_LINKS[`${fmt.id}/${arch.id}`];
        if (kept) assert.equal(arch.goldfishUrl, kept);
      }
    }
  }
});

test("matchup pairs sum to 100 inside every window", () => {
  for (const fmt of data.formats) {
    for (const win of fmt.windows) {
      const byId = new Map(win.archetypes.map((arch) => [arch.id, arch]));
      for (const arch of win.archetypes) {
        assert.deepEqual(
          Object.keys(arch.matchups).sort(),
          win.archetypes.map((entry) => entry.id).filter((id) => id !== arch.id).sort()
        );
        for (const [opponentId, rate] of Object.entries(arch.matchups)) {
          assert.ok(Math.abs(rate + byId.get(opponentId).matchups[arch.id] - 100) < 1e-6);
        }
      }
    }
  }
});

test("chooseWindow returns the requested trailing window", () => {
  const pioneer = formatById("pioneer");
  assert.equal(chooseWindow(pioneer, 7).days, 7);
  assert.equal(chooseWindow(pioneer, 90).sampleSize, 4420);
  assert.equal(chooseWindow(pioneer, 30).days, 30);
  assert.equal(chooseWindow(pioneer, 3).days, 30);
});

test("rendered rows are plain Goldfish links in share order", () => {
  const decks = shown("pioneer", 7);
  const html = renderArchetypeRows(decks);
  assert.equal(decks[0].name, "Izzet Phoenix");
  assert.match(
    html,
    /<a class="arch-name" href="https:\/\/www\.mtggoldfish\.com\/archetype\/izzet-phoenix-57eb17e3-2b71-4301-99a6-45002ffcfadb" target="_blank" rel="noopener noreferrer">Izzet Phoenix<\/a>/
  );
  assert.equal(html.includes("mana-pip"), false);
  assert.equal(html.includes("trend"), false);
  assert.equal(html.includes('role="button"'), false);
  assert.ok(html.indexOf("Izzet Phoenix") < html.indexOf(decks[1].name));
  const capped = renderArchetypeRows(shown("pioneer", 90));
  assert.equal(capped.match(/<tr /g).length, 15);
});

test("the visible grid uses row-versus-column rates for that window", () => {
  const source = windowOf(formatById("pioneer"), 30);
  const grid = buildMatchupGrid(shown("pioneer", 30));
  const rakdos = source.archetypes.find((arch) => arch.id === "rakdos-midrange");
  const phoenix = source.archetypes.find((arch) => arch.id === "izzet-phoenix");
  assert.equal(grid.decks[0].id, "rakdos-midrange");
  assert.equal(cell(grid, "rakdos-midrange", "izzet-phoenix").value, rakdos.matchups["izzet-phoenix"]);
  assert.equal(cell(grid, "izzet-phoenix", "rakdos-midrange").value, phoenix.matchups["rakdos-midrange"]);
  assert.notEqual(
    cell(grid, "rakdos-midrange", "izzet-phoenix").value,
    cell(grid, "izzet-phoenix", "rakdos-midrange").value
  );
  assert.equal(cell(grid, "rakdos-midrange", "rakdos-midrange").kind, "mirror");

  const weekSource = windowOf(formatById("pioneer"), 7);
  const week = buildMatchupGrid(shown("pioneer", 7));
  const weekPhoenix = weekSource.archetypes.find((arch) => arch.id === "izzet-phoenix");
  const weekAzorius = weekSource.archetypes.find((arch) => arch.id === "azorius-control");
  assert.equal(
    cell(week, "izzet-phoenix", "azorius-control").value,
    weekPhoenix.matchups["azorius-control"]
  );
  assert.notEqual(
    weekPhoenix.matchups["azorius-control"],
    source.archetypes.find((arch) => arch.id === "izzet-phoenix").matchups["azorius-control"]
  );
  assert.equal(
    cell(week, "azorius-control", "izzet-phoenix").value,
    weekAzorius.matchups["izzet-phoenix"]
  );
});

test("rendered grid marks mirrors and does not include sub-1.2% decks", () => {
  const html = renderMatchupTable(shown("standard", 90));
  assert.match(html, /row versus column/i);
  assert.match(html, /not historical tournament results/i);
  assert.equal(html.includes("mana-pip"), false);
  assert.equal((html.match(/class="matchup-rowname"/g) || []).length, 15);
  const hidden = windowOf(formatById("standard"), 90).archetypes.filter((arch) => arch.share >= 1.2).slice(15);
  for (const arch of hidden) {
    assert.equal(html.includes(`data-row="${arch.id}"`), false);
  }
});

test("render escapes names and marks missing rates", () => {
  const html = renderMatchupTable([
    { id: "a", name: `<A & "B">`, share: 2, matchups: { b: 60 } },
    { id: "b", name: "Bee", share: 1, matchups: {} },
  ]);
  assert.equal(html.includes("<A"), false);
  assert.match(html, /&lt;A &amp; &quot;B&quot;&gt;/);
  assert.match(html, />60\.0%</);
  assert.match(html, /data-row="b" data-col="a"[^>]*>—</);
});

test("win-rate bands still match the legend", () => {
  assert.equal(rateBand(56), "wr-high");
  assert.equal(rateBand(52), "wr-up");
  assert.equal(rateBand(50), "wr-even");
  assert.equal(rateBand(48), "wr-down");
  assert.equal(rateBand(44), "wr-low");
  assert.equal(formatWinRate(46.5), "46.5%");
});

test("share and win rate ordering drives both the table and the square grid", () => {
  const decks = [
    { id: "a", name: "Alpha", share: 10, winRate: 49 },
    { id: "b", name: "Beta", share: 20, winRate: 55 },
    { id: "c", name: "Cedar", share: 15, winRate: 55 },
  ];
  assert.deepEqual(
    orderArchetypes(decks, { key: "share", dir: "desc" }).map((deck) => deck.id),
    ["b", "c", "a"]
  );
  assert.deepEqual(
    orderArchetypes(decks, { key: "share", dir: "asc" }).map((deck) => deck.id),
    ["a", "c", "b"]
  );
  assert.deepEqual(
    orderArchetypes(decks, { key: "winRate", dir: "desc" }).map((deck) => deck.id),
    ["b", "c", "a"]
  );
  assert.deepEqual(
    orderArchetypes(decks, { key: "winRate", dir: "asc" }).map((deck) => deck.id),
    ["a", "b", "c"]
  );

  const ordered = orderArchetypes(shown("pioneer", 30), { key: "winRate", dir: "desc" });
  const grid = buildMatchupGrid(ordered);
  assert.deepEqual(
    grid.decks.map((deck) => deck.id),
    ordered.map((deck) => deck.id)
  );
  assert.equal(grid.cells[0][1].colId, ordered[1].id);
  assert.equal(grid.cells[1][0].rowId, ordered[1].id);
  const html = renderMatchupTable(ordered);
  assert.match(html, new RegExp(`${ordered[0].name}[\\s\\S]*${ordered[0].winRate.toFixed(1)}%`));
  assert.match(html, /class="matchup-rowrate/);
  const names = [...html.matchAll(/class="matchup-col"[^>]*><span>([^<]+)<\/span>/g)].map((match) => match[1]);
  assert.deepEqual(names, ordered.map((deck) => deck.name));
});

test("the page has a trailing-window control and no sort, trend, search, or detail", () => {
  assert.match(indexHtml, /Show data for the last/);
  assert.match(indexHtml, /id="window"/);
  assert.match(indexHtml, /<option value="7">7 days<\/option>/);
  assert.match(indexHtml, /<option value="14">14 days<\/option>/);
  assert.match(indexHtml, /<option value="30" selected>30 days<\/option>/);
  assert.match(indexHtml, /<option value="90">90 days<\/option>/);
  assert.equal(indexHtml.includes('id="sort"'), false);
  assert.match(indexHtml, /data-sort="share"/);
  assert.match(indexHtml, /data-sort="winRate"/);
  assert.equal(indexHtml.includes("<select id=\"sort\""), false);
  assert.match(appJs, /sortKey/);
  assert.match(appJs, /orderArchetypes/);
  assert.equal(indexHtml.includes('id="search"'), false);
  assert.equal(indexHtml.includes('id="detail"'), false);
  assert.equal(indexHtml.includes(">Trend<"), false);
  assert.equal(appJs.includes("els.sort"), false);
  assert.equal(appJs.includes("renderDetail"), false);
  assert.equal(appJs.includes("windowDays"), true);
});
