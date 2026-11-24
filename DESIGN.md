# TITLE FIGHT: design doc

*Hit and don't get hit.* (Working title was LUNGE; the folder, code and replay files still use that name.)

The current state of the game: rules, the reasons behind them, and what to watch. Update it when rules change.

## Vision
A top-down 1v1 spacing game, like UFC or boxing: live at the edge of each other's reach, get in, land, get out without getting hit. It's built on visible commitment (windups, recoveries) and reads, not on combos or execution.

## Core loop
1. **Neutral:** hover around each other's ranges. Walking backward is slower than walking forward, and stamina regen rewards moving in.
2. **Commit:** throw an attack, step in, or put the guard up. Every action has a windup and/or recovery you can see.
3. **Punish:** whiffs, blocked mediums, missed parries and broken guards each leave a window.
4. **Reset:** hits knock players apart, so no combos except off a wall splat.

## The triangle (main rock-paper-scissors)
| | Beats | Loses to |
|---|---|---|
| **Light** (jab) | medium (faster) | heavy (armor), block, parry |
| **Medium** | heavy (faster, breaks armor) | light, block, parry |
| **Heavy** (power shot) | light (armored windup), **block** (guard break) | medium, parry, stepping out |
| **Block** (hold) | light, medium | heavy, being circled (front only) |
| **Parry** (press timing) | everything | bad timing: you're unguarded (tap) or just blocking (hold, so a heavy breaks you) |

Same attack at the same moment = clash.

## Attacks (boxing layout: jab longest, power shot shortest)
| | Reach | Windup | Recovery (hit / block / whiff) | Damage | Stamina |
|---|---|---|---|---|---|
| Light | ~240 (140 lunge + 56 fist) | 0.07 | 0.07 / 0.15 / 0.22 | 1 | 12 |
| Medium | ~170 | 0.13 | 0.14 / 0.28 / 0.33 | 2 | 20 |
| Heavy | ~104 | 0.24 (reactable) | 0.23 / 0.45 / 0.50 | 3 | 35 |

- Reach = lunge travel + fist reach + both body radii. The dashed arcs in game show it.
- **The jab's reach comes from the body lunge, not a long arm.** A whiffed jab carries you 187px, straight into their heavy range, and leaves you stuck 0.40s. A step moves 111px but gives control back in 0.28s, so stepping in and then jabbing beats a double jab. v17 tried a long arm (60 lunge + 136 fist) and reverted it: it looked odd, and only bodies can be hit, so a long arm let you jab with no risk to your body.
- **Input buffer:** an attack or step press is remembered for 0.1s (Tuning → All attacks; 0 = off). Between Street Fighter 6 (~0.07s) and Smash Ultimate (0.15s): forgiving enough that you don't need frame-perfect timing, short enough that a stale press doesn't fire after you've changed your mind. Only the last press counts. Holding a button does not repeat it or extend the buffer. **Block/parry is never buffered:** a block held or pressed during recovery comes out as a plain block with no parry window. A parry needs a fresh press on a frame where you can act, otherwise it becomes an automatic wake-up parry.
- **Momentum lunge:** moving toward your aim adds up to +80px reach (green on the line), and moving away loses up to 40px (red).
- **Counter hit:** hitting someone during their windup = +1 damage.
- **Hit advantage:** the hitter acts first by 0.02 / 0.08 / 0.15s. **No true combos:** after any hit, a defender holding block blocks the fastest follow-up (checked in tests). After a light hit the players end up ~143px apart, still inside jab range (240), so the hitter has a small "turn": jab again (beats their medium or jab), but block, parry and a sidestep beat it. Knockback barely changes that gap (1450 knock only gets to 187px), so if jab pressure feels oppressive, the lever is the light's hit advantage (`lightAdv`, 0 = even), not knockback. Medium and heavy hits do separate the players (197 / 251px).
- **Wall splat:** knockback into a wall at speed = extra stun, the one guaranteed follow-up. **Once per combo:** after a splat you can't be splatted again until you've had control. Before this, a pinned player could be looped to death (7 splats in a row in testing). Now it's splat + 1 follow-up, then the victim gets control (holding block through it guards immediately).
- **Feint:** step during a medium or heavy windup to cancel it (costs stamina). A light has no feint; it's too fast to fake.
- HP 8.

