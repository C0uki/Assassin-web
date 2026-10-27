import { clamp, lerp } from './math';

export const VIEW_W = 960;
export const VIEW_H = 540;

export class Camera {
  x = 0;
  y = 0;
  private lookAhead = 0;

  constructor(
    private worldW: number,
    private worldH: number,
  ) {}

  snap(tx: number, ty: number): void {
    this.x = clamp(tx - VIEW_W / 2, 0, this.worldW - VIEW_W);
    this.y = clamp(ty - VIEW_H * 0.6, 0, this.worldH - VIEW_H);
  }

  follow(tx: number, ty: number, facing: number, dt: number): void {
    this.lookAhead = lerp(this.lookAhead, facing * 90, Math.min(1, dt * 2));
    const gx = clamp(tx + this.lookAhead - VIEW_W / 2, 0, this.worldW - VIEW_W);
    const gy = clamp(ty - VIEW_H * 0.6, 0, this.worldH - VIEW_H);
    const k = Math.min(1, dt * 6);
    this.x = lerp(this.x, gx, k);
    this.y = lerp(this.y, gy, k);
  }
}
