const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  eventType,
  eventTypesIn,
  knownPlayerCount,
  normalizeFormat,
  normalizeType,
  listEvents,
  orderFinishers,
  normalizeBracket,
  hasBracket,
  renderEventRows,
  renderBracket,
  renderDrawer,
} = require("../js/tournaments.js");

const root = path.join(__dirname, "..");
const data = JSON.parse(fs.readFileSync(path.join(root, "data/tournaments.json"), "utf8"));
const fixture = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/bracket-event.json"), "utf8"));
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const pageHtml = fs.readFileSync(path.join(root, "tournaments.html"), "utf8");
const pageJs = fs.readFileSync(path.join(root, "js/tournaments-page.js"), "utf8");

function rowChunk(html, id) {
  const match = html.match(new RegExp(`<tr class="event-row[\\s\\S]*?data-event-id="${id}"[\\s\\S]*?</tr>`));
  assert.ok(match, id);
  return match[0];
}

test("event type comes from the name, and player count stays optional", () => {
  assert.equal(eventType({ name: "Modern Challenge 32 2026-11-09" }), "Challenge");
  assert.equal(eventType({ name: "Pioneer League 2026-11-09" }), "League");
  assert.equal(eventType({ name: "Savior of Pioneer Qualifier #11 - Final Qualifier" }), "Qualifier");
  assert.equal(eventType({ name: "Pioneer Preliminary" }), "Preliminary");
  assert.equal(eventType({ name: "Showcase Open" }), "Showcase");
  assert.equal(eventType({ name: "11 AM Modern CASH Tournament" }), "Other");
  assert.equal(eventType({}), "Other");
  assert.deepEqual(eventTypesIn([
    { name: "Modern League" },
    { name: "Modern Challenge" },
    { name: "Modern League" },
  ]), ["Challenge", "League"]);
  assert.equal(knownPlayerCount({ playerCount: 32 }), 32);
  assert.equal(knownPlayerCount({ playerCount: "18" }), 18);
  assert.equal(knownPlayerCount({}), null);
  assert.equal(knownPlayerCount({ playerCount: "32 players" }), null);
  assert.equal(knownPlayerCount({ playerCount: -1 }), null);
  assert.equal(knownPlayerCount({ playerCount: 32.5 }), null);
  assert.equal(knownPlayerCount({ name: "Modern Challenge 32" }), null);
});

test("format and type query values fall back cleanly", () => {
  assert.equal(normalizeFormat("Pioneer"), "pioneer");
  assert.equal(normalizeFormat("legacy"), "standard");
  assert.equal(normalizeFormat(""), "standard");
  assert.equal(normalizeType("league", ["Challenge", "League"]), "League");
  assert.equal(normalizeType("all", ["League"]), "");
  assert.equal(normalizeType("vintage", ["League"]), "");
});

test("the list is newest first and does not mutate the file order", () => {
  const original = data.events.map((event) => event.id);
  const listed = listEvents(data.events, { format: "standard" });
  assert.deepEqual(data.events.map((event) => event.id), original);
  assert.ok(listed.length > 0);
  assert.ok(listed.every((event) => event.format === "standard"));
  for (let index = 1; index < listed.length; index += 1) {
    assert.ok(listed[index - 1].date >= listed[index].date);
  }
  const challenges = listEvents(data.events, { format: "modern", type: "Challenge" });
  assert.ok(challenges.length > 0);
  assert.ok(challenges.every((event) => eventType(event) === "Challenge"));
  const ranged = listEvents(data.events, { format: "standard", from: "2026-11-08", to: "2026-11-08" });
  assert.ok(ranged.length > 0);
  assert.ok(ranged.every((event) => event.date === "2026-11-08"));
  assert.deepEqual(listEvents(data.events, { format: "standard", from: "2026-11-09", to: "2026-11-01" }), []);
  const sameDay = listEvents([
    { id: "2", name: "Bravo", format: "modern", date: "2026-11-09" },
    { id: "1", name: "Alpha", format: "modern", date: "2026-11-09" },
    { id: "3", name: "Alpha", format: "pioneer", date: "2026-11-10" },
  ], { format: "modern" });
  assert.deepEqual(sameDay.map((event) => event.id), ["1", "2"]);
});

test("finishers keep source order inside a place, a band, or a record", () => {
  assert.deepEqual(orderFinishers([
    { place: "5th-8th", player: "d" },
    { place: "1st", player: "a" },
    { place: "3rd-4th", player: "c" },
    { place: "3rd-4th", player: "b" },
    { place: "2", player: "e" },
  ]).map((row) => row.player), ["a", "e", "c", "b", "d"]);
  assert.deepEqual(orderFinishers([
    { place: "3 - 1", player: "c" },
    { place: "5 - 0", player: "a" },
    { place: "5 - 0", player: "b" },
    { place: "4 - 0", player: "d" },
    { place: "2-2", player: "e" },
  ]).map((row) => row.player), ["a", "b", "d", "c", "e"]);
});

test("bracket normalization keeps QF, SF, and F and drops a broken match", () => {
  const normalized = normalizeBracket({
    rounds: [
      { round: "final", matches: fixture.bracket.rounds[2].matches },
      { id: "quarterfinals", matches: [{ players: [{ player: "only" }] }] },
      { round: "SF", matches: fixture.bracket.rounds[1].matches },
    ],
  });
  assert.deepEqual(normalized.rounds.map((round) => round.id), ["SF", "F"]);
  assert.equal(normalizeBracket(null), null);
  assert.equal(normalizeBracket({ rounds: [] }), null);
  assert.equal(hasBracket({}), false);
  assert.equal(hasBracket(fixture), true);
  const inferred = normalizeBracket({
    rounds: [{
      round: "F",
      matches: [{
        players: [
          { player: "Ada", archetype: "Domain", wins: 2, losses: 1 },
          { player: "Bea", archetype: "Red", wins: 1, losses: 2 },
        ],
      }],
    }],
  });
  assert.equal(inferred.rounds[0].matches[0].winner, "Ada");
});

