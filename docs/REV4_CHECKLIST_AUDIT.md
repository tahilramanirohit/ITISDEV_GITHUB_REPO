# Revision 4 checklist audit — 29 September 2026

Source: `PicklePro_Requirements_and_Architecture_v4.pdf`, pages 4–8 (114 stable IDs). Initial audit checked commit `03e5a99`; this document also reflects the local versioned-run upgrade of 29 September. The PDF is a proposed specification, not an instruction to treat proposed thresholds or scope decisions as approved.

**Status key:** **Local** = behavior exists and has local code/test evidence, but is not a hosted release claim; **Partial** = some code exists but an acceptance condition is unmet; **Missing** = no matching workflow or data model; **Evidence** = implementation or evaluation cannot be verified without external input; **C2** or **Stretch** = planned later, not complete. A passing build is not proof of CV accuracy or a complete requirement.

The linked test database was last confirmed to have only migrations `20260924000100` and `20260924000200`. Migrations `20260928000100`, `20260928000200`, `20260929000100` and `20260929000200` need hosted verification. The latest capture/profile and analysis-history UI therefore cannot be claimed to work on that hosted project yet.

## A. Accounts, profile and privacy

| ID | Status | Double-check finding |
| --- | --- | --- |
| A01 | Partial | Supabase sign-up, sign-in and reset UI exist; real email confirmation and recovery redirect have not been exercised end to end. |
| A02 | Partial | Private `profiles` table and form cover the listed fields; new migration is not hosted. |
| A03 | Partial | Uploader attestation is timestamped/versioned and upload-gated; accepted partner invitations do not exist. |
| A04 | Partial | Owner-only RLS for personal data exists; report grants, peer-note permissions and revocation do not. |
| A05 | Partial | Browser deletes a session, video and cascaded rows; no tracked deletion job, shared-report warning, linked-player removal or stale-baseline handling. |
| A06 | C2 | CSV metric export does not exist. |

## B. Preparation: goals and baseline

The current `session_goals` migration and `GoalFields` store focus labels and self-ratings. They do not implement the numeric-goal system in the PDF.

| ID | Status | Double-check finding |
| --- | --- | --- |
| B01 | Missing | No per-player, per-metric/context/format baseline table or membership. |
| B02 | Missing | No 5-minute valid-rally, 80% coverage or 30-contact eligibility check. |
| B03 | Missing | No per-metric `n of 3` baseline-progress display. |
| B04 | Missing | No stored pooled numerator/denominator, range or metric-specific aggregation. |
| B05 | Missing | No deliberate reset or version history. |
| B06 | Missing | Goals cannot retain a prior baseline version after reset. |
| B07 | Missing | Focus labels exist, but no validated-metric numeric goal activation. |
| B08 | Missing | No target, direction, baseline reference, start/deadline or direction validation. |
| B09 | Missing | No focus-driven and later evidence-driven suggestion lifecycle. |
| B10 | Missing | No eligible-session goal-status engine or deadline checks. |
| B11 | Missing | No completed-goal next-goal prompt. |
| B12 | C2 | Consented pair goals are absent. |
| B13 | Missing | Pickleball glossary tooltips are absent. |

## C. Pre-game check-in

Evidence: `CapturePanel.tsx`, `src/lib/api/capture.ts`, migration `20260929000100`, and local SQL tests.

| ID | Status | Double-check finding |
| --- | --- | --- |
| C01 | Partial | A session can precede upload and its uploader can check in; no accepted linked participant can enter their own check-in. |
| C02 | Local | Insert and substantive edit times are compared with actual start; changing start time reclassifies without rewriting an unchanged entry's capture time. |
| C03 | Partial | Private fields appear in the session capture panel with null/missing values; they are not integrated into the performance report. |
| C04 | Local | Check-in is described as context; there is no medical or health score. |

## D. Video capture and upload

Evidence: `SessionDetail.tsx`, `src/lib/upload`, worker `runner.py`, private Storage policies and local SQL tests.

