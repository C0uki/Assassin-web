/**
 * Procedural stick-figure characters. Every pose is a set of joint angles;
 * 0 rad points straight down, positive values swing toward the facing direction.
 */
export interface Pose {
  lean: number;
  crouch: number;
  hipA: number;
  kneeA: number;
  hipB: number;
  kneeB: number;
  shA: number;
  elA: number;
  shB: number;
  elB: number;
  /** Whole-body rotation around the hips (dive, roll, corpse). */
  rot: number;
}

export type Weapon = 'none' | 'blade' | 'sword' | 'spear' | 'bow' | 'staff';

export interface FigureStyle {
  robe: string;
  trim: string;
  skin: string;
  outline: string;
  head: 'hood' | 'helmet' | 'turban' | 'veil' | 'bare' | 'mitre' | 'hat';
  headColor: string;
  weapon: Weapon;
  /** Sword or blade extended. */
  bladeOut: boolean;
  shield: boolean;
  cape: boolean;
  basket: boolean;
  scale: number;
  /** Flat silhouette color (eagle vision). */
  flat?: string;
}

const THIGH = 10;
const SHIN = 9;
const TORSO = 13;
const UPPER = 8;
const FORE = 8;

export const basePose = (): Pose => ({
  lean: 0,
  crouch: 0,
  hipA: 0.08,
  kneeA: 0.05,
  hipB: -0.08,
  kneeB: 0.05,
  shA: 0.15,
  elA: 0.35,
  shB: -0.1,
  elB: 0.3,
  rot: 0,
});

export function idlePose(t: number): Pose {
  const p = basePose();
  p.lean = 0.04 + Math.sin(t * 2) * 0.015;
  return p;
}

export function walkPose(t: number, amp = 0.45): Pose {
  const s = Math.sin(t);
  const p = basePose();
  p.lean = 0.06;
  p.hipA = amp * s;
  p.hipB = -amp * s;
  p.kneeA = 0.1 + Math.max(0, -Math.cos(t)) * 0.7;
  p.kneeB = 0.1 + Math.max(0, Math.cos(t)) * 0.7;
  p.shA = -0.4 * s * (amp / 0.45);
  p.shB = 0.4 * s * (amp / 0.45);
  p.elA = 0.45;
  p.elB = 0.45;
  return p;
}

export function runPose(t: number): Pose {
  const s = Math.sin(t);
  const c = Math.cos(t);
  const p = basePose();
  p.lean = 0.32;
  p.crouch = 1;
  p.hipA = 0.95 * s + 0.2;
  p.hipB = -0.95 * s + 0.2;
  p.kneeA = 0.3 + Math.max(0, c) * 1.4;
  p.kneeB = 0.3 + Math.max(0, -c) * 1.4;
  p.shA = -1.0 * s;
  p.shB = 1.0 * s;
  p.elA = 1.3;
  p.elB = 1.3;
  return p;
}

export function airPose(vy: number): Pose {
  const p = basePose();
  if (vy < 0) {
    p.lean = 0.15;
    p.hipA = 0.9;
    p.kneeA = 1.5;
    p.hipB = -0.1;
    p.kneeB = 0.7;
    p.shA = 2.4;
    p.elA = 0.3;
    p.shB = -0.6;
    p.elB = 0.6;
  } else {
    p.lean = 0.05;
    p.hipA = 0.35;
    p.kneeA = 0.5;
    p.hipB = -0.2;
    p.kneeB = 0.3;
    p.shA = 1.9;
    p.elA = 0.2;
    p.shB = -1.6;
    p.elB = 0.2;
  }
  return p;
}

export function divePose(): Pose {
  const p = basePose();
  p.lean = 0;
  p.hipA = 0.05;
  p.hipB = -0.05;
  p.kneeA = 0;
  p.kneeB = 0;
  p.shA = 1.6;
  p.elA = 0;
  p.shB = -1.6;
  p.elB = 0;
  p.rot = 2.2;
  return p;
}

export function climbPose(t: number): Pose {
  const s = Math.sin(t);
  const p = basePose();
  p.lean = 0.1;
  p.hipA = 0.8 + 0.35 * s;
  p.kneeA = 1.3;
  p.hipB = 0.35 - 0.35 * s;
  p.kneeB = 1.0;
  p.shA = 2.75 + 0.3 * s;
  p.elA = -0.3;
  p.shB = 2.55 - 0.3 * s;
  p.elB = -0.2;
  return p;
}

