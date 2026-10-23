"""Conservative check that a manual court map still matches the video view.

This is a guard, not a camera stabilization algorithm. If the image moves or a
cut makes the view uncertain, the old manual homography must not be reused.
"""

from __future__ import annotations

import cv2
import numpy as np


def view_changed(reference: np.ndarray, frame: np.ndarray) -> bool:
    """Return True when the current frame cannot safely reuse a manual map."""
    size = (480, max(1, round(reference.shape[0] * 480 / reference.shape[1])))
    a = cv2.cvtColor(cv2.resize(reference, size), cv2.COLOR_BGR2GRAY)
    b = cv2.cvtColor(cv2.resize(frame, size), cv2.COLOR_BGR2GRAY)
    if np.mean(cv2.absdiff(a, b)) < 5:
        return False

    orb = cv2.ORB_create(nfeatures=800)
    ka, da = orb.detectAndCompute(a, None)
    kb, db = orb.detectAndCompute(b, None)
    if da is None or db is None:
        return np.mean(cv2.absdiff(a, b)) > 18
    matches = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(da, db, k=2)
    good = [m for pair in matches if len(pair) == 2 for m, n in [pair] if m.distance < 0.72 * n.distance]
    if len(good) < 12:
        return np.mean(cv2.absdiff(a, b)) > 18
    src = np.float32([ka[m.queryIdx].pt for m in good])
    dst = np.float32([kb[m.trainIdx].pt for m in good])
    affine, inliers = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=3)
    if affine is None or inliers is None or int(inliers.sum()) < 10:
        return True
    corners = np.float32([[0, 0, 1], [479, 0, 1], [0, size[1] - 1, 1], [479, size[1] - 1, 1]])
    moved = corners @ affine.T
    displacement = np.linalg.norm(moved - corners[:, :2], axis=1)
    return bool(np.max(displacement) > 0.015 * np.hypot(*size))


def likely_scene_cut(previous: np.ndarray, frame: np.ndarray) -> bool:
    """Detect abrupt view changes; prefer missing a cut to inventing many."""
    a = cv2.resize(previous, (160, 90))
    b = cv2.resize(frame, (160, 90))
    difference = float(np.mean(cv2.absdiff(a, b)))
    if difference < 45:
        return False
    ah = cv2.calcHist([cv2.cvtColor(a, cv2.COLOR_BGR2HSV)], [0, 1], None, [24, 16], [0, 180, 0, 256])
    bh = cv2.calcHist([cv2.cvtColor(b, cv2.COLOR_BGR2HSV)], [0, 1], None, [24, 16], [0, 180, 0, 256])
    cv2.normalize(ah, ah)
    cv2.normalize(bh, bh)
    return bool(cv2.compareHist(ah, bh, cv2.HISTCMP_BHATTACHARYYA) > 0.55)
