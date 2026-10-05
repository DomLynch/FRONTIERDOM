// Pure company-specific economy. Backend supplies trusted state and command metadata.
const GOODS = [
  ['food', 'Food', [45, 50, 120, 40], [70, 80, 40, 80]],
  ['medicine', 'Medicine', [90, 100, 80, 40], [175, 190, 30, 80]],
  ['machinery', 'Machinery', [230, 250, 60, 30], [340, 370, 20, 40]],
  ['fuel', 'Fuel', [70, 80, 100, 60], [95, 110, 60, 60]],
  ['aurelia', 'Aurelia', [300, 330, 20, 80], [180, 200, 80, 30]],
  ['exotic-metal', 'Exotic Metal', [140, 160, 40, 60], [100, 120, 80, 30]],
];
const LOCATIONS = ['earth', 'eden'];
const RECEIPT_LIMIT = 50;

export class EconomyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EconomyError';
    this.code = code;
  }
}
function fail(code, message) { throw new EconomyError(code, message); }
function integer(value) { return Number.isSafeInteger(value) && value >= 0; }
function safe(value) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail('INVALID_REQUEST', 'Economic total is outside the safe integer range.');
  }
  return Number(value);
}
function add(a, b) { return safe(BigInt(a) + BigInt(b)); }
function emptyTotals() {
  return { purchasesPence: 0, salesPence: 0, salesCostBasisPence: 0,
    travelPence: 0, netCashFlowPence: 0, realizedProfitPence: 0 };
}
function unitPrice(base, target, stock) {
  // Thousandths multiplier: 0.2% per unit; exact half-up rounding in pence.
  const multiplier = Math.max(750, Math.min(1250, 1000 + 2 * (target - stock)));
  return safe((BigInt(base) * BigInt(multiplier) + 500n) / 1000n);
}
function refreshPrices(market) {
  for (const row of market.commodities) {
    const definition = GOODS.find(([id]) => id === row.id)[2 + LOCATIONS.indexOf(market.locationId)];
    row.buyUnitPence = unitPrice(definition[1] * 100, definition[2], row.stockUnits - 1);
    row.sellUnitPence = unitPrice(definition[0] * 100, definition[2], row.stockUnits);
  }
}

export function createInitialState(companyId) {
  if (typeof companyId !== 'string' || !companyId.trim()) fail('INVALID_REQUEST', 'Company ID is required.');
  const markets = LOCATIONS.map((locationId, index) => ({ locationId, revision: 0,
    commodities: GOODS.map(([id, name, earth, eden]) => {
      const values = index === 0 ? earth : eden;
      return { id, name, stockUnits: values[2], demandUnits: values[3] };
    }) }));
  markets.forEach(refreshPrices);
  return {
    companyId, revision: 0, locationId: 'earth', cashPence: 2500000,
    ship: { id: `${companyId}:freighter`, name: 'Horizon', capacityUnits: 40, cargo: [] },
    crew: [ ['captain', 'Mara'], ['engineer', 'Ivo'], ['trader', 'Nadia'] ]
      .map(([role, name]) => ({ id: `${companyId}:${role}`, name, role })),
    markets,
    routes: [{ from: 'earth', to: 'eden', travelCostPence: 35000 },
      { from: 'eden', to: 'earth', travelCostPence: 25000 }],
    receipts: [], finances: emptyTotals(),
  };
}