export function mantlePose(): Pose {
  const p = basePose();
  p.lean = 0.5;
  p.crouch = 6;
  p.hipA = 1.4;
  p.kneeA = 2.2;
  p.hipB = 0.6;
  p.kneeB = 1.6;
  p.shA = 1.0;
  p.elA = 0.4;
  p.shB = 0.8;
  p.elB = 0.5;
  return p;
}

export function attackPose(step: number, phase: 'windup' | 'active' | 'recover'): Pose {
  const p = basePose();
  p.lean = 0.2;
  p.crouch = 2;
  p.hipA = 0.6;
  p.kneeA = 0.6;
  p.hipB = -0.5;
  p.kneeB = 0.2;
  p.shB = -0.6;
  p.elB = 0.8;
  if (step === 1) {
    if (phase === 'windup') {
      p.shA = 2.6;
      p.elA = 0.4;
    } else {
      p.shA = 0.6;
      p.elA = 0.4;
    }
  } else if (step === 2) {
    p.lean = 0.35;
    if (phase === 'windup') {
      p.shA = 3.1;
      p.elA = 0.2;
    } else {
      p.shA = 1.3;
      p.elA = 0;
      p.crouch = 4;
    }
  } else if (phase === 'windup') {
    p.shA = -0.9;
    p.elA = 1.2;
  } else {
    p.shA = 1.6;
    p.elA = 0;
  }
  return p;
}

export function guardPose(): Pose {
  const p = basePose();
  p.crouch = 3;
  p.lean = -0.05;
  p.hipA = 0.45;
  p.kneeA = 0.5;
  p.hipB = -0.45;
  p.kneeB = 0.3;
  p.shA = 1.9;
  p.elA = 1.1;
  p.shB = 0.9;
  p.elB = 1.4;
  return p;
}

export function rollPose(progress: number): Pose {
  const p = basePose();
  p.crouch = 8;
  p.lean = 0.9;
  p.hipA = 1.8;
  p.kneeA = 2.4;
  p.hipB = 1.5;
  p.kneeB = 2.3;
  p.shA = 1.4;
  p.elA = 1.6;
  p.shB = 1.2;
  p.elB = 1.6;
  p.rot = progress * Math.PI * 2;
  return p;
}

export function lungePose(): Pose {
  const p = basePose();
  p.lean = 0.45;
  p.crouch = 4;
  p.hipA = 0.9;
  p.kneeA = 0.9;
  p.hipB = -0.7;
  p.kneeB = 0.2;
  p.shA = 1.45;
  p.elA = 0.15;
  p.shB = 0.9;
  p.elB = 0.9;
  return p;
}

export function hurtPose(): Pose {
  const p = basePose();
  p.lean = -0.35;
  p.shA = -0.8;
  p.elA = 0.6;
  p.shB = 1.2;
  p.elB = 0.6;
  p.hipA = 0.3;
  p.hipB = -0.3;
  return p;
}

export function deadPose(): Pose {
  const p = basePose();
  p.rot = -Math.PI / 2;
  p.shA = 2.2;
  p.elA = 0.3;
  p.shB = 2.6;
  p.elB = 0.2;
  p.hipA = 0.2;
  p.kneeA = 0.3;
  return p;
}

export function stunnedPose(t: number): Pose {
  const p = basePose();
  p.lean = 0.35 + Math.sin(t * 9) * 0.05;
  p.crouch = 3;
  p.shA = 2.3;
  p.elA = 1.7;
  p.shB = 2.0;
  p.elB = 1.8;
  return p;
}

export function staggerPose(t: number): Pose {
  const p = hurtPose();
  p.lean = -0.25 + Math.sin(t * 6) * 0.08;
  p.shA = -1.2;
  p.shB = -0.6;
  return p;
}

export function windupPose(heavy: boolean, phase: 'windup' | 'active' | 'recover'): Pose {
  const p = basePose();
  p.hipA = 0.5;
  p.kneeA = 0.4;
  p.hipB = -0.4;
  p.kneeB = 0.2;
  if (phase === 'windup') {
    p.lean = -0.1;
    p.shA = heavy ? 3.1 : 2.8;
    p.elA = heavy ? 0.1 : 0.5;
  } else {
    p.lean = 0.3;
    p.crouch = 2;
    p.shA = 1.2;
    p.elA = 0.1;
  }
  return p;
}

