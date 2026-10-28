import { describe, expect, it } from 'vitest';
import { MAX_FALL_DAMAGE } from '../src/entities/player';
import { predictLanding } from '../src/systems/parkour';
import { GRAVITY, MAX_FALL } from '../src/systems/physics';
import { GROUND_ROW, GROUND_Y } from '../src/world/city';
import { TILE, Tile } from '../src/world/tilemap';
import { building, placePlayer, run, testWorld } from './helpers';

const physics = { gravity: GRAVITY, maxFall: MAX_FALL };

describe('landing prediction', () => {
  it('finds the next roof across a small gap', () => {
    const { world } = testWorld((m) => {
      building(m, 10, 5, 6);
      building(m, 17, 5, 6);
    });
    const roof = (GROUND_ROW - 6) * TILE;
    expect(predictLanding(world.map, 14.9 * TILE, roof, 265, -590, physics).kind).toBe('floor');
  });

  it('reports a hard landing when there is only the street far below', () => {
    const { world } = testWorld((m) => building(m, 10, 5, 12));
    const roof = (GROUND_ROW - 12) * TILE;
    const res = predictLanding(world.map, 14.9 * TILE, roof, 265, -590, physics);
    expect(res.kind).toBe('floor');
    expect(res.vy).toBeGreaterThan(1060);
  });

  it('sees hay below as a safe landing', () => {
    const { world } = testWorld((m) => {
      building(m, 10, 5, 12);
      m.fill(18, GROUND_ROW - 1, 6, 1, Tile.Hay);
    });
    const roof = (GROUND_ROW - 12) * TILE;
    expect(predictLanding(world.map, 14.9 * TILE, roof, 265, -590, physics).kind).toBe('hay');
  });
});

describe('freerun edges', () => {
  it('stops at the edge of a tall roof instead of leaping to its death', () => {
    const { world, input } = testWorld((m) => building(m, 10, 5, 12));
    const roof = (GROUND_ROW - 12) * TILE;
    placePlayer(world, 12 * TILE, roof);
    input.press('right');
    input.press('sprint');
    run(world, input, 2);
    expect(world.player.feet).toBe(roof);
    expect(world.player.cx).toBeLessThan(15 * TILE);
  });

  it('still leaps when the next roof is in reach', () => {
    const { world, input } = testWorld((m) => {
      building(m, 10, 5, 12);
      building(m, 17, 5, 12);
    });
    const roof = (GROUND_ROW - 12) * TILE;
    placePlayer(world, 12 * TILE, roof);
    input.press('right');
    input.press('sprint');
    run(world, input, 1.5);
    expect(world.player.cx).toBeGreaterThan(17 * TILE);
    expect(world.player.feet).toBe(roof);
  });

  it('lets the player jump off on purpose with Space', () => {
    const { world, input } = testWorld((m) => building(m, 10, 5, 4));
    const roof = (GROUND_ROW - 4) * TILE;
    placePlayer(world, 14.5 * TILE, roof);
    input.press('right');
    input.press('jump');
    run(world, input, 1.5);
    expect(world.player.feet).toBe(GROUND_Y);
  });
});

describe('fall damage and breakfall', () => {
  it('caps fall damage', () => {
    const { world, input } = testWorld();
    placePlayer(world, 600, GROUND_Y - 900);
    world.player.setState('air');
    run(world, input, 2);
    expect(world.playerStats.maxHp - world.player.hp).toBe(MAX_FALL_DAMAGE);
  });

  it('does no damage from about nine tiles up', () => {
    const { world, input } = testWorld();
    placePlayer(world, 600, GROUND_Y - 9 * TILE);
    world.player.setState('air');
    run(world, input, 1.5);
    expect(world.player.hp).toBe(world.playerStats.maxHp);
  });

  it('a breakfall just before touchdown prevents all damage', () => {
    const { world, input } = testWorld();
    placePlayer(world, 600, GROUND_Y - 900);
    world.player.setState('air');
    run(world, input, 2, () => {
      const p = world.player;
      if (p.state === 'air' && GROUND_Y - p.feet < 150) input.press('dodge');
    });
    expect(world.player.hp).toBe(world.playerStats.maxHp);
    expect(world.breakfalls).toBe(1);
  });

  it('pressing too early does not count', () => {
    const { world, input } = testWorld();
    placePlayer(world, 600, GROUND_Y - 900);
    world.player.setState('air');
    input.press('dodge');
    run(world, input, 2);
    expect(world.player.hp).toBeLessThan(world.playerStats.maxHp);
  });
});
