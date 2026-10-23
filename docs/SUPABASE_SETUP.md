# Supabase test-project setup and verification

The hosted workflow was verified on September 24, 2026, with synthetic test material in the dedicated Free project `PickleProThesis-test` (`vyhpxmakeciwvknynshc`) in the new `Pickleball` organization, Singapore region (`ap-southeast-1`). The project is available in the [Supabase dashboard](https://supabase.com/dashboard/project/vyhpxmakeciwvknynshc). Use this project for further PicklePro tests; do not apply these migrations to an unrelated project.

## Hosted verification record

- The six migrations through `20260929000200` were applied to the dedicated test project on September 29. A local backup of the public schema was saved before the four newer migrations. Linked migration history matched afterward. The raw-video retention migration (`20260929142117`) is also in use on this project: on the same day the public-trial check in [IMG_6291_SHOT_TEST.md](IMG_6291_SHOT_TEST.md) showed a 30-day deletion date and a working keep control. `20260929200000_dev_mock_runs.sql` is newer and has not been applied to any hosted project yet. Run `supabase migration list --linked` to confirm what a project has; the newer account/capture and versioned-run flows still need hosted end-to-end testing.
- Two synthetic test accounts were used. In the browser, account A created a session, uploaded a synthetic H.264 clip through the resumable upload client to private Storage, saw the fixture worker complete a job, and recovered the result after a reload. The UI identified the fixture as **TEST DATA — NOT FROM YOUR VIDEO**.
- Account A could read its session, video, job, result, and private video object. Account B could read none of A's records or video and could not finalize A's upload. Twenty simultaneous finalize calls for A's video returned the same single job.
- The same uploaded clip was requeued and processed with the measured worker. It downloaded the private video, stored a measured heatmap and coverage, and the browser displayed **MEASURED FROM THIS VIDEO**. Private video playback loaded successfully.

These checks used synthetic footage and programmatically created confirmed test accounts. Real footage accuracy, the normal email confirmation flow, an interrupted and resumed upload, and invalid-file/error cases remain unverified. Security and performance advisors were not run because the installed Supabase CLI did not expose that command and the connected Supabase account cannot access this project. Review those advisors in the project's dashboard before broader use.

The [public trial](https://picklepro-free-trial.vercel.app) is a separate Vercel site using this test project. Its labelled design preview is open without an account. Account, session and check-in screens are available; uploads only complete when a measured worker is running, because there is no always-on hosted worker. On September 29 the trial accepted a private guest upload (see [IMG_6291_SHOT_TEST.md](IMG_6291_SHOT_TEST.md)), so anonymous sign-ins must be on for that project; check Authentication → Sign In / Providers before relying on this. The existing `picklepro-itisdev-preview` site still points to the older ITISDEV project and was not changed.

## Prepare the test project

1. Use the dedicated test project above, or create another disposable Supabase project and record its reference. Enable email/password sign-in. Set its site URL to the frontend origin you will use, such as `http://localhost:5173`, and allow any other development origin you actually use in Auth redirect URLs. The hosted email confirmation redirect has not yet been tested on this project.
2. From the repository root, inspect your installed CLI (`supabase --version`, `supabase link --help`, `supabase db push --help`), then sign in and link **the test project** with `supabase login` and `supabase link --project-ref <test-project-ref>`. Verify the selected reference before applying migrations.
3. Preview pending migrations with `supabase db push --dry-run`, then apply them with `supabase db push`. The migrations create sessions, private video storage, jobs, results, goals, profiles, participant capture, versioned analysis runs, metric-result scaffolding, raw-video retention, analysis progress for the progress bar, policies and worker functions. Confirm with `supabase migration list --linked` that the Local and Remote columns match. Do not use a remote database reset: it drops data. Do not run `supabase config push` against a hosted project: `supabase/config.toml` holds local-development auth settings (localhost site URL, anonymous sign-ins on, email confirmation off) that would overwrite the project's settings.
4. Check that the Data API is enabled for the project and that the migrated tables and functions are reachable with the intended roles. New Supabase projects no longer grant Data API access to new `public` tables automatically; these migrations include explicit grants for the required roles. RLS then limits which rows each signed-in user can access. See [the Supabase Data API change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).
5. Confirm that the private `session-videos` bucket exists and review the project's global upload size limit. The bucket allows 500 MiB, but Supabase Free caps the global per-file limit at 50 MB. See [LARGE_VIDEO_UPLOADS.md](LARGE_VIDEO_UPLOADS.md) before raising the frontend limit.
6. Decide on anonymous sign-ins (Authentication → Sign In / Providers). They are needed only for the Guest and Dev mode buttons. Guests can upload once they accept consent, and there are no per-user storage quotas, so leave them off unless a trial needs them.
7. Run the Security and Performance advisors in the dashboard and record the findings.

The worker sends its key as both `apikey` and `Authorization: Bearer`. The code was written for the JWT `anon` and `service_role` keys; new projects default to `sb_publishable_…` / `sb_secret_…` keys. If the project has a **Legacy API keys** tab, prefer those keys. With the new keys, confirm that a fixture worker actually completes a job. `python -m picklepro.worker --check` only compares the project refs in the two env files; it does not contact Supabase.

Only public project URL and public/anon key belong in `Pickleball Performance Dashboard/.env.local`:

```dotenv
VITE_SUPABASE_URL=https://<test-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<public-key>
VITE_MAX_UPLOAD_MB=50
```

Put the project URL and **service-role key** in `Pickleball Performance Dashboard/server/.env`, which is ignored by Git and used only by the worker:

```dotenv
SUPABASE_URL=https://<test-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-secret>
WORKER_RESULT_MODE=test_fixture
```

Never place the service-role key in a `VITE_` setting or browser code. The worker bypasses row-level security and must run on a trusted machine.

## Dev mode (local development or an explicit testing deployment)

`npm run dev` shows a **Dev mode: enter with mock data** button under Sign in. A dedicated testing deployment can also show it by building with `VITE_ENABLE_DEV_MODE=true`. The button is hidden by default in production builds. It signs in as a Supabase anonymous user and creates four `[Dev mock]` sessions, including three weeks of improving practice and one unusable clip, so the results, feedback and progress screens can be tested without uploading a video. Mock results carry `provenance.pipeline_version = "dev-mock"` and are labelled **DEV MOCK DATA — NOT A REAL ANALYSIS**.

One-time setup on the test project:

1. Authentication → Sign In / Providers → turn on **Allow anonymous sign-ins**. This is a project setting, not SQL.
2. In the SQL editor, run `supabase/migrations/20260928000100_dev_mock_data.sql`. It adds `seed_dev_mock_data()`, which only anonymous users may call, only writes the caller's own rows, and replaces that user's earlier mock sessions.

Each Dev mode entry creates a new anonymous user; **Exit dev mode** signs it out. Delete old anonymous users under Authentication → Users when they pile up. Do not enable anonymous sign-ins on a production project without reviewing abuse limits.

## Verify the full flow

From `Pickleball Performance Dashboard/`, run `npm ci && npm run dev`. In another terminal, from `Pickleball Performance Dashboard/server/`, install the Python requirements and start one fixture worker:

```sh
.venv/bin/python -m picklepro.worker --mode test_fixture
```

1. Sign up or sign in as test account A. Create a session and select a small video. Confirm progress, upload completion, a queued/processing job, and a completed result. The result must visibly say **TEST DATA — NOT FROM YOUR VIDEO**.
2. Reload the page. Confirm the session, job, and result persist. Check video playback through its private signed URL.
3. Create test account B. Confirm B cannot list or open A's session, video, job, result, or storage object. Repeat with B's own session. Test a second upload attempt or simultaneous finalize calls and confirm only one job is created for one video.
4. Interrupt a TUS upload, reselect the same file, and confirm it resumes. Test an invalid file and a missing upload before finalize. Check the job's error message and retry behavior for an unreadable video in measured mode.
5. Review Supabase security and performance advisors after migration, and record any findings. The local PostgreSQL policy harness can be rerun with `bash supabase/tests/run_local_rls_tests.sh`; it does not replace these hosted checks.

The fixture worker stores a canned result without analyzing the uploaded file. For actual processing, stop it and start `.venv/bin/python -m picklepro.worker --mode measured`. The worker selects the near player by default. See [MODEL_SETUP.md](MODEL_SETUP.md) for optional court, player, and ball models and [CV_PIPELINE.md](CV_PIPELINE.md) for result interpretation. Results may legitimately say `insufficient_data`.

The goals form needs `supabase/migrations/20260928000200_session_goals.sql` on a database already created from these migrations. For the existing ITISDEV project, re-run the idempotent `supabase/scripts/itisdev_upgrade.sql` in the SQL editor before deploying this web build. This changes only the selected project's schema; committing code does not run it. Older sessions receive empty goals and no self-ratings.

## Revision 4 capture migration

The current web build also needs `supabase/migrations/20260929000100_capture_and_consent.sql` applied to the **selected PicklePro project** before it is deployed. It adds private player profiles, participant check-ins, recovery logs, reflections, actual start times, the drill context, and versioned upload consent. Uploads are rejected by Storage until the uploader confirms consent in the app. Apply this migration through the normal Supabase migration workflow after reviewing the target project and a dry run. If the legacy ITISDEV upgrade script is run again afterward, its upload policy retains the consent check.

## Versioned analysis migration

`supabase/migrations/20260929000200_versioned_analysis_runs.sql` adds run history and migrates existing reports into run 1. An in-progress reanalysis becomes a separate run while its earlier report remains active. A legacy job marked completed without a result is changed to failed with `missing_result`. Review those cases and back up the selected database before applying this data migration. After deployment, verify the session's active report, run history, a successful replacement, a failed replacement and cross-account access. The migration does not enable any revision-4 metric values by itself.

## Raw-video retention migration

`supabase/migrations/20260929142117_raw_video_retention.sql` sets a raw-video expiry 30 days after a session's first **measured** report (fixture and dev-mock results do not start the clock) and lets the owner keep or release a video. Existing measured reports start their 30 days when the migration is applied. Results stay after the file is deleted, but a deleted video can no longer be reanalyzed.

Deletion is performed by the worker: while `python -m picklepro.worker` runs (either mode), it sweeps at most hourly and removes up to 20 expired files per pass. **If no worker is running, nothing is deleted**, so the 30-day promise on the consent screen only holds while a worker is running. Check Storage usage during the pilot.

## Dev-mode run migration

`supabase/migrations/20260929200000_dev_mock_runs.sql` updates `seed_dev_mock_data()` so each mock session has a completed run 1 that is published as its active report, like a real analysis. Without it, mock sessions show an empty analysis history. It changes only the function; existing mock sessions are replaced the next time Dev mode is entered.

## Upload consent version

The upload consent version (`2026-09-29-v4`) is hardcoded both in the SQL policies (`consent_insert_self` and the `session_videos_insert_own` storage policy) and in `UPLOAD_POLICY_VERSION` in `src/lib/api/capture.ts`. To change the consent text, add a migration that recreates both policies with the new version **and** update the constant in the same commit. `capture.test.ts` fails if the constant differs from the latest version found in the migrations.

[Supabase migration deployment](https://supabase.com/docs/guides/deployment/database-migrations) · [Supabase resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)
