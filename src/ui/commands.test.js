import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptSnapshot, isDefiniteRejection, maximumQuote, removeResolvedPending } from './commands.js';

test('unknown failures preserve pending intent, explicit rejections can clear it', () => {
  for (const error of [new Error('Lost response'), { status: 502 }, { status: 429 }, { status: 401 }, { status: 403 },
    { status: 400, code: 'INVALID_RESPONSE' }, { status: 409, code: 'IDEMPOTENCY_CONFLICT' },
    { status: 409, code: 'ACCOUNT_CHANGED' }, { status: 409, code: 'STALE_STATE', outcomeUnknown: true }]) {
    assert.equal(isDefiniteRejection(error), false);
  }
  assert.equal(isDefiniteRejection({ status: 409, code: 'STALE_STATE' }), true);
});

test('old replay snapshots do not roll back visible state or change company', () => {
  const current = { companyId: 'a', revision: 5 };
  assert.equal(acceptSnapshot(current, { companyId: 'a', revision: 2 }), current);
  assert.throws(() => acceptSnapshot(current, { companyId: 'b', revision: 6 }), /session changed/);
});

test('max finds authoritative affordable quantity without indicative-price arithmetic', async () => {
  const seen = [];
  const api = { async quote(action) {
    seen.push(action.quantity);
    if (action.quantity > 23) throw Object.assign(new Error('Cash'), { code: 'INSUFFICIENT_CASH' });
    return { quote: { id: String(action.quantity), action, debitPence: action.quantity * 12345 } };
  } };
  const quote = await maximumQuote(api, { type: 'buy', commodityId: 'medicine' }, 100);
  assert.equal(quote.action.quantity, 23);
  assert.ok(seen.length <= 7);
});

test('max does not swallow outages or stale state as affordability', async () => {
  const failure = Object.assign(new Error('Unavailable'), { code: 'UNAVAILABLE' });
  await assert.rejects(maximumQuote({ quote: async () => { throw failure; } }, { type: 'buy' }, 50), (error) => error === failure);
});

test('late resolution removes only its own exact pending record', () => {
  const resolved = { companyId: 'A', userId: 'userA', commandId: 'one', quoteId: 'q1', expectedRevision: 1 };
  let value = JSON.stringify({ ...resolved, commandId: 'two', quoteId: 'q2', expectedRevision: 2 });
  const storage = { getItem: () => value, removeItem: () => { value = null; } };
  assert.equal(removeResolvedPending(storage, 'key', resolved).commandId, 'two');
  assert.notEqual(value, null);
  value = JSON.stringify(resolved);
  assert.equal(removeResolvedPending(storage, 'key', resolved), null);
  assert.equal(value, null);
});