export function bowPose(drawing: boolean): Pose {
  const p = basePose();
  p.shA = 1.55;
  p.elA = 0.05;
  p.shB = 1.5;
  p.elB = drawing ? 2.6 : 1.3;
  return p;
}

/** Head tilted back, bottle raised to the mouth. */
export function drinkPose(t: number): Pose {
  const p = basePose();
  p.lean = -0.15;
  p.shA = 2.5;
  p.elA = 1.9 + Math.sin(t * 6) * 0.08;
  p.shB = 0.2;
  p.elB = 0.5;
  return p;
}

export function searchPose(t: number): Pose {
  const p = idlePose(t);
  p.shA = 1.0;
  p.elA = 1.6;
  return p;
}

type Pt = [number, number];
const down = (a: number, l: number): Pt => [Math.sin(a) * l, Math.cos(a) * l];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];

export function drawFigure(ctx: CanvasRenderingContext2D, x: number, footY: number, facing: number, pose: Pose, s: FigureStyle): void {
  ctx.save();
  ctx.translate(x, footY);
  ctx.scale(facing * s.scale, s.scale);
  const hip: Pt = [0, -(THIGH + SHIN) + pose.crouch];
  if (pose.rot !== 0) {
    // Lying poses: drop the hips to the floor before rotating so the body rests on the ground.
    if (Math.abs(pose.rot + Math.PI / 2) < 0.01) ctx.translate(0, -hip[1] - 4);
    ctx.translate(hip[0], hip[1]);
    ctx.rotate(pose.rot);
    ctx.translate(-hip[0], -hip[1]);
  }
  const shoulder = add(hip, [Math.sin(pose.lean) * TORSO, -Math.cos(pose.lean) * TORSO]);
  const head = add(shoulder, [Math.sin(pose.lean) * 6.5, -Math.cos(pose.lean) * 6.5]);
  const kneeA = add(hip, down(pose.hipA, THIGH));
  const footA = add(kneeA, down(pose.hipA - pose.kneeA, SHIN));
  const kneeB = add(hip, down(pose.hipB, THIGH));
  const footB = add(kneeB, down(pose.hipB - pose.kneeB, SHIN));
  const elbA = add(shoulder, down(pose.shA, UPPER));
  const handA = add(elbA, down(pose.shA + pose.elA, FORE));
  const elbB = add(shoulder, down(pose.shB, UPPER));
  const handB = add(elbB, down(pose.shB + pose.elB, FORE));
  const flat = s.flat;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const line = (pts: Pt[], width: number, color: string): void => {
    ctx.strokeStyle = flat ?? color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  };
  const poly = (pts: Pt[], color: string): void => {
    ctx.fillStyle = flat ?? color;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
  };
  const shade = (c: string): string => (flat ? flat : mix(c, '#000000', 0.3));

  for (const pass of [0, 1]) {
    const o = pass === 0;
    const w = (n: number): number => (o ? n + 2.2 : n);
    const col = (c: string): string => (o ? s.outline : c);
    // back limbs
    line([hip, kneeB, footB], w(4), col(shade(s.robe)));
    line([shoulder, elbB, handB], w(3.2), col(shade(s.robe)));
    if (!o && s.weapon === 'spear') line([add(handB, [0, 18]), add(handB, [2, -26])], 1.6, '#5a3e22');
    // cape
    if (s.cape) {
      const tail = add(hip, [-7 - Math.abs(pose.lean) * 6, 10]);
      if (o) {
        ctx.strokeStyle = flat ?? s.outline;
        ctx.lineWidth = 2;
      }
      poly([add(shoulder, [-2, 0]), add(shoulder, [2, 0]), add(hip, [-2, 6]), tail], o ? s.outline : s.trim);
    }
    // torso + robe skirt
    if (o) {
      line([hip, shoulder], 10, s.outline);
    } else {
      line([hip, shoulder], 8, s.robe);
      const skirtA = add(kneeA, [1.5, 2]);
      const skirtB = add(kneeB, [-1.5, 2]);
      poly([add(hip, [-4.5, -2]), add(hip, [4.5, -2]), skirtA, skirtB], s.robe);
      // sash
      line([add(hip, [-4, -2.5]), add(hip, [4, -2.5])], 2.4, s.trim);
    }
    // head
    ctx.fillStyle = flat ?? (o ? s.outline : s.skin);
    ctx.beginPath();
    ctx.arc(head[0], head[1], o ? 6.2 : 5, 0, Math.PI * 2);
    ctx.fill();
    if (!o) drawHead(ctx, head, s, flat);
    // front leg & arm
    line([hip, kneeA, footA], w(4), col(s.robe));
    if (s.basket && !o) {
      ctx.fillStyle = flat ?? '#8a6a3a';
      ctx.fillRect(head[0] - 6, head[1] - 11, 12, 5);
    }
    line([shoulder, elbA, handA], w(3.2), col(s.robe));
    if (!o) {
      ctx.fillStyle = flat ?? s.skin;
      ctx.beginPath();
      ctx.arc(handA[0], handA[1], 1.8, 0, Math.PI * 2);
      ctx.fill();
      drawWeapon(ctx, s, handA, handB, pose, flat);
    }
  }
  if (s.shield) {
    ctx.fillStyle = flat ?? '#6b5a3a';
    ctx.strokeStyle = flat ?? s.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(handB[0] + 2, handB[1] - 2, 5, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawHead(ctx: CanvasRenderingContext2D, head: Pt, s: FigureStyle, flat?: string): void {
  const [hx, hy] = head;
  const c = flat ?? s.headColor;
  ctx.fillStyle = c;
  switch (s.head) {
    case 'hood':
    case 'veil':
      ctx.beginPath();
      ctx.moveTo(hx + 5.5, hy + 1);
      ctx.quadraticCurveTo(hx + 6, hy - 7, hx - 1, hy - 7.5);
      ctx.lineTo(hx - 8, hy - 3);
      ctx.quadraticCurveTo(hx - 6, hy + 4, hx - 3, hy + 6);
      ctx.lineTo(hx + 2, hy + 4);
      ctx.closePath();
      ctx.fill();
      if (!flat && s.head === 'hood') {
        ctx.fillStyle = 'rgba(20,14,12,0.85)';
        ctx.beginPath();
        ctx.ellipse(hx + 3, hy + 0.5, 2.2, 3.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'helmet':
      ctx.beginPath();
      ctx.arc(hx, hy - 1, 6, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(hx - 6, hy - 1.5, 12, 2);
      ctx.beginPath();
      ctx.moveTo(hx, hy - 7);
      ctx.lineTo(hx + 1.5, hy - 11);
      ctx.lineTo(hx - 1, hy - 7);
      ctx.fill();
      break;
    case 'turban':
      ctx.beginPath();
      ctx.ellipse(hx - 0.5, hy - 4, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'mitre':
      ctx.beginPath();
      ctx.moveTo(hx - 5, hy - 3);
      ctx.lineTo(hx, hy - 14);
      ctx.lineTo(hx + 5, hy - 3);
      ctx.closePath();
      ctx.fill();
      break;
    case 'hat':
      ctx.fillRect(hx - 8, hy - 5, 16, 2);
      ctx.fillRect(hx - 4.5, hy - 10, 9, 5);
      break;
    case 'bare':
      ctx.beginPath();
      ctx.arc(hx - 1, hy - 1.5, 5, Math.PI * 1.05, Math.PI * 1.95);
      ctx.fill();
      break;
  }
}

function drawWeapon(ctx: CanvasRenderingContext2D, s: FigureStyle, handA: Pt, handB: Pt, pose: Pose, flat?: string): void {
  const steel = flat ?? '#dfe4ea';
  const angle = pose.shA + pose.elA;
  const dir: Pt = [Math.sin(angle), Math.cos(angle)];
  ctx.lineCap = 'round';
  if (s.weapon === 'blade' && s.bladeOut) {
    ctx.strokeStyle = steel;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(handA[0], handA[1]);
    ctx.lineTo(handA[0] + dir[0] * 9, handA[1] + dir[1] * 9);
    ctx.stroke();
  } else if (s.weapon === 'sword' || (s.weapon === 'blade' && !s.bladeOut)) {
    if (s.weapon === 'blade' && !s.bladeOut) return;
    ctx.strokeStyle = steel;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(handA[0], handA[1]);
    ctx.lineTo(handA[0] + dir[0] * 17, handA[1] + dir[1] * 17);
    ctx.stroke();
    ctx.strokeStyle = flat ?? '#8a6a2a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(handA[0] - dir[1] * 3, handA[1] + dir[0] * 3);
    ctx.lineTo(handA[0] + dir[1] * 3, handA[1] - dir[0] * 3);
    ctx.stroke();
  } else if (s.weapon === 'bow') {
    ctx.strokeStyle = flat ?? '#6a4a2a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(handA[0] - 3, handA[1], 10, -1.1, 1.1);
    ctx.stroke();
    ctx.strokeStyle = flat ?? 'rgba(230,230,210,0.8)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(handA[0] - 3 + Math.cos(-1.1) * 10, handA[1] + Math.sin(-1.1) * 10);
    ctx.lineTo(handB[0], handB[1]);
    ctx.lineTo(handA[0] - 3 + Math.cos(1.1) * 10, handA[1] + Math.sin(1.1) * 10);
    ctx.stroke();
  } else if (s.weapon === 'staff') {
    ctx.strokeStyle = flat ?? '#c9a24a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(handA[0], handA[1] + 14);
    ctx.lineTo(handA[0], handA[1] - 18);
    ctx.stroke();
  }
}

/** Blend two #rrggbb colors. */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number): number => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

export interface DogPose {
  /** Gait phase; 0 when standing. */
  run: number;
  speed: number;
  /** Head down sniffing. */
  sniff: boolean;
  lunge: boolean;
  dead: boolean;
}

/** A lean hound in profile, drawn facing right then mirrored. */
export function drawDog(ctx: CanvasRenderingContext2D, x: number, footY: number, facing: number, p: DogPose, flat?: string): void {
  const body = flat ?? '#4a3426';
  const dark = flat ?? '#2a1c14';
  ctx.save();
  ctx.translate(x, footY);
  ctx.scale(facing, 1);
  if (p.dead) {
    ctx.translate(0, -4);
    ctx.rotate(Math.PI / 2 - 0.05);
    ctx.translate(0, -8);
  }
  ctx.lineCap = 'round';
  const legY = -9;
  const swing = (o: number): number => (p.speed > 5 ? Math.sin(p.run + o) * (p.speed > 120 ? 6 : 3.5) : 0);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 3;
  for (const [hx, o] of [
    [-8, 0],
    [-6, Math.PI],
    [7, Math.PI / 2],
    [9, Math.PI * 1.5],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(hx, legY);
    ctx.lineTo(hx + swing(o), 0);
    ctx.stroke();
  }
  // tail
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-11, legY - 4);
  ctx.quadraticCurveTo(-17, legY - 10 - (p.speed > 5 ? 2 : 0), -19, legY - 6 + Math.sin(p.run * 2) * 2);
  ctx.stroke();
  // body
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, legY - 3, 12, 5.5, p.lunge ? -0.15 : 0, 0, Math.PI * 2);
  ctx.fill();
  // neck + head
  const hy = p.sniff ? legY + 2 : p.lunge ? legY - 8 : legY - 9;
  const hx = p.lunge ? 17 : 13;
  ctx.beginPath();
  ctx.moveTo(8, legY - 6);
  ctx.lineTo(hx - 2, hy - 2);
  ctx.lineTo(hx - 2, hy + 4);
  ctx.lineTo(8, legY);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(hx, hy, 5, 3.6, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(hx + 3, hy - 1);
  ctx.lineTo(hx + 9, hy + 1);
  ctx.lineTo(hx + 3, hy + 3);
  ctx.closePath();
  ctx.fill();
  // ear
  ctx.beginPath();
  ctx.moveTo(hx - 3, hy - 3);
  ctx.lineTo(hx - 1, hy - 8);
  ctx.lineTo(hx + 1, hy - 3);
  ctx.closePath();
  ctx.fill();
  // collar
  if (!flat) {
    ctx.fillStyle = '#a03030';
    ctx.fillRect(hx - 5, hy + 1, 3, 4);
  }
  ctx.restore();
}
