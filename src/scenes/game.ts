import { Camera, VIEW_H, VIEW_W } from '../core/camera';
import { FONT } from '../render/hud';
import { Renderer } from '../render/renderer';
import { loadSave, newSave } from '../systems/progress';
import { buildCity } from '../world/city';
import { World } from '../world/world';
import { Menu, drawControls } from './menu';
import { ResultScene } from './result';
import type { AppContext, Scene } from './scene';
import { TitleScene } from './title';

export class GameScene implements Scene {
  readonly world: World;
  readonly camera: Camera;
  private renderer: Renderer;
  paused = false;
  private pauseMenu = new Menu(['再開', '操作方法', 'タイトルへ']);
  private showControls = false;

  constructor(private app: AppContext) {
    const city = buildCity();
    const save = loadSave(app.storage) ?? newSave();
    this.world = new World(city, save, app.storage);
    this.camera = new Camera(city.map.widthPx, city.map.heightPx);
    this.renderer = new Renderer(city);
    const p = this.world.player;
    this.camera.snap(p.cx, p.cy);
    this.world.persist();
  }

  update(dt: number): void {
    const input = this.app.input;
    const w = this.world;
    if (input.wasPressed('mute')) this.app.audio.toggleMute();
    if (this.paused) {
      if (this.showControls) {
        if (input.wasPressed('pause') || input.wasPressed('confirm')) this.showControls = false;
        return;
      }
      if (input.wasPressed('pause')) {
        this.paused = false;
        return;
      }
      const c = this.pauseMenu.update(input, () => this.app.audio.play('menu'));
      if (c === 0) this.paused = false;
      else if (c === 1) this.showControls = true;
      else if (c === 2) {
        w.persist();
        this.app.go(new TitleScene(this.app));
      }
      return;
    }
    if (input.wasPressed('pause')) {
      this.paused = true;
      this.pauseMenu.index = 0;
      w.persist();
      return;
    }

    w.update(input, dt);
    for (const s of w.sounds) this.app.audio.play(s);
    w.sounds.length = 0;
    this.app.audio.setMusic(w.combatActive ? 'combat' : 'explore');

    const p = w.player;
    this.camera.follow(p.cx, p.cy, p.facing, dt);
    if (w.playerDeadT > 2.8) {
      w.respawn();
      this.camera.snap(w.player.cx, w.player.cy);
    }
    if (w.victoryT > 2.5) this.app.go(new ResultScene(this.app, w.save));
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.renderer.draw(ctx, this.world, this.camera, { muted: this.app.audio.muted });
    if (!this.paused) return;
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
    ctx.fillText('ポーズ', VIEW_W / 2, 170);
    this.pauseMenu.draw(ctx, VIEW_W / 2, 240);
    const s = this.world.save;
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = '#cdbfa6';
    ctx.textAlign = 'center';
    const targets = this.world.city.targets
      .map((t) => `${s.targetsKilled.includes(t.id) ? '✕' : '・'} ${t.title} ${t.name}`)
      .join('　');
    ctx.fillText(targets, VIEW_W / 2, 400);
    ctx.fillText('進行状況は自動で保存されます', VIEW_W / 2, 430);
  }
}
