import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, stepBattle, resolveBattle, MAX_TICKS } from '../../src/sim/combat/index.js';

function input(seed = 42) {
  const ship = { maxHull: 100, hull: 100, armour: 3, weaponDamage: 9, accuracy: 65,
    ammo: 60, speed: 50, captain: 2, engineer: 2, cargoUnits: 20 };
  return { seed, player: { ...ship, id: 'horizon' }, pirate: { ...ship, id: 'raider', cargoUnits: 0 },
    posture: 'balanced', protectCargo: true, retreatHullPercent: 40 };
}
const schedule = [{ tick: 4, type: 'posture', posture: 'aggressive' }, { tick: 8, type: 'retreat' }];
function playback(data, commands, batch, resumeAt = 0) {
  let state = createBattle(data);
  while (!state.result) {
    for (let n = 0; n < batch && !state.result; n++) {
      state = stepBattle(state, commands.filter(c => c.tick === state.tick + 1));
      if (state.tick === resumeAt) state = JSON.parse(JSON.stringify(state));
    }
  }
  return state;
}
function frozen(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}

test('same seed and commands reproduce complete event stream and result across playback batches and instant', () => {
  const expected = resolveBattle(frozen(input()), frozen(schedule));
  for (const batch of [1, 2, 5, 180]) assert.deepEqual(playback(input(), schedule, batch), expected);
  assert.deepEqual(playback(input(), schedule, 5, 6), expected);
  const varied = resolveBattle(input(43), schedule);
  assert.notDeepEqual(varied.events, expected.events);
});

test('commands apply exactly before next tick actions, ordered and bounded; late commands cannot rewrite history', () => {
  const data = input();
  data.player.weaponDamage = data.pirate.weaponDamage = 0;
  let state = createBattle(data);
  const original = structuredClone(state);
  assert.throws(() => stepBattle(state, [{ tick: 2, type: 'retreat' }]), /next tick/);
  assert.deepEqual(state, original);
  state = stepBattle(frozen(state), [{ tick: 1, type: 'posture', posture: 'aggressive' },
    { tick: 1, type: 'posture', posture: 'defensive' }]);
  assert.equal(state.posture, 'defensive');
  assert.deepEqual(state.events.filter(e => e.type === 'posture').map(e => e.posture), ['aggressive', 'defensive']);
  assert.throws(() => stepBattle(state, [{ tick: 1, type: 'retreat' }]), /next tick/);
  for (let i = 0; i < 6; i++) state = stepBattle(state, [{ tick: state.tick + 1, type: 'posture', posture: 'balanced' }]);
  assert.throws(() => stepBattle(state, [{ tick: state.tick + 1, type: 'retreat' }]), /budget/);
  assert.throws(() => resolveBattle(data, [{ tick: 2, type: 'retreat' }, { tick: 1, type: 'retreat' }]), /ordered/);
  const result = resolveBattle(data, schedule);
  assert.equal(result.events.find(e => e.type === 'retreat').tick, 8);
  assert.equal(result.events.find(e => e.type === 'escape_progress').tick, 8);
  assert(result.events.find(e => e.type === 'posture').sequence < result.events.find(e => e.type === 'retreat').sequence);
});

test('retreat threshold is remaining hull percentage and escape is a vulnerable multi-tick process', () => {
  const data = input();
  data.player.hull = 40;
  data.player.weaponDamage = data.pirate.weaponDamage = 0;
  const state = resolveBattle(data);
  assert.equal(state.result.outcome, 'escaped');
  assert.equal(state.events.find(e => e.type === 'retreat').tick, 1);
  assert(state.result.tick > 1);
  assert.equal(state.player.escapeProgress, 100);
  const fighting = input();
  fighting.retreatHullPercent = 0;
  const retreat = resolveBattle(fighting, [{ tick: 1, type: 'retreat' }]);
  assert(retreat.events.some(e => e.type === 'weapon' && e.actorId === 'raider'));
});

