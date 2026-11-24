// looks.js: how a boxer is drawn from above, and the parts library for giving characters their own look.
//
// A look is a small object (put it in a character's `look:` in characters.js; anything left out
// comes from LOOK_DEFAULTS):
//   skin, gloves, trim (glove cuff), shirt (null = bare shoulders, or a color for a tank top)
//   build:  'slim' | 'normal' | 'broad'                      shoulder width and arm thickness
//   hair:   'bald' | 'buzz' | 'mohawk' | 'afro' | 'flattop' | 'ponytail' | 'cornrows' | 'slick'
//   hairColor
//   hat:    null | 'headband' | 'cap' | 'capBack' | 'headgear' | 'beanie' | 'bandana'
//   hatColor
//   jaw:    'normal' | 'big' (juts out front) | 'pointed'
//   beard:  null | 'full' | 'goatee' | 'stubble'
//   beardColor
// To add a new hair/hat/beard style, add a function to HAIR / HATS / BEARDS below; it draws in the
// head's local space (origin = head center, +x = the way the boxer faces, r = head radius).
//
// Only the drawing changes: the hitbox is still the same circle.

const LOOK_DEFAULTS = {
  skin: '#c68a5e', gloves: '#c0392b', trim: '#f4f7ff', shirt: null,
  build: 'normal', hair: 'buzz', hairColor: '#2b1d14', hat: null, hatColor: '#e8ecf3',
  jaw: 'normal', beard: null, beardColor: null,
};

const BUILDS = {
  slim:   { shoulder: 0.92, depth: 0.5,  arm: 5,   head: 0.5 },
  normal: { shoulder: 1.02, depth: 0.56, arm: 5.8, head: 0.52 },
  broad:  { shoulder: 1.16, depth: 0.64, arm: 6.8, head: 0.54 },
};

// ---- small helpers ----
function shade(hex, amt) {   // amt < 0 darker, > 0 lighter
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function ellipse(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); }

// ---- hair styles (head-local: origin = head center, +x = forward) ----
const HAIR = {
  bald: () => {},
  buzz: (ctx, r, L) => { ctx.fillStyle = L.hairColor; ctx.globalAlpha *= 0.85; ellipse(ctx, -r * 0.18, 0, r * 0.82, r * 0.92); ctx.fill(); },
  mohawk: (ctx, r, L) => {
    ctx.fillStyle = L.hairColor;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-r * 1.05, -r * 0.2, r * 1.85, r * 0.4, r * 0.2) : ctx.rect(-r * 1.05, -r * 0.2, r * 1.85, r * 0.4); ctx.fill();
  },
  afro: (ctx, r, L) => {
    ctx.fillStyle = L.hairColor;
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; ellipse(ctx, -r * 0.15 + Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.8, r * 0.5, r * 0.5); ctx.fill(); }
    ellipse(ctx, -r * 0.15, 0, r * 1.05, r * 1.1); ctx.fill();
  },
  flattop: (ctx, r, L) => {
    ctx.fillStyle = L.hairColor;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-r * 0.95, -r * 0.88, r * 1.6, r * 1.76, r * 0.25) : ctx.rect(-r * 0.95, -r * 0.88, r * 1.6, r * 1.76); ctx.fill();
  },
  ponytail: (ctx, r, L) => {
    HAIR.buzz(ctx, r, L);
    ctx.fillStyle = L.hairColor; ctx.globalAlpha = 1;
    ellipse(ctx, -r * 1.45, 0, r * 0.55, r * 0.28); ctx.fill();
    ctx.fillStyle = L.hatColor; ellipse(ctx, -r * 0.95, 0, r * 0.12, r * 0.2); ctx.fill();
  },
  cornrows: (ctx, r, L) => {
    ctx.strokeStyle = L.hairColor; ctx.lineWidth = r * 0.22; ctx.lineCap = 'round';
    for (const y of [-0.55, -0.18, 0.18, 0.55]) { ctx.beginPath(); ctx.moveTo(r * 0.45, y * r); ctx.lineTo(-r * 0.9, y * r * 0.9); ctx.stroke(); }
    ctx.lineCap = 'butt';
  },
  slick: (ctx, r, L) => {
    HAIR.buzz(ctx, r, L);
    ctx.globalAlpha = 1; ctx.strokeStyle = shade(L.hairColor, 0.25); ctx.lineWidth = 1.2;
    for (const y of [-0.45, -0.15, 0.15, 0.45]) { ctx.beginPath(); ctx.moveTo(r * 0.5, y * r * 0.8); ctx.quadraticCurveTo(-r * 0.2, y * r, -r * 0.9, y * r * 1.1); ctx.stroke(); }
  },
};

