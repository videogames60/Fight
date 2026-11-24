// stats.js: per-player match stats, shown on the post-match screen (and copyable as JSON with C).
// game.js calls the record* methods; fighters report steps/plants/feints/whiffs through their events.

class MatchStats {
  constructor() { this.p = [MatchStats.blank(), MatchStats.blank()]; }

  static blank() {
    const tri = () => ({ light: 0, medium: 0, heavy: 0 });
    return {
      thrown: tri(), landed: tri(), whiffed: tri(),
      damage: 0, counters: 0,
      gotBlocked: 0, blocks: 0, parries: 0, gotParried: 0, guardBreaks: 0,
      steps: 0, feints: 0, plants: 0,
      advancing: 0, retreating: 0, circling: 0, still: 0,   // seconds
      staminaSpent: 0,
    };
  }

  // Running totals the judges use (game.js takes the difference over one round).
  static judgeTotals(s) {
    return { damage: s.damage, cleanHits: s.landed.light + s.landed.medium + s.landed.heavy,
             forward: s.advancing, blocksParries: s.blocks + s.parries };
  }

  thrown(f)                 { this.p[f.index].thrown[f.atk.kind]++; }
  whiffed(f)                { this.p[f.index].whiffed[f.atk.kind]++; }
  landed(att, dmg, counter) { const s = this.p[att.index]; s.landed[att.atk.kind]++; s.damage += dmg; if (counter) s.counters++; }
  armorDamage(def, dmg)     { this.p[def.index ^ 1].damage += dmg; }
  blocked(att, def)         { this.p[att.index].gotBlocked++; this.p[def.index].blocks++; }
  parried(att, def)         { this.p[att.index].gotParried++; this.p[def.index].parries++; }
  guardBreak(att, dmg)      { const s = this.p[att.index]; s.guardBreaks++; s.damage += dmg; }
  event(f, name)            { const s = this.p[f.index]; if (name === 'step') s.steps++; else if (name === 'feint') s.feints++; else if (name === 'plant') s.plants++; }

  // Called every fight step: how each player is moving relative to the other.
  trackMovement(dt, fighters) {
    for (const f of fighters) {
      const o = fighters[f.index ^ 1], s = this.p[f.index];
      const sp = f.speed;
      if (sp < 40) { s.still += dt; continue; }
      const dx = o.x - f.x, dy = o.y - f.y, d = Math.hypot(dx, dy) || 1;
      const dot = (f.mvx * dx + f.mvy * dy) / (sp * d);
      if (dot > 0.3) s.advancing += dt; else if (dot < -0.3) s.retreating += dt; else s.circling += dt;
    }
  }

  finish(fighters) {
    fighters.forEach(f => { this.p[f.index].staminaSpent = Math.round(f.spentTotal); });
  }

  // Rows for the post-match screen: [label, p1 value, p2 value]
  rows(wins) {
    const [a, b] = this.p;
    const lt = (s, k) => `${s.landed[k]} / ${s.thrown[k]}`;
    const sum = o => o.light + o.medium + o.heavy;
    const pct = s => {
      const t = s.advancing + s.retreating + s.circling + s.still || 1;
      return `${Math.round(100 * s.advancing / t)} / ${Math.round(100 * s.retreating / t)} / ${Math.round(100 * s.circling / t)}`;
    };
    return [
      ['Rounds won', wins[0], wins[1]],
      ['Damage dealt', a.damage, b.damage],
      ['Light: landed / thrown', lt(a, 'light'), lt(b, 'light')],
      ['Medium: landed / thrown', lt(a, 'medium'), lt(b, 'medium')],
      ['Heavy: landed / thrown', lt(a, 'heavy'), lt(b, 'heavy')],
      ['Whiffs', sum(a.whiffed), sum(b.whiffed)],
      ['Counter hits', a.counters, b.counters],
      ['Blocks', a.blocks, b.blocks],
      ['Got blocked', a.gotBlocked, b.gotBlocked],
      ['Parries', a.parries, b.parries],
      ['Got parried', a.gotParried, b.gotParried],
      ['Guard breaks', a.guardBreaks, b.guardBreaks],
      ['Steps / feints / plants', `${a.steps} / ${a.feints} / ${a.plants}`, `${b.steps} / ${b.feints} / ${b.plants}`],
      ['Moving in / back / around (% of time)', pct(a), pct(b)],
      ['Stamina spent', a.staminaSpent, b.staminaSpent],
    ];
  }

  toJSON(game) {
    return {
      winner: game.matchWinner + 1,
      rounds: game.wins,
      devices: game.devices,
      characters: game.setup ? game.setup.chars : ['standard', 'standard'],
      movement: currentMovePreset(),
      players: this.p.map(s => ({ ...s, advancing: +s.advancing.toFixed(1), retreating: +s.retreating.toFixed(1), circling: +s.circling.toFixed(1), still: +s.still.toFixed(1) })),
    };
  }
}
