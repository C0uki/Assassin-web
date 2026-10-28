import { VIEW_H, VIEW_W } from '../core/camera';
import { Background } from '../render/background';
import { FONT } from '../render/hud';
import { SaveData, TOTAL_DOCS, rankFor } from '../systems/progress';
import type { AppContext, Scene } from './scene';
import { TitleScene } from './title';

export class ResultScene implements Scene {
  private bg = new Background(19200);
  private t = 0;

  constructor(
    private app: AppContext,
    private save: SaveData,
  ) {
    app.audio.setMusic('explore');
  }

  update(dt: number): void {
    this.t += dt;
    const input = this.app.input;
    if (this.t > 1 && (input.wasPressed('confirm') || input.wasPressed('jump'))) this.app.go(new TitleScene(this.app));
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.bg.draw(ctx, 9000 + this.t * 15, 740, 740);
    ctx.fillStyle = 'rgba(8,6,10,0.7)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const s = this.save.stats;
    ctx.textAlign = 'center';
    ctx.font = `bold 40px ${FONT}`;
    ctx.fillStyle = '#ffe2a0';
    ctx.fillText('騎士団は滅びた', VIEW_W / 2, 110);
    ctx.font = `15px ${FONT}`;
    ctx.fillStyle = '#e8d8c0';
    ctx.fillText('六人の標的と総長は倒れ、街に夜明けが訪れる。', VIEW_W / 2, 142);
    const min = Math.floor(s.time / 60);
    const sec = Math.floor(s.time % 60);
    const rows: [string, string][] = [
      ['プレイ時間', `${min}分 ${sec.toString().padStart(2, '0')}秒`],
      ['発見された回数', `${s.detections}`],
      ['暗殺', `${s.assassinations}`],
      ['戦闘での撃破', `${s.combatKills}`],
      ['市民の犠牲', `${s.civilianKills}`],
      ['力尽きた回数', `${s.deaths}`],
      ['総長への挑戦', `${s.bossAttempts} 回`],
      ['古文書', `${this.save.docs.length} / ${TOTAL_DOCS}`],
    ];
    ctx.font = `16px ${FONT}`;
    rows.forEach(([k, v], i) => {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#cdbfa6';
      ctx.fillText(k, VIEW_W / 2 - 20, 190 + i * 28);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(v, VIEW_W / 2 + 20, 190 + i * 28);
    });
    ctx.textAlign = 'center';
    ctx.font = `bold 52px ${FONT}`;
    ctx.fillStyle = '#ffd24a';
    ctx.fillText(`ランク ${rankFor(s)}`, VIEW_W / 2, 460);
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = '#aaa';
    ctx.fillText('Enter でタイトルへ', VIEW_W / 2, 500);
  }
}
