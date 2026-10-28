import type { StorageLike } from './progress';

export const SETTINGS_KEY = 'assassin-web-settings';
export const SETTINGS_VERSION = 1;
export const VOLUME_MAX = 10;

export interface Settings {
  version: number;
  master: number;
  music: number;
  sfx: number;
  tutorialDone: boolean;
}

export function defaultSettings(): Settings {
  return { version: SETTINGS_VERSION, master: 8, music: 7, sfx: 8, tutorialDone: false };
}

export const clampVolume = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(VOLUME_MAX, Math.round(v))) : fallback;

/** Kept apart from the save game so starting over does not reset audio or the tutorial flag. */
export function loadSettings(storage: StorageLike | null): Settings {
  const base = defaultSettings();
  if (!storage) return base;
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (!raw) return base;
    const data = JSON.parse(raw) as Partial<Settings>;
    if (data.version !== SETTINGS_VERSION) return base;
    return {
      version: SETTINGS_VERSION,
      master: clampVolume(data.master, base.master),
      music: clampVolume(data.music, base.music),
      sfx: clampVolume(data.sfx, base.sfx),
      tutorialDone: data.tutorialDone === true,
    };
  } catch {
    return base;
  }
}

export function writeSettings(storage: StorageLike | null, s: Settings): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Storage may be full or blocked; settings just won't persist.
  }
}

/** Perceptual curve: 0..10 → 0..1 gain. */
export const volumeGain = (v: number): number => (v / VOLUME_MAX) ** 2;
