# Auth release deployment requirements — 5 October 2026

Owner selected dedicated Supabase plus Google login. Lead owns organization/project/cost and provider setup; Backend owns auth, schema, connection and session semantics. Deploy awaits the new reviewed frozen candidate and supplied runtime secrets. Preserve the old private `4059999` / `abadc9178b68caa6cde19b2845c07b5ad905ba6e608e10d9416619d3c67f163f` package and its receipts; it is not the requested auth-enabled release. Public hosting remains maintenance 503.

## Callback and proxy contract

- Canonical app origin: `https://frontierdom.com`; app callback: `https://frontierdom.com/api/v1/auth/callback`. Existing `/api/` proxy preserves the full path and query string. HTTPS www redirects to apex in the accepted release template; do not allow an independent www login origin.
- Backend supplies auth start/callback/logout/session endpoints and exact expected cookies. API responses, including redirects/errors that carry auth state, must be `Cache-Control: no-store`; disable proxy caching for `/api/`. Preserve every upstream `Set-Cookie` response and incoming `Cookie`; do not rewrite cookie domain/path without Backend agreement. Default Nginx cookie forwarding must not be disabled by added proxy directives.
- Production cookies must match Backend's reviewed HTTPS policy. Check Secure/HttpOnly/SameSite/Path, OAuth state/PKCE cookie lifetime, and logout expiry through the actual proxy. No-store applies to callback responses even when 302. Auth secrets/codes/tokens must not appear in access logs: disable callback access logging or use a query-free log format before activation; preserve diagnostic status without logging credential values.
- Keep `X-Real-IP $remote_addr`, forwarded scheme and trusted loopback backend. Do not accept client-supplied identity headers. API listens only on loopback; the public client never receives database credentials or privileged Supabase keys.

## Provider and Supabase prerequisites

Lead must supply the exact dedicated project reference and configured provider URLs, never inferred or copied from another game. Google OAuth's authorized redirect is the project's Supabase callback shown by the Google provider page; the app callback above is the Supabase return/redirect allow-list entry. They are separate URLs. Use exact production entries, not broad wildcard origins. Backend confirms code-exchange and callback handling, error/cancel flow and allowed post-login destination. [Official Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google).

Private `/etc/frontierdom/api.env` supplies `DATABASE_URL`, exact `SITE_ORIGIN=https://frontierdom.com`, `NODE_ENV=production`, `PORT=3097`, and Backend's final named auth variables. Do not invent variable names or include secrets in release inventory. Record a configuration version without values alongside the candidate. Google client secret stays in the designated provider/server secret store; a publishable frontend key is distinct from a privileged service secret.

Backend supplies a restricted database login, schema/migration receipt, connectivity and effective-role checks. Require encryption plus hostname/certificate verification using reviewed node-postgres TLS settings and a trusted CA where necessary; never use `rejectUnauthorized=false`. Obtain the actual endpoint from Supabase's Connect dialog. A persistent VPS service may use a reachable direct connection or session pooler; Backend must select mode and prove any pooler/session assumptions. Do not silently choose transaction mode or buy IPv4 capacity. [Official connection/TLS guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Frozen package and release checks

The new candidate must bind its actual source SHA, locked dependencies, rebuilt client, auth server/modules, schema version, engine and code-first identity. Repeat the existing production-dependency assembly and inventory verification for changed inputs. Include all new auth imports; do not reuse the old guest package as the final release.

Lead/Auditor acceptance needs real Google login and callback through apex HTTPS, persisted identity/company recovery after reload and service restart, logout, cancelled/failed login, rejected invalid state, and a real authenticated trade. Record actual Supabase connection and restricted-role evidence separately from isolated local-Postgres tests. Validate no-store and all Set-Cookie headers on redirect responses, plus www-to-apex behavior. Automatic TLS renewal is already verified; no new timer/monitor is needed.

## Rollback

Before activation Backend supplies a consistent dedicated backup/restore receipt and a schema compatibility statement for the prior reviewed auth-capable release. Code rollback preserves committed company/trade/session data; it does not revert money or blindly restore the database. Keep runtime configuration versions compatible with the selected code. The preserved guest package is not an automatic rollback target after Google identity/account migrations: Backend and Auditor must explicitly establish safe compatibility. Until an auth-capable prior release exists, rollback means maintenance vhost and API shutdown while preserving the database and secrets. Do not revert provider URLs or delete identities as an incidental deployment rollback.
