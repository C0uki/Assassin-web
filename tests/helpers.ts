import { Input } from '../src/core/input';
import { Guard } from '../src/entities/guard';
import type { CityDef, GuardKind } from '../src/world/city';
import { GROUND_ROW, GROUND_Y } from '../src/world/city';
import { Tile, TileMap } from '../src/world/tilemap';
import { World } from '../src/world/world';
import { newSave } from '../src/systems/progress';

export const DT = 1 / 60;

/** A flat 120-tile strip with ground and an optional building. */
export function testCity(build?: (map: TileMap) => void): CityDef {
  const map = new TileMap(120, 40);
  map.fill(0, GROUND_ROW, 120, 40 - GROUND_ROW, Tile.Solid);
  build?.(map);
  return {
    map,
    buildings: [],
    beams: [],
    hays: [],
    districts: [{ name: 'test', sub: '', x0: 0, x1: 120 * 32 }],
    guards: [],
    targets: [],
    civGroups: [],
    docs: [],
    pickups: [],
    hideouts: [{ id: 0, x: 64, y: GROUND_Y - 64, w: 64, h: 64, district: 0 }],
  };
}

export function building(map: TileMap, tx: number, tw: number, h: number): void {
  map.fill(tx, GROUND_ROW - h + 1, tw, h - 1, Tile.Facade);
  map.fill(tx, GROUND_ROW - h, tw, 1, Tile.Roof);
}

export function testWorld(build?: (map: TileMap) => void): { world: World; input: Input } {
  const world = new World(testCity(build), newSave(), null);
  return { world, input: new Input() };
}

export function addGuard(world: World, kind: GuardKind, x: number, facing: 1 | -1, y = GROUND_Y, range?: [number, number]): Guard {
  const g = new Guard(kind, { x, y, minX: range?.[0] ?? x, maxX: range?.[1] ?? x, facing, district: 0 });
  world.guards.push(g);
  return g;
}

export function placePlayer(world: World, x: number, feetY = GROUND_Y): void {
  const b = world.player.body;
  b.x = x - b.w / 2;
  b.y = feetY - b.h;
  b.vx = b.vy = 0;
  b.onGround = true;
  world.player.setState('ground');
}

export function run(world: World, input: Input, seconds: number, each?: (t: number) => void): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    each?.(i * DT);
    world.update(input, DT);
    input.endTick();
  }
}
