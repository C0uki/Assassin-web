import type { Vec2 } from '../core/math';
import type { GuardKind, GuardSpawn } from '../world/city';
import { Body, makeBody } from '../systems/physics';

export type GuardState = 'patrol' | 'suspicious' | 'search' | 'combat' | 'stunned' | 'staggered' | 'dead';

export interface GuardAttack {
  phase: 'none' | 'windup' | 'active' | 'recover';
  t: number;
  heavy: boolean;
}

const HP: Record<GuardKind, number> = { guard: 4, elite: 7, archer: 3, target: 5, chaser: 3, brute: 10, dog: 2, boss: 45, decoy: 1 };

const SIZE: Partial<Record<GuardKind, [number, number]>> = { elite: [18, 44], brute: [22, 50], dog: [26, 18], boss: [20, 48], decoy: [20, 48] };

let nextId = 1;

export class Guard {
  readonly id = nextId++;
  readonly body: Body;
  facing: 1 | -1;
  hp: number;
  readonly maxHp: number;
  state: GuardState = 'patrol';
  stateT = 0;
  awareness = 0;
  minX: number;
  maxX: number;
  readonly homeY: number;
  waitT = 0;
  lastKnown: Vec2 | null = null;
  lostT = 0;
  lookT = 0;
  attack: GuardAttack = { phase: 'none', t: 0, heavy: false };
  hurtT = 0;
  blockT = 0;
  staggerT = 0;
  stunT = 0;
  /** Staggered by a parry: open to a counter kill. */
  parried = false;
  climbing = false;
  seesPlayer = false;
  shootCd = 0;
  drawT = 0;
  animT = Math.random() * 10;
  deadT = 0;
  /** Spawned as reinforcement (despawns are not needed; it just patrols afterwards). */
  reinforcement = false;
  /** Training dummy: stands still and never notices anything. */
  passive = false;
  /** Handler ↔ hound link. */
  dog: Guard | null = null;
  handler: Guard | null = null;
  /** Seconds a hound has been sniffing at a hidden player. */
  sniffT = 0;
  barkCd = 0;
  readonly district: number;
  readonly targetId?: string;

  constructor(
    readonly kind: GuardKind,
    spawn: Pick<GuardSpawn, 'x' | 'y' | 'minX' | 'maxX' | 'facing' | 'district' | 'targetId'>,
  ) {
    const [w, h] = SIZE[kind] ?? [16, 40];
    this.body = makeBody(spawn.x - w / 2, spawn.y - h, w, h);
    this.facing = spawn.facing;
    this.minX = spawn.minX;
    this.maxX = spawn.maxX;
    this.homeY = spawn.y;
    this.hp = this.maxHp = HP[kind];
    this.district = spawn.district;
    this.targetId = spawn.targetId;
  }

  get cx(): number {
    return this.body.x + this.body.w / 2;
  }

  get feet(): number {
    return this.body.y + this.body.h;
  }

  /** Can climb facades. Hounds and heavy brutes cannot. */
  get canClimb(): boolean {
    return this.kind !== 'dog' && this.kind !== 'brute';
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  /** Can the player kill this guard instantly with an assassination? */
  get vulnerable(): boolean {
    return this.state === 'stunned' || (this.state === 'staggered' && this.parried) || (this.state !== 'combat' && this.state !== 'staggered');
  }

  setState(s: GuardState): void {
    this.state = s;
    this.stateT = 0;
  }
}
