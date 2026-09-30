# PicklePro: run it, try it, and continue the work


## Results and coaching update — 1 October 2026

- User approved clearer results and coaching, keeping **“hits named”**. The measured-result overview now separates findings, items needing human review, and things the system cannot assess, followed by a next step. Ball detections do not imply every contact was seen; unavailable hits do not imply no hits occurred. Motion-only results say “Movement detected” instead of claiming the player was identified.
- Eligible coaching leads with one existing practice focus, its drill, target and evidence; remaining ideas are expandable. No-focus reports avoid pointing to a nonexistent priority. Existing positioning eligibility checks, thresholds, progress comparison and audio guards remain in place. Audio still reads the complete supported practice plan.
- Withheld coaching explains the blocker and next action. An expandable **optional general practice** exercise is explicitly independent of this video's findings and is never personalized or spoken as coaching. Sample results receive neither that exercise nor a measured-result overview. Court-position coaching does not assess shot technique, shot success or in/out calls.
- Verification: frontend `npm run check` passed **104 tests**, TypeScript and production build. Regression assertions cover “hits named”, motion-only wording, eligibility, sample safety, insufficient results and no-focus next steps. Existing chart-size warning remains in the synthetic DOM test; it does not fail the suite. Backend code was unchanged and backend tests were not rerun for this UI change.
- Browser checks used a clearly labeled synthetic UI harness: supported/withheld coaching, expandable ideas/general practice, sample and insufficient states, desktop (1280×900) and mobile (390×844). Mobile document width stayed within the viewport; no Vite overlay remained after fixing the preview-only import. A preview-only React hot-reload root warning was observed during editing. No real-video inference or accuracy evaluation was performed.
- Local preview while its development server is running: `http://127.0.0.1:5175/.qa-results-preview/index.html`. The harness is locally excluded from Git; it simulates eligibility flags and **is not evidence of model validation**. Screenshots: `/Users/kiro/Desktop/THESIS/output/results-coaching-preview/`. Resume the app with `npm run dev -- --host 127.0.0.1 --port 5175`; use the usual app entry for actual video reports. No deployment, detector/default change, training, video/checkpoint commit, or held-out tuning occurred.
- Next research work remains blocked on complete precise development labels; replay cache and the actual 15/30-FPS comparison are pending. Adviser sign-off still gates training. This UI work adds no measured accuracy claim.

## Current v2 work — 1 October 2026 (overrides older branch/next-step guidance below)

