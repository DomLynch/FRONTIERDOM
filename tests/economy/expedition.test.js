import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, applyAction, quoteAction } from '../../src/sim/economy/index.js';
const act = (state, action, extra = {}) => applyAction(state, action, {
  commandId: `c-${state.revision + 1}`, receiptId: `r-${state.revision + 1}`,
  occurredAt: '2026-10-05T17:30:00.000Z', encounterId: 'encounter-1', seed: 42, ...extra,
});
const buy = (commodityId, quantity) => ({ type: 'buy', commodityId, quantity });
const sell = (commodityId, quantity) => ({ type: 'sell', commodityId, quantity });
const travel = destinationId => ({ type: 'travel', destinationId });
function ready() {
  let state = createInitialState('expedition');
  for (const action of [{ type: 'enroll_expedition' }, buy('medicine', 20), travel('eden'),
    sell('medicine', 20), buy('aurelia', 20), travel('earth')]) state = act(state, action).state;
  return state;
}
function choose(state, choice, cargoSelection) {
  return { type: 'encounter_choice', encounterId: state.expedition.pendingJourney.encounterId,
    choice, ...(cargoSelection ? { cargoSelection } : {}) };
}
function rejects(state, action, code) {
  const before = structuredClone(state);
  assert.throws(() => quoteAction(state, action), { code });
  assert.throws(() => act(state, action), { code });
  assert.deepEqual(state, before);
}

test('first paid return remains Eden without replenishment until pay settlement', () => {
  let state = ready();
  assert.equal(state.locationId, 'eden');
  assert.equal(state.cashPence, 2170750);
  assert.equal(state.expedition.firstReturnStatus, 'pending');
  assert.equal(state.markets[0].commodities.find(c => c.id === 'medicine').stockUnits, 60);
  assert.equal(state.expedition.pendingJourney.seed, 42);
  const result = act(state, choose(state, 'pay'));
  assert.equal(result.receipt.debitPence, 81680);
  assert.equal(result.receipt.operatingExpensePence, 81680);
  state = act(result.state, sell('aurelia', 20)).state;
  assert.equal(state.cashPence, 2677670);
  assert.equal(state.finances.realizedProfitPence, 177670);
  assert.equal(state.finances.travelPence, 60000);
  assert.equal(state.expedition.firstReturnStatus, 'resolved');
  assert.equal(state.expedition.pendingJourney, null);
});

test('drop consumes actual selected basis, has no sale credit and arrives with zero extra cash cost', () => {
  let state = ready();
  const result = act(state, choose(state, 'drop', [{ commodityId: 'aurelia', quantity: 4 }]));
  assert.equal(result.receipt.debitPence, 0);
  assert.equal(result.receipt.cargoWriteOffBasisPence, 81680);
  assert.deepEqual(result.state.ship.cargo, [{ commodityId: 'aurelia', quantity: 16, costBasisPence: 326720 }]);
  state = act(result.state, sell('aurelia', 16)).state;
  assert.equal(state.cashPence, 2643550);
  assert.equal(state.finances.realizedProfitPence, 143550);
  assert.equal(state.finances.salesCostBasisPence + state.finances.cargoWriteOffBasisPence, 612600);
});

test('pending journey blocks ordinary commands and duplicate or stale choices without mutation', () => {
  const state = ready();
  for (const action of [buy('food', 1), sell('aurelia', 1), travel('earth'), { type: 'repair', points: 1 },
    { type: 'buy_upgrade', id: 'cargo-bracing' }, { type: 'secure_relay', method: 'agreement' },
    { type: 'enroll_expedition' }]) rejects(state, action, 'INVALID_REQUEST');
  rejects(state, { ...choose(state, 'pay'), encounterId: 'other' }, 'STALE_STATE');
  rejects(state, choose(state, 'drop', [{ commodityId: 'aurelia', quantity: 3 }]), 'INVALID_REQUEST');
  const resolved = act(state, choose(state, 'pay')).state;
  rejects(resolved, choose(state, 'pay'), 'STALE_STATE');
});

