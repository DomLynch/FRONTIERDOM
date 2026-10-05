// Pure company-specific economy. Backend supplies trusted state and command metadata.
export const GOODS = [
  ['food', 'Food', [45, 50, 120, 40], [70, 80, 40, 80]],
  ['medicine', 'Medicine', [90, 100, 80, 40], [175, 190, 30, 80]],
  ['machinery', 'Machinery', [230, 250, 60, 30], [340, 370, 20, 40]],
  ['fuel', 'Fuel', [70, 80, 100, 60], [95, 110, 60, 60]],
  ['aurelia', 'Aurelia', [300, 330, 20, 80], [180, 200, 80, 30]],
  ['exotic-metal', 'Exotic Metal', [140, 160, 40, 60], [100, 120, 80, 30]],
];
export const LOCATIONS = ['earth', 'eden'];
export const RECEIPT_LIMIT = 50;

export class EconomyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EconomyError';
    this.code = code;
  }
}
export function fail(code, message) { throw new EconomyError(code, message); }
export function integer(value) { return Number.isSafeInteger(value) && value >= 0; }
export function safe(value) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail('INVALID_REQUEST', 'Economic total is outside the safe integer range.');
  }
  return Number(value);
}
export function add(a, b) { return safe(BigInt(a) + BigInt(b)); }
export function emptyTotals() {
  return { purchasesPence: 0, salesPence: 0, salesCostBasisPence: 0,
    travelPence: 0, netCashFlowPence: 0, realizedProfitPence: 0 };
}
export function unitPrice(base, target, stock) {
  // Thousandths multiplier: 0.2% per unit; exact half-up rounding in pence.
  const multiplier = Math.max(750, Math.min(1250, 1000 + 2 * (target - stock)));
  return safe((BigInt(base) * BigInt(multiplier) + 500n) / 1000n);
}
export function refreshPrices(market) {
  for (const row of market.commodities) {
    const definition = GOODS.find(([id]) => id === row.id)[2 + LOCATIONS.indexOf(market.locationId)];
    row.buyUnitPence = unitPrice(definition[1] * 100, definition[2], row.stockUnits - 1);
    row.sellUnitPence = unitPrice(definition[0] * 100, definition[2], row.stockUnits);
  }
}

export function validateState(state) {
  if (!state || !LOCATIONS.includes(state.locationId) || !integer(state.revision)
    || !integer(state.cashPence) || ![40, 50].includes(state.ship?.capacityUnits)
    || !Array.isArray(state.ship.cargo) || !Array.isArray(state.markets)
    || !Array.isArray(state.receipts) || !state.finances) {
    fail('INVALID_REQUEST', 'Invalid economy state.');
  }
  const ids = new Set();
  let capacity = 0;
  for (const cargo of state.ship.cargo) {
    if (!GOODS.some(([id]) => id === cargo.commodityId) || ids.has(cargo.commodityId)
      || !integer(cargo.quantity) || cargo.quantity === 0 || !integer(cargo.costBasisPence)) {
      fail('INVALID_REQUEST', 'Invalid cargo state.');
    }
    ids.add(cargo.commodityId);
    capacity = add(capacity, cargo.quantity);
  }
  if (capacity > state.ship.capacityUnits) fail('INVALID_REQUEST', 'Invalid cargo capacity.');
  for (const locationId of LOCATIONS) {
    const markets = state.markets.filter(m => m.locationId === locationId);
    if (markets.length !== 1 || !integer(markets[0].revision)
      || markets[0].commodities.length !== GOODS.length) fail('INVALID_REQUEST', 'Invalid market state.');
    for (const [id] of GOODS) {
      const rows = markets[0].commodities.filter(row => row.id === id);
      if (rows.length !== 1 || !integer(rows[0].stockUnits) || !integer(rows[0].demandUnits)) {
        fail('INVALID_REQUEST', 'Invalid market inventory.');
      }
    }
  }
  for (const key of ['purchasesPence', 'salesPence', 'salesCostBasisPence', 'travelPence']) {
    if (!integer(state.finances[key])) fail('INVALID_REQUEST', 'Invalid financial summary.');
  }
}

