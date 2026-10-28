import { describe, expect, it } from 'vitest';
import { SAVE_KEY, StorageLike, loadSave, newSave, rankFor, statsFor, writeSave } from '../src/systems/progress';

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('save data', () => {
  it('round-trips through storage', () => {
    const s = memoryStorage();
    const save = newSave();
    save.targetsKilled.push('t1');
    save.docs.push('d0_0', 'd0_1');
    save.stats.detections = 2;
    writeSave(s, save);
    expect(loadSave(s)).toEqual(save);
  });

  it('rejects other versions and garbage', () => {
    const s = memoryStorage();
    s.setItem(SAVE_KEY, JSON.stringify({ ...newSave(), version: 999 }));
    expect(loadSave(s)).toBeNull();
    s.setItem(SAVE_KEY, '{not json');
    expect(loadSave(s)).toBeNull();
    expect(loadSave(null)).toBeNull();
  });

  it('survives a throwing storage', () => {
    const bad: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    };
    expect(loadSave(bad)).toBeNull();
    expect(() => writeSave(bad, newSave())).not.toThrow();
  });
});

describe('upgrades and rank', () => {
  it('unlocks upgrades by document count', () => {
    expect(statsFor(0)).toEqual({ maxHp: 10, maxKnives: 3, maxSmokes: 1, maxPotions: 2, climbMul: 1, quiet: false });
    expect(statsFor(5).maxHp).toBe(12);
    expect(statsFor(5).maxPotions).toBe(3);
    expect(statsFor(10).maxKnives).toBe(5);
    expect(statsFor(30)).toEqual({ maxHp: 14, maxKnives: 5, maxSmokes: 2, maxPotions: 3, climbMul: 1.3, quiet: true });
  });

  it('ranks a ghost run above a bloody one', () => {
    const ghost = { time: 600, detections: 0, assassinations: 12, combatKills: 0, civilianKills: 0, deaths: 0, bossAttempts: 1 };
    const messy = { time: 600, detections: 8, assassinations: 2, combatKills: 20, civilianKills: 2, deaths: 3, bossAttempts: 4 };
    expect(rankFor(ghost)).toBe('S');
    expect(rankFor(messy)).toBe('C');
  });
});
