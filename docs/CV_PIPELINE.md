# CV pipeline and result interpretation

## What runs today

`server/picklepro/` reads a video sequentially, samples frames at a requested rate, detects moving objects, tracks detections, and records bounding boxes for replay. Motion detection is the default and does **not** establish that an object is a person. It has no model confidence score. Its tracker can reconnect a box after up to two missed samples, but missing samples never create positions or heatmap time. YOLO person detection is optional, requires `server/requirements-yolo.txt` and local weights, and is never downloaded silently. The detector reads the model's class names so a custom pickleball model's ball class cannot be mistaken for a person just because it is class 0.

An optional 14-keypoint court pose model can calibrate the court from the video's opening five seconds. Set `PICKLEPRO_COURT_WEIGHTS` for the worker, or pass `--court-weights` to the CLI. This adapter uses the landmark ordering documented by [pickleball-analysis](https://github.com/sumanblack666/pickleball-analysis); weights are supplied separately and are never downloaded or committed here. It needs the optional `server/requirements-yolo.txt` dependencies. At least six confident, well-spread keypoints and a good robust fit are required. If none is found, the result says `insufficient_data` and manual calibration remains available.

Calibration maps image pixels on the **court ground plane** to metres. A detection's bottom-center box point approximates its foot location. The worker selects the single near-side player by default; the UI can choose the far side or a track ID. Frames with ambiguous half selection are excluded. A court heatmap sums the time represented by each usable sampled frame; it is a whole-clip dwell-time map, not rally analysis.

An optional local YOLO model with a `pickleball` or `ball` class saves observed ball boxes for replay. It does not fill gaps between detections or estimate ball speed, height, shots, or rallies. The heatmap needs calibration, player selection, at least 10 tracked seconds, and at least 25% of analyzed time tracked. Without enough evidence the metric and overall result say `insufficient_data`. Zone occupancy is experimental and off by default. Rally segmentation and shot classification are always `not_computed` in this version.

## Automatic calibration with compatible local weights

From `Pickleball Performance Dashboard/server/`, install the optional dependencies and point to a reviewed 14-keypoint court model:

```sh
.venv/bin/python -m pip install -r requirements-yolo.txt
.venv/bin/python -m picklepro.cli analyze /path/to/match.mp4 --court-weights /path/to/court_best.pt --court-half near --out /path/to/result.json
```

For hosted uploads, set `PICKLEPRO_COURT_WEIGHTS=/path/to/court_best.pt` in `server/.env` and run the measured worker. Leave out the manual calibration input in the app. The model must use the same 14-point ordering; arbitrary court pose models are not compatible. We have tested the mapping with synthetic keypoints, not its accuracy on real matches. Review model-weight provenance and Ultralytics licensing before deployment.

For player and ball boxes, set `PICKLEPRO_DETECTOR=yolo`, `PICKLEPRO_YOLO_WEIGHTS=/path/to/object_model.pt`, and `PICKLEPRO_BALL_WEIGHTS=/path/to/object_model.pt`. A shared custom object model must name its classes; class 0 is not assumed to be a person. The ball detector keeps only the highest-scored ball box at each sampled frame. These observations need evaluation against labelled real video before they support further metrics.

## Manual calibration fallback for a permitted fixed-camera video

Run from `Pickleball Performance Dashboard/server/`:

```sh
.venv/bin/python -m picklepro.cli landmarks
.venv/bin/python -m picklepro.cli extract-frame /path/to/match.mp4 --at 5 --out /path/to/frame.png
```

Identify at least four named **ground-plane** court landmarks visible in the extracted frame. Prefer more well-spread landmarks. Save a JSON file in this shape, using the frame's actual width and height and your measured pixel locations:

```json
{
  "image_width": 1920,
  "image_height": 1080,
  "points": [
    {"landmark": "near_left_baseline", "pixel": [320, 1000]},
    {"landmark": "near_right_baseline", "pixel": [1600, 1000]},
    {"landmark": "near_left_kitchen", "pixel": [560, 550]},
    {"landmark": "near_right_kitchen", "pixel": [1360, 550]}
  ]
}
```

