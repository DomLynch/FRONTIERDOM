// Provider tokens and OAuth state are server-owned. Only validate navigation/UI data.
export function validateGoogleURL(value, { authOrigin, siteOrigin }) {
  try {
    const expected = new URL(authOrigin), url = new URL(value);
    if (expected.protocol !== 'https:' || expected.origin !== authOrigin || expected.username || expected.password
      || url.protocol !== 'https:' || url.origin !== expected.origin
      || url.pathname !== '/auth/v1/authorize' || url.searchParams.get('provider') !== 'google'
      || url.searchParams.getAll('provider').length !== 1 || url.searchParams.getAll('redirect_to').length !== 1
      || url.searchParams.get('redirect_to') !== `${siteOrigin}/api/v1/auth/callback`
      || url.username || url.password || url.hash) throw new Error();
    return url.href;
  } catch { throw new Error('Google sign-in is unavailable. Please retry shortly.'); }
}

export function pendingMatchesAccount(pending, user, companyId) {
  return !!user && (!pending.userId || pending.userId === user.id) && pending.companyId === companyId;
}

export function authReturnMessage(params) {
  const code = params.get('auth');
  if (!['cancelled', 'failed'].includes(code)) return '';
  return code === 'cancelled'
    ? 'Google sign-in was cancelled. Your progress is unchanged.'
    : 'Google sign-in could not be completed. Please try again.';
}

/** Cancelling invalidates late responses before any browser navigation. */
export function createLoginAttempt(api, navigate, origins) {
  let generation = 0;
  return {
    cancel() { generation++; },
    async start() {
      const token = ++generation;
      try {
        const response = await api.signInGoogle();
        if (token !== generation) return false;
        const url = validateGoogleURL(response.url, origins);
        navigate(url);
        return true;
      } catch (error) {
        if (token !== generation) return false;
        throw error;
      }
    }
  };
}
