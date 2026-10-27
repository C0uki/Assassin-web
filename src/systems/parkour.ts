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
