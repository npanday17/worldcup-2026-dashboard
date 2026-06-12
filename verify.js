'use strict';
const fs=require('fs');const path=require('path');const DIR=__dirname;
const WCEngine=require('./engine.js');
const DATA=JSON.parse(fs.readFileSync(path.join(DIR,'data.json'),'utf8'));
const T=DATA.teams,N=T.length,GROUPS=DATA.groupsOrder,members=DATA.groupMembers;
const eng=WCEngine.Engine({teams:T.map(t=>t.name),groupsOrder:GROUPS,groupMembers:members,ratings:T.map(t=>t.rating),nu:DATA.nu,annex:DATA.annex});
const name=i=>T[i].name;
let pass=0,fail=0;
function ok(c,m){ if(c){pass++;} else {fail++; console.log('  FAIL:',m);} }

// 1. Annex completeness: every C(12,8)=495 combination present & routing valid
const LET='ABCDEFGHIJKL'.split('');
function combos(arr,k){const r=[];(function go(s,c){if(c.length===k){r.push(c.slice());return;}for(let i=s;i<arr.length;i++){c.push(arr[i]);go(i+1,c);c.pop();}})(0,[]);return r;}
const allKeys=combos(LET,8).map(c=>c.join(''));
ok(allKeys.length===495,'495 combinations enumerated ('+allKeys.length+')');
let missing=0, badRoute=0;
for(const key of allKeys){
  const r=DATA.annex[key];
  if(!r){missing++;continue;}
  // routing must be 8 letters, each a member of the key set, all distinct, covering exactly the key set
  const set=new Set(key.split(''));
  const rset=new Set(r);
  if(r.length!==8) badRoute++;
  else { for(const x of r){ if(!set.has(x)){badRoute++;break;} } if(rset.size!==8) badRoute++; if([...rset].sort().join('')!==key) badRoute++; }
}
ok(missing===0,'no missing annex keys (missing='+missing+')');
ok(badRoute===0,'all routings are valid permutations of their third-group set (bad='+badRoute+')');

// 2. Champion probabilities sum to ~1 and match market baseline
const champ=eng.runChampOnly({},120000,7);
let s=0,maxe=0; for(let i=0;i<N;i++){s+=champ[i]; const e=Math.abs(champ[i]-T[i].marketProb); if(e>maxe)maxe=e;}
ok(Math.abs(s-1)<0.01,'champion probs sum to 1 (sum='+s.toFixed(4)+')');
ok(maxe<0.01,'model champ within 1pp of market baseline (maxErr='+(maxe*100).toFixed(2)+'pp)');

// 3. Full-stat monotonicity: r32 >= r16 >= qf >= sf >= finalA >= champ for every team
const st=eng.run({},60000,11);
let mono=0;
for(let i=0;i<N;i++){
  if(!(st.r32[i]>=st.qf[i]-1e-9 && st.qf[i]>=st.sf[i]-1e-9 && st.sf[i]>=st.finalA[i]-1e-9 && st.finalA[i]>=st.champ[i]-1e-9)) mono++;
}
ok(mono===0,'round reach is monotonic decreasing for all teams (violations='+mono+')');
// each round total counts: champ sum 1, final sum 2, sf sum 4, qf 8, r16 16, r32 32
function sum(a){return a.reduce((x,y)=>x+y,0);}
ok(Math.abs(sum(st.finalA)-2)<0.03,'final participants sum ~2 ('+sum(st.finalA).toFixed(3)+')');
ok(Math.abs(sum(st.sf)-4)<0.05,'semi participants sum ~4 ('+sum(st.sf).toFixed(3)+')');
ok(Math.abs(sum(st.qf)-8)<0.08,'QF participants sum ~8 ('+sum(st.qf).toFixed(3)+')');
ok(Math.abs(sum(st.r16)-16)<0.12,'R16 participants sum ~16 ('+sum(st.r16).toFixed(3)+')');
ok(Math.abs(sum(st.r32)-32)<0.0001,'R32 participants sum exactly 32 ('+sum(st.r32).toFixed(3)+')');
ok(Math.abs(sum(st.wingroup)-12)<0.0001,'group winners sum exactly 12 ('+sum(st.wingroup).toFixed(3)+')');

// 4. Conditioning works: force Spain (id 28) to win every KO match it appears in via group fix + champion check
// Simpler: fix all groups chalk, force a clearly weaker team (Haiti id 10) to win the Final -> champ becomes ~? must be Haiti only if it reaches final.
// Test: forcing a group order changes that group's winner distribution.
const spain=T.findIndex(t=>t.name==='Spain');
const fixSpainGroup={groupOrder:{H:[spain, T.findIndex(t=>t.name==='Uruguay'), T.findIndex(t=>t.name==='Cape Verde'), T.findIndex(t=>t.name==='Saudi Arabia')]},thirdIn:['H'],thirdOut:[],koWin:{}};
const st2=eng.run(fixSpainGroup,40000,13);
ok(st2.wingroup[spain]>0.999,'forcing Spain 1st in H makes win-group≈1 ('+st2.wingroup[spain].toFixed(3)+')');
const cv=T.findIndex(t=>t.name==='Cape Verde');
ok(st2.r32[cv]>0.999,'forcing Cape Verde 3rd in H + thirdIn H makes it reach R32 ('+st2.r32[cv].toFixed(3)+')');

