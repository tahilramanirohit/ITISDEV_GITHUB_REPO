-- Dev-mode mock data: only anonymous users may seed, only into their own rows,
-- only results marked dev-mock, and reseeding replaces instead of piling up.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

reset role;
insert into auth.users (id, email) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', null),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'real@example.test');

-- ── A real (email) account is refused ─────────────────────────────────────────
set role authenticated;
select set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', false);
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","is_anonymous":false}', false);
select tests.expect_error($$ select public.seed_dev_mock_data('[{"title":"x","result":{}}]') $$,
  'a real account cannot create mock data');

-- ── Anonymous dev user ────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', false);
select set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","is_anonymous":true}', false);

select tests.expect_error($$ select public.seed_dev_mock_data('[{"title":"x","result":
  {"schema_version":"1.0","status":"ok","data_origin":"measured","provenance":{"pipeline_version":"0.5.0-dev"}}}]') $$,
  'mock results must be marked dev-mock');
select tests.expect_error($$ select public.seed_dev_mock_data('{}') $$, 'sessions must be an array');

select tests.expect_true(public.seed_dev_mock_data($$[
  {"title":"Week 1","session_date":"2026-09-01","result":{"schema_version":"1.0","status":"ok","data_origin":"measured",
   "provenance":{"pipeline_version":"dev-mock"},"coverage":{"analyzed_duration_s":20}}},
  {"title":"Week 2","session_date":"2026-09-08","play_format":"doubles","result":{"schema_version":"1.0",
   "status":"insufficient_data","data_origin":"measured","provenance":{"pipeline_version":"dev-mock"}}}
]$$) = 2, 'anonymous user seeds two sessions');

select tests.expect_count($$ select 1 from public.sessions where title like '[Dev mock]%' $$, 2, 'mock sessions visible to owner');
select tests.expect_count($$ select 1 from public.video_assets where upload_status = 'uploaded' $$, 2, 'mock videos marked uploaded');
select tests.expect_count($$ select 1 from public.analysis_jobs where status = 'completed' $$, 2, 'mock jobs completed');
select tests.expect_count($$ select 1 from public.analysis_results where pipeline_version = 'dev-mock' $$, 2, 'mock results stored');
select tests.expect_count($$ select 1 from public.analysis_runs where run_number = 1 and status = 'completed'
  and pipeline_version = 'dev-mock' $$, 2, 'each mock session has a completed run 1');
select tests.expect_count($$ select 1 from public.sessions s join public.analysis_runs r on r.id = s.active_run_id
  where r.session_id = s.id $$, 2, 'each mock session publishes its run as the active report');
select tests.expect_count($$ select 1 from public.analysis_jobs j join public.analysis_results res on res.job_id = j.id
  where j.current_run_id = res.run_id $$, 2, 'mock job and result both name the run');
select tests.expect_count($$ select 1 from public.video_assets where raw_video_expires_at is not null $$, 0,
  'mock videos are not scheduled for raw-video deletion');

select public.seed_dev_mock_data($$[{"title":"Again","result":{"schema_version":"1.0","status":"ok",
  "data_origin":"measured","provenance":{"pipeline_version":"dev-mock"}}}]$$);
select tests.expect_count($$ select 1 from public.sessions $$, 1, 'reseeding replaces earlier mock sessions');

-- ── Nobody else sees them ────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', false);
select tests.expect_count($$ select 1 from public.sessions where title like '[Dev mock]%' $$, 0, 'other users cannot see mock sessions');

reset role;
set role anon;
select tests.expect_error($$ select public.seed_dev_mock_data('[]') $$, 'signed-out callers cannot seed');
reset role;
\echo 'ALL DEV MOCK DATA TESTS PASSED'
