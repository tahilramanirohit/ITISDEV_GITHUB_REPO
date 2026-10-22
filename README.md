# Hasa — pickleball coaching thesis prototype

**Know what to practice next.**

This README describes the **`pickleproapp` branch**, including the merged Hasa rebrand.

> **`coaching` branch:** created on 22 October 2026 as a copy of `pickleproapp` for the next round of coaching work. Changes land here first; `pickleproapp` stays as it was. Vercel builds every push to `coaching` as a preview at <https://pickleprothesis-git-coaching-bumbai.vercel.app>. That preview needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set for the **Preview** environment in Vercel. Hasa is a mobile-first pickleball coaching app: players log sessions, rate their game, receive practice focuses and drills, and follow their self-rated progress. Video analysis is optional.

The user-facing brand is **Hasa**, and the coach mascot is **Piko**. The thesis project, Python package, internal identifiers and some research, privacy and consent wording retain **PicklePro**. The source folder remains `Pickleball Performance Dashboard/`.

## What this branch includes

- **Mobile navigation:** Home, Sessions, Log, Progress and Profile, with a bottom tab bar on phones and navigation adapted for tablets and desktop. Home-screen icons and a web manifest are included.
- **Player onboarding:** five steps covering the player's name, adult confirmation, experience, play preferences, goals and optional starting skill ratings.
- **Session logging:** solo practice, matches and tournaments; singles/doubles or solo drill formats; goals, partner/opponent names, and tournament details where relevant.
- **Rate & plan:** ten skills rated from 1 to 5, with at least three ratings needed for a plan. Rules use ratings, chosen focuses and reported difficulties to suggest up to three focuses, drills, next-session targets and a week of practice. No video is required.
- **Piko audio coaching:** browser speech synthesis, playback controls and a readable script. Voice availability depends on the browser/device.
- **Self-rated progress:** trends in the player's average and individual skill ratings. These are self-reports, not measured skill scores.
- **Private journal:** check-in, recovery and reflection alongside the Rate & plan and Video tabs.
- **Buddy (on `coaching`):** find a playing partner by level (Beginner, Novice, Intermediate or Advanced). Players opt in to be listed with their name and level only. The page has two tabs: **Available** (players, with a level filter) and **Requests** (requests waiting for your answer, your buddies and requests you sent). To ask someone, a player picks a purpose (practice, casual game or competition prep), a format, the city and the place to meet (free text, such as a court name), and one or more free dates and times. The other player sees a badge on the Buddy tab and can accept or decline. Once accepted, either player can cancel the buddy session with an optional reason (type it or tap a quick pick); the other player sees who cancelled and why under **Cancelled sessions**. Safety rules from the requirements (N04, N05): adults only (confirmed once, on first use), no guest accounts, at most 10 waiting requests, one open request per pair, a 7-day pause after a decline, and no booking, payments or public listings. Rules are enforced in the database (`supabase/migrations/20261022090000_buddy_finder.sql`).
- **Profiles and settings:** player ID, profile photo, short bio, home court, paddle, session defaults and larger text.
- **Optional video review:** court landmark confirmation, private resumable uploads, queued analysis, player selection, court positions and dwell-time heatmaps, with coverage warnings and versioned report history.
- **Hasa design:** paper and forest-green surfaces, yellow accents, Bricolage Grotesque headings, DM Sans body text and Piko's icon. Brand constants live in `src/app/brand.ts`; tokens live in `src/styles/theme.css`.

The Hasa rebrand retains the existing routes, data model and analysis behavior. See the [Hasa handoff](HASA_RESKIN_HANDOFF.md) and [brand kit](docs/brand/hasa/README.md). The [mobile and self-assessment guide](docs/MOBILE_SELF_ASSESSMENT.md) explains the underlying flows; its older layout and palette descriptions predate the Hasa rebrand.

## Architecture

| Component | Role |
| --- | --- |
| React 18, TypeScript, Vite 6, Tailwind CSS 4 | Browser app, using React Router with hash routes |
| Supabase Auth, Postgres and private Storage | Accounts, profiles, sessions, ratings, journals, uploads and saved results |
| FastAPI local service | Court preview/validation and direct local-prototype analysis |
| Python `picklepro` pipeline and worker | Video processing and queued Supabase jobs |
| Shared result contract | JSON schema with Python and TypeScript validation |

Self-assessment and saved practice plans need the frontend and Supabase, without the Python analyzer. Saved video analysis also needs a running worker and a reachable court preview/validation API. Hosting the frontend alone does not process queued videos.

## Start the app locally

Requirements: Git, Node.js compatible with Vite 6, and npm. Python 3.10 or newer is needed for the API, worker or CLI.

For a fresh checkout:

