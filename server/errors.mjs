export class ApiError extends Error {
  constructor(code, message, status = 400, retryable = false) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export const invalid = (message = 'Invalid request.') => new ApiError('INVALID_REQUEST', message);

export function exactObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    throw invalid();
  }
}

export function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw invalid('Expected a UUID.');
  }
  return value.toLowerCase();
}

export function actionInput(action) {
  if (action?.type === 'travel') {
    exactObject(action, ['type', 'destinationId']);
    if (!['earth', 'eden'].includes(action.destinationId)) throw invalid('Invalid destination.');
  } else if (['buy', 'sell'].includes(action?.type)) {
    exactObject(action, ['type', 'commodityId', 'quantity']);
    if (typeof action.commodityId !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(action.commodityId) ||
        !Number.isSafeInteger(action.quantity) || action.quantity <= 0 || action.quantity > 10000) {
      throw invalid('Invalid commodity or quantity.');
    }
  } else throw invalid('Unknown action.');
  return structuredClone(action);
}

export function commandInput(body) {
  exactObject(body, ['commandId', 'quoteId', 'expectedRevision']);
  if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) throw invalid('Invalid revision.');
  return { commandId: uuid(body.commandId), quoteId: uuid(body.quoteId), expectedRevision: body.expectedRevision };
}
