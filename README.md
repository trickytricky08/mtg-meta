# MTG Meta

Local prototype for browsing Magic: The Gathering format metas — archetype share, win rate, a row-versus-column matchup grid, and a link to each deck on MTGGoldfish.

The numbers are **sample windows**, not historical tournament results and not a live scrape.

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
2. **Trailing window** — “Show data for the last” 7, 14, 30, or 90 days. The default is 30 days. Changing the window updates the archetype table and the matchup grid together. The same window is kept when you switch formats.
3. **Meta table** — archetype name, share, and win rate, ordered by meta share (high to low). Names are plain text links. There is no search box, sort control, trend column, color pips, or deck summary.
4. **Share cutoff** — a deck is shown only when its sample share is at least 1.2%. At most 15 decks are shown, the largest shares first. The matchup grid uses that same list.
5. **Matchup grid** — each cell is the **row** deck's sample win rate against the **column** deck. Diagonal cells are mirrors.
6. **MTGGoldfish links** — each archetype name opens that deck's Goldfish archetype or decklist page in a new tab.

## Project layout

```
index.html         # App shell
css/styles.css     # Dark Magic-inspired UI
js/app.js          # Format and trailing-window selection
js/matchup.js      # Share cutoff, table rows, matchup grid
data/meta.json     # Sample windows
tests/meta.test.js # Data integrity, cutoff, and grid tests
README.md          # This file
```

## Sample windows

`data/meta.json` is shaped so a later live refresh can replace `formats[].windows` without changing the page. `display` holds the shared rules: `minShare` (1.2), `maxArchetypes` (15), `defaultWindowDays` (30), and `windowDays`.

Each format has a `windows` array. A window has:

- `days` — 7, 14, 30, or 90
- `sampleSize` — invented deck count inside that trailing window, dated through `asOf` (`2026-11-05`)
- `archetypes` — every deck considered for that window, including ones under 1.2% that the page hides

Each archetype has `id`, `name`, `share`, `winRate`, `goldfishUrl`, and `matchups`. `matchups` is keyed by the other archetype ids in that window. The value is **this deck's** win rate against that opponent. The two directions of a pair add up to 100 in this sample set. Real events include draws and are not represented here.

The four windows are different on purpose. A short window is a small, top-heavy sample: fewer decks clear 1.2%, and the leader's share is higher. A longer window is a larger sample: more decks clear 1.2%, shares spread out, and the 90-day window has 17 decks at or above 1.2% so the page keeps only the top 15. Matchup rates also move as the window widens. Which deck leads changes with the window.

### Goldfish links

`goldfishUrl` is a checked `https://www.mtggoldfish.com/archetype/...` page. Two archetype roots redirect away, so those links use the working decklist URL:

- Modern Rakdos Scam → `/archetype/modern-rakdos-scam/decks`
- Pioneer Amalia Combo → `/archetype/pioneer-abzan-amalia-combo/decks` (Goldfish's name is Abzan Amalia Combo)

Goldfish uses a different public name for a few decks:

- Standard Domain Ramp → `/archetype/standard-domain-dmu` (titled Domain)
- Pioneer Mono-Green Devotion → `/archetype/pioneer-nykthos-ramp` (titled Nykthos Ramp)
- Modern Izzet Wizard Control → `/archetype/modern-izzet-control` (titled Izzet Control)

The short `/archetype/izzet-phoenix` page is not Pioneer. `/archetype/domain` is Penny Dreadful. Neither is used. Additional decks in the wider windows are the archetype pages linked from that format's Goldfish metagame.

## Assumptions

- Shares, win rates, matchups, and sample sizes are invented. A wider window is modeled as a larger trailing sample ending on the same as-of date, not as a separate historical event.
- Only the Goldfish links were checked against the live site.
- Single-page app; no backend or build step.
- The archetype table stacks into cards on a narrow screen. The matchup grid scrolls sideways, with the row names kept in view.
