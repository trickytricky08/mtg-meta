const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  PRESET_DAYS,
  presetRange,
  nearestPreset,
  inclusiveSpan,
  pickerBounds,
  clampRange,
  resolveWindow,
  metaDays,
  activeRange,
  emptyWindowMessage,
  readStoredDays,
  writeStoredDays,
  decorateNav,
  todayISO,
} = require("../js/window.js");
const { listEvents, renderEventRows } = require("../js/tournaments.js");

const root = path.join(__dirname, "..");
const TODAY = "2026-11-11";
const events = [
  { id: "early", name: "Early", format: "modern", date: "2026-11-01" },
  { id: "mid", name: "Mid", format: "modern", date: "2026-11-05" },
  { id: "late", name: "Late", format: "modern", date: "2026-11-10" },
];

function memory(initial) {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.hasOwn(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
  };
}

test("preset windows are inclusive of today and the first day", () => {
  assert.deepEqual(PRESET_DAYS, [7, 14, 30, 90]);
  assert.deepEqual(presetRange(7, TODAY), { from: "2026-11-05", to: TODAY });
  assert.equal(inclusiveSpan("2026-11-05", TODAY), 7);
  assert.deepEqual(presetRange(30, TODAY), { from: "2026-10-13", to: TODAY });
  const lastWeek = listEvents(events, { format: "modern", ...presetRange(7, TODAY) });
  assert.deepEqual(lastWeek.map((event) => event.id), ["late", "mid"]);
  const lastThirty = listEvents(events, { format: "modern", ...presetRange(30, TODAY) });
  assert.deepEqual(lastThirty.map((event) => event.id), ["late", "mid", "early"]);
});

test("custom ranges include both endpoints and reject an inverted span", () => {
  assert.deepEqual(
    listEvents(events, { format: "modern", from: "2026-11-01", to: "2026-11-05" }).map((event) => event.id),
    ["mid", "early"]
  );
  assert.deepEqual(
    listEvents(events, { format: "modern", from: "2026-11-10", to: "2026-11-10" }).map((event) => event.id),
    ["late"]
  );
  assert.deepEqual(listEvents(events, { format: "modern", from: "2026-11-10", to: "2026-11-01" }), []);
  const bounds = pickerBounds(events.map((event) => event.date), TODAY);
  assert.deepEqual(bounds, { min: "2026-11-01", max: TODAY });
  assert.deepEqual(clampRange("2026-10-01", "2026-11-20", bounds), { from: "2026-11-01", to: TODAY });
  assert.deepEqual(clampRange("2026-11-10", "2026-11-05", bounds), { from: "2026-11-05", to: "2026-11-05" });
});

test("URL windows fall back to 30, and a saved preset is used only when the URL is silent", () => {
  assert.deepEqual(resolveWindow({ search: "?days=14" }), { mode: "preset", days: 14 });
  assert.deepEqual(resolveWindow({ search: "?from=2026-11-05&to=2026-11-10" }), {
    mode: "custom",
    from: "2026-11-05",
    to: "2026-11-10",
  });
  assert.deepEqual(resolveWindow({ search: "?days=15", storedDays: 14 }), { mode: "preset", days: 30 });
  assert.deepEqual(resolveWindow({ search: "?from=2026-11-10&to=2026-11-01", storedDays: 7 }), {
    mode: "preset",
    days: 30,
  });
  assert.deepEqual(resolveWindow({ search: "?format=pioneer", storedDays: 14 }), { mode: "preset", days: 14 });
  assert.deepEqual(resolveWindow({ search: "" }), { mode: "preset", days: 30 });
  const store = memory();
  writeStoredDays(store, 14);
  writeStoredDays(store, 3);
  assert.equal(readStoredDays(store), 14);
});

test("Meta keeps a preset and snaps a custom range to the nearest length", () => {
  assert.equal(metaDays({ search: "?days=90", storedDays: 7 }), 90);
  assert.equal(metaDays({ search: "?from=2026-11-01&to=2026-11-08" }), 7);
  assert.equal(inclusiveSpan("2026-11-01", "2026-11-08"), 8);
  assert.equal(nearestPreset("2026-11-01", "2026-11-11"), 14);
  assert.equal(nearestPreset("2026-11-01", "2026-11-22"), 14);
  assert.equal(metaDays({ search: "?format=standard", storedDays: 14 }), 14);
  assert.deepEqual(activeRange({ mode: "preset", days: 14 }, TODAY), presetRange(14, TODAY));
  assert.equal(
    emptyWindowMessage({ mode: "preset", days: 14 }),
    "No events in the last 14 days."
  );
  assert.equal(
    emptyWindowMessage({ mode: "custom", from: "2026-11-10", to: "2026-11-11" }),
    "No events between 2026-11-10 and 2026-11-11."
  );
  const html = renderEventRows([], null, emptyWindowMessage({ mode: "preset", days: 7 }));
  assert.match(html, /No events in the last 7 days\./);
});

test("nav links carry the preset, and a custom range snaps only the Meta link", () => {
  const links = {};
  const doc = {
    querySelector(selector) {
      const key = selector.includes("index.html") ? "meta" : "tournaments";
      links[key] = links[key] || { setAttribute(name, value) { this[name] = value; } };
      return links[key];
    },
  };
  decorateNav(doc, { mode: "preset", days: 14, format: "pioneer" });
  assert.equal(links.meta.href, "index.html?days=14");
  assert.equal(links.tournaments.href, "tournaments.html?days=14&format=pioneer");
  decorateNav(doc, { mode: "custom", from: "2026-11-01", to: "2026-11-08", days: 30 });
  assert.equal(links.meta.href, "index.html?days=7");
  assert.equal(links.tournaments.href, "tournaments.html?from=2026-11-01&to=2026-11-08");
  assert.equal(todayISO(new Date(2026, 10, 11)), "2026-11-11");
});

test("the tournaments control matches the meta window and adds Custom", () => {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const page = fs.readFileSync(path.join(root, "tournaments.html"), "utf8");
  assert.match(page, /Show data for the last/);
  assert.match(page, /id="window"/);
  assert.match(page, /<option value="30" selected>30 days<\/option>/);
  assert.match(page, /<option value="custom">Custom…<\/option>/);
  assert.equal(index.includes("Custom"), false);
  assert.match(page, /id="custom-range" hidden/);
  assert.match(index, /js\/window\.js/);
  assert.match(page, /js\/window\.js/);
});
