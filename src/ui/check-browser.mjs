// Explicit fixture check: FD_UI_TEST_RUNTIME points at a temporary Playwright install.
// This verifies DOM/lifecycle behavior, not real backend economics or phone acceptance.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(`${process.env.FD_UI_TEST_RUNTIME}/package.json`);
const { chromium } = require('playwright');
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4179'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch('http://127.0.0.1:4179')).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ args: ['--no-sandbox'], headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let state = {
    companyId: 'fixture-company', revision: 0, locationId: 'earth', cashPence: 2500000,
    ship: { id: 'ship', name: 'Wayfarer', capacityUnits: 60, cargo: [] },
    crew: [{ id: '1', name: 'Mara', role: 'captain' }, { id: '2', name: 'Owen', role: 'engineer' }, { id: '3', name: 'Leila', role: 'trader' }],
    markets: ['earth', 'eden'].map((locationId) => ({ locationId, revision: 0, commodities: [
      { id: 'medicine', name: 'Medicine', stockUnits: 100, buyUnitPence: 80000, sellUnitPence: 100000 },
      { id: 'aurelia', name: 'Aurelia', stockUnits: 100, buyUnitPence: 65000, sellUnitPence: 75000 }
    ] })),
    routes: [{ from: 'earth', to: 'eden', travelCostPence: 35000 }, { from: 'eden', to: 'earth', travelCostPence: 25000 }],
    finances: { purchasesPence: 0, salesPence: 0, salesCostBasisPence: 0, travelPence: 0, netCashFlowPence: 0, realizedProfitPence: 0 }, receipts: []
  };
  const quotes = new Map(), commands = new Map(), payloads = [];
  let loseResponse = false, expiredSession = false;
  await page.route('http://127.0.0.1:4179/', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="ui"></div>' }));
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.split('/').at(-1);
    const body = route.request().postDataJSON();
    const fulfill = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ apiVersion: 1, ...data }) });
    if (path === 'session' || path === 'state') return fulfill({ state });
    if (path === 'quotes') {
      const { action } = body;
      const quote = { id: crypto.randomUUID(), action, expectedRevision: state.revision, expiresAt: new Date(Date.now() + 60000).toISOString(), debitPence: action.type === 'buy' ? action.quantity * 80000 : action.type === 'travel' ? 35000 : 0, creditPence: action.type === 'sell' ? action.quantity * 100000 : 0 };
      quotes.set(quote.id, quote); return fulfill({ quote });
    }
    payloads.push(body);
    if (expiredSession) return fulfill({ error: { code: 'SESSION_REQUIRED', message: 'Session expired.', retryable: false } }, 401);
    if (commands.has(body.commandId)) return fulfill({ ...commands.get(body.commandId), replayed: true });
    const quote = quotes.get(body.quoteId), action = quote.action;
    const before = state.locationId;
    state = structuredClone(state); state.revision++; state.cashPence += quote.creditPence - quote.debitPence;
    if (action.type === 'buy') { state.ship.cargo.push({ commodityId: action.commodityId, quantity: action.quantity, costBasisPence: quote.debitPence }); state.finances.purchasesPence += quote.debitPence; }
    if (action.type === 'travel') { state.locationId = action.destinationId; state.finances.travelPence += quote.debitPence; }
    if (action.type === 'sell') { state.ship.cargo = []; state.finances.salesPence += quote.creditPence; state.finances.salesCostBasisPence += action.quantity * 80000; }
    state.finances.netCashFlowPence = state.cashPence - 2500000;
    state.finances.realizedProfitPence = state.finances.salesPence - state.finances.salesCostBasisPence - state.finances.travelPence;
    const receipt = { id: crypto.randomUUID(), commandId: body.commandId, action, locationBefore: before, locationAfter: state.locationId, debitPence: quote.debitPence, creditPence: quote.creditPence, cashAfterPence: state.cashPence, realizedProfitPence: 0, revision: state.revision, occurredAt: new Date().toISOString() };
    state.receipts.push(receipt);
    const response = { commandId: body.commandId, state: structuredClone(state), receipt, replayed: false };
    commands.set(body.commandId, response);
    if (loseResponse) { loseResponse = false; return route.abort('failed'); }
    return fulfill(response);
  });
  async function mount() {
    await page.goto('http://127.0.0.1:4179');
    await page.evaluate(async () => {
      const { mountUI } = await import('/src/ui/index.js');
      const { createApi } = await import('/src/client/api.js');
      window.ui = mountUI(document.querySelector('#ui'), { api: createApi(), onState: (state) => { window.snapshot = state; } });
    });
    await page.waitForSelector('[data-action="quote"]');
  }
  await mount();
  await page.locator('[data-quantity="medicine"]').fill('2');
  await page.locator('[data-action="quote"][data-id="medicine"]').click();
  await page.waitForSelector('[role="dialog"]');
  assert.match(await page.locator('[role="dialog"]').innerText(), /£1,600.00/);
  loseResponse = true;
  await page.locator('[data-action="confirm"]').click();
  await page.waitForSelector('[data-action="retry"]:enabled');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('frontierdom.pending.v1')));
  assert.equal(saved.companyId, 'fixture-company');
  assert.equal(await page.locator('[data-action="quote"]:enabled').count(), 0);
  state.revision = 3; // Another tab advanced the company; stored replay snapshot is revision 1.
  await mount();
  expiredSession = true;
  await page.locator('[data-action="retry"]').click();
  await page.waitForSelector('[data-action="retry"]:enabled');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('frontierdom.pending.v1')).commandId), saved.commandId);
  expiredSession = false;
  await page.locator('[data-action="retry"]').click();
  await page.waitForFunction(() => localStorage.getItem('frontierdom.pending.v1') === null);
  assert.deepEqual(payloads[0], payloads[1]);
  assert.deepEqual(payloads[0], payloads[2]);
  assert.equal(await page.evaluate(() => window.snapshot.revision), 3);
  assert.equal(state.ship.cargo[0].quantity, 2);
  assert.equal(state.cashPence, 2340000);
  await page.locator('[data-action="travel"]').click();
  await page.locator('[data-action="confirm"]').click();
  await page.waitForFunction(() => window.snapshot.locationId === 'eden');
  await page.locator('[data-action="mode"][data-id="sell"]').click();
  await page.locator('[data-quantity="medicine"]').fill('2');
  await page.locator('[data-action="quote"][data-id="medicine"]').click();
  await page.locator('[data-action="confirm"]').click();
  await page.waitForFunction(() => window.snapshot.ship.cargo.length === 0);
  await page.screenshot({ path: '../portrait.png', fullPage: true });
  for (const viewport of [{ width: 320, height: 700 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${viewport.width}`);
  }
  await page.screenshot({ path: '../desktop.png', fullPage: true });
  await page.evaluate(() => localStorage.setItem('frontierdom.pending.v1', JSON.stringify({ companyId: 'old-company', commandId: 'old-id', quoteId: 'old-quote', expectedRevision: 0 })));
  await page.reload();
  await page.evaluate(async () => { const { mountUI } = await import('/src/ui/index.js'); const { createApi } = await import('/src/client/api.js'); window.ui = mountUI(document.querySelector('#ui'), { api: createApi() }); });
  await page.waitForSelector('[data-action="discard"]');
  assert.equal(await page.locator('[data-action="retry"]').count(), 0);
  await page.locator('[data-action="discard"]').click();
  await page.waitForSelector('[data-action="quote"]:enabled');
  state.companyId = 'changed-session';
  await page.locator('[data-action="refresh"]').first().click();
  await page.waitForSelector('.fd-error');
  assert.match(await page.locator('.fd-error').innerText(), /Company session changed/);
  assert.equal(await page.locator('[data-action="quote"]:enabled').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: exact quote, lost response + reload + expired session + identical replay, old snapshot ignored, one charge, travel/sell, company mismatch and mid-session identity guard, 320/390/844/1440 layout; fixture API only.');
} finally {
  await browser?.close(); vite.kill('SIGTERM');
}
