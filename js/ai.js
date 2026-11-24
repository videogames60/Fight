// ai.js: the CPU. It plays footsies: hovers just outside your reach, punishes whiffs,
// reacts to medium/heavy windups (block, parry, step, or beat it with the right attack),
// breaks guards with heavies, and walks in behind its guard or with a step.
// Skill (this.level) changes reaction time, aim and how often it takes chances.
// Personality (this.pers, from characters.js) changes what it prefers to do.

// Personality defaults (= the Standard CPU). Characters override these in characters.js.
//   weights:   how often each attack is picked when several reach
//   hover:     preferred distance offset (+ = stays further out, − = crowds you)
//   guardwalk/block/parry/step/stepin: multipliers on how often it does each
//   aggression: >1 attacks more often, <1 waits more
const AI_DEFAULTS = { weights: { light: 0.55, medium: 0.3, heavy: 0.15 }, hover: 0, guardwalk: 1, block: 1, parry: 1, step: 1, stepin: 1, aggression: 1 };

class AIController {
  constructor(opts = {}) {
    this.level = opts.level ?? CONFIG.aiLevel;
    const ch = CHARACTERS[opts.charId] || CHARACTERS.standard;
    this.pers = { ...AI_DEFAULTS, ...(ch.ai || {}) };
    this.reset();
  }

  reset() {
    this.plan = null;
    this.thinkT = 0;
    this.strafeDir = 1;
    this.strafeT = 0;
    this.pokeCool = 0.5;
    this.prevOpp = 'idle';
    this.aimAng = undefined; this.aimErr = 0; this.aimErrT = 0;
    this.tagging = false;
  }

  think(self, opp, dt) {
    return this.humanAim(this.decide(self, opp, dt), self, opp, dt);
  }

  // Aim that lags a little and wanders slightly, so the CPU doesn't track perfectly
  // (sidestepping it works). Better at higher skill.
  humanAim(out, self, opp, dt) {
    const L = this.level;
    const target = Math.atan2(opp.y - self.y, opp.x - self.x);
    if (this.aimAng === undefined) this.aimAng = target;
    this.aimErrT -= dt;
    if (this.aimErrT <= 0) { this.aimErr = (Math.random() * 2 - 1) * lerp(0.35, 0.05, L); this.aimErrT = 0.3 + Math.random() * 0.5; }
    this.aimAng = rotateToward(this.aimAng, target + this.aimErr, lerp(5, 16, L) * dt);
    out.aim = true; out.ax = Math.cos(this.aimAng); out.ay = Math.sin(this.aimAng);
    return out;
  }

