import { TILE, Tile, TileMap, isSolid } from '../world/tilemap';

export const GRAVITY = 1800;
export const MAX_FALL = 1100;

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
  /** While > 0 the body falls through one-way roofs. */
  dropThrough: number;
}

export function makeBody(x: number, y: number, w: number, h: number): Body {
  return { x, y, w, h, vx: 0, vy: 0, onGround: false, dropThrough: 0 };
}

export interface MoveResult {
  hitWall: boolean;
  /** Downward speed at the moment of landing, or null if the body did not land this step. */
  landedVy: number | null;
}

export const bodyCenterX = (b: Body): number => b.x + b.w / 2;
export const bodyBottom = (b: Body): number => b.y + b.h;

export function applyGravity(b: Body, dt: number, scale = 1): void {
  b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * scale * dt);
}

/** Move a body through the tile map: X axis first, then Y, resolving against solids and one-way roofs. */
export function moveBody(b: Body, map: TileMap, dt: number): MoveResult {
  const res: MoveResult = { hitWall: false, landedVy: null };
  if (b.dropThrough > 0) b.dropThrough -= dt;

  // X axis
  const nx = b.x + b.vx * dt;
  const ty0 = Math.floor(b.y / TILE);
  const ty1 = Math.floor((b.y + b.h - 0.01) / TILE);
  if (b.vx > 0) {
    const tx = Math.floor((nx + b.w) / TILE);
    let blocked = false;
    for (let ty = ty0; ty <= ty1; ty++) if (isSolid(map.get(tx, ty))) blocked = true;
    if (blocked) {
      b.x = tx * TILE - b.w - 0.01;
      b.vx = 0;
      res.hitWall = true;
    } else b.x = nx;
  } else if (b.vx < 0) {
    const tx = Math.floor(nx / TILE);
    let blocked = false;
    for (let ty = ty0; ty <= ty1; ty++) if (isSolid(map.get(tx, ty))) blocked = true;
    if (blocked) {
      b.x = (tx + 1) * TILE + 0.01;
      b.vx = 0;
      res.hitWall = true;
    } else b.x = nx;
  }

  // Y axis
  const prevBottom = b.y + b.h;
  const ny = b.y + b.vy * dt;
  const tx0 = Math.floor(b.x / TILE);
  const tx1 = Math.floor((b.x + b.w - 0.01) / TILE);
  b.onGround = false;
  if (b.vy >= 0) {
    const ty = Math.floor((ny + b.h) / TILE);
    let land = false;
    for (let tx = tx0; tx <= tx1; tx++) {
      const t = map.get(tx, ty);
      if (isSolid(t)) land = true;
      else if (t === Tile.Roof && b.dropThrough <= 0 && prevBottom <= ty * TILE + 0.5) land = true;
    }
    if (land) {
      if (b.vy > 0) res.landedVy = b.vy;
      b.y = ty * TILE - b.h;
      b.vy = 0;
      b.onGround = true;
    } else b.y = ny;
  } else {
    const ty = Math.floor(ny / TILE);
    let bump = false;
    for (let tx = tx0; tx <= tx1; tx++) if (isSolid(map.get(tx, ty))) bump = true;
    if (bump) {
      b.y = (ty + 1) * TILE;
      b.vy = 0;
    } else b.y = ny;
  }
  return res;
}

/** Is there floor (solid or roof) directly beneath the given x at the body's feet? */
export function hasFloorAt(map: TileMap, px: number, feetY: number): boolean {
  const t = map.at(px, feetY + 2);
  return isSolid(t) || t === Tile.Roof;
}
