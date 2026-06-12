'use strict';
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const WCEngine = require('./engine.js');

// ---------- 1. Parse Annex C ----------
const raw = fs.readFileSync(path.join(DIR, 'annexC_raw.txt'), 'utf8').trim().split(/\r?\n/);
const annex = {};
for (const line of raw) {
  const m = line.split(':');
  const rest = m.slice(1).join(':');
  const parts = rest.split(';').map(s => s.trim()).filter(Boolean);
  // first 8 = groups, last 8 = routing (3X)
  const groups = parts.slice(0, 8);
  const routingRaw = parts.slice(8, 16);
  const routing = routingRaw.map(s => s.replace('3', '').trim());
  const key = groups.slice().sort().join('');
  annex[key] = routing;
}
console.log('Annex rows parsed:', Object.keys(annex).length);

// ---------- 2. Teams & odds ----------
// American championship ("Win") odds from DraftKings via ESPN (Apr 2026 board).
// Polymarket prefill (championship %) — Polymarket "World Cup Winner" market snapshot
// (top tier from @PolymarketSports late-May post; tail = de-vigged book baseline, clearly editable).
const TEAMS = [
  // name, group, americanOdds, polymarketPct(optional)
  ['Mexico', 'A', 7000, 1.0], ['South Africa', 'A', 80000, null], ['South Korea', 'A', 35000, 0.8], ['Czechia', 'A', 15000, null],
  ['Canada', 'B', 20000, 0.4], ['Bosnia & Herzegovina', 'B', 25000, null], ['Qatar', 'B', 100000, null], ['Switzerland', 'B', 10000, null],
  ['Brazil', 'C', 850, 9.0], ['Morocco', 'C', 6000, 1.0], ['Haiti', 'C', 150000, null], ['Scotland', 'C', 20000, null],
  ['United States', 'D', 6500, 1.5], ['Paraguay', 'D', 20000, null], ['Australia', 'D', 45000, null], ['Turkey', 'D', 6500, null],
  ['Germany', 'E', 1400, 5.0], ['Curacao', 'E', 150000, null], ['Ivory Coast', 'E', 25000, null], ['Ecuador', 'E', 8000, null],
  ['Netherlands', 'F', 2000, 4.0], ['Japan', 'F', 5000, 2.0], ['Sweden', 'F', 8000, null], ['Tunisia', 'F', 50000, null],
  ['Belgium', 'G', 3500, 2.0], ['Egypt', 'G', 30000, null], ['Iran', 'G', 30000, null], ['New Zealand', 'G', 100000, null],
  ['Spain', 'H', 450, 17.0], ['Cape Verde', 'H', 100000, null], ['Saudi Arabia', 'H', 100000, null], ['Uruguay', 'H', 6500, null],
  ['France', 'I', 600, 16.0], ['Senegal', 'I', 10000, null], ['Iraq', 'I', 100000, null], ['Norway', 'I', 2800, 3.0],
  ['Argentina', 'J', 850, 8.0], ['Algeria', 'J', 35000, null], ['Austria', 'J', 10000, null], ['Jordan', 'J', 150000, null],
  ['Portugal', 'K', 1100, 10.0], ['DR Congo', 'K', 70000, null], ['Uzbekistan', 'K', 150000, null], ['Colombia', 'K', 4000, 2.0],
  ['England', 'L', 600, 11.0], ['Croatia', 'L', 9000, null], ['Ghana', 'L', 35000, null], ['Panama', 'L', 100000, null]
];

