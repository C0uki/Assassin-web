import { describe, expect, it } from 'vitest';
import { DRINK_TIME, POTION_HEAL } from '../src/entities/player';
import { GROUND_Y } from '../src/world/city';
import { FOOD_HEAL, PICKUP_RESPAWN } from '../src/world/world';
import { addGuard, placePlayer, run, testWorld } from './helpers';

function withFood(x: number) {
  const env = testWorld();
  env.world.pickups.push({ id: 'f', kind: 'food', x, y: GROUND_Y - 12, respawnT: 0, dropped: false });
  return env;
}

describe('food', () => {
  it('heals on touch, capped at max health', () => {
    const { world, input } = withFood(1000);
    const max = world.playerStats.maxHp;
    placePlayer(world, 1000);
    world.player.hp = max - 1;
    run(world, input, 0.1);
    expect(world.player.hp).toBe(max);
    expect(FOOD_HEAL).toBe(2);
  });

  it('is left on the ground when health is full', () => {
    const { world, input } = withFood(1000);
    placePlayer(world, 1000);
    run(world, input, 0.1);
    expect(world.pickups[0].respawnT).toBe(0);
  });

  it('comes back after the respawn time', () => {
    const { world, input } = withFood(1000);
    placePlayer(world, 1000);
    world.player.hp = 3;
    run(world, input, 0.1);
    expect(world.pickups[0].respawnT).toBeGreaterThan(PICKUP_RESPAWN - 1);
    placePlayer(world, 2000);
    run(world, input, PICKUP_RESPAWN + 0.5);
    expect(world.pickups[0].respawnT).toBe(0);
  });

  it('is sometimes dropped by defeated guards, and dropped food does not respawn', () => {
    const { world, input } = testWorld();
    world.random = () => 0;
    const g = addGuard(world, 'guard', 1200, 1);
    placePlayer(world, 1000);
    world.killGuard(g, 'combat');
    expect(world.pickups).toHaveLength(1);
    expect(world.pickups[0].dropped).toBe(true);
    world.player.hp = 3;
    placePlayer(world, world.pickups[0].x);
    run(world, input, 0.1);
    expect(world.player.hp).toBe(3 + FOOD_HEAL);
    expect(world.pickups).toHaveLength(0);

    world.random = () => 0.99;
    world.killGuard(addGuard(world, 'guard', 1400, 1), 'combat');
    expect(world.pickups).toHaveLength(0);
  });
});

describe('potions', () => {
  it('drinking takes time, then heals and uses one potion', () => {
    const { world, input } = testWorld();
    placePlayer(world, 1000);
    const p = world.player;
    p.hp = 2;
    const before = p.potions;
    input.press('heal');
    run(world, input, DRINK_TIME / 2);
    expect(p.state).toBe('drink');
    expect(p.hp).toBe(2);
    run(world, input, DRINK_TIME);
    expect(p.hp).toBe(2 + POTION_HEAL);
    expect(p.potions).toBe(before - 1);
    expect(p.state).toBe('ground');
  });

  it('is not wasted at full health or used without potions', () => {
    const { world, input } = testWorld();
    placePlayer(world, 1000);
    const p = world.player;
    input.press('heal');
    run(world, input, 0.1);
    expect(p.state).toBe('ground');
    p.hp = 3;
    p.potions = 0;
    input.press('heal');
    run(world, input, 0.1);
    expect(p.state).toBe('ground');
    expect(p.hp).toBe(3);
  });

  it('a hit interrupts drinking and keeps the potion', () => {
    const { world, input } = testWorld();
    placePlayer(world, 1000);
    const p = world.player;
    p.hp = 6;
    const before = p.potions;
    input.press('heal');
    run(world, input, 0.2);
    p.receiveHit(world, 1030, 2);
    run(world, input, DRINK_TIME);
    expect(p.potions).toBe(before);
    expect(p.hp).toBe(4);
  });

  it('can be picked up up to the maximum and refilled at a hideout', () => {
    const { world, input } = testWorld();
    const p = world.player;
    world.pickups.push({ id: 'p', kind: 'potion', x: 1000, y: GROUND_Y - 20, respawnT: 0, dropped: false });
    placePlayer(world, 1000);
    run(world, input, 0.1);
    expect(world.pickups[0].respawnT).toBe(0); // already full
    p.potions = 0;
    run(world, input, 0.1);
    expect(p.potions).toBe(1);
    // hideout in the test city is at x=64..128
    placePlayer(world, 96);
    p.inHideout = false;
    run(world, input, 0.1);
    expect(p.potions).toBe(world.playerStats.maxPotions);
  });
});
