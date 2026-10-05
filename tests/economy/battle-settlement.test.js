import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, applyAction, quoteAction, applyBattleProgress,
  applyBattleSettlement } from '../../src/sim/economy/index.js';
const metadata = state => ({ commandId: `c-${state.revision + 1}`, receiptId: `r-${state.revision + 1}`,
  occurredAt: '2026-10-05T18:00:00Z', encounterId: 'encounter-1', seed: 42 });
const step = (state, action) => applyAction(state, action, metadata(state)).state;
const choiceAction = choice => ({ type: 'encounter_choice', encounterId: 'encounter-1', choice });
const advance = { type: 'battle_advance', encounterId: 'encounter-1', ticks: 180 };
function pending(choice = null, hull = 100) {
  let state = createInitialState('battle');
  state.expedition.shipCondition.hull = hull;
  for (const action of [{ type: 'enroll_expedition' }, { type: 'buy', commodityId: 'medicine', quantity: 20 },
    { type: 'travel', destinationId: 'eden' }, { type: 'sell', commodityId: 'medicine', quantity: 20 },
    { type: 'buy', commodityId: 'aurelia', quantity: 20 }, { type: 'travel', destinationId: 'earth' }]) state = step(state, action);
  return choice ? step(state, choiceAction(choice)) : state;
}
// Accepted Combat8b9ba6f terminal shape. Backend verifies the actual resolver/continuation;
// these fixtures exercise Economy's accounting boundary, not Combat's calculation again.
function result(state, outcome, hull, choice = state.expedition.pendingJourney.choice, tick = 20) {
  const initialCargoUnits = state.expedition.pendingJourney.initialCargo.reduce((s, c) => s + c.quantity, 0);
  const lost = outcome === 'boarded' ? Math.ceil(initialCargoUnits / (choice === 'run' ? 4 : 2)) : 0;
  return { version: 1, seed: 42, outcome, reason: outcome === 'boarded' ? 'hull_floor'
    : outcome === 'stalemate' ? 'time_limit' : outcome === 'victory' ? 'destroyed' : 'escape', tick,
    player: { id: state.ship.id, maxHull: 100, hull, cargoUnits: initialCargoUnits - lost, ammo: 10 },
    pirate: { id: 'raider', maxHull: 100, hull: 25, cargoUnits: 0 },
    scenario: { type: 'opening', choice, playerHullFloor: 25, cargoPolicy: 'boarding_only',
      initialCargoUnits, cargoLostUnits: lost, crewSafe: true } };
}
function unchangedReject(state, action, value, code = 'INVALID_REQUEST', extra = {}) {
  const before = structuredClone(state);
  assert.throws(() => applyBattleSettlement(state, action, value, { ...metadata(state), ...extra }), { code });
  assert.deepEqual(state, before);
}

test('nonterminal progress is one zero-cost immutable receipt and retains the exact schedule', () => {
  const state = pending('fight');
  const before = structuredClone(state);
  const acceptedCommands = [{ tick: 1, type: 'posture', posture: 'defensive' }];
  const action = { ...advance, ticks: 1, command: { type: 'posture', posture: 'defensive' } };
  const progressed = applyBattleProgress(state, action, { ...metadata(state), acceptedCommands });
  assert.equal(progressed.state.revision, state.revision + 1);
  assert.equal(progressed.receipt.debitPence, 0);
  assert.equal(progressed.receipt.creditPence, 0);
  assert.equal(progressed.receipt.realizedProfitPence, 0);
  assert.deepEqual(progressed.state.finances, state.finances);
  assert.equal(progressed.state.locationId, 'eden');
  assert.deepEqual(progressed.state.expedition.pendingJourney.commands, acceptedCommands);
  assert.deepEqual(state, before);
  acceptedCommands[0].posture = 'aggressive';
  assert.equal(progressed.state.expedition.pendingJourney.commands[0].posture, 'defensive');
  assert.throws(() => applyBattleProgress(progressed.state, advance,
    { ...metadata(progressed.state), acceptedCommands }), { code: 'STALE_STATE' });
});