// Progression-market anchors — Polymarket "Nation To Reach R16 / QF / SF" snapshot (mid-price).
// De-vigged to slot counts (16/8/4) and used as SECONDARY, championship-dominant calibration
// targets, so mid/lower teams (whose championship prob ≈ 0 gives the fit no signal) get their
// ratings pinned by real market numbers. Refresh on rebuild via the fetch documented in CLAUDE.md.
const PROGRESSION = {
  'Mexico':{r16:0.63,qf:0.275,sf:0.145}, 'South Africa':{r16:0.055,qf:0.029,sf:0.013}, 'South Korea':{r16:0.435,qf:0.185,sf:0.036}, 'Czechia':{r16:0.19,qf:0.07,sf:0.0255},
  'Canada':{r16:0.4,qf:0.165,sf:0.035}, 'Bosnia & Herzegovina':{r16:0.345,qf:0.07,sf:0.0235}, 'Qatar':{r16:0.035,qf:0.032,sf:0.003}, 'Switzerland':{r16:0.71,qf:0.25,sf:0.105},
  'Brazil':{r16:0.73,qf:0.51,sf:0.32}, 'Morocco':{r16:0.42,qf:0.225,sf:0.12}, 'Haiti':{r16:0.039,qf:0.019,sf:0.004}, 'Scotland':{r16:0.235,qf:0.09,sf:0.0215},
  'United States':{r16:0.495,qf:0.255,sf:0.095}, 'Paraguay':{r16:0.295,qf:0.13,sf:0.039}, 'Australia':{r16:0.17,qf:0.062,sf:0.0275}, 'Turkey':{r16:0.465,qf:0.225,sf:0.105},
  'Germany':{r16:0.705,qf:0.405,sf:0.23}, 'Curacao':{r16:0.0305,qf:0.0175,sf:0.013}, 'Ivory Coast':{r16:0.37,qf:0.12,sf:0.048}, 'Ecuador':{r16:0.43,qf:0.185,sf:0.0785},
  'Netherlands':{r16:0.535,qf:0.38,sf:0.225}, 'Japan':{r16:0.43,qf:0.225,sf:0.105}, 'Sweden':{r16:0.185,qf:0.09,sf:0.042}, 'Tunisia':{r16:0.08,qf:0.028,sf:0.015},
  'Belgium':{r16:0.63,qf:0.38,sf:0.145}, 'Egypt':{r16:0.335,qf:0.095,sf:0.0195}, 'Iran':{r16:0.185,qf:0.048,sf:0.014}, 'New Zealand':{r16:0.075,qf:0.021,sf:0.0165},
  'Spain':{r16:0.805,qf:0.625,sf:0.45}, 'Cape Verde':{r16:0.067,qf:0.0255,sf:0.0035}, 'Saudi Arabia':{r16:0.06,qf:0.0235,sf:0.0155}, 'Uruguay':{r16:0.415,qf:0.235,sf:0.09},
  'France':{r16:0.815,qf:0.6,sf:0.425}, 'Senegal':{r16:0.305,qf:0.165,sf:0.0525}, 'Iraq':{r16:0.062,qf:0.037,sf:0.0135}, 'Norway':{r16:0.545,qf:0.305,sf:0.175},
  'Argentina':{r16:0.73,qf:0.525,sf:0.315}, 'Algeria':{r16:0.225,qf:0.09,sf:0.0295}, 'Austria':{r16:0.29,qf:0.135,sf:0.064}, 'Jordan':{r16:0.0585,qf:0.0235,sf:0.012},
  'Portugal':{r16:0.745,qf:0.505,sf:0.34}, 'DR Congo':{r16:0.115,qf:0.0735,sf:0.009}, 'Uzbekistan':{r16:0.08,qf:0.026,sf:0.009}, 'Colombia':{r16:0.545,qf:0.29,sf:0.165},
  'England':{r16:0.78,qf:0.555,sf:0.34}, 'Croatia':{r16:0.395,qf:0.2,sf:0.102}, 'Ghana':{r16:0.145,qf:0.0585,sf:0.0175}, 'Panama':{r16:0.055,qf:0.0235,sf:0.008}
};

const N = TEAMS.length;
const names = TEAMS.map(t => t[0]);
const groupOf = TEAMS.map(t => t[1]);
const american = TEAMS.map(t => t[2]);

// implied prob from american odds (+X): 100/(X+100)
function impl(a) { return 100 / (a + 100); }
const rawProb = american.map(impl);
const overround = rawProb.reduce((s, x) => s + x, 0);

