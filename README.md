# PicklePro thesis prototype

PicklePro accepts handheld and fixed-camera pickleball footage. Players can create a session before play, record a private check-in, recovery log and reflection, and choose draft practice focuses with optional self-ratings. With optional local court and player models, the worker reports player detections, court positions and a dwell-time heatmap with coverage and provenance. Automatic court mapping is checked on each sampled frame; missing views are excluded. Positioning advice and shot labels are withheld from real-player reports until they pass evaluation on labelled real footage. The current worker still computes experimental hits, bounces, rallies and shot types for development, but those are not validated performance evidence. Technique, skill and play-style estimates are not computed. The old dashboard is only a labelled sample-data design preview in development.

The application has two paths: **Sessions** uses Supabase email/password sign-in, private resumable uploads, queued analysis, saved results and versioned analysis history; the **local prototype** sends a video directly to FastAPI without saving it. The earlier hosted Sessions path was verified with a synthetic video in the dedicated `PickleProThesis-test` Supabase project. The revision-4 capture, consent and versioned-run migrations have local database tests but have **not** been verified on that hosted project. None of these tests establish accuracy on real footage; see [revision-4 alignment status](docs/REV4_ALIGNMENT.md) and [Supabase setup and verification](docs/SUPABASE_SETUP.md).

## Start locally

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

Put the court model (a `.pt` file with "court" in its name) and the player/ball model (any other `.pt`) in `Pickleball Performance Dashboard/server/models/`. The local API, the worker, and the CLI find them without any `.env` paths, and use the person model instead of motion detection when Ultralytics is installed. Environment variables still override this; `PICKLEPRO_AUTO_MODELS=0` turns it off. See [model setup](docs/MODEL_SETUP.md).

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
