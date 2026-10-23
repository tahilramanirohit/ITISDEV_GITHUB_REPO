-- Two-account isolation + job lifecycle, against the real migrations.
-- Player A = aaaaaaaa-..., Player B = bbbbbbbb-...
\set ON_ERROR_STOP 1
set client_min_messages = notice;

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@example.test');

-- ════════════════ Player A creates a session, registers and uploads a video ══
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);

insert into public.sessions (id, title, session_context, play_format, improvement_goals, positioning_rating)
values ('5a000000-0000-4000-8000-00000000000a', 'A practice', 'practice', 'singles', array['positioning'], 3);
insert into public.profiles(id, display_name, dominant_hand, years_playing, usual_format, self_level)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Player A', 'right', 2.5, 'singles', 'beginner');
select tests.expect_count($$ select 1 from public.profiles where display_name = 'Player A' $$,
  1, 'player can read own profile');
select tests.expect_error($$
  insert into public.profiles(id, display_name)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Spoofed B') $$,
  'player cannot create another account profile');
insert into public.sessions (id, title, session_context, play_format)
values ('5a000000-0000-4000-8000-00000000000c', 'Wall drills', 'drill', 'wall_practice');
select tests.expect_error($$
  insert into public.video_assets (id, session_id, storage_path, original_filename, mime_type, byte_size)
  values ('7a000000-0000-4000-8000-00000000000c', '5a000000-0000-4000-8000-00000000000c',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/5a000000-0000-4000-8000-00000000000c/7a000000-0000-4000-8000-00000000000c.mp4',
    'wall.mp4', 'video/mp4', 1000) $$,
  'logging-only session cannot register a video');
select tests.expect_count($$ select 1 from public.session_participants where session_id = '5a000000-0000-4000-8000-00000000000a' and role = 'uploader' and link_status = 'accepted' $$,
  1, 'session creates its uploader participant');
insert into public.checkins(participant_id, warmup_done, sleep_hours, readiness)
select id, true, 7.5, 4 from public.session_participants where session_id = '5a000000-0000-4000-8000-00000000000a';
select tests.expect_count($$ select 1 from public.checkins where timing_status = 'unverified' $$,
  1, 'check-in timing is unverified without an actual start');
update public.sessions set actual_start_at = now() + interval '1 minute'
  where id = '5a000000-0000-4000-8000-00000000000a';
select tests.expect_count($$ select 1 from public.checkins where timing_status = 'pre_game' $$,
  1, 'check-in is pre-game when captured before actual start');
update public.sessions set actual_start_at = now() - interval '1 minute'
  where id = '5a000000-0000-4000-8000-00000000000a';
select tests.expect_count($$ select 1 from public.checkins where timing_status = 'retrospective' $$,
  1, 'late check-in is relabelled against actual start');
select captured_at::text as checkin_before from public.checkins
  where participant_id = (select id from public.session_participants
    where session_id = '5a000000-0000-4000-8000-00000000000a') \gset
select pg_sleep(0.02);
update public.checkins set readiness = 5
  where participant_id = (select id from public.session_participants
    where session_id = '5a000000-0000-4000-8000-00000000000a');
select tests.expect_count($$ select 1 from public.checkins where readiness = 5 and timing_status = 'retrospective'
  and captured_at >= (select actual_start_at from public.sessions where id = '5a000000-0000-4000-8000-00000000000a') $$,
  1, 'editing pre-game answers after start is retrospective');
select tests.expect_true((select captured_at from public.checkins
  where participant_id = (select id from public.session_participants
    where session_id = '5a000000-0000-4000-8000-00000000000a')) > :'checkin_before'::timestamptz,
  'editing an answer records a new capture time');
insert into public.recovery_logs(participant_id, exertion, soreness, cooldown_done)
select id, 7, null, true from public.session_participants where session_id = '5a000000-0000-4000-8000-00000000000a';
insert into public.reflections(participant_id, went_well, change_next)
select id, 'Kept rallies going', 'Practice returns' from public.session_participants
  where session_id = '5a000000-0000-4000-8000-00000000000a';