// --- De-vig: Shin's method (corrects favourite–longshot bias vs naive proportional) ---
// Solves for the insider proportion z such that
//   p_i = [ sqrt(z^2 + 4(1-z)·q_i^2 / B) - z ] / (2(1-z))     (B = Σ q_i, the book overround)
// produces probabilities that sum to 1. Bisection on z (Σp decreases as z grows).
function shinDevig(q) {
  const B = q.reduce((s, x) => s + x, 0);
  const probs = z => q.map(qi => (Math.sqrt(z*z + 4*(1-z)*qi*qi/B) - z) / (2*(1-z)));
  const sumAt = z => probs(z).reduce((s, x) => s + x, 0);
  let lo = 0, hi = 0.5;
  while (sumAt(hi) > 1 && hi < 0.999) hi = (hi + 1) / 2;   // widen bracket if needed
  for (let it = 0; it < 100; it++) { const mid = (lo + hi) / 2; if (sumAt(mid) > 1) lo = mid; else hi = mid; }
  const z = (lo + hi) / 2;
  const p = probs(z);
  const s = p.reduce((a, b) => a + b, 0);
  return { probs: p.map(x => x / s), z };                 // tiny renorm for float safety
}
const propProb = rawProb.map(x => x / overround);          // old proportional method (for comparison)
const shin = shinDevig(rawProb);
const marketProb = shin.probs;                             // de-vigged championship baseline (= Fair %)
console.log('Overround (book):', overround.toFixed(4), '| Shin z =', shin.z.toFixed(4));
{
  const idx = [...Array(N).keys()].sort((a, b) => american[a] - american[b]);
  console.log('De-vig shift (proportional -> Shin), favourites & tail:');
  [...idx.slice(0, 4), ...idx.slice(-3)].forEach(i => {
    console.log('  ' + names[i].padEnd(16) + ' prop ' + (propProb[i] * 100).toFixed(3) + '%  ->  shin ' + (marketProb[i] * 100).toFixed(3) + '%');
  });
}

// Polymarket prefill: use given pct where present; else fill from de-vigged baseline (editable in UI)
const pmGiven = TEAMS.map(t => t[3]);
const pmPrefill = pmGiven.map((v, i) => v != null ? v : +(marketProb[i] * 100).toFixed(2));

// Progression targets, de-vigged to their slot counts (R16=16, QF=8, SF=4 teams advance).
const SLOTS = { r16: 16, qf: 8, sf: 4 };
function devigProg(field) {
  const raw = names.map(n => (PROGRESSION[n] && PROGRESSION[n][field]) || 0);
  const s = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map(x => x * SLOTS[field] / s);               // normalise so Σ = slot count
}
const TG = { r16: devigProg('r16'), qf: devigProg('qf'), sf: devigProg('sf') };

// ---------- 3. Group structures ----------
const groupsOrder = ['A','B','C','D','E','F','G','H','I','J','K','L'];
const groupMembers = {};
groupsOrder.forEach(L => { groupMembers[L] = []; });
TEAMS.forEach((t, i) => groupMembers[t[1]].push(i));

// ---------- 4. Calibration (multi-market, championship-dominant) ----------
const nu = 0.67;
// init ratings = centered log(marketProb)
let ratings = marketProb.map(p => Math.log(p));
const meanR = ratings.reduce((s, x) => s + x, 0) / N;
ratings = ratings.map(x => x - meanR);

function buildEngine(rts) {
  return WCEngine.Engine({ teams: names, groupsOrder, groupMembers, ratings: rts, nu, annex });
}

// championship anchor dominates (so Fair % / baseline champ stays ~ the de-vigged book);
// the progression markets mainly refine ratings where champ ≈ 0 carries no gradient.
const W = { champ: 1.0, r16: 0.18, qf: 0.18, sf: 0.18 };
const ITERS = 55;
let lr = 0.9;
for (let it = 0; it < ITERS; it++) {
  const eng = buildEngine(ratings);
  const nSims = it < 35 ? 12000 : 24000;
  const st = eng.run({}, nSims, 12345 + it * 7919);       // full stats: champ + r16/qf/sf
  let champMaxErr = 0, champAbs = 0;
  for (let i = 0; i < N; i++) {
    let num = 0, den = 0;
    num += W.champ * (Math.log(marketProb[i]) - Math.log(st.champ[i] + 1e-6)); den += W.champ;
    if (TG.r16[i] > 1e-4) { num += W.r16 * (Math.log(TG.r16[i]) - Math.log(st.r16[i] + 1e-6)); den += W.r16; }
    if (TG.qf[i]  > 1e-4) { num += W.qf  * (Math.log(TG.qf[i])  - Math.log(st.qf[i]  + 1e-6)); den += W.qf; }
    if (TG.sf[i]  > 1e-4) { num += W.sf  * (Math.log(TG.sf[i])  - Math.log(st.sf[i]  + 1e-6)); den += W.sf; }
    ratings[i] += lr * (num / den);
    const e = Math.abs(st.champ[i] - marketProb[i]);
    if (e > champMaxErr) champMaxErr = e; champAbs += e;
  }
  // re-center
  const mr = ratings.reduce((s, x) => s + x, 0) / N;
  for (let i = 0; i < N; i++) ratings[i] -= mr;
  lr = Math.max(0.25, lr * 0.965);
  if (it % 10 === 0 || it === ITERS - 1)
    console.log(`iter ${it}: champMaxErr=${(champMaxErr*100).toFixed(2)}pp champMeanAbs=${(champAbs/N*100).toFixed(3)}pp lr=${lr.toFixed(3)}`);
}

