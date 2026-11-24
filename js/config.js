// config.js: every tunable number lives here.
// CONFIG_SCHEMA drives the Tuning menu; CONFIG holds the live values.

// Fixed world constants (not exposed as sliders).
const WORLD = {
  w: 1280, h: 720,                              // logical canvas size
  arena: { x: 60, y: 110, w: 1160, h: 570 },    // walled fighting area
  radius: 22,                                   // fighter circle radius
  reach: 16,                                    // how far the "blade tip" sticks out past the body
  step: 1 / 120,                                // fixed simulation step (seconds)
};

const CONFIG_SCHEMA = [

  { group: 'Match' },
  { key: 'arena',         label: 'Arena', type: 'hidden', def: 'ring' },
  { key: 'cfgVersion',    label: 'Settings version', type: 'hidden', def: 26 },
  { key: 'hpFixed',       label: 'Health',                       min: 1,   max: 20,  step: 1,    def: 8 },
  { key: 'roundsToWin',   label: 'Rounds to win',                min: 1,   max: 5,   step: 1,    def: 3 },
  { key: 'roundTime',     label: 'Round time (s)',               min: 15,  max: 180, step: 5,    def: 60 },
  { key: 'autoLock',      label: 'Auto-lock aim (both players)', type: 'bool',                   def: false },
  { key: 'aiLevel',       label: 'CPU skill',                    min: 0,   max: 1,   step: 0.05, def: 0.6 },
  { key: 'koReplay',      label: 'Slow-mo replay after a K.O. (A / Enter skips)', type: 'bool', def: true },
  { key: 'soundVolume',   label: 'Sound volume (M mutes in a match)', min: 0, max: 1, step: 0.05, def: 0.7 },

  { group: 'Movement' },
  { key: 'momentum',        label: 'Momentum movement (off = classic)', type: 'bool',                def: true },
  { key: 'moveSpeed',       label: 'Move speed (px/s)',              min: 100, max: 500, step: 10,  def: 260 },
  { key: 'backSpeedMult',   label: 'Speed walking away from opponent (x)', min: 0.3, max: 1, step: 0.05, def: 0.7 },
  { key: 'accelTime',       label: 'Momentum: time to reach full speed (s)',        min: 0.02, max: 2,  step: 0.02, def: 0.4 },
  { key: 'brakeTime',       label: 'Momentum: time to stop when reversing (s)',     min: 0.02, max: 2,  step: 0.02, def: 0.4 },
  { key: 'coastTime',       label: 'Momentum: time to stop after letting go (s)',   min: 0.02, max: 8,  step: 0.02, def: 0.9 },
  { key: 'slideTime',       label: 'Momentum: time to stop while committed (s)',    min: 0.02, max: 8,  step: 0.02, def: 1.0 },
  { key: 'retreatDrag',     label: 'Momentum: drifting away from opponent dies off fast', type: 'bool', def: true },
  { key: 'turnRateIdle',   label: 'Turn rate (rad/s)', min: 2,   max: 40,  step: 1,   def: 14 },

  { group: 'Attacks: light (R1) / medium (R2) / heavy (L2)' },
  { key: 'lightTravel',   label: 'Light: lunge travel (px)',     min: 0,  max: 400, step: 5,    def: 140 },
  { key: 'lightTip',      label: 'Light: fist reach (px)',       min: 5,  max: 260, step: 1,    def: 56 },
  { key: 'lightStartup',  label: 'Light: windup (s)',            min: 0,  max: 0.4, step: 0.01, def: 0.07 },
  { key: 'lightRecovery', label: 'Light: recovery (s)',          min: 0.02, max: 1, step: 0.01, def: 0.15 },
  { key: 'lightDamage',   label: 'Light: damage',                min: 0,  max: 6,   step: 1,    def: 1 },
  { key: 'lightCost',     label: 'Light: stamina',               min: 0,  max: 80,  step: 1,    def: 12 },
  { key: 'lightKnock',    label: 'Light: knockback (px/s)',      min: 0,  max: 2500, step: 25,  def: 850 },
  { key: 'lightSpeed',    label: 'Light: lunge speed (px/s)',    min: 300, max: 5000, step: 50, def: 1500 },
  { key: 'lightAdv',      label: 'Light: hit advantage (s)',     min: -0.2, max: 0.5, step: 0.01, def: 0.02 },
  { key: 'lightWhiffExtra',  label: 'Light: extra recovery on a whiff (s)',  min: 0, max: 0.5, step: 0.01, def: 0.07 },
  { key: 'mediumTravel',   label: 'Medium: lunge travel (px)',   min: 0,  max: 300, step: 5,    def: 80 },
  { key: 'mediumTip',      label: 'Medium: fist reach (px)',     min: 5,  max: 150, step: 1,    def: 46 },
  { key: 'mediumStartup',  label: 'Medium: windup (s)',          min: 0,  max: 0.5, step: 0.01, def: 0.13 },
  { key: 'mediumRecovery', label: 'Medium: recovery (s)',        min: 0.02, max: 1.2, step: 0.01, def: 0.28 },
  { key: 'mediumDamage',   label: 'Medium: damage',              min: 0,  max: 6,   step: 1,    def: 2 },
  { key: 'mediumCost',     label: 'Medium: stamina',             min: 0,  max: 80,  step: 1,    def: 20 },
  { key: 'mediumKnock',    label: 'Medium: knockback (px/s)',    min: 0,  max: 2500, step: 25,  def: 1000 },
  { key: 'mediumSpeed',    label: 'Medium: lunge speed (px/s)',  min: 300, max: 5000, step: 50, def: 1800 },
  { key: 'mediumAdv',      label: 'Medium: hit advantage (s)',   min: -0.2, max: 0.5, step: 0.01, def: 0.08 },
  { key: 'mediumTurn',     label: 'Medium: turning during windup (rad/s)', min: 0, max: 30, step: 0.5, def: 8 },
  { key: 'mediumWhiffExtra', label: 'Medium: extra recovery on a whiff (s)', min: 0, max: 0.5, step: 0.01, def: 0.05 },
  { key: 'mediumWidth',   label: 'Medium: extra hitbox width (px)', min: 0, max: 30, step: 1,   def: 4 },
  { key: 'heavyTravel',   label: 'Heavy: lunge travel (px)',     min: 0,  max: 400, step: 5,    def: 30 },
  { key: 'heavyTip',      label: 'Heavy: reach (px)',            min: 5,  max: 200, step: 1,    def: 30 },
  { key: 'heavyStartup',  label: 'Heavy: windup (s)',            min: 0,  max: 0.8, step: 0.01, def: 0.24 },
  { key: 'heavyRecovery', label: 'Heavy: recovery (s)',          min: 0.02, max: 1.5, step: 0.01, def: 0.45 },
  { key: 'heavyDamage',   label: 'Heavy: damage',                min: 0,  max: 8,   step: 1,    def: 3 },
  { key: 'heavyCost',     label: 'Heavy: stamina',               min: 0,  max: 100, step: 1,    def: 35 },
  { key: 'heavyKnock',    label: 'Heavy: knockback (px/s)',      min: 0,  max: 3000, step: 25,  def: 1250 },
  { key: 'heavySpeed',    label: 'Heavy: lunge speed (px/s)',    min: 300, max: 5000, step: 50, def: 2200 },
  { key: 'heavyAdv',      label: 'Heavy: hit advantage (s)',     min: -0.2, max: 0.6, step: 0.01, def: 0.15 },
  { key: 'heavyTurn',     label: 'Heavy: turning during windup (rad/s)', min: 0, max: 30, step: 0.5, def: 3 },
  { key: 'heavyWhiffExtra',  label: 'Heavy: extra recovery on a whiff (s)',  min: 0, max: 0.5, step: 0.01, def: 0.05 },
  { key: 'heavyWidth',    label: 'Heavy: extra hitbox width (px)',  min: 0, max: 30, step: 1,   def: 8 },
  { key: 'showRanges',    label: 'Show attack range rings (learning aid)', type: 'bool',        def: false },

  { group: 'All attacks' },
  { key: 'attackBuffer',       label: 'Input buffer: attack press remembered (s) (0 = off)', min: 0, max: 0.3, step: 0.01, def: 0.1 },
  { key: 'stepBuffer',         label: 'Input buffer: step press remembered (s) (0 = off)',   min: 0, max: 0.3, step: 0.01, def: 0.1 },
  { key: 'hitRecoveryMult',    label: 'Recovery when you land the hit (x)',   min: 0,   max: 1,   step: 0.05, def: 0.5 },
  { key: 'counterBonus',       label: 'Counter-hit bonus damage',             min: 0,   max: 3,   step: 1,    def: 1 },
  { key: 'armor',              label: 'Armor on heavy windup (a light can\'t interrupt it)',          type: 'bool',                   def: true },
  { key: 'armorDamage',        label: 'Damage taken through armor',           min: 0,   max: 2,   step: 1,    def: 1 },
  { key: 'armorBounce',        label: 'Attacker bounce off armor (px/s)',    min: 0,   max: 800, step: 25,   def: 0 },
  { key: 'lungeMomentum',      label: 'Momentum lunge: reach change = your speed toward (+) / away from (−) your aim × this (s)', min: 0, max: 0.6, step: 0.02, def: 0.2 },
  { key: 'lungeMomentumMax',   label: 'Momentum lunge: max extra reach (px)',  min: 0,   max: 300, step: 5,    def: 80 },
  { key: 'lungeMomentumPenaltyMax', label: 'Momentum lunge: max reach LOST moving away from aim (px)', min: 0, max: 200, step: 5, def: 40 },
  { key: 'lungeCarry',         label: 'Momentum: slide after a whiffed lunge (x speed)', min: 0, max: 0.8, step: 0.01, def: 0.16 },

  { group: 'Block / parry (L1 · E)' },
  { key: 'blockMoveMult',     label: 'Move speed while blocking (x)',        min: 0,   max: 1,   step: 0.05, def: 0.4 },
  { key: 'blockTurn',         label: 'Turning while blocking (rad/s)',       min: 0.5, max: 30,  step: 0.5,  def: 6 },
  { key: 'blockAngle',        label: 'Guard covers ± this many degrees',     min: 20,  max: 180, step: 5,    def: 70 },
  { key: 'blockDrain',        label: 'Stamina drain while holding block (/s)', min: 0, max: 40,  step: 1,    def: 4 },
  { key: 'blockCostLight',    label: 'Stamina lost blocking a light',       min: 0,   max: 60,  step: 1,    def: 8 },
  { key: 'blockCostMedium',   label: 'Stamina lost blocking a medium',      min: 0,   max: 60,  step: 1,    def: 14 },
  { key: 'blockAdvLight',     label: 'Blocker acts first after a blocked light by (s)',  min: -0.3, max: 0.5, step: 0.01, def: 0.03 },
  { key: 'blockAdvMedium',    label: 'Blocker acts first after a blocked medium by (s)', min: -0.3, max: 0.5, step: 0.01, def: 0.12 },
  { key: 'blockPush',         label: 'Pushback on block (px/s)',             min: 0,   max: 1500, step: 25,  def: 350 },
  { key: 'heavyBreaksGuard',  label: 'Heavy breaks guard',                   type: 'bool', def: true },
  { key: 'guardBreakDamage',  label: 'Guard break damage',                   min: 0,   max: 4,   step: 1,    def: 1 },
  { key: 'guardBreakKnock',   label: 'Guard break knockback (px/s)',         min: 0,   max: 2000, step: 25,  def: 700 },
  { key: 'guardBreakAdv',     label: 'Guard break: attacker acts first by (s)', min: 0, max: 1,  step: 0.01, def: 0.25 },
  { key: 'parryWindow',       label: 'Parry window after pressing block (s), tap or hold', min: 0, max: 0.4, step: 0.01, def: 0.12 },
  { key: 'parryCooldown',     label: 'Anti-mash: pressing again within this gives no parry (s)', min: 0, max: 1.5, step: 0.05, def: 0.4 },
  { key: 'parryStun',         label: 'Parried attacker is stunned for (s)',  min: 0,   max: 1.5, step: 0.05, def: 0.5 },

  { group: 'Step (X · Shift) and plant (O · F)' },
  { key: 'stepDist',       label: 'Step distance (px)',                   min: 20,  max: 250, step: 5,    def: 70 },
  { key: 'stepDur',        label: 'Step duration (s)',                    min: 0.04, max: 0.4, step: 0.01, def: 0.12 },
  { key: 'stepRecovery',   label: 'Step recovery (s)',           min: 0,   max: 0.6, step: 0.01, def: 0.15 },
  { key: 'stepCost',       label: 'Step cost',                            min: 0,   max: 60,  step: 1,    def: 18 },
  { key: 'fwdStepMult',    label: 'Forward step distance (x, stepping toward opponent)', min: 1, max: 1.6, step: 0.05, def: 1.1 },
  { key: 'backStepMult',   label: 'Backstep distance (x, stepping away from opponent)', min: 0.3, max: 1, step: 0.05, def: 0.8 },
  { key: 'stepSpeedCap',   label: 'Momentum: steps can push you up to (x walk speed)', min: 1, max: 5, step: 0.1, def: 2.2 },
  { key: 'stepCarry',      label: 'Momentum: speed kept after a step (x)', min: 0,  max: 1,   step: 0.05, def: 0.4 },
  { key: 'feintCostBase',    label: 'Feint cost, base',                min: 0,  max: 60,  step: 1,    def: 6 },
  { key: 'feintCostFrac',    label: 'Feint cost, + share of cancelled attack cost', min: 0, max: 1, step: 0.05, def: 0.4 },
  { key: 'plantInRecovery', label: 'Plant during recovery stops your slide (recovery still runs)', type: 'bool', def: true },
  { key: 'plantCostBase',  label: 'Plant cost, base',            min: 0,   max: 50,  step: 1,    def: 4 },
  { key: 'plantCostSpeed', label: 'Plant cost per walk-speed of motion',  min: 0,   max: 50,  step: 1,    def: 8 },
  { key: 'plantRecovery',  label: 'Plant recovery (s)',                   min: 0,   max: 0.5, step: 0.01, def: 0.12 },

  { group: 'Stamina' },
  { key: 'staminaMax',       label: 'Max stamina',                     min: 30, max: 300, step: 5,    def: 100 },
  { key: 'regenRate',        label: 'Regen per second',                min: 0,  max: 120, step: 1,    def: 28 },
  { key: 'regenDelay',       label: 'Regen delay after any action (s)', min: 0, max: 2,   step: 0.05, def: 0.6 },
  { key: 'advanceRegenMult', label: 'Regen when moving forward (x)',   min: 0,  max: 3,   step: 0.05, def: 1.4 },
  { key: 'retreatRegenMult', label: 'Regen when backing off (x)',      min: 0,  max: 2,   step: 0.05, def: 0.35 },
  { key: 'hitRefund',        label: 'Stamina refunded on landing a hit', min: 0, max: 100, step: 1,   def: 20 },

  { group: 'Tag team' },
  { key: 'tagBruise',     label: 'Share of each hit that is recoverable (heals while resting)', min: 0, max: 1, step: 0.05, def: 0.5 },
  { key: 'tagHealTime',   label: 'Resting: seconds to heal 1 recoverable health', min: 0.5, max: 10, step: 0.25, def: 3 },
  { key: 'tagRestStamina', label: 'Resting: stamina regen (x normal)', min: 0, max: 5, step: 0.25, def: 2 },
  { key: 'tagZone',       label: 'Tag zone: how close to your corner (px)', min: 30, max: 250, step: 5, def: 90 },
  { key: 'tagInRecovery', label: 'Tagged-in fighter can\'t act for (s)', min: 0, max: 1, step: 0.05, def: 0.3 },
  { key: 'tagKODelay',    label: 'After a K.O., partner comes in after (s)', min: 0.3, max: 3, step: 0.1, def: 1.2 },
  { key: 'noDQ',          label: 'No DQ rules: a waiting partner\'s jab can hit the opponent in the ring', type: 'bool', def: false },
  { key: 'apronBrawl',    label: 'Apron brawl: waiting partners can jab each other', type: 'bool', def: false },
  { key: 'cheapShotDamage', label: 'Jab from outside the ring: damage', min: 0, max: 3, step: 1, def: 1 },
  { key: 'cheapShotStun', label: 'Jab from outside the ring: stagger (s)', min: 0, max: 1, step: 0.05, def: 0.35 },
  { key: 'cheapShotCooldown', label: 'Jab from outside the ring: one every (s)', min: 0.5, max: 10, step: 0.5, def: 2.5 },

  { group: 'Hits and walls' },
  { key: 'knockFriction',  label: 'Knockback friction',          min: 1,    max: 20,   step: 0.5,  def: 7 },
  { key: 'wallBounce',     label: 'Momentum: wall bounce (share of speed kept, 0 = walls just stop you)', min: 0, max: 1, step: 0.05, def: 0.6 },
  { key: 'wallSplatSpeed', label: 'Wall splat speed threshold',  min: 50,   max: 1500, step: 25,   def: 350 },
  { key: 'wallSplatStun',  label: 'Wall splat stun (s)',         min: 0,    max: 1.5,  step: 0.05, def: 0.5 },
  { key: 'hitstop',        label: 'Hitstop (s)',                 min: 0,    max: 0.3,  step: 0.01, def: 0.08 },
  { key: 'clashRecovery',      label: 'Recovery after a clash (s)',           min: 0,   max: 1,   step: 0.02, def: 0.3 },

];

