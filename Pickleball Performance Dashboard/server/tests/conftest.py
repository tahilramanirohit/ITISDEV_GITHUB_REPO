import sys
from pathlib import Path

import pytest

SERVER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER))

from picklepro.fixtures import write_synthetic_clip  # noqa: E402


@pytest.fixture(scope="session")
def synthetic_clip(tmp_path_factory):
    """20 s SYNTHETIC fixed-camera clip with known ground truth (not real footage)."""
    return write_synthetic_clip(tmp_path_factory.mktemp("clips") / "synthetic.mp4", duration_s=20, fps=15)


def write_constant_video(path: Path, frames: int = 100, fps: float = 10.0, size=(160, 120), value: int = 0):
    import cv2
    import numpy as np

    w = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, size)
    for _ in range(frames):
        w.write(np.full((size[1], size[0], 3), value, np.uint8))
    w.release()
    return path
