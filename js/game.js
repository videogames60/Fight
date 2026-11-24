// game.js: the match: rounds, timer, walls, body collision, hit resolution.

const NEUTRAL_INPUT = Object.freeze({ mx: 0, my: 0, aim: false, ax: 0, ay: 0, forceLock: false,
  dodge: false, plant: false, dodgePressed: false, plantPressed: false,
  light: false, medium: false, heavy: false, lightPressed: false, mediumPressed: false, heavyPressed: false,
  block: false, blockPressed: false, tag: false, tagPressed: false });

const FIGHTER_COLORS = [
  { main: '#4fd1ff', dark: '#1b4a5c' },
  { main: '#ff8a3d', dark: '#5c321a' },
];

// Judges' scorecards: decide a round that goes the distance (time runs out), like boxing.
// Three judges each score the round 10-9 (10-8 if one-sided, 10-10 if even). Majority wins the round.
// What they score (each judge weighs it a little differently, so close rounds can split):
//   damage and clean hits         (counts most)
//   effective pressure            (your share of the time spent moving forward)
//   ring control                  (your share of the time holding the center)
//   defense                       (blocks and parries, small, capped)
// Pressure + control together are worth at most ~3 hits, so landing one hit and running loses
// to steady pressure, but a clear damage lead still wins.
const JUDGES = [
  { dmg: 2.4, hit: 0.5, press: 3.0, center: 1.5, def: 0.25 },   // likes clean punching
  { dmg: 2.0, hit: 0.5, press: 4.0, center: 2.0, def: 0.25 },   // balanced
  { dmg: 1.7, hit: 0.4, press: 4.5, center: 2.5, def: 0.30 },   // likes aggression and ring generalship
];
const Scorecard = {
  // r = { damage, cleanHits, forward, center, blocksParries } (each [p1, p2] for this round)
  points(r, J, i) {
    const share = arr => { const t = arr[0] + arr[1]; return t > 0.5 ? arr[i] / t : 0.5; };
    return J.dmg * r.damage[i] + J.hit * r.cleanHits[i] + J.press * share(r.forward) + J.center * share(r.center)
         + Math.min(1.5, J.def * r.blocksParries[i]);
  },
  judge(r) {
    const cards = JUDGES.map(J => {
      const d = this.points(r, J, 0) - this.points(r, J, 1);
      if (Math.abs(d) < 0.5) return [10, 10];
      const lose = Math.abs(d) >= 6 ? 8 : 9;
      return d > 0 ? [10, lose] : [lose, 10];
    });
    const votes = [0, 0];
    for (const c of cards) if (c[0] > c[1]) votes[0]++; else if (c[1] > c[0]) votes[1]++;
    const winner = votes[0] > votes[1] ? 0 : votes[1] > votes[0] ? 1 : -1;
    const lost = winner < 0 ? 0 : votes[1 - winner], even = 3 - votes[0] - votes[1];
    const type = winner < 0 ? 'draw' : votes[winner] === 3 ? 'unanimous' : lost === 1 ? 'split' : 'majority';
    return { winner, cards, type, votes };
  },
};

// Tag team: how far outside the ring the waiting partners can roam, and how far their jab reaches.
const APRON_OUT = 72, BENCH_PUNCH_TIP = 60;

class Game {
  constructor() {
    this.fx = new Effects();
    this.active = false;
    this.clock = 0;
    this.timeScale = 1;
    this.stats = { hits: 0, counters: 0, clashes: 0, splats: 0, armorHits: 0, steps: 0, plants: 0, runHits: 0,
                   blocks: 0, parries: 0, guardBreaks: 0, parryWhiffs: 0 };
  }

  // setup: { chars: [id, id], levels: [cpuSkill, cpuSkill] } (all optional)
  start(dev1, dev2, setup = {}) {
    const sp = Arena.spawns();
    const chars = setup.chars || ['standard', 'standard'];
    const levels = setup.levels || [CONFIG.aiLevel, CONFIG.aiLevel];
    this.devices = [dev1, dev2];
    // Tag team: setup.tag = { chars2: [id, id], partners: ['same' | 'cpu' | device, ...], aiChars2: [id, id] }
    const tag = setup.tag || null;
    this.setup = { chars, levels, aiChars: setup.aiChars, training: setup.training, tag };
    this.fighters = [
      new Fighter(0, FIGHTER_COLORS[0], sp[0].x, sp[0].y, sp[0].facing, chars[0]),
      new Fighter(1, FIGHTER_COLORS[1], sp[1].x, sp[1].y, sp[1].facing, chars[1]),
    ];
    // teams[side] = [first fighter, partner]; fighters[side] is whoever is in the ring.
    // Both share the side's index, so stats and scorecards are team totals.
    this.teams = tag ? [0, 1].map(s => [this.fighters[s], new Fighter(s, FIGHTER_COLORS[s], sp[s].x, sp[s].y, sp[s].facing, tag.chars2[s])]) : null;
    this.teamCtl = null;
    this.benchRep = null;
    Arena.apron = tag ? APRON_OUT : 0;   // the camera zooms out a little to show the area outside the ring
    // Replays: either play back recorded inputs (setup.replay = frames), or record this match.
    this.replaying = !!setup.replay;
    this.readCount = 0;                       // input reads so far (= frames of input)
    this.koRead = null;
    this.koReplay = null;
    this.training = null;
    if (this.replaying) {
      this.controllers = setup.replay.slice(0, 2).map(d => new ReplayController(d));
      // tag team: streams 2 and 3 are the waiting partners' inputs
      this.benchRep = setup.replay.length > 2 ? setup.replay.slice(2, 4).map(d => new ReplayController(d)) : null;
    } else if (setup.training) {
      // Training room: you vs the dummy. No recording, no rounds, no timer.
      this.training = new Training(this);
      this.controllers = [new Controller(dev1, {}), new Controller('dummy', { training: this.training })];
    } else {
      this.controllers = [
        // aiChars lets tests give both CPUs the same brain so only the stat trades differ
        new Controller(dev1, { charId: (setup.aiChars || chars)[0], level: levels[0] }),
        new Controller(dev2, { charId: (setup.aiChars || chars)[1], level: levels[1] }),
      ];
      if (tag) {
        // Each team member's controller: the partner shares yours ('same'), is a CPU, or another device.
        this.teamCtl = [0, 1].map(s => {
          const main = this.controllers[s], pd = tag.partners[s];
          const cpuOpts = { charId: (tag.aiChars2 || tag.chars2)[s], level: levels[s] };
          const partner = pd === 'same' ? (this.devices[s] === 'cpu' ? new Controller('cpu', cpuOpts) : main) : new Controller(pd, cpuOpts);
          return [main, partner];
        });
      }
      this.rec = tag ? [0, 1, 2, 3].map(() => new InputRecorder()) : [new InputRecorder(), new InputRecorder()];
      this.recConfig = JSON.parse(JSON.stringify(CONFIG));   // the settings this recording needs
    }
    this.wins = [0, 0];
    this.mstats = new MatchStats();
    this.round = 0;
    this.matchWinner = -1;
    this.active = true;
    this.startRound();
  }

