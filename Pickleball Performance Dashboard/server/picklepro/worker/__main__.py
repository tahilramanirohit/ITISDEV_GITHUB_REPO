"""Run the analysis worker against Supabase.

    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python -m picklepro.worker [--once] [--mode measured|test_fixture]

Configuration is read from the environment (see server/.env.example); a
``.env`` file next to this package's parent directory is loaded if present.
"""

from __future__ import annotations

import argparse
import logging
import os
import signal
import socket
import sys
import threading
import time
import uuid
from pathlib import Path

from ..models import SERVER_DIR, load_dotenv, log_setup, resolve_models
from .runner import WorkerConfig, process_one
from .supabase_store import SupabaseJobStore


def _project_ref(url: str | None) -> str | None:
    if not url:
        return None
    host = url.split("//", 1)[-1].split("/", 1)[0]
    return host.split(".", 1)[0] or None


def supabase_mismatch(worker_url: str | None, web_env: Path = SERVER_DIR.parent / ".env.local") -> str | None:
    """Warn when the web app and the worker point at different Supabase projects.

    Jobs created by the web app are then never seen by this worker.
    """
    if not web_env.is_file():
        return None
    web_url = next((line.split("=", 1)[1].strip().strip('"').strip("'")
                    for line in web_env.read_text().splitlines()
                    if line.strip().startswith("VITE_SUPABASE_URL=")), None)
    web, worker = _project_ref(web_url), _project_ref(worker_url)
    if web and worker and web != worker:
        return (f"The web app uses Supabase project '{web}' but this worker uses '{worker}'. "
                f"Uploaded videos will wait forever. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env "
                f"to project '{web}'.")
    return None


def main(argv=None) -> int:
    load_dotenv()
    models = resolve_models()
    p = argparse.ArgumentParser(prog="picklepro.worker")
    p.add_argument("--once", action="store_true", help="Process at most one job and exit")
    p.add_argument("--mode", choices=["measured", "test_fixture"], default=os.getenv("WORKER_RESULT_MODE", "measured"),
                   help="test_fixture records a clearly labelled canned result instead of analyzing the video")
    p.add_argument("--poll-interval", type=float, default=float(os.getenv("WORKER_POLL_INTERVAL_S", "5")))
    p.add_argument("--lease-seconds", type=int, default=int(os.getenv("WORKER_LEASE_SECONDS", "300")))
    p.add_argument("--detector", choices=["motion", "yolo"], default=models.detector)
    p.add_argument("--yolo-weights", default=models.yolo_weights)
    p.add_argument("--court-weights", default=models.court_weights)
    p.add_argument("--ball-weights", default=models.ball_weights)
    p.add_argument("--check", action="store_true", help="Print the model and database setup, then exit")
    args = p.parse_args(argv)

    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    log = logging.getLogger("picklepro.worker")
    log_setup(models, log)
    web_env = Path(os.getenv("PICKLEPRO_WEB_ENV", str(SERVER_DIR.parent / ".env.local")))
    mismatch = supabase_mismatch(os.getenv("SUPABASE_URL"), web_env)
    if mismatch:
        log.error(mismatch)
    if args.check:
        print(f"supabase project: {_project_ref(os.getenv('SUPABASE_URL')) or 'not set'}")
        for key, value in models.describe().items():
            print(f"{key}: {value}")
        return 1 if mismatch else 0

    try:
        store = SupabaseJobStore.from_env()
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    cfg = WorkerConfig(worker_id=f"{socket.gethostname()}-{uuid.uuid4().hex[:8]}", mode=args.mode,
                       lease_seconds=args.lease_seconds, detector=args.detector,
                       yolo_weights=args.yolo_weights, court_weights=args.court_weights,
                       ball_weights=args.ball_weights)
    log.info("worker %s starting (mode=%s, detector=%s)", cfg.worker_id, cfg.mode, cfg.detector)
    if cfg.mode == "test_fixture":
        log.warning("TEST FIXTURE MODE: results are canned test data, not analysis of uploaded videos.")

    stop = threading.Event()

    def _handle(signum, _frame):
        if stop.is_set():
            # Second Ctrl+C: leave now. A job in progress is retried once its lease expires.
            log.warning("signal %s received again; exiting immediately", signum)
            os._exit(130)
        log.info("signal %s received; stopping within a few seconds (press Ctrl+C again to exit now)", signum)
        stop.set()

    signal.signal(signal.SIGINT, _handle)
    signal.signal(signal.SIGTERM, _handle)

    next_retention_sweep = 0.0
    while not stop.is_set():
        if time.monotonic() >= next_retention_sweep:
            try:
                deleted = 0
                while not stop.is_set() and deleted < 20 and store.delete_one_expired_video():
                    deleted += 1
                if deleted:
                    log.info("deleted %s expired raw videos", deleted)
            except Exception:
                log.exception("raw video retention sweep failed")
            next_retention_sweep = time.monotonic() + 3600
        try:
            outcome = process_one(store, cfg, stop)
        except Exception:  # noqa: BLE001 - e.g. the database is unreachable; back off and retry
            log.exception("worker loop error")
            outcome = None
        if outcome is not None:
            log.info("job %s -> %s%s", outcome.job_id, outcome.status,
                     f" ({outcome.error_code})" if outcome.error_code else "")
        if args.once:
            break
        if outcome is None:
            stop.wait(args.poll_interval)
    return 0


if __name__ == "__main__":
    sys.exit(main())
