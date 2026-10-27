import type { Input } from '../core/input';
import type { AudioSystem } from '../audio/audio';
import type { StorageLike } from '../systems/progress';

export interface Scene {
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
}

export interface AppContext {
  input: Input;
  audio: AudioSystem;
  storage: StorageLike | null;
  go(scene: Scene): void;
}
