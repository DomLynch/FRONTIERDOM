import { createClient } from '@supabase/supabase-js';
import { ApiError, uuid } from './errors.mjs';

const rejected = () => new ApiError('SESSION_REQUIRED', 'Google sign-in is required.', 401);
function check(error) {
  if (!error) return;
  if ((error.status >= 400 && error.status < 500 && error.status !== 429) ||
      ['AuthInvalidJwtError', 'AuthSessionMissingError'].includes(error.name)) throw rejected();
  throw new ApiError('UNAVAILABLE', 'Authentication is temporarily unavailable.', 503, true);
}

export function createSupabaseAuth({ url, publishableKey, callbackUrl, allowTestHttp = false }) {
  const project = new URL(url);
  if (project.origin !== url || (!allowTestHttp && project.protocol !== 'https:') ||
      !['https:', 'http:'].includes(project.protocol) || !publishableKey) throw new Error('Invalid Supabase Auth configuration.');
  // One SDK instance per operation: no shared current user, browser storage,
  // timers or auto URL detection. Storage is encrypted by the calling service.
  function client(storage) {
    return createClient(url, publishableKey, {
      auth: { flowType: 'pkce', storageKey: 'frontierdom-auth', autoRefreshToken: false,
        persistSession: true, detectSessionInUrl: false,
        storage: {
          getItem: key => storage[key] ?? null,
          setItem: (key, value) => {
            if (key === 'frontierdom-auth') {
              const session = JSON.parse(value);
              delete session.provider_token; delete session.provider_refresh_token;
              storage[key] = JSON.stringify(session);
            } else storage[key] = value;
          },
          removeItem: key => { delete storage[key]; },
        },
      },
      global: { fetch: (input, options = {}) => fetch(input, { ...options, signal: AbortSignal.timeout(5000) }) },
    });
  }
  async function verified(sdk) {
    const session = await sdk.auth.getSession(); check(session.error);
    if (!session.data.session) throw rejected();
    const claims = await sdk.auth.getClaims(session.data.session.access_token); check(claims.error);
    const result = await sdk.auth.getUser(session.data.session.access_token); check(result.error);
    const user = result.data.user;
    if (!user || claims.data?.claims?.sub !== user.id || !user.app_metadata?.providers?.includes('google')) throw rejected();
    let id,sessionId;
    try { id=uuid(user.id);sessionId=uuid(claims.data.claims.session_id); } catch { throw rejected(); }
    const name = user.user_metadata?.full_name ?? user.user_metadata?.name;
    return { user: { id, displayName: typeof name === 'string' ? name.slice(0,80) : 'Captain' }, sessionId };
  }
  return {
    async start(storage) {
      const sdk = client(storage);
      const result = await sdk.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl, skipBrowserRedirect: true } });
      check(result.error);
      const target = new URL(result.data.url);
      if (target.origin !== project.origin || target.pathname !== '/auth/v1/authorize' ||
          target.searchParams.get('provider') !== 'google' || target.searchParams.get('redirect_to') !== callbackUrl ||
          !target.searchParams.get('code_challenge')) throw new Error('Unexpected OAuth authorization URL.');
      return target.href;
    },
    async exchange(storage, code, flowId) {
      const sdk = client(storage);
      const result = await sdk.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined); check(result.error);
      return verified(sdk);
    },
    async verify(storage) { return verified(client(storage)); },
    async logout(storage) { const result = await client(storage).auth.signOut({ scope: 'local' }); check(result.error); },
  };
}
