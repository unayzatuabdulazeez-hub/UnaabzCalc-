#!/usr/bin/env bash
# Applies ALL migrations (in order) to a fresh throwaway local Postgres per test file, then runs the checks.
# Needs Postgres 15+ binaries (initdb, pg_ctl, psql). Must not run as root (Postgres refuses root).
# Usage: bash supabase/tests/run_rls_tests.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PGBIN="${PGBIN:-$(dirname "$(command -v initdb || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
DIR="$(mktemp -d)"; PORT="${PGPORT_TEST:-54329}"
cleanup() { "$PGBIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
"$PGBIN/initdb" -D "$DIR/data" -A trust -U postgres >/dev/null
"$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" -w start >/dev/null
P="$PGBIN/psql -h $DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
STATUS=0
for T in "$HERE"/[1-9]*_*.sql; do
  DB="t_$(basename "$T" .sql)"
  $P -d postgres -c "create database \"$DB\"" >/dev/null
  $P -d "$DB" -f "$HERE/00_supabase_stub.sql" >/dev/null
  for M in "$HERE"/../migrations/*.sql; do $P -d "$DB" -f "$M" >/dev/null && echo "applied $(basename "$M")"; done
  echo "--- $(basename "$T")"
  $P -d "$DB" -f "$T" 2>&1 | sed -e 's/^psql:[^ ]* //' -e 's/^NOTICE:  //' | tee "$DIR/out.txt"
  grep -q -E "FAILED 0|MISMATCHES 0" "$DIR/out.txt" || STATUS=1
done
exit $STATUS
