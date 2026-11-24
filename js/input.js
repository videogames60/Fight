// input.js: reads keyboard, mouse and gamepads, and turns them into one
// per-frame input object that fighters understand:
//   { mx, my,        move vector (length <= 1)
//     aim, ax, ay,   aim vector (aim=false means "keep current facing")
//     forceLock,     always face the opponent (keyboard-2 scheme)
//     light, medium, heavy, block, dodge (= step), plant      buttons held
//     lightPressed, ..., blockPressed, dodgePressed, plantPressed }  just pressed this frame (added by Controller)

const Input = (() => {
  const keys = new Set();
  const mouse = { x: 0, y: 0, left: false, right: false, middle: false };

  function init(canvas) {
    window.addEventListener('keydown', e => {
      keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => keys.delete(e.code));
    window.addEventListener('blur', () => { keys.clear(); mouse.left = mouse.right = mouse.middle = false; });

    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - r.left) * (WORLD.w / r.width);
      mouse.y = (e.clientY - r.top) * (WORLD.h / r.height);
    });
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) mouse.left = true;
      if (e.button === 1) { mouse.middle = true; e.preventDefault(); }
      if (e.button === 2) mouse.right = true;
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) mouse.left = false;
      if (e.button === 1) mouse.middle = false;
      if (e.button === 2) mouse.right = false;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  function rawPads() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
    return navigator.getGamepads();
  }
  function getPads() { return Array.from(rawPads()).filter(Boolean); }
  function pad(index) { return rawPads()[index] || null; }

  // Radial deadzone, rescaled so the stick still reaches 1.
  function stick(x, y, dz) {
    const m = Math.hypot(x, y);
    if (m < dz) return { x: 0, y: 0, m: 0 };
    const mag = Math.min(1, (m - dz) / (1 - dz));
    return { x: x / m * mag, y: y / m * mag, m: mag };
  }

  function emptyInput() {
    return { mx: 0, my: 0, aim: false, ax: 0, ay: 0, forceLock: false, dodge: false, plant: false, light: false, medium: false, heavy: false, block: false, tag: false };
  }

  function axisFromKeys(up, down, left, right) {
    let x = 0, y = 0;
    if (keys.has(right)) x += 1;
    if (keys.has(left)) x -= 1;
    if (keys.has(down)) y += 1;
    if (keys.has(up)) y -= 1;
    const m = Math.hypot(x, y) || 1;
    return { x: x / m, y: y / m };
  }

  // type: 'kbm' | 'kb2' | 'pad:N'
  function readDevice(type, fighter) {
    const out = emptyInput();

    if (type === 'kbm') {
      const mv = axisFromKeys('KeyW', 'KeyS', 'KeyA', 'KeyD');
      out.mx = mv.x; out.my = mv.y;
      const mw = Camera.toWorld(mouse.x, mouse.y);           // mouse is in screen pixels; fighters live in world units
      out.ax = mw.x - fighter.x; out.ay = mw.y - fighter.y;
      out.aim = Math.hypot(out.ax, out.ay) > 4;
      out.light = mouse.left; out.medium = mouse.right; out.heavy = keys.has('Space');
      out.dodge = keys.has('ShiftLeft');
      out.block = keys.has('KeyE');
      out.tag = keys.has('KeyQ');
      out.plant = mouse.middle || keys.has('KeyF');
    } else if (type === 'kb2') {
      const mv = axisFromKeys('ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight');
      out.mx = mv.x; out.my = mv.y;
      out.forceLock = true;
      out.light = keys.has('Slash'); out.medium = keys.has('Period'); out.heavy = keys.has('Comma');
      out.dodge = keys.has('ShiftRight'); out.plant = keys.has('Semicolon'); out.block = keys.has('Quote'); out.tag = keys.has('BracketRight');
    } else if (type.startsWith('pad:')) {
      const p = pad(parseInt(type.slice(4), 10));
      if (!p) return out;
      const ls = stick(p.axes[0] || 0, p.axes[1] || 0, 0.2);
      const rs = stick(p.axes[2] || 0, p.axes[3] || 0, 0.3);
      out.mx = ls.x; out.my = ls.y;
      if (rs.m > 0) { out.aim = true; out.ax = rs.x; out.ay = rs.y; }
      const held = i => { const b = p.buttons[i]; return !!b && (b.pressed || b.value > 0.25); };
      out.light = held(5);             // R1
      out.medium = held(7);            // R2
      out.heavy = held(6);             // L2
      out.block = held(4);             // L1: hold = block, tap = parry
      out.dodge = held(0);             // X / A: step (doesn't need aim, so a face button is fine)
      out.plant = held(1) || held(10); // Circle / B, or L3
      out.tag = held(8);               // Select / Share / View: tag your partner in
    }
    return out;
  }

  function deviceLabel(type) {
    if (type === 'kbm') return 'Keyboard + Mouse';
    if (type === 'kb2') return 'Keyboard (arrows)';
    if (type === 'cpu') return 'CPU';
    if (type === 'dummy') return 'Dummy';
    if (type.startsWith('pad:')) return 'Gamepad ' + (parseInt(type.slice(4), 10) + 1);
    return type;
  }

  return { init, getPads, pad, readDevice, deviceLabel, emptyInput, mouse, keys };
})();

// Wraps a device (or the CPU) and adds just-pressed edge detection.
class Controller {
  constructor(type, opts = {}) {
    this.type = type;
    this.ai = type === 'cpu' ? new AIController(opts) : type === 'dummy' ? new DummyController(opts.training) : null;
    this.prevDodge = false;
    this.prevPlant = false;
    this.prevFixed = { light: false, medium: false, heavy: false };
    this.prevBlock = false;
  }

  reset() {
    if (this.ai) this.ai.reset();
  }

  read(self, opp, dt, live) {
    let inp;
    if (this.ai) inp = live ? this.ai.think(self, opp, dt) : Input.emptyInput();
    else inp = Input.readDevice(this.type, self);
    Replay.quantize(inp);   // exact values a replay can reproduce
    inp.dodgePressed = inp.dodge && !this.prevDodge;
    inp.plantPressed = inp.plant && !this.prevPlant;
    inp.blockPressed = !!inp.block && !this.prevBlock; this.prevBlock = !!inp.block;
    inp.tagPressed = !!inp.tag && !this.prevTag; this.prevTag = !!inp.tag;
    for (const k of ATTACK_KINDS) { inp[k + 'Pressed'] = !!inp[k] && !this.prevFixed[k]; this.prevFixed[k] = !!inp[k]; }
    this.prevPlant = inp.plant;
    this.prevDodge = inp.dodge;
    return inp;
  }
}
