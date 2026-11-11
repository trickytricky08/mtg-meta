# MTG Meta

Local prototype for browsing Magic: The Gathering format metas — archetype share, win rate, a row-versus-column matchup grid, and a link to each deck on MTGGoldfish.

Meta share and deck counts are from the MTGGoldfish paper metagame (last 7, 14, 30, and 90 days). The snapshot date is `source.retrieved` in `data/meta.json`. Win rates and matchup cells are demo estimates. Goldfish does not publish those on the metagame pages, and they are not tournament results. Recent tournament results live in `data/tournaments.json`, separate from this page.

## Requirements

- A modern browser
- Node.js 20+ to run the tests (the page itself is static)
- Python 3 (for a one-line local server), or any static file server

> **Note:** Opening `index.html` via `file://` will fail to load `data/meta.json` in most browsers because of CORS / local file restrictions. Use a local HTTP server.

## Run locally

From the repository root:

```bash
python3 -m http.server 8765
```

Then open:

```
http://127.0.0.1:8765/
```

Stop the server with `Ctrl+C`.

### Tests

```bash
node --test
# or
npm test
```

## Features

1. **Format picker** — Standard, Modern, and Pioneer
2. **Trailing window** — “Show data for the last” 7, 14, 30, or 90 days, aligned to the right of the controls row. The default is 30 days. Changing the window updates the archetype table and the matchup grid together. The same window is kept when you switch formats.
3. **Metagame Breakdown** — archetype name, share, and win rate. Names are plain text links. The Share and Win rate headers sort this table and the matchup grid together. Only one header is active. Repeated clicks cycle that header through descending, ascending, then cleared. Clearing falls back to share, high to low, and hides both arrows. Only the active header shows ↓ or ↑. Choosing the other header clears the first and starts at descending. The page loads with Share descending. There is no separate sort menu, search box, trend column, color pips, or deck summary.
4. **Share cutoff** — a deck is included only when its sample share is at least 1.2%. At most 15 decks are included, the largest shares first. Header sorting reorders that set; it does not change which decks qualify.
5. **Matchup grid** — each cell is the **row** deck's sample win rate against the **column** deck. Diagonal cells are mirrors. Rows and columns use the same order as the table. Each row label shows the deck name and that deck's overall win rate for the selected window.
6. **MTGGoldfish links** — each archetype name opens that deck's Goldfish archetype or decklist page in a new tab.

## Project layout

```
index.html         # Metagame page
tournaments.html   # Tournament list and detail drawer
css/styles.css     # Dark Magic-inspired UI
js/app.js          # Format, trailing window, and shared sort
js/matchup.js      # Share cutoff, ordering, table rows, matchup grid
js/updated.js      # Shared data-updated label
js/tournaments.js  # Tournament filters, place order, bracket markup
js/tournaments-page.js # Tournaments page controller
data/meta.json     # Paper metagame windows
data/tournaments.json # Recent Goldfish tournament results
data/updated.json  # One updatedAt for both datasets
scripts/goldfish/  # Metagame and tournament scraper
.github/workflows/goldfish-data.yml # Weekly refresh
tests/meta.test.js # Data integrity, cutoff, and grid tests
tests/updated.test.js # Shared last-updated label
tests/tournaments.test.js # Tournament list and bracket shaping
tests/fixtures/bracket-event.json # Dev-only bracket, not loaded by default
tests/goldfish-parse.test.mjs # Scraper parsing tests
README.md          # This file
```

## Data

