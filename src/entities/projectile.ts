export interface Projectile {
  kind: 'knife' | 'arrow';
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  fromPlayer: boolean;
  dead: boolean;
}

export function makeProjectile(kind: Projectile['kind'], x: number, y: number, vx: number, vy: number, fromPlayer: boolean): Projectile {
  return { kind, x, y, vx, vy, life: 2.5, fromPlayer, dead: false };
}