```sh
git clone --branch pickleproapp https://github.com/tahilramanirohit/ITISDEV_GITHUB_REPO.git
cd ITISDEV_GITHUB_REPO
```

From the repository root:

```sh
cd "Pickleball Performance Dashboard"
npm ci
cp .env.example .env.local
```

Set the public values in `Pickleball Performance Dashboard/.env.local`:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<public-anon-key>
```

Use the intended Supabase project with this branch's migrations applied (see below), then start the website:

```sh
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`. Restart Vite after changing `.env.local`. Empty or invalid Supabase settings show a setup screen on the main route. Never put a service-role key or an LLM API key in a `VITE_` variable: those values are embedded in the browser bundle.

On Windows, `start_website.bat` in the dashboard folder is the website launcher. See [new-computer setup](docs/NEW_COMPUTER_SETUP.md) for platform details, but use **`pickleproapp`** when older guides name another branch.

### Database requirements

A Git checkout does not apply database changes. Follow [Supabase setup](docs/SUPABASE_SETUP.md) for the base schema and project configuration, and apply the repository's migrations in timestamp order through **`20261007090000_profile_photos.sql`** for this branch. Do not reset an existing hosted database.

| Branch migration | Adds |
| --- | --- |
| `20261006090000_self_assessment.sql` | Session review mode and private skill ratings |
| `20261006100000_player_onboarding.sql` | Onboarding answers and baseline ratings |
| `20261006110000_adviser_notes.sql` | Session defaults, tournament details, participant names and upload limits |
| `20261007090000_profile_photos.sql` | Profile photos, bio, home court and paddle |

For an existing project with the earlier schema already applied, the equivalent branch upgrade scripts are [pickleproapp_upgrade.sql](supabase/scripts/pickleproapp_upgrade.sql), [pickleproapp_upgrade_2.sql](supabase/scripts/pickleproapp_upgrade_2.sql) and [pickleproapp_upgrade_3.sql](supabase/scripts/pickleproapp_upgrade_3.sql), in that order. The `coaching` branch adds [pickleproapp_upgrade_4.sql](supabase/scripts/pickleproapp_upgrade_4.sql) (Buddy) [pickleproapp_upgrade_5.sql](supabase/scripts/pickleproapp_upgrade_5.sql) (Buddy city and meetup location) and [pickleproapp_upgrade_6.sql](supabase/scripts/pickleproapp_upgrade_6.sql) (cancel a buddy session with a reason): paste each into the Supabase SQL Editor and run them, in that order, after the first three. Until then, the Buddy page says which file is missing. They are not a replacement for the base schema.

### Development and guest modes

Local development enables the sample design preview, local prototype and Dev mode by default. Dev mode signs in through Supabase anonymous auth and seeds clearly labelled mock sessions; it still requires the database and anonymous sign-ins to be configured.

Private guest entry is separately enabled with `VITE_ENABLE_GUEST_MODE=true` and also needs Supabase anonymous sign-ins. Guests use real data; leaving the guest session or clearing browser data can lose access. The environment examples document these flags and `VITE_TRIAL_NO_WORKER=true`, which disables new video uploads for a trial without a worker. Development tools are off by default in production builds unless explicitly enabled; the shot-labelling route remains accessible without an account.

## Optional video analysis

Use a fixed camera with a clear court view for best results. Moving-camera footage can produce limited results. The saved upload flow checks landscape orientation and at least 720p when metadata is available. Default limits are **50 MB per video, 10 seconds to 5 minutes, five uploads per day and 1 GB stored per player**. The current limits are defined in `src/lib/upload/limits.ts` and the adviser-notes migration.

From `Pickleball Performance Dashboard/server/`, prepare and start the local API:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

On Windows, use `.venv/Scripts/python.exe` in place of `.venv/bin/python`. The frontend defaults to `VITE_CV_BACKEND_URL=http://localhost:8000`. The API allows the local Vite origin by default; configure `CORS_ALLOW_ORIGINS` if using another origin. A phone or remote browser needs an API address it can reach, because `localhost` refers to that device.

For the reviewed court, ball and person models, install the optional YOLO dependencies and download the pinned weights from `server/`:

```sh
.venv/bin/python -m pip install -r requirements-yolo.txt
.venv/bin/python -m picklepro.fetch_models
```

The downloader verifies SHA-256 checksums and saves weights under `server/models/`. Restart the API after model setup. The API, worker and CLI discover these models automatically; explicit environment settings override discovery. An old `PICKLEPRO_DETECTOR=motion` setting forces motion detection. See [model setup](docs/MODEL_SETUP.md) for provenance and licensing.

### Saved uploads and worker

Copy `server/.env.example` to `server/.env` and set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the **same project** used by the frontend. This file is server-only and ignored by Git. From `server/`, in another terminal:

