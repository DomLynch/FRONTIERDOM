#!/usr/bin/env bash
set -euo pipefail
case "$PWD" in /srv/dev-jobs/*/src) ;; *) echo 'Run only inside an isolated queued VPS source folder.' >&2; exit 1;; esac
: "${DATABASE_URL:?Use Backend isolated PostgreSQL helper first}"
mkdir -p artifacts/e2e
# Avoid colliding with other queue lanes or live services. Ask the OS for ports.
read -r PORT FRONTIERDOM_PREVIEW_PORT < <(node --input-type=module <<'JS'
import net from 'node:net';
const servers = [net.createServer(), net.createServer()];
await Promise.all(servers.map(server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve))));
console.log(servers.map(server => server.address().port).join(' '));
await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
JS
)
export PORT FRONTIERDOM_PREVIEW_PORT
export SITE_ORIGIN="http://127.0.0.1:$FRONTIERDOM_PREVIEW_PORT"
export FRONTIERDOM_TEST_URL="$SITE_ORIGIN"
export NODE_ENV=development TRUST_PROXY=0
# Production HTTPS/Secure-cookie and packaging checks remain separate acceptance gates.
node server/server.mjs > artifacts/e2e/api.log 2>&1 &
api_pid=$!
node tests/e2e/preview-server.mjs > artifacts/e2e/preview.log 2>&1 &
preview_pid=$!
cleanup() {
  kill "$preview_pid" "$api_pid" 2>/dev/null || true
  wait "$preview_pid" "$api_pid" 2>/dev/null || true
}
trap cleanup EXIT
node --input-type=module <<'JS'
let ready = false;
for (let n = 0; n < 50; n++) {
  try {
    const page = await fetch(process.env.SITE_ORIGIN);
    const api = await fetch(`${process.env.SITE_ORIGIN}/api/v1/state`);
    const body = await api.json();
    if (page.ok && api.status === 401 && body.error.code === 'SESSION_REQUIRED') { ready = true; break; }
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 100));
}
if (!ready) throw new Error('Real API and built-client preview did not become ready; inspect API/preview logs.');
JS
npm run test:e2e
