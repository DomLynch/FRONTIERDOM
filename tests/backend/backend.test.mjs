import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { createPool } from '../../server/database.mjs';
import { createService, tokenHash } from '../../server/service.mjs';
import { createApiServer } from '../../server/http.mjs';
import * as economy from '../../src/sim/economy/index.js';

const origin = 'http://localhost:5173';
let pool, admin, service, server, base;
const errors = [];

async function listen() {
  server = createApiServer({ service, authMode:'guest', siteOrigin: origin, secureCookies: false, onError: error => errors.push(error) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
}
async function stop() {
  const closed = once(server, 'close');
  server.close(); server.closeAllConnections();
  await closed;
}
async function call(path, { cookie, body, method = body === undefined ? 'GET' : 'POST', headers = {} } = {}) {
  const response = await fetch(`${base}/api/v1/${path}`, { method,
    headers: { ...(method === 'POST' ? { Origin: origin, 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
async function guest() {
  // Infrastructure tests each get their own admission window; the dedicated
  // quota test below explicitly exercises non-reset IP admission via HTTP.
  await admin.query('delete from frontierdom.rate_buckets');
  const response = await call('session', { body: {} });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  return { cookie, token: cookie.split('=')[1], state: response.body.state };
}
async function quote(cookie, action) {
  const response = await call('quotes', { cookie, body: { action } });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.quote;
}
function payload(q) { return { commandId: randomUUID(), quoteId: q.id, expectedRevision: q.expectedRevision }; }
async function trade(cookie, action) {
  const q = await quote(cookie, action);
  const command = payload(q);
  const response = await call('commands', { cookie, body: command });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return { ...response, command };
}

before(async () => {
  assert.ok(process.env.DATABASE_URL && process.env.TEST_ADMIN_DATABASE_URL, 'Dedicated test cluster is required; no skipped DB tests.');
  pool = createPool(process.env.DATABASE_URL);
  admin = createPool(process.env.TEST_ADMIN_DATABASE_URL);
  service = createService(pool, economy);
  await listen();
});
after(async () => { if (server) await stop(); await pool?.end(); await admin?.end(); });

test('durable guest cookie, initial state and resume; missing/expired sessions never reset', async () => {
  const g = await guest();
  assert.equal(g.state.cashPence, 2500000);
  assert.equal(g.state.crew.length, 3);
  assert.equal(g.state.locationId, 'earth');
  assert.deepEqual(g.state.ship.cargo, []);
  const resumed = await call('session', { cookie: g.cookie, body: {} });
  assert.deepEqual(resumed.body.state, g.state);
  assert.match(resumed.headers.get('set-cookie'), /HttpOnly; SameSite=Lax; Path=\/; Max-Age=2592000/);
  assert.equal(resumed.headers.get('cache-control'), 'no-store');
  assert.equal((await call('state')).status, 401);
  assert.equal((await call('commands', { body: payload({ id: randomUUID(), expectedRevision: 0 }) })).status, 401);
  await admin.query("update frontierdom.sessions set expires_at = now() - interval '1 second' where token_hash=$1", [tokenHash(g.token)]);
  const expired = await call('session', { cookie: g.cookie, body: {} });
  assert.equal(expired.status, 401);
  const { rows: [row] } = await admin.query('select count(*)::int as count from frontierdom.companies where id=$1', [g.state.companyId]);
  assert.equal(row.count, 1);
});

test('owners cannot submit foreign quotes or arbitrary state/owner fields; markets remain company-local', async () => {
  const a = await guest(), b = await guest();
  const q = await quote(a.cookie, { type: 'buy', commodityId: 'food', quantity: 3 });
  const foreign = await call('commands', { cookie: b.cookie, body: payload(q) });
  assert.equal(foreign.status, 404);
  for (const body of [{ action: q.action, companyId: a.state.companyId }, { action: q.action, cashPence: 100000000 }]) {
    assert.equal((await call('quotes', { cookie: b.cookie, body })).status, 400);
  }
  await trade(a.cookie, q.action);
  assert.deepEqual((await call('state', { cookie: b.cookie })).body.state, b.state);
  const stateQuery = await call(`state?companyId=${a.state.companyId}`, { cookie: b.cookie });
  assert.equal(stateQuery.status, 400);
});

test('identical concurrent command applies once; replay survives quote expiry/cleanup and newer state', async () => {
  const g = await guest();
  const q = await quote(g.cookie, { type: 'buy', commodityId: 'food', quantity: 4 });
  const command = payload(q);
  const responses = await Promise.all(Array.from({ length: 8 }, () => call('commands', { cookie: g.cookie, body: command })));
  assert.ok(responses.every(r => r.status === 200));
  assert.equal(responses.filter(r => !r.body.replayed).length, 1);
  assert.ok(responses.every(r => r.body.state.revision === 1 && r.body.state.ship.cargo[0].quantity === 4));
  const original = responses.find(r => !r.body.replayed).body;
  await trade(g.cookie, { type: 'travel', destinationId: 'eden' });
  await admin.query("update frontierdom.quotes set expires_at=now()-interval '1 second' where id=$1", [q.id]);
  await service.cleanup();
  const replay = await call('commands', { cookie: g.cookie, body: command });
  assert.deepEqual(replay.body, { ...original, replayed: true });
  const conflict = await call('commands', { cookie: g.cookie, body: { ...command, quoteId: randomUUID() } });
  assert.equal(conflict.body.error.code, 'IDEMPOTENCY_CONFLICT');
  const { rows: [row] } = await admin.query('select count(*)::int as count from frontierdom.commands where company_id=$1', [g.state.companyId]);
  assert.equal(row.count, 2);
});

test('distinct concurrent spend, capacity, sale and travel requests cannot commit stale state', async () => {
  const g = await guest();
  const q = await quote(g.cookie, { type: 'buy', commodityId: 'food', quantity: 30 });
  const results = await Promise.all([payload(q), payload(q)].map(body => call('commands', { cookie: g.cookie, body })));
  assert.equal(results.filter(r => r.status === 200).length, 1);
  assert.equal(results.find(r => r.status !== 200).body.error.code, 'STALE_STATE');
  const bought = (await call('state', { cookie: g.cookie })).body.state;
  assert.equal(bought.ship.cargo[0].quantity, 30);
  assert.equal(bought.cashPence, 2500000 - q.debitPence);
  const sell = await quote(g.cookie, { type: 'sell', commodityId: 'food', quantity: 30 });
  const sales = await Promise.all([payload(sell), payload(sell)].map(body => call('commands', { cookie: g.cookie, body })));
  assert.equal(sales.filter(r => r.status === 200).length, 1);
  assert.deepEqual((await call('state', { cookie: g.cookie })).body.state.ship.cargo, []);
  const route = await quote(g.cookie, { type: 'travel', destinationId: 'eden' });
  const trips = await Promise.all([payload(route), payload(route)].map(body => call('commands', { cookie: g.cookie, body })));
  assert.equal(trips.filter(r => r.status === 200).length, 1);
  assert.equal((await call('state', { cookie: g.cookie })).body.state.locationId, 'eden');
});

test('economic rejections, stale/expired quotes and input bounds leave state unchanged', async () => {
  const g = await guest();
  for (const quantity of [0, -1, 0.5, 10001, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await call('quotes', { cookie: g.cookie, body: { action: { type: 'buy', commodityId: 'food', quantity } } })).status, 400);
  }
  for (const [action, code] of [
    [{ type: 'buy', commodityId: 'food', quantity: 41 }, 'CAPACITY_EXCEEDED'],
    [{ type: 'buy', commodityId: 'aurelia', quantity: 21 }, 'INSUFFICIENT_STOCK'],
    [{ type: 'sell', commodityId: 'food', quantity: 1 }, 'INSUFFICIENT_CARGO'],
    [{ type: 'travel', destinationId: 'earth' }, 'INVALID_ROUTE'],
  ]) {
    const response = await call('quotes', { cookie: g.cookie, body: { action } });
    assert.equal(response.body.error.code, code);
  }
  const q = await quote(g.cookie, { type: 'buy', commodityId: 'food', quantity: 1 });
  await admin.query("update frontierdom.quotes set expires_at=now()-interval '1 second' where id=$1", [q.id]);
  assert.equal((await call('commands', { cookie: g.cookie, body: payload(q) })).body.error.code, 'QUOTE_EXPIRED');
  assert.deepEqual((await call('state', { cookie: g.cookie })).body.state, g.state);
  const q2 = await quote(g.cookie, { type: 'buy', commodityId: 'food', quantity: 1 });
  await trade(g.cookie, { type: 'buy', commodityId: 'food', quantity: 1 });
  const stale = await call('commands', { cookie: g.cookie, body: { ...payload(q2), expectedRevision: 1 } });
  assert.equal(stale.body.error.code, 'STALE_QUOTE');
  await admin.query(`update frontierdom.companies set state=jsonb_set(state,'{cashPence}','0'::jsonb) where id=$1`, [g.state.companyId]);
  const insufficient = await call('quotes', { cookie: g.cookie, body: { action: { type: 'travel', destinationId: 'eden' } } });
  assert.equal(insufficient.body.error.code, 'INSUFFICIENT_CASH');
});

test('ledger insert failure rolls back state, cash, inventory, count and permits identical retry', async () => {
  const g = await guest();
  const q = await quote(g.cookie, { type: 'buy', commodityId: 'medicine', quantity: 2 });
  const command = payload(q);
  await admin.query(`create function frontierdom.test_reject_ledger() returns trigger language plpgsql as $$
    begin raise exception 'injected ledger failure'; end $$;
    create trigger test_failure before insert on frontierdom.commands for each row execute function frontierdom.test_reject_ledger();`);
  try {
    const response = await call('commands', { cookie: g.cookie, body: command });
    assert.equal(response.status, 503);
    assert.equal(response.body.error.retryable, true);
    assert.ok(!JSON.stringify(response.body).includes('injected'));
    assert.deepEqual((await call('state', { cookie: g.cookie })).body.state, g.state);
    const { rows: [row] } = await admin.query('select command_count from frontierdom.companies where id=$1', [g.state.companyId]);
    assert.equal(row.command_count, 0);
  } finally {
    await admin.query('drop trigger test_failure on frontierdom.commands; drop function frontierdom.test_reject_ledger();');
  }
  assert.equal((await call('commands', { cookie: g.cookie, body: command })).status, 200);
});

test('real round trip reconciles integer money, cost basis and complete ledger', async () => {
  const g = await guest();
  const actions = [
    { type: 'buy', commodityId: 'medicine', quantity: 20 },
    { type: 'travel', destinationId: 'eden' },
    { type: 'sell', commodityId: 'medicine', quantity: 20 },
    { type: 'buy', commodityId: 'aurelia', quantity: 20 },
    { type: 'travel', destinationId: 'earth' },
    { type: 'sell', commodityId: 'aurelia', quantity: 20 },
  ];
  let latest;
  for (const action of actions) latest = (await trade(g.cookie, action)).body;
  assert.equal(latest.state.locationId, 'earth');
  assert.deepEqual(latest.state.ship.cargo, []);
  assert.equal(latest.state.revision, 6);
  assert.ok(latest.state.cashPence > 2500000);
  const f = latest.state.finances;
  assert.equal(latest.state.cashPence - 2500000, f.netCashFlowPence);
  assert.equal(f.realizedProfitPence, f.salesPence - f.salesCostBasisPence - f.travelPence);
  assert.equal(f.realizedProfitPence, f.netCashFlowPence);
  const { rows } = await admin.query('select response from frontierdom.commands where company_id=$1', [g.state.companyId]);
  assert.equal(rows.length, 6);
  assert.equal(rows.reduce((sum, row) => sum + row.response.receipt.realizedProfitPence, 0), f.realizedProfitPence);
});

test('origin, body size, cookies and owner fields are rejected at HTTP boundary', async () => {
  const g = await guest();
  assert.equal((await call('session', { body: {}, headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await call('session', { body: {}, headers: { Origin: '' } })).status, 403);
  assert.equal((await call('session', { body: { padding: 'x'.repeat(4096) } })).status, 400);
  assert.equal((await call('session', { body: { owner: g.state.companyId } })).status, 400);
  assert.equal((await call('state', { cookie: `${g.cookie}; ${g.cookie}` })).status, 400);
  assert.equal((await call('state', { cookie: 'frontierdom_session=forged' })).status, 401);
  const secure = createApiServer({ service, authMode:'guest', siteOrigin: 'https://frontierdom.com', secureCookies: false });
  secure.listen(0, '127.0.0.1'); await once(secure, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${secure.address().port}/api/v1/session`, {
      method: 'POST', headers: { Origin: 'https://frontierdom.com', 'Content-Type': 'application/json', Cookie: g.cookie }, body: '{}' });
    assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  } finally { const closed = once(secure, 'close'); secure.close(); secure.closeAllConnections(); await closed; }
});

test('IP admission survives cookie deletion, quote caps and session rates are bounded', async () => {
  await admin.query('delete from frontierdom.rate_buckets');
  for (let i = 0; i < 5; i++) assert.equal((await call('session', { body: {} })).status, 200);
  const blocked = await call('session', { body: {} });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, 'RATE_LIMITED');
  const g = await guest();
  for (let i = 0; i < 20; i++) await quote(g.cookie, { type: 'buy', commodityId: 'food', quantity: 1 });
  assert.equal((await call('quotes', { cookie: g.cookie, body: { action: { type: 'buy', commodityId: 'food', quantity: 1 } } })).status, 429);
  await admin.query('delete from frontierdom.quotes where company_id=$1', [g.state.companyId]);
  await admin.query('delete from frontierdom.rate_buckets');
  for (let i = 0; i < 60; i++) await service.rate(g.token, 'commands', 60, 60);
  const rate = await call('commands', { cookie: g.cookie, body: payload({ id: randomUUID(), expectedRevision: 0 }) });
  assert.equal(rate.status, 429);
});

test('durable command cap blocks new changes without erasing replay identities', async () => {
  const g = await guest();
  const first = await trade(g.cookie, { type: 'buy', commodityId: 'food', quantity: 1 });
  await admin.query('update frontierdom.companies set command_count=1000 where id=$1', [g.state.companyId]);
  const q = await quote(g.cookie, { type: 'buy', commodityId: 'food', quantity: 1 });
  assert.equal((await call('commands', { cookie: g.cookie, body: payload(q) })).status, 429);
  const replay = await call('commands', { cookie: g.cookie, body: first.command });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.receipt.id, first.body.receipt.id);
});

test('limiter storage is globally bounded and expired keys are reclaimed', async () => {
  await admin.query('delete from frontierdom.rate_buckets');
  await admin.query(`insert into frontierdom.rate_buckets(key,window_id,hits,expires_at)
    select 'filler-'||n,0,1,now()+interval '1 hour' from generate_series(1,5000) n`);
  await assert.rejects(service.rate('new-identity', 'ip', 240, 60), error => error.code === 'RATE_LIMITED');
  await admin.query("update frontierdom.rate_buckets set expires_at=now()-interval '1 second' where key='filler-1'");
  await service.rate('new-identity', 'ip', 240, 60);
  const { rows: [count] } = await admin.query('select count(*)::int as count from frontierdom.rate_buckets');
  assert.equal(count.count, 5000);
  await admin.query('delete from frontierdom.rate_buckets');
});

test('private schema denies browser roles and runtime is not superuser or BYPASSRLS', async () => {
  const { rows: [role] } = await pool.query('select rolsuper, rolbypassrls from pg_roles where rolname=current_user');
  assert.deepEqual(role, { rolsuper: false, rolbypassrls: false });
  for (const name of ['anon', 'authenticated', 'service_role']) {
    const { rows: [grant] } = await admin.query("select has_schema_privilege($1, 'frontierdom', 'USAGE') as allowed", [name]);
    assert.equal(grant.allowed, false);
    const client = await admin.connect();
    try {
      await client.query('begin');
      await client.query(`set local role ${name}`);
      await assert.rejects(client.query('select * from frontierdom.companies'), error => error.code === '42501');
    } finally { await client.query('rollback'); client.release(); }
  }
  const { rows } = await admin.query("select relrowsecurity, relforcerowsecurity from pg_class where relnamespace='frontierdom'::regnamespace and relkind='r' and relname in ('companies','sessions','quotes','commands','rate_buckets')");
  assert.ok(rows.length === 5 && rows.every(row => row.relrowsecurity && row.relforcerowsecurity));
});

test('global guest cap serializes concurrent admissions and existing companies still work', async () => {
  const g = await guest();
  const { rows: [count] } = await admin.query('select count(*)::int as count from frontierdom.companies');
  const { rows: inserted } = await admin.query(`with ids as
    (select gen_random_uuid() as id from generate_series(1,$2::int))
    insert into frontierdom.companies(id,state)
    select id,jsonb_set($1::jsonb,'{companyId}',to_jsonb(id::text)) from ids returning id`, [g.state, 499 - count.count]);
  let admitted;
  try {
    const results = await Promise.allSettled([service.session(undefined, {}), service.session(undefined, {})]);
    const success = results.filter(result => result.status === 'fulfilled');
    const failures = results.filter(result => result.status === 'rejected');
    assert.equal(success.length, 1);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].reason.code, 'RATE_LIMITED');
    admitted = success[0].value.body.state.companyId;
    const finalCount = await admin.query('select count(*)::int as count from frontierdom.companies');
    assert.equal(finalCount.rows[0].count, 500);
    assert.deepEqual((await call('state', { cookie: g.cookie })).body.state, g.state);
  } finally {
    if (admitted) await admin.query('delete from frontierdom.sessions where company_id=$1', [admitted]);
    await admin.query('delete from frontierdom.companies where id=any($1::uuid[])', [[...inserted.map(row => row.id), ...(admitted ? [admitted] : [])]]);
  }
});

test('consistent pg_dump restore recovers restricted API state and original idempotent response', async () => {
  const g = await guest();
  const first = await trade(g.cookie, { type: 'buy', commodityId: 'food', quantity: 2 });
  const run = promisify(execFile);
  const dump = `${process.env.PGHOST}/recovery.dump`;
  await run('/usr/lib/postgresql/16/bin/pg_dump', ['--format=custom', '--file', dump], { env: { ...process.env, PGUSER: 'postgres' } });
  await run('/usr/lib/postgresql/16/bin/createdb', ['frontierdom_restored'], { env: { ...process.env, PGUSER: 'postgres' } });
  await run('/usr/lib/postgresql/16/bin/pg_restore', ['--exit-on-error', '--dbname', 'frontierdom_restored', dump], { env: { ...process.env, PGUSER: 'postgres' } });
  const restored = createPool(process.env.DATABASE_URL.replace('/frontierdom_test?', '/frontierdom_restored?'));
  try {
    const recovered = createService(restored, economy);
    assert.deepEqual((await recovered.state(g.token)).state, first.body.state);
    assert.deepEqual(await recovered.command(g.token, first.command), { ...first.body, replayed: true });
  } finally { await restored.end(); }
});

test('session, state and original receipt survive a separate API process restart', async () => {
  const g = await guest();
  const first = await trade(g.cookie, { type: 'buy', commodityId: 'food', quantity: 2 });
  // Spawn the actual entrypoint against the same durable isolated DB, stop it,
  // then start a fresh process. No JS object/store carries state across starts.
  await stop();
  const port = Number(new URL(base).port);
  async function boot() {
    const child = spawn(process.execPath, ['server/server.mjs'], {
      env: { ...process.env, NODE_ENV: 'test', SITE_ORIGIN: origin, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('API boot timed out.')), 8000);
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`API exited during boot: ${code}`)); });
      child.stdout.on('data', chunk => { output += chunk; if (output.includes('API listening')) { clearTimeout(timeout); resolve(); } });
    });
    return child;
  }
  async function end(child) { const done = once(child, 'exit'); child.kill('SIGTERM'); await done; }
  let child;
  try {
    child = await boot();
    assert.deepEqual((await call('state', { cookie: g.cookie })).body.state, first.body.state);
    await end(child); child = undefined;
    child = await boot();
    const replay = await call('commands', { cookie: g.cookie, body: first.command });
    assert.deepEqual(replay.body, { ...first.body, replayed: true });
    await end(child); child = undefined;
  } finally { if (child) await end(child); await listen(); }
});
