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

const N = TEAMS.length;
const names = TEAMS.map(t => t[0]);
const groupOf = TEAMS.map(t => t[1]);
const american = TEAMS.map(t => t[2]);

// implied prob from american odds (+X): 100/(X+100)
function impl(a) { return 100 / (a + 100); }
const rawProb = american.map(impl);
const overround = rawProb.reduce((s, x) => s + x, 0);
const marketProb = rawProb.map(x => x / overround); // de-vigged, sums to 1
console.log('Overround (book):', overround.toFixed(4), ' -> de-vigged to 1.0');

// Polymarket prefill: use given pct where present; else fill from de-vigged baseline (editable in UI)
const pmGiven = TEAMS.map(t => t[3]);
const pmPrefill = pmGiven.map((v, i) => v != null ? v : +(marketProb[i] * 100).toFixed(2));

// ---------- 3. Group structures ----------
const groupsOrder = ['A','B','C','D','E','F','G','H','I','J','K','L'];
const groupMembers = {};
groupsOrder.forEach(L => { groupMembers[L] = []; });
TEAMS.forEach((t, i) => groupMembers[t[1]].push(i));

// ---------- 4. Calibration ----------
const nu = 0.67;
// init ratings = centered log(marketProb)
let ratings = marketProb.map(p => Math.log(p));
const meanR = ratings.reduce((s, x) => s + x, 0) / N;
ratings = ratings.map(x => x - meanR);

function buildEngine(rts) {
  return WCEngine.Engine({
    teams: names, groupsOrder, groupMembers, ratings: rts, nu, annex
  });
}

const target = marketProb;
const ITERS = 60;
let lr = 0.9;
for (let it = 0; it < ITERS; it++) {
  const eng = buildEngine(ratings);
  const nSims = it < 40 ? 14000 : 26000;
  const champ = eng.runChampOnly({}, nSims, 12345 + it * 7919);
  // multiplicative update in log space
  let maxErr = 0, sumAbs = 0;
  for (let i = 0; i < N; i++) {
    const f = champ[i] + 1e-6;
    const adj = lr * (Math.log(target[i]) - Math.log(f));
    ratings[i] += adj;
    const e = Math.abs(champ[i] - target[i]);
    if (e > maxErr) maxErr = e;
    sumAbs += e;
  }
  // re-center
  const mr = ratings.reduce((s, x) => s + x, 0) / N;
  for (let i = 0; i < N; i++) ratings[i] -= mr;
  lr = Math.max(0.25, lr * 0.965);
  if (it % 10 === 0 || it === ITERS - 1)
    console.log(`iter ${it}: maxErr=${(maxErr*100).toFixed(2)}pp meanAbs=${(sumAbs/N*100).toFixed(3)}pp lr=${lr.toFixed(3)}`);
}

// ---------- 5. Final diagnostics (high-precision) ----------
const eng = buildEngine(ratings);
const finalChamp = eng.runChampOnly({}, 200000, 999331);
console.log('\nTeam                 Market%  Model%   (champion)');
const idxSorted = [...Array(N).keys()].sort((a,b)=>target[b]-target[a]);
for (const i of idxSorted.slice(0, 20)) {
  console.log(
    names[i].padEnd(20),
    (target[i]*100).toFixed(2).padStart(6),
    (finalChamp[i]*100).toFixed(2).padStart(7)
  );
}

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
