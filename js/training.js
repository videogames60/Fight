// training.js: the training room. One dummy; you change what it does by PUNCHING the pads on the
// walls (no menus: it's aim practice too). Each punch cycles that pad's setting.
//   MOVE     still · back and forth · stepping · random
//   ACTION   nothing · block · parry · block, then jab back · random attacks
//   DISPLAY  hitboxes + recovery bars on/off
//   KNOCKBACK  normal · none (the dummy doesn't get pushed by your hits, so you can keep practicing at one distance)
//   HEALTH   infinite HP and stamina on/off (off: a K.O. just resets both fighters)
//   RESET    put both fighters back at the start
// After every exchange the readout shows who could act first and by how much ("you +0.08s").

const TRAINING_PADS = [
  { key: 'move',     label: 'MOVE',    side: 'top',    at: 0.25, values: ['still', 'back & forth', 'stepping', 'random'] },
  { key: 'action',   label: 'ACTION',  side: 'top',    at: 0.5,  values: ['nothing', 'block', 'parry', 'block, jab back', 'random attacks'] },
  { key: 'reset',    label: 'RESET',   side: 'top',    at: 0.75, values: ['positions'] },
  { key: 'hitboxes', label: 'DISPLAY', side: 'bottom', at: 0.25, values: ['hitboxes on', 'hitboxes off'] },
  { key: 'knock',    label: 'KNOCKBACK', side: 'bottom', at: 0.5, values: ['normal', 'none (dummy stays put)'] },
  { key: 'infinite', label: 'HEALTH',  side: 'bottom', at: 0.75, values: ['infinite', 'normal'] },
];
const PAD_R = 24;

class Training {
  constructor(game) {
    this.game = game;
    this.set = { move: 0, action: 0, reset: 0, hitboxes: 0, knock: 0, infinite: 0 };   // index into each pad's values
    this.padCool = {};
    this.flash = {};
    this.watch = null;       // exchange being timed for the readout
    this.readout = null;     // { text, color, t }
  }

  value(key) { return TRAINING_PADS.find(p => p.key === key).values[this.set[key]]; }
  get showHitboxes() { return this.set.hitboxes === 0; }
  get infinite() { return this.set.infinite === 0; }

  // Pads sit on the top and bottom walls of the arena, half inside it.
  pads() {
    const B = Arena.bounds();
    return TRAINING_PADS.map(p => ({ ...p, x: B.x + B.w * p.at, y: p.side === 'top' ? B.y + 6 : B.y + B.h - 6, r: PAD_R }));
  }

  // ---- called by Game every fight step ----
  update(dt) {
    const g = this.game, [you, dummy] = g.fighters;
    for (const k in this.padCool) this.padCool[k] -= dt;
    for (const k in this.flash) this.flash[k] -= dt;
    this.checkPads(you);

    if (this.set.knock === 1) { dummy.vx = dummy.vy = 0; }   // no knockback: hits don't push the dummy
    for (const f of g.fighters) {
      if (this.infinite) { f.stamina = f.cfg.staminaMax; if (f.hp < maxHp(f.cfg)) f.hp = maxHp(f.cfg); }
      if (f.state === 'dead') this.resetFighters();   // normal health: a K.O. just starts over
    }

    // Exchange readout: once both fighters can act again, show who was first and by how much.
    const w = this.watch;
    if (w) {
      w.t += dt;
      const free = f => f.state === 'idle' || f.state === 'block';
      if (w.tA === null && free(w.att)) w.tA = w.t;
      if (w.tD === null && free(w.def)) w.tD = w.t;
      if (w.tA !== null && w.tD !== null) {
        const attFirst = w.tD - w.tA;                         // + = attacker acts first
        const yours = w.att === you ? attFirst : -attFirst;   // from your side
        const sgn = Math.abs(yours) < 0.005 ? '±' : yours > 0 ? '+' : '−';
        this.readout = {
          text: `${w.what}   ·   you ${sgn}${Math.abs(yours).toFixed(2)}s`,
          color: Math.abs(yours) < 0.005 ? '#e8ecf3' : yours > 0 ? '#5be08a' : '#ff7a7a', t: 0,
        };
        this.watch = null;
      } else if (w.t > 3) this.watch = null;
    }
    if (this.readout) this.readout.t += dt;
  }

  // Game calls this when an exchange happens (hit, block, parry, guard break, armor).
  // `kind` = which attack it was (defaults to the attacker's).
  exchange(att, def, what, kind = att.atk && att.atk.kind) {
    this.watch = { att, def, what: (kind ? kind + ' ' : '') + what, t: 0, tA: null, tD: null };
  }

