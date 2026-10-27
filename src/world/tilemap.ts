export const TILE = 32;

export enum Tile {
  Empty = 0,
  /** Solid and climbable (ground, crates). */
  Solid = 1,
  /** Solid, cannot be climbed (district walls). */
  Stone = 2,
  /** Building front: walk past it, climb it. */
  Facade = 3,
  /** One-way platform you can stand on (rooftops, beams). Also climbable. */
  Roof = 4,
  /** Hay cart: hide inside, safe landing. */
  Hay = 5,
}

export class TileMap {
  readonly data: Uint8Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8Array(w * h);
  }

  get widthPx(): number {
    return this.w * TILE;
  }

  get heightPx(): number {
    return this.h * TILE;
  }

  get(tx: number, ty: number): Tile {
    if (tx < 0 || tx >= this.w || ty >= this.h) return Tile.Stone;
    if (ty < 0) return Tile.Empty;
    return this.data[ty * this.w + tx] as Tile;
  }

  set(tx: number, ty: number, t: Tile): void {
    if (tx < 0 || tx >= this.w || ty < 0 || ty >= this.h) return;
    this.data[ty * this.w + tx] = t;
  }

  fill(tx: number, ty: number, w: number, h: number, t: Tile): void {
    for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) this.set(x, y, t);
  }

  at(px: number, py: number): Tile {
    return this.get(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  isSolidAt(px: number, py: number): boolean {
    return isSolid(this.at(px, py));
  }

  isClimbableAt(px: number, py: number): boolean {
    const t = this.at(px, py);
    return t === Tile.Facade || t === Tile.Roof;
  }
}

export const isSolid = (t: Tile): boolean => t === Tile.Solid || t === Tile.Stone;
