// Pure calculation only. Backend must supply trusted inputs/commands and settle once.
export const COMBAT_VERSION = 1;
export const TICK_SECONDS = 1;
export const MAX_TICKS = 180;
export const MAX_COMMANDS = 8;
const POSTURES = {
  defensive: { accuracy: -8, incoming: -12, interval: 3 },
  balanced: { accuracy: 0, incoming: 0, interval: 2 },
  aggressive: { accuracy: 10, incoming: 10, interval: 1 },
};
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
function integer(n, min, max, name) {
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new TypeError(`Invalid ${name}`);
  return n;
}
function posture(value) {
  if (!Object.hasOwn(POSTURES, value)) throw new TypeError('Invalid posture');
  return value;
}
function ship(input) {
  if (!input || typeof input.id !== 'string' || !input.id.trim() || input.id.length > 80) {
    throw new TypeError('Invalid ship id');
  }
  const limits = { maxHull: [1, 1000], armour: [0, 50], weaponDamage: [0, 100],
    accuracy: [0, 100], ammo: [0, 180], speed: [0, 100], captain: [0, 10],
    engineer: [0, 10], cargoUnits: [0, 1000] };
  const result = { id: input.id };
  for (const [key, [min, max]] of Object.entries(limits)) {
    result[key] = integer(input[key], min, max, key);
  }
  result.hull = integer(input.hull, 1, result.maxHull, 'hull');
  return { ...result, retreating: false, escapeProgress: 0, escaped: false };
}
function emit(state, type, fields = {}) {
  state.events.push({ sequence: state.events.length, tick: state.tick, type, ...fields });
}
function random(state) {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
  return state.rng;
}
function roll(state, bound) { return Math.floor(random(state) / 4294967296 * bound); }

/** Tick 0 is setup; commands for tick N apply before actions at N (1..180).
 * All fields are integer combat units, not currency or authoritative inventory.
 */
export function createBattle(input) {
  if (!input || typeof input.protectCargo !== 'boolean') throw new TypeError('Invalid cargo intent');
  const player = ship(input.player);
  const pirate = ship(input.pirate);
  if (player.id === pirate.id) throw new TypeError('Ship ids must differ');
  const seed = integer(input.seed, 0, 4294967295, 'seed');
  const state = { version: COMBAT_VERSION, seed, tick: 0,
    rng: seed, player, pirate,
    posture: posture(input.posture), protectCargo: input.protectCargo,
    retreatHullPercent: integer(input.retreatHullPercent, 0, 100, 'retreatHullPercent'),
    commandCount: 0, events: [], result: null };
  emit(state, 'approach', { actorId: pirate.id, targetId: player.id });
  return state;
}

function validateCommands(commands) {
  if (!Array.isArray(commands) || commands.length > MAX_COMMANDS) throw new TypeError('Too many commands');
  let last = 0;
  return commands.map(command => {
    if (!command || !['retreat', 'posture'].includes(command.type)) throw new TypeError('Invalid command');
    const tick = integer(command.tick, 1, MAX_TICKS, 'command tick');
    if (tick < last) throw new TypeError('Commands must be ordered by tick');
    last = tick;
    return command.type === 'posture'
      ? { tick, type: command.type, posture: posture(command.posture) }
      : { tick, type: command.type };
  });
}
function retreat(state, vessel, reason) {
  if (vessel.retreating || vessel.hull === 0) return;
  vessel.retreating = true;
  emit(state, 'retreat', { actorId: vessel.id, reason });
}
function attack(state, actor, target, actorPosture, targetPosture, isPlayer) {
  const config = POSTURES[actorPosture];
  if (actor.ammo === 0 || actor.weaponDamage === 0 || state.tick % config.interval !== 0) return null;
  actor.ammo -= 1;
  emit(state, 'weapon', { actorId: actor.id, targetId: target.id, ammoRemaining: actor.ammo });
  const chance = clamp(actor.accuracy + actor.captain + config.accuracy
    + POSTURES[targetPosture].incoming + (target.retreating ? 10 : 0)
    - (isPlayer && state.protectCargo ? 8 : 0), 5, 95);
  if (roll(state, 100) >= chance) {
    emit(state, 'miss', { actorId: actor.id, targetId: target.id });
    return null;
  }
  // Simultaneous salvos: calculate both hits before applying either hull loss.
  const damage = Math.max(1, actor.weaponDamage + roll(state, 7) - 3
    - target.armour - Math.floor(target.engineer / 2));
  const cargoHit = target.cargoUnits > 0 && roll(state, 100) < (!isPlayer && state.protectCargo ? 5 : 20);
  emit(state, 'hit', { actorId: actor.id, targetId: target.id });
  return { actor, target, damage, cargoHit };
}
function finish(state, outcome, reason) {
  emit(state, 'terminal', { outcome, reason });
  state.result = { version: COMBAT_VERSION, seed: state.seed, outcome, reason, tick: state.tick,
    player: structuredClone(state.player), pirate: structuredClone(state.pirate) };
}

