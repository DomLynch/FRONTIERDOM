// Explicit fixture: actual OAuth/provider/Postgres acceptance stays separate.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import net from 'node:net';
import { chromium } from '@playwright/test';
import { createInitialState, quoteAction, applyAction } from '../sim/economy/index.js';
const socket = net.createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const origin = `http://127.0.0.1:${port}`, authOrigin = 'https://eyfojjzajbfliuokaplx.supabase.co';
const authorize = `${authOrigin}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(origin + '/api/v1/auth/callback')}`;
const output = 'artifacts/ui/auth'; await mkdir(output, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Fixture Vite must start');
  browser = await chromium.launch({ args: ['--no-sandbox'], headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [], payloads = [], initialized = [];
  page.on('pageerror', error => errors.push(error.message));
  let user = null, nextUser = 'A', loseResponse = false, delayGoogle = false, releaseGoogle;
  let badURL = false, authOutage = false, missingState = false, raceSwitch = false, navigationCount = 0;
  const companies = new Map(), quotes = new Map(), commands = new Map();
  const userObject = () => user ? { id: user, displayName: user === 'A' ? 'Mara <Captain>' : 'Other account' } : null;
  await page.route(`${origin}/**`, async route => {
    if (new URL(route.request().url()).pathname !== '/') return route.fallback();
    await route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#090f1b}</style><main id="ui"></main><script type="module">import {mountUI} from '/src/ui/index.js';import {createApi} from '/src/client/api.js';window.ui=mountUI(document.querySelector('#ui'),{api:createApi(),googleAuthOrigin:'${authOrigin}',onState:s=>window.snapshot=s});</script>` });
  });
  await page.route(`${authOrigin}/auth/v1/authorize?**`, async route => {
    navigationCount++; user = nextUser;
    await route.fulfill({ status: 302, headers: { location: `${origin}/api/v1/auth/callback?code=fixture` }, body: '' });
  });
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/', '');
    const body = route.request().postDataJSON();
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ apiVersion: 1, ...data }) });
    const fail = (status, code, message) => reply({ error: { code, message, retryable: status >= 500 } }, status);
    if (path === 'auth/callback') return route.fulfill({ status: 302, headers: { location: `${origin}/` }, body: '' });
    if (path === 'auth/session') return authOutage ? fail(503, 'UNAVAILABLE', 'Account service unavailable.') : reply({ user: userObject(), provider: 'google' });
    if (path === 'auth/google') {
      if (delayGoogle) await new Promise(resolve => { releaseGoogle = resolve; });
      return reply({ url: badURL ? authorize.replace('eyfojjzajbfliuokaplx', 'wrong-project') : authorize });
    }
    if (path === 'auth/logout') { user = null; return reply({ user: null, provider: 'google' }); }
    if (!user) return fail(401, 'SESSION_REQUIRED', 'Sign in required.');
    if (path === 'session') {
      initialized.push(user);
      if (!companies.has(user)) companies.set(user, createInitialState(`company-${user}`));
      return reply({ state: companies.get(user) });
    }
    const state = companies.get(user);
    if (!state) return fail(404, 'NOT_FOUND', 'Company not initialized.');
    if (path === 'state') {
      const response = missingState ? fail(404, 'NOT_FOUND', 'Company unavailable.') : reply({ state });
      if (raceSwitch) { raceSwitch = false; user = 'B'; }
      return response;
    }
    if (path === 'quotes') {
      const quote = { id: crypto.randomUUID(), action: body.action, expectedRevision: state.revision, expiresAt: new Date(Date.now() + 60000).toISOString(), ...quoteAction(state, body.action) };
      quotes.set(quote.id, { user, quote }); return reply({ quote });
    }
    if (path === 'commands') {
      const expectedCompanyId = route.request().headers()['x-frontierdom-company-id'];
      payloads.push({ user, body, expectedCompanyId });
      if (expectedCompanyId !== state.companyId) return fail(409, 'ACCOUNT_CHANGED', 'Account changed. Reconnect with the original account.');
      const saved = commands.get(body.commandId);
      if (saved) {
        if (saved.user !== user) return fail(403, 'FORBIDDEN', 'Wrong account.');
        assert.deepEqual(body, saved.body); return reply({ ...saved.response, replayed: true });
      }
      const entry = quotes.get(body.quoteId);
      if (entry.user !== user) return fail(403, 'FORBIDDEN', 'Wrong account.');
      const result = applyAction(state, entry.quote.action, { commandId: body.commandId, receiptId: crypto.randomUUID(), occurredAt: new Date().toISOString() });
      companies.set(user, result.state);
      const response = { commandId: body.commandId, ...result, replayed: false };
      commands.set(body.commandId, { user, body, response });
      if (loseResponse) { loseResponse = false; return route.abort('failed'); }
      return reply(response);
    }
    return fail(404, 'NOT_FOUND', path);
  });
  const pending = () => page.evaluate(() => localStorage.getItem('frontierdom.pending.v1'));
  await page.goto(`${origin}/?auth=cancelled`);
  await page.waitForSelector('[data-action="login"]:enabled');
  assert.match(await page.locator('[role="status"]').innerText(), /cancelled/);
  assert.equal(new URL(page.url()).search, ''); assert.deepEqual(initialized, []);
  await page.screenshot({ path: `${output}/sign-in-portrait.png`, fullPage: true });
  delayGoogle = true; await page.locator('[data-action="login"]').click();
  await page.waitForSelector('[data-action="cancel-login"]');
  while (!releaseGoogle) await new Promise(resolve => setTimeout(resolve, 10));
  await page.locator('[data-action="cancel-login"]').click(); releaseGoogle(); delayGoogle = false;
  await page.waitForSelector('[data-action="login"]:enabled'); await page.waitForLoadState('networkidle');
  assert.equal(navigationCount, 0);
  badURL = true; await page.locator('[data-action="login"]').click();
  await page.waitForSelector('.fd-error'); assert.equal(navigationCount, 0); badURL = false;
  authOutage = true; await page.locator('[data-action="refresh"]').click();
  await page.waitForSelector('.fd-error'); assert.deepEqual(initialized, []); authOutage = false;
  await page.locator('[data-action="login"]').click(); await page.waitForSelector('[aria-label="Company overview"]');
  assert.equal(navigationCount, 1); assert.deepEqual(initialized, ['A']);
  assert.match(await page.locator('.fd-account').innerText(), /Mara <Captain>/);
  assert.equal(await page.locator('.fd-account captain').count(), 0);
  await page.locator('[data-quantity="medicine"]').fill('1');
  await page.locator('[data-action="quote"][data-id="medicine"]').click(); loseResponse = true;
  await page.locator('[data-action="confirm"]').click(); await page.waitForSelector('[data-action="retry"]:enabled');
  const original = await pending(); assert.equal(JSON.parse(original).userId, 'A');
  assert.equal(await page.locator('[data-action="logout"]').isDisabled(), true);
  await page.reload(); await page.waitForSelector('[data-action="retry"]:enabled');
  assert.deepEqual(initialized, ['A']); assert.equal(await pending(), original);
  user = null; await page.reload(); await page.waitForSelector('[data-action="login"]:enabled');
  assert.equal(await pending(), original); assert.deepEqual(initialized, ['A']);
  nextUser = 'B'; await page.locator('[data-action="login"]').click();
  await page.waitForSelector('[data-action="logout"]:enabled');
  assert.match(await page.locator('.fd-auth-account').innerText(), /Other account/);
  assert.equal(await page.locator('[data-action="retry"]').count(), 0);
  assert.equal(await pending(), original); assert.equal(companies.has('B'), false); assert.deepEqual(initialized, ['A']);
  assert.equal(payloads.some(entry => entry.user === 'B'), false);
  await page.locator('[data-action="logout"]').click(); await page.waitForSelector('[data-action="login"]:enabled');
  assert.equal(await pending(), original); nextUser = 'A';
  await page.locator('[data-action="login"]').click(); await page.waitForSelector('[data-action="retry"]:enabled');
  missingState = true;
  await page.locator('[data-action="retry"]').click(); await page.waitForSelector('[data-action="retry"]:enabled');
  assert.equal(await pending(), original); assert.equal(payloads.length, 1); missingState = false;
  await page.locator('[data-action="retry"]').click();
  await page.waitForFunction(() => localStorage.getItem('frontierdom.pending.v1') === null);
  assert.equal(payloads.length, 2); assert.deepEqual(payloads[0], payloads[1]);
  assert.equal(companies.get('A').ship.cargo.find(item => item.commodityId === 'medicine').quantity, 1);
  const restored = structuredClone(companies.get('A'));
  await page.locator('[data-action="logout"]').click(); await page.waitForSelector('[data-action="login"]:enabled');
  await page.locator('[data-action="login"]').click(); await page.waitForSelector('[aria-label="Company overview"]');
  assert.deepEqual(companies.get('A'), restored); assert.equal(companies.size, 1);
  // Race AFTER A preflight: the verified server cookie switches to B before POST.
  companies.set('B', createInitialState('company-B'));
  const beforeB = structuredClone(companies.get('B'));
  await page.locator('[data-quantity="medicine"]').fill('1');
  await page.locator('[data-action="quote"][data-id="medicine"]').click(); loseResponse = true;
  await page.locator('[data-action="confirm"]').click(); await page.waitForSelector('[data-action="retry"]:enabled');
  const racedIntent = await pending(), start = payloads.length - 1;
  raceSwitch = true; await page.locator('[data-action="retry"]').click();
  await page.waitForSelector('.fd-auth .fd-error');
  assert.equal(await pending(), racedIntent); assert.deepEqual(companies.get('B'), beforeB);
  assert.equal(payloads.at(-1).user, 'B'); assert.equal(payloads.at(-1).expectedCompanyId, 'company-A');
  user = 'A'; await page.locator('[data-action="refresh"]').click();
  await page.waitForSelector('[data-action="retry"]:enabled'); await page.locator('[data-action="retry"]').click();
  await page.waitForFunction(() => localStorage.getItem('frontierdom.pending.v1') === null);
  for (const request of payloads.slice(start)) { assert.deepEqual(request.body, payloads[start].body); assert.equal(request.expectedCompanyId, 'company-A'); }
  assert.equal(companies.get('A').ship.cargo.find(item => item.commodityId === 'medicine').quantity, 2);
  await page.screenshot({ path: `${output}/account-restored-portrait.png`, fullPage: true });
  for (const viewport of [{ width: 320, height: 700 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  }
  await page.screenshot({ path: `${output}/account-restored-desktop.png`, fullPage: true }); assert.deepEqual(errors, []);
  console.log('PASS: signed-out/cancel/error/no guest fallback; exact auth origin; escaped display; lost command reload/expiry/A→B→A exact recovery/one charge; POST race rejects B before replay with original company header; A re-sign-in identical replay; progress restore; responsive320/390/844/1440. Fixture provider/economy, not real OAuth/Postgres acceptance.');
} finally { await browser?.close(); vite.kill('SIGTERM'); }
