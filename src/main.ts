import { AudioSystem } from './audio/audio';
import { VIEW_H, VIEW_W } from './core/camera';
import { Input } from './core/input';
import { GameScene } from './scenes/game';
import type { AppContext, Scene } from './scenes/scene';
import { TitleScene } from './scenes/title';
import type { StorageLike } from './systems/progress';
import { loadSettings, writeSettings } from './systems/settings';

const STEP = 1 / 60;

function safeStorage(): StorageLike | null {
  try {
    const s = window.localStorage;
    const k = '__probe__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
let scale = 1;

function resize(): void {
  const s = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${Math.floor(VIEW_W * s)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * s)}px`;
  canvas.width = Math.floor(VIEW_W * s * dpr);
  canvas.height = Math.floor(VIEW_H * s * dpr);
  scale = s * dpr;
}
window.addEventListener('resize', resize);
resize();

const input = new Input();
input.attach(window);
const audio = new AudioSystem();
input.onFirstInput = () => audio.init();

let scene: Scene;
const storage = safeStorage();
const app: AppContext = {
  input,
  audio,
  storage,
  settings: loadSettings(storage),
  saveSettings() {
    writeSettings(storage, app.settings);
    audio.setVolumes(app.settings);
  },
  go(next) {
    scene = next;
  },
};
audio.setVolumes(app.settings);
scene = new TitleScene(app);

if (import.meta.env.DEV || location.search.includes('debug')) {
  (window as unknown as { __game: unknown }).__game = {
    get scene() {
      return scene;
    },
    get world() {
      return scene instanceof GameScene ? scene.world : null;
    },
    get tutorial() {
      return scene instanceof GameScene ? scene.tutorial : null;
    },
    input,
  };
}

let last = performance.now();
let acc = 0;
function frame(now: number): void {
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  while (acc >= STEP) {
    scene.update(STEP);
    input.endTick();
    acc -= STEP;
  }
  audio.update();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  scene.render(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
