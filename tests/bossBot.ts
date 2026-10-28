import type { Input } from '../src/core/input';
import type { Guard } from '../src/entities/guard';
import { ARENA, GROUND_Y } from '../src/world/city';
import { TILE } from '../src/world/tilemap';
import type { World } from '../src/world/world';

export const BOT_ACTIONS = ['left', 'right', 'up', 'down', 'sprint', 'guard', 'eagle'] as const;
type Held = (typeof BOT_ACTIONS)[number];

/**
 * A scripted player that beats the grand master with the moves the game teaches:
 * parry and counter, dodge the red blows, drop from above, and stalk him through the crowd.
 * It reads the world state the way a player reads the screen.
 */
export class BossBot {
  private tapped = new Set<string>();
  log: string[] = [];

  constructor(
    private w: World,
    private input: Input,
  ) {}

  private hold(...actions: Held[]): void {
    for (const a of BOT_ACTIONS) if (!actions.includes(a) && this.input.isHeld(a)) this.input.release(a);
    for (const a of actions) if (!this.input.isHeld(a)) this.input.press(a);
  }

  /** Press an action once; it is released on the next call so it can be pressed again. */
  private tap(a: 'attack' | 'dodge' | 'jump' | 'heal' | 'guard' | 'down'): void {
    if (this.input.isHeld(a)) this.input.release(a);
    this.input.press(a);
    this.tapped.add(a);
  }

  private releaseTaps(): void {
    for (const a of this.tapped) this.input.release(a as never);
    this.tapped.clear();
  }

  private steer(x: number, extra: Held[] = [], tol = 4): void {
    const p = this.w.player;
    if (p.cx < x - tol) this.hold('right', ...extra);
    else if (p.cx > x + tol) this.hold('left', ...extra);
    else this.hold(...extra);
  }

  step(): void {
    this.releaseTaps();
    const w = this.w;
    const fight = w.boss!;
    const p = w.player;
    const g = fight.boss;
    if (p.dead || !g.alive) return this.hold();
    if (p.hp <= 4 && p.potions > 0 && p.state === 'ground' && !fight.move) return this.tap('heal');
    if (fight.phase === 2 && !fight.script) return this.phase2(g);
    if (fight.phase === 3 && g.state !== 'combat') return this.stalk(g);
    this.duel(g);
  }

  /** Stand and trade blows: parry white swings, roll away from red ones, punish recoveries. */
  private duel(g: Guard): void {
    const w = this.w;
    const p = w.player;
    const m = w.boss!.move;
    const dx = g.cx - p.cx;
    const facing = (Math.sign(dx) || 1) as 1 | -1;
    if (p.findCounterTarget(w) === g) return this.tap('attack');
    // Any other enemy about to strike right next to us: parry it.
    const other = w.guards.find((o) => o !== g && o.alive && o.attack.phase === 'windup' && o.attack.t < 0.12 && Math.abs(o.cx - p.cx) < 50);
    if (other && !other.attack.heavy) return this.hold('guard');
    if (other) return this.tap('dodge');
    if (m && m.phase === 'windup') {
      if (m.kind === 'combo') {
        if (m.t < 0.13 && p.state !== 'guard') {
          this.hold(facing > 0 ? 'right' : 'left');
          return this.tap('guard');
        }
        return this.hold(...(p.state === 'guard' ? (['guard'] as Held[]) : []));
      }
      if (m.t < 0.16) {
        // Roll through a lunge, away from a heavy blow.
        this.hold(m.kind === 'lunge' ? (facing > 0 ? 'right' : 'left') : facing > 0 ? 'left' : 'right');
        return this.tap('dodge');
      }
      if (m.kind === 'heavy' && Math.abs(dx) < 80) return this.hold(facing > 0 ? 'left' : 'right');
      return this.hold();
    }
    if (m && m.phase === 'active') return this.hold(...(p.state === 'guard' ? (['guard'] as Held[]) : []));
    if (Math.abs(g.feet - p.feet) > 30) return this.steer(g.cx);
    if (Math.abs(dx) > 34) return this.steer(g.cx - facing * 26, [], 6);
    this.hold(facing > 0 ? 'right' : 'left');
    if (g.state === 'staggered' || (m && m.phase === 'recover') || w.boss!.recoverT > 0 || p.state === 'attack') this.tap('attack');
  }

  /** Climb the belfry, come down the front above him and drop for an air assassination. */
  private phase2(g: Guard): void {
    const w = this.w;
    const p = w.player;
    const fight = w.boss!;
    if (!fight.onBalcony(g) || (p.state !== 'climb' && p.state !== 'air' && Math.abs(p.feet - g.feet) < 20)) return this.duel(g);
    if (p.state === 'climb') {
      if (p.feet < g.body.y - 50) {
        // High enough: shuffle along the wall until right above him, then let go.
        if (Math.abs(p.cx - g.cx) > 16) return this.steer(g.cx, [], 8);
        this.hold('down');
        return this.tap('jump');
      }
      return this.hold('up');
    }
    if (p.state === 'air') {
      if (p.findAirTarget(w) === g) this.tap('attack');
      return this.hold();
    }
    if (p.state === 'ground' && p.feet < g.feet - 40) {
      // On the belfry roof: hang off the front above him.
      if (Math.abs(p.cx - g.cx) > 8) return this.steer(g.cx);
      return this.tap('down');
    }
    // Clear the wave on the square first, then climb in the lull.
    const enemy = w.guards
      .filter((o) => o !== g && o.alive && o.state !== 'dead' && Math.abs(o.feet - p.feet) < 30)
      .sort((a, b) => Math.abs(a.cx - p.cx) - Math.abs(b.cx - p.cx))[0];
    if (enemy && Math.abs(enemy.cx - p.cx) < 400) return this.duelMinion(enemy);
    // Up the house beside the belfry, then step off its edge onto the belfry front, above him.
    const houseX = (ARENA.belfry.tx + ARENA.belfry.tw + 2) * TILE;
    if (p.feet > GROUND_Y - 4) {
      if (Math.abs(p.cx - houseX) > 6) return this.steer(houseX, ['sprint']);
      return this.hold('up');
    }
    this.hold('left', 'up');
  }

  private duelMinion(o: Guard): void {
    const w = this.w;
    const p = w.player;
    const dx = o.cx - p.cx;
    const facing: Held = dx >= 0 ? 'right' : 'left';
    if (p.findCounterTarget(w)) return this.tap('attack');
    const striker = w.guards.find((x) => x.alive && x.attack.phase === 'windup' && x.attack.t < 0.12 && Math.abs(x.cx - p.cx) < 50);
    if (striker) {
      if (striker.attack.heavy) return this.tap('dodge');
      this.hold(striker.cx >= p.cx ? 'right' : 'left');
      return this.tap('guard');
    }
    if (Math.abs(dx) > 34) return this.steer(o.cx - Math.sign(dx) * 26, [], 6);
    this.hold(facing);
    this.tap('attack');
  }

  /** Walk in with the crowd, come at him from behind and strike. */
  private stalk(g: Guard): void {
    const w = this.w;
    const p = w.player;
    if (p.findAssassinationTarget(w) === g) return this.tap('attack');
    const behind = g.cx - g.facing * 30;
    this.steer(behind, ['eagle'], 6);
  }
}
