import { Rng } from '../core/rng';
import { TILE, Tile, TileMap } from './tilemap';

export const WORLD_TW = 600;
export const WORLD_TH = 40;
/** First solid ground row. */
export const GROUND_ROW = 35;
export const GROUND_Y = GROUND_ROW * TILE;

export type BuildingKind = 'house' | 'tower' | 'warehouse' | 'manor' | 'cathedral' | 'hideout' | 'wall';
export type GuardKind = 'guard' | 'elite' | 'archer' | 'target';

export interface Building {
  tx: number;
  tw: number;
  /** Roof row. */
  topTy: number;
  district: number;
  kind: BuildingKind;
  variant: number;
}

export interface DistrictDef {
  name: string;
  sub: string;
  x0: number;
  x1: number;
}

export interface GuardSpawn {
  kind: GuardKind;
  x: number;
  /** Feet position. */
  y: number;
  minX: number;
  maxX: number;
  facing: 1 | -1;
  district: number;
  targetId?: string;
}

export interface TargetDef {
  id: string;
  name: string;
  title: string;
  desc: string;
  district: number;
}

export interface CivGroupSpawn {
  x: number;
  count: number;
  minX: number;
  maxX: number;
  district: number;
}

export interface DocSpawn {
  id: string;
  x: number;
  y: number;
}

export type PickupKind = 'food' | 'potion';

export interface PickupSpawn {
  id: string;
  kind: PickupKind;
  /** Center of the item. */
  x: number;
  y: number;
}

export interface HideoutDef {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  district: number;
}

export interface CityDef {
  map: TileMap;
  buildings: Building[];
  beams: { tx: number; ty: number; tw: number }[];
  hays: { tx: number; ty: number; tw: number }[];
  districts: DistrictDef[];
  guards: GuardSpawn[];
  targets: TargetDef[];
  civGroups: CivGroupSpawn[];
  docs: DocSpawn[];
  pickups: PickupSpawn[];
  hideouts: HideoutDef[];
}

export const TARGETS: TargetDef[] = [
  { id: 't1', name: 'ヴァレク', title: '徴税人', desc: '貧しき者から搾り取る男。路地を護衛と巡回している。', district: 0 },
  { id: 't2', name: 'ドゥルガ', title: '密輸頭', desc: '倉庫の屋上で取引を仕切る。弓兵に守られている。', district: 0 },
  { id: 't3', name: 'カシム', title: '奴隷商人', desc: '大市場の広場で競りを開く。人混みに紛れて近づけ。', district: 1 },
  { id: 't4', name: 'セリーン', title: '毒薬師', desc: '高い館のバルコニーで調合している。', district: 1 },
  { id: 't5', name: 'ロートフェルト', title: '司令官', desc: '中庭で精鋭兵を率いる。正面からは危険だ。', district: 2 },
  { id: 't6', name: 'アルマン', title: '大司祭', desc: '大聖堂の屋上で祈る教団の首領。', district: 2 },
];

const DISTRICTS: DistrictDef[] = [
  { name: 'スラム街', sub: '下層区', x0: 0, x1: 200 * TILE },
  { name: '大市場', sub: '中層区', x0: 200 * TILE, x1: 400 * TILE },
  { name: '貴族街', sub: '上層区', x0: 400 * TILE, x1: 600 * TILE },
];

const HEIGHTS: [number, number][] = [
  [4, 8],
  [5, 10],
  [7, 12],
];

export function districtAt(x: number): number {
  for (let i = 0; i < DISTRICTS.length; i++) if (x < DISTRICTS[i].x1) return i;
  return DISTRICTS.length - 1;
}

const roofY = (topTy: number): number => topTy * TILE;

export interface CityHelpers {
  addBuilding(tx: number, tw: number, h: number, kind: BuildingKind, district: number): Building;
  addHay(tx: number, tw?: number): void;
  addBeam(tx: number, ty: number, tw: number): void;
  guard(kind: GuardKind, x: number, y: number, range: [number, number], district: number, facing?: 1 | -1, targetId?: string): void;
  onRoof(b: Building): { y: number; range: [number, number]; cx: number };
}

