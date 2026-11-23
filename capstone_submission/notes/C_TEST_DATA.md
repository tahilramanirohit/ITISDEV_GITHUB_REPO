# c. Test Data Scripts / Files

| Folder | What it holds | How to use it |
|---|---|---|
| `demo_data/demo_data.sql` | Four demo accounts with 6–9 weeks of games, ratings, journal, court tests, a buddy and a video partner | Supabase → SQL Editor → paste → Run. Safe to run again: it deletes and re-creates only these four accounts. |
| `demo_data/link_rohit_carla.sql`, `demo_data/buddy_request_for_rohit.sql` | Small helpers for the live demo: make two players buddies and video partners, or send a buddy request to accept on stage. Change the names at the top of each file. | Same as above. |
| `database_tests/` | Database security and rules tests: who can see which rows, the job queue, buddies, partners, feedback, court tests, video comments. It keeps the repository's `supabase/` layout (`tests/`, plus copies of the `migrations/` and `scripts/` it builds from). | With PostgreSQL 15+ installed: `bash database_tests/tests/run_local_rls_tests.sh` (run it as a normal user, not root/administrator). It builds a throwaway database from the migrations and runs every test file in order; each check prints PASS. |
| `test_videos/` | Three pickleball videos used to test the analyzer: `PickleballVideo.mp4` (doubles), `CHvsBJ.mp4` (singles, broadcast camera), `TestVideoKirk_REAL.mp4` (51 s doubles clip filmed by the team from behind the baseline) | Upload one to a game in the app, or run the analyzer on it directly. |
| `shot_labels/` | Hand-labelled shots for the test videos (time, hitter, shot type) | Scoring the analyzer's shot detection, e.g. `python -m picklepro.evaluate result.json TestVideoKirk_REAL.labels.json` (see `d_Other_System_Files/docs/SHOT_TYPES.md`). |
| `analysis_fixtures/` | Two sample analysis results in the agreed format: a full one, and one with too little data | Used by the web app and analyzer unit tests. The same files are also in `b_Program_Codes/.../contracts/fixtures/` so the tests run from there. |

## Demo accounts (password `123456`, demo only)

| Email | Player |
|---|---|
| `bea.reyes@picklepro.com` | Beginner, mostly solo drills, a buddy request waiting |
| `marco.santos@picklepro.com` | Intermediate, 10 games with results and journal, court tests, a video partner |
| `lia.cruz@picklepro.com` | Advanced, competition player, Marco's partner and buddy |
| `jun.tan@picklepro.com` | Novice, looking for practice |

The website's **Dev mode** button (development builds only) also creates sample games for a guest
account; that data comes from two migrations: `20260928000100_dev_mock_data.sql` and
`20260929200000_dev_mock_runs.sql`.

## Unit tests (in `b_Program_Codes/`)

- **Web app:** run `npm test` in `Pickleball Performance Dashboard/`.
- **Analyzer:** run `.venv\Scripts\python -m pytest` in `Pickleball Performance Dashboard/server/`
  (after `pip install -r requirements-dev.txt`).

The full list of test files is below.
