import { VIEW_H, VIEW_W } from '../core/camera';
import { Background } from '../render/background';
import { drawFigure, idlePose } from '../render/figures';
import { FONT } from '../render/hud';
import { PLAYER_STYLE } from '../render/renderer';
import { clearSave, loadSave } from '../systems/progress';
import { GameScene } from './game';
import { Menu, drawControls } from './menu';
import type { AppContext, Scene } from './scene';
import { SettingsPanel } from './settings';

export class TitleScene implements Scene {
  private bg = new Background(19200);
  private t = 0;
  private menu: Menu;
  private showControls = false;
  private hasSave: boolean;
  private settings: SettingsPanel;

  constructor(private app: AppContext) {
    const save = loadSave(app.storage);
    this.hasSave = !!save && !save.complete && (save.targetsKilled.length > 0 || save.docs.length > 0 || save.stats.time > 5);
    this.menu = new Menu(this.hasSave ? ['続きから', '最初から', '訓練', '設定', '操作方法'] : ['はじめる', '訓練', '設定', '操作方法']);
    this.settings = new SettingsPanel(app);
    app.audio.setMusic('explore');
  }

  update(dt: number): void {
    this.t += dt;
    const input = this.app.input;
    if (input.wasPressed('mute')) this.app.audio.toggleMute();
    if (this.settings.open) return this.settings.update();
    if (this.showControls) {
      if (input.wasPressed('confirm') || input.wasPressed('pause') || input.wasPressed('jump')) this.showControls = false;
      return;
    }
    const choice = this.menu.update(input, () => this.app.audio.play('menu'));
    if (choice === null) return;
    const item = this.menu.items[choice];
    this.app.audio.play('menu');
    if (item === '操作方法') this.showControls = true;
    else if (item === '設定') this.settings.show();
    else if (item === '訓練') this.app.go(new GameScene(this.app, { mode: 'training', after: 'title' }));
    else if (item === '続きから') this.app.go(new GameScene(this.app));
    else {
      clearSave(this.app.storage);
      // First time playing: start with the training ground, then go straight into the city.
      this.app.go(this.app.settings.tutorialDone ? new GameScene(this.app) : new GameScene(this.app, { mode: 'training', after: 'campaign' }));
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const camX = 3000 + this.t * 25;
    this.bg.draw(ctx, camX, 740, 740);
    // foreground rooftop silhouette
    ctx.fillStyle = '#1e1420';
    ctx.fillRect(0, 430, VIEW_W, VIEW_H - 430);
    ctx.fillRect(560, 360, 220, 80);
    ctx.fillRect(600, 330, 30, 40);
    drawFigure(ctx, 700, 360, -1, idlePose(this.t), { ...PLAYER_STYLE, scale: 1.6 });

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 70, VIEW_W, 120);
    ctx.font = `bold 64px ${FONT}`;
    ctx.fillStyle = '#f8eedc';
    ctx.fillText('影 の 刃', VIEW_W / 2, 150);
    ctx.font = `15px ${FONT}`;
    ctx.fillStyle = '#e8c8a0';
    ctx.fillText('SHADOW BLADE — 暗殺者の街', VIEW_W / 2, 178);

    if (this.settings.open) return this.settings.draw(ctx);
    if (this.showControls) {
      ctx.fillStyle = 'rgba(10,6,12,0.85)';
      ctx.fillRect(110, 200, VIEW_W - 220, 320);
      drawControls(ctx, 360, 232);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#aaa';
      ctx.font = `12px ${FONT}`;
      ctx.fillText('Enter で戻る', VIEW_W / 2, 510);
      return;
    }
    this.menu.draw(ctx, VIEW_W / 2 - 180, 250, 34);
    ctx.textAlign = 'center';
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = 'rgba(240,225,200,0.7)';
    ctx.fillText('6人の標的を暗殺せよ。見つかれば街中が敵になる。', VIEW_W / 2 - 180, 448);
    ctx.fillText('W/S で選択 ・ Enter で決定', VIEW_W / 2 - 180, 470);
  }
}
