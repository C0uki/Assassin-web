import type { Input } from '../core/input';
import { approach, clamp, overlaps, sign } from '../core/math';
import { Body, applyGravity, bodyBottom, hasFloorAt, makeBody, moveBody } from '../systems/physics';
import { TILE, Tile } from '../world/tilemap';
import type { World } from '../world/world';
import type { Guard } from './guard';
import { BLEND_COUNT, BLEND_RADIUS, countNearby } from '../systems/stealth';
import { canGrab, findMantleRow, handsY } from '../systems/parkour';

export type PlayerState =
  | 'ground'
  | 'air'
  | 'climb'
  | 'mantle'
  | 'hidden'
  | 'attack'
  | 'dodge'
  | 'guard'
  | 'assassinate'
  | 'airAssassinate'
  | 'hurt'
  | 'drink'
  | 'dead';

export type HitResult = 'miss' | 'block' | 'parry' | 'hit';

export const WALK = 115;
export const BLEND_WALK = 55;
export const RUN = 265;
const ACC_GROUND = 1700;
const ACC_AIR = 1000;
const JUMP_V = 560;
const FREERUN_JUMP_V = 590;
const CLIMB_V = 125;
const CLIMB_H = 95;
const COYOTE = 0.1;
const JUMP_BUFFER = 0.12;
export const PARRY_WINDOW = 0.18;
const DODGE_TIME = 0.32;
const DODGE_IFRAMES = 0.26;
export const SAFE_FALL_SPEED = 980;
export const DRINK_TIME = 0.6;
export const POTION_HEAL = 4;

interface AttackPhase {
  windup: number;
  active: number;
  recover: number;
  dmg: number;
}

export const COMBO: AttackPhase[] = [
  { windup: 0.07, active: 0.08, recover: 0.2, dmg: 1 },
  { windup: 0.07, active: 0.08, recover: 0.2, dmg: 1 },
  { windup: 0.1, active: 0.1, recover: 0.3, dmg: 2 },
];

export class Player {
  readonly body: Body;
  facing: 1 | -1 = 1;
  state: PlayerState = 'ground';
  stateT = 0;
  hp: number;
  iframes = 0;
  coyote = 0;
  jumpBuffer = 0;
  grabLock = 0;
  dodgeCd = 0;
  comboStep = 0;
  comboQueued = false;
  swingHit = new Set<object>();
  knives: number;
  smokes: number;
  potions: number;
  freerun = false;
  blended = false;
  animT = 0;
  stepT = 0;
  fallStartY = 0;
  killTarget: Guard | null = null;
  killDone = false;
  killKind: 'assassinate' | 'counter' | 'air' | 'hay' = 'assassinate';
  mantleFrom = { x: 0, y: 0 };
  mantleTo = { x: 0, y: 0 };
  diving = false;
  inHideout = false;
  civBumpT = 0;

  constructor(x: number, feetY: number, maxHp: number, knives: number, smokes: number, potions: number) {
    this.body = makeBody(x - 8, feetY - 40, 16, 40);
    this.hp = maxHp;
    this.knives = knives;
    this.smokes = smokes;
    this.potions = potions;
  }

  get cx(): number {
    return this.body.x + this.body.w / 2;
  }

  get cy(): number {
    return this.body.y + this.body.h / 2;
  }

  get feet(): number {
    return bodyBottom(this.body);
  }

  get dead(): boolean {
    return this.state === 'dead';
  }

  get hidden(): boolean {
    return this.state === 'hidden';
  }

  get climbing(): boolean {
    return this.state === 'climb' || this.state === 'mantle';
  }

  setState(s: PlayerState): void {
    this.state = s;
    this.stateT = 0;
  }

