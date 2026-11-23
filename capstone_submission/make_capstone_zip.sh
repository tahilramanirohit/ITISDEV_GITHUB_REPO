#!/usr/bin/env bash
# Builds PicklePro_Capstone_Files.zip (items a–e of the Capstone Project Files) from this repository.
#
#   bash capstone_submission/make_capstone_zip.sh [output-folder]
#
# Only files tracked by Git are copied, so .env / .env.local (keys and passwords) never get in.
# The AI model files are not in Git: run `python -m picklepro.fetch_models` in the server folder first
# (start_worker.bat does it), or the zip is built without them and says so.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTDIR="$(mkdir -p "${1:-$ROOT/capstone_submission/build}" && cd "${1:-$ROOT/capstone_submission/build}" && pwd)"
NAME="PicklePro_Capstone_Files"
OUT="$OUTDIR/$NAME"
APP="Pickleball Performance Dashboard"
NOTES="$ROOT/capstone_submission/notes"
cd "$ROOT"
rm -rf "$OUT" "$OUTDIR/$NAME.zip"
A="$OUT/a_Database_Creation_Scripts"; B="$OUT/b_Program_Codes"; C="$OUT/c_Test_Data_Scripts_Files"
D="$OUT/d_Other_System_Files"; E="$OUT/e_Installers_and_Other_Software"
mkdir -p "$A/migrations" "$A/upgrades" "$B" "$C"/{demo_data,test_videos,shot_labels,analysis_fixtures} \
  "$D"/{ai_models,settings_templates} "$E/scripts"

tracked() { git ls-files -z -- "$@"; }
copy_tree() { # copy tracked files keeping their paths: copy_tree <dest> <pathspec...>
  local dest="$1"; shift
  tracked "$@" | while IFS= read -r -d '' f; do mkdir -p "$dest/$(dirname "$f")"; cp -p "$f" "$dest/$f"; done
}

# a. Database creation scripts
cp supabase/scripts/new_project_setup.sql supabase/scripts/check_database.sql supabase/scripts/make_new_project_setup.sh supabase/config.toml "$A/"
cp supabase/migrations/*.sql "$A/migrations/"
cp supabase/scripts/pickleproapp_upgrade*.sql supabase/scripts/itisdev_upgrade.sql "$A/upgrades/"
cp "$NOTES/A_DATABASE.md" "$A/README.md"

# b. Program codes: the whole app folder except videos and PDFs (those go to c and d). Same layout as
# the repository: some unit tests read the shot labels (eval/) and ../supabase/migrations.
copy_tree "$B" "$APP" ":(exclude)*.mp4" ":(exclude)*.pdf" ":(exclude)$APP/ATTRIBUTIONS.md"
copy_tree "$B" supabase/migrations
cp "$NOTES/B_PROGRAM_CODES.md" "$B/README.md"

# c. Test data
cp supabase/scripts/demo_data.sql supabase/scripts/link_rohit_carla.sql supabase/scripts/buddy_request_for_rohit.sql "$C/demo_data/"
# Database tests keep the repository's supabase/ layout (tests/, migrations/, scripts/), which the runner expects.
(cd supabase && git ls-files -z tests migrations scripts | while IFS= read -r -d '' f; do mkdir -p "$C/database_tests/$(dirname "$f")"; cp -p "$f" "$C/database_tests/$f"; done)
cp "$APP"/*.mp4 "$C/test_videos/"
cp "$APP"/eval/*.json "$C/shot_labels/"
cp "$APP"/contracts/fixtures/*.json "$C/analysis_fixtures/"
{
  cat "$NOTES/C_TEST_DATA.md"
  echo; echo "### Web app test files ($(git ls-files -- "$APP/src" | grep -cE '\.test\.tsx?$'))"; echo
  git ls-files -- "$APP/src" | grep -E '\.test\.tsx?$' | sed "s#^$APP/#- #"
  echo; echo "### Analyzer test files ($(git ls-files -- "$APP/server/tests" | grep -c 'test_.*\.py$'))"; echo
  git ls-files -- "$APP/server/tests" | grep 'test_.*\.py$' | sed "s#^$APP/#- #"
  echo; echo "### Database test files ($(git ls-files -- supabase/tests/local | grep -c '\.sql$'))"; echo
  git ls-files -- supabase/tests/local | sed 's#^supabase/#- database_tests/#'
} > "$C/README.md"

# d. Other system files
for f in "PicklePro_Requirements_and_Architecture_v4.pdf" "PB CAPSTONE NOTES.pdf" "$APP/WORKING-CAP-PROPOSAL.pdf"; do cp "$f" "$D/"; done
cp README.md "$D/PROJECT_README.md"; cp HANDOFF.md PICKLEPRO_RUN_AND_HANDOFF.md "$APP/ATTRIBUTIONS.md" "$D/"
copy_tree "$D" docs
cp "$APP/.env.example" "$D/settings_templates/website.env.example"
cp "$APP/server/.env.example" "$D/settings_templates/analyzer.env.example"
missing=""
for m in yolo11n.pt yolo11n-pose.pt court_best.pt "ball,person,paddle.pt"; do
  if [ -f "$APP/server/models/$m" ]; then cp "$APP/server/models/$m" "$D/ai_models/"; else missing="$missing $m"; fi
done
cp "$NOTES/D_OTHER_SYSTEM_FILES.md" "$D/README.md"
[ -z "$missing" ] || { echo "NOTE: models not found, left out:$missing" >&2; echo -e "\n**Not included in this copy:**$missing (run \`python -m picklepro.fetch_models\`)." >> "$D/README.md"; }

# e. Installers and other software
cp "$APP/start_website.bat" "$APP/server/start_worker.bat" "$APP/server/PicklePro Analyzer (On-Off).bat" \
   "$APP/server/start_mac_worker.sh" "$APP/server"/requirements*.txt "$E/scripts/"
cp "$NOTES/E_INSTALL_GUIDE.md" "$E/README.md"

# Index, with the exact code version
{ cat "$ROOT/capstone_submission/README.md"; echo; echo "---"; echo "Built from commit \`$(git rev-parse --short HEAD)\` ($(git log -1 --format=%cd --date=format:'%d %b %Y'))."; } > "$OUT/README.md"

# Safety check: no settings files with real values
if find "$OUT" -name ".env" -o -name ".env.local" -o -name "*.env.local" | grep -q .; then echo "Refusing: an .env file got in" >&2; exit 1; fi

(cd "$OUTDIR" && zip -qr "$NAME.zip" "$NAME")
echo "Built $OUTDIR/$NAME.zip ($(du -h "$OUTDIR/$NAME.zip" | cut -f1))"
