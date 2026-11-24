// report.js: numbers to watch (not pass/fail). How CPU matches actually play out.
//   node tools/tests/report.js [matches per skill level]     (default 12)
// Useful after a balance change: compare before/after. Remember the CPU has its own habits,
// so this shows what the *rules* allow, not what humans will do.
const { load } = require('./harness');
const G = load();
const M = parseInt(process.argv[2] || '12', 10);
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '-';

for (const lvl of [0.4, 0.7, 0.95]) {
  const T = { thrown: { light: 0, medium: 0, heavy: 0 }, landed: { light: 0, medium: 0, heavy: 0 }, whiffed: { light: 0, medium: 0, heavy: 0 } };
  const S = {}; let secs = 0, rounds = 0, kos = 0, dmg = { light: 0, medium: 0, heavy: 0 };
  for (let m = 0; m < M; m++) {
    G.resetConfig();
    let prev = 'intro';
    const g = G.cpuMatch({ levels: [lvl, lvl] }, 900, g => {
      if (g.phase === 'roundEnd' && prev !== 'roundEnd') { rounds++; if (g.endReason === 'K.O.') kos++; }
      prev = g.phase;
    });
    secs += g.seconds;
    for (const p of g.mstats.p) for (const k of G.ATTACK_KINDS) { T.thrown[k] += p.thrown[k]; T.landed[k] += p.landed[k]; T.whiffed[k] += p.whiffed[k]; }
    for (const k in g.stats) S[k] = (S[k] || 0) + g.stats[k];
  }
  for (const k of G.ATTACK_KINDS) dmg[k] = (S['hits_' + k] || 0) * G.CONFIG[k + 'Damage'];
  const totDmg = dmg.light + dmg.medium + dmg.heavy;
  console.log(`\nCPU skill ${lvl}: ${M} matches, avg ${(secs / M).toFixed(0)}s, ${rounds} rounds (${kos} KO)`);
  console.log('           thrown  landed  hit-rate  share of damage');
  for (const k of G.ATTACK_KINDS)
    console.log(`  ${k.padEnd(7)}  ${String(T.thrown[k]).padStart(6)}  ${String(S['hits_' + k] || 0).padStart(6)}  ${pct(S['hits_' + k] || 0, T.thrown[k]).padStart(8)}  ${pct(dmg[k], totDmg).padStart(8)}`);
  console.log(`  blocks ${S.blocks}  parries ${S.parries}  guard breaks ${S.guardBreaks}  armor ${S.armorHits}  counters ${S.counters}  clashes ${S.clashes}  splats ${S.splats}  steps ${S.steps}`);
}
