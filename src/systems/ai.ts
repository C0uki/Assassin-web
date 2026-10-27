import { approach, dist, sign } from '../core/math';
import type { Guard } from '../entities/guard';
import type { Corpse } from '../entities/corpse';
import { WALK } from '../entities/player';
import { GROUND_Y } from '../world/city';
import { lineOfSight } from '../world/los';
import { TILE } from '../world/tilemap';
import type { Noise, World } from '../world/world';
import { staggerGuard } from './combat';
import { canGrab, edgeAhead, findMantleRow, handsY } from './parkour';
import { applyGravity, moveBody } from './physics';
import { AWARENESS_DECAY, SUSPICIOUS_AT, VISION, canSeePoint, detectionRate, smokeBlocks } from './stealth';

const PATROL_SPEED = 52;
const SEARCH_SPEED = 85;
const CHASE_SPEED = { guard: 165, elite: 150, archer: 120, target: 150 } as const;
const REACH = 40;
const LOST_TIMEOUT = 3.5;

export function guardEye(g: Guard): { x: number; y: number } {
  return { x: g.cx, y: g.body.y + 8 };
}

export function guardSeesPlayer(g: Guard, w: World): boolean {
  const p = w.player;
  if (p.dead || p.hidden || w.inSmoke(p.cx, p.cy)) return false;
  if (g.state === 'stunned' || g.state === 'dead') return false;
  const eye = guardEye(g);
  const combat = g.state === 'combat';
  const points = [p.body.y + 8, p.body.y + 30];
  for (const py of points) {
    const d = Math.hypot(p.cx - eye.x, py - eye.y);
    if (p.blended && !(combat && d < 80)) return false;
    if (combat && d < 150 && lineOfSight(w.map, eye.x, eye.y, p.cx, py) && !smokeBlocks(w.smokes, eye.x, eye.y, p.cx, py)) return true;
    const mul = (combat ? 1.4 : 1) * (w.isAlert(g.district) ? 1.15 : 1);
    if (canSeePoint(w.map, w.smokes, eye.x, eye.y, g.facing, p.cx, py, VISION[g.kind], mul)) return true;
  }
  return false;
}

export function enterCombat(g: Guard, w: World, shout: boolean): void {
  if (g.state === 'combat' || g.state === 'dead') return;
  const newEpisode = !w.anyGuardInCombat();
  g.setState('combat');
  g.awareness = 1;
  g.lostT = 0;
  g.attack.phase = 'none';
  g.lastKnown = { x: w.player.cx, y: w.player.feet };
  if (shout) {
    w.noise(g.cx, g.body.y, 320, 'shout');
    w.sound('alert');
    w.onDetected(newEpisode);
  }
  w.panic(g.cx, 200);
}

function hearNoise(g: Guard, w: World, n: Noise): void {
  if (g.state === 'combat' || g.state === 'stunned' || g.state === 'staggered') return;
  switch (n.kind) {
    case 'shout':
      enterCombat(g, w, false);
      return;
    case 'alarm':
    case 'scream':
      g.setState('search');
      g.lastKnown = { x: n.x, y: n.y };
      g.awareness = Math.max(g.awareness, 0.6);
      return;
    default:
      if (g.state === 'patrol' || g.state === 'suspicious') {
        g.setState('search');
        g.lastKnown = { x: n.x, y: n.y };
        g.awareness = Math.max(g.awareness, SUSPICIOUS_AT + 0.05);
        w.sound('huh');
      } else if (g.state === 'search') g.lastKnown = { x: n.x, y: n.y };
  }
}

function discoverCorpse(g: Guard, w: World, c: Corpse): void {
  c.discovered = true;
  g.setState('search');
  g.lastKnown = { x: c.x, y: c.y };
  g.awareness = Math.max(g.awareness, 0.7);
  w.noise(g.cx, g.body.y, 300, 'alarm');
  w.raiseAlert(g.district);
  w.sound('alarm');
  w.message('死体が発見された！警戒が強まる', '#e0a060');
}

export type NavResult = 'moving' | 'arrived' | 'blocked';

/** Walk / climb / drop toward a point. Guards climb facades but never jump gaps. */
export function navigateTo(g: Guard, w: World, tx: number, ty: number, speed: number, dt: number): NavResult {
  const b = g.body;
  const map = w.map;
  const dx = tx - g.cx;
  const dy = ty - g.feet;
  if (g.climbing) {
    b.vx = 0;
    b.vy = 0;
    if (dy < -8) {
      const ny = b.y - 95 * dt;
      if (map.isClimbableAt(g.cx, handsY(ny))) {
        b.y = ny;
        return 'moving';
      }
      const row = findMantleRow(map, g.cx, b.y);
      g.climbing = false;
      if (row !== null) {
        b.y = row * TILE - b.h;
        b.onGround = true;
        return 'moving';
      }
      return 'blocked';
    }
    g.climbing = false;
  }
  if (dy < -48 && Math.abs(dx) < 24 && b.onGround && canGrab(map, g.cx, b.y)) {
    g.climbing = true;
    b.vx = 0;
    return 'moving';
  }
  if (Math.abs(dx) <= 6) {
    b.vx = 0;
    return dy < -48 ? 'blocked' : 'arrived';
  }
  const dir = sign(dx) as 1 | -1;
  g.facing = dir;
  if (b.onGround && edgeAhead(map, g.cx, g.feet, dir, b.w / 2) && !(dy > 40)) {
    b.vx = 0;
    return 'blocked';
  }
  b.vx = dir * speed;
  return 'moving';
}

