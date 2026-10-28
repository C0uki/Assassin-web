import type { Input } from '../core/input';
import { FONT } from '../render/hud';

/** Vertical text menu navigated with W/S (or arrows) and confirmed with Enter / Space / J. */
export class Menu {
  index = 0;

  constructor(public items: string[]) {}

  update(input: Input, onMove: () => void): number | null {
    if (input.wasPressed('up')) {
      this.index = (this.index + this.items.length - 1) % this.items.length;
      onMove();
    }
    if (input.wasPressed('down')) {
      this.index = (this.index + 1) % this.items.length;
      onMove();
    }
    if (input.wasPressed('confirm') || input.wasPressed('jump') || input.wasPressed('attack')) return this.index;
    return null;
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number, spacing = 38): void {
    ctx.textAlign = 'center';
    ctx.font = `bold 20px ${FONT}`;
    this.items.forEach((item, i) => {
      const sel = i === this.index;
      ctx.fillStyle = sel ? '#fff4d6' : 'rgba(240,225,200,0.55)';
      ctx.fillText(sel ? `◆ ${item} ◆` : item, x, y + i * spacing);
    });
  }
}

export const CONTROLS: [string, string][] = [
  ['A / D', '移動（歩くと静か）'],
  ['Shift + 移動', 'フリーラン（速いが目立つ・屋根の端で自動ジャンプ）'],
  ['W / S', '壁を登る・降りる（屋根の上で S：ぶら下がる）'],
  ['Space', 'ジャンプ（登攀中：方向キーと同時で飛び移る）'],
  ['J', '攻撃（3段コンボ）／ 背後・上空・干し草から暗殺'],
  ['K', '防御（攻撃の直前に押すとパリィ → J でカウンター）'],
  ['L', '回避ロール（赤い予兆の重い攻撃は防御できない）'],
  ['H', '薬を飲む（体力 +4。飲んでいる間は無防備）'],
  ['I / O', '投げナイフ ／ 煙玉（敵を足止め）'],
  ['E（長押し）', '鷹の目：標的=金、敵=赤、文書=青'],
  ['F', '干し草に隠れる・出る'],
  ['Esc / M', 'ポーズ ／ ミュート'],
];

export function drawControls(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.font = `14px ${FONT}`;
  CONTROLS.forEach(([k, v], i) => {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd98a';
    ctx.fillText(k, x - 14, y + i * 25);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#efe4cc';
    ctx.fillText(v, x, y + i * 25);
  });
}
