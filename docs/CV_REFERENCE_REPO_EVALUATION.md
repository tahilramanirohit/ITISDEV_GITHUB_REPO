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

## Shot and ball review (2026-09-30)

The next pass reviewed the five user-supplied repositories at these revisions. Their README claims are not treated as measured accuracy in PicklePro.

| Reference | Revision | Finding for this pipeline |
| --- | --- | --- |
| [smart-pickleball-assistant](https://github.com/arcotn/smart-pickleball-assistant) | `ee275ad` | MIT. Its pose/DeepSORT and visual correction concepts may help player continuity, but it needs user-drawn zones and has no validated shot model or transferable pickleball weights. |
| [TrackNet-Pickleball](https://github.com/AndrewDettor/TrackNet-Pickleball) | `6c15f95` | Its frame labels, temporal ball model, and per-frame prediction evaluation are relevant. Weights are on Google Drive, not in the repository; training/prediction needs a GPU. No license file appears in the inspected tree, so no code or weights were imported. |
| [pickleball-computer-vision-ai](https://github.com/Abdul-Rehman-44/pickleball-computer-vision-ai) | `e527dd4` | Its app detects players/equipment/ball for live telemetry. The repository contains `app.py` and UI, but not the custom weights claimed in its README. No license file appears despite a README badge. It provides no shot-contact evaluation to adopt. |
| [pickleball-vision-llm](https://github.com/SathishKumarAI/pickleball-vision-llm) | `7ab8d18` | Its trajectory analyzer rejects isolated spikes and keeps temporal features distinct from a shot classifier. Its TrackNet adapter explicitly leaves model selection/loading as a seam, and its rule classifier uses unvalidated pixel thresholds. No license file appears in the inspected tree. We independently added a motion check without copying its interpolation or code. |
| [ai-enhanced-pickleball-learning-platform](https://github.com/phu-boop/ai-enhanced-pickleball-learning-platform) | `7f670a0` | MIT. Its vision service combines ball tracking and player pose. Its contact rule uses a fixed 60-pixel wrist distance and classifies some shots from image height, which cannot be transferred across camera views without calibration and labeled evaluation. |

The implemented changes keep every output ball box observed. A flight cannot extend through an image jump beyond the existing scale-adjusted speed limit. Shot travel estimates withhold bounce mappings more than 1.5 m outside the court, and do not infer pace to the next hitter across such a bounce; the raw bounce remains available in the research output for review. These are independent safeguards based on trajectory and geometry, not new trained models or accuracy claims. A stricter contact-observation gap was tried and removed: on the existing development clip, it reduced matched contacts from 10 to 2 because the ball model often misses frames around real hits. A continuous-only stationary filter was also tried and removed after it added observations but reduced matched contacts from 10 to 7; apparent ball coverage alone was misleading.

The current default remains the locally supplied ball detector plus court/player pipeline. TrackNet-style inference needs permission or a compatible licensed implementation, documented weight provenance, and evaluation on consented held-out footage before enabling it. The highest-value next dataset is frame-precise ball centres, contact times, hitters, and the five public shot classes across several courts and camera views. Measure ball precision/recall, contact precision/recall, hitter accuracy, type confusion, and processing time separately.

On the existing 51-second **development** clip, the final safeguards retained the same 248 observed ball boxes and the same 11 proposed contacts as the consolidated baseline. Both versions matched 10 of 26 whole-second human shot labels. Matched shot-type accuracy moved from 4/10 to 5/10, while absurd mapped landings such as `(−77.82, −208.69)` m were withheld from shot travel. The run had no selected player, so its overall court-metric status was correctly `insufficient_data`; shot output remained `experimental`. These numbers are a regression check on a clip used during development, not a held-out accuracy estimate.

### Ball-position evaluation

TrackNet's prediction-versus-label workflow is now available for PicklePro result files without importing its model. Save a JSON label file with frames that were actually reviewed, including explicit frames where the ball is absent:

```json
{
  "image_width": 1920,
  "image_height": 1080,
  "frames": [
    {"time_seconds": 1.002, "visible": true, "x": 853, "y": 427},
    {"time_seconds": 1.069, "visible": false}
  ]
}
```

From `Pickleball Performance Dashboard/server/`, run `python -m picklepro.evaluate_ball result.json ball_labels.json`. The evaluator scales labels to the video's resolution, matches only nearby sample times, and considers a predicted centre correct within 1% of video width. A wrong-position detection counts as a false positive and a missed ball. Detections on frames that were never labelled do not affect precision. The JSON report contains per-frame outcomes and precision, recall, and median pixel error. This measures a declared tolerance on a declared labelled subset; it does not turn the development clip into independent validation.
