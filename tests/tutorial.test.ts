import { describe, expect, it } from 'vitest';
import { Input } from '../src/core/input';
import { hasFloorAt } from '../src/systems/physics';
import { newSave } from '../src/systems/progress';
import { Tutorial } from '../src/systems/tutorial';
import { GROUND_Y, TRAINING, buildTrainingGround } from '../src/world/city';
import { TILE } from '../src/world/tilemap';
import { World } from '../src/world/world';

const DT = 1 / 60;

function setup(): { w: World; t: Tutorial; input: Input; tick: () => void } {
  const w = new World(buildTrainingGround(), newSave(), null, 'training');
  const t = new Tutorial(w);
  const input = new Input();
  const tick = (): void => {
    w.update(input, DT);
    t.update(DT);
    input.endTick();
  };
  return { w, t, input, tick };
}

const ALL = ['left', 'right', 'up', 'down', 'sprint', 'guard', 'eagle'] as const;

describe('training ground', () => {
  it('places the start on solid ground', () => {
    const c = buildTrainingGround();
    expect(hasFloorAt(c.map, TRAINING.start * TILE, GROUND_Y - 1)).toBe(true);
    expect(c.hideouts).toHaveLength(1);
  });

  it('never kills the player and never writes the campaign save', () => {
    const { w } = setup();
    w.player.damage(w, 999, 0, false);
    expect(w.player.dead).toBe(false);
    expect(w.player.hp).toBe(w.playerStats.maxHp);
    expect(w.save.stats.deaths).toBe(0);
  });

  it('can be completed start to finish with real inputs', () => {
    const { w, t, input, tick } = setup();
    const p = w.player;
    const hold = (...actions: (typeof ALL)[number][]): void => {
      for (const a of ALL) if (!actions.includes(a)) input.release(a);
      for (const a of actions) if (!input.isHeld(a)) input.press(a);
    };
    const steer = (x: number, extra: (typeof ALL)[number][] = []): void => {
      if (p.cx < x - 4) hold('right', ...extra);
      else if (p.cx > x + 4) hold('left', ...extra);
      else hold(...extra);
    };
    /** Run until the tutorial advances past `step`, calling `drive` every tick. */
    const until = (step: number, drive: (i: number) => void, seconds = 30): void => {
      for (let i = 0; i < seconds * 60 && t.index <= step; i++) {
        drive(i);
        tick();
      }
      expect(t.index, `stuck on step ${step} (${t.steps[step].title}) at x=${p.cx.toFixed(0)} state=${p.state}`).toBeGreaterThan(step);
    };
    const tap = (a: 'attack' | 'dodge' | 'knife' | 'smoke' | 'interact' | 'jump'): void => input.press(a);

    until(0, () => hold('right'));
    until(1, () => hold('right', 'sprint'));
    until(2, () => steer((TRAINING.climb.tx + 3) * TILE, ['up']));
    until(3, () => hold('right', 'sprint', 'up'));
    // tower: freerun across and climb, then walk off the far edge into the hay
    let onTower = false;
    until(4, () => {
      if (!onTower && p.state === 'ground' && p.cx > TRAINING.tower.tx * TILE) onTower = true;
      if (onTower) hold('right');
      else hold('right', 'sprint', 'up');
    });
    until(5, (i) => {
      if (p.hidden) return tap('interact');
      const g = w.guards.find((x) => x.alive && x.passive);
      steer(g ? g.cx - 30 : p.cx);
      if (g && Math.abs(p.cx - (g.cx - 30)) < 6 && i % 10 === 0) tap('attack');
    });
    let onBeam = false;
    until(6, (i) => {
      const g = w.guards.find((x) => x.alive && x.passive);
      if (!g) return hold();
      if (p.state === 'ground' && p.feet < GROUND_Y - 100 && p.cx > (TRAINING.airBeam.tx + 0.5) * TILE) onBeam = true;
      if (!onBeam) steer(p.feet < GROUND_Y - 100 ? g.cx : (TRAINING.airPerch.tx + 1.5) * TILE, ['up']);
      else if (Math.abs(p.cx - g.cx) > 10 && p.state === 'ground') steer(g.cx);
      else {
        hold();
        if (p.state === 'ground') tap('jump');
        else if (i % 4 === 0) tap('attack');
      }
    });
    until(7, () => {
      const civs = w.civilians.filter((c) => c.state === 'walk');
      steer(civs.reduce((s, c) => s + c.x, 0) / civs.length);
    });
    until(8, (i) => {
      steer(TRAINING.spar * TILE - 60);
      if (i % 20 === 0) tap('dodge');
    });
    until(9, () => {
      const g = t.partner!;
      const winding = g.attack.phase === 'windup' && g.attack.t < 0.12;
      if (g.state === 'staggered' && g.parried) {
        hold();
        tap('attack');
      } else if (winding || (input.isHeld('guard') && g.attack.phase !== 'none')) hold('guard');
      else steer(g.cx - 34);
    }, 60);
    until(10, (i) => {
      const g = t.partner!;
      steer(g.cx - 30);
      if (i % 9 === 0) tap('attack');
    }, 60);
    until(11, () => hold('eagle'));
    until(12, (i) => {
      steer(TRAINING.knifeRoof.tx * TILE - 120);
      if (i % 30 === 0) tap('knife');
    });
    until(13, () => {
      hold();
      tap('smoke');
    });
    expect(t.finished).toBe(true);
  });
});