select tests.expect_error($$
  insert into public.sessions (title, session_context, play_format, improvement_goals)
  values ('invalid goal', 'practice', 'singles', array['invented_skill']) $$,
  'unknown improvement goal is rejected');
select tests.expect_error($$
  update public.sessions set positioning_rating = 6 where id = '5a000000-0000-4000-8000-00000000000a' $$,
  'self rating outside 1 through 5 is rejected');

select tests.expect_error($$
  insert into public.sessions (title, session_context, play_format, owner_id)
  values ('spoof', 'practice', 'singles', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') $$,
  'A cannot create a session owned by B');

select tests.expect_error($$
  insert into public.video_assets (id, session_id, storage_path, original_filename, mime_type, byte_size)
  values ('7a000000-0000-4000-8000-0000000000ff', '5a000000-0000-4000-8000-00000000000a',
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/5a000000-0000-4000-8000-00000000000a/7a000000-0000-4000-8000-0000000000ff.mp4',
          'x.mp4', 'video/mp4', 1000) $$,
  'storage path must start with the owner id');

select tests.expect_error($$
  insert into public.video_assets (id, session_id, storage_path, original_filename, mime_type, byte_size)
  values ('7a000000-0000-4000-8000-0000000000fe', '5a000000-0000-4000-8000-00000000000a',
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/5a000000-0000-4000-8000-00000000000a/7a000000-0000-4000-8000-0000000000fe.mp4',
          'x.mp4', 'video/mp4', 600000000) $$,
  'file size above the configured limit is rejected');

insert into public.video_assets (id, session_id, storage_path, original_filename, mime_type, byte_size)
values ('7a000000-0000-4000-8000-00000000000a', '5a000000-0000-4000-8000-00000000000a',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/5a000000-0000-4000-8000-00000000000a/7a000000-0000-4000-8000-00000000000a.mp4',
        'a_match.mp4', 'video/mp4', 12345);

select tests.expect_error($$ update public.video_assets set upload_status = 'uploaded' $$,
  'players cannot mark their own upload complete without finalize');

select tests.expect_error($$ select public.finalize_video_upload('7a000000-0000-4000-8000-00000000000a') $$,
  'finalize before the object exists -> upload_incomplete');

select tests.expect_error($$
  insert into storage.objects (bucket_id, name, metadata) values ('session-videos',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/5a000000-0000-4000-8000-00000000000a/unregistered.mp4', '{"size": 1}') $$,
  'uploads only allowed for a registered pending video asset');

select tests.expect_error($$
  insert into storage.objects (bucket_id, name, metadata) values ('session-videos',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/5a000000-0000-4000-8000-00000000000a/7a000000-0000-4000-8000-00000000000a.mp4', '{"size": 12345}') $$,
  'upload requires a recorded consent confirmation');
insert into public.consent_records(player_id, policy_version, scope, retention_days)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-09-29-v4', 'recording_upload', 30);

-- The storage object as the TUS upload would create it.
insert into storage.objects (bucket_id, name, metadata) values ('session-videos',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/5a000000-0000-4000-8000-00000000000a/7a000000-0000-4000-8000-00000000000a.mp4',
  '{"size": 12345, "mimetype": "video/mp4"}');

-- Double click: two finalize calls → one job.
select public.finalize_video_upload('7a000000-0000-4000-8000-00000000000a', '{"selection":{"method":"court_half","court_half":"far"}}');
select public.finalize_video_upload('7a000000-0000-4000-8000-00000000000a', '{"selection":{"method":"track_id","track_id":9}}');
select tests.expect_count($$ select 1 from public.analysis_jobs $$, 1, 'double finalize creates exactly one job');
select tests.expect_count($$ select 1 from public.analysis_runs where status = 'queued' and run_number = 1 $$,
  1, 'first finalize creates one versioned run');
select tests.expect_count($$ select 1 from public.analysis_jobs j join public.analysis_runs r on r.id = j.current_run_id $$,
  1, 'job points to its queued run');
select tests.expect_count($$ select 1 from public.analysis_jobs where params -> 'selection' ->> 'court_half' = 'far' $$, 1,
  'a repeated finalize does not overwrite the first params');
select tests.expect_error($$ select public.finalize_video_upload('7a000000-0000-4000-8000-00000000000a', '[1]') $$,
  'non-object params are rejected');
select tests.expect_count($$ select 1 from public.analysis_jobs where status = 'queued' and attempts = 0 $$, 1,
  'job starts queued');
select tests.expect_count($$ select 1 from public.video_assets where upload_status = 'uploaded' $$, 1,
  'finalize marks the upload complete');

select tests.expect_error($$ insert into public.analysis_jobs (owner_id, video_asset_id, session_id)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '7a000000-0000-4000-8000-00000000000a', '5a000000-0000-4000-8000-00000000000a') $$,
  'players cannot insert jobs directly');
select tests.expect_error($$ update public.analysis_jobs set status = 'completed' $$,
  'players cannot change job status');
select tests.expect_error($$ select public.claim_analysis_job('evil', 60) $$,
  'players cannot call worker functions');
select tests.expect_error($$ select public.update_analysis_progress(id, 'evil', 1, 'finishing') from public.analysis_jobs $$,
  'players cannot fake analysis progress');
select tests.expect_error($$ select public.request_reanalysis(id) from public.analysis_jobs $$,
  'reanalysis refused while a job is queued');

-- ════════════════ Player B: must not see or touch A's data ═════════════════
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);

select tests.expect_count($$ select 1 from public.sessions $$, 0, 'B sees no sessions of A');
select tests.expect_count($$ select 1 from public.profiles $$, 0, 'B sees no profile of A');
select tests.expect_count($$ select 1 from public.video_assets $$, 0, 'B sees no video assets of A');
select tests.expect_count($$ select 1 from public.checkins $$, 0, 'B sees no check-in of A');
select tests.expect_count($$ select 1 from public.recovery_logs $$, 0, 'B sees no recovery log of A');
select tests.expect_count($$ select 1 from public.reflections $$, 0, 'B sees no reflection of A');
select tests.expect_count($$ select 1 from public.consent_records $$, 0, 'B sees no consent record of A');
select tests.expect_count($$ select 1 from public.analysis_jobs $$, 0, 'B sees no jobs of A');
select tests.expect_count($$ select 1 from public.analysis_runs $$, 0, 'B sees no runs of A');
select tests.expect_count($$ select 1 from storage.objects $$, 0, 'B sees no storage objects of A');
select tests.expect_rows($$ update public.sessions set title = 'hijacked' $$, 0, 'B cannot update A''s session');
select tests.expect_rows($$ delete from public.sessions $$, 0, 'B cannot delete A''s session');
select tests.expect_rows($$ delete from storage.objects $$, 0, 'B cannot delete A''s video object');
select tests.expect_error($$
  insert into public.video_assets (id, session_id, storage_path, original_filename, mime_type, byte_size)
  values ('7b000000-0000-4000-8000-0000000000ff', '5a000000-0000-4000-8000-00000000000a',
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/5a000000-0000-4000-8000-00000000000a/7b000000-0000-4000-8000-0000000000ff.mp4',
          'x.mp4', 'video/mp4', 10) $$,
  'B cannot attach a video to A''s session');
select tests.expect_error($$
  insert into storage.objects (bucket_id, name, metadata) values ('session-videos',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/5a000000-0000-4000-8000-00000000000a/7a000000-0000-4000-8000-00000000000a.mp4', '{}') $$,
  'B cannot write into A''s storage folder');
select tests.expect_error($$ select public.finalize_video_upload('7a000000-0000-4000-8000-00000000000a') $$,
  'B cannot finalize A''s video');

-- B's own data for the lease tests below.
insert into public.sessions (id, title, session_context, play_format)
values ('5b000000-0000-4000-8000-00000000000b', 'B match', 'casual_match', 'doubles');
insert into public.video_assets (id, session_id, storage_path, original_filename, mime_type, byte_size)
values ('7b000000-0000-4000-8000-00000000000b', '5b000000-0000-4000-8000-00000000000b',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/5b000000-0000-4000-8000-00000000000b/7b000000-0000-4000-8000-00000000000b.mov',
        'b_match.mov', 'video/quicktime', 999);
insert into public.consent_records(player_id, policy_version, scope, retention_days)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-09-29-v4', 'recording_upload', 30);
insert into storage.objects (bucket_id, name, metadata) values ('session-videos',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/5b000000-0000-4000-8000-00000000000b/7b000000-0000-4000-8000-00000000000b.mov',
  '{"size": 999}');
select public.finalize_video_upload('7b000000-0000-4000-8000-00000000000b');
select tests.expect_count($$ select 1 from public.analysis_jobs $$, 1, 'B sees only B''s own job');

-- ════════════════ anon: nothing ═══════════════════════════════════════════
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select tests.expect_error($$ select * from public.sessions $$, 'anon cannot read sessions');
select tests.expect_error($$ select * from public.analysis_results $$, 'anon cannot read results');
select tests.expect_error($$ select public.finalize_video_upload('7a000000-0000-4000-8000-00000000000a') $$,
  'anon cannot finalize');
select tests.expect_count($$ select 1 from storage.objects $$, 0, 'anon sees no storage objects');

-- ════════════════ Worker (service role) ═══════════════════════════════════
reset role;
set role service_role;
select tests.expect_true((select public.claim_analysis_job('w1', 60) ->> 'video_asset_id')
  = '7a000000-0000-4000-8000-00000000000a', 'worker claims oldest job first (A)');
select tests.expect_true((select public.claim_analysis_job('w2', 60) ->> 'video_asset_id')
  = '7b000000-0000-4000-8000-00000000000b', 'second worker gets the next job (B)');
select tests.expect_true(public.claim_analysis_job('w3', 60) is null, 'nothing left to claim');
select tests.expect_true(public.heartbeat_analysis_job(
  (select id from public.analysis_jobs where video_asset_id = '7a000000-0000-4000-8000-00000000000a'), 'w1', 60),
  'lease holder can heartbeat');
select tests.expect_true(not public.heartbeat_analysis_job(
  (select id from public.analysis_jobs where video_asset_id = '7a000000-0000-4000-8000-00000000000a'), 'w2', 60),
  'non-holder heartbeat is refused');
select tests.expect_true(public.update_analysis_progress(
  (select id from public.analysis_jobs where video_asset_id = '7a000000-0000-4000-8000-00000000000a'), 'w1', 0.42, 'analyzing'),
  'lease holder can report progress');
select tests.expect_true(not public.update_analysis_progress(
  (select id from public.analysis_jobs where video_asset_id = '7a000000-0000-4000-8000-00000000000a'), 'w2', 0.9, 'analyzing'),
  'non-holder cannot report progress');
select tests.expect_error($$ select public.update_analysis_progress(
  (select id from public.analysis_jobs where video_asset_id = '7a000000-0000-4000-8000-00000000000a'), 'w1', 0.5, 'dancing') $$,
  'unknown progress stage is rejected');
select tests.expect_count($$ select 1 from public.analysis_jobs
  where video_asset_id = '7a000000-0000-4000-8000-00000000000a' and progress = 0.42::real and progress_stage = 'analyzing' $$,
  1, 'progress is stored');
-- B's job was claimed by w2; a takeover by another worker starts its bar over.
select public.update_analysis_progress(
  (select id from public.analysis_jobs where video_asset_id = '7b000000-0000-4000-8000-00000000000b'), 'w2', 0.7, 'analyzing');
update public.analysis_jobs set locked_by = 'w9' where video_asset_id = '7b000000-0000-4000-8000-00000000000b';
select tests.expect_count($$ select 1 from public.analysis_jobs
  where video_asset_id = '7b000000-0000-4000-8000-00000000000b' and progress is null and progress_stage is null $$,
  1, 'a new worker on the job starts the progress over');
update public.analysis_jobs set locked_by = 'w2' where video_asset_id = '7b000000-0000-4000-8000-00000000000b';
select tests.expect_error($$ select public.complete_analysis_job(
  (select id from public.analysis_jobs where video_asset_id = '7a000000-0000-4000-8000-00000000000a'), 'w2',
  '{"schema_version":"1.0","status":"ok","data_origin":"measured","provenance":{"pipeline_version":"t"}}') $$,
  'a worker without the lease cannot complete');
select tests.expect_error($$ select public.complete_analysis_job(
  (select id from public.analysis_jobs where video_asset_id = '7a000000-0000-4000-8000-00000000000a'), 'w1',
  '{"schema_version":"1.0","status":"success","data_origin":"measured","provenance":{"pipeline_version":"t"}}') $$,
  'results with an unknown status are rejected');

select public.complete_analysis_job(
  (select id from public.analysis_jobs where video_asset_id = '7a000000-0000-4000-8000-00000000000a'), 'w1',
  '{"schema_version":"1.0","status":"insufficient_data","data_origin":"test_fixture",
    "provenance":{"pipeline_version":"0.2.0-dev"},
    "coverage":{"analyzed_duration_s":20.0,"fraction_of_video_analyzed":1.0},
    "video":{"container_duration_s":20.0}}');
select tests.expect_count($$ select 1 from public.analysis_jobs where status = 'completed'
  and progress = 1 and progress_stage is null $$, 1, 'a completed job shows a full progress bar');
select tests.expect_true(not public.update_analysis_progress(
  (select id from public.analysis_jobs where video_asset_id = '7a000000-0000-4000-8000-00000000000a'), 'w1', 0.1, 'analyzing'),
  'progress cannot be written after completion');
select tests.expect_count($$ select 1 from public.analysis_jobs where status = 'completed' and locked_by is null $$, 1,
  'job A completed');
select tests.expect_count($$ select 1 from public.sessions s join public.analysis_runs r on r.id = s.active_run_id
  where s.id = '5a000000-0000-4000-8000-00000000000a'
    and r.status = 'completed' and r.run_number = 1 $$, 1, 'completed run is published on the session');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
select tests.expect_error($$ update public.sessions set active_run_id = null
  where id = '5a000000-0000-4000-8000-00000000000a' $$,
  'player cannot change the published report pointer');
reset role;
set role service_role;
select tests.expect_count($$ select 1 from public.analysis_results r join public.analysis_runs ar on ar.id = r.run_id
  where r.session_id = '5a000000-0000-4000-8000-00000000000a'
    and ar.run_number = 1 $$, 1, 'compatibility result names its immutable run');
insert into public.metric_results(run_id, participant_id, metric_key, definition_version, quality_status)
select s.active_run_id, p.id, 'kitchen_line_presence', 'v4-draft-2026-09-29', 'unvalidated'
from public.sessions s join public.session_participants p on p.session_id = s.id and p.role = 'uploader'
where s.id = '5a000000-0000-4000-8000-00000000000a';
select tests.expect_error($$
  insert into public.metric_results(run_id, participant_id, metric_key, definition_version,
    validation_level, quality_status, value)
  select s.active_run_id, p.id, 'zone_share_kitchen', 'v4-draft-2026-09-29',
    'not_evaluated', 'available', 42
  from public.sessions s join public.session_participants p on p.session_id = s.id and p.role = 'uploader'
  where s.id = '5a000000-0000-4000-8000-00000000000a' $$,
  'unvalidated metric cannot be published as available');
select tests.expect_error($$
  insert into public.metric_results(run_id, participant_id, metric_key, definition_version, quality_status)
  select a.active_run_id, b.id, 'kitchen_line_presence', 'v4-draft-2026-09-29', 'unvalidated'
  from public.sessions a join public.session_participants b
    on b.session_id = '5b000000-0000-4000-8000-00000000000b' and b.role = 'uploader'
  where a.id = '5a000000-0000-4000-8000-00000000000a' $$,
  'metric participant must belong to the run session');

-- B's worker (w2) dies: expire its lease and let w3 pick it up.
reset role;
update public.analysis_jobs set lease_expires_at = now() - interval '1 second'
 where video_asset_id = '7b000000-0000-4000-8000-00000000000b';
set role service_role;
select tests.expect_true((select (public.claim_analysis_job('w3', 60) ->> 'attempts')::int) = 2,
  'expired lease is reclaimed with attempts incremented');
select tests.expect_error($$ select public.fail_analysis_job(
  (select id from public.analysis_jobs where video_asset_id = '7b000000-0000-4000-8000-00000000000b'),
  'w2', 'pipeline_error', 'late', true) $$, 'the dead worker cannot report after losing its lease');
select tests.expect_true(public.fail_analysis_job(
  (select id from public.analysis_jobs where video_asset_id = '7b000000-0000-4000-8000-00000000000b'),
  'w3', 'download_failed', 'network', true) = 'queued', 'retryable failure is re-queued');
select tests.expect_true(public.claim_analysis_job('w3', 60) is null, 'retry waits for its backoff');
reset role;
update public.analysis_jobs set available_at = now() where video_asset_id = '7b000000-0000-4000-8000-00000000000b';
set role service_role;
select tests.expect_true((select (public.claim_analysis_job('w4', 60) ->> 'attempts')::int) = 3, 'third attempt claimed');
reset role;
update public.analysis_jobs set lease_expires_at = now() - interval '1 second'
 where video_asset_id = '7b000000-0000-4000-8000-00000000000b';
set role service_role;
select tests.expect_true(public.claim_analysis_job('w5', 60) is null, 'final attempt expired: not reclaimed');
select tests.expect_count($$ select 1 from public.analysis_jobs
  where video_asset_id = '7b000000-0000-4000-8000-00000000000b' and status = 'failed' and error_code = 'lease_expired' $$,
  1, 'final expired attempt is marked failed with an actionable code');

-- ════════════════ Results are private to their owner ═════════════════════
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
select tests.expect_count($$ select 1 from public.analysis_results where data_origin = 'test_fixture' $$, 1,
  'A can read A''s result with its origin');
select tests.expect_error($$ delete from public.analysis_results $$, 'A cannot delete results directly');

select public.request_reanalysis((select id from public.analysis_jobs), '{"selection":{"method":"court_half","court_half":"near"}}');
select tests.expect_count($$ select 1 from public.analysis_jobs where status = 'queued' and attempts = 0
  and params -> 'selection' ->> 'court_half' = 'near' $$, 1, 'owner can re-queue with new params');
select tests.expect_count($$ select 1 from public.analysis_results $$, 1, 'last published result survives reanalysis');
select tests.expect_count($$ select 1 from public.analysis_runs where run_number = 2 and status = 'queued' $$,
  1, 'reanalysis creates a new queued run');
select tests.expect_count($$ select 1 from public.sessions s join public.analysis_runs r on r.id = s.active_run_id
  where r.run_number = 1 $$, 1, 'old run remains active while replacement is queued');

reset role;
set role service_role;
select public.claim_analysis_job('w6', 60);
select tests.expect_true(public.fail_analysis_job(
  (select id from public.analysis_jobs where video_asset_id = '7a000000-0000-4000-8000-00000000000a'),
  'w6', 'test_failure', 'replacement failed', false) = 'failed',
  'replacement run can fail without changing the published run');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
select tests.expect_count($$ select 1 from public.analysis_runs where run_number = 2 and status = 'failed' $$,
  1, 'failed replacement remains in run history');
select tests.expect_count($$ select 1 from public.sessions s join public.analysis_runs r on r.id = s.active_run_id
  where r.run_number = 1 $$, 1, 'failed replacement does not replace the active run');
select public.request_reanalysis((select id from public.analysis_jobs), null);
reset role;
set role service_role;
select public.claim_analysis_job('w7', 60);
select public.complete_analysis_job(
  (select id from public.analysis_jobs where video_asset_id = '7a000000-0000-4000-8000-00000000000a'), 'w7',
  '{"schema_version":"1.0","status":"insufficient_data","data_origin":"test_fixture",
    "provenance":{"pipeline_version":"0.3.0-dev","source":{"sha256":"abc"}},
    "coverage":{"analyzed_duration_s":21.0,"fraction_of_video_analyzed":1.0},
    "video":{"container_duration_s":21.0}}');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
select tests.expect_count($$ select 1 from public.analysis_runs where status = 'completed' and run_number in (1, 3) $$,
  2, 'successful replacement retains both completed run versions');
select tests.expect_count($$ select 1 from public.sessions s join public.analysis_runs r on r.id = s.active_run_id
  where r.run_number = 3 and r.source_sha256 = 'abc' $$, 1,
  'successful replacement atomically switches the active run');
select tests.expect_count($$ select 1 from public.analysis_results r join public.analysis_runs ar on ar.id = r.run_id
  where ar.run_number = 3 $$, 1, 'compatibility result follows the new active run');

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
select tests.expect_count($$ select 1 from public.analysis_results $$, 0, 'B cannot read A''s results');
select tests.expect_count($$ select 1 from public.metric_results $$, 0, 'B cannot read A''s metric rows');
select tests.expect_error($$ select public.request_reanalysis('00000000-0000-4000-8000-000000000000') $$,
  'unknown job is refused');
select tests.expect_count($$ select 1 from public.analysis_jobs where status = 'failed' $$, 1,
  'B sees own failed job and its error');

reset role;
select tests.expect_count($$ select 1 from storage.buckets where id = 'session-videos' and not public
  and file_size_limit = 524288000 $$, 1, 'bucket is private with a size limit');

-- Raw-video retention is private, claims are worker-only, and deletion blocks replay.
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
select tests.expect_true((public.set_raw_video_keep('7a000000-0000-4000-8000-00000000000a', true)).raw_video_kept,
  'owner can keep their raw video');
select tests.expect_error($$ select * from public.claim_expired_raw_video() $$,
  'player cannot claim videos for deletion');
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
select tests.expect_error($$ select public.set_raw_video_keep('7a000000-0000-4000-8000-00000000000a', false) $$,
  'another player cannot change the keep choice');
reset role;
set role service_role;
update public.video_assets set raw_video_expires_at = now() - interval '1 day'
  where id = '7a000000-0000-4000-8000-00000000000a';
select tests.expect_count($$ select * from public.claim_expired_raw_video() $$, 0,
  'a kept video is excluded from expiry');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
select tests.expect_true(not (public.set_raw_video_keep('7a000000-0000-4000-8000-00000000000a', false)).raw_video_kept,
  'owner can resume automatic expiry');
reset role;
set role service_role;
select tests.expect_count($$ select * from public.claim_expired_raw_video() $$, 1,
  'worker claims an expired video');
select public.complete_raw_video_deletion('7a000000-0000-4000-8000-00000000000a');
select tests.expect_count($$ select 1 from public.video_assets where raw_video_deleted_at is not null
  and id = '7a000000-0000-4000-8000-00000000000a' $$, 1,
  'raw deletion is recorded without deleting the result row');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
select tests.expect_error($$ select public.set_raw_video_keep('7a000000-0000-4000-8000-00000000000a', true) $$,
  'deleted video cannot be kept');
select tests.expect_error($$ select public.request_reanalysis((select id from public.analysis_jobs), null) $$,
  'deleted raw video cannot be reanalyzed');
reset role;
\echo 'ALL ACCESS AND JOB TESTS PASSED'
