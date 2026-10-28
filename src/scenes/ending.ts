import { VIEW_H, VIEW_W } from '../core/camera';
import { Background } from '../render/background';
import { FONT } from '../render/hud';
import type { SaveData } from '../systems/progress';
import { BOSS } from '../world/city';
import { ResultScene } from './result';
import type { AppContext, Scene } from './scene';

/** Pages of the epilogue, each shown until a key is pressed. */
export const ENDING_PAGES: { speaker?: string; lines: string[] }[] = [
  {
    speaker: `${BOSS.title} ${BOSS.name}`,
    lines: ['……見事だ、影の刃よ。', 'だが覚えておけ。秩序を斬った者は、', '次に何がこの街を縛るのか、己で背負うことになる。'],
  },
  {
    lines: ['総長の最期の言葉は、鐘の音に掻き消された。', '六人の手駒と、それを操っていた手が、すべて落ちた。'],
  },
  {
    lines: ['夜明けの屋根の上に、白い外套がひとつ立つ。', '影の刃は街を見下ろし、そして静かに姿を消した。'],
  },
];

export class EndingScene implements Scene {
  private bg = new Background(19200);
  private t = 0;
  private page = 0;
  private pageT = 0;

  constructor(
    private app: AppContext,
    private save: SaveData,
  ) {
    app.audio.setMusic('explore');
  }

  update(dt: number): void {
    this.t += dt;
    this.pageT += dt;
    const input = this.app.input;
    if (this.pageT < 0.6) return;
    if (input.wasPressed('confirm') || input.wasPressed('jump') || input.wasPressed('attack')) {
      this.app.audio.play('menu');
      this.page++;
      this.pageT = 0;
      if (this.page >= ENDING_PAGES.length) this.app.go(new ResultScene(this.app, this.save));
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.bg.draw(ctx, 12000 + this.t * 10, 740, 740);
    ctx.fillStyle = 'rgba(8,6,10,0.78)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const page = ENDING_PAGES[Math.min(this.page, ENDING_PAGES.length - 1)];
    ctx.globalAlpha = Math.min(1, this.pageT * 2);
    ctx.textAlign = 'center';
    let y = VIEW_H / 2 - page.lines.length * 16;
    if (page.speaker) {
      ctx.font = `bold 16px ${FONT}`;
      ctx.fillStyle = '#ffd0a0';
      ctx.fillText(page.speaker, VIEW_W / 2, y - 44);
    }
    ctx.font = `18px ${FONT}`;
    ctx.fillStyle = '#f2e6c8';
    for (const line of page.lines) {
      ctx.fillText(line, VIEW_W / 2, y);
      y += 34;
    }
    ctx.globalAlpha = 1;
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = '#aaa';
    ctx.fillText(`Enter で次へ（${this.page + 1}/${ENDING_PAGES.length}）`, VIEW_W / 2, VIEW_H - 40);
  }
}
