# TITLE FIGHT

*Hit and don't get hit.* (Working title was LUNGE: the folder and code still use that name.)

See **DESIGN.md** for the current rules, the reasons behind them, and what to watch in testing.

Top-down 1v1 about distance, timing and commitment. Unzip it and open `index.html` in Chrome, Edge or Firefox. You don't need a server or a build step.

## Files
| File | What it does |
|---|---|
| `index.html` | Page, menu overlays, controls help, script order |
| `css/style.css` | Menu styling |
| `js/util.js` | Math helpers (lerp, clamp, angles) |
| `js/config.js` | **Every tunable number.** Edit the `def` values to change the defaults |
| `js/arena.js` | Arena shapes (square, rounded, circle, pillars, big arenas): collision, bounce normals, pillar line-of-attack, CPU steering, camera |
| `js/characters.js` | Fighter roster: stat trades on top of Tuning, CPU personalities, looks |
| `js/looks.js` | How boxers are drawn from above + the parts library (hair, hats, jaws, beards, builds) |
| `js/input.js` | Keyboard, mouse, gamepad reading, plus `Controller` (edge detection) |
| `js/effects.js` | Sparks, rings, floating text, screen shake |
| `js/stats.js` | Per-player match stats, post-match screen data (C copies as JSON), totals the judges use |
| `js/sound.js` | All sounds, synthesized with Web Audio (no audio files). M mutes during a match |
| `js/replay.js` | Recording every match's inputs, the K.O. replay, saving/loading replay files |
| `js/training.js` | Training room: the pads, the dummy's brain, the frame-advantage readout |
| `js/fighter.js` | One fighter's state machine: attacks, block/parry, step, plant, movement, stamina |
| `js/ai.js` | CPU opponent (footsies, whiff punishes, reactions to windups, personalities) |
| `js/game.js` | Match flow, rounds, timer, judges' scorecards, tag team, hit/block/clash/wall resolution |
| `js/render.js` | All canvas drawing: the ring, ropes, crowd, fighters, HUD |
| `js/menu.js` | Menu, character select, device pickers, tuning sliders |
| `js/main.js` | Boot and fixed 120 Hz game loop |
| `tools/tests/` | Tests, run with Node.js (not loaded by the game). See below |

## Tests (`tools/tests/`, need Node.js)
Run from the game folder:
- `node tools/tests/checks.js`: **pass/fail checks of the core rules** (reach, triangle, whiff punishes, block/parry, buffer, steps, wall splat, arenas, characters, scorecards, replays, training, tag team). Run after every change; a FAIL means a rule changed.
- `node tools/tests/report.js`: numbers to watch from CPU matches (how often each attack is thrown and lands, share of damage, blocks, parries...).
- `node tools/tests/matchups.js stats 160`: character win-rate table (`full` instead of `stats` = CPUs use their personalities).
- `harness.js` loads the game code into Node for the scripts above.

## Testing tips
- Change numbers live with **Tuning** (also available from the pause menu). Use **Copy as JSON** to share a setup with a friend.
- If you have no second pad: P2 = **CPU**, or **Keyboard: arrows** (auto-aim) for couch play on one keyboard.
- After a match, check the stats screen: is one attack doing all the work? Is anyone winning by only backing off?
- Debugging: in the browser console, `LUNGE.game` is the match in progress (and `LUNGE.attract` the fight behind the menu).
