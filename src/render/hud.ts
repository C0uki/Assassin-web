import { VIEW_H, VIEW_W } from '../core/camera';
import { TOTAL_DOCS } from '../systems/progress';
import { BOSS, GROUND_ROW } from '../world/city';
import { PHASE_FLOOR } from '../systems/boss';
import type { Tutorial } from '../systems/tutorial';
import type { World } from '../world/world';

export const FONT = "'Hiragino Kaku Gothic ProN','Noto Sans JP','Yu Gothic',sans-serif";

const MAP_X = 180;
const MAP_W = 600;
const MAP_Y = 10;
const MAP_H = 22;

let skyline: { x: number; w: number; h: number }[] | null = null;

export interface HudExtra {
  muted: boolean;
  tutorial: Tutorial | null;
}

export function drawHud(ctx: CanvasRenderingContext2D, w: World, extra: HudExtra): void {
  const p = w.player;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // HP
  const maxHp = w.playerStats.maxHp;
  for (let i = 0; i < maxHp; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(14 + i * 13, 12, 11, 14);
    ctx.fillStyle = i < p.hp ? (p.hp <= 3 ? '#ff5040' : '#e8e0cc') : 'rgba(80,60,60,0.6)';
    ctx.fillRect(16 + i * 13, 14, 7, 10);
  }
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = '#e8e0cc';
  ctx.fillText(`薬 ${p.potions}/${w.playerStats.maxPotions}   ナイフ ${p.knives}/${w.playerStats.maxKnives}   煙玉 ${p.smokes}/${w.playerStats.maxSmokes}`, 14, 44);
  if (extra.tutorial) drawTutorial(ctx, extra.tutorial);
  else if (w.boss) drawBossBar(ctx, w);
  else {
    ctx.fillText(`文書 ${w.save.docs.length}/${TOTAL_DOCS}   標的 ${w.save.targetsKilled.length}/${w.city.targets.length}`, 14, 60);
    drawMinimap(ctx, w);
  }

  // status
  ctx.textAlign = 'right';
  ctx.font = `bold 13px ${FONT}`;
  if (w.combatActive) {
    ctx.fillStyle = '#ff5a40';
    ctx.fillText('発見されている', VIEW_W - 14, 26);
  } else if (w.guards.some((g) => g.alive && (g.state === 'search' || g.state === 'suspicious') && Math.abs(g.cx - p.cx) < 900)) {
    ctx.fillStyle = '#ffc040';
    ctx.fillText('警戒されている', VIEW_W - 14, 26);
  } else if (p.hidden || p.blended) {
    ctx.fillStyle = '#9fd0ff';
    ctx.fillText(p.hidden ? '隠れている' : '群衆に紛れている', VIEW_W - 14, 26);
  }
  if (w.isAlert(w.district)) {
    ctx.fillStyle = '#e0a060';
    ctx.font = `11px ${FONT}`;
    ctx.fillText('地区警戒中', VIEW_W - 14, 42);
  }
  if (extra.muted) {
    ctx.fillStyle = '#aaa';
    ctx.font = `11px ${FONT}`;
    ctx.fillText('ミュート (M)', VIEW_W - 14, 58);
  }

  // messages
  ctx.textAlign = 'center';
  ctx.font = `bold 16px ${FONT}`;
  const msgY = extra.tutorial ? 104 : w.boss ? 66 : 50;
  w.messages.forEach((m, i) => {
    ctx.globalAlpha = Math.min(1, m.t * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const tw = ctx.measureText(m.text).width + 24;
    ctx.fillRect(VIEW_W / 2 - tw / 2, msgY + i * 28, tw, 24);
    ctx.fillStyle = m.color;
    ctx.fillText(m.text, VIEW_W / 2, msgY + 18 + i * 28);
  });
  ctx.globalAlpha = 1;

  // district banner
  if (w.bannerT > 0) {
    const d = w.city.districts[w.district];
    ctx.globalAlpha = Math.min(1, w.bannerT, (3.5 - w.bannerT) * 3);
    ctx.font = `bold 34px ${FONT}`;
    ctx.fillStyle = '#f6ecd6';
    ctx.fillText(d.name, VIEW_W / 2, 190);
    ctx.font = `15px ${FONT}`;
    ctx.fillStyle = '#d8c8a8';
    ctx.fillText(`— ${d.sub} —`, VIEW_W / 2, 216);
    ctx.globalAlpha = 1;
  }

  // controls hint
  ctx.textAlign = 'left';
  ctx.font = `11px ${FONT}`;
  ctx.fillStyle = 'rgba(240,230,210,0.6)';
  ctx.fillText(
    'A/D 移動  Shift フリーラン  W/S 登る/降りる  Space ジャンプ  J 攻撃・暗殺  K 防御(パリィ)  L 回避  H 薬  I ナイフ  O 煙玉  E 鷹の目  F 隠れる  Esc ポーズ',
    14,
    VIEW_H - 12,
  );

  // death overlay
  if (w.playerDeadT >= 0) {
    const a = Math.min(1, w.playerDeadT / 1.2);
    ctx.fillStyle = `rgba(40,0,0,${0.6 * a})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = `bold 40px ${FONT}`;
    ctx.fillStyle = '#ffdddd';
    ctx.fillText(w.boss ? '総長に敗れた……' : '力尽きた……', VIEW_W / 2, VIEW_H / 2 - 10);
    ctx.font = `15px ${FONT}`;
    if (!w.boss) ctx.fillText('最後に訪れた隠れ家で目を覚ます', VIEW_W / 2, VIEW_H / 2 + 24);
    ctx.globalAlpha = 1;
  }
}

function drawBossBar(ctx: CanvasRenderingContext2D, w: World): void {
  const boss = w.boss!.boss;
  const x = 240;
  const bw = VIEW_W - 480;
  const y = 30;
  ctx.textAlign = 'center';
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillStyle = '#ffd0a0';
  ctx.fillText(`${BOSS.title} ${BOSS.name}`, VIEW_W / 2, y - 8);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - 2, y - 2, bw + 4, 14);
  const frac = Math.max(0, boss.hp) / boss.maxHp;
  ctx.fillStyle = boss.hurtT > 0 ? '#ffffff' : '#c02a22';
  ctx.fillRect(x, y, bw * frac, 10);
  // phase notches
  ctx.fillStyle = '#ffe2a0';
  for (const f of [PHASE_FLOOR[1], PHASE_FLOOR[2]]) ctx.fillRect(x + (bw * f) / boss.maxHp - 1, y - 3, 2, 16);
  ctx.textAlign = 'left';
}

function drawTutorial(ctx: CanvasRenderingContext2D, t: Tutorial): void {
  const step = t.current;
  const x = 200;
  const w = VIEW_W - 400;
  ctx.fillStyle = 'rgba(10,8,12,0.72)';
  ctx.fillRect(x, 8, w, 84);
  ctx.strokeStyle = 'rgba(255,217,138,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, 8.5, w - 1, 83);
  ctx.textAlign = 'left';
  ctx.font = `bold 15px ${FONT}`;
  ctx.fillStyle = '#ffd98a';
  if (!step) {
    ctx.fillText('訓練修了', x + 14, 32);
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = '#efe4cc';
    ctx.fillText('まもなく街へ向かう……', x + 14, 56);
    return;
  }
  ctx.fillText(`訓練 ${t.index + 1}/${t.steps.length} ― ${step.title}`, x + 14, 30);
  ctx.textAlign = 'right';
  ctx.font = `11px ${FONT}`;
  ctx.fillStyle = 'rgba(240,230,210,0.6)';
  ctx.fillText('Esc → 訓練を飛ばす', x + w - 12, 30);
  ctx.textAlign = 'left';
  ctx.font = `13px ${FONT}`;
  ctx.fillStyle = '#efe4cc';
  step.text.forEach((line, i) => ctx.fillText(line, x + 14, 54 + i * 20));
  // progress pips
  for (let i = 0; i < t.steps.length; i++) {
    ctx.fillStyle = i < t.index ? '#b6ff9f' : i === t.index ? '#ffd98a' : 'rgba(255,255,255,0.2)';
    ctx.fillRect(x + 14 + i * 14, 84, 10, 3);
  }
}

function drawMinimap(ctx: CanvasRenderingContext2D, w: World): void {
  const worldW = w.map.widthPx;
  const sx = MAP_W / worldW;
  if (!skyline) {
    skyline = w.city.buildings.map((b) => ({ x: b.tx * 32 * sx, w: Math.max(1, b.tw * 32 * sx), h: ((GROUND_ROW - b.topTy) / 24) * (MAP_H - 6) }));
  }
  ctx.fillStyle = 'rgba(10,8,12,0.55)';
  ctx.fillRect(MAP_X - 4, MAP_Y - 2, MAP_W + 8, MAP_H + 4);
  const colors = ['rgba(150,110,80,0.35)', 'rgba(200,150,90,0.35)', 'rgba(220,210,190,0.35)'];
  w.city.districts.forEach((d, i) => {
    ctx.fillStyle = colors[i];
    ctx.fillRect(MAP_X + d.x0 * sx, MAP_Y, (d.x1 - d.x0) * sx, MAP_H);
  });
  ctx.fillStyle = 'rgba(30,22,26,0.8)';
  for (const s of skyline) ctx.fillRect(MAP_X + s.x, MAP_Y + MAP_H - s.h, s.w, s.h);
  const yOf = (y: number): number => MAP_Y + MAP_H - Math.max(0, Math.min(MAP_H, ((w.map.heightPx - 160 - y) / (24 * 32)) * (MAP_H - 6)));

  for (const h of w.hideouts) {
    if (!h.found) continue;
    ctx.fillStyle = '#c03030';
    ctx.fillRect(MAP_X + (h.x + 32) * sx - 2, MAP_Y + MAP_H - 6, 4, 6);
  }
  for (const g of w.guards) {
    if (!g.alive) continue;
    const x = MAP_X + g.cx * sx;
    if (g.kind === 'target') {
      const y = yOf(g.feet) - 3;
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath();
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x + 4, y);
      ctx.lineTo(x, y + 4);
      ctx.lineTo(x - 4, y);
      ctx.closePath();
      ctx.fill();
    } else if (g.state === 'combat') {
      ctx.fillStyle = '#ff3a2a';
      ctx.fillRect(x - 1.5, yOf(g.feet) - 3, 3, 3);
    }
  }
  if (w.eagleVision) {
    ctx.fillStyle = '#7cc4ff';
    for (const d of w.docs) ctx.fillRect(MAP_X + d.x * sx - 1, yOf(d.y + 18) - 3, 2, 2);
  }
  const px = MAP_X + w.player.cx * sx;
  const py = yOf(w.player.feet);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(px, py - 8);
  ctx.lineTo(px + 4, py);
  ctx.lineTo(px - 4, py);
  ctx.closePath();
  ctx.fill();
}
