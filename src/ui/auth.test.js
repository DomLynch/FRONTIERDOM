import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGoogleURL, pendingMatchesAccount, authReturnMessage, createLoginAttempt } from './auth.js';
import { createApi } from '../client/api.js';
const origins = { authOrigin: 'https://project.supabase.co', siteOrigin: 'https://frontierdom.com' };
const valid = `${origins.authOrigin}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(origins.siteOrigin + '/api/v1/auth/callback')}`;

test('Google navigation pins HTTPS origin, provider, path and callback', () => {
  assert.equal(validateGoogleURL(valid, origins), valid);
  for (const url of [valid.replace('https:', 'http:'), valid.replace('project.', 'other.'), valid.replace('/authorize?', '/other?'),
    valid.replace('provider=google', 'provider=github'), valid.replace('frontierdom.com', 'other.com'), 'javascript:alert(1)', valid + '#token', valid + '&provider=google', valid + '&redirect_to=https://other.com']) {
    assert.throws(() => validateGoogleURL(url, origins), /unavailable/);
  }
  assert.throws(() => validateGoogleURL(valid, { siteOrigin: origins.siteOrigin }), /unavailable/);
});
test('pending intent requires both original company and original account, including legacy records', () => {
  const pending = { userId: 'A', companyId: 'companyA' };
  assert.equal(pendingMatchesAccount(pending, { id: 'A' }, 'companyA'), true);
  assert.equal(pendingMatchesAccount(pending, { id: 'B' }, 'companyA'), false);
  assert.equal(pendingMatchesAccount(pending, { id: 'A' }, 'companyB'), false);
  assert.equal(pendingMatchesAccount({ companyId: 'companyA' }, { id: 'A' }, 'companyB'), false);
  assert.equal(pendingMatchesAccount(pending, null, 'companyA'), false);
});
test('cancelled Google attempt cannot navigate when its delayed response arrives', async () => {
  let respond;
  const navigation = [];
  const attempt = createLoginAttempt({ signInGoogle: () => new Promise((resolve) => { respond = resolve; }) }, (url) => navigation.push(url), origins);
  const request = attempt.start(); attempt.cancel(); respond({ url: valid });
  assert.equal(await request, false); assert.deepEqual(navigation, []);
});
test('callback copy uses only fixed server values and never echoes errors', () => {
  assert.match(authReturnMessage(new URLSearchParams('auth=cancelled')), /cancelled/);
  assert.match(authReturnMessage(new URLSearchParams('auth=failed')), /could not/);
  assert.equal(authReturnMessage(new URLSearchParams('auth=<script>&error=private')), '');
});
test('auth methods use same-origin cookie transport without browser provider credentials', async () => {
  const calls = [];
  const api = createApi({ fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return Response.json(url.endsWith('/google') ? { apiVersion: 1, url: valid } : { apiVersion: 1, user: null, provider: 'google' });
  } });
  await api.authSession(); await api.signInGoogle(); await api.signOut();
  assert.deepEqual(calls.map(({ url }) => url), ['/api/v1/auth/session', '/api/v1/auth/google', '/api/v1/auth/logout']);
  for (const { options } of calls) { assert.equal(options.credentials, 'same-origin'); assert.equal(options.headers.Authorization, undefined); }
  assert.equal(calls[1].options.body, '{}'); assert.equal(calls[2].options.body, '{}');
});
test('provider outage or malformed account response never becomes a signed-out success', async () => {
  for (const fetchImpl of [async () => Response.json({ apiVersion: 1, error: { code: 'UNAVAILABLE', message: 'Unavailable' } }, { status: 503 }),
    async () => Response.json({ apiVersion: 1, provider: 'google' })]) {
    await assert.rejects(createApi({ fetchImpl }).authSession());
  }
});
