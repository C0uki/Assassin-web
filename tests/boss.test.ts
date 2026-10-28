import { afterEach, describe, expect, it, vi } from 'vitest';
import { Input } from '../src/core/input';
import { eagleGold } from '../src/render/eagleVision';
import { COUNTER_DAMAGE, PHASE_FLOOR, STEALTH_DAMAGE, WAVES } from '../src/systems/boss';
import { hasFloorAt } from '../src/systems/physics';
import { SAVE_KEY, loadSave, newSave } from '../src/systems/progress';
import { ARENA, BOSS_GATE_TX, GROUND_ROW, GROUND_Y, TARGETS, buildArena, buildCity } from '../src/world/city';
import { TILE } from '../src/world/tilemap';
import { World } from '../src/world/world';
import { BossBot } from './bossBot';
import { DT, placePlayer, run } from './helpers';

const FNV_BEFORE = 1323749479;

function arena(): { w: World; input: Input } {
  return { w: new World(buildArena(), newSave(), null, 'boss'), input: new Input() };
}

/** Skip the intro and leave the boss in plain combat. */
function engaged(): { w: World; input: Input } {
  const r = arena();
  placePlayer(r.w, (ARENA.bossX - 6) * TILE);
  run(r.w, r.input, 0.1);
  expect(r.w.boss!.script).toBeNull();
  return r;
}

/** Push the fight into a phase by draining his health to its start and waiting out the transition. */
function toPhase(w: World, input: Input, phase: 2 | 3): void {
  const f = w.boss!;
  while (f.phase < phase) {
    f.damage(f.boss, f.boss.hp - PHASE_FLOOR[f.phase], 'combat');
    run(w, input, 2);
    f.script = null;
  }
}

function seeded(seed: number): void {
  let s = seed;
  vi.spyOn(Math, 'random').mockImplementation(() => (s = (s * 16807) % 2147483647) / 2147483647);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the arena', () => {
  it('has floor under the start, the boss and the balcony', () => {
    const c = buildArena();
    expect(hasFloorAt(c.map, c.start!.x, GROUND_Y - 1)).toBe(true);
    expect(hasFloorAt(c.map, ARENA.bossX * TILE, GROUND_Y - 1)).toBe(true);
    const by = (GROUND_ROW - ARENA.balconyH) * TILE;
    expect(hasFloorAt(c.map, (ARENA.belfry.tx + 3) * TILE, by - 1)).toBe(true);
    expect(c.guards.filter((g) => g.kind === 'boss')).toHaveLength(1);
  });

  it('leaves the city tiles exactly as they were', () => {
    // FNV-1a over every tile; the value was taken from the city before the duel was added.
    let hash = 0x811c9dc5;
    for (const t of buildCity().map.data) hash = Math.imul(hash ^ t, 0x01000193) >>> 0;
    expect(hash).toBe(FNV_BEFORE);
  });
});

describe('the gate', () => {
  it('opens in town once every target is dead, and F in front of it asks for the duel', () => {
    const save = newSave();
    save.targetsKilled = TARGETS.map((t) => t.id);
    const w = new World(buildCity(), save, null);
    const input = new Input();
    expect(w.gateOpen).toBe(true);
    expect(w.marker).toEqual({ x: BOSS_GATE_TX * TILE, y: GROUND_Y });
    placePlayer(w, BOSS_GATE_TX * TILE);
    input.press('interact');
    run(w, input, 0.05);
    expect(w.enterBossRequested).toBe(true);
  });

  it('stays shut while a target lives', () => {
    const save = newSave();
    save.targetsKilled = TARGETS.slice(1).map((t) => t.id);
    const w = new World(buildCity(), save, null);
    expect(w.gateOpen).toBe(false);
    placePlayer(w, BOSS_GATE_TX * TILE);
    const input = new Input();
    input.press('interact');
    run(w, input, 0.05);
    expect(w.enterBossRequested).toBe(false);
  });
});

describe('saves', () => {
  it('lets an old save that ended at six targets face the grand master', () => {
    const old = { ...newSave(), complete: true } as Partial<ReturnType<typeof newSave>>;
    delete old.bossDefeated;
    const store = new Map([[SAVE_KEY, JSON.stringify(old)]]);
    const loaded = loadSave({ getItem: (k) => store.get(k) ?? null, setItem: () => {}, removeItem: () => {} })!;
    expect(loaded.complete).toBe(false);
    expect(loaded.bossDefeated).toBe(false);
    expect(loaded.stats.bossAttempts).toBe(0);
  });
});