`data/meta.json` is a snapshot of the [MTGGoldfish paper metagame](https://www.mtggoldfish.com/metagame/) for Standard, Modern, and Pioneer. A refresh requests each format's full deck list for the last 7, 14, 30, and 90 days (the same periods as the on-page “Show decks from the last” control) and stamps `asOf` and `source.retrieved` with that UTC date. `display` still holds `minShare` (1.2), `maxArchetypes` (15), `defaultWindowDays` (30), and `windowDays`.

Each window has:

- `days` — 7, 14, 30, or 90
- `sampleSize` — the sum of the deck counts Goldfish printed next to those archetypes
- `archetypes` — every archetype Goldfish listed, including ones under 1.2% that this page hides

Each archetype has `id`, `name`, `share`, `deckCount`, `winRate`, `goldfishUrl`, and `matchups`.

What is real:

- Archetype names, meta share, deck counts, and `goldfishUrl` (the archetype link from that metagame tile).

What is still demo:

- `winRate` and every matchup cell. Those pages do not publish archetype win rates or a matchup matrix. The demo values are a stable filler so win-rate sorting and the grid still work. Pairs among decks at or above 1.2% share add up to 100. Decks under 1.2% have no matchup entries. Do not read them as measured results.

The four windows are Goldfish's own ranges, not one snapshot copied four times. Which decks clear 1.2%, and which 15 are shown, changes with the window. A short window can list fewer than 15 decks at or above 1.2%. A longer window can list more than 15, and the page then keeps the top 15.

`goldfishUrl` points at `https://www.mtggoldfish.com/archetype/...` with no extra hash. The header stamp and the note under the date control name the source and mark win rates and matchups as demo. They do not repeat a calendar date. The only "data updated" time on the Meta page and the Tournaments page is the shared stamp below.

## When the data was updated

`data/updated.json` is one timestamp for both datasets:

```json
{ "updatedAt": "2026-11-10T01:19:30.000Z" }
```

`updatedAt` is the UTC time the refresh generated `data/meta.json` and `data/tournaments.json`. The current value is the commit time of that snapshot (`2026-11-10T01:19:30Z`), not a later edit. The weekly script writes this file once per run. The timestamp stays put when both datasets are unchanged, so a no-op run does not commit. Both pages show it in the header, under the Meta / Tournaments nav, in the viewer's local time with a timezone abbreviation. If `updatedAt` is missing, the page uses the file's `Last-Modified` header. If neither is usable, the label is hidden. `asOf` and `source.retrieved` stay on the metagame snapshot as the UTC calendar date of that pull. They are not shown next to this timestamp.

## Tournament results

`data/tournaments.json` is the recent Standard, Modern, and Pioneer events from the MTGGoldfish tournament lists. `tournaments.html` reads that file on each load. A later refresh does not need a UI change. The homepage and this page share a Meta / Tournaments nav. Format tabs are Standard, Pioneer, and Modern, and `?format=` selects one (`standard`, `pioneer`, or `modern`).

The list is one row per event, newest first. Filters above the table are a date range and an event type derived from the event name (Challenge, League, Qualifier, Preliminary, Showcase, or Other). Columns are date, event name, event type, and winner archetype. A Players column is added when any event in the current list has `playerCount`. A Bracket chip is shown only on rows that include bracket data. Clicking a row opens a drawer with the top 8 in finishing order, each archetype linked to its Goldfish deck in a new tab, the player, a link to the event on Goldfish, and a source link when `sourceUrl` is present.

Each event has the name, format, and date Goldfish printed, a `top8` list (shorter when the page lists fewer than eight decks), and an `archetypeBreakdown` counted from those deck labels. `winner` is set only when Goldfish marks a deck `1st`, and includes the player when that column is present. League pages usually show records such as `5 - 0` for several players and no single winner, so `winner` is omitted there. Deck labels are copied as printed, including color codes such as `UB`. `goldfishUrl` points at the tournament or deck page Goldfish linked. Fields Goldfish did not show are omitted.

`playerCount` is optional. It is a non-negative integer, the size of the event when a source states it. The page shows an em dash when it is absent. It is not inferred from names such as "Challenge 32".

`bracket` is optional and omitted when no bracket was published. The drawer then says "Bracket not available for this event". When it is present, the drawer shows quarterfinals, semifinals, and the final: who beat whom, with game scores. No events in the weekly file have a bracket yet. `tests/fixtures/bracket-event.json` is a dev-only example used by the tests and, only when the page is opened with `?fixture=bracket`, by the drawer. It is not written into `data/tournaments.json`.

```json
{
  "bracket": {
    "rounds": [
      {
        "round": "QF",
        "matches": [
          {
            "players": [
              { "player": "Ada", "archetype": "Dimir Midrange", "wins": 2, "losses": 0 },
              { "player": "Bea", "archetype": "Living End", "wins": 1, "losses": 2 }
            ],
            "winner": "Ada"
          }
        ]
      }
    ]
  }
}
```

`round` is `QF`, `SF`, or `F`. Each match has exactly two players. `wins` and `losses` are game counts. `winner` is the `player` string of the player who won that match. A round with no matches is omitted. The page also accepts the long names (`quarterfinals`, `semifinals`, `final`) and, when `winner` is missing, treats the player with more wins as the winner.

Place text is shown as printed. Ordering understands exact places (`1st`, `2`), place bands (`3rd-4th`, `5th-8th`), and league records (`5 - 0`). The same record keeps the source order.

## Weekly refresh

`.github/workflows/goldfish-data.yml` runs at 06:17 UTC every Sunday (`17 6 * * 0`) and can be started by hand with `workflow_dispatch`. It refreshes `data/meta.json` and `data/tournaments.json`, writes `data/updated.json` when either dataset changed, then commits only when one of those files changed. The job has `contents: write` and no other permission. GitHub runs scheduled workflows only from the default branch, so the Sunday run starts after this workflow is on `main`.

## Assumptions

- “Paper” is the tabletop metagame, not the MTGO (`online`) one.
- Goldfish's published shares can add to a few tenths away from 100 because of rounding.
- `sampleSize` counts the decks attached to the archetypes Goldfish listed for that window. It is not a separate tournament-count API.
- Static pages; no backend or build step. The tournaments page is `tournaments.html`.
- The archetype table stacks into cards on a narrow screen. The matchup grid scrolls sideways, with the row names kept in view.
