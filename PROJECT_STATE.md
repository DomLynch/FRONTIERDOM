# FRONTIERDOM — 5 October 2026

## Current delivery

Owner authorized the working first prototype and live publication, then appointed Lead developer coordinator/end-to-end delivery owner. Strategy is product consultant. Lead chat `01a10bcc-c33a-7c12-89a9-ad2f7a35ea43` coordinates the seven peers listed in docs/TEAM.md. Owner-requested `frontierdom-dev-progress-review` heartbeat checks all seven every 15 minutes and stays quiet during healthy/unchanged work.

Canonical root `/Users/domininclynch/Desktop/FRONTIERDOM`. One code-first PlayCanvas 2.23.0/Vite 8.3.2 client. Accepted candidate: source `4059999b49b5ecc9d7fc801b4fac3ea7769993d6`, content SHA-256 `abadc9178b68caa6cde19b2845c07b5ad905ba6e608e10d9416619d3c67f163f`, code-first Engine2.23.0. Immutable package `/srv/dev-jobs/frontierdom-candidate-n3mha0pu-4f02c30162bf/src/package`; preserve it. GitHub main includes the candidate; later `34f43ba` only adds packaged-API test support. No public game activation yet.

First release: Earth–Eden, £25,000/one freighter/three crew, six commodities, authoritative persistent trade/cargo/travel, receipts separating realized profit/cost basis/cash flow. Combat follows. Economy52e0a49, Backend54b3f36, UI932ad74+81dff09+a99e7a, World8a1fd3b, Deploy templates/renewal are integrated. See docs/FIRST_RELEASE_PLAN.md and docs/API_CONTRACT.md.

Evidence checked 5 October: eight focused client checks; 29 real PostgreSQL checks (15Backend/14Economy); Vite build; desktop API and visible UI flow; mobile visible UI rerun with adequate software-renderer budget; isolated packaged-API/client trade and identical retry/reload/isolation plus manifest verification before/after. Both UI journeys prove £25,000→£27,593.50, +£2,593.50 realized profit and response-loss recovery. Earlier port-collision and 60s mobile-driver failures are preserved; desktop/mobile accepted receipts are scoped, not a claim the earlier whole job passed. Local receipts under artifacts/lead/. Auditor independently accepted exact candidate and evidence; physical-phone acceptance remains open.

HTTPS certificate for apex/www expires3January2027. Deploy verified existing twice-daily Certbot timer, scoped FRONTIERDOM Nginx renewal hook and successful renewal dry run. Release template redirects HTTPSwww to apex to match trusted API Origin. Public host remains deliberate503.

Production database choice remains pending explicit owner decision (existing dedicated VPS PostgreSQL versus new dedicated Supabase organization/cost). No production DB created; no other-game database may be used. Temporary isolated PostgreSQL tests were used. Runtime server/server.mjs uses restricted DATABASE_URL, exact SITE_ORIGIN, production cookies and proxy trust; Deploy owns activation.

## Next

After explicit production DB choice, Backend provisions only dedicated resources/recovery readiness and Deploy activates the accepted immutable candidate. Verify HTTPS canonical origin, served digest, real session/trade/reload and rollback. Physical-phone acceptance remains distinct. No paid compute, Claude/hook changes or other-game mutations.

[Earlier setup receipts](docs/history/INITIAL_SETUP_STATE.md). Editor project1613265/scene2612405 is an optional blank authoring resource, not this client's export.
