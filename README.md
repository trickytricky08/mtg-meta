# MTG Meta

Local prototype for browsing Magic: The Gathering format metas — archetypes, popularity (meta share), win rates, trends, and sample card highlights.

Sample data only (Standard + Modern). Not scraped from live sources.

## Requirements

- A modern browser
- Python 3 (for a one-line local server), or any static file server

> **Note:** Opening `index.html` via `file://` will fail to load `data/meta.json` in most browsers because of CORS / local file restrictions. Use a local HTTP server.

## Run on this Linux box

```bash
cd /workspace/mtg-meta
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

## Features

1. **Format picker** — Standard and Modern
2. **Meta overview** — archetype name, share %, win rate, trend
3. **Archetype detail** — description, maindeck highlights, sideboard notes
4. **Search** — filter by archetype name
5. **Sort** — by popularity, win rate, or name

## Project layout

```
/workspace/mtg-meta/
  index.html       # App shell
  css/styles.css   # Dark Magic-inspired UI
  js/app.js        # Format/filter/sort/detail logic
  data/meta.json   # Sample meta dataset
  README.md        # This file
```

## Editing sample data

Edit `data/meta.json`. Each format has an `archetypes` array with fields like `name`, `share`, `winRate`, `trend` (`up` | `down` | `stable`), `colors`, `highlights`, and `sideboardNotes`. Refresh the browser after saving.

## Assumptions

- Stats and card lists are invented for a plausible late-2025 / 2026 meta feel; card legality may not match a specific tournament week.
- Single-page app; no backend or build step.
- Designed primarily for desktop; mobile layout stacks the table into cards and keeps the detail panel readable.
