# World Cup 2026 — Fair Odds vs Polymarket Dashboard

A single-page, fully client-side dashboard:

- **Fair %** — de-vigged sportsbook championship odds for all 48 teams (your reference/"true" baseline).
- **Polymarket %** — live prices auto-fetched from Polymarket; per-team **Edge / EV / BUY-SELL-HOLD** signals.
- **Interactive bracket** — pick group 1/2/3 and knockout winners; championship + round-by-round odds recompute live (Monte Carlo).
- **Live results** — full schedule + match scores & goal scorers from ESPN; upcoming matches show the model's win/draw/win odds, and completed ones condition the fair odds.
- **Golden Boot** — live top-scorers (actual goals from ESPN) joined with Polymarket's Golden Boot market price.
- **Save** — named scenarios saved to your browser, plus export/import to a `.json` file.

## Quick start

```bash
npm install                 # dev/test deps only
npm run build               # generate index.html from the sources
python3 -m http.server 8000 # then open http://localhost:8000/index.html
```

Do not open `index.html` via `file://` — the live fetches and storage need a real http(s) origin.

## Common commands

| Command | What it does |
|---|---|
| `npm run build` | Rebuild `index.html` from `ui_template.html` + `engine.js` + `data.json` |
| `npm test` | Run the math/logic checks (expect "27 passed, 0 failed") |
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

## Live data proxy (`api/`)

`api/polymarket.js` and `api/espn.js` are Vercel serverless functions that front the
Polymarket and ESPN APIs with a strict allowlist and CDN caching (`s-maxage`), hardening the
app against upstream CORS changes. The client fetches proxy-first with a direct-upstream
fallback, so `python http.server` still works locally (the `/api/*` 404s fall back to direct).
Free on Vercel's Hobby plan. Use `vercel dev` to run the functions locally.

## Deploy (Vercel)

`index.html` + `vercel.json` + the `api/` functions run on the host. Static site + serverless
functions, framework preset "Other", no build command, no env vars, no API keys.