test('simultaneous lethal salvos allow mutual destruction and terminal states cannot advance or accept commands', () => {
  const data = input(1);
  data.protectCargo = false;
  data.retreatHullPercent = 0;
  for (const vessel of [data.player, data.pirate]) {
    Object.assign(vessel, { maxHull: 1, hull: 1, armour: 0, engineer: 0,
      weaponDamage: 100, accuracy: 100 });
  }
  const state = resolveBattle(data);
  assert.equal(state.result.outcome, 'mutual_destruction');
  assert.equal(state.result.tick, 2);
  assert.equal(state.events.filter(e => e.type === 'destroyed').length, 2);
  assert.deepEqual(stepBattle(frozen(state)), state);
  assert.throws(() => stepBattle(state, [{ tick: 3, type: 'retreat' }]), /finished/);
});

test('zero firepower/ammo terminates at cap, ammo never goes negative, event sequence is contiguous', () => {
  const data = input();
  data.retreatHullPercent = 0;
  data.player.ammo = data.pirate.ammo = 0;
  const state = resolveBattle(data);
  assert.equal(state.result.tick, MAX_TICKS);
  assert.equal(state.result.outcome, 'stalemate');
  assert(!state.events.some(e => e.type === 'weapon'));
  const armed = input();
  armed.player.ammo = armed.pirate.ammo = 1;
  const limited = resolveBattle(armed);
  assert.equal(limited.events.filter(e => e.type === 'weapon').length, 2);
  assert(limited.player.ammo >= 0 && limited.pirate.ammo >= 0);
  assert.deepEqual(limited.events.map(e => e.sequence), limited.events.map((_, i) => i));
});

test('all three postures change fire rate; armour/crew mitigation and cargo protection have actual effects', () => {
  const base = input();
  base.retreatHullPercent = 0;
  base.player.maxHull = base.player.hull = base.pirate.maxHull = base.pirate.hull = 1000;
  const states = ['defensive', 'balanced', 'aggressive'].map(posture => resolveBattle({ ...base, posture }));
  const fired = states.map(s => s.events.filter(e => e.type === 'weapon' && e.actorId === 'horizon').length);
  // Full 180 ticks can exhaust ammo, so compare early volleys instead.
  const early = states.map(s => s.events.filter(e => e.type === 'weapon' && e.actorId === 'horizon' && e.tick <= 12).length);
  assert.deepEqual(early, [4, 6, 12]);
  assert(fired.every(n => n <= 60));
  const unprotected = resolveBattle({ ...base, protectCargo: false });
  assert.notDeepEqual(unprotected.events, states[1].events);
  const hard = input();
  hard.player.armour = 50;
  hard.player.engineer = 10;
  const softened = resolveBattle(hard);
  assert(softened.events.filter(e => e.type === 'damage' && e.targetId === 'horizon').every(e => e.damage === 1));
});

test('invalid snapshots/seeds/tactics/commands are rejected and input remains unchanged', () => {
  const base = frozen(input());
  for (const change of [{ seed: -1 }, { seed: 4294967296 }, { seed: 1.5 }, { posture: 'all-in' },
    { protectCargo: 'yes' }, { retreatHullPercent: 101 }, { pirate: base.player },
    { player: { ...base.player, hull: 0 } }, { player: { ...base.player, ammo: 181 } }]) {
    assert.throws(() => createBattle({ ...base, ...change }), TypeError);
  }
  for (const commands of [[{ tick: 0, type: 'retreat' }], [{ tick: 181, type: 'retreat' }],
    [{ tick: 1, type: 'shoot' }], [{ tick: 1, type: 'posture', posture: 'all-in' }],
    Array.from({ length: 9 }, () => ({ tick: 1, type: 'retreat' }))]) {
    assert.throws(() => resolveBattle(base, commands), TypeError);
  }
  const state = createBattle(base);
  const before = structuredClone(state);
  stepBattle(frozen(state));
  assert.deepEqual(state, before);
  assert.equal(base.player.ammo, 60);
});