## Defense
- **Block** (hold L1): front ±70°, 0.4× move speed, stamina drain plus a cost per blocked hit. The blocker acts first after a blocked light (+0.03) or medium (+0.12). Heavy = guard break (1 damage, the attacker is +0.25s, close enough for a medium follow-up). Out of stamina = guard breaks.
- **Parry:** every press of block = 0.12s parry window, tap or hold. A parried attacker is stunned 0.5s. A press within 0.4s of the last one gives no parry (no mashing). No artificial whiff penalty: the risk is being unguarded or blocking a heavy.
- **Step** (X): about 70px, 0.12s, recovery 0.15s, 18 stamina. **Not invulnerable.** Forward steps go 1.1×, backsteps 0.8×. In momentum modes a step adds to your velocity (capped at 2.2× walking speed).
- **Plant** (Circle): stop dead; costs more the faster you're moving. During a recovery it only stops your slide.

## Movement and stamina
- Walk 260 px/s, backward 0.7×. **Balanced** momentum preset (accel 0.4s, coast 0.9s, slide 1.0s). Walls bounce at 60% if you hit them faster than walking.
- Stamina 100. Regen 28/s after a 0.6s delay, ×1.4 moving in, ×0.35 backing off. +20 refund on landing a hit.

## Characters (Exhibition → character select)
Each character = Standard (your Tuning values) + explicit trades (`characters.js`). Each strength is paid for, and **reach is traded sparingly**: without projectiles, reach is the main currency of the game.

| Character | Gets | Pays | CPU personality |
|---|---|---|---|
| **Mack Moreno** (All-rounder, was Standard) | — | — | balanced |
| **Eli Vance** (Out-boxer) | +10px jab reach, −3 step cost | +0.03s heavy windup, −1 HP | jabs, stays long, steps a lot |
| **Bruno Kade** (Pressure fighter) | +0.2 block walk speed, +1 HP | −10px jab reach, −0.1 backward walk | guard-walks in, heavies |
| **Ray Sato** (Counter-puncher) | +0.03s parry window, +0.1s parry stun | −15% stamina regen, −10px step | waits, parries a lot |
| **Jojo Reyes** (Dancer) | +15px step, −3 step cost | +4 stamina to block lights and mediums | steps in and out, step-in attacks |

**Reach trades are small (±10px).** The Out-boxer pays for range by being worse up close (slower heavy), not by having a worse jab. A jab specialist with a bad jab made no sense.

**Matchup sims** (CPU vs CPU, both with the Standard brain so only stats differ, 160 rounds per pair, `tools/tests/matchups.js`):
v19 (with scorecards): overall Standard 53%, Out-boxer 51%, Dancer 51%, Pressure 49%, Counter 46%. No single matchup is worse than 44/56. v18: 48–53%. Sample noise is about ±5% per pair. Earlier: v17 45–53%, and the first version (±15px jab) 39–61%.
These are smoke tests, not human balance.

**CPU style:** in Exhibition the CPU uses the Standard brain unless "CPU uses this character's fighting style" is ticked. Personalities are mainly for the Ladder.

## Rounds and scorecards
- A round ends by K.O. or when time runs out. **Time-outs go to three judges**, scored like boxing: each judge gives 10-9 (10-8 if one-sided, 10-10 if even) and the majority wins the round (unanimous, split or majority decision; all even = draw, no point).
- What they score: **damage and clean hits** (counts most), **effective pressure** (your share of the time spent moving forward), **ring control** (your share of time holding the center), **defense** (blocks + parries, small, capped). Each judge weighs these a little differently (one likes clean punching, one is balanced, one likes aggression), so close rounds can split.
- **Why:** without it, a one-hit lead plus running away won every time-out. Pressure + control are capped at about three hits' worth, so one hit and running loses the decision, but a clear damage lead still wins. Both are checked in tests with real fighters.
- The cards show on screen after the decision (each card in the color of the fighter it went to).

## Sound
- All synthesized in `sound.js` (Web Audio, no files), panned left/right by position. Volume in Tuning; **M** mutes during a match.
- **Sounds are tells:** every windup has a sound. The heavy's is a low rising groan that lasts exactly as long as its windup, so you can react by ear. The medium's is a short inhale. The light's is near-silent on purpose (it's meant to be hard to react to).
- Loudness follows the stakes: heavy hit > medium > light; parry is a bright ring, guard break a crunch, clash a clang, wall splat the biggest thud. Bell to start a round, double bell on a decision, triple bell on a K.O., clock ticks in the last 5 seconds.

