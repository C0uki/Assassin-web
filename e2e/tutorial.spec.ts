import { Page, expect, test } from '@playwright/test';

interface Debug {
  __game: {
    world: { mode: string; player: { cx: number } } | null;
    tutorial: { index: number } | null;
  };
}

/** One key press per frame, like a person would. */
async function tap(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await page.waitForTimeout(60);
}

const state = (page: Page) =>
  page.evaluate(() => {
    const g = (window as unknown as Debug).__game;
    return { mode: g.world?.mode ?? null, step: g.tutorial?.index ?? null };
  });

test('first run starts the training ground, which can be played and skipped', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(400);
  await tap(page, 'Enter'); // はじめる
  await expect.poll(() => state(page)).toEqual({ mode: 'training', step: 0 });

  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await state(page)).step, { timeout: 8000 }).toBe(1);
  await page.keyboard.down('ShiftLeft');
  await expect.poll(async () => (await state(page)).step, { timeout: 8000 }).toBe(2);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyD');
  await page.screenshot({ path: 'test-results/tutorial.png' });

  // Pause → 訓練を飛ばす
  await tap(page, 'Escape');
  await tap(page, 'KeyS');
  await tap(page, 'KeyS');
  await tap(page, 'Enter');
  await expect.poll(async () => (await state(page)).mode).toBe('campaign');
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('assassin-web-settings') ?? '{}'));
  expect(settings.tutorialDone).toBe(true);
  expect(errors).toEqual([]);
});

test('volume settings can be changed from the title and are remembered', async ({ page }) => {
  await page.goto('/?debug');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(400);
  // はじめる / 訓練 / 設定
  await tap(page, 'KeyS');
  await tap(page, 'KeyS');
  await tap(page, 'Enter');
  await tap(page, 'KeyA'); // master 8 → 7
  await tap(page, 'KeyS');
  await tap(page, 'KeyA'); // music 7 → 6
  await tap(page, 'KeyA'); // → 5
  await page.screenshot({ path: 'test-results/settings.png' });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('assassin-web-settings') ?? '{}'));
  expect(saved).toMatchObject({ master: 7, music: 5, sfx: 8 });
  await page.reload();
  await page.waitForTimeout(300);
  const again = await page.evaluate(() => JSON.parse(localStorage.getItem('assassin-web-settings') ?? '{}'));
  expect(again).toMatchObject({ master: 7, music: 5 });
});