/** Shared building blocks for authoring maps. */
export function cityHelpers(city: CityDef, rng: Rng): CityHelpers {
  const map = city.map;
  const addBuilding = (tx: number, tw: number, h: number, kind: BuildingKind, district: number): Building => {
    const b: Building = { tx, tw, topTy: GROUND_ROW - h, district, kind, variant: rng.int(0, 3) };
    map.fill(tx, b.topTy + 1, tw, h - 1, Tile.Facade);
    map.fill(tx, b.topTy, tw, 1, Tile.Roof);
    city.buildings.push(b);
    return b;
  };
  const addHay = (tx: number, tw = 2): void => {
    map.fill(tx, GROUND_ROW - 1, tw, 1, Tile.Hay);
    city.hays.push({ tx, ty: GROUND_ROW - 1, tw });
  };
  const addBeam = (tx: number, ty: number, tw: number): void => {
    for (let x = tx; x < tx + tw; x++) if (map.get(x, ty) === Tile.Empty) map.set(x, ty, Tile.Roof);
    city.beams.push({ tx, ty, tw });
  };
  const guard = (
    kind: GuardKind,
    x: number,
    y: number,
    range: [number, number],
    district: number,
    facing: 1 | -1 = 1,
    targetId?: string,
  ): void => {
    city.guards.push({ kind, x, y, minX: range[0], maxX: range[1], facing, district, targetId });
  };
  const onRoof = (b: Building): { y: number; range: [number, number]; cx: number } => ({
    y: roofY(b.topTy),
    range: [(b.tx + 0.5) * TILE, (b.tx + b.tw - 1.5) * TILE],
    cx: (b.tx + b.tw / 2) * TILE,
  });

  return { addBuilding, addHay, addBeam, guard, onRoof };
}

