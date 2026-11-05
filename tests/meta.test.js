const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildMatchupGrid,
  formatWinRate,
  rateBand,
  renderMatchupTable,
} = require("../js/matchup.js");

const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/meta.json"), "utf8")
);

const ARCH_FIELDS = [
  "id",
  "name",
  "colors",
  "share",
  "winRate",
  "trend",
  "trendLabel",
  "description",
  "highlights",
  "sideboardNotes",
  "matchups",
];
const MANA = new Set(["W", "U", "B", "R", "G", "C"]);
const TRENDS = new Set(["up", "down", "stable"]);

function formatById(id) {
  const fmt = data.formats.find((entry) => entry.id === id);
  assert.ok(fmt, id);
  return fmt;
}

function cell(grid, rowId, colId) {
  const row = grid.decks.findIndex((deck) => deck.id === rowId);
  const col = grid.decks.findIndex((deck) => deck.id === colId);
  assert.ok(row >= 0 && col >= 0, `${rowId} vs ${colId}`);
  return grid.cells[row][col];
}

test("dataset lists Standard, Modern, and Pioneer as sample metas", () => {
  assert.deepEqual(
    data.formats.map((fmt) => fmt.id),
    ["standard", "modern", "pioneer"]
  );
  assert.deepEqual(
    data.formats.map((fmt) => fmt.name),
    ["Standard", "Modern", "Pioneer"]
  );
  assert.match(data.updated, /^\d{4}-\d{2}-\d{2}$/);
});