| ID | Status | Double-check finding |
| --- | --- | --- |
| D01 | Local | Recording guide covers tripod, behind-baseline view, full court, landscape, 720p and 30 fps. |
| D02 | Partial | Resumable upload, type/size guard and trim advice exist; plan selection for normal 10-minute clips is open, and trimming is external. |
| D03 | Partial | Video attaches to an existing session with date/context/format/notes; optional partner field is absent. |
| D04 | Partial | Player can select a track from video and re-run; not constrained to earliest usable frame and no accepted partner link or time-bounded mapping. |
| D05 | Missing | No draggable court-corner confirmation/correction UI. |
| D06 | Partial | Worker rejects original portrait, sub-720p or sub-30fps input; unreadable files fail, but full-court visibility is not validated. |
| D07 | Partial | Queued/processing/completed/failed and upload percentage are visible; analysis stage percentage is not. |
| D08 | Local | Wall and ball-machine video registration is rejected by DB trigger and hidden in UI; private logging remains available. |

## E. Computer vision pipeline

Evidence: `server/picklepro/pipeline.py`, `detection.py`, `shots.py`, `video_io.py`, and result contract. These are prototype implementations, not held-out accuracy evidence.

| ID | Status | Double-check finding |
| --- | --- | --- |
| E01 | Partial | OpenCV preserves sampled source timestamps; no FFmpeg ingest or durable source-to-analysis frame map, and default analysis samples at 10 fps. |
| E02 | Partial | Optional court pose mapping and homography exist; the current adapter uses a 14-keypoint model, with no manual drag correction or stored side segments. |
| E03 | Partial | Optional YOLO player tracking exists; ByteTrack is not explicitly pinned/configured and identity correction is absent. Default detector is motion. |
| E04 | Missing | No time-bounded track-to-participant rows, append-only corrections or invalidation cascade. |
| E05 | Partial | Player box bottom-centres are mapped to court metres and most ball positions stay in image coordinates; bounce mapping exists experimentally, without validated side/height handling. |
| E06 | Missing | No stored raw/smoothed ball tracks with observation/interpolation flags or bounded 0.10 s interpolation policy. |
| E07 | Partial | Experimental rallies are grouped from detected hits; no complete/truncated flag or confidence. |
| E08 | Partial | Candidate contacts use ball-direction changes near players; no accepted per-event confidence/provenance schema. |
| E09 | Partial | Candidate bounces use image-direction changes; a preliminary ball-coverage check guards the no-bounce volley rule, but neither is reviewed against labelled bounces. |
| E10 | Stretch | MediaPipe pose cues are not implemented. |
| E11 | Partial | Some event evidence text and metric validation flags exist; event confidence and dependency-quality model are incomplete. |
| E12 | Missing | Raw tracks are embedded in result JSON/database, not saved as a separate private file. |

## F. Metrics and shot classification

| ID | Status | Double-check finding |
| --- | --- | --- |
| F01 | Missing | Exact 1 m kitchen-line strip share over valid rally time is not computed. |
| F02 | Partial | Experimental zone occupancy exists, but not the specified exclusive rally-time zone dictionary and missing-coverage reporting. |
| F03 | Partial | Distance is computed across the selected clip including between-point walking; mean occupied area per eligible rally is absent. |
| F04 | Partial | Experimental rally count/time exists; complete/truncated logic, duration and tempo definitions do not. |
| F05 | Partial | Court heatmap is computed, but unvalidated and hidden from real-player reports. |
| F06 | Partial | Experimental shot rules produce nine categories, versus the six required classes; no validated per-contact attribution. |
| F07 | Partial | Rule descriptions exist, but precedence and image-proxy validation do not match the specified guide. |
| F08 | Partial | Shot counts exist in the result; validated percentage distribution with unclassified denominator is not published. |
| F09 | C2 | Rally-end proximity is absent. |
| F10 | Evidence | No manually labelled real-clip per-metric accuracy results. |
| F11 | Partial | The UI suppresses unvalidated shots, heatmap and advice; full coverage/dependency gates for every metric and downstream use are absent. |
| F12 | Partial | The new `metric_results` schema can hold valid/evaluable seconds and contact count, but the pipeline does not compute or populate them; interpolation share is absent. |