/** Returns a new serializable state; never reads wall time, playback speed or DB.
 * commands contains only this next tick's commands, in accepted submission order.
 * Snapshots are resolver-owned; this API is not a client-state trust validator.
 */
export function stepBattle(previous, commands = []) {
  const accepted = validateCommands(commands);
  if (previous.result) {
    if (accepted.length) throw new TypeError('Battle already finished');
    return structuredClone(previous);
  }
  if (previous.commandCount + accepted.length > MAX_COMMANDS
    || accepted.some(command => command.tick !== previous.tick + 1)) {
    throw new TypeError('Commands must apply to the next tick within the battle budget');
  }
  const state = structuredClone(previous);
  state.tick += 1;
  for (const command of accepted) {
    state.commandCount += 1;
    if (command.type === 'posture') {
      state.posture = command.posture;
      emit(state, 'posture', { actorId: state.player.id, posture: command.posture });
    } else retreat(state, state.player, 'command');
  }
  const { player, pirate } = state;
  if (player.hull * 100 <= player.maxHull * state.retreatHullPercent) retreat(state, player, 'hull_threshold');
  if (pirate.hull * 100 <= pirate.maxHull * 25) retreat(state, pirate, 'hull_threshold');
  const shots = [attack(state, player, pirate, state.posture, 'balanced', true),
    attack(state, pirate, player, 'balanced', state.posture, false)].filter(Boolean);
  for (const shot of shots) {
    const damage = Math.min(shot.target.hull, shot.damage);
    shot.target.hull -= damage;
    const cargoLost = shot.cargoHit ? Math.min(shot.target.cargoUnits, Math.max(1, Math.floor(damage / 5))) : 0;
    shot.target.cargoUnits -= cargoLost;
    emit(state, 'damage', { actorId: shot.actor.id, targetId: shot.target.id,
      damage, hullRemaining: shot.target.hull, cargoLost });
  }
  for (const vessel of [player, pirate]) {
    if (vessel.hull === 0) emit(state, 'destroyed', { actorId: vessel.id });
  }
  if (player.hull === 0 || pirate.hull === 0) {
    finish(state, player.hull === 0 ? (pirate.hull === 0 ? 'mutual_destruction' : 'defeat') : 'victory', 'destroyed');
    return state;
  }
  for (const [vessel, pursuer] of [[player, pirate], [pirate, player]]) {
    if (!vessel.retreating) continue;
    vessel.escapeProgress = Math.min(100, vessel.escapeProgress + clamp(8
      + Math.floor((vessel.speed - pursuer.speed) / 10) + vessel.captain
      + (vessel === player && state.protectCargo ? 2 : 0), 2, 18));
    emit(state, 'escape_progress', { actorId: vessel.id, progress: vessel.escapeProgress });
    if (vessel.escapeProgress === 100) {
      vessel.escaped = true;
      emit(state, 'escape', { actorId: vessel.id });
    }
  }
  if (player.escaped || pirate.escaped) {
    finish(state, player.escaped ? (pirate.escaped ? 'both_escaped' : 'escaped') : 'pirate_escaped', 'escape');
  } else if (state.tick === MAX_TICKS) finish(state, 'stalemate', 'time_limit');
  return state;
}

/** Instant/replay entry point. Commands beyond an early terminal tick are unused.
 * For instant from an in-progress battle, continue stepBattle on its current state.
 */
export function resolveBattle(input, commands = []) {
  const schedule = validateCommands(commands);
  let state = createBattle(input);
  while (!state.result) state = stepBattle(state, schedule.filter(c => c.tick === state.tick + 1));
  return state;
}
