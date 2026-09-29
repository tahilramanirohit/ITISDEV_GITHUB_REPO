"""Download the candidate court and ball/player models named in docs/MODEL_SETUP.md.

    python -m picklepro.fetch_models

Files come from a pinned commit of the MIT-licensed sumanblack666/pickleball-analysis
repository and are checked against the SHA-256 values recorded in the docs before
use. They are saved to server/models/ (ignored by Git). The script prints the
.env lines that point the worker at them; it does not edit .env itself.
"""

from __future__ import annotations

import hashlib
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = "https://raw.githubusercontent.com/sumanblack666/pickleball-analysis/000b22e853dde9e36b4797dc68d9ba0dd2eea4ae/models/"
MODELS = {
    "court_best.pt": "c67cc2df5dbec2befe8b0c48297d9abb2345080357e57ebd8eaddcbf3d4d9aac",
    "ball,person,paddle.pt": "05e01ebe77f3256426d0e54ffad83abf3da2d1fcadc2bcf10dbd5714fdded459",
}
TARGET = Path(__file__).resolve().parents[1] / "models"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    TARGET.mkdir(exist_ok=True)
    for name, expected in MODELS.items():
        dest = TARGET / name
        if dest.exists() and sha256(dest) == expected:
            print(f"ok       {name} (already downloaded)")
            continue
        url = REPO + urllib.request.quote(name)
        print(f"download {name} ...", flush=True)
        tmp = dest.with_suffix(".part")
        for attempt in range(1, 4):
            try:
                urllib.request.urlretrieve(url, tmp)
                break
            except (OSError, urllib.error.URLError) as exc:
                print(f"  attempt {attempt} failed: {exc}", file=sys.stderr)
                time.sleep(2 * attempt)
        else:
            tmp.unlink(missing_ok=True)
            print(f"error: could not download {name}; check the internet connection and run this again.",
                  file=sys.stderr)
            return 1
        got = sha256(tmp)
        if got != expected:
            tmp.unlink(missing_ok=True)
            print(f"error: {name} checksum {got} does not match the recorded {expected}; not used.", file=sys.stderr)
            return 1
        tmp.replace(dest)
        print(f"ok       {name}")
    court, obj = TARGET / "court_best.pt", TARGET / "ball,person,paddle.pt"
    print("\nPut these lines in server/.env:\n")
    print("PICKLEPRO_DETECTOR=yolo")
    print(f"PICKLEPRO_YOLO_WEIGHTS={obj}")
    print(f"PICKLEPRO_BALL_WEIGHTS={obj}")
    print(f"PICKLEPRO_COURT_WEIGHTS={court}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
