// arena.js: arena shapes + the camera. Anything that needs to know where the walls are asks Arena.
// Positions are in WORLD units. Each arena has its own size; the Camera fits it onto the screen's
// play area (WORLD.arena on screen), so big arenas are simply zoomed out. The HUD isn't scaled.
// Default-size arenas fit exactly at zoom 1, so they look and play the same as before.
//   rect:    the frame itself
//   circle:  a circle in the middle of the frame (small: the frame is wide but not tall)
//   capsule: a rounded box with semicircle ends, i.e. a ring with no corners
// Pillars are circles (offsets from the center) that block bodies, lunges and attack lines.

const ARENAS = {
  ring:     { label: 'Ring (square, default)',  shape: 'rect', frame: { w: 680, h: 680 } },
  square:   { label: 'Rectangle',               shape: 'rect' },
  capsule:  { label: 'Rounded (no corners)',    shape: 'capsule', r: 285, half: 290 },
  circle:   { label: 'Circle (small)',          shape: 'circle',  r: 285 },
  pillars2: { label: 'Rectangle + 2 pillars',      shape: 'rect', pillars: [[0, -150, 42], [0, 150, 42]] },
  pillars4: { label: 'Rectangle + 4 pillars',      shape: 'rect', pillars: [[-240, -125, 34], [240, -125, 34], [-240, 125, 34], [240, 125, 34]] },
  bigsquare: { label: 'Big rectangle (zoomed out)', shape: 'rect', frame: { w: 1700, h: 900 } },
  bigcircle: { label: 'Big circle (zoomed out)', shape: 'circle', r: 470 },
  bigpillars: { label: 'Big rectangle + 4 pillars (zoomed out)', shape: 'rect', frame: { w: 1700, h: 900 },
                pillars: [[-360, -190, 44], [360, -190, 44], [-360, 190, 44], [360, 190, 44]] },
};

