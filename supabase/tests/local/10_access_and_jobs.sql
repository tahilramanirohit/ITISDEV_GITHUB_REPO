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

insert into public.sessions (id, title, session_context, play_format)
values ('5a000000-0000-4000-8000-00000000000a', 'A practice', 'practice', 'singles');

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

-- The storage object as the TUS upload would create it.
insert into storage.objects (bucket_id, name, metadata) values ('session-videos',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/5a000000-0000-4000-8000-00000000000a/7a000000-0000-4000-8000-00000000000a.mp4',
  '{"size": 12345, "mimetype": "video/mp4"}');

-- Double click: two finalize calls → one job.
select public.finalize_video_upload('7a000000-0000-4000-8000-00000000000a', '{"selection":{"method":"court_half","court_half":"far"}}');
select public.finalize_video_upload('7a000000-0000-4000-8000-00000000000a', '{"selection":{"method":"track_id","track_id":9}}');
select tests.expect_count($$ select 1 from public.analysis_jobs $$, 1, 'double finalize creates exactly one job');
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
select tests.expect_error($$ select public.request_reanalysis(id) from public.analysis_jobs $$,
  'reanalysis refused while a job is queued');

-- ════════════════ Player B: must not see or touch A's data ═════════════════
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);

select tests.expect_count($$ select 1 from public.sessions $$, 0, 'B sees no sessions of A');
select tests.expect_count($$ select 1 from public.video_assets $$, 0, 'B sees no video assets of A');
select tests.expect_count($$ select 1 from public.analysis_jobs $$, 0, 'B sees no jobs of A');
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
select tests.expect_count($$ select 1 from public.analysis_jobs where status = 'completed' and locked_by is null $$, 1,
  'job A completed');

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
select tests.expect_count($$ select 1 from public.analysis_results $$, 0, 'stale result removed on reanalysis');

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
select tests.expect_count($$ select 1 from public.analysis_results $$, 0, 'B cannot read A''s results');
select tests.expect_error($$ select public.request_reanalysis('00000000-0000-4000-8000-000000000000') $$,
  'unknown job is refused');
select tests.expect_count($$ select 1 from public.analysis_jobs where status = 'failed' $$, 1,
  'B sees own failed job and its error');

reset role;
select tests.expect_count($$ select 1 from storage.buckets where id = 'session-videos' and not public
  and file_size_limit = 524288000 $$, 1, 'bucket is private with a size limit');
\echo 'ALL ACCESS AND JOB TESTS PASSED'