test("rows show a bracket chip and a player count only when the event has them", () => {
  const league = data.events.find((event) => event.id === "67902");
  const html = renderEventRows([league, fixture], fixture.id);
  const leagueRow = rowChunk(html, league.id);
  const fixtureRow = rowChunk(html, fixture.id);
  assert.equal(leagueRow.includes("bracket-chip"), false);
  assert.match(leagueRow, /Player count not published/);
  assert.match(fixtureRow, /class="bracket-chip">Bracket</);
  assert.match(fixtureRow, /event-players[^>]*>32</);
  assert.match(fixtureRow, /aria-current="true"/);
  assert.equal(html.includes("<script"), false);
});

test("the drawer prints places as given and says when the bracket is missing", () => {
  const challenge = data.events.find((event) => event.id === "67904");
  const drawer = renderDrawer(challenge);
  assert.match(drawer, /Bracket not available for this event/);
  assert.equal(drawer.includes("bracket-round"), false);
  assert.match(drawer, /Selesnya Landfall/);
  assert.match(drawer, /KillTheDrake/);
  assert.match(drawer, /target="_blank"/);
  assert.match(drawer, new RegExp(challenge.top8[0].goldfishUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(drawer, /source-link/);
  const places = [...drawer.matchAll(/class="finish-place">([^<]*)</g)].map((match) => match[1]);
  assert.deepEqual(places, orderFinishers(challenge.top8).map((row) => row.place));

  const league = renderDrawer({
    id: "league",
    name: "Modern League",
    format: "modern",
    date: "2026-11-09",
    goldfishUrl: "https://www.mtggoldfish.com/tournament/1",
    top8: [
      { place: "5 - 0", archetype: "Yawgmoth", player: "A", goldfishUrl: "https://www.mtggoldfish.com/deck/1" },
      { place: "4 - 1", archetype: "Tron", player: "B", goldfishUrl: "https://www.mtggoldfish.com/deck/2" },
    ],
  });
  assert.match(league, /5 - 0[\s\S]*4 - 1/);
  assert.equal(league.includes("source-link"), false);
  assert.match(league, /Bracket not available for this event/);
});

test("the fixture drawer shows who beat whom and is not in the weekly file", () => {
  for (const event of data.events) {
    assert.equal(Object.hasOwn(event, "bracket"), false);
    assert.equal(event.devFixture, undefined);
    assert.notEqual(event.id, "dev-bracket");
  }
  const drawer = renderDrawer(fixture);
  assert.equal(drawer.includes("Bracket not available for this event"), false);
  assert.match(drawer, /data-round="QF"/);
  assert.match(drawer, /data-round="SF"/);
  assert.match(drawer, /data-round="F"/);
  assert.match(drawer, /Quarterfinals/);
  assert.match(drawer, /Semifinals/);
  assert.match(drawer, /Final/);
  assert.match(drawer, /storti def\. Sarlanga <span class="bp-score">2–0<\/span>/);
  assert.match(drawer, /storti def\. niuwaid001 <span class="bp-score">2–1<\/span>/);
  assert.match(drawer, /3rd-4th/);
  assert.match(drawer, /5th-8th/);
  assert.match(drawer, /32 players/);
  assert.match(drawer, /Dev fixture/);
  const places = [...drawer.matchAll(/class="finish-place">([^<]*)</g)].map((match) => match[1]);
  assert.deepEqual(places, ["1st", "2nd", "3rd-4th", "3rd-4th", "5th-8th", "5th-8th", "5th-8th", "5th-8th"]);
  const bracketOnly = renderBracket(fixture.bracket);
  assert.match(bracketOnly, /class="bracket"/);
});

test("drawer markup escapes names and drops unsafe links", () => {
  const html = renderDrawer({
    id: "x",
    name: "<script>",
    format: "modern",
    date: "2026-11-01",
    goldfishUrl: "javascript:alert(1)",
    top8: [{
      place: "1st",
      archetype: 'A & "B"',
      player: "<p>",
      goldfishUrl: "javascript:alert(2)",
    }],
  });
  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("javascript:"), false);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /A &amp; &quot;B&quot;/);
  assert.match(html, /&lt;p&gt;/);
});

test("both pages share the Meta / Tournaments nav, and the page is not a sample banner", () => {
  function nav(html) {
    const match = html.match(/<nav class="site-nav"[\s\S]*?<\/nav>/);
    assert.ok(match);
    return match[0];
  }
  const home = nav(indexHtml);
  const page = nav(pageHtml);
  assert.match(home, /href="index.html"/);
  assert.match(home, /href="tournaments.html"/);
  assert.match(home, /aria-current="page">Meta</);
  assert.match(page, /href="index.html"/);
  assert.match(page, /href="tournaments.html"/);
  assert.match(page, /aria-current="page">Tournaments</);
  assert.equal(/sample data/i.test(pageHtml), false);
  assert.match(pageHtml, /id="date-from"/);
  assert.match(pageHtml, /id="date-to"/);
  assert.match(pageHtml, /id="event-type"/);
  assert.match(pageHtml, /id="drawer"/);
  assert.match(pageJs, /fixture=bracket/);
  assert.match(pageJs, /tests\/fixtures\/bracket-event\.json/);
  assert.equal(indexHtml.includes("js/tournaments"), false);
});
