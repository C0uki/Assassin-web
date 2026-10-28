import { approach, clamp, sign } from '../core/math';
import { Rng } from '../core/rng';
import { CivGroup, Civilian } from '../entities/civilian';
import { Guard } from '../entities/guard';
import { ARENA, BOSS, GROUND_ROW, GROUND_Y, GuardKind } from '../world/city';
import { TILE } from '../world/tilemap';
import type { KillKind, World } from '../world/world';
import { enterCombat, navigateTo } from './ai';
import { staggerGuard } from './combat';
import { GRAVITY, applyGravity, moveBody } from './physics';

export type BossPhase = 1 | 2 | 3;

/** Health at which each phase ends. */
export const PHASE_FLOOR: Record<BossPhase, number> = { 1: 30, 2: 15, 3: 0 };
/** Damage of an assassination (back, air, hay) on the grand master, per phase. */
export const STEALTH_DAMAGE: Record<BossPhase, number> = { 1: 3, 2: 8, 3: 5 };
export const COUNTER_DAMAGE = 3;
export const KNIFE_DAMAGE = 2;
export const DECOY_RESPAWN = 10;
const KNIFE_INTERVAL = 2.5;
/** Breather between two minion waves: the moment to climb the belfry. */
export const WAVE_GAP = 8;
const APPROACH_SPEED = 140;
const REACH = 40;
const LUNGE_SPEED = 600;
const LUNGE_TIME = 0.3;
const TRANSITION_TIME = 1.6;

/** Minion waves of the second phase, repeated in turn. */
export const WAVES: GuardKind[][] = [
  ['elite', 'elite', 'chaser'],
  ['archer', 'brute'],
];

export type BossMoveKind = 'combo' | 'heavy' | 'lunge';

interface BossMove {
  kind: BossMoveKind;
  phase: 'windup' | 'active' | 'recover';
  t: number;
  /** Strikes left in a combo. */
  hits: number;
  struck: boolean;
}

type Script =
  | { kind: 'intro'; t: number }
  | { kind: 'transition'; t: number; to: BossPhase }
  | { kind: 'leap'; t: number };

const PATTERN: BossMoveKind[] = ['combo', 'heavy', 'combo', 'lunge', 'combo', 'combo', 'heavy'];

const LINES: Record<BossPhase, string> = {
  1: '来たか、影の刃よ。六人の死、その身で贖ってもらう',
  2: 'ほう……ならば高みから見下ろさせてもらおう。者ども、かかれ！',
  3: '我を見抜けるか？ この群衆の中から！',
};

/**
 * The final duel against the grand master. Owns his three phases, the minion waves
 * and the decoys; regular guard AI runs for everything it does not script.
 */
export class BossFight {
  phase: BossPhase = 1;
  readonly boss: Guard;
  decoys: Guard[] = [];
  minions: Guard[] = [];
  script: Script | null = { kind: 'intro', t: 0 };
  move: BossMove | null = null;
  /** Set while the killing blow resolves, so `killGuard` treats him like anyone else. */
  finishing = false;
  wave = 0;
  waveT = 0;
  knifeT = KNIFE_INTERVAL;
  recoverT = 0;
  lungeCd = 0;
  decoyTimers: number[] = [];
  /** Phase 3: the crowd each of them walks with. */
  readonly escort = new Map<Guard, CivGroup>();
  private pattern = 0;
  private rng = new Rng(99);

  constructor(private w: World) {
    const boss = w.guards.find((g) => g.kind === 'boss');
    if (!boss) throw new Error('arena has no boss');
    this.boss = boss;
  }

  get defeated(): boolean {
    return !this.boss.alive;
  }

  /** No damage lands while he speaks or changes phase. */
  get invulnerable(): boolean {
    return this.script !== null;
  }

  get balconyY(): number {
    return (GROUND_ROW - ARENA.balconyH) * TILE;
  }

  get balconyRange(): [number, number] {
    const b = ARENA.belfry;
    return [(b.tx + 0.8) * TILE, (b.tx + b.tw - 0.8) * TILE];
  }

