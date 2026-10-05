import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, quoteAction, applyAction, EconomyError } from '../../src/sim/economy/index.js';

const buy = (commodityId, quantity) => ({ type: 'buy', commodityId, quantity });
const sell = (commodityId, quantity) => ({ type: 'sell', commodityId, quantity });
const travel = destinationId => ({ type: 'travel', destinationId });
function step(state, action) {
  const n = state.revision + 1;
  return applyAction(state, action, { commandId: `command-${n}`, receiptId: `receipt-${n}`,
    occurredAt: '2026-10-05T12:00:00.000Z' });
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function row(state, locationId, id) {
  return state.markets.find(m => m.locationId === locationId).commodities.find(c => c.id === id);
}
function roundTrip(state) {
  return [buy('medicine', 20), travel('eden'), sell('medicine', 20), buy('aurelia', 20),
    travel('earth'), sell('aurelia', 20)].reduce((s, a) => step(s, a).state, state);
}
function rejected(state, action, code) {
  const before = structuredClone(state);
  for (const operation of [() => quoteAction(state, action), () => step(state, action)]) {
    assert.throws(operation, error => error instanceof EconomyError && error.code === code);
    assert.deepEqual(state, before);
  }
}

test('initial company markets are isolated, serializable and have all six commodities', () => {
  const a = createInitialState('a');
  const b = createInitialState('b');
  assert.equal(a.cashPence, 2500000);
  assert.equal(a.ship.capacityUnits, 40);
  assert.equal(a.crew.length, 3);
  assert.equal(a.markets.length, 2);
  assert.equal(a.markets[0].commodities.length, 6);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  a.markets[0].commodities[0].stockUnits = 0;
  assert.equal(b.markets[0].commodities[0].stockUnits, 120);
});

test('golden round trip earns exactly £2593.50 including both travel charges', () => {
  let state = freeze(createInitialState('golden'));
  const actions = [buy('medicine', 20), travel('eden'), sell('medicine', 20), buy('aurelia', 20),
    travel('earth'), sell('aurelia', 20)];
  const flows = [[204200, 0], [35000, 0], [0, 343350], [408400, 0], [25000, 0], [0, 588600]];
  let profit = 0;
  for (const [i, action] of actions.entries()) {
    const original = structuredClone(state);
    const quote = quoteAction(state, action);
    assert.deepEqual(quote, { debitPence: flows[i][0], creditPence: flows[i][1] });
    const result = step(state, freeze(action));
    assert.deepEqual(state, original);
    assert.equal(result.receipt.debitPence, quote.debitPence);
    assert.equal(result.receipt.creditPence, quote.creditPence);
    assert.equal(result.receipt.revision, i + 1);
    profit += result.receipt.realizedProfitPence;
    state = freeze(result.state);
  }
  assert.equal(state.cashPence, 2759350);
  assert.equal(state.locationId, 'earth');
  assert.deepEqual(state.ship.cargo, []);
  assert.deepEqual(state.finances, { purchasesPence: 612600, salesPence: 931950,
    salesCostBasisPence: 612600, travelPence: 60000, netCashFlowPence: 259350, realizedProfitPence: 259350, operatingExpensePence: 0, cargoWriteOffBasisPence: 0, capitalSpendPence: 0 });
  assert.equal(profit, 259350);
});

test('splitting purchase and sale orders preserves exact prices and total cost basis', () => {
  const bulk = step(createInitialState('split'), buy('medicine', 20)).state;
  let split = createInitialState('split');
  for (let n = 0; n < 20; n++) split = step(split, buy('medicine', 1)).state;
  assert.equal(split.cashPence, bulk.cashPence);
  assert.deepEqual(split.ship.cargo, bulk.ship.cargo);
  const bulkSale = step(step(bulk, travel('eden')).state, sell('medicine', 20)).state;
  split = step(split, travel('eden')).state;
  for (let n = 0; n < 20; n++) split = step(split, sell('medicine', 1)).state;
  assert.equal(split.cashPence, bulkSale.cashPence);
  assert.deepEqual(split.finances, bulkSale.finances);
  assert.deepEqual(split.ship.cargo, bulkSale.ship.cargo);
});

test('weighted cost basis retains integer remainder until the final sale', () => {
  let state = step(createInitialState('basis'), buy('food', 3)).state;
  state.ship.cargo[0].costBasisPence = 101; // Trusted fixture with a non-divisible acquisition basis.
  state.finances.purchasesPence = 101;
  let result = step(state, sell('food', 1));
  assert.equal(result.state.ship.cargo[0].costBasisPence, 68);
  assert.equal(result.state.finances.salesCostBasisPence, 33);
  result = step(result.state, sell('food', 1));
  assert.equal(result.state.ship.cargo[0].costBasisPence, 34);
  result = step(result.state, sell('food', 1));
  assert.deepEqual(result.state.ship.cargo, []);
  assert.equal(result.state.finances.salesCostBasisPence, 101);
});

test('unsold inventory affects cashflow but does not become a realized loss', () => {
  let state = step(createInitialState('held'), buy('aurelia', 5)).state;
  assert.equal(state.finances.realizedProfitPence, 0);
  assert.equal(state.finances.netCashFlowPence, -state.ship.cargo[0].costBasisPence);
  state = step(state, travel('eden')).state;
  assert.equal(state.finances.realizedProfitPence, -35000);
});

test('bad quantities, identifiers and actions reject without mutation', () => {
  const state = freeze(createInitialState('invalid'));
  for (const quantity of [0, -1, 1.1, NaN, Infinity, '2', Number.MAX_SAFE_INTEGER + 1]) {
    rejected(state, buy('food', quantity), 'INVALID_REQUEST');
  }
  rejected(state, buy('unknown', 1), 'NOT_FOUND');
  rejected(state, { type: 'reset' }, 'INVALID_REQUEST');
  rejected(state, null, 'INVALID_REQUEST');
  rejected(state, travel('earth'), 'INVALID_ROUTE');
  rejected(state, travel('forge'), 'INVALID_ROUTE');
  assert.throws(() => applyAction(state, buy('food', 1)), { code: 'INVALID_REQUEST' });
});

test('cash, capacity, stock, cargo and demand constraints reject atomically', () => {
  rejected(createInitialState('capacity'), buy('food', 41), 'CAPACITY_EXCEEDED');
  rejected(createInitialState('stock'), buy('aurelia', 21), 'INSUFFICIENT_STOCK');
  rejected(createInitialState('cargo'), sell('food', 1), 'INSUFFICIENT_CARGO');
  const poor = createInitialState('poor');
  poor.cashPence = 100;
  rejected(poor, buy('food', 1), 'INSUFFICIENT_CASH');
  rejected(poor, travel('eden'), 'INSUFFICIENT_CASH');
  const demand = step(createInitialState('demand'), buy('food', 2)).state;
  row(demand, 'earth', 'food').demandUnits = 1;
  rejected(demand, sell('food', 2), 'INSUFFICIENT_STOCK');
});

test('immediate reversal loses money for every commodity at both stations', () => {
  for (const locationId of ['earth', 'eden']) {
    for (const commodity of createInitialState('arbitrage').markets[0].commodities) {
      let state = createInitialState('arbitrage');
      if (locationId === 'eden') state = step(state, travel('eden')).state;
      const cash = state.cashPence;
      state = step(state, buy(commodity.id, 10)).state;
      state = step(state, sell(commodity.id, 10)).state;
      assert.ok(state.cashPence < cash, `${locationId}/${commodity.id}`);
    }
  }
});

test('replenishment requires paid return and repeats the exact tutorial profit', () => {
  let state = createInitialState('repeat');
  for (let trip = 1; trip <= 12; trip++) {
    const oldCash = state.cashPence;
    state = roundTrip(state);
    assert.equal(state.cashPence - oldCash, 259350);
    assert.deepEqual(state.ship.cargo, []);
    assert.equal(state.finances.realizedProfitPence, 259350 * trip);
  }
  assert.equal(state.receipts.length, 50);
  assert.equal(state.revision, 72);
  rejected(state, travel('earth'), 'INVALID_ROUTE');
});

test('quotes do not replenish, consume demand or mutate inventory', () => {
  let state = step(createInitialState('quotes'), buy('food', 10)).state;
  const before = structuredClone(state);
  for (let i = 0; i < 100; i++) quoteAction(state, sell('food', 1));
  assert.deepEqual(state, before);
  state = step(state, travel('eden')).state;
  assert.equal(row(state, 'earth', 'food').stockUnits, 110);
  state = step(state, travel('earth')).state;
  assert.equal(row(state, 'earth', 'food').stockUnits, 120);
});

test('malformed persisted state and overflow reject without mutation', () => {
  const broken = createInitialState('broken');
  broken.cashPence = -1;
  rejected(broken, buy('food', 1), 'INVALID_REQUEST');
  const overflow = createInitialState('overflow');
  overflow.revision = Number.MAX_SAFE_INTEGER;
  const before = structuredClone(overflow);
  assert.throws(() => step(overflow, buy('food', 1)), { code: 'INVALID_REQUEST' });
  assert.deepEqual(overflow, before);
});

test('JSON round trip preserves future prices and outcomes; result objects do not alias', () => {
  const state = step(createInitialState('save'), buy('medicine', 3)).state;
  assert.deepEqual(step(JSON.parse(JSON.stringify(state)), travel('eden')), step(state, travel('eden')));
  const result = step(state, travel('eden'));
  result.receipt.action.destinationId = 'earth';
  assert.equal(result.state.receipts.at(-1).action.destinationId, 'eden');
});

test('cost-basis allocation uses exact intermediates even when multiplication exceeds safe Number range', () => {
  const state = createInitialState('large-basis');
  state.ship.cargo = [{ commodityId: 'medicine', quantity: 40, costBasisPence: Number.MAX_SAFE_INTEGER }];
  state.finances.purchasesPence = Number.MAX_SAFE_INTEGER;
  const original = structuredClone(state);
  const result = step(state, sell('medicine', 39));
  const allocated = Number(BigInt(Number.MAX_SAFE_INTEGER) * 39n / 40n);
  assert.equal(result.state.finances.salesCostBasisPence, allocated);
  assert.equal(result.state.ship.cargo[0].costBasisPence, Number.MAX_SAFE_INTEGER - allocated);
  const final = step(result.state, sell('medicine', 1));
  assert.equal(final.state.finances.salesCostBasisPence, Number.MAX_SAFE_INTEGER);
  assert.deepEqual(final.state.ship.cargo, []);
  assert.deepEqual(state, original);
});

test('weighted-average basis combines differently priced purchases before partial sale', () => {
  let state = step(createInitialState('mixed'), buy('medicine', 10)).state;
  state = step(state, buy('medicine', 10)).state;
  const basis = state.ship.cargo[0].costBasisPence;
  const result = step(state, sell('medicine', 7));
  assert.equal(result.state.finances.salesCostBasisPence, Math.floor(basis * 7 / 20));
  assert.equal(result.state.ship.cargo[0].costBasisPence + result.state.finances.salesCostBasisPence, basis);
});
