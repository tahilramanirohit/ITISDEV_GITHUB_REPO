# Court, player, and ball model setup

PicklePro's measured worker has three separate detection tasks. The court
model proposes a ground-plane calibration for each sampled frame.
The player model supplies person boxes and track IDs. The ball model supplies
observed ball boxes at sampled frames. The heatmap uses player feet and the
court calibration; ball boxes appear in video replay but do not create shot or
speed statistics.

## Quick setup

From `Pickleball Performance Dashboard/server/`, with the optional runtime installed (`requirements-yolo.txt`):

```sh
.venv/bin/python -m picklepro.fetch_models
```

It downloads three pinned files into `server/models/` and rejects any file whose SHA-256 differs:

| File | Used for | Source |
| --- | --- | --- |
| `court_best.pt` | court lines (14 keypoints) | pickleball-analysis, MIT |
| `ball,person,paddle.pt` | the ball | pickleball-analysis, MIT |
| `yolo11n.pt` | players (COCO `person`) | Ultralytics release v8.3.0, AGPL-3.0 |

`yolo11n.pt` has SHA-256 `0ebbc80d4a7680d14987a577cd21342b65ecfd94632bd9a8da63ae6417644ee1`. On the 29 September test clip, the pickleball model's own person class missed the far-side players and gave unstable confidence for near players. The COCO model found all four players and the referee at 0.8–0.9 confidence. Both detectors run at 1280 px because far players and the ball are small in 1080p video.

## Candidate weights for local evaluation

The MIT-licensed [pickleball-analysis](https://github.com/sumanblack666/pickleball-analysis)
repository includes a 14-keypoint court model and a custom object model with
ball, person, and paddle classes. The adapter is written for the keypoint order
in revision `000b22e853dde9e36b4797dc68d9ba0dd2eea4ae`. These weights
have **not** been evaluated on PicklePro's real match footage. Review the
weights' provenance and the Ultralytics runtime license before deployment.

Keep the external repository outside PicklePro. Verify both files against the
checksums below before using them:

| File | SHA-256 |
| --- | --- |
| `models/court_best.pt` | `c67cc2df5dbec2befe8b0c48297d9abb2345080357e57ebd8eaddcbf3d4d9aac` |
| `models/ball,person,paddle.pt` | `05e01ebe77f3256426d0e54ffad83abf3da2d1fcadc2bcf10dbd5714fdded459` |

**Automatic setup.** Put both files in `server/models/`. No environment variables are needed: the court model is the `.pt` file with "court" in its name, and the other `.pt` file supplies players and the ball. Run `.venv/bin/python -m picklepro.worker --check` to confirm what was found. The variables below still override automatic discovery.

From `Pickleball Performance Dashboard/server/`, install the optional runtime
from `requirements-yolo.txt`, then set the following in the ignored `server/.env`
using absolute paths to the reviewed local weights:

```dotenv
WORKER_RESULT_MODE=measured
PICKLEPRO_DETECTOR=yolo
PICKLEPRO_COURT_WEIGHTS=/absolute/path/to/court_best.pt
PICKLEPRO_YOLO_WEIGHTS=/absolute/path/to/ball,person,paddle.pt
PICKLEPRO_BALL_WEIGHTS=/absolute/path/to/ball,person,paddle.pt
```

Restart the worker after changing its environment. Upload a permitted
handheld or fixed-camera video. Court-position feedback needs enough sampled frames with visible court lines. The
result shows the calibration method, player detector, ball detector, coverage,
warnings, and time-stamped boxes. If the court landmarks are weak, the
heatmap remains `insufficient_data`; manual calibration is a fallback only for a stable camera view.

Before using these results as performance evidence, compare detections with
hand-labelled real clips from the intended camera angle. Record court
landmark error, player and ball detection precision/recall, ID switches,
heatmap coverage, failures, and processing time. Keep shot classification and
rally segmentation `not_computed` until their own evaluation exists.

## Initial local smoke test

On 2026-09-26, the pinned optional runtime in `requirements-yolo.txt` loaded
both candidate models. The source repository's own `data/test.mp4` is a
640×360 doubles broadcast. On its first 60 seconds sampled at 5 frames per
second, automatic court calibration was good, player boxes appeared in 297 of
300 analyzed frames, and ball boxes appeared in 94. The near-half selection
was ambiguous in 176 frames because two players occupied that half. It
produced 21.2 seconds of selected-player positions and a heatmap, but the
feedback panel now withholds personalized coaching because most frames did
not identify one player clearly. A 20-second sample had only 6.4 seconds of
selected-player positions and correctly returned insufficient data.

This is a pipeline smoke test on the model author's clip, not an independent
accuracy measurement. Doubles need a specific, stable player selection;
visible track IDs in the result can be used for re-analysis, but track
fragmentation must be evaluated before claiming reliable individual feedback.
