# Isolated Checkpoint B Backend

Base: live `77948cca638e45bfedf3163281b58c477873e8e3`. Worktree `/Users/domininclynch/Desktop/FRONTIERDOM-backend-expedition`, branch `backend/first-expedition`. Backend owns server/**, supabase/** and tests/backend/**; committed Economy/Combat modules are frozen dependencies, not Backend-authored economic or combat formulas.

No production migration or activation is included. `EXPEDITION_MODE` is off unless exactly `1`; unexpected values fail startup. Existing Google/account/company/header and exact command replay semantics stay intact. B requires the paired UI and accepted kernels. Apply `server/expedition-schema.sql` to the dedicated project only after independent review and Lead/Deploy's release authorization. API startup does not apply schema.

## Authority and persistence

The existing company row lock covers migration, quote evaluation and command execution. Migration uses Economy's helper and checks preservation of every existing company/financial field; it adds defaults without changing revision/history/money. Exact stored command replay precedes migration, quote expiry, rules-version and encounter checks. Existing unused A quotes require renewal under B; existing A committed responses remain replayable byte-for-byte in their JSON fields.

`frontierdom.encounters` holds one opening encounter per company: departure command ID, source revision, server uint32 seed, frozen departure input, immutable chosen battle input, choice/status, tick, accepted schedule, full Combat continuation and terminal result. Forced RLS and backend-only grants match the private schema; browser roles cannot access it. Every lookup filters both verified company and encounter. Company state, private encounter and original response ledger use one transaction; ledger failure rolls back prepaid fare, frozen identity, simulation progress and settlement.

Run/fight stats follow Lead's exact accepted opening adapter. No client hull/ammo/damage/outcome/seed/tick/snapshot is accepted. Setup is posture, protectCargo boolean and remaining-hull retreat percentage0..100. At most8 strategic commands are stamped at the next persisted simulation tick. Each request advances1..180 ticks, stopping at terminal/180; it never recreates a battle. Below25 hull cannot fight. At25, real Combat boards at tick0 and Economy composes the service fee/loss/arrival in one command receipt. Generic lethal results cannot enter this adapter.

Economy owns prices, migration, weighted-average loss, fees, hull settlement, arrival/replenishment, repairs, bracing, relay agreement and accounting. Run/fight are unavailable if the accepted progress/settlement helpers are missing. Advancement has zero extra ammo/service fee. Only the actual verified terminal result settles cargo/hull/arrival, once; a new command cannot resettle and an exact old command returns its original response.

## Transport and bounded playback

Existing POST quotes `{action}` and POST commands `{commandId,quoteId,expectedRevision}` plus `X-Frontierdom-Company-Id` remain the mutation envelope. New actions:

- `enroll_expedition`.
- `encounter_choice`: encounterId + choice pay/drop/run/fight. Drop requires cargoSelection of distinct commodityId/positive whole quantity. Run/fight require posture, protectCargo and retreatHullPercent.
- `battle_advance`: encounterId + ticks1..180, optional command `{type:'retreat'}` or `{type:'posture',posture}`. Client simulation tick is forbidden.
- `repair`: points1..100; `buy_upgrade`: upgradeId cargo-bracing; `secure_relay`: method agreement. Tactical relay/credit/reset are not enabled.

B quote includes rulesVersion expedition-1 and exact state/encounter binding. Economy disclosures expose accounting components and actual consequences. Pending crossings reject unrelated trade, travel, repair, upgrade, relay or enrollment mutations; Auth/logout/recovery stay available.

B state/command responses add `encounter` (nullable) with id/status/choice/version/seed/tick, current snapshot (player/pirate/posture/protectCargo/retreatHullPercent/commandCount), events, cursor `{from,to,total,next}` and terminal result. GET state gives the latest window; each command gives its new window. Company JSON does not accumulate the event stream.

Read-only GET `/api/v1/encounters/<id>?from=0` retrieves an owned window, including after terminal/reload. Cursor accepts one canonical integer0..2048, then rejects values beyond the available stream; no other query fields. Up to128 events per response,2048 events full stream. Private JSONB continuation cap256KiB; serialization is capped at240,000 bytes before PostgreSQL's whitespace-expanded JSONB check. Frozen inputs/results and schedules have separate smaller bounds. Original command responses retain the existing64KiB bound; overflow fails atomically. Clients page via cursor.next, never submit returned snapshots to resume.

## Validation and limits

Run the isolated queue command:

```sh
bash tests/backend/run-postgres.sh node --test --test-concurrency=1 tests/backend/backend.test.mjs tests/backend/expedition-input.test.mjs tests/backend/expedition-service.test.mjs tests/backend/expedition-store.test.mjs
```

Checks use actual HTTP, restricted PostgreSQL, committed Economy helpers and the accepted real Combat resolver. They cover additive legacy migration, original replay, owner isolation, prepaid arrival, pay/drop/empty return, actual battle continuation versus seeded instant output,8 next-tick commands, ledger-failure rollback, tick-zero boarding, terminal replay, bounded event paging and repair/bracing/agreement accounting. Unchanged Auth/provider acceptance is reused; no full Auth rerun or client build is required by this Backend-only delta.

Lead owns final shared contract/integration and rendered B acceptance; Auditor reviews authority/kernel adaptation and evidence; Deploy alone applies a reviewed migration/paired release. This receipt does not establish watchable battle UI, phone behavior, fun/balance or live B acceptance. Existing low-cash empty Eden saves remain stranded below the return fare; no loan/reset rescue is claimed. B rollback after adoption is maintenance/API shutdown with data preserved, not switching back to an A-only client while journeys are pending.

## Frozen validation receipts

- Full Backend suite: 27/27 passed, exit0,18.02s, `/srv/dev-jobs/frontierdom-backend-expedition-b1a535952e1c`. Includes15 existing trading/authority tests and12 expedition tests.
- Strengthened batched command continuation:1/1 passed, exit0,12.02s, `/srv/dev-jobs/frontierdom-backend-expedition-4c5e53dfc43c`. Five ticks with one next-tick command, remaining seven commands, exact whole continuation against the real seeded resolver, restart, terminal concurrency/replay and full owned event paging.
- Between these two receipts only the stronger test, this runbook and additive `ADD COLUMN IF NOT EXISTS battle_input` for an earlier isolated schema changed. Runtime adapter/modules are identical. All83 current source inputs matched the strengthened job manifest before this receipt-only documentation edit.
- Scoped request/result/log files are recovered under ignored `tests/backend/artifacts/expedition/`. The earlier11/12 result is retained as `stale-fixture-failure`: a size-rejection test still used190,001 bytes after the allowed continuation size became240,000; corrected to240,001 before the27/27 run. It is not presented as a successful run.

Dependency provenance: Economy original commits560a1d92,3d5cb85e,e4279dbc; Combat originals50b782b,1931f4c,8b9ba6f. Backend foundation6e6503b plus the final Backend commit are the owned integration changes. Lead should integrate the accepted original kernel commits and these two Backend commits rather than attribute this entire dependency branch to Backend.