  checkPads(f) {
    if (f.state !== 'active' || f.atk.hasHit) return;
    const a = f.atk, tip = f.R + a.tip;
    const tx = f.x + Math.cos(a.dir) * tip, ty = f.y + Math.sin(a.dir) * tip;
    for (const p of this.pads()) {
      if ((this.padCool[p.key] || 0) > 0) continue;
      if (distToSegment(p.x, p.y, f.x, f.y, tx, ty) >= p.r + a.width) continue;
      // Punched: cycle the setting. The punch stops there like a landed hit.
      this.padCool[p.key] = 0.3; this.flash[p.key] = 0.3;
      a.hasHit = true; f.stop(); f.enterRecovery(a.recovery * f.cfg.hitRecoveryMult);
      if (p.key === 'reset') this.resetFighters();
      else this.set[p.key] = (this.set[p.key] + 1) % p.values.length;
      const g = this.game;
      g.sfx('block', { x: p.x }); g.hitstop = 0.04;
      g.fx.ring(p.x, p.y, '#ffd84d', 46);
      g.fx.text(p.x, p.side === 'top' ? p.y + 56 : p.y - 56, p.key === 'reset' ? 'RESET' : this.value(p.key).toUpperCase(), '#ffd84d', 18);
      if (g.controllers[1].ai) g.controllers[1].ai.reset();
      return;
    }
  }

  resetFighters() {
    const g = this.game;
    for (const f of g.fighters) f.reset();
    this.watch = null;
    g.fx.clear();
  }
}

// The dummy's brain (used through Controller like the CPU). Reads the training settings each frame.
class DummyController {
  constructor(training) { this.tr = training; this.reset(); }

  reset() { this.t = 0; this.nextStep = 0.6; this.stepDir = 1; this.wander = { x: 0, y: 0, t: 0 }; this.atkCool = 1; this.parryAt = null; this.prevState = 'idle'; this.jabT = 0; }

  think(self, opp, dt) {
    const out = Input.emptyInput(), tr = this.tr;
    this.t += dt;
    const dx = opp.x - self.x, dy = opp.y - self.y, d = Math.hypot(dx, dy) || 1;
    out.aim = true; out.ax = dx / d; out.ay = dy / d;            // always faces you
    const home = self.spawn, C = Arena.bounds();

    // ---- movement ----
    const move = tr.value('move');
    if (move === 'back & forth') {
      const want = home.y + 150 * Math.sin(this.t * 2 * Math.PI / 2.6);
      out.my = clamp((want - self.y) / 40, -1, 1);
      out.mx = clamp((home.x - self.x) / 60, -1, 1);
    } else if (move === 'stepping') {
      this.nextStep -= dt;
      if (this.nextStep <= 0 && self.state === 'idle') {
        // step up/down, alternating, drifting back toward home
        this.stepDir = self.y > home.y + 60 ? -1 : self.y < home.y - 60 ? 1 : -this.stepDir;
        out.dodge = true; out.my = this.stepDir; out.mx = clamp((home.x - self.x) / 120, -0.4, 0.4);
        this.nextStep = 0.75;
      }
    } else if (move === 'random') {
      const w = this.wander;
      w.t -= dt;
      if (w.t <= 0) {
        const a = Math.random() * TAU;
        w.x = Math.cos(a); w.y = Math.sin(a);
        // stay near the middle of the room
        if (Math.hypot(self.x - home.x, self.y - home.y) > 160) { w.x = (home.x - self.x); w.y = (home.y - self.y); const m = Math.hypot(w.x, w.y) || 1; w.x /= m; w.y /= m; }
        w.t = 0.4 + Math.random() * 0.6;
        if (Math.random() < 0.3 && self.state === 'idle') { out.dodge = true; }
      }
      out.mx = w.x; out.my = w.y;
    }
    if (self.y < C.y + 70) out.my = Math.max(out.my, 0.5);              // keep off the pads
    if (self.y > C.y + C.h - 70) out.my = Math.min(out.my, -0.5);

    // ---- action ----
    const action = tr.value('action');
    if (action === 'block') out.block = true;
    else if (action === 'block, jab back') {
      // hold block; the moment a blocked hit's stun ends, let go and jab back. Block stays released
      // until the jab is out (holding block would win over the jab).
      const justFree = this.prevState === 'blockstun' && self.state !== 'blockstun';
      if (justFree && d < self.fixedRange('light') + 30) { this.jabT = 0.2; out.light = true; }
      if (this.jabT > 0) { this.jabT -= dt; if (self.state === 'startup' || self.state === 'active') this.jabT = 0.05; }
      else out.block = self.state !== 'startup' && self.state !== 'active' && self.state !== 'recovery';
    } else if (action === 'parry') {
      // press block just before your attack would land (perfect timing: it shows what a parry does)
      if (opp.state === 'startup' && this.parryAt === null && d < opp.fixedRange(opp.atk.kind) + 30) {
        const left = opp.atk.startup - opp.t + (opp.atk.travel / opp.atk.baseSpeed) * 0.5;
        this.parryAt = this.t + Math.max(0, left - 0.05);
      }
      if (this.parryAt !== null && this.t >= this.parryAt) { out.block = true; if (this.t > this.parryAt + 0.15) this.parryAt = null; }
      if (opp.state !== 'startup' && opp.state !== 'active' && this.parryAt !== null && this.t > this.parryAt + 0.15) this.parryAt = null;
    } else if (action === 'random attacks') {
      this.atkCool -= dt;
      if (this.atkCool <= 0 && self.state === 'idle') {
        const reach = ATTACK_KINDS.filter(k => d < self.fixedRange(k) - 5 && (k === 'light' || self.stamina >= fixedAttack(k, self.cfg).cost));
        if (reach.length) { out[reach[Math.floor(Math.random() * reach.length)]] = true; this.atkCool = 0.7 + Math.random() * 0.9; }
      }
    }
    this.prevState = self.state;
    return out;
  }
}
