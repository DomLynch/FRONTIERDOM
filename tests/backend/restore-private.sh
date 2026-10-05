#!/usr/bin/env bash
# Restore a private-schema backup only into disposable queued PostgreSQL 17.
set -euo pipefail
test "$(id -u)" != 0
case "$PWD" in /srv/dev-jobs/*/src) ;; *) exit 1;; esac
dump=$(realpath "$1")
prefix=$(realpath "$2")
case "$dump" in "$PWD"/*) ;; *) exit 1;; esac
pg_bin="$prefix/usr/lib/postgresql/17/bin"
export LD_LIBRARY_PATH="$prefix/usr/lib/x86_64-linux-gnu"
pg_root="$PWD/.restore-pg"
test ! -e "$pg_root"
mkdir -m 700 "$pg_root"
mkdir "$pg_root/socket"
cleanup() {
  "$pg_bin/pg_ctl" -D "$pg_root/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$pg_root"
}
trap cleanup EXIT
"$pg_bin/initdb" -D "$pg_root/data" -A trust -U postgres >/dev/null
"$pg_bin/pg_ctl" -D "$pg_root/data" -l "$pg_root/postgres.log" \
  -o "-k $pg_root/socket -c listen_addresses='' -c max_connections=15" -w start >/dev/null
export PGHOST="$pg_root/socket" PGUSER=postgres PGDATABASE=postgres PGPORT=5432
"$pg_bin/psql" -v ON_ERROR_STOP=1 -q -c 'create database frontierdom_restore;'
"$pg_bin/psql" -v ON_ERROR_STOP=1 -q -c 'create role frontierdom_backend nologin nosuperuser nobypassrls;'
export PGDATABASE=frontierdom_restore
"$pg_bin/pg_restore" --exit-on-error --no-owner --no-privileges --dbname="$PGDATABASE" "$dump"
# Portable restore deliberately excludes hosted ownership/ACLs. Re-establish
# private runtime grants; browser roles receive no privileges.
"$pg_bin/psql" -v ON_ERROR_STOP=1 -q -c 'grant usage on schema frontierdom to frontierdom_backend; grant select,insert,update,delete on all tables in schema frontierdom to frontierdom_backend; create role frontierdom_restore_api login nosuperuser nobypassrls; grant frontierdom_backend to frontierdom_restore_api;'
"$pg_bin/psql" -v ON_ERROR_STOP=1 -qAt -c "select count(*)=7 and bool_and(relrowsecurity and relforcerowsecurity) from pg_class join pg_namespace on relnamespace=pg_namespace.oid where nspname='frontierdom' and relkind='r';" | grep -qx t
export PGUSER=frontierdom_restore_api
"$pg_bin/psql" -v ON_ERROR_STOP=1 -qAt -c "select json_build_object('companies',(select count(*) from frontierdom.companies),'sessions',(select count(*) from frontierdom.sessions),'quotes',(select count(*) from frontierdom.quotes),'commands',(select count(*) from frontierdom.commands),'rate_buckets',(select count(*) from frontierdom.rate_buckets),'oauth_flows',(select count(*) from frontierdom.oauth_flows),'account_sessions',(select count(*) from frontierdom.account_sessions));" > artifacts/restored-counts.json
python3 - <<'PY'
import json
from pathlib import Path
expected = json.loads(Path('backup-counts.json').read_text())
actual = json.loads(Path('artifacts/restored-counts.json').read_text())
assert actual == expected, 'Hosted snapshot/restore counts differ'
print(json.dumps({'private_schema_restore': 'passed', 'tables': 7, 'forced_rls': True,
                  'restricted_read': True, 'counts': actual, 'scope': 'private schema only; excludes Supabase Auth'}))
PY
