export const SAVE_KEY = 'assassin-web-save';
export const SAVE_VERSION = 1;
export const TOTAL_DOCS = 30;

export interface Stats {
  time: number;
  detections: number;
  assassinations: number;
  combatKills: number;
  civilianKills: number;
  deaths: number;
}

export interface SaveData {
  version: number;
  targetsKilled: string[];
  docs: string[];
  hideout: number;
  hideoutsFound: number[];
  stats: Stats;
  complete: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function newSave(): SaveData {
  return {
    version: SAVE_VERSION,
    targetsKilled: [],
    docs: [],
    hideout: 0,
    hideoutsFound: [0],
    stats: { time: 0, detections: 0, assassinations: 0, combatKills: 0, civilianKills: 0, deaths: 0 },
    complete: false,
  };
}

export function loadSave(storage: StorageLike | null): SaveData | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SaveData>;
    if (data.version !== SAVE_VERSION || !Array.isArray(data.targetsKilled) || !Array.isArray(data.docs)) return null;
    const base = newSave();
    return { ...base, ...data, stats: { ...base.stats, ...data.stats } } as SaveData;
  } catch {
    return null;
  }
}

export function writeSave(storage: StorageLike | null, data: SaveData): void {
  if (!storage) return;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage may be full or blocked; progress just won't persist.
  }
}

export function clearSave(storage: StorageLike | null): void {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

export interface Upgrade {
  docs: number;
  id: string;
  label: string;
}

export const UPGRADES: Upgrade[] = [
  { docs: 5, id: 'hp1', label: '体力上限 +2・薬の所持数 +1' },
  { docs: 10, id: 'knives', label: '投げナイフ所持数 +2' },
  { docs: 15, id: 'climb', label: '登攀速度 +30%' },
  { docs: 20, id: 'quiet', label: 'フリーランの足音が静かに' },
  { docs: 25, id: 'smoke', label: '煙玉所持数 +1' },
  { docs: 30, id: 'hp2', label: '体力上限 +2' },
];

export interface PlayerStats {
  maxHp: number;
  maxKnives: number;
  maxSmokes: number;
  maxPotions: number;
  climbMul: number;
  quiet: boolean;
}

export function unlockedUpgrades(docCount: number): Upgrade[] {
  return UPGRADES.filter((u) => docCount >= u.docs);
}

export function statsFor(docCount: number): PlayerStats {
  const ids = new Set(unlockedUpgrades(docCount).map((u) => u.id));
  return {
    maxHp: 10 + (ids.has('hp1') ? 2 : 0) + (ids.has('hp2') ? 2 : 0),
    maxKnives: 3 + (ids.has('knives') ? 2 : 0),
    maxSmokes: 1 + (ids.has('smoke') ? 1 : 0),
    maxPotions: 2 + (ids.has('hp1') ? 1 : 0),
    climbMul: ids.has('climb') ? 1.3 : 1,
    quiet: ids.has('quiet'),
  };
}

export type Rank = 'S' | 'A' | 'B' | 'C';

export function rankFor(stats: Stats): Rank {
  let score = 100;
  score -= stats.detections * 6;
  score -= stats.civilianKills * 15;
  score -= stats.deaths * 8;
  score += Math.min(20, stats.assassinations * 2);
  if (score >= 100) return 'S';
  if (score >= 75) return 'A';
  if (score >= 45) return 'B';
  return 'C';
}
