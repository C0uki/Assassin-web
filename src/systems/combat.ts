import { sign } from '../core/math';
import type { Guard } from '../entities/guard';
import type { World } from '../world/world';

/**
 * Hands out a single "attack token" so surrounded players face one swing at a time.
 */
export class CombatDirector {
  holder: Guard | null = null;
  cooldown = 0;

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.holder && (!this.holder.alive || this.holder.state !== 'combat')) this.release(this.holder);
  }

  request(g: Guard): boolean {
    if (this.holder === g) return true;
    if (this.holder === null && this.cooldown <= 0) {
      this.holder = g;
      return true;
    }
    return false;
  }

  release(g: Guard): void {
    if (this.holder !== g) return;
    this.holder = null;
    this.cooldown = 0.35 + Math.random() * 0.5;
  }

  reset(): void {
    this.holder = null;
    this.cooldown = 0;
  }
}

export function staggerGuard(w: World, g: Guard, time: number, parried: boolean): void {
  w.combat.release(g);
  g.attack.phase = 'none';
  g.staggerT = time;
  g.parried = parried;
  g.state = 'staggered';
  g.stateT = 0;
}

export type GuardHitResult = 'blocked' | 'hit' | 'killed';

/** Whether a guard turns a player's sword blow aside. */
export function guardBlocks(g: Guard, fromX: number, comboStep: number, roll: number): boolean {
  if (g.state !== 'combat' || g.attack.phase === 'windup' || g.attack.phase === 'active') return false;
  if (sign(fromX - g.cx) !== g.facing) return false;
  if (comboStep >= 2) return false;
  if (g.kind === 'elite') return roll < 0.6;
  if (g.kind === 'brute') return roll < 0.5;
  if (g.kind === 'boss') return roll < 0.6;
  if (g.kind === 'target') return roll < 0.3;
  return false;
}

export function guardTakesHit(w: World, g: Guard, dmg: number, comboStep: number, fromX: number): GuardHitResult {
  if (guardBlocks(g, fromX, comboStep, Math.random())) {
    g.blockT = 0.2;
    w.sound('block');
    w.fx.sparks(g.cx + g.facing * 8, g.body.y + 16, 6);
    w.noise(g.cx, g.feet, 220, 'clash');
    return 'blocked';
  }
  w.sound('hit');
  w.fx.blood(g.cx, g.body.y + 16, sign(g.cx - fromX) || 1, 5);
  w.hitStop(0.05);
  w.noise(g.cx, g.feet, 220, 'clash');
  w.panic(g.cx, 220);
  // The grand master never staggers from plain blows, and his health stops at each phase.
  if (g.kind === 'boss' && w.boss) return w.boss.damage(g, dmg, 'combat') ? 'killed' : 'hit';
  g.hp -= dmg;
  g.hurtT = 0.2;
  if (g.hp <= 0) {
    w.killGuard(g, 'combat');
    return 'killed';
  }
  w.alertGuard(g);
  g.body.vx = g.kind === 'brute' ? 0 : (sign(g.cx - fromX) || 1) * (comboStep >= 2 ? 220 : 80);
  // Brutes shrug off even the finishing blow.
  if (comboStep >= 2 && g.kind !== 'brute') staggerGuard(w, g, 0.5, false);
  else if (g.attack.phase === 'windup' && g.kind === 'guard') {
    w.combat.release(g);
    g.attack.phase = 'none';
  }
  return 'hit';
}