test('boarded run/fight settles exactly once with final hull and no additional ammo/boarding fee', () => {
  for (const [choice, lost, basis, remaining, sale, afterRepair] of [
    ['run', 5, 102100, 15, 443700, 2570950],
    ['fight', 10, 204200, 10, 297300, 2418550],
  ]) {
    const state = pending(choice);
    const cash = state.cashPence;
    const expense = state.finances.operatingExpensePence;
    const marketRevision = state.markets[0].revision;
    const verified = result(state, 'boarded', 25);
    const settled = applyBattleSettlement(state, advance, verified, metadata(state));
    assert.equal(settled.state.cashPence, cash);
    assert.equal(settled.state.finances.operatingExpensePence, expense);
    assert.equal(settled.receipt.cargoWriteOffBasisPence, basis);
    assert.equal(settled.receipt.realizedProfitPence, -basis);
    assert.equal(settled.state.ship.cargo[0].quantity, remaining);
    assert.equal(settled.state.ship.cargo[0].costBasisPence, 408400 - basis);
    assert.equal(settled.state.expedition.shipCondition.hull, 25);
    assert.equal(settled.state.locationId, 'earth');
    assert.equal(settled.state.markets[0].revision, marketRevision + 1);
    assert.equal(settled.state.expedition.pendingJourney, null);
    assert.equal(settled.state.finances.travelPence, 60000);
    assert.equal(verified.scenario.cargoLostUnits, lost);
    unchangedReject(settled.state, advance, verified, 'STALE_STATE');
    let repaired = step(settled.state, { type: 'repair', points: 75 });
    assert.equal(quoteAction(repaired, { type: 'sell', commodityId: 'aurelia', quantity: remaining }).creditPence, sale);
    repaired = step(repaired, { type: 'sell', commodityId: 'aurelia', quantity: remaining });
    assert.equal(repaired.cashPence, afterRepair);
    assert.equal(repaired.finances.realizedProfitPence, afterRepair - 2500000);
  }
});

test('all nonboarding opening outcomes retain cargo, including stalemate', () => {
  for (const outcome of ['victory', 'escaped', 'pirate_escaped', 'both_escaped', 'stalemate']) {
    const state = pending('fight');
    const settled = applyBattleSettlement(state, advance, result(state, outcome, 88), metadata(state));
    assert.deepEqual(settled.state.ship.cargo, state.ship.cargo);
    assert.equal(settled.receipt.cargoWriteOffBasisPence, 0);
    assert.equal(settled.state.expedition.shipCondition.hull, 88);
    assert.equal(settled.state.locationId, 'earth');
  }
});

test('verified loss allocates by commodity ID instead of input order and retains penny remainders', () => {
  const state = pending('fight');
  state.ship.cargo = [ { commodityId: 'medicine', quantity: 7, costBasisPence: 701 },
    { commodityId: 'food', quantity: 2, costBasisPence: 53 },
    { commodityId: 'aurelia', quantity: 3, costBasisPence: 101 } ];
  state.expedition.pendingJourney.initialCargo = structuredClone(state.ship.cargo);
  const verified = result(state, 'boarded', 25);
  const settled = applyBattleSettlement(state, advance, verified, metadata(state));
  assert.equal(settled.receipt.cargoWriteOffBasisPence, 254);
  assert.deepEqual(settled.state.ship.cargo, [{ commodityId: 'medicine', quantity: 6, costBasisPence: 601 }]);
  assert.equal(settled.state.finances.salesCostBasisPence, state.finances.salesCostBasisPence);
});

test('tick-zero boarding composes service fee and loss into one choice revision/receipt', () => {
  for (const [choice, fee, lostBasis] of [['run', 6000, 102100], ['fight', 12000, 204200]]) {
    const state = pending(null, 25);
    const action = choiceAction(choice);
    const settled = applyBattleSettlement(state, action, result(state, 'boarded', 25, choice, 0), metadata(state));
    assert.equal(settled.state.revision, state.revision + 1);
    assert.equal(settled.state.receipts.length, state.receipts.length + 1);
    assert.equal(settled.state.cashPence, state.cashPence - fee);
    assert.equal(settled.receipt.operatingExpensePence, fee);
    assert.equal(settled.receipt.cargoWriteOffBasisPence, lostBasis);
    assert.equal(settled.receipt.realizedProfitPence, -fee - lostBasis);
    assert.equal(settled.state.locationId, 'earth');
    assert.deepEqual(settled.receipt.action, action);
    unchangedReject(settled.state, action, result(state, 'boarded', 25, choice, 0), 'STALE_STATE');
  }
});