  onBalcony(g: Guard): boolean {
    const [x0, x1] = this.balconyRange;
    return g.body.onGround && Math.abs(g.feet - this.balconyY) < 4 && g.cx >= x0 - 8 && g.cx <= x1 + 8;
  }

  // ---------- per-frame ----------

  update(dt: number): void {
    if (this.defeated) return;
    this.lungeCd = Math.max(0, this.lungeCd - dt);
    if (this.phase === 2 && !this.script) this.updateWaves(dt);
    if (this.phase === 3) {
      this.updateDecoys(dt);
      this.followCrowds();
    }
  }

  private groupCenter(grp: CivGroup): number | null {
    const walkers = grp.members.filter((c) => c.state === 'walk');
    if (!walkers.length) return null;
    return walkers.reduce((s, c) => s + c.x, 0) / walkers.length;
  }

  /** Unaware, he and his decoys keep pace with their crowd, as one more face in it. */
  private followCrowds(): void {
    for (const [g, grp] of this.escort) {
      if (!g.alive || g.state !== 'patrol') continue;
      const x = this.groupCenter(grp);
      if (x === null) continue;
      g.minX = g.maxX = x + (g.id % 2 === 0 ? 10 : -10);
    }
  }

  /** Runs before the regular guard AI. Returns true when it handled the frame. */
  control(g: Guard, dt: number): boolean {
    if (g.state !== 'combat') this.move = null;
    const s = this.script;
    if (!s) {
      // Until the crowd phase he never loses track of the player.
      if (this.phase < 3 && (g.state === 'patrol' || g.state === 'search' || g.state === 'suspicious')) enterCombat(g, this.w, false);
      if (this.phase === 3 && g.state === 'combat') {
        for (const d of this.decoys) if (d.alive && d.state !== 'combat') enterCombat(d, this.w, false);
      }
      return false;
    }
    const p = this.w.player;
    const b = g.body;
    s.t += dt;
    g.attack.phase = 'none';
    switch (s.kind) {
      case 'intro':
        b.vx = 0;
        g.facing = p.cx >= g.cx ? 1 : -1;
        if (Math.abs(p.cx - g.cx) < 460 || s.t > 6) {
          this.w.message(`${BOSS.title} ${BOSS.name}「${LINES[1]}」`, '#ffd0a0');
          this.w.sound('horn');
          this.script = null;
          enterCombat(g, this.w, false);
        }
        break;
      case 'transition':
        b.vx = approach(b.vx, 0, 600 * dt);
        if (s.t >= TRANSITION_TIME) this.beginPhase(s.to);
        break;
      case 'leap':
        if (b.onGround && s.t > 0.2) {
          if (this.onBalcony(g)) this.endLeap(g);
          else if (s.t > 2.5) {
            // Missed the ledge: land him there anyway.
            b.x = (this.balconyRange[0] + this.balconyRange[1]) / 2 - b.w / 2;
            b.y = this.balconyY - b.h;
            this.endLeap(g);
          }
        } else if (s.t > 3) {
          b.x = (this.balconyRange[0] + this.balconyRange[1]) / 2 - b.w / 2;
          b.y = this.balconyY - b.h;
          b.vx = b.vy = 0;
          b.onGround = true;
          this.endLeap(g);
        }
        break;
    }
    physics(g, this.w, dt);
    return true;
  }

