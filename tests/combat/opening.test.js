import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, stepBattle, resolveBattle } from '../../src/sim/combat/index.js';

function input(choice = 'fight', cargoUnits = 21) {
  const vessel = { maxHull: 100, hull: 100, armour: 0, weaponDamage: 0,
    accuracy: 100, ammo: 180, speed: 0, captain: 0, engineer: 0, cargoUnits };
  return { seed: 2, player: { ...vessel, id: 'horizon' },
    pirate: { ...vessel, id: 'raider', weaponDamage: 100, speed: 100, cargoUnits: 0 },
    posture: 'balanced', protectCargo: false, retreatHullPercent: 0,
    scenario: { type: 'opening', choice, playerHullFloor: 25, cargoPolicy: 'boarding_only' } };
}
function playback(data, batch) {
  let state = createBattle(data);
  while (!state.result) {
    for (let i = 0; i < batch && !state.result; i++) state = stepBattle(state);
    state = JSON.parse(JSON.stringify(state));
  }
  return state;
}

test('opening lethal shot boards at hull25; losses use ceil(initial cargo /4 run or /2 fight) once', () => {
  for (const [choice, expectedLoss] of [['run', 6], ['fight', 11]]) {
    const data = input(choice);
    const state = resolveBattle(data);
    assert.equal(state.result.outcome, 'boarded');
    assert.equal(state.result.reason, 'hull_floor');
    assert.equal(state.player.hull, 25);
    assert.equal(state.player.cargoUnits, 21 - expectedLoss);
    assert.deepEqual(state.result.scenario, { ...data.scenario, initialCargoUnits: 21,
      cargoLostUnits: expectedLoss, crewSafe: true });
    assert.equal(state.events.filter(e => e.type === 'boarding').length, 1);
    assert.equal(state.events.find(e => e.type === 'boarding').cargoLost, expectedLoss);
    assert(!state.events.some(e => e.type === 'destroyed' && e.actorId === 'horizon'));
    assert(state.events.filter(e => e.type === 'damage').every(e => e.cargoLost === 0));
    for (const batch of [1, 2, 5, 180]) assert.deepEqual(playback(data, batch), state);
    const saved = JSON.parse(JSON.stringify(state));
    for (let i = 0; i < 3; i++) assert.deepEqual(stepBattle(saved), state);
    assert.throws(() => stepBattle(saved, [{ tick: saved.tick + 1, type: 'retreat' }]), /finished/);
  }
});

test('run begins retreat at setup; escape and victory retain all opening cargo', () => {
  const run = input('run');
  run.pirate.weaponDamage = 0;
  assert.equal(createBattle(run).player.retreating, true);
  const escaped = resolveBattle(run);
  assert.equal(escaped.result.outcome, 'escaped');
  assert.equal(escaped.player.cargoUnits, 21);
  assert.equal(escaped.result.scenario.cargoLostUnits, 0);
  const fight = input();
  fight.player.weaponDamage = 100;
  fight.pirate.hull = 1;
  fight.pirate.weaponDamage = 0;
  const won = resolveBattle(fight);
  assert.equal(won.result.outcome, 'victory');
  assert.equal(won.player.cargoUnits, 21);
  assert.equal(won.result.scenario.cargoLostUnits, 0);
});

test('opening weapon salvos are hull-only for both vessels, distinct from generic cargo hits', () => {
  const data = input();
  data.player.weaponDamage = 0;
  data.pirate.weaponDamage = 20;
  const next = value => stepBattle(stepBattle(createBattle(value)));
  const opening = next(data);
  assert.equal(opening.player.hull, 80);
  assert.equal(opening.player.cargoUnits, 21);
  const generic = next({ ...data, scenario: undefined });
  assert.equal(generic.player.hull, 80);
  assert.equal(generic.player.cargoUnits, 17);
});

test('floor snapshots board at tick0 without damage mutation; empty and tiny cargo stay bounded', () => {
  for (const cargo of [0, 1, 2, 20, 1000]) {
    const data = input('fight', cargo);
    data.player.hull = 25;
    const before = structuredClone(data);
    const state = resolveBattle(data);
    assert.equal(state.tick, 0);
    assert.equal(state.player.hull, 25);
    assert.equal(state.player.cargoUnits, cargo - Math.ceil(cargo / 2));
    assert.deepEqual(data, before);
    assert.deepEqual(stepBattle(state), state);
    assert.equal(state.events.filter(e => e.type === 'boarding').length, 1);
  }
});

test('opening scenario rejects unsafe or unapproved config and pre-floor ships', () => {
  const base = input();
  for (const scenario of [{ ...base.scenario, type: 'relay' }, { ...base.scenario, choice: 'pay' },
    { ...base.scenario, playerHullFloor: 0 }, { ...base.scenario, playerHullFloor: 26 },
    { ...base.scenario, cargoPolicy: 'weapon_damage' }]) {
    assert.throws(() => createBattle({ ...base, scenario }), /Invalid opening/);
  }
  assert.throws(() => createBattle({ ...base, player: { ...base.player, hull: 24 } }), /Invalid opening/);
  assert.throws(() => createBattle({ ...base, player: { ...base.player, maxHull: 200 } }), /Invalid opening/);
});

test('simultaneous pirate destruction wins over boarding, with protected hull and no cargo loss', () => {
  const data = input();
  data.player.weaponDamage = 100;
  data.pirate.hull = 1;
  const state = resolveBattle(data);
  assert.equal(state.result.outcome, 'victory');
  assert.equal(state.player.hull, 25);
  assert.equal(state.player.cargoUnits, 21);
  assert.equal(state.result.scenario.cargoLostUnits, 0);
  assert(!state.events.some(e => e.type === 'boarding'));
});

test('opening tick commands and partial JSON resume preserve exact seeded results and bounded player hull', () => {
  const commands = [{ tick: 1, type: 'posture', posture: 'aggressive' }, { tick: 3, type: 'retreat' }];
  for (let seed = 0; seed < 12; seed++) {
    const data = input();
    data.seed = seed;
    data.pirate.weaponDamage = 12;
    const expected = resolveBattle(data, commands);
    let state = createBattle(data);
    while (!state.result) {
      state = stepBattle(state, commands.filter(c => c.tick === state.tick + 1));
      state = JSON.parse(JSON.stringify(state));
      assert(state.player.hull >= 25);
    }
    assert.deepEqual(state, expected);
    assert(state.events.filter(e => e.type === 'boarding').length <= 1);
    assert.equal(state.result.scenario.cargoLostUnits, 21 - state.player.cargoUnits);
  }
});
