# FRONTIERDOM — 5 October 2026

## Current delivery

Owner authorized the working first prototype and live publication, then appointed Lead developer coordinator/end-to-end delivery owner. Strategy is product consultant. Lead chat `01a10bcc-c33a-7c12-89a9-ad2f7a35ea43` coordinates the seven peers listed in docs/TEAM.md. Owner-requested `frontierdom-dev-progress-review` heartbeat checks all seven every 15 minutes and stays quiet during healthy/unchanged work.

Canonical root `/Users/domininclynch/Desktop/FRONTIERDOM`. One code-first PlayCanvas 2.23.0/Vite 8.3.2 client. Integration through `0edb618` includes shared API/types, uncertain-command transport, World `8a1fd3b` and Deploy preparation `a5076f`; Economy `52e0a49` is now integrated. Backend/UI components still pending. No game is publicly served yet; Deploy reports dedicated TLS maintenance503.

First release: Earth–Eden, £25,000/one freighter/three crew, six commodities, authoritative persistent trade/cargo/travel, receipts separating realized profit/cost basis/cash flow. Combat follows. See docs/FIRST_RELEASE_PLAN.md and docs/API_CONTRACT.md. Eight focused client transport checks passed locally; Economy reports 14 VPS checks, not browser/device acceptance. Integrated build/browser/review/package gates remain.

Production database choice/cost remains pending explicit owner decision. No dedicated Supabase project exists; never use another game's database. Temporary isolated VPS PostgreSQL testing is authorized. Backend requires pinned pg8.23.1 and targets server/server.mjs. Deploy alone activates a frozen reviewed package with immutable identity and rollback.

## Next

Integrate Backend/UI, run focused integrated tests/build and actual desktop/mobile trade journeys on the shared VPS queue, inspect rendered results, obtain Auditor review, then pass accepted candidate to Deploy once database choice is resolved. Physical-phone acceptance remains distinct. No paid compute, Claude/hook changes or other-game mutations.

[Earlier setup receipts](docs/history/INITIAL_SETUP_STATE.md). Editor project1613265/scene2612405 is an optional blank authoring resource, not this client's export.
