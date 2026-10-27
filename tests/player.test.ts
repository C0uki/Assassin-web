import { describe, expect, it } from 'vitest';
import { GROUND_ROW, GROUND_Y } from '../src/world/city';
import { TILE, Tile } from '../src/world/tilemap';
import { building, placePlayer, run, testWorld } from './helpers';

describe('player movement', () => {
  it('walks and freeruns', () => {
    const { world, input } = testWorld();
    placePlayer(world, 600);
    input.press('right');
    run(world, input, 1);
    const walked = world.player.cx - 600;
    placePlayer(world, 600);
    input.press('sprint');
    run(world, input, 1);
    const ran = world.player.cx - 600;
    expect(walked).toBeGreaterThan(80);
    expect(ran).toBeGreaterThan(walked * 1.8);
  });

  it('jumps from the ground', () => {
    const { world, input } = testWorld();
    placePlayer(world, 600);
    input.press('jump');
    run(world, input, 0.2);
    expect(world.player.feet).toBeLessThan(GROUND_Y - 40);
    input.release('jump');
    run(world, input, 1.5);
    expect(world.player.feet).toBe(GROUND_Y);
  });

  it('climbs a facade and pulls up onto the roof', () => {
    const { world, input } = testWorld((m) => building(m, 20, 5, 6));
    placePlayer(world, 22 * TILE);
    input.press('up');
    run(world, input, 3);
    const roofY = (GROUND_ROW - 6) * TILE;
    expect(world.player.state).toBe('ground');
    expect(world.player.feet).toBeCloseTo(roofY, 0);
  });

  it('allows a coyote-time jump just after walking off a roof', () => {
    const { world, input } = testWorld((m) => building(m, 20, 5, 6));
    const roofY = (GROUND_ROW - 6) * TILE;
    placePlayer(world, 24.6 * TILE, roofY);
    input.press('right');
    let jumped = false;
    run(world, input, 0.6, () => {
      const p = world.player;
      if (!jumped && p.state === 'air' && p.body.vy >= 0) {
        input.press('jump');
        jumped = true;
      }
    });
    expect(jumped).toBe(true);
    // it rose above the roof it left
    expect(world.player.fallStartY).toBeLessThan(roofY - 40);
  });

  it('lands safely in hay and hides', () => {
    const { world, input } = testWorld((m) => m.fill(30, GROUND_ROW - 1, 3, 1, Tile.Hay));
    world.city.hays.push({ tx: 30, ty: GROUND_ROW - 1, tw: 3 });
    placePlayer(world, 31.5 * TILE, GROUND_Y - 600);
    world.player.setState('air');
    world.player.fallStartY = world.player.body.y;
    run(world, input, 1.5);
    expect(world.player.state).toBe('hidden');
    expect(world.player.hp).toBe(world.playerStats.maxHp);
  });

  it('takes damage from a long fall onto stone', () => {
    const { world, input } = testWorld();
    placePlayer(world, 600, GROUND_Y - 700);
    world.player.setState('air');
    run(world, input, 1.5);
    expect(world.player.hp).toBeLessThan(world.playerStats.maxHp);
  });

  it('does not damage on ordinary jumps', () => {
    const { world, input } = testWorld();
    placePlayer(world, 600, GROUND_Y - 160);
    world.player.setState('air');
    run(world, input, 1);
    expect(world.player.hp).toBe(world.playerStats.maxHp);
  });
});
