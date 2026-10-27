import { VIEW_H, VIEW_W } from '../core/camera';
import { Rng } from '../core/rng';

interface Shape {
  x: number;
  w: number;
  h: number;
  kind: 'box' | 'dome' | 'minaret' | 'tower';
}

interface Layer {
  factor: number;
  color: string;
  shapes: Shape[];
  baseline: number;
}

function makeLayer(rng: Rng, factor: number, color: string, worldW: number, hMin: number, hMax: number, baseline: number): Layer {
  const shapes: Shape[] = [];
  const span = worldW * factor + VIEW_W + 200;
  let x = -100;
  while (x < span) {
    const r = rng.next();
    const kind: Shape['kind'] = r < 0.12 ? 'minaret' : r < 0.25 ? 'dome' : r < 0.32 ? 'tower' : 'box';
    const w = kind === 'minaret' ? rng.range(10, 16) : kind === 'dome' ? rng.range(50, 90) : rng.range(30, 80);
    const h = kind === 'minaret' ? rng.range(hMax, hMax * 1.6) : rng.range(hMin, hMax);
    shapes.push({ x, w, h, kind });
    x += w * rng.range(0.6, 1.1);
  }
  return { factor, color, shapes, baseline };
}

export class Background {
  private layers: Layer[];

  constructor(worldW: number) {
    const rng = new Rng(99);
    this.layers = [
      makeLayer(rng, 0.12, '#6b3a5e', worldW, 40, 110, 0),
      makeLayer(rng, 0.3, '#4a2a4a', worldW, 50, 140, 30),
      makeLayer(rng, 0.55, '#33203a', worldW, 60, 170, 60),
    ];
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, maxCamY: number): void {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#231a40');
    g.addColorStop(0.45, '#8c3f66');
    g.addColorStop(0.75, '#e0805a');
    g.addColorStop(1, '#f3b86a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // sun
    const sx = VIEW_W * 0.68 - camX * 0.01;
    const sy = 300 + (maxCamY - camY) * 0.05;
    const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 160);
    sg.addColorStop(0, 'rgba(255,230,170,0.95)');
    sg.addColorStop(0.25, 'rgba(255,190,120,0.5)');
    sg.addColorStop(1, 'rgba(255,160,100,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(sx - 160, sy - 160, 320, 320);
    ctx.fillStyle = '#ffe6b0';
    ctx.beginPath();
    ctx.arc(sx, sy, 34, 0, Math.PI * 2);
    ctx.fill();

    for (const layer of this.layers) {
      const off = camX * layer.factor;
      const base = 400 + layer.baseline + (maxCamY - camY) * layer.factor * 0.5;
      ctx.fillStyle = layer.color;
      for (const s of layer.shapes) {
        const x = s.x - off;
        if (x + s.w < -20 || x > VIEW_W + 20) continue;
        drawShape(ctx, s, x, base);
      }
      ctx.fillRect(0, base, VIEW_W, VIEW_H - base + 10);
      ctx.fillStyle = 'rgba(240,140,110,0.12)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }
}

function drawShape(ctx: CanvasRenderingContext2D, s: Shape, x: number, base: number): void {
  switch (s.kind) {
    case 'box':
      ctx.fillRect(x, base - s.h, s.w, s.h + 2);
      break;
    case 'tower':
      ctx.fillRect(x, base - s.h, s.w * 0.5, s.h + 2);
      for (let i = 0; i < 3; i++) ctx.fillRect(x + i * s.w * 0.2, base - s.h - 6, s.w * 0.1, 6);
      break;
    case 'dome': {
      const bh = s.h * 0.55;
      ctx.fillRect(x, base - bh, s.w, bh + 2);
      ctx.beginPath();
      ctx.ellipse(x + s.w / 2, base - bh, s.w * 0.4, s.w * 0.42, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(x + s.w / 2 - 1, base - bh - s.w * 0.42 - 10, 2, 12);
      break;
    }
    case 'minaret':
      ctx.fillRect(x, base - s.h, s.w, s.h + 2);
      ctx.fillRect(x - 3, base - s.h * 0.75, s.w + 6, 4);
      ctx.beginPath();
      ctx.moveTo(x - 1, base - s.h);
      ctx.lineTo(x + s.w / 2, base - s.h - 22);
      ctx.lineTo(x + s.w + 1, base - s.h);
      ctx.fill();
      break;
  }
}
