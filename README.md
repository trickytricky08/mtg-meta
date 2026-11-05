# MTG Meta

Local prototype for browsing Magic: The Gathering format metas — archetype share, win rate, trend, a row-versus-column matchup grid, and a link to each deck on MTGGoldfish.

The numbers are **sample snapshots**, not historical tournament results and not a live scrape.

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

### Alternate ports / servers

```bash
python3 -m http.server 8000
npx --yes serve -l 8765
```

### Tests

```bash
node --test
# or
npm test
```

The tests check snapshot shape, Goldfish URLs, matchup orientation, table sorting, and that the page no longer has search or a detail panel.

## Features

1. **Format picker** — Standard, Modern, and Pioneer
2. **Date filter** — each format has explicit sample snapshots. The newest is the current demo slice. Choosing an earlier date updates the archetype table and the matchup grid together.
3. **Meta table** — archetype name, share %, win rate, trend. Names are links. Rows are not buttons and do not open a summary.
4. **Sort** — the table by popularity, win rate, or name. The matchup grid stays ordered by meta share.
5. **Matchup grid** — each cell is the **row** deck's sample win rate against the **column** deck. Diagonal cells are mirrors.
6. **MTGGoldfish links** — each archetype name opens that deck's Goldfish archetype or decklist page in a new tab.

## Project layout

```
index.html         # App shell
css/styles.css     # Dark Magic-inspired UI
js/app.js          # Format, snapshot date, and sort
js/matchup.js      # Snapshot selection, table rows, matchup grid
data/meta.json     # Sample snapshots
tests/meta.test.js # Data integrity, links, and grid tests
README.md          # This file
```

## Sample snapshots

`data/meta.json` is shaped so a later live refresh can replace `formats[].snapshots` without changing the page.

Each format has a `snapshots` array, newest first. A snapshot has:

- `date` — `YYYY-MM-DD`
- `sampleSize` — invented deck count for that slice
- `archetypes` — the decks in that slice

Each archetype has `id`, `name`, `colors`, `share`, `winRate`, `trend` (`up` | `down` | `stable`), `trendLabel`, `goldfishUrl`, and `matchups`.

`matchups` is keyed by the other archetype ids in that snapshot. The value is **this deck's** win rate against that opponent. Do not store a self entry; the grid draws the diagonal as a mirror. In this sample set the two directions of a pair add up to 100. Real events include draws and are not represented here.

`goldfishUrl` is a verified `https://www.mtggoldfish.com/archetype/...` page. Two archetype roots currently redirect to the wrong metagame, so those links use the working decklist URL instead:

- Modern Rakdos Scam → `/archetype/modern-rakdos-scam/decks`
- Pioneer Amalia Combo → `/archetype/pioneer-abzan-amalia-combo/decks` (Goldfish's name is Abzan Amalia Combo)

Goldfish also uses a different public name for two decks that are the same archetype:

- Standard Domain Ramp → `/archetype/standard-domain-dmu` (titled Domain; Leyline Binding and Atraxa)
- Pioneer Mono-Green Devotion → `/archetype/pioneer-nykthos-ramp` (titled Nykthos Ramp)
- Modern Izzet Wizard Control → `/archetype/modern-izzet-control` (titled Izzet Control; includes Snapcaster Mage)

The short `/archetype/izzet-phoenix` page is not Pioneer, so Phoenix uses the Pioneer metagame slug. `/archetype/domain` is Penny Dreadful, so it is not used.

## Assumptions

- Shares, win rates, matchups, and sample sizes are invented. Only the Goldfish links were checked against the live site.
- Single-page app; no backend or build step.
- The archetype table stacks into cards on a narrow screen. The matchup grid scrolls sideways, with the row names kept in view.
