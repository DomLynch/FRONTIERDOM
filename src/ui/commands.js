// Only explicit, non-retryable API rejections establish that no command committed.
export function isDefiniteRejection(error) {
  return error.outcomeUnknown !== true && error.status >= 400 && error.status < 500
    && ![401, 403, 429].includes(error.status)
    && error.code !== 'INVALID_RESPONSE' && error.code !== 'IDEMPOTENCY_CONFLICT' && error.code !== 'ACCOUNT_CHANGED';
}

export function acceptSnapshot(current, incoming) {
  if (current && current.companyId !== incoming.companyId) {
    throw new Error('Company session changed. Reload to reconnect before trading.');
  }
  return !current || incoming.revision >= current.revision ? incoming : current;
}

export function pendingKey() {
  return 'frontierdom.pending.v1';
}

export function removeResolvedPending(storage, key, resolved) {
  const saved = storage.getItem(key);
  if (saved) {
    const current = JSON.parse(saved);
    if (['companyId', 'userId', 'commandId', 'quoteId', 'expectedRevision'].some((field) => current?.[field] !== resolved[field])) return current;
    storage.removeItem(key);
  }
  return null;
}

// Max uses authoritative quotes; indicative prices never determine affordability.
export async function maximumQuote(api, action, ceiling) {
  let low = 1, high = ceiling, best = null;
  while (low <= high) {
    const quantity = Math.floor((low + high) / 2);
    try {
      const { quote } = await api.quote({ ...action, quantity });
      best = quote;
      low = quantity + 1;
    } catch (error) {
      if (!['INSUFFICIENT_CASH', 'INSUFFICIENT_STOCK', 'CAPACITY_EXCEEDED', 'INSUFFICIENT_CARGO'].includes(error.code)) throw error;
      high = quantity - 1;
    }
  }
  if (!best) throw new Error('No units available at the current price and capacity.');
  return best;
}