const Arena = {
  override: null,   // a mode can force an arena (training uses the square) without touching your setting
  def() { return ARENAS[this.override || CONFIG.arena] || ARENAS.square; },

  // The arena is always centered on the same world point (the middle of the screen's play area).
  center() { const F = WORLD.arena; return { x: F.x + F.w / 2, y: F.y + F.h / 2 }; },

  // Rectangle of a rect arena, in world units.
  frame() {
    const d = this.def(), c = this.center();
    const w = d.frame ? d.frame.w : WORLD.arena.w, h = d.frame ? d.frame.h : WORLD.arena.h;
    return { x: c.x - w / 2, y: c.y - h / 2, w, h };
  },

  // Bounding box of the whole arena (what the camera has to show).
  bounds() {
    const d = this.def(), c = this.center();
    if (d.shape === 'rect') return this.frame();
    const hw = (d.shape === 'capsule' ? d.half : 0) + d.r;
    return { x: c.x - hw, y: c.y - d.r, w: 2 * hw, h: 2 * d.r };
  },

  pillars() {
    const c = this.center();
    return (this.def().pillars || []).map(([dx, dy, r]) => ({ x: c.x + dx, y: c.y + dy, r }));
  },

  // Starting positions, facing each other.
  spawns() {
    const d = this.def(), c = this.center(), F = this.frame();
    const off = d.shape === 'rect' ? F.w * 0.2 : d.shape === 'capsule' ? 260 : d.r * 0.53;
    return [{ x: c.x - off, y: c.y, facing: 0 }, { x: c.x + off, y: c.y, facing: Math.PI }];
  },

  // Nearest point on the shape's "spine" (circle: the center; capsule: the middle segment).
  spine(x, y) {
    const d = this.def(), c = this.center();
    if (d.shape === 'capsule') return { x: clamp(x, c.x - d.half, c.x + d.half), y: c.y };
    return c;
  },

  // ---- the apron: a closed track `off` px outside the wall, all the way around (tag partners walk it) ----
  apron: 0,   // extra margin the camera shows around the arena (set by Game: tag team needs room for the apron)

  // Points every ~4px, clockwise from the left-middle, each with its outward normal and distance s along the track.
  track(off) {
    const key = (this.override || CONFIG.arena) + ':' + off;
    this._tracks = this._tracks || new Map();
    if (this._tracks.has(key)) return this._tracks.get(key);
    const d = this.def(), c = this.center(), pts = [];
    const add = (x, y, nx, ny) => pts.push({ x, y, nx, ny });
    const arc = (cx, cy, r, a0, a1) => {
      const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) * r / 4));
      for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n; add(cx + Math.cos(a) * r, cy + Math.sin(a) * r, Math.cos(a), Math.sin(a)); }
    };
    const seg = (x0, y0, x1, y1, nx, ny) => {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4));
      for (let i = 0; i < n; i++) add(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, nx, ny);
    };
    if (d.shape === 'rect') {
      const F = this.frame(), L = F.x, R = F.x + F.w, T = F.y, B = F.y + F.h, o = off;
      seg(L - o, c.y, L - o, T, -1, 0); arc(L, T, o, Math.PI, 1.5 * Math.PI);
      seg(L, T - o, R, T - o, 0, -1);   arc(R, T, o, -Math.PI / 2, 0);
      seg(R + o, T, R + o, B, 1, 0);    arc(R, B, o, 0, Math.PI / 2);
      seg(R, B + o, L, B + o, 0, 1);    arc(L, B, o, Math.PI / 2, Math.PI);
      seg(L - o, B, L - o, c.y, -1, 0);
    } else {
      const h = d.shape === 'capsule' ? d.half : 0, r = d.r + off;
      arc(c.x - h, c.y, r, Math.PI, 1.5 * Math.PI);
      if (h) seg(c.x - h, c.y - r, c.x + h, c.y - r, 0, -1);
      arc(c.x + h, c.y, r, -Math.PI / 2, Math.PI / 2);
      if (h) seg(c.x + h, c.y + r, c.x - h, c.y + r, 0, 1);
      arc(c.x - h, c.y, r, Math.PI / 2, Math.PI);
    }
    let sum = 0;
    pts.forEach((p, i) => { if (i) sum += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y); p.s = sum; });
    const len = sum + Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
    const tr = { key, pts, len, off };
    this._tracks.set(key, tr);
    return tr;
  },

  // Point on the track at distance s (wraps around).
  trackPoint(tr, s) {
    s = ((s % tr.len) + tr.len) % tr.len;
    const P = tr.pts;
    let lo = 0, hi = P.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (P[m].s <= s) lo = m; else hi = m - 1; }
    return P[lo];
  },

  // Distance along the track of the point closest to (x, y).
  trackClosest(tr, x, y) {
    let best = 0, bd = Infinity;
    for (const p of tr.pts) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p.s; } }
    return best;
  },

  // Shortest signed distance along the track from s0 to s1.
  trackDelta(tr, s0, s1) { let d = (s1 - s0) % tr.len; if (d > tr.len / 2) d -= tr.len; if (d < -tr.len / 2) d += tr.len; return d; },

  // Nearest point on the arena's outer wall to (x, y), with the outward normal there.
  wallPoint(x, y) {
    const d = this.def();
    if (d.shape === 'rect') {
      const F = this.frame(), L = F.x, R = F.x + F.w, T = F.y, B = F.y + F.h;
      if (!(x > L && x < R && y > T && y < B)) {          // outside: nearest point of the rectangle
        const px = clamp(x, L, R), py = clamp(y, T, B), dx = x - px, dy = y - py, m = Math.hypot(dx, dy) || 1;
        return { x: px, y: py, nx: dx / m, ny: dy / m };
      }
      const dl = x - L, dr = R - x, dt = y - T, db = B - y, mn = Math.min(dl, dr, dt, db);
      if (mn === dl) return { x: L, y, nx: -1, ny: 0 };
      if (mn === dr) return { x: R, y, nx: 1, ny: 0 };
      if (mn === dt) return { x, y: T, nx: 0, ny: -1 };
      return { x, y: B, nx: 0, ny: 1 };
    }
    const q = this.spine(x, y), dx = x - q.x, dy = y - q.y, m = Math.hypot(dx, dy) || 1;
    return { x: q.x + dx / m * d.r, y: q.y + dy / m * d.r, nx: dx / m, ny: dy / m };
  },

  // Push a body of radius R (object with x, y) back inside the arena and out of pillars.
  // Returns the contact normals (unit vectors pointing back into free space).
  resolve(p, R) {
    const d = this.def(), normals = [];
    if (d.shape === 'rect') {
      const F = this.frame();
      if (p.x < F.x + R) { p.x = F.x + R; normals.push({ x: 1, y: 0 }); }
      if (p.x > F.x + F.w - R) { p.x = F.x + F.w - R; normals.push({ x: -1, y: 0 }); }
      if (p.y < F.y + R) { p.y = F.y + R; normals.push({ x: 0, y: 1 }); }
      if (p.y > F.y + F.h - R) { p.y = F.y + F.h - R; normals.push({ x: 0, y: -1 }); }
    } else {
      const q = this.spine(p.x, p.y);
      const dx = p.x - q.x, dy = p.y - q.y, dist = Math.hypot(dx, dy), lim = d.r - R;
      if (dist > lim && dist > 0) {
        p.x = q.x + dx / dist * lim; p.y = q.y + dy / dist * lim;
        normals.push({ x: -dx / dist, y: -dy / dist });
      }
    }
    for (const pl of this.pillars()) {
      const dx = p.x - pl.x, dy = p.y - pl.y, dist = Math.hypot(dx, dy), min = pl.r + R;
      if (dist < min) {
        const nx = dist > 0 ? dx / dist : 1, ny = dist > 0 ? dy / dist : 0;
        p.x = pl.x + nx * min; p.y = pl.y + ny * min;
        normals.push({ x: nx, y: ny });
      }
    }
    return normals;
  },

  // Average normal of any wall/pillar within `pad` of a body (null if none). Doesn't move anything.
  contactNormal(x, y, R, pad) {
    const probe = { x, y };
    const ns = this.resolve(probe, R + pad);
    if (!ns.length) return null;
    let nx = 0, ny = 0;
    for (const n of ns) { nx += n.x; ny += n.y; }
    const m = Math.hypot(nx, ny);
    return m ? { x: nx / m, y: ny / m } : null;
  },

  // Does a pillar sit on the line between two points? (pillars block attacks)
  segmentBlocked(x1, y1, x2, y2) {
    for (const pl of this.pillars()) if (distToSegment(pl.x, pl.y, x1, y1, x2, y2) < pl.r - 2) return true;
    return false;
  },

  // CPU helper: a push away from walls and pillars that grows as you get within `margin` of them.
  avoid(x, y, margin) {
    let ax = 0, ay = 0;
    const d = this.def();
    const add = (nx, ny, gap) => { if (gap < margin) { const k = 1 - Math.max(0, gap) / margin; ax += nx * k; ay += ny * k; } };
    if (d.shape === 'rect') {
      const F = this.frame();
      add(1, 0, x - F.x); add(-1, 0, F.x + F.w - x); add(0, 1, y - F.y); add(0, -1, F.y + F.h - y);
    } else {
      const q = this.spine(x, y), dx = x - q.x, dy = y - q.y, dist = Math.hypot(dx, dy) || 1;
      add(-dx / dist, -dy / dist, d.r - dist);
    }
    for (const pl of this.pillars()) {
      const dx = x - pl.x, dy = y - pl.y, dist = Math.hypot(dx, dy) || 1;
      add(dx / dist, dy / dist, dist - pl.r);
    }
    return { x: ax, y: ay };
  },

  // CPU helper: if a pillar is between `from` and `to`, a sideways vector that goes around it.
  steerAround(from, to, R) {
    for (const pl of this.pillars()) {
      if (distToSegment(pl.x, pl.y, from.x, from.y, to.x, to.y) >= pl.r + R + 6) continue;
      const px = pl.x - from.x, py = pl.y - from.y, pd = Math.hypot(px, py) || 1;
      if (pd > Math.hypot(to.x - from.x, to.y - from.y)) continue;   // pillar is behind the target
      const cross = (to.x - from.x) * py - (to.y - from.y) * px;     // which side of the line the pillar is on
      const s = cross >= 0 ? -1 : 1;
      return { x: -py / pd * s, y: px / pd * s };                     // tangent: go around the far side
    }
    return null;
  },

  // Canvas path of the outer boundary (for fill, clip and stroke).
  path(ctx) {
    const d = this.def(), c = this.center(), F = this.frame();
    ctx.beginPath();
    if (d.shape === 'rect') ctx.rect(F.x, F.y, F.w, F.h);
    else if (d.shape === 'circle') ctx.arc(c.x, c.y, d.r, 0, TAU);
    else {
      ctx.moveTo(c.x - d.half, c.y - d.r);
      ctx.lineTo(c.x + d.half, c.y - d.r);
      ctx.arc(c.x + d.half, c.y, d.r, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(c.x - d.half, c.y + d.r);
      ctx.arc(c.x - d.half, c.y, d.r, Math.PI / 2, Math.PI * 1.5);
      ctx.closePath();
    }
  },
};

// Camera: maps world units to screen pixels (screen = world * scale + offset).
const Camera = {
  get() {
    const B = Arena.bounds(), V = WORLD.arena, ap = Arena.apron || 0;   // ap: room for the apron around the walls
    const scale = Math.min(1, V.w / (B.w + 2 * ap), V.h / (B.h + 2 * ap));
    const ox = V.x + V.w / 2 - (B.x + B.w / 2) * scale;
    const oy = V.y + V.h / 2 - (B.y + B.h / 2) * scale;
    return { scale, ox, oy };
  },
  toWorld(sx, sy) { const c = this.get(); return { x: (sx - c.ox) / c.scale, y: (sy - c.oy) / c.scale }; },
  apply(ctx) { const c = this.get(); ctx.translate(c.ox, c.oy); ctx.scale(c.scale, c.scale); },
};
