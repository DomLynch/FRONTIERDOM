import { test, expect } from '@playwright/test';

// Runs real same-origin API requests inside the browser. UI-click acceptance is a separate gate.
test('render shell and persist a real Earth–Eden return trade without duplicate settlement', async ({ page, browser }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#scene')).toBeVisible();
  await expect(page.locator('#ui')).toBeVisible();
  const result = await page.evaluate(async () => {
    async function request(path, body) {
      const response = await fetch(`/api/v1/${path}`, {
        method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(data)}`);
      if (data.apiVersion !== 1) throw new Error('Invalid API version');
      return data;
    }
    const { state: initial } = await request('session', {});
    if (initial.locationId !== 'earth' || initial.cashPence !== 2500000 || initial.ship.cargo.length) {
      throw new Error('Expected a fresh isolated Earth company with £25,000');
    }
    async function perform(action) {
      const { quote } = await request('quotes', { action });
      const command = { commandId: crypto.randomUUID(), quoteId: quote.id, expectedRevision: quote.expectedRevision };
      const settled = await request('commands', command);
      const replay = await request('commands', command);
      if (!replay.replayed || replay.receipt.id !== settled.receipt.id || replay.state.revision !== settled.state.revision) {
        throw new Error('Retry did not recover the same committed receipt');
      }
      const { state: current } = await request('state');
      if (current.revision !== settled.state.revision || current.cashPence !== settled.state.cashPence) {
        throw new Error('Retry changed current economics');
      }
      return settled;
    }
    const commodity = initial.markets.find(m => m.locationId === 'earth').commodities
      .filter(c => c.stockUnits >= 2 && c.buyUnitPence > 0 && c.buyUnitPence < 100000)
      .sort((a, b) => a.buyUnitPence - b.buyUnitPence)[0];
    if (!commodity) throw new Error('No affordable stocked commodity for the route');
    const buy = await perform({ type: 'buy', commodityId: commodity.id, quantity: 2 });
    const travel = await perform({ type: 'travel', destinationId: 'eden' });
    const sale = await perform({ type: 'sell', commodityId: commodity.id, quantity: 2 });
    const home = await perform({ type: 'travel', destinationId: 'earth' });
    return { initial, buy, travel, sale, home };
  });
  const final = result.home.state;
  expect(final.companyId).toBe(result.initial.companyId);
  expect(final.locationId).toBe('earth');
  expect(final.ship.cargo.reduce((sum, c) => sum + c.quantity, 0)).toBe(0);
  expect(final.revision).toBe(result.initial.revision + 4);
  const ledger = [result.buy, result.travel, result.sale, result.home].map(r => r.receipt);
  const delta = ledger.reduce((sum, r) => sum + r.creditPence - r.debitPence, 0);
  expect(final.cashPence).toBe(result.initial.cashPence + delta);
  expect(final.finances.netCashFlowPence).toBe(delta);
  expect(final.finances.realizedProfitPence).toBe(ledger.reduce((sum, r) => sum + r.realizedProfitPence, 0));
  expect(final.finances.realizedProfitPence).toBe(final.finances.salesPence - final.finances.salesCostBasisPence - final.finances.travelPence);
  await page.reload();
  const resumed = await page.evaluate(async () => (await (await fetch('/api/v1/state', { cache: 'no-store' })).json()).state);
  expect(resumed).toEqual(final);
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('return-trade.png'), fullPage: true });
  await testInfo.attach('authoritative-trade-receipts', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  const other = await browser.newContext();
  try {
    const response = await other.request.post(new URL('/api/v1/session', page.url()).href, { data: {}, headers: { Origin: new URL(page.url()).origin } });
    expect(response.ok()).toBe(true);
    const fresh = await response.json();
    expect(fresh.state.companyId).not.toBe(final.companyId);
    expect(fresh.state.cashPence).toBe(2500000);
  } finally { await other.close(); }
});
