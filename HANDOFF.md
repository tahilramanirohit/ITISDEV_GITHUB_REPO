# HANDOFF: PicklePro shot and ball detection (for the next AI or developer)


## Guided report layout — 1 October 2026

- User approved **Review your video → Understand your results → Choose what to practice**. The report now pairs video review/player selection with a compact findings list on desktop, and stacks them in that order on mobile. This replaces the earlier three overview cards plus four separate detection cards. The opening takeaway includes scope limits and one relevant action; hit estimates retain their adjacent experimental warning.
- **“Hits named” is clickable** and scrolls/focuses the hit list. The primary action prioritizes choosing a player, checking the court/camera view when applicable, reviewing hits, then supported or clearly general practice. Goals that cannot be coached get an explicit explanation; no empty practice section is shown. Starting ratings/goals are expandable. Research export, processing details, original pipeline message and full warnings are under **Analysis details**.
- In-report controls are buttons with `aria-controls`, scroll and focus; **never use bare fragment links for these controls**, since the app uses HashRouter. Focus targets are keyboard-accessible. Opening the analysis-details action also opens its disclosure. Existing Watch behavior, player filtering, coaching eligibility, experimental shot warnings, and sample-data protections are preserved. Coaching still leads with one drill/target/evidence; other ideas remain expandable.
- Verification: **106 frontend tests**, TypeScript and production build passed via `npm run check`. Before publishing `integrated-v2` to the `itisdev` remote, the required backend suite passed **220 tests**, with the long synthetic positioning test deselected (1 deselection) and one dependency deprecation warning. New regressions cover report order, primary action, hits-named navigation/focus, unchanged route fragment, and goals that cannot be coached. Existing synthetic chart-size warning remains non-failing. Browser verification used the excluded synthetic preview: desktop 1280×900 and mobile 390×844, supported/withheld coaching, sample and insufficient states. Mobile content fits within the viewport. Clicked hits-named and choose-player controls focused the intended sections without changing the URL hash. Preview-only hot-reload root warning was addressed by adding disposal to the excluded harness; no production runtime error was observed. An older preview tab stopped responding; a fresh tab was used for checks.
- Local preview: `http://127.0.0.1:5175/.qa-results-preview/index.html` while the development server runs. Latest screenshots: `/Users/kiro/Desktop/THESIS/output/results-coaching-preview/revised-desktop.png`, `revised-mobile.png`, `revised-preview.png`. Eligibility flags are simulated **only in this clearly labeled preview**. No real video analysis or model accuracy claim; no backend/default/model changes, training, deployments or raw-video/checkpoint commits. Phase 2 measurement and adviser training gates remain as recorded below.

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

Paste this file into a new AI session to continue the work. It covers the state of the computer-vision work on **`integration/consolidated-cv`** as of 30 September 2026, what was tried, what was measured, and what to do next.