  /** Combat behaviour, called in place of the regular guard combat. */
  fight(g: Guard, dt: number, seen: boolean): void {
    const w = this.w;
    const p = w.player;
    const b = g.body;
    if (this.move) return this.updateMove(g, dt);
    if (this.recoverT > 0) {
      this.recoverT -= dt;
      b.vx = approach(b.vx, 0, 600 * dt);
      return;
    }
    if (this.phase === 3) {
      if (!seen) {
        g.lostT += dt;
        if (g.lostT > 3) {
          w.combat.release(g);
          g.setState('search');
          g.awareness = 0.6;
          return;
        }
      } else g.lostT = 0;
    }
    const dx = p.cx - g.cx;
    const dy = p.feet - g.feet;
    g.facing = (sign(dx) || g.facing) as 1 | -1;

    if (this.phase === 2) {
      if (!this.onBalcony(g)) return this.startLeap(g);
      const [x0, x1] = this.balconyRange;
      const playerOnBalcony = Math.abs(dy) < 30 && p.cx > x0 - 40 && p.cx < x1 + 40;
      if (!playerOnBalcony) {
        b.vx = 0;
        this.knifeT -= dt;
        // He waits for a climber to come to him rather than knock them off the wall.
        if (this.knifeT <= 0 && !p.dead && !p.climbing) {
          this.knifeT = KNIFE_INTERVAL;
          this.throwKnife(g);
        }
        return;
      }
      if (Math.abs(dx) > REACH - 6) {
        const tx = clamp(p.cx - sign(dx) * 24, x0, x1);
        if (Math.abs(tx - g.cx) > 6) {
          b.vx = sign(tx - g.cx) * APPROACH_SPEED;
          return;
        }
      }
    } else if (Math.abs(dy) > 30 || Math.abs(dx) > REACH - 6) {
      const level = Math.abs(dy) < 30 && b.onGround;
      if (level && Math.abs(dx) > 110 && Math.abs(dx) < 260 && this.lungeCd <= 0 && !p.dead && w.combat.request(g)) {
        return this.startMove(g, 'lunge');
      }
      navigateTo(g, w, p.cx - sign(dx) * 24, p.feet, APPROACH_SPEED, dt);
      g.facing = (sign(dx) || g.facing) as 1 | -1;
      return;
    }
    b.vx = 0;
    if (!p.dead && w.combat.request(g)) {
      const kind = PATTERN[this.pattern % PATTERN.length];
      this.pattern++;
      this.startMove(g, kind === 'lunge' ? 'combo' : kind);
    }
  }

  // ---------- attacks ----------

  startMove(g: Guard, kind: BossMoveKind): void {
    const windup = kind === 'heavy' ? 0.8 : kind === 'lunge' ? 0.5 : 0.45;
    this.move = { kind, phase: 'windup', t: windup, hits: kind === 'combo' ? 3 : 1, struck: false };
    g.attack.phase = 'windup';
    g.attack.heavy = kind !== 'combo';
    if (kind === 'lunge') this.lungeCd = 4;
    this.w.sound(kind === 'combo' ? 'windup' : 'windupHeavy');
  }

  private updateMove(g: Guard, dt: number): void {
    const m = this.move!;
    const w = this.w;
    const b = g.body;
    m.t -= dt;
    g.attack.phase = m.phase;
    if (m.phase === 'active' && m.kind === 'lunge') {
      b.vx = g.facing * LUNGE_SPEED;
      if (!m.struck && this.reaches(g, 30)) {
        m.struck = true;
        w.player.receiveHit(w, g.cx, 3, { unblockable: true });
      }
    } else b.vx = approach(b.vx, 0, 900 * dt);
    if (m.t > 0) return;
    if (m.phase === 'windup') {
      m.phase = 'active';
      m.t = m.kind === 'lunge' ? LUNGE_TIME : 0.12;
      w.sound('swingEnemy');
      w.noise(g.cx, g.feet, 260, 'clash');
      if (m.kind === 'lunge') return;
      b.vx = g.facing * 90;
      if (this.reaches(g, m.kind === 'heavy' ? 36 : 30)) this.strike(g, m.kind === 'heavy' ? 4 : 2, m.kind === 'heavy');
    } else if (m.phase === 'active') {
      m.hits--;
      if (m.hits > 0 && this.move === m) {
        // Next blow of the combo, turned toward wherever the player went.
        m.phase = 'windup';
        m.t = 0.28;
        g.facing = (sign(w.player.cx - g.cx) || g.facing) as 1 | -1;
        w.sound('windup');
      } else {
        m.phase = 'recover';
        m.t = m.kind === 'heavy' ? 0.6 : 0.45;
      }
    } else {
      this.move = null;
      g.attack.phase = 'none';
      this.recoverT = 0.25;
      w.combat.release(g);
    }
  }

