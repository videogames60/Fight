// fighter.js: one fighter: movement, attacks, block/parry, step, plant and stamina.
//
// State machine:
//   idle ──light/medium/heavy──> startup (windup) ──> active (lunge) ──> recovery ──> idle
//     light: fast, longest reach.  medium: mid range, breaks armor.  heavy: short, armored windup.
//     step during a medium/heavy windup = feint (cancel into a step, costs stamina).
//   idle ──hold block──> block ──release──> idle         (slow walk, stamina drain, front only)
//   block ──hit lands──> blockstun ──> block/idle        (blocker usually acts first)
//     every fresh press of block = a parry attempt for parryWindow (tap or hold, same either way).
//     pressing again within parryCooldown gives no parry window (no mashing).
//     block held or pressed during a recovery comes out as a plain block (no parry).
//   idle ──step──> step ──> stepRecovery ──> idle        (no invulnerability)
//     in momentum modes a step ADDS to your velocity, so it can't reverse you on a dime.
//   idle ──plant──> plant (instant stop, cost grows with speed) ──> idle
//   any ──hit──> hitstun ──> idle  (or dead)
//
// Movement (CONFIG.momentum):
//   classic:  velocity snaps to the stick every frame; committed states stop dead.
//   momentum: velocity accelerates toward the stick, brakes when reversing, and
//             committed states slide to a stop.
//
// Momentum lunge: your speed in the direction you're aiming adds to (or takes from) the lunge's reach.

// Fraction of a lunge's distance covered at progress u (0..1): fast for 60%, then easing out.
// (Integral of the speed profile 1.15 -> 0.4; equals 1 at u = 1.)
function lungeProgress(u) {
  if (u <= 0.6) return 1.15 * u;
  const v = u - 0.6;
  return 0.69 + 1.15 * v - 0.75 * v * v / 0.8;
}

class Fighter {
  constructor(index, color, spawnX, spawnY, spawnFacing, charId = 'standard') {
    this.index = index;
    this.charId = CHARACTERS[charId] ? charId : 'standard';
    this.cfg = characterConfig(this.charId);   // per-fighter settings: Tuning values + this character's trades
    this.color = color;          // { main, dark }
    this.spawn = { x: spawnX, y: spawnY, facing: spawnFacing };
    this.spentTotal = 0;                       // stamina spent over the whole match (stats)
    this.reset();
  }

  reset() {
    this.x = this.spawn.x; this.y = this.spawn.y;
    this.mvx = 0; this.mvy = 0;               // movement velocity (own legs)
    this.vx = 0; this.vy = 0;                 // knockback velocity
    this.facing = this.spawn.facing;
    this.hp = maxHp(this.cfg);
    this.bruise = 0; this.healT = 0; this.invulnT = 0;          // tag team: recoverable health (heals while resting on the apron)
    this.fixBuf = null; this.fixBufT = 0;     // buffered attack press
    this.stepBuf = 0;                         // buffered step press
    this.blockFresh = false; this.parriedThis = false; this.sinceBlockPress = 9; this.releasedInWindow = false;
    this.stamina = this.cfg.staminaMax;
    this.regenDelay = 0;
    this.regenMult = 1;
    this.regenHint = 1; this.regenHintT = 0;
    this.atk = null;
    this.step = null;
    this.lungeK = 1.15;
    this.recoverDur = 0;
    this.stunDur = 0;
    this.flash = 0;
    this.armorFlash = 0;
    this.splatLock = false;
    this.moveX = 0; this.moveY = 0;
    this.driftingAway = false;
    this.stepAimX = -Math.cos(this.facing); this.stepAimY = -Math.sin(this.facing);
    this.trail = [];
    this.events = [];                          // events for game.js to turn into effects, sounds and stats
    this.setState('idle');
  }

  setState(s) { this.state = s; this.t = 0; }
  get R() { return WORLD.radius; }
  get speed() { return Math.hypot(this.mvx, this.mvy); }

