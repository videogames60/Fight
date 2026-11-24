// checks.js: pass/fail checks of the core rules. Run from the game folder:
//   node tools/tests/checks.js
// Every check states the rule it protects. A FAIL means a rule changed: either a bug,
// or an intended change that needs the check (and DESIGN.md) updated.
const { load, runner } = require('./harness');
const G = load();
const { check, section, done } = runner('LUNGE rule checks');
const { STEP, I, press, clamp } = G;

// ---------------------------------------------------------------- attacks
section('Attacks');
{
  // Measured reach (furthest center distance a standing attack hits) matches fixedRange().
  const reach = kind => {
    let best = 0;
    for (let d = 60; d < 400; d += 2) {
      const { g, a, b } = G.setup({ bx: 400 + d });
      a.startFixed(kind);
      let hit = false;
      for (let t = 0; t < 0.8 && !hit; t += STEP) { a.update(STEP, G.NEUTRAL_INPUT, b); if (g.checkHit(a, b)) hit = true; }
      if (hit) best = d;
    }
    return best;
  };
  const f = G.setup().a, r = {};
  for (const k of G.ATTACK_KINDS) {
    r[k] = reach(k);
    check(`${k} reaches what the range rings show`, Math.abs(r[k] - f.fixedRange(k)) <= 6, `measured ${r[k]}, ring ${Math.round(f.fixedRange(k))}`);
  }
  check('boxing layout: light reaches furthest, heavy shortest', r.light > r.medium && r.medium > r.heavy, `${r.light} / ${r.medium} / ${r.heavy}`);
}
{
  // Triangle: both start at the same moment, 95px apart (inside every range).
  const duel = (ka, kb) => {
    const { g, a, b } = G.setup({ bx: 495 });
    a.startFixed(ka); b.startFixed(kb);
    const hp0 = [a.hp, b.hp];
    for (let t = 0; t < 1; t += STEP) {
      G.tick(g);
      if (a.state === 'hitstun' || b.state === 'hitstun' || g.stats.clashes) break;
    }
    // winner = who dealt more damage (a heavy beats a light *through* its armor, taking armorDamage)
    const da = hp0[0] - a.hp, db = hp0[1] - b.hp;
    return g.stats.clashes ? 'clash' : db > da ? 'a' : da > db ? 'b' : 'none';
  };
  for (const [x, y] of [['light', 'medium'], ['heavy', 'light'], ['medium', 'heavy']])
    check(`triangle: ${x} beats ${y}`, duel(x, y) === 'a' && duel(y, x) === 'b');
  for (const k of G.ATTACK_KINDS) check(`same attack at once (${k}) = clash`, duel(k, k) === 'clash');
}
{
  // Whiffs can be punished: attacker misses by 15px; defender reacts 0.2s into their recovery.
  const punish = (whiff, pun) => {
    const { g, a, b } = G.setup();
    b.x = a.x + a.fixedRange(whiff) + 15;
    a.startFixed(whiff);
    let hit = false, sent = false;
    for (let t = 0; t < 1.5 && !hit; t += STEP) {
      const ib = (!sent && a.state === 'recovery' && a.t >= 0.2) ? (sent = true, press(pun)) : G.NEUTRAL_INPUT;
      a.update(STEP, G.NEUTRAL_INPUT, b); b.update(STEP, ib, a);
      if (g.checkHit(b, a)) hit = true;
    }
    return hit;
  };
  check('a whiffed light can be punished by a light', punish('light', 'light'));
  check('a whiffed medium can be punished by a medium', punish('medium', 'medium'));
  check('a whiffed heavy can be punished by a medium', punish('heavy', 'medium'));
}
{
  // After a clean hit the hitter acts first, and knockback separates the players.
  for (const k of G.ATTACK_KINDS) {
    const { g, a, b } = G.setup({ bx: 480 });
    a.startFixed(k);
    let hit = false, tA = null, tB = null, t = 0;
    for (; t < 3; t += STEP) {
      a.update(STEP, G.NEUTRAL_INPUT, b); b.update(STEP, G.NEUTRAL_INPUT, a);
      if (!hit && g.checkHit(a, b)) { g.applyHit(a, b); hit = true; t = 0; }
      g.resolveBodies(); g.resolveWalls(); g.hitstop = 0;
      if (hit && tA === null && a.state === 'idle') tA = t;
      if (hit && tB === null && b.state === 'idle') { tB = t; break; }
    }
    const gap = Math.hypot(b.x - a.x, b.y - a.y);
    check(`after a ${k} hit, the hitter acts first`, tA !== null && tB !== null && tA < tB, `by ${((tB - tA) || 0).toFixed(2)}s, gap ${gap.toFixed(0)}px`);
  }
  // No true combos: after any hit, a defender holding block blocks the hitter's fastest follow-up.
  for (const k of G.ATTACK_KINDS) {
    const { g, a, b } = G.setup({ bx: 480 });
    a.startFixed(k);
    let landed = 0, followed = false;
    const blk = I({ block: true, aim: true, ax: -1, ay: 0 });
    for (let t = 0; t < 2; t += STEP) {
      const h0 = g.stats.hits;
      const ia = (landed && !followed && a.state === 'idle') ? (followed = true, press('light', { aim: true, ax: 1, ay: 0 })) : G.NEUTRAL_INPUT;
      G.tick(g, ia, landed ? blk : G.NEUTRAL_INPUT);
      if (g.stats.hits > h0) landed++;
    }
    check(`no true combo: after a ${k} hit, holding block stops the follow-up jab`, landed === 1, `${landed} hits`);
  }
}
{
  // Counter hit: hitting someone in their windup adds damage.
  const { g, a, b } = G.setup({ bx: 495 });
  b.startFixed('heavy'); b.atk.startup = 9;          // b stays in windup
  G.CONFIG.armor = false;                            // so a light can land on the windup
  a.startFixed('light');
  const hp0 = b.hp;
  for (let t = 0; t < 0.5 && b.hp === hp0; t += STEP) G.tick(g);
  check('counter hit adds counterBonus damage', hp0 - b.hp === G.CONFIG.lightDamage + G.CONFIG.counterBonus, `dmg ${hp0 - b.hp}`);
}

