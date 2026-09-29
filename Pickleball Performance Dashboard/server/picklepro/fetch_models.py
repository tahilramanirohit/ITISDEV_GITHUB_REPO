"""Download the reviewed model weights into server/models, with checksum checks.

    python -m picklepro.fetch_models

Each file is pinned to an exact revision and SHA-256. A file that is already
present with the right checksum is left alone; a mismatching download is
deleted and reported. See docs/MODEL_SETUP.md for what each model does and the
licences involved (Ultralytics weights and runtime are AGPL-3.0).
"""

from __future__ import annotations

import hashlib
import sys
import urllib.request
from pathlib import Path

from .models import DEFAULT_MODELS_DIR

SUMAN_REV = "000b22e853dde9e36b4797dc68d9ba0dd2eea4ae"
SUMAN = f"https://github.com/sumanblack666/pickleball-analysis/raw/{SUMAN_REV}/models"
MODELS = [
    # (file name, url, sha256, purpose)
    ("court_best.pt", f"{SUMAN}/court_best.pt",
     "c67cc2df5dbec2befe8b0c48297d9abb2345080357e57ebd8eaddcbf3d4d9aac", "court lines (14 keypoints)"),
    ("ball,person,paddle.pt", f"{SUMAN}/ball%2Cperson%2Cpaddle.pt",
     "05e01ebe77f3256426d0e54ffad83abf3da2d1fcadc2bcf10dbd5714fdded459", "pickleball and paddle"),
    ("yolo11n.pt", "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n.pt",
     "0ebbc80d4a7680d14987a577cd21342b65ecfd94632bd9a8da63ae6417644ee1", "people (COCO person class)"),
]


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(models_dir: Path = DEFAULT_MODELS_DIR) -> int:
    models_dir.mkdir(parents=True, exist_ok=True)
    failures = 0
    for name, url, digest, purpose in MODELS:
        target = models_dir / name
        if target.is_file() and _sha256(target) == digest:
            print(f"ok       {name} ({purpose})")
            continue
        print(f"download {name} ({purpose}) ...", flush=True)
        partial = target.with_suffix(".part")
        try:
            with urllib.request.urlopen(url, timeout=120) as response, partial.open("wb") as out:
                while chunk := response.read(1 << 20):
                    out.write(chunk)
        except OSError as exc:
            print(f"FAILED   {name}: {exc}", file=sys.stderr)
            partial.unlink(missing_ok=True)
            failures += 1
            continue
        if _sha256(partial) != digest:
            print(f"FAILED   {name}: checksum mismatch, file discarded", file=sys.stderr)
            partial.unlink(missing_ok=True)
            failures += 1
            continue
        partial.replace(target)
        print(f"ok       {name}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(fetch())
