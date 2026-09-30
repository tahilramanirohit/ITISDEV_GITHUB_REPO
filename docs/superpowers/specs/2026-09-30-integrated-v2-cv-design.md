# Integrated v2: improving contact detection with verified evidence

Status: approved with conditions on 1 October 2026. The lean Phase 1 scope and training gates in [V2 evaluation](../../V2_EVALUATION.md) and the Phase 1 implementation plan override the broader proposals below. No model or pipeline defaults changed.
Branch: `integrated-v2`, created from `integration/consolidated-cv` at `f3d3c3b`.
Date: 30 September 2026.

## Intended outcome

Find more real contacts and attribute them to the correct person while controlling false hits. Compare improvements using reproducible, independently labeled recordings. Preserve the working integrated branch and use v2 for development.

The user requested precise labels and more recordings, better ball detection with TrackNet or fine-tuning, retuning at 30 FPS, and a learned hit classifier after roughly 300 labeled contacts. Training is an explicitly requested v2 exploration; it departs from the revision 4 PDF's no-training scope and must be recorded in thesis/adviser scope decisions before claiming capstone alignment.

## What actually exists

- A local frame-stepping annotation page, confirmed-versus-draft shot labels, independent human player IDs and result-specific tracker mapping.
- A scorer with 0.35-second margins; legacy whole-second labels use wider windows. It does not implement the PDF's 0.2-second protocol or full class metrics.
- YOLO ball inference, filtered observed boxes and rule-based contacts/types. Ball sampling defaults to 15 FPS, players to 10 FPS.
- `TestVideoKirk_REAL.mp4`: approximately 51.25 seconds at 29.93 FPS, SHA-256 `739e11d3e0556f200ec7746cfed188f26eeba31a6ea0bca973c84a389ec0253d`.
- Its existing label file has 26 positive contacts and 2 negative moments, whole-second timing and legacy tracker IDs. It is development data already used for tuning.
- `PickleballVideo.mp4`: approximately 51.66 seconds at 59.95 FPS, SHA-256 `b13ef80a202ddf0d4469b59c7919b87ede5712a87ee66c87e6363ac1b2eab88e`. A sampled frame shows a different recording with neighboring courts. No verified labels were found for it. One frame was inspected for inventory, so it is not described as wholly unseen footage.
- Local default court/ball/person/pose weights exist. No TrackNet weights or learned-hit training dataset were found.

A precise timestamp cannot be produced by rounding a whole-second label. Existing times must be reviewed against actual video contact frames. Automated proposals remain unconfirmed drafts.

## Alternatives and recommendation

1. Evidence-first foundation (recommended): recording manifest, labeling checks, repeatable scorer and frozen splits. This provides a fair comparison for either ball model and prevents a tuning improvement being mistaken for general accuracy.
2. Retune the existing detector immediately at 30 FPS: lower integration cost, but existing coarse labels cannot establish improvements at a narrow matching window.
3. Add TrackNet or fine-tune immediately: could recover contact-time balls, but checkpoint availability/compatibility or box-label quality and compute requirements are not established. This should follow the measurement foundation.

## Phase 1: dataset and evaluation foundation

### Recording register

Maintain a versioned manifest keyed by source-recording ID, with file SHA-256, local video path, original FPS/duration/dimensions, condition metadata, provenance/consent status, label path/version, and partition. Alternate encodes/cuts of one recording share a source ID and partition. Duplicate hashes and conflicting partitions are rejected.

Do not infer consent from the presence of a file. Existing unknown permission/consent states remain explicit. Keep raw videos, checkpoints and private metadata out of new Git additions.

The current labeled recording is development only. The second recording is a candidate reserved evaluation recording, pending permission, independent labeling and split freeze. Obtain another original recording for an untouched final test if this candidate is used for tuning or model selection. Frozen evaluation cannot be accessed by the tuning command.

### Annotation workflow

Preserve current frame stepping and human confirmation. Add recording identity/hash and original FPS linkage to label exports; distinguish a frame index/contact timestamp from asserted temporal precision. Require review of coarse labels rather than converting them automatically. Record uncertainty/occlusion; unknown hitter or type remains unknown/unclassified.

Use the current eight public classes plus unclassified for the v2 experiment, versioned explicitly. Any revision 4 comparison needs a documented mapping and precedence convention before evaluation. Human observations of bounce/contact are separate from model suggestions. Do not train success, fault, winner or officiating outputs.

Human labels require verification; the agent can prepare candidates and inspect clips but cannot claim a dataset of verified precise contacts without reviewing the evidence. Double-label an agreed subset and adjudicate disagreements.

### Evaluation contract

Retain legacy scoring as a named compatibility protocol. Add an explicit fixed protocol for frame-precise contacts, with 0.2-second tolerance, deterministic one-to-one matching based only on time, independent of predicted hitter/type. Use matching that first maximizes valid pairs then minimizes time error; report unmatched detections/labels.

