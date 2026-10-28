import type { Input } from '../core/input';
import type { AudioSystem } from '../audio/audio';
import type { StorageLike } from '../systems/progress';
import type { Settings } from '../systems/settings';

export interface Scene {
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
}

export interface AppContext {
  input: Input;
  audio: AudioSystem;
  storage: StorageLike | null;
  settings: Settings;
  /** Persist `settings` and apply the volumes. */
  saveSettings(): void;
  go(scene: Scene): void;
}
