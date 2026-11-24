// matchups.js: CPU vs CPU round win rates for every character pair.
//   node tools/tests/matchups.js [stats|full] [rounds per pair]      (default: stats 120)
// Uses the default settings in config.js (not your in-browser Tuning).
// 'stats': both CPUs use the Standard brain, so only the stat trades differ (balance smoke test).
// 'full':  each CPU uses its character's personality (how the CPUs actually feel).
// Sample noise is about ±5% per pair at 160 rounds. These are smoke tests, not human balance.
const { load } = require('./harness');
const G = load();
const mode = process.argv[2] || 'stats', N = parseInt(process.argv[3] || '120', 10);

G.resetConfig(); G.CONFIG.roundsToWin = 1;
const ids = Object.keys(G.CHARACTERS);
const res = {};
const playRound = (a, b) => {
  G.resetConfig(); G.CONFIG.roundsToWin = 1;
  const g = G.cpuMatch({ chars: [a, b], levels: [0.7, 0.7], aiChars: mode === 'stats' ? ['standard', 'standard'] : undefined }, 200);
  return g.phase === 'matchEnd' ? g.matchWinner : -1;
};
const t0 = Date.now();
for (const a of ids) { res[a] = {}; for (const b of ids) res[a][b] = { w: 0, n: 0 }; }
for (let i = 0; i < ids.length; i++) for (let j = i; j < ids.length; j++) {
  const a = ids[i], b = ids[j];
  for (let k = 0; k < N; k++) {
    const swap = k % 2 === 1;               // alternate sides
    const w = swap ? playRound(b, a) : playRound(a, b);
    if (w < 0) continue;                    // drawn round
    const aWon = swap ? w === 1 : w === 0;
    res[a][b].n++; res[b][a].n++;
    if (aWon) res[a][b].w++; else res[b][a].w++;
  }
}
const name = id => G.CHARACTERS[id].name.slice(0, 10).padEnd(11);
console.log('Round win % of ROW vs COLUMN (' + mode + ' mode, ' + N + ' rounds per pair, ' + ((Date.now() - t0) / 1000).toFixed(0) + 's):');
console.log(''.padEnd(16) + ids.map(name).join(''));
for (const a of ids) {
  let line = name(a).padEnd(16), tw = 0, tn = 0;
  for (const b of ids) { const r = res[a][b]; line += (a === b ? '  —' : (Math.round(100 * r.w / r.n) + '%')).padEnd(11); if (a !== b) { tw += r.w; tn += r.n; } }
  console.log(line + '  overall ' + Math.round(100 * tw / tn) + '%');
}
