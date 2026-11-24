// main.js: boots everything and runs the fixed-timestep loop.

(() => {
  loadConfig();

  const canvas = document.getElementById('game');
  Input.init(canvas);
  const game = new Game();
  const renderer = new Renderer(canvas);
  let mode = 'menu';   // 'menu' | 'play' | 'paused' | 'replay'

  // ---- attract mode: a silent CPU vs CPU fight plays behind the menus ----
  let attract = null, attractAcc = 0;
  function newAttract() {
    const ids = Object.keys(CHARACTERS), pick = () => ids[Math.floor(Math.random() * ids.length)];
    Arena.override = null;
    attract = new Game();
    attract.silent = true; attract.attract = true;
    attract.start('cpu', 'cpu', { chars: [pick(), pick()], levels: [0.85, 0.85], aiChars: undefined });
  }

  // ---- replay viewer: plays a saved replay file ----
  const SPEEDS = [0.25, 0.5, 1, 2, 4];
  let view = null, viewFile = null, viewSpeed = 2, viewPaused = false, viewAcc = 0, savedConfig = null;
  function watch(file) {
    if (!savedConfig) savedConfig = JSON.parse(JSON.stringify(CONFIG));   // put the player's Tuning back afterwards
    applyConfigObject(file.config);
    viewFile = file;
    view = Replay.play(file.config, file.setup, file.devices, file.frames);
    viewSpeed = 2; viewPaused = false; viewAcc = 0;
    mode = 'replay'; Menu.hideAll();
  }
  function exitReplay() {
    if (savedConfig) { applyConfigObject(savedConfig); savedConfig = null; }
    view = null; viewFile = null; mode = 'menu'; Menu.showMenu();
  }
  // Skip ahead (silently) to the start of the next round.
  function nextRoundInReplay() {
    const r = view.round; view.silent = true;
    let n = 0;
    while (view.round === r && view.phase !== 'matchEnd' && n++ < 120 * 600) view.update(WORLD.step);
    view.silent = false; view.fx.clear();
  }
  function changeSpeed(d) { viewSpeed = clamp(viewSpeed + d, 0, SPEEDS.length - 1); }
  function saveReplay() {
    if (mode === 'play' && game.phase === 'matchEnd' && game.recValid) { Replay.save(game); game.replaySavedT = game.clock; }
  }

  function play(p1, p2, setup) { Arena.override = setup && setup.training ? 'square' : null; game.start(p1, p2, setup); mode = 'play'; Menu.hideAll(); }
  function training(dev, charId) { play(dev, 'dummy', { training: true, chars: [charId, 'standard'] }); }
  function rematch() { play(game.devices[0], game.devices[1], game.setup); }
  function pause() { if (mode === 'play') { mode = 'paused'; Menu.showPause(); } }
  function resume() { mode = 'play'; Menu.hideAll(); }
  function quit() { game.active = false; Arena.override = null; attract = null; mode = 'menu'; Menu.showMenu(); }

  window.LUNGE = { get game() { return game; }, get attract() { return attract; } };   // for debugging in the browser console

  Menu.init({ onPlay: play, onResume: resume, onRestart: rematch, onQuit: quit, onReplay: watch, onTraining: training });
  Menu.showMenu();

  // Keyboard shortcuts
  window.addEventListener('keydown', e => {
    if (mode === 'replay') {
      if (e.code === 'Escape') exitReplay();
      else if (e.code === 'Space') viewPaused = !viewPaused;
      else if (e.code === 'ArrowRight') changeSpeed(1);
      else if (e.code === 'ArrowLeft') changeSpeed(-1);
      else if (e.code === 'KeyN') nextRoundInReplay();
      else if (e.code === 'Enter' && view.phase === 'matchEnd') watch(viewFile);
      return;
    }
    if (mode === 'play' && game.phase === 'replay' && (e.code === 'Enter' || e.code === 'Space')) { game.skipReplay(); return; }
    if (e.code === 'KeyS') { saveReplay(); return; }
    if (e.code === 'Escape') {
      if (mode === 'play') { if (game.phase === 'matchEnd') quit(); else pause(); }
      else if (mode === 'paused') { if (Menu.current() === 'settings') Menu.closeSettings(); else resume(); }
      else if (Menu.current() !== 'menu') Menu.showMenu();
    } else if (e.code === 'KeyC' && mode === 'play' && game.phase === 'matchEnd') {
      const json = JSON.stringify(game.mstats.toJSON(game), null, 2);
      try { navigator.clipboard.writeText(json).then(() => { game.statsCopiedT = game.clock; }, () => window.prompt('Copy these stats:', json)); }
      catch (err) { window.prompt('Copy these stats:', json); }
    } else if (e.code === 'KeyM' && mode === 'play') {
      game.fx.text(Arena.center().x, Arena.bounds().y + 40, Sound.toggleMute() ? 'SOUND OFF' : 'SOUND ON', '#c5ccd9', 18);
    } else if (e.code === 'Enter') {
      if (mode === 'play' && game.phase === 'matchEnd') rematch();
      else if (mode === 'menu' && (Menu.current() === 'menu' || Menu.current() === 'exhibition')) Menu.clickPlay();
    }
  });

  // Gamepad menu buttons: Start = play / pause / resume, A = rematch, B = back from pause
  const prevButtons = {}, stickDir = {}, stickNext = {};
  function pollPadButtons() {
    for (const p of Input.getPads()) {
      const prev = prevButtons[p.index] || [];
      const now = p.buttons.map(b => b.pressed);
      const edge = i => now[i] && !prev[i];
      prevButtons[p.index] = now;
      if (mode === 'replay') {   // A pause · LB/RB speed · Y next round · B exit · A at the end = watch again
        if (edge(1)) exitReplay();
        else if (edge(0)) { if (view.phase === 'matchEnd') watch(viewFile); else viewPaused = !viewPaused; }
        else if (edge(4)) changeSpeed(-1);
        else if (edge(5)) changeSpeed(1);
        else if (edge(3)) nextRoundInReplay();
        continue;
      }
      if (mode === 'play' && game.phase === 'replay' && (edge(0) || edge(9))) { game.skipReplay(); continue; }
      if (edge(3)) saveReplay();
      if (edge(9)) {
        if (mode === 'play') { if (game.phase === 'matchEnd') rematch(); else pause(); }
        else if (mode === 'paused') resume();
        else if (Menu.current() === 'menu' || Menu.current() === 'exhibition') Menu.clickPlay();
      }
      if (edge(0) && mode === 'play' && game.phase === 'matchEnd') rematch();
      if (edge(1) && mode === 'play' && game.phase === 'matchEnd') quit();
      if (mode === 'menu' || mode === 'paused') {
        // menus: D-pad or left stick moves (stick repeats while held), A selects, B goes back
        let d = edge(12) ? 'u' : edge(13) ? 'd' : edge(14) ? 'l' : edge(15) ? 'r' : null;
        const ax = p.axes[0] || 0, ay = p.axes[1] || 0, t = performance.now();
        const sd = Math.max(Math.abs(ax), Math.abs(ay)) > 0.6 ? (Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'r' : 'l') : (ay > 0 ? 'd' : 'u')) : null;
        if (sd && (sd !== stickDir[p.index] || t >= (stickNext[p.index] || 0))) { d = d || sd; stickNext[p.index] = t + (sd !== stickDir[p.index] ? 380 : 130); }
        stickDir[p.index] = sd;
        if (d === 'u') Menu.nav.move(0, -1); else if (d === 'd') Menu.nav.move(0, 1); else if (d) Menu.nav.adjust(d === 'r' ? 1 : -1);
        if (edge(0)) Menu.nav.activate();
        if (edge(1)) Menu.nav.back();
      }
    }
  }

  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    pollPadButtons();
    if (mode === 'play') {
      acc += dt;
      while (acc >= WORLD.step) { game.update(WORLD.step); acc -= WORLD.step; }
    } else if (mode === 'replay') {
      if (!viewPaused) viewAcc += dt * SPEEDS[viewSpeed];
      while (viewAcc >= WORLD.step) { view.update(WORLD.step); viewAcc -= WORLD.step; }
      acc = 0;
    } else {
      acc = 0;
      if (mode === 'menu') {
        if (!attract || (attract.phase === 'matchEnd' && attract.phaseT > 2)) newAttract();
        attractAcc += dt;
        while (attractAcc >= WORLD.step) { attract.update(WORLD.step); attractAcc -= WORLD.step; }
      }
    }
    if (mode === 'menu' && attract) renderer.draw(attract);
    else if (mode === 'replay') {
      renderer.draw(view);
      if (view.phase !== 'matchEnd')
        renderer.drawReplayTag('REPLAY  ' + SPEEDS[viewSpeed] + 'x' + (viewPaused ? '  ·  PAUSED' : ''),
          'Space / (A) pause   ·   ← → / LB RB speed   ·   N / (Y) next round   ·   Esc / (B) exit');
    } else renderer.draw(game);
    // the crowd follows the fight (and goes quiet in menus and pauses)
    if (mode === 'play' && game.active && !game.training) Sound.crowd(game.fx.hype);
    else if (mode === 'replay' && view) Sound.crowd(view.fx.hype);
    else if (mode === 'menu' && attract) Sound.crowd(Math.min(attract.fx.hype, 0.3), 0.4);   // the fight behind the menu: a quiet crowd (capped, so a K.O. doesn't roar)
    else Sound.crowdOff();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