test('invalid seed/version/scenario/units/player/hull/crew result rejects without mutation', () => {
  const state = pending('fight');
  const mutations = [
    r => { r.seed = 7; }, r => { r.version = 2; }, r => { r.scenario.choice = 'run'; },
    r => { r.scenario.crewSafe = false; }, r => { r.scenario.initialCargoUnits = 21; },
    r => { r.scenario.cargoLostUnits = 11; }, r => { r.player.cargoUnits = 9; },
    r => { r.player.hull = 24; }, r => { r.player.hull = 101; }, r => { r.player.id = 'other'; },
    r => { r.player.maxHull = 101; }, r => { r.outcome = 'defeat'; },
    r => { r.reason = 'destroyed'; }, r => { r.tick = 181; }, r => { r.tick = 0; },
    r => { delete r.scenario; },
  ];
  for (const mutate of mutations) {
    const invalid = result(state, 'boarded', 25);
    mutate(invalid);
    unchangedReject(state, advance, invalid);
  }
  unchangedReject(state, { ...advance, encounterId: 'other' }, result(state, 'boarded', 25), 'STALE_STATE');
  const changedCargo = structuredClone(state);
  changedCargo.ship.cargo[0].costBasisPence -= 1;
  unchangedReject(changedCargo, advance, result(state, 'boarded', 25), 'STALE_STATE');
});

test('battle progress bounds ticks/commands and rejects after settlement', () => {
  const state = pending('run');
  for (const ticks of [0, -1, 181, 1.5]) {
    assert.throws(() => quoteAction(state, { ...advance, ticks }), { code: 'INVALID_REQUEST' });
    assert.throws(() => applyBattleProgress(state, { ...advance, ticks }, metadata(state)), { code: 'INVALID_REQUEST' });
  }
  assert.throws(() => applyBattleProgress(state, { ...advance, command: { type: 'retreat', tick: 1 } }, metadata(state)), { code: 'INVALID_REQUEST' });
  const schedule = Array.from({ length: 9 }, (_, i) => ({ type: 'retreat', tick: i + 1 }));
  assert.throws(() => applyBattleProgress(state, advance, { ...metadata(state), acceptedCommands: schedule }), { code: 'INVALID_REQUEST' });
  const terminal = applyBattleSettlement(state, advance, result(state, 'escaped', 90), metadata(state)).state;
  assert.throws(() => applyBattleProgress(terminal, advance, metadata(terminal)), { code: 'STALE_STATE' });
});

test('below-floor existing ships retain condition, cannot fight/run and can drop then repair', () => {
  const state = pending(null, 20);
  for (const choice of ['run', 'fight']) assert.throws(() => applyAction(state, choiceAction(choice), metadata(state)), { code: 'INVALID_REQUEST' });
  let settled = step(state, { ...choiceAction('drop'), cargoSelection: [{ commodityId: 'aurelia', quantity: 4 }] });
  assert.equal(settled.expedition.shipCondition.hull, 20);
  settled = step(settled, { type: 'repair', points: 80 });
  assert.equal(settled.expedition.shipCondition.hull, 100);
});

test('metadata failure and replaying terminal snapshots do not alter inputs or reroll', () => {
  const state = pending('run');
  const verified = result(state, 'escaped', 90);
  unchangedReject(state, advance, verified, 'INVALID_REQUEST', { commandId: '' });
  const restored = JSON.parse(JSON.stringify(state));
  assert.deepEqual(applyBattleSettlement(state, advance, verified, metadata(state)),
    applyBattleSettlement(restored, advance, JSON.parse(JSON.stringify(verified)), metadata(restored)));
});
