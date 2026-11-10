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
index.html         # App shell
css/styles.css     # Dark Magic-inspired UI
js/app.js          # Format, trailing window, and shared sort
js/matchup.js      # Share cutoff, ordering, table rows, matchup grid
data/meta.json     # Paper metagame windows
data/tournaments.json # Recent Goldfish tournament results
scripts/goldfish/  # Metagame and tournament scraper
.github/workflows/goldfish-data.yml # Weekly refresh
tests/meta.test.js # Data integrity, cutoff, and grid tests
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

`goldfishUrl` points at `https://www.mtggoldfish.com/archetype/...` with no extra hash. The header stamp and the note under the date control name the source and mark win rates and matchups as demo.

## Tournament results

`data/tournaments.json` is the recent Standard, Modern, and Pioneer events from the MTGGoldfish tournament lists. Each event has the name, format, and date Goldfish printed, a `top8` list (shorter when the page lists fewer than eight decks), and an `archetypeBreakdown` counted from those deck labels. `winner` is set only when Goldfish marks a deck `1st`, and includes the player when that column is present. League pages usually show records such as `5 - 0` for several players and no single winner, so `winner` is omitted there. Deck labels are copied as printed, including color codes such as `UB`. `goldfishUrl` points at the tournament or deck page Goldfish linked.

## Weekly refresh

`.github/workflows/goldfish-data.yml` runs at 06:17 UTC every Sunday (`17 6 * * 0`) and can be started by hand with `workflow_dispatch`. It refreshes `data/meta.json` and `data/tournaments.json`, then commits only when one of those files changed. The job has `contents: write` and no other permission. GitHub runs scheduled workflows only from the default branch, so the Sunday run starts after this workflow is on `main`.

## Assumptions

- “Paper” is the tabletop metagame, not the MTGO (`online`) one.
- Goldfish's published shares can add to a few tenths away from 100 because of rounding.
- `sampleSize` counts the decks attached to the archetypes Goldfish listed for that window. It is not a separate tournament-count API.
- Single-page app; no backend or build step.
- The archetype table stacks into cards on a narrow screen. The matchup grid scrolls sideways, with the row names kept in view.