test('bounded seed sweep preserves hull/ammo/cargo, one terminal event and playback equality', () => {
  for (let seed = 0; seed < 40; seed++) {
    const data = input(seed);
    data.posture = ['defensive', 'balanced', 'aggressive'][seed % 3];
    const state = resolveBattle(data, schedule);
    assert.deepEqual(playback(data, schedule, 5), state);
    assert(state.tick <= MAX_TICKS);
    assert.equal(state.events.filter(e => e.type === 'terminal').length, 1);
    for (const side of ['player', 'pirate']) {
      assert(state[side].hull >= 0 && state[side].hull <= data[side].hull);
      assert(state[side].ammo >= 0 && state[side].ammo <= data[side].ammo);
      assert(state[side].cargoUnits >= 0 && state[side].cargoUnits <= data[side].cargoUnits);
    }
  }
});

test('instant from a partially watched state preserves consumed ammo, accepted commands and RNG', () => {
  let state = createBattle(input());
  while (state.tick < 6) state = stepBattle(state, schedule.filter(c => c.tick === state.tick + 1));
  const acceptedCount = state.commandCount;
  state = JSON.parse(JSON.stringify(state));
  while (!state.result) state = stepBattle(state, schedule.filter(c => c.tick === state.tick + 1));
  assert.equal(acceptedCount, 1);
  assert.equal(state.commandCount, 2);
  assert.deepEqual(state, resolveBattle(input(), schedule));
});

test('golden salvo locks RNG/action order and damage to explicit bounded integer cargo units', () => {
  const data = input(2);
  data.protectCargo = false;
  data.retreatHullPercent = 0;
  Object.assign(data.player, { weaponDamage: 0, armour: 0, engineer: 0 });
  Object.assign(data.pirate, { weaponDamage: 20, captain: 0, accuracy: 100 });
  const next = source => stepBattle(stepBattle(createBattle(source)));
  const exposed = next(data);
  assert.deepEqual(exposed.events, [
    { sequence: 0, tick: 0, type: 'approach', actorId: 'raider', targetId: 'horizon' },
    { sequence: 1, tick: 2, type: 'weapon', actorId: 'raider', targetId: 'horizon', ammoRemaining: 59 },
    { sequence: 2, tick: 2, type: 'hit', actorId: 'raider', targetId: 'horizon' },
    { sequence: 3, tick: 2, type: 'damage', actorId: 'raider', targetId: 'horizon',
      damage: 20, hullRemaining: 80, cargoLost: 4 },
  ]);
  assert.equal(exposed.player.cargoUnits, 16);
  const protectedState = next({ ...data, protectCargo: true });
  assert.equal(protectedState.player.hull, 80);
  assert.equal(protectedState.player.cargoUnits, 20);
  const tiny = next({ ...data, player: { ...data.player, cargoUnits: 1 } });
  assert.equal(tiny.player.cargoUnits, 0);
  assert.equal(tiny.events.at(-1).cargoLost, 1);
});

test('victory/defeat and pirate escape stay distinct; lethal damage takes precedence over escape', () => {
  const base = input(1);
  base.protectCargo = false;
  base.retreatHullPercent = 0;
  const weak = { maxHull: 1, hull: 1, weaponDamage: 0, armour: 0, engineer: 0 };
  const strong = { accuracy: 100, weaponDamage: 100 };
  const victory = resolveBattle({ ...base, player: { ...base.player, ...strong }, pirate: { ...base.pirate, ...weak } });
  assert.equal(victory.result.outcome, 'victory');
  const defeat = resolveBattle({ ...base, pirate: { ...base.pirate, ...strong }, player: { ...base.player, ...weak } });
  assert.equal(defeat.result.outcome, 'defeat');
  const pirateEscape = resolveBattle({ ...base, player: { ...base.player, weaponDamage: 0 },
    pirate: { ...base.pirate, hull: 25, weaponDamage: 0 } });
  assert.equal(pirateEscape.result.outcome, 'pirate_escaped');
  let close = createBattle({ ...base, player: { ...base.player, ...weak }, pirate: { ...base.pirate, ...strong } });
  close = stepBattle(close, [{ tick: 1, type: 'retreat' }]);
  // Trusted snapshot at the brink of escape; tick2 lethal salvo must win over escape advancement.
  close.player.escapeProgress = 99;
  close = stepBattle(close);
  assert.equal(close.result.outcome, 'defeat');
  assert.equal(close.player.escaped, false);
  assert(!close.events.some(e => e.type === 'escape'));
});