## Replays
- **Every match is recorded** as the inputs each fighter got on every frame. The simulation is deterministic (fixed time step; the only randomness is in CPU decisions and visual effects), so replaying the inputs reproduces the match exactly: positions, hits, every stat. Inputs are rounded to values a replay can reproduce (sticks to 1/1000, aim to 1/10000 rad) as they're read, so live play and replay use identical numbers. Checked in tests.
- **K.O. replay:** after each K.O., the last 3 seconds replay with a REPLAY marker, slowing down just before the hit (A / Enter / Space skips). Tuning → Match can turn it off. Built by re-running the match so far silently (takes a few milliseconds), so it costs nothing while you play.
- **Save:** S / (Y) on the end-of-match screen downloads a replay file (~100–400 KB). **Replays** on the main menu opens one: Space / (A) pause, ← → / LB RB speed (¼× to 4×), N / (Y) next round, Esc / (B) exit. The file carries its own settings, so it plays correctly whatever your Tuning is now (yours is put back afterwards).
- A replay is only saved if Tuning wasn't changed during the match (the stored settings would be wrong).
- Replay files are version 2: tag matches also store the waiting partners' inputs (their movement, aim and punches outside the ring). Tag replays saved with v21 won't play back correctly.
- Code: `replay.js`. Groundwork for the training room's record-and-play dummy, the Ladder's mirror boss, and possibly online play later.

## Training room (main menu → Training)
- You (your controls and character from the Exhibition screen) vs one dummy, in the square arena. No timer, no rounds.
- **Change the dummy by punching the pads on the walls** (no menu, on purpose: it's aim practice too). Each punch cycles that pad: **MOVE** still · back & forth · stepping · random. **ACTION** nothing · block · parry · block, then jab back · random attacks (always facing you; parry practice). **DISPLAY** hitboxes + recovery bars on/off. **KNOCKBACK** normal / none (your hits don't push the dummy, so you can keep practicing at one distance). **HEALTH** infinite (HP and stamina) / normal (a K.O. just resets). **RESET** positions.
- **Readout** after every exchange: who could act first and by how much, from your side ("light blocked · you −0.03s"). Matches the rules within one frame (1/120 s).
- **Hitboxes:** body circles (the only thing that can be hit), the attack's hit line at its real width (yellow during windup, red while it can hit), and a bar with the time left in any windup (yellow), recovery (red) or stun (purple).
- Code: `training.js` (pads, the dummy's brain, the readout).

## Tag team (Exhibition → tick "Tag team")
- Two fighters per side, **one in the ring at a time**, so all the 1v1 spacing rules stay as they are. The partner waits **outside the ring and roams freely** there (anywhere between the wall and the edge of the screen; never inside). They start at your corner (the middle of the wall behind your side). The camera zooms out a little in tag matches to show the outside.
- **Their tag zone moves with them** (a half-circle reaching into the ring from the nearest bit of wall), so they can come to a teammate who's stuck. If the teammate runs away from them, that's on the teammate. A CPU partner follows you around the outside (walking around the ring, not through it).
- **Waiting partners aim** (right stick / mouse; the arrow-keys player auto-faces the nearest target) and can:
  - **Tag** button: shout **"TAG ME IN!"** (speech bubble). If the one in the ring is a CPU, it also heads over to tag them in. A CPU partner shouts it when it's 2+ health ahead of you.
  - **Medium or heavy: shove** the other waiting partner. Only if you're aiming at them and right next to them. They slide away, no damage, 1s cooldown (CPU: 2s, and only when they're in its way).
  - **Light: jab from outside the ring.** A real punch with a hitbox along your aim (the fist reaches 60px; the body stays outside), one every 2.5s. It only hurts anyone with a toggle on:
    - **No DQ rules** (Exhibition checkbox): it can hit the **opponent in the ring** if they're close enough to the ropes: 1 damage + 0.35s stagger. A guard facing the ropes blocks it.
    - **Apron brawl** (Exhibition checkbox): it can hit the **other waiting partner**: 1 damage (half of it a bruise that heals) + a short stagger. A partner K.O.'d outside is out for the round.
  - Damage, stagger and how often: Tuning → Tag team. A CPU partner jabs when a target is in reach, after a 0.25s delay.