## G. Post-game report and dashboard

| ID | Status | Double-check finding |
| --- | --- | --- |
| G01 | Partial | Result, optional heatmap/shots, and reflection UI exist; no validated rally/KPI/goal-progress report. |
| G02 | Missing | No baseline-version comparison or previous eligible same-context/format metric comparison. |
| G03 | Missing | No trends filtered by context, format and definition version. |
| G04 | Missing | No active numeric goals or target-progress ordering. |
| G05 | Partial | Shot events have video jump links in code, but shots remain gated; other metric event links are absent. |
| G06 | Partial | Four overview cards exist, but they are detector diagnostics rather than four to six validated performance KPIs. |
| G07 | Local | Post-session reflection asks what went well and what to change, with private free text. |

## H. Recovery log

| ID | Status | Double-check finding |
| --- | --- | --- |
| H01 | Local | Optional exertion, soreness, cooldown and timestamp are private and nullable; skipped values stay missing. |
| H02 | Partial | Wording avoids medical advice, but recovery is not displayed beside performance trends. |

## I. Recommendations

| ID | Status | Double-check finding |
| --- | --- | --- |
| I01 | Partial | Hard-coded positional coaching rules exist and are evidence-gated; they do not use active-goal gaps. |
| I02 | Missing | No stored recommendation links to goal, triggering value, processing run and reviewed drill source. |
| I03 | Partial | Some practice text proposes next-session targets; not derived from an active numeric goal. |
| I04 | Missing | No accept/dismiss/done state or persistence. |
| I05 | C2 | Later-session association/effect check is absent. |

## J. Audio feedback and retrieval

| ID | Status | Double-check finding |
| --- | --- | --- |
| J01 | C2 | No reviewed retrieval knowledge base; C1 has in-code drill examples without source metadata. |
| J02 | C2 | Browser speech can read gated coaching, but there is no per-match 60–90 s generated, stored summary or upload toggle. |
| J03 | C2 | No short processed-event cue library for between-drill playback. |
| J04 | C2 | No generated-text numeric validation, rejection log or approved-template fallback. |
| J05 | C2 | No private per-player/per-run audio or transcript storage. |
| J06 | C2 | No feedback event/retrieval/generation log. |

## K. Play patterns and optional labels

| ID | Status | Double-check finding |
| --- | --- | --- |
| K01 | Partial | Descriptive previous-session comparison code exists, but lacks metric eligibility/version checks and usable validated results. |
| K02 | Local | Inferred skill and style labels are disabled; self-ratings are presented separately. |
| K03 | Missing | No rubric-gated provisional-label feature or three-eligible-match evidence rule. |

## L. Gameplay context

| ID | Status | Double-check finding |
| --- | --- | --- |
| L01 | Local | A session requires context, including the added drill option; the new enum is pending on hosted DB. |
| L02 | Local | A session requires format, including singles, doubles, wall and ball machine. |
| L03 | Missing | No context/format trend and baseline filters because those systems do not exist. |

## M. Peer coaching and pairs

| ID | Status | Double-check finding |
| --- | --- | --- |
| M01 | Missing | No partner invite-code, acceptance or unlink workflow. |
| M02 | Missing | No per-player report-share grant or scoped clips/heatmap authorization. |
| M03 | Missing | No timestamped peer notes or subject/author access policies. |
| M04 | C2 | No separately consented pair view. |

## N. Buddy finder

| ID | Status | Double-check finding |
| --- | --- | --- |
| N01 | Missing | No opt-in area/availability/purpose buddy profile; general profile fields are private. |
| N02 | Missing | No renormalized matching/ranking reasons. |
| N03 | Missing | No buddy request/accept or partner-link flow. |
| N04 | Local | No venue booking, payment or public listing feature is present. |
| N05 | Partial | Profile has an adult-confirmation checkbox; no finder, city-only storage, hide, block or report controls. |

## O. Engagement

| ID | Status | Double-check finding |
| --- | --- | --- |
| O01 | Stretch | Optional goal-based consistency challenges are absent. |

## P. Non-functional requirements