```sh
.venv/bin/python -m picklepro.worker --check
.venv/bin/python -m picklepro.worker --mode measured
```

`--check` reports local configuration and model paths and detects mismatched frontend/worker project refs; it does not contact Supabase or prove credentials work. Keep the worker running for queued jobs to finish. `--mode test_fixture` stores labelled canned output for workflow tests; it does not analyze the uploaded video. Windows users can use `server/start_worker.bat`; a configured Mac can use `bash start_mac_worker.sh` from `server/`.

Before upload, the player confirms recording consent and reviews named court landmarks. Saved results include analysis history and reanalysis controls. Raw-video expiry is set to 30 days after the first measured report unless the owner keeps the recording; the running worker performs deletion sweeps. Saved reports remain after raw-video removal, but reanalysis then requires a video.

### Local research tools

- `http://localhost:5173/#/local-prototype`: direct analysis through FastAPI, without an account or saved results; available in development or when explicitly enabled.
- `http://localhost:5173/#/label`: frame-by-frame shot labelling without signing in; suggestions remain drafts until human confirmation.
- `http://localhost:5173/#/design-preview`: labelled sample-data dashboard; available in development or when explicitly enabled.

For a model-free synthetic smoke test, run from `server/` (macOS/Linux shell):

```sh
mkdir -p ../local_media
.venv/bin/python -m picklepro.cli make-synthetic ../local_media/demo.mp4 --calibration-out ../local_media/demo_calibration.json
PICKLEPRO_AUTO_MODELS=0 .venv/bin/python -m picklepro.cli analyze ../local_media/demo.mp4 --calibration ../local_media/demo_calibration.json --court-half near --out ../local_media/result.json
```

The clip and result are synthetic test material. See [CV pipeline](docs/CV_PIPELINE.md), [consolidated CV](docs/CONSOLIDATED_CV.md) and [shot types](docs/SHOT_TYPES.md) for calibration, interpretation and evaluation.

## Research limitations

Self-assessment plans use explicit rules and the player's own ratings. They do not establish measured technique, skill level or play style. Piko reads generated coaching scripts through browser speech synthesis; the normal coaching flow does not require an LLM API key.

Video court mapping and player tracking can fail on moving, occluded or crowded footage. Ball tracking, shot classification and rally estimates remain experimental. Unvalidated shot statistics and positioning advice are withheld from real-player reports; research tools expose experimental output for inspection. A ground-plane homography cannot measure ball height, spin or true three-dimensional speed. An `insufficient_data` report can be a valid outcome, and model confidence is not evidence of real-world accuracy.

Read [adviser decisions](docs/ADVISER_DECISIONS.md) and [revision-4 alignment](docs/REV4_ALIGNMENT.md) before presenting proposed thesis features as delivered. Earlier deployment links and verification counts in handoffs describe those earlier snapshots, not a verified deployment or test run of this checkout.

## Verify changes

From `Pickleball Performance Dashboard/`:

```sh
npm run check
```

This runs TypeScript checking, Vitest and the production build. No linter script is configured. For backend tests, from `server/`:

```sh
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
```

From the repository root, `bash supabase/tests/run_local_rls_tests.sh` runs database policy and job tests against a temporary local PostgreSQL instance. It needs PostgreSQL command-line tools and does not include hosted Auth, Storage or TUS services. Hosted upload, cross-account access and retention checks still need a configured test project.

## Repository guide

| Path | Contents |
| --- | --- |
| `Pickleball Performance Dashboard/src/app/` | Screens, navigation, Hasa brand constants and Piko |
| `Pickleball Performance Dashboard/src/lib/` | Data access, configuration, coaching rules, uploads and result validation |
| `Pickleball Performance Dashboard/server/` | FastAPI, CV pipeline, CLI, worker and Python tests |
| `Pickleball Performance Dashboard/contracts/` | Versioned result schema and fixtures |
| `Pickleball Performance Dashboard/eval/` | Development video labels |
| `supabase/migrations/` | Database, storage policies and job functions |
| `supabase/tests/` | Local database policy tests |
| `docs/` | Setup, research status, evaluation and brand references |

The [Hasa handoff](HASA_RESKIN_HANDOFF.md) covers the current presentation layer. [Run and handoff notes](PICKLEPRO_RUN_AND_HANDOFF.md) and [CV handoff](HANDOFF.md) retain earlier research context; use the branch and setup instructions above when they differ.

The original dashboard design came from [Figma](https://www.figma.com/design/Mu6FwtQXEhhLAEJNXdRNWc/Pickleball-Performance-Dashboard). See [attributions](Pickleball%20Performance%20Dashboard/ATTRIBUTIONS.md) for existing credits.
