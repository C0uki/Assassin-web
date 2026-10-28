import { Page, expect, test } from '@playwright/test';

interface DebugBoss {
  phase: number;
  script: unknown;
  boss: { hp: number; alive: boolean };
  damage(g: unknown, dmg: number, how: string): boolean;
}

interface Debug {
  __game: {
    scene: { page?: number; save?: unknown };
    world: {
      mode: string;
      gateOpen: boolean;
      boss: DebugBoss | null;
      player: { cx: number; body: { x: number; y: number; w: number; h: number } };
    } | null;
  };
}

async function tap(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await page.waitForTimeout(80);
}

const TARGETS = ['t1', 't2', 't3', 't4', 't5', 't6'];

test('the gate opens after six targets and leads to a three-phase duel and the ending', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?debug');
  await page.evaluate((targets) => {
    localStorage.clear();
    localStorage.setItem('assassin-web-settings', JSON.stringify({ version: 1, master: 8, music: 7, sfx: 8, tutorialDone: true }));
    const stats = { time: 1200, detections: 3, assassinations: 20, combatKills: 6, civilianKills: 0, deaths: 2, bossAttempts: 0 };
    localStorage.setItem(
      'assassin-web-save',
      JSON.stringify({ version: 1, targetsKilled: targets, docs: [], hideout: 2, hideoutsFound: [0, 1, 2], stats, bossDefeated: false, complete: false }),
    );
  }, TARGETS);
  await page.reload();
  await page.waitForTimeout(400);
  await tap(page, 'Enter'); // 続きから
  const world = () =>
    page.evaluate(() => {
      const w = (window as unknown as Debug).__game.world;
      return w && { mode: w.mode, gateOpen: w.gateOpen, boss: w.boss && { phase: w.boss.phase, script: w.boss.script } };
    });
  await expect.poll(async () => (await world())?.gateOpen).toBe(true);

  // Stand in front of the gate at the east end of town and step through.
  await page.evaluate(() => {
    const p = (window as unknown as Debug).__game.world!.player;
    p.body.x = 596 * 32 - p.body.w / 2;
    p.body.y = 1120 - p.body.h;
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/boss-gate.png' });
  await tap(page, 'KeyF');
  await expect.poll(async () => (await world())?.mode).toBe('boss');

  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await world())?.boss?.script, { timeout: 10000 }).toBeNull();
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/boss-phase1.png' });

  const toPhase = (phase: number) =>
    page.evaluate((to) => {
      const f = (window as unknown as Debug).__game.world!.boss!;
      const floors = [0, 30, 15, 0];
      if (f.phase < to) f.damage(f.boss, f.boss.hp - floors[f.phase], 'combat');
    }, phase);
  await toPhase(2);
  await expect.poll(async () => (await world())?.boss?.phase, { timeout: 5000 }).toBe(2);
  await page.waitForTimeout(2500);
  // Walk over to the belfry to see him on the balcony.
  await page.evaluate(() => {
    const p = (window as unknown as Debug).__game.world!.player;
    p.body.x = 70 * 32;
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/boss-phase2.png' });
  await toPhase(3);
  await expect.poll(async () => (await world())?.boss?.phase, { timeout: 5000 }).toBe(3);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/boss-phase3.png' });
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/boss-phase3-eagle.png' });
  await page.keyboard.up('KeyE');

  await page.evaluate(() => {
    const f = (window as unknown as Debug).__game.world!.boss!;
    f.damage(f.boss, 99, 'combat');
  });
  // Scene classes are minified in the build: tell them apart by their fields.
  const scene = () =>
    page.evaluate(() => {
      const g = (window as unknown as Debug).__game;
      return g.world ? 'game' : g.scene.page !== undefined ? 'ending' : g.scene.save ? 'result' : 'other';
    });
  await expect.poll(scene, { timeout: 8000 }).toBe('ending');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/boss-ending.png' });
  for (let i = 0; i < 3; i++) {
    await tap(page, 'Enter');
    await page.waitForTimeout(700);
  }
  await expect.poll(scene).toBe('result');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/boss-result.png' });
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('assassin-web-save')!));
  expect(save.bossDefeated).toBe(true);
  expect(save.stats.bossAttempts).toBe(1);
  expect(errors).toEqual([]);
});