export function buildCity(seed = 1337): CityDef {
  const rng = new Rng(seed);
  const map = new TileMap(WORLD_TW, WORLD_TH);
  map.fill(0, GROUND_ROW, WORLD_TW, WORLD_TH - GROUND_ROW, Tile.Solid);

  const city: CityDef = {
    map,
    buildings: [],
    beams: [],
    hays: [],
    districts: DISTRICTS,
    guards: [],
    targets: TARGETS,
    civGroups: [],
    docs: [],
    pickups: [],
    hideouts: [],
  };

  const { addBuilding, addHay, addBeam, guard, onRoof } = cityHelpers(city, rng);

  // ---- Authored landmarks (reserved spans) ----
  type Landmark = { tx: number; tw: number; build: () => void };
  const landmarks: Landmark[] = [];
  const mark = (tx: number, tw: number, build: () => void): void => {
    landmarks.push({ tx, tw, build });
  };

  // District walls with gates.
  for (const wx of [198, 398]) {
    mark(wx - 1, 4, () => {
      map.fill(wx, GROUND_ROW - 10, 2, 7, Tile.Stone);
      map.fill(wx, GROUND_ROW - 11, 2, 1, Tile.Roof);
      city.buildings.push({ tx: wx, tw: 2, topTy: GROUND_ROW - 11, district: wx < 300 ? 0 : 1, kind: 'wall', variant: 0 });
      // Tall buildings on both sides let you climb over the wall instead of passing the gate.
      addBuilding(wx - 6, 5, 11, 'house', districtAt((wx - 6) * TILE));
      addBuilding(wx + 3, 5, 11, 'house', districtAt((wx + 3) * TILE));
      const d0 = districtAt((wx - 1) * TILE);
      const d1 = districtAt((wx + 3) * TILE);
      guard(d1 === 2 ? 'elite' : 'guard', (wx - 2) * TILE, GROUND_Y, [(wx - 2) * TILE, (wx - 2) * TILE], d0, -1);
      guard('guard', (wx + 2.5) * TILE, GROUND_Y, [(wx + 2.5) * TILE, (wx + 2.5) * TILE], d1, 1);
    });
  }
  // landmarks for walls include neighbours
  landmarks.forEach((l) => {
    l.tx -= 6;
    l.tw += 11;
  });

  // Hideouts
  const hideoutAt = (tx: number, district: number, id: number): void =>
    mark(tx - 1, 9, () => {
      addBuilding(tx, 7, 5, 'hideout', district);
      city.hideouts.push({ id, x: (tx + 3) * TILE, y: GROUND_Y - 64, w: 64, h: 64, district });
    });
  hideoutAt(3, 0, 0);
  hideoutAt(210, 1, 1);
  hideoutAt(410, 2, 2);

  // Towers for leaps of faith
  const towerAt = (tx: number, h: number, district: number): void =>
    mark(tx - 1, 9, () => {
      const b = addBuilding(tx, 3, h, 'tower', district);
      addHay(tx + 4, 3);
      city.docs.push({ id: `tower${district}`, x: (tx + 1.5) * TILE, y: roofY(b.topTy) - 18 });
    });
  towerAt(96, 18, 0);
  towerAt(300, 21, 1);
  towerAt(570, 22, 2);

  // Target 1: tax collector patrols an alley.
  mark(54, 30, () => {
    addBuilding(55, 6, 5, 'house', 0);
    addBuilding(63, 5, 7, 'house', 0);
    addBuilding(70, 7, 4, 'house', 0);
    addBuilding(79, 5, 6, 'house', 0);
    addHay(61);
    const r: [number, number] = [56 * TILE, 82 * TILE];
    guard('target', 68 * TILE, GROUND_Y, r, 0, 1, 't1');
    guard('guard', 66 * TILE, GROUND_Y, r, 0, 1);
    guard('guard', 70 * TILE, GROUND_Y, r, 0, 1);
  });

  // Target 2: smuggler on a warehouse roof.
  mark(142, 22, () => {
    addBuilding(143, 4, 5, 'house', 0);
    const w = addBuilding(147, 12, 7, 'warehouse', 0);
    const n = addBuilding(160, 4, 9, 'house', 0);
    addHay(158, 2);
    const rw = onRoof(w);
    guard('target', rw.cx, rw.y, rw.range, 0, -1, 't2');
    guard('guard', rw.cx + 2 * TILE, rw.y, rw.range, 0, -1);
    const rn = onRoof(n);
    guard('archer', rn.cx, rn.y, rn.range, 0, -1);
  });

  // Target 3: slave trader in the market square (open space, dense crowds).
  mark(246, 34, () => {
    addBuilding(246, 4, 6, 'house', 1);
    addBuilding(276, 4, 7, 'house', 1);
    addBeam(250, GROUND_ROW - 6, 4);
    addBeam(272, GROUND_ROW - 7, 4);
    addHay(256);
    addHay(268);
    const r: [number, number] = [252 * TILE, 274 * TILE];
    guard('target', 263 * TILE, GROUND_Y, r, 1, -1, 't3');
    guard('guard', 258 * TILE, GROUND_Y, [258 * TILE, 258 * TILE], 1, 1);
    guard('guard', 268 * TILE, GROUND_Y, [268 * TILE, 268 * TILE], 1, -1);
    guard('guard', 262 * TILE, GROUND_Y, r, 1, 1);
    for (let i = 0; i < 5; i++) city.civGroups.push({ x: (252 + i * 5) * TILE, count: rng.int(3, 5), minX: 250 * TILE, maxX: 276 * TILE, district: 1 });
  });

  // Target 4: poisoner on a balcony.
  mark(336, 22, () => {
    addBuilding(337, 4, 6, 'house', 1);
    const m = addBuilding(341, 14, 12, 'manor', 1);
    addBuilding(356, 3, 8, 'house', 1);
    const by = GROUND_ROW - 6;
    map.fill(m.tx + 1, by, m.tw - 2, 1, Tile.Roof);
    city.beams.push({ tx: m.tx + 1, ty: by, tw: m.tw - 2 });
    const range: [number, number] = [(m.tx + 2) * TILE, (m.tx + m.tw - 3) * TILE];
    guard('target', (m.tx + 7) * TILE, by * TILE, range, 1, 1, 't4');
    guard('guard', (m.tx + 4) * TILE, by * TILE, range, 1, 1);
    const r = onRoof(m);
    guard('archer', r.cx, r.y, r.range, 1, -1);
    city.docs.push({ id: 'manor', x: (m.tx + m.tw - 2) * TILE, y: roofY(m.topTy) - 18 });
  });

  // Target 5: commander in a courtyard.
  mark(436, 40, () => {
    addBuilding(436, 5, 10, 'manor', 2);
    addBuilding(471, 5, 11, 'manor', 2);
    addBeam(441, GROUND_ROW - 8, 30);
    addHay(452);
    const r: [number, number] = [443 * TILE, 469 * TILE];
    guard('target', 456 * TILE, GROUND_Y, r, 2, 1, 't5');
    guard('elite', 450 * TILE, GROUND_Y, r, 2, 1);
    guard('elite', 462 * TILE, GROUND_Y, r, 2, -1);
    guard('guard', 445 * TILE, GROUND_Y, [445 * TILE, 445 * TILE], 2, 1);
    guard('archer', 455 * TILE, (GROUND_ROW - 8) * TILE, [443 * TILE, 468 * TILE], 2, 1);
  });

  // Target 6: high priest atop the cathedral.
  mark(512, 30, () => {
    addBuilding(513, 5, 9, 'house', 2);
    const c = addBuilding(519, 14, 15, 'cathedral', 2);
    addBuilding(534, 5, 10, 'house', 2);
    addHay(531, 2);
    const r = onRoof(c);
    guard('target', r.cx, r.y, r.range, 2, -1, 't6');
    guard('elite', r.cx - 3 * TILE, r.y, r.range, 2, 1);
    guard('archer', (515 * TILE), roofY(GROUND_ROW - 9), [514 * TILE, 516 * TILE], 2, 1);
    guard('archer', (536 * TILE), roofY(GROUND_ROW - 10), [535 * TILE, 537 * TILE], 2, -1);
  });

  // ---- Build landmarks, then fill the gaps with random houses ----
  landmarks.sort((a, b) => a.tx - b.tx);
  const fillers: Building[] = [];
  let cursor = 0;
  const fill = (x0: number, x1: number): void => {
    let x = x0;
    while (x < x1) {
      const gap = rng.int(0, 3);
      const w = rng.int(4, 9);
      if (x + gap + w > x1) break;
      const d = districtAt((x + gap) * TILE);
      const [hmin, hmax] = HEIGHTS[d];
      const b = addBuilding(x + gap, w, rng.int(hmin, hmax), 'house', d);
      fillers.push(b);
      if (gap >= 1 && rng.chance(0.35)) addHay(x, Math.min(2, gap));
      x += gap + w;
    }
  };
  for (const l of landmarks) {
    if (l.tx > cursor) fill(cursor, l.tx);
    cursor = Math.max(cursor, l.tx + l.tw);
  }
  fill(cursor, WORLD_TW);
  for (const l of landmarks) l.build();

  // Beams bridging wider gaps between neighbouring fillers.
  const sorted = [...city.buildings].filter((b) => b.kind !== 'wall').sort((a, b) => a.tx - b.tx);
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const gap = b.tx - (a.tx + a.tw);
    if (gap >= 2 && gap <= 5 && rng.chance(0.5)) addBeam(a.tx + a.tw, Math.max(a.topTy, b.topTy), gap);
  }

  // ---- Populate districts ----
  const reserved = (x: number): boolean =>
    city.hideouts.some((h) => Math.abs(h.x - x) < 20 * TILE) || landmarks.some((l) => x > l.tx * TILE && x < (l.tx + l.tw) * TILE);

  const patrolCounts = [5, 7, 9];
  const archerCounts = [2, 4, 5];
  const civCounts = [7, 9, 6];
  DISTRICTS.forEach((dist, d) => {
    const lo = dist.x0 + 6 * TILE;
    const hi = dist.x1 - 8 * TILE;
    for (let i = 0, tries = 0; i < patrolCounts[d] && tries < 200; tries++) {
      const x = rng.range(lo, hi);
      if (reserved(x)) continue;
      const span = rng.range(80, 220);
      const kind: GuardKind = d === 2 && rng.chance(0.5) ? 'elite' : 'guard';
      guard(kind, x, GROUND_Y, [Math.max(lo, x - span), Math.min(hi, x + span)], d, rng.chance(0.5) ? 1 : -1);
      i++;
    }
    const roofs = fillers.filter((b) => b.district === d && b.tw >= 5 && GROUND_ROW - b.topTy >= 6);
    for (let i = 0; i < archerCounts[d] && roofs.length; i++) {
      const b = roofs.splice(rng.int(0, roofs.length - 1), 1)[0];
      const r = onRoof(b);
      guard('archer', r.cx, r.y, r.range, d, rng.chance(0.5) ? 1 : -1);
    }
    for (let i = 0, tries = 0; i < civCounts[d] && tries < 200; tries++) {
      const x = rng.range(lo, hi);
      if (city.hideouts.some((h) => Math.abs(h.x - x) < 4 * TILE)) continue;
      city.civGroups.push({ x, count: rng.int(3, 5), minX: lo, maxX: hi, district: d });
      i++;
    }
    // Documents on rooftops, spread across the district.
    const candidates = fillers.filter((b) => b.district === d);
    const want = 10 - city.docs.filter((doc) => districtAt(doc.x) === d).length;
    for (let i = 0; i < want && candidates.length; i++) {
      const idx = Math.min(candidates.length - 1, Math.floor(((i + 0.5) / want) * candidates.length));
      const b = candidates.splice(idx, 1)[0];
      city.docs.push({ id: `d${d}_${i}`, x: (b.tx + rng.range(1, b.tw - 1)) * TILE, y: roofY(b.topTy) - 18 });
    }
  });

  placePickups(city, fillers);
  return city;
}