test('legacy migration and enrollment preserve exact funds, basis, revisions and receipts', async () => {
  const { migrateExpeditionState } = await import('../../src/sim/economy/expedition.js');
  const state = act(createInitialState('legacy'), buy('medicine', 3)).state;
  delete state.expedition;
  for (const field of ['operatingExpensePence', 'cargoWriteOffBasisPence', 'capitalSpendPence']) delete state.finances[field];
  const before = structuredClone(state);
  const migrated = migrateExpeditionState(state);
  assert.deepEqual(state, before);
  for (const field of ['cashPence', 'revision', 'ship', 'markets', 'receipts']) assert.deepEqual(migrated[field], before[field]);
  const result = act(state, { type: 'enroll_expedition' });
  assert.equal(result.state.cashPence, before.cashPence);
  assert.deepEqual(result.state.ship, before.ship);
  assert.deepEqual(result.state.markets, before.markets);
  assert.equal(result.receipt.realizedProfitPence, 0);
  assert.equal(result.state.expedition.enrolled, true);
  rejects(result.state, { type: 'enroll_expedition' }, 'INVALID_REQUEST');
});

test('zero-cash drop completes prepaid arrival while paid choices reject', () => {
  const state = ready();
  state.cashPence = 0;
  for (const choice of ['pay', 'run', 'fight']) rejects(state, choose(state, choice), 'INSUFFICIENT_CASH');
  const result = act(state, choose(state, 'drop', [{ commodityId: 'aurelia', quantity: 4 }]));
  assert.equal(result.state.cashPence, 0);
  assert.equal(result.state.locationId, 'earth');
  assert.equal(result.state.expedition.firstReturnStatus, 'resolved');
});

test('empty first return pays once, passes without seed and never retriggers', () => {
  let state = createInitialState('empty');
  state = act(state, { type: 'enroll_expedition' }).state;
  state = act(state, travel('eden')).state;
  state = act(state, travel('earth'), { seed: undefined, encounterId: undefined }).state;
  assert.equal(state.cashPence, 2440000);
  assert.equal(state.expedition.firstReturnStatus, 'passed_empty');
  assert.equal(state.expedition.pendingJourney, null);
  state = act(state, buy('food', 2)).state;
  state = act(state, travel('eden')).state;
  state = act(state, travel('earth')).state;
  assert.equal(state.locationId, 'earth');
  assert.equal(state.expedition.pendingJourney, null);
});

test('missing trusted seed rejects nonempty enrolled return without charging', () => {
  let state = createInitialState('seed');
  for (const action of [{ type: 'enroll_expedition' }, buy('food', 2), travel('eden')]) state = act(state, action).state;
  const before = structuredClone(state);
  for (const seed of [undefined, -1, 0x100000000, 1.5]) {
    assert.throws(() => act(state, travel('earth'), { seed }), { code: 'INVALID_REQUEST' });
    assert.deepEqual(state, before);
  }
});

test('run/fight fees commit once and block a second choice until accepted Combat settlement', () => {
  for (const [choice, fee] of [['run', 6000], ['fight', 12000]]) {
    const state = ready();
    const result = act(state, choose(state, choice));
    assert.equal(result.state.cashPence, state.cashPence - fee);
    assert.equal(result.state.finances.operatingExpensePence, fee);
    assert.equal(result.state.expedition.pendingJourney.choice, choice);
    assert.deepEqual(result.state.ship.cargo, state.ship.cargo);
    assert.equal(result.state.locationId, 'eden');
    rejects(result.state, choose(state, choice), 'STALE_STATE');
    rejects(result.state, { type: 'battle_advance', ticks: 180 }, 'INVALID_REQUEST');
  }
});

test('drop validates mixed commodity quantities and accounts exact acquisition remainder', () => {
  let state = createInitialState('mixed-drop');
  for (const action of [{ type: 'enroll_expedition' }, buy('medicine', 3), buy('food', 7), travel('eden'), travel('earth')]) {
    state = act(state, action).state;
  }
  const medicine = state.ship.cargo.find(c => c.commodityId === 'medicine');
  const food = state.ship.cargo.find(c => c.commodityId === 'food');
  const expected = Number(BigInt(medicine.costBasisPence) / 3n + BigInt(food.costBasisPence) / 7n);
  rejects(state, choose(state, 'drop', [{ commodityId: 'food', quantity: 1 }, { commodityId: 'food', quantity: 1 }]), 'INVALID_REQUEST');
  rejects(state, choose(state, 'drop', [{ commodityId: 'unknown', quantity: 2 }]), 'INSUFFICIENT_CARGO');
  const result = act(state, choose(state, 'drop', [{ commodityId: 'medicine', quantity: 1 }, { commodityId: 'food', quantity: 1 }]));
  assert.equal(result.receipt.cargoWriteOffBasisPence, expected);
  assert.equal(result.state.finances.cargoWriteOffBasisPence, expected);
  assert.equal(result.state.finances.salesPence, 0);
});

