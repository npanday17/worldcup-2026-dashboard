# World Cup 2026 Odds Dashboard — project guide

A single-page, fully client-side dashboard: model "fair" championship odds for all 48
teams vs live Polymarket prices, an interactive bracket simulator, and live ESPN results that
condition the odds. Deploys to Vercel as one static `index.html`.

## Golden rule — `index.html` is GENERATED, never edit it by hand

The deploy file `index.html` is built by concatenating three sources. Editing it directly
will be overwritten on the next build. Always edit the **source files** and rebuild.

Source of truth:
- `ui_template.html` — all UI markup, CSS, and app JavaScript. Contains two placeholders,
  `/*__ENGINE__*/` and `/*__DATA__*/`, that the build replaces.
- `engine.js` — the Monte Carlo simulation engine (group stage + 48-team knockout bracket,
  results conditioning). Shared verbatim by Node (tests/calibration) and the browser.
- `calibrate.js` — defines the 48 teams + their bookmaker championship odds, de-vigs them,
  and fits team strength ratings so the simulation reproduces those odds. Writes `data.json`.
- `annexC_raw.txt` — the 495 official FIFA third-place routing combinations (parsed by calibrate.js).
- `assemble.js` — injects `engine.js` + `data.json` into `ui_template.html` → writes `index.html`.
- `verify.js` — math/logic unit tests (run in Node against `engine.js` + `data.json`).

## Build / test / deploy

```bash
npm install            # one-time: dev/test deps only
npm run build          # assemble index.html from the sources (fast)
npm run test           # run the math/logic checks (expect "27 passed, 0 failed")
npm run rebuild        # re-run calibration THEN assemble (see below for when)
npm run deploy         # vercel --prod  (needs the Vercel CLI + login)
```

Typical loop: edit `ui_template.html` → `npm run build` → open `index.html` (serve over
http, see below) → `npm run deploy`.

### When to recalibrate (`npm run calibrate` / `npm run rebuild`)
Only when the **inputs to the model change**: updated sportsbook championship odds, a changed
team list, or a change to the engine's match model (`engine.js`). Calibration is a Monte
Carlo fit (~10–20 s) and rewrites `data.json` (ratings + the `Fair %` baseline). Pure UI/CSS
edits do **not** need recalibration — just `npm run build`.

To update the `Fair %` baseline odds: edit the `TEAMS` array in `calibrate.js` (the third
value per row is the American championship price), then `npm run rebuild`.

**Fair-odds model (`calibrate.js`):** championship odds are de-vigged with **Shin's method**
(`shinDevig`, corrects favourite–longshot bias), not naive proportional. Ratings are then fit
**multi-market**: the championship anchor dominates (so `Fair %` ≈ the de-vigged book) while
the Polymarket **reach-R16/QF/SF** snapshot (`PROGRESSION` const) refines ratings where
champ ≈ 0 gives no signal. To refresh the `PROGRESSION` snapshot, re-fetch
`gamma-api.polymarket.com/events?slug=world-cup-nation-to-reach-{round-of-16,quarterfinals,semifinals}`
(mid-price per `groupItemTitle`) and paste the updated values, then `npm run rebuild`.

## Run locally (do NOT open index.html via file://)
The page fetches Polymarket and ESPN and uses localStorage — all of
which are flaky or blocked under `file://`. Serve it:
```bash
python3 -m http.server 8000   # then open http://localhost:8000/index.html
```
The `/api/*` proxy functions (see below) do **not** run under `python http.server` — the page
detects the 404 and falls back to fetching the upstreams directly, so local dev still works.
To exercise the proxy locally, use `vercel dev` instead.

## Live data sources (browser-side, no API keys)
Fetched **proxy-first** (`/api/*` below) with a **direct-upstream fallback**, so the app
survives upstream CORS changes in prod and still works in local `python http.server`:
- Polymarket prices: `/api/polymarket?slug=world-cup-winner` → `gamma-api.polymarket.com`
- Golden Boot odds: `/api/polymarket?slug=world-cup-golden-boot-winner` → `gamma-api.polymarket.com`
- Match results + scorers: `/api/espn?dates=YYYYMMDD` → `site.api.espn.com/.../fifa.world/scoreboard`
- Everything else (engine, data, flags) is inlined / offline-capable.

## Serverless proxy (`api/`)
- `api/polymarket.js`, `api/espn.js` — Vercel functions that front the upstreams with a strict
  **allowlist** (only the two WC slugs / `YYYYMMDD` dates) and `Cache-Control: s-maxage`, so
  Vercel's CDN serves one shared cached copy to all visitors (cuts upstream calls + invocations).
- Free on the Vercel Hobby plan (1M invocations/mo, no overage charges).

## Deploy notes
- `index.html` + `vercel.json` + the `api/` functions are what run on Vercel; the rest is build/dev tooling.
- Static site + serverless functions, framework preset "Other", no build command, no env vars.

## Tests must stay green
After any change to `engine.js`, `calibrate.js`, or the conditioning logic in
`ui_template.html`, run `npm run test`. The suite checks: the 495 routing combinations are
valid, round-by-round probabilities are monotonic and sum correctly, the model reproduces the
de-vigged market within ~1pp, and results-conditioning behaves (eliminated team → ~0%).
