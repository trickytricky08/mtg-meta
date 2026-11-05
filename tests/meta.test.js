const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
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
} = require("../js/matchup.js");

const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/meta.json"), "utf8")
);
const indexHtml = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
const rules = data.display;

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

test("dataset is three formats of Goldfish paper windows", () => {
  assert.equal(data.dataKind, "goldfish-windows");
  assert.equal(data.asOf, "2026-11-05");
  assert.equal(data.source.name, "MTGGoldfish");
  assert.equal(data.source.slice, "paper");
  assert.equal(data.source.retrieved, "2026-11-05");
  assert.equal(data.metrics.share, "mtggoldfish-paper");
  assert.equal(data.metrics.winRate, "demo");
  assert.equal(data.metrics.matchups, "demo");
  assert.match(data.disclaimer, /demo estimates/i);
  assert.match(data.disclaimer, /not tournament results/i);
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
    assert.ok(new Set(counts).size >= 1, fmt.id);
  }
  assert.equal(shown("pioneer", 7).length, 14);
  assert.equal(shown("standard", 30).length, 15);
  const standard30 = windowOf(formatById("standard"), 30);
  const qualified30 = standard30.archetypes.filter((arch) => arch.share >= 1.2);
  assert.ok(qualified30.length > 15);
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
        assert.equal(arch.goldfishUrl, `https://www.mtggoldfish.com/archetype/${arch.id}`);
      }
    }
  }
});

test("demo matchup pairs among decks at 1.2% share sum to 100", () => {
  for (const fmt of data.formats) {
    for (const win of fmt.windows) {
      const qualified = win.archetypes.filter((arch) => arch.share >= rules.minShare);
      const byId = new Map(qualified.map((arch) => [arch.id, arch]));
      const expected = qualified.map((arch) => arch.id).sort();
      for (const arch of qualified) {
        assert.deepEqual(
          Object.keys(arch.matchups).sort(),
          expected.filter((id) => id !== arch.id)
        );
        for (const [opponentId, rate] of Object.entries(arch.matchups)) {
          assert.ok(Math.abs(rate + byId.get(opponentId).matchups[arch.id] - 100) < 1e-6);
        }
      }
      for (const arch of win.archetypes) {
        if (arch.share < rules.minShare) assert.deepEqual(arch.matchups, {});
      }
    }
  }
});

test("chooseWindow returns the requested trailing window", () => {
  const pioneer = formatById("pioneer");
  assert.equal(chooseWindow(pioneer, 7).days, 7);
  const ninety = chooseWindow(pioneer, 90);
  assert.equal(
    ninety.sampleSize,
    ninety.archetypes.reduce((sum, arch) => sum + arch.deckCount, 0)
  );
  assert.ok(ninety.sampleSize > chooseWindow(pioneer, 7).sampleSize);
  assert.equal(chooseWindow(pioneer, 30).days, 30);
  assert.equal(chooseWindow(pioneer, 3).days, 30);
});

test("rendered rows are plain Goldfish links in share order", () => {
  const decks = shown("pioneer", 7);
  const html = renderArchetypeRows(decks);
  assert.equal(decks[0].name, "Golgari Midrange");
  assert.ok(html.includes(`href="${decks[0].goldfishUrl}" target="_blank" rel="noopener noreferrer">${decks[0].name}`));
  assert.equal(html.includes("mana-pip"), false);
  assert.equal(html.includes("trend"), false);
  assert.equal(html.includes('role="button"'), false);
  assert.ok(html.indexOf(`data-id="${decks[0].id}"`) < html.indexOf(`data-id="${decks[1].id}"`));
  const capped = renderArchetypeRows(shown("pioneer", 90));
  assert.equal(capped.match(/<tr /g).length, 15);
});

test("stored shares include the retrieved Goldfish paper snapshot", () => {
  const standard30 = windowOf(formatById("standard"), 30);
  const landfall = standard30.archetypes.find((arch) => arch.id === "standard-mono-green-landfall-woe");
  assert.equal(landfall.name, "Mono-Green Landfall");
  assert.equal(landfall.share, 12.5);
  assert.equal(landfall.deckCount, 454);
  assert.equal(
    landfall.goldfishUrl,
    "https://www.mtggoldfish.com/archetype/standard-mono-green-landfall-woe"
  );
  assert.equal(standard30.sampleSize, 3644);
});

test("the visible grid uses row-versus-column rates for that window", () => {
  const shown30 = shown("pioneer", 30);
  const grid = buildMatchupGrid(shown30);
  const source = windowOf(formatById("pioneer"), 30);
  const first = source.archetypes.find((arch) => arch.id === shown30[0].id);
  const second = source.archetypes.find((arch) => arch.id === shown30[1].id);
  assert.equal(grid.decks[0].id, shown30[0].id);
  assert.equal(cell(grid, first.id, second.id).value, first.matchups[second.id]);
  assert.equal(cell(grid, second.id, first.id).value, second.matchups[first.id]);
  assert.notEqual(cell(grid, first.id, second.id).value, cell(grid, second.id, first.id).value);
  assert.equal(cell(grid, first.id, first.id).kind, "mirror");

  const shown7 = shown("pioneer", 7);
  const shared = shown7.filter((arch) => shown30.some((other) => other.id === arch.id));
  assert.ok(shared.length >= 2);
  const weekSource = windowOf(formatById("pioneer"), 7);
  const left = shared[0].id;
  const right = shared[1].id;
  const weekLeft = weekSource.archetypes.find((arch) => arch.id === left);
  const monthLeft = source.archetypes.find((arch) => arch.id === left);
  assert.notEqual(weekLeft.matchups[right], monthLeft.matchups[right]);
  assert.notEqual(weekLeft.share, monthLeft.share);
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

test("one header is active, and a third click clears back to share descending", () => {
  let sort = { key: "share", dir: "desc" };
  sort = nextSort(sort, "share");
  assert.deepEqual(sort, { key: "share", dir: "asc" });
  sort = nextSort(sort, "share");
  assert.deepEqual(sort, { key: null, dir: null });
  assert.deepEqual(effectiveSort(sort), { key: "share", dir: "desc" });
  sort = nextSort(sort, "winRate");
  assert.deepEqual(sort, { key: "winRate", dir: "desc" });
  sort = nextSort(sort, "share");
  assert.deepEqual(sort, { key: "share", dir: "desc" });
  sort = nextSort(sort, "winRate");
  sort = nextSort(sort, "winRate");
  sort = nextSort(sort, "winRate");
  assert.deepEqual(sort, { key: null, dir: null });
  const decks = [
    { id: "a", name: "Alpha", share: 10, winRate: 60 },
    { id: "b", name: "Beta", share: 20, winRate: 48 },
  ];
  assert.deepEqual(
    orderArchetypes(decks, effectiveSort(sort)).map((deck) => deck.id),
    ["b", "a"]
  );
  const winRateOrder = orderArchetypes(decks, effectiveSort(nextSort(sort, "winRate"))).map(
    (deck) => deck.id
  );
  assert.deepEqual(winRateOrder, ["a", "b"]);
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
  assert.equal(indexHtml.includes("↕"), false);
  assert.equal(appJs.includes("↕"), false);
  assert.match(indexHtml, /id="metagame-heading">Metagame Breakdown/);
  assert.ok(
    indexHtml.indexOf('id="window-note"') < indexHtml.indexOf('class="window-wrap"')
  );
  assert.match(fs.readFileSync(path.join(__dirname, "../css/styles.css"), "utf8"), /window-wrap[\s\S]*margin-left:\s*auto/);
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
