"""TrackNetV2 ball detector (optional), ported to PyTorch.

TrackNet looks at **three consecutive frames at once** and outputs a heat map
of the ball for each of them. Seeing the motion across frames lets it find a
blurred or partly hidden ball that single-frame detectors (YOLO) miss.

The weights are the pickleball fine-tune ``weights_k14_epoch19`` from
AndrewDettor/TrackNet-Pickleball (TensorFlow/Keras), converted once to
``tracknet_pickleball.npz`` (see ``convert_keras``). Running them needs only
PyTorch, which the YOLO install already brings.

Two details copied exactly from the Keras model:

* each block is Conv -> ReLU -> BatchNorm;
* the Keras BatchNorm layers used the default ``axis=-1`` on channels-first
  tensors, so they normalise per **image column** (width), not per channel.
  The saved statistics have one value per column, so the port applies them
  the same way. Input size is therefore fixed at 512x288.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional, Sequence

import numpy as np

from .detection import DetectorUnavailable

WIDTH, HEIGHT = 512, 288
THRESHOLD = 0.5
BN_EPSILON = 1e-3
# (in, out) channels of the 18 convolutions, in network order.
CONVS = [(9, 64), (64, 64), (64, 128), (128, 128), (128, 256), (256, 256), (256, 256),
         (256, 512), (512, 512), (512, 512), (768, 256), (256, 256), (256, 256),
         (384, 128), (128, 128), (192, 64), (64, 64), (64, 3)]


def _build(weights: Dict[str, np.ndarray]):
    import torch
    import torch.nn.functional as F

    convs, norms = [], []
    for i in range(18):
        k = torch.from_numpy(weights[f"conv{i}_kernel"]).permute(3, 2, 0, 1).contiguous()  # HWIO -> OIHW
        convs.append((k, torch.from_numpy(weights[f"conv{i}_bias"])))
        if i < 17:
            g, b, mean, var = (torch.from_numpy(weights[f"bn{i}_{n}"]) for n in ("gamma", "beta", "mean", "var"))
            scale = g / torch.sqrt(var + BN_EPSILON)
            norms.append((scale, b - mean * scale))

    def block(x, i):
        x = F.relu(F.conv2d(x, convs[i][0], convs[i][1], padding=1))
        scale, shift = norms[i]
        return x * scale + shift  # per column (last axis), as in the Keras model

    def forward(x):
        x = block(block(x, 0), 1); x1 = x
        x = F.max_pool2d(x, 2)
        x = block(block(x, 2), 3); x2 = x
        x = F.max_pool2d(x, 2)
        x = block(block(block(x, 4), 5), 6); x3 = x
        x = F.max_pool2d(x, 2)
        x = block(block(block(x, 7), 8), 9)
        x = torch.cat([F.interpolate(x, scale_factor=2, mode="nearest"), x3], 1)
        x = block(block(block(x, 10), 11), 12)
        x = torch.cat([F.interpolate(x, scale_factor=2, mode="nearest"), x2], 1)
        x = block(block(x, 13), 14)
        x = torch.cat([F.interpolate(x, scale_factor=2, mode="nearest"), x1], 1)
        x = block(block(x, 15), 16)
        return torch.sigmoid(F.conv2d(x, convs[17][0], convs[17][1]))

    return forward


class TrackNet:
    """Heat maps for three frames at a time; ``detect`` returns ball boxes per frame."""

    def __init__(self, weights_path: str):
        path = Path(weights_path)
        if not path.is_file():
            raise DetectorUnavailable(f"TrackNet weights not found: {path.name}")
        try:
            import torch
        except ImportError as exc:
            raise DetectorUnavailable("TrackNet requires PyTorch (requirements-yolo.txt).") from exc
        self._torch = torch
        with np.load(path) as data:
            self._forward = _build({k: data[k].astype(np.float32) for k in data.files})

    def heatmaps(self, frames: Sequence[np.ndarray]) -> np.ndarray:
        """Three BGR frames (any size) -> three heat maps (288x512, 0-1)."""
        import cv2

        if len(frames) != 3:
            raise ValueError("TrackNet takes exactly three consecutive frames")
        chans = []
        for f in frames:
            rgb = cv2.resize(f, (WIDTH, HEIGHT), interpolation=cv2.INTER_LINEAR)[..., ::-1]
            chans.append(np.moveaxis(rgb, -1, 0))
        x = np.concatenate(chans, 0)[None].astype(np.float32) / 255.0
        with self._torch.inference_mode():
            return self._forward(self._torch.from_numpy(x))[0].numpy()

    def detect(self, frames: Sequence[np.ndarray]) -> List[List[dict]]:
        """Ball boxes for each of three consecutive frames (the largest blob, like the original)."""
        import cv2

        maps = self.heatmaps(frames)
        out: List[List[dict]] = []
        for f, hm in zip(frames, maps):
            sx, sy = f.shape[1] / WIDTH, f.shape[0] / HEIGHT
            mask = (hm > THRESHOLD).astype(np.uint8)
            n, _, stats, _ = cv2.connectedComponentsWithStats(mask)
            if n <= 1:
                out.append([])
                continue
            i = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
            x, y, w, h = stats[i, :4]
            conf = float(hm[y:y + h, x:x + w].max())
            box = [int(round(x * sx)), int(round(y * sy)), int(round((x + w) * sx)), int(round((y + h) * sy))]
            out.append([{"bbox": box, "confidence": conf}])
        return out


def convert_keras(saved_model_dir: str, out_path: str) -> None:
    """One-off: Keras SavedModel -> npz (needs ``tf_keras``; not used at run time)."""
    import tf_keras as keras  # type: ignore

    model = keras.models.load_model(saved_model_dir, compile=False, custom_objects={"custom_loss": lambda *a: 0})
    out: Dict[str, np.ndarray] = {}
    conv = bn = 0
    for layer in model.layers:
        kind = type(layer).__name__
        w = layer.get_weights()
        if kind == "Conv2D":
            out[f"conv{conv}_kernel"], out[f"conv{conv}_bias"] = w
            conv += 1
        elif kind == "BatchNormalization":
            for name, a in zip(("gamma", "beta", "mean", "var"), w):
                out[f"bn{bn}_{name}"] = a
            bn += 1
    if (conv, bn) != (18, 17):
        raise ValueError(f"unexpected TrackNet layout: {conv} convolutions, {bn} norms")
    np.savez(out_path, **out)
