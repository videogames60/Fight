// menu.js: the HTML overlays: main menu, device pickers, tuning sliders, pause.

const Menu = (() => {
  const $ = id => document.getElementById(id);
  let handlers = null;
  let current = 'menu';
  let settingsReturn = 'menu';

  function show(id) {
    closePicker();
    for (const o of document.querySelectorAll('.overlay')) o.classList.add('hidden');
    current = id;
    if (id) {   // fade / slide in
      const el = $(id);
      el.classList.remove('hidden', 'enter'); void el.offsetWidth; el.classList.add('enter');
    }
  }

  // ---- menu sounds and button "pop" ----
  // Every button click: a small punch thump and a quick pop animation. Fight / Training: a crowd pop.
  if (typeof document !== 'undefined') {
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('button');
      if (!b || !b.closest('.overlay')) return;
      Sound.play(b.id === 'btnPlay' || b.id === 'btnTraining' ? 'crowd_pop' : /Back|Quit/.test(b.id) ? 'ui_back' : 'ui_select');
      b.classList.remove('pressed'); void b.offsetWidth; b.classList.add('pressed');
    }, true);
    document.addEventListener('mouseover', e => {
      const b = e.target.closest && e.target.closest('button');
      if (b && b.closest('.overlay') && !b.disabled && b !== lastHover) Sound.play('ui_move');
      lastHover = b;
    });
  }
  let lastHover = null;

  // ---- device pickers ----
  function deviceOptions() {
    const opts = [['kbm', 'Keyboard + Mouse'], ['kb2', 'Keyboard: arrows (auto-aim)'], ['cpu', 'CPU']];
    for (const p of Input.getPads()) opts.push(['pad:' + p.index, `Gamepad ${p.index + 1}: ${p.id.slice(0, 34)}`]);
    return opts;
  }

  function refreshDevices() {
    const defaults = { p1dev: 'kbm', p2dev: 'cpu' };
    for (const id of ['p1dev', 'p2dev']) {
      const sel = $(id);
      const prev = sel.value || defaults[id];
      sel.innerHTML = '';
      for (const [v, label] of deviceOptions()) {
        const o = document.createElement('option');
        o.value = v; o.textContent = label;
        sel.appendChild(o);
      }
      sel.value = [...sel.options].some(o => o.value === prev) ? prev : defaults[id];
    }
  }

  // ---- tuning sliders, generated from CONFIG_SCHEMA ----
  function fmt(v, step) {
    if (typeof v === 'boolean') return v ? 'on' : 'off';
    const dec = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
    return Number(v).toFixed(dec);
  }

  function buildSettings() {
    const root = $('settingsList');
    root.innerHTML = '';
    let list = root, legacyBox = null;
    for (const s of CONFIG_SCHEMA) {
      if (s.type === 'hidden') continue;     // set elsewhere (e.g. arena is on the main menu)
      if (s.group) {
        if (s.legacy && !legacyBox) {
          // Settings for systems the current game doesn't use: tucked away, still tunable.
          legacyBox = document.createElement('details');
          legacyBox.className = 'legacy';
          const sum = document.createElement('summary');
          sum.textContent = 'Legacy / experimental settings (not used by the current game)';
          legacyBox.appendChild(sum);
          root.appendChild(legacyBox);
          list = legacyBox;
        }
        const h = document.createElement('h3');
        h.textContent = s.group;
        list.appendChild(h);
        continue;
      }
      const row = document.createElement('div');
      row.className = 'setting';
      const label = document.createElement('span');
      label.textContent = s.label;
      const val = document.createElement('span');
      val.className = 'val';
      val.textContent = fmt(CONFIG[s.key], s.step);
      const input = document.createElement('input');
      if (s.type === 'bool') {
        input.type = 'checkbox';
        input.checked = CONFIG[s.key];
        input.addEventListener('change', () => { CONFIG[s.key] = input.checked; val.textContent = fmt(input.checked); saveConfig(); });
      } else {
        input.type = 'range';
        input.min = s.min; input.max = s.max; input.step = s.step;
        input.value = CONFIG[s.key];
        input.addEventListener('input', () => {
          CONFIG[s.key] = parseFloat(input.value);
          val.textContent = fmt(CONFIG[s.key], s.step);
          saveConfig();
        });
      }
      row.append(label, input, val);
      list.appendChild(row);
    }
  }

  function openSettings(from) {
    settingsReturn = from;
    buildSettings();
    show('settings');
  }

  function closeSettings() {
    if (settingsReturn === 'pause') show('pause'); else showMenu();
  }

  async function copySettings() {
    const json = JSON.stringify(CONFIG, null, 2);
    try { await navigator.clipboard.writeText(json); $('btnSettingsCopy').textContent = 'Copied!'; }
    catch (e) { window.prompt('Copy these settings:', json); }
    setTimeout(() => { $('btnSettingsCopy').textContent = 'Copy as JSON'; }, 1200);
  }

  function pasteSettings() {
    const raw = window.prompt('Paste settings JSON:');
    if (!raw) return;
    try { applyConfigObject(JSON.parse(raw)); saveConfig(); buildSettings(); }
    catch (e) { window.alert('That is not valid settings JSON.'); }
  }

  // ---- wiring ----
  function init(h) {
    handlers = h;
    $('btnPlay').addEventListener('click', clickPlay);
    $('btnExhibition').addEventListener('click', showExhibition);
    $('tagMode').addEventListener('change', () => { sel.tag = $('tagMode').checked; saveSel(); buildSide(0); buildSide(1); });
    $('noDQ').addEventListener('change', () => { CONFIG.noDQ = $('noDQ').checked; saveConfig(); });
    $('apronBrawl').addEventListener('change', () => { CONFIG.apronBrawl = $('apronBrawl').checked; saveConfig(); });
    // Training: your controls and character from the Exhibition screen (a CPU slot falls back to a pad or keyboard).
    $('btnTraining').addEventListener('click', () => {
      refreshDevices();
      let dev = $('p1dev').value;
      if (dev === 'cpu') dev = Input.getPads().length ? 'pad:' + Input.getPads()[0].index : 'kbm';
      handlers.onTraining(dev, sel.chars[0]);
    });
    $('btnExBack').addEventListener('click', showMenu);
    for (const i of [0, 1]) {
      const n = i + 1;
      $('p' + n + 'dev').addEventListener('change', () => buildSide(i));
      $('p' + n + 'style').addEventListener('change', () => { sel.styles[i] = $('p' + n + 'style').checked; saveSel(); });
      $('p' + n + 'pdev').addEventListener('change', () => { sel.pdev[i] = $('p' + n + 'pdev').value; saveSel(); buildSide(i); });
      $('p' + n + 'diff').addEventListener('input', () => { sel.levels[i] = parseFloat($('p' + n + 'diff').value); saveSel(); buildSide(i); });
    }
    $('btnSettings').addEventListener('click', () => openSettings('menu'));
    $('btnControls').addEventListener('click', () => show('controls'));
    // Replays: pick a saved replay file and hand it to main.js to play.
    $('btnReplays').addEventListener('click', () => $('replayFile').click());
    $('replayFile').addEventListener('change', e => {
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      file.text().then(t => {
        let data = null; try { data = JSON.parse(t); } catch (err) {}
        if (!Replay.valid(data)) { alert('That file is not a Title Fight replay.'); return; }
        handlers.onReplay(data);
      });
    });
    $('btnControlsBack').addEventListener('click', showMenu);
    $('btnSettingsBack').addEventListener('click', closeSettings);
    $('btnSettingsReset').addEventListener('click', () => { resetConfig(); saveConfig(); buildSettings(); });
    $('btnSettingsCopy').addEventListener('click', copySettings);
    $('btnSettingsPaste').addEventListener('click', pasteSettings);
    $('btnResume').addEventListener('click', () => handlers.onResume());
    $('btnPauseSettings').addEventListener('click', () => openSettings('pause'));
    $('btnRestart').addEventListener('click', () => handlers.onRestart());
    $('btnQuit').addEventListener('click', () => handlers.onQuit());
    $('arenaSel').addEventListener('change', () => { CONFIG.arena = $('arenaSel').value; saveConfig(); });
    $('moveMode').addEventListener('change', () => { applyMovePreset($('moveMode').value); saveConfig(); });
    window.addEventListener('gamepadconnected', () => { refreshDevices(); if (current === 'exhibition') { buildSide(0); buildSide(1); } });
    window.addEventListener('gamepaddisconnected', refreshDevices);
  }

  // ---- exhibition: character select ----
  const SELECT_KEY = 'lunge-select-v1';
  let sel = { chars: ['standard', 'standard'], levels: [0.6, 0.6], styles: [false, false], tag: false, chars2: ['standard', 'standard'], pdev: ['same', 'same'] };
  try { const raw = localStorage.getItem(SELECT_KEY); if (raw) Object.assign(sel, JSON.parse(raw)); } catch (e) {}
  const saveSel = () => { try { localStorage.setItem(SELECT_KEY, JSON.stringify(sel)); } catch (e) {} };

  // A little top-down portrait of a character (drawn by looks.js, so it matches the game).
  function portrait(id) {
    const c = document.createElement('canvas'); c.width = c.height = 80;
    BoxerArt.preview(c, id);
    return c;
  }

  // Name on top, playstyle under it.
  function nameTag(id) {
    const d = document.createElement('span'); d.className = 'nametag';
    d.innerHTML = `<b>${CHARACTERS[id].name}</b><small>${CHARACTERS[id].style || ''}</small>`;
    return d;
  }

  function buildSide(i) {
    const n = i + 1, box = $('p' + n + 'chars');
    box.innerHTML = '';
    for (const id in CHARACTERS) {
      const b = document.createElement('button');
      b.className = 'char-btn' + (sel.chars[i] === id ? ' selected' : '');
      b.appendChild(portrait(id)); b.appendChild(nameTag(id));
      b.dataset.nav = `p${n}-${id}`;
      b.addEventListener('click', () => { sel.chars[i] = id; saveSel(); buildSide(i); });
      box.appendChild(b);
    }
    if (!CHARACTERS[sel.chars[i]]) sel.chars[i] = 'standard';
    $('p' + n + 'blurb').textContent = CHARACTERS[sel.chars[i]].blurb;
    const list = $('p' + n + 'trades');
    list.innerHTML = '';
    for (const t of describeTrades(sel.chars[i])) {
      const li = document.createElement('li');
      li.textContent = t.text;
      li.className = t.good ? 'good' : 'bad';
      list.appendChild(li);
    }
    const isCpu = $('p' + n + 'dev').value === 'cpu';
    $('p' + n + 'diffRow').style.display = isCpu || (sel.tag && sel.pdev[i] === 'cpu') ? '' : 'none';   // also sets a CPU partner's skill
    $('p' + n + 'styleRow').style.display = isCpu ? '' : 'none';
    $('p' + n + 'style').checked = !!sel.styles[i];
    // tag team: partner character + who controls the partner
    $('tagMode').checked = !!sel.tag;
    $('noDQRow').style.display = sel.tag ? '' : 'none';
    $('noDQ').checked = !!CONFIG.noDQ;
    $('brawlRow').style.display = sel.tag ? '' : 'none';
    $('apronBrawl').checked = !!CONFIG.apronBrawl;
    $('p' + n + 'partner').style.display = sel.tag ? '' : 'none';
    if (sel.tag) {
      const box2 = $('p' + n + 'chars2'); box2.innerHTML = '';
      if (!CHARACTERS[sel.chars2[i]]) sel.chars2[i] = 'standard';
      for (const id in CHARACTERS) {
        const b = document.createElement('button');
        b.className = 'char-btn' + (sel.chars2[i] === id ? ' selected' : '');
        b.appendChild(portrait(id)); b.appendChild(nameTag(id));
        b.dataset.nav = `p${n}b-${id}`;
        b.addEventListener('click', () => { sel.chars2[i] = id; saveSel(); buildSide(i); });
        box2.appendChild(b);
      }
      $('p' + n + 'blurb2').textContent = CHARACTERS[sel.chars2[i]].blurb;
      const list2 = $('p' + n + 'trades2'); list2.innerHTML = '';
      for (const t of describeTrades(sel.chars2[i])) {
        const li = document.createElement('li'); li.textContent = t.text; li.className = t.good ? 'good' : 'bad'; list2.appendChild(li);
      }
      const pd = $('p' + n + 'pdev'); pd.innerHTML = '';
      const opts = [['same', isCpu ? 'CPU (same skill)' : 'Same controller (you play both)'], ['cpu', 'CPU partner']]
        .concat(deviceOptions().filter(([v]) => v !== 'cpu').map(([v, l]) => [v, 'Another player: ' + l]));
      for (const [v, l] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = l; pd.appendChild(o); }
      pd.value = opts.some(o => o[0] === sel.pdev[i]) ? sel.pdev[i] : 'same';
    }
    $('p' + n + 'diff').value = sel.levels[i];
    $('p' + n + 'diffVal').textContent = Math.round(sel.levels[i] * 100) + '%';
  }

  function showExhibition() {
    refreshDevices();
    const a = $('arenaSel');
    if (!a.options.length) for (const k in ARENAS) { const o = document.createElement('option'); o.value = k; o.textContent = ARENAS[k].label; a.appendChild(o); }
    a.value = ARENAS[CONFIG.arena] ? CONFIG.arena : 'ring';
    buildSide(0); buildSide(1);
    show('exhibition');
  }

  // From the main menu: open character select. From character select: fight.
  function clickPlay() {
    if (current !== 'exhibition') { showExhibition(); return; }
    // CPUs use the Standard brain unless "fighting style" is ticked (personalities are mainly for the Ladder).
    const aiChars = [0, 1].map(i => sel.styles[i] ? sel.chars[i] : 'standard');
    const tag = sel.tag ? { chars2: sel.chars2.slice(), partners: sel.pdev.slice(), aiChars2: [0, 1].map(i => sel.styles[i] ? sel.chars2[i] : 'standard') } : undefined;
    handlers.onPlay($('p1dev').value, $('p2dev').value, { chars: sel.chars.slice(), levels: sel.levels.slice(), aiChars, tag });
  }
  function showMenu() {
    refreshDevices();
    $('moveMode').value = currentMovePreset();
    show('menu');
  }
  function showPause() { show('pause'); }
  function hideAll() { show(null); }

  // ---- gamepad navigation of the menus ----
  // D-pad / left stick moves between the controls of the open screen (nearest one in that direction),
  // A activates (button click, checkbox toggle, dropdown next option), left/right change dropdowns
  // and sliders, B goes back. The focused control gets a gold ring (.padfocus).
  function focusables() {
    if (!current) return [];
    return [...$(current).querySelectorAll('button, select, input')]
      .filter(el => !el.disabled && el.type !== 'file' && el.offsetParent !== null);
  }
  let padEl = null;
  function setPadFocus(el) {
    if (padEl) padEl.classList.remove('padfocus');
    padEl = el;
    if (el) { el.classList.add('padfocus'); el.focus({ preventScroll: false }); el.scrollIntoView({ block: 'nearest' }); }
  }
  function currentPadEl() {
    const els = focusables();
    if (padEl && els.includes(padEl)) return padEl;
    const pick = els.find(e => e.classList.contains('primary')) || els[0] || null;
    setPadFocus(pick);
    return null;   // the first press just shows where you are
  }
  function navMove(dx, dy) {
    if (picker) { if (dy) pickerMove(dy); return; }
    const cur = currentPadEl(); if (!cur) return;
    const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of focusables()) {
      if (el === cur) continue;
      const q = el.getBoundingClientRect(), vx = q.left + q.width / 2 - cx, vy = q.top + q.height / 2 - cy;
      const along = vx * dx + vy * dy, perp = Math.abs(vx * dy - vy * dx);
      if (along <= 4) continue;
      const score = along + perp * 1.2;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) { setPadFocus(best); Sound.play('ui_move'); }
  }
  function navAdjust(dir) {
    if (picker) return;
    const el = currentPadEl(); if (!el) return;
    if (el.tagName === 'SELECT') {
      const n = el.options.length; let k = el.selectedIndex;
      for (let tries = 0; tries < n; tries++) { k = (k + dir + n) % n; if (!el.options[k].disabled) break; }
      el.selectedIndex = k; el.dispatchEvent(new Event('change'));
    } else if (el.type === 'range') {
      const st = parseFloat(el.step) || 1;
      el.value = clamp(parseFloat(el.value) + dir * st, parseFloat(el.min), parseFloat(el.max));
      el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change'));
    } else navMove(dir, 0);
  }
  function navActivate() {
    if (picker) { pickerChoose(); return; }
    const el = currentPadEl(); if (!el) return;
    if (el.tagName === 'SELECT') { openPicker(el); return; }
    if (el.type === 'range') return;
    const key = el.dataset.nav;   // screens that rebuild their buttons: find the same one again
    el.click();
    if (key) { const again = focusables().find(e => e.dataset.nav === key); if (again) setPadFocus(again); }
  }
  function navBack() {
    if (picker) { closePicker(); Sound.play('ui_back'); return; }
    if (current !== 'menu') Sound.play('ui_back');
    if (current === 'exhibition') $('btnExBack').click();
    else if (current === 'settings') closeSettings();
    else if (current === 'controls') showMenu();
    else if (current === 'pause') $('btnResume').click();
  }
  // A dropdown opened with the gamepad: browsers don't let a script open the real list, so we show our
  // own under it. Up/down moves, A picks, B cancels. (Mouse users get the normal dropdown.)
  let picker = null;
  function openPicker(sel) {
    closePicker();
    const r = sel.getBoundingClientRect(), wrap = $('wrap').getBoundingClientRect();
    const div = document.createElement('div');
    div.className = 'pad-picker';
    [...sel.options].forEach((o, k) => {
      const it = document.createElement('div');
      it.className = 'opt' + (o.disabled ? ' disabled' : '');
      it.textContent = o.textContent;
      it.addEventListener('click', () => { if (!o.disabled) { picker.idx = k; pickerChoose(); } });
      div.appendChild(it);
    });
    div.style.left = (r.left - wrap.left) + 'px';
    div.style.minWidth = r.width + 'px';
    const below = wrap.bottom - r.bottom;
    if (below > 220 || below > r.top - wrap.top) div.style.top = (r.bottom - wrap.top + 4) + 'px';
    else div.style.bottom = (wrap.bottom - r.top + 4) + 'px';
    $('wrap').appendChild(div);
    picker = { sel, div, idx: sel.selectedIndex };
    pickerShow();
    Sound.play('ui_select');
  }
  function pickerShow() {
    [...picker.div.children].forEach((c, k) => c.classList.toggle('hl', k === picker.idx));
    const c = picker.div.children[picker.idx]; if (c) c.scrollIntoView({ block: 'nearest' });
  }
  function pickerMove(d) {
    const n = picker.sel.options.length;
    let k = picker.idx;
    for (let t = 0; t < n; t++) { k = (k + d + n) % n; if (!picker.sel.options[k].disabled) break; }
    picker.idx = k; pickerShow(); Sound.play('ui_move');
  }
  function pickerChoose() {
    const { sel, idx } = picker;
    closePicker();
    if (sel.selectedIndex !== idx) { sel.selectedIndex = idx; sel.dispatchEvent(new Event('change')); }
    Sound.play('ui_select');
    setPadFocus(sel);
  }
  function closePicker() { if (picker) { picker.div.remove(); picker = null; } }

  if (typeof window !== 'undefined') window.addEventListener('mousemove', () => { if (padEl) { padEl.classList.remove('padfocus'); padEl = null; } });

  return { init, showMenu, showPause, hideAll, clickPlay, closeSettings, refreshDevices, current: () => current,
           nav: { move: navMove, adjust: navAdjust, activate: navActivate, back: navBack } };
})();