  // Lunge reach change from your movement: one smooth curve.
  //   moving toward your aim -> extra reach (up to lungeMomentumMax)
  //   standing still         -> 0
  //   moving away from aim   -> lost reach (down to -lungeMomentumPenaltyMax)
  momentumBonus(dir) {
    const along = this.mvx * Math.cos(dir) + this.mvy * Math.sin(dir);
    return clamp(along * this.cfg.lungeMomentum, -this.cfg.lungeMomentumPenaltyMax, this.cfg.lungeMomentumMax);
  }

  plantCost() { return this.cfg.plantCostBase + this.cfg.plantCostSpeed * this.speed / this.cfg.moveSpeed; }
  canStep() { return this.stamina >= this.cfg.stepCost; }

  // Center-to-center distance an attack can hit (no momentum).
  fixedRange(kind) { const A = fixedAttack(kind, this.cfg); return A.travel + A.tip + 2 * this.R; }

  // Parry: the opening moment of a fresh block press.
  get parrying() { return this.state === 'block' && this.blockFresh && this.t <= this.cfg.parryWindow; }

  // Is an attack from `att` hitting our guard (front only)?
  blocksFrom(att) {
    if (this.state !== 'block' && this.state !== 'blockstun') return false;
    const toAtt = Math.atan2(att.y - this.y, att.x - this.x);
    return Math.abs(angleDiff(this.facing, toAtt)) <= this.cfg.blockAngle * Math.PI / 180;
  }

  enterBlock(fresh) {
    // A fresh press opens a parry window, unless you pressed too recently (anti-mash).
    this.blockFresh = fresh && this.sinceBlockPress >= this.cfg.parryCooldown;
    if (fresh) this.sinceBlockPress = 0;
    this.parriedThis = false;
    this.releasedInWindow = false;
    this.setState('block');
  }

  // Armor: a heavy's windup can't be interrupted by a light.
  get armored() { return this.cfg.armor && this.state === 'startup' && this.atk.kind === 'heavy'; }

  // Seconds left in which this fighter is stuck and can be punished (estimate; used by the AI).
  punishWindow() {
    if (this.state === 'recovery' || this.state === 'stepRecovery') return this.recoverDur - this.t;
    if (this.state === 'plant') return this.cfg.plantRecovery - this.t;
    return 0;
  }

  spend(amount) {
    this.spentTotal += Math.min(amount, this.stamina);
    this.stamina = Math.max(0, this.stamina - amount);
    this.regenDelay = this.cfg.regenDelay;
  }

  // Moving away from the opponent is slower than moving toward them.
  backFactorVec(x, y, opp) {
    const m = Math.hypot(x, y);
    if (m < 0.05) return 1;
    const tx = opp.x - this.x, ty = opp.y - this.y, d = Math.hypot(tx, ty) || 1;
    const dot = (x * tx + y * ty) / (m * d);
    return dot < 0 ? lerp(1, this.cfg.backSpeedMult, -dot) : 1;
  }

  // Start whatever is buffered (attack first, then step). Returns true if something started.
  tryBuffered(inp) {
    if (this.fixBufT > 0) { if (this.startFixed(this.fixBuf)) { this.fixBufT = 0; return true; } }
    else if (this.stepBuf > 0) { if (this.pressStep()) { this.stepBuf = 0; return true; } }
    return false;
  }