| ID | Status | Double-check finding |
| --- | --- | --- |
| P01 | Evidence | No 10-minute 1080p run on named hardware with separate queue and processing times. |
| P02 | Partial | Atomic claim, heartbeat and stale-lease rejection exist. Separate run records preserve prior reports and successful publication switches the active run in one transaction. A per-attempt token and versioned private artifacts are still absent. |
| P03 | Partial | Failures retry with backoff and error code, but default maximum is **three attempts**, versus the specified initial attempt plus one retry; stage is not tracked. |
| P04 | Partial | Owner-only Storage and results plus five-minute raw-video URLs exist; no scoped share revocation or private run-specific artifact service. |
| P05 | Partial | Responsive CSS and large-text control exist; phone-at-court usability has not been checked with people/devices. |
| P06 | Partial | Runs store params, source hash, pipeline version, schema version and a metric-definition version; exact checkpoint hashes, populated code revision and full preprocessing configuration are still missing. |
| P07 | Evidence | Free-plan 50 MB limit is documented and enforced by default; storage plan for normal full-length clips has not been selected. |
| P08 | Missing | No `video_expires_at`, keep choice or scheduled raw-video sweeper. `consent_records.retention_days = 30` records a proposed period despite no active 30-day deletion; UI correctly says deletion is manual. |

## Q. Testing and evaluation

| ID | Status | Double-check finding |
| --- | --- | --- |
| Q01 | Evidence | No documented consented singles/doubles, lighting/height evaluation set. |
| Q02 | Evidence | No recording-level split or frozen untouched final set. |
| Q03 | Evidence | No 200-contact/20-rally labelled pilot, per-class minimum or double-label agreement. |
| Q04 | Evidence | No full-pipeline held-out precision/recall, zone error, identity/coverage and condition breakdown. |
| Q05 | Evidence | Release gates are described in the PDF, but no frozen evaluation results or passed gates. |
| Q06 | Missing | No named-GPU reliability log of upload failures, runtime, gaps and recovery. |
| Q07 | C2 | Player/partner user-study protocol and results are absent. |
| Q08 | C2 | Revised demo-scenario sample data has not been checked against final C2 scope. |

## R. Paper and deliverables

| ID | Status | Double-check finding |
| --- | --- | --- |
| R01 | Missing | Manuscript-wide REV01–REV13 corrections were not made or verified. |
| R02 | Partial | Some docs distinguish pilot choices from evidence; no frozen rationale/version register across paper and implementation. |
| R03 | Missing | No dated primary-source PB Vision/SwingVision comparison or evaluated contribution claim. |
| R04 | Partial | Reference-repository and model-setup notes exist; no complete dependency/checkpoint register with exact installed versions and reuse evidence. |
| R05 | Missing | No complete paper appendix matching the revision 4 metric dictionary. |
| R06 | C2 | Final manuscript cannot reflect final implementation/results yet. |
| R07 | Evidence | Research-ethics clearance and RA 10173 manuscript section are not in this code checkout; obtain clearance before evaluation collection. |

## Verification and highest-priority corrections

- `npm run check`: typecheck, 60 frontend tests, production build passed.
- `server/.venv/bin/python -m pytest -q`: 100 tests passed; one Starlette/httpx deprecation warning.
- `bash supabase/tests/run_local_rls_tests.sh`: passed against temporary PostgreSQL, including two-account isolation, profile privacy, consent-gated Storage, logging-only rejection, lease loss, duplicate finalize, run history, active-run protection and legacy backfill.
- Hosted `supabase migration list --linked`: only the two 24 September migrations are recorded remotely. Hosted Auth, Storage/TUS, new capture and profile flows, and recovery email remain to be checked after migration.

Before claiming C1 alignment, prioritize: (1) hosted migration and access verification; (2) revision 4 rally/coverage metrics plus labelled real-footage gates; (3) baseline and numeric-goal data model; (4) share grants/peer notes and negative permission tests; (5) retention and deletion jobs; (6) buddy safety workflow; (7) named-worker runtime and ethics/manuscript evidence. Record the adviser decision on the C1/C2 split and buddy scope before fixing release dates.
