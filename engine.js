/* ============================================================
   World Cup 2026 simulation engine (shared: Node calibration + browser)
   Pure functions, no DOM. Exposed via global WCEngine.
   ============================================================ */
(function (root) {
  'use strict';

  // Mulberry32 seeded PRNG (fast, deterministic)
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Round-robin schedule for 4 teams (indices into the group's 4-array)
  var RR = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];

  // Winner-slot order for third-place routing and the R32 match each maps to
  // order: [1A,1B,1D,1E,1G,1I,1K,1L]
  var THIRD_SLOT_LETTERS = ['A', 'B', 'D', 'E', 'G', 'I', 'K', 'L'];
  var THIRD_SLOT_MATCH = { A: 79, B: 85, D: 81, E: 74, G: 82, I: 77, K: 87, L: 80 };

  // Build the full match graph. Each match: {a, b} where a/b are slot descriptors.
  // Slot descriptor kinds:
  //   {k:'W', g:'A'}  winner of group A
  //   {k:'R', g:'A'}  runner-up of group A
  //   {k:'T', g:'A'}  third-place team routed to the winner-A slot (resolved per sim)
  //   {k:'M', m:73}   winner of match 73
  var R32 = {
    73: [{ k: 'R', g: 'A' }, { k: 'R', g: 'B' }],
    74: [{ k: 'W', g: 'E' }, { k: 'T', g: 'E' }],
    75: [{ k: 'W', g: 'F' }, { k: 'R', g: 'C' }],
    76: [{ k: 'W', g: 'C' }, { k: 'R', g: 'F' }],
    77: [{ k: 'W', g: 'I' }, { k: 'T', g: 'I' }],
    78: [{ k: 'R', g: 'E' }, { k: 'R', g: 'I' }],
    79: [{ k: 'W', g: 'A' }, { k: 'T', g: 'A' }],
    80: [{ k: 'W', g: 'L' }, { k: 'T', g: 'L' }],
    81: [{ k: 'W', g: 'D' }, { k: 'T', g: 'D' }],
    82: [{ k: 'W', g: 'G' }, { k: 'T', g: 'G' }],
    83: [{ k: 'R', g: 'K' }, { k: 'R', g: 'L' }],
    84: [{ k: 'W', g: 'H' }, { k: 'R', g: 'J' }],
    85: [{ k: 'W', g: 'B' }, { k: 'T', g: 'B' }],
    86: [{ k: 'W', g: 'J' }, { k: 'R', g: 'H' }],
    87: [{ k: 'W', g: 'K' }, { k: 'T', g: 'K' }],
    88: [{ k: 'R', g: 'D' }, { k: 'R', g: 'G' }]
  };
  var LATER = {
    89: [{ k: 'M', m: 74 }, { k: 'M', m: 77 }],
    90: [{ k: 'M', m: 73 }, { k: 'M', m: 75 }],
    91: [{ k: 'M', m: 76 }, { k: 'M', m: 78 }],
    92: [{ k: 'M', m: 79 }, { k: 'M', m: 80 }],
    93: [{ k: 'M', m: 83 }, { k: 'M', m: 84 }],
    94: [{ k: 'M', m: 81 }, { k: 'M', m: 82 }],
    95: [{ k: 'M', m: 86 }, { k: 'M', m: 88 }],
    96: [{ k: 'M', m: 85 }, { k: 'M', m: 87 }],
    97: [{ k: 'M', m: 89 }, { k: 'M', m: 90 }],
    98: [{ k: 'M', m: 93 }, { k: 'M', m: 94 }],
    99: [{ k: 'M', m: 91 }, { k: 'M', m: 92 }],
    100: [{ k: 'M', m: 95 }, { k: 'M', m: 96 }],
    101: [{ k: 'M', m: 97 }, { k: 'M', m: 98 }],
    102: [{ k: 'M', m: 99 }, { k: 'M', m: 100 }],
    104: [{ k: 'M', m: 101 }, { k: 'M', m: 102 }]
  };
  // Round membership for stats (max round reached)
  // 1=R32,2=R16,3=QF,4=SF,5=Final,6=Champion
  var R32_MATCHES = [73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88];
  var R16_MATCHES = [89, 90, 91, 92, 93, 94, 95, 96];
  var QF_MATCHES = [97, 98, 99, 100];
  var SF_MATCHES = [101, 102];
  var FINAL_MATCH = 104;
  var KO_ORDER = R32_MATCHES.concat(R16_MATCHES, QF_MATCHES, SF_MATCHES, [FINAL_MATCH]);

  function Engine(D) {
    // D: { teams, groupsOrder (['A'..'L']), groupMembers {A:[idx*4]}, ratings[48], nu, annex }
    var ratings = D.ratings;
    var N = ratings.length;
    var expR = new Float64Array(N);
    for (var i = 0; i < N; i++) expR[i] = Math.exp(ratings[i]);
    var nu = D.nu;
    var groupsOrder = D.groupsOrder;
    var members = D.groupMembers; // letter -> [4 idx]
    var annex = D.annex;          // key 'ABCDEFGH' -> [8 third-letters in slot order A,B,D,E,G,I,K,L]

    function pKO(i, j) { return expR[i] / (expR[i] + expR[j]); }
    // Single group-match outcome probabilities (Davidson model — same math simulate() uses).
    function pGroup(i, j) {
      var ei = expR[i], ej = expR[j], dr = nu * Math.sqrt(ei * ej), tot = ei + ej + dr;
      return { win: ei / tot, draw: dr / tot, loss: ej / tot };
    }
    // goal samplers for simulated group matches (used only for GD/GF tiebreakers)
    function sampleMargin(rnd){ var x=rnd(); return x<0.52?1:(x<0.82?2:(x<0.95?3:4)); }
    function sampleLoser(rnd){ var x=rnd(); return x<0.60?0:(x<0.90?1:2); }
    function sampleDraw(rnd){ var x=rnd(); return x<0.30?0:(x<0.72?1:(x<0.92?2:3)); }

    // Run one tournament. fixes = {groupOrder:{A:[i,i,i,i]|undefined}, thirdIn:[letters], thirdOut:[letters], koWin:{m:teamIdx}}
    // stat: optional Int32Array-like accumulators (champ, finalA, sf, qf, r16, r32, wingroup) each length N (counts), pass via acc
    function simulate(fixes, rnd, acc) {
      var L, gi, a, b, res, pts, mIdx;
      var order = {};        // letter -> [4 idx] final finishing order
      var thirdTeam = {};    // letter -> idx of 3rd-placed team
      var thirdMetric = {};  // letter -> comparable metric for best-8

      var fo = (fixes && fixes.groupOrder) || null;
      var gg = (fixes && fixes.groupGoals) || null;

      for (gi = 0; gi < groupsOrder.length; gi++) {
        L = groupsOrder[gi];
        var m = members[L];
        var pts = [0, 0, 0, 0], gf = [0, 0, 0, 0], gaArr = [0, 0, 0, 0];
        var real = gg && gg[L]; // [{a,b,ga,gb}] local indices a<b, real goals
        for (var r = 0; r < 6; r++) {
          var pa = RR[r][0], pb = RR[r][1];
          var ggoal = null;
          if (real) { for (var ri = 0; ri < real.length; ri++) { if (real[ri].a === pa && real[ri].b === pb) { ggoal = real[ri]; break; } } }
          var gA, gB; // goals scored by pa, pb
          if (ggoal) { gA = ggoal.ga; gB = ggoal.gb; }
          else {
            a = m[pa]; b = m[pb];
            var ea = expR[a], eb = expR[b], dr = nu * Math.sqrt(ea * eb);
            var tot = ea + eb + dr; var x = rnd() * tot;
            if (x < ea) { var lo = sampleLoser(rnd); gB = lo; gA = lo + sampleMargin(rnd); }
            else if (x < ea + eb) { var lo2 = sampleLoser(rnd); gA = lo2; gB = lo2 + sampleMargin(rnd); }
            else { var dg = sampleDraw(rnd); gA = dg; gB = dg; }
          }
          gf[pa] += gA; gaArr[pa] += gB; gf[pb] += gB; gaArr[pb] += gA;
          if (gA > gB) pts[pa] += 3; else if (gA < gB) pts[pb] += 3; else { pts[pa] += 1; pts[pb] += 1; }
        }
        // rank: points, goal difference, goals for, rating, noise (FIFA-style)
        var idxLocal = [0, 1, 2, 3];
        idxLocal.sort(function (u, v) {
          if (pts[v] !== pts[u]) return pts[v] - pts[u];
          var gdv = (gf[v] - gaArr[v]) - (gf[u] - gaArr[u]); if (gdv !== 0) return gdv;
          if (gf[v] !== gf[u]) return gf[v] - gf[u];
          var rd = ratings[m[v]] - ratings[m[u]]; if (rd !== 0) return rd;
          return rnd() - 0.5;
        });
        var simOrder = [m[idxLocal[0]], m[idxLocal[1]], m[idxLocal[2]], m[idxLocal[3]]];
        var finalOrder = (fo && fo[L]) ? fo[L] : simOrder;
        order[L] = finalOrder;
        var t3 = finalOrder[2];
        thirdTeam[L] = t3;
        var t3p = 0, t3gd = 0, t3gf = 0;
        for (var q = 0; q < 4; q++) if (m[q] === t3) { t3p = pts[q]; t3gd = gf[q] - gaArr[q]; t3gf = gf[q]; }
        thirdMetric[L] = t3p * 1e6 + t3gd * 1e3 + t3gf * 10 + ratings[t3] + rnd() * 0.001;
        if (acc && finalOrder[0] !== undefined) acc.wingroup[finalOrder[0]]++;
      }

      // ---- decide 8 best third-placed groups ----
      var forcedIn = (fixes && fixes.thirdIn) || [];
      var forcedOut = (fixes && fixes.thirdOut) || [];
      var outSet = {}; for (var oi = 0; oi < forcedOut.length; oi++) outSet[forcedOut[oi]] = 1;
      var inSet = {}; for (var ii = 0; ii < forcedIn.length; ii++) inSet[forcedIn[ii]] = 1;
      var chosen = [];
      // forced-in first
      for (gi = 0; gi < groupsOrder.length; gi++) { L = groupsOrder[gi]; if (inSet[L] && !outSet[L]) chosen.push(L); }
      // remaining candidates by metric
      var cand = [];
      for (gi = 0; gi < groupsOrder.length; gi++) { L = groupsOrder[gi]; if (!inSet[L] && !outSet[L]) cand.push(L); }
      cand.sort(function (u, v) { return thirdMetric[v] - thirdMetric[u]; });
      for (var ci = 0; ci < cand.length && chosen.length < 8; ci++) chosen.push(cand[ci]);
      chosen = chosen.slice(0, 8);
      var keyArr = chosen.slice().sort();
      var key = keyArr.join('');
      var routing = annex[key]; // [8] third-letters in slot order A,B,D,E,G,I,K,L
      // map third slot match -> third team idx
      var slotTeam = {}; // matchNo -> teamIdx
      if (routing) {
        for (var s = 0; s < 8; s++) {
          var slotLetter = THIRD_SLOT_LETTERS[s];
          var thirdGroupLetter = routing[s];
          slotTeam[THIRD_SLOT_MATCH[slotLetter]] = thirdTeam[thirdGroupLetter];
        }
      } else {
        // Fallback (should not happen): assign chosen thirds to slots in order
        for (var s2 = 0; s2 < 8; s2++) {
          slotTeam[THIRD_SLOT_MATCH[THIRD_SLOT_LETTERS[s2]]] = thirdTeam[keyArr[s2]];
        }
      }

      // ---- knockouts ----
      var winners = {}; // matchNo -> teamIdx
      var ko = (fixes && fixes.koWin) || null;

      function slotTeamIdx(slot, matchNo) {
        switch (slot.k) {
          case 'W': return order[slot.g][0];
          case 'R': return order[slot.g][1];
          case 'T': return slotTeam[THIRD_SLOT_MATCH[slot.g]];
          case 'M': return winners[slot.m];
        }
        return -1;
      }

      for (var ki = 0; ki < KO_ORDER.length; ki++) {
        mIdx = KO_ORDER[ki];
        var spec = R32[mIdx] || LATER[mIdx];
        a = slotTeamIdx(spec[0], mIdx);
        b = slotTeamIdx(spec[1], mIdx);
        var w;
        if (a === undefined || a < 0) { w = b; }
        else if (b === undefined || b < 0) { w = a; }
        else {
          var forced = ko && ko[mIdx];
          if (forced !== undefined && forced !== null && (forced === a || forced === b)) w = forced;
          else w = (rnd() < pKO(a, b)) ? a : b;
        }
        winners[mIdx] = w;
        // stats: both participants reached this round; loser maxes out here
        if (acc) {
          // We tally "reached round X" by marking participants. Easier post-hoc below.
        }
      }

      // ---- stats: reached-round flags ----
      if (acc) {
        var reachedR32 = {}, reachedR16 = {}, reachedQF = {}, reachedSF = {}, reachedFinal = {};
        var t;
        for (var x1 = 0; x1 < R32_MATCHES.length; x1++) {
          var sp = R32[R32_MATCHES[x1]];
          t = slotTeamIdx(sp[0]); if (t >= 0 && t !== undefined) reachedR32[t] = 1;
          t = slotTeamIdx(sp[1]); if (t >= 0 && t !== undefined) reachedR32[t] = 1;
        }
        markReached(R16_MATCHES, reachedR16, winners);
        markReached(QF_MATCHES, reachedQF, winners);
        markReached(SF_MATCHES, reachedSF, winners);
        // final participants
        var fa = winners[101], fb = winners[102];
        if (fa !== undefined) reachedFinal[fa] = 1;
        if (fb !== undefined) reachedFinal[fb] = 1;
        for (t in reachedR32) acc.r32[t]++;
        for (t in reachedR16) acc.r16[t]++;
        for (t in reachedQF) acc.qf[t]++;
        for (t in reachedSF) acc.sf[t]++;
        for (t in reachedFinal) acc.finalA[t]++;
        var champ = winners[FINAL_MATCH];
        if (champ !== undefined) acc.champ[champ]++;
      }
      return winners[FINAL_MATCH];

      function markReached(matchList, obj, wins) {
        // a team "reached" a round if it is a participant of a match in that round,
        // i.e. it won its previous match. Participants = winners of feeder matches.
        for (var z = 0; z < matchList.length; z++) {
          var spec2 = LATER[matchList[z]];
          var ta = wins[spec2[0].m], tb = wins[spec2[1].m];
          if (ta !== undefined) obj[ta] = 1;
          if (tb !== undefined) obj[tb] = 1;
        }
      }
    }

    // Monte Carlo: returns probabilities per team for each stat
    function run(fixes, nSims, seed) {
      var rnd = mulberry32(seed >>> 0);
      var acc = {
        champ: new Float64Array(N), finalA: new Float64Array(N), sf: new Float64Array(N),
        qf: new Float64Array(N), r16: new Float64Array(N), r32: new Float64Array(N),
        wingroup: new Float64Array(N)
      };
      for (var s = 0; s < nSims; s++) simulate(fixes, rnd, acc);
      var out = { champ: [], finalA: [], sf: [], qf: [], r16: [], r32: [], wingroup: [] };
      for (var i = 0; i < N; i++) {
        out.champ[i] = acc.champ[i] / nSims;
        out.finalA[i] = acc.finalA[i] / nSims;
        out.sf[i] = acc.sf[i] / nSims;
        out.qf[i] = acc.qf[i] / nSims;
        out.r16[i] = acc.r16[i] / nSims;
        out.r32[i] = acc.r32[i] / nSims;
        out.wingroup[i] = acc.wingroup[i] / nSims;
      }
      return out;
    }

    // Champion-only fast tally (for calibration)
    function runChampOnly(fixes, nSims, seed) {
      var rnd = mulberry32(seed >>> 0);
      var champ = new Float64Array(N);
      var acc = null;
      for (var s = 0; s < nSims; s++) {
        var c = simulate(fixes, rnd, null);
        if (c !== undefined) champ[c]++;
      }
      var out = new Float64Array(N);
      for (var i = 0; i < N; i++) out[i] = champ[i] / nSims;
      return out;
    }

    return { run: run, runChampOnly: runChampOnly, simulate: simulate, pKO: pKO, pGroup: pGroup, KO_ORDER: KO_ORDER, R32: R32, LATER: LATER, THIRD_SLOT_MATCH: THIRD_SLOT_MATCH, THIRD_SLOT_LETTERS: THIRD_SLOT_LETTERS };
  }

  // Aggregate goal scorers from played matches into a Golden Boot leaderboard.
  // Pure (no DOM); shared by the browser tab and Node tests.
  // Input: array of game objects { home:{name}, away:{name}, scorers:[{name,side,og,pen}] }.
  // Own goals are excluded from a player's tally (standard Golden Boot rule); penalties count.
  // Names are normalised (lowercased, accents stripped, alphanumerics only) so the same
  // key joins ESPN scorer names to Polymarket player names. Returns rows sorted by goals desc.
  function normName(s) {
    return (s || '').toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  }
  function aggregateScorers(games) {
    var map = {};
    (games || []).forEach(function (g) {
      (g.scorers || []).forEach(function (sc) {
        if (sc.og) return; // own goal: not credited to the scorer
        var key = normName(sc.name);
        if (!key) return;
        var team = (sc.side === 'home') ? (g.home && g.home.name) : (g.away && g.away.name);
        if (!map[key]) map[key] = { key: key, name: sc.name, team: team || '', goals: 0, pens: 0 };
        map[key].goals++;
        if (sc.pen) map[key].pens++;
        if (!map[key].team && team) map[key].team = team;
      });
    });
    var arr = Object.keys(map).map(function (k) { return map[k]; });
    arr.sort(function (a, b) { return b.goals - a.goals || a.name.localeCompare(b.name); });
    return arr;
  }

  var api = { Engine: Engine, mulberry32: mulberry32, R32: R32, LATER: LATER,
    aggregateScorers: aggregateScorers, normName: normName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WCEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