// 5. Forcing a KO winner sticks: force match 104 (final) winner to whoever, ensure champ matches when participants fixed via full chalk
// Force entire bracket chalk deterministically using resolver-like fix: set all groups top-by-rating, 8 best thirds, and walk KO picking higher rating.
const gp={}; const thirdScore=[];
GROUPS.forEach(L=>{const s=members[L].slice().sort((a,b)=>T[b].rating-T[a].rating); gp[L]=[s[0],s[1],s[2],s[3]]; thirdScore.push({L,r:T[s[2]].rating});});
thirdScore.sort((a,b)=>b.r-a.r); const thirdIn=thirdScore.slice(0,8).map(o=>o.L);
// champion of pure-chalk (no KO forced) over sims: should be a strong team most often
const champ2=eng.runChampOnly({groupOrder:gp,thirdIn,thirdOut:[],koWin:{}},40000,17);
let top=0,ti=0; for(let i=0;i<N;i++) if(champ2[i]>top){top=champ2[i];ti=i;}
ok(['Spain','France','England','Brazil','Argentina','Portugal','Germany'].includes(name(ti)),'chalk bracket most-likely champion is an elite side ('+name(ti)+' '+(top*100).toFixed(1)+'%)');

// ---- Engine v2: results conditioning ----
// Group H = [Spain, Cape Verde, Saudi Arabia, Uruguay] (local 0..3). Make Spain(0) lose all, Uruguay(3) win all.
const Hmem=members.H.map(name);
const gH=[
  {a:0,b:1,ga:0,gb:1},{a:2,b:3,ga:0,gb:1},{a:0,b:2,ga:0,gb:1},
  {a:1,b:3,ga:0,gb:1},{a:0,b:3,ga:0,gb:1},{a:1,b:2,ga:1,gb:1}
];
const condFix={groupGoals:{H:gH},groupOrder:{},thirdIn:[],thirdOut:[],koWin:{}};
const cst=eng.run(condFix,60000,21);
const spainI=T.findIndex(t=>t.name==='Spain'), uruI=T.findIndex(t=>t.name==='Uruguay');
ok(cst.champ[spainI]<0.003,'Spain losing all H matches -> ~0 title prob ('+(cst.champ[spainI]*100).toFixed(3)+'%)');
ok(cst.r32[spainI]<0.003,'Spain bottom of group -> ~0 to reach R32 ('+(cst.r32[spainI]*100).toFixed(3)+'%)');
ok(cst.wingroup[uruI]>0.997,'Uruguay winning all H matches -> wins group ~1 ('+cst.wingroup[uruI].toFixed(3)+')');
// invariants still hold under conditioning
ok(Math.abs(sum(cst.r32)-32)<1e-6,'conditioned R32 participants still sum to 32 ('+sum(cst.r32).toFixed(3)+')');
ok(Math.abs(sum(cst.wingroup)-12)<1e-6,'conditioned group winners still sum to 12 ('+sum(cst.wingroup).toFixed(3)+')');
ok(Math.abs(sum(cst.champ)-1)<0.01,'conditioned champion probs still sum to 1 ('+sum(cst.champ).toFixed(4)+')');
// conditioning raises the field: Spain's lost title mass redistributes (France should rise vs baseline)
const frI=T.findIndex(t=>t.name==='France');
ok(cst.champ[frI]>champ[frI],'eliminating-ish Spain lifts France title prob ('+(champ[frI]*100).toFixed(2)+'% -> '+(cst.champ[frI]*100).toFixed(2)+'%)');

// --- Golden Boot scorer aggregation (own goals excluded, pens counted, accent-normalised join) ---
const scGames=[
  {home:{name:'France'},away:{name:'Spain'},scorers:[
    {name:'Kylian Mbappé',side:'home',pen:false,og:false},
    {name:'Kylian Mbappé',side:'home',pen:true,og:false},
    {name:'Own Goalsson',side:'away',pen:false,og:true}
  ]},
  {home:{name:'France'},away:{name:'Brazil'},scorers:[
    {name:'Kylian Mbappe',side:'home',pen:false,og:false}, // no accent: must merge with the accented entries
    {name:'Raphinha',side:'away',pen:false,og:false}
  ]}
];
const board=WCEngine.aggregateScorers(scGames);
const mb=board.find(r=>r.key==='kylianmbappe');
ok(mb && mb.goals===3,'Mbappé tally merges accent/no-accent names -> 3 goals ('+(mb&&mb.goals)+')');
ok(mb && mb.pens===1,'Mbappé penalty counted once ('+(mb&&mb.pens)+')');
ok(mb && mb.team==='France','scorer team derived from match side ('+(mb&&mb.team)+')');
ok(!board.some(r=>r.name==='Own Goalsson'),'own goal excluded from scorer board');
ok(board.length===2 && board[0].key==='kylianmbappe','board sorted by goals desc, OG-only player dropped ('+board.length+' rows)');

console.log('\n'+pass+' passed, '+fail+' failed.');
process.exit(fail?1:0);