// Movement presets (picked from the main menu). Classic = no momentum at all.
const MOVE_PRESETS = {
  balanced: { label: 'Balanced (default)',     accelTime: 0.4,  brakeTime: 0.4,  coastTime: 0.9, slideTime: 1.0,  lungeCarry: 0.16, stepSpeedCap: 2.2 },
  grounded: { label: 'Grounded (light slide)', accelTime: 0.3,  brakeTime: 0.3,  coastTime: 0.5, slideTime: 0.5, lungeCarry: 0.15, stepSpeedCap: 1.8 },
  skating:  { label: 'Skating',                accelTime: 0.55, brakeTime: 0.6,  coastTime: 1.6, slideTime: 1.4,  lungeCarry: 0.3,  stepSpeedCap: 2.6 },
  zerog:    { label: 'Zero-G (drift)',         accelTime: 0.9,  brakeTime: 1.1,  coastTime: 6,   slideTime: 6,    lungeCarry: 0.45, stepSpeedCap: 3 },
};

function applyMovePreset(name) {
  if (name === 'classic') { CONFIG.momentum = false; return; }
  const p = MOVE_PRESETS[name];
  if (!p) return;
  CONFIG.momentum = true;
  for (const k in p) if (k !== 'label') CONFIG[k] = p[k];
}

