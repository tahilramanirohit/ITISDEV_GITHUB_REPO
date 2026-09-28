#!/usr/bin/env bash
# Apply supabase/scripts/itisdev_upgrade.sql (twice) to a throwaway local
# PostgreSQL database shaped like the old ITISDEV project, then run the same
# access, job and dev-mock tests as run_local_rls_tests.sh.
#
# Requires PostgreSQL >= 15 binaries (initdb, pg_ctl, psql) on PATH.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
UPGRADE="$HERE/../scripts/itisdev_upgrade.sql"
PORT="${PGTEST_PORT:-54330}"
TMP="$(mktemp -d)"

cleanup() {
  pg_ctl -D "$TMP/data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

export LC_ALL=C
initdb -D "$TMP/data" -U postgres --auth=trust --encoding=UTF8 --locale=C >/dev/null
if ! pg_ctl -D "$TMP/data" -o "-p $PORT -c listen_addresses=localhost -c unix_socket_directories=''" \
    -l "$TMP/pg.log" -w start >/dev/null; then
  cat "$TMP/pg.log"; exit 1
fi

PSQL=(psql -h localhost -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -X -q)

"${PSQL[@]}" -f "$HERE/local/00_supabase_stub.sql"
"${PSQL[@]}" -f "$HERE/local/01_itisdev_legacy_schema.sql"
# PostgREST is not running locally; NOTIFY on an unlistened channel is harmless.
for run in 1 2; do
  echo "applying itisdev_upgrade.sql (run $run)"
  "${PSQL[@]}" -f "$UPGRADE" >/dev/null 2>&1 || { "${PSQL[@]}" -f "$UPGRADE"; exit 1; }
done

check() {
  local got
  got=$("${PSQL[@]}" -tA -c "$2")
  if [ "$got" != "$3" ]; then echo "FAIL $1: got '$got', expected '$3'"; exit 1; fi
  echo "  PASS $1"
}
check "legacy row kept with defaults" \
  "select session_context || '/' || play_format || '/' || performance_scope from public.sessions where title = 'Legacy session'" \
  "practice/singles/individual"
check "over-broad legacy policy removed" \
  "select count(*) from pg_policies where tablename = 'sessions' and policyname = 'Enable read access for all users'" "0"
check "owner_id is required" \
  "select is_nullable from information_schema.columns where table_name = 'sessions' and column_name = 'owner_id'" "NO"

"${PSQL[@]}" -f "$HERE/local/05_helpers.sql"
"${PSQL[@]}" -f "$HERE/local/10_access_and_jobs.sql" 2>&1 >/dev/null | sed -e 's/^psql:[^ ]* NOTICE:  /  /'
"${PSQL[@]}" -f "$HERE/local/20_dev_mock_data.sql" 2>&1 >/dev/null | sed -e 's/^psql:[^ ]* NOTICE:  /  /'
echo "UPGRADE SCRIPT TESTS PASSED ($(postgres --version))"
