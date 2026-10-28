import { Camera, VIEW_H, VIEW_W } from '../core/camera';
import { FONT } from '../render/hud';
import { Renderer } from '../render/renderer';
import { loadSave, newSave } from '../systems/progress';
import { Tutorial } from '../systems/tutorial';
import { buildCity, buildTrainingGround } from '../world/city';
import { World, WorldMode } from '../world/world';
import { Menu, drawControls } from './menu';
import { ResultScene } from './result';
import type { AppContext, Scene } from './scene';
import { SettingsPanel } from './settings';
import { TitleScene } from './title';

export interface GameOptions {
  mode?: WorldMode;
  /** Training only: where to go once it is finished or skipped. */
  after?: 'campaign' | 'title';
}

export class GameScene implements Scene {
  readonly world: World;
  readonly camera: Camera;
  readonly tutorial: Tutorial | null = null;
  private renderer: Renderer;
  paused = false;
  private pauseMenu: Menu;
  private showControls = false;
  private settings: SettingsPanel;
  private readonly mode: WorldMode;
  private readonly after: 'campaign' | 'title';

  constructor(
    private app: AppContext,
    opts: GameOptions = {},
  ) {
    this.mode = opts.mode ?? 'campaign';
    this.after = opts.after ?? 'campaign';
    const training = this.mode === 'training';
    const city = training ? buildTrainingGround() : buildCity();
    const save = training ? newSave() : (loadSave(app.storage) ?? newSave());
    this.world = new World(city, save, training ? null : app.storage, this.mode);
    if (training) this.tutorial = new Tutorial(this.world);
    this.camera = new Camera(city.map.widthPx, city.map.heightPx);
    this.renderer = new Renderer(city);
    this.settings = new SettingsPanel(app);
    this.pauseMenu = new Menu(training ? ['再開', '設定', '訓練を飛ばす', 'タイトルへ'] : ['再開', '設定', '操作方法', 'タイトルへ']);
    const p = this.world.player;
    this.camera.snap(p.cx, p.cy);
    this.world.persist();
  }

  private finishTraining(): void {
    this.app.settings.tutorialDone = true;
    this.app.saveSettings();
    this.app.go(this.after === 'campaign' ? new GameScene(this.app) : new TitleScene(this.app));
  }

  private updatePause(): void {
    const input = this.app.input;
    if (this.settings.open) return this.settings.update();
    if (this.showControls) {
      if (input.wasPressed('pause') || input.wasPressed('confirm')) this.showControls = false;
      return;
    }
    if (input.wasPressed('pause')) {
      this.paused = false;
      return;
    }
    const c = this.pauseMenu.update(input, () => this.app.audio.play('menu'));
    if (c === null) return;
    const item = this.pauseMenu.items[c];
    if (item === '再開') this.paused = false;
    else if (item === '設定') this.settings.show();
    else if (item === '操作方法') this.showControls = true;
    else if (item === '訓練を飛ばす') this.finishTraining();
    else if (item === 'タイトルへ') {
      this.world.persist();
      this.app.go(new TitleScene(this.app));
    }
  }

  update(dt: number): void {
    const input = this.app.input;
    const w = this.world;
    if (input.wasPressed('mute')) this.app.audio.toggleMute();
    if (this.paused) return this.updatePause();
    if (input.wasPressed('pause')) {
      this.paused = true;
      this.pauseMenu.index = 0;
      w.persist();
      return;
    }

    w.update(input, dt);
    this.tutorial?.update(dt);
    for (const s of w.sounds) this.app.audio.play(s);
    w.sounds.length = 0;
    this.app.audio.setMusic(w.combatActive ? 'combat' : 'explore');

    const p = w.player;
    this.camera.follow(p.cx, p.cy, p.facing, dt);
    if (w.playerDeadT > 2.8) {
      w.respawn();
      this.camera.snap(w.player.cx, w.player.cy);
    }
    if (this.tutorial && this.tutorial.finishedT > 3) this.finishTraining();
    else if (w.victoryT > 2.5) this.app.go(new ResultScene(this.app, w.save));
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.renderer.draw(ctx, this.world, this.camera, { muted: this.app.audio.muted, tutorial: this.tutorial });
    if (!this.paused) return;
    if (this.settings.open) return this.settings.draw(ctx);
    ctx.fillStyle = 'rgba(8,6,10,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    if (this.showControls) {
      drawControls(ctx, 360, 150);
      ctx.fillStyle = '#aaa';
      ctx.font = `12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('Esc / Enter で戻る', VIEW_W / 2, 450);
      return;
    }
    ctx.font = `bold 36px ${FONT}`;
    ctx.fillStyle = '#f6ecd6';
    ctx.fillText(this.tutorial ? 'ポーズ（訓練中）' : 'ポーズ', VIEW_W / 2, 170);
    this.pauseMenu.draw(ctx, VIEW_W / 2, 240);
    if (this.tutorial) return;
    const s = this.world.save;
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = '#cdbfa6';
    ctx.textAlign = 'center';
    const targets = this.world.city.targets
      .map((t) => `${s.targetsKilled.includes(t.id) ? '✕' : '・'} ${t.title} ${t.name}`)
      .join('　');
    ctx.fillText(targets, VIEW_W / 2, 420);
    ctx.fillText('進行状況は自動で保存されます', VIEW_W / 2, 448);
  }
}
