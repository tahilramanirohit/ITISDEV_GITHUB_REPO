# a. Database Creation Scripts

PicklePro's database runs on **Supabase** (hosted PostgreSQL with sign-in, file storage and row-level
security). Every table, security rule and function is created by the SQL files in this folder.

| File / folder | Use it for |
|---|---|
| `new_project_setup.sql` | **Start here.** Creates the whole database in a new, empty Supabase project in one go. It is every migration below, joined in order. |
| `check_database.sql` | Read-only check. Run it after setup: every row should say **OK**. On an older project it names the upgrade file that is missing. |
| `migrations/` | The same database, one change per file, in date order (`YYYYMMDDHHMMSS_name.sql`). Used by the Supabase CLI (`supabase db push`) and by the database tests. |
| `upgrades/` | `pickleproapp_upgrade.sql` and `_2` … `_17`: bring an existing, older project up to date without deleting data. `itisdev_upgrade.sql` is a one-off for the team's first test project (kept for the record). |
| `config.toml` | Supabase CLI project settings (local ports, sign-in options). |
| `make_new_project_setup.sh` | Rebuilds `new_project_setup.sql` from `migrations/` after a new migration is added. |

## Create the database (new project)

1. Create a free project at <https://supabase.com> (Dashboard → New project).
2. Dashboard → **SQL Editor** → New query → paste all of `new_project_setup.sql` → **Run**.
3. New query → paste `check_database.sql` → **Run**. Every row should say **OK**.
4. Dashboard → **Project Settings → API**: copy the **Project URL** and the public **anon** key into the
   website's `.env.local` (see `e_Installers_and_Other_Software/README.md`).
5. Optional: Authentication → Providers → Google, for "Continue with Google" (steps in
   `d_Other_System_Files/docs/NEW_SUPABASE_PROJECT.md`).

Alternative with the Supabase CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push`.

## Main tables

- **Players:** `profiles` (name, level, photo, bio, preferences and settings), `consent_records`.
- **Games and ratings:** `sessions`, `session_participants`, `self_assessments` (1–5 skill ratings),
  `checkins` and `reflections` (journal), `injury_periods` and `recovery_logs`, `baseline_tests` (court tests).
- **Video:** `video_assets` (private storage), `analysis_jobs` (the queue the analyzer reads),
  `analysis_runs`, `analysis_results` and `metric_results` (versioned reports).
- **Players together:** `buddies` (friend list), `buddy_requests` (asking to play), `hidden_buddy_sessions`,
  `partners` (video partners), `report_shares`, `peer_ratings`, `peer_notes` (video comments),
  `game_tags` and `game_tag_trust` (games shared with buddies).

**Security:** every table has row-level security. A player sees only their own rows, plus what a
buddy or video partner has chosen to share. Changes that involve two players go through checked
database functions only. The database tests in `c_Test_Data_Scripts_Files/database_tests/` prove these
rules.
