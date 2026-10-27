import type { Rng } from '../core/rng';

export type CivState = 'walk' | 'flee' | 'stumble' | 'dead';

export interface CivLook {
  robe: string;
  head: 'none' | 'turban' | 'veil';
  basket: boolean;
  scale: number;
}

const ROBES = ['#6d5a8a', '#4f7a6a', '#8a5a3c', '#7a6b4a', '#5a6b8a', '#8a4a5a', '#6a6a5a'];

export class CivGroup {
  pauseT = 0;
  walkT: number;
  members: Civilian[] = [];

  constructor(
    public dir: 1 | -1,
    public speed: number,
    public minX: number,
    public maxX: number,
    rng: Rng,
  ) {
    this.walkT = rng.range(3, 8);
  }
}

export class Civilian {
  state: CivState = 'walk';
  t = 0;
  fleeDir: 1 | -1 = 1;
  facing: 1 | -1;
  animT = Math.random() * 10;
  look: CivLook;
  deadT = 0;
  readonly w = 14;
  readonly h = 38;

  constructor(
    public x: number,
    public y: number,
    public group: CivGroup,
    rng: Rng,
  ) {
    this.facing = group.dir;
    this.look = {
      robe: rng.pick(ROBES),
      head: rng.pick(['none', 'turban', 'veil'] as const),
      basket: rng.chance(0.25),
      scale: rng.range(0.9, 1.05),
    };
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }
}
