// harness.js: loads the game's code into Node (no browser) so tests can drive it directly.
//   const G = require('./harness').load();   // G.Game, G.Fighter, G.CONFIG, G.resetConfig, ...
// The game files are plain browser scripts; they run inside one shared vm context, in the same
// order as index.html (minus menu/render/main, which need a browser).
const fs = require('fs'), path = require('path'), vm = require('vm');

const GAME_DIR = path.resolve(__dirname, '..', '..');
const FILES = ['util', 'config', 'arena', 'characters', 'input', 'effects', 'stats', 'sound', 'replay', 'training', 'fighter', 'ai', 'game'];

function load(dir = GAME_DIR) {
  const ctx = vm.createContext({ console, Math, Date, JSON });
  for (const f of FILES) {
    const file = path.join(dir, 'js', f + '.js');
    if (!fs.existsSync(file)) continue;   // (sound.js is optional for older versions)
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  }
  // Top-level const/class names live in the context's lexical scope: pull them out by name.
  const names = ['WORLD', 'CONFIG', 'CONFIG_SCHEMA', 'resetConfig', 'applyConfigObject', 'maxHp', 'fixedAttack', 'ATTACK_KINDS',
    'ATTACK_BEATS', 'MOVE_PRESETS', 'applyMovePreset', 'Arena', 'ARENAS', 'CHARACTERS', 'characterConfig', 'describeTrades',
    'Game', 'Fighter', 'NEUTRAL_INPUT', 'MatchStats', 'AIController', 'lerp', 'clamp', 'Scorecard', 'Replay', 'InputRecorder', 'ReplayController', 'Training', 'DummyController', 'TRAINING_PADS'];
  const G = vm.runInContext('({' + names.map(n => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(',') + '})', ctx);
  G.ctx = ctx;
  // The checks were written for the rectangle arena (lots of room); keep them on it unless a test picks another.
  const reset = G.resetConfig;
  G.resetConfig = () => { reset(); G.CONFIG.arena = 'square'; };
  G.STEP = G.WORLD.step;
  G.I = o => ({ ...G.NEUTRAL_INPUT, ...o });
  G.press = (k, extra = {}) => G.I({ [k]: true, [k + 'Pressed']: true, ...extra });

  // A fresh 1v1 with both fighters placed by hand. Returns { g, a, b }.
  G.setup = (opts = {}) => {
    G.resetConfig(); Object.assign(G.CONFIG, opts.cfg || {});
    const g = new G.Game(); g.start('cpu', 'cpu', opts.setup || {}); g.phase = 'fight';
    const [a, b] = g.fighters;
    a.x = opts.ax ?? 400; a.y = 400; b.x = opts.bx ?? 600; b.y = 400; a.facing = 0; b.facing = Math.PI;
    return { g, a, b };
  };

  // One simulation step for both fighters with given inputs, plus hits/bodies/walls/events.
  G.tick = (g, ia = G.NEUTRAL_INPUT, ib = G.NEUTRAL_INPUT) => {
    const [a, b] = g.fighters;
    a.update(G.STEP, ia, b); b.update(G.STEP, ib, a);
    g.resolveHits(); g.resolveBodies(); g.resolveWalls(); g.drainEvents(); g.hitstop = 0;
  };

  // Run a full CPU vs CPU match. Returns the game (check g.phase === 'matchEnd').
  G.cpuMatch = (setup = {}, maxSeconds = 900, each) => {
    const g = new G.Game(); g.start('cpu', 'cpu', setup);
    let n = 0;
    while (g.phase !== 'matchEnd' && n < 120 * maxSeconds) { g.update(G.STEP); n++; if (each) each(g); }
    g.seconds = n / 120;
    return g;
  };
  return G;
}

// Tiny test runner: check(name, ok, detail). Prints a summary and exits non-zero on failures.
function runner(title) {
  let pass = 0, fail = 0; const fails = [];
  const check = (name, ok, detail = '') => {
    if (ok) pass++; else { fail++; fails.push(name); }
    console.log((ok ? '  ok    ' : '  FAIL  ') + name + (detail ? '   (' + detail + ')' : ''));
  };
  const section = s => console.log('\n' + s);
  const done = () => {
    console.log('\n' + title + ': ' + pass + ' passed, ' + fail + ' failed' + (fail ? '\n  failed: ' + fails.join('; ') : ''));
    if (fail) process.exitCode = 1;
  };
  console.log(title);
  return { check, section, done };
}

module.exports = { load, runner, GAME_DIR };
