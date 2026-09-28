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
import uuid
from pathlib import Path

from .runner import WorkerConfig, process_one
from .supabase_store import SupabaseJobStore


def _load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def main(argv=None) -> int:
    _load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    p = argparse.ArgumentParser(prog="picklepro.worker")
    p.add_argument("--once", action="store_true", help="Process at most one job and exit")
    p.add_argument("--mode", choices=["measured", "test_fixture"], default=os.getenv("WORKER_RESULT_MODE", "measured"),
                   help="test_fixture records a clearly labelled canned result instead of analyzing the video")
    p.add_argument("--poll-interval", type=float, default=float(os.getenv("WORKER_POLL_INTERVAL_S", "5")))
    p.add_argument("--lease-seconds", type=int, default=int(os.getenv("WORKER_LEASE_SECONDS", "300")))
    p.add_argument("--detector", choices=["motion", "yolo"], default=os.getenv("PICKLEPRO_DETECTOR", "motion"))
    p.add_argument("--yolo-weights", default=os.getenv("PICKLEPRO_YOLO_WEIGHTS"))
    p.add_argument("--court-weights", default=os.getenv("PICKLEPRO_COURT_WEIGHTS"))
    p.add_argument("--ball-weights", default=os.getenv("PICKLEPRO_BALL_WEIGHTS"))
    args = p.parse_args(argv)

    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    log = logging.getLogger("picklepro.worker")

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
        log.info("signal %s received; stopping after the current step", signum)
        stop.set()

    signal.signal(signal.SIGINT, _handle)
    signal.signal(signal.SIGTERM, _handle)

    while not stop.is_set():
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
