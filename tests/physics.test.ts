import { describe, expect, it } from 'vitest';
import { applyGravity, makeBody, moveBody } from '../src/systems/physics';
import { canGrab, findMantleRow } from '../src/systems/parkour';
import { GROUND_ROW, GROUND_Y } from '../src/world/city';
import { lineOfSight } from '../src/world/los';
import { TILE, Tile, TileMap } from '../src/world/tilemap';
import { DT, building } from './helpers';

function flatMap(): TileMap {
  const m = new TileMap(40, 40);
  m.fill(0, GROUND_ROW, 40, 5, Tile.Solid);
  return m;
}

function fall(map: TileMap, b: ReturnType<typeof makeBody>, frames: number): number | null {
  let landed: number | null = null;
  for (let i = 0; i < frames; i++) {
    applyGravity(b, DT);
    const r = moveBody(b, map, DT);
    if (r.landedVy !== null) landed = r.landedVy;
  }
  return landed;
}

describe('physics', () => {
  it('lands on solid ground', () => {
    const map = flatMap();
    const b = makeBody(100, GROUND_Y - 200, 16, 40);
    const landed = fall(map, b, 120);
    expect(b.onGround).toBe(true);
    expect(b.y + b.h).toBe(GROUND_Y);
    expect(landed).toBeGreaterThan(0);
  });

  it('stands on a one-way roof when falling onto it', () => {
    const map = flatMap();
    building(map, 2, 5, 6);
    const roofY = (GROUND_ROW - 6) * TILE;
    const b = makeBody(3 * TILE, roofY - 120, 16, 40);
    fall(map, b, 90);
    expect(b.y + b.h).toBe(roofY);
  });

  it('passes through a roof from below', () => {
    const map = flatMap();
    building(map, 2, 5, 6);
    const roofY = (GROUND_ROW - 6) * TILE;
    const b = makeBody(3 * TILE, roofY + 10, 16, 40);
    b.vy = -700;
    moveBody(b, map, DT);
    for (let i = 0; i < 5; i++) moveBody(b, map, DT);
    expect(b.y).toBeLessThan(roofY);
  });

  it('drops through a roof while dropThrough is active', () => {
    const map = flatMap();
    building(map, 2, 5, 6);
    const roofY = (GROUND_ROW - 6) * TILE;
    const b = makeBody(3 * TILE, roofY - 40, 16, 40);
    b.dropThrough = 0.3;
    fall(map, b, 20);
    expect(b.y + b.h).toBeGreaterThan(roofY);
  });

  it('is blocked by solid walls horizontally', () => {
    const map = flatMap();
    map.fill(10, GROUND_ROW - 3, 1, 3, Tile.Stone);
    const b = makeBody(8 * TILE, GROUND_Y - 40, 16, 40);
    for (let i = 0; i < 60; i++) {
      b.vx = 200;
      applyGravity(b, DT);
      moveBody(b, map, DT);
    }
    expect(b.x + b.w).toBeLessThanOrEqual(10 * TILE);
  });
});

describe('parkour helpers', () => {
  it('can grab a facade and finds the roof row to mantle onto', () => {
    const map = flatMap();
    building(map, 2, 5, 6);
    const topRow = GROUND_ROW - 6;
    expect(canGrab(map, 3 * TILE, GROUND_Y - 40)).toBe(true);
    expect(canGrab(map, 20 * TILE, GROUND_Y - 40)).toBe(false);
    // hands in the roof row → mantle
    expect(findMantleRow(map, 3 * TILE, topRow * TILE - 2)).toBe(topRow);
    // halfway up the wall → keep climbing
    expect(findMantleRow(map, 3 * TILE, (topRow + 3) * TILE)).toBeNull();
  });
});

describe('line of sight', () => {
  it('is blocked by stone but not by facades', () => {
    const map = flatMap();
    building(map, 5, 3, 6);
    expect(lineOfSight(map, 2 * TILE, GROUND_Y - 30, 12 * TILE, GROUND_Y - 30)).toBe(true);
    map.fill(8, GROUND_ROW - 4, 1, 4, Tile.Stone);
    expect(lineOfSight(map, 2 * TILE, GROUND_Y - 30, 12 * TILE, GROUND_Y - 30)).toBe(false);
  });
});
