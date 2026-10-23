"""Swings and contact posture from pose keypoints (synthetic skeletons)."""

from picklepro.shots import FrameObs, core_type
from picklepro.swings import SwingIndex


def _skeleton(wrist, top=100, height=200, x=300):
    """17 COCO keypoints for a standing player; the right wrist is placed at ``wrist``."""
    kp = [[0.0, 0.0, 0.0] for _ in range(17)]
    head_y, shoulder_y, hip_y, knee_y = top + 10, top + 40, top + 100, top + 150
    kp[0] = [x, head_y, 0.9]                                  # nose
    kp[5], kp[6] = [x - 20, shoulder_y, 0.9], [x + 20, shoulder_y, 0.9]
    kp[11], kp[12] = [x - 15, hip_y, 0.9], [x + 15, hip_y, 0.9]
    kp[13], kp[14] = [x - 15, knee_y, 0.9], [x + 15, knee_y, 0.9]
    kp[9] = [x - 25, hip_y - 10, 0.9]                         # left wrist, still
    kp[10] = [wrist[0], wrist[1], 0.9]
    return {"track_id": 1, "bbox": [x - 40, top, x + 40, top + height], "keypoints": kp}


def _frames(wrists, dt=0.1, walk=0.0):
    return [FrameObs(i * dt, [_skeleton(w, x=300 + walk * i)], None) for i, w in enumerate(wrists)]


def test_a_fast_arm_is_a_swing_and_a_still_arm_is_not():
    still = SwingIndex(_frames([(330, 180)] * 6))
    swing = SwingIndex(_frames([(330, 180), (330, 180), (380, 130), (300, 110), (330, 180), (330, 180)]))
    assert still.speed(1, 0.25) == 0
    assert swing.speed(1, 0.25) > 2.5  # body heights per second


def test_walking_is_not_a_swing():
    # The whole body moves 30 px per sample; the wrist moves with the shoulders.
    walking = SwingIndex([FrameObs(i * 0.1, [_skeleton((330 + 30 * i, 180), x=300 + 30 * i)], None) for i in range(6)])
    assert walking.speed(1, 0.25) < 0.1


def test_contact_height_overhead_and_low():
    idx = SwingIndex(_frames([(330, 90)]))           # wrist above the nose
    assert idx.contact(1, 0.0)["above_head"] is True
    low = SwingIndex(_frames([(330, 230)]))          # wrist below the hips
    posture = low.contact(1, 0.0, ball_xy=(330, 230))
    assert posture["below_hips"] is True and posture["above_head"] is False


def test_without_keypoints_there_is_no_swing_data():
    idx = SwingIndex([FrameObs(0.0, [{"track_id": 1, "bbox": [0, 0, 10, 20]}], None)])
    assert not idx.available and idx.speed(1, 0.0) is None and idx.contact(1, 0.0) is None


def test_finer_shots_are_reported_as_one_of_the_eight_core_types():
    assert core_type("speed_up", "volley", 4.2, False, True, 5)[0] == "volley"
    assert core_type("speed_up", "after_bounce", 4.2, False, True, 5)[0] == "drive"
    assert core_type("counter", "volley", 4.2, False, True, 5)[0] == "volley"
    assert core_type("reset", "after_bounce", 4.2, False, False, 5)[0] == "dink"
    assert core_type("reset", "after_bounce", 1.0, False, False, 5)[0] == "drop"
    assert core_type("unclassified", "unknown", 4.2, True, False, 5)[0] == "dink"
    assert core_type("overhead", "volley", 4.2, False, True, 5)[0] == "overhead"
