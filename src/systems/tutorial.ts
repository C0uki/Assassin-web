import { Guard } from '../entities/guard';
import { WALK } from '../entities/player';
import { GROUND_ROW, GROUND_Y, GuardKind, TRAINING } from '../world/city';
import { TILE, Tile } from '../world/tilemap';
import type { World } from '../world/world';
import { enterCombat } from './ai';

export interface TutorialStep {
  title: string;
  /** Instruction lines shown on screen. */
  text: string[];
  /** Where to point the player, in world pixels. */
  marker?: { x: number; y: number };
  setup?(w: World, t: Tutorial): void;
  /** Called every tick; returns true once the step is complete. */
  update(w: World, dt: number, t: Tutorial): boolean;
}

const px = (tx: number): number => tx * TILE;
const roofOf = (b: { h: number }): number => (GROUND_ROW - b.h) * TILE;
const onRoof = (w: World, b: { tx: number; tw: number; h: number }): boolean => {
  const p = w.player;
  return p.state === 'ground' && Math.abs(p.feet - roofOf(b)) < 2 && p.cx > px(b.tx) && p.cx < px(b.tx + b.tw);
};

export function spawnTrainingGuard(w: World, kind: GuardKind, x: number, feetY: number, facing: 1 | -1, passive: boolean): Guard {
  const g = new Guard(kind, { x, y: feetY, minX: x, maxX: x, facing, district: 0 });
  g.passive = passive;
  w.guards.push(g);
  return g;
}

/** A sparring partner that fights back (the player cannot die in training). */
function spawnSparring(w: World, t: Tutorial): Guard {
  const g = spawnTrainingGuard(w, 'guard', px(TRAINING.spar), GROUND_Y, -1, false);
  enterCombat(g, w, false);
  t.partner = g;
  return g;
}

