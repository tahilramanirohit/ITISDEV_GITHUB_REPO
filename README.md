# PicklePro — pickleball coaching thesis prototype

**Know what to practice next.**

This README describes **`main`**, which holds the `coaching` work with the Hasa re-skin undone and the Night Court design applied. The **`cleanversion`** branch adds the adviser-feedback update (see [`docs/ADVISER_FEEDBACK_HANDOFF.md`](docs/ADVISER_FEEDBACK_HANDOFF.md)): baseline goals, game-focused Progress, pre/in/post-game steps, measured court tests, targeted peer feedback and Buddy matching.

> **`coaching` branch:** created on 22 October 2026 as a copy of `pickleproapp` for the next round of coaching work. Changes land here first; `pickleproapp` stays as it was. Vercel builds every push to `coaching` as a preview at <https://pickleprothesis-git-coaching-bumbai.vercel.app>. That preview needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set for the **Preview** environment in Vercel. PicklePro is a mobile-first pickleball coaching app: players log sessions, rate their game, receive practice focuses and drills, and follow their self-rated progress. Video analysis is optional.

The user-facing brand is **PicklePro**, and the coach mascot is **Pickle**. The source folder is `Pickleball Performance Dashboard/`.

## What this branch includes

- **Mobile navigation:** Home, Sessions, Log, Progress, Players and Profile, in the phone tab bar and the computer sidebar alike. Home-screen icons and a web manifest are included.
- **Players (on `cleanversion`):** Buddy and Partners in one tab. You become **buddies** first (Find → Buddy up, they accept); a buddy can then become a **video partner** ("Partner for video feedback"). Partner invite codes are gone from the app: partners come only from buddies. **My partners** shows requests waiting for your answer, then one card per person (Buddy or Video partner) with games played together, last played, sessions you asked them about and sessions they asked you about, plus **Ask to play**, **Ask for feedback** (pick one of your recent sessions; its Ask sheet opens for that partner), their buddy sessions (log, or a link to the logged one; cancel only before it happens), requests you sent, cancelled sessions and a "How it works, and who sees what" box. **Find** is the Buddy list. **Shared** lists sessions shared either way, so **both players reach the video**: "Feedback asked of you" and "Shared with you" open the partner's report, "You shared" opens your own session's video with the partner's feedback status. After logging a session from a buddy session, Rate & plan offers **Ask Jun for feedback on your dinking?**, or **Partner with Jun for video feedback** first. Old `#/buddy` and `#/partners` links open the matching section. No database change.
- **Player onboarding:** five steps covering the player's name, adult confirmation, experience, play preferences and goals, then a required **baseline** (at least 3 of the 10 skills) that sets two 4-week goals (lowest skills, +1). An optional sixth step offers the measured court tests.
- **Session logging:** solo practice, matches and tournaments; singles/doubles or solo drill formats; goals, partner/opponent names, and tournament details where relevant.
- **Rate & plan:** ten skills rated from 1 to 5, with at least three ratings needed for a plan. Rules use ratings, chosen focuses and reported difficulties to suggest up to three focuses, drills, next-session targets and a week of practice. No video is required.
- **Pickle audio coaching:** browser speech synthesis, playback controls and a readable script. Voice availability depends on the browser/device.
- **Progress centred on games (adviser feedback #1, #5):** a Games / Practice / All switch; average rating against the baseline; game results (win rate, games won, unforced errors game by game, games with a buddy); goals from the baseline and from the court tests; before-and-after patterns from pre-game check-ins and recovery; a skill table with base / now / peer columns; and a re-test reminder after 4 weeks. Ratings are self-reports; court tests are counted drills.
- **Measured court tests (adviser feedback #5):** five counted drills at `#/tests` (deep serves out of 20, dinks in a row, third-shot drops out of 10, deep returns out of 10, rally to 20), each tied to a rated skill. The first result is the baseline, the target is half as many again, and every re-test is kept.
- **Pre-game, in-game and post-game (adviser feedback #3):** each session shows the three steps: pre-game check-in (sleep, readiness, warm-up), in-game result and ratings, and post-game recovery and reflection. A plan after heavy soreness or effort is lighter. The journal stays private.
- **Buddy (on `coaching`):** find a playing partner by level (Beginner, Novice, Intermediate or Advanced). Players opt in to be listed with their name and level only. On `cleanversion` it lives under **Players** (My partners, Find and Shared). To ask someone, a player picks a purpose (practice, casual game or competition prep), a format, the city and the place to meet (free text, such as a court name), and one or more free dates and times. The other player sees a badge on the Buddy tab and can accept or decline. Once accepted, either player can cancel the buddy session with an optional reason (type it or tap a quick pick); the other player sees who cancelled and why under **Cancelled sessions**. Safety rules from the requirements (N04, N05): adults only (confirmed once, on first use), no guest accounts, at most 10 waiting requests, one open request per pair, a 7-day pause after a decline, and no booking, payments or public listings. Players can also say what they are **looking for** (practice, casual games, competition prep); listed players show a rounded game rating from their last 5 rated games, and Buddy suggests up to 3 close matches (similar game rating, same purpose, strong at one of your goal skills first), with a purpose filter. **Log this session** on an accepted buddy session fills in New session and links the two. Rules are enforced in the database (`supabase/migrations/20261022090000_buddy_finder.sql`, `20261105110000_buddy_match.sql`).
- **Partners and peer coaching (on `coaching`):** link with a player you trust by a one-time invite code (8 characters, valid 7 days, works once) or with **Invite as partner** on an accepted buddy's card; the other player must accept, and either can unlink at any time. On a session's video report, **Share with a partner** shares that one session with the partners you pick. A partner opens it from **Players → Shared** (on `coaching`: Partners → Shared with you) and sees the video report and video only: never the owner's goals, ratings, notes, journal, practice plan or audio (M02). Partners leave notes pinned to the paused moment of the video (or about the whole session) and edit only their own; the owner sees every note in their report, can tap a note's time to watch that moment, and can delete any note (M03). Stopping a share or unlinking hides the report and notes from the partner at once, and video links expire within 5 minutes (A04). **Ask for feedback** (on Rate & plan) lets the owner pick up to 3 skills and **With video** or **Ratings only** (also for sessions without a video); the partner rates only those skills on the same 1–5 scale and can tag notes with them. The owner sees **You vs Kyle** per skill, and a skill a partner rated at least 1 lower becomes the plan's first focus. Rules are enforced in the database (`supabase/migrations/20261024090000_partners.sql`, `20261105100000_peer_feedback.sql`).
- **Profiles and settings:** player ID, profile photo, short bio, home court, paddle, session defaults and larger text.
- **Optional video review:** court landmark confirmation, private resumable uploads, queued analysis, player selection, court positions and dwell-time heatmaps, with coverage warnings and versioned report history.
- **Design (v2, mobile first):** light and dark themes (Settings, the header button, or the device setting) in pickle green with a yellow main action and a green accent, Inter for text and Barlow Condensed for numbers, and Pickle the mascot holding a paddle. Color names live in `src/app/theme.ts`; their light and dark values live in `src/styles/theme.css`.

The [mobile and self-assessment guide](docs/MOBILE_SELF_ASSESSMENT.md) explains the underlying flows.

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

A Git checkout does not apply database changes. Follow [Supabase setup](docs/SUPABASE_SETUP.md) for the base schema and project configuration, and apply the repository's migrations in timestamp order through **`20261105110000_buddy_match.sql`** for this branch. Do not reset an existing hosted database.

| Branch migration | Adds |
| --- | --- |
| `20261006090000_self_assessment.sql` | Session review mode and private skill ratings |
| `20261006100000_player_onboarding.sql` | Onboarding answers and baseline ratings |
| `20261006110000_adviser_notes.sql` | Session defaults, tournament details, participant names and upload limits |
| `20261007090000_profile_photos.sql` | Profile photos, bio, home court and paddle |
| `20261022090000_buddy_finder.sql` | Buddy listing, requests, accept and decline |
| `20261023090000_buddy_meetup.sql` | Buddy city and meetup place |
| `20261023100000_buddy_cancel.sql` | Cancel an accepted buddy session with a reason |
| `20261024090000_partners.sql` | Partners, shared sessions and timestamped peer notes |
| `20261105090000_baseline_tests.sql` | Measured court tests (private to each player) |
| `20261105100000_peer_feedback.sql` | Ask partners about up to 3 skills, with video or ratings only; peer ratings and skill-tagged notes |
| `20261105110000_buddy_match.sql` | Buddy "looking for", coarse game rating and strong skills for suggestions; sessions linked to a buddy session |
| `20261105120000_injury.sql` | "I'm injured": private injury periods; hides the player from Buddy until "I'm back" |

For an existing project with the earlier schema already applied, the equivalent branch upgrade scripts are [pickleproapp_upgrade.sql](supabase/scripts/pickleproapp_upgrade.sql), [pickleproapp_upgrade_2.sql](supabase/scripts/pickleproapp_upgrade_2.sql) and [pickleproapp_upgrade_3.sql](supabase/scripts/pickleproapp_upgrade_3.sql), in that order. The `coaching` branch adds [pickleproapp_upgrade_4.sql](supabase/scripts/pickleproapp_upgrade_4.sql) (Buddy) [pickleproapp_upgrade_5.sql](supabase/scripts/pickleproapp_upgrade_5.sql) (Buddy city and meetup location) [pickleproapp_upgrade_6.sql](supabase/scripts/pickleproapp_upgrade_6.sql) (cancel a buddy session with a reason) [pickleproapp_upgrade_7.sql](supabase/scripts/pickleproapp_upgrade_7.sql) (Partners and peer coaching) and, on `cleanversion`, [pickleproapp_upgrade_8.sql](supabase/scripts/pickleproapp_upgrade_8.sql) (measured court tests) [pickleproapp_upgrade_9.sql](supabase/scripts/pickleproapp_upgrade_9.sql) (targeted peer feedback) [pickleproapp_upgrade_10.sql](supabase/scripts/pickleproapp_upgrade_10.sql) (Buddy matching) and [pickleproapp_upgrade_11.sql](supabase/scripts/pickleproapp_upgrade_11.sql) ("I'm injured"): paste each into the Supabase SQL Editor and run them, in that order, after the first three. Until then, the Players page says which file is missing. They are not a replacement for the base schema.

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

Self-assessment plans use explicit rules and the player's own ratings. They do not establish measured technique, skill level or play style. Pickle reads generated coaching scripts through browser speech synthesis; the normal coaching flow does not require an LLM API key.

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
| `Pickleball Performance Dashboard/src/app/` | Screens, navigation and the Pickle coach |
| `Pickleball Performance Dashboard/src/lib/` | Data access, configuration, coaching rules, uploads and result validation |
| `Pickleball Performance Dashboard/server/` | FastAPI, CV pipeline, CLI, worker and Python tests |
| `Pickleball Performance Dashboard/contracts/` | Versioned result schema and fixtures |
| `Pickleball Performance Dashboard/eval/` | Development video labels |
| `supabase/migrations/` | Database, storage policies and job functions |
| `supabase/tests/` | Local database policy tests |
| `docs/` | Setup, research status, evaluation and brand references |

[Run and handoff notes](PICKLEPRO_RUN_AND_HANDOFF.md) and [CV handoff](HANDOFF.md) retain earlier research context; use the branch and setup instructions above when they differ.

The original dashboard design came from [Figma](https://www.figma.com/design/Mu6FwtQXEhhLAEJNXdRNWc/Pickleball-Performance-Dashboard). See [attributions](Pickleball%20Performance%20Dashboard/ATTRIBUTIONS.md) for existing credits.
