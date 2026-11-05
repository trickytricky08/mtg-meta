# MTG Meta

Local prototype for browsing Magic: The Gathering format metas — archetypes, popularity (meta share), win rates, trends, sample card highlights, and a matchup grid.

Sample data only (Standard, Modern, and Pioneer). Not scraped from live sources, and not real tournament results.

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
# Another port
python3 -m http.server 8000

# If you prefer npx (Node installed)
npx --yes serve -l 8765
```

### Tests

```bash
node --test
# or
npm test
```

The tests check that every format, including Pioneer, has complete archetype fields, that each matchup matrix is filled in from the row deck's point of view, and that the grid markup places those values in the matching row/column cell (with `Mirror` on the diagonal).

## Features

1. **Format picker** — Standard, Modern, and Pioneer
2. **Meta overview** — archetype name, share %, win rate, trend
3. **Archetype detail** — description, maindeck highlights, sideboard notes
4. **Search** — filter the archetype table by name
5. **Sort** — the archetype table by popularity, win rate, or name
6. **Matchup grid** — for the selected format, each cell is the **row** deck's sample win rate against the **column** deck. Diagonal cells are mirrors. The grid lists every archetype in that format, ordered by meta share, and does not follow the table search or sort.

## Project layout

```
index.html         # App shell
css/styles.css     # Dark Magic-inspired UI
js/app.js          # Format, filter, sort, and detail logic
js/matchup.js      # Matchup grid model and table markup
data/meta.json     # Sample meta dataset
tests/meta.test.js # Data integrity and grid tests
README.md          # This file
```

## Editing sample data

Edit `data/meta.json`. Each format has an `archetypes` array with fields like `name`, `share`, `winRate`, `trend` (`up` | `down` | `stable`), `colors`, `highlights`, and `sideboardNotes`.

Each archetype also has a `matchups` object. Keys are the other archetype ids in that format. The value is **this deck's** win rate against that opponent, in percent. Do not store a self entry; the grid draws the diagonal as a mirror. In this sample set the two directions of a pair add up to 100 so the grid stays internally consistent. Real events include draws and are not represented here.

Refresh the browser after saving.

## Assumptions

- Stats and card lists are invented for a plausible meta feel. They are demo numbers, not scraped standings, and card legality may not match a specific tournament week.
- Single-page app; no backend or build step.
- Designed primarily for desktop. The archetype table stacks into cards on a narrow screen. The matchup grid scrolls sideways, with the row names kept in view.
