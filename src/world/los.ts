import { TileMap } from './tilemap';

/** True when nothing solid lies on the segment between the two points. */
export function lineOfSight(map: TileMap, ax: number, ay: number, bx: number, by: number, step = 8): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.ceil(d / step));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (map.isSolidAt(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}
