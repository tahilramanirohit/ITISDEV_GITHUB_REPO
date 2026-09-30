# Integrated v2 evaluation foundation — 1 October 2026

## Status and scope

Work only on `integrated-v2`. No defaults changed, deployment, fine-tuning, classifier training, or new model integration. Phase 1 provides evaluation tooling, not a measured improvement in detection. The user approved Phase 1 → Phase 2; training in Phases 3/4 requires explicit confirmation of adviser sign-off on the revision 4 scope change. TrackNet checkpoint, terms and Mac compatibility research is permitted; integration is not yet permitted.

## Recording identity and splits

`Pickleball Performance Dashboard/eval/manifest.v2.json` and `.csv` are equivalent. Paths resolve relative to the manifest directory. Each row has source ID, SHA-256, source path, original FPS and duration, partition, label path/version and consent status. Consent currently is **unknown**, not presumed granted. Duplicate hashes and alternate encodes of the same source in conflicting partitions fail validation. Alternate encodes must retain the same source ID.

- `TestVideoKirk_REAL`: development only; 29.93253202505007 original FPS, 51.24858794826376 seconds. Existing 26 positives and 2 negatives remain coarse (`legacy-coarse-v1`, whole seconds). Metadata was added; event times/types were not converted.
- `PickleballVideo`: reserved candidate evaluation; 59.95198265329751 original FPS, 51.658008008008004 seconds. No labels yet. The tuning selector rejects this source before any source-file access. Do not manually pass this recording to tuning/replay paths. Only prior inventory metadata is recorded here; no evaluation video access was needed for this implementation.
- **One held-out recording is insufficient for thesis generalization claims. Target 2–3 independent held-out recordings**, covering other courts/viewpoints/lighting/players. Allocate each source before tuning; all its encodes/derived frames inherit that allocation.

## Strict protocol

`picklepro.precise_scoring` / `picklepro.evaluate --strict`: fixed inclusive ±0.2 seconds. Sorted dynamic programming maximizes one-to-one contact pairs, then minimizes total absolute timing error. Matching never sees hitter/type. Ties are deterministic. Legacy evaluation remains available but is not the v2 strict protocol; its old numbers are not directly comparable.

Strict scoring rejects draft/unconfirmed or coarse labels (resolution above 0.1 seconds), rather than rounding them into precise truth. No division by zero: undefined metrics are JSON null. Outputs include contact precision/recall, all matched indices, unmatched label/detection indices, absolute timing errors with mean/max, per-class confusion/F1/precision/recall and support/prediction counts, unclassified and unknown-hitter rates. Misses and spurious detections appear in the confusion matrix. Macro F1 is restricted to classes with at least 20 positives; insufficient classes remain explicit. Unmatched detections within ±0.2 seconds of reviewed negative moments are counted separately.

Human player IDs require a separately verified human-to-tracker mapping for hitter accuracy; without a mapping, the hitter-accuracy denominator is zero and the score null. No mapping is inferred from old player hints. Contact/type matching still works without that mapping.

## Human review: first concrete task after the scorer

The queue was generated immediately after the strict scorer. Local artifact:
`/Users/kiro/Desktop/THESIS/output/contact-review-v2/index.html`

All **26 contacts start unconfirmed**. Candidate windows span each old coarse interval plus 0.35 seconds on each side. JPEG previews retain sequentially decoded source frame indices and decoder timestamps; they are not inferred contact frames. Previous/next or arrow keys step one source frame. Choose the exact contact frame, verify human hitter/type, then explicitly confirm. Same-second entries remain separate candidates. If a true contact lies outside a candidate window, leave it unconfirmed and request a wider window. Do not confirm a guessed frame.

Progress autosaves locally; download progress for backup. Download confirmed labels requires a labeler name and includes recording hash, original FPS, source ID, label version, human identity scheme, decoder time, frame index and explicit confirmation. Partial exports are allowed for backup, **but do not benchmark a partial queue as the complete clip**. Confirm all 26 and audit the full development clip for omitted contacts first. The 2 old negative moments need a separate precise review; they are not silently treated as confirmed.

Copy the reviewed export into `eval/TestVideoKirk_REAL.precise.labels.json`, and explicitly update the development manifest's label path and version to `review-v2-1` (regenerate CSV). Do not replace the coarse source file. The generic local LabelPage also binds export to recording SHA-256 and an explicitly supplied original FPS; importing/exporting coarse labels preserves their coarse resolution. Loading a video preserves saved progress while hashing.

Regenerate queue from `server/` (development recording only):

```sh
.venv/bin/python -m picklepro.review_queue ../TestVideoKirk_REAL.mp4 ../eval/TestVideoKirk_REAL.labels.json /Users/kiro/Desktop/THESIS/output/contact-review-v2
.venv/bin/python -m picklepro.dataset ../eval/manifest.v2.json
```

## Reproducible benchmark

From `server/`, after the human review and manifest update:

```sh
PICKLEPRO_AUTO_MODELS=0 .venv/bin/python -m picklepro.benchmark ../eval/manifest.v2.json --source-id TestVideoKirk_REAL --purpose tuning --ball-fps 15 --repeats 3 --output /Users/kiro/Desktop/THESIS/output/v2-benchmarks/baseline15.json
PICKLEPRO_AUTO_MODELS=0 .venv/bin/python -m picklepro.benchmark ../eval/manifest.v2.json --source-id TestVideoKirk_REAL --purpose tuning --ball-fps 30 --repeats 3 --output /Users/kiro/Desktop/THESIS/output/v2-benchmarks/candidate30.json
```

The runner verifies source/label identities and exact local model hashes. Full-clip inference benchmarks also require an explicit `"label_coverage": "complete"` declaration in a human-reviewed label file. This declaration means all contacts throughout the recording have been audited; it must not be added to partial exports, clips with unresolved hidden contacts, or a file just because all available queue buttons were clicked. Current coarse/partial labels block inference. A future reviewed-interval protocol would need explicit interval boundaries and boundary handling before partial-contact scoring; it is not implemented here. Each benchmark records Git revision, source-code snapshot hash (including uncommitted Python/HTML), every player/court/ball checkpoint hash, full analysis options and sampling settings, original FPS, runtime/hardware, scorer version, label version/content hash and complete split manifest; full result is saved alongside it. Keep videos, previews, weights and generated benchmark outputs outside Git. Report effective sampling from actual stride (round(original FPS / requested FPS)); requested 30 FPS on this source samples about 29.93 FPS, not a new 30-FPS encode.

## Frozen go/no-go rules (before any Phase 2/3 run)

### Phase 2: cheap 30-FPS retune before TrackNet

Compare against the 15-FPS baseline using the **same complete verified development labels, scorer, checkpoints, hardware and player sampling at 10 FPS**. Compare contact recall/precision as fractions, not type accuracy. Promote only if:

1. Contact recall improves by **at least 0.05 absolute (5 percentage points)**.
2. Contact precision drops by **no more than 0.02 absolute**.
3. Median elapsed inference runtime across 3 runs per configuration is **at most 2.2×** baseline, on the same Mac with the same device/options.

All three must pass and all provenance must be comparable. Undefined metrics or mismatched provenance fail the gate. Record all attempted rule settings and runtime, including failures; do not change the thresholds after seeing scores. With 26 contacts a 5-point gain means at least 2 additional contacts. This is a development selection gate, not independent validation. If it fails, retain the 15-FPS baseline and document the result. No production default change is authorized by a passing gate. Replay caching and rule sweeps belong to Phase 2, after labels are ready; no comparison has run yet.

### Phase 3: new ball model adoption, after scope sign-off

Fix the ball-label subset before runs. Near-contact window: ±0.2 seconds around verified contacts. A visible target-court ball is localized correctly when center error ≤20 pixels at 1920-pixel width (scale proportionally for other widths); invisible/occluded frames are separately counted, not guessed. Use the same manually labeled frames for YOLO and candidate, including neighboring-court/ball-like negatives. Report visible-frame support and neighboring-court false positives per minute.

Adopt only if near-contact visible-ball recall improves by **at least 5 percentage points**, ball precision drops by **no more than 2 points**, neighboring-court false positives/minute are **no greater than YOLO**, and median runtime over 3 runs is **≤2.5× YOLO** on the same hardware. Missing labels/undefined metrics/comparability fail the gate. A failure keeps YOLO. Before adviser sign-off only investigate and report checkpoint availability, terms and Mac compatibility; do not integrate TrackNet or fine-tune anything.

## Data and labeling plan (planning estimates, not measurements)

The 26 positives are presently coarse and count as **zero verified contacts** until reviewed. At the observed ~26 contacts per 51-second clip, ~300 contacts would require roughly 10 minutes of active footage (about 12 similar short clips). Allow for dead time, unsuitable visibility and discarded clips: plan **12–18 development clips of 45–90 seconds from 4–6 recording sessions**, plus **2–3 separate held-out recordings**. Include serves, fast drives, occlusion, low contact points and neighboring courts; rare classes may require additional collection. Keep held-out labeling independent of tuning.

For 300 exact contact frames with hitter/type and ~300–600 reviewed negative windows, budget **12–20 primary-labeler hours** (roughly 1–2 minutes/contact, 15–30 seconds/negative, plus full-clip audit/identity mapping/quality checks). A **second human labeler is required**, independently reviewing a stratified 20–25% subset (60–75 contacts plus negatives): allow **3–5 additional hours**, then **2–4 hours** for disagreement review. Total **17–29 person-hours**, plus **2–4 hours for collection/consent/organization**. These estimates depend on video clarity; actual timings should be logged before scheduling the full set. Additional held-out labeling is required if it falls outside these counts. Verified frames alone do not authorize classifier training; adviser sign-off still gates it.

## Deferred

Phase 2 replay cache, retuning and measured 15/30 comparison await complete precise labels. TrackNet investigation, model integration/fine-tuning, hit-classifier training, double-label workflow tooling and broader dataset automation are not Phase 1 deliverables. No new measured accuracy is claimed.