  // ---- per-step update ----
  update(dt, inp, opp) {
    this.t += dt;
    this.sinceBlockPress += dt;
    if (this.state === 'idle' || this.state === 'block') this.splatLock = false;   // can be wall-splatted again once you've had control
    this.oppX = opp.x; this.oppY = opp.y;
    this.flash = Math.max(0, this.flash - dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.armorFlash = Math.max(0, this.armorFlash - dt);

    // Input buffer: count down first, then record this frame's press, so a press always gets this
    // frame even with the buffer at 0 (0 = only a press on a frame you can act counts).
    this.fixBufT = Math.max(0, this.fixBufT - dt);
    this.stepBuf = Math.max(0, this.stepBuf - dt);
    for (const k of ATTACK_KINDS) if (inp[k + 'Pressed']) { this.fixBuf = k; this.fixBufT = Math.max(this.cfg.attackBuffer, 1e-6); }
    if (inp.dodgePressed) this.stepBuf = Math.max(this.cfg.stepBuffer, 1e-6);

    // Where do we want to face?
    let aim = null;
    if (this.cfg.autoLock || inp.forceLock) aim = Math.atan2(opp.y - this.y, opp.x - this.x);
    else if (inp.aim) aim = Math.atan2(inp.ay, inp.ax);

    // Step direction = move stick; neutral = backstep.
    const mm = Math.hypot(inp.mx, inp.my);
    if (mm > 0.2) { this.stepAimX = inp.mx / mm; this.stepAimY = inp.my / mm; }
    else { this.stepAimX = -Math.cos(this.facing); this.stepAimY = -Math.sin(this.facing); }

    let canMove = false, canTurn = false, speedMul = 1, turnRate = this.cfg.turnRateIdle;
    let scripted = false;   // position driven by a lunge or step, not by mv

    switch (this.state) {
      case 'idle':
        canMove = canTurn = true;
        if (inp.plantPressed) this.pressPlant();
        else if (inp.block) this.enterBlock(inp.blockPressed);   // block held from a recovery = plain block, no parry
        else this.tryBuffered(inp);
        break;

      case 'block': {
        canMove = canTurn = true;
        speedMul = this.cfg.blockMoveMult;
        turnRate = this.cfg.blockTurn;
        this.stamina = Math.max(0, this.stamina - this.cfg.blockDrain * dt);
        this.regenDelay = this.cfg.regenDelay;
        const inWindow = this.blockFresh && this.t < this.cfg.parryWindow;
        if (!inp.block) {
          if (inWindow) this.releasedInWindow = true;           // a tap: the parry stays active for its full window
          else {
            if (this.releasedInWindow && !this.parriedThis) this.events.push('parrywhiff');   // tap-parry that caught nothing
            this.setState('idle');
          }
        } else if (!inWindow) {
          this.tryBuffered(inp);                                // attack or step straight out of a held block
        }
        break;
      }

      case 'blockstun':
        if (this.t >= this.stunDur) { if (inp.block) this.enterBlock(false); else this.setState('idle'); }
        break;

      case 'startup':
        // Windup: you can still turn a little (light: freely, medium some, heavy barely); movement slides.
        canTurn = true;
        turnRate = this.atk.turn;
        if (inp.dodgePressed && this.atk.kind !== 'light') {
          // Feint: cancel the medium/heavy windup into a step. Costs extra stamina.
          this.stepBuf = 0;
          this.spend(this.cfg.feintCostBase + this.cfg.feintCostFrac * this.atk.cost);
          this.events.push('feint');
          this.setState('idle');
          this.pressStep();
          break;
        }
        if (this.t >= this.atk.startup) this.launch();
        break;

      case 'active': {
        scripted = true;
        const a = this.atk;
        // Fast for most of the lunge, easing down at the end so it flows into the slide.
        // Move by the change in the travelled fraction, so the lunge always covers exactly a.dist.
        const u0 = Math.min(1, (this.t - dt) / a.activeDur), u = Math.min(1, this.t / a.activeDur);
        this.lungeK = u < 0.6 ? 1.15 : lerp(1.15, 0.4, (u - 0.6) / 0.4);
        const ds = a.dist * (lungeProgress(u) - lungeProgress(Math.max(0, u0)));
        this.x += Math.cos(a.dir) * ds;
        this.y += Math.sin(a.dir) * ds;
        if (this.t >= a.activeDur) {
          if (this.cfg.momentum) { this.mvx = Math.cos(a.dir) * a.baseSpeed * this.cfg.lungeCarry; this.mvy = Math.sin(a.dir) * a.baseSpeed * this.cfg.lungeCarry; }
          this.events.push('whiff');
          this.enterRecovery(a.recovery + a.whiffExtra);       // whiffed: full recovery plus the whiff extra
        }
        break;
      }

      case 'recovery':
      case 'stepRecovery':
        if (inp.plantPressed) this.plantDuringRecovery();
        if (this.t >= this.recoverDur) this.setState('idle');
        break;

      case 'step': {
        scripted = true;
        const s = this.step;
        const k = 1 - this.t / s.dur;                 // ease-out, average 1
        const v = s.speed * (0.5 + k);
        this.x += (s.dx * v + s.bx) * dt;             // step motion + whatever velocity you already had
        this.y += (s.dy * v + s.by) * dt;
        if (this.t >= s.dur) {
          if (this.cfg.momentum) { const e = this.stepEndVelocity(s); this.mvx = e.x; this.mvy = e.y; }
          else this.stop();
          this.recoverDur = this.cfg.stepRecovery;
          this.setState('stepRecovery');
        }
        break;
      }

      case 'plant':
        if (this.t >= this.cfg.plantRecovery) this.setState('idle');
        break;

      case 'hitstun':
        if (this.t >= this.stunDur) this.setState('idle');
        break;

      case 'dead':
        break;
    }

    // Own movement
    if (!scripted) {
      let tx = 0, ty = 0;
      if (canMove) {
        const s = this.cfg.moveSpeed * speedMul * this.backFactorVec(inp.mx, inp.my, opp);
        tx = inp.mx * s; ty = inp.my * s;
      }
      if (this.cfg.momentum) {
        const ox = opp.x - this.x, oy = opp.y - this.y, od = Math.hypot(ox, oy) || 1;
        this.driftingAway = this.speed > 1 && (this.mvx * ox + this.mvy * oy) / (this.speed * od) < -0.5;
        this.approachVelocity(tx, ty, canMove, dt);
      } else {
        this.mvx = tx; this.mvy = ty;
      }
      this.x += this.mvx * dt;
      this.y += this.mvy * dt;
    }
    if (canMove) { this.moveX = inp.mx; this.moveY = inp.my; } else { this.moveX = this.moveY = 0; }

    if (canTurn && aim !== null) this.facing = rotateToward(this.facing, aim, turnRate * dt);

    // Knockback
    this.x += this.vx * dt; this.y += this.vy * dt;
    const f = Math.exp(-this.cfg.knockFriction * dt);
    this.vx *= f; this.vy *= f;

    this.updateStamina(dt, opp);
    this.updateTrail();
  }

  // Step pressed while free. Returns true if it happened.
  pressStep() {
    if (!this.canStep()) return false;
    // Stepping toward the opponent goes a bit further, stepping away a bit less.
    const dist = this.cfg.stepDist * this.dirScale(this.stepAimX, this.stepAimY, this.cfg.fwdStepMult, this.cfg.backStepMult);
    const dur = this.cfg.stepDur;
    this.spend(this.cfg.stepCost);
    // In momentum modes the step is added on top of your current velocity.
    const keep = this.cfg.momentum;
    this.step = { dx: this.stepAimX, dy: this.stepAimY, dur, speed: dist / dur, carry: this.cfg.stepCarry,
                  bx: keep ? this.mvx : 0, by: keep ? this.mvy : 0 };
    this.stop();
    this.events.push('step');
    this.setState('step');
    return true;
  }

  // Step distance by direction: toward opponent -> fwdMult, sideways -> 1, straight away -> backMult.
  dirScale(x, y, fwdMult, backMult) {
    const tx = this.oppX - this.x, ty = this.oppY - this.y, d = Math.hypot(tx, ty) || 1, m = Math.hypot(x, y) || 1;
    const dot = (x * tx + y * ty) / (m * d);
    return dot < 0 ? lerp(1, backMult, -dot) : lerp(1, fwdMult, dot);
  }

  // Velocity you leave a step with: what you had before + the step's carry. A step can only push your
  // speed (in its direction) up to the cap; if you were already faster, it just doesn't add more.
  stepEndVelocity(s) {
    let x = s.bx + s.dx * s.speed * s.carry, y = s.by + s.dy * s.speed * s.carry;
    const limit = Math.max(this.cfg.moveSpeed * this.cfg.stepSpeedCap, s.bx * s.dx + s.by * s.dy);
    const along = x * s.dx + y * s.dy;
    if (along > limit) { x -= s.dx * (along - limit); y -= s.dy * (along - limit); }
    return { x, y };
  }

  // Plant while stuck in a recovery: stop sliding, but stay stuck until the recovery (and the plant's own) ends.
  plantDuringRecovery() {
    if (!this.cfg.plantInRecovery || !this.cfg.momentum || this.speed < 5) return;
    const cost = this.plantCost();
    if (this.stamina < cost) return;
    this.spend(cost);
    this.stop();
    this.recoverDur = Math.max(this.recoverDur, this.t + this.cfg.plantRecovery);
    this.events.push('plant');
  }

  // Plant: dig in and stop dead. Costs more the faster you're going.
  pressPlant() {
    const cost = this.plantCost();
    if (this.stamina < cost) return false;
    this.spend(cost);
    this.stop();
    this.events.push('plant');
    this.setState('plant');
    return true;
  }

  // Momentum: steer your velocity toward the stick instead of snapping to it.
  //   pushing the way you're going / turning -> accel
  //   pushing against your motion             -> brake
  //   stick released, or already over speed   -> coast (friction)
  //   committed (can't steer)                 -> slide (friction)
  // Rates come from the "time to ..." settings, measured from full walking speed.
  approachVelocity(tx, ty, canSteer, dt) {
    const dvx = tx - this.mvx, dvy = ty - this.mvy, dv = Math.hypot(dvx, dvy);
    if (dv < 1e-6) return;
    const vmax = this.cfg.moveSpeed;
    let time;
    if (!canSteer) time = this.cfg.slideTime;
    else {
      const tmag = Math.hypot(tx, ty), sp = this.speed;
      const along = sp > 1 ? (this.mvx * tx + this.mvy * ty) / sp : 0;   // target component along current motion
      if (tmag < 1) time = this.cfg.coastTime;                               // let go of the stick
      else if (along < -0.2 * tmag) time = this.cfg.brakeTime;               // pushing against your motion
      else if (sp > tmag + 1 && along > 0.7 * tmag) time = this.cfg.coastTime; // faster than target (after a step): drift down
      else time = this.cfg.accelTime;
      // Retreat drag: coasting away from the opponent dies off as fast as braking.
      if (this.cfg.retreatDrag && this.driftingAway && time === this.cfg.coastTime) time = Math.min(time, this.cfg.brakeTime);
    }
    const step = Math.min(dv, vmax / Math.max(0.01, time) * dt);
    this.mvx += dvx / dv * step;
    this.mvy += dvy / dv * step;
  }

  updateStamina(dt, opp) {
    // regenHint: held briefly so the ▲/▼ indicator doesn't flicker
    this.regenHintT = Math.max(0, this.regenHintT - dt);
    if (this.regenDelay > 0) { this.regenDelay -= dt; this.regenMult = 0; return; }
    if (this.state !== 'idle') { this.regenMult = 0; return; }   // no regen while committed
    let mult = 1;
    const m = Math.hypot(this.moveX, this.moveY);
    if (m > 0.1) {
      const tx = opp.x - this.x, ty = opp.y - this.y, d = Math.hypot(tx, ty) || 1;
      const dot = (this.moveX * tx + this.moveY * ty) / (m * d);
      if (dot > 0.35) mult = this.cfg.advanceRegenMult;
      else if (dot < -0.35) mult = this.cfg.retreatRegenMult;
    }
    this.regenMult = mult;
    if (mult !== 1 && this.stamina < this.cfg.staminaMax) { this.regenHint = mult; this.regenHintT = 0.5; }
    this.stamina = Math.min(this.cfg.staminaMax, this.stamina + this.cfg.regenRate * mult * dt);
  }

  updateTrail() {
    const fast = this.speed > this.cfg.moveSpeed * 1.1;
    if (this.state === 'active' || this.state === 'step' || fast) {
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > 7) this.trail.shift();
    } else if (this.trail.length) {
      this.trail.shift();
    }
  }