/** Keep a fresh sparring partner around until the step is done. */
function ensureSparring(w: World, t: Tutorial): void {
  if (!t.partner || !t.partner.alive) spawnSparring(w, t);
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: '移動',
    text: ['A / D で歩く。歩いている間は物音を立てない。', '光の柱まで歩こう。'],
    marker: { x: px(TRAINING.walkTo), y: GROUND_Y },
    update: (w) => w.player.cx > px(TRAINING.walkTo),
  },
  {
    title: 'フリーラン',
    text: ['Shift を押しながら移動するとフリーラン。速いが足音で目立つ。', '走って次の光まで。'],
    marker: { x: px(TRAINING.runTo), y: GROUND_Y },
    update: (w) => w.player.cx > px(TRAINING.runTo) && Math.abs(w.player.body.vx) > WALK + 20,
  },
  {
    title: '登攀',
    text: ['建物の前で W を押し続けると壁を登る。', '登りきると屋根の上に這い上がる。'],
    marker: { x: px(TRAINING.climb.tx + 3), y: roofOf(TRAINING.climb) },
    update: (w) => onRoof(w, TRAINING.climb),
  },
  {
    title: '屋根渡り',
    text: ['Shift でフリーランすると、屋根の端で自動的に跳ぶ。', '高い壁には跳びつける。2つ先の屋根へ。'],
    marker: { x: px(TRAINING.hop2.tx + 2), y: roofOf(TRAINING.hop2) },
    update: (w) => onRoof(w, TRAINING.hop2),
  },
  {
    title: '信仰の跳躍',
    text: ['塔に登り、干し草の上から飛び降りよう。', '干し草に落ちれば、どんな高さでも無傷。'],
    marker: { x: px(TRAINING.hay.tx + 1.5), y: GROUND_Y - 30 },
    update: (w) => w.player.hidden && w.map.at(w.player.cx, w.player.feet - 4) === Tile.Hay,
  },
  {
    title: '背後からの暗殺',
    text: ['干し草から出て（F）、背を向けた衛兵に後ろから近づく。', '「J 暗殺」が出たら J。'],
    marker: { x: px(TRAINING.backKill), y: GROUND_Y - 60 },
    setup: (w, t) => {
      t.baseline = w.killCounts.assassinate;
      spawnTrainingGuard(w, 'guard', px(TRAINING.backKill), GROUND_Y, 1, true);
    },
    update: (w, _dt, t) => w.killCounts.assassinate > t.baseline,
  },
  {
    title: '空中暗殺',
    text: ['小屋に登って梁の上へ。真下の衛兵めがけて', 'S で梁から降り（またはジャンプして）、空中で J。'],
    marker: { x: px(TRAINING.airKill), y: GROUND_Y - 60 },
    setup: (w, t) => {
      t.baseline = w.killCounts.air;
      t.partner = spawnTrainingGuard(w, 'guard', px(TRAINING.airKill), GROUND_Y, 1, true);
    },
    update: (w, _dt, t) => {
      if (t.partner && !t.partner.alive && w.killCounts.air === t.baseline) {
        w.message('上から仕留めよう', '#ffd98a');
        t.partner = spawnTrainingGuard(w, 'guard', px(TRAINING.airKill), GROUND_Y, 1, true);
      }
      return w.killCounts.air > t.baseline;
    },
  },
  {
    title: '群衆に紛れる',
    text: ['歩いて（Shift なし）市民の集団の中に入ると群衆に紛れる。', '紛れている間、衛兵に見つからない。2秒間紛れよう。'],
    marker: { x: px((TRAINING.crowd.x0 + TRAINING.crowd.x1) / 2), y: GROUND_Y - 60 },
    setup: (_w, t) => {
      t.timer = 0;
    },
    update: (w, dt, t) => {
      t.timer = w.player.blended ? t.timer + dt : Math.max(0, t.timer - dt);
      return t.timer >= 2;
    },
  },
  {
    title: '回避',
    text: ['見つかると衛兵が斬りかかってくる。', 'L で回避ロール。転がっている間は攻撃が当たらない。'],
    marker: { x: px(TRAINING.spar), y: GROUND_Y - 60 },
    setup: (w, t) => spawnSparring(w, t),
    update: (w, _dt, t) => {
      ensureSparring(w, t);
      return w.player.state === 'dodge';
    },
  },
  {
    title: 'パリィとカウンター',
    text: ['衛兵の頭上が白く光ったら攻撃の合図。直前に K を押すとパリィ。', '体勢が崩れた敵に J でカウンター（赤い光の攻撃は防げない）。'],
    marker: { x: px(TRAINING.spar), y: GROUND_Y - 60 },
    setup: (w, t) => {
      t.baseline = w.killCounts.counter;
      ensureSparring(w, t);
    },
    update: (w, _dt, t) => {
      ensureSparring(w, t);
      return w.killCounts.counter > t.baseline;
    },
  },
  {
    title: 'コンボ',
    text: ['J を続けて押すと3段攻撃。3段目は敵の体勢を崩す。', '剣で衛兵を倒そう。'],
    marker: { x: px(TRAINING.spar), y: GROUND_Y - 60 },
    setup: (w, t) => {
      t.baseline = w.killCounts.combat;
      ensureSparring(w, t);
    },
    update: (w, _dt, t) => {
      ensureSparring(w, t);
      return w.killCounts.combat > t.baseline;
    },
  },
  {
    title: '鷹の目',
    text: ['E を長押しすると鷹の目。標的は金、敵は赤、古文書は青に光る。', '1秒間使ってみよう。'],
    setup: (w, t) => {
      t.timer = 0;
      // Clear the sparring partner away before the ranged lessons.
      w.guards = w.guards.filter((g) => g !== t.partner || !g.alive);
      t.partner = spawnTrainingGuard(w, 'guard', px(TRAINING.knifeRoof.tx + 2.5), roofOf(TRAINING.knifeRoof), -1, true);
    },
    update: (w, dt, t) => {
      if (w.eagleVision) t.timer += dt;
      return t.timer >= 1;
    },
  },
  {
    title: '投げナイフ',
    text: ['I で投げナイフ。近くの敵に自動で狙いをつける。', '屋根の上の衛兵を倒そう（ナイフは隠れ家で補充できる）。'],
    marker: { x: px(TRAINING.knifeRoof.tx + 2.5), y: roofOf(TRAINING.knifeRoof) - 50 },
    setup: (w, t) => {
      t.baseline = w.killCounts.knife;
      w.player.knives = w.playerStats.maxKnives;
    },
    update: (w, _dt, t) => {
      if (w.player.knives === 0 && w.killCounts.knife === t.baseline) w.player.knives = w.playerStats.maxKnives;
      if (t.partner && !t.partner.alive && w.killCounts.knife === t.baseline)
        t.partner = spawnTrainingGuard(w, 'guard', px(TRAINING.knifeRoof.tx + 2.5), roofOf(TRAINING.knifeRoof), -1, true);
      return w.killCounts.knife > t.baseline;
    },
  },
  {
    title: '回復',
    text: ['H で薬を飲む（飲んでいる間は動けない。隠れ家で補充できる）。', '落ちている食べ物は触れるだけで回復する。両方試そう。'],
    setup: (w, t) => {
      const p = w.player;
      p.hp = w.playerStats.maxHp - 6;
      p.potions = Math.max(1, p.potions);
      t.baseline = w.healCounts.potion;
      t.baseline2 = w.healCounts.food;
      w.dropFood(p.cx + p.facing * 80, p.feet);
      w.message('負傷した！ 体力を回復しよう', '#ffb0a0');
    },
    update: (w, _dt, t) => {
      const p = w.player;
      const drank = w.healCounts.potion > t.baseline;
      const ate = w.healCounts.food > t.baseline2;
      // Keep both lessons possible whatever order they are done in.
      if (p.hp >= w.playerStats.maxHp && !(drank && ate)) p.hp = w.playerStats.maxHp - (drank ? 2 : 4);
      if (!drank && p.potions === 0) p.potions = 1;
      if (!ate && !w.pickups.some((it) => it.kind === 'food' && it.respawnT === 0)) w.dropFood(p.cx + p.facing * 80, p.feet);
      return drank && ate;
    },
  },
  {
    title: '煙玉',
    text: ['O で煙玉。煙の中の敵はしばらく動けず、一撃で暗殺できる。', '地上で使ってみよう。'],
    setup: (w) => {
      w.player.smokes = Math.max(1, w.player.smokes);
    },
    update: (w) => {
      if (w.player.smokes === 0 && w.smokes.length === 0) w.player.smokes = 1;
      return w.smokes.length > 0;
    },
  },
];

export class Tutorial {
  index = 0;
  /** Seconds since every step was completed, or -1. */
  finishedT = -1;
  baseline = 0;
  baseline2 = 0;
  timer = 0;
  partner: Guard | null = null;

  constructor(
    private w: World,
    readonly steps: TutorialStep[] = TUTORIAL_STEPS,
  ) {
    this.enter();
  }

  get current(): TutorialStep | null {
    return this.steps[this.index] ?? null;
  }

  get finished(): boolean {
    return this.finishedT >= 0;
  }

  private enter(): void {
    const s = this.current;
    this.w.marker = s?.marker ?? null;
    s?.setup?.(this.w, this);
  }

  update(dt: number): void {
    if (this.finished) {
      this.finishedT += dt;
      return;
    }
    const s = this.current;
    if (!s || !s.update(this.w, dt, this)) return;
    this.w.message(`✓ ${s.title}`, '#b6ff9f');
    this.w.sound('upgrade');
    this.index++;
    if (this.index >= this.steps.length) {
      this.finishedT = 0;
      this.w.marker = null;
      this.w.message('訓練修了。街へ向かえ。', '#ffd76a');
      return;
    }
    this.enter();
  }
}
