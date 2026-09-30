"""TrackNet port: shapes and the per-column BatchNorm (random weights, no download)."""

import numpy as np
import pytest

torch = pytest.importorskip("torch")
cv2 = pytest.importorskip("cv2")

from picklepro import tracknet  # noqa: E402


def _random_weights(path, rng):
    ws = {}
    for i, (cin, cout) in enumerate(tracknet.CONVS):
        k = 1 if i == 17 else 3
        ws[f"conv{i}_kernel"] = rng.normal(0, 0.05, (k, k, cin, cout)).astype(np.float32)
        ws[f"conv{i}_bias"] = np.zeros(cout, np.float32)
    widths = [512, 512, 256, 256, 128, 128, 128, 64, 64, 64, 128, 128, 128, 256, 256, 512, 512]
    for i, w in enumerate(widths):
        ws[f"bn{i}_gamma"], ws[f"bn{i}_beta"] = np.ones(w, np.float32), np.zeros(w, np.float32)
        ws[f"bn{i}_mean"], ws[f"bn{i}_var"] = np.zeros(w, np.float32), np.ones(w, np.float32)
    np.savez(path, **ws)


def test_three_frames_give_three_heat_maps_and_boxes_in_frame_pixels(tmp_path):
    _random_weights(tmp_path / "w.npz", np.random.default_rng(0))
    model = tracknet.TrackNet(str(tmp_path / "w.npz"))
    frames = [np.full((1080, 1920, 3), 90, np.uint8) for _ in range(3)]
    maps = model.heatmaps(frames)
    assert maps.shape == (3, tracknet.HEIGHT, tracknet.WIDTH)
    assert ((maps >= 0) & (maps <= 1)).all()
    for boxes in model.detect(frames):
        for b in boxes:
            x1, y1, x2, y2 = b["bbox"]
            assert 0 <= x1 < x2 <= 1920 and 0 <= y1 < y2 <= 1080


def test_missing_weights_are_reported_not_crashed(tmp_path):
    with pytest.raises(tracknet.DetectorUnavailable):
        tracknet.TrackNet(str(tmp_path / "none.npz"))