  private reaches(g: Guard, reach: number): boolean {
    const p = this.w.player;
    const fx = g.cx + g.facing * (g.body.w / 2 + 12);
    return Math.abs(p.cx - fx) < reach && Math.abs(p.feet - g.feet) < 30;
  }

  private strike(g: Guard, dmg: number, unblockable: boolean): void {
    const w = this.w;
    const res = w.player.receiveHit(w, g.cx, dmg, { unblockable });
    const fx = g.cx + g.facing * (g.body.w / 2 + 12);
    if (res === 'parry') {
      this.move = null;
      staggerGuard(w, g, 1.1, true);
      w.sound('parry');
      w.fx.sparks(fx, g.body.y + 16, 14);
      w.hitStop(0.1);
    } else if (res === 'block') {
      w.sound('block');
      w.fx.sparks(fx, g.body.y + 16, 6);
    }
  }

  private throwKnife(g: Guard): void {
    const w = this.w;
    const p = w.player;
    const sx = g.cx + g.facing * 10;
    const sy = g.body.y + 14;
    const dx = p.cx - sx;
    const dy = p.cy - sy;
    const t = Math.max(0.15, Math.hypot(dx, dy) / 560);
    // Aim high enough to make up for the drop of a thrown knife (400 px/s²).
    w.addProjectile('knife', sx, sy, dx / t, dy / t - 200 * t, false);
    w.sound('swing');
  }

  // ---------- damage ----------

  /** Apply damage to the grand master. Returns true if it killed him. */
  damage(g: Guard, dmg: number, how: KillKind): boolean {
    if (!g.alive || this.invulnerable) return false;
    const floor = PHASE_FLOOR[this.phase];
    g.hp = Math.max(floor, g.hp - dmg);
    g.hurtT = 0.2;
    if (g.hp <= 0) {
      this.finishing = true;
      this.w.killGuard(g, how);
      this.finishing = false;
      return true;
    }
    if (g.hp <= floor) this.startTransition(g, (this.phase + 1) as BossPhase);
    else this.w.alertGuard(g);
    return false;
  }

  /** An assassination or counter that would have killed anyone else. */
  onKillBlow(g: Guard, how: KillKind): void {
    const w = this.w;
    if (g.kind === 'decoy') return this.unmaskDecoy(g);
    if (this.invulnerable) return;
    const dmg = how === 'counter' ? COUNTER_DAMAGE : how === 'knife' ? KNIFE_DAMAGE : STEALTH_DAMAGE[this.phase];
    w.fx.blood(g.cx, g.body.y + 16, sign(g.cx - w.player.cx) || 1, 10);
    w.shake(4);
    w.hitStop(0.08);
    const phase = this.phase;
    if (this.damage(g, dmg, how) || this.script || how === 'knife') return;
    if (phase === 3 && how !== 'counter') {
      w.message('総長は煙に紛れた！', '#ffd0a0');
      this.scatter();
      return;
    }
    staggerGuard(w, g, how === 'counter' ? 0.6 : 0.9, false);
  }

  // ---------- phases ----------

  private startTransition(g: Guard, to: BossPhase): void {
    const w = this.w;
    this.move = null;
    g.attack.phase = 'none';
    g.climbing = false;
    w.combat.release(g);
    this.script = { kind: 'transition', t: 0, to };
    g.setState('combat');
    w.message(`${BOSS.name}「${LINES[to]}」`, '#ffd0a0');
    w.shake(8);
    w.sound('horn');
  }

  private beginPhase(to: BossPhase): void {
    const g = this.boss;
    this.phase = to;
    this.script = null;
    if (to === 2) {
      this.wave = 0;
      this.waveT = 0;
      this.spawnWave();
      this.startLeap(g);
    } else if (to === 3) {
      for (const m of this.minions) if (m.alive) this.vanish(m);
      this.minions = [];
      this.spawnCrowd();
      for (let i = 0; i < 2; i++) this.spawnDecoy();
      this.scatter();
    }
  }

