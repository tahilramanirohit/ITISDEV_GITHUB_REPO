# PicklePro CV reference repository evaluation

Reviewed on 2026-09-24 for the fixed-camera player-position heatmap, then revisited for the automatic court adapter. This is a source inspection and controlled geometry check, not an accuracy study on real pickleball footage. External model weights remain outside this repository.

| Reference | Revision inspected | Useful part | Current obstacle |
| --- | --- | --- | --- |
| [TrackNet-Pickleball](https://github.com/AndrewDettor/TrackNet-Pickleball) | `6c15f95` | Ball-labeling, prediction, and evaluation workflow | Ball tracking does not calibrate a court or locate players. Prediction uses TensorFlow/Keras notebooks, GPU, and weights hosted separately. No license file was found. |
| [PICKLEBALLL_VIDEO_ANALYSIS](https://github.com/arivsssss/PICKLEBALLL_VIDEO_ANALYSIS) | `31248d6` | 14-court-keypoint idea and person-tracking flow | The entry point expects model weights under `models/`, but that directory is absent from the inspected tree. No license file was found. Player selection assumes at least two detections. |
| [smart-pickleball-assistant](https://github.com/arcotn/smart-pickleball-assistant) | `ee275ad` | Frame drawing and correction workflow ideas | MIT-licensed desktop prototype; court zones are user-supplied. Some reported measures use pixel placeholders, including a hard-coded `640 * 480` court area. Its `test_gui.py` opens a Tkinter demo rather than testing analysis. |
| [pickleball-analysis](https://github.com/sumanblack666/pickleball-analysis) | `000b22e` | Strongest court-keypoint-to-homography reference; includes model files and static-court locking | MIT-licensed repository, but its model loader depends on Ultralytics and the model weights need provenance and real-footage validation. Its ball-crossing shot/rally heuristics are not suitable as validated metrics. |

## Checks run

- All checked-in Python files in the four sparse checkouts parsed successfully: TrackNet 0 Python files plus 4 valid notebooks; PICKLEBALLL_VIDEO_ANALYSIS 15 Python files; smart-pickleball-assistant 7; pickleball-analysis 22. None provided a headless automated CV test suite in the inspected checkout.
- `pickleball-analysis` court mapping was exercised with 14 synthetic keypoints generated from a known perspective transform. With 0.8 px added noise, it estimated a mapping with 0.23 px median error against the known template; with one point displaced by 120 px, median error was 0.30 px. With only three usable points, it correctly returned no mapping. Repeated stationary keypoints caused its court lock to engage on frame 3. These results test geometry code only, not the trained model or real footage.
- `PICKLEBALLL_VIDEO_ANALYSIS` player selection was exercised with controlled detections. Two players returned two IDs. One player raised `IndexError`, so this selection method is unsuitable for PicklePro without repair.
- PicklePro's own Python suite passed: 58 tests. Its 20-second synthetic clip produced an `ok` heatmap, with 18.3 seconds tracked (91% of the clip) and a warning that motion detections are not confirmed people.

The external neural-network inference paths were not run. TrackNet's weights are hosted separately; PICKLEBALLL_VIDEO_ANALYSIS does not include its referenced weights; smart-pickleball-assistant downloads models on first use; and pickleball-analysis uses externally trained PyTorch model files. These also require dependencies absent from the existing PicklePro environment. Loading unreviewed weights or installing every project's dependency stack is not necessary to test the geometry and interface compatibility first.

## Integration status

PicklePro now accepts a compatible 14-keypoint court pose model as an optional, local input. Its independent adapter maps model keypoints to the existing court coordinate system, rejects outliers and weak fits, and sends the result through the existing heatmap pipeline. The optional person detector reads class names from custom YOLO models instead of assuming class 0 is a person. The optional ball detector saves time-stamped observations from a locally supplied model; it does not infer missing positions. The worker defaults to the near-side player. This uses the court-model layout and geometry ideas from the MIT-licensed `pickleball-analysis` project and the court/player separation seen in `PICKLEBALLL_VIDEO_ANALYSIS`; it does not copy the latter's unlicensed code. Its motion tracker retains identity across brief missed detections, a limited adaptation of the continuity goal in `smart-pickleball-assistant` without adopting DeepSORT or copying that project's implementation. TrackNet's temporal ball-tracking and labeling workflow informs later temporal validation; no shot or speed metric is claimed. No external model has been validated on a held-out set of real matches.

## Further integration decision

Combine **capabilities through narrow interfaces**, not whole applications. PicklePro already has an analysis result contract, coverage reporting, a court model, and a job worker. A court detector should propose named image landmarks (with confidence), which the existing calibration code can turn into a court mapping. A person detector should output boxes and stable track IDs; the existing heatmap should still use ground-contact positions, report tracked coverage, and return `insufficient_data` when evidence is weak.

1. Evaluate the automatic court adapter with real footage. Add a visible landmark overlay and correction controls before treating a model result as production-ready. Manual calibration remains an advanced fallback.
2. Evaluate person detection and track continuity on permitted, labeled clips. PicklePro's current optional YOLO detector is another candidate; the source model and runtime licenses must be reviewed before deployment.
3. Compare each candidate with hand-labeled real clips from the intended fixed-camera setup: landmark error, foot-position error in metres, player-ID switches, heatmap coverage, failure rate, and processing time. Record video conditions and hold out evaluation clips from tuning.
4. Consider TrackNet-style ball tracking only after court and player positions are reliable. Do not infer ball height or shot speed from a ground-plane homography. Do not adopt the reference projects' shot, rally, violation, or skill claims without independent validation.

The two repositories without a declared license can inform an independently written design, but their code or weights should not be copied without permission. MIT licensing of another repository does not settle the license or provenance of its dependencies and model weights. Ultralytics' AGPL/enterprise terms need a separate decision for a deployed web app.
