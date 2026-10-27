import { Camera, VIEW_H, VIEW_W } from '../core/camera';
import type { Civilian } from '../entities/civilian';
import type { Guard } from '../entities/guard';
import { Player, WALK } from '../entities/player';
import { VISION } from '../systems/stealth';
import { Building, CityDef, GROUND_Y } from '../world/city';
import { TILE, Tile } from '../world/tilemap';
import type { World } from '../world/world';
import { Background } from './background';
import { drawEagleVision } from './eagleVision';
import {
  FigureStyle,
  Pose,
  airPose,
  attackPose,
  bowPose,
  climbPose,
  deadPose,
  divePose,
  drawFigure,
  guardPose,
  hurtPose,
  idlePose,
  lungePose,
  mantlePose,
  mix,
  rollPose,
  runPose,
  searchPose,
  staggerPose,
  stunnedPose,
  walkPose,
  windupPose,
} from './figures';
import { drawHud } from './hud';

const PALETTE = [
  { wall: ['#6e4c3a', '#5f4334', '#7a5843', '#674836'], roof: '#3f2a20', trim: '#4a3226' },
  { wall: ['#b07e52', '#a37249', '#bb8a5c', '#9c6c45'], roof: '#7a3f2a', trim: '#8a5a38' },
  { wall: ['#d3c2a4', '#c9b593', '#dccbb0', '#c2ad8c'], roof: '#3d5a7a', trim: '#a8946f' },
];

