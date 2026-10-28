import { describe, expect, it } from 'vitest';
import { guardBlocks } from '../src/systems/combat';
import { PARRY_WINDOW } from '../src/entities/player';
import { GROUND_Y } from '../src/world/city';
import { Rng } from '../src/core/rng';
import { CivGroup, Civilian } from '../src/entities/civilian';
import { addGuard, placePlayer, run, testWorld } from './helpers';

describe('assassination', () => {
  it('kills an unaware guard from behind silently', () => {
    const { world, input } = testWorld();
    const g = addGuard(world, 'guard', 1000, 1);
    placePlayer(world, 975);
    world.player.facing = 1;
    input.press('attack');
    run(world, input, 0.6);
    expect(g.alive).toBe(false);
    expect(world.save.stats.assassinations).toBe(1);
    expect(world.combatActive).toBe(false);
  });

  it('kills a guard from above with an air assassination', () => {
    const { world, input } = testWorld();
    const g = addGuard(world, 'guard', 1000, 1);
    placePlayer(world, 1010, GROUND_Y - 150);
    world.player.setState('air');
    run(world, input, 0.05);
    input.press('attack');
    run(world, input, 1);
    expect(g.alive).toBe(false);
    expect(world.save.stats.assassinations).toBe(1);
  });

  it('counts targets and opens the gate to the grand master when all are dead', () => {
    const { world, input } = testWorld();
    world.city.bossGate = { x: 3000, y: GROUND_Y };
    world.city.targets.push({ id: 'tx', name: 'X', title: 'テスト', desc: '', district: 0 });
    const t = addGuard(world, 'target', 1000, 1);
    Object.assign(t, { targetId: 'tx' });
    placePlayer(world, 975);
    input.press('attack');
    run(world, input, 0.6);
    expect(world.save.targetsKilled).toEqual(['tx']);
    // Six targets are no longer the end: the gate opens and the marker points at it.
    expect(world.save.complete).toBe(false);
    expect(world.gateOpen).toBe(true);
    expect(world.marker).toEqual({ x: 3000, y: GROUND_Y });
  });
});

describe('melee', () => {
  it('parries an attack inside the window and blocks after it', () => {
    const { world } = testWorld();
    const p = world.player;
    placePlayer(world, 1000);
    p.facing = 1;
    p.setState('guard');
    p.stateT = PARRY_WINDOW / 2;
    expect(p.receiveHit(world, 1030, 2)).toBe('parry');
    p.stateT = PARRY_WINDOW + 0.1;
    expect(p.receiveHit(world, 1030, 2)).toBe('block');
    expect(p.receiveHit(world, 1030, 3, { unblockable: true })).toBe('hit');
    expect(p.hp).toBe(world.playerStats.maxHp - 3);
  });

  it('dodge rolls avoid damage', () => {
    const { world, input } = testWorld();
    placePlayer(world, 1000);
    input.press('dodge');
    run(world, input, 0.05);
    expect(world.player.state).toBe('dodge');
    expect(world.player.receiveHit(world, 1030, 2)).toBe('miss');
  });

  it('a parried guard can be countered instantly', () => {
    const { world, input } = testWorld();
    const g = addGuard(world, 'elite', 1035, -1);
    placePlayer(world, 1000);
    world.player.facing = 1;
    g.setState('combat');
    g.state = 'staggered';
    g.parried = true;
    g.staggerT = 1;
    input.press('attack');
    run(world, input, 0.5);
    expect(g.alive).toBe(false);
  });

  it('elite guards block light blows from the front but not finishers', () => {
    const { world } = testWorld();
    const g = addGuard(world, 'elite', 1000, -1);
    g.setState('combat');
    expect(guardBlocks(g, 960, 0, 0.1)).toBe(true);
    expect(guardBlocks(g, 960, 2, 0.1)).toBe(false);
    expect(guardBlocks(g, 1040, 0, 0.1)).toBe(false);
    const basic = addGuard(world, 'guard', 1000, -1);
    basic.setState('combat');
    expect(guardBlocks(basic, 960, 0, 0.1)).toBe(false);
  });

  it('a three-hit combo kills a basic guard', () => {
    const { world, input } = testWorld();
    const g = addGuard(world, 'guard', 1030, -1);
    g.setState('combat');
    placePlayer(world, 1000);
    world.player.facing = 1;
    run(world, input, 2, (t) => {
      if (Math.round(t * 60) % 8 === 0) input.press('attack');
      g.attack.phase = 'none';
    });
    expect(g.alive).toBe(false);
  });

  it('killing civilians is punished, three kills ends the life', () => {
    const { world } = testWorld();
    const rng = new Rng(1);
    const group = new CivGroup(1, 30, 0, 3000, rng);
    const civs = [0, 1, 2].map((i) => new Civilian(1100 + i * 10, GROUND_Y, group, rng));
    world.civilians.push(...civs);
    placePlayer(world, 1000);
    world.killCivilian(civs[0]);
    expect(world.save.stats.civilianKills).toBe(1);
    expect(world.player.dead).toBe(false);
    world.killCivilian(civs[1]);
    world.killCivilian(civs[2]);
    expect(world.player.dead).toBe(true);
  });
});
