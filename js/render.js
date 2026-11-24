// render.js: draws the arena, fighters, telegraphs, effects and HUD onto the canvas.

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  draw(game) {
    // During a K.O. replay, draw the replayed game instead, with a REPLAY marker.
    if (game.phase === 'replay' && game.koReplay) {
      this.draw(game.koReplay);
      this.drawReplayTag('REPLAY', 'A / Enter skip');
      return;
    }
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#06070a';
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    this.drawCrowd(game);

    let sx = 0, sy = 0;
    if (game.active && game.fx.shakeAmt > 0) {
      sx = (Math.random() * 2 - 1) * game.fx.shakeAmt;
      sy = (Math.random() * 2 - 1) * game.fx.shakeAmt;
    }
    ctx.save();
    ctx.translate(sx, sy);
    Camera.apply(ctx);            // world -> screen (zoomed out on big arenas)
    this.drawArena(game);
    if (game.active) {
      if (game.training) this.drawPads(game.training);
      if (game.teams) this.drawTagCorners(game);
      for (const f of game.fighters) this.drawTelegraph(f, game);
      for (const f of game.fighters) this.drawFighter(f, game);
      if (game.training && game.training.showHitboxes) for (const f of game.fighters) this.drawHitbox(f);
      this.drawFx(game.fx);
    }
    ctx.restore();
    this.drawVignette();
    // a match fades in from black
    if (game.active && !game.attract && game.round === 1 && game.phase === 'intro' && game.phaseT < 0.45) {
      ctx.fillStyle = `rgba(0,0,0,${1 - game.phaseT / 0.45})`; ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    }

    if (game.active && !game.attract) {
      this.drawHUD(game);
      this.drawBanner(game);
      if (!game.replaying) this.drawCursor(game);
      if (game.training) { /* instructions are in the training HUD */ }
      else if (game.phase === 'intro' && game.round === 1 && !game.replaying) this.drawHint(game);   // controls reminder, only at the start
    }
  }

  // ---- primitives ----
  circle(x, y, r) { const c = this.ctx; c.beginPath(); c.arc(x, y, r, 0, TAU); }
  line(x1, y1, x2, y2) { const c = this.ctx; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
  text(str, x, y, size, color, align = 'center', weight = 'bold') {
    const c = this.ctx;
    c.font = `${weight} ${size}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color;
    c.fillText(str, x, y);
  }

  // ---- the ring at night ----
  // Mat under a spotlight, ropes (any shape: they follow the arena's outline, and wobble when someone
  // hits them), corner posts in each side's color (round arenas: posts all around, like a cage),
  // padded posts for pillars. The crowd and the vignette are drawn in screen space (see draw()).
  drawArena(game) {
    const ctx = this.ctx, F = Arena.bounds(), c = Arena.center(), d = Arena.def();
    const big = Math.max(F.w, F.h);

    // the platform the ring sits on (a skirt around the ropes)
    ctx.save();
    ctx.fillStyle = '#121419';
    if (d.shape === 'rect') { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(F.x - 28, F.y - 28, F.w + 56, F.h + 56, 10) : ctx.rect(F.x - 28, F.y - 28, F.w + 56, F.h + 56); ctx.fill(); }
    else { const tr = Arena.track(28); ctx.beginPath(); tr.pts.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill(); }

    // the mat: lit in the middle by the spotlight, with a faint canvas texture
    Arena.path(ctx);
    const g = ctx.createRadialGradient(c.x, c.y - big * 0.05, 20, c.x, c.y, big * 0.62);
    g.addColorStop(0, '#2d3344'); g.addColorStop(0.55, '#212634'); g.addColorStop(1, '#151821');
    ctx.fillStyle = g; ctx.fill();
    ctx.clip();
    ctx.fillStyle = this.matPattern(); ctx.globalAlpha = 0.5;
    ctx.fillRect(F.x, F.y, F.w, F.h);
    ctx.globalAlpha = 1;
    // logo in the middle (the center circle is also the "ring control" area for the judges)
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 3;
    this.circle(c.x, c.y, 70); ctx.stroke();
    ctx.font = '900 30px Impact, "Arial Black", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillText('TITLE', c.x, c.y - 15); ctx.fillText('FIGHT', c.x, c.y + 17);
    ctx.restore();

    // pillars: padded posts
    for (const pl of Arena.pillars()) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; this.circle(pl.x + 5, pl.y + 8, pl.r); ctx.fill();
      const pg = ctx.createRadialGradient(pl.x - pl.r * 0.3, pl.y - pl.r * 0.4, 2, pl.x, pl.y, pl.r);
      pg.addColorStop(0, '#4a5268'); pg.addColorStop(1, '#232838');
      ctx.fillStyle = pg; this.circle(pl.x, pl.y, pl.r); ctx.fill();
      ctx.strokeStyle = '#c9ced9'; ctx.lineWidth = 4; this.circle(pl.x, pl.y, pl.r - 5); ctx.stroke();
      ctx.strokeStyle = '#0b0d12'; ctx.lineWidth = 2; this.circle(pl.x, pl.y, pl.r); ctx.stroke();
    }

    this.drawRopes(game);
  }

  // Three ropes along the outline (just outside the wall the fighters bump into), then the posts.
  drawRopes(game) {
    const ctx = this.ctx, d = Arena.def(), hits = game && game.fx ? game.fx.ropes : [];
    const wob = p => {   // outward bulge near recent hits, wobbling back
      let o = 0;
      for (const h of hits) {
        const dd = (p.x - h.x) ** 2 + (p.y - h.y) ** 2;
        if (dd < 40000) o += h.amp * Math.exp(-dd / 5000) * Math.cos(h.t * 22) * Math.exp(-h.t * 3.5);
      }
      return o;
    };
    const ropes = [[3, '#f1f3f8'], [9, '#d94848'], [15, '#f1f3f8']];
    for (const [off, col] of ropes) {
      const tr = Arena.track(off);
      const path = () => { ctx.beginPath(); tr.pts.forEach((p, k) => { const o = wob(p), x = p.x + p.nx * o, y = p.y + p.ny * o; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); };
      ctx.save(); ctx.translate(3, 5); path(); ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
      path(); ctx.strokeStyle = col; ctx.lineWidth = 2.6; ctx.stroke();
    }
    // posts: square ring = 4 corners (left = P1's color, right = P2's); round rings = posts all around
    const posts = [];
    if (d.shape === 'rect') {
      const F = Arena.frame();
      posts.push([F.x - 8, F.y - 8, 0], [F.x - 8, F.y + F.h + 8, 0], [F.x + F.w + 8, F.y - 8, 1], [F.x + F.w + 8, F.y + F.h + 8, 1]);
    } else {
      const tr = Arena.track(9), n = Math.max(6, Math.round(tr.len / 170)), c = Arena.center();
      for (let k = 0; k < n; k++) {
        const p = Arena.trackPoint(tr, tr.len * k / n);
        const side = Math.abs(p.y - c.y) < 40 ? (p.x < c.x ? 0 : 1) : -1;   // the posts at the far left/right are the corners
        posts.push([p.x, p.y, side]);
      }
    }
    for (const [x, y, side] of posts) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; this.circle(x + 3, y + 5, 11); ctx.fill();
      ctx.fillStyle = '#2a2f3c'; this.circle(x, y, 11); ctx.fill();
      ctx.fillStyle = side >= 0 ? FIGHTER_COLORS[side].main : '#d9dde6'; this.circle(x, y, 8); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; this.circle(x - 2.5, y - 2.5, 3); ctx.fill();
    }
  }

  // A small speckled tile for the canvas mat (made once).
  matPattern() {
    if (this._mat) return this._mat;
    const cv = document.createElement('canvas'); cv.width = cv.height = 96;
    const x = cv.getContext('2d');
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 900; k++) { x.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'; x.fillRect(rnd() * 96, rnd() * 96, 1.5, 1.5); }
    this._mat = this.ctx.createPattern(cv, 'repeat');
    return this._mat;
  }

  // The crowd: silhouettes in the dark all around the ring (screen space, outside the ring and the area
  // around it). They bob, more when the crowd is excited, and camera flashes go off on big moments.
  drawCrowd(game) {
    const ctx = this.ctx, W = WORLD.w, H = WORLD.h;
    if (!this._crowd) {
      let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const tones = ['#1c2030', '#232838', '#2a2230', '#1f2a2a', '#30281f', '#262a3a'];
      this._crowd = [];
      for (let y = 6; y < H + 20; y += 21) for (let x = 6; x < W + 20; x += 21) {
        this._crowd.push({ x: x + (rnd() - 0.5) * 12, y: y + (rnd() - 0.5) * 10, r: 5 + rnd() * 2.5, tone: tones[Math.floor(rnd() * tones.length)], ph: rnd() * TAU, sp: 2 + rnd() * 3 });
      }
    }
    // keep out of the ring and the space around it (the tag apron), in screen coordinates
    const cam = Camera.get(), B = Arena.bounds(), pad = (Arena.apron || 0) + 36;
    const x0 = cam.ox + (B.x - pad) * cam.scale, x1 = cam.ox + (B.x + B.w + pad) * cam.scale;
    const y0 = cam.oy + (B.y - pad) * cam.scale, y1 = cam.oy + (B.y + B.h + pad) * cam.scale;
    const hype = game && game.fx ? game.fx.hype : 0, t = game ? game.clock : 0;
    for (const p of this._crowd) {
      if (p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1) continue;
      const bob = Math.sin(t * p.sp + p.ph) * (0.6 + hype * 3.5);
      ctx.fillStyle = p.tone; ctx.beginPath(); ctx.ellipse(p.x, p.y + 4 + bob * 0.4, p.r * 1.5, p.r * 0.9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2e3346'; this.circle(p.x, p.y + bob, p.r * 0.75); ctx.fill();
    }
    // camera flashes
    if (hype > 0.15) {
      const n = Math.floor(hype * 6);
      for (let k = 0; k < n; k++) {
        if (Math.random() > 0.35) continue;
        const p = this._crowd[Math.floor(Math.random() * this._crowd.length)];
        if (p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1) continue;
        const fg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 14);
        fg.addColorStop(0, 'rgba(255,255,255,0.9)'); fg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = fg; this.circle(p.x, p.y, 14); ctx.fill();
      }
    }
  }

  // Darkens the edges of the screen: the spotlight is on the ring.
  drawVignette() {
    const ctx = this.ctx, W = WORLD.w, H = WORLD.h;
    if (!this._vig) {
      const g = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
      this._vig = g;
    }
    ctx.fillStyle = this._vig; ctx.fillRect(0, 0, W, H);
  }

  // Faint arcs in front of a fighter at each fixed attack's reach (learning aid).
  drawRanges(f) {
    if (f.state === 'dead') return;
    const ctx = this.ctx;
    const rings = [['light', 'rgba(255,255,255,0.14)'], ['medium', 'rgba(255,255,255,0.10)'], ['heavy', 'rgba(255,216,77,0.13)']];
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 6]);
    for (const [kind, col] of rings) {
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.fixedRange(kind), f.facing - 0.8, f.facing + 0.8);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // Where the two gloves are (world coordinates), and which way the body faces. They animate each attack:
  // light = lead hand snaps out (barely any tell), medium = rear hand pulls back then punches,
  // heavy = big wind-back (glowing gold: armored), then a long punch. Gloves come back during recovery.
  // Index 0 = the lead (right, +side) hand, 1 = the rear hand.
  gloveSpots(f) {
    const R = f.R;
    const a = f.atk && ['startup', 'active', 'recovery'].includes(f.state) ? f.atk : null;
    const committed = a && (f.state === 'active' || f.state === 'recovery');
    const dir = committed ? a.dir : f.facing;
    const punchSide = a ? (a.kind === 'light' ? 1 : -1) : 0;
    const guarding = f.state === 'block' || f.state === 'blockstun';
    const spots = [1, -1].map(s => {
      let ang = dir + s * (guarding ? 0.32 : 0.75), dist = R + (guarding ? 4 : 2), rad = 7, ext = 0;
      if (a && s === punchSide) {
        if (f.state === 'startup') {
          const k = clamp(f.t / Math.max(0.01, a.startup), 0, 1);
          if (a.kind === 'light') dist = R + 2 - 3 * k;
          else if (a.kind === 'medium') { ang = dir + s * lerp(0.75, 1.5, k); dist = R - 2 * k; }
          else { ang = dir + s * lerp(0.75, 2.3, k); dist = R + 1; rad = lerp(7, 10, k); }
        } else if (f.state === 'active') {
          ext = clamp(f.t / a.activeDur * 2.5, 0, 1);
          if (a.kind === 'heavy') rad = 10;
        } else if (f.state === 'recovery') {
          ext = 1 - clamp(f.t / Math.max(0.01, f.recoverDur), 0, 1);
          if (a.kind === 'heavy') rad = lerp(7, 10, ext);
        }
      }
      let x = f.x + Math.cos(ang) * dist, y = f.y + Math.sin(ang) * dist;
      if (ext > 0) {
        const tx = f.x + Math.cos(dir) * (R + a.tip), ty = f.y + Math.sin(dir) * (R + a.tip);
        x = lerp(x, tx, ext); y = lerp(y, ty, ext);
      }
      return { x, y, r: rad, gold: !!(a && s === punchSide && a.kind === 'heavy' && f.state === 'startup') };
    });
    // a waiting tag partner's jab from outside the ring
    const bp = f.benchPunch;
    if (bp) {
      const ext = bp.t < 0.07 ? 0 : bp.t < 0.12 ? (bp.t - 0.07) / 0.05 : bp.t < 0.17 ? 1 : Math.max(0, 1 - (bp.t - 0.17) / 0.15);
      const g = spots[0], tip = R + BENCH_PUNCH_TIP;
      g.x = lerp(g.x, f.x + Math.cos(bp.dir) * tip, ext); g.y = lerp(g.y, f.y + Math.sin(bp.dir) * tip, ext);
    }
    return { dir: bp ? bp.dir : dir, spots };
  }

  drawTelegraph(f, game) {
    if (CONFIG.showRanges) this.drawRanges(f);
  }

  // The part of a threat line that comes from momentum: green extension when moving in,
  // red "lost" stub when backing off.
  drawMomentumPart(x, y, dx, dy, baseReach, reach, width) {
    if (Math.abs(reach - baseReach) < 2) return;
    const ctx = this.ctx;
    ctx.lineWidth = width + 1;
    if (reach > baseReach) {
      ctx.strokeStyle = 'rgba(91,224,138,0.9)';
      this.line(x + dx * baseReach, y + dy * baseReach, x + dx * reach, y + dy * reach);
    } else {
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(255,92,92,0.75)';
      this.line(x + dx * reach, y + dy * reach, x + dx * baseReach, y + dy * baseReach);
      ctx.setLineDash([]);
    }
  }

  drawFighter(f, game, dim = 1) {
    const ctx = this.ctx, R = f.R, c = f.color;

    // afterimages
    const evasive = f.state === 'step';
    for (let i = 0; i < f.trail.length; i++) {
      const p = f.trail[i], k = (i + 1) / f.trail.length;
      ctx.fillStyle = rgba(evasive ? '#8fb3ff' : c.main, 0.18 * k);
      this.circle(p.x, p.y, R * (0.6 + 0.4 * k)); ctx.fill();
    }

    // speed wake: shows momentum. Green = moving toward opponent, red = moving away.
    if (CONFIG.momentum && f.speed > 90 && f.state !== 'active' && f.state !== 'step') {
      const opp = game.fighters[1 - f.index];
      const ux = f.mvx / f.speed, uy = f.mvy / f.speed;
      const toward = (ux * (opp.x - f.x) + uy * (opp.y - f.y)) / (Math.hypot(opp.x - f.x, opp.y - f.y) || 1);
      const col = toward > 0.3 ? '91,224,138' : toward < -0.3 ? '255,92,92' : '200,205,220';
      const len = Math.min(40, f.speed / 10);
      ctx.strokeStyle = `rgba(${col},0.45)`;
      ctx.lineWidth = 2;
      for (const o of [-9, 9]) {
        const sx = f.x - ux * (R + 4) - uy * o, sy = f.y - uy * (R + 4) + ux * o;
        this.line(sx, sy, sx - ux * len, sy - uy * len);
      }
    }

    // shadow, and a ring on the floor in the side's color (so you can always tell who's who)
    ctx.globalAlpha = dim;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    this.circle(f.x + 4, f.y + 6, R + 2); ctx.fill();
    ctx.fillStyle = rgba(c.main, 0.12);
    this.circle(f.x, f.y, R + 7); ctx.fill();
    ctx.strokeStyle = rgba(c.main, 0.7); ctx.lineWidth = 2.5;
    this.circle(f.x, f.y, R + 7); ctx.stroke();

    const punishable = ['recovery', 'stepRecovery', 'plant'].includes(f.state);
    let alpha = 1;
    if (f.state === 'dead') alpha = 0.55;
    if (f.invulnT > 0) alpha = 0.35 + 0.35 * Math.sin(game.clock * 60);   // just tagged in: can't be hit

    const pose = this.gloveSpots(f);
    BoxerArt.draw(ctx, f.x, f.y, pose.dir, BoxerArt.look(f.charId), pose.spots, {
      R, alpha: alpha * dim, flash: f.flash > 0 ? f.flash / 0.18 : 0, dark: punishable ? 0.4 : f.state === 'dead' ? 0.5 : 0,
    });
    ctx.globalAlpha = alpha * dim;
    if (f.state === 'block' || f.state === 'blockstun') {
      const span = f.cfg.blockAngle * Math.PI / 180;
      const parry = f.parrying;
      ctx.strokeStyle = parry ? '#7ff0ff' : f.state === 'blockstun' ? '#ffffff' : 'rgba(207,227,255,0.8)';
      ctx.lineWidth = parry ? 6 : 4;
      ctx.beginPath(); ctx.arc(f.x, f.y, R + 12, f.facing - span, f.facing + span); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // state outlines
    if (punishable) {
      ctx.strokeStyle = `rgba(255,77,77,${0.45 + 0.45 * Math.sin(game.clock * 28)})`;
      ctx.lineWidth = 3;
      this.circle(f.x, f.y, R + 3); ctx.stroke();
    } else if (f.state === 'startup' && f.atk.kind !== 'light') {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      this.circle(f.x, f.y, R + 3); ctx.stroke();
    }

    // armor glow (gold) while a heavy's windup can't be interrupted
    if (f.armored || f.armorFlash > 0) {
      const a = f.armorFlash > 0 ? 1 : 0.55 + 0.25 * Math.sin(game.clock * 20);
      ctx.strokeStyle = `rgba(255,216,77,${a})`;
      ctx.lineWidth = f.armorFlash > 0 ? 5 : 3;
      this.circle(f.x, f.y, R + 12); ctx.stroke();
    }

    if (f.state === 'dead') return;

    // stamina bar under the fighter
    const bw = 54, bh = 6, bx = f.x - bw / 2, by = f.y + R + 12;
    const max = f.cfg.staminaMax, s = f.stamina / max;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.globalAlpha = f.regenDelay > 0 ? 0.55 : 1;
    ctx.fillStyle = s > 0.5 ? '#7be07b' : s > 0.25 ? '#f2d14b' : '#ff5c5c';
    ctx.fillRect(bx, by, bw * s, bh);
    ctx.globalAlpha = 1;
    // regen marker: ▲ green = moving in, stamina refills faster. ▼ red = backing off, refills slower.
    if (f.regenHintT > 0 && f.stamina < max) {
      const up = f.regenHint > 1;
      ctx.globalAlpha = Math.min(1, f.regenHintT * 4);
      this.text(up ? '▲' : '▼', bx + bw + 9, by + 3, 10, up ? '#7be07b' : '#ff5c5c');
      ctx.globalAlpha = 1;
    }

    // hp pips above
    const n = maxHp(f.cfg), gap = n > 5 ? 7 : 10, py = f.y - R - 12;
    for (let i = 0; i < n; i++) {
      const px = f.x - (n - 1) * gap / 2 + i * gap;
      this.circle(px, py, n > 5 ? 2.6 : 3.2);
      if (i < f.hp) { ctx.fillStyle = c.main; ctx.fill(); }
      else { ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke(); }
    }
  }

  drawFx(fx) {
    const ctx = this.ctx;
    for (const r of fx.rings) {
      ctx.strokeStyle = rgba(r.color, r.life / r.max);
      ctx.lineWidth = 3;
      this.circle(r.x, r.y, r.r); ctx.stroke();
    }
    for (const p of fx.parts) {
      ctx.globalAlpha = clamp(p.life / p.max * 1.5, 0, 1);
      ctx.fillStyle = p.color;
      this.circle(p.x, p.y, p.size); ctx.fill();
    }
    for (const t of fx.texts) {
      ctx.globalAlpha = clamp(t.life / t.max * 2, 0, 1);
      this.text(t.str, t.x, t.y, t.size, t.color);
    }
    ctx.globalAlpha = 1;
  }

  // Display font for big numbers and banners (falls back to a heavy system font).
  dtext(str, x, y, size, color, align = 'center', outline = true) {
    const c = this.ctx;
    if (this._impact === undefined) {   // is Impact installed? (text measures differently if it is)
      c.font = '40px monospace'; const w0 = c.measureText('LUNGE K.O. 123').width;
      c.font = '40px Impact, monospace'; this._impact = c.measureText('LUNGE K.O. 123').width !== w0;
    }
    c.font = this._impact ? `${size}px Impact, Haettenschweiler, sans-serif` : `900 ${size}px "Arial Black", system-ui, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    if (outline) { c.lineJoin = 'round'; c.strokeStyle = 'rgba(0,0,0,0.75)'; c.lineWidth = Math.max(3, size / 9); c.strokeText(str, x, y); c.lineJoin = 'miter'; }
    c.fillStyle = color; c.fillText(str, x, y);
  }

  drawHUD(game) {
    const ctx = this.ctx, W = WORLD.w;
    // a dark band behind the HUD so it reads over the crowd
    const band = ctx.createLinearGradient(0, 0, 0, 118);
    band.addColorStop(0, 'rgba(4,5,8,0.95)'); band.addColorStop(0.75, 'rgba(4,5,8,0.8)'); band.addColorStop(1, 'rgba(4,5,8,0)');
    ctx.fillStyle = band; ctx.fillRect(0, 0, W, 118);
    this._hpFx = this._hpFx || [{ hp: null, t: 0, lost: 0 }, { hp: null, t: 0, lost: 0 }];

    for (let i = 0; i < 2; i++) {
      const f = game.fighters[i], left = i === 0;
      const x0 = left ? 48 : W - 48, dir = left ? 1 : -1, align = left ? 'left' : 'right';

      this.dtext(`P${i + 1}`, x0, 26, 26, f.color.main, align);
      this.dtext(CHARACTERS[f.charId].name.toUpperCase(), x0 + dir * 38, 27, 20, '#e8ecf3', align, false);
      this.text(Input.deviceLabel(game.devices[i]), x0 + dir * (44 + ctx.measureText(CHARACTERS[f.charId].name.toUpperCase()).width), 28, 11, '#6d7690', align, '600');

      // health: one segment per point. Bruises (tag team) are dim; a lost segment flashes.
      const hpN = maxHp(f.cfg), bw = 330, gap = 4, segW = (bw - gap * (hpN - 1)) / hpN, by = 48, bh = 18;
      const fx = this._hpFx[i];
      if (fx.hp !== null && f.hp < fx.hp && game.fighters[i] === fx.f) { fx.t = 0.45; fx.lost = fx.hp; }
      fx.hp = f.hp; fx.f = f; fx.t = Math.max(0, fx.t - 1 / 60);
      for (let k = 0; k < hpN; k++) {
        const sx = left ? x0 + k * (segW + gap) : x0 - (k + 1) * segW - k * gap;
        ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(sx, by, segW, bh);
        if (k < f.hp) {
          const g = ctx.createLinearGradient(0, by, 0, by + bh);
          g.addColorStop(0, shade(f.color.main, 0.25)); g.addColorStop(1, shade(f.color.main, -0.2));
          ctx.fillStyle = g; ctx.fillRect(sx, by, segW, bh);
        } else if (game.teams && k < f.hp + Math.floor(f.bruise + 1e-9)) { ctx.fillStyle = rgba(f.color.main, 0.3); ctx.fillRect(sx, by, segW, bh); }
        else if (fx.t > 0 && k < fx.lost) { ctx.fillStyle = `rgba(255,255,255,${fx.t * 1.8})`; ctx.fillRect(sx, by, segW, bh); }
      }
      if (game.teams) this.drawPartnerHUD(game, i, x0, dir, align);

      // stamina: a thin bar under the health, with marks at the cost of a step, a medium and a heavy
      const sw = bw, sx0 = left ? x0 : x0 - sw, s = f.stamina / f.cfg.staminaMax, sy = by + bh + 6;
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(sx0, sy, sw, 7);
      ctx.fillStyle = s > 0.5 ? '#7be07b' : s > 0.25 ? '#f2d14b' : '#ff5c5c';
      const fw = sw * s;
      ctx.fillRect(left ? sx0 : sx0 + sw - fw, sy, fw, 7);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      for (const v of [f.cfg.stepCost, f.cfg.mediumCost, f.cfg.heavyCost]) {
        const t = v / f.cfg.staminaMax;
        ctx.fillRect(left ? sx0 + sw * t : sx0 + sw - sw * t, sy - 2, 2, 11);
      }

      // round wins (diamonds beside the timer)
      if (!game.training) for (let k = 0; k < CONFIG.roundsToWin; k++) {
        const px = W / 2 - dir * (70 + k * 20), py = 40;
        ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI / 4);
        if (k < game.wins[i]) { ctx.fillStyle = f.color.main; ctx.fillRect(-6, -6, 12, 12); }
        else { ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.strokeRect(-6, -6, 12, 12); }
        ctx.restore();
      }
    }

    if (game.training) { this.drawTrainingHUD(game); return; }

    // timer in a box, round under it, center-control share under that
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(W / 2 - 42, 12, 84, 54, 8) : ctx.rect(W / 2 - 42, 12, 84, 54); ctx.fill();
    const low = game.timer <= 10 && game.phase === 'fight';
    this.dtext(String(Math.ceil(game.timer)), W / 2, 41, 44, low ? '#ff5c5c' : '#ffffff');
    this.text(`ROUND ${game.round}`, W / 2, 78, 12, '#8a94a8', 'center', '700');
    const tot = game.center[0] + game.center[1];
    const share = tot > 0 ? game.center[0] / tot : 0.5;
    const cw = 84, cx = W / 2 - cw / 2;
    ctx.fillStyle = game.fighters[1].color.main; ctx.fillRect(cx, 90, cw, 3);
    ctx.fillStyle = game.fighters[0].color.main; ctx.fillRect(cx, 90, cw * share, 3);
  }

  // ROUND / FIGHT! / K.O. / DECISION: slam in big, then settle.
  drawBanner(game) {
    let big = null, small = null, col = '#ffffff', size = 84;
    if (game.phase === 'intro') {
      if (game.phaseT < 0.9) { big = `ROUND ${game.round}`; }
      else { big = 'FIGHT!'; col = '#ffd84d'; size = 104; }
    } else if (game.phase === 'roundEnd') {
      big = game.endReason === 'K.O.' ? 'K.O.' : game.endReason;
      if (game.endReason === 'K.O.') { col = '#ff4d4d'; size = 130; }
      if (game.cards) {
        const c = game.cards;
        small = c.winner >= 0 ? `P${c.winner + 1} wins a ${c.type} decision` : 'Scorecards even: no point awarded';
      } else {
        small = game.roundWinner >= 0 ? `P${game.roundWinner + 1} takes the round` : 'Draw: no point awarded';
      }
    } else if (game.phase === 'matchEnd') {
      this.drawStats(game);
      return;
    }
    if (!big) return;
    const ctx = this.ctx, cy = WORLD.h / 2;
    const t = game.phase === 'intro' ? (game.phaseT < 0.9 ? game.phaseT : game.phaseT - 0.9) : game.phaseT;
    const pop = 1 + Math.max(0, 0.18 - t) * 3.5;              // slams in from big
    const alpha = Math.min(1, t * 10);
    if (game.phase !== 'intro') {
      const g = ctx.createLinearGradient(0, cy - 90, 0, cy + 90);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.3, 'rgba(0,0,0,0.6)'); g.addColorStop(0.7, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, cy - 90, WORLD.w, 180);
    }
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.translate(WORLD.w / 2, cy - (small ? 16 : 0)); ctx.scale(pop, pop);
    this.dtext(big, 0, 0, size, col);
    ctx.restore();
    if (small) this.text(small, WORLD.w / 2, cy + 48, 18, '#c5ccd9', 'center', '600');
    if (game.phase === 'roundEnd' && game.cards) this.drawCards(game, cy + 108);
  }

  // The three judges' cards after a decision: each card in the color of the fighter it went to.
  drawCards(game, y) {
    const ctx = this.ctx, w = 150, gap = 18, x0 = WORLD.w / 2 - (3 * w + 2 * gap) / 2;
    game.cards.cards.forEach((c, k) => {
      const x = x0 + k * (w + gap), win = c[0] > c[1] ? 0 : c[1] > c[0] ? 1 : -1;
      ctx.fillStyle = 'rgba(10,12,18,0.85)'; ctx.fillRect(x, y - 26, w, 52);
      ctx.strokeStyle = win >= 0 ? game.fighters[win].color.main : '#6d7690'; ctx.lineWidth = 2; ctx.strokeRect(x, y - 26, w, 52);
      this.text('JUDGE ' + (k + 1), x + w / 2, y - 12, 11, '#6d7690', 'center', '600');
      this.text(c[0], x + w / 2 - 24, y + 12, 22, game.fighters[0].color.main);
      this.text('–', x + w / 2, y + 12, 18, '#6d7690');
      this.text(c[1], x + w / 2 + 24, y + 12, 22, game.fighters[1].color.main);
    });
  }

  // Post-match screen: winner + side-by-side stats.
  drawStats(game) {
    const ctx = this.ctx, W = WORLD.w, H = WORLD.h;
    ctx.fillStyle = 'rgba(5,6,10,0.88)';
    ctx.fillRect(0, 0, W, H);
    const win = game.fighters[game.matchWinner];
    this.text(`P${game.matchWinner + 1} WINS`, W / 2, 70, 56, win.color.main);
    const rows = game.mstats.rows(game.wins);
    const top = 130, lh = 30, cx = W / 2, colA = cx - 250, colB = cx + 250;
    this.text('P1', colA, top - 8, 18, game.fighters[0].color.main);
    this.text('P2', colB, top - 8, 18, game.fighters[1].color.main);
    rows.forEach(([label, a, b], i) => {
      const y = top + 26 + i * lh;
      if (i % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(cx - 380, y - lh / 2, 760, lh); }
      this.text(label, cx, y, 14, '#8a94a8', 'center', '600');
      this.text(String(a), colA, y, 17, '#e8ecf3', 'center', '700');
      this.text(String(b), colB, y, 17, '#e8ecf3', 'center', '700');
    });
    const copied = game.statsCopiedT && game.clock - game.statsCopiedT < 1.5;
    const saved = game.replaySavedT && game.clock - game.replaySavedT < 1.5;
    let hint = game.replaying ? 'Enter / (A) watch again   ·   Esc menu'
      : 'Enter / (A) rematch   ·   Esc menu   ·   C copy stats' + (game.recValid ? '   ·   S / (Y) save replay' : '   ·   (no replay: Tuning changed mid-match)');
    if (copied) hint = 'Stats copied to clipboard';
    if (saved) hint = 'Replay saved to your downloads';
    this.text(hint, W / 2, H - 30, 15, copied || saved ? '#5be08a' : '#c5ccd9', 'center', '600');
  }

  // ---- tag team ----
  // Corner tag zones (lit when the fighter in the ring can tag right now) and the partners on the apron.
  drawTagCorners(game) {
    const ctx = this.ctx;
    for (let s = 0; s < 2; s++) {
      const k = game.corner(s), f = game.fighters[s], p = game.benchOf(s);
      const ready = game.phase === 'fight' && game.canTag(s);
      // the zone: a half-circle reaching into the ring from the wall next to the waiting partner
      const inward = Math.atan2(-k.ny, -k.nx);
      ctx.strokeStyle = rgba(f.color.main, ready ? 0.9 : p.hp > 0 ? 0.3 : 0.08);
      ctx.lineWidth = ready ? 3 : 2;
      ctx.setLineDash(ready ? [] : [6, 8]);
      ctx.beginPath(); ctx.arc(k.x, k.y, CONFIG.tagZone, inward - Math.PI / 2, inward + Math.PI / 2); ctx.stroke();
      ctx.setLineDash([]);
      if (ready) this.text('TAG', k.x - k.nx * (CONFIG.tagZone + 14), k.y - k.ny * (CONFIG.tagZone + 14), 14, f.color.main, 'center', '800');
      // the partner: dimmed, with a green ring while healing
      this.drawFighter(p, game, p.hp > 0 ? 0.85 : 0.4);
      if (p.hp > 0 && p.bruise >= 1) {
        ctx.strokeStyle = 'rgba(91,224,138,0.8)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.R + 6, -Math.PI / 2, -Math.PI / 2 + TAU * (p.healT / CONFIG.tagHealTime)); ctx.stroke();
      }
      if (game.callout[s] > 0 && p.hp > 0) {
        const below = k.ny < -0.5;   // on the top apron the bubble goes below (inside the ring), clear of the HUD
        this.speechBubble(p.x, below ? p.y + p.R + 30 : p.y - p.R - 26, 'TAG ME IN!', Math.min(1, game.callout[s] * 4), below);
      }
    }
  }

  speechBubble(x, y, str, alpha, tailUp = false) {
    const ctx = this.ctx;
    ctx.font = '800 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    const w = ctx.measureText(str).width + 18, h = 24;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#f4f7ff';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, 8); else ctx.rect(x - w / 2, y - h / 2, w, h);
    const e = tailUp ? -h / 2 : h / 2, tip = tailUp ? -8 : 8;
    ctx.moveTo(x - 6, y + e); ctx.lineTo(x, y + e + tip); ctx.lineTo(x + 6, y + e);
    ctx.fill();
    this.text(str, x, y + 1, 14, '#0b0d14', 'center', '800');
    ctx.globalAlpha = 1;
  }

  // Under each side's health: the partner's name and health (bruises lighter).
  drawPartnerHUD(game, i, x0, dir, align) {
    const ctx = this.ctx, p = game.benchOf(i), n = maxHp(p.cfg);
    this.text((p.hp > 0 ? 'PARTNER  ' : 'PARTNER (K.O.)  ') + CHARACTERS[p.charId].name, x0, 100, 11, '#6d7690', align, '700');
    const start = x0 + dir * 150;
    for (let k = 0; k < n; k++) {
      const px = start + dir * k * 11;
      this.circle(px, 100, 4);
      if (k < p.hp) { ctx.fillStyle = p.color.main; ctx.fill(); }
      else if (k < p.hp + Math.floor(p.bruise + 1e-9)) { ctx.fillStyle = rgba(p.color.main, 0.3); ctx.fill(); }
      else { ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
  }

  // ---- training room ----
  drawPads(tr) {
    const ctx = this.ctx;
    for (const p of tr.pads()) {
      const lit = (tr.flash[p.key] || 0) > 0;
      ctx.fillStyle = lit ? '#ffd84d' : '#2a3142';
      this.circle(p.x, p.y, p.r); ctx.fill();
      ctx.strokeStyle = lit ? '#fff3b0' : '#ffd84d'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = lit ? '#2a3142' : '#ffd84d'; this.circle(p.x, p.y, 6); ctx.fill();
      const ly = p.side === 'top' ? p.y + p.r + 16 : p.y - p.r - 26;
      this.text(p.label, p.x, ly, 12, '#8a94a8', 'center', '700');
      if (p.key !== 'reset') this.text(tr.value(p.key), p.x, ly + 15, 14, '#e8ecf3', 'center', '700');
    }
  }

  // Hitbox (the attack's hit line, as wide as it really is) and a bar for whatever the fighter is stuck in.
  drawHitbox(f) {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    this.circle(f.x, f.y, f.R); ctx.stroke();                         // the body: the only thing that can be hit
    const a = f.atk;
    if (a && (f.state === 'startup' || f.state === 'active')) {
      const dir = f.state === 'active' ? a.dir : f.facing, tip = f.R + a.tip;
      ctx.strokeStyle = f.state === 'active' ? 'rgba(255,92,92,0.85)' : 'rgba(255,216,77,0.4)';
      ctx.lineWidth = Math.max(2, 2 * a.width); ctx.lineCap = 'round';
      this.line(f.x, f.y, f.x + Math.cos(dir) * tip, f.y + Math.sin(dir) * tip);
      ctx.lineCap = 'butt';
    }
    // bar: windup (yellow), recovery (red), stun (purple), with time left
    let total = 0, col = null;
    if (f.state === 'startup') { total = a.startup; col = '#ffd84d'; }
    else if (f.state === 'recovery' || f.state === 'stepRecovery') { total = f.recoverDur; col = '#ff5c5c'; }
    else if (f.state === 'hitstun' || f.state === 'blockstun') { total = f.stunDur; col = '#b48cff'; }
    else if (f.state === 'plant') { total = f.cfg.plantRecovery; col = '#ff5c5c'; }
    if (col && total > 0) {
      const left = Math.max(0, total - f.t), w = 60, x = f.x - w / 2, y = f.y - f.R - 30;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 1, y - 1, w + 2, 7);
      ctx.fillStyle = col; ctx.fillRect(x, y, w * left / total, 5);
      this.text(left.toFixed(2), x + w + 6, y + 3, 11, col, 'left', '700');
    }
  }

  drawTrainingHUD(game) {
    const tr = game.training, W = WORLD.w;
    this.text('TRAINING', W / 2, 40, 30, '#ffffff');
    const r = tr.readout;
    if (r) this.text(r.text, W / 2, 76, 17, r.color, 'center', '700');
    else this.text('Punch the pads to change the dummy  ·  Esc pause', W / 2, 76, 13, '#6d7690', 'center', '600');
  }

  // Corner marker during replays: a red dot + label, plus the controls.
  drawReplayTag(label, hint) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(70, 118, 150, 30);
    ctx.fillStyle = '#ff4d4d'; this.circle(88, 133, 6); ctx.fill();
    this.text(label, 102, 133, 15, '#ffffff', 'left', '800');
    if (hint) this.text(hint, WORLD.w / 2, WORLD.h - 18, 13, '#c5ccd9', 'center', '600');
  }

  drawCursor(game) {
    if (CONFIG.autoLock || !game.devices.includes('kbm')) return;
    const ctx = this.ctx, m = Input.mouse;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    this.circle(m.x, m.y, 7); ctx.stroke();
    this.line(m.x - 12, m.y, m.x - 4, m.y); this.line(m.x + 4, m.y, m.x + 12, m.y);
    this.line(m.x, m.y - 12, m.x, m.y - 4); this.line(m.x, m.y + 4, m.x, m.y + 12);
  }

  drawHint(game) {
    this.text('R1 / LMB light  ·  R2 / RMB medium  ·  L2 / Space heavy  ·  L1 / E block (tap = parry)  ·  X / Shift step  ·  O / F plant' + (game && game.teams ? '  ·  Select / Q tag' : '') + '  ·  Esc pause',
      WORLD.w / 2, WORLD.h - 18, 12, '#454d60', 'center', '500');
  }
}