- Work only on **`integrated-v2`**, created from integrated commit `f3d3c3b`. No deploys, default changes, raw-video/checkpoint commits, fine-tuning or classifier training. User adviser sign-off confirmation gates Phase 3/4 training; TrackNet investigation only is allowed before it, with no integration.
- Approved order: **evaluation foundation → 30-FPS retune → ball model → hit classifier**. Measure the cheap change first. [V2 evaluation protocol and run instructions](docs/V2_EVALUATION.md) are authoritative for this work; older coarse-label scores below remain historical development results.
- Phase 1: JSON/CSV split manifests; source/hash/FPS-linked label exports that preserve coarse labels; fixed 0.2-second time-only maximum-pair/minimum-error scorer; class confusion/F1/support, timing/unmatched/unknown rates; provenance benchmark runner; **26-contact frame-stepping queue, all initially unconfirmed** at `/Users/kiro/Desktop/THESIS/output/contact-review-v2/index.html`. The queue was the first concrete task after the scorer. Human review is required, including the two old negatives separately; no contacts were confirmed by the agent.
- `PickleballVideo.mp4` is candidate evaluation only and is rejected by the tuning selector before file access. One held-out recording is insufficient for thesis claims: **target 2–3**. Consent is explicitly unknown in both manifest rows.
- Frozen Phase 2 gate: recall +≥5 percentage points, precision loss ≤2 points, median runtime of 3 runs ≤2.2× baseline, on identical verified development data/checkpoints/hardware. Failed gate retains baseline. Phase 3: near-contact visible-ball recall +≥5 points, precision loss ≤2 points, neighboring-court FP/min ≤YOLO, runtime ≤2.5×YOLO, with fixed localization threshold and labeled subset detailed in the protocol. No comparison has run; coarse labels block it.
- **Data plan:** ~300 verified contacts plus ~300–600 negatives: budget 12–18 short development clips across 4–6 recording sessions, plus 2–3 separate held-out recordings. Estimated 12–20 primary-labeler hours, 3–5 hours from a **required second labeler** for an independent 20–25% subset, and 2–4 adjudication hours (17–29 person-hours total), plus 2–4 collection/consent hours. The existing 26 coarse contacts count as zero verified until human review. Estimates and assumptions are in the protocol.
- Verification on 1 October: frontend **98 tests**, TypeScript and production build passed; backend **201 passed**, 1 long synthetic positioning test deselected (per existing check instructions). Queue browser check showed 0/26 confirmed and one-frame stepping. Strict coarse-label rejection and held-out tuning rejection were checked; no inference benchmark run.
- Phase 2 checks: 219 backend tests passed (1 long synthetic positioning test deselected), then 46 focused tests passed after the duplicate-repeat safeguard. Three-repeat output and effective FPS were tested using synthetic fixtures only; no real inference comparison occurred.
- Phase 2 preparation: benchmark runner accepts `--repeats 3`, records effective sampling/strides, and requires explicit complete-contact label coverage; `picklepro.sampling_gate` applies the frozen +5-point recall / ≤2-point precision loss / ≤2.2× median runtime rule with provenance checks. The latest review remains partial (11 saved confirmations, contacts 21/22 conflict); no actual 15/30 comparison or retune has run. Clearer development footage is needed; do not borrow the reserved evaluation clip.
- TrackNet investigation completed at source-inspection level: [checkpoint, terms and Mac report](docs/TRACKNET_INVESTIGATION.md). This Mac exposes PyTorch MPS; current upstream V3 source supports MPS/CPU but its checkpoints are badminton-specific and untested here. Pickleball-specific TensorFlow/Keras candidate has no explicit license found in the inspected repository. Checkpoint bytes/hashes remain unverified. No model was downloaded, installed, integrated or trained. Phase 2 measurement still precedes adoption; adviser sign-off remains required.
- New submitted attachment `att.H3Xuzobw5ZDvEkh_3WfgJm1iz_m9FScM1M6Bk7siOKk.MP4` is an alias of **reserved evaluation** recording `PickleballVideo.mp4`. Container SHA-256 differs, but both encoded video streams hash to `1673b8681adbca5032289f9c5e7e83d9ce8c08e5ae0afd7f786f6c5fd052a53f`. Source identity was checked by stream copy without decoding reserved frames; attachment previews were inventory only, before identity was resolved. No detection/tuning ran. [Alias registry](Pickleball%20Performance%20Dashboard/eval/recording-aliases.v2.json) records both hashes. Never assign this attachment a development source ID. Replay-cache work was interrupted by the submitted-file identity check and is not yet implemented.
- Replay cache/rule sweeps belong to Phase 2. Training/model integration and broad workflow automation are deferred. No new detection accuracy claim.

