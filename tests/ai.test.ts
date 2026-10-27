import { describe, expect, it } from 'vitest';
import { GROUND_Y } from '../src/world/city';
import { addGuard, placePlayer, run, testWorld } from './helpers';

describe('guard perception', () => {
  it('detects a player standing in its view and enters combat', () => {
    const { world, input } = testWorld();
    const g = addGuard(world, 'guard', 1000, 1);
    placePlayer(world, 1150);
    run(world, input, 0.3);
    expect(g.awareness).toBeGreaterThan(0);
    run(world, input, 2);
    expect(g.state).toBe('combat');
    expect(world.save.stats.detections).toBe(1);
  });

  it('does not see a player behind it', () => {
    const { world, input } = testWorld();
    const g = addGuard(world, 'guard', 1000, 1);
    placePlayer(world, 880);
    run(world, input, 2);
    expect(g.state).toBe('patrol');
    expect(g.awareness).toBe(0);
  });

  it('does not see a hidden player', () => {
    const { world, input } = testWorld();
    const g = addGuard(world, 'guard', 1000, 1);
    placePlayer(world, 1150);
    world.player.setState('hidden');
    run(world, input, 2);
    expect(g.state).toBe('patrol');
  });

  it('investigates loud noises', () => {
    const { world, input } = testWorld();
    const g = addGuard(world, 'guard', 1000, 1);
    placePlayer(world, 2200);
    world.noise(900, GROUND_Y, 200, 'step');
    run(world, input, 0.1);
    expect(g.state).toBe('search');
    expect(g.lastKnown?.x).toBe(900);
  });

  it('raises the alarm when it finds a body', () => {
    const { world, input } = testWorld();
    const victim = addGuard(world, 'guard', 1200, -1);
    const g = addGuard(world, 'guard', 1000, 1);
    placePlayer(world, 2200);
    world.killGuard(victim, 'assassinate');
    run(world, input, 0.2);
    expect(world.corpses[0].discovered).toBe(true);
    expect(g.state).toBe('search');
    expect(world.isAlert(0)).toBe(true);
  });

  it('is stunned by smoke and becomes vulnerable', () => {
    const { world, input } = testWorld();
    const g = addGuard(world, 'guard', 1000, 1);
    placePlayer(world, 1060);
    world.addSmoke(1000, GROUND_Y - 20);
    run(world, input, 0.1);
    expect(g.state).toBe('stunned');
    expect(g.vulnerable).toBe(true);
  });

  it('shouts and pulls nearby guards into the fight', () => {
    const { world, input } = testWorld();
    const a = addGuard(world, 'guard', 1000, 1);
    const b = addGuard(world, 'guard', 800, -1);
    placePlayer(world, 1120);
    run(world, input, 2.5);
    expect(a.state).toBe('combat');
    expect(b.state).toBe('combat');
  });
});
