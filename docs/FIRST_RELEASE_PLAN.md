# First playable release — 5 October 2026

Owner explicitly authorized implementation and a live FRONTIERDOM prototype. This supersedes readiness-only onboarding. Lead coordinates developers and owns end-to-end delivery; Strategy consults on product scope/experience; Deploy alone activates the reviewed release.

## Deliverable

An HTTPS mobile browser game at frontierdom.com: start with £25,000, one freighter and three crew; inspect Earth and Eden markets; buy cargo, travel with explicit costs, sell, review profit/loss and repeat. Reload preserves server-owned progress. A PlayCanvas scene makes the ship and destination visible. The first release is labelled a trading prototype; combat and the full 15–30 minute content slice follow separately.

## Implementation choice

Owner update, 5 October: use a dedicated Supabase project and seamless Google sign-in, managed by Lead. Backend owns verified persistent account/company ownership and server-side sessions; UI owns login/logout/recovery. The accepted guest-only trading package remains preserved evidence. Final publication requires an auth-enabled candidate with hosted provider/account checks, independent review and a new immutable package. Organisation selection and actual project-cost confirmation precede provisioning; no other game's project/config is reused.

Use one code-first PlayCanvas Engine client in Git, with DOM trading UI and a same-origin authoritative API. Waiting for Editor MCP would block usable gameplay without adding a required first-loop capability. The existing blank Editor project remains an authoring resource; do not create a competing client or claim it was exported. The owner withdrew the unrelated Three.js combat handoff; none of it enters this release.

## Owners and sequence

1. Lead: bootstrap, pinned packages/lock, API contract and client integration. Commit the contract before Backend/UI consume it.
2. Economy: concrete prices, capacities, travel costs and a worked viable round trip; Backend implements the accepted rules once.
3. Backend: isolated persistent state, bounded session/API inputs, atomic trades and travel, idempotency and ownership. Owner chose dedicated Supabase project eyfojjzajbfliuokaplx in Global-Digital-Assets's Org on Free ($0/month). No other game's database is used.
4. Web/UI: mobile market/cargo/route/receipt flow, loading/retry/error states and responsive polish against the contract.
5. World/Art: lightweight procedural PlayCanvas freighter and Earth/Eden scene. No paid assets or heavy local jobs.
6. Lead: integrate lane commits, run focused tests/build and complete recorded browser round trip through the actual API on VPS.
7. Auditor: independent review of the frozen candidate, especially money/cargo invariants, isolation, retries and release evidence; fixes go back to owning lane.
8. Deploy: dedicated host/TLS/service, immutable candidate and rollback; activate after review and browser evidence. Verify live version, new session, round trip and reload.

## Required evidence

- Buying/selling/travel reject invalid quantities, overspend, oversell and over-capacity; client prices/balances cannot become authority.
- Retrying one request cannot double-charge or duplicate cargo. Concurrent requests preserve all invariants. Two sessions cannot access each other's state.
- Progress survives API restart and browser reload; receipts reconcile cash and cargo costs.
- Rendered mobile and desktop browser trade journeys complete with readable controls, stable layout, no blocking errors and a bounded scene.
- Source commit, build digest, deployed version and rollback target recorded. Phone acceptance is reported separately from VPS Chromium checks.

## Publication boundary

Owner's live-publish authorization is already given. No extra approval is required for the tested first prototype on the existing VPS. A new paid Supabase project requires its actual cost confirmation. No unrelated sites, hooks, Claude settings or game databases may change. Credentials stay outside Git/client bundles. Database evolution must remain compatible with rollback.
