import { VIEW_H, VIEW_W } from '../core/camera';
import { FONT } from '../render/hud';
import { VOLUME_MAX } from '../systems/settings';
import type { AppContext } from './scene';

type VolumeKey = 'master' | 'music' | 'sfx';

const ROWS: { key: VolumeKey | 'back'; label: string }[] = [
  { key: 'master', label: '全体音量' },
  { key: 'music', label: 'BGM' },
  { key: 'sfx', label: '効果音' },
  { key: 'back', label: '戻る' },
];

/** Volume settings overlay shared by the title screen and the pause menu. */
export class SettingsPanel {
  open = false;
  private index = 0;

  constructor(private app: AppContext) {}

  show(): void {
    this.open = true;
    this.index = 0;
  }

  update(): void {
    const input = this.app.input;
    if (input.wasPressed('pause') || (ROWS[this.index].key === 'back' && (input.wasPressed('confirm') || input.wasPressed('jump')))) {
      this.open = false;
      this.app.audio.play('menu');
      return;
    }
    if (input.wasPressed('up')) this.move(-1);
    if (input.wasPressed('down')) this.move(1);
    const key = ROWS[this.index].key;
    if (key === 'back') return;
    const delta = (input.wasPressed('right') ? 1 : 0) - (input.wasPressed('left') ? 1 : 0);
    if (delta === 0) return;
    const s = this.app.settings;
    const next = Math.max(0, Math.min(VOLUME_MAX, s[key] + delta));
    if (next === s[key]) return;
    s[key] = next;
    this.app.saveSettings();
    this.app.audio.play(key === 'music' ? 'save' : 'pickup');
  }

  private move(d: number): void {
    this.index = (this.index + ROWS.length + d) % ROWS.length;
    this.app.audio.play('menu');
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(8,6,10,0.88)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.font = `bold 32px ${FONT}`;
    ctx.fillStyle = '#f6ecd6';
    ctx.fillText('設定', VIEW_W / 2, 150);
    const s = this.app.settings;
    ROWS.forEach((row, i) => {
      const y = 220 + i * 50;
      const sel = i === this.index;
      ctx.font = `bold 18px ${FONT}`;
      ctx.fillStyle = sel ? '#fff4d6' : 'rgba(240,225,200,0.55)';
      if (row.key === 'back') {
        ctx.textAlign = 'center';
        ctx.fillText(sel ? `◆ ${row.label} ◆` : row.label, VIEW_W / 2, y + 10);
        return;
      }
      ctx.textAlign = 'right';
      ctx.fillText(`${sel ? '◆ ' : ''}${row.label}`, VIEW_W / 2 - 110, y);
      const v = s[row.key];
      for (let n = 0; n < VOLUME_MAX; n++) {
        ctx.fillStyle = n < v ? (sel ? '#ffd98a' : '#c8b48a') : 'rgba(255,255,255,0.15)';
        ctx.fillRect(VIEW_W / 2 - 90 + n * 22, y - 16, 16, 18);
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = sel ? '#fff4d6' : 'rgba(240,225,200,0.7)';
      ctx.fillText(`${v}`, VIEW_W / 2 + 140, y);
    });
    ctx.textAlign = 'center';
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = '#aaa';
    ctx.fillText('W/S で選択 ・ A/D で調整 ・ Esc で戻る ・ M でミュート', VIEW_W / 2, 450);
  }
}
