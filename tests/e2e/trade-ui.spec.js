import { test, expect } from '@playwright/test';

test('visible trade journey, profit receipt and recovery of a lost command response', async ({ page }, testInfo) => {
  // Includes seven real settlements, reload/retry and tall DPR3 software-rendered captures.
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const state = () => page.evaluate(async () => {
    const response = await fetch('/api/v1/state', { cache: 'no-store' });
    if (!response.ok) throw new Error(`State read failed: ${response.status}`);
    return (await response.json()).state;
  });
  await expect(page.locator('[aria-label="Company overview"]')).toBeVisible();
  const initial = await state();
  expect(initial.cashPence).toBe(2500000);
  const assertLayout = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await expect(page.locator('#scene')).toBeVisible();
  };
  await assertLayout();
  await page.screenshot({ path: testInfo.outputPath('earth-opening.png'), fullPage: true });

  async function confirm(selector) {
    const before = await state();
    await page.locator(selector).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('[data-action="confirm"]').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(async () => (await state()).revision).toBe(before.revision + 1);
  }
  async function trade(mode, id, quantity) {
    if (!await page.locator('[aria-label="Station market"]').isVisible()) {
      await page.locator('[data-action="panel"][data-id="market"]').click();
    }
    await page.locator(`[data-action="mode"][data-id="${mode}"]`).click();
    await page.locator(`[data-quantity="${id}"]`).fill(String(quantity));
    await confirm(`[data-action="quote"][data-id="${id}"]`);
  }
  async function travel() {
    await page.locator('[data-action="panel"][data-id="route"]').click();
    await confirm('[data-action="travel"]');
  }
  await trade('buy', 'medicine', 20);
  await travel();
  expect((await state()).locationId).toBe('eden');
  await assertLayout();
  await page.screenshot({ path: testInfo.outputPath('eden-arrival.png'), fullPage: true });
  await trade('sell', 'medicine', 20);
  await trade('buy', 'aurelia', 20);
  await travel();
  await trade('sell', 'aurelia', 20);
  const completed = await state();
  expect(completed.cashPence).toBe(2759350);
  expect(completed.finances.realizedProfitPence).toBe(259350);
  expect(completed.finances.netCashFlowPence).toBe(259350);
  expect(completed.ship.cargo).toEqual([]);
  await expect(page.locator('[aria-label="Company overview"]')).toContainText('£27,593.50');
  await page.locator('.fd-nav [data-action="panel"][data-id="ledger"]').click();
  await expect(page.locator('[aria-label="Voyage ledger"]')).toContainText('£2,593.50');
  await page.screenshot({ path: testInfo.outputPath('earth-profit.png'), fullPage: true });
  await page.reload();
  await expect(page.locator('[aria-label="Company overview"]')).toBeVisible();
  expect(await state()).toEqual(completed);

  // Let the real server commit, then lose only the response. UI must retain the exact ID.
  let committed;
  await page.route('**/api/v1/commands', async route => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    committed = await response.json();
    await route.abort('failed');
    await page.unroute('**/api/v1/commands');
  }, { times: 1 });
  await page.locator('[data-action="panel"][data-id="market"]').click();
  await page.locator('[data-action="mode"][data-id="buy"]').click();
  await page.locator('[data-quantity="medicine"]').fill('1');
  await page.locator('[data-action="quote"][data-id="medicine"]').click();
  await page.locator('[data-action="confirm"]').click();
  await expect(page.locator('[data-action="retry"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-action="retry"]')).toBeVisible();
  await page.locator('[data-action="retry"]').click();
  await expect(page.locator('[data-action="retry"]')).toHaveCount(0);
  expect((await state()).revision).toBe(committed.state.revision);
  expect((await state()).cashPence).toBe(committed.state.cashPence);
  expect((await state()).ship.cargo).toEqual(committed.state.ship.cargo);
  expect(errors).toEqual([]);
  await testInfo.attach('golden-return-and-recovered-command', { body: JSON.stringify({ completed, committed }, null, 2), contentType: 'application/json' });
});
