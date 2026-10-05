# FRONTIERDOM authoritative API

Node 22.18+; pinned `pg` dependency must be added by Lead to the root package and lockfile. Start `node server/server.mjs`. It binds loopback only, default PORT=3097, and imports the Economy lane's `src/sim/economy/index.js`; there is no duplicate pricing kernel and no memory/file persistence fallback.

## Resource prerequisites

Dedicated FRONTIERDOM PostgreSQL database and restricted login; do not use another game's database. PostgreSQL 16 is available on the existing VPS, but no live database/login was provisioned by Backend. A hosted Supabase project can use the same private schema and direct server-side Postgres connection when its organization, region and cost are chosen. Supabase Auth integration is deferred; this slice uses durable opaque guest sessions. Clearing the cookie loses browser access; no reset/admin/recovery endpoint exists.

Apply `server/schema.sql` using the dedicated database owner, then grant membership in the NOLOGIN `frontierdom_backend` role to the dedicated API login. That login must not be superuser, database owner or BYPASSRLS. Browser roles get no schema/table grants or RLS policies. The private `frontierdom` schema must not be added to Supabase's exposed schemas. RLS grants are for the trusted service role, not direct player access; ownership is checked by session lookup in every API transaction. Never grant a browser role backend membership.

Environment outside Git: `DATABASE_URL`, `SITE_ORIGIN` (exact origin, no trailing slash), `NODE_ENV=production`, `PORT=3097`, optionally `TRUST_PROXY=1`. Use a TLS-verified connection for a remote database; never set rejectUnauthorized=false. The proposed secret file is `/etc/frontierdom/api.env`, owned/readable only by the service account and administrator. The server never auto-applies schema changes at startup. Same-origin HTTPS reverse proxy must overwrite `X-Real-IP` with `$remote_addr`; only loopback peers are trusted when TRUST_PROXY=1. No forwarded header from an external peer is trusted. No permissive CORS. Cookies are HttpOnly, SameSite=Lax, Secure in production, with 30-day persisted expiry; session POST renews that expiry.

## Transaction model and limits

Markets are company-local. One `SELECT ... FOR UPDATE` locks the company snapshot containing cash, cargo/cost basis, ship, crew, markets and cumulative finances. The trusted Economy kernel validates and resolves the intent. State, count, complete ledger receipt and original response commit together. A failed insert/timeout rolls the whole transaction back; an uncertain COMMIT can be recovered by retrying the identical command ID. Lookup precedes quote expiry/revision/ledger-cap checks. Same company/ID with a different quote/revision fails. Old replay snapshots are intentionally old; UI must ignore lower revisions and refresh state.

Exact first-prototype bounds:

- 4,096-byte JSON request body; 16,384-byte total HTTP headers; cookie header at most 8,192 bytes. Extra input fields, unsafe revisions, invalid UUIDs, non-integer quantities and quantities above 10,000 are rejected; Economy further limits the 40-unit ship.
- 240 API requests per minute per IP, 5 new guest companies per hour per IP; deleting cookies does not change that IP limit. Quotes and commands each have a 60-request/minute/session limit. Rate buckets persist across process restarts and are hashed, not raw IPs/tokens. Limits use fixed time windows. A serialized global cap permits at most 5,000 limiter keys; every limiter call reclaims at most 16 expired rows before admission. New identities at capacity receive RATE_LIMITED.
- Quote TTL 60 seconds, at most 20 unexpired quotes per company. Quotes reserve nothing; binding includes exact action, company/market revision and location.
- Global durable cap: 500 companies, serialized admission under an advisory transaction lock. One durable session per company. Expired sessions do not delete companies or free admission slots.
- At most 1,000 committed commands per company. Capacity rejects new commands with RATE_LIMITED and preserves all existing replay identities/receipts. No committed ledger pruning. At most 32 KiB company state and 64 KiB original response per command; oversize changes roll back. Thus retained response payloads are bounded by roughly 32 GiB globally, plus JSONB/index/row overhead. Operations must monitor actual disk use and preserve the shared 40 GB reserve; these are prototype admission bounds, not permission to exhaust the disk.
- 5 database connections; 5-second statement timeout, 3-second lock timeout, 6-second query timeout, 10-second HTTP request/header deadlines. Database unavailability is a 503 with Retry-After; there is no client-economic fallback.

Additional cleanup is bounded and opportunistic on new session requests: removes only expired quotes/rate buckets, at most 256 each. No timers, session/ledger purges or scheduler. Rejections leave economics unchanged; rate counters may advance. Limits require deliberate expansion and review before broader public use.

## Checks and recovery

`bash tests/backend/run-postgres.sh` starts a disposable PostgreSQL 16 cluster inside the isolated VPS job directory, installs only `pg` if Lead's lockfile does not include it yet, applies the schema, and runs real HTTP/Postgres tests. It never connects to the VPS main cluster or another game's DB. Run through the shared VPS queue, not locally. Test package files live in the disposable job only; no root/package edits are made by this lane.

The helper accepts an optional command under its isolated DATABASE_URL: `bash tests/backend/run-postgres.sh bash tests/e2e/run-preview.sh` lets Lead run the integrated browser/API preview without duplicating database setup. Default invocation runs focused tests. Its temporary cluster is Unix-socket-only and owned by the unprivileged queue user; it never binds the VPS production PostgreSQL socket or TCP port.

Backup/restore procedure before live activation: take a consistent `pg_dump --format=custom` of the dedicated database to a restricted backup location; retain the matching schema/source revision; restore into a separate dedicated scratch database, reapply restricted role membership, and verify company, ledger/replay and session recovery through the API. Dumps include session token hashes and player state: restrict access and encrypt storage/transport. A code rollback must not roll back committed money; the bootstrap is additive and API never resets state. No live backup or restore has been run yet. PostgreSQL role definitions/membership require a separate restricted provisioning record; pg_dump does not preserve cluster roles.

Contract: `docs/API_CONTRACT.md`. Live activation belongs to Deploy after the integrated candidate is audited and tested.