  decide(self, opp, dt) {
    const L = this.level;
    const out = Input.emptyInput();
    const dx = opp.x - self.x, dy = opp.y - self.y;
    const d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const oppWindup = opp.state === 'startup' ? opp.atk.kind : null;
    const oppJustStarted = opp.state === 'startup' && this.prevOpp !== 'startup';
    this.prevOpp = opp.state;
    this.strafeT -= dt; this.pokeCool -= dt; this.thinkT -= dt;
    if (this.strafeT <= 0) { this.strafeDir = Math.random() < 0.5 ? -1 : 1; this.strafeT = 0.5 + Math.random() * 1.3; }

    const range = k => self.fixedRange(k);
    const oppMax = Math.max(...ATTACK_KINDS.map(k => opp.fixedRange(k)));
    const atkTime = k => { const A = fixedAttack(k, self.cfg); return A.startup + A.travel / A.speed; };
    const affordable = k => k === 'light' || self.stamina >= fixedAttack(k, self.cfg).cost;
    const reachable = ATTACK_KINDS.filter(k => d < range(k) - 5 && affordable(k));
    const pickWeighted = (kinds, w) => {
      const tot = kinds.reduce((t, k) => t + w[k], 0); let r = Math.random() * tot;
      for (const k of kinds) { r -= w[k]; if (r <= 0) return k; } return kinds[0];
    };

    // 0) Tag team: head to the corner and tag out when hurt or tired (or when the human partner calls).
    const T = self.tagInfo;
    if (T && T.partner.hp > 0 && !this.plan && !this.tagging && self.state === 'idle') {
      const hurt = self.hp + 2 <= T.partner.hp, tired = self.stamina < 25 && T.partner.stamina > 60;
      if (T.call || hurt || tired) this.tagging = true;
    }
    if (this.tagging) {
      if (!T || T.partner.hp <= 0) this.tagging = false;
      else if (!oppWindup || d > opp.fixedRange(oppWindup) + 30) {   // (a windup that can reach still gets answered below)
        const kx = T.corner.x - self.x, ky = T.corner.y - self.y, kd = Math.hypot(kx, ky) || 1;
        out.mx = kx / kd; out.my = ky / kd;
        if (kd < CONFIG.tagZone - 15 && self.state === 'idle') { out.tag = true; this.tagging = false; }
        return this.finish(out);
      }
    }

    // 1) React to a medium/heavy windup that can reach us (after a human-ish delay).
    if (oppJustStarted && oppWindup && oppWindup !== 'light' && (!this.plan || this.plan.type === 'guardwalk')
        && d < opp.fixedRange(oppWindup) + 25) {
      const delay = lerp(0.3, 0.09, L) * (0.8 + Math.random() * 0.4);
      const impact = opp.atk.startup + opp.atk.travel / opp.atk.baseSpeed * 0.5;   // seconds until it lands
      const r = Math.random();
      const side = this.pickSide(self, ux, uy);
      const step = () => ({ type: 'dodge', t: 0, delay, hold: 0.03, dx: -uy * side - ux * 0.35, dy: ux * side - uy * 0.35 });
      const P = this.pers;
      if (r < Math.min(0.9, 0.25 * L * P.parry) && impact - 0.05 > delay * 0.6) {
        this.plan = { type: 'block', t: 0, delay: Math.max(0, impact - 0.05), hold: 0.1 };          // parry attempt
      } else if (oppWindup === 'heavy') {
        if (d < range('medium') && r < 0.45 * L && affordable('medium')) this.plan = { type: 'press', key: 'medium', t: 0, delay: delay * 0.4 };
        else if (r < Math.min(0.97, (0.4 + 0.5 * L) * P.step) && self.canStep()) this.plan = step();
      } else {   // medium
        if (r < Math.min(0.95, 0.6 * P.block)) this.plan = { type: 'block', t: 0, delay, hold: 0.35 };
        else if (self.canStep()) this.plan = step();
      }
    }

    // 2) Carry out the plan.
    if (this.plan) {
      const p = this.plan;
      p.t += dt;
      if (p.type === 'dodge') {
        if (p.t >= p.delay) { out.dodge = p.t < p.delay + p.hold; out.mx = p.dx; out.my = p.dy; }
        if (p.t >= p.delay + p.hold + 0.05) this.plan = null;
        return this.finish(out);
      }
      if (p.type === 'press') {
        if (p.t >= p.delay) { out[p.key] = true; this.plan = null; }
        return this.finish(out);
      }
      if (p.type === 'block') {
        out.block = p.t >= p.delay && p.t < p.delay + p.hold;
        if (p.t >= p.delay + p.hold + 0.02) this.plan = null;
        return this.finish(out);
      }
      if (p.type === 'guardwalk') {
        // Walk in behind the guard; once something reaches, drop guard and attack.
        out.mx = ux; out.my = uy; out.block = true;
        if (reachable.length && self.state === 'block' && self.t > CONFIG.parryWindow) {
          out[pickWeighted(reachable, this.pers.weights)] = true;
          this.plan = null;
        } else if (p.t > 1.2 || self.stamina < 20 || oppWindup === 'heavy') this.plan = null;
        return this.finish(out);
      }
      if (p.type === 'stepin') {
        out.mx = ux; out.my = uy;
        if (p.t < 0.02) out.dodge = true;
        else if (self.state === 'idle') {
          if (reachable.length) out[pickWeighted(reachable, this.pers.weights)] = true;
          this.plan = null;
        }
        if (p.t > 0.7) this.plan = null;
        return this.finish(out);
      }
    }

    // 3) Decide a few times a second.
    if (self.state === 'idle' && this.thinkT <= 0) {
      this.thinkT = lerp(0.2, 0.06, L);
      const win = opp.punishWindow() + (opp.state === 'hitstun' && opp.stunDur > 0.3 ? opp.stunDur - opp.t : 0);
      const press = k => { this.plan = { type: 'press', key: k, t: 0, delay: 0 }; };
      const r = Math.random();
      if (win > 0 && r < 0.3 + 0.65 * L) {
        // punish (whiffs, missed parries, parried attackers) with the strongest attack that lands in time
        for (const k of ['heavy', 'medium', 'light']) {
          if (reachable.includes(k) && atkTime(k) < win + 0.02) { press(k); break; }
        }
      } else if ((opp.state === 'block' || opp.state === 'blockstun') && reachable.includes('heavy') && r < 0.4 + 0.4 * L) {
        press('heavy');                                            // break the guard
      } else if (oppWindup === 'medium' && reachable.includes('light') && r < 0.3 + 0.5 * L) {
        press('light');                                            // light beats medium
      } else if (opp.state === 'idle' && d < opp.fixedRange('light') && r < Math.min(0.8, (0.12 + 0.22 * L) * this.pers.block) && self.stamina > 30) {
        // inside their jab range: put the guard up for a moment (and maybe walk in behind it)
        this.plan = Math.random() < Math.min(0.95, 0.5 * this.pers.guardwalk) ? { type: 'guardwalk', t: 0 } : { type: 'block', t: 0, delay: 0, hold: 0.3 + Math.random() * 0.3 };
      } else if (this.pokeCool <= 0) {
        const P = this.pers;
        if (reachable.length && r < Math.min(0.9, (0.25 + 0.2 * L) * P.aggression)) {
          press(pickWeighted(reachable, P.weights));
          this.pokeCool = (0.5 + Math.random() * 0.7) / P.aggression;
        } else if (!reachable.length && d < Math.max(range('light'), range('medium'), range('heavy')) + 90
                   && r < (0.06 + 0.06 * L) * P.aggression * Math.max(P.guardwalk, P.stepin) ) {
          const gw = 0.6 * P.guardwalk, st = 0.4 * P.stepin;
          this.plan = Math.random() * (gw + st) < gw ? { type: 'guardwalk', t: 0 } : { type: 'stepin', t: 0 };
          this.pokeCool = (0.8 + Math.random() * 0.6) / P.aggression;
        }
      }
    }

    // 4) Footsies movement: hover just outside their longest reach; back off from a heavy windup.
    let want = oppMax + 12 + this.pers.hover;
    if (oppWindup === 'heavy') want = Math.max(want, opp.fixedRange('heavy') + 30);
    if (self.stamina < 30) want += 60;
    const radial = clamp((d - want) / 50, -1, 1);
    let mx = ux * radial - uy * this.strafeDir * 0.55;
    let my = uy * radial + ux * this.strafeDir * 0.55;
    // don't hug walls/pillars, and go around a pillar that's in the way
    const av = Arena.avoid(self.x, self.y, 90);
    mx += av.x; my += av.y;
    const around = Arena.steerAround(self, opp, self.R);
    if (around) { mx += around.x * 0.9; my += around.y * 0.9; }
    out.mx = mx; out.my = my;
    return this.finish(out);
  }

  // Sidestep toward the middle of the arena most of the time.
  pickSide(self, ux, uy) {
    const { x: cx, y: cy } = Arena.center();
    const toCenter = (cx - self.x) * -uy + (cy - self.y) * ux;
    const s = toCenter >= 0 ? 1 : -1;
    return Math.random() < 0.75 ? s : -s;
  }

  // Full stick when actually going somewhere (so speed rules like slower backwalk are visible),
  // partial stick only for small spacing adjustments.
  finish(out) {
    const m = Math.hypot(out.mx, out.my);
    if (m > 0.5) { out.mx /= m; out.my /= m; }
    return out;
  }
}
