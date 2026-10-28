import { describe, expect, it } from 'vitest';
import { Guard } from '../src/entities/guard';
import { PARRY_WINDOW } from '../src/entities/player';
import { enterCombat } from '../src/systems/ai';
import { guardTakesHit } from '../src/systems/combat';
import { GROUND_ROW, GROUND_Y, SPECIALISTS, buildCity } from '../src/world/city';
import { TILE } from '../src/world/tilemap';
import { World } from '../src/world/world';
import { newSave } from '../src/systems/progress';
import { addGuard, building, placePlayer, run, testWorld } from './helpers';

function withHound(world: World, x: number): { handler: Guard; dog: Guard } {
  const handler = addGuard(world, 'guard', x, 1);
  const dog = new Guard('dog', { x: x - 30, y: GROUND_Y, minX: x - 30, maxX: x - 30, facing: 1, district: 0 });
  dog.handler = handler;
  handler.dog = dog;
  world.guards.push(dog);
  return { handler, dog };
}

describe('chaser', () => {
  it('jumps roof gaps to follow the player', () => {
    const { world, input } = testWorld((m) => {
      building(m, 10, 6, 6);
      building(m, 19, 6, 6);
    });
    const roof = (GROUND_ROW - 6) * TILE;
    const c = addGuard(world, 'chaser', 12 * TILE, 1, roof, [11 * TILE, 15 * TILE]);
    placePlayer(world, 23 * TILE, roof);
    enterCombat(c, world, false);
    run(world, input, 2);
    expect(c.cx).toBeGreaterThan(19 * TILE);
    expect(c.feet).toBe(roof);
  });

  it('an ordinary guard stops at the same gap', () => {
    const { world, input } = testWorld((m) => {
      building(m, 10, 6, 6);
      building(m, 19, 6, 6);
    });
    const roof = (GROUND_ROW - 6) * TILE;
    const g = addGuard(world, 'guard', 12 * TILE, 1, roof, [11 * TILE, 15 * TILE]);
    placePlayer(world, 23 * TILE, roof);
    enterCombat(g, world, false);
    run(world, input, 2);
    expect(g.cx).toBeLessThan(16 * TILE);
  });
});

describe('brute', () => {
  it('cannot be parried or blocked', () => {
    const { world, input } = testWorld();
    const b = addGuard(world, 'brute', 1036, -1);
    placePlayer(world, 1000);
    const p = world.player;
    p.facing = 1;
    enterCombat(b, world, false);
    run(world, input, 3, () => {
      // Hold guard and re-press it right before every swing lands.
      if (b.attack.phase === 'windup' && b.attack.t < PARRY_WINDOW / 2) input.press('guard');
      else if (!input.isHeld('guard')) input.press('guard');
    });
    expect(p.hp).toBeLessThan(world.playerStats.maxHp);
    expect(b.state).not.toBe('staggered');
  });

  it('is not staggered by the combo finisher', () => {
    const { world } = testWorld();
    const b = addGuard(world, 'brute', 1036, -1);
    b.setState('combat');
    b.facing = 1; // turned away so the blow is not blocked
    placePlayer(world, 1000);
    guardTakesHit(world, b, 2, 2, 1000);
    expect(b.state).toBe('combat');
    expect(b.hp).toBe(8);
  });

  it('cannot climb after a player on a roof', () => {
    const { world, input } = testWorld((m) => building(m, 10, 6, 6));
    const b = addGuard(world, 'brute', 13 * TILE, 1);
    placePlayer(world, 13 * TILE, (GROUND_ROW - 6) * TILE);
    enterCombat(b, world, false);
    run(world, input, 4);
    expect(b.feet).toBe(GROUND_Y);
  });

  it('can still be assassinated from behind', () => {
    const { world, input } = testWorld();
    const b = addGuard(world, 'brute', 1000, 1);
    placePlayer(world, 970);
    world.player.facing = 1;
    input.press('attack');
    run(world, input, 0.6);
    expect(b.alive).toBe(false);
  });
});

describe('hound', () => {
  it('follows its handler on patrol', () => {
    const { world, input } = testWorld();
    const { handler, dog } = withHound(world, 1000);
    handler.minX = 900;
    handler.maxX = 1400;
    placePlayer(world, 3000);
    run(world, input, 6);
    expect(Math.abs(dog.cx - handler.cx)).toBeLessThan(60);
  });

  it('sniffs out a player hiding in hay and the handler drags them out', () => {
    const { world, input } = testWorld();
    const { handler, dog } = withHound(world, 1000);
    placePlayer(world, dog.cx + 60);
    world.player.setState('hidden');
    run(world, input, 1);
    expect(dog.sniffT).toBeGreaterThan(0);
    expect(world.player.hidden).toBe(true);
    run(world, input, 4);
    expect(world.player.hidden).toBe(false);
    expect(handler.state).toBe('combat');
  });

  it('is a target for knives and blades like any guard', () => {
    const { world, input } = testWorld();
    const { dog } = withHound(world, 1030);
    placePlayer(world, 1035 - 30 - 25);
    world.player.facing = 1;
    input.press('attack');
    run(world, input, 0.6);
    expect(dog.alive).toBe(false);
  });
});

describe('placement', () => {
  const city = buildCity();
  it('puts more specialists in the inner districts', () => {
    SPECIALISTS.forEach((want, d) => {
      // street patrols only: target bodyguards are counted separately below
      const inD = city.guards.filter((g) => g.district === d && !g.targetId && g.y === GROUND_Y && g.minX !== g.maxX);
      expect(inD.filter((g) => g.withDog)).toHaveLength(want.dogs);
      expect(inD.filter((g) => g.kind === 'chaser')).toHaveLength(want.chasers);
      expect(inD.filter((g) => g.kind === 'brute')).toHaveLength(want.brutes);
    });
  });

  it('gives the commander a brute and the high priest a chaser', () => {
    expect(city.guards.some((g) => g.kind === 'brute' && g.x === 445 * TILE)).toBe(true);
    expect(city.guards.filter((g) => g.kind === 'chaser' && g.district === 2 && g.y < GROUND_Y)).toHaveLength(1);
  });

  it('spawns a hound next to every handler in the world', () => {
    const c = buildCity();
    const w2 = new World(c, newSave(), null);
    const handlers = w2.guards.filter((g) => g.dog);
    expect(handlers).toHaveLength(c.guards.filter((g) => g.withDog).length);
    for (const h of handlers) expect(h.dog!.handler).toBe(h);
  });
});