  update(w: World, input: Input, dt: number): void {
    this.animT += dt;
    this.stateT += dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.grabLock = Math.max(0, this.grabLock - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.civBumpT = Math.max(0, this.civBumpT - dt);
    this.jumpBuffer = input.wasPressed('jump') ? JUMP_BUFFER : Math.max(0, this.jumpBuffer - dt);
    this.freerun = input.isHeld('sprint');
    this.blended = false;

    switch (this.state) {
      case 'ground':
      case 'air':
        this.updateLocomotion(w, input, dt);
        break;
      case 'climb':
        this.updateClimb(w, input, dt);
        break;
      case 'mantle':
        this.updateMantle();
        break;
      case 'hidden':
        this.updateHidden(w, input);
        break;
      case 'attack':
        this.updateAttack(w, input, dt);
        break;
      case 'dodge':
        this.updateDodge(w, dt);
        break;
      case 'guard':
        this.updateGuard(w, input, dt);
        break;
      case 'assassinate':
        this.updateAssassinate(w, dt);
        break;
      case 'airAssassinate':
        this.updateAirAssassinate(w, dt);
        break;
      case 'drink':
        this.updateDrink(w, dt);
        break;
      case 'hurt':
        this.body.vx = approach(this.body.vx, 0, 600 * dt);
        this.physics(w, dt);
        if (this.stateT > 0.3) this.setState(this.body.onGround ? 'ground' : 'air');
        break;
      case 'dead':
        this.body.vx = approach(this.body.vx, 0, 800 * dt);
        this.physics(w, dt);
        break;
    }
  }

  // ---------- locomotion ----------

  private updateLocomotion(w: World, input: Input, dt: number): void {
    const b = this.body;
    const ax = input.axisX();
    if (ax !== 0) this.facing = ax > 0 ? 1 : -1;
    const grounded = this.state === 'ground';

    if (grounded) {
      const nearCivs = countNearby(this.cx, this.feet, w.walkingCivilians(), BLEND_RADIUS);
      const canBlend = !this.freerun && nearCivs >= BLEND_COUNT;
      this.blended = canBlend;
      const max = this.freerun ? RUN : canBlend ? BLEND_WALK : w.eagleVision ? WALK * 0.8 : WALK;
      b.vx = approach(b.vx, ax * max, ACC_GROUND * dt);
      this.coyote = COYOTE;

      if (Math.abs(b.vx) > 5) {
        this.stepT -= dt * (Math.abs(b.vx) / WALK);
        if (this.stepT <= 0) {
          this.stepT = 0.42;
          if (this.freerun && Math.abs(b.vx) > WALK + 20) {
            w.noise(this.cx, this.feet, w.playerStats.quiet ? 70 : 150, 'step');
            w.sound('step');
          } else w.sound('stepSoft');
        }
        if (this.freerun && Math.abs(b.vx) > WALK + 20) this.bumpCivilians(w);
      }

      // Freerun leaps off roof edges automatically.
      if (this.freerun && ax !== 0 && !hasFloorAt(w.map, this.cx + ax * (b.w / 2 + 6), this.feet)) {
        this.jump(w, FREERUN_JUMP_V);
        return this.physics(w, dt);
      }
    } else {
      const maxAir = Math.max(this.freerun ? RUN : WALK, Math.abs(b.vx));
      b.vx = approach(b.vx, ax * maxAir, ACC_AIR * dt);
      this.coyote = Math.max(0, this.coyote - dt);
      this.leapOfFaithAssist(w, dt);
    }

    if (this.jumpBuffer > 0 && (grounded || this.coyote > 0)) {
      if (grounded && input.isHeld('down')) {
        b.dropThrough = 0.25;
        this.jumpBuffer = 0;
      } else {
        this.jump(w, this.freerun ? FREERUN_JUMP_V : JUMP_V);
        return this.physics(w, dt);
      }
    }

    // Start climbing
    if (this.grabLock <= 0) {
      if (grounded && input.isHeld('up') && canGrab(w.map, this.cx, this.body.y)) return this.startClimb();
      if (grounded && input.wasPressed('down') && w.map.at(this.cx, this.feet + 2) === Tile.Roof) {
        if (w.map.isClimbableAt(this.cx, this.feet + 20)) {
          b.y += 6;
          b.dropThrough = 0.2;
          return this.startClimb();
        }
        b.dropThrough = 0.25;
      }
      if (!grounded && (input.isHeld('up') || this.freerun) && b.vy > -150 && canGrab(w.map, this.cx, this.body.y)) {
        return this.startClimb();
      }
    }

    if (input.wasPressed('interact') && grounded && w.map.at(this.cx, this.feet - 4) === Tile.Hay) {
      return this.enterHay(w, false);
    }
    if (input.wasPressed('attack')) {
      if (grounded) {
        const counter = this.findCounterTarget(w);
        if (counter) return this.startKill(w, counter, 'counter');
        const t = this.findAssassinationTarget(w);
        if (t) return this.startKill(w, t, 'assassinate');
        return this.startAttack(w);
      }
      const air = this.findAirTarget(w);
      if (air) {
        this.killTarget = air;
        this.killDone = false;
        this.killKind = 'air';
        return this.setState('airAssassinate');
      }
    }
    if (grounded && input.isHeld('guard')) {
      b.vx = 0;
      return this.setState('guard');
    }
    if (grounded && input.wasPressed('dodge') && this.dodgeCd <= 0) return this.startDodge(ax);
    if (grounded && input.wasPressed('heal') && this.startDrink(w)) return this.physics(w, dt);
    if (input.wasPressed('knife')) this.throwKnife(w);
    if (grounded && input.wasPressed('smoke')) this.throwSmoke(w);

    if (!grounded && b.vy > 0 && w.map.at(this.cx, this.feet - 4) === Tile.Hay) return this.enterHay(w, true);

    this.physics(w, dt);
  }

  private jump(w: World, v: number): void {
    this.body.vy = -v;
    this.jumpBuffer = 0;
    this.coyote = 0;
    this.fallStartY = this.body.y;
    this.setState('air');
    w.sound('jump');
  }

  private leapOfFaithAssist(w: World, dt: number): void {
    const fall = this.body.y - this.fallStartY;
    this.diving = false;
    if (this.body.vy <= 200 || fall < 100) return;
    const hay = w.hayBelow(this.cx, this.feet, 70);
    if (hay === null) return;
    this.diving = true;
    this.body.vx = approach(this.body.vx, (hay - this.cx) * 4, 900 * dt);
  }

  private physics(w: World, dt: number): void {
    const b = this.body;
    const wasGround = b.onGround;
    applyGravity(b, dt, b.vy < 0 && this.state === 'air' && !w.jumpHeld ? 1.9 : 1);
    if (b.vy < 0 && wasGround) this.fallStartY = b.y;
    const res = moveBody(b, w.map, dt);
    if (res.landedVy !== null) this.onLand(w, res.landedVy);
    if (!b.onGround && this.state === 'ground') {
      this.setState('air');
      this.fallStartY = b.y;
    } else if (b.onGround && this.state === 'air') this.setState('ground');
    if (this.state === 'air' && b.vy < 0) this.fallStartY = Math.min(this.fallStartY, b.y);
  }

  private onLand(w: World, vy: number): void {
    this.diving = false;
    if (vy > 500) w.fx.dust(this.cx, this.feet, 6);
    if (vy > SAFE_FALL_SPEED && this.state !== 'dead') {
      const dmg = Math.min(6, Math.ceil((vy - SAFE_FALL_SPEED) / 20));
      w.noise(this.cx, this.feet, 200, 'land');
      w.sound('thud');
      this.damage(w, dmg, this.cx, false);
    } else if (vy > 700) {
      w.noise(this.cx, this.feet, 110, 'land');
      w.sound('land');
    } else if (vy > 200) w.sound('stepSoft');
  }

  private bumpCivilians(w: World): void {
    if (this.civBumpT > 0) return;
    for (const c of w.civilians) {
      if (c.state !== 'walk') continue;
      if (Math.abs(c.x - this.cx) < 14 && Math.abs(c.y - this.feet) < 10) {
        c.state = 'stumble';
        c.t = 0.8;
        c.fleeDir = this.facing;
        this.body.vx *= 0.55;
        this.civBumpT = 0.5;
        w.noise(this.cx, this.feet, 120, 'step');
        w.sound('bump');
        return;
      }
    }
  }

  // ---------- climbing ----------

  private startClimb(): void {
    this.body.vx = 0;
    this.body.vy = 0;
    this.setState('climb');
  }

  private updateClimb(w: World, input: Input, dt: number): void {
    const b = this.body;
    const map = w.map;
    const ax = input.axisX();
    const ay = input.axisY();
    if (ax !== 0) this.facing = ax > 0 ? 1 : -1;

    if (this.jumpBuffer > 0) {
      this.jumpBuffer = 0;
      if (ax !== 0) {
        b.vx = ax * 230;
        b.vy = -430;
        this.grabLock = 0.3;
      } else if (ay > 0) {
        b.vy = 0;
        this.grabLock = 0.35;
      } else {
        b.vy = -470;
        this.grabLock = 0.16;
      }
      this.fallStartY = b.y;
      this.setState('air');
      w.sound('jump');
      return;
    }
    if (input.wasPressed('knife')) this.throwKnife(w);

    const speedV = CLIMB_V * w.playerStats.climbMul;
    // horizontal
    if (ax !== 0) {
      const nx = b.x + ax * CLIMB_H * w.playerStats.climbMul * dt;
      const ncx = nx + b.w / 2;
      if (canGrab(map, ncx, b.y) && !map.isSolidAt(ncx + ax * (b.w / 2), b.y + b.h / 2)) b.x = nx;
    }
    // vertical
    if (ay < 0) {
      const ny = b.y - speedV * dt;
      if (map.isClimbableAt(this.cx, handsY(ny)) && !map.isSolidAt(this.cx, ny)) b.y = ny;
      else {
        const row = findMantleRow(map, this.cx, b.y);
        if (row !== null) {
          this.mantleFrom = { x: b.x, y: b.y };
          this.mantleTo = { x: b.x, y: row * TILE - b.h };
          this.setState('mantle');
          w.sound('mantle');
          return;
        }
      }
    } else if (ay > 0) {
      const ny = b.y + speedV * 1.2 * dt;
      const feet = ny + b.h;
      if (map.isSolidAt(this.cx, feet)) {
        b.y = Math.floor(feet / TILE) * TILE - b.h;
        this.setState('ground');
        b.onGround = true;
        return;
      }
      if (map.isClimbableAt(this.cx, handsY(ny))) b.y = ny;
      else {
        this.fallStartY = b.y;
        this.setState('air');
        return;
      }
    }
    if (!canGrab(map, this.cx, b.y)) {
      this.fallStartY = b.y;
      this.setState('air');
      return;
    }
    if (ax !== 0 || ay !== 0) {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = 0.35;
        w.sound('climb');
      }
    }
  }

