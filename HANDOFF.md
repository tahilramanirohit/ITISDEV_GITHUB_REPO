# HANDOFF: PicklePro shot and ball detection (for the next AI or developer)

Paste this file into a new AI session to continue the work. It covers the state of the computer-vision work on **`integration/consolidated-cv`** as of 30 September 2026, what was tried, what was measured, and what to do next.

For installing, running the website, the local prototype and the worker, read [PICKLEPRO_RUN_AND_HANDOFF.md](PICKLEPRO_RUN_AND_HANDOFF.md) (Kirk's run guide). This file does not repeat it.

## Ground rules (do not break these)

- **Branches.** Work on `integration/consolidated-cv`. `picklepro-coaching` is the older app branch; `main` may be behind both. Kirk Orino pushes to the same branch: `git fetch` and **merge** before pushing. Never rebase or force-push other people's commits.
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
| Pipeline | `server/picklepro/pipeline.py` | Samples frames: players at 10 per second (`target_fps`), the ball at 15 per second (`ball_fps`). `frame_mode` (chosen on the upload form): `standard`, or `near_players` (the ball on every frame while it is near an on-court player). Analysing every frame was dropped as too slow. Maps the court per frame, tracks the ball, then calls the shot detector and builds the result contract. |
| Models | `server/picklepro/models.py`, `fetch_models.py`, `docs/MODEL_SETUP.md` | Default models: court `court_best.pt`, ball `ball,person,paddle.pt`. Players: found and tracked by `yolo11n.pt`, with 17 body keypoints added from `yolo11n-pose.pt` (`pose_weights`), matched by box overlap. The pose model alone missed small far players. `python -m picklepro.fetch_models` downloads them with pinned SHA-256; `--extra` also downloads the kpp91302 and 5urabhi ball models. |
| Court | `court.py`, `court_lines.py`, `court_refine.py`, `auto_court.py` | Homography from the painted lines. Lines outside the frame are **extrapolated** from the homography (the "imaginary line"), so the full 13.41 × 6.10 m court is always known once four points are mapped. |
| Ball | `ball_detection.py`, `ball_tracking.py` | Keeps flights with plausible speed; removes static and oversized look-alikes. A flight that passes within reach of an on-court player counts 5× when flights overlap (`PLAYER_FLIGHT_BONUS`), so the ball of a neighbouring court loses. Optional `drop_floor_balls_off_court` (off by default) drops balls lying on the floor well outside the court, i.e. from neighbouring courts. |
| Players | `players.py` | Tracks people; keeps **at most 2 per side** (`MAX_PLAYERS_PER_SIDE`). Extra pieces are merged into the best colour match with no time overlap, otherwise marked off court. |
| Zone time | `zones.py`, `docs/SHOT_TYPES.md` | F01/F02/F12 per on-court player during detected rallies: kitchen / transition / baseline / outside shares, the 1 m kitchen-line strip, coverage. Positions out of the picture are estimated (feet from head height, straight-line gap fill up to 8 s, hold 3 s) and the estimated share is reported separately. Shown in the report by `ZoneTimePanel.tsx`. Not yet validated. |
| Swings | `swings.py` | From pose keypoints: wrist speed relative to the shoulders (body heights per second), and contact posture (above head, below hips). |
| Shots | `shots.py`, `docs/SHOT_TYPES.md` | Ball direction changes → candidate hits. Each candidate is scored for each player by reach (distance) × swing factor. A dynamic program makes the hitting side alternate within a rally (`HIT_COST`). Rules classify into 8 public types: serve, return, drop, drive, volley, dink, overhead, lob. Anything else is `unclassified`. |
| Contract | `server/picklepro/contract.py`, `src/lib/analysis/contract.ts` | Versioned result schema (Python and a TypeScript mirror). Change both together; the fixtures are in `contracts/fixtures/`. |
| Worker | `server/picklepro/worker/` | Claims jobs from Supabase, reports progress (migration `20260930090000_analysis_progress.sql`). Ctrl+C stops within seconds; a second Ctrl+C exits at once. |
| Website | `src/app/` | `analysis/ResultView.tsx` (report, shots shown, JSON download), `labelling/LabelPage.tsx` (`#/label`, frame-precise labelling), `local/LocalPrototype.tsx`. |
| Database | `../supabase/migrations/` (repository root) | Sessions, jobs, versioned runs, RLS. The worker uses the service role; the browser uses the anon key under RLS. |

## Evaluation

- Labelled clips (all in `Pickleball Performance Dashboard/`, labels in `eval/`):
  - `TestVideoKirk_REAL.mp4`: 51 s, 30 fps, doubles, near baseline cut off. 26 shots, whole-second labels whose player numbers are **old tracker IDs**; hitter scores on it are meaningless after any tracker change.
  - `PickleballVideo.mp4`: 52 s, 60 fps, doubles, **neighbouring courts in view**. 38 shots, frame-precise; human player numbers with no tracker mapping, so hitters are not scored.
  - `CHvsBJ.mp4`: 29 s, 60 fps, singles. 15 shots, frame-precise, with a tracker mapping.
- The team's shot definitions: `Pickleball_Cap1_Notes.pdf` (not in the repo; summarised in `docs/SHOT_TYPES.md`). Any shot hit out of the air is a volley unless it is a serve, return, lob or overhead.
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

### Current numbers (defaults, Standard detail, 30 Sep 2026)

| Clip | Labelled | Detected | Found | Real | Right type |
| --- | --- | --- | --- | --- | --- |
| TestVideoKirk_REAL.mp4 | 26 | 23 | 19 (73%) | 83% | 63% |
| PickleballVideo.mp4 | 38 | 19 | 15 (39%) | 79% | 40% |
| CHvsBJ.mp4 (the team's own app run, before these changes) | 15 | 14 | 9 (60%) | 64% | 78%, hitter 100% |

Hitter accuracy on the Kirk clip is not comparable across tracker changes (its labels use old tracker IDs). PickleballVideo has no tracker mapping yet: map human players to tracker IDs on `#/label` to score hitters.

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
- **AndrewDettor/TrackNet-Pickleball.** Ball tracking only. Its Keras weights are on Google Drive, which is blocked here. It needs a manual download and a TensorFlow adapter or conversion. TrackNet uses three consecutive frames, so it is the most promising way to find the ball at contact.
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
