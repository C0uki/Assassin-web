import { expect, test } from '@playwright/test';

interface DebugWorld {
  player: { cx: number; feet: number; state: string; hp: number };
  guards: unknown[];
}

test('title → game → move, climb and use eagle vision without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/?debug');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as unknown as { __game: { world: unknown } }).__game.world !== null);

  const read = () =>
    page.evaluate(() => {
      const w = (window as unknown as { __game: { world: DebugWorld } }).__game.world;
      return { x: w.player.cx, feet: w.player.feet, state: w.player.state, guards: w.guards.length };
    });
  const start = await read();
  expect(start.guards).toBeGreaterThan(40);

  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('ShiftLeft');
  const moved = await read();
  expect(moved.x).toBeGreaterThan(start.x + 150);

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  const climbed = await read();
  expect(climbed.feet).toBeLessThan(start.feet);
  await page.screenshot({ path: 'test-results/gameplay.png' });

  await page.keyboard.down('KeyE');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/eagle-vision.png' });
  await page.keyboard.up('KeyE');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/pause.png' });

  expect(errors).toEqual([]);
});
