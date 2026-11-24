// replay.js: recording and replaying matches.
//
// How it works: the simulation is deterministic (fixed time step; the only randomness is in the
// CPU's decisions and in visual effects). So a match is fully described by its settings plus the
// input each fighter got on every frame. Recording = store those inputs; replaying = run a new
// Game with the same settings, feeding the stored inputs back in. Everything else (positions,
// hits, the winner) comes out identical.
//
// To make that exact, inputs are quantized when they're read (Replay.quantize, used by
// Controller.read): stick values to 1/1000, aim to an angle in 1/10000 rad. The stored numbers
// decode to exactly the same values the live game used.
//
// Frames are stored run-length encoded per fighter: [count, mx, my, aim, bits, count, ...].
// A replay goes invalid if Tuning changes mid-match (the settings it stores would be wrong).

const REPLAY_BITS = ['aim', 'forceLock', 'light', 'medium', 'heavy', 'block', 'dodge', 'plant',
  'lightPressed', 'mediumPressed', 'heavyPressed', 'blockPressed', 'dodgePressed', 'plantPressed', 'tag', 'tagPressed'];
const NO_AIM = 99999;

const Replay = {
  // Snap an input to the values a replay can reproduce exactly. Mutates and returns inp.
  quantize(inp) {
    inp.mx = Math.round(inp.mx * 1000) / 1000;
    inp.my = Math.round(inp.my * 1000) / 1000;
    if (inp.aim) {
      const ang = Math.round(Math.atan2(inp.ay, inp.ax) * 10000) / 10000;
      inp.ax = Math.cos(ang); inp.ay = Math.sin(ang);
    }
    return inp;
  },

  encode(inp) {
    let bits = 0;
    REPLAY_BITS.forEach((k, i) => { if (inp[k]) bits |= 1 << i; });
    const aim = inp.aim ? Math.round(Math.atan2(inp.ay, inp.ax) * 10000) : NO_AIM;
    return [Math.round(inp.mx * 1000), Math.round(inp.my * 1000), aim, bits];
  },

  decode(mx, my, aim, bits) {
    const inp = { ...NEUTRAL_INPUT };
    REPLAY_BITS.forEach((k, i) => { inp[k] = !!(bits & (1 << i)); });
    inp.mx = mx / 1000; inp.my = my / 1000;
    if (aim !== NO_AIM) { const ang = aim / 10000; inp.ax = Math.cos(ang); inp.ay = Math.sin(ang); }
    return inp;
  },

  // A replay file (plain object, saved as JSON).
  toFile(game) {
    return {
      game: 'LUNGE', version: 2, date: new Date().toISOString(),
      config: game.recConfig, setup: game.setup, devices: game.devices,
      frames: game.rec.map(r => r.data), reads: game.readCount,
      result: { winner: game.matchWinner, wins: game.wins.slice() },
    };
  },

  valid(file) {
    // version 2: tag matches also store the waiting partners' inputs (4 streams)
    return file && file.game === 'LUNGE' && (file.version === 1 || file.version === 2) && Array.isArray(file.frames)
      && (file.frames.length === 2 || file.frames.length === 4) && file.config;
  },

  // Download a replay file (works when the game is opened straight from a folder).
  save(game) {
    const blob = new Blob([JSON.stringify(Replay.toFile(game))], { type: 'application/json' });
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    a.href = URL.createObjectURL(blob);
    a.download = `lunge-replay-${stamp}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },

  // Start a Game that plays back `frames` (from a file or the live recording).
  // opts.silent: no sounds. Returns the game.
  play(config, setup, devices, frames, opts = {}) {
    const g = new Game();
    g.silent = !!opts.silent;
    g.start(devices[0], devices[1], { ...setup, replay: frames });
    return g;
  },

  // K.O. replay: re-run the match so far, silently and fast, up to `before` seconds before the
  // K.O., then hand the game back to be played at normal speed. Returns null if it can't.
  buildKO(game, before = 3) {
    const koRead = game.koRead;
    if (koRead == null) return null;
    const g = Replay.play(game.recConfig, game.setup, game.devices, game.rec.map(r => r.data), { silent: true });
    g.isKOReplay = true;
    const startAt = Math.max(0, koRead - Math.round(before / WORLD.step));
    let guard = 0;
    while (g.readCount < startAt && guard++ < 1e6) g.update(WORLD.step);
    g.fx.clear();
    g.silent = false;
    g.koRead = koRead;
    return g;
  },
};

// Writes one fighter's inputs, run-length encoded.
class InputRecorder {
  constructor() { this.data = []; this.last = null; }
  push(inp) {
    const e = Replay.encode(inp), d = this.data, L = this.last;
    if (L && L[0] === e[0] && L[1] === e[1] && L[2] === e[2] && L[3] === e[3]) d[d.length - 5]++;
    else { d.push(1, e[0], e[1], e[2], e[3]); this.last = e; }
  }
}

// Plays one fighter's recorded inputs back, in place of a human or CPU controller.
class ReplayController {
  constructor(data) { this.data = data; this.i = 0; this.left = 0; this.cur = null; }
  reset() {}
  read() {
    const d = this.data;
    if (this.left <= 0) {
      if (this.i >= d.length) return { ...NEUTRAL_INPUT };   // recording ran out
      this.left = d[this.i];
      this.cur = Replay.decode(d[this.i + 1], d[this.i + 2], d[this.i + 3], d[this.i + 4]);
      this.i += 5;
    }
    this.left--;
    return { ...this.cur };
  }
}
