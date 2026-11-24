// effects.js: purely visual juice: sparks, rings, floating text, screen shake, rope wobble, crowd hype.
// (Visual only: nothing here affects the fight, so it can use Math.random freely.)

class Effects {
  constructor() { this.clear(); }

  clear() {
    this.parts = [];
    this.rings = [];
    this.texts = [];
    this.shakeAmt = 0;
    this.ropes = [];     // rope wobbles: { x, y, amp, t }
    this.hype = 0;       // crowd excitement 0..1 (camera flashes in the crowd; the crowd sound follows it)
  }

  // Someone hit the ropes at (x, y): they bulge outward there and wobble back.
  ropeHit(x, y, amp = 10) { this.ropes.push({ x, y, amp, t: 0 }); }

  excite(a) { this.hype = Math.min(1, this.hype + a); }

  burst(x, y, color, n = 12, speed = 300) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = speed * (0.3 + Math.random());
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.3 + Math.random() * 0.3, max: 0.6, color, size: 2 + Math.random() * 2.5 });
    }
  }

  // Sparks thrown mostly along a direction (e.g. the direction of a hit).
  burstDir(x, y, dir, color, n = 16, speed = 450, spread = 0.8) {
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() * 2 - 1) * spread, sp = speed * (0.4 + Math.random());
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.25 + Math.random() * 0.35, max: 0.6, color, size: 2 + Math.random() * 3 });
    }
  }

  ring(x, y, color, maxR = 60) {
    this.rings.push({ x, y, color, r: 4, maxR, life: 0.3, max: 0.3 });
  }

  text(x, y, str, color = '#ffffff', size = 22) {
    this.texts.push({ x, y, str, color, size, life: 0.9, max: 0.9 });
  }

  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  update(dt) {
    const drag = Math.exp(-5 * dt);
    for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= drag; p.vy *= drag; p.life -= dt; }
    for (const r of this.rings) { r.life -= dt; r.r = lerp(r.maxR, 4, r.life / r.max); }
    for (const t of this.texts) { t.y -= 40 * dt; t.life -= dt; }
    this.parts = this.parts.filter(p => p.life > 0);
    this.rings = this.rings.filter(r => r.life > 0);
    this.texts = this.texts.filter(t => t.life > 0);
    for (const r of this.ropes) r.t += dt;
    this.ropes = this.ropes.filter(r => r.t < 1.2);
    this.hype *= Math.exp(-0.6 * dt);
    this.shakeAmt *= Math.exp(-10 * dt);
    if (this.shakeAmt < 0.1) this.shakeAmt = 0;
  }
}