- **Waiting partners can't walk through each other** (a K.O.'d one can be stepped past), so the other team's partner can stand in your way.
- **Tag:** walk into your partner's zone (the half-circle lights up when you can) and press **Select / Share** (keyboard **Q**, arrows player **]**). Only when you're free (idle or blocking), not during an attack, recovery or stun. The incoming fighter **can't act and can't be hit** for 0.3s (they flicker), so a tag is neither an escape nor a free punish for the opponent.
- **Recoverable health:** half of every hit is a **bruise** (dim pips). It heals one pip every 3s while that fighter rests on the apron (green ring), and resting refills stamina 2× as fast. Only bruises heal, so a match can't go on forever.
- **K.O.:** your partner comes in automatically after 1.2s. The round ends when a whole team is down. Every round starts fresh (both healed, first fighter in).
- **Who controls the partner** (Exhibition, per side): the same controller (you play both), a CPU partner (uses that side's CPU skill), or another player's controller. A CPU tags out when it's 2+ health behind its partner or out of stamina. 
- Stats and scorecards count the whole team (both members share a side).
- Tuning → Tag team: recoverable share, heal time, rest stamina, zone size, tag-in delay, K.O. delay. Replays and K.O. replays work with tags.
- Free-for-all: later, maybe. With several opponents the "toward/away from the opponent" rules (backwalk, regen, step distance) would be turned off.

## Look and feel (v25 polish pass)
- **Boxing ring at night:** canvas mat under a spotlight (lit in the middle, darker toward the ropes), the LUNGE logo in the center circle, a dark crowd all around that bobs and fires camera flashes on big moments, and a vignette.
- **Ropes** (white / red / white) follow the arena's outline on every shape, and **wobble** when someone is splatted or lunges into them. Square ring: 4 corner posts, the left two in P1's color and the right two in P2's (the tag partners' corners). Round rings: posts all around like a cage, with the far left/right ones in the sides' colors. Pillars are padded posts.
- **Boxers from above** (`looks.js`): head, shoulders, arms bent ~90° in the guard (elbows tucked; the arm straightens on a punch), gloves with cuffs, lit from above. A ring on the floor in the side's color shows who's who (needed for mirror matches). The hitbox is still the same circle; only the drawing changed.
- **Per-character looks** are data, not code: each character has a `look:` in `characters.js` (skin, build, hair, hat, jaw, beard, colors, tank top). Parts library in `looks.js`: builds slim/normal/broad; hair bald/buzz/mohawk/afro/flattop/ponytail/cornrows/slick; hats headband/cap/capBack/headgear/beanie/bandana; jaw normal/big/pointed; beards full/goatee/stubble. A new part = one small function. The same drawing makes the **portraits** on the character select screen, so they always match.
  - Standard: buzz cut, red gloves. Out-boxer: slim, slicked hair, white headband, blue gloves. Pressure: broad, bald, big jaw, stubble, orange gloves. Counter-puncher: flat-top, goatee, pointed jaw, teal gloves. Dancer: slim, pink mohawk, tank top, purple gloves.
