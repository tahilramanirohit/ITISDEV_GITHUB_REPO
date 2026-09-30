# PicklePro: run it, try it, and continue the work

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
2. Review a frame where the painted court is visible. Accept the proposed court points or drag/place named points so they follow the lines. For a fixed camera, a confirmed correction is checked again by the Python worker.
3. Run analysis and inspect coverage, warnings, court overlay, player boxes, ball observations, and the **research/experimental** shot view. Select the intended player before interpreting a personal heatmap; a doubles video can make “near side” ambiguous.
4. Open `#/label` to inspect contacts frame by frame. Model suggestions are drafts until a human confirms them. Download labels if you want to evaluate the proposals.

An `insufficient_data` result can be correct: for example, the court may be unmapped, no player may be selected, or the ball model may not see enough frames. It is not automatically an API failure.

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

**Next work, in order:**

1. Build a consented, frame-precise dataset: ball visible/absent and centre, contact time, human hitter identity, and the eight core shot classes (serve, return, drop, drive, volley, dink, overhead, lob plus unclassified). Keep final-test videos untouched during tuning.
2. Run `evaluate_ball` and `evaluate` per clip, and record ball precision/recall, contact precision/recall, hitter accuracy, type confusion, court/ID failures, and processing time. Review false detections on video.
3. Compare licensed candidate ball models or temporal methods on those labels before enabling one. Add model provenance and a repeatable weight setup. Do not treat the five example repositories as evidence of accuracy in this app.
4. Improve court/player identity and shot logic only against concrete errors from that dataset; preserve the result contract, `insufficient_data` behavior, and the separation between experimental research output and player-facing claims.
5. Once the system itself meets the agreed evaluation criteria, plan a hosted worker and deploy a preview. A Vercel frontend alone cannot process queued videos without the Python worker and correctly configured Supabase project.

**Verification before handoff:** from `Pickleball Performance Dashboard/` run `npm run check`; from `server/` run `.venv/bin/python -m pytest -q`. The last checks passed 89 frontend and 165 backend tests, plus the frontend production build. The model-free synthetic command above returned an `ok` result. The last full development-clip run preserved 11 proposals and 10 label matches while suppressing implausible landing coordinates. Re-run focused footage checks after any ball-tracker or shot-rule change; one synthetic test passing is not enough to claim improved detection.