// ---------------------------------------------------------------- block / parry
section('Block and parry');
// A attacks B from inside range; B's block button follows blockFn(t). Returns { outcome, dmg, stam, first }.
const exchange = (kind, blockFn, opts = {}) => {
  const { g, a, b } = G.setup();
  b.x = a.x + a.fixedRange(kind) - 20; if (opts.bFacing !== undefined) b.facing = opts.bFacing;
  if (opts.stam !== undefined) b.stamina = opts.stam;
  const s0 = b.stamina, hp0 = b.hp, st0 = { ...g.stats };
  a.startFixed(kind);
  let outcome = null, freeA = null, freeB = null, prev = false;
  for (let t = 0; t < 2.5; t += STEP) {
    const blk = blockFn(t);
    const ib = I({ block: blk, blockPressed: blk && !prev, aim: true, ax: Math.cos(b.facing), ay: Math.sin(b.facing) }); prev = blk;
    G.tick(g, G.NEUTRAL_INPUT, ib);
    if (!outcome) for (const k of ['parries', 'guardBreaks', 'blocks', 'hits', 'armorHits']) if (g.stats[k] > st0[k]) { outcome = k; t = 0; break; }
    if (outcome) {
      if (freeA === null && a.state === 'idle') freeA = t;
      if (freeB === null && (b.state === 'idle' || (b.state === 'block' && outcome !== 'parries'))) freeB = t;
      if (freeA !== null && freeB !== null) break;
    }
  }
  return { outcome, dmg: hp0 - b.hp, stam: s0 - b.stamina, first: freeA === null || freeB === null ? '?' : freeB < freeA ? 'blocker' : freeA < freeB ? 'attacker' : 'even' };
};
const impactOf = k => { const A = G.fixedAttack(k); return A.startup + A.travel / A.speed * 0.6; };
for (const k of ['light', 'medium']) {
  const r = exchange(k, () => true);
  check(`held block stops a ${k}: no damage, blocker acts first`, r.outcome === 'blocks' && r.dmg === 0 && r.first === 'blocker', JSON.stringify(r));
}
{
  const r = exchange('heavy', () => true);
  check('heavy breaks a held guard', r.outcome === 'guardBreaks' && r.dmg === G.CONFIG.guardBreakDamage, JSON.stringify(r));
}
for (const k of G.ATTACK_KINDS) {
  const imp = impactOf(k);
  const r = exchange(k, t => t >= imp - 0.05 && t < imp + 0.3);
  check(`pressing block just before a ${k} lands parries it`, r.outcome === 'parries' && r.dmg === 0, JSON.stringify(r));
}
check('block only covers the front (hit from the side lands)', exchange('medium', () => true, { bFacing: Math.PI / 2 }).outcome === 'hits');
check('blocking with too little stamina = guard break', exchange('medium', () => true, { stam: 5 }).outcome === 'guardBreaks');
{
  // Anti-mash: a press within parryCooldown of the previous one gives no parry.
  const imp = impactOf('medium');
  const r = exchange('medium', t => (t < 0.03) || (t >= imp - 0.05 && t < imp + 0.3));   // first press right at the start
  const mashed = imp - 0.05 < G.CONFIG.parryCooldown;
  check('anti-mash: re-pressing within the cooldown just blocks', !mashed || r.outcome === 'blocks', JSON.stringify(r));
}
{
  // Block held (or pressed) during a recovery comes out as a plain block: no parry window.
  const { g, a, b } = G.setup({ bx: 900 });
  a.startFixed('light');
  let parryOpened = false, blocked = false, prev = false;
  for (let t = 0; t < 1; t += STEP) {
    const blk = a.state !== 'startup' && a.state !== 'active';   // hold block from the start of the recovery on
    a.update(STEP, I({ block: blk, blockPressed: blk && !prev }), b); prev = blk;
    if (a.state === 'block') { blocked = true; if (a.parrying) parryOpened = true; }
  }
  check('block pressed during a recovery = plain block, no parry window', blocked && !parryOpened);
  const s = G.setup({ bx: 900 });
  s.a.update(STEP, I({ block: true, blockPressed: true }), s.b);
  check('a fresh press while free opens the parry window', s.a.parrying);
}

// ---------------------------------------------------------------- input buffer
section('Input buffer');
{
  // Whiff a light, press another light `early` seconds before the recovery ends.
  const buffered = (early, buf) => {
    const { a, b } = G.setup({ bx: 900, cfg: { attackBuffer: buf } });
    a.startFixed('light');
    let sent = false, recEnd = null, fired = null;
    for (let t = 0; t < 2; t += STEP) {
      let inp = G.NEUTRAL_INPUT;
      if (a.state === 'recovery' && !sent && a.recoverDur - a.t <= early) { inp = press('light'); sent = true; }
      const was = a.state; a.update(STEP, inp, b);
      if (sent && recEnd === null && was === 'recovery' && a.state !== 'recovery') recEnd = t;
      if (recEnd !== null && a.state === 'startup') { fired = t; break; }
    }
    return fired === null ? null : fired - recEnd;
  };
  const buf = G.CONFIG_SCHEMA.find(s => s.key === 'attackBuffer').def;
  const r1 = buffered(buf / 2, buf);
  check(`a press ${buf / 2}s early comes out as soon as you're free`, r1 !== null && r1 <= STEP + 1e-9, r1 === null ? 'lost' : `${(r1 * 1000).toFixed(0)}ms`);
  check(`a press ${(buf + 0.05).toFixed(2)}s early is dropped`, buffered(buf + 0.05, buf) === null);
  check('buffer 0: an early press is dropped', buffered(0.05, 0) === null);
  const s = G.setup({ bx: 900, cfg: { attackBuffer: 0 } });
  s.a.update(STEP, press('light'), s.b);
  check('buffer 0: a press while free still works', s.a.state === 'startup');
  check(`default buffers are 0.1s`, buf === 0.1 && G.CONFIG_SCHEMA.find(s => s.key === 'stepBuffer').def === 0.1);
}