/** Food along the streets and potions on rooftops. Uses its own RNG so the rest of the city stays put. */
function placePickups(city: CityDef, fillers: Building[]): void {
  const rng = new Rng(2024);
  city.districts.forEach((dist, d) => {
    const lo = dist.x0 + 10 * TILE;
    const hi = dist.x1 - 10 * TILE;
    for (let i = 0; i < 6; i++) {
      const x = lo + ((i + rng.range(0.2, 0.8)) / 6) * (hi - lo);
      city.pickups.push({ id: `f${d}_${i}`, kind: 'food', x, y: GROUND_Y - 12 });
    }
    const roofs = fillers.filter((b) => b.district === d && !city.docs.some((doc) => doc.x >= b.tx * TILE && doc.x < (b.tx + b.tw) * TILE));
    for (let i = 0; i < 2 && roofs.length; i++) {
      const b = roofs.splice(Math.min(roofs.length - 1, Math.floor(((i + 0.5) / 2) * roofs.length)), 1)[0];
      city.pickups.push({ id: `p${d}_${i}`, kind: 'potion', x: (b.tx + rng.range(1, b.tw - 1)) * TILE, y: b.topTy * TILE - 14 });
    }
  });
}

export const PLAYER_START = { x: 6.5 * TILE, y: GROUND_Y };