  private startLeap(g: Guard): void {
    const b = g.body;
    const [x0, x1] = this.balconyRange;
    const tx = (x0 + x1) / 2;
    const rise = g.feet - this.balconyY;
    const apex = Math.max(rise, 0) + 60;
    const vy = Math.sqrt(2 * GRAVITY * apex);
    const fall = Math.sqrt(2 * (apex - rise) / GRAVITY);
    const time = vy / GRAVITY + fall;
    g.climbing = false;
    b.vy = -vy;
    b.vx = (tx - g.cx) / time;
    b.onGround = false;
    g.facing = (sign(b.vx) || g.facing) as 1 | -1;
    this.script = { kind: 'leap', t: 0 };
    this.w.sound('jump');
  }

  private endLeap(g: Guard): void {
    g.body.vx = 0;
    this.script = null;
    this.knifeT = 1.2;
    enterCombat(g, this.w, false);
  }

  private updateWaves(dt: number): void {
    if (this.minions.some((m) => m.alive)) return;
    this.waveT += dt;
    if (this.waveT < WAVE_GAP) return;
    this.waveT = 0;
    this.wave = (this.wave + 1) % WAVES.length;
    this.spawnWave();
  }

  spawnWave(): void {
    const w = this.w;
    const P = ARENA.plaza;
    this.minions = [];
    WAVES[this.wave].forEach((kind, i) => {
      let x = (i % 2 === 0 ? P.x0 + 1 : P.x1 - 1) * TILE;
      let y = GROUND_Y;
      if (kind === 'archer') {
        x = (ARENA.perch.tx + ARENA.perch.tw / 2) * TILE;
        y = (GROUND_ROW - ARENA.perch.h) * TILE;
      }
      const g = new Guard(kind, { x, y, minX: x, maxX: x, facing: x < w.player.cx ? 1 : -1, district: 0 });
      g.reinforcement = true;
      w.guards.push(g);
      this.minions.push(g);
      w.fx.smoke(x, y - 20, 30);
      enterCombat(g, w, false);
    });
    w.message('騎士団の手下が現れた！', '#ff9a7a');
  }

  // ---------- crowd & decoys ----------

  private spawnCrowd(): void {
    const w = this.w;
    const P = ARENA.plaza;
    for (let i = 0; i < 3; i++) {
      const x = (P.x0 + 6 + i * 16) * TILE;
      const grp = new CivGroup(i % 2 === 0 ? 1 : -1, this.rng.range(30, 40), P.x0 * TILE, P.x1 * TILE, this.rng);
      for (let k = 0; k < 4; k++) {
        const c = new Civilian(x + k * 13, GROUND_Y, grp, this.rng);
        grp.members.push(c);
        w.civilians.push(c);
      }
      w.groups.push(grp);
    }
  }

  private spawnDecoy(): Guard {
    const crowds = this.crowdsAwayFromPlayer();
    const grp = crowds.length ? crowds[this.rng.int(0, crowds.length - 1)] : null;
    const x = (grp && this.groupCenter(grp)) ?? this.crowdSpot();
    const d = new Guard('decoy', { x, y: GROUND_Y, minX: x, maxX: x, facing: this.rng.chance(0.5) ? 1 : -1, district: 0 });
    this.w.guards.push(d);
    this.decoys.push(d);
    if (grp) this.escort.set(d, grp);
    this.w.fx.smoke(x, GROUND_Y - 20, 30);
    return d;
  }

  /** Crowds by distance from the player, farthest first. */
  private crowdsAwayFromPlayer(): CivGroup[] {
    const px = this.w.player.cx;
    const dist = (grp: CivGroup): number => Math.abs((this.groupCenter(grp) ?? grp.members[0]?.x ?? px) - px);
    return this.w.groups.filter((grp) => grp.members.some((c) => c.alive)).sort((a, b) => dist(b) - dist(a));
  }