describe('the grand master', () => {
  it('waits until the player walks up, then fights', () => {
    const { w, input } = arena();
    run(w, input, 1);
    expect(w.boss!.script?.kind).toBe('intro');
    placePlayer(w, (ARENA.bossX - 10) * TILE);
    run(w, input, 0.1);
    expect(w.boss!.boss.state).toBe('combat');
  });

  it('stops at each phase floor and takes no damage while changing phase', () => {
    const { w } = engaged();
    const f = w.boss!;
    f.damage(f.boss, 40, 'combat');
    expect(f.boss.hp).toBe(PHASE_FLOOR[1]);
    expect(f.script?.kind).toBe('transition');
    f.damage(f.boss, 10, 'combat');
    expect(f.boss.hp).toBe(PHASE_FLOOR[1]);
  });

  it('cannot have a heavy blow parried', () => {
    const { w, input } = engaged();
    const f = w.boss!;
    const p = w.player;
    placePlayer(w, f.boss.cx - 34);
    f.boss.facing = -1;
    f.startMove(f.boss, 'heavy');
    run(w, input, 0.7);
    input.press('guard');
    run(w, input, 0.2);
    expect(p.hp).toBeLessThan(w.playerStats.maxHp);
    expect(f.boss.state).toBe('combat');
  });

  it('can be parried during a combo and countered for fixed damage', () => {
    const { w, input } = engaged();
    const f = w.boss!;
    placePlayer(w, f.boss.cx - 34);
    w.player.facing = 1;
    f.boss.facing = -1;
    f.startMove(f.boss, 'combo');
    run(w, input, 0.38);
    input.press('guard');
    run(w, input, 0.15);
    expect(f.boss.state).toBe('staggered');
    expect(f.boss.parried).toBe(true);
    input.release('guard');
    run(w, input, 0.05);
    input.press('attack');
    run(w, input, 0.5);
    expect(f.boss.hp).toBe(45 - COUNTER_DAMAGE);
  });

  it('leaps to the balcony in the second phase and sends minions', () => {
    const { w, input } = engaged();
    toPhase(w, input, 2);
    const f = w.boss!;
    run(w, input, 3);
    expect(f.onBalcony(f.boss)).toBe(true);
    expect(f.minions.map((m) => m.kind)).toEqual(WAVES[0]);
  });

  it('takes heavy damage from an air assassination on the balcony', () => {
    const { w, input } = engaged();
    toPhase(w, input, 2);
    const f = w.boss!;
    run(w, input, 3);
    for (const m of f.minions) m.passive = true;
    const g = f.boss;
    placePlayer(w, g.cx, g.body.y - 70);
    w.player.setState('air');
    w.player.body.onGround = false;
    input.press('attack');
    run(w, input, 0.6);
    expect(g.hp).toBe(PHASE_FLOOR[1] - STEALTH_DAMAGE[2]);
  });

  it('hides among a crowd with two decoys that only eagle vision tells apart', () => {
    const { w, input } = engaged();
    toPhase(w, input, 3);
    const f = w.boss!;
    expect(w.civilians).toHaveLength(12);
    expect(f.decoys).toHaveLength(2);
    expect(f.boss.state).toBe('patrol');
    expect(w.guards.filter((g) => g.alive && g.kind !== 'boss' && g.kind !== 'decoy')).toHaveLength(0);
    expect(eagleGold(f.boss)).toBe(true);
    expect(f.decoys.some((d) => eagleGold(d))).toBe(false);
  });

  it('strikes back from the crowd when a decoy is cut down, and sends the decoy back later', () => {
    const { w, input } = engaged();
    toPhase(w, input, 3);
    const f = w.boss!;
    const d = f.decoys[0];
    placePlayer(w, d.cx - 30);
    w.killGuard(d, 'combat');
    expect(w.guards.includes(d)).toBe(false);
    expect(f.decoys).toHaveLength(1);
    expect(f.boss.state).toBe('combat');
    expect(f.move?.kind).toBe('lunge');
    run(w, input, 10.5);
    expect(f.decoys.filter((x) => x.alive)).toHaveLength(2);
  });

  it('loses a chunk of health to a back assassination in the crowd and scatters', () => {
    const { w, input } = engaged();
    toPhase(w, input, 3);
    const f = w.boss!;
    const g = f.boss;
    g.facing = 1;
    placePlayer(w, g.cx - 30);
    w.player.facing = 1;
    input.press('attack');
    run(w, input, DT * 3);
    run(w, input, 0.5);
    expect(g.hp).toBe(PHASE_FLOOR[2] - STEALTH_DAMAGE[3]);
    expect(g.state).toBe('patrol');
    expect(Math.abs(g.cx - w.player.cx)).toBeGreaterThan(100);
  });

  it('ends the story when he falls', () => {
    const { w, input } = engaged();
    toPhase(w, input, 3);
    const f = w.boss!;
    f.damage(f.boss, 99, 'combat');
    expect(f.boss.alive).toBe(false);
    expect(w.save.bossDefeated).toBe(true);
    expect(w.save.complete).toBe(true);
    run(w, input, 0.5);
    expect(w.victoryT).toBeGreaterThan(0);
  });

  it('does not bring the player back to life in the arena', () => {
    const { w, input } = engaged();
    w.player.damage(w, 999, 0, false);
    run(w, input, 4);
    expect(w.player.dead).toBe(true);
    expect(w.save.stats.deaths).toBe(1);
  });

  it('can be beaten start to finish with real inputs', () => {
    seeded(1);
    const { w, input } = arena();
    const bot = new BossBot(w, input);
    const g = w.boss!.boss;
    const phases: number[] = [];
    for (let i = 0; i < 180 * 60 && g.alive && !w.player.dead; i++) {
      bot.step();
      w.update(input, DT);
      input.endTick();
      if (phases[phases.length - 1] !== w.boss!.phase) phases.push(w.boss!.phase);
    }
    expect(w.player.dead, `died in phase ${w.boss!.phase} with the boss at ${g.hp}`).toBe(false);
    expect(g.alive).toBe(false);
    expect(phases).toEqual([1, 2, 3]);
    expect(w.save.bossDefeated).toBe(true);
  });
});