These pixel values only illustrate the file format. Do not use them for footage whose landmarks differ. Net posts are above the ground and are not calibration landmarks. Camera movement, zoom, or a changed crop requires a new calibration. A calibration made at another resolution is rescaled only under the assumption of identical framing.

Then analyze:

```sh
.venv/bin/python -m picklepro.cli analyze /path/to/match.mp4 --calibration /path/to/calibration.json --court-half near --out /path/to/result.json
```

Use `--track-id N` instead of `--court-half near` when a player can be followed by a stable track ID. The CLI prints available IDs after analysis. `--max-seconds` deliberately limits coverage and is recorded in the result. Exit code 0 means `ok`, 3 means a valid `insufficient_data` result, 2 means invalid input, and 1 means an error.

## Read a result honestly

- `data_origin` is `measured` for pipeline output and `test_fixture` for the worker's canned flow test. A fixture result says nothing about the uploaded video.
- `coverage` records analyzed start/end, sample stride, decoded/analyzed frames, detection count, and the fraction of the reported video duration covered. Container duration and frame rate can themselves be approximate.
- Each `metrics` entry has a status and a validation level. `measured` means computed from observed frames; it does not mean scientifically validated. `synthetic_only` and `not_evaluated` must be presented as such.
- `player_positions` contain timestamped pixel boxes for replay. Box visibility depends on detections at that playback time; empty stretches have no boxes.
- `ball_positions` contain only observed, timestamped boxes with model scores. Missing detections remain missing; a model score is not an accuracy estimate.
- `calibration.method` says whether landmarks came from the model or manual input. `calibration.reprojection_rmse_m` measures fit to those landmarks, not real-world tracking accuracy. Automatic calibration rejects a poor fit; a poor manual fit is warned about but does not automatically suppress a heatmap.

The synthetic fixture previously produced roughly 3.2 cm median and 9.7 cm 90th-percentile foot-position error under ideal, known geometry. This is a development check, **not** an estimate of accuracy on real matches. Real-footage evaluation still needs permitted, labeled clips with varying lighting, occlusion, court views, players, and camera stability.

The homography cannot infer height above the court, airborne ball arcs, ball speed, shot type, skill, or play style.

### Positioning patterns and practice feedback

`metrics.positioning` (validation `synthetic_only`) turns the selected player's smoothed foot positions into movement measures, counted from that player's own baseline:

- time in five depth bands: behind the baseline, baseline area (first 1.5 m), transition area, kitchen-line area (1 m behind to 0.3 m past the kitchen line), and inside the kitchen;
- transition stays: continuous stays of at least 2 s in the transition area;
- approaches: moves from the baseline bands to the kitchen-line bands, with the median time taken. A tracking gap over 1 s breaks an approach;
- the share of time on the player's own left half, and total distance covered.

On the synthetic clip, band shares agree with the known path within 8 percentage points, and the single approach and retreat are counted. Band edges are coaching conventions, not validated thresholds. Walking between points is included, so an approach can also be a walk to the next serve.

The results screen offers practice feedback only when a measured result has a person model, good court calibration, at least half the analyzed clip tracked for one player, and fewer than one in five frames ambiguous. It lists what went well and up to three focus areas. Each focus area has the observed measure, a named drill, a measurable target for the next session, and its evidence. Thresholds are defined in `src/lib/analysis/coaching.ts` (`THRESHOLDS`) and are practice goals, not validated benchmarks. On the Sessions page, the results are compared with the most recent earlier session that also supports coaching, and each measure is marked improved, worse, or about the same. Results saved before this metric existed get only basic heatmap feedback until they are re-analysed. Sample data, motion-only detections, poor calibration, and insufficient tracking produce no personalized feedback. Browser speech synthesis reads the displayed feedback aloud when available. Real-match evaluation is still required before treating this as validated coaching.