export function allocatedBasis(cargo, quantity) {
  return safe(BigInt(cargo.costBasisPence) * BigInt(quantity) / BigInt(cargo.quantity));
}
export function removeCargo(state, selection) {
  let basisPence = 0;
  for (const { commodityId, quantity } of selection) {
    const cargo = state.ship.cargo.find(c => c.commodityId === commodityId);
    if (!integer(quantity) || quantity === 0 || !cargo || quantity > cargo.quantity) {
      fail('INSUFFICIENT_CARGO', 'Selected cargo is not held.');
    }
    const basis = allocatedBasis(cargo, quantity);
    basisPence = add(basisPence, basis);
    cargo.quantity -= quantity;
    cargo.costBasisPence -= basis;
  }
  state.ship.cargo = state.ship.cargo.filter(c => c.quantity > 0);
  return basisPence;
}
export function arrive(state, destinationId) {
  state.locationId = destinationId;
  if (destinationId !== 'earth') return;
  for (const market of state.markets) {
    for (const row of market.commodities) {
      const definition = GOODS.find(([id]) => id === row.id)[2 + LOCATIONS.indexOf(market.locationId)];
      row.stockUnits = definition[2];
      row.demandUnits = definition[3];
    }
    market.revision = add(market.revision, 1);
    refreshPrices(market);
  }
}
const COMPONENTS = ['purchasesPence', 'salesPence', 'salesCostBasisPence', 'travelPence',
  'operatingExpensePence', 'cargoWriteOffBasisPence', 'capitalSpendPence'];
export function signed(value) {
  if (value < -BigInt(Number.MAX_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail('INVALID_REQUEST', 'Financial summary overflow.');
  }
  return Number(value);
}
export function finishCommand(before, next, action, metadata, changes, details = {}) {
  const { commandId, receiptId, occurredAt } = metadata;
  if (![commandId, receiptId, occurredAt].every(value => typeof value === 'string' && value.trim())) {
    fail('INVALID_REQUEST', 'Command ID, receipt ID and occurrence time are required.');
  }
  const delta = Object.fromEntries(COMPONENTS.map(key => [key, changes[key] ?? 0]));
  for (const key of COMPONENTS) {
    if (!integer(delta[key])) fail('INVALID_REQUEST', 'Invalid accounting delta.');
    next.finances[key] = add(next.finances[key] ?? 0, delta[key]);
  }
  const debitPence = safe(BigInt(delta.purchasesPence) + BigInt(delta.travelPence)
    + BigInt(delta.operatingExpensePence) + BigInt(delta.capitalSpendPence));
  const creditPence = delta.salesPence;
  next.cashPence = safe(BigInt(before.cashPence) - BigInt(debitPence) + BigInt(creditPence));
  next.revision = add(before.revision, 1);
  const f = next.finances;
  f.netCashFlowPence = signed(BigInt(f.salesPence) - BigInt(f.purchasesPence) - BigInt(f.travelPence)
    - BigInt(f.operatingExpensePence) - BigInt(f.capitalSpendPence));
  f.realizedProfitPence = signed(BigInt(f.salesPence) - BigInt(f.salesCostBasisPence) - BigInt(f.travelPence)
    - BigInt(f.operatingExpensePence) - BigInt(f.cargoWriteOffBasisPence));
  const receipt = { id: receiptId, commandId, action: structuredClone(action),
    locationBefore: before.locationId, locationAfter: next.locationId, debitPence, creditPence,
    cashAfterPence: next.cashPence, revision: next.revision, occurredAt, ...delta,
    realizedProfitPence: signed(BigInt(delta.salesPence) - BigInt(delta.salesCostBasisPence)
      - BigInt(delta.travelPence) - BigInt(delta.operatingExpensePence) - BigInt(delta.cargoWriteOffBasisPence)),
    ...details };
  next.receipts.push(structuredClone(receipt));
  next.receipts = next.receipts.slice(-RECEIPT_LIMIT);
  return { state: next, receipt };
}