// ---------------------------------------------------------------- movement
section('Step, plant, movement');
{
  // Jab vs step as movement: the step gives control back sooner.
  const run = start => {
    const { a, b } = G.setup({ bx: 1100 });
    const x0 = a.x; start(a, b);
    let t = STEP;
    while (a.state !== 'idle' && t < 2) { a.update(STEP, G.NEUTRAL_INPUT, b); t += STEP; }
    return { t, d: a.x - x0 };
  };
  const jab = run(a => a.startFixed('light'));
  const step = run((a, b) => a.update(STEP, I({ dodge: true, dodgePressed: true, mx: 1 }), b));
  check('a step gives control back sooner than a whiffed jab', step.t < jab.t, `step ${step.t.toFixed(2)}s/${step.d.toFixed(0)}px, jab ${jab.t.toFixed(2)}s/${jab.d.toFixed(0)}px`);
  check('steps are not invulnerable', (() => {
    const { g, a, b } = G.setup({ bx: 495 });
    b.update(STEP, I({ dodge: true, dodgePressed: true, mx: -1 }), a);   // step into the jab
    a.startFixed('light');
    const hp0 = b.hp; for (let t = 0; t < 0.15; t += STEP) G.tick(g);
    return b.hp < hp0;
  })());
}
{
  const { a, b } = G.setup({ bx: 1100 });
  for (let t = 0; t < 1; t += STEP) a.update(STEP, I({ mx: 1 }), b);
  a.update(STEP, I({ plantPressed: true, plant: true }), b);
  check('plant stops you dead', a.speed === 0 && a.state === 'plant');
}
{
  const { a, b } = G.setup({ ax: 600, bx: 900 });
  const fwd = (() => { const s = G.setup({ ax: 600, bx: 900 }); for (let t = 0; t < 1; t += STEP) s.a.update(STEP, I({ mx: 1 }), s.b); return s.a.x - 600; })();
  for (let t = 0; t < 1; t += STEP) a.update(STEP, I({ mx: -1 }), b);
  check('walking away is slower than walking in', 600 - a.x < fwd, `away ${(600 - a.x).toFixed(0)}px, in ${fwd.toFixed(0)}px in 1s`);
}

// ---------------------------------------------------------------- walls
section('Walls and arenas');
{
  // Wall splat: once per combo. b starts next to the right wall; a keeps throwing heavies the
  // moment it's free, for as long as b never gets control back (never idle).
  const { g, a, b } = G.setup();
  const B = G.Arena.bounds();
  b.x = B.x + B.w - b.R - 40; a.x = b.x - 90;
  let hits = 0, h0 = 0;
  for (let t = 0; t < 4; t += STEP) {
    if (a.state === 'idle') { a.x = Math.min(a.x, b.x - 70); a.facing = Math.atan2(b.y - a.y, b.x - a.x); a.startFixed('heavy'); a.stamina = 100; }
    h0 = g.stats.hits; G.tick(g);
    if (g.stats.hits > h0) hits++;
    if (hits && b.state === 'idle') break;
  }
  check('wall splat happens at most once per combo', g.stats.splats === 1, `${g.stats.splats} splats, ${hits} hits before b got control`);
}
for (const id in G.ARENAS) {
  G.resetConfig(); G.CONFIG.arena = id; G.CONFIG.roundsToWin = 1;
  // every frame, each fighter's center must stay inside the arena bounds
  const B = G.Arena.bounds();
  let oob = 0;
  const g = G.cpuMatch({}, 300, g => { for (const f of g.fighters) if (f.x < B.x || f.x > B.x + B.w || f.y < B.y || f.y > B.y + B.h) oob++; });
  check(`arena ${id}: CPU match finishes, fighters stay inside`, g.phase === 'matchEnd' && oob === 0, `${g.seconds.toFixed(0)}s`);
}
check('the default arena is the square Ring', G.CONFIG_SCHEMA.find(x => x.key === 'arena').def === 'ring' && G.ARENAS.ring.frame.w === G.ARENAS.ring.frame.h);
{
  // saved settings from before v26 that had the old "Square" (now Rectangle) move to the new Ring
  G.resetConfig();
  G.applyConfigObject({ arena: 'square' });   // (applyConfigObject alone doesn't migrate; loadConfig does)
  const before = G.CONFIG.arena;
  const store = { 'lunge-config-v12': JSON.stringify({ arena: 'square', moveSpeed: 270 }) };
  G.ctx.localStorage = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } };
  G.ctx.loadConfig ? 0 : 0;
  require('vm').runInContext('loadConfig()', G.ctx);
  check('old saved "Square" arena becomes the Ring (other settings kept)', before === 'square' && G.CONFIG.arena === 'ring' && G.CONFIG.moveSpeed === 270);
  delete G.ctx.localStorage;
  G.resetConfig();
}
{
  G.resetConfig(); G.CONFIG.arena = 'pillars2';
  const p = G.Arena.pillars()[0];
  check('a pillar between fighters blocks hits', G.Arena.segmentBlocked(p.x - 100, p.y, p.x + 100, p.y) && !G.Arena.segmentBlocked(p.x - 100, p.y + 100, p.x + 100, p.y + 100));
  G.resetConfig();
}