  private updateMantle(): void {
    const t = clamp(this.stateT / 0.22, 0, 1);
    const b = this.body;
    b.x = this.mantleFrom.x + (this.mantleTo.x - this.mantleFrom.x) * t;
    b.y = this.mantleFrom.y + (this.mantleTo.y - this.mantleFrom.y) * t;
    b.vx = b.vy = 0;
    if (t >= 1) {
      b.onGround = true;
      this.setState('ground');
      this.body.vx = this.facing * 30;
    }
  }

  // ---------- hiding ----------

  private enterHay(w: World, fromAir: boolean): void {
    const b = this.body;
    const vy = b.vy;
    b.vx = 0;
    b.vy = 0;
    const row = Math.floor((this.feet - 4) / TILE);
    b.y = (row + 1) * TILE - b.h;
    b.onGround = true;
    this.diving = false;
    this.setState('hidden');
    w.fx.straw(this.cx, this.feet - 10, fromAir ? 26 : 10);
    w.sound(fromAir && vy > 500 ? 'splash' : 'rustle');
    if (fromAir && vy > 600) w.message('信仰の跳躍！', '#e8d9a8');
  }

  private updateHidden(w: World, input: Input): void {
    if (input.wasPressed('attack')) {
      const t = w.guards.find(
        (g) => g.alive && g.vulnerable && Math.abs(g.cx - this.cx) < 56 && Math.abs(g.feet - this.feet) < 16,
      );
      if (t) {
        this.facing = t.cx > this.cx ? 1 : -1;
        w.killGuard(t, 'hay');
        w.sound('stab');
        w.fx.straw(this.cx, this.feet - 10, 14);
        return;
      }
    }
    if (
      input.wasPressed('interact') ||
      input.wasPressed('jump') ||
      input.wasPressed('up') ||
      input.wasPressed('left') ||
      input.wasPressed('right')
    ) {
      this.setState('ground');
      w.fx.straw(this.cx, this.feet - 10, 8);
      w.sound('rustle');
      if (input.wasPressed('jump')) this.jump(w, JUMP_V);
    }
  }