  startRound() {
    this.round++;
    if (this.teams) {
      // every round starts fresh: both members healed, the first one in the ring, the partner on the apron
      this.activeIdx = [0, 0]; this.koT = [0, 0]; this.callout = [0, 0]; this.calloutCd = [0, 0];
      this.benchV = [{ x: 0, y: 0 }, { x: 0, y: 0 }]; this.shoveCd = [0, 0]; this.punchCd = [0, 0]; this.cpuPunchT = [0, 0];
      this.benchStun = [0, 0]; this.benchBlocked = [false, false];
      for (let s = 0; s < 2; s++) {
        for (const f of this.teams[s]) { f.reset(); f.tagCall = false; }
        this.fighters[s] = this.teams[s][0];
        const B = Arena.bounds();   // partners start at their corner: the middle of the wall behind their side
        this.parkOnApron(this.teams[s][1], s, { x: s === 0 ? B.x - 100 : B.x + B.w + 100, y: B.y + B.h / 2 });
        if (this.teamCtl) { this.controllers[s] = this.teamCtl[s][0]; this.teamCtl[s][1].reset(); }
      }
    } else for (const f of this.fighters) f.reset();
    for (const c of this.controllers) c.reset();
    this.timer = CONFIG.roundTime;
    this.center = [0, 0];
    this.cards = null;
    // per-round totals for the judges = match totals now (subtracted at the end of the round)
    this.roundBase = this.mstats.p.map(MatchStats.judgeTotals);
    this.phase = this.training ? 'fight' : 'intro';      // intro -> fight -> roundEnd -> (intro | matchEnd)
    this.phaseT = 0;
    this.hitstop = 0;
    this.timeScale = 1;
    this.roundWinner = -1;
    this.endReason = '';
    this.endDetail = '';
    this.fx.clear();
  }

  sfx(name, p) { if (!this.silent) Sound.play(name, p); }

  // dt is real time (fixed step). Fighters run on dt * timeScale.
  update(dt) {
    this.clock += dt;
    if (this.phase === 'replay') { this.updateKOReplay(); return; }
    if (this.hitstop > 0) { this.hitstop -= dt; return; }

    this.phaseT += dt;
    const sdt = dt * this.timeScale;
    this.fx.update(sdt);

    let [a, b] = this.fighters;
    const live = this.phase === 'fight';
    if (this.teams) this.teamInfo(sdt, live);
    const ia = this.controllers[0].read(a, b, sdt, live);
    const ib = this.controllers[1].read(b, a, sdt, live);
    if (this.rec) { this.rec[0].push(ia); this.rec[1].push(ib); }
    this.readCount++;
    if (this.teams && live) {
      // tags happen before anyone moves, so the incoming fighter starts this frame
      if (ia.tagPressed) this.tryTag(0);
      if (ib.tagPressed) this.tryTag(1);
      [a, b] = this.fighters;
    }
    a.update(sdt, live ? ia : NEUTRAL_INPUT, b);
    b.update(sdt, live ? ib : NEUTRAL_INPUT, a);

    if (live) this.resolveHits();
    this.resolveBodies();
    this.resolveWalls();
    this.drainEvents();
    if (this.training && live) { this.training.update(sdt); return; }

    if (this.phase === 'intro') {
      if (this.phaseT >= 1.5) { this.phase = 'fight'; this.phaseT = 0; this.sfx('bell'); }
    } else if (this.phase === 'fight') {
      const before = Math.ceil(this.timer);
      this.timer -= sdt;
      if (this.timer > 0 && this.timer <= 5 && Math.ceil(this.timer) < before) this.sfx('tick');   // last 5 seconds
      this.trackCenter(sdt);
      this.mstats.trackMovement(sdt, this.fighters);
      if (this.teams) this.teamKOs(sdt);
      const down = s => this.teams ? this.teams[s].every(f => f.hp <= 0) : this.fighters[s].state === 'dead';
      if (down(0) || down(1)) {
        this.endRound(down(0) ? 1 : 0, 'K.O.', '');
      } else if (this.timer <= 0) {
        this.timer = 0;
        this.decideTimeout();
      }
    } else if (this.phase === 'roundEnd') {
      this.timeScale = this.endReason === 'K.O.' && this.phaseT < 1.0 ? 0.3 : 1;
      if (this.phaseT >= (this.cards ? 3.8 : 2.4)) {   // more time to read a decision
        // After a K.O.: slow-mo replay of the last few seconds first (skippable).
        if (this.endReason === 'K.O.' && this.rec && CONFIG.koReplay && !this.silent) this.koReplay = Replay.buildKO(this);
        if (this.koReplay) { this.phase = 'replay'; this.phaseT = 0; this.timeScale = 1; }
        else this.nextRound();
      }
    }
  }

