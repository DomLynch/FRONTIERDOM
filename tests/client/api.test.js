import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi, ApiError } from '../../src/client/api.js';
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
