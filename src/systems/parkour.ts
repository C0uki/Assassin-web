import { TILE, Tile, TileMap, isSolid } from '../world/tilemap';

/** Where the hands are relative to the top of a 40px body. */
export const handsY = (bodyY: number): number => bodyY + 6;

/** Can a body whose top is at `bodyY` hold on to the wall at column `cx`? */
export function canGrab(map: TileMap, cx: number, bodyY: number): boolean {
  return map.isClimbableAt(cx, handsY(bodyY)) && map.isClimbableAt(cx, bodyY + 20);
}

/**
 * When climbing has reached the top of a facade, returns the roof row to pull up onto,
 * otherwise null.
 */
export function findMantleRow(map: TileMap, cx: number, bodyY: number): number | null {
  const tx = Math.floor(cx / TILE);
  const r = Math.floor(handsY(bodyY) / TILE);
  for (const row of [r, r + 1]) {
    if (map.get(tx, row) !== Tile.Roof) continue;
    const above = map.get(tx, row - 1);
    if (above === Tile.Empty || above === Tile.Hay) return row;
  }
  return null;
}

/** Is there a drop ahead of a walker at the given feet position? */
export function edgeAhead(map: TileMap, cx: number, feetY: number, dir: number, halfW: number): boolean {
  const t = map.at(cx + dir * (halfW + 4), feetY + 2);
  return !(isSolid(t) || t === Tile.Roof);
}

export type LandingKind = 'floor' | 'hay' | 'grab' | 'none';

export interface Landing {
  kind: LandingKind;
  /** Downward speed on touchdown (floor landings). */
  vy: number;
}

/**
 * Follow a jump arc frame by frame and report what it ends on: a floor, a hay cart,
 * a wall to grab, or nothing within `maxTime`. Used to decide whether an automatic
 * freerun leap is safe.
 */
export function predictLanding(
  map: TileMap,
  cx: number,
  feetY: number,
  vx: number,
  vy: number,
  opts: { gravity: number; maxFall: number; bodyH?: number; canGrab?: boolean; maxTime?: number },
): Landing {
  const dt = 1 / 60;
  const h = opts.bodyH ?? 40;
  let x = cx;
  let y = feetY;
  for (let t = 0; t < (opts.maxTime ?? 2.5); t += dt) {
    const prev = y;
    vy = Math.min(opts.maxFall, vy + opts.gravity * dt);
    x += vx * dt;
    y += vy * dt;
    if (map.isSolidAt(x, y - h / 2)) return { kind: 'none', vy };
    if (vy > 0) {
      if (map.at(x, y - 4) === Tile.Hay) return { kind: 'hay', vy };
      const row = Math.floor(y / TILE);
      const tile = map.get(Math.floor(x / TILE), row);
      if (isSolid(tile) || (tile === Tile.Roof && prev <= row * TILE + 0.5)) return { kind: 'floor', vy };
    }
    if (opts.canGrab !== false && vy > -150 && canGrab(map, x, y - h)) return { kind: 'grab', vy };
  }
  return { kind: 'none', vy };
}
