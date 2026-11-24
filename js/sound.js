// sound.js: all sounds are synthesized with the Web Audio API (no audio files).
//   Sound.play(name, { x, kind, dur })   x = world x for stereo panning
// Sounds are also tells: every windup has a sound, and the heavy's is long, low and rising,
// lasting exactly as long as its windup, so you can react to it without watching the fists.
// The light's windup is near-silent on purpose (it's meant to be hard to react to).
// Safe to load without a browser (tests): everything becomes a no-op.

const Sound = (() => {
  let ac = null, master = null, noiseBuf = null, muted = false;
  const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;

  // The browser only allows audio after a click/key press: create/resume on the first one.
  function unlock() {
    if (!AC) return;
    if (!ac) {
      ac = new AC();
      master = ac.createGain();
      master.connect(ac.destination);
      // one second of white noise, reused by every noise-based sound
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
  }
  if (typeof window !== 'undefined') {
    for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, unlock);
    window.addEventListener('gamepadconnected', unlock);
  }

  const ready = () => ac && ac.state === 'running' && !muted && CONFIG.soundVolume > 0;

  // Stereo position from a world x (sounds sit a little left/right of center, never hard-panned).
  function panner(x) {
    const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
    if (p) {
      const c = Arena.center().x, half = Arena.bounds().w / 2 || 1;
      p.pan.value = x === undefined ? 0 : clamp((x - c) / half, -1, 1) * 0.6;
      p.connect(master);
    }
    return p || master;
  }

  // Envelope: quick attack, exponential decay to silence.
  function env(gain, t0, peak, attack, decay) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  // Filtered noise burst. f0 -> f1 sweeps the filter.
  function noise(out, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, peak = 0.5, attack = 0.005, decay = 0.1, delay = 0 }) {
    const t0 = ac.currentTime + delay;
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;     // a little variation every time
    const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + attack + decay);
    const g = ac.createGain(); env(g, t0, peak, attack, decay);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + attack + decay + 0.05);
  }

  // Oscillator with a pitch sweep f0 -> f1.
  function tone(out, { wave = 'sine', f0 = 200, f1 = f0, peak = 0.5, attack = 0.005, decay = 0.15, delay = 0, curve = 'exp' }) {
    const t0 = ac.currentTime + delay, t1 = t0 + attack + decay;
    const o = ac.createOscillator(); o.type = wave;
    o.frequency.setValueAtTime(f0, t0);
    if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t1);
    else o.frequency.linearRampToValueAtTime(f1, t1);
    const g = ac.createGain(); env(g, t0, peak, attack, decay);
    o.connect(g); g.connect(out);
    o.start(t0); o.stop(t1 + 0.05);
  }

  // A struck boxing bell: a few inharmonic partials with a long ring.
  function bell(out, delay = 0, peak = 0.12) {
    for (const [f, a, d] of [[523, 1, 1.4], [1310, 0.5, 0.9], [2093, 0.3, 0.6], [2960, 0.15, 0.4]])
      tone(out, { wave: 'sine', f0: f, peak: peak * a, attack: 0.002, decay: d, delay });
    noise(out, { type: 'highpass', f0: 3000, peak: peak * 0.4, decay: 0.03, delay });
  }

  const SOUNDS = {
    // ---- windups (tells) ----
    windup_light: o => noise(o, { type: 'highpass', f0: 4000, peak: 0.03, decay: 0.03 }),
    windup_medium: o => noise(o, { f0: 500, f1: 1400, q: 2, peak: 0.3, attack: 0.04, decay: 0.08 }),
    windup_heavy: (o, p) => {   // low rising groan for the whole windup
      const d = p.dur || 0.24;
      tone(o, { wave: 'sawtooth', f0: 70, f1: 150, peak: 0.09, attack: d * 0.7, decay: d * 0.3 + 0.02 });
      noise(o, { type: 'lowpass', f0: 300, f1: 900, peak: 0.16, attack: d * 0.8, decay: d * 0.2 + 0.03 });
    },
    // ---- punches leaving ----
    throw_light: o => noise(o, { f0: 3200, f1: 1800, q: 1.5, peak: 0.16, attack: 0.004, decay: 0.06 }),
    throw_medium: o => noise(o, { f0: 2000, f1: 900, q: 1.2, peak: 0.22, attack: 0.006, decay: 0.09 }),
    throw_heavy: o => noise(o, { f0: 1300, f1: 400, q: 1, peak: 0.3, attack: 0.01, decay: 0.14 }),
    // ---- landing ----
    hit_light: o => { tone(o, { f0: 190, f1: 70, peak: 0.45, decay: 0.08 }); noise(o, { type: 'lowpass', f0: 2500, peak: 0.25, decay: 0.03 }); },
    hit_medium: o => { tone(o, { f0: 150, f1: 55, peak: 0.6, decay: 0.13 }); noise(o, { type: 'lowpass', f0: 1800, peak: 0.35, decay: 0.05 }); },
    hit_heavy: o => {
      tone(o, { f0: 120, f1: 38, peak: 0.8, decay: 0.24 });
      tone(o, { wave: 'triangle', f0: 240, f1: 60, peak: 0.25, decay: 0.12 });
      noise(o, { type: 'lowpass', f0: 1400, f1: 300, peak: 0.5, decay: 0.1 });
    },
    counter: o => noise(o, { type: 'highpass', f0: 3500, peak: 0.3, decay: 0.05, delay: 0.005 }),
    // ---- defense ----
    block: o => { noise(o, { type: 'lowpass', f0: 700, peak: 0.35, decay: 0.07 }); tone(o, { f0: 230, f1: 160, peak: 0.15, decay: 0.05 }); },
    parry: o => {
      for (const [f, a] of [[1480, 1], [2220, 0.5], [3330, 0.25]]) tone(o, { wave: 'triangle', f0: f, f1: f * 0.98, peak: 0.22 * a, attack: 0.002, decay: 0.35 });
      noise(o, { type: 'highpass', f0: 2500, peak: 0.2, decay: 0.02 });
    },
    guardbreak: o => {
      noise(o, { f0: 900, f1: 250, q: 0.8, peak: 0.55, decay: 0.18 });
      tone(o, { f0: 95, f1: 40, peak: 0.6, decay: 0.25 });
    },
    armor: o => {
      for (const [f, a] of [[520, 1], [790, 0.6]]) tone(o, { wave: 'square', f0: f, f1: f * 0.97, peak: 0.07 * a, attack: 0.002, decay: 0.16 });
      noise(o, { f0: 1500, q: 3, peak: 0.2, decay: 0.05 });
    },
    clash: o => {
      for (const [f, a] of [[880, 1], [1330, 0.7], [1990, 0.4]]) tone(o, { wave: 'square', f0: f, f1: f * 0.96, peak: 0.06 * a, attack: 0.002, decay: 0.28 });
      noise(o, { type: 'highpass', f0: 2000, peak: 0.4, decay: 0.06 });
    },
    missedparry: o => tone(o, { wave: 'triangle', f0: 600, f1: 420, peak: 0.05, decay: 0.08 }),
    // ---- movement ----
    step: o => noise(o, { f0: 450, f1: 300, q: 1.5, peak: 0.2, attack: 0.01, decay: 0.06 }),
    feint: o => noise(o, { f0: 1200, f1: 2200, q: 2, peak: 0.1, attack: 0.01, decay: 0.07 }),
    plant: o => noise(o, { type: 'lowpass', f0: 1400, f1: 250, peak: 0.25, decay: 0.12 }),
    wallbounce: o => tone(o, { f0: 95, f1: 50, peak: 0.35, decay: 0.1 }),
    splat: o => {
      tone(o, { f0: 75, f1: 32, peak: 0.85, decay: 0.32 });
      noise(o, { type: 'lowpass', f0: 900, f1: 120, peak: 0.6, decay: 0.2 });
      noise(o, { f0: 2400, q: 4, peak: 0.12, decay: 0.25, delay: 0.03 });   // rattle of the ropes/wall
    },
    tag: o => {   // two quick hand slaps
      noise(o, { type: 'highpass', f0: 1800, peak: 0.35, decay: 0.03 });
      noise(o, { type: 'highpass', f0: 1500, peak: 0.3, decay: 0.035, delay: 0.07 });
      tone(o, { f0: 300, f1: 180, peak: 0.12, decay: 0.05 });
    },
    // ---- menus ----
    ui_move: o => tone(o, { wave: 'triangle', f0: 1100, f1: 900, peak: 0.035, decay: 0.035 }),
    ui_select: o => { tone(o, { f0: 170, f1: 70, peak: 0.3, decay: 0.08 }); noise(o, { type: 'lowpass', f0: 2200, peak: 0.15, decay: 0.025 }); },
    ui_back: o => tone(o, { wave: 'triangle', f0: 520, f1: 300, peak: 0.07, decay: 0.07 }),
    crowd_pop: o => {   // a cheer from the crowd
      tone(o, { f0: 150, f1: 60, peak: 0.35, decay: 0.1 });
      noise(o, { f0: 600, f1: 1300, q: 0.7, peak: 0.22, attack: 0.06, decay: 0.9 });
      noise(o, { f0: 1800, f1: 2600, q: 1.2, peak: 0.06, attack: 0.1, decay: 0.7 });
    },
    // ---- match ----
    bell: o => bell(o),
    bell2: o => { bell(o); bell(o, 0.35); },
    bell3: o => { bell(o, 0, 0.15); bell(o, 0.3, 0.15); bell(o, 0.6, 0.15); },
    tick: o => tone(o, { wave: 'square', f0: 1800, peak: 0.03, decay: 0.03 }),
  };

  function play(name, p = {}) {
    if (!ready() || !SOUNDS[name]) return;
    master.gain.value = CONFIG.soundVolume;
    try { SOUNDS[name](panner(p.x), p); } catch (e) { /* never let a sound break the game */ }
  }

  function toggleMute() { muted = !muted; if (crowdGain) crowdGain.gain.value = 0; return muted; }

  // ---- the crowd: a filtered-noise murmur that follows the fight's excitement ----
  // Crowd.level(hype) is called every frame during a match (hype 0..1 from the effects); off() fades it out.
  let crowdSrc = null, crowdGain = null, crowdFilter = null;
  function crowdStart() {
    if (crowdSrc || !ac) return;
    crowdSrc = ac.createBufferSource(); crowdSrc.buffer = noiseBuf; crowdSrc.loop = true;
    crowdFilter = ac.createBiquadFilter(); crowdFilter.type = 'bandpass'; crowdFilter.Q.value = 0.6; crowdFilter.frequency.value = 600;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    crowdGain = ac.createGain(); crowdGain.gain.value = 0;
    crowdSrc.connect(crowdFilter); crowdFilter.connect(lp); lp.connect(crowdGain); crowdGain.connect(master);
    crowdSrc.start();
  }
  function crowd(hype, scale = 1) {
    if (!ready()) { if (crowdGain) crowdGain.gain.setTargetAtTime(0, ac.currentTime, 0.2); return; }
    crowdStart();
    master.gain.value = CONFIG.soundVolume;
    const t = ac.currentTime;
    // a low murmur, louder and brighter (more "roar") as the crowd gets excited
    crowdGain.gain.setTargetAtTime((0.045 + 0.32 * hype * hype) * scale, t, hype > 0.5 ? 0.05 : 0.25);
    crowdFilter.frequency.setTargetAtTime(500 + 900 * hype, t, 0.15);
  }
  function crowdOff() { if (crowdGain && ac) crowdGain.gain.setTargetAtTime(0, ac.currentTime, 0.3); }

  return { play, unlock, toggleMute, crowd, crowdOff, get muted() { return muted; }, names: () => Object.keys(SOUNDS), _reset() { ac = null; crowdSrc = null; } };
})();