  // ---------- combat ----------

  findAssassinationTarget(w: World): Guard | null {
    let best: Guard | null = null;
    let bestD = Infinity;
    for (const g of w.guards) {
      if (!g.alive || !g.vulnerable) continue;
      const dx = g.cx - this.cx;
      if (Math.abs(dx) > 42 || Math.abs(g.feet - this.feet) > 20) continue;
      if (sign(dx) !== this.facing && Math.abs(dx) > 10) continue;
      if (Math.abs(dx) < bestD) {
        best = g;
        bestD = Math.abs(dx);
      }
    }
    return best;
  }

  findCounterTarget(w: World): Guard | null {
    return (
      w.guards.find(
        (g) => g.alive && g.state === 'staggered' && g.parried && Math.abs(g.cx - this.cx) < 60 && Math.abs(g.feet - this.feet) < 24,
      ) ?? null
    );
  }

  findAirTarget(w: World): Guard | null {
    let best: Guard | null = null;
    let bestD = Infinity;
    for (const g of w.guards) {
      if (!g.alive) continue;
      const dx = Math.abs(g.cx - this.cx);
      const dy = g.body.y - this.feet;
      if (dx < 80 && dy > -8 && dy < 280 && dx + dy < bestD) {
        best = g;
        bestD = dx + dy;
      }
    }
    return best;
  }

