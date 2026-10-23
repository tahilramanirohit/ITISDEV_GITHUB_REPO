#!/usr/bin/env bash
# Run the PicklePro video analyzer on this Mac. Phones upload videos to
# Supabase; this worker picks them up from there, so the Mac only needs an
# internet connection (no port forwarding). Keep the lid open and the charger
# in: `caffeinate` stops the Mac sleeping while the worker runs.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo "No Python environment in server/.venv. See docs/NEW_COMPUTER_SETUP.md."; exit 1
fi
if [ ! -f .env ]; then
  echo "Missing server/.env (Supabase URL and service key for the analyzer)."; exit 1
fi
echo "Checking the analyzer setup…"
.venv/bin/python -m picklepro.worker --check
echo
echo "Analyzer running. Leave this window open. Press Ctrl+C to stop."
exec caffeinate -dims .venv/bin/python -m picklepro.worker