  // ---- tag team ----
  // The partner waiting outside roams freely around the outside of the ring (anywhere between the
  // wall and the edge of the screen). Their tag zone (a half-circle reaching into the ring from the
  // nearest bit of wall) moves with them. Waiting partners aim with the right stick / mouse:
  //   light = a jab from outside the ring (a real punch with a hitbox; 1 every few seconds)
  //   medium or heavy = shove the other waiting partner (only if you're aiming at them, up close)
  benchOf(side) { return this.teams[side][this.activeIdx[side] ^ 1]; }

  // Center of a side's tag zone: the bit of wall nearest the waiting partner.
  corner(side) { const p = this.benchOf(side); return Arena.wallPoint(p.x, p.y); }

  // Who moves a team member while they wait: 'human' (their own controller), 'cpu', or 'shared'
  // (one player controls both: the waiting one stays put). Worked out from the setup, so replays know it too.
  memberKind(side, k) {
    const dev = this.devices[side];
    if (k === 0) return dev === 'cpu' ? 'cpu' : 'human';
    const pd = this.setup.tag.partners[side];
    if (pd === 'same') return dev === 'cpu' ? 'cpu' : 'shared';
    return pd === 'cpu' ? 'cpu' : 'human';
  }

  // Keep a waiting partner outside the ring but on screen.
  constrainBench(p) {
    const w = Arena.wallPoint(p.x, p.y), m = p.R + 4;
    if ((p.x - w.x) * w.nx + (p.y - w.y) * w.ny < m) { p.x = w.x + w.nx * m; p.y = w.y + w.ny * m; }
    const B = Arena.bounds(), W = APRON_OUT;
    p.x = clamp(p.x, B.x - W, B.x + B.w + W); p.y = clamp(p.y, B.y - W, B.y + B.h + W);
  }

  // Put a fighter outside the ring, just behind the wall nearest to where they are (or to `at`).
  parkOnApron(f, side, at = f) {
    const w = Arena.wallPoint(at.x, at.y);
    f.x = w.x + w.nx * (f.R + 14); f.y = w.y + w.ny * (f.R + 14);
    this.constrainBench(f);
    f.stop(); f.vx = f.vy = 0; f.trail = []; f.events.length = 0; f.atk = null; f.invulnT = 0; f.benchPunch = null;
    if (f.state !== 'dead') f.setState('idle');
  }

  inTagZone(f, side) { const k = this.corner(side); return Math.hypot(f.x - k.x, f.y - k.y) < CONFIG.tagZone; }

  canTag(side) {
    const f = this.fighters[side], p = this.benchOf(side);
    return p.hp > 0 && (f.state === 'idle' || f.state === 'block') && this.inTagZone(f, side);
  }

  tryTag(side) { if (this.canTag(side)) this.swap(side); }

  // Partner comes in at the tag zone (can't act, but can't be hit either, for a moment); you go outside.
  swap(side) {
    const out = this.fighters[side], inn = this.benchOf(side), k = this.corner(side);
    inn.x = k.x - k.nx * (inn.R + 30); inn.y = k.y - k.ny * (inn.R + 30);
    inn.stop(); inn.vx = inn.vy = 0; inn.atk = null; inn.trail = []; inn.tagCall = false; inn.benchPunch = null;
    inn.facing = Math.atan2(-k.ny, -k.nx);
    inn.recoverDur = CONFIG.tagInRecovery; inn.setState('recovery');
    inn.invulnT = CONFIG.tagInRecovery;
    this.activeIdx[side] ^= 1;
    this.fighters[side] = inn;
    this.parkOnApron(out, side);
    out.tagCall = false;
    if (this.teamCtl) this.controllers[side] = this.teamCtl[side][this.activeIdx[side]];
    this.koT[side] = 0; this.callout[side] = 0;
    this.sfx('tag', { x: k.x });
    this.fx.ring(inn.x, inn.y, inn.color.main, 50);
    this.fx.text(inn.x, inn.y - 50, 'TAG', inn.color.main, 22);
  }