  /** A spot in the square, away from the player when possible. */
  private crowdSpot(): number {
    const P = ARENA.plaza;
    const px = this.w.player.cx;
    for (let i = 0; i < 20; i++) {
      const x = this.rng.range((P.x0 + 2) * TILE, (P.x1 - 2) * TILE);
      if (Math.abs(x - px) > 220) return x;
    }
    return px < ((P.x0 + P.x1) / 2) * TILE ? (P.x1 - 3) * TILE : (P.x0 + 3) * TILE;
  }

  /** Smoke: he and his decoys slip back into the crowd, unaware of the player again. */
  scatter(): void {
    const w = this.w;
    this.move = null;
    w.combat.reset();
    const crowds = this.crowdsAwayFromPlayer();
    // The real one takes the crowd farthest from the player; the decoys take the others.
    [this.boss, ...this.decoys.filter((d) => d.alive)].forEach((g, i) => {
      w.fx.smoke(g.cx, g.body.y + 20, 50);
      const grp = crowds.length ? crowds[i % crowds.length] : null;
      const x = (grp && this.groupCenter(grp)) ?? this.crowdSpot();
      if (grp) this.escort.set(g, grp);
      const b = g.body;
      b.x = x - b.w / 2;
      b.y = GROUND_Y - b.h;
      b.vx = b.vy = 0;
      g.climbing = false;
      g.attack.phase = 'none';
      g.minX = g.maxX = g.cx;
      g.awareness = 0;
      g.lastKnown = null;
      g.waitT = 0;
      g.setState('patrol');
      w.fx.smoke(g.cx, g.body.y + 20, 40);
    });
    w.sound('smoke');
  }

  private unmaskDecoy(d: Guard): void {
    const w = this.w;
    const p = w.player;
    this.vanish(d);
    this.decoys = this.decoys.filter((x) => x !== d);
    this.decoyTimers.push(DECOY_RESPAWN);
    w.message('影武者だ！ 本物が襲ってくる', '#ff9a7a');
    const g = this.boss;
    if (!g.alive || this.script) return;
    // The real one bursts out of the crowd beside the player and lunges.
    if (p.body.onGround && Math.abs(p.feet - GROUND_Y) < 4 && g.state !== 'combat') {
      const P = ARENA.plaza;
      const side = this.rng.chance(0.5) ? 1 : -1;
      let x = p.cx + side * 170;
      if (x < P.x0 * TILE || x > P.x1 * TILE) x = p.cx - side * 170;
      w.fx.smoke(g.cx, g.body.y + 20, 40);
      g.body.x = x - g.body.w / 2;
      g.body.y = GROUND_Y - g.body.h;
      g.body.vx = 0;
      w.fx.smoke(x, GROUND_Y - 20, 40);
    }
    enterCombat(g, w, true);
    g.facing = (sign(p.cx - g.cx) || 1) as 1 | -1;
    if (Math.abs(p.feet - g.feet) < 30 && Math.abs(p.cx - g.cx) < 260) {
      w.combat.reset();
      w.combat.request(g);
      this.startMove(g, 'lunge');
    }
  }

  /** Remove a guard in a puff of smoke, leaving no body behind. */
  private vanish(g: Guard): void {
    const w = this.w;
    w.combat.release(g);
    w.fx.smoke(g.cx, g.body.y + 20, 40);
    w.sound('smoke');
    w.guards = w.guards.filter((x) => x !== g);
    g.setState('dead');
  }

  private updateDecoys(dt: number): void {
    for (let i = 0; i < this.decoyTimers.length; i++) this.decoyTimers[i] -= dt;
    const ready = this.decoyTimers.filter((t) => t <= 0).length;
    this.decoyTimers = this.decoyTimers.filter((t) => t > 0);
    for (let i = 0; i < ready; i++) this.spawnDecoy();
  }
}

function physics(g: Guard, w: World, dt: number): void {
  if (g.climbing) return;
  applyGravity(g.body, dt);
  moveBody(g.body, w.map, dt);
}