## Verification evidence — 1 October 2026

- Frontend `npm run check`: 98 tests passed, TypeScript passed, production build passed. Existing chart-size test warnings remain non-fatal.
- Backend required check: 201 passed, 1 long synthetic positioning test deselected, one dependency deprecation warning.
- Autosave regression test fails without the hash guard and passes with it.
- Actual manifest/label hash and FPS verified for development only; coarse labels blocked and reserved evaluation source rejected in tuning selection.
- Local browser queue: 0/26 confirmed, candidate image rendered, next frame 45→46 advanced decoder time 1.503960→1.537382 seconds, leaving confirmations unchanged. No benchmark inference or training run.

## Phase 2 preparation update

The three-repeat runner now creates `baseline15.run1.json` through `.run3.json` and equivalent candidate reports/results. It records actual ball/player strides and effective FPS in addition to requested rates. No inference runs have been made with the incomplete current labels.

Apply the frozen gate after six real, comparable inference runs:

```sh
.venv/bin/python -m picklepro.sampling_gate --baseline /Users/kiro/Desktop/THESIS/output/v2-benchmarks/baseline15.run1.json /Users/kiro/Desktop/THESIS/output/v2-benchmarks/baseline15.run2.json /Users/kiro/Desktop/THESIS/output/v2-benchmarks/baseline15.run3.json --candidate /Users/kiro/Desktop/THESIS/output/v2-benchmarks/candidate30.run1.json /Users/kiro/Desktop/THESIS/output/v2-benchmarks/candidate30.run2.json /Users/kiro/Desktop/THESIS/output/v2-benchmarks/candidate30.run3.json --output /Users/kiro/Desktop/THESIS/output/v2-benchmarks/gate.json
```

The gate compares the lowest candidate recall/precision against the highest baseline recall/precision across three runs, and uses median runtime. This conservatively requires the score thresholds in every repeat. Missing/nonfinite scores, partial coverage, repeated run indices (three distinct indices 1/2/3 are required), evaluation partitions, changed labels/splits/models/hardware/player sampling or other changed analysis options fail eligibility. Code revisions may differ for a retune, but must remain identical within each configuration's repeated runs and are recorded in the decision. It cannot update defaults or deployments.

Latest user review: `contact-review-progress (3).json` has 11 saved confirmations, with contacts 21/22 still sharing frame 946; 15 entries remain unconfirmed. The user reports contacts are hidden/unclear. Original review files and confirmations are preserved; no inferred contacts or negatives were added. Even the nonconflicting saved contacts are a partial label set, not a complete clip. The next data requirement is clearer **development** footage (or independent complete-contact review of a suitable existing development recording); `PickleballVideo.mp4` remains reserved for evaluation. The queue of old coarse labels is not an exhaustive-contact audit.

Retuning, replay caching and the measured promotion decision await suitable verified coverage. TrackNet integration, fine-tuning and hit-classifier training remain adviser-gated.

Phase 2 verification: broader backend run passed 219 tests with the existing long synthetic positioning test deselected; the final duplicate-repeat safeguard and all related benchmark/manifest/scorer tests passed in a subsequent 46-test focused run. That safeguard was shown to fail before its fix. Repeated-run CLI behavior was tested with explicitly synthetic result/model fixtures, not real footage; these test scores are not performance evidence. Frontend was unchanged.

## TrackNet research update

Read-only source investigation is documented in [TRACKNET_INVESTIGATION.md](TRACKNET_INVESTIGATION.md), including pinned upstream source revisions, checkpoint preview links, terms found/missing and this Mac's observed runtime. No checkpoint was acquired or integrated; no training or inference test was run. This research does not bypass the Phase 2 measurement order or adviser sign-off gate.

## Submitted-file identity audit

The newly supplied `att.H3Xuzobw5ZDvEkh_3WfgJm1iz_m9FScM1M6Bk7siOKk.MP4` has file SHA-256 `1f75eece86f0e590ef12487fdd67e0266d62cff9bd15270cd4ce8193bb2238a9`. It is **not new development data**: its encoded video stream is identical to reserved `PickleballVideo.mp4` (stream SHA-256 `1673b8681adbca5032289f9c5e7e83d9ce8c08e5ae0afd7f786f6c5fd052a53f`). Frame count/FPS/duration also match. Different container bytes or filenames do not establish independent recordings.

Identity audit used FFmpeg stream-copy hashing, without decoding reserved frames or invoking detection. Three previews of the submitted attachment were extracted for inventory before the alias was identified; none was used to tune rules or confirm labels. The attachment inherits source ID `PickleballVideo` and the evaluation partition. [Alias registry](../Pickleball%20Performance%20Dashboard/eval/recording-aliases.v2.json) persists the mapping; consult it when registering future clips. The core manifest validator handles duplicate file hashes and known source IDs but cannot infer arbitrary reencodes by itself. A changed file hash must not bypass the same-source split rule. No benchmark runs, scores or promotions resulted from this attachment.

A different recording is still required for development labeling. Phase 2 replay-cache implementation remains pending; the submitted-file identity check interrupted that work before code changes.
