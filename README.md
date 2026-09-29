# PicklePro thesis prototype

PicklePro analyzes fixed-camera pickleball footage and reports player detections, court positions, a dwell-time heatmap, and court-positioning patterns (depth-band time, transition stays, approaches) with coverage and provenance. When evidence is sufficient, it turns these into practice focus areas with drills and targets, and compares them with your previous session. With a ball model, it also reports experimental rallies and rule-based shot types (serve, return, overhead, volley, dink, drive, lob), which have not yet been checked against labelled footage; see [shot detection](docs/SHOT_DETECTION.md). Skill and play-style estimates are not implemented. The old dashboard is only a labelled sample-data design preview in development.

The application has two paths: **Sessions** uses Supabase email/password sign-in, private resumable uploads, queued analysis, and saved results; the **local prototype** sends a video directly to FastAPI without saving it. The hosted Sessions path was verified with a synthetic video in the dedicated `PickleProThesis-test` Supabase project. This does not establish accuracy on real footage; see [Supabase setup and verification](docs/SUPABASE_SETUP.md).

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

From the repository root, `bash supabase/tests/run_local_rls_tests.sh` runs the database policy and job tests against a temporary local PostgreSQL instance. It needs PostgreSQL command-line tools. `bash supabase/tests/run_upgrade_script_test.sh` does the same for the one-off ITISDEV upgrade script. This harness does not include the hosted Supabase Auth, Storage, or TUS services.

Read [adviser decisions](docs/ADVISER_DECISIONS.md) before presenting proposed thesis features as delivered. The code does not copy `kpp91302/Pickleball-Analytics`, and the optional YOLO dependency has separate licensing implications.

The original visual design came from [this Figma file](https://www.figma.com/design/Mu6FwtQXEhhLAEJNXdRNWc/Pickleball-Performance-Dashboard). See [ATTRIBUTIONS.md](Pickleball%20Performance%20Dashboard/ATTRIBUTIONS.md) for existing attributions.
