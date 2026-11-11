const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  readUpdatedAt,
  parseHttpDate,
  chooseUpdatedAt,
  formatUpdatedLabel,
  mount,
} = require("../js/updated.js");

const root = path.join(__dirname, "..");
const GENERATED_AT = "2026-11-10T01:19:30.000Z";

test("the committed stamp is the generation time of the current data snapshot", () => {
  const updated = JSON.parse(fs.readFileSync(path.join(root, "data/updated.json"), "utf8"));
  assert.deepEqual(Object.keys(updated), ["updatedAt"]);
  assert.equal(updated.updatedAt, GENERATED_AT);
  assert.equal(readUpdatedAt(updated), GENERATED_AT);
  for (const file of ["meta.json", "tournaments.json"]) {
    const data = JSON.parse(fs.readFileSync(path.join(root, "data", file), "utf8"));
    assert.equal(Object.hasOwn(data, "updatedAt"), false);
  }
});

test("the field wins, Last-Modified is the fallback, and a bad response stays blank", () => {
  const header = "Tue, 10 Nov 2026 01:19:30 GMT";
  assert.equal(
    chooseUpdatedAt({
      payload: { updatedAt: "2026-11-10T01:19:30Z" },
      lastModified: "Wed, 11 Nov 2026 00:00:00 GMT",
    }),
    GENERATED_AT
  );
  assert.equal(chooseUpdatedAt({ payload: {}, lastModified: header }), GENERATED_AT);
  assert.equal(chooseUpdatedAt({ payload: { updatedAt: "2026-11-10" }, lastModified: header }), GENERATED_AT);
  assert.equal(chooseUpdatedAt({ payload: null, lastModified: "not a date" }), null);
  assert.equal(chooseUpdatedAt({}), null);
  assert.equal(parseHttpDate(""), null);
  assert.equal(readUpdatedAt({ updatedAt: "yesterday" }), null);
});

test("the label uses local time, a timezone abbreviation, and a relative hint", () => {
  const now = new Date("2026-11-12T01:19:30.000Z");
  assert.equal(
    formatUpdatedLabel(GENERATED_AT, { now, timeZone: "UTC" }),
    "Data updated Nov 10, 2026, 1:19 AM UTC · 2 days ago"
  );
  assert.equal(
    formatUpdatedLabel(GENERATED_AT, { now, timeZone: "America/New_York" }),
    "Data updated Nov 9, 2026, 8:19 PM EST · 2 days ago"
  );
  assert.equal(
    formatUpdatedLabel("2026-11-12T01:19:50.000Z", { now, timeZone: "UTC" }),
    "Data updated Nov 12, 2026, 1:19 AM UTC"
  );
  assert.equal(formatUpdatedLabel("not-a-time"), "");
});

test("mount fills the shared label and hides it when nothing is usable", async () => {
  function element() {
    return {
      hidden: true,
      textContent: "",
      dateTime: "",
      removeAttribute(name) {
        if (name === "datetime") this.dateTime = "";
      },
    };
  }

  const shown = element();
  const fromField = await mount({
    document: { getElementById: () => shown },
    fetch: async () => ({
      ok: true,
      headers: { get: () => "Wed, 11 Nov 2026 00:00:00 GMT" },
      json: async () => ({ updatedAt: GENERATED_AT }),
    }),
    now: new Date("2026-11-11T01:19:30.000Z"),
    timeZone: "UTC",
  });
  assert.equal(shown.hidden, false);
  assert.equal(fromField, "Data updated Nov 10, 2026, 1:19 AM UTC · 1 day ago");
  assert.equal(shown.dateTime, GENERATED_AT);

  const fallback = element();
  await mount({
    document: { getElementById: () => fallback },
    fetch: async () => ({
      ok: true,
      headers: { get: () => "Tue, 10 Nov 2026 01:19:30 GMT" },
      json: async () => {
        throw new Error("not json");
      },
    }),
    now: new Date("2026-11-10T01:19:30.000Z"),
    timeZone: "UTC",
  });
  assert.match(fallback.textContent, /^Data updated Nov 10, 2026, 1:19 AM UTC/);

  const hidden = element();
  await mount({
    document: { getElementById: () => hidden },
    fetch: async () => ({ ok: false, headers: { get: () => "Tue, 10 Nov 2026 01:19:30 GMT" }, json: async () => ({}) }),
    now: new Date(),
    timeZone: "UTC",
  });
  assert.equal(hidden.hidden, true);
  assert.equal(hidden.textContent, "");
});

test("both pages share one last-updated slot and do not print a second retrieval date", () => {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const tournaments = fs.readFileSync(path.join(root, "tournaments.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
  const page = fs.readFileSync(path.join(root, "js/tournaments-page.js"), "utf8");
  for (const html of [index, tournaments]) {
    assert.match(html, /<time class="last-updated" id="last-updated" hidden><\/time>/);
    assert.match(html, /js\/updated\.js/);
  }
  assert.equal(app.includes("retrieved ${source.retrieved}"), false);
  assert.equal(page.includes("retrieved ${"), false);
});
