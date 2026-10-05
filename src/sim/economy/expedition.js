import { fail, integer, safe, add, validateState, removeCargo, arrive, finishCommand, allocatedBasis, signed } from './rules.js';

const TYPES = ['enroll_expedition', 'encounter_choice', 'repair', 'buy_upgrade', 'secure_relay', 'battle_advance'];
const STATUS = ['unused', 'pending', 'resolved', 'passed_empty'];
const EXTRA_FINANCES = ['operatingExpensePence', 'cargoWriteOffBasisPence', 'capitalSpendPence'];
export function isExpeditionAction(action) { return TYPES.includes(action?.type); }
export function migrateExpeditionState(state) {
  validateState(state);
  const next = structuredClone(state);
  for (const key of EXTRA_FINANCES) {
    if (next.finances[key] === undefined) next.finances[key] = 0;
    if (!integer(next.finances[key])) fail('INVALID_REQUEST', 'Invalid expedition accounting.');
  }
  if (next.expedition === undefined) next.expedition = {
    version: 1, enrolled: false, firstReturnStatus: 'unused',
    shipCondition: { hull: 100, maxHull: 100 }, pendingJourney: null, upgrades: [],
    relay: { status: 'contested', method: null },
  };
  const e = next.expedition;
  if (!e || e.version !== 1 || typeof e.enrolled !== 'boolean' || !STATUS.includes(e.firstReturnStatus)
    || !integer(e.shipCondition?.hull) || e.shipCondition.hull > 100
    || e.shipCondition.maxHull !== 100 || !Array.isArray(e.upgrades)
    || e.upgrades.some(id => id !== 'cargo-bracing') || new Set(e.upgrades).size !== e.upgrades.length
    || !['contested', 'secured'].includes(e.relay?.status)
    || ![null, 'agreement', 'combat'].includes(e.relay.method)
    || (e.relay.status === 'contested' && e.relay.method !== null)
    || (e.relay.status === 'secured' && e.relay.method === null)
    || next.ship.capacityUnits !== (e.upgrades.includes('cargo-bracing') ? 50 : 40)
    || (e.firstReturnStatus === 'pending') !== Boolean(e.pendingJourney)) {
    fail('INVALID_REQUEST', 'Invalid expedition state.');
  }
  if (e.pendingJourney) {
    const p = e.pendingJourney;
    if (!e.enrolled || next.locationId !== 'eden' || p.from !== 'eden' || p.to !== 'earth'
      || typeof p.encounterId !== 'string' || !p.encounterId || !integer(p.seed) || p.seed > 0xffffffff
      || !integer(p.sourceRevision) || !Array.isArray(p.initialCargo)
      || ![null, 'run', 'fight'].includes(p.choice) || !integer(p.demands?.payPence)
      || !integer(p.demands.dropUnits) || !integer(p.startingHull) || !Array.isArray(p.commands)) {
      fail('INVALID_REQUEST', 'Invalid pending journey.');
    }
  }
  // Migration only supplies absent fields; it does not reset or recompute persisted money/history.
  next.routes = next.routes.map(route => route.from === 'eden' && route.to === 'earth'
    ? { ...route, travelCostPence: returnFare(next) } : route);
  return next;
}
export function returnFare(state) {
  return state.expedition?.relay.status === 'secured' ? 15000 : 25000;
}
function cargoUnits(state) { return state.ship.cargo.reduce((sum, cargo) => sum + cargo.quantity, 0); }
function completed(state) { return ['resolved', 'passed_empty'].includes(state.expedition.firstReturnStatus); }
function afford(state, amount) {
  if (state.cashPence < amount) fail('INSUFFICIENT_CASH', 'Cannot afford this action.');
}
export function beginTravel(next, action, metadata, fare) {
  const e = next.expedition;
  if (next.locationId !== 'eden' || action.destinationId !== 'earth'
    || !e.enrolled || e.firstReturnStatus !== 'unused') {
    arrive(next, action.destinationId);
    return;
  }
  if (cargoUnits(next) === 0) {
    e.firstReturnStatus = 'passed_empty';
    arrive(next, 'earth');
    return;
  }
  if (typeof metadata.encounterId !== 'string' || !metadata.encounterId.trim()
    || !integer(metadata.seed) || metadata.seed > 0xffffffff) {
    fail('INVALID_REQUEST', 'Backend encounter identity and uint32 seed are required.');
  }
  const totalBasis = next.ship.cargo.reduce((sum, cargo) => sum + BigInt(cargo.costBasisPence), 0n);
  e.firstReturnStatus = 'pending';
  e.pendingJourney = {
    encounterId: metadata.encounterId, seed: metadata.seed, sourceRevision: next.revision,
    from: 'eden', to: 'earth', travelCostPence: fare,
    initialCargo: structuredClone(next.ship.cargo), startingHull: e.shipCondition.hull,
    demands: { payPence: safe((totalBasis + 4n) / 5n), dropUnits: Math.ceil(cargoUnits(next) / 5) },
    choice: null, commands: [],
  };
}
function validateSelection(state, selection, requiredUnits) {
  if (!Array.isArray(selection) || selection.length === 0 || selection.length > state.ship.cargo.length) {
    fail('INVALID_REQUEST', 'Choose the exact cargo surrender.');
  }
  let total = 0;
  const seen = new Set();
  for (const row of selection) {
    if (!row || typeof row.commodityId !== 'string' || !integer(row.quantity)
      || row.quantity === 0 || seen.has(row.commodityId)) fail('INVALID_REQUEST', 'Invalid cargo selection.');
    seen.add(row.commodityId);
    total = add(total, row.quantity);
    const cargo = state.ship.cargo.find(c => c.commodityId === row.commodityId);
    if (!cargo || row.quantity > cargo.quantity) fail('INSUFFICIENT_CARGO', 'Selected cargo is not held.');
  }
  if (total !== requiredUnits) fail('INVALID_REQUEST', 'Surrender exactly the demanded units.');
}
function evaluate(state, action) {
  const e = state.expedition;
  if (!isExpeditionAction(action)) fail('INVALID_REQUEST', 'Unknown expedition action.');
  if (e.pendingJourney && !['encounter_choice', 'battle_advance'].includes(action.type)) fail('INVALID_REQUEST', 'Resolve the pending journey first.');
  let debitPence = 0;
  if (action.type === 'enroll_expedition') {
    if (e.enrolled) fail('INVALID_REQUEST', 'Expedition is already enrolled.');
  } else if (action.type === 'encounter_choice') {
    const pending = e.pendingJourney;
    if (!pending || action.encounterId !== pending.encounterId) fail('STALE_STATE', 'Encounter is no longer available.');
    if (pending.choice !== null) fail('STALE_STATE', 'The encounter choice is already committed.');
    if (!['pay', 'drop', 'run', 'fight'].includes(action.choice)) fail('INVALID_REQUEST', 'Unknown encounter choice.');
    if (['run', 'fight'].includes(action.choice) && pending.startingHull < 25) {
      fail('INVALID_REQUEST', 'Below 25 hull, choose pay/drop and repair after arrival.');
    }
    if (action.choice === 'drop') validateSelection(state, action.cargoSelection, pending.demands.dropUnits);
    debitPence = action.choice === 'pay' ? pending.demands.payPence
      : action.choice === 'run' ? 6000 : action.choice === 'fight' ? 12000 : 0;
  } else if (action.type === 'battle_advance') {
    validateBattleAction(state, action);
  } else if (action.type === 'repair') {
    if (!integer(action.points) || action.points === 0 || action.points > 100 - e.shipCondition.hull) {
      fail('INVALID_REQUEST', 'Choose whole missing hull points.');
    }
    debitPence = action.points * 500;
  } else if (action.type === 'buy_upgrade') {
    if (typeof action.upgradeId !== 'string' || Object.hasOwn(action, 'id')) {
      fail('INVALID_REQUEST', 'Use the exact upgradeId field.');
    }
    if (action.upgradeId !== 'cargo-bracing') fail('NOT_FOUND', 'Unknown upgrade.');
    if (!completed(state) || state.locationId !== 'earth' || e.upgrades.includes(action.upgradeId)) {
      fail('INVALID_REQUEST', 'Cargo bracing is not available.');
    }
    debitPence = 150000;
    afford(state, debitPence + 35000);
  } else if (action.type === 'secure_relay') {
    if (action.method !== 'agreement') fail('INVALID_REQUEST', 'Only the relay agreement is available.');
    if (!completed(state) || state.locationId !== 'eden' || e.relay.status !== 'contested') {
      fail('INVALID_REQUEST', 'Relay agreement is not available.');
    }
    const medicine = state.ship.cargo.find(c => c.commodityId === 'medicine');
    if (!medicine || medicine.quantity < 2) fail('INSUFFICIENT_CARGO', 'The agreement needs two Medicine.');
    debitPence = 30000;
  }
  afford(state, debitPence);
  return { debitPence, creditPence: 0 };
}
export function quoteExpeditionAction(state, action) {
  return evaluate(migrateExpeditionState(state), action);
}
// Backend projects these trusted quote disclosures; no separate cost-basis formula.
export function describeExpeditionAction(state, action) {
  state = migrateExpeditionState(state);
  const quote = evaluate(state, action);
  const selection = action.type === 'encounter_choice' && action.choice === 'drop'
    ? action.cargoSelection : action.type === 'secure_relay'
      ? [{ commodityId: 'medicine', quantity: 2 }] : [];
  const cargoRemoved = selection.map(({ commodityId, quantity }) => ({ commodityId, quantity,
    costBasisPence: allocatedBasis(state.ship.cargo.find(c => c.commodityId === commodityId), quantity) }));
  const cargoWriteOffBasisPence = cargoRemoved.reduce((sum, cargo) => add(sum, cargo.costBasisPence), 0);
  const capitalSpendPence = action.type === 'buy_upgrade' ? quote.debitPence : 0;
  const operatingExpensePence = action.type === 'buy_upgrade' ? 0 : quote.debitPence;
  return { ...quote,
    accounting: { operatingExpensePence, cargoWriteOffBasisPence, capitalSpendPence,
      realizedProfitPence: signed(-BigInt(operatingExpensePence) - BigInt(cargoWriteOffBasisPence)) },
    consequences: {
      cargoRemoved,
      hullAfter: state.expedition.shipCondition.hull + (action.type === 'repair' ? action.points : 0),
      capacityAfter: action.type === 'buy_upgrade' ? 50 : state.ship.capacityUnits,
      locationAfter: action.type === 'encounter_choice' && ['pay', 'drop'].includes(action.choice)
        ? 'earth' : state.locationId,
      battleRequired: action.type === 'encounter_choice' && ['run', 'fight'].includes(action.choice),
      ...(action.type === 'encounter_choice' ? { encounterId: action.encounterId } : {}),
      ...(action.type === 'secure_relay' ? { relayStatusAfter: 'secured', futureReturnFarePence: 15000 } : {}),
    },
  };
}
function settleArrival(state) {
  state.expedition.pendingJourney = null;
  state.expedition.firstReturnStatus = 'resolved';
  arrive(state, 'earth');
}
function applyIntent(next, action, quote) {
  const e = next.expedition;
  const changes = {};
  const details = {};
  if (action.type === 'enroll_expedition') {
    e.enrolled = true;
  } else if (action.type === 'encounter_choice') {
    details.encounterId = e.pendingJourney.encounterId;
    changes.operatingExpensePence = quote.debitPence;
    if (action.choice === 'pay') settleArrival(next);
    else if (action.choice === 'drop') {
      changes.cargoWriteOffBasisPence = removeCargo(next, action.cargoSelection);
      settleArrival(next);
    } else {
      // Backend creates and persists the Combat continuation from these frozen inputs.
      // Battle settlement remains gated on Lead's accepted Combat result contract.
      e.pendingJourney.choice = action.choice;
    }
  } else if (action.type === 'repair') {
    e.shipCondition.hull += action.points;
    changes.operatingExpensePence = quote.debitPence;
  } else if (action.type === 'buy_upgrade') {
    e.upgrades.push('cargo-bracing');
    next.ship.capacityUnits = 50;
    changes.capitalSpendPence = quote.debitPence;
  } else if (action.type === 'secure_relay') {
    e.relay = { status: 'secured', method: 'agreement' };
    changes.operatingExpensePence = quote.debitPence;
    changes.cargoWriteOffBasisPence = removeCargo(next, [{ commodityId: 'medicine', quantity: 2 }]);
    next.routes = next.routes.map(route => route.from === 'eden' && route.to === 'earth'
      ? { ...route, travelCostPence: returnFare(next) } : route);
  }
  return { changes, details };
}
export function applyExpeditionAction(state, action, metadata = {}) {
  state = migrateExpeditionState(state);
  if (action?.type === 'battle_advance') fail('INVALID_REQUEST', 'Use a trusted battle continuation helper.');
  const quote = evaluate(state, action);
  const next = structuredClone(state);
  const { changes, details } = applyIntent(next, action, quote);
  return finishCommand(state, next, action, metadata, changes, details);
}