  private startKill(w: World, target: Guard, kind: Player['killKind']): void {
    this.killTarget = target;
    this.killDone = false;
    this.killKind = kind;
    this.facing = target.cx >= this.cx ? 1 : -1;
    this.body.vx = 0;
    this.setState('assassinate');
    w.sound('swing');
  }

  private updateAssassinate(w: World, dt: number): void {
    const t = this.killTarget;
    this.body.vx = 0;
    if (t && !this.killDone) {
      const want = t.cx - this.facing * 18 - this.body.w / 2;
      this.body.x = approach(this.body.x, want, 400 * dt);
      if (this.stateT >= 0.12) {
        this.killDone = true;
        w.killGuard(t, this.killKind === 'counter' ? 'counter' : 'assassinate');
        w.sound('stab');
      }
    }
    this.physics(w, dt);
    if (this.stateT >= 0.42) this.setState(this.body.onGround ? 'ground' : 'air');
  }

  private updateAirAssassinate(w: World, dt: number): void {
    const t = this.killTarget;
    const b = this.body;
    if (!t || !t.alive) {
      this.setState('air');
      return;
    }
    b.vx = clamp((t.cx - this.cx) * 7, -320, 320);
    b.vy = Math.max(b.vy, 320);
    applyGravity(b, dt);
    moveBody(b, w.map, dt);
    const hit = overlaps({ x: b.x - 6, y: b.y, w: b.w + 12, h: b.h + 6 }, t.body);
    if (hit || b.onGround) {
      if (hit || Math.abs(t.cx - this.cx) < 30) {
        w.killGuard(t, 'air');
        w.sound('stab');
        w.shake(5);
        this.killDone = true;
        this.killKind = 'air';
        this.setState('assassinate');
        this.stateT = 0.12;
        b.vx = 0;
      } else this.setState('ground');
    }
  }