  // ---- actions ----
  // Begin an attack's windup. Light is always allowed (even exhausted); medium/heavy need the stamina.
  startFixed(kind) {
    const A = fixedAttack(kind, this.cfg);
    if (kind !== 'light' && this.stamina < A.cost) return false;
    this.spend(A.cost);
    this.atk = {
      kind, tier: A.tier, dir: this.facing,
      startup: A.startup, recovery: A.recovery, tip: A.tip, width: A.width,
      damage: A.damage, knock: A.knock, adv: A.adv, travel: A.travel, baseSpeed: A.speed, whiffExtra: A.whiffExtra,
      turn: A.turn, cost: A.cost, pierce: kind !== 'light', bonus: 0, dist: A.travel,
      activeDur: Math.max(0.01, A.travel / A.speed), speed: A.speed, hasHit: false,
    };
    this.events.push('windup');
    this.setState('startup');
    return true;
  }

  // End of windup: lock direction, add momentum reach, lunge.
  launch() {
    const a = this.atk;
    a.dir = this.facing;
    a.bonus = this.momentumBonus(a.dir);
    a.dist = Math.max(5, a.travel + a.bonus);
    a.speed = a.dist / a.activeDur;
    this.stop();   // the lunge replaces whatever you were sliding with
    this.events.push('thrown');
    this.setState('active');
  }

