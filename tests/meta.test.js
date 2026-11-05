const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildMatchupGrid,
  chooseSnapshot,
  sortArchetypes,
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

const ARCH_FIELDS = [
  "id",
  "name",
  "colors",
  "share",
  "winRate",
  "trend",
  "trendLabel",
  "goldfishUrl",
  "matchups",
];
const MANA = new Set(["W", "U", "B", "R", "G", "C"]);
const TRENDS = new Set(["up", "down", "stable"]);

const GOLDFISH = {
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

function snapshot(fmtId, date) {
  const snap = formatById(fmtId).snapshots.find((entry) => entry.date === date);
  assert.ok(snap, `${fmtId} ${date}`);
  return snap;
}

function cell(grid, rowId, colId) {
  const row = grid.decks.findIndex((deck) => deck.id === rowId);
  const col = grid.decks.findIndex((deck) => deck.id === colId);
  assert.ok(row >= 0 && col >= 0, `${rowId} vs ${colId}`);
  return grid.cells[row][col];
}

test("dataset lists Standard, Modern, and Pioneer sample snapshots", () => {
  assert.equal(data.dataKind, "sample-snapshots");
  assert.match(data.disclaimer, /not historical tournament results/i);
  assert.equal(data.refresh.mode, "sample-snapshots");
  assert.equal(data.refresh.replace, "formats[].snapshots");
  assert.deepEqual(
    data.formats.map((fmt) => fmt.id),
    ["standard", "modern", "pioneer"]
  );
  assert.deepEqual(
    data.formats.map((fmt) => fmt.name),
    ["Standard", "Modern", "Pioneer"]
  );
});

test("each format has a latest snapshot and an earlier distinct one", () => {
  for (const fmt of data.formats) {
    assert.ok(fmt.snapshots.length >= 2, fmt.id);
    const dates = fmt.snapshots.map((snap) => snap.date);
    assert.deepEqual(dates, [...dates].sort((a, b) => b.localeCompare(a)));
    assert.deepEqual(dates, ["2026-11-05", "2026-09-18"]);
    for (const snap of fmt.snapshots) {
      assert.match(snap.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(typeof snap.sampleSize, "number");
      assert.ok(Number.isInteger(snap.sampleSize) && snap.sampleSize > 0);
      assert.ok(snap.archetypes.length >= 6, fmt.id);
    }
    assert.notEqual(fmt.snapshots[0].sampleSize, fmt.snapshots[1].sampleSize);
  }
});

test("latest snapshot keeps the previous Standard and Modern archetype lists", () => {
  assert.deepEqual(
    snapshot("standard", "2026-11-05").archetypes.map((arch) => arch.id),
    [
      "domain-ramp",
      "azorius-control",
      "boros-aggro",
      "dimir-midrange",
      "golgari-midrange",
      "izzet-prowess",
    ]
  );
  assert.deepEqual(
    snapshot("modern", "2026-11-05").archetypes.map((arch) => arch.id),
    [
      "rakdos-scam",
      "iw-control",
      "affinity",
      "amulet-titan",
      "yawgmoth",
      "hammer-time",
      "living-end",
    ]
  );
  assert.deepEqual(
    snapshot("pioneer", "2026-11-05").archetypes.map((arch) => arch.name),
    [
      "Rakdos Midrange",
      "Izzet Phoenix",
      "Azorius Control",
      "Mono-Green Devotion",
      "Amalia Combo",
      "Boros Convoke",
    ]
  );
});

test("every archetype in every snapshot has stats, a Goldfish URL, and matchups", () => {
  for (const fmt of data.formats) {
    for (const snap of fmt.snapshots) {
      const ids = new Set();
      for (const arch of snap.archetypes) {
        for (const key of ARCH_FIELDS) {
          assert.ok(arch[key] !== undefined && arch[key] !== "", `${fmt.id}/${arch.id} ${key}`);
        }
        assert.equal(arch.description, undefined);
        assert.equal(arch.highlights, undefined);
        assert.equal(arch.sideboardNotes, undefined);
        assert.ok(!ids.has(arch.id), arch.id);
        ids.add(arch.id);
        for (const color of arch.colors) assert.ok(MANA.has(color), color);
        assert.ok(arch.share > 0 && arch.share <= 100);
        assert.ok(arch.winRate > 0 && arch.winRate < 100);
        assert.ok(TRENDS.has(arch.trend));
        assert.match(arch.goldfishUrl, /^https:\/\/www\.mtggoldfish\.com\/archetype\/.+/);
        assert.equal(arch.goldfishUrl, GOLDFISH[`${fmt.id}/${arch.id}`]);
      }
    }
  }
});

test("the same deck keeps its Goldfish URL across snapshots", () => {
  for (const fmt of data.formats) {
    const [latest, earlier] = fmt.snapshots;
    for (const arch of latest.archetypes) {
      const previous = earlier.archetypes.find((entry) => entry.id === arch.id);
      assert.equal(previous.goldfishUrl, arch.goldfishUrl);
    }
  }
});

test("matchup matrix is complete and each pair sums to 100 in every snapshot", () => {
  for (const fmt of data.formats) {
    for (const snap of fmt.snapshots) {
      const ids = snap.archetypes.map((arch) => arch.id);
      for (const arch of snap.archetypes) {
        assert.deepEqual(
          Object.keys(arch.matchups).sort(),
          ids.filter((id) => id !== arch.id).sort(),
          `${fmt.id}/${snap.date}/${arch.id}`
        );
        for (const [opponentId, rate] of Object.entries(arch.matchups)) {
          assert.equal(typeof rate, "number");
          assert.ok(rate > 0 && rate < 100);
          const opponent = snap.archetypes.find((entry) => entry.id === opponentId);
          assert.ok(Math.abs(rate + opponent.matchups[arch.id] - 100) < 1e-6);
        }
      }
    }
  }
});

test("an earlier snapshot changes both table stats and matchup cells", () => {
  const latestStd = snapshot("standard", "2026-11-05");
  const earlierStd = snapshot("standard", "2026-09-18");
  const latestDomain = latestStd.archetypes.find((arch) => arch.id === "domain-ramp");
  const earlierDomain = earlierStd.archetypes.find((arch) => arch.id === "domain-ramp");
  assert.equal(latestDomain.matchups["azorius-control"], 46.5);
  assert.notEqual(earlierDomain.matchups["azorius-control"], 46.5);
  assert.notEqual(earlierDomain.share, latestDomain.share);
  const earlierLeader = [...earlierStd.archetypes].sort((a, b) => b.share - a.share)[0];
  assert.equal(earlierLeader.id, "boros-aggro");

  const latestPio = snapshot("pioneer", "2026-11-05");
  const earlierPio = snapshot("pioneer", "2026-09-18");
  const latestRakdos = latestPio.archetypes.find((arch) => arch.id === "rakdos-midrange");
  const earlierRakdos = earlierPio.archetypes.find((arch) => arch.id === "rakdos-midrange");
  assert.equal(latestRakdos.matchups["izzet-phoenix"], 56.4);
  assert.notEqual(earlierRakdos.matchups["izzet-phoenix"], 56.4);
  const pioneerLeader = [...earlierPio.archetypes].sort((a, b) => b.share - a.share)[0];
  assert.equal(pioneerLeader.id, "izzet-phoenix");
});

test("chooseSnapshot prefers the requested date and otherwise the newest", () => {
  const pioneer = formatById("pioneer");
  assert.equal(chooseSnapshot(pioneer, "2026-09-18").date, "2026-09-18");
  assert.equal(chooseSnapshot(pioneer, "2026-11-05").sampleSize, 1390);
  assert.equal(chooseSnapshot(pioneer, "1999-01-01").date, "2026-11-05");
  assert.equal(chooseSnapshot(pioneer, null).date, "2026-11-05");
});

test("table sort changes row order and does not follow the matchup share order", () => {
  const archetypes = snapshot("pioneer", "2026-09-18").archetypes;
  const byName = sortArchetypes(archetypes, "name-asc").map((arch) => arch.name);
  assert.equal(byName[0], "Amalia Combo");
  assert.equal(byName[byName.length - 1], "Rakdos Midrange");
  const byShare = sortArchetypes(archetypes, "share-desc").map((arch) => arch.id);
  assert.equal(byShare[0], "izzet-phoenix");
  const grid = buildMatchupGrid(archetypes);
  assert.equal(grid.decks[0].id, "izzet-phoenix");
});

test("rendered names are Goldfish links and rows are not buttons", () => {
  const html = renderArchetypeRows(snapshot("pioneer", "2026-11-05").archetypes, "share-desc");
  assert.match(
    html,
    /<a class="arch-name" href="https:\/\/www\.mtggoldfish\.com\/archetype\/pioneer-rakdos-midrange" target="_blank" rel="noopener noreferrer">Rakdos Midrange<\/a>/
  );
  assert.match(
    html,
    /href="https:\/\/www\.mtggoldfish\.com\/archetype\/izzet-phoenix-57eb17e3-2b71-4301-99a6-45002ffcfadb"/
  );
  assert.match(
    html,
    /href="https:\/\/www\.mtggoldfish\.com\/archetype\/pioneer-abzan-amalia-combo\/decks"/
  );
  assert.equal(html.includes('role="button"'), false);
  assert.equal(html.includes("tabindex"), false);
  assert.match(html, /data-id="rakdos-midrange"/);
  const sorted = renderArchetypeRows(snapshot("pioneer", "2026-09-18").archetypes, "name-asc");
  assert.ok(sorted.indexOf("Amalia Combo") < sorted.indexOf("Boros Convoke"));
  assert.ok(sorted.indexOf("data-id=\"amalia-combo\"") < sorted.indexOf("data-id=\"izzet-phoenix\""));
});

test("grid cell is the row deck's win rate against the column deck", () => {
  const grid = buildMatchupGrid(snapshot("standard", "2026-11-05").archetypes);
  assert.equal(cell(grid, "domain-ramp", "azorius-control").value, 46.5);
  assert.equal(cell(grid, "azorius-control", "domain-ramp").value, 53.5);
  assert.equal(cell(grid, "domain-ramp", "domain-ramp").kind, "mirror");

  const earlier = buildMatchupGrid(snapshot("standard", "2026-09-18").archetypes);
  assert.notEqual(
    cell(earlier, "domain-ramp", "azorius-control").value,
    cell(grid, "domain-ramp", "azorius-control").value
  );
  assert.equal(cell(earlier, "domain-ramp", "domain-ramp").kind, "mirror");

  const pioneer = buildMatchupGrid(snapshot("pioneer", "2026-11-05").archetypes);
  assert.equal(cell(pioneer, "rakdos-midrange", "izzet-phoenix").value, 56.4);
  assert.equal(cell(pioneer, "izzet-phoenix", "rakdos-midrange").value, 43.6);

  const modern = buildMatchupGrid(snapshot("modern", "2026-11-05").archetypes);
  assert.equal(cell(modern, "living-end", "iw-control").value, 58.8);
  assert.equal(cell(modern, "iw-control", "living-end").value, 41.2);
});

test("rendered grid shows JSON percents, mirrors, and row versus column", () => {
  const html = renderMatchupTable(snapshot("standard", "2026-11-05").archetypes);
  assert.match(html, /class="matchup-corner"[\s\S]*Row[\s\S]*vs[\s\S]*Column/);
  assert.match(html, /row versus column/i);
  assert.match(html, /not historical tournament results/i);
  assert.match(html, /data-row="domain-ramp" data-col="azorius-control"[^>]*>46\.5%/);
  assert.match(html, /data-row="azorius-control" data-col="domain-ramp"[^>]*>53\.5%/);
  assert.match(html, /data-row="domain-ramp" data-col="domain-ramp"[^>]*>Mirror</);

  const earlier = renderMatchupTable(snapshot("pioneer", "2026-09-18").archetypes);
  const phoenix = snapshot("pioneer", "2026-09-18").archetypes.find((arch) => arch.id === "izzet-phoenix");
  const rate = phoenix.matchups["rakdos-midrange"].toFixed(1);
  assert.match(earlier, new RegExp(`data-row="izzet-phoenix" data-col="rakdos-midrange"[^>]*>${rate}%`));
  assert.doesNotMatch(earlier, /data-row="izzet-phoenix" data-col="rakdos-midrange"[^>]*>43\.6%/);
});

test("render escapes names and marks missing rates", () => {
  const html = renderMatchupTable([
    { id: "a", name: `<A & "B">`, share: 1, colors: ["U"], matchups: { b: 60 } },
    { id: "b", name: "Bee", share: 2, colors: ["R"], matchups: {} },
  ]);
  assert.equal(html.includes("<A"), false);
  assert.match(html, /&lt;A &amp; &quot;B&quot;&gt;/);
  assert.match(html, /class="matchup-cell wr-high" data-row="a" data-col="b"/);
  assert.match(html, />60\.0%</);
  assert.match(html, /data-row="b" data-col="a"[^>]*>—</);
});

test("win-rate bands and formatting match the legend", () => {
  assert.equal(rateBand(56), "wr-high");
  assert.equal(rateBand(52), "wr-up");
  assert.equal(rateBand(50), "wr-even");
  assert.equal(rateBand(48), "wr-down");
  assert.equal(rateBand(44), "wr-low");
  assert.equal(formatWinRate(46.5), "46.5%");
});

test("the page has a date filter and no search field or detail panel", () => {
  assert.equal(indexHtml.includes('id="search"'), false);
  assert.equal(indexHtml.includes('id="detail"'), false);
  assert.match(indexHtml, /id="snapshot"/);
  assert.match(indexHtml, /Sample snapshot/);
  assert.equal(appJs.includes("renderDetail"), false);
  assert.equal(appJs.includes("state.query"), false);
  assert.equal(appJs.includes('role="button"'), false);
  assert.match(appJs, /snapshotDate/);
});