  private startAttack(w: World): void {
    this.comboStep = 0;
    this.comboQueued = false;
    this.swingHit.clear();
    this.setState('attack');
    w.sound('swing');
  }

  get attackPhase(): 'windup' | 'active' | 'recover' {
    const p = COMBO[this.comboStep];
    if (this.stateT < p.windup) return 'windup';
    if (this.stateT < p.windup + p.active) return 'active';
    return 'recover';
  }

  private updateAttack(w: World, input: Input, dt: number): void {
    const p = COMBO[this.comboStep];
    const b = this.body;
    if (input.wasPressed('attack') && this.stateT > p.windup * 0.5) {
      const counter = this.findCounterTarget(w);
      if (counter) return this.startKill(w, counter, 'counter');
      this.comboQueued = true;
    }
    const phase = this.attackPhase;
    if (phase === 'recover' && input.wasPressed('dodge') && this.dodgeCd <= 0) return this.startDodge(input.axisX());
    if (phase === 'active') {
      if (this.stateT - dt < p.windup) b.vx = this.facing * (this.comboStep === 2 ? 170 : 110);
      const hitbox = { x: this.facing > 0 ? this.cx : this.cx - 40, y: b.y + 2, w: 40, h: b.h - 4 };
      w.playerSwing(this, hitbox, p.dmg, this.comboStep);
    }
    b.vx = approach(b.vx, 0, 700 * dt);
    this.physics(w, dt);
    if (this.stateT >= p.windup + p.active + p.recover) {
      if (this.comboQueued && this.comboStep < COMBO.length - 1) {
        const ax = input.axisX();
        if (ax !== 0) this.facing = ax > 0 ? 1 : -1;
        this.comboStep++;
        this.comboQueued = false;
        this.swingHit.clear();
        this.stateT = 0;
        w.sound('swing');
      } else {
        this.setState('ground');
        if (input.isHeld('guard')) this.setState('guard');
      }
    } else if (phase === 'recover' && this.comboQueued && this.comboStep < COMBO.length - 1 && this.stateT > p.windup + p.active + p.recover * 0.4) {
      this.comboStep++;
      this.comboQueued = false;
      this.swingHit.clear();
      this.stateT = 0;
      w.sound('swing');
    }
  }

  private startDodge(ax: number): void {
    if (ax !== 0) this.facing = ax > 0 ? 1 : -1;
    this.body.vx = this.facing * 340;
    this.dodgeCd = 0.45;
    this.setState('dodge');
  }

  private updateDodge(w: World, dt: number): void {
    this.body.vx = approach(this.body.vx, this.facing * 120, 600 * dt);
    this.physics(w, dt);
    if (this.stateT >= DODGE_TIME) this.setState(this.body.onGround ? 'ground' : 'air');
  }

  private updateGuard(w: World, input: Input, dt: number): void {
    const ax = input.axisX();
    if (ax !== 0) this.facing = ax > 0 ? 1 : -1;
    this.body.vx = approach(this.body.vx, 0, 1200 * dt);
    if (input.wasPressed('attack')) {
      const counter = this.findCounterTarget(w);
      if (counter) return this.startKill(w, counter, 'counter');
    }
    if (input.wasPressed('dodge') && this.dodgeCd <= 0) return this.startDodge(ax);
    this.physics(w, dt);
    if (!input.isHeld('guard')) this.setState('ground');
  }

