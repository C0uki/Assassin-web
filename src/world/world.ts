import type { Input } from '../core/input';
import { Rect, overlaps, sign } from '../core/math';
import { Rng } from '../core/rng';
import { CivGroup, Civilian } from '../entities/civilian';
import type { Corpse } from '../entities/corpse';
import { Guard } from '../entities/guard';
import { Player } from '../entities/player';
import { Projectile, makeProjectile } from '../entities/projectile';
import { Fx } from '../render/fx';
import { enterCombat, updateGuard } from '../systems/ai';
import { CombatDirector, guardTakesHit } from '../systems/combat';
import {
  PlayerStats,
  SaveData,
  StorageLike,
  TOTAL_DOCS,
  statsFor,
  unlockedUpgrades,
  writeSave,
} from '../systems/progress';
import type { Smoke } from '../systems/stealth';
import { CityDef, GROUND_Y, HideoutDef, PickupKind, districtAt } from './city';
import { lineOfSight } from './los';
import { TileMap } from './tilemap';

export type NoiseKind = 'step' | 'land' | 'clash' | 'shout' | 'alarm' | 'scream';

export interface Noise {
  x: number;
  y: number;
  r: number;
  kind: NoiseKind;
}

export interface Message {
  text: string;
  color: string;
  t: number;
}

export interface Doc {
  id: string;
  x: number;
  y: number;
}

export interface Pickup {
  id: string;
  kind: PickupKind;
  x: number;
  y: number;
  /** Seconds until it reappears; 0 while it is lying there. */
  respawnT: number;
  /** Dropped by an enemy: gone for good once taken. */
  dropped: boolean;
}

export const FOOD_HEAL = 2;
export const PICKUP_RESPAWN = 90;
export const FOOD_DROP_CHANCE = 0.25;

export interface Hideout extends HideoutDef {
  found: boolean;
}

export type KillKind = 'assassinate' | 'air' | 'hay' | 'counter' | 'combat' | 'knife';
export type WorldMode = 'campaign' | 'training';

const STEALTH_KILLS: KillKind[] = ['assassinate', 'air', 'hay'];
const ACTIVE_RANGE = 1400;

export class World {
  readonly map: TileMap;
  player: Player;
  guards: Guard[] = [];
  civilians: Civilian[] = [];
  groups: CivGroup[] = [];
  corpses: Corpse[] = [];
  projectiles: Projectile[] = [];
  smokes: Smoke[] = [];
  docs: Doc[] = [];
  pickups: Pickup[] = [];
  hideouts: Hideout[];
  heardNoises: Noise[] = [];
  private pendingNoises: Noise[] = [];
  sounds: string[] = [];
  messages: Message[] = [];
  readonly fx = new Fx();
  readonly combat = new CombatDirector();
  playerStats: PlayerStats;
  hitStopT = 0;
  shakeAmt = 0;
  time = 0;
  eagleVision = false;
  jumpHeld = false;
  combatActive = false;
  alertT = [0, 0, 0];
  reinforceT = -1;
  reinforceCd = 0;
  playerDeadT = -1;
  district = -1;
  bannerT = 0;
  victoryT = -1;
  civKillsThisLife = 0;
  readonly killCounts: Record<KillKind, number> = { assassinate: 0, air: 0, hay: 0, counter: 0, combat: 0, knife: 0 };
  readonly healCounts: Record<PickupKind, number> = { food: 0, potion: 0 };
  breakfalls = 0;
  /** Overridable for tests. */
  random: () => number = Math.random;
  /** Where the tutorial wants the player to go next. */
  marker: { x: number; y: number } | null = null;

  constructor(
    readonly city: CityDef,
    readonly save: SaveData,
    private storage: StorageLike | null,
    readonly mode: WorldMode = 'campaign',
  ) {
    this.map = city.map;
    this.playerStats = statsFor(save.docs.length);
    this.hideouts = city.hideouts.map((h) => ({ ...h, found: save.hideoutsFound.includes(h.id) }));
    const home = this.respawnPoint();
    const s = this.playerStats;
    this.player = new Player(home.x, home.y, s.maxHp, s.maxKnives, s.maxSmokes, s.maxPotions);
    this.spawnEntities();
  }