// ---------- 5. Final diagnostics (high-precision) ----------
const eng = buildEngine(ratings);
const fin = eng.run({}, 200000, 999331);
console.log('\nTeam                 Mkt%   Model%  | R16 tgt/mdl | QF tgt/mdl | SF tgt/mdl');
const idxSorted = [...Array(N).keys()].sort((a, b) => marketProb[b] - marketProb[a]);
for (const i of idxSorted.slice(0, 16)) {
  console.log(
    names[i].padEnd(20),
    (marketProb[i]*100).toFixed(2).padStart(5),
    (fin.champ[i]*100).toFixed(2).padStart(7), ' ',
    (TG.r16[i]*100).toFixed(0).padStart(3)+'/'+(fin.r16[i]*100).toFixed(0).padStart(3),
    '   '+(TG.qf[i]*100).toFixed(0).padStart(3)+'/'+(fin.qf[i]*100).toFixed(0).padStart(3),
    '   '+(TG.sf[i]*100).toFixed(0).padStart(3)+'/'+(fin.sf[i]*100).toFixed(0).padStart(3)
  );
}
// aggregate fit error per market
function meanAbs(model, tgt, mask) {
  let s = 0, n = 0; for (let i = 0; i < N; i++) { if (mask && tgt[i] <= 1e-4) continue; s += Math.abs(model[i]-tgt[i]); n++; } return s/n;
}
console.log('\nFit (mean abs error):',
  'champ', (meanAbs(fin.champ, marketProb, false)*100).toFixed(3)+'pp',
  '| R16', (meanAbs(fin.r16, TG.r16, true)*100).toFixed(2)+'pp',
  '| QF', (meanAbs(fin.qf, TG.qf, true)*100).toFixed(2)+'pp',
  '| SF', (meanAbs(fin.sf, TG.sf, true)*100).toFixed(2)+'pp');

// full-stat run for embedded default snapshot
const full = eng.run({}, 120000, 4242);

// ---------- 6. Emit data.json ----------
const data = {
  generated: new Date().toISOString(),
  nu,
  teams: TEAMS.map((t, i) => ({
    id: i, name: names[i], group: groupOf[i],
    american: american[i],
    marketProb: +marketProb[i].toFixed(6),
    mR16: +TG.r16[i].toFixed(5), mQF: +TG.qf[i].toFixed(5), mSF: +TG.sf[i].toFixed(5),
    pmPrefill: pmPrefill[i],
    pmIsReal: pmGiven[i] != null,
    rating: +ratings[i].toFixed(5)
  })),
  groupsOrder, groupMembers,
  annex,
  defaultStats: {
    champ: Array.from(full.champ, x=>+x.toFixed(5)),
    finalA: Array.from(full.finalA, x=>+x.toFixed(5)),
    sf: Array.from(full.sf, x=>+x.toFixed(5)),
    qf: Array.from(full.qf, x=>+x.toFixed(5)),
    r16: Array.from(full.r16, x=>+x.toFixed(5)),
    r32: Array.from(full.r32, x=>+x.toFixed(5)),
    wingroup: Array.from(full.wingroup, x=>+x.toFixed(5))
  }
};
fs.writeFileSync(path.join(DIR, 'data.json'), JSON.stringify(data));
console.log('\nWrote data.json (', JSON.stringify(data).length, 'bytes )');