function physics(g: Guard, w: World, dt: number): void {
  if (g.climbing) return;
  applyGravity(g.body, dt);
  moveBody(g.body, w.map, dt);
}

function startAttack(g: Guard, w: World): void {
  g.attack.heavy = (g.kind === 'elite' || g.kind === 'target') && Math.random() < 0.35;
  g.attack.phase = 'windup';
  g.attack.t = g.attack.heavy ? 0.75 : 0.5;
  w.sound(g.attack.heavy ? 'windupHeavy' : 'windup');
}

function updateAttack(g: Guard, w: World, dt: number): void {
  const a = g.attack;
  const p = w.player;
  g.body.vx = approach(g.body.vx, 0, 600 * dt);
  a.t -= dt;
  if (a.t > 0) return;
  if (a.phase === 'windup') {
    a.phase = 'active';
    a.t = 0.12;
    g.body.vx = g.facing * 90;
    w.sound('swingEnemy');
    w.noise(g.cx, g.feet, 260, 'clash');
    const fx = g.cx + g.facing * 20;
    if (Math.abs(p.cx - fx) < 28 && Math.abs(p.feet - g.feet) < 30) {
      const res = p.receiveHit(w, g.cx, a.heavy ? 3 : 2, { unblockable: a.heavy });
      if (res === 'parry') {
        staggerGuard(w, g, 1.1, true);
        w.sound('parry');
        w.fx.sparks(fx, g.body.y + 16, 14);
        w.hitStop(0.1);
        return;
      }
      if (res === 'block') {
        w.sound('block');
        w.fx.sparks(fx, g.body.y + 16, 6);
      }
    }
  } else if (a.phase === 'active') {
    a.phase = 'recover';
    a.t = 0.45;
  } else {
    a.phase = 'none';
    w.combat.release(g);
  }
}

function shootArrow(g: Guard, w: World): void {
  const p = w.player;
  const sx = g.cx + g.facing * 10;
  const sy = g.body.y + 14;
  const dx = p.cx - sx;
  const dy = p.cy - sy;
  const d = Math.hypot(dx, dy) || 1;
  w.addProjectile('arrow', sx, sy, (dx / d) * 520, (dy / d) * 520, false);
  w.sound('bow');
}

export function updateGuard(g: Guard, w: World, dt: number): void {
  g.animT += dt;
  g.stateT += dt;
  const b = g.body;
  if (g.state === 'dead') {
    g.deadT += dt;
    b.vx = approach(b.vx, 0, 600 * dt);
    physics(g, w, dt);
    return;
  }
  g.hurtT = Math.max(0, g.hurtT - dt);
  g.blockT = Math.max(0, g.blockT - dt);
  g.shootCd = Math.max(0, g.shootCd - dt);
  const p = w.player;

  if (g.state !== 'stunned' && w.inSmoke(g.cx, b.y + 20)) {
    w.combat.release(g);
    g.attack.phase = 'none';
    g.climbing = false;
    g.stunT = 3.5;
    g.setState('stunned');
  }
  if (g.state === 'stunned') {
    g.stunT -= dt;
    b.vx = 0;
    physics(g, w, dt);
    if (g.stunT <= 0) {
      g.setState('search');
      g.awareness = 0.6;
      g.lastKnown = { x: p.cx, y: p.feet };
    }
    return;
  }
  if (g.state === 'staggered') {
    g.staggerT -= dt;
    b.vx = approach(b.vx, 0, 500 * dt);
    physics(g, w, dt);
    if (g.staggerT <= 0) {
      g.parried = false;
      g.setState('combat');
    }
    return;
  }

  const seen = guardSeesPlayer(g, w);
  g.seesPlayer = seen;
  if (seen) {
    g.lastKnown = { x: p.cx, y: p.feet };
    g.lostT = 0;
  }

  if (g.state !== 'combat') {
    for (const n of w.heardNoises) if (dist(n.x, n.y, g.cx, b.y + 20) <= n.r) hearNoise(g, w, n);
    const eye = guardEye(g);
    for (const c of w.corpses) {
      if (c.discovered) continue;
      if (canSeePoint(w.map, w.smokes, eye.x, eye.y, g.facing, c.x, c.y - 6, VISION[g.kind], 0.8)) discoverCorpse(g, w, c);
    }
  }
  if (g.state !== 'combat') {
    if (seen) {
      const v = VISION[g.kind];
      g.awareness +=
        detectionRate({
          distance: dist(p.cx, p.cy, g.cx, b.y + 8),
          range: v.range,
          freerunning: p.freerun && Math.abs(p.body.vx) > WALK + 20,
          climbing: p.climbing,
          restricted: g.kind === 'archer' && p.feet < GROUND_Y - 40,
          districtAlert: w.isAlert(g.district),
        }) * dt;
    } else g.awareness = Math.max(0, g.awareness - AWARENESS_DECAY * dt);
    if (g.awareness >= 1) enterCombat(g, w, true);
    else if (seen && g.awareness >= SUSPICIOUS_AT && g.state === 'patrol') {
      g.setState('suspicious');
      w.sound('huh');
    }
  }

  switch (g.state) {
    case 'patrol':
      updatePatrol(g, w, dt);
      break;
    case 'suspicious': {
      b.vx = 0;
      if (g.lastKnown) g.facing = g.lastKnown.x >= g.cx ? 1 : -1;
      if (seen && g.lastKnown && Math.abs(g.lastKnown.x - g.cx) > 30 && !edgeAhead(w.map, g.cx, g.feet, g.facing, b.w / 2))
        b.vx = g.facing * 25;
      if (!seen && g.stateT > 1 && g.awareness < 0.15) g.setState('patrol');
      else if (!seen && g.stateT > 2.5) g.setState('search');
      break;
    }
    case 'search':
      updateSearch(g, w, dt);
      break;
    case 'combat':
      updateCombat(g, w, dt, seen);
      break;
  }
  physics(g, w, dt);
}