  // ---------- setup ----------

  respawnPoint(): { x: number; y: number } {
    const h = this.hideouts.find((x) => x.id === this.save.hideout) ?? this.hideouts[0];
    return h ? { x: h.x + h.w / 2, y: h.y + h.h } : { x: 200, y: GROUND_Y };
  }

  spawnEntities(): void {
    const killed = new Set(this.save.targetsKilled);
    this.guards = this.city.guards.filter((s) => !s.targetId || !killed.has(s.targetId)).map((s) => new Guard(s.kind, s));
    const rng = new Rng(4242);
    this.groups = [];
    this.civilians = [];
    for (const gs of this.city.civGroups) {
      const g = new CivGroup(rng.chance(0.5) ? 1 : -1, rng.range(30, 44), gs.minX, gs.maxX, rng);
      for (let i = 0; i < gs.count; i++) {
        const c = new Civilian(gs.x + i * 13 + rng.range(-3, 3), GROUND_Y, g, rng);
        g.members.push(c);
        this.civilians.push(c);
      }
      this.groups.push(g);
    }
    const taken = new Set(this.save.docs);
    this.docs = this.city.docs.filter((d) => !taken.has(d.id)).map((d) => ({ ...d }));
    this.pickups = this.city.pickups.map((p) => ({ ...p, respawnT: 0, dropped: false }));
    this.corpses = [];
    this.projectiles = [];
    this.smokes = [];
    this.combat.reset();
    this.alertT = [0, 0, 0];
    this.reinforceT = -1;
    this.reinforceCd = 0;
    this.civKillsThisLife = 0;
  }

  respawn(): void {
    this.spawnEntities();
    const p = this.respawnPoint();
    const s = this.playerStats;
    this.player.respawn(p.x, p.y, s.maxHp, s.maxKnives, s.maxSmokes, s.maxPotions);
    this.playerDeadT = -1;
    this.persist();
  }

  persist(): void {
    writeSave(this.storage, this.save);
  }

  // ---------- services used by entities ----------

  noise(x: number, y: number, r: number, kind: NoiseKind): void {
    this.pendingNoises.push({ x, y, r, kind });
  }

  sound(name: string): void {
    if (this.sounds.length < 16 && !this.sounds.includes(name)) this.sounds.push(name);
  }

  message(text: string, color = '#f2e6c8'): void {
    if (this.messages.some((m) => m.text === text && m.t > 2)) return;
    this.messages.push({ text, color, t: 3.2 });
    if (this.messages.length > 4) this.messages.shift();
  }

  shake(n: number): void {
    this.shakeAmt = Math.max(this.shakeAmt, n);
  }

  hitStop(t: number): void {
    this.hitStopT = Math.max(this.hitStopT, t);
  }

  isAlert(d: number): boolean {
    return this.alertT[d] > 0;
  }

  raiseAlert(d: number): void {
    this.alertT[d] = 30;
  }

  anyGuardInCombat(): boolean {
    return this.guards.some((g) => g.state === 'combat');
  }

  inSmoke(x: number, y: number): boolean {
    return this.smokes.some((s) => s.life > 0 && Math.hypot(s.x - x, (s.y - y) * 1.3) < s.r);
  }

  walkingCivilians(): Civilian[] {
    return this.civilians.filter((c) => c.state === 'walk');
  }

  /** Center x of a hay cart below the given feet position, if any. */
  hayBelow(cx: number, feet: number, maxDx: number): number | null {
    let best: number | null = null;
    for (const h of this.city.hays) {
      const hx = (h.tx + h.tw / 2) * 32;
      if (h.ty * 32 < feet - 4) continue;
      if (Math.abs(hx - cx) < maxDx + h.tw * 16 && (best === null || Math.abs(hx - cx) < Math.abs(best - cx))) best = hx;
    }
    return best;
  }