// ---- hats (drawn over the hair) ----
const HATS = {
  headband: (ctx, r, L) => {
    ctx.strokeStyle = L.hatColor; ctx.lineWidth = r * 0.28;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.86, 0, TAU); ctx.stroke();
    ctx.lineWidth = r * 0.18; ctx.beginPath(); ctx.moveTo(-r * 0.85, 0); ctx.lineTo(-r * 1.6, -r * 0.35); ctx.moveTo(-r * 0.85, 0); ctx.lineTo(-r * 1.55, r * 0.3); ctx.stroke();
  },
  bandana: (ctx, r, L) => {
    ctx.fillStyle = L.hatColor; ellipse(ctx, -r * 0.15, 0, r * 0.95, r * 0.98); ctx.fill();
    ctx.fillStyle = shade(L.hatColor, -0.3);
    for (let i = 0; i < 6; i++) { ellipse(ctx, -r * 0.4 + (i % 3) * r * 0.35, (i < 3 ? -1 : 1) * r * 0.35, r * 0.07, r * 0.07); ctx.fill(); }
    ctx.fillStyle = L.hatColor; ctx.beginPath(); ctx.moveTo(-r * 0.9, 0); ctx.lineTo(-r * 1.6, -r * 0.3); ctx.lineTo(-r * 1.5, r * 0.25); ctx.closePath(); ctx.fill();
  },
  cap: (ctx, r, L, back) => {
    const f = back ? -1 : 1;
    ctx.fillStyle = shade(L.hatColor, -0.15); ellipse(ctx, f * r * 0.95, 0, r * 0.55, r * 0.75); ctx.fill();   // brim
    ctx.fillStyle = L.hatColor; ellipse(ctx, 0, 0, r * 0.95, r * 0.95); ctx.fill();
    ctx.strokeStyle = shade(L.hatColor, -0.25); ctx.lineWidth = 1;
    for (const a of [0, Math.PI / 3, -Math.PI / 3, Math.PI]) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); ctx.stroke(); }
    ctx.fillStyle = shade(L.hatColor, -0.3); ellipse(ctx, 0, 0, r * 0.13, r * 0.13); ctx.fill();
  },
  capBack: (ctx, r, L) => HATS.cap(ctx, r, L, true),
  headgear: (ctx, r, L) => {
    ctx.fillStyle = L.hatColor; ellipse(ctx, -r * 0.1, 0, r * 1.0, r * 1.05); ctx.fill();
    ctx.fillStyle = shade(L.hatColor, -0.2);
    for (const s of [1, -1]) { ellipse(ctx, r * 0.35, s * r * 0.9, r * 0.45, r * 0.28); ctx.fill(); }   // cheek pads
    ctx.strokeStyle = shade(L.hatColor, 0.3); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(r * 0.5, 0); ctx.lineTo(-r * 0.9, 0); ctx.stroke();
  },
  beanie: (ctx, r, L) => {
    ctx.fillStyle = L.hatColor; ellipse(ctx, -r * 0.08, 0, r * 0.98, r * 1.0); ctx.fill();
    ctx.strokeStyle = shade(L.hatColor, -0.25); ctx.lineWidth = r * 0.22; ctx.beginPath(); ctx.arc(-r * 0.08, 0, r * 0.82, 0, TAU); ctx.stroke();
    ctx.fillStyle = shade(L.hatColor, 0.35); ellipse(ctx, -r * 0.1, 0, r * 0.3, r * 0.3); ctx.fill();
  },
};

