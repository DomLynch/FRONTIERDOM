# Combat v1 integration proposal

Base: `77948cca638e45bfedf3163281b58c477873e8e3`. Lead accepts the shared interface;
this module owns calculations only. No engine, database, currency, encounter
generation, reward application, commodity allocation or persistent state writes.

## API

`createBattle(input)` returns tick-0 serializable state.
`stepBattle(state, commands = [])` returns a new state after one simulation tick.
`resolveBattle(input, orderedCommands = [])` runs the same stepper to termination.
Exports: `COMBAT_VERSION = 1`, `TICK_SECONDS = 1`, `MAX_TICKS = 180`, `MAX_COMMANDS = 8`.

```js
const input = {
  seed: 42, posture: 'balanced', protectCargo: true, retreatHullPercent: 40,
  player: { id: 'horizon', maxHull: 100, hull: 100, armour: 3,
    weaponDamage: 9, accuracy: 65, ammo: 60, speed: 50,
    captain: 2, engineer: 2, cargoUnits: 20 },
  pirate: { id: 'raider', maxHull: 100, hull: 100, armour: 3,
    weaponDamage: 9, accuracy: 65, ammo: 60, speed: 50,
    captain: 2, engineer: 2, cargoUnits: 0 },
};
const commands = [
  { tick: 4, type: 'posture', posture: 'aggressive' },
  { tick: 8, type: 'retreat' },
];
```

Seed: uint32, including zero. Ship IDs: distinct nonempty strings, max80 chars.
All numeric stats are integers: maxHull1–1000; hull1–maxHull; armour0–50;
weaponDamage0–100; accuracy/speed0–100; ammo0–180; captain/engineer0–10;
cargoUnits0–1000. No defaults silently manufacture missing authoritative stats.
Posture: defensive/balanced/aggressive. Cargo intent: boolean. Retreat threshold:
0–100 **remaining hull percentage**, with0 disabling automatic player retreat.
E.g. retreat after40% damage means threshold60. Pirates retreat at25% remaining.

Commands apply before actions at ticks1–180, max8 accepted commands total.
`stepBattle` accepts only commands for its next tick; same-tick commands retain
submission order (last posture wins). Retreat is irreversible. Repeated retreat
requests consume budget but do not reset progress. `resolveBattle` rejects unordered
or malformed schedules even when an early outcome would leave those commands unused.
Well-formed commands after the terminal tick have no effect.

## Calculation and events

Each tick: apply commands → assess retreat thresholds → calculate both salvos
in player/pirate order → apply damage → check destruction → advance escape →
check escape/time cap. Simultaneous salvos allow mutual destruction; destruction
on an escape tick takes precedence over escape. Hull threshold crossed by damage
starts retreat next tick. Every emitted event includes contiguous `sequence`,
integer `tick`, and `type`; seconds = tick × TICK_SECONDS.

| Type | Additional fields |
| --- | --- |
| approach | actorId, targetId |
| posture | actorId, posture |
| retreat | actorId, reason: command/hull_threshold |
| weapon | actorId, targetId, ammoRemaining |
| hit / miss | actorId, targetId |
| damage | actorId, targetId, damage, hullRemaining, cargoLost |
| destroyed | actorId |
| escape_progress | actorId, progress0–100 |
| escape | actorId |
| terminal | outcome, reason |

Defensive fires every3ticks, accuracy−8 and incoming hit chance−12; balanced
fires every2ticks; aggressive fires everytick, accuracy+10 and incoming chance+10.
Each shot costs one ammo. Hit chance is bounded5–95%, modified by captain skill
and exposed retreating targets (+10). Armour and engineer reduce damage, minimum1
on a hit. Cargo protection reduces player accuracy8, cuts cargo-hit probability
from20% to5%, and adds2 escape progress/tick. Cargo hits lose a bounded integer
quantity: `min(remaining cargoUnits, max(1, floor(applied hull damage / 5)))`.
No commodity or money is selected by this resolver; final cargoUnits plus summed
damage-event cargoLost reconcile the aggregate loss for the settlement adapter.
Speed differential and captain change escape rate, bounded2–18/tick;
ships remain vulnerable while withdrawing. Zero damage weapons never consume ammo.
These are provisional prototype tuning rules, not physical spaceflight modelling.

`state.result` is null until terminal, then:
`{version, seed, outcome, reason, tick, player, pirate}`. Final ships contain
the original bounded stats plus `retreating`, `escapeProgress`, `escaped`, and
remaining hull/ammo/cargoUnits. Outcomes: victory/defeat/mutual_destruction,
escaped/pirate_escaped/both_escaped/stalemate. Reasons: destroyed/escape/time_limit.
Pirate withdrawal is distinct from pirate destruction; the Economy/Backend adapter
must define consequences of each. A stopped ship's cargo remaining is not a claim
that cargo survives destruction. Backend/Economy define that consequence.

## Playback and trust

Playback batches1/2/5ticks without passing speed into calculations. For instant
from current state, keep stepping that exact state with its remaining accepted
schedule; do not recreate it or replay submitted commands. JSON roundtrip preserves
state. `state.events` is the full stream; consume new events by sequence.
The renderer owns interpolation, positions and camera; it cannot decide hits.

Backend supplies/reconstructs trusted ships, seed, accepted command ticks/order
and resolver version. It must not settle a client-submitted result or restored
client snapshot. State returned by this module is resolver-owned; `stepBattle`
is not an untrusted-snapshot validation boundary. Command acceptance and simulation
time are server responsibilities; wall-clock clicking at different playback
speeds does not imply identical tick schedules. Persistent battle ID, retries,
settlement key and concurrency belong to Backend's wrapper.

Real dependency: the current trading ship lacks hull/armour/weapons/ammo/crew
ratings. Lead/Backend/Economy must agree its trusted combat snapshot adapter and
which cargo units are lost before integration. All example stats are fixtures.

## Validation

Focused command: `node --test tests/combat/combat.test.js` (no npm install needed).
No shared package script changed. Small dependency-free tests are lightweight;
full builds/suites/browser jobs use the VPS queue. Tests do not establish battle
visuals, persistent settlement, mobile acceptance or fun/balance acceptance.
