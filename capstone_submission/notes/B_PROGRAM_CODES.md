# b. Program Codes

All of PicklePro's source code, in the same folder layout as the GitHub repository
(`Pickleball Performance Dashboard/`).

## 1. Web app — `Pickleball Performance Dashboard/`

React 18 + TypeScript, built with Vite, styled with Tailwind CSS. It talks to Supabase directly
(sign-in, database, video upload) and is hosted on Vercel.

| Folder / file | What it holds |
|---|---|
| `src/main.tsx`, `src/app/App.tsx` | Start-up and page routes |
| `src/app/home/` | Home: this week, last game, next practice |
| `src/app/sessions/` | Log a game, the game page (Rate & plan, Players, Video, Journal) |
| `src/app/selfAssessment/` | Rating skills 1–5 with the hold-the-ball control |
| `src/app/progress/` | Progress: goals, skills, games, Pickle's jar, before & after |
| `src/app/tests/` | Court tests (counted drills) |
| `src/app/players/`, `src/app/partners/` | Buddies, asking to play, video partners, feedback |
| `src/app/analysis/` | Video report: player picker, court view, shots, errors, position |
| `src/app/onboarding/`, `src/app/auth/` | Sign-up steps and sign-in (email or Google) |
| `src/app/profile/`, `src/app/settings/`, `src/app/privacy/` | Profile, settings, privacy page |
| `src/lib/api/` | All database calls |
| `src/lib/coaching/` | Coaching rules: plans, drills, goals, insights |
| `src/lib/analysis/` | Reading and checking video-analysis results, court heatmaps |
| `src/styles/`, `src/app/theme.ts` | Light and dark colours, fonts |
| `public/` | App icons and the web manifest (install to home screen) |
| `contracts/analysis_result.v1.schema.json` | The agreed format of a video-analysis result |
| `package.json`, `package-lock.json` | Packages and their exact versions |
| `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `vercel.json` | Build, type, test and hosting settings |
| `.env.example` | Settings template (Supabase URL and public key) |

Unit tests sit next to the code they test (`*.test.ts`, `*.test.tsx`). A few of them read the hand-labelled
shots in `eval/` and the database files in `../supabase/migrations/` (a copy of
`a_Database_Creation_Scripts/migrations/`), which is why those are here too.

Commands (inside `Pickleball Performance Dashboard/`): `npm install`, then `npm run dev` (local site at
<http://localhost:5173>), `npm test`, `npm run build`, or `npm run check` (types + tests + build).

## 2. Video analyzer — `Pickleball Performance Dashboard/server/`

Python 3.12. A worker that picks up uploaded videos from the queue, finds the court, players and ball
with YOLO models and OpenCV, works out positions, shots and errors, and saves a result in the
`analysis_result.v1` format.

| File / folder | What it holds |
|---|---|
| `picklepro/worker/` | The job worker (`python -m picklepro.worker`) |
| `picklepro/pipeline.py` | The analysis steps in order |
| `picklepro/court*.py`, `auto_court.py`, `camera_view.py` | Finding the court and mapping it to metres |
| `picklepro/detection.py`, `players.py`, `ball_*.py`, `tracknet.py` | Players and ball |
| `picklepro/shots.py`, `swings.py`, `errors.py`, `zones.py`, `positioning.py` | Shots, errors, court zones |
| `picklepro/contract.py`, `export_contract.py` | Writing results in the agreed format |
| `picklepro/fetch_models.py` | Downloads and checks the AI model files |
| `main.py` | Local test API (FastAPI) |
| `tests/` | Analyzer unit tests (`pytest`) |
| `requirements*.txt`, `.python-version` | Python packages and version |
| `.env.example` | Settings template (server-side only) |