function updatePatrol(g: Guard, w: World, dt: number): void {
  const b = g.body;
  if (g.minX === g.maxX) {
    if (Math.abs(g.cx - g.minX) > 8 || Math.abs(g.feet - g.homeY) > 40) navigateTo(g, w, g.minX, g.homeY, PATROL_SPEED, dt);
    else {
      b.vx = 0;
      g.lookT += dt;
      if (g.lookT > 4.5) {
        g.lookT = 0;
        g.facing = g.facing > 0 ? -1 : 1;
      }
    }
    return;
  }
  if (g.waitT > 0) {
    b.vx = 0;
    g.waitT -= dt;
    if (g.waitT <= 0) g.facing = g.facing > 0 ? -1 : 1;
    return;
  }
  const tx = g.facing > 0 ? g.maxX : g.minX;
  const res = navigateTo(g, w, tx, g.homeY, PATROL_SPEED, dt);
  if (res !== 'moving' && !g.climbing) {
    g.facing = tx >= g.cx ? 1 : -1;
    g.waitT = 1.4 + Math.random();
  }
}

function updateSearch(g: Guard, w: World, dt: number): void {
  if (g.lastKnown) {
    const res = navigateTo(g, w, g.lastKnown.x, g.lastKnown.y, SEARCH_SPEED, dt);
    if (res !== 'moving' || g.stateT > 9) {
      g.lastKnown = null;
      g.lookT = 0;
    }
    return;
  }
  g.body.vx = 0;
  g.lookT += dt;
  if (Math.floor(g.lookT / 1.3) !== Math.floor((g.lookT - dt) / 1.3)) g.facing = g.facing > 0 ? -1 : 1;
  if (g.lookT > 5) {
    g.setState('patrol');
    g.awareness = Math.min(g.awareness, 0.2);
  }
}

function updateCombat(g: Guard, w: World, dt: number, seen: boolean): void {
  const p = w.player;
  const b = g.body;
  if (!seen) {
    g.lostT += dt;
    if (g.lostT > LOST_TIMEOUT && g.attack.phase === 'none') {
      w.combat.release(g);
      g.setState('search');
      g.awareness = 0.6;
      return;
    }
  }
  if (g.attack.phase !== 'none') return updateAttack(g, w, dt);
  const target = g.lastKnown ?? { x: p.cx, y: p.feet };
  const dx = p.cx - g.cx;
  const dy = p.feet - g.feet;
  if (seen) g.facing = dx >= 0 ? 1 : -1;

  if (g.kind === 'target' && g.hp > 1 && Math.abs(dx) > 50) {
    const away = (sign(g.cx - p.cx) || g.facing) as 1 | -1;
    const res = navigateTo(g, w, g.cx + away * 100, g.feet, CHASE_SPEED.target, dt);
    if (res === 'moving') return;
    g.facing = dx >= 0 ? 1 : -1;
  }
  if (g.kind === 'archer' && Math.abs(dx) > 70) {
    b.vx = 0;
    if (g.drawT > 0) {
      g.drawT -= dt;
      if (g.drawT <= 0) {
        if (seen && !p.dead) shootArrow(g, w);
        g.shootCd = 1.8;
      }
    } else if (seen && g.shootCd <= 0) {
      g.drawT = 0.7;
      w.sound('bowDraw');
    }
    return;
  }
  if (Math.abs(dx) > REACH - 6 || Math.abs(dy) > 30) {
    const stopX = seen ? p.cx - sign(dx) * (REACH * 0.6) : target.x;
    navigateTo(g, w, stopX, seen ? p.feet : target.y, CHASE_SPEED[g.kind], dt);
    if (seen) g.facing = dx >= 0 ? 1 : -1;
    return;
  }
  b.vx = 0;
  if (!p.dead && w.combat.request(g)) startAttack(g, w);
}