Report precision, recall, per-class confusion/support/F1, unclassified and unknown-hitter rates, human hitter accuracy denominator, timing errors, and per-recording results. Classes below 20 held-out references are insufficient evidence for the v4 macro-F1 gate. An experimental aggregate may be shown separately with its actual support and no release claim.

Store code revision, checkpoint identifiers/hashes, sampling settings, scorer/protocol version, label version, split manifest and source hash in every benchmark. Never label the tuned 26-contact clip as held-out validation.

### Phase 1 acceptance

- Existing label imports remain compatible and coarse timestamps remain visibly coarse.
- Draft labels are excluded from ground truth.
- Manifest rejects duplicate/conflicting recording splits and unmatched video/label identity.
- A scoring case with competing neighboring events verifies optimal unique matching; incorrect hitter/type cannot influence time matching.
- Missing identity, no contacts, no detections, unclassified labels and small class support are reported honestly.
- A benchmark can be reproduced from the manifest and config; tuning cannot select the frozen final set.
- Update both handoff documents with behavior, scope and measured evidence.

## Phase 2: 15 versus 30 FPS comparison

Expose ball-sampling FPS and shot-rule configuration consistently in CLI/local API/worker input and provenance. First compare 15 and 30 FPS under the same detector and development labels; do not change production defaults merely because more frames were sampled.

Define thresholds in elapsed time/source coordinates where possible. Prepare a replay cache tied to video, model, inference settings and schema hashes so rule sweeps avoid rerunning unchanged inference. Invalidate cache if any dependency changes. Tune development data only and export the selected frozen configuration.

Compare contact precision/recall, ball recall near contacts, hitter attribution, class errors, failures and runtime. Promote 30 FPS only if measurements justify its quality/compute tradeoff. Source frame rate remains its actual value; nominal 30 does not establish new source frames.

## Phase 3: better ball detection

Introduce a ball-detector interface returning observed candidates in original image coordinates, source timestamps, score semantics and checkpoint provenance. Existing YOLO remains the default/fallback; optional model failures are explicit, not silently changed into comparable results.

TrackNet experiment: inspect the selected upstream model, download terms, weight hash, expected temporal ordering, normalization, resize/letterbox mapping and output semantics. A three-frame model requires source-adjacent frames, not three arbitrary widely spaced sampled frames. Install optional dependencies separately from the working YOLO runtime and validate Mac compatibility before adoption.

Fine-tuning alternative: prepare manually reviewed ball bounding boxes and negative/occluded frames, split by original recording and freeze augmentations/training config. Contact labels alone are not ball-box training data. Compare models on the same independently labeled ball frames, including near-contact windows and neighboring-court false detections.

No checkpoint is promoted without reproducible precision/recall, contact pipeline effects, runtime and provenance. Model choice remains a documented experiment until evaluation supports it.

## Phase 4: learned hit classifier

Roughly 300 verified positive contacts is an initial readiness target, not proof of sufficient data. Require multiple independent recordings, explicit non-hit examples, class/side diversity, group-based development/validation/test splits, agreed human identities and frozen evaluation.

Start with a small tabular model for contact versus non-contact using ball direction/speed-change proxies, temporal observation coverage, wrist motion/posture, player reach and context. Candidate generation must have measured recall: a classifier cannot recover contacts never proposed. Evaluate full pipeline recall separately from classifier performance on candidates. Do not treat side alternation as human identity ground truth.

Train hit validity and hitter attribution as distinct scored outputs; allow unknown attribution. Missing features have explicit masks. Calibrate/choose thresholds on development/validation only. Keep deterministic rule fallback and explicit learned-mode provenance. VideoMAE remains a later experiment after sufficient labeled temporal clips and compute evidence.

Acceptance: training refuses inadequate/mixed partitions; saved model includes features, versions, hashes and split metadata; results compare against the frozen rule baseline on held-out recordings; do not claim improvement until actual measurements support it.

## Dependencies and decisions

- Additional recordings and their recording/consent provenance are needed.
- Precise contact labels and ball-box labels require actual review; no verified precision is fabricated.
- TrackNet checkpoint acquisition/terms and Mac inference support require investigation.
- Training requires suitable positive and negative samples and available compute.
- The hosted deployment and Supabase worker setup are separate from this local branch work.
- The 300-contact target, split policy, taxonomy and training scope must be recorded as team decisions, not panel mandates.

## Execution scope proposed for the first implementation

Implement Phase 1 first and build the measurement/configuration foundation for Phase 2 after review. Continue labeling/data collection as evidence becomes available. Do not switch public defaults, deploy an unvalidated model or claim training is complete before data/model prerequisites are met.
