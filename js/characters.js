// characters.js: the fighter roster.
// Every character = Standard (your Tuning values) + a few explicit trades: each strength is paid for.
// Trades: `add` adds to the Tuning value, `mul` multiplies it, `set` replaces it.
// `ai` is the CPU personality used when this character is played by the CPU (see ai.js for defaults).
// `look` is how they're drawn: skin, build, hair, hat, jaw, beard, colors (see looks.js for the parts list).
// `name` is the boxer's name, `style` their playstyle (shown under the name on the select screen).
// `glove` is their glove color.

const CHARACTERS = {
  standard: {
    name: 'Mack Moreno', style: 'All-rounder', glove: '#d23a3a',
    look: { skin: '#c68a5e', hair: 'buzz', hairColor: '#2b1d14' },
    blurb: 'Balanced: no special strengths, no weaknesses. Every stat as tuned.',
    ai: {},
  },
  outboxer: {
    name: 'Eli Vance', style: 'Out-boxer', glove: '#2f7fd8',
    look: { skin: '#e2b48c', build: 'slim', hair: 'slick', hairColor: '#6b4a2b', hat: 'headband', hatColor: '#f4f7ff' },
    blurb: 'Longer jab and cheaper steps. Slower heavy up close, and he can take less.',
    add: { lightTip: 10, stepCost: -3, heavyStartup: 0.03, hpFixed: -1 },
    ai: { weights: { light: 0.7, medium: 0.25, heavy: 0.05 }, hover: 25, guardwalk: 0.3, block: 0.5, parry: 0.4, step: 1.3, aggression: 1.0 },
  },
  pressure: {
    name: 'Bruno Kade', style: 'Pressure fighter', glove: '#e07b22',
    look: { skin: '#7d4f33', build: 'broad', hair: 'bald', jaw: 'big', beard: 'stubble', beardColor: '#1a120c' },
    blurb: 'Walks you down behind the guard and can take a beating. Short jab, slow to back up.',
    add: { blockMoveMult: 0.2, hpFixed: 1, lightTip: -10, backSpeedMult: -0.1 },
    ai: { weights: { light: 0.3, medium: 0.35, heavy: 0.35 }, hover: -45, guardwalk: 2.0, block: 1.2, parry: 0.4, step: 0.5, aggression: 1.4 },
  },
  counter: {
    name: 'Ray Sato', style: 'Counter-puncher', glove: '#18a99c',
    look: { skin: '#f0c9a4', hair: 'flattop', hairColor: '#3a2a1e', beard: 'goatee', jaw: 'pointed', trim: '#1b1b1b' },
    blurb: 'Bigger parry window and longer parry stun. Tires faster, shorter steps.',
    add: { parryWindow: 0.03, parryStun: 0.1, stepDist: -10 },
    mul: { regenRate: 0.85 },
    ai: { weights: { light: 0.45, medium: 0.4, heavy: 0.15 }, hover: 10, guardwalk: 0.5, block: 1.0, parry: 2.2, step: 0.7, aggression: 0.7 },
  },
  dancer: {
    name: 'Jojo Reyes', style: 'Dancer', glove: '#9b59d0',
    look: { skin: '#b07a52', build: 'slim', hair: 'mohawk', hairColor: '#ff4fa0', shirt: '#2a2440' },
    blurb: 'Longer, cheaper steps. Blocking costs him more stamina.',
    add: { stepDist: 15, stepCost: -3, blockCostLight: 4, blockCostMedium: 4 },
    ai: { weights: { light: 0.5, medium: 0.35, heavy: 0.15 }, hover: 0, guardwalk: 0.3, block: 0.5, parry: 0.6, step: 1.8, aggression: 1.1, stepin: 2.5 },
  },
};

// How each traded stat reads on the select screen, and which direction is good for the fighter.
const TRADE_INFO = {
  lightTip:        { label: 'jab reach', unit: 'px', better: 1 },
  heavyStartup:    { label: 'heavy windup', unit: 's', better: -1 },
  lightWhiffExtra: { label: 'recovery on a missed jab', unit: 's', better: -1 },
  lightCost:       { label: 'jab stamina cost', better: -1 },
  stepCost:        { label: 'step cost', better: -1 },
  heavyDamage:     { label: 'heavy damage', better: 1 },
  hpFixed:         { label: 'HP', better: 1 },
  blockMoveMult:   { label: 'walk speed while blocking', pct: true, better: 1 },
  backSpeedMult:   { label: 'backward walk speed', pct: true, better: 1 },
  parryWindow:     { label: 'parry window', unit: 's', better: 1 },
  parryStun:       { label: 'parry stun', unit: 's', better: 1 },
  stepDist:        { label: 'step distance', unit: 'px', better: 1 },
  regenRate:       { label: 'stamina regen', better: 1 },
  blockCostLight:  { label: 'stamina to block a light', better: -1 },
  blockCostMedium: { label: 'stamina to block a medium', better: -1 },
};

// Keep traded values in sane ranges.
const TRADE_LIMITS = { hpFixed: [1, 99], blockMoveMult: [0, 1], backSpeedMult: [0.2, 1], stepCost: [0, 999], lightTip: [5, 999],
                       heavyDamage: [0, 99], parryWindow: [0, 1], stepDist: [10, 999] };

// A per-fighter settings object: reads everything from CONFIG (live Tuning) except the traded stats.
function characterConfig(id) {
  const ch = CHARACTERS[id] || CHARACTERS.standard;
  const cfg = Object.create(CONFIG);
  const put = (k, v) => { const lim = TRADE_LIMITS[k]; cfg[k] = lim ? clamp(v, lim[0], lim[1]) : v; };
  for (const k in ch.add || {}) put(k, CONFIG[k] + ch.add[k]);
  for (const k in ch.mul || {}) put(k, CONFIG[k] * ch.mul[k]);
  for (const k in ch.set || {}) put(k, ch.set[k]);
  return cfg;
}

// Lines for the select screen: [{ text, good }]
function describeTrades(id) {
  const ch = CHARACTERS[id] || CHARACTERS.standard, out = [];
  const fmt = (k, delta, isMul) => {
    const info = TRADE_INFO[k] || { label: k, better: 1 };
    let text;
    if (isMul) text = `${delta > 1 ? '+' : '−'}${Math.round(Math.abs(delta - 1) * 100)}% ${info.label}`;
    else if (info.pct) text = `${delta > 0 ? '+' : '−'}${Math.round(Math.abs(delta) * 100)}% ${info.label}`;
    else text = `${delta > 0 ? '+' : '−'}${+Math.abs(delta).toFixed(2)}${info.unit || ''} ${info.label}`;
    const up = isMul ? delta > 1 : delta > 0;
    out.push({ text, good: up === (info.better > 0) });
  };
  for (const k in ch.add || {}) fmt(k, ch.add[k], false);
  for (const k in ch.mul || {}) fmt(k, ch.mul[k], true);
  out.sort((a, b) => b.good - a.good);
  return out;
}