  get invulnerable(): boolean {
    return this.iframes > 0 || (this.state === 'dodge' && this.stateT < DODGE_IFRAMES);
  }

  /** Incoming attack from an enemy at `fromX`. */
  receiveHit(w: World, fromX: number, dmg: number, opts: { unblockable?: boolean; ranged?: boolean } = {}): HitResult {
    if (this.dead || this.hidden || this.invulnerable || this.state === 'assassinate') return 'miss';
    const toward = fromX === this.cx || sign(fromX - this.cx) === this.facing;
    if (this.state === 'guard' && toward && !opts.unblockable) {
      if (!opts.ranged && this.stateT < PARRY_WINDOW) return 'parry';
      this.body.vx = -sign(fromX - this.cx) * 90;
      return 'block';
    }
    this.damage(w, dmg, fromX, true);
    return 'hit';
  }

  damage(w: World, dmg: number, fromX: number, knock: boolean): void {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.iframes = 0.7;
    w.sound('hurt');
    w.fx.blood(this.cx, this.cy, sign(this.cx - fromX) || 1, 6);
    w.shake(6);
    if (this.hp <= 0) {
      this.setState('dead');
      w.onPlayerDeath();
      return;
    }
    if (knock) {
      this.body.vx = (sign(this.cx - fromX) || -this.facing) * 180;
      this.body.vy = -150;
      this.setState('hurt');
    }
  }

  private throwKnife(w: World): void {
    if (this.knives <= 0) {
      w.message('投げナイフがない', '#c9a0a0');
      return;
    }
    this.knives--;
    const sx = this.cx + this.facing * 10;
    const sy = this.body.y + 14;
    let vx = this.facing * 660;
    let vy = -30;
    const aim = w.knifeTarget(sx, sy, this.facing);
    if (aim) {
      const dx = aim.cx - sx;
      const dy = aim.body.y + 14 - sy;
      const d = Math.hypot(dx, dy) || 1;
      vx = (dx / d) * 660;
      vy = (dy / d) * 660 - 20;
    }
    w.addProjectile('knife', sx, sy, vx, vy, true);
    w.sound('throw');
  }

  /** Start drinking a potion; returns false (with a hint) when it would be wasted. */
  private startDrink(w: World): boolean {
    if (this.potions <= 0) {
      w.message('薬がない', '#c9a0a0');
      return false;
    }
    if (this.hp >= w.playerStats.maxHp) {
      w.message('体力は満タンだ', '#c9c0a0');
      return false;
    }
    this.body.vx = 0;
    this.setState('drink');
    w.sound('drink');
    return true;
  }

  /** Standing still while drinking; a hit interrupts it (via `damage`) and the potion is kept. */
  private updateDrink(w: World, dt: number): void {
    this.body.vx = approach(this.body.vx, 0, 900 * dt);
    this.physics(w, dt);
    if (this.stateT < DRINK_TIME) return;
    this.potions--;
    w.heal(POTION_HEAL, 'potion');
    this.setState('ground');
  }

  private throwSmoke(w: World): void {
    if (this.smokes <= 0) {
      w.message('煙玉がない', '#c9a0a0');
      return;
    }
    this.smokes--;
    w.addSmoke(this.cx, this.feet - 20);
  }

  /** Fixed-step respawn reset. */
  respawn(x: number, feetY: number, maxHp: number, knives: number, smokes: number, potions: number): void {
    this.body.x = x - this.body.w / 2;
    this.body.y = feetY - this.body.h;
    this.body.vx = this.body.vy = 0;
    this.hp = maxHp;
    this.knives = knives;
    this.smokes = smokes;
    this.potions = potions;
    this.iframes = 1.5;
    this.setState('ground');
  }
}
