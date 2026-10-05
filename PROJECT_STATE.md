# FRONTIERDOM — 5 October 2026

## Current delivery

Owner authorized the working first prototype and live publication, then appointed Lead developer coordinator/end-to-end delivery owner. Strategy is product consultant. Lead chat `01a10bcc-c33a-7c12-89a9-ad2f7a35ea43` coordinates the seven peers listed in docs/TEAM.md. Owner-requested `frontierdom-dev-progress-review` heartbeat checks all seven every 15 minutes and stays quiet during healthy/unchanged work.

Canonical root `/Users/domininclynch/Desktop/FRONTIERDOM`. One code-first PlayCanvas 2.23.0/Vite 8.3.2 client. Preserved guest trading candidate: source `4059999b49b5ecc9d7fc801b4fac3ea7769993d6`, content SHA-256 `abadc9178b68caa6cde19b2845c07b5ad905ba6e608e10d9416619d3c67f163f`, code-first Engine2.23.0. Immutable package `/srv/dev-jobs/frontierdom-candidate-n3mha0pu-4f02c30162bf/src/package`; preserve it. GitHub main includes the candidate; later `34f43ba` only adds packaged-API test support. No public game activation yet.

First release: Earth–Eden, £25,000/one freighter/three crew, six commodities, authoritative persistent trade/cargo/travel, receipts separating realized profit/cost basis/cash flow. Combat follows. Economy52e0a49, Backend54b3f36, UI932ad74+81dff09+a99e7a, World8a1fd3b, Deploy templates/renewal are integrated. See docs/FIRST_RELEASE_PLAN.md and docs/API_CONTRACT.md.

Evidence checked 5 October: eight focused client checks; 29 real PostgreSQL checks (15Backend/14Economy); Vite build; desktop API and visible UI flow; mobile visible UI rerun with adequate software-renderer budget; isolated packaged-API/client trade and identical retry/reload/isolation plus manifest verification before/after. Both UI journeys prove £25,000→£27,593.50, +£2,593.50 realized profit and response-loss recovery. Earlier port-collision and 60s mobile-driver failures are preserved; desktop/mobile accepted receipts are scoped, not a claim the earlier whole job passed. Local receipts under artifacts/lead/. Auditor independently accepted exact candidate and evidence; physical-phone acceptance remains open.

HTTPS certificate for apex/www expires3January2027. Deploy verified existing twice-daily Certbot timer, scoped FRONTIERDOM Nginx renewal hook and successful renewal dry run. Release template redirects HTTPSwww to apex to match trusted API Origin. Public host remains deliberate503.

Owner chose Supabase and Google sign-in on 5 October at about14:42UTC, with Lead managing deployment. Owner selected “Global-Digital-Assets's Org” and confirmed $0/month Free creation. Dedicated FRONTIERDOM project `eyfojjzajbfliuokaplx` in `eu-central-1` is verified ACTIVE_HEALTHY, PostgreSQL17.11.0.002; public URL `https://eyfojjzajbfliuokaplx.supabase.co`. Backend is authorized project-only private schema/restricted TLS connection/recovery preparation. Google OAuth client FRONTIERDOM web login and exact app/provider return URLs are created/saved. Provider remains disabled pending credential connection; no other-game database/config may be reused. Temporary isolated PostgreSQL tests were used. Runtime server/server.mjs uses restricted DATABASE_URL, exact SITE_ORIGIN, production cookies and proxy trust; Deploy owns activation.

## Editor automation pilot

Independently accepted 5 October: official MCP authored project1613265/scene2612405, exported build74038, and a normalized scene adapter ran inside the existing client/Application/UI/API. World59ba112 + UI0ae8861; normalized SHA256 `f834cfc5dd22d5ea39e5cf8a513f9a421bc31266fe3fd381b93ad721d9eb73dd`. VPS `editor-seam-job-cache-fit-35b427eb8d7d` passed build and focused real-PostgreSQL/browser checks: buy/travel, Earth/Eden portrait/landscape, full ship/gateway framing, one app/camera and two clean remounts. Auditor inspected exact inputs, runtime receipts and screenshots. Experimental artifacts remain on isolated lane branches; the accepted release/runtime is unchanged. [Evidence and limits](docs/history/EDITOR_PILOT.md).

## Auth release checkpoint — 5 October 2026 15:35 UTC

Recovery-fixed candidate sourcec02f9d1/content40661e8e is independently accepted at source/integration level and installed as the auth-only API; Lead verified installed inventory. Actual SDK/PG9 and rendered real-API/PG recovery checks passed with matching inputs; the recovery P1 is closed. Restricted hosted TLS1.3 and empty-player private-schema PostgreSQL17 restore passed. Public login check HTML/JS exactbytes/CSP/no-store and auth/session200 verified; game/state remain503.

Google OAuth client and exact return URLs are created/saved, but provider credential Save is pending. Browser tool requires owner entry of new credentials; exposed Supabase connector lacks Auth-write and no existing management token was found. Remaining work is real Google/account/company, authenticated trade/reload and full served activation. [Exact candidate, evidence and limits](docs/releases/AUTH_CANDIDATE.md).

## Next

Backend implements verified Google account ownership/session lifecycle in server/**, supabase/**, tests/backend/**. UI implements login/recovery/logout in src/ui/** and has temporary ownership of auth additions to src/client/api.js. Lead created the dedicated Supabase project after organisation/cost confirmation, owns shared contracts/package/lock, and coordinates Google provider configuration. The guest-only4059999 package remains accepted evidence for trading but is superseded as the final requested release; freeze, test and independently review a new auth-enabled candidate before Deploy activation. Verify HTTPS canonical origin, served digest, real session/trade/reload and rollback. Physical-phone acceptance remains distinct. No paid compute, Claude/hook changes or other-game mutations.

[Earlier setup receipts](docs/history/INITIAL_SETUP_STATE.md). Editor project1613265/scene2612405 now contains the separate docking pilot; it is not the accepted live-release client.