For installing, running the website, the local prototype and the worker, read [PICKLEPRO_RUN_AND_HANDOFF.md](PICKLEPRO_RUN_AND_HANDOFF.md) (Kirk's run guide). This file does not repeat it.

## Ground rules (do not break these)

- **Branches.** Current work is on `integrated-v2`; the integrated baseline is `integration/consolidated-cv`. `picklepro-coaching` is the older app branch; `main` may be behind both. Kirk Orino pushes to the same branch: `git fetch` and **merge** before pushing. Never rebase or force-push other people's commits.
- **Secrets.**
  - Never put the Supabase service-role key (or any `sb_secret_…` key) in a `VITE_` variable or in browser code. The website uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`. The worker uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `server/.env`.
  - Never commit `.env`, `.env.local` or model weights (`server/models/`).
  - Never ask the user to paste keys or passwords into chat. The project ref (the part before `.supabase.co`) is safe to share.
- **Hosted Supabase.** Current project ref: `hbcyqmupfaeiledpzmop`. Apply migrations with `npx supabase db push --dry-run`, then `npx supabase db push`. Never run `supabase db reset --linked` or `supabase config push` against it.
- **Vercel** bakes `VITE_` variables in at build time. After changing them, redeploy. The app uses `HashRouter` (`#/label`, `#/local-prototype`).
- **Honesty.** Shot numbers below come from **one** development clip that was also used for tuning. They are not an accuracy claim. Report measurements as measured, including when a change made things worse.

## Architecture (where things live)

All paths are relative to `Pickleball Performance Dashboard/`.

| Part | Files | What it does |
| --- | --- | --- |
| Pipeline | `server/picklepro/pipeline.py` | Samples frames: players at 10 per second (`target_fps`), the ball at 15 per second (`ball_fps`). Maps the court per frame, tracks the ball, then calls the shot detector and builds the result contract. |
| Models | `server/picklepro/models.py`, `fetch_models.py`, `docs/MODEL_SETUP.md` | Default models: court `court_best.pt`, ball `ball,person,paddle.pt`, players `yolo11n-pose.pt` (17 body keypoints). `python -m picklepro.fetch_models` downloads them with pinned SHA-256; `--extra` also downloads the kpp91302 and 5urabhi ball models. |
| Court | `court.py`, `court_lines.py`, `court_refine.py`, `auto_court.py` | Homography from the painted lines. Lines outside the frame are **extrapolated** from the homography (the "imaginary line"), so the full 13.41 × 6.10 m court is always known once four points are mapped. |
| Ball | `ball_detection.py`, `ball_tracking.py` | Keeps flights with plausible speed; removes static and oversized look-alikes. Optional `drop_floor_balls_off_court` (off by default) drops balls lying on the floor well outside the court, i.e. from neighbouring courts. |
| Players | `players.py` | Tracks people; keeps **at most 2 per side** (`MAX_PLAYERS_PER_SIDE`). Extra pieces are merged into the best colour match with no time overlap, otherwise marked off court. |
| Swings | `swings.py` | From pose keypoints: wrist speed relative to the shoulders (body heights per second), and contact posture (above head, below hips). |
| Shots | `shots.py`, `docs/SHOT_TYPES.md` | Ball direction changes → candidate hits. Each candidate is scored for each player by reach (distance) × swing factor. A dynamic program makes the hitting side alternate within a rally (`HIT_COST`). Rules classify into 8 public types: serve, return, drop, drive, volley, dink, overhead, lob. Anything else is `unclassified`. |
| Contract | `server/picklepro/contract.py`, `src/lib/analysis/contract.ts` | Versioned result schema (Python and a TypeScript mirror). Change both together; the fixtures are in `contracts/fixtures/`. |
| Worker | `server/picklepro/worker/` | Claims jobs from Supabase, reports progress (migration `20260930090000_analysis_progress.sql`). Ctrl+C stops within seconds; a second Ctrl+C exits at once. |
| Website | `src/app/` | `analysis/ResultView.tsx` (report, shots shown, JSON download), `labelling/LabelPage.tsx` (`#/label`, frame-precise labelling), `local/LocalPrototype.tsx`. |
| Database | `../supabase/migrations/` (repository root) | Sessions, jobs, versioned runs, RLS. The worker uses the service role; the browser uses the anon key under RLS. |

## Evaluation

- Test clip: `TestVideoKirk_REAL.mp4` (51 s, doubles, near baseline cut off at the bottom of the frame).
- Human labels: `eval/TestVideoKirk_REAL.labels.json`, 26 real shots.
  - These are **whole-second** labels (`resolution_s: 1`), so matching allows a window around each second.
  - Players are numbered 1–2 near, 3–4 far.
  - Source: the user's `Claude_PickleballTest.pdf`.
- Official scorer:
  ```sh
  .venv/bin/python -m picklepro.evaluate result.json ../eval/TestVideoKirk_REAL.labels.json
  ```
  It matches each label to the nearest detection in time.
- **Fast tuning loop** (not in the repo; rebuild it if you need it):
  1. Run the pipeline once.
  2. Pickle the arguments passed to `pipeline._shot_metrics(...)`.
  3. Replay only `_shot_metrics` while changing constants in `picklepro.shots` with `setattr`.
  4. Score with a matcher that allows labels from t − 0.35 s to t + 1.35 s and, within that window, prefers the detection by the labelled player.

  This turns a several-minute run into under a second per setting.

### Current numbers (default settings, pose model, suman ball model)

| Detected | Shots found (recall) | Detections that are real (precision) | Right hitter | Right side | Right type |
| --- | --- | --- | --- | --- | --- |
| 25 | 0.73 | 0.76 | 0.58 | 0.74 | 0.53 |

The older figure in Kirk's guide ("11 shots, 10 matched, 5/10 types") is from before the swing and alternation work.

### Tried and measured (same clip)

| Change | Result | Kept? |
| --- | --- | --- |
| 5urabhi `best.pt` ball model | Recall 0.85, precision 0.52, type 0.27. With stricter thresholds: recall 0.77, precision 0.61, type 0.35. | No |
| kpp91302 `ball_tracking.pt` ball model | Recall 0.73, precision 0.70, type 0.47 | No |
| Ball detection on every frame (30 per second) | Recall 0.62, precision 0.80, type 0.75 (rules tuned for 15 per second) | No; worth re-tuning |
| Floor filter for other courts' balls, ratio 0.5–3.0 | Ball recall 0.73 → 0.65 | Now 0.5–1.8, **off by default** |
| 3D court-space ball filter | Rejected nothing | No |
| Image wedge filter | Rejected 100 of 251 detections, mostly real balls | No |
| Swings alone as hit detector | 65 swing peaks for 26 shots | Swings only weigh and attribute hits |
| Swing picks the hitter within a side | 21 of 26 labelled seconds correct | Yes (`USE_SWINGS`) |
| "Pause starts a new rally" rule | Split returns into new rallies | Removed |

**Why "detect every shot" is not reached yet.** Most missed shots are moments when the ball detector does not see the ball near contact: fast balls, motion blur, the ball against the players, or serves from below the frame edge. Rule tuning can trade recall for precision but cannot recover a ball that was never detected.

## External references checked

- **kpp91302/Pickleball-Analytics** and **5urabhi/Pickle_ball_tracking.** Ball weights were tested (table above). Both are optional downloads via `fetch_models --extra`.
- **Bot-Derpy/racquet-sports-analyzer** (MIT). The user supplied it as a RAR because Hugging Face is blocked here. It contains **only source code, no trained weights**: 9 Python files, and no weight or LFS files in its git history.
  - Its shot classifier downloads the generic `MCG-NJU/videomae-base` at runtime. That model either maps Kinetics-400 labels by keyword or uses a new, untrained head. Neither is trained for pickleball.
  - Its hit detection is ball **or** wrist, which adds false shots.
  - Its deep ball tracker is a placeholder.
  - Idea worth keeping: fine-tune VideoMAE on short clips centred on labelled hits.
  - Details: `docs/CV_REFERENCE_REPO_EVALUATION.md`.
- **AndrewDettor/TrackNet-Pickleball.** Ball tracking only. Updated investigation found Drive preview links, TensorFlow/Keras three-frame inference and unresolved explicit permission; binary access/hash and Mac compatibility remain unverified. No measured superiority over YOLO is established. See the current [TrackNet investigation](docs/TRACKNET_INVESTIGATION.md).
- **Blocked hosts in the development container:** `huggingface.co` and Google Drive. To use them, allow the domains in the Claude Code environment's network settings, or download the files by hand and put them in `server/models/`.

## Recommended next steps (in order)

1. **Frame-precise labels.** Relabel `TestVideoKirk_REAL.mp4` on `#/label` at 0.1 s, then label 2–4 more clips from other courts. Keep one clip held out and never tune on it.
2. **Better ball at contact.** Try TrackNet-Pickleball weights (manual download), or fine-tune the current YOLO ball model on frames from these videos. Measure ball recall with `picklepro.evaluate_ball` before looking at shots.
3. **Re-tune for 30 per second ball sampling.** It gave the best type accuracy (0.75). The recall loss probably comes from thresholds tuned for 15 per second.
4. **Learned hit classifier.** Once there are about 300 or more labelled hits, train a small model to decide whether a moment is a hit, and by whom. Inputs: ball turn, swing speed and posture, distance. Later, fine-tune VideoMAE on hit-centred clips, following racquet-sports-analyzer's trainer.
5. **Enable `drop_floor_balls_off_court`** when a clip shows neighbouring courts. Check its effect with `evaluate_ball`.

## Checks before every push

From `Pickleball Performance Dashboard/server`:

```sh
PICKLEPRO_AUTO_MODELS=0 .venv/bin/python -m pytest -q \
  --deselect tests/test_positioning.py::test_synthetic_clip_positioning_matches_ground_truth
```

That positioning test needs a long synthetic render.

From `Pickleball Performance Dashboard`:

```sh
npm run check
```

It runs the type check, the tests and the build.
