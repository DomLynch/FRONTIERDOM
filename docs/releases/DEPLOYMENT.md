# FRONTIERDOM deployment contract — 5 October 2026

Deploy owns `deploy/`, `scripts/release/`, and `docs/releases/` on branch `deploy/preparation`, based on `15a69c78ad72e1200d99f1aa4efae49af6be4faa`. No root package files or game implementation are changed. Lead accepts integration; Auditor reviews the frozen candidate. Owner live-publish authorization is already present. Activation waits for their release evidence, not a new confirmation.

## Verified infrastructure

VPS `49.12.7.18`: Nginx on ports 80/443, Node `/usr/bin/node` v22.23.2. Both domain A records point here; no AAAA records observed. Port `127.0.0.1:3097` was free at inspection, not reserved by a running process. Source mirror is `/root/projects/FRONTIERDOM`; never build inside a live release.

Dedicated prerequisites: `/var/www/frontierdom/releases/`, ACME webroot `/var/www/frontierdom/acme/`, durable runtime data `/srv/frontierdom/shared/`, private configuration `/etc/frontierdom/`, vhost `/etc/nginx/sites-available/frontierdom.conf` with its dedicated enabled symlink. Certificate: `/etc/letsencrypt/live/frontierdom.com/`, covering apex and www, expires 2027-01-03. Maintenance vhost serves HTTPS 503 until activation, no placeholder game. Existing Nginx warnings about unrelated duplicate names predate this work; unrelated configs are unchanged.

## Candidate inputs and packaging

Lead supplies a frozen tested Git SHA, exact engine version, an artifact containing `client/index.html` and all client assets, and a self-contained optional `server/` runtime. API template proposes `server/server.mjs`, listening on `HOST=127.0.0.1`, `PORT=3097`, with durable state at `FD_DATA_DIR=/srv/frontierdom/shared`. Lead/Backend must confirm these environment names, entrypoint and health route before service installation. Runtime dependencies must be bundled or included in the package; deployment does not install dependencies. Backend owns state provisioning and migration/backup semantics. Secrets remain in `/etc/frontierdom/api.env`, never client files or release artifacts.

`/api/` is proxied with its full path preserved. Prove API authority, cookie/session behavior and client trade flows against this same-origin arrangement. Service template uses dedicated `frontierdom` user and restricts writes to the durable data directory; user/service creation remains pending confirmed runtime requirements.

Run `scripts/release/package.py ARTIFACT OUTPUT --source FULL_SHA --engine EXACT_VERSION --editor-mode code-first` for the first code-first candidate. This explicitly records that the blank Editor scene is not its runtime export. For a real Editor export use `--editor-mode export --checkpoint CHECKPOINT --export-sha256 SHA256`. Project `1613265` and scene `2612405` are recorded; never fabricate a checkpoint or claim Editor equivalence for code-first code.

The deterministic content digest covers prebuilt files. `client/release.json` exposes source/engine/Editor/content identity; `manifest.json` lists every packaged file digest, including release.json. Verify with `python3 scripts/release/verify.py PACKAGE` before installation. A manifest asserts supplied source provenance; Lead's build receipts establish that the bytes were built from that SHA. Keep receipts for tests, build, browser and device checks distinct.

## Installation, activation and rollback

1. Stage the verified package as a new `/var/www/frontierdom/releases/FULL_SHA-CONTENT_DIGEST/`; refuse an existing directory. Recheck digests after transfer. Make files readable by Nginx and API user, and prevent runtime writes into the release. Preserve immutable previous releases.
2. Before testing the API, Backend supplies dedicated configuration and confirms schema compatibility, durable state and recovery. Start only the FRONTIERDOM service with confirmed entrypoint; inspect loopback health, logs and a real trade round trip. A candidate may be previewed over an SSH tunnel without switching the public vhost.
3. Lead and Auditor approve the exact package identity and receipts. Record prior `current` target and copy only the FRONTIERDOM vhost into a dated FRONTIERDOM receipt folder. No initial prior game exists: rollback of the first release means maintenance mode plus API shutdown, preserving data.
4. Switch `current` using a temporary symlink and atomic rename on the same filesystem. Restart only `frontierdom-api`; install the release vhost, run `nginx -t`, then reload Nginx. If syntax fails, restore only the FRONTIERDOM vhost before reloading. Verify HTTPS apex/www, `/release.json`, asset hashes, same-origin API and gameplay on the served release. No build happens here.
5. On failed activation, restore the prior symlink, restart only the FRONTIERDOM service and restore its prior vhost. For first release restore maintenance vhost and stop API. Never roll back persistent data blindly: Backend determines compatibility and restores only from a reviewed backup if needed.

Existing Certbot renewal scheduling is reused. No new timer, paid resource, database, or public game activation is part of preparation. Certificate renewal must reload Nginx through the existing host renewal mechanism; confirm it before claiming long-term TLS operation.
