#!/usr/bin/env bash
# Apply the migrations to a throwaway local PostgreSQL cluster (with a small
# stub of Supabase's auth/storage schemas) and run the access + job tests.
#
# Requires PostgreSQL >= 15 binaries (initdb, pg_ctl, psql) on PATH. Does not
# need Docker or Supabase credentials. This does NOT prove behaviour on hosted
# Supabase; see docs/SUPABASE_SETUP.md for the on-project verification steps.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS="$HERE/../migrations"
PORT="${PGTEST_PORT:-54329}"
TMP="$(mktemp -d)"

cleanup() {
  pg_ctl -D "$TMP/data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

# The Homebrew postmaster refuses to start without a valid locale.
export LC_ALL=C
initdb -D "$TMP/data" -U postgres --auth=trust --encoding=UTF8 --locale=C >/dev/null
# TCP on localhost only; unix sockets are disabled because macOS temp paths
# exceed the 103-byte socket path limit.
if ! pg_ctl -D "$TMP/data" -o "-p $PORT -c listen_addresses=localhost -c unix_socket_directories=''" \
    -l "$TMP/pg.log" -w start >/dev/null; then
  cat "$TMP/pg.log"; exit 1
fi

PSQL=(psql -h localhost -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -X -q)

"${PSQL[@]}" -f "$HERE/local/00_supabase_stub.sql"
for f in "$MIGRATIONS"/*.sql; do
  if [ "$(basename "$f")" = "20260929000200_versioned_analysis_runs.sql" ]; then
    "${PSQL[@]}" -f "$HERE/local/04_legacy_run_fixture.sql"
  fi
  echo "applying $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
# The hosted ITISDEV project uses this idempotent upgrade path. Check that it
# can be run again after the normal migrations without changing access tests.
"${PSQL[@]}" -f "$HERE/../scripts/itisdev_upgrade.sql" >/dev/null 2>&1
"${PSQL[@]}" -f "$HERE/local/05_helpers.sql"
"${PSQL[@]}" -f "$HERE/local/06_legacy_run_assertions.sql" 2>&1 >/dev/null | sed -e 's/^psql:[^ ]* NOTICE:  /  /'
"${PSQL[@]}" -f "$HERE/local/10_access_and_jobs.sql" 2>&1 >/dev/null | sed -e 's/^psql:[^ ]* NOTICE:  /  /'
"${PSQL[@]}" -f "$HERE/local/20_dev_mock_data.sql" 2>&1 >/dev/null | sed -e 's/^psql:[^ ]* NOTICE:  /  /'
"${PSQL[@]}" -f "$HERE/local/30_self_assessment.sql" 2>&1 >/dev/null | sed -e 's/^psql:[^ ]* NOTICE:  /  /'
# The self-assessment migration is documented as safe to paste again into an existing project.
"${PSQL[@]}" -c "set client_min_messages = warning" -f "$MIGRATIONS/20261006090000_self_assessment.sql" >/dev/null
echo "  PASS self-assessment migration can be applied twice"

# Concurrency: 20 simultaneous finalize calls (double clicks, two tabs) → one job.
"${PSQL[@]}" <<'SQL'
insert into auth.users (id, email) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c@example.test');
insert into public.sessions (id, owner_id, title, session_context, play_format)
values ('5c000000-0000-4000-8000-00000000000c', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'C', 'practice', 'singles');
insert into public.video_assets (id, owner_id, session_id, storage_path, original_filename, mime_type, byte_size)
values ('7c000000-0000-4000-8000-00000000000c', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '5c000000-0000-4000-8000-00000000000c',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc/5c000000-0000-4000-8000-00000000000c/7c000000-0000-4000-8000-00000000000c.mp4',
        'c.mp4', 'video/mp4', 1);
insert into storage.objects (bucket_id, name, metadata) values ('session-videos',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc/5c000000-0000-4000-8000-00000000000c/7c000000-0000-4000-8000-00000000000c.mp4', '{"size":1}');
SQL
pids=()
for _ in $(seq 1 20); do
  "${PSQL[@]}" -c "set role authenticated; select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false); select public.finalize_video_upload('7c000000-0000-4000-8000-00000000000c');" >/dev/null &
  pids+=($!)
done
for p in "${pids[@]}"; do wait "$p"; done
jobs=$("${PSQL[@]}" -tA -c "select count(*) from public.analysis_jobs where video_asset_id = '7c000000-0000-4000-8000-00000000000c'")
if [ "$jobs" != "1" ]; then
  echo "FAIL concurrent finalize created $jobs jobs"; exit 1
fi
echo "  PASS 20 concurrent finalize calls created exactly one job"
echo "LOCAL SQL TESTS PASSED ($(postgres --version))"
