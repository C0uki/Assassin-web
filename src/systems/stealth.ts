import { pointSegmentDistance } from '../core/math';
import { lineOfSight } from '../world/los';
import { TileMap } from '../world/tilemap';

export interface Smoke {
  x: number;
  y: number;
  r: number;
  life: number;
}

export interface VisionParams {
  range: number;
  halfAngle: number;
  /** Radius in which a guard notices you regardless of facing (combat awareness). */
  closeRadius: number;
}

export const VISION: Record<'guard' | 'elite' | 'archer' | 'target', VisionParams> = {
  guard: { range: 260, halfAngle: (36 * Math.PI) / 180, closeRadius: 0 },
  elite: { range: 300, halfAngle: (40 * Math.PI) / 180, closeRadius: 0 },
  archer: { range: 380, halfAngle: (55 * Math.PI) / 180, closeRadius: 0 },
  target: { range: 230, halfAngle: (36 * Math.PI) / 180, closeRadius: 0 },
};

/** Is the point within the facing cone (ignores walls)? */
export function inCone(
  ex: number,
  ey: number,
  facing: number,
  px: number,
  py: number,
  range: number,
  halfAngle: number,
): boolean {
  const dx = px - ex;
  const dy = py - ey;
  const d = Math.hypot(dx, dy);
  if (d > range) return false;
  if (d < 1) return true;
  const forward = dx * facing;
  if (forward <= 0) return false;
  return Math.atan2(Math.abs(dy), forward) <= halfAngle;
}

export function smokeBlocks(smokes: readonly Smoke[], ax: number, ay: number, bx: number, by: number): boolean {
  return smokes.some((s) => s.life > 0 && pointSegmentDistance(s.x, s.y, ax, ay, bx, by) < s.r * 0.8);
}

export function canSeePoint(
  map: TileMap,
  smokes: readonly Smoke[],
  ex: number,
  ey: number,
  facing: number,
  px: number,
  py: number,
  vision: VisionParams,
  rangeMul = 1,
): boolean {
  const close = vision.closeRadius > 0 && Math.hypot(px - ex, py - ey) < vision.closeRadius;
  if (!close && !inCone(ex, ey, facing, px, py, vision.range * rangeMul, vision.halfAngle)) return false;
  if (!lineOfSight(map, ex, ey, px, py)) return false;
  return !smokeBlocks(smokes, ex, ey, px, py);
}

export interface DetectionInput {
  distance: number;
  range: number;
  freerunning: boolean;
  climbing: boolean;
  restricted: boolean;
  districtAlert: boolean;
}

/** Awareness gained per second while the player is visible. */
export function detectionRate(i: DetectionInput): number {
  if (i.distance < 48) return 10;
  let rate = 0.7 * (1 + 2.5 * Math.max(0, 1 - i.distance / i.range));
  if (i.freerunning) rate *= 1.8;
  if (i.climbing) rate *= 1.4;
  if (i.restricted) rate *= 2;
  if (i.districtAlert) rate *= 1.4;
  return rate;
}

export const AWARENESS_DECAY = 0.25;
export const SUSPICIOUS_AT = 0.3;

/** Number of civilians needed around the player to blend in. */
export const BLEND_COUNT = 3;
export const BLEND_RADIUS = 44;

export function countNearby(px: number, py: number, others: readonly { x: number; y: number }[], radius: number): number {
  let n = 0;
  for (const o of others) if (Math.abs(o.x - px) < radius && Math.abs(o.y - py) < 12) n++;
  return n;
}