  knifeTarget(sx: number, sy: number, facing: number): Guard | null {
    let best: Guard | null = null;
    let bestD = Infinity;
    for (const g of this.guards) {
      if (!g.alive) continue;
      const dx = g.cx - sx;
      const dy = g.body.y + 14 - sy;
      if (dx * facing <= 0 || Math.abs(dx) > 450 || Math.abs(dy) > 160) continue;
      const d = Math.hypot(dx, dy);
      if (d < bestD && lineOfSight(this.map, sx, sy, g.cx, g.body.y + 14)) {
        best = g;
        bestD = d;
      }
    }
    return best;
  }

  addProjectile(kind: Projectile['kind'], x: number, y: number, vx: number, vy: number, fromPlayer: boolean): void {
    this.projectiles.push(makeProjectile(kind, x, y, vx, vy, fromPlayer));
  }

  addSmoke(x: number, y: number): void {
    const s: Smoke = { x, y, r: 95, life: 4.5 };
    this.smokes.push(s);
    this.fx.smoke(x, y, s.r);
    this.sound('smoke');
    this.panic(x, 160);
  }

  panic(x: number, r: number): void {
    let any = false;
    for (const c of this.civilians) {
      if (!c.alive || Math.abs(c.x - x) > r) continue;
      if (c.state !== 'flee') any = true;
      c.state = 'flee';
      c.t = 4;
      c.fleeDir = (sign(c.x - x) || 1) as 1 | -1;
    }
    if (any) this.sound('panic');
  }

  /** Restore health from a potion or food, capped at the maximum. */
  heal(amount: number, from: PickupKind): void {
    const p = this.player;
    const before = p.hp;
    p.hp = Math.min(this.playerStats.maxHp, p.hp + amount);
    this.healCounts[from]++;
    this.sound(from === 'potion' ? 'heal' : 'eat');
    this.fx.sparkle(p.cx, p.cy, 10);
    this.message(`${from === 'potion' ? '薬を飲んだ' : '食べ物を食べた'}（体力 +${p.hp - before}）`, '#b6ff9f');
  }

  dropFood(x: number, y: number): void {
    this.pickups.push({ id: `drop${this.pickups.length}`, kind: 'food', x, y: y - 12, respawnT: 0, dropped: true });
  }

  alertGuard(g: Guard): void {
    if (g.state !== 'combat') enterCombat(g, this, true);
  }

  playerSwing(p: Player, hitbox: Rect, dmg: number, step: number): void {
    for (const g of this.guards) {
      if (!g.alive || p.swingHit.has(g) || !overlaps(hitbox, g.body)) continue;
      p.swingHit.add(g);
      guardTakesHit(this, g, dmg, step, p.cx);
    }
    for (const c of this.civilians) {
      if (!c.alive || p.swingHit.has(c)) continue;
      if (overlaps(hitbox, { x: c.x - c.w / 2, y: c.y - c.h, w: c.w, h: c.h })) {
        p.swingHit.add(c);
        this.killCivilian(c);
      }
    }
  }

  killGuard(g: Guard, how: KillKind): void {
    if (!g.alive) return;
    const p = this.player;
    this.combat.release(g);
    const wasCombat = g.state === 'combat' || g.state === 'staggered';
    g.setState('dead');
    g.hp = 0;
    g.climbing = false;
    g.attack.phase = 'none';
    g.body.vx = how === 'combat' || how === 'knife' ? sign(g.cx - p.cx) * 140 : 0;
    this.fx.blood(g.cx, g.body.y + 16, sign(g.cx - p.cx) || 1, how === 'combat' ? 8 : 12);
    this.corpses.push({ x: g.cx, y: g.feet, discovered: how === 'hay' || this.anyGuardInCombat() });
    if (STEALTH_KILLS.includes(how) && !wasCombat) {
      this.save.stats.assassinations++;
      this.noise(g.cx, g.feet, 50, 'step');
      if (Math.random() < 0.4 && p.knives < this.playerStats.maxKnives) p.knives++;
    } else {
      this.save.stats.combatKills++;
      this.noise(g.cx, g.feet, 200, 'clash');
    }
    this.killCounts[how]++;
    if (this.random() < FOOD_DROP_CHANCE) this.dropFood(g.cx + sign(g.cx - p.cx) * 14, g.feet);
    this.hitStop(0.06);
    this.shake(3);
    if (g.targetId) this.onTargetKilled(g.targetId);
  }

