#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
test "$(id -u)" != 0 || { echo 'Run as the unprivileged VPS queue user.' >&2; exit 1; }
case "$PWD" in /srv/dev-jobs/*/src) ;; *) echo 'Refusing to start outside an isolated VPS job.' >&2; exit 1;; esac
pg_bin=/usr/lib/postgresql/16/bin
test -x "$pg_bin/initdb"
pg_root="$PWD/.backend-test-pg"
test ! -e "$pg_root"
mkdir -p "$pg_root/socket"
chmod 700 "$pg_root"
cleanup() {
  "$pg_bin/pg_ctl" -D "$pg_root/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$pg_root"
}
trap cleanup EXIT
"$pg_bin/initdb" -D "$pg_root/data" -A trust -U postgres > /dev/null
"$pg_bin/pg_ctl" -D "$pg_root/data" -l "$pg_root/postgres.log" \
  -o "-k $pg_root/socket -c listen_addresses='' -c max_connections=25" -w start > /dev/null
export PGHOST="$pg_root/socket" PGUSER=postgres PGDATABASE=postgres PGPORT=5432
psql -v ON_ERROR_STOP=1 -q -c 'create database frontierdom_test;'
export PGDATABASE=frontierdom_test
psql -v ON_ERROR_STOP=1 -q -c 'create role frontierdom_test login nosuperuser nobypassrls; create role anon nologin; create role authenticated nologin; create role service_role nologin;'
psql -v ON_ERROR_STOP=1 -q -f server/schema.sql
psql -v ON_ERROR_STOP=1 -q -c 'grant frontierdom_backend to frontierdom_test;'
# Lead owns root dependency/lock changes. Bootstrap only pg in this disposable
# job if it has not been integrated yet; no authored root package is modified.
if ! node --input-type=module -e "await import('pg')" 2>/dev/null; then
  deps="$PWD/.backend-test-deps"
  mkdir "$deps"
  printf '%s\n' '{"private":true}' > "$deps/package.json"
  npm install --prefix "$deps" --ignore-scripts --no-audit --no-fund --package-lock=false pg@8.23.1
  ln -s "$deps/node_modules" node_modules
fi
export DATABASE_URL="postgresql://frontierdom_test@localhost/frontierdom_test?host=$PGHOST"
export TEST_ADMIN_DATABASE_URL="postgresql://postgres@localhost/frontierdom_test?host=$PGHOST"
if [ "$#" -gt 0 ]; then
  "$@"
else
  node --test --test-concurrency=1 tests/backend/backend.test.mjs tests/economy/economy.test.js
fi