function validateState(state) {
  if (!state || !LOCATIONS.includes(state.locationId) || !integer(state.revision)
    || !integer(state.cashPence) || state.ship?.capacityUnits !== 40
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
  if (capacity > 40) fail('INVALID_REQUEST', 'Invalid cargo capacity.');
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

function evaluate(state, action) {
  validateState(state);
  if (!action || typeof action !== 'object') fail('INVALID_REQUEST', 'Action is required.');
  if (action.type === 'travel') {
    if (!LOCATIONS.includes(action.destinationId) || action.destinationId === state.locationId) {
      fail('INVALID_ROUTE', 'Choose the other station.');
    }
    const debitPence = state.locationId === 'earth' ? 35000 : 25000;
    if (state.cashPence < debitPence) fail('INSUFFICIENT_CASH', 'Cannot afford travel.');
    return { debitPence, creditPence: 0, basisPence: 0 };
  }
  if (action.type !== 'buy' && action.type !== 'sell') fail('INVALID_REQUEST', 'Unknown action.');
  if (!integer(action.quantity) || action.quantity === 0) fail('INVALID_REQUEST', 'Quantity must be a positive safe integer.');
  const definition = GOODS.find(([id]) => id === action.commodityId);
  if (!definition) fail('NOT_FOUND', 'Unknown commodity.');
  const market = state.markets.find(m => m.locationId === state.locationId);
  const row = market.commodities.find(c => c.id === action.commodityId);
  const cargo = state.ship.cargo.find(c => c.commodityId === action.commodityId);
  if (action.type === 'buy') {
    if (action.quantity > 40 - state.ship.cargo.reduce((sum, c) => sum + c.quantity, 0)) {
      fail('CAPACITY_EXCEEDED', 'Cargo hold is full.');
    }
    if (action.quantity > row.stockUnits) fail('INSUFFICIENT_STOCK', 'Market stock is insufficient.');
  } else {
    if (action.quantity > (cargo?.quantity ?? 0)) fail('INSUFFICIENT_CARGO', 'Cargo is insufficient.');
    // The API has no demand-specific error; exhausted buying demand is market liquidity.
    if (action.quantity > row.demandUnits) fail('INSUFFICIENT_STOCK', 'Market buying demand is exhausted.');
  }
  const [bid, ask, target] = definition[2 + LOCATIONS.indexOf(state.locationId)];
  let total = 0;
  for (let k = 0; k < action.quantity; k++) {
    const stock = action.type === 'buy' ? row.stockUnits - k - 1 : row.stockUnits + k;
    total = add(total, unitPrice((action.type === 'buy' ? ask : bid) * 100, target, stock));
  }
  if (action.type === 'buy' && state.cashPence < total) fail('INSUFFICIENT_CASH', 'Cannot afford cargo.');
  const basisPence = action.type === 'sell'
    ? safe(BigInt(cargo.costBasisPence) * BigInt(action.quantity) / BigInt(cargo.quantity)) : 0;
  return { debitPence: action.type === 'buy' ? total : 0,
    creditPence: action.type === 'sell' ? total : 0, basisPence };
}

export function quoteAction(state, action) {
  const { debitPence, creditPence } = evaluate(state, action);
  return { debitPence, creditPence };
}
function accumulate(totals, action, values) {
  if (action.type === 'buy') totals.purchasesPence = add(totals.purchasesPence, values.debitPence);
  if (action.type === 'sell') {
    totals.salesPence = add(totals.salesPence, values.creditPence);
    totals.salesCostBasisPence = add(totals.salesCostBasisPence, values.basisPence);
  }
  if (action.type === 'travel') totals.travelPence = add(totals.travelPence, values.debitPence);
  const cashflow = BigInt(totals.salesPence) - BigInt(totals.purchasesPence) - BigInt(totals.travelPence);
  const profit = BigInt(totals.salesPence) - BigInt(totals.salesCostBasisPence) - BigInt(totals.travelPence);
  if (cashflow < -BigInt(Number.MAX_SAFE_INTEGER) || profit < -BigInt(Number.MAX_SAFE_INTEGER)) {
    fail('INVALID_REQUEST', 'Financial summary overflow.');
  }
  totals.netCashFlowPence = Number(cashflow);
  totals.realizedProfitPence = Number(profit);
}

export function applyAction(state, action, { commandId, receiptId, occurredAt } = {}) {
  const values = evaluate(state, action);
  if (![commandId, receiptId, occurredAt].every(value => typeof value === 'string' && value.trim())) {
    fail('INVALID_REQUEST', 'Command ID, receipt ID and occurrence time are required.');
  }
  const next = structuredClone(state);
  const locationBefore = next.locationId;
  next.cashPence = safe(BigInt(next.cashPence) - BigInt(values.debitPence) + BigInt(values.creditPence));
  next.revision = add(next.revision, 1);
  if (action.type === 'travel') {
    next.locationId = action.destinationId;
    if (next.locationId === 'earth') {
      // Only a paid Eden -> Earth command replenishes; persistence/retry is Backend's responsibility.
      for (const market of next.markets) {
        for (const row of market.commodities) {
          const definition = GOODS.find(([id]) => id === row.id)[2 + LOCATIONS.indexOf(market.locationId)];
          row.stockUnits = definition[2];
          row.demandUnits = definition[3];
        }
        market.revision = add(market.revision, 1);
        refreshPrices(market);
      }
    }
  } else {
    const market = next.markets.find(m => m.locationId === locationBefore);
    const row = market.commodities.find(c => c.id === action.commodityId);
    let cargo = next.ship.cargo.find(c => c.commodityId === action.commodityId);
    if (action.type === 'buy') {
      row.stockUnits -= action.quantity;
      if (!cargo) {
        cargo = { commodityId: action.commodityId, quantity: 0, costBasisPence: 0 };
        next.ship.cargo.push(cargo);
      }
      cargo.quantity += action.quantity;
      cargo.costBasisPence = add(cargo.costBasisPence, values.debitPence);
    } else {
      row.stockUnits = add(row.stockUnits, action.quantity);
      row.demandUnits -= action.quantity;
      cargo.quantity -= action.quantity;
      cargo.costBasisPence -= values.basisPence;
      next.ship.cargo = next.ship.cargo.filter(c => c.quantity > 0);
    }
    market.revision = add(market.revision, 1);
    refreshPrices(market);
  }
  accumulate(next.finances, action, values);
  const receipt = {
    id: receiptId, commandId, action: structuredClone(action), locationBefore, locationAfter: next.locationId,
    debitPence: values.debitPence, creditPence: values.creditPence,
    cashAfterPence: next.cashPence, revision: next.revision, occurredAt,
    realizedProfitPence: values.creditPence - values.basisPence - (action.type === 'travel' ? values.debitPence : 0),
  };
  next.receipts.push(structuredClone(receipt));
  next.receipts = next.receipts.slice(-RECEIPT_LIMIT);
  return { state: next, receipt };
}