  killCivilian(c: Civilian): void {
    if (!c.alive) return;
    c.state = 'dead';
    c.facing = (sign(c.x - this.player.cx) || 1) as 1 | -1;
    this.fx.blood(c.x, c.y - 20, c.facing, 10);
    this.corpses.push({ x: c.x, y: c.y, discovered: false });
    this.save.stats.civilianKills++;
    this.civKillsThisLife++;
    this.noise(c.x, c.y, 420, 'scream');
    this.panic(c.x, 320);
    this.sound('scream');
    if (this.civKillsThisLife >= 3) {
      this.message('教団の掟を破った……', '#ff6060');
      this.player.damage(this, 999, this.player.cx, false);
    } else this.message('罪なき市民を殺すな！', '#ff7070');
  }

  onTargetKilled(id: string): void {
    const t = this.city.targets.find((x) => x.id === id);
    if (!this.save.targetsKilled.includes(id)) this.save.targetsKilled.push(id);
    if (t) this.message(`${t.title} ${t.name} を始末した`, '#ffd76a');
    this.sound('target');
    if (this.save.targetsKilled.length >= this.city.targets.length) {
      this.save.complete = true;
      this.victoryT = 0;
    }
    this.persist();
  }

  onDetected(newEpisode: boolean): void {
    if (newEpisode) this.save.stats.detections++;
    if (this.mode === 'training') return;
    if (this.reinforceCd <= 0 && this.reinforceT < 0) this.reinforceT = 6;
  }

  onPlayerDeath(): void {
    if (this.mode === 'training') {
      // Nobody dies in training: get straight back up.
      const p = this.player;
      p.hp = this.playerStats.maxHp;
      p.iframes = 1.5;
      p.setState(p.body.onGround ? 'ground' : 'air');
      this.civKillsThisLife = 0;
      this.message('訓練では倒れない。もう一度！', '#ffb0a0');
      return;
    }
    this.save.stats.deaths++;
    this.playerDeadT = 0;
    this.sound('death');
    this.combat.reset();
  }

  // ---------- update ----------

  update(input: Input, dt: number): void {
    this.jumpHeld = input.isHeld('jump');
    this.eagleVision = input.isHeld('eagle') && !this.player.dead;
    this.time += dt;
    if (this.victoryT < 0) this.save.stats.time += dt;
    for (const m of this.messages) m.t -= dt;
    this.messages = this.messages.filter((m) => m.t > 0);
    this.bannerT = Math.max(0, this.bannerT - dt);
    if (this.hitStopT > 0) {
      this.hitStopT -= dt;
      this.fx.update(dt * 0.3);
      return;
    }
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 30);
    this.heardNoises = this.pendingNoises;
    this.pendingNoises = [];