const hash = (a: number, b: number): number => {
  let h = (a * 374761393 + b * 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export const PLAYER_STYLE: FigureStyle = {
  robe: '#ece6d8',
  trim: '#a3262a',
  skin: '#c99a76',
  outline: '#1c1412',
  head: 'hood',
  headColor: '#f6f1e6',
  weapon: 'blade',
  bladeOut: false,
  shield: false,
  cape: true,
  basket: false,
  scale: 1,
};

const TARGET_LOOKS: Record<string, Partial<FigureStyle>> = {
  t1: { robe: '#6a4a2a', head: 'hat', headColor: '#3a2a1a' },
  t2: { robe: '#3a4a3a', head: 'turban', headColor: '#2a3a2a' },
  t3: { robe: '#6a2a3a', head: 'turban', headColor: '#d8c070' },
  t4: { robe: '#3a2a5a', head: 'veil', headColor: '#2a1a3a' },
  t5: { robe: '#2a2a3a', head: 'helmet', headColor: '#e0c060', shield: true },
  t6: { robe: '#e8e0d0', head: 'mitre', headColor: '#e0c060', weapon: 'staff' },
};

export function guardStyle(g: Guard): FigureStyle {
  const combat = g.state === 'combat' || g.state === 'staggered';
  const base: FigureStyle = {
    robe: '#7d2a22',
    trim: '#c8a24a',
    skin: '#b88a66',
    outline: '#1a1010',
    head: 'helmet',
    headColor: '#9aa0a6',
    weapon: combat ? 'sword' : 'spear',
    bladeOut: true,
    shield: false,
    cape: false,
    basket: false,
    scale: 1,
  };
  if (g.kind === 'elite') Object.assign(base, { robe: '#3a3f58', headColor: '#c0c6cc', shield: true, cape: true, scale: 1.1, weapon: 'sword' });
  if (g.kind === 'archer') Object.assign(base, { robe: '#5a4a2a', trim: '#7a2a22', head: 'hat', headColor: '#4a3a1a', weapon: 'bow' });
  if (g.kind === 'target') {
    Object.assign(base, { trim: '#e8c050', cape: true, weapon: combat ? 'sword' : 'none' }, TARGET_LOOKS[g.targetId ?? ''] ?? {});
  }
  if (g.hurtT > 0) base.robe = mix(base.robe, '#ffffff', 0.5);
  return base;
}

export function guardPoseFor(g: Guard): Pose {
  if (g.state === 'dead') return deadPose();
  if (g.state === 'stunned') return stunnedPose(g.animT);
  if (g.state === 'staggered') return staggerPose(g.animT);
  if (g.attack.phase !== 'none') return windupPose(g.attack.heavy, g.attack.phase);
  if (g.kind === 'archer' && g.state === 'combat' && Math.abs(g.body.vx) < 5) return bowPose(g.drawT > 0);
  if (g.climbing) return climbPose(g.body.y * 0.15);
  const vx = Math.abs(g.body.vx);
  if (!g.body.onGround) return airPose(g.body.vy);
  if (vx > 100) return runPose(g.animT * 13);
  if (vx > 5) return walkPose(g.animT * 7);
  if (g.state === 'search' && !g.lastKnown) return searchPose(g.animT);
  return idlePose(g.animT);
}

export function civStyle(c: Civilian): FigureStyle {
  return {
    robe: c.look.robe,
    trim: mix(c.look.robe, '#000000', 0.35),
    skin: '#b98e6a',
    outline: '#1a1412',
    head: c.look.head === 'none' ? 'bare' : c.look.head,
    headColor: c.look.head === 'veil' ? mix(c.look.robe, '#ffffff', 0.25) : '#d8d0b8',
    weapon: 'none',
    bladeOut: false,
    shield: false,
    cape: false,
    basket: c.look.basket,
    scale: c.look.scale,
  };
}

export function civPose(c: Civilian, paused: boolean): Pose {
  if (c.state === 'dead') return deadPose();
  if (c.state === 'flee') return runPose(c.animT * 13);
  if (c.state === 'stumble') return hurtPose();
  if (paused) return idlePose(c.animT);
  return walkPose(c.animT * 5, 0.35);
}

export function playerPose(p: Player): Pose {
  const b = p.body;
  switch (p.state) {
    case 'ground': {
      const vx = Math.abs(b.vx);
      if (vx < 8) return idlePose(p.animT);
      if (vx <= WALK + 20) return walkPose(p.animT * 8 * Math.max(0.5, vx / WALK));
      return runPose(p.animT * 14);
    }
    case 'air':
      return p.diving ? divePose() : airPose(b.vy);
    case 'climb':
      return climbPose(b.y * 0.15 + b.x * 0.1);
    case 'mantle':
      return mantlePose();
    case 'attack':
      return attackPose(p.comboStep, p.attackPhase);
    case 'guard':
      return guardPose();
    case 'dodge':
      return rollPose(Math.min(1, p.stateT / 0.32));
    case 'assassinate':
      return lungePose();
    case 'airAssassinate': {
      const pose = lungePose();
      pose.rot = 0.5;
      return pose;
    }
    case 'hurt':
      return hurtPose();
    case 'dead':
      return deadPose();
    default:
      return idlePose(p.animT);
  }
}

export function playerStyle(p: Player): FigureStyle {
  const s = { ...PLAYER_STYLE };
  if (p.state === 'attack' || p.state === 'guard') s.weapon = 'sword';
  s.bladeOut = p.state === 'assassinate' || p.state === 'airAssassinate';
  return s;
}

export class Renderer {
  private bg: Background;

  constructor(private city: CityDef) {
    this.bg = new Background(city.map.widthPx);
  }

  draw(ctx: CanvasRenderingContext2D, w: World, cam: Camera, hudExtra: { muted: boolean }): void {
    const maxCamY = w.map.heightPx - VIEW_H;
    this.bg.draw(ctx, cam.x, cam.y, maxCamY);

    ctx.save();
    const sh = w.shakeAmt;
    ctx.translate(-Math.round(cam.x) + (sh ? (Math.random() - 0.5) * sh : 0), -Math.round(cam.y) + (sh ? (Math.random() - 0.5) * sh : 0));
    const x0 = cam.x - 64;
    const x1 = cam.x + VIEW_W + 64;

    this.drawBuildings(ctx, x0, x1);
    this.drawGround(ctx, cam);
    this.drawHideouts(ctx, w, x0, x1);
    this.drawHay(ctx, x0, x1, w);
    this.drawVisionCones(ctx, w, x0, x1);
    this.drawDocs(ctx, w, x0, x1);

    for (const c of w.civilians) {
      if (c.x < x0 || c.x > x1) continue;
      const paused = c.group.pauseT > 0 && c.state === 'walk';
      drawFigure(ctx, c.x, c.y, c.facing, civPose(c, paused), civStyle(c));
    }
    for (const g of w.guards) {
      if (g.cx < x0 || g.cx > x1) continue;
      if (g.state === 'dead' && g.deadT > 0 && this.hiddenInHay(w, g)) continue;
      drawFigure(ctx, g.cx, g.feet, g.facing, guardPoseFor(g), guardStyle(g));
      this.drawTelegraph(ctx, g);
    }
    const p = w.player;
    if (!p.hidden && !(p.iframes > 0 && !p.dead && Math.floor(w.time * 20) % 2 === 0)) {
      drawFigure(ctx, p.cx, p.feet, p.facing, playerPose(p), playerStyle(p));
    }
    if (p.hidden) this.drawHayRustle(ctx, p, w.time);
    this.drawProjectiles(ctx, w);
    w.fx.draw(ctx);
    this.drawIndicators(ctx, w, x0, x1);
    this.drawPrompts(ctx, w);
    ctx.restore();

    if (w.eagleVision) drawEagleVision(ctx, w, cam);
    drawHud(ctx, w, hudExtra);
  }

  private hiddenInHay(w: World, g: Guard): boolean {
    return w.map.at(g.cx, g.feet - 4) === Tile.Hay;
  }

  private drawBuildings(ctx: CanvasRenderingContext2D, x0: number, x1: number): void {
    for (const b of this.city.buildings) {
      const bx = b.tx * TILE;
      const bw = b.tw * TILE;
      if (bx + bw < x0 || bx > x1) continue;
      if (b.kind === 'wall') this.drawWall(ctx, b);
      else this.drawBuilding(ctx, b);
    }
    // beams
    ctx.fillStyle = '#4a3020';
    for (const beam of this.city.beams) {
      const bx = beam.tx * TILE;
      if (bx + beam.tw * TILE < x0 || bx > x1) continue;
      const y = beam.ty * TILE;
      ctx.fillStyle = '#5a3a24';
      ctx.fillRect(bx, y, beam.tw * TILE, 7);
      ctx.fillStyle = '#3a2416';
      ctx.fillRect(bx, y + 7, beam.tw * TILE, 2);
      for (let i = 0; i <= beam.tw; i += 3) ctx.fillRect(bx + i * TILE - 1, y, 3, 9);
    }
  }

  private drawBuilding(ctx: CanvasRenderingContext2D, b: Building): void {
    const pal = PALETTE[b.district];
    const x = b.tx * TILE;
    const y = b.topTy * TILE;
    const wpx = b.tw * TILE;
    const h = GROUND_Y - y;
    const base = b.kind === 'cathedral' ? '#e2d6c0' : b.kind === 'tower' ? mix(pal.wall[b.variant], '#000000', 0.12) : pal.wall[b.variant];
    ctx.fillStyle = base;
    ctx.fillRect(x, y, wpx, h);
    // subtle stone courses
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let yy = y + 16; yy < GROUND_Y; yy += 16) ctx.fillRect(x, yy, wpx, 1);
    // edges
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, y, 3, h);
    ctx.fillRect(x + wpx - 3, y, 3, h);
    // windows
    const rows = Math.floor(h / TILE);
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 0; c < b.tw; c++) {
        const v = hash(b.tx + c, r);
        if (v < 0.45) continue;
        const wx = x + c * TILE + 10;
        const wy = y + r * TILE + 6;
        const lit = v > 0.9;
        ctx.fillStyle = lit ? '#f6c46a' : 'rgba(30,18,14,0.75)';
        if (b.district === 2 || b.kind === 'cathedral') {
          ctx.beginPath();
          ctx.moveTo(wx, wy + 18);
          ctx.lineTo(wx, wy + 6);
          ctx.arc(wx + 6, wy + 6, 6, Math.PI, 0);
          ctx.lineTo(wx + 12, wy + 18);
          ctx.fill();
        } else ctx.fillRect(wx, wy, 12, 16);
        if (v > 0.8 && !lit) {
          ctx.fillStyle = pal.trim;
          ctx.fillRect(wx - 2, wy + 16, 16, 3);
        }
      }
    }
    // door
    if (b.tw >= 4) {
      const dx = x + Math.floor(b.tw / 2) * TILE + 4;
      ctx.fillStyle = 'rgba(25,15,10,0.85)';
      ctx.beginPath();
      ctx.moveTo(dx, GROUND_Y);
      ctx.lineTo(dx, GROUND_Y - 30);
      ctx.arc(dx + 12, GROUND_Y - 30, 12, Math.PI, 0);
      ctx.lineTo(dx + 24, GROUND_Y);
      ctx.fill();
    }
    // roof cap
    ctx.fillStyle = pal.roof;
    ctx.fillRect(x - 4, y - 2, wpx + 8, 8);
    ctx.fillStyle = 'rgba(255,220,180,0.25)';
    ctx.fillRect(x - 4, y - 2, wpx + 8, 2);
    if (b.kind === 'tower' || b.kind === 'cathedral') {
      ctx.fillStyle = pal.roof;
      for (let i = 0; i < wpx; i += 12) ctx.fillRect(x + i, y - 8, 6, 6);
    }
    if (b.kind === 'cathedral') {
      ctx.fillStyle = '#b8a888';
      const cx = x + wpx / 2;
      ctx.beginPath();
      ctx.arc(cx, y + 70, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a6a9a';
      ctx.beginPath();
      ctx.arc(cx, y + 70, 20, 0, Math.PI * 2);
      ctx.fill();
    }
    if (b.kind === 'hideout') {
      // emblem banner
      const ex = x + 3 * TILE + 32;
      ctx.fillStyle = '#7a1a1a';
      ctx.fillRect(ex - 12, y + 12, 24, 40);
      ctx.fillStyle = '#e8e0d0';
      ctx.beginPath();
      ctx.moveTo(ex, y + 18);
      ctx.lineTo(ex + 8, y + 44);
      ctx.lineTo(ex, y + 36);
      ctx.lineTo(ex - 8, y + 44);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawWall(ctx: CanvasRenderingContext2D, b: Building): void {
    const x = b.tx * TILE;
    const y = b.topTy * TILE;
    const wpx = b.tw * TILE;
    ctx.fillStyle = '#6a6a72';
    ctx.fillRect(x, y, wpx, GROUND_Y - 3 * TILE - y);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    for (let yy = y; yy < GROUND_Y - 3 * TILE; yy += 12) {
      ctx.fillRect(x, yy, wpx, 1);
      const off = (yy / 12) % 2 ? 0 : 16;
      for (let xx = x + off; xx < x + wpx; xx += 32) ctx.fillRect(xx, yy, 1, 12);
    }
    ctx.fillStyle = '#55555c';
    for (let i = 0; i < wpx; i += 16) ctx.fillRect(x + i, y - 8, 9, 8);
    // gate arch
    ctx.fillStyle = '#2a2224';
    ctx.fillRect(x - 6, GROUND_Y - 3 * TILE, 6, 3 * TILE);
    ctx.fillRect(x + wpx, GROUND_Y - 3 * TILE, 6, 3 * TILE);
    ctx.fillStyle = 'rgba(40,30,30,0.35)';
    ctx.fillRect(x, GROUND_Y - 3 * TILE, wpx, 3 * TILE);
  }

  private drawGround(ctx: CanvasRenderingContext2D, cam: Camera): void {
    ctx.fillStyle = '#3a2a24';
    ctx.fillRect(cam.x - 10, GROUND_Y, VIEW_W + 20, 200);
    ctx.fillStyle = '#5a4436';
    ctx.fillRect(cam.x - 10, GROUND_Y, VIEW_W + 20, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    const start = Math.floor(cam.x / 24) * 24;
    for (let x = start; x < cam.x + VIEW_W + 24; x += 24) ctx.fillRect(x, GROUND_Y + 6, 1, 10);
  }

  private drawHay(ctx: CanvasRenderingContext2D, x0: number, x1: number, w: World): void {
    for (const h of this.city.hays) {
      const x = h.tx * TILE;
      const wpx = h.tw * TILE;
      if (x + wpx < x0 || x > x1) continue;
      const y = GROUND_Y;
      ctx.fillStyle = '#6a4424';
      ctx.fillRect(x + 2, y - 14, wpx - 4, 10);
      ctx.fillStyle = '#3a2414';
      ctx.beginPath();
      ctx.arc(x + 10, y - 4, 4, 0, Math.PI * 2);
      ctx.arc(x + wpx - 10, y - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d8b450';
      ctx.beginPath();
      ctx.moveTo(x, y - 12);
      ctx.quadraticCurveTo(x + wpx / 2, y - 44, x + wpx, y - 12);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,90,30,0.6)';
      ctx.lineWidth = 1;
      for (let i = 6; i < wpx - 4; i += 6) {
        ctx.beginPath();
        ctx.moveTo(x + i, y - 14);
        ctx.lineTo(x + i + 2 * Math.sin(i + w.time), y - 24 - Math.sin(i) * 6);
        ctx.stroke();
      }
    }
  }

  private drawHayRustle(ctx: CanvasRenderingContext2D, p: Player, t: number): void {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(p.cx + Math.sin(t * 3) * 2, p.feet - 22, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawHideouts(ctx: CanvasRenderingContext2D, w: World, x0: number, x1: number): void {
    for (const h of w.hideouts) {
      if (h.x + h.w < x0 || h.x > x1) continue;
      ctx.fillStyle = h.found ? 'rgba(200,40,40,0.25)' : 'rgba(255,255,255,0.12)';
      ctx.fillRect(h.x, h.y, h.w, h.h);
    }
  }

  private drawDocs(ctx: CanvasRenderingContext2D, w: World, x0: number, x1: number): void {
    for (const d of w.docs) {
      if (d.x < x0 || d.x > x1) continue;
      const y = d.y + Math.sin(w.time * 3 + d.x) * 3;
      ctx.fillStyle = 'rgba(160,210,255,0.25)';
      ctx.beginPath();
      ctx.arc(d.x, y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#efe2bf';
      ctx.fillRect(d.x - 5, y - 7, 10, 14);
      ctx.fillStyle = '#8a6a3a';
      ctx.fillRect(d.x - 6, y - 8, 12, 2);
      ctx.fillRect(d.x - 6, y + 6, 12, 2);
      ctx.fillStyle = '#a03030';
      ctx.fillRect(d.x - 1, y - 1, 3, 3);
    }
  }

  private drawVisionCones(ctx: CanvasRenderingContext2D, w: World, x0: number, x1: number): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 - 400, 0, x1 - x0 + 800, GROUND_Y);
    ctx.clip();
    for (const g of w.guards) {
      if (!g.alive || g.state === 'stunned' || g.cx < x0 - 300 || g.cx > x1 + 300) continue;
      const v = VISION[g.kind];
      const ex = g.cx;
      const ey = g.body.y + 8;
      const range = v.range * (g.state === 'combat' ? 1.4 : 1);
      const color =
        g.state === 'combat' ? 'rgba(255,60,50,0.10)' : g.state === 'patrol' && g.awareness < 0.05 ? 'rgba(255,240,180,0.06)' : 'rgba(255,170,60,0.11)';
      const grad = ctx.createRadialGradient(ex, ey, 10, ex, ey, range);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      const a0 = g.facing > 0 ? -v.halfAngle : Math.PI + v.halfAngle;
      const a1 = g.facing > 0 ? v.halfAngle : Math.PI - v.halfAngle;
      ctx.arc(ex, ey, range, Math.min(a0, a1), Math.max(a0, a1));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawTelegraph(ctx: CanvasRenderingContext2D, g: Guard): void {
    if (g.attack.phase !== 'windup') return;
    const pulse = 0.5 + 0.5 * Math.sin(g.animT * 30);
    ctx.fillStyle = g.attack.heavy ? `rgba(255,50,40,${0.5 + pulse * 0.4})` : `rgba(255,255,230,${0.4 + pulse * 0.4})`;
    ctx.beginPath();
    ctx.arc(g.cx + g.facing * 4, g.body.y - 8, g.attack.heavy ? 7 : 5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D, w: World): void {
    for (const pr of w.projectiles) {
      const a = Math.atan2(pr.vy, pr.vx);
      ctx.save();
      ctx.translate(pr.x, pr.y);
      ctx.rotate(a);
      if (pr.kind === 'arrow') {
        ctx.fillStyle = '#5a3a1a';
        ctx.fillRect(-14, -1, 16, 2);
        ctx.fillStyle = '#ccc';
        ctx.fillRect(2, -2, 4, 4);
        ctx.fillStyle = '#ddd';
        ctx.fillRect(-16, -3, 4, 6);
      } else {
        ctx.rotate(w.time * 30);
        ctx.fillStyle = '#e0e6ec';
        ctx.fillRect(-6, -1, 12, 2);
      }
      ctx.restore();
    }
  }

  private drawIndicators(ctx: CanvasRenderingContext2D, w: World, x0: number, x1: number): void {
    ctx.textAlign = 'center';
    for (const g of w.guards) {
      if (!g.alive || g.cx < x0 || g.cx > x1) continue;
      const x = g.cx;
      const y = g.body.y - 16;
      if (g.kind === 'target') {
        ctx.fillStyle = '#ffd76a';
        ctx.beginPath();
        ctx.moveTo(x, y - 14);
        ctx.lineTo(x + 5, y - 8);
        ctx.lineTo(x, y - 2);
        ctx.lineTo(x - 5, y - 8);
        ctx.closePath();
        ctx.fill();
      }
      if (g.state === 'stunned') {
        ctx.fillStyle = '#f0f0f0';
        for (let i = 0; i < 3; i++) {
          const a = w.time * 4 + (i * Math.PI * 2) / 3;
          ctx.fillRect(x + Math.cos(a) * 9 - 1.5, y + 4 + Math.sin(a) * 3 - 1.5, 3, 3);
        }
      } else if (g.state === 'combat' || g.state === 'staggered') {
        ctx.font = 'bold 18px sans-serif';
        ctx.fillStyle = '#ff4030';
        ctx.fillText('!', x, y + 2);
      } else if (g.awareness > 0.03 || g.state === 'search' || g.state === 'suspicious') {
        const a = Math.min(1, g.awareness);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x - 10, y - 2, 20, 4);
        ctx.fillStyle = a > 0.6 ? '#ff8a30' : '#ffd040';
        ctx.fillRect(x - 10, y - 2, 20 * a, 4);
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('?', x, y - 5);
      }
    }
  }

  private drawPrompts(ctx: CanvasRenderingContext2D, w: World): void {
    const p = w.player;
    let text = '';
    let at: { x: number; y: number } = { x: p.cx, y: p.body.y - 18 };
    if (p.state === 'ground' || p.state === 'guard' || p.state === 'attack') {
      const counter = p.findCounterTarget(w);
      const t = counter ?? (p.state === 'ground' ? p.findAssassinationTarget(w) : null);
      if (t) {
        text = counter ? 'J カウンター' : 'J 暗殺';
        at = { x: t.cx, y: t.body.y - 34 };
      } else if (p.state === 'ground' && w.map.at(p.cx, p.feet - 4) === Tile.Hay) text = 'F 隠れる';
    } else if (p.state === 'air') {
      const t = p.findAirTarget(w);
      if (t) {
        text = 'J 空中暗殺';
        at = { x: t.cx, y: t.body.y - 34 };
      }
    } else if (p.hidden) {
      const t = w.guards.find((g) => g.alive && g.vulnerable && Math.abs(g.cx - p.cx) < 56 && Math.abs(g.feet - p.feet) < 16);
      text = t ? 'J 干し草から暗殺' : 'F 出る';
      if (t) at = { x: t.cx, y: t.body.y - 34 };
    }
    if (!text) return;
    ctx.font = "bold 13px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
    ctx.textAlign = 'center';
    const tw = ctx.measureText(text).width + 12;
    ctx.fillStyle = 'rgba(10,8,8,0.7)';
    ctx.fillRect(at.x - tw / 2, at.y - 14, tw, 19);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, at.x, at.y);
  }
}
