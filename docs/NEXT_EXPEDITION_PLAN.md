# Next delivery: the first expedition

Lead assignment, 5 October 2026 16:57 UTC. Live runtime remains `77948cc`. The trading/auth release is a technical foundation, not acceptance of the complete game. Dom rejects its blocky visuals, missing guidance and absent story/combat/expansion experience. [Strategy and mission copy](STRATEGY_NEXT_MVP.md) provide the product reference.

## A: a guided voyage with a visible frontier

UI owns `src/ui/**`; World owns `src/world/**` and `public/assets/**`. Both use isolated clean branches from `77948cca638e45bfedf3163281b58c477873e8e3`, preserving parked Editor pilots. Lead integrates the same client. No new Auth/backend setup is needed.

UI: compact HUD/context panels, short 2035 gateway/captain briefing, actual named crew, one persistent objective and next action; medicine → Eden → sell → Aurelia/home. Guidance reads actual authoritative snapshots and handles returning players. No fictional rewards, resets or assumed new-company state. Per-company tutorial preferences are presentation only; exact pending-command/account recovery stays intact. Existing mountUI interface stays unchanged.

World: recognizable worn freighter, orbital Earth/station/enormous gateway, and unmistakably different Eden with scale/living terrain/light. Brief transition follows confirmed location changes, never a fresh-load imitation of travel. Existing createWorld/setState/destroy interface stays unchanged. World chose direct runtime scene improvements; no Editor mutation or new dependencies expected.

Acceptance: player explains role/destination/next action within 30 seconds and finishes delivery without verbal coaching; actual portrait/landscape candidate captures clearly show ship, Earth, gate and Eden; existing Eden company resumes sensibly. Money/cost-basis/recovery invariants stay unchanged. Auditor reviews changed paths and actual flow; Lead packages accepted integration; Deploy activates immutable identity with rollback. Physical-phone acceptance remains separate.

## B: risk and a first foothold

Combat now implements `src/sim/combat/**` and `tests/combat/**`: one seeded freighter/pirate encounter, bounded posture/protect-cargo/retreat intent, simulation-time commands and readable events/results. Playback speed cannot change outcome. Combat proposes its exact API first; Lead accepts shared contracts before dependent Backend/UI code. Resolver contains no money/persistence authority.

Economy owns new `docs/economy/first-expedition.md`: worked pay/drop/run/fight, loss/repair costs, achievable upgrade and one relay benefit, using actual prices/integer pence and viable poor/empty-cargo/repeat-player paths. Core kernel extensions wait for Lead contract acceptance.

Backend will execute trusted rules and atomically/idempotently persist mission/encounter/upgrade/site consequences once contracts are accepted. UI/World add readable encounter/tactics/battle/aftermath under separate bounded assignments. One native dilemma and one persisted relay/foothold seed expansion; full planet conquest/fleets/empire remain subsequent work. No pretend playable locked worlds or invented bonuses.

Acceptance: persistent trade → risk choice → battle/alternative → consequence → upgrade → foothold, with understandable stakes and reason for another run; same seed/tick commands resolve consistently at 1×/2×/5×/instant; reload/relogin cannot duplicate costs/rewards. No delivery claim until integrated actual-player evidence passes.

## Current sizing and ownership receipts

UI estimates 45–60 minutes for its own A implementation/focused VPS/portrait-landscape receipts, excluding integration/review. Branch `ui/checkpoint-a`, worktree `/Users/domininclynch/Desktop/FRONTIERDOM-ui-checkpoint-a`.

World estimates 2–3 hours including its actual candidate pixels, followed by integrated UI composition acceptance. Branch `world/first-voyage`, worktree `/Users/domininclynch/Desktop/FRONTIERDOM-world-voyage`.

These are lane estimates, not a guaranteed public release ETA. Combat/Economy sizing remains pending. Substantial work uses the existing VPS queue, three slots/five threads/40 GB reserve. Keep the reviewed foundation live while candidates are built; no paid resources or other-game changes.
