interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  gravity: number;
  kind: 'dot' | 'smoke' | 'straw';
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/** Particle effects. Simulated in the world update, drawn in world space. */
export class Fx {
  particles: Particle[] = [];

  private add(p: Omit<Particle, 'max'>): void {
    if (this.particles.length > 600) this.particles.shift();
    this.particles.push({ ...p, max: p.life });
  }

  blood(x: number, y: number, dir: number, n: number): void {
    for (let i = 0; i < n; i++)
      this.add({ x, y, vx: dir * rand(40, 200), vy: rand(-220, -40), life: rand(0.4, 0.8), color: '#8a1010', size: rand(1.5, 3), gravity: 900, kind: 'dot' });
  }

  dust(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++)
      this.add({ x: x + rand(-8, 8), y, vx: rand(-60, 60), vy: rand(-40, -5), life: rand(0.3, 0.6), color: 'rgba(200,170,130,0.7)', size: rand(2, 4), gravity: 0, kind: 'smoke' });
  }

  straw(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++)
      this.add({ x: x + rand(-12, 12), y, vx: rand(-120, 120), vy: rand(-300, -80), life: rand(0.5, 1), color: '#e6c55a', size: rand(3, 6), gravity: 700, kind: 'straw' });
  }

  sparkle(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++)
      this.add({ x: x + rand(-10, 10), y: y + rand(-14, 14), vx: rand(-20, 20), vy: rand(-70, -30), life: rand(0.5, 0.9), color: '#9dffb0', size: rand(2, 3), gravity: 0, kind: 'dot' });
  }

  sparks(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++)
      this.add({ x, y, vx: rand(-220, 220), vy: rand(-220, 60), life: rand(0.15, 0.35), color: '#ffe9a0', size: rand(1, 2), gravity: 600, kind: 'dot' });
  }

  smoke(x: number, y: number, r: number): void {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * r * 0.7;
      this.add({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.6, vx: rand(-20, 20), vy: rand(-25, 0), life: rand(2.5, 4), color: 'rgba(210,210,215,0.55)', size: rand(14, 26), gravity: 0, kind: 'smoke' });
    }
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'smoke') {
        p.vx *= 1 - dt;
        p.size += dt * 6;
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = p.kind === 'smoke' ? a : Math.min(1, a * 2);
      ctx.fillStyle = p.color;
      if (p.kind === 'smoke') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'straw') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.life * 8);
        ctx.fillRect(-p.size / 2, -0.75, p.size, 1.5);
        ctx.restore();
      } else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
}