// Which preset the current settings match ('custom' if tweaked in Tuning).
function currentMovePreset() {
  if (!CONFIG.momentum) return 'classic';
  for (const name in MOVE_PRESETS) {
    const p = MOVE_PRESETS[name];
    if (Object.keys(p).every(k => k === 'label' || Math.abs(CONFIG[k] - p[k]) < 1e-6)) return name;
  }
  return 'custom';
}

// Max health.
function maxHp(cfg = CONFIG) { return cfg.hpFixed; }

// The three fixed attacks, read from CONFIG. Triangle: light beats medium (faster),
// heavy beats light (armored windup), medium beats heavy (faster + breaks armor).
const ATTACK_KINDS = ['light', 'medium', 'heavy'];
const ATTACK_BEATS = { light: 'medium', medium: 'heavy', heavy: 'light' };
function fixedAttack(kind, cfg = CONFIG) {
  const c = k => cfg[kind + k];
  return {
    kind,
    travel: c('Travel'), tip: c('Tip'), startup: c('Startup'), recovery: c('Recovery'),
    damage: c('Damage'), cost: c('Cost'), knock: c('Knock'), speed: c('Speed'), adv: c('Adv'), whiffExtra: c('WhiffExtra'),
    turn: kind === 'light' ? cfg.turnRateIdle : c('Turn'),
    width: kind === 'light' ? 0 : c('Width'),
    tier: kind === 'light' ? 0 : kind === 'medium' ? 0.5 : 1,   // used for effects scaling
  };
}

