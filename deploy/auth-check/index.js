const status = document.querySelector('#status');
const button = document.querySelector('#google');
const projectOrigin = 'https://eyfojjzajbfliuokaplx.supabase.co';
const callback = 'https://frontierdom.com/api/v1/auth/callback';

async function readSession() {
  try {
    const response = await fetch('/api/v1/auth/session', {
      credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Session unavailable');
    const session = await response.json();
    if (session.apiVersion !== 1 || session.provider !== 'google') throw new Error('Unexpected session');
    status.textContent = session.user ? 'Signed in with Google.' : 'Not signed in.';
    button.disabled = Boolean(session.user);
  } catch {
    status.textContent = 'Sign-in check unavailable. Reload to retry.';
  }
}

button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = 'Opening Google sign-in…';
  try {
    const response = await fetch('/api/v1/auth/google', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { 'Content-Type': 'application/json' }, body: '{}',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Sign-in unavailable');
    const data = await response.json();
    const url = new URL(data.url);
    if (data.apiVersion !== 1 || url.origin !== projectOrigin ||
        url.pathname !== '/auth/v1/authorize' || url.username || url.password || url.hash ||
        url.searchParams.get('provider') !== 'google' ||
        url.searchParams.get('redirect_to') !== callback || !url.searchParams.get('code_challenge')) {
      throw new Error('Unexpected sign-in destination');
    }
    window.location.assign(url.href);
  } catch {
    status.textContent = 'Google sign-in unavailable. Reload to retry.';
  }
});

if (window.location.origin === 'https://frontierdom.com') readSession();
else status.textContent = 'Open this check on https://frontierdom.com/auth-check.';