- **Crowd sound:** a filtered-noise murmur during matches that swells and brightens with excitement (big hits, splats, parries) and roars on a K.O.; quiet in menus.
- **HUD:** dark band behind it; segmented health bars (one segment per point; a lost segment flashes; tag bruises dim); thin stamina bar with step/medium/heavy cost marks; boxed timer. ROUND / FIGHT! / K.O. **slam in** (K.O. in red). The controls line only shows at the start of a match (it's on the Controls screen). Range rings now default to off (Tuning → Show attack range rings).
- **Menus:** main menu on the left with a **silent CPU vs CPU fight playing behind it** (attract mode, random characters). Restyled panels and buttons. **Gamepad navigation everywhere**: D-pad / stick to move (stick repeats), A select, B back, left/right change dropdowns and sliders; the focused control gets a gold ring.
- Big text uses Impact where the computer has it (Windows, Mac), otherwise the heaviest system font.
- **v26:** boxers have names (playstyle shown under the name; in code the ids are still standard / outboxer / pressure / counter / dancer). **Gamepad dropdowns** open a list under the dropdown (up/down, A picks, B cancels): browsers don't let a script open the real one. **Menu sounds:** a punch thump on buttons, a tick when moving, a crowd pop on Fight / Training, and a quiet crowd murmur behind the menu that follows the background fight. **Transitions:** screens fade and slide in, buttons pop when pressed, a match fades in from black.

## Modes
- **Exhibition:** pick controls, character and CPU skill for each side, then the arena.
- **Training**, **Replays**, **Tag team:** see above.
- **Ladder:** placeholder. Story ladder of CPU opponents (see Backlog).

## Arenas (Exhibition screen) and camera
- **Ring (default):** a square ring (680×680, zoomed to about 0.84×), the closest to a real boxing ring. Tighter than the rectangle: about 2.8 jab-lengths across.
- **Rectangle:** the original wide arena (was called Square before v26; old saved settings move to the Ring). Corners make pressure strong. The training room uses it.
- **Rounded (no corners):** the same width with semicircle ends, like a cage. No corner traps, but walls still splat.
- **Circle (small):** tight, at about 2.4 jab-lengths across. Very aggressive, with lots of wall splats.
- **Rectangle + 2 pillars / + 4 pillars:** pillars block bodies, lunges (a lunge into a pillar bounces like a wall) and attack lines (no hits through a pillar).
- **Big rectangle / Big circle / Big rectangle + 4 pillars:** bigger worlds; the camera zooms out to fit (about 0.6×). Same rules, more room. Good for testing how arena size changes passivity and pressure.
- **Camera:** positions are in world units and each arena has its own size. The camera fits the arena onto the play area; default-size arenas sit at exactly 1× (unchanged). The HUD isn't scaled, and mouse aim converts screen → world. Zoom is a real camera rather than shrinking fighters, because every distance (reach, steps, speeds, knockback) would otherwise need rescaling too.
- All of them go through `arena.js`: walls, bounce and splat use each surface's normal. The CPU avoids walls and pillars and steers around a pillar that's between it and you.

## Controls (gamepad / keyboard + mouse)
R1 / LMB light · R2 / RMB medium · L2 / Space heavy · L1 / E block-parry · X / Shift step · Circle / F plant · Select / Q tag · right stick / mouse aim. Arrow-key player: `/ . ,` attacks, `'` block, Right Shift step, `;` plant, `]` tag.

## Key decisions and why
- **Fixed attacks over charge-to-extend:** UFC footwork needs fixed, known reach. With charging, the edge kept moving and the threat line told the defender everything. (Charge mode was removed in v19; it's in the v18 zip and earlier.)
- **Boxing layout (jab longest):** with the jab shortest, you had to walk through two ranges to use it, so it was useless in neutral. In boxing the jab is the long, safe tool, and power shots need you inside.
- **Block + parry on one button:** the risk comes from timing. Separate buttons would need a free shoulder button, and there isn't one with dual-stick aim.
- **Steps not invulnerable:** invulnerable rolls let you pass *through* threats. In a spacing game you should have to go *around* them.
- **Hit advantage small, knockback separates:** no combos. Every hit resets to neutral with the hitter slightly ahead. Wall splat is the only exception, which makes corners matter.
- **Armor bounce 0:** with a short heavy, bouncing the jabber off the armor pushed them out of heavy range and broke "heavy beats light."
- **Actions that don't need aim go on face buttons:** with dual stick the right thumb aims, so held actions sit on the shoulders and quick actions (step, plant) on face buttons.

## Watch list (test with humans, use the stats screen)
- **Jab spam ("jab wall"):** in CPU matches the light is ~75% of attacks thrown and ~55% of damage, but it's the *least* rewarding per attempt (about 0.45 damage per jab vs 1.2 per medium, 1.6 per heavy) and per stamina. Its edge is range and safety, like a real jab. The skew is mostly the CPU hovering at jab range. Not changed; watch human stats. Levers: light stamina, light whiff extra, block speed.
- **Heavy's effective range** with momentum and step-ins.
- **Block strength:** passive blocking vs. pressure. Levers: block move speed, stamina costs, guard break.
- **Parry frequency:** is it too easy or too hard? Lever: parry window.
- Does medium earn its place as the armor breaker and mid-range tool?
- **Jab-reach trades** (±10): watch the Out-boxer in human play.
- **Jab as movement:** the jab carries you further than a step, but slower and into heavy range. If jab-walking feels cheap, raise the light's stamina cost rather than moving reach into the arm.
- **Scorecards:** do decisions feel fair? Levers: the JUDGES table at the top of `game.js`.
- **Heavy windup sound:** does hearing it make heavies too easy to react to? It's the main audio tell.
- **No DQ jab from outside:** is 1 damage + stagger a fair threat, or does it decide matches? Try 0 damage (stagger only) too.
- **Tag team:** is resting worth the walk to the corner? Levers: Tuning → Tag team (bruise share, heal time).
- **Wall splat:** once per combo now. Watch whether corners are still rewarding enough, or too strong.

## Removed systems (v19)
Charge attacks (glide, pressure-walk curve, charge-step), sprint and running lance, wall kick, the old invulnerable charged dash, and the block on/off and charge-mode toggles were removed to keep the code small for the Ladder. They're in the v18 zip (and earlier) if ever needed. The movement presets (Classic, Balanced, Grounded, Skating, Zero-G) stay on the menu.

## Code map
`config.js` all settings plus the attack table and presets · `characters.js` roster, trades, CPU personalities · `arena.js` arena shapes, collision, pillars, CPU steering helpers · `input.js` devices → per-frame input · `fighter.js` one fighter's state machine · `game.js` rounds, scorecards, tag team, hits, block, walls, events · `ai.js` CPU brain + personalities · `stats.js` match stats and judge totals · `sound.js` synthesized sounds · `replay.js` recording, K.O. replay, replay files · `training.js` training room · `render.js` all drawing (ring, crowd, HUD) · `looks.js` boxer drawing + parts library · `effects.js` particles and text · `menu.js` menus and Tuning · `main.js` loop.

## Testing notes
- The CPU is only for sanity checks. Balance questions need human matches.
- **Tests live in `tools/tests/`** (they ship in the zip but the game never loads them). Need Node.js (a free program from nodejs.org), or ask Claude to run them. From the game folder:
  - `node tools/tests/checks.js`: 118 pass/fail checks (they run on the Rectangle arena unless a check picks another) of the core rules. Run after every change. A FAIL means a rule changed: a bug, or an intended change that needs the check and this doc updated.
  - `node tools/tests/report.js`: how CPU matches play out (attack usage, hit rates, damage share, blocks, parries).
  - `node tools/tests/matchups.js stats 160` (or `full`): character win-rate table.
- **Post-match screen:** press **C** to copy the stats as JSON, to compare sessions or share them.
- Tuning → **Copy as JSON** saves a tuning setup. **Reset defaults** returns to the values in this doc.

## Backlog / future ideas
**Done in v19:** tests moved to `tools/tests/`, legacy systems removed, buffer 0.1, jab check, sound, judges' scorecards.
**Before the Ladder:** make sure CPU difficulty works through reaction and reading, not perfect inputs.

**Done in v20:** replays (K.O. replay, save/load, viewer), training room. **v21:** tag team. **v22:** partner walks the apron, TAG ME IN!, tag-in invulnerability, training KNOCKBACK pad, jab-back dummy fix, partner pros/cons on the select screen. **v23:** apron blocking, shove, No DQ cheap shots. **v24:** free roam outside the ring, aimed jab with a real hitbox, aimed shove, Apron brawl toggle. **v25:** polish pass (see Look and feel); fix: a waiting partner who got hit stayed white. **v26:** square Ring as the default arena, boxer names, gamepad dropdowns, menu sounds, transitions.
**Next:** the Ladder.

- **Determinism:** keep randomness out of the core fight logic. That makes input-based replays, a KO replay with range rings, and later rollback online play possible.
- **Scenario puzzles** ("cornered at 2 HP, get out"), and a **mirror boss** for the Ladder that learns the player's habits.
- Outside-the-box ideas to think about: fatigue across rounds, lasting damage (a swollen eye that narrows vision on one side), a facing-based vision cone, weight classes, a crowd meter that boos passivity and shrinks the ring, a weapons spin-off (dagger/spear/greatsword), 2v2 tag or a three-way free-for-all.
- **Dynamic camera** (follow + zoom with the action), if fixed zoom isn't enough.
- **Story mode (Punch-Out style):** a ladder of CPU opponents, each a readable puzzle with a style, tells and a weakness. Archetypes: Jabber (out-boxer), Brawler (guard-walk + heavies), Counter-puncher (parries), Slugger (armored heavies), Dancer (steps/feints), Wall Bully (corner pressure), bosses with gimmicks.
  - Groundwork done: per-fighter stats (characters) and CPU personalities. Still needed: scripted tells and per-opponent gimmicks.