// ---- beards (drawn on the front of the head, before the hair) ----
const BEARDS = {
  full: (ctx, r, L) => { ctx.fillStyle = L.beardColor || L.hairColor; ctx.beginPath(); ctx.arc(0, 0, r * 1.02, -1.2, 1.2); ctx.lineTo(r * 0.2, 0); ctx.closePath(); ctx.fill(); },
  goatee: (ctx, r, L) => { ctx.fillStyle = L.beardColor || L.hairColor; ellipse(ctx, r * 0.9, 0, r * 0.25, r * 0.28); ctx.fill(); },
  stubble: (ctx, r, L) => { ctx.fillStyle = L.beardColor || L.hairColor; ctx.globalAlpha *= 0.35; ctx.beginPath(); ctx.arc(0, 0, r * 1.0, -1.1, 1.1); ctx.lineTo(r * 0.3, 0); ctx.closePath(); ctx.fill(); },
};

const BoxerArt = {
  look(charId) {
    const ch = CHARACTERS[charId] || CHARACTERS.standard;
    return { ...LOOK_DEFAULTS, gloves: ch.glove || LOOK_DEFAULTS.gloves, ...(ch.look || {}) };
  },

  // Draw a boxer at (x, y) facing `dir` (world angle).
  //   gloves: [{ x, y, r, gold }] in world coordinates, index 0 = right hand (+side), 1 = left hand.
  //   opts: { R, alpha, flash (0..1 white), dark (0..1 punishable tint), down (K.O.'d) }
  draw(ctx, x, y, dir, L, gloves, opts = {}) {
    const R = opts.R || WORLD.radius, B = BUILDS[L.build] || BUILDS.normal;
    const cos = Math.cos(dir), sin = Math.sin(dir);
    const toLocal = (gx, gy) => { const dx = gx - x, dy = gy - y; return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos }; };
    ctx.save();
    ctx.translate(x, y); ctx.rotate(dir);
    ctx.globalAlpha *= opts.alpha ?? 1;

    const skin = L.skin, skinDark = shade(skin, -0.35), sw = R * B.shoulder;
    const top = L.shirt || skin;

    // upper body: a broad, shallow oval across the shoulders (lit from above), with rounded deltoids at the ends
    const grad = ctx.createRadialGradient(-R * 0.15, -sw * 0.2, 2, -R * 0.1, 0, sw * 1.05);
    grad.addColorStop(0, shade(top, 0.15)); grad.addColorStop(1, shade(top, -0.3));
    ctx.fillStyle = grad;
    ellipse(ctx, -R * 0.18, 0, R * B.depth * 0.78, sw * 0.92); ctx.fill();
    ctx.strokeStyle = shade(top, -0.5); ctx.lineWidth = 1.2; ctx.stroke();

    // arms: shoulder -> elbow -> glove. Elbows tucked in the guard (from above, the forearms point up at
    // the camera, so the arms look short); a punch straightens the arm.
    const L1 = R * 0.52, L2 = R * 0.52;
    const armPts = [1, -1].map((s, i) => {
      const S = { x: -R * 0.12, y: s * sw * 0.8 };
      const G = toLocal(gloves[i].x, gloves[i].y);
      const dx = G.x - S.x, dy = G.y - S.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      let E;
      if (d >= L1 + L2 - 0.5) E = { x: S.x + ux * d * 0.45, y: S.y + uy * d * 0.45 };          // straight (punching)
      else {
        const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
        const mx = S.x + ux * a, my = S.y + uy * a, nx = -uy, ny = ux;
        const e1 = { x: mx + nx * h, y: my + ny * h }, e2 = { x: mx - nx * h, y: my - ny * h };
        E = (e1.y * s > e2.y * s) ? e1 : e2;                                                       // elbow out to the side
      }
      return { S, E, G, s };
    });
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const { S, E, G } of armPts) {
      ctx.strokeStyle = skinDark; ctx.lineWidth = B.arm + 1.8;
      ctx.beginPath(); ctx.moveTo(S.x, S.y); ctx.lineTo(E.x, E.y); ctx.lineTo(G.x, G.y); ctx.stroke();
      ctx.strokeStyle = skin; ctx.lineWidth = B.arm;
      ctx.beginPath(); ctx.moveTo(S.x, S.y); ctx.lineTo(E.x, E.y); ctx.lineTo(G.x, G.y); ctx.stroke();
    }
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    // deltoids (bare skin, even with a tank top)
    for (const s of [1, -1]) {
      ctx.fillStyle = skin; ellipse(ctx, -R * 0.1, s * sw * 0.8, R * 0.3, R * 0.27); ctx.fill();
      ctx.strokeStyle = skinDark; ctx.lineWidth = 1; ctx.stroke();
    }

    // head (slightly forward), ears, jaw, beard, hair, hat
    const r = R * B.head;
    ctx.save(); ctx.translate(R * 0.1, 0);
    ctx.fillStyle = skin;
    for (const s of [1, -1]) { ellipse(ctx, -r * 0.05, s * r * 0.98, r * 0.2, r * 0.28); ctx.fill(); }   // ears
    if (L.jaw === 'big') { ellipse(ctx, r * 0.62, 0, r * 0.62, r * 0.78); ctx.fill(); ctx.strokeStyle = skinDark; ctx.lineWidth = 1.2; ctx.stroke(); }
    else if (L.jaw === 'pointed') { ellipse(ctx, r * 0.55, 0, r * 0.65, r * 0.5); ctx.fill(); ctx.strokeStyle = skinDark; ctx.lineWidth = 1.2; ctx.stroke(); }
    const hg = ctx.createRadialGradient(-r * 0.2, -r * 0.3, 1, 0, 0, r * 1.1);
    hg.addColorStop(0, shade(skin, 0.2)); hg.addColorStop(1, shade(skin, -0.2));
    ctx.fillStyle = hg; ellipse(ctx, 0, 0, r, r); ctx.fill();
    ctx.strokeStyle = skinDark; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = shade(skin, -0.12); ellipse(ctx, r * 0.95, 0, r * 0.16, r * 0.14); ctx.fill();   // nose
    if (L.beard && BEARDS[L.beard]) { ctx.save(); BEARDS[L.beard](ctx, r, L); ctx.restore(); }
    if (HAIR[L.hair]) { ctx.save(); HAIR[L.hair](ctx, r, L); ctx.restore(); }
    if (L.hat && HATS[L.hat]) { ctx.save(); HATS[L.hat](ctx, r, L); ctx.restore(); }
    if (L.hair === 'bald' && !L.hat) {   // shine
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ellipse(ctx, -r * 0.25, -r * 0.3, r * 0.3, r * 0.18, -0.5); ctx.fill();
    }
    ctx.restore();

    // gloves (on top): a padded ball with a cuff toward the wrist
    armPts.forEach(({ E, G }, i) => {
      const gl = gloves[i];
      const rr = gl.r * 1.25, ang = Math.atan2(G.y - E.y, G.x - E.x);
      if (gl.gold) { ctx.fillStyle = 'rgba(255,216,77,0.45)'; ellipse(ctx, G.x, G.y, rr + 5, rr + 4, ang); ctx.fill(); }
      ctx.fillStyle = L.trim; ellipse(ctx, G.x - Math.cos(ang) * rr * 0.75, G.y - Math.sin(ang) * rr * 0.75, rr * 0.45, rr * 0.78, ang); ctx.fill();
      const gg = ctx.createRadialGradient(G.x - rr * 0.3, G.y - rr * 0.35, 1, G.x, G.y, rr * 1.2);
      gg.addColorStop(0, shade(L.gloves, 0.3)); gg.addColorStop(1, shade(L.gloves, -0.3));
      ctx.fillStyle = gg; ellipse(ctx, G.x, G.y, rr * 1.08, rr * 0.92, ang); ctx.fill();
      ctx.strokeStyle = shade(L.gloves, -0.5); ctx.lineWidth = 1.3; ctx.stroke();
    });

    // state tints over the whole boxer
    if (opts.dark > 0 || opts.flash > 0) {
      ctx.fillStyle = opts.flash > 0 ? `rgba(255,255,255,${Math.min(0.85, opts.flash)})` : `rgba(12,14,22,${opts.dark})`;
      ellipse(ctx, -R * 0.1, 0, R * B.depth + 2, sw + 2); ctx.fill();
      ellipse(ctx, R * 0.1, 0, r + 1, r + 1); ctx.fill();
    }
    ctx.restore();
  },

  // A small preview of a look (character select buttons): the boxer in a guard, facing right.
  preview(canvas, charId) {
    const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const L = this.look(charId), R = Math.min(w, h) * 0.3, x = w * 0.42, y = h / 2;
    const gl = [1, -1].map(s => ({ x: x + Math.cos(s * 0.75) * (R + 2), y: y + Math.sin(s * 0.75) * (R + 2), r: 7 * R / WORLD.radius }));
    this.draw(ctx, x, y, 0, L, gl, { R });
  },
};