const CONFIG = {};
const CONFIG_STORAGE_KEY = 'lunge-config-v12';   // bumped so older saved values don't override new defaults

function resetConfig() {
  for (const s of CONFIG_SCHEMA) if (s.key) CONFIG[s.key] = s.def;
}

function saveConfig() {
  try { localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(CONFIG)); } catch (e) { /* storage unavailable */ }
}

function applyConfigObject(obj) {
  for (const k in obj) if (k in CONFIG && typeof obj[k] === typeof CONFIG[k]) CONFIG[k] = obj[k];
}

function loadConfig() {
  resetConfig();
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      // v18: the v17 long-arm jab (travel 60 / tip 136) was reverted. Move saved v17 defaults to the new ones.
      if (obj.lightTravel === 60 && obj.lightTip === 136) { obj.lightTravel = 140; obj.lightTip = 56; }
      // v19: buffer defaults went 0.15 / 0.2 -> 0.1 / 0.1. Move saved old defaults to the new ones.
      if (obj.attackBuffer === 0.15) obj.attackBuffer = 0.1;
      if (obj.stepBuffer === 0.2) obj.stepBuffer = 0.1;
      // v26: the old 'Square' is now 'Rectangle', and the new square Ring is the default arena.
      if (!(obj.cfgVersion >= 26)) { if (obj.arena === 'square') obj.arena = 'ring'; obj.cfgVersion = 26; }
      applyConfigObject(obj);
    }
  } catch (e) { /* storage unavailable or corrupt */ }
}

resetConfig();