  // A lunge ran into a wall (n = wall normal, pointing into the arena): stop the lunge there
  // and bounce off, instead of scraping along the wall for the rest of it.
  lungeHitWall(nx, ny) {
    const a = this.atk;
    // the lunge's momentum (same as its whiff slide), scaled by how fast it was still going at impact
    const v = a.baseSpeed * this.cfg.lungeCarry * (this.lungeK / 1.15);
    let vx = Math.cos(a.dir) * v, vy = Math.sin(a.dir) * v;
    const into = vx * nx + vy * ny;                            // negative = moving into the wall
    if (into < 0) {
      const tx = vx - into * nx, ty = vy - into * ny;          // part along the wall
      vx = tx * 0.5 - into * nx * this.cfg.wallBounce;
      vy = ty * 0.5 - into * ny * this.cfg.wallBounce;
    }
    this.mvx = this.cfg.momentum ? vx : 0;
    this.mvy = this.cfg.momentum ? vy : 0;
    this.events.push('wallbounce');
    this.events.push('whiff');
    this.enterRecovery(a.recovery + a.whiffExtra);
  }

  enterRecovery(duration) {
    this.recoverDur = duration;
    this.setState('recovery');
  }

  stop() { this.mvx = this.mvy = 0; }

  // Tag team: part of every hit is a bruise that can heal while resting (never more than what's missing).
  addBruise(dmg) { this.bruise = Math.min(maxHp(this.cfg) - this.hp, this.bruise + dmg * CONFIG.tagBruise); if (this.hp <= 0) this.bruise = 0; }

  takeHit(dmg, dir, knockback, stun) {
    this.hp = Math.max(0, this.hp - dmg);
    this.addBruise(dmg);
    this.vx = Math.cos(dir) * knockback;
    this.vy = Math.sin(dir) * knockback;
    this.stop();
    if (this.atk) this.atk.hasHit = true;
    this.stunDur = stun;
    this.flash = 0.18;
    this.regenDelay = this.cfg.regenDelay;
    this.setState(this.hp <= 0 ? 'dead' : 'hitstun');
  }

  // Our attack got parried: stunned, knocked back a little.
  takeParried(stun, backDir) {
    this.vx = Math.cos(backDir) * 250; this.vy = Math.sin(backDir) * 250;
    this.stunDur = stun;
    this.flash = 0.12;
    this.setState('hitstun');
  }

  // Hit by a light while armored: take (some) damage but keep going.
  takeArmoredHit(dmg) {
    this.hp = Math.max(0, this.hp - dmg);
    this.addBruise(dmg);
    this.armorFlash = 0.25;
    if (this.hp <= 0) { this.stop(); this.setState('dead'); }
  }
}