function validateBattleAction(state, action) {
  const pending = state.expedition.pendingJourney;
  if (!pending || action?.type !== 'battle_advance' || action.encounterId !== pending.encounterId
    || !['run', 'fight'].includes(pending.choice)) fail('STALE_STATE', 'No matching active battle.');
  if (!integer(action.ticks) || action.ticks < 1 || action.ticks > 180) fail('INVALID_REQUEST', 'Advance one to 180 ticks.');
  if (action.command !== undefined) {
    const c = action.command;
    if (!c || !['retreat', 'posture'].includes(c.type) || Object.hasOwn(c, 'tick')
      || (c.type === 'posture' && !['defensive', 'balanced', 'aggressive'].includes(c.posture))) {
      fail('INVALID_REQUEST', 'The server stamps bounded next-tick commands.');
    }
  }
  return pending;
}
function projectCommands(next, metadata) {
  if (metadata.acceptedCommands === undefined) return;
  const schedule = metadata.acceptedCommands;
  const existing = next.expedition.pendingJourney.commands;
  if (!Array.isArray(schedule) || schedule.length > 8 || schedule.length < existing.length) {
    fail('INVALID_REQUEST', 'Invalid accepted command schedule.');
  }
  let lastTick = 0;
  const normalized = schedule.map(command => {
    if (!command || !integer(command.tick) || command.tick < 1 || command.tick > 180
      || command.tick < lastTick || !['retreat', 'posture'].includes(command.type)
      || (command.type === 'posture' && !['defensive', 'balanced', 'aggressive'].includes(command.posture))) {
      fail('INVALID_REQUEST', 'Invalid accepted command schedule.');
    }
    lastTick = command.tick;
    return command.type === 'retreat' ? { tick: command.tick, type: 'retreat' }
      : { tick: command.tick, type: 'posture', posture: command.posture };
  });
  if (existing.some((command, i) => JSON.stringify(command) !== JSON.stringify(normalized[i]))) {
    fail('STALE_STATE', 'Previously accepted commands cannot change.');
  }
  next.expedition.pendingJourney.commands = normalized;
}
export function applyBattleProgress(state, action, metadata = {}) {
  state = migrateExpeditionState(state);
  validateBattleAction(state, action);
  const next = structuredClone(state);
  projectCommands(next, metadata);
  return finishCommand(state, next, action, metadata, {}, { encounterId: action.encounterId });
}
function verifiedLoss(state, result) {
  const p = state.expedition.pendingJourney;
  const units = p.initialCargo.reduce((sum, cargo) => add(sum, cargo.quantity), 0);
  const scenario = result?.scenario;
  const outcomes = ['boarded', 'victory', 'escaped', 'pirate_escaped', 'both_escaped', 'stalemate'];
  if (!result || result.version !== 1 || result.seed !== p.seed || !outcomes.includes(result.outcome)
    || !integer(result.tick) || result.tick > 180 || scenario?.type !== 'opening'
    || scenario.choice !== p.choice || scenario.playerHullFloor !== 25
    || scenario.cargoPolicy !== 'boarding_only' || scenario.initialCargoUnits !== units
    || scenario.crewSafe !== true || !integer(scenario.cargoLostUnits)
    || result.player?.id !== state.ship.id || result.player.maxHull !== 100
    || !integer(result.player.hull) || result.player.hull < 25 || result.player.hull > p.startingHull
    || !integer(result.player.cargoUnits)) fail('INVALID_REQUEST', 'Invalid verified opening result.');
  const expectedLoss = result.outcome === 'boarded' ? Math.ceil(units / (p.choice === 'run' ? 4 : 2)) : 0;
  if (scenario.cargoLostUnits !== expectedLoss || result.player.cargoUnits !== units - expectedLoss
    || (result.outcome === 'boarded' && (result.player.hull !== 25 || result.reason !== 'hull_floor'))
    || (result.tick === 0 && (p.startingHull !== 25 || result.outcome !== 'boarded'))) {
    fail('INVALID_REQUEST', 'Opening result contradicts its frozen consequence.');
  }
  const ordered = cargo => [...cargo].sort((a, b) => a.commodityId < b.commodityId ? -1 : a.commodityId > b.commodityId ? 1 : 0);
  if (JSON.stringify(ordered(state.ship.cargo)) !== JSON.stringify(ordered(p.initialCargo))) {
    fail('STALE_STATE', 'Battle cargo differs from the frozen departure.');
  }
  let remaining = expectedLoss;
  return ordered(state.ship.cargo).flatMap(cargo => {
    const quantity = Math.min(cargo.quantity, remaining);
    remaining -= quantity;
    return quantity ? [{ commodityId: cargo.commodityId, quantity }] : [];
  });
}
// Only Backend calls this with a terminal result produced by the frozen Combat module.
// Result shape checks are economic invariants, not proof that arbitrary client JSON is trusted.
export function applyBattleSettlement(state, action, verifiedResult, metadata = {}) {
  state = migrateExpeditionState(state);
  const next = structuredClone(state);
  let changes = {};
  if (action?.type === 'encounter_choice' && ['run', 'fight'].includes(action.choice)) {
    // createBattle may board at tick0. Commit choice fee + result as one command/receipt.
    const quote = evaluate(state, action);
    ({ changes } = applyIntent(next, action, quote));
    if (verifiedResult?.tick !== 0) fail('INVALID_REQUEST', 'Only immediate tick-zero results settle with a choice.');
  } else validateBattleAction(state, action);
  projectCommands(next, metadata);
  const selection = verifiedLoss(next, verifiedResult);
  changes.cargoWriteOffBasisPence = removeCargo(next, selection);
  next.expedition.shipCondition.hull = verifiedResult.player.hull;
  const encounterId = next.expedition.pendingJourney.encounterId;
  settleArrival(next);
  return finishCommand(state, next, action, metadata, changes,
    { encounterId, battleOutcome: verifiedResult.outcome, battleTick: verifiedResult.tick });
}
