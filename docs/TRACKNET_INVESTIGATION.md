# TrackNet investigation — 1 October 2026

## Status

Research only on `integrated-v2`. No external model code executed, checkpoint downloaded/loaded, package installed, adapter integrated, training started, deployment made or default changed. Upstream files were read as text; their instructions were not executed. This investigation does not establish better detection or an inference speed.

Phase 2 remains prepared but unmeasured because the development labels are partial. Measure the cheap 15/30-FPS change first when suitable labels exist. The user's adviser sign-off condition still gates new model integration and training. This document records the research that was explicitly allowed before that sign-off.

## Candidates

| Candidate | Checkpoint evidence | Terms found | Mac evidence | Current disposition |
|---|---|---|---|---|
| AndrewDettor/TrackNet-Pickleball | Author links old weights and a new Google Drive folder; prediction guide distinguishes single-file old weights from directory-format new weights | No license file found in the inspected repository tree; GitHub repository metadata reports no license. No explicit checkpoint permission found in the reviewed README | TensorFlow/Keras notebook, originally used on Kaggle GPU; not tested on this Mac | Do not adopt until checkpoint provenance/permission and Mac compatibility are resolved |
| qaz812345/TrackNetV3 | Author links `TrackNetV3_ckpts.zip`; README identifies `TrackNet_best.pt` and optional `InpaintNet_best.pt` | LICENSE explicitly covers software, pretrained checkpoints and documentation, with MIT-style permission and notice obligations | Current `predict.py` chooses CUDA, then MPS, then CPU, and loads tensors with the selected device | More straightforward runtime candidate to investigate after the gates; badminton checkpoints are not evidence of pickleball suitability |

The Drive URLs resolve to preview pages, but checkpoint bytes, download completeness, sizes, internal contents and SHA-256 are **not verified**. No binary was acquired. A published link is not a pinned, verified checkpoint. Sources: [pickleball repository](https://github.com/AndrewDettor/TrackNet-Pickleball), [its prediction guide](https://github.com/AndrewDettor/TrackNet-Pickleball/blob/6c15f954df708d9f153abdc25a4a4ec34d3b5386/Step6-Predict/README.md), [V3 repository](https://github.com/qaz812345/TrackNetV3), [V3 LICENSE](https://github.com/qaz812345/TrackNetV3/blob/6eda442ada1740573f200f836d93edc9a541ee86/LICENSE).

Checkpoint preview links: [pickleball new weights](https://drive.google.com/drive/folders/1EGsddY1fgEJ5ITrfF32aPCn6nml2Anzr?usp=sharing), [V3 checkpoint archive](https://drive.google.com/file/d/1CfzE87a0f6LhBp0kniSl1-89zaLCZ8cA/view?usp=sharing). Permission to one candidate does not transfer to the other. GitHub's automated V3 license label is `NOASSERTION`, but the inspected LICENSE text explicitly includes pretrained checkpoints; use the actual text rather than the automated label.

## Source revisions inspected

- Pickleball: `6c15f954df708d9f153abdc25a4a4ec34d3b5386` (`main`).
- V3: `6eda442ada1740573f200f836d93edc9a541ee86` (`master`).

Revisions obtained from GitHub's repository/tree APIs. These are **source revisions**, not checkpoint hashes.

## Temporal inputs and output semantics

The pickleball prediction notebook assembles three consecutive source frames into channels-first input `(1, 9, 288, 512)`, converts to float32 and divides by 255. It produces three heatmaps, thresholds them, and extracts positions. This would require preserving source frame order, color handling and resize mapping; three arbitrarily spaced samples are not equivalent to adjacent source frames. [Prediction notebook](https://github.com/AndrewDettor/TrackNet-Pickleball/blob/6c15f954df708d9f153abdc25a4a4ec34d3b5386/Step6-Predict/make_predictions.ipynb).

V3 gets sequence length and background mode from checkpoint metadata; do not assume it is the same three-frame network. Its optional trajectory repair predicts missing coordinates. **Repaired positions must not be counted as observed ball detections or used to establish visible-ball recall.** A later experiment should evaluate the detection-only path first and label repaired outputs separately. Its source moves heatmap predictions back to CPU for temporal aggregation. [Prediction source](https://github.com/qaz812345/TrackNetV3/blob/6eda442ada1740573f200f836d93edc9a541ee86/predict.py).

## This Mac: verified environment versus unverified model compatibility

Read-only local environment probe in the existing server virtual environment:

| Item | Observed |
|---|---|
| Architecture | arm64 |
| macOS | 26.6 |
| Python | 3.12.14 |
| PyTorch | 2.14.0 |
| MPS built / available | true / true |
| TensorFlow / Keras installed | neither found |

MPS availability proves that the installed PyTorch runtime exposes a Mac GPU backend; it does **not** prove either TrackNet checkpoint runs, produces correct positions, fits memory, or meets runtime gates. [Official PyTorch MPS documentation](https://docs.pytorch.org/docs/main/notes/mps.html).

Apple documents a TensorFlow Metal path, but it does not validate the old pickleball notebook/checkpoint formats, custom loss or channels-first operations. Those need an isolated compatibility test after authorization. [Apple TensorFlow Metal documentation](https://developer.apple.com/metal/tensorflow-plugin/).

V3's dependency file still pins PyTorch 1.10.0, NumPy 1.22.4 and other old packages. Those pins differ from the working environment; do not install that requirements file into the current server environment. Compatibility with current dependencies is **unverified**, despite explicit MPS selection in the current prediction script. [Dependency file](https://github.com/qaz812345/TrackNetV3/blob/6eda442ada1740573f200f836d93edc9a541ee86/requirements.txt).

## Decision and next dependencies

Keep YOLO as the baseline. V3 appears easier to investigate on this Mac because it uses the existing runtime family and explicitly selects MPS; this is an inference from source inspection, not a measured model recommendation. Its badminton domain may transfer poorly. The pickleball-specific candidate has unresolved permission and environment questions. Neither is approved for adoption.

1. Obtain clearer development footage and complete verified contact coverage; keep `PickleballVideo.mp4` out of tuning.
2. Measure and apply the frozen 15/30-FPS gate before adding a ball model. A failing gate retains baseline.
3. Obtain the user's explicit confirmation of adviser sign-off before integration or training.
4. Only then acquire a reviewed checkpoint, pin its hash and notices, test an isolated Mac runtime, and evaluate on a fixed visible-ball/neighboring-court subset. Do not train on evaluation footage.
5. Apply the Phase 3 near-contact recall, precision, neighboring-court false-positive and runtime gate in [V2 evaluation](V2_EVALUATION.md). A failure retains YOLO.

This investigation is complete at the source-inspection level. Binary checkpoint verification and end-to-end compatibility remain unperformed.
