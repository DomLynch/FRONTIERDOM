# FRONTIERDOM first-route API — v1

5 October 2026. Lead integration contract. One code-first PlayCanvas client; Editor authoring can feed that client later. This document defines interfaces, not a working backend.

## Ownership and exact paths

- Lead: `package.json`, `package-lock.json`, `.gitignore`, `index.html`, `src/main.js`, `src/client/app.js`, `src/client/api.js`, `src/contracts/api.d.ts`, this document.
- Backend: `server/**`, `supabase/**`, `tests/backend/**`. Implements same-origin `/api/v1/**`; Supabase credentials and privileged operations stay server-side.
- Economy: `src/sim/economy/**`, `tests/economy/**`. Exports from `src/sim/economy/index.js`: `createInitialState(companyId)`, `quoteAction(state, action)` returning `{ debitPence, creditPence }`, and `applyAction(state, action, { commandId, receiptId, occurredAt })` returning `{ state, receipt }`. Kernel throws errors with contract code/message for rejected actions. Backend executes this pure kernel inside its transaction; quote IDs, expiry, sessions and idempotency remain Backend responsibilities. No independently reimplemented rules.
- UI: `src/ui/**`. Export `mountUI(container, { api, onState })` returning `{ destroy() }`. Fetch/refresh state through api; call onState after accepted snapshots. No economic mutation in browser.
- World: `src/world/**`, `public/assets/**`. Export `createWorld(app)` from `src/world/index.js`, returning `{ setState(state), destroy() }`. Only visuals; no balances, travel or damage resolution.
- Combat: `src/sim/combat/**`, `tests/combat/**`; subsequent milestone.
- Deploy: `scripts/release/**`, deployment manifests/receipts. Vite emits `dist/`; serve client and proxy `/api/` under one HTTPS origin. No secrets in `VITE_*`.
- Auditor: independent review receipts. Other lanes do not edit Lead-owned files or package/lock; request dependency changes through Strategy.

## Session and transport

JSON over same-origin HTTPS. POST `/api/v1/session` (empty object) creates or resumes a guest account/company using a server-issued opaque cookie. Cookie is HttpOnly, Secure in production, SameSite=Lax, Path=/; persist for repeat visits. Reject cross-origin mutation requests by validating Origin against the configured site origin; no permissive credentialed CORS. Never accept owner identity in command bodies. Backend may map sessions to Supabase internally; browser gets no service key. Guest persistence is browser-specific, not cross-device recovery. GET `/api/v1/state` resumes the authenticated company. Missing/expired sessions return 401; do not silently create a new company on command failure. No reset endpoint in this slice. If an unknown command is pending, an expired/missing session must not silently create a new company; UI presents recovery failure and preserves the original company/command record.

All success responses include `apiVersion: 1`. Session/state return `{ apiVersion, state }`. Read responses are `Cache-Control: no-store`. First session initializes exactly one freighter, three crew, £25,000 (2500000 pence), Earth location and empty cargo.

## State

`state = { companyId, revision, locationId, cashPence, ship, crew, markets, routes, finances, receipts }`.

- IDs are opaque strings except locations `earth` / `eden`; revision is a nonnegative safe integer increasing on every committed command.
- `ship = { id, name, capacityUnits, cargo: [{ commodityId, quantity, costBasisPence }] }`.
- `crew = [{ id, name, role }]`; initial roles captain/engineer/trader.
- `markets = [{ locationId, revision, commodities: [{ id, name, stockUnits, buyUnitPence, sellUnitPence }] }]`. Markets and stock are company-local in this prototype, not shared across players. Display prices are indicative; server quotes calculate the exact total, including stock-sensitive pricing. No client price interpolation.
- `routes = [{ from, to, travelCostPence }]`; cost includes fuel for this first slice, with no separate fuel inventory. Travel resolves immediately server-side; UI animation is presentation.
- `receipts` is a recent bounded list of committed Receipt objects. Backend retains the complete ledger and cumulative finances even if older rows are omitted from state.
- Quantities/capacity/stock are whole nonnegative safe integers. Currency is integer pence; all totals must remain safe integers. Cargo sum cannot exceed capacity. Server time and state are authoritative.

## Quotes and commands

POST `/api/v1/quotes`: `{ action }`, where action is `{ type: 'buy' | 'sell', commodityId, quantity }` or `{ type: 'travel', destinationId }`. Server uses current company location, validates a positive integer quantity, ownership, stock, affordability/capacity, destination and price rules. Response `{ apiVersion, quote }`.

