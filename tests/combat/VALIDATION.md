# Combat resolver receipt — 5 October 2026

Base `77948cca638e45bfedf3163281b58c477873e8e3`; branch `combat/first-encounter`;
checkout `/Users/domininclynch/Desktop/FRONTIERDOM-combat`.

Delivered files: `src/sim/combat/index.js`, `src/sim/combat/README.md`,
`tests/combat/combat.test.js`, this receipt. No shared/package/UI/backend/economy changes.

Local lightweight dependency-free check: Node v25.8.1,
`node --test tests/combat/combat.test.js`: exit0, 11/11 passed, ~0.17s.
No substantial tests/builds or browser jobs required for this isolated module.

Resolver SHA256 `89a1a05a7d72ff5763b2d1a178462b3f6509b047c7a7bfc2f79b8606545795ff`.
Test SHA256 `d1d759d46eed17d53528743fc2bc4be52c6e54cb197cefbaca4266e0feb1eebc`.

Coverage: complete event/result equality for1/2/5/180-tick batches and instant;
JSON resume/instant from partial state; distinct seeded stream; exact command
ticks/order/budget and rejection; immutable inputs; hull retreat threshold;
multi-tick vulnerable escape; simultaneous lethal salvos; victory/defeat/pirate
escape and destruction precedence; ammo/cargo/hull bounds;180-tick stalemate;
actual posture cadence/armour mitigation/cargo-protection effects; invalid inputs;
40-seed bounded replay sweep; golden cargo-damage event with exact integer units.

Sensitivity: temporarily changed LCG increment1013904223→1013904224, ran
`node --test --test-name-pattern='golden salvo' tests/combat/combat.test.js`:
exit1, expected cargoLost4 changed to0. Restored source in finally block, reran
11/11 exit0; above digests identify restored source/tests.

Ordering: tick commands in submitted order, retreat checks, player then pirate
salvo calculation, both damage applications, destruction, escape, time cap.
Terminal results cannot advance or accept more commands. Full interface, bounds,
event fields and settlement limits are documented in the owned README.

Open integration dependency: Lead accepts shared contract; trusted ship/crew/ammo
snapshot adapter, persistent encounter/command identity and commodity-loss allocation
are pending. Backend reruns/validates from trusted state and settles exactly once.
No rendered combat, hosted integration, persistent settlement, phone acceptance,
or fun/balance acceptance is claimed. Example stats are fixtures; calibration is
provisional. No deployment or paid work performed.