export const TRAINING_TW = 130;

/** Tile x of each training station, left to right. */
export const TRAINING = {
  start: 3,
  walkTo: 16,
  runTo: 29,
  climb: { tx: 31, tw: 6, h: 6 },
  hop1: { tx: 39, tw: 6, h: 6 },
  hop2: { tx: 48, tw: 5, h: 7 },
  tower: { tx: 55, tw: 3, h: 14 },
  hay: { tx: 59, tw: 3 },
  backKill: 72,
  airPerch: { tx: 78, tw: 3, h: 5 },
  airBeam: { tx: 81, tw: 7 },
  airKill: 85,
  crowd: { x0: 92, x1: 101 },
  spar: 110,
  knifeRoof: { tx: 121, tw: 5, h: 4 },
} as const;

/** A short, safe level that teaches one move at a time. */
export function buildTrainingGround(): CityDef {
  const rng = new Rng(7);
  const map = new TileMap(TRAINING_TW, WORLD_TH);
  map.fill(0, GROUND_ROW, TRAINING_TW, WORLD_TH - GROUND_ROW, Tile.Solid);
  const city: CityDef = {
    map,
    buildings: [],
    beams: [],
    hays: [],
    districts: [{ name: '教団の訓練場', sub: '修練', x0: 0, x1: TRAINING_TW * TILE }],
    guards: [],
    targets: [],
    civGroups: [],
    docs: [],
    pickups: [],
    hideouts: [],
  };
  const { addBuilding, addHay, addBeam } = cityHelpers(city, rng);
  const T = TRAINING;

  addBuilding(0, 6, 5, 'hideout', 0);
  city.hideouts.push({ id: 0, x: T.start * TILE, y: GROUND_Y - 64, w: 64, h: 64, district: 0 });
  addBuilding(T.climb.tx, T.climb.tw, T.climb.h, 'house', 0);
  addBuilding(T.hop1.tx, T.hop1.tw, T.hop1.h, 'house', 0);
  addBuilding(T.hop2.tx, T.hop2.tw, T.hop2.h, 'house', 0);
  addBuilding(T.tower.tx, T.tower.tw, T.tower.h, 'tower', 0);
  addHay(T.hay.tx, T.hay.tw);
  addBuilding(T.airPerch.tx, T.airPerch.tw, T.airPerch.h, 'house', 0);
  addBeam(T.airBeam.tx, GROUND_ROW - T.airPerch.h, T.airBeam.tw);
  addBuilding(T.knifeRoof.tx, T.knifeRoof.tw, T.knifeRoof.h, 'warehouse', 0);
  city.civGroups.push({ x: (T.crowd.x0 + 2) * TILE, count: 5, minX: T.crowd.x0 * TILE, maxX: T.crowd.x1 * TILE, district: 0 });
  return city;
}
