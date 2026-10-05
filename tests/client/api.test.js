import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi, ApiError } from '../../src/client/api.js';

test('company precondition preserves exact payload and account-change outcome uncertainty', async () => {
  const original = { commandId: 'command-A', quoteId: 'quote-A', expectedRevision: 2 };
  let sent;
  const api = createApi({ fetchImpl: async (url, options) => {
    sent = { url, options };
    return Response.json({ apiVersion: 1, error: { code: 'ACCOUNT_CHANGED', message: 'Sign into the original account.', retryable: false } }, { status: 409 });
  } });
  await assert.rejects(api.command(original, { expectedCompanyId: 'company-A' }), error =>
    error.code === 'ACCOUNT_CHANGED' && error.outcomeUnknown && error.retryable && error.commandId === original.commandId);
  assert.equal(sent.url, '/api/v1/commands');
  assert.equal(sent.options.headers['X-Frontierdom-Company-Id'], 'company-A');
  assert.equal(sent.options.body, JSON.stringify(original));
  assert.deepEqual(original, { commandId: 'command-A', quoteId: 'quote-A', expectedRevision: 2 });
});
const command = { commandId: 'original-id', quoteId: 'quote-id', expectedRevision: 0 };
const reply = { apiVersion: 1, commandId: command.commandId, state: { revision: 1 }, receipt: { id: 'receipt-id' }, replayed: false };

for (const [label, fetchImpl] of [
  ['lost response', async () => { throw new TypeError('network'); }],
  ['HTML proxy response', async () => new Response('<html>gateway</html>', { status: 502 })],
  ['truncated successful response', async () => new Response('{', { status: 200 })],
  ['missing committed result', async () => Response.json({ apiVersion: 1 })],
  ['server failure after possible commit', async () => Response.json({ apiVersion: 1, error: { code: 'UNAVAILABLE', message: 'Unavailable' } }, { status: 503 })]
]) {
  test(`${label} preserves unknown outcome and original command identity`, async () => {
    await assert.rejects(createApi({ fetchImpl }).command(command), error => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.outcomeUnknown, true);
      assert.equal(error.commandId, command.commandId);
      assert.equal(error.retryable, true);
      return true;
    });
  });
}
test('valid conflict is a known rejection', async () => {
  const fetchImpl = async () => Response.json({ apiVersion: 1, error: { code: 'STALE_STATE', message: 'Refresh', retryable: false } }, { status: 409 });
  await assert.rejects(createApi({ fetchImpl }).command(command), error => error.code === 'STALE_STATE' && !error.outcomeUnknown && !error.retryable);
});
test('retry sends identical payload and accepts the original receipt', async () => {
  const bodies = [];
  const api = createApi({ fetchImpl: async (url, options) => {
    assert.equal(url, '/api/v1/commands');
    assert.equal(options.credentials, 'same-origin');
    bodies.push(options.body);
    if (bodies.length === 1) throw new Error('response lost');
    return Response.json({ ...reply, replayed: true });
  }});
  await assert.rejects(api.command(command));
  const result = await api.command(command);
  assert.deepEqual(bodies, [JSON.stringify(command), JSON.stringify(command)]);
  assert.equal(result.receipt.id, 'receipt-id');
  assert.equal(result.replayed, true);
});
test('read failure is retryable without an unknown economic command', async () => {
  const api = createApi({ fetchImpl: async () => { throw new Error('offline'); } });
  await assert.rejects(api.state(), error => error.retryable && !error.outcomeUnknown);
});

test('encounter paging is an authenticated no-store read without an economic payload', async () => {
  const id = '8d543ea1-a20c-42bf-a79d-85f4ae37b019';
  const api = createApi({ fetchImpl: async (url, options) => {
    assert.equal(url, `/api/v1/encounters/${id}?from=128`);
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.body, undefined);
    return Response.json({ apiVersion: 1, encounter: { id, cursor: { next: null } } });
  } });
  assert.equal((await api.encounter(id, 128)).encounter.id, id);
});

test('invalid encounter paths and cursors cannot start transport', async () => {
  let requests = 0;
  const api = createApi({ fetchImpl: async () => { requests++; throw new Error('unexpected transport'); } });
  const id = '8d543ea1-a20c-42bf-a79d-85f4ae37b019';
  for (const [encounterId, from] of [[`${id}/../../commands`, 0], ['', 0], [id, -1], [id, 2049], [id, 1.5], [id, '0']]) {
    await assert.rejects(api.encounter(encounterId, from), error => error.code === 'INVALID_REQUEST' && !error.outcomeUnknown);
  }
  assert.equal(requests, 0);
});
