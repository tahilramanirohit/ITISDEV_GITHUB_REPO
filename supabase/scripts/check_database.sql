-- PicklePro: which database updates is this project missing?
-- Paste the whole file into Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Read-only: it changes nothing. Each row is one thing the app needs. Status "MISSING"
-- names the file to run (from supabase/scripts/), in the order shown. Run the files,
-- then run this check again until every row says OK.

with
checks(n, upd, needs, ok) as (values
  -- Base schema (docs/SUPABASE_SETUP.md: the September migrations)
  (0,  'Base schema', 'sessions, videos and analysis tables',
       to_regclass('public.sessions') is not null and to_regclass('public.video_assets') is not null
       and to_regclass('public.analysis_jobs') is not null and to_regclass('public.analysis_runs') is not null),
  (0,  'Base schema', 'profiles, journal and consent tables',
       to_regclass('public.profiles') is not null and to_regclass('public.checkins') is not null
       and to_regclass('public.consent_records') is not null),
  (0,  'Base schema', 'session-videos storage bucket',
       exists (select 1 from storage.buckets where id = 'session-videos')),
  -- pickleproapp_upgrade.sql
  (1,  'pickleproapp_upgrade.sql', 'self ratings and onboarding',
       to_regclass('public.self_assessments') is not null
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'baseline_ratings')),
  (2,  'pickleproapp_upgrade_2.sql', 'default settings, game results, video limits',
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sessions' and column_name = 'match_result')
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'video_assets' and column_name = 'duration_s')
       and exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'video_upload_limits')),
  (3,  'pickleproapp_upgrade_3.sql', 'profile photo, bio, home court',
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_path')
       and exists (select 1 from storage.buckets where id = 'profile-photos')),
  (4,  'pickleproapp_upgrade_4.sql', 'Buddy list and requests',
       to_regclass('public.buddy_requests') is not null
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'buddy_visible')),
  (5,  'pickleproapp_upgrade_5.sql', 'buddy meetup city and place',
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'buddy_requests' and column_name = 'city')),
  (6,  'pickleproapp_upgrade_6.sql', 'cancel a buddy session',
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'buddy_requests' and column_name = 'cancel_reason')),
  (7,  'pickleproapp_upgrade_7.sql', 'video partners, shared sessions, notes',
       to_regclass('public.partners') is not null and to_regclass('public.report_shares') is not null and to_regclass('public.peer_notes') is not null),
  (8,  'pickleproapp_upgrade_8.sql', 'court tests',
       to_regclass('public.baseline_tests') is not null),
  (9,  'pickleproapp_upgrade_9.sql', 'feedback on chosen skills, partner ratings',
       to_regclass('public.peer_ratings') is not null
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'report_shares' and column_name = 'focus_skills')),
  (10, 'pickleproapp_upgrade_10.sql', 'buddy matching, games linked to buddy sessions',
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sessions' and column_name = 'buddy_request_id')
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'buddy_looking_for')),
  (11, 'pickleproapp_upgrade_11.sql', '"I''m injured" / recovery',
       to_regclass('public.injury_periods') is not null),
  (12, 'pickleproapp_upgrade_12.sql', 'buddies as a friend list',
       to_regclass('public.buddies') is not null),
  (13, 'pickleproapp_upgrade_13.sql', 'shot counts out of 10, goal length',
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'self_assessments' and column_name = 'shot_results')
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'goal_weeks')),
  (14, 'pickleproapp_upgrade_14.sql', 'player photos, removing cancelled sessions',
       to_regclass('public.hidden_buddy_sessions') is not null
       and exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'player_photos')),
  -- Running an older file again (7 or 9) puts back the old comment rules; this catches that.
  (14, 'pickleproapp_upgrade_14.sql', 'video comments: owner can comment, everyone sees all',
       exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
               where s.nspname = 'public' and p.proname = 'add_peer_note' and p.prosrc like '%is_owner%')
       and exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
               where s.nspname = 'public' and p.proname = 'session_peer_notes' and p.prosrc not like '%is_owner or n.author_id%')),
  (15, 'pickleproapp_upgrade_15.sql', 'one video per buddy game',
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'video_assets' and column_name = 'copied_from')
       and exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'add_buddy_session_video')),
  (16, 'pickleproapp_upgrade_16.sql', 'data consent choices (consent screen, Progress)',
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'data_consent_version')
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'analytics_opt_in')),
  (16, 'pickleproapp_upgrade_16.sql', 'tag a buddy in a game (game shares)',
       to_regclass('public.game_tags') is not null
       and exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'my_game_shares')),
  (17, 'pickleproapp_upgrade_17.sql', 'effort rated out of 5',
       exists (select 1 from pg_constraint c where c.conrelid = 'public.recovery_logs'::regclass
               and c.conname = 'recovery_logs_exertion_check' and pg_get_constraintdef(c.oid) like '%5)%'
               and pg_get_constraintdef(c.oid) not like '%10%'))
)
select case when n = 0 then 'Base' else n::text end as "#",
       needs as "What the app needs",
       case when ok then 'OK' else 'MISSING' end as "Status",
       case when ok then '' when n = 0 then 'See docs/SUPABASE_SETUP.md' else 'Run supabase/scripts/' || upd end as "Fix"
from checks
order by n, needs;
