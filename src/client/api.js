export class ApiError extends Error {
  constructor(status, error) {
    super(error?.message || `API request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.code = error?.code || 'INVALID_RESPONSE';
    this.retryable = error?.retryable === true;
  }
}

export function createApi() {
  async function request(path, body) {
    const response = await fetch(`/api/v1/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body === undefined ? { Accept: 'application/json' } : {
        Accept: 'application/json', 'Content-Type': 'application/json'
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    let data;
    try { data = await response.json(); }
    catch { throw new ApiError(response.status, { message: 'API returned invalid JSON.' }); }
    if (!response.ok) throw new ApiError(response.status, data.error);
    if (data.apiVersion !== 1) throw new ApiError(response.status, { message: 'Unsupported API version.' });
    return data;
  }
  return {
    session: () => request('session', {}),
    state: () => request('state'),
    quote: (action) => request('quotes', { action }),
    // Caller retains this exact object and commandId until outcome is known.
    command: (command) => request('commands', command)
  };
}