// ---------------------------------------------------------------- characters
section('Characters');
{
  const std = G.characterConfig('standard');
  for (const id in G.CHARACTERS) {
    const c = G.characterConfig(id);
    const bad = G.CONFIG_SCHEMA.filter(s => s.key && typeof s.def === 'number' && !isFinite(c[s.key])).map(s => s.key);
    check(`${id}: all settings are valid numbers`, bad.length === 0, bad.join(','));
    check(`${id}: trades are listed on the select screen`, id === 'standard' || G.describeTrades(id).length > 0);
  }
  const ob = G.characterConfig('outboxer');
  check('out-boxer: +10 jab reach, slower heavy windup, -1 HP', ob.lightTip === std.lightTip + 10 && ob.heavyStartup > std.heavyStartup && G.maxHp(ob) === G.maxHp(std) - 1);
  const f = new G.Fighter(0, { main: '#fff', dark: '#000' }, 0, 0, 0, 'pressure');
  check('a fighter uses its own character settings', f.hp === G.maxHp(G.characterConfig('pressure')));
}

// ---------------------------------------------------------------- matches, stats, scorecards
section('Matches and stats');
for (const lvl of [0.3, 0.9]) {
  G.resetConfig();
  let nan = false;
  const g = G.cpuMatch({ levels: [lvl, lvl] }, 900, g => { for (const f of g.fighters) if (!isFinite(f.x + f.y + f.mvx + f.mvy + f.stamina)) nan = true; });
  check(`CPU skill ${lvl}: a full match finishes with no broken numbers`, g.phase === 'matchEnd' && !nan, `${g.seconds.toFixed(0)}s`);
  const js = g.mstats.toJSON(g);
  check(`CPU skill ${lvl}: match stats export`, js && js.players && js.players.length === 2 && js.characters);
}
if (G.Scorecard) {
  section('Judges\' scorecards');
  const S = G.Scorecard;
  // Scoring is checked on synthetic round summaries (see game.js Scorecard).
  const base = { damage: [0, 0], cleanHits: [0, 0], forward: [0, 0], center: [0, 0], blocksParries: [0, 0], hp: [8, 8], maxHp: 8 };
  const card = o => S.judge({ ...base, ...o });
  check('more damage wins the card', card({ damage: [3, 1], cleanHits: [3, 1] }).winner === 0);
  check('one hit then running away loses to steady pressure',
    card({ damage: [1, 0], cleanHits: [1, 0], forward: [2, 25], center: [5, 30] }).winner === 1);
  check('a big damage lead still wins over pressure',
    card({ damage: [5, 1], cleanHits: [4, 1], forward: [3, 30], center: [5, 40] }).winner === 0);
  check('nothing happening = draw', card({}).winner === -1);
  {
    G.resetConfig(); G.CONFIG.roundTime = 15; G.CONFIG.roundsToWin = 1;
    const g = new G.Game(); g.start('cpu', 'cpu'); g.phase = 'fight';
    // nobody attacks: both just stand there until the timer runs out
    for (let n = 0; n < 120 * 20 && g.phase === 'fight'; n++) { g.timer -= STEP; if (g.timer <= 0) { g.timer = 0; g.decideTimeout(); } }
    check('a time-out is decided by the scorecards', g.endReason === 'DECISION' || g.endReason === 'DRAW', g.endReason + ' ' + g.endDetail);
  }
  {
    // Real fighters: P1 lands one jab, then runs for the rest of the round while P2 chases.
    const round = (p1Runs) => {
      const { g, a, b } = G.setup({ bx: 560, cfg: { roundTime: 30 } });
      g.round = 1; g.startRound(); g.phase = 'fight';
      a.x = 640; a.y = 395; b.x = 800; b.y = 395; a.facing = 0; b.facing = Math.PI;
      a.startFixed('light');
      for (let t = 0; t < 30 && g.phase === 'fight'; t += STEP) {
        const away = Math.atan2(a.y - b.y, a.x - b.x);   // direction from P2 to P1: P1 runs along it, P2 chases along it
        // P1 runs (stick away from P2, sliding along walls); P2 walks in
        const ia = p1Runs && a.state === 'idle' && t > 0.5 ? I({ mx: Math.cos(away + 0.6), my: Math.sin(away + 0.6) }) : G.NEUTRAL_INPUT;
        const ib = p1Runs && t > 0.5 ? I({ mx: Math.cos(away), my: Math.sin(away) }) : G.NEUTRAL_INPUT;
        G.tick(g, ia, ib); g.mstats.trackMovement(STEP, g.fighters); g.trackCenter(STEP);
      }
      g.decideTimeout();
      return g;
    };
    const run = round(true), still = round(false);
    check('real round: one jab then running loses the decision', run.roundWinner === 1 && run.fighters[1].hp < run.fighters[0].hp + 1,
      `${run.endReason} ${run.endDetail}, cards ${JSON.stringify(run.cards.cards)}, HP ${run.fighters[0].hp}-${run.fighters[1].hp}`);
    check('real round: one jab and nothing else from either side wins the decision', still.roundWinner === 0, `${still.endReason} ${still.endDetail}`);
  }
}

