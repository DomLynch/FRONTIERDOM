export class ApiError extends Error {
  constructor(status, error, { outcomeUnknown = false, commandId } = {}) {
    super(error?.message || `API request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.code = error?.code || 'INVALID_RESPONSE';
    this.retryable = outcomeUnknown || error?.retryable === true;
    this.outcomeUnknown = outcomeUnknown;
    this.commandId = commandId;
  }
}

export function createApi({ fetchImpl = globalThis.fetch } = {}) {
  async function request(path, body, expectedCompanyId) {
    const isCommand = path === 'commands';
    const failure = (status, error, uncertain = false) => new ApiError(status, error, {
      outcomeUnknown: isCommand && uncertain, commandId: isCommand ? body.commandId : undefined
    });
    // Serialize before starting transport: serialization failure cannot have committed.
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    let response;
    try {
      response = await fetchImpl(`/api/v1/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin', cache: 'no-store',
        headers: body === undefined ? { Accept: 'application/json' } : {
          Accept: 'application/json', 'Content-Type': 'application/json',
          ...(expectedCompanyId === undefined ? {} : { 'X-Frontierdom-Company-Id': expectedCompanyId })
        },
        ...(body === undefined ? {} : { body: serialized })
      });
    } catch {
      throw failure(0, { code: 'TRANSPORT_ERROR', message: 'Connection failed; refresh or retry the original request.', retryable: true }, true);
    }
    let data;
    try { data = await response.json(); }
    catch { throw failure(response.status, { message: 'API returned invalid JSON.' }, true); }
    if (!data || data.apiVersion !== 1) {
      throw failure(response.status, { message: 'Unsupported or invalid API response.' }, true);
    }
    if (!response.ok) {
      if (!data.error || typeof data.error.code !== 'string' || typeof data.error.message !== 'string') {
        throw failure(response.status, { message: 'API returned an invalid error response.' }, true);
      }
      // A proxy/server failure can occur after commit, even with a JSON error envelope.
      throw failure(response.status, data.error, response.status >= 500 || (isCommand && data.error.code === 'ACCOUNT_CHANGED'));
    }
    if (isCommand && (data.commandId !== body.commandId || !data.state || !data.receipt
      || !Number.isSafeInteger(data.state.revision) || typeof data.replayed !== 'boolean')) {
      throw failure(response.status, { message: 'API returned an incomplete command result.' }, true);
    }
    return data;
  }
  return {
    authSession: async () => {
      const data = await request('auth/session');
      if (data.provider !== 'google' || !(data.user === null || (typeof data.user?.id === 'string'
        && data.user.id && typeof data.user.displayName === 'string'))) {
        throw new ApiError(200, { message: 'Invalid account session response.' });
      }
      return data;
    },
    signInGoogle: () => request('auth/google', {}),
    signOut: async () => {
      const data = await request('auth/logout', {});
      if (data.user !== null || data.provider !== 'google') throw new ApiError(200, { message: 'Invalid sign-out response.' });
      return data;
    },
    session: () => request('session', {}),
    state: () => request('state'),
    quote: (action) => request('quotes', { action }),
    // Caller retains this exact object and commandId until outcome is known.
    command: (command, { expectedCompanyId } = {}) => request('commands', command, expectedCompanyId)
  };
}
