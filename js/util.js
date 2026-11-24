// util.js: small math helpers shared by every file.

const TAU = Math.PI * 2;

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Shortest signed difference from angle a to angle b, in (-PI, PI].
function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// Rotate angle a toward target by at most maxStep radians.
function rotateToward(a, target, maxStep) {
  const d = angleDiff(a, target);
  if (Math.abs(d) <= maxStep) return target;
  return a + Math.sign(d) * maxStep;
}

// Distance from point P to segment AB.
function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const len2 = abx * abx + aby * aby;
  const t = len2 ? clamp(((px - ax) * abx + (py - ay) * aby) / len2, 0, 1) : 0;
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

// "#rrggbb" -> "rgba(r,g,b,a)"
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
