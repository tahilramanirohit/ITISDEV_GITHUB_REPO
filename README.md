# PicklePro thesis prototype

> **`pickleproapp` branch:** a mobile-first app layout with bottom tabs (Home, Sessions, Log, Progress, Profile), visually inspired by the Reclub sports app. New players answer a short "getting to know you" onboarding at account creation. Every session can now be reviewed **without a video**: the player rates ten skills and gets focus areas, drills, a week of practice and progress over time. Computer-vision video analysis stays available as an optional tab on any session. Needs the migrations `20261006090000_self_assessment.sql` and `20261006100000_player_onboarding.sql`. See [mobile app and self-assessment](docs/MOBILE_SELF_ASSESSMENT.md).



PicklePro accepts fixed-camera pickleball footage and can inspect moving-camera footage when the court tracker finds reliable painted lines. Players can create a session before play, complete a private check-in wizard, record recovery and reflection, and choose draft practice focuses with optional self-ratings. The worker reports detections, court positions, and a dwell-time heatmap with coverage and provenance. Before upload, the player reviews a court frame, drags named landmarks into place, and confirms the map; the worker checks the saved correction against the source video. Player grouping, thumbnails, ball tracking, and estimated shots and rallies remain available for research review. Unvalidated shot statistics and positioning advice are withheld from real-player reports. The development prototype shows experimental events for inspection. See [consolidation guide](docs/CONSOLIDATED_CV.md) and [shot types](docs/SHOT_TYPES.md). Technique, skill and play-style estimates are not computed. The old dashboard is only a labelled sample-data design preview in development.

The application has two paths: **Sessions** uses Supabase email/password sign-in, private resumable uploads, queued analysis, saved results and versioned analysis history; the **local prototype** sends a video directly to FastAPI without saving it. Both routes use the same Python result contract. The [public trial](https://picklepro-free-trial.vercel.app) is an earlier deployed build; this integration branch has not been deployed. A local court preview service must be reachable for server-side confirmation before upload. The dedicated `PickleProThesis-test` Supabase project has the current migrations, with local database tests and a synthetic hosted workflow check from the earlier schema. None of these checks establish accuracy on real footage; see [revision-4 alignment status](docs/REV4_ALIGNMENT.md) and [Supabase setup and verification](docs/SUPABASE_SETUP.md).

## Start locally

On Windows, double-click `Pickleball Performance Dashboard\start_website.bat` for the website and `Pickleball Performance Dashboard\server\start_worker.bat` for the analyzer. To run PicklePro on another computer (same Supabase project, same accounts), follow [Running PicklePro on another computer](docs/NEW_COMPUTER_SETUP.md).

Use Node.js and Python 3.10 or newer. From `Pickleball Performance Dashboard/`:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

The frontend runs at `http://localhost:5173`. With the example environment file unchanged, it shows a setup screen. For Sessions, set the public Supabase URL and key in `.env.local` after following [Supabase setup](docs/SUPABASE_SETUP.md). Never put a service-role key in a `VITE_` variable.

For the local prototype, start the API in a second terminal:

```sh
cd server
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Open `http://localhost:5173/#/local-prototype`. This development route is unavailable in production builds unless explicitly enabled. The API allows the local Vite origin by default.

## Models are found automatically

Download the three reviewed models (court, ball, person; about 75 MB, checked against pinned SHA-256 checksums) with `.venv/bin/python -m picklepro.fetch_models` from `Pickleball Performance Dashboard/server/`. On Windows, `server\start_worker.bat` does this for you. They go into `server/models/`. The court model is the `.pt` file with "court" in its name and the ball model the one with "ball". Any other `.pt`, such as `yolo11n.pt`, is the person model. The local API, the worker, and the CLI find them without any `.env` paths, and use the person model instead of motion detection when Ultralytics is installed. Remove `PICKLEPRO_DETECTOR=motion` from an older `server/.env`, because it forces motion detection. Environment variables still override this; `PICKLEPRO_AUTO_MODELS=0` turns it off. See [model setup](docs/MODEL_SETUP.md).

Check the analyzer's setup before uploading:

```sh
cd "Pickleball Performance Dashboard/server"
.venv/bin/python -m picklepro.worker --check
```

It lists the models in use and exits with an error when the worker and the web app point to different Supabase projects. In that case uploads wait forever, because the worker never sees them.

## Synthetic CLI example

Run the CLI from `Pickleball Performance Dashboard/server/`:

```sh
mkdir -p ../local_media
.venv/bin/python -m picklepro.cli make-synthetic ../local_media/demo.mp4 --calibration-out ../local_media/demo_calibration.json
.venv/bin/python -m picklepro.cli analyze ../local_media/demo.mp4 --calibration ../local_media/demo_calibration.json --court-half near --out ../local_media/result.json
```

The clip and result are **synthetic test material**. The generator tries H.264 for browser playback and falls back to `mp4v` if H.264 encoding is unavailable. See [CV pipeline](docs/CV_PIPELINE.md) for calibration, output meaning, and limitations.

## Verify

From `Pickleball Performance Dashboard/`:

```sh
npm run check
cd server
.venv/bin/python -m pytest -q
```

From the repository root, `bash supabase/tests/run_local_rls_tests.sh` runs the database policy and job tests against a temporary local PostgreSQL instance. It needs PostgreSQL command-line tools. This harness does not include the hosted Supabase Auth, Storage, or TUS services.

Read [adviser decisions](docs/ADVISER_DECISIONS.md) before presenting proposed thesis features as delivered. The code does not copy `kpp91302/Pickleball-Analytics`, and the optional YOLO dependency has separate licensing implications.

The original visual design came from [this Figma file](https://www.figma.com/design/Mu6FwtQXEhhLAEJNXdRNWc/Pickleball-Performance-Dashboard). See [ATTRIBUTIONS.md](Pickleball%20Performance%20Dashboard/ATTRIBUTIONS.md) for existing attributions.
