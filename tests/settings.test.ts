import { describe, expect, it } from 'vitest';
import type { StorageLike } from '../src/systems/progress';
import { SETTINGS_KEY, defaultSettings, loadSettings, volumeGain, writeSettings } from '../src/systems/settings';

function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('settings', () => {
  it('falls back to defaults when nothing is stored', () => {
    expect(loadSettings(memoryStorage())).toEqual(defaultSettings());
    expect(loadSettings(null)).toEqual(defaultSettings());
  });

  it('round-trips volumes and the tutorial flag', () => {
    const s = memoryStorage();
    const v = { ...defaultSettings(), master: 3, music: 0, sfx: 10, tutorialDone: true };
    writeSettings(s, v);
    expect(loadSettings(s)).toEqual(v);
  });

  it('clamps out-of-range or broken values', () => {
    const s = memoryStorage();
    s.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, master: 42, music: -3, sfx: 'loud', tutorialDone: 'yes' }));
    expect(loadSettings(s)).toEqual({ ...defaultSettings(), master: 10, music: 0, tutorialDone: false });
    s.setItem(SETTINGS_KEY, '{oops');
    expect(loadSettings(s)).toEqual(defaultSettings());
  });

  it('survives storage that throws', () => {
    const bad: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    };
    expect(loadSettings(bad)).toEqual(defaultSettings());
    expect(() => writeSettings(bad, defaultSettings())).not.toThrow();
  });

  it('maps volume steps to a rising gain curve', () => {
    expect(volumeGain(0)).toBe(0);
    expect(volumeGain(10)).toBe(1);
    expect(volumeGain(5)).toBeLessThan(0.5);
  });
});