test('repair spends exact quoted cost and rejects missing, fractional and excessive points', () => {
  let state = act(ready(), choose(ready(), 'pay')).state;
  state.expedition.shipCondition.hull = 72;
  assert.deepEqual(quoteAction(state, { type: 'repair', points: 28 }), { debitPence: 14000, creditPence: 0 });
  for (const points of [0, -1, 1.5, 29]) rejects(state, { type: 'repair', points }, 'INVALID_REQUEST');
  const result = act(state, { type: 'repair', points: 28 });
  assert.equal(result.state.expedition.shipCondition.hull, 100);
  assert.equal(result.receipt.realizedProfitPence, -14000);
  assert.equal(result.state.finances.operatingExpensePence, 95680);
  rejects(result.state, { type: 'repair', points: 1 }, 'INVALID_REQUEST');
});

test('cargo bracing is capital spend, requires reserve and allows actual 50-unit trade capacity', () => {
  let state = ready();
  state = act(state, choose(state, 'pay')).state;
  state = act(state, sell('aurelia', 20)).state;
  const profit = state.finances.realizedProfitPence;
  const result = act(state, { type: 'buy_upgrade', id: 'cargo-bracing' });
  assert.equal(result.state.cashPence, 2527670);
  assert.equal(result.state.ship.capacityUnits, 50);
  assert.equal(result.state.finances.realizedProfitPence, profit);
  assert.equal(result.state.finances.capitalSpendPence, 150000);
  assert.equal(result.receipt.realizedProfitPence, 0);
  state = act(result.state, buy('medicine', 50)).state;
  assert.equal(state.ship.cargo[0].quantity, 50);
  rejects(state, buy('food', 1), 'CAPACITY_EXCEEDED');
  rejects(state, { type: 'buy_upgrade', id: 'cargo-bracing' }, 'INVALID_REQUEST');
  const poor = result.state;
  poor.expedition.upgrades = [];
  poor.ship.capacityUnits = 40;
  poor.cashPence = 184999;
  rejects(poor, { type: 'buy_upgrade', id: 'cargo-bracing' }, 'INSUFFICIENT_CASH');
});

test('relay agreement consumes two actual Medicine basis once and discounts only future returns', () => {
  let state = ready();
  state = act(state, choose(state, 'pay')).state;
  state = act(state, sell('aurelia', 20)).state;
  state = act(state, buy('medicine', 2)).state;
  assert.equal(state.ship.cargo[0].costBasisPence, 20060);
  state = act(state, travel('eden')).state;
  const before = structuredClone(state);
  const result = act(state, { type: 'secure_relay', method: 'agreement' });
  assert.deepEqual(result.state.expedition.relay, { status: 'secured', method: 'agreement' });
  assert.equal(result.receipt.debitPence, 30000);
  assert.equal(result.receipt.cargoWriteOffBasisPence, 20060);
  assert.equal(result.receipt.realizedProfitPence, -50060);
  assert.equal(result.state.finances.travelPence, before.finances.travelPence);
  assert.deepEqual(quoteAction(result.state, travel('earth')), { debitPence: 15000, creditPence: 0 });
  assert.equal(result.state.routes.find(r => r.from === 'eden').travelCostPence, 15000);
  rejects(result.state, { type: 'secure_relay', method: 'agreement' }, 'INVALID_REQUEST');
  rejects(result.state, { type: 'secure_relay', method: 'combat' }, 'INVALID_REQUEST');
  const earth = act(result.state, travel('earth')).state;
  assert.deepEqual(quoteAction(earth, travel('eden')), { debitPence: 35000, creditPence: 0 });
});

test('legacy stranded empty company remains honestly blocked and gains no rescue/reset action', () => {
  let state = createInitialState('stranded');
  state.locationId = 'eden';
  state.cashPence = 100;
  state = act(state, { type: 'enroll_expedition' }).state;
  rejects(state, travel('earth'), 'INSUFFICIENT_CASH');
  rejects(state, { type: 'recoverHome' }, 'INVALID_REQUEST');
});

test('JSON resume retains original seed, demand and choice; frozen input is never mutated', () => {
  const state = ready();
  const snapshot = JSON.parse(JSON.stringify(state));
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  freeze(state);
  assert.deepEqual(act(state, choose(state, 'pay')), act(snapshot, choose(snapshot, 'pay')));
  assert.equal(state.expedition.pendingJourney.choice, null);
  assert.equal(state.expedition.pendingJourney.demands.payPence, 81680);
});