`quote = { id, action, expectedRevision, expiresAt, debitPence, creditPence }`; expiresAt is an ISO UTC string. Quote is bound to the authenticated company and exact action. Server retains the applicable market revision/pricing inputs. Quotes reserve nothing; another trade may invalidate them. A fresh quote is required after state/price changes.

POST `/api/v1/commands`: `{ commandId, quoteId, expectedRevision }`. commandId is a client-generated UUID; retain it with the exact request for retry after network failure. Response `{ apiVersion, commandId, state, receipt, replayed }`.

Backend validates quote ownership/expiry/current market revision and company revision, then atomically updates cash, cargo, stock/location, company revision, ledger and command receipt. Backend owns explicit request/body/quantity/identifier/rate limits, documented alongside its implementation. No partial changes. Travel charges once and moves between Earth/Eden once. A rejected command commits no economic changes. Concurrent requests must not overspend, oversell or overfill.

Idempotency lookup precedes stale-quote/revision checks: the same company + commandId + identical payload returns the stored original response with replayed=true, even after quote expiry. Same ID with a different payload returns IDEMPOTENCY_CONFLICT. Store the receipt/result in the same transaction as the economic changes. An old replay snapshot can be older than current state: UI ignores lower revisions and refreshes GET state. Before sending, UI durably persists the exact command payload plus companyId in browser storage; if persistence fails, do not send. Recover pending commands across reload, verify the session still belongs to the recorded company, and retry the identical payload. Clear pending state only after a verified result or known rejection. Network failure means unknown outcome; retry the identical command, never invent a new ID until outcome is known. ApiError exposes outcomeUnknown and commandId; malformed JSON, incomplete results, transport failure and 5xx are unknown command outcomes. Do not generate a new quote or command ID for those retries.

## Receipts and cumulative accounting

`receipt = { id, commandId, action, locationBefore, locationAfter, debitPence, creditPence, cashAfterPence, realizedProfitPence, revision, occurredAt }`. receipt.realizedProfitPence is the command delta: zero for purchases; sale proceeds minus allocated cargo cost basis for sells; negative travel cost for travel.

`state.finances = { purchasesPence, salesPence, salesCostBasisPence, travelPence, netCashFlowPence, realizedProfitPence }`. Initialize all at zero; update cumulatively and exactly once. netCashFlowPence = salesPence - purchasesPence - travelPence; realizedProfitPence = salesPence - salesCostBasisPence - travelPence. Initial cash is excluded from these flow totals. No recurring crew wages in this bounded first slice; a wage rule requires an explicit later contract extension.

Economy uses BigInt intermediate arithmetic or documented exact safe bounds for multiplication before division; all persisted/API amounts remain safe integer numbers. Backend tracks weighted-average cargo cost basis in integer pence: a partial sale allocates floor(total basis × sold quantity / held quantity); selling the final units consumes all remaining basis. UI shows realized profit/loss, net cash flow and remaining cargo separately. Unsold cargo is not a realized loss. Cost basis updates occur in the same trade transaction. Trip completion summaries are deferred: cumulative totals include return cargo sales at Earth without ambiguous closure timing.

## Errors

Non-2xx JSON: `{ apiVersion: 1, error: { code, message, retryable } }`. No success fallback, balances or secrets in errors. GET state after conflicts to recover the current authoritative snapshot.

- 400 INVALID_REQUEST (including malformed IDs, quantity/revision, unknown action).
- 401 SESSION_REQUIRED; 403 FORBIDDEN (ownership/origin).
- 404 NOT_FOUND (unknown commodity/route/quote).
- 409 STALE_STATE, STALE_QUOTE, IDEMPOTENCY_CONFLICT, INSUFFICIENT_CASH, INSUFFICIENT_STOCK, INSUFFICIENT_CARGO, CAPACITY_EXCEEDED, INVALID_ROUTE.
- 410 QUOTE_EXPIRED.
- 429 RATE_LIMITED; 503 UNAVAILABLE (retryable=true; respect Retry-After).

Economic/validation errors are retryable=false: change intent or refresh/requote. Timeouts/transport errors may have committed; use the same command ID. No client-side economic fallback during outage.

## Integration checks

Real backend checks: isolated guest ownership; duplicate and conflicting command IDs; concurrent spend/stock/capacity; expired/stale quotes; rejected-command rollback; exact cumulative/cost-basis arithmetic; state recovery after response loss and browser reload. UI disables duplicate submission, preserves unknown-outcome requests, and handles offline/conflicts explicitly. World consumes snapshots without modifying them. Lead tests a complete Earth–Eden–Earth path against the real API. Build/package/browser/device evidence remain separate; Deploy receives reviewed candidate identity and rollback instructions.
