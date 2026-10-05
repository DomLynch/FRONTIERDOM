# Combat resolver receipt — 5 October 2026

## Opening amendment — current receipt

Parent `50b782bc1d9893e700fdff96760c8ef14591a586`; same isolated branch/check-out.
Added validated `scenario: {type:'opening', choice:'run'|'fight',
playerHullFloor:25, cargoPolicy:'boarding_only'}`. Requires player maxHull100,
initial hull25–100. Run starts retreating; opening salvos do hull-only damage;
surviving pirate boards at floor25, one loss of ceil(initial cargo/4 run or /2 fight).
Victory/escape retains cargo. Result scenario reports initialCargoUnits,
cargoLostUnits and crewSafe; final ship cargo already includes that one loss.
Generic behavior and result shape remain unchanged when scenario is omitted/null.

`node --test tests/combat/*.test.js`: exit0,18/18 (11 generic +7 opening), ~0.20s,
Node v25.8.1. Includes opening1/2/5/instant equality, terminal replay/no repeated
floor or boarding mutation, exact ceil losses, zero/tiny/full bounded cargo,
pre-floor/config rejection, hull-only shots, successful escape/victory retention,
simultaneous pirate destruction precedence, tick commands/JSON resume and12 seeds
with player hull never below25. `git diff --check`: exit0. No unchanged broader
suites/build/browser jobs rerun.

Current resolver SHA256 `c090552e3f355241e1415d1afec14ee45dba7bfd793c0436bc46040dcbbd6d3c`.
Opening test SHA256 `35201dcb8f6ff1e88752b2b9d9d03989b2bf0bc56d2b20646aeb9a837682f58f`.
Generic test SHA256 remains `d1d759d46eed17d53528743fc2bc4be52c6e54cb197cefbaca4266e0feb1eebc`.
README contains explicit pre-choice disclosure; actual scenario UI copy is a
pending UI integration requirement. No economic settlement, crew attrition,
rendered battle or relay scenario implemented. Backend must select the scenario
from trusted encounter state and Economy must allocate returned cargo loss once.

## Original generic delivery receipt (historical source digest)

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