test("existing Standard and Modern archetypes are still present", () => {
  assert.deepEqual(
    formatById("standard").archetypes.map((arch) => arch.id),
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
    formatById("modern").archetypes.map((arch) => arch.id),
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
});

test("every archetype uses the shared demo fields", () => {
  for (const fmt of data.formats) {
    assert.ok(fmt.description.length > 20, fmt.id);
    assert.ok(fmt.archetypes.length >= 6, fmt.id);
    const ids = new Set();
    for (const arch of fmt.archetypes) {
      for (const key of ARCH_FIELDS) {
        assert.ok(
          arch[key] !== undefined && arch[key] !== "",
          `${fmt.id}/${arch.id || "?"} missing ${key}`
        );
      }
      assert.equal(typeof arch.id, "string");
      assert.ok(!ids.has(arch.id), `${fmt.id} duplicate ${arch.id}`);
      ids.add(arch.id);
      assert.ok(Array.isArray(arch.colors) && arch.colors.length > 0);
      for (const color of arch.colors) assert.ok(MANA.has(color), color);
      assert.ok(arch.share > 0 && arch.share <= 100);
      assert.ok(arch.winRate > 0 && arch.winRate < 100);
      assert.ok(TRENDS.has(arch.trend));
      assert.equal(typeof arch.trendLabel, "string");
      assert.ok(arch.description.length > 40, arch.id);
      assert.ok(arch.sideboardNotes.length > 20, arch.id);
      assert.ok(arch.highlights.length >= 4, arch.id);
      for (const card of arch.highlights) {
        assert.equal(typeof card.name, "string");
        assert.ok(card.name.length > 0);
        assert.ok(Number.isInteger(card.count) && card.count > 0);
        assert.equal(typeof card.role, "string");
        assert.ok(card.role.length > 0);
      }
    }
  }
});

test("Pioneer entries include highlights and sideboard notes", () => {
  const pioneer = formatById("pioneer");
  const names = pioneer.archetypes.map((arch) => arch.name);
  for (const name of [
    "Rakdos Midrange",
    "Izzet Phoenix",
    "Azorius Control",
    "Mono-Green Devotion",
    "Amalia Combo",
    "Boros Convoke",
  ]) {
    assert.ok(names.includes(name), name);
  }
  for (const arch of pioneer.archetypes) {
    assert.ok(arch.highlights.length >= 6, arch.id);
    assert.ok(arch.sideboardNotes.length > 40, arch.id);
  }
});

test("matchup matrix is complete and each pair sums to 100", () => {
  for (const fmt of data.formats) {
    const ids = fmt.archetypes.map((arch) => arch.id);
    for (const arch of fmt.archetypes) {
      assert.deepEqual(
        Object.keys(arch.matchups).sort(),
        ids.filter((id) => id !== arch.id).sort(),
        `${fmt.id}/${arch.id} matchup keys`
      );
      for (const [opponentId, rate] of Object.entries(arch.matchups)) {
        assert.equal(typeof rate, "number", `${arch.id} vs ${opponentId}`);
        assert.ok(rate > 0 && rate < 100);
        const opponent = fmt.archetypes.find((entry) => entry.id === opponentId);
        const reverse = opponent.matchups[arch.id];
        assert.ok(
          Math.abs(rate + reverse - 100) < 1e-6,
          `${fmt.id}: ${arch.id} ${rate} vs ${opponentId} ${reverse}`
        );
      }
    }
  }
});

test("grid cell is the row deck's win rate against the column deck", () => {
  const grid = buildMatchupGrid(formatById("standard").archetypes);
  assert.deepEqual(
    grid.decks.map((deck) => deck.id),
    [
      "domain-ramp",
      "azorius-control",
      "boros-aggro",
      "dimir-midrange",
      "golgari-midrange",
      "izzet-prowess",
    ]
  );
  assert.equal(cell(grid, "domain-ramp", "azorius-control").value, 46.5);
  assert.equal(cell(grid, "azorius-control", "domain-ramp").value, 53.5);
  assert.notEqual(
    cell(grid, "domain-ramp", "azorius-control").value,
    cell(grid, "azorius-control", "domain-ramp").value
  );
  assert.equal(cell(grid, "domain-ramp", "domain-ramp").kind, "mirror");
  assert.equal(cell(grid, "boros-aggro", "izzet-prowess").value, 48.8);
  assert.equal(cell(grid, "izzet-prowess", "boros-aggro").value, 51.2);
});

test("Pioneer and Modern grids follow the same row-versus-column JSON values", () => {
  const pioneer = buildMatchupGrid(formatById("pioneer").archetypes);
  assert.equal(cell(pioneer, "rakdos-midrange", "izzet-phoenix").value, 56.4);
  assert.equal(cell(pioneer, "izzet-phoenix", "rakdos-midrange").value, 43.6);
  assert.equal(cell(pioneer, "boros-convoke", "azorius-control").value, 39.8);
  assert.equal(cell(pioneer, "azorius-control", "boros-convoke").value, 60.2);
  assert.equal(cell(pioneer, "amalia-combo", "amalia-combo").kind, "mirror");

  const modern = buildMatchupGrid(formatById("modern").archetypes);
  assert.equal(cell(modern, "living-end", "iw-control").value, 58.8);
  assert.equal(cell(modern, "iw-control", "living-end").value, 41.2);
  assert.equal(cell(modern, "rakdos-scam", "rakdos-scam").kind, "mirror");
});

test("share order is stable and ignores input order", () => {
  const modern = formatById("modern").archetypes;
  const forward = buildMatchupGrid(modern);
  const reversed = buildMatchupGrid([...modern].reverse());
  assert.deepEqual(
    reversed.decks.map((deck) => deck.id),
    forward.decks.map((deck) => deck.id)
  );
  assert.equal(reversed.cells[0][1].value, forward.cells[0][1].value);

  const tied = buildMatchupGrid([
    { id: "z", name: "Zed", share: 10, matchups: { a: 50 } },
    { id: "a", name: "Ada", share: 10, matchups: { z: 50 } },
  ]);
  assert.deepEqual(
    tied.decks.map((deck) => deck.id),
    ["a", "z"]
  );
});

test("rendered grid shows JSON percents, mirrors, and row versus column", () => {
  const html = renderMatchupTable(formatById("standard").archetypes);
  assert.match(html, /class="matchup-corner"[\s\S]*Row[\s\S]*vs[\s\S]*Column/);
  assert.match(html, /row versus column/i);
  assert.match(html, /not live tournament results/i);
  assert.match(
    html,
    /data-row="domain-ramp" data-col="azorius-control"[^>]*>46\.5%/
  );
  assert.match(
    html,
    /data-row="azorius-control" data-col="domain-ramp"[^>]*>53\.5%/
  );
  assert.match(
    html,
    /data-row="domain-ramp" data-col="domain-ramp"[^>]*title="Mirror">Mirror</
  );
  assert.match(html, /title="Domain Ramp vs Azorius Control: 46\.5%"/);

  const pioneerHtml = renderMatchupTable(formatById("pioneer").archetypes);
  assert.match(
    pioneerHtml,
    /data-row="rakdos-midrange" data-col="izzet-phoenix"[^>]*>56\.4%/
  );
  assert.match(
    pioneerHtml,
    /data-row="izzet-phoenix" data-col="rakdos-midrange"[^>]*>43\.6%/
  );
  assert.match(pioneerHtml, /data-row="amalia-combo" data-col="amalia-combo"[^>]*>Mirror</);
});

test("render escapes names and marks missing rates", () => {
  const html = renderMatchupTable([
    {
      id: "a",
      name: `<A & "B">`,
      share: 1,
      colors: ["U"],
      matchups: { b: 60 },
    },
    { id: "b", name: "Bee", share: 2, colors: ["R"], matchups: {} },
  ]);
  assert.equal(html.includes("<A"), false);
  assert.match(html, /&lt;A &amp; &quot;B&quot;&gt;/);
  assert.match(html, /class="matchup-cell wr-high" data-row="a" data-col="b"/);
  assert.match(html, />60\.0%</);
  assert.match(html, /data-row="b" data-col="a"[^>]*>—</);
  assert.match(html, /class="mana-pip U"/);
});

test("a stored self matchup does not replace the mirror cell", () => {
  const grid = buildMatchupGrid([
    { id: "a", name: "A", share: 1, matchups: { a: 99, b: 10 } },
    { id: "b", name: "B", share: 3, matchups: { a: 90 } },
  ]);
  assert.equal(cell(grid, "a", "a").kind, "mirror");
  assert.equal(cell(grid, "a", "b").value, 10);
  assert.equal(cell(grid, "b", "a").value, 90);
});

test("win-rate bands and formatting match the legend", () => {
  assert.equal(rateBand(56), "wr-high");
  assert.equal(rateBand(55.9), "wr-up");
  assert.equal(rateBand(52), "wr-up");
  assert.equal(rateBand(51.9), "wr-even");
  assert.equal(rateBand(48.1), "wr-even");
  assert.equal(rateBand(48), "wr-down");
  assert.equal(rateBand(44.1), "wr-down");
  assert.equal(rateBand(44), "wr-low");
  assert.equal(formatWinRate(46.5), "46.5%");
  assert.equal(formatWinRate(50), "50.0%");
});

test("an empty archetype list renders an empty state", () => {
  assert.match(renderMatchupTable([]), /No archetypes in this format/);
  assert.deepEqual(buildMatchupGrid(null), { decks: [], cells: [] });
});