This is the handoff for the **`integration/consolidated-cv`** branch of [ITISDEV_GITHUB_REPO](https://github.com/tahilramanirohit/ITISDEV_GITHUB_REPO). It combines the RohitVer coaching and CV work with the KirkVer application and questionnaire wizard. The `feature/cv-shot-evidence` work is already merged into this branch. Start here if you are a new tester or an AI taking over development.

**Use this branch when testing these changes.** `main`, `picklepro-coaching`, and the [public Vercel trial](https://picklepro-free-trial.vercel.app) may show different builds. This branch has been pushed to GitHub; it has **not** been deployed to that public trial. Sign-in and email confirmation are not the current system-improvement focus.

## What the system currently does

- A Vite/React website creates private pickleball sessions, runs a pre-play questionnaire wizard, accepts video uploads, and shows saved analysis when Supabase and a worker are configured.
- A no-account **local prototype** uploads a video to the local Python API and shows court mapping, player detections, ball observations, and research-only shot and rally suggestions. It does not save the session to Supabase.
- The Python pipeline samples video frames; detects and groups players; maps visible court lines; tracks **observed** ball boxes; estimates player positions and a dwell-time heatmap; and proposes experimental shots and rallies. A user can correct court landmarks and select a player. Missing ball positions are not filled in.
- `#/label` lets a human review shot contacts frame by frame, identify players, and download confirmed labels. Python evaluators compare result JSON with shot labels or ball-position labels.

**What the system does not establish:** Shot types, hitters, bounces, and rallies have not passed independent evaluation. The player-facing report withholds unvalidated shot statistics and advice. A court homography maps the ground plane; it cannot measure ball height, spin, or true three-dimensional speed. The local prototype exposes experimental outputs for inspection. A model confidence score is not accuracy. See [Consolidated CV](docs/CONSOLIDATED_CV.md) and [shot types](docs/SHOT_TYPES.md).

## Quick start: try the CV without an account

Requirements: Git, Node.js, and Python 3.10 or newer. These commands use macOS/Linux or Git Bash. On Windows, replace `.venv/bin/python` with `.venv/Scripts/python.exe` and use `py -3.12 -m venv .venv` if `python3` is unavailable.

```sh
git clone https://github.com/tahilramanirohit/ITISDEV_GITHUB_REPO.git
cd ITISDEV_GITHUB_REPO
git switch -c integration/consolidated-cv --track origin/integration/consolidated-cv
cd "Pickleball Performance Dashboard"
npm ci
cp .env.example .env.local
npm run dev
```

Leave that terminal running. In a **second terminal**, from `Pickleball Performance Dashboard/server/`:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Check `http://127.0.0.1:8000/health`, then open **`http://localhost:5173/#/local-prototype`**. Empty Supabase fields in `.env.local` are fine for this route. A setup message at `#/` only means the saved Sessions route has not been configured. The `#/label` route also works without signing in.

### Get useful player, court, and ball detections

The base Python install is enough to start the API and try the synthetic CLI. For the reviewed local YOLO models, stop the API, then from `server/` run:

```sh
.venv/bin/python -m pip install -r requirements-yolo.txt
.venv/bin/python -m picklepro.fetch_models
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

The optional install includes a large PyTorch runtime. `fetch_models` downloads the pinned court, ball, and person weights to `server/models/` and checks their SHA-256 values. The API and worker discover local weights automatically. Model files and `.env` files are not Git deliverables. Read [model setup](docs/MODEL_SETUP.md) for provenance, licensing, and optional weight choices. Do not set `PICKLEPRO_DETECTOR=motion` if you want the person model.

### Try a video

1. In `#/local-prototype`, choose a permitted video. The repository includes `Pickleball Performance Dashboard/TestVideoKirk_REAL.mp4` as a development clip. A full model-backed analysis of that 51-second clip took several minutes on the development computer.
2. Review a frame where the painted court is visible. Accept the proposed court points or drag/place named points so they follow the lines. Mark only visible painted intersections. If a corner falls outside the image, select its name and use **Remove selected point** instead of placing it at the image edge. At least four well-spread points are required. For a fixed camera, a confirmed correction is checked again by the Python worker.
3. Run analysis and inspect coverage, warnings, court overlay, player boxes, ball observations, and the **research/experimental** shot view. Select the intended player before interpreting a personal heatmap; a doubles video can make “near side” ambiguous.
4. Open `#/label` to inspect contacts frame by frame. Model suggestions are drafts until a human confirms them. Download labels if you want to evaluate the proposals.

An `insufficient_data` result can be correct: for example, the court may be unmapped, no player may be selected, or the ball model may not see enough frames. It is not automatically an API failure.

### Recent local-prototype fixes (30 September 2026)

- The Python API returns `calibration.method: "user_confirmed_landmarks"` after analysis with a confirmed court. The frontend result parser now accepts this value, matching its TypeScript type and the shared Python/JSON schema. Before this fix, a completed upload could show `Unexpected result format: calibration.method ... got "user_confirmed_landmarks"` instead of its results. Re-run the upload to see the result; the local prototype does not persist past uploads or their results across a new page session.
- The court editor now lets testers remove a selected point. Use this when an intersection is hidden or outside the frame; guessed edge points can make otherwise plausible court geometry fail with `Court points disagree`. This warning is a geometry check, so the user must still correct or remove disagreeing points. The fix does not make an inaccurate map valid.
- On the current development Mac, the website was last served at `http://127.0.0.1:5174/#/local-prototype` because port 5173 was occupied by another app; the API was at port 8000. These are local processes, not a permanent deployment. The quick-start instructions above use Vite's normal 5173 port for a new setup.

### Command-line smoke test, including without YOLO

From `server/`, generate a synthetic clip and calibration, then analyze it:

```sh
mkdir -p ../local_media
.venv/bin/python -m picklepro.cli make-synthetic ../local_media/demo.mp4 --calibration-out ../local_media/demo_calibration.json
PICKLEPRO_AUTO_MODELS=0 .venv/bin/python -m picklepro.cli analyze ../local_media/demo.mp4 --calibration ../local_media/demo_calibration.json --court-half near --out ../local_media/result.json
```

The command explicitly disables automatic model discovery so this smoke test is quick and works with the base Python install. Remove `PICKLEPRO_AUTO_MODELS=0` to exercise installed models. The output is synthetic test material, not evidence of real-world accuracy. The CLI returns code `3` for a valid `insufficient_data` result; read its message and coverage before treating that as a failure.

## Optional: saved Sessions and uploads

Saved Sessions require a **deliberately selected** Supabase project with the repository's migrations, a public project URL and anon key in `Pickleball Performance Dashboard/.env.local` (`VITE_SUPABASE_URL=https://<project-ref>.supabase.co` and `VITE_SUPABASE_ANON_KEY=<anon key>` from the dashboard's Project Settings → API; restart the website after editing, and if the home page says "Supabase is not configured" it lists which value is missing or wrong), and a trusted worker machine with the project URL and service-role key in `Pickleball Performance Dashboard/server/.env`. Keep the service-role key out of browser variables and Git. See [Supabase setup](docs/SUPABASE_SETUP.md) before changing a database; a code checkout does not apply migrations.

From `server/`, check the worker configuration and start actual analysis:

```sh
.venv/bin/python -m picklepro.worker --check
.venv/bin/python -m picklepro.worker --mode measured
```

The worker must remain running for queued uploads to finish. The local API is also useful for court preview when using saved Sessions. The `test_fixture` worker mode stores clearly labeled canned output and is only for testing the upload flow. On Windows, [new-computer setup](docs/NEW_COMPUTER_SETUP.md) describes the batch files and the two settings files; when using that older guide, check out **`integration/consolidated-cv`** as shown above instead of its older `picklepro-coaching` instruction.

## Evaluate rather than guess

From `server/`, score the existing development shot labels against an analysis result:

```sh
.venv/bin/python -m picklepro.evaluate result.json ../eval/TestVideoKirk_REAL.labels.json
```

For ball positions, create a JSON file of frames a human actually inspected, with times and visible-ball centres. Example:

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

Then run `.venv/bin/python -m picklepro.evaluate_ball result.json ball_labels.json`. It reports precision, recall, location error, and per-frame outcomes **only for labeled frames**; an unlabeled frame does not count as a true or false detection. See [reference repository evaluation](docs/CV_REFERENCE_REPO_EVALUATION.md).

The most recent full development-clip check retained 248 observed ball boxes and proposed 11 shots; 10 matched the 26 whole-second human shot labels. Matched type accuracy was 5/10. This clip was used during development, so none of these numbers is an independent accuracy claim. More consented, frame-precise clips from different courts, lighting, players, and viewpoints are needed, with a held-out final set.

## For the next AI or developer

**Branch and scope.** Start from `integration/consolidated-cv` in RohitVer (`tahilramanirohit/ITISDEV_GITHUB_REPO`). The prior feature branch `feature/cv-shot-evidence` is already merged; do not reapply its commit. KirkVer is `thekirx/PickleProThesis`. The public Vercel trial is an older deployment. Check `git status`, current branch, remote tracking, and the latest migration history before changing code or data. The existing integration branch is the tested merge target, not `main`.

**Repository map.** Frontend: `Pickleball Performance Dashboard/src/app/`, especially `local/LocalPrototype.tsx`, `analysis/CourtCorrection.tsx`, `labelling/LabelPage.tsx`, and `src/lib/analysis/contract.ts`. API: `server/main.py`. CV: `server/picklepro/pipeline.py`, `ball_detection.py`, `ball_tracking.py`, `court.py`, `players.py`, and `shots.py`. Result schema: `server/picklepro/contract.py` and its TypeScript mirror. Evaluators: `evaluate.py` and `evaluate_ball.py`. Saved-job worker: `server/picklepro/worker/`. Supabase schema: `supabase/migrations/`.

**What was learned from the five suggested repositories.** [TrackNet-Pickleball](https://github.com/AndrewDettor/TrackNet-Pickleball) supplied the frame-label-versus-prediction evaluation pattern; its separately hosted weights and absent license prevented direct model reuse. [smart-pickleball-assistant](https://github.com/arcotn/smart-pickleball-assistant) and [ai-enhanced-pickleball-learning-platform](https://github.com/phu-boop/ai-enhanced-pickleball-learning-platform) offered tracking/pose ideas, but their shot rules are not validated for this camera setup. [pickleball-computer-vision-ai](https://github.com/Abdul-Rehman-44/pickleball-computer-vision-ai) does not include the custom weights described in its README. [pickleball-vision-llm](https://github.com/SathishKumarAI/pickleball-vision-llm) separates trajectory features from classification, but its TrackNet model adapter is incomplete. Read the [source review](docs/CV_REFERENCE_REPO_EVALUATION.md) before importing code or weights.

**Known limits.** The local model misses fast/occluded balls and can confuse look-alikes; court mapping and player tracking can fail on moving or crowded footage; camera cuts may be missed. The shot classifier is heuristic and experimental. A strict contact-gap filter and a looser stationary-object filter were tried and rolled back because they reduced matched contacts on the development clip. The final branch does retain a plausible-speed check and withholds landing coordinates mapped far outside the court. Do not use additional observed ball boxes alone as proof of better shot detection.

**Keep this handoff current.** The user asked that every future change be reflected in this file immediately. Update the relevant behavior, run instructions, known limits, and verification counts in the same work session as each code change, before committing or handing work over. Treat this file as part of the change, not as a later documentation task.

**Next work, in order:**

1. Build a consented, frame-precise dataset: ball visible/absent and centre, contact time, human hitter identity, and the eight core shot classes (serve, return, drop, drive, volley, dink, overhead, lob plus unclassified). Keep final-test videos untouched during tuning.
2. Run `evaluate_ball` and `evaluate` per clip, and record ball precision/recall, contact precision/recall, hitter accuracy, type confusion, court/ID failures, and processing time. Review false detections on video.
3. Compare licensed candidate ball models or temporal methods on those labels before enabling one. Add model provenance and a repeatable weight setup. Do not treat the five example repositories as evidence of accuracy in this app.
4. Improve court/player identity and shot logic only against concrete errors from that dataset; preserve the result contract, `insufficient_data` behavior, and the separation between experimental research output and player-facing claims.
5. Once the system itself meets the agreed evaluation criteria, plan a hosted worker and deploy a preview. A Vercel frontend alone cannot process queued videos without the Python worker and correctly configured Supabase project.

**Verification before handoff:** from `Pickleball Performance Dashboard/` run `npm run check`; from `server/` run `.venv/bin/python -m pytest -q`. The latest frontend check (30 September 2026) passed 94 tests, TypeScript checking, and the production build. The last recorded backend check passed 165 tests; re-run it after backend changes. The model-free synthetic command above returned an `ok` result. The last full development-clip run preserved 11 proposals and 10 label matches while suppressing implausible landing coordinates. Re-run focused footage checks after any ball-tracker or shot-rule change; one synthetic test passing is not enough to claim improved detection.
