import { Camera, VIEW_H, VIEW_W } from '../core/camera';
import { TILE } from '../world/tilemap';
import type { World } from '../world/world';
import { drawFigure } from './figures';
import { civPose, civStyle, guardPoseFor, guardStyle, playerPose, playerStyle } from './renderer';

const glow = (ctx: CanvasRenderingContext2D, color: string, blur: number): void => {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
};

/** Eagle Vision: darken the world and make people stand out by allegiance. */
export function drawEagleVision(ctx: CanvasRenderingContext2D, w: World, cam: Camera): void {
  ctx.fillStyle = 'rgba(6,10,26,0.74)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.save();
  ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
  const x0 = cam.x - 40;
  const x1 = cam.x + VIEW_W + 40;

  // hiding spots
  ctx.strokeStyle = 'rgba(240,240,255,0.7)';
  ctx.lineWidth = 2;
  glow(ctx, '#ffffff', 8);
  for (const h of w.city.hays) {
    const x = h.tx * TILE;
    if (x < x0 || x > x1) continue;
    ctx.beginPath();
    ctx.moveTo(x, h.ty * TILE + TILE - 12);
    ctx.quadraticCurveTo(x + (h.tw * TILE) / 2, h.ty * TILE - 12, x + h.tw * TILE, h.ty * TILE + TILE - 12);
    ctx.stroke();
  }
  // documents
  glow(ctx, '#5ab0ff', 14);
  ctx.fillStyle = '#7cc4ff';
  for (const d of w.docs) {
    if (d.x < x0 - 400 || d.x > x1 + 400) continue;
    ctx.fillRect(d.x - 5, d.y - 7, 10, 14);
  }
  for (const c of w.civilians) {
    if (c.x < x0 || c.x > x1 || !c.alive) continue;
    glow(ctx, '#8090b0', 4);
    drawFigure(ctx, c.x, c.y, c.facing, civPose(c, c.group.pauseT > 0), { ...civStyle(c), flat: '#55607a' });
  }
  for (const g of w.guards) {
    if (g.cx < x0 || g.cx > x1 || !g.alive) continue;
    const target = g.kind === 'target';
    glow(ctx, target ? '#ffcc33' : '#ff2a1a', target ? 22 : 12);
    drawFigure(ctx, g.cx, g.feet, g.facing, guardPoseFor(g), { ...guardStyle(g), flat: target ? '#ffd24a' : '#d02a20' });
  }
  const p = w.player;
  if (!p.hidden) {
    glow(ctx, '#bfe0ff', 10);
    drawFigure(ctx, p.cx, p.feet, p.facing, playerPose(p), { ...playerStyle(p), flat: '#e8f2ff' });
  }
  ctx.restore();

  // Off-screen target markers along the screen edges.
  ctx.save();
  glow(ctx, '#ffcc33', 10);
  ctx.fillStyle = '#ffd24a';
  for (const g of w.guards) {
    if (g.kind !== 'target' || !g.alive) continue;
    const sx = g.cx - cam.x;
    if (sx >= 0 && sx <= VIEW_W) continue;
    const left = sx < 0;
    const y = Math.min(VIEW_H - 30, Math.max(60, g.body.y - cam.y));
    const x = left ? 14 : VIEW_W - 14;
    ctx.beginPath();
    ctx.moveTo(x + (left ? -8 : 8), y);
    ctx.lineTo(x + (left ? 6 : -6), y - 8);
    ctx.lineTo(x + (left ? 6 : -6), y + 8);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
