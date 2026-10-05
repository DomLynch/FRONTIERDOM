// Pure company-specific economy. Backend owns trusted atomic execution and retries.
import { GOODS, LOCATIONS, fail, integer, safe, add, emptyTotals, refreshPrices, unitPrice,
  validateState, allocatedBasis, finishCommand } from './rules.js';
import { migrateExpeditionState, isExpeditionAction, quoteExpeditionAction,
  applyExpeditionAction, returnFare, beginTravel } from './expedition.js';
export { EconomyError } from './rules.js';
export { migrateExpeditionState, quoteExpeditionAction, describeExpeditionAction, applyExpeditionAction, applyBattleProgress, applyBattleSettlement } from './expedition.js';

export function createInitialState(companyId) {
  if (typeof companyId !== 'string' || !companyId.trim()) fail('INVALID_REQUEST', 'Company ID is required.');
  const markets = LOCATIONS.map((locationId, index) => ({ locationId, revision: 0,
    commodities: GOODS.map(([id, name, earth, eden]) => {
      const values = index === 0 ? earth : eden;
      return { id, name, stockUnits: values[2], demandUnits: values[3] };
    }) }));
  markets.forEach(refreshPrices);
  return migrateExpeditionState({
    companyId, revision: 0, locationId: 'earth', cashPence: 2500000,
    ship: { id: `${companyId}:freighter`, name: 'Horizon', capacityUnits: 40, cargo: [] },
    crew: [ ['captain', 'Mara'], ['engineer', 'Ivo'], ['trader', 'Nadia'] ]
      .map(([role, name]) => ({ id: `${companyId}:${role}`, name, role })),
    markets,
    routes: [{ from: 'earth', to: 'eden', travelCostPence: 35000 },
      { from: 'eden', to: 'earth', travelCostPence: 25000 }],
    receipts: [], finances: emptyTotals(),
  });
}

function evaluate(state, action) {
  validateState(state);
  if (state.expedition?.pendingJourney) fail('INVALID_REQUEST', 'Resolve the pending journey first.');
  if (!action || typeof action !== 'object') fail('INVALID_REQUEST', 'Action is required.');
  if (action.type === 'travel') {
    if (!LOCATIONS.includes(action.destinationId) || action.destinationId === state.locationId) {
      fail('INVALID_ROUTE', 'Choose the other station.');
    }
    const debitPence = state.locationId === 'earth' ? 35000 : returnFare(state);
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
    if (action.quantity > state.ship.capacityUnits - state.ship.cargo.reduce((sum, c) => sum + c.quantity, 0)) {
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
    ? allocatedBasis(cargo, action.quantity) : 0;
  return { debitPence: action.type === 'buy' ? total : 0,
    creditPence: action.type === 'sell' ? total : 0, basisPence };
}

export function quoteAction(state, action) {
  state = migrateExpeditionState(state);
  if (isExpeditionAction(action)) return quoteExpeditionAction(state, action);
  const { debitPence, creditPence } = evaluate(state, action);
  return { debitPence, creditPence };
}
export function applyAction(state, action, metadata = {}) {
  state = migrateExpeditionState(state);
  if (isExpeditionAction(action)) return applyExpeditionAction(state, action, metadata);
  const values = evaluate(state, action);
  const next = structuredClone(state);
  const locationBefore = state.locationId;
  if (action.type === 'travel') {
    beginTravel(next, action, metadata, values.debitPence);
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
  const deltas = { purchasesPence: action.type === 'buy' ? values.debitPence : 0,
    salesPence: values.creditPence, salesCostBasisPence: values.basisPence,
    travelPence: action.type === 'travel' ? values.debitPence : 0 };
  return finishCommand(state, next, action, metadata, deltas);
}