  // Every frame, before the fighters in the ring move: the waiting partners rest, move, aim, punch,
  // shove and call for the tag. Also tells the fighters in the ring where their tag zone is (the CPU
  // uses it). The waiting partners' inputs are recorded (streams 2 and 3), so replays include them.
  teamInfo(dt, live) {
    for (let s = 0; s < 2; s++) {
      const f = this.fighters[s], benchK = this.activeIdx[s] ^ 1, p = this.teams[s][benchK];
      const kind = this.memberKind(s, benchK);
      let bi = NEUTRAL_INPUT;
      if (this.benchRep) bi = this.benchRep[s].read();
      else if (kind === 'human' && this.teamCtl) bi = this.teamCtl[s][benchK].read(p, this.fighters[s ^ 1], dt, live);
      if (this.rec) this.rec[2 + s].push(kind === 'human' ? bi : NEUTRAL_INPUT);
      if (kind !== 'human') bi = NEUTRAL_INPUT;
      for (const k of ['calloutCd', 'callout', 'shoveCd', 'punchCd', 'benchStun']) this[k][s] = Math.max(0, this[k][s] - dt);
      p.flash = Math.max(0, p.flash - dt); p.armorFlash = Math.max(0, p.armorFlash - dt);   // (waiting partners don't run Fighter.update)

      if (live && p.hp > 0) {
        // resting: stamina refills fast, bruises heal one pip at a time
        p.stamina = Math.min(p.cfg.staminaMax, p.stamina + p.cfg.regenRate * CONFIG.tagRestStamina * dt);
        if (p.bruise >= 1) {
          p.healT += dt;
          if (p.healT >= CONFIG.tagHealTime) { p.hp++; p.bruise--; p.healT = 0; this.fx.text(p.x, p.y - 36, '+1', '#5be08a', 16); }
        } else p.healT = 0;

        const act = kind === 'human' ? this.benchHuman(s, p, f, bi) : kind === 'cpu' ? this.benchCPU(s, p, f, dt) : { mx: 0, my: 0 };
        // move (not while punching or staggered), plus any shove slide
        const busy = p.benchPunch || this.benchStun[s] > 0;
        const v = this.benchV[s], sp = p.cfg.moveSpeed * 0.85;
        const k = Math.exp(-6 * dt); v.x *= k; v.y *= k;
        const ox = p.x, oy = p.y;
        p.x += ((busy ? 0 : act.mx * sp) + v.x) * dt;
        p.y += ((busy ? 0 : act.my * sp) + v.y) * dt;
        this.constrainBench(p);
        // waiting partners can't walk through each other (a K.O.'d one can be stepped past)
        const o = this.benchOf(s ^ 1), dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy) || 1, MIN = p.R + o.R + 4;
        this.benchBlocked[s] = false;
        if (o.hp > 0 && d < MIN) {
          p.x = o.x + dx / d * MIN; p.y = o.y + dy / d * MIN;
          this.constrainBench(p);
          if (Math.hypot(p.x - o.x, p.y - o.y) < MIN - 1) { p.x = ox; p.y = oy; }   // squeezed: stay where you were
          this.benchBlocked[s] = Math.hypot(act.mx, act.my) > 0.2;
        }
        this.updateBenchPunch(s, p, dt);
      }
      if (p.hp <= 0) this.constrainBench(p);
      f.tagInfo = { corner: this.corner(s), partner: p, call: !!f.tagCall };
    }
  }

  // A human waiting partner: stick moves, right stick / mouse aims, buttons punch / shove / call.
  benchHuman(s, p, f, bi) {
    if (!p.benchPunch) {
      if (bi.aim) p.facing = Math.atan2(bi.ay, bi.ax);
      else if (bi.forceLock) {   // arrow-keys player (no aim): face the nearest target, the opponent or the other partner
        const e = this.fighters[s ^ 1], o = this.benchOf(s ^ 1);
        const t = o.hp > 0 && Math.hypot(o.x - p.x, o.y - p.y) < Math.hypot(e.x - p.x, e.y - p.y) ? o : e;
        p.facing = Math.atan2(t.y - p.y, t.x - p.x);
      } else p.facing = Math.atan2(f.y - p.y, f.x - p.x);   // no aim: watch your partner
    }
    if (this.benchStun[s] <= 0) {
      if (bi.lightPressed) this.startBenchPunch(s, p);
      else if (bi.mediumPressed || bi.heavyPressed) this.tryShove(s, p);
    }
    if (bi.tagPressed) {                                     // "TAG ME IN!"
      this.callout[s] = 1.6;
      if (this.controllers[s].ai) f.tagCall = true;          // a CPU partner heads over to tag you in
    }
    return { mx: bi.mx, my: bi.my };
  }

  // A CPU waiting partner: follows you around the outside of the ring (walking around it, not through),
  // shoves the other partner out of its way, and jabs when it can (fixed delays, no randomness: replays stay exact).
  benchCPU(s, p, f, dt) {
    let mx = 0, my = 0;
    if (f.state !== 'dead') {
      const tr = Arena.track(p.R + 16), w = Arena.wallPoint(f.x, f.y);
      const sNow = Arena.trackClosest(tr, p.x, p.y), sWant = Arena.trackClosest(tr, w.x + w.nx * 40, w.y + w.ny * 40);
      const diff = Arena.trackDelta(tr, sNow, sWant);
      if (Math.abs(diff) > 20) {
        const q = Arena.trackPoint(tr, sNow + Math.sign(diff) * Math.min(Math.abs(diff), 40));
        const dx = q.x - p.x, dy = q.y - p.y, m = Math.hypot(dx, dy) || 1;
        mx = dx / m; my = dy / m;
      }
      if (f.hp + 2 <= p.hp && this.calloutCd[s] <= 0) { this.callout[s] = 1.6; this.calloutCd[s] = 8; }
    }
    if (p.benchPunch) return { mx: 0, my: 0 };
    p.facing = Math.atan2(f.y - p.y, f.x - p.x);
    if (this.benchStun[s] > 0) return { mx, my };
    // targets in punch reach: the opponent in the ring (No DQ), the other waiting partner (apron brawl)
    const enemy = this.fighters[s ^ 1], o = this.benchOf(s ^ 1), reach = p.R + BENCH_PUNCH_TIP;
    let target = null;
    if (CONFIG.noDQ && enemy.state !== 'dead' && !(enemy.invulnT > 0) && Math.hypot(enemy.x - p.x, enemy.y - p.y) < reach + enemy.R - 4) target = enemy;
    else if (CONFIG.apronBrawl && o.hp > 0 && Math.hypot(o.x - p.x, o.y - p.y) < reach + o.R - 4) target = o;
    if (target && this.punchCd[s] <= 0) {
      p.facing = Math.atan2(target.y - p.y, target.x - p.x);
      this.cpuPunchT[s] += dt;
      if (this.cpuPunchT[s] > 0.25) { this.startBenchPunch(s, p); this.cpuPunchT[s] = 0; }
    } else this.cpuPunchT[s] = 0;
    if (this.benchBlocked[s] && this.shoveCd[s] <= 0) { p.facing = Math.atan2(o.y - p.y, o.x - p.x); this.tryShove(s, p); }
    return { mx, my };
  }

  // ---- punches and shoves from outside the ring ----
  startBenchPunch(s, p) {
    if (this.punchCd[s] > 0 || p.benchPunch) return;
    this.punchCd[s] = CONFIG.cheapShotCooldown;
    p.benchPunch = { t: 0, dir: p.facing, hit: false };
    this.sfx('throw_light', { x: p.x });
  }

  // Windup 0.07s, fist out (can hit) until 0.17s, back by 0.32s. No lunge: the body stays outside.
  updateBenchPunch(s, p, dt) {
    const bp = p.benchPunch;
    if (!bp) return;
    bp.t += dt;
    if (bp.t >= 0.07 && bp.t < 0.17 && !bp.hit) {
      const tip = p.R + BENCH_PUNCH_TIP, tx = p.x + Math.cos(bp.dir) * tip, ty = p.y + Math.sin(bp.dir) * tip;
      const enemy = this.fighters[s ^ 1], o = this.benchOf(s ^ 1);
      const touches = t => distToSegment(t.x, t.y, p.x, p.y, tx, ty) < t.R;
      if (CONFIG.noDQ && enemy.state !== 'dead' && !(enemy.invulnT > 0) && touches(enemy)) { bp.hit = true; this.cheapShot(s, p, enemy, bp.dir); }
      else if (CONFIG.apronBrawl && o.hp > 0 && touches(o)) { bp.hit = true; this.apronJab(s, p, o, bp.dir); }
    }
    if (bp.t >= 0.32) p.benchPunch = null;
  }

  cheapShot(s, p, enemy, dir) {
    if (enemy.blocksFrom(p)) {   // a guard facing the ropes stops it
      this.sfx('block', { x: enemy.x });
      this.fx.text(enemy.x, enemy.y - 42, 'BLOCK', '#cfe3ff', 15);
      return;
    }
    const dmg = CONFIG.cheapShotDamage;
    enemy.takeHit(dmg, dir, 300, CONFIG.cheapShotStun);
    this.mstats.p[s].damage += dmg;
    this.stats.cheapShots = (this.stats.cheapShots || 0) + 1;
    this.hitstop = 0.06;
    this.sfx('hit_medium', { x: enemy.x }); this.sfx('counter', { x: enemy.x });
    this.fx.shake(6);
    this.fx.burstDir(enemy.x, enemy.y, dir, p.color.main, 14, 360, 0.8);
    this.fx.text(enemy.x, enemy.y - 46, dmg > 0 ? `CHEAP SHOT!  -${dmg}` : 'CHEAP SHOT!', '#ffd84d', 20);
  }

  // Apron brawl: a jab on the other waiting partner. Damage (half of it a bruise that heals), a short stagger.
  apronJab(s, p, o, dir) {
    const dmg = CONFIG.cheapShotDamage, os = s ^ 1;
    o.hp = Math.max(0, o.hp - dmg); o.addBruise(dmg);
    if (o.hp <= 0) { o.setState('dead'); o.bruise = 0; }
    o.flash = 0.18;
    this.benchStun[os] = CONFIG.cheapShotStun;
    this.benchV[os].x += Math.cos(dir) * 300; this.benchV[os].y += Math.sin(dir) * 300;
    o.benchPunch = null;
    this.mstats.p[s].damage += dmg;
    this.stats.apronJabs = (this.stats.apronJabs || 0) + 1;
    this.sfx('hit_light', { x: o.x });
    this.fx.burstDir(o.x, o.y, dir, p.color.main, 10, 300, 0.8);
    this.fx.text(o.x, o.y - 40, o.hp > 0 ? `-${dmg}` : 'K.O. OUTSIDE!', '#ffd84d', 16);
  }

  // Shove: only if you're aiming at the other waiting partner and they're right next to you. No damage.
  tryShove(s, p) {
    const o = this.benchOf(s ^ 1);
    if (this.shoveCd[s] > 0 || o.hp <= 0) return;
    const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy);
    if (d > p.R + o.R + 30 || Math.abs(angleDiff(p.facing, Math.atan2(dy, dx))) > 0.8) return;
    this.shoveCd[s] = this.memberKind(s, this.activeIdx[s] ^ 1) === 'cpu' ? 2 : 1;
    const os = s ^ 1;
    this.benchV[os].x += dx / d * 650; this.benchV[os].y += dy / d * 650;
    this.stats.shoves = (this.stats.shoves || 0) + 1;
    this.sfx('block', { x: o.x });
    this.fx.burst(o.x, o.y, '#c5ccd9', 8, 200);
    this.fx.text(o.x, o.y - 38, 'SHOVE', '#c5ccd9', 14);
  }

  // A K.O.'d fighter with a partner still standing: the partner comes in after a moment.
  teamKOs(dt) {
    for (let s = 0; s < 2; s++) {
      const f = this.fighters[s], p = this.benchOf(s);
      if (f.state !== 'dead' || p.hp <= 0) continue;
      this.koT[s] += dt;
      if (this.koT[s] >= CONFIG.tagKODelay) this.swap(s);
    }
  }

  nextRound() {
    this.koReplay = null;
    const w = this.wins.findIndex(n => n >= CONFIG.roundsToWin);
    if (w >= 0) {
      this.phase = 'matchEnd'; this.matchWinner = w; this.phaseT = 0; this.timeScale = 1; this.mstats.finish(this.fighters);
      // a replay is only valid if Tuning wasn't changed during the match
      this.recValid = !!this.rec && JSON.stringify(CONFIG) === JSON.stringify(this.recConfig);
    } else this.startRound();
  }

  // Play the K.O. replay: normal speed, slowing down for the last moment before the K.O.
  // (the replayed game slows itself down after the K.O., like the live one).
  updateKOReplay() {
    const r = this.koReplay;
    if (!r) { this.nextRound(); return; }
    const toKO = (r.koRead - r.readCount) * WORLD.step;
    this.replayAcc = (this.replayAcc || 0) + (toKO > 0 && toKO < 0.45 ? 0.3 : 1);
    while (this.replayAcc >= 1) { r.update(WORLD.step); this.replayAcc -= 1; }
    const over = (r.phase === 'roundEnd' && r.phaseT >= 1.5) || r.phase === 'matchEnd' || r.readCount > r.koRead + 600;
    if (over) this.skipReplay();
  }

  skipReplay() { if (this.phase === 'replay') { this.replayAcc = 0; this.nextRound(); } }

  trackCenter(dt) {
    const { x: cx, y: cy } = Arena.center();
    const [a, b] = this.fighters;
    const da = Math.hypot(a.x - cx, a.y - cy), db = Math.hypot(b.x - cx, b.y - cy);
    if (da + 30 < db) this.center[0] += dt;
    else if (db + 30 < da) this.center[1] += dt;
  }

  // Time ran out: the judges' scorecards decide the round.
  roundSummary() {
    const now = this.mstats.p.map(MatchStats.judgeTotals), base = this.roundBase;
    const d = k => [now[0][k] - base[0][k], now[1][k] - base[1][k]];
    return { damage: d('damage'), cleanHits: d('cleanHits'), forward: d('forward'), center: this.center.slice(), blocksParries: d('blocksParries') };
  }

  decideTimeout() {
    const res = Scorecard.judge(this.roundSummary());
    this.cards = res;
    if (res.winner < 0) this.endRound(-1, 'DRAW', 'scorecards even');
    else this.endRound(res.winner, 'DECISION', res.type);
  }

  endRound(winner, reason, detail) {
    this.phase = 'roundEnd';
    this.phaseT = 0;
    this.roundWinner = winner;
    this.endReason = reason;
    this.endDetail = detail;
    if (winner >= 0) this.wins[winner]++;
    if (reason === 'K.O.') this.koRead = this.readCount;
    this.sfx(reason === 'K.O.' ? 'bell3' : 'bell2');
    if (reason === 'K.O.') this.fx.excite(1);
  }

  // ---- collisions ----

  checkHit(att, def) {
    if (att.state !== 'active' || att.atk.hasHit) return false;
    if (def.state === 'dead' || def.invulnT > 0) return false;   // (invulnerable only right after a tag-in)
    const a = att.atk;
    const tip = att.R + a.tip;
    const tx = att.x + Math.cos(a.dir) * tip, ty = att.y + Math.sin(a.dir) * tip;
    // Only bodies can be hit: the segment from the attacker's center to the fist tip (widened for
    // medium/heavy) against the defender's body circle.
    if (distToSegment(def.x, def.y, att.x, att.y, tx, ty) >= def.R + a.width) return false;
    return !Arena.segmentBlocked(att.x, att.y, def.x, def.y);   // a pillar in between blocks the hit
  }

  resolveHits() {
    const [a, b] = this.fighters;
    const aHits = this.checkHit(a, b), bHits = this.checkHit(b, a);
    if (aHits && bHits) {
      // Both connect at once: same attack = clash, otherwise the triangle decides.
      if (a.atk.kind === b.atk.kind) this.clash(a, b);
      else if (ATTACK_BEATS[a.atk.kind] === b.atk.kind) this.applyHit(a, b);
      else this.applyHit(b, a);
    } else if (aHits) this.applyHit(a, b);
    else if (bHits) this.applyHit(b, a);
  }

  applyHit(att, def) {
    const p = att.atk.tier;   // 0 light, 0.5 medium, 1 heavy (effects scale with it)

    // Guard: parry, block, or guard break.
    if (def.blocksFrom(att)) { this.blockHit(att, def); return; }

    // Armor: a heavy's windup shrugs off a light. Medium/heavy break it.
    if (def.armored && !att.atk.pierce) {
      this.armorHit(att, def);
      return;
    }

    const counter = def.state === 'startup';   // hit during their windup
    if (this.training) this.training.exchange(att, def, counter ? 'counter hit' : 'hit');
    let dmg = att.atk.damage;
    if (counter) dmg += att.cfg.counterBonus;
    const kb = att.atk.knock * (counter ? 1.15 : 1);
    this.stats['hits_' + att.atk.kind] = (this.stats['hits_' + att.atk.kind] || 0) + 1;
    this.mstats.landed(att, dmg, counter);

    // Hit advantage: the hitter recovers first by a small amount (bigger for heavier attacks).
    // Knockback (not stun) is what separates the players, so a normal hit resets to neutral
    // with the hitter slightly ahead. Only a wall splat (see resolveWalls) gives a real follow-up.
    const attRec = att.atk.recovery * att.cfg.hitRecoveryMult;
    const adv = att.atk.adv;
    def.takeHit(dmg, att.atk.dir, kb, Math.max(0.05, attRec + adv));
    att.atk.hasHit = true;
    att.stamina = Math.min(att.cfg.staminaMax, att.stamina + att.cfg.hitRefund);
    att.enterRecovery(attRec);   // landing a hit ends the lunge early

    this.sfx('hit_' + att.atk.kind, { x: def.x });
    this.fx.excite({ light: 0.05, medium: 0.12, heavy: 0.25 }[att.atk.kind] + (counter ? 0.12 : 0));
    if (counter) this.sfx('counter', { x: def.x });
    this.stats.hits++;
    if (counter) this.stats.counters++;
    if (att.atk.bonus > 25) this.stats.runHits++;
    this.hitstop = CONFIG.hitstop * (1 + p);
    this.fx.shake(4 + 8 * p + (counter ? 4 : 0));
    this.fx.burstDir(def.x, def.y, att.atk.dir, att.color.main, 16 + Math.round(14 * p), 380 + 300 * p, 0.9);
    this.fx.burst(def.x, def.y, '#ffffff', 6, 200);
    this.fx.ring(def.x, def.y, '#ffffff', 50 + 40 * p);
    this.fx.text(def.x, def.y - 42, (counter ? 'COUNTER  ' : '') + '-' + dmg, counter ? '#ffd84d' : '#ffffff', counter ? 26 : 22);
    if (att.atk.bonus > 25) this.fx.text(att.x, att.y - 40, '+RUN', '#5be08a', 15);   // momentum made this reach
  }

  blockHit(att, def) {
    const a = att.atk, dir = a.dir, cx = Math.cos(dir), cy = Math.sin(dir);
    a.hasHit = true;

    if (def.parrying) {
      // Parry: no cost, the attacker is stunned and the defender is free to punish.
      if (this.training) this.training.exchange(def, att, 'parried', att.atk.kind);   // the parrier is the one with the advantage
      def.parriedThis = true;
      def.blockFresh = false;
      def.setState('idle');
      att.stop();
      att.takeParried(def.cfg.parryStun, dir + Math.PI);
      this.sfx('parry', { x: def.x }); this.fx.excite(0.15);
      this.stats.parries++;
      this.mstats.parried(att, def);
      this.hitstop = 0.1;
      this.fx.shake(5);
      this.fx.ring(def.x + cx * def.R, def.y + cy * def.R, '#7ff0ff', 60);
      this.fx.burst(def.x - cx * def.R, def.y - cy * def.R, '#7ff0ff', 16, 320);
      this.fx.text(def.x, def.y - 42, 'PARRY', '#7ff0ff', 24);
      return;
    }

    if (a.kind === 'heavy' && att.cfg.heavyBreaksGuard) { this.guardBreak(att, def, att.cfg.guardBreakDamage); return; }

    const cost = a.kind === 'light' ? def.cfg.blockCostLight : def.cfg.blockCostMedium;
    if (def.stamina < cost) { def.stamina = 0; this.guardBreak(att, def, 0); return; }   // out of stamina: guard crumbles

    // Clean block: blocker pays stamina and gets pushed back; attacker eats full recovery.
    if (this.training) this.training.exchange(att, def, 'blocked');
    def.stamina -= cost;
    def.regenDelay = def.cfg.regenDelay;
    att.enterRecovery(a.recovery);
    const adv = a.kind === 'light' ? def.cfg.blockAdvLight : def.cfg.blockAdvMedium;
    def.stunDur = Math.max(0.02, a.recovery - adv);
    def.setState('blockstun');
    def.vx = cx * def.cfg.blockPush; def.vy = cy * def.cfg.blockPush;
    att.vx = -cx * def.cfg.blockPush * 0.5; att.vy = -cy * def.cfg.blockPush * 0.5;
    this.sfx('block', { x: def.x });
    this.stats.blocks++;
    this.mstats.blocked(att, def);
    this.hitstop = 0.04;
    this.fx.burst(def.x + cx * -def.R, def.y + cy * -def.R, '#cfe3ff', 8, 200);
    this.fx.text(def.x, def.y - 42, 'BLOCK', '#cfe3ff', 15);
  }

  guardBreak(att, def, dmg) {
    const a = att.atk;
    if (this.training) this.training.exchange(att, def, 'guard break');
    const attRec = a.recovery * att.cfg.hitRecoveryMult;
    def.takeHit(dmg, a.dir, att.cfg.guardBreakKnock, attRec + att.cfg.guardBreakAdv);
    att.enterRecovery(attRec);
    this.sfx('guardbreak', { x: def.x }); this.fx.excite(0.25);
    this.stats.guardBreaks++;
    this.mstats.guardBreak(att, dmg);
    this.hitstop = 0.12;
    this.fx.shake(9);
    this.fx.burst(def.x, def.y, '#ffd84d', 22, 380);
    this.fx.ring(def.x, def.y, '#ffd84d', 80);
    this.fx.text(def.x, def.y - 42, dmg > 0 ? `GUARD BREAK  -${dmg}` : 'GUARD BREAK', '#ffd84d', 24);
  }

  armorHit(att, def) {
    if (this.training) this.training.exchange(att, def, 'into armor');
    def.takeArmoredHit(def.cfg.armorDamage);
    this.mstats.armorDamage(def, def.cfg.armorDamage);
    att.atk.hasHit = true;
    att.enterRecovery(att.atk.recovery);          // full recovery, no refund: you hit armor
    const back = att.atk.dir + Math.PI;           // attacker bounces off (0 = stays put, so a short heavy can still land)
    att.vx = Math.cos(back) * def.cfg.armorBounce; att.vy = Math.sin(back) * def.cfg.armorBounce;

    this.sfx('armor', { x: def.x });
    this.stats.armorHits++;
    this.hitstop = 0.07;
    this.fx.shake(5);
    this.fx.burst(def.x, def.y, '#ffd84d', 14, 260);
    this.fx.ring(def.x, def.y, '#ffd84d', 55);
    this.fx.text(def.x, def.y - 42, def.cfg.armorDamage > 0 ? `ARMOR  -${def.cfg.armorDamage}` : 'ARMOR', '#ffd84d', 22);
  }

  clash(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1;
    const kb = 850;
    a.vx = dx / d * kb; a.vy = dy / d * kb;
    b.vx = -dx / d * kb; b.vy = -dy / d * kb;
    a.atk.hasHit = b.atk.hasHit = true;
    a.stop(); b.stop();
    a.enterRecovery(CONFIG.clashRecovery);
    b.enterRecovery(CONFIG.clashRecovery);

    this.sfx('clash', { x: (a.x + b.x) / 2 });
    this.stats.clashes++;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    this.hitstop = 0.12;
    this.fx.shake(10);
    this.fx.burst(mx, my, '#ffe27a', 28, 500);
    this.fx.ring(mx, my, '#ffe27a', 90);
    this.fx.text(mx, my - 40, 'CLASH', '#ffe27a', 28);
  }

  // Turn fighter events (step, plant, feint, ...) into effects and stats.
  drainEvents() {
    for (const f of this.fighters) {
      for (const e of f.events) {
        if (e === 'thrown') { this.mstats.thrown(f); this.sfx('throw_' + f.atk.kind, { x: f.x }); continue; }
        if (e === 'whiff') { this.mstats.whiffed(f); continue; }
        this.mstats.event(f, e);
        if (e !== 'whiff') this.sfx(e === 'windup' ? 'windup_' + f.atk.kind : e === 'parrywhiff' ? 'missedparry' : e,
                                      { x: f.x, dur: f.atk && f.atk.startup });
        if (e === 'plant') {
          this.stats.plants++;
          this.fx.burst(f.x, f.y, '#c5ccd9', 12, 220);
          this.fx.ring(f.x, f.y, '#c5ccd9', 40);
        } else if (e === 'step') {
          this.stats.steps++;
          this.fx.burstDir(f.x, f.y, Math.atan2(f.step.dy, f.step.dx) + Math.PI, '#8fb3ff', 5, 160, 0.5);
        } else if (e === 'parrywhiff') {
          this.stats.parryWhiffs++;
          this.fx.text(f.x, f.y - 42, 'MISSED PARRY', '#ff7a7a', 14);
        } else if (e === 'windup') {
          // (visual handled by the glove animation)
        } else if (e === 'wallbounce') {
          this.fx.ropeHit(f.x, f.y, 8);
          this.fx.burst(f.x, f.y, '#c5ccd9', 8, 200);
          this.fx.shake(3);
        } else if (e === 'feint') {
          this.fx.text(f.x, f.y - 42, 'FEINT', '#8fb3ff', 16);
        }
      }
      f.events.length = 0;
    }
  }

  resolveBodies() {
    const [a, b] = this.fighters;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy), min = a.R + b.R;
    if (d >= min) return;
    const nx = d > 0 ? dx / d : 1, ny = d > 0 ? dy / d : 0;
    const push = (min - d) / 2;
    a.x -= nx * push; a.y -= ny * push;
    b.x += nx * push; b.y += ny * push;
  }

  resolveWalls() {
    for (const f of this.fighters) {
      const normals = Arena.resolve(f, f.R);
      // Movement velocity: bounces back (losing speed) if you hit faster than walking, otherwise
      // just stops. Knockback rebounds a little. Works for any wall/pillar via its normal.
      let impact = 0;
      for (const n of normals) {
        const vn = f.mvx * n.x + f.mvy * n.y;                    // < 0 = moving into the wall
        if (vn < 0) {
          const keep = (f.cfg.momentum && -vn > f.cfg.moveSpeed * 1.05) ? f.cfg.wallBounce : 0;
          f.mvx -= (1 + keep) * vn * n.x; f.mvy -= (1 + keep) * vn * n.y;
        }
        const kn = f.vx * n.x + f.vy * n.y;
        if (kn < 0) { impact = Math.max(impact, -kn); f.vx -= 1.25 * kn * n.x; f.vy -= 1.25 * kn * n.y; }
      }

      // A lunge running into a wall or pillar ends there and bounces.
      if (f.state === 'active' && normals.length) {
        const n = normals.find(n => Math.cos(f.atk.dir) * n.x + Math.sin(f.atk.dir) * n.y < -0.2);
        if (n) f.lungeHitWall(n.x, n.y);
      }

      // Wall splat: once per combo. After a splat you can't be splatted again until you've had control,
      // so a pinned player can't be looped against the wall.
      if (impact > f.cfg.wallSplatSpeed && f.state === 'hitstun' && !f.splatLock) {
        f.splatLock = true;
        f.stunDur = f.t + f.cfg.wallSplatStun;
        f.flash = 0.15;
        this.sfx('splat', { x: f.x });
        this.fx.ropeHit(f.x, f.y, 16); this.fx.excite(0.3);
        this.stats.splats++;
        this.fx.shake(8);
        this.fx.burst(f.x, f.y, '#ff5c5c', 14, 260);
        this.fx.text(f.x, f.y - 42, 'WALL SPLAT', '#ff7a7a', 22);
      }
    }
  }
}