// ---------------------------------------------------------------- replays
section('Replays');
{
  // A recorded match, saved to a file and played back, comes out identical.
  G.resetConfig();
  let koReplays = 0, koOk = true;
  const g = G.cpuMatch({}, 900, g => {
    if (g.phase === 'replay' && g.koReplay && !g.koReplay.checked) {
      // the K.O. replay must reach the same K.O.: run it to its end and compare health
      const r = g.koReplay; r.checked = true; koReplays++;
      const c = G.Replay.buildKO(g);
      let n = 0; while (c.phase === 'fight' && n++ < 2000) c.update(G.STEP);
      if (c.phase !== 'roundEnd' || c.endReason !== 'K.O.' || c.fighters.some((f, i) => f.hp !== g.fighters[i].hp)) koOk = false;
    }
  });
  const file = JSON.parse(JSON.stringify(G.Replay.toFile(g)));
  check('replay file is valid and small', G.Replay.valid(file) && JSON.stringify(file).length < 600000, `${(JSON.stringify(file).length / 1024).toFixed(0)} KB for ${g.seconds.toFixed(0)}s`);
  const saved = JSON.parse(JSON.stringify(G.CONFIG));
  G.applyConfigObject(file.config);
  const r = G.Replay.play(file.config, file.setup, file.devices, file.frames, { silent: true });
  let n = 0; while (r.phase !== 'matchEnd' && n++ < 120 * 900) r.update(G.STEP);
  G.applyConfigObject(saved);
  const same = r.phase === 'matchEnd' && r.matchWinner === g.matchWinner && r.wins.join() === g.wins.join()
    && r.fighters.every((f, i) => f.x === g.fighters[i].x && f.y === g.fighters[i].y && f.hp === g.fighters[i].hp)
    && JSON.stringify(r.mstats.p) === JSON.stringify(g.mstats.p);
  check('a replayed match is identical (positions, health, winner, every stat)', same, `wins ${r.wins.join('-')} vs ${g.wins.join('-')}`);
  check('every K.O. replay reaches the same K.O.', koReplays > 0 && koOk, `${koReplays} K.O. replays`);
  check('a replay is valid when Tuning was not changed', g.recValid === true);
}
{
  // Changing Tuning mid-match marks the replay invalid.
  G.resetConfig(); G.CONFIG.roundsToWin = 1;
  let changed = false;
  const g = G.cpuMatch({}, 300, g => { if (!changed && g.phase === 'fight') { G.CONFIG.moveSpeed += 10; changed = true; } });
  check('changing Tuning mid-match makes the replay invalid', g.recValid === false);
  G.resetConfig();
}

// ---------------------------------------------------------------- training room
section('Training room');
{
  const start = () => {
    G.resetConfig(); G.Arena.override = 'square';
    const g = new G.Game(); g.start('kbm', 'dummy', { training: true });
    return { g, tr: g.training, you: g.fighters[0], dummy: g.fighters[1] };
  };
  const tickT = (g, inp = G.NEUTRAL_INPUT) => {   // like Game.update, but with our own input for P1
    const [a, b] = g.fighters, ib = g.controllers[1].read(b, a, STEP, true);
    a.update(STEP, inp, b); b.update(STEP, ib, a);
    g.resolveHits(); g.resolveBodies(); g.resolveWalls(); g.drainEvents(); g.training.update(STEP); g.hitstop = 0;
  };
  {
    // walk under the MOVE pad and jab it
    const { g, tr, you } = start();
    const pad = tr.pads().find(p => p.key === 'move');
    you.x = pad.x; you.y = pad.y + 150; you.facing = -Math.PI / 2;
    tickT(g, press('light', { aim: true, ax: 0, ay: -1 }));
    for (let t = 0; t < 0.5; t += STEP) tickT(g, I({ aim: true, ax: 0, ay: -1 }));
    check('punching a pad cycles its setting', tr.set.move === 1, tr.value('move'));
  }
  {
    // readout after a jab hit / a blocked jab / a parried jab, compared with what the rules say
    const run = (action, setupDummy) => {
      const { g, tr, you, dummy } = start();
      tr.set.action = tr.pads().find(p => p.key === 'action').values.indexOf(action);
      you.x = 500; you.y = 395; dummy.x = 650; dummy.y = 395; you.facing = 0;
      for (let t = 0; t < 0.6; t += STEP) tickT(g, I({ aim: true, ax: 1, ay: 0 }));   // let the dummy settle into its setting
      you.x = 500; you.y = 395; dummy.x = 650; dummy.y = 395;
      tickT(g, press('light', { aim: true, ax: 1, ay: 0 }));
      for (let t = 0; t < 2 && !tr.readout; t += STEP) tickT(g, I({ aim: true, ax: 1, ay: 0 }));
      return tr.readout ? tr.readout.text : 'none';
    };
    const hit = run('nothing'), blk = run('block'), par = run('parry');
    check('readout: light hit = you +0.02s', /light hit .* you \+0\.02s/.test(hit), hit);
    check('readout: blocked light = you about −0.03s (±1 frame)', /light blocked .* you −0\.0[234]s/.test(blk), blk);
    check('readout: parried = you are behind', /light parried .* you −/.test(par), par);
  }
  {
    // every dummy setting runs for a while without breaking anything, while you throw attacks at it
    let ok = true;
    const moves = G.TRAINING_PADS.find(p => p.key === 'move').values, acts = G.TRAINING_PADS.find(p => p.key === 'action').values;
    for (let m = 0; m < moves.length; m++) for (let k = 0; k < acts.length; k++) {
      const { g, tr, you, dummy } = start();
      tr.set.move = m; tr.set.action = k;
      for (let t = 0; t < 6; t += STEP) {
        const dx = dummy.x - you.x, dy = dummy.y - you.y;
        const inp = (Math.floor(t * 120) % 90 === 0) ? press(G.ATTACK_KINDS[Math.floor(t) % 3], { aim: true, ax: dx, ay: dy, mx: dx / 300, my: dy / 300 })
                                                     : I({ aim: true, ax: dx, ay: dy, mx: clamp(dx / 300, -1, 1), my: clamp(dy / 300, -1, 1) });
        tickT(g, inp);
        for (const f of g.fighters) if (!isFinite(f.x + f.y + f.hp + f.stamina) || f.state === 'dead') ok = false;
      }
      const B = G.Arena.bounds();
      if (dummy.x < B.x || dummy.x > B.x + B.w || dummy.y < B.y || dummy.y > B.y + B.h) ok = false;
    }
    check('every dummy setting (move × action) runs cleanly', ok, `${moves.length * acts.length} combinations`);
  }  {
    // 'block, jab back': the dummy blocks your jab, then jabs back
    const { g, tr, you, dummy } = start();
    tr.set.action = tr.pads().find(p => p.key === 'action').values.indexOf('block, jab back');
    you.x = 500; you.y = 395; dummy.x = 650; dummy.y = 395; you.facing = 0;
    for (let t = 0; t < 0.6; t += STEP) tickT(g, I({ aim: true, ax: 1, ay: 0 }));
    you.x = 500; dummy.x = 650; you.y = dummy.y = 395;
    tickT(g, press('light', { aim: true, ax: 1, ay: 0 }));
    let jabbed = false;
    for (let t = 0; t < 1.2; t += STEP) { tickT(g, I({ aim: true, ax: 1, ay: 0 })); if (dummy.state === 'startup' && dummy.atk.kind === 'light') jabbed = true; }
    check('dummy "block, jab back" blocks and then jabs back', g.stats.blocks >= 1 && jabbed, `blocks ${g.stats.blocks}, jabbed ${jabbed}`);
  }
  {
    // KNOCKBACK none: your hits don't move the dummy
    const { g, tr, you, dummy } = start();
    tr.set.knock = 1;
    you.x = 500; dummy.x = 580; you.y = dummy.y = 395; you.facing = 0;
    const x0 = dummy.x;
    tickT(g, press('heavy', { aim: true, ax: 1, ay: 0 }));
    let hit = false;
    for (let t = 0; t < 0.4; t += STEP) { tickT(g, I({ aim: true, ax: 1, ay: 0 })); if (dummy.state === 'hitstun') hit = true; }
    check('KNOCKBACK none: a hit doesn\'t push the dummy', hit && Math.abs(dummy.x - x0) < 1, `moved ${(dummy.x - x0).toFixed(1)}px`);
  }

  {
    // normal health: a K.O. just resets both fighters
    const { g, tr, you, dummy } = start();
    tr.set.infinite = 1; dummy.hp = 1;
    you.x = 500; dummy.x = 600; you.y = dummy.y = 395; you.facing = 0;
    tickT(g, press('heavy', { aim: true, ax: 1, ay: 0 }));
    for (let t = 0; t < 1; t += STEP) tickT(g, I({ aim: true, ax: 1, ay: 0 }));
    check('training with normal health: a K.O. resets both fighters', dummy.hp === G.maxHp(dummy.cfg) && dummy.state !== 'dead' && g.phase === 'fight');
  }
  G.Arena.override = null;
}