    const p = this.player;
    p.update(this, input, dt);
    this.combat.update(dt);
    for (const g of this.guards) {
      const dx = Math.abs(g.cx - p.cx);
      if (dx < ACTIVE_RANGE || (g.state === 'combat' && dx < ACTIVE_RANGE * 2)) updateGuard(g, this, dt);
    }
    this.updateCivilians(dt);
    this.updateProjectiles(dt);
    for (const s of this.smokes) s.life -= dt;
    for (const it of this.pickups) if (it.respawnT > 0) it.respawnT = Math.max(0, it.respawnT - dt);
    this.smokes = this.smokes.filter((s) => s.life > 0);
    if (!p.dead) {
      this.updatePickups();
      this.updateHideouts();
    }
    const d = districtAt(p.cx);
    if (d !== this.district) {
      this.district = d;
      this.bannerT = 3.5;
    }
    for (let i = 0; i < this.alertT.length; i++) this.alertT[i] = Math.max(0, this.alertT[i] - dt);
    this.updateReinforcements(dt);
    this.combatActive = this.guards.some((g) => g.state === 'combat' && Math.abs(g.cx - p.cx) < 1600);
    if (this.playerDeadT >= 0) this.playerDeadT += dt;
    if (this.victoryT >= 0) this.victoryT += dt;
    this.fx.update(dt);
  }

  private updateCivilians(dt: number): void {
    const px = this.player.cx;
    for (const g of this.groups) {
      if (g.pauseT > 0) g.pauseT -= dt;
      else {
        g.walkT -= dt;
        if (g.walkT <= 0) {
          g.pauseT = 1.5 + Math.random() * 2.5;
          g.walkT = 4 + Math.random() * 6;
        }
      }
      const walkers = g.members.filter((c) => c.state === 'walk');
      if (walkers.some((c) => c.x > g.maxX)) g.dir = -1;
      else if (walkers.some((c) => c.x < g.minX)) g.dir = 1;
    }
    for (const c of this.civilians) {
      if (Math.abs(c.x - px) > ACTIVE_RANGE) continue;
      c.animT += dt;
      const g = c.group;
      switch (c.state) {
        case 'walk':
          if (g.pauseT <= 0) {
            c.x += g.dir * g.speed * dt;
            c.facing = g.dir;
          }
          break;
        case 'flee':
          c.x += c.fleeDir * 125 * dt;
          c.facing = c.fleeDir;
          c.t -= dt;
          if (c.x < g.minX - 120 || c.x > g.maxX + 120) c.x -= c.fleeDir * 125 * dt;
          if (c.t <= 0) c.state = 'walk';
          break;
        case 'stumble':
          c.x += c.fleeDir * 40 * dt;
          c.t -= dt;
          if (c.t <= 0) c.state = 'walk';
          break;
        case 'dead':
          c.deadT += dt;
          break;
      }
    }
  }

  private updateProjectiles(dt: number): void {
    const p = this.player;
    for (const pr of this.projectiles) {
      pr.life -= dt;
      if (pr.kind === 'knife') pr.vy += 400 * dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      if (pr.life <= 0) pr.dead = true;
      else if (this.map.isSolidAt(pr.x, pr.y)) {
        pr.dead = true;
        this.fx.sparks(pr.x, pr.y, 4);
        this.sound('clink');
      }
      if (pr.dead) continue;
      if (pr.fromPlayer) {
        for (const g of this.guards) {
          if (!g.alive) continue;
          const b = g.body;
          if (pr.x > b.x - 4 && pr.x < b.x + b.w + 4 && pr.y > b.y && pr.y < b.y + b.h) {
            pr.dead = true;
            const dmg = g.kind === 'elite' ? 3 : 5;
            if (g.hp <= dmg) this.killGuard(g, 'knife');
            else {
              g.hp -= dmg;
              g.hurtT = 0.2;
              this.fx.blood(g.cx, b.y + 16, sign(pr.vx) || 1, 5);
              this.sound('hit');
              this.alertGuard(g);
            }
            break;
          }
        }
        if (pr.dead) continue;
        for (const c of this.civilians) {
          if (c.alive && Math.abs(pr.x - c.x) < c.w / 2 + 2 && pr.y > c.y - c.h && pr.y < c.y) {
            pr.dead = true;
            this.killCivilian(c);
            break;
          }
        }
      } else {
        const b = p.body;
        if (pr.x > b.x && pr.x < b.x + b.w && pr.y > b.y && pr.y < b.y + b.h) {
          const res = p.receiveHit(this, pr.x - sign(pr.vx) * 30, 2, { ranged: true });
          if (res !== 'miss') pr.dead = true;
          if (res === 'block') {
            this.sound('block');
            this.fx.sparks(pr.x, pr.y, 5);
          }
        }
      }
    }
    this.projectiles = this.projectiles.filter((x) => !x.dead);
  }

  private updatePickups(): void {
    const p = this.player;
    for (const it of this.pickups) {
      if (it.respawnT > 0 || Math.abs(it.x - p.cx) > 18 || Math.abs(it.y - p.cy) > 32) continue;
      if (it.kind === 'food') {
        if (p.hp >= this.playerStats.maxHp) continue;
        this.heal(FOOD_HEAL, 'food');
      } else {
        if (p.potions >= this.playerStats.maxPotions) continue;
        p.potions++;
        this.message(`薬を手に入れた (${p.potions}/${this.playerStats.maxPotions})`, '#9fffc8');
        this.sound('pickup');
      }
      it.respawnT = it.dropped ? -1 : PICKUP_RESPAWN;
    }
    this.pickups = this.pickups.filter((it) => it.respawnT >= 0);
    for (const d of this.docs) {
      if (Math.abs(d.x - p.cx) < 18 && Math.abs(d.y - p.cy) < 32) {
        this.docs = this.docs.filter((x) => x !== d);
        const before = unlockedUpgrades(this.save.docs.length).length;
        this.save.docs.push(d.id);
        const n = this.save.docs.length;
        this.message(`古文書を手に入れた (${n}/${TOTAL_DOCS})`, '#9fd0ff');
        this.sound('pickup');
        const unlocked = unlockedUpgrades(n);
        if (unlocked.length > before) {
          const old = this.playerStats;
          this.playerStats = statsFor(n);
          p.hp += this.playerStats.maxHp - old.maxHp;
          p.knives += this.playerStats.maxKnives - old.maxKnives;
          p.smokes += this.playerStats.maxSmokes - old.maxSmokes;
          p.potions += this.playerStats.maxPotions - old.maxPotions;
          this.message(`強化：${unlocked[unlocked.length - 1].label}`, '#b6ff9f');
          this.sound('upgrade');
        }
        this.persist();
        return;
      }
    }
  }

  private updateHideouts(): void {
    const p = this.player;
    const inside = this.hideouts.find((h) => overlaps(p.body, h));
    if (!inside) {
      p.inHideout = false;
      return;
    }
    if (p.inHideout) return;
    p.inHideout = true;
    if (!inside.found) {
      inside.found = true;
      this.save.hideoutsFound.push(inside.id);
      this.message('隠れ家を見つけた', '#f2e6c8');
    }
    this.save.hideout = inside.id;
    if (!this.combatActive) {
      const s = this.playerStats;
      p.hp = s.maxHp;
      p.knives = s.maxKnives;
      p.smokes = s.maxSmokes;
      p.potions = s.maxPotions;
      this.message('隠れ家で休息した（体力・装備が回復）', '#c8f2d0');
      this.sound('save');
    }
    this.persist();
  }

  private updateReinforcements(dt: number): void {
    this.reinforceCd = Math.max(0, this.reinforceCd - dt);
    if (this.reinforceT < 0) return;
    this.reinforceT -= dt;
    if (this.reinforceT > 0) return;
    this.reinforceT = -1;
    if (!this.anyGuardInCombat() || this.player.dead) return;
    const alive = this.guards.filter((g) => g.reinforcement && g.alive).length;
    if (alive >= 6) return;
    const p = this.player;
    const d = districtAt(p.cx);
    const dist = this.city.districts[d];
    for (const side of [-1, 1]) {
      const x = Math.min(dist.x1 - 80, Math.max(dist.x0 + 80, p.cx + side * 560));
      const g = new Guard(d === 2 ? 'elite' : 'guard', { x, y: GROUND_Y, minX: x - 150, maxX: x + 150, facing: side > 0 ? -1 : 1, district: d });
      g.reinforcement = true;
      this.guards.push(g);
      enterCombat(g, this, false);
    }
    this.reinforceCd = 45;
    this.message('応援が駆けつけた！', '#ff9a7a');
    this.sound('horn');
  }
}
