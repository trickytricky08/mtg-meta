/**
 * Refresh data/meta.json and data/tournaments.json from MTGGoldfish.
 *
 * Metagame: the same paper snapshot as commit e73ab478. For Standard, Modern,
 * and Pioneer, open the full metagame page and submit its
 * "Show decks from the last" form (7, 14, 30, 90) to /metagame/re_sort.
 * That form posts full=1 and type=paper. The response is a turbo-stream of
 * the complete archetype list; pagination links on the HTML page stay on the
 * default window, so they are not followed. Names, shares, deck counts, and
 * archetype URLs come from the paper tile. Win rates and matchups stay demo
 * fillers because those pages do not publish them.
 *
 * Tournaments: the recent events on each format's tournament list, then each
 * event page's Place / Deck / Pilot table. At most 10 events per format.
 *
 * Requests are sequential, with a pause between them.
 */

import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { withChrome } from "./browser.mjs";
import {
  buildTournamentFile,
  buildWindow,
  parseMetagameTiles,
  parseTournamentIndex,
  parseTournamentPage,
  refreshMeta,
  toTournamentEvent,
} from "./parse.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const FORMATS = ["standard", "modern", "pioneer"];
const PERIODS = [7, 14, 30, 90];
const MAX_EVENTS_PER_FORMAT = 10;
const REQUEST_GAP_MS = 1500;
const MIN_SHARE = 1.2;

let lastRequestAt = 0;

async function pause() {
  const remaining = REQUEST_GAP_MS - (Date.now() - lastRequestAt);
  if (remaining > 0) await sleep(remaining);
  lastRequestAt = Date.now();
}

async function openPage(page, url, readyExpression) {
  await pause();
  console.log(`GET ${url}`);
  await page.navigate(url);
  const started = Date.now();
  while (Date.now() - started < 35000) {
    await sleep(500);
    try {
      const ready = await page.evaluate(`(() => {
        const title = document.title || "";
        if (/just a moment/i.test(title)) return false;
        return Boolean(${readyExpression});
      })()`);
      if (ready) return;
    } catch {
      // The document is still navigating.
    }
  }
  throw new Error(`Timed out loading ${url}`);
}

async function readWindow(page, format, days) {
  await pause();
  console.log(`POST /metagame/re_sort ${format} ${days}d`);
  const html = await page.evaluate(
    `(async () => {
      const form = document.querySelector("form[action='/metagame/re_sort']");
      if (!form) throw new Error("re_sort form missing");
      const data = new FormData(form);
      data.set("period", "${days}");
      data.set("type", "paper");
      const token = document.querySelector("meta[name='csrf-token']")?.content || "";
      const res = await fetch("/metagame/re_sort", {
        method: "POST",
        body: data,
        credentials: "same-origin",
        headers: {
          Accept: "text/vnd.turbo-stream.html, text/html, application/xhtml+xml",
          "X-CSRF-Token": token,
        },
      });
      const text = await res.text();
      if (!res.ok) throw new Error("re_sort ${format} ${days} HTTP " + res.status);
      const match = text.match(/target="metagame-decks-container"[\\s\\S]*?<template>([\\s\\S]*)<\\/template>\\s*<\\/turbo-stream>/);
      if (!match) throw new Error("re_sort ${format} ${days} had no metagame stream");
      return match[1];
    })()`,
    30000
  );
  const tiles = parseMetagameTiles(html);
  if (tiles.length < 5) {
    throw new Error(`${format} ${days}-day metagame parsed ${tiles.length} archetypes`);
  }
  const window = buildWindow(days, tiles, MIN_SHARE);
  const leader = window.archetypes[0];
  console.log(
    `  ${format} ${days}d: ${window.archetypes.length} archetypes, ${window.sampleSize} decks, leader ${leader.name} ${leader.share}%`
  );
  return window;
}

function writeJson(file, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, text);
  renameSync(temporary, file);
}

async function main() {
  const retrieved = new Date().toISOString().slice(0, 10);
  const existing = JSON.parse(readFileSync(join(root, "data/meta.json"), "utf8"));
  if (existing.display?.minShare !== MIN_SHARE) {
    throw new Error("meta.json display.minShare changed; refusing to refresh");
  }

  const windowsByFormat = {};
  const events = [];

  await withChrome(async (page) => {
    for (const format of FORMATS) {
      await openPage(
        page,
        `https://www.mtggoldfish.com/metagame/${format}/full#paper`,
        `document.readyState === "complete" && document.querySelector("form[action=\\"/metagame/re_sort\\"]") && document.querySelector("meta[name=\\"csrf-token\\"]")`
      );
      const windows = [];
      for (const days of PERIODS) {
        windows.push(await readWindow(page, format, days));
      }
      windowsByFormat[format] = windows;
    }

    for (const format of FORMATS) {
      await openPage(
        page,
        `https://www.mtggoldfish.com/tournaments/${format}#paper`,
        `document.querySelector(".tournaments-recent-events")`
      );
      const indexHtml = await page.evaluate(
        `document.querySelector(".tournaments-recent-events").outerHTML`
      );
      const listed = parseTournamentIndex(indexHtml).slice(0, MAX_EVENTS_PER_FORMAT);
      if (listed.length === 0) throw new Error(`No recent ${format} tournaments found`);
      console.log(`${format}: ${listed.length} recent events`);
      for (const item of listed) {
        await openPage(
          page,
          item.goldfishUrl,
          `document.querySelector("table.table-tournament")`
        );
        const html = await page.evaluate("document.documentElement.outerHTML");
        const parsed = parseTournamentPage(html);
        events.push(toTournamentEvent(parsed, item.id));
      }
    }
  });

  const meta = refreshMeta(existing, windowsByFormat, retrieved);
  const tournaments = buildTournamentFile(events, retrieved);
  writeJson(join(root, "data/meta.json"), meta);
  writeJson(join(root, "data/tournaments.json"), tournaments);
  console.log(
    `Wrote meta.json (${retrieved}) and ${tournaments.events.length} tournaments.`
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