// ---------------------------------------------------------------- tag team
section('Tag team');
{
  const tagSetup = { tag: { chars2: ['outboxer', 'pressure'], partners: ['same', 'same'] } };
  const start = () => { G.resetConfig(); const g = new G.Game(); g.start('cpu', 'cpu', tagSetup); g.phase = 'fight'; return g; };
  {
    // tagging only works in your corner zone and when you're free
    const g = start(), f = g.fighters[0], k = g.corner(0);
    f.x = 640; f.y = 395;
    g.tryTag(0);
    check('no tag away from your corner', g.fighters[0] === f);
    f.x = k.x + 50; f.y = k.y; f.startFixed('light');
    g.tryTag(0);
    check('no tag while attacking', g.fighters[0] === f);
    f.setState('idle'); g.tryTag(0);
    const inn = g.fighters[0];
    check('tag in your corner swaps your partner in', inn !== f && inn === g.teams[0][1]);
    check('the tagged-in fighter can\'t act for a moment (a tag isn\'t a dodge)', inn.state === 'recovery' && inn.recoverDur === G.CONFIG.tagInRecovery);
    const B = G.Arena.bounds();
    check('the tagged-out fighter waits outside the ring', f.x < B.x);
  }
  {
    // bruises heal while resting, and only bruises
    const g = start(), f = g.fighters[0];
    f.takeHit(4, 0, 0, 0.1);
    check('half of a hit is recoverable', f.hp === G.maxHp(f.cfg) - 4 && f.bruise === 2, `hp ${f.hp}, bruise ${f.bruise}`);
    f.setState('idle'); const k = g.corner(0); f.x = k.x + 50; f.y = k.y; g.tryTag(0);
    for (let t = 0; t < 10; t += STEP) g.teamInfo(STEP, true);
    check('resting heals the bruise (and no more)', f.hp === G.maxHp(f.cfg) - 2 && f.bruise === 0, `hp ${f.hp} after 10s`);
  }
  {
    // a K.O. brings the partner in; the round ends when the whole team is down
    const g = start();
    g.fighters[0].takeHit(99, 0, 0, 0.1);
    for (let t = 0; t < 2; t += STEP) g.update(STEP);
    check('after a K.O., the partner comes in and the round goes on', g.fighters[0] === g.teams[0][1] && g.phase === 'fight');
    g.fighters[0].takeHit(99, 0, 0, 0.1);
    for (let t = 0; t < 0.1; t += STEP) g.update(STEP);
    check('when the whole team is down, the round ends', g.phase === 'roundEnd' && g.roundWinner === 1);
  }
  {
    // a tagged-in fighter can't be hit for a moment
    const g = start(), f = g.fighters[0], k = g.corner(0), opp = g.fighters[1];
    f.x = k.x + 50; f.y = k.y; g.tryTag(0);
    const inn = g.fighters[0];
    opp.x = inn.x + 120; opp.y = inn.y; opp.facing = Math.PI; opp.startFixed('light');
    const hp0 = inn.hp;
    for (let t = 0; t < 0.2; t += STEP) { opp.update(STEP, G.NEUTRAL_INPUT, inn); inn.update(STEP, G.NEUTRAL_INPUT, opp); g.resolveHits(); g.hitstop = 0; }
    check('a tagged-in fighter is invulnerable for a moment', inn.hp === hp0 && inn.invulnT === 0 || inn.hp === hp0, `hp ${inn.hp}/${hp0}`);
  }
  {
    // the waiting partner walks the apron, the tag zone goes with them, and "TAG ME IN!" pops up.
    // P1's partner is another player (a human controller): script their input and record the match.
    G.resetConfig(); G.CONFIG.roundsToWin = 1;
    const g = new G.Game();
    g.start('kbm', 'cpu', { tag: { chars2: ['standard', 'standard'], partners: ['kb2', 'same'] } });
    let t = 0;
    const benchCtl = g.teamCtl[0][1];
    benchCtl.read = () => {   // walk one way for a while, then press tag
      const inp = { ...G.NEUTRAL_INPUT, mx: 0, my: t < 3 ? -1 : 0 };
      if (t > 3 && t < 3.02) { inp.tag = true; inp.tagPressed = true; }
      return inp;
    };
    g.teamCtl[0][0].read = () => ({ ...G.NEUTRAL_INPUT });   // P1 in the ring stands still
    const k0 = g.corner(0);
    let called = false;
    for (; t < 3.5; t += STEP) { g.update(STEP); if (g.callout[0] > 0) called = true; }
    const k1 = g.corner(0);
    check('the waiting partner walks the apron and the tag zone moves with them', Math.hypot(k1.x - k0.x, k1.y - k0.y) > 200, `zone moved ${Math.hypot(k1.x - k0.x, k1.y - k0.y).toFixed(0)}px`);
    check('pressing tag while waiting shows TAG ME IN!', called);
    // finish the match and replay it: the partner's walk must replay exactly
    let n = 0; while (g.phase !== 'matchEnd' && n++ < 120 * 600) { g.update(STEP); t += STEP; }
    const file = JSON.parse(JSON.stringify(G.Replay.toFile(g)));
    G.applyConfigObject(file.config);
    const r = G.Replay.play(file.config, file.setup, file.devices, file.frames, { silent: true });
    let m = 0, rk = null;
    while (r.phase !== 'matchEnd' && m++ < 120 * 600) { r.update(STEP); if (m === Math.round(3.4 / STEP)) rk = r.corner(0); }
    check('a replay includes the waiting partner\'s movement', file.frames.length === 4 && r.wins.join() === g.wins.join()
      && JSON.stringify(r.mstats.p) === JSON.stringify(g.mstats.p) && rk && Math.abs(rk.y - k1.y) < 30, `zone in replay y ${rk && rk.y.toFixed(0)} vs ${k1.y.toFixed(0)}`);
    G.resetConfig();
  }
  {
    // a CPU partner follows you along the apron
    const g = start(); const f = g.fighters[0];
    f.x = 640; f.y = 150;   // P1 goes to the top of the ring
    for (let t = 0; t < 4; t += STEP) g.teamInfo(STEP, true);
    const k = g.corner(0);
    check('a CPU partner follows you along the apron', Math.hypot(k.x - f.x, k.y - f.y) < 120, `zone ${Math.hypot(k.x - f.x, k.y - f.y).toFixed(0)}px from you`);
  }
  // Waiting partners controlled by scripted "humans" (both sides), for the outside-the-ring tests.
  const humanBenches = (cfg = {}) => {
    G.resetConfig(); Object.assign(G.CONFIG, cfg);
    const g = new G.Game();
    g.start('kbm', 'kbm', { tag: { chars2: ['standard', 'standard'], partners: ['kb2', 'kb2'] } });
    g.phase = 'fight';
    const script = [() => ({}), () => ({})];
    for (let s = 0; s < 2; s++) {
      g.teamCtl[s][0].read = () => ({ ...G.NEUTRAL_INPUT });
      g.teamCtl[s][1].read = () => ({ ...G.NEUTRAL_INPUT, mx: 0, my: 0, ...script[s]() });
    }
    const B = G.Arena.bounds();
    return { g, script, B, p0: g.benchOf(0), p1: g.benchOf(1) };
  };
  const aimAt = (from, to) => ({ aim: true, ax: to.x - from.x, ay: to.y - from.y });
  {
    // free roam: partners can't walk through each other; a shove (aimed, up close) slides the other one away
    const { g, script, B, p0, p1 } = humanBenches();
    p0.x = 300; p0.y = B.y - 40; p1.x = 400; p1.y = B.y - 40;
    script[0] = () => ({ mx: 1 });
    for (let t = 0; t < 1; t += STEP) g.teamInfo(STEP, true);
    const d = Math.hypot(p0.x - p1.x, p0.y - p1.y);
    check('waiting partners can\'t walk through each other', d >= p0.R + p1.R && p0.x < p1.x, `gap ${d.toFixed(0)}`);
    const x1 = p1.x, hp1 = p1.hp;
    script[0] = () => ({ ...aimAt(p0, { x: p0.x, y: p0.y + 100 }), medium: true, mediumPressed: true });   // aiming away
    g.teamInfo(STEP, true);
    for (let t = 0; t < 0.5; t += STEP) { script[0] = () => ({}); g.teamInfo(STEP, true); }
    check('no shove when not aiming at the other partner', Math.abs(p1.x - x1) < 5);
    g.shoveCd[0] = 0;
    script[0] = () => ({ ...aimAt(p0, p1), medium: true, mediumPressed: true });
    g.teamInfo(STEP, true);
    script[0] = () => ({});
    for (let t = 0; t < 1; t += STEP) g.teamInfo(STEP, true);
    check('a shove (aimed at them, up close) slides the other partner away, no damage', p1.x - x1 > 60 && p1.hp === hp1, `moved ${(p1.x - x1).toFixed(0)}px`);
    // free roam: a partner can walk right around the outside of the ring
    p0.x = B.x - 40; p0.y = B.y + B.h / 2;
    script[0] = () => ({ my: -1 });
    for (let t = 0; t < 1.5; t += STEP) g.teamInfo(STEP, true);
    script[0] = () => ({ mx: 1 });
    for (let t = 0; t < 1.5; t += STEP) g.teamInfo(STEP, true);
    check('a waiting partner roams freely outside the ring (and never inside)', p0.y < B.y && p0.x > B.x + 100, `at ${p0.x.toFixed(0)}, ${p0.y.toFixed(0)}`);
  }
  {
    // the jab from outside: a real punch with a hitbox, only with No DQ, blockable, one every few seconds
    const shoot = (cfg, enemyBlocks, aimOff = 0) => {
      const { g, script, B, p0 } = humanBenches(cfg);
      p0.x = B.x - 34; p0.y = B.y + B.h / 2;
      const enemy = g.fighters[1];
      enemy.x = B.x + 50; enemy.y = p0.y; enemy.facing = Math.PI;
      if (enemyBlocks) enemy.enterBlock(false);
      const hp0 = enemy.hp;
      script[0] = () => ({ aim: true, ax: 1, ay: aimOff, light: true, lightPressed: true });
      g.teamInfo(STEP, true);
      script[0] = () => ({ aim: true, ax: 1, ay: aimOff });
      let stun = false;
      for (let t = 0; t < 0.4; t += STEP) { g.teamInfo(STEP, true); if (enemy.state === 'hitstun') stun = true; }
      return { g, hit: enemy.hp < hp0, stun, dmg: hp0 - enemy.hp };
    };
    check('no jab into the ring without No DQ rules', !shoot({}).hit);
    const r = shoot({ noDQ: true });
    check('No DQ: an aimed jab from outside hits (1 damage + stagger)', r.hit && r.stun && r.dmg === 1, JSON.stringify({ hit: r.hit, stun: r.stun, dmg: r.dmg }));
    check('No DQ: aiming away misses (it\'s a real hitbox)', !shoot({ noDQ: true }, false, 3).hit);
    check('No DQ: a guard facing the ropes blocks it', !shoot({ noDQ: true }, true).hit);
    // cooldown: a second press right away does nothing, after the cooldown it works again (even if nobody moved)
    const { g } = r, enemy = g.fighters[1], p0 = g.benchOf(0);
    enemy.setState('idle'); enemy.x = p0.x + 84; enemy.vx = enemy.vy = 0;
    const hp1 = enemy.hp;
    g.teamCtl[0][1].read = () => ({ ...G.NEUTRAL_INPUT, aim: true, ax: 1, ay: 0, light: true, lightPressed: true });
    for (let t = 0; t < 0.3; t += STEP) g.teamInfo(STEP, true);
    check('the outside jab has a cooldown', enemy.hp === hp1);
    let t2 = 0;
    for (; t2 < G.CONFIG.cheapShotCooldown + 0.5 && enemy.hp === hp1; t2 += STEP) { enemy.x = p0.x + 84; enemy.y = p0.y; enemy.setState('idle'); g.teamInfo(STEP, true); }
    check('after the cooldown it hits again, even if nobody moved', enemy.hp < hp1, `after ${t2.toFixed(2)}s`);
  }
  {
    // apron brawl: waiting partners can jab each other (only with the toggle)
    const brawl = on => {
      const { g, script, B, p0, p1 } = humanBenches({ apronBrawl: on });
      p0.x = 300; p0.y = B.y - 40; p1.x = 370; p1.y = B.y - 40;
      const hp1 = p1.hp;
      script[0] = () => ({ ...aimAt(p0, p1), light: true, lightPressed: true });
      g.teamInfo(STEP, true);
      script[0] = () => ({});
      for (let t = 0; t < 0.4; t += STEP) g.teamInfo(STEP, true);
      return hp1 - p1.hp;
    };
    check('apron brawl off: partners can\'t hurt each other', brawl(false) === 0);
    check('apron brawl on: a jab hurts the other waiting partner', brawl(true) === 1);
  }
  {
    // No DQ + apron brawl tag match between CPUs still replays exactly
    G.resetConfig(); G.CONFIG.noDQ = true; G.CONFIG.apronBrawl = true; G.CONFIG.roundsToWin = 2;
    const g = G.cpuMatch({ tag: { chars2: ['dancer', 'counter'], partners: ['same', 'same'] } }, 900);
    const file = JSON.parse(JSON.stringify(G.Replay.toFile(g)));
    G.applyConfigObject(file.config);
    const r = G.Replay.play(file.config, file.setup, file.devices, file.frames, { silent: true });
    let n = 0; while (r.phase !== 'matchEnd' && n++ < 120 * 900) r.update(STEP);
    check('a No DQ + apron brawl tag match replays identically', g.phase === 'matchEnd' && r.wins.join() === g.wins.join() && JSON.stringify(r.mstats.p) === JSON.stringify(g.mstats.p),
      `cheap shots ${g.stats.cheapShots || 0}, apron jabs ${g.stats.apronJabs || 0}, shoves ${g.stats.shoves || 0}`);
    G.resetConfig();
  }
  {
    // full CPU tag match: tags happen, it finishes, and its replay is identical
    G.resetConfig(); let swaps = 0, prev = '0,0';
    const g = G.cpuMatch(tagSetup, 900, g => { if (g.activeIdx) { const k = g.activeIdx.join(); if (k !== prev) { swaps++; prev = k; } } });
    check('CPU tag match finishes, and the CPUs tag', g.phase === 'matchEnd' && swaps > 4, `${swaps} swaps, ${g.seconds.toFixed(0)}s`);
    const file = JSON.parse(JSON.stringify(G.Replay.toFile(g)));
    G.applyConfigObject(file.config);
    const r = G.Replay.play(file.config, file.setup, file.devices, file.frames, { silent: true });
    let n = 0; while (r.phase !== 'matchEnd' && n++ < 120 * 900) r.update(STEP);
    check('a tag match replays identically', r.wins.join() === g.wins.join() && JSON.stringify(r.mstats.p) === JSON.stringify(g.mstats.p)
      && r.teams.every((t, s) => t.every((f, k) => f.x === g.teams[s][k].x && f.hp === g.teams[s][k].hp)));
    G.resetConfig();
  }
}

done();
