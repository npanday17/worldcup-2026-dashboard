# World Cup 2026 — Fair Odds vs Polymarket Dashboard

A single-page, fully client-side dashboard:

- **Fair %** — de-vigged sportsbook championship odds for all 48 teams (your reference/"true" baseline).
- **Polymarket %** — live prices auto-fetched from Polymarket; per-team **Edge / EV / BUY-SELL-HOLD** signals.
- **Interactive bracket** — pick group 1/2/3 and knockout winners; championship + round-by-round odds recompute live (Monte Carlo).
- **Live results** — match scores & goal scorers from ESPN automatically condition the odds.
- **Save** — named scenarios + export/import, and a real **SQLite** database (snapshots of odds/edges) you can query anywhere.

## Quick start

```bash
npm install                 # dev/test deps only (jsdom, sql.js)
npm run build               # generate index.html from the sources
python3 -m http.server 8000 # then open http://localhost:8000/index.html
```

Do not open `index.html` via `file://` — the live fetches and storage need a real http(s) origin.

## Common commands

| Command | What it does |
|---|---|
| `npm run build` | Rebuild `index.html` from `ui_template.html` + `engine.js` + `data.json` |
| `npm test` | Run the math/logic checks (expect "22 passed, 0 failed") |
| `npm run rebuild` | Re-run calibration **then** build (only when odds / team list / engine change) |
| `npm run deploy` | `vercel --prod` |

## Editing

`index.html` is **generated** — never edit it directly. Edit the sources and rebuild:

- `ui_template.html` — UI, CSS, and app logic (placeholders `/*__ENGINE__*/`, `/*__DATA__*/`)
- `engine.js` — Monte Carlo tournament simulator (shared by Node + browser)
- `calibrate.js` — team list + bookmaker odds → de-vig → fit ratings → `data.json`
- `annexC_raw.txt` — 495 official FIFA third-place routing combinations
- `assemble.js` — injects engine + data into the template → writes `index.html`
- `verify.js` — unit tests

See `CLAUDE.md` for the full pipeline (it's the project guide Claude Code reads).

## Deploy (Vercel)

Only `index.html` + `vercel.json` are needed on the host. Static site, framework preset
"Other", no build command, no env vars, no API keys.
