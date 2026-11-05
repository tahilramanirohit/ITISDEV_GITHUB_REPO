-- Targeted peer feedback: the owner picks up to 3 skills; the partner rates only those,
-- sees the video only when it is shared, and loses access when the share stops.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- O = Olga (owner), K = Kyle (her partner), M = Mia (not linked).
insert into auth.users (id, email) values
  ('e1111111-1111-4111-8111-111111111111', 'olga@example.test'),
  ('e2222222-2222-4222-8222-222222222222', 'kyle@example.test'),
  ('e3333333-3333-4333-8333-333333333333', 'mia@example.test');
insert into public.profiles (id, display_name) values
  ('e1111111-1111-4111-8111-111111111111', 'Olga'), ('e2222222-2222-4222-8222-222222222222', 'Kyle'),
  ('e3333333-3333-4333-8333-333333333333', 'Mia');
-- Olga's game with a video and a report, and a drill session with no video.
insert into public.sessions (id, owner_id, title, session_context, play_format) values
  ('5e100000-0000-4000-8000-000000000001', 'e1111111-1111-4111-8111-111111111111', 'League night', 'casual_match', 'doubles'),
  ('5e100000-0000-4000-8000-000000000002', 'e1111111-1111-4111-8111-111111111111', 'Wall drills', 'practice', 'wall_practice');
insert into public.video_assets (id, owner_id, session_id, storage_path, original_filename, mime_type, byte_size, upload_status, uploaded_at) values
  ('7e100000-0000-4000-8000-000000000001', 'e1111111-1111-4111-8111-111111111111', '5e100000-0000-4000-8000-000000000001',
   'e1111111-1111-4111-8111-111111111111/5e100000-0000-4000-8000-000000000001/7e100000-0000-4000-8000-000000000001.mp4',
   'league.mp4', 'video/mp4', 1000, 'uploaded', now());
insert into storage.objects (bucket_id, name, metadata) values ('session-videos',
  'e1111111-1111-4111-8111-111111111111/5e100000-0000-4000-8000-000000000001/7e100000-0000-4000-8000-000000000001.mp4', '{"size":1000}');
insert into public.analysis_jobs (id, owner_id, video_asset_id, session_id, status) values
  ('9e100000-0000-4000-8000-000000000001', 'e1111111-1111-4111-8111-111111111111', '7e100000-0000-4000-8000-000000000001',
   '5e100000-0000-4000-8000-000000000001', 'completed');
insert into public.analysis_results (job_id, owner_id, session_id, video_asset_id, schema_version, result_status, data_origin, pipeline_version, result) values
  ('9e100000-0000-4000-8000-000000000001', 'e1111111-1111-4111-8111-111111111111', '5e100000-0000-4000-8000-000000000001',
   '7e100000-0000-4000-8000-000000000001', '1', 'ok', 'measured', 'test', '{"schema_version":"1","marker":"report"}');
-- Olga's own ratings stay private.
insert into public.self_assessments (session_id, owner_id, ratings) values
  ('5e100000-0000-4000-8000-000000000001', 'e1111111-1111-4111-8111-111111111111', '{"dinking": 4, "third_shot": 3, "serve": 5}');

set role authenticated;
-- ── Olga and Kyle link ──────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', 'e1111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"e1111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select invite_code as olga_code from public.create_partner_invite() \gset
select set_config('request.jwt.claim.sub', 'e2222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claims', '{"sub":"e2222222-2222-4222-8222-222222222222","is_anonymous":false}', false);
select public.redeem_partner_code(:'olga_code');

-- ── Olga asks for feedback on 2 skills, with video ──────────────────────
select set_config('request.jwt.claim.sub', 'e1111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"e1111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select tests.expect_error($$ select public.share_session('5e100000-0000-4000-8000-000000000001', 'e2222222-2222-4222-8222-222222222222',
  array['dinking', 'third_shot', 'serve', 'return'], true) $$, 'at most 3 skills can be asked about');
select tests.expect_error($$ select public.share_session('5e100000-0000-4000-8000-000000000001', 'e2222222-2222-4222-8222-222222222222',
  array['lobbing'], true) $$, 'only real skill keys can be asked about');
select public.share_session('5e100000-0000-4000-8000-000000000001', 'e2222222-2222-4222-8222-222222222222',
  array['third_shot', 'dinking', 'dinking'], true);
select tests.expect_true((select focus_skills = array['third_shot', 'dinking'] and with_video from public.report_shares),
  'the share keeps the chosen skills in order, without repeats');

select set_config('request.jwt.claim.sub', 'e2222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claims', '{"sub":"e2222222-2222-4222-8222-222222222222","is_anonymous":false}', false);
select tests.expect_true((select public.shared_report('5e100000-0000-4000-8000-000000000001') -> 'focus_skills') = '["third_shot", "dinking"]'::jsonb,
  'the partner sees which skills they were asked about');
select tests.expect_true((select (public.shared_report('5e100000-0000-4000-8000-000000000001') ->> 'video_path') is not null),
  'a share with video includes the video');
select tests.expect_count($$ select 1 from public.self_assessments $$, 0, 'the partner never sees the owner''s own ratings');

select public.rate_shared_skill('5e100000-0000-4000-8000-000000000001', 'dinking', 3::smallint);
select public.rate_shared_skill('5e100000-0000-4000-8000-000000000001', 'dinking', 2::smallint);
select tests.expect_true((select rating = 2 from public.session_peer_ratings('5e100000-0000-4000-8000-000000000001') where skill = 'dinking'),
  'the partner rates an asked skill, and can change the rating');
select tests.expect_error($$ select public.rate_shared_skill('5e100000-0000-4000-8000-000000000001', 'serve', 3::smallint) $$,
  'the partner cannot rate a skill that was not asked about');
select tests.expect_error($$ select public.rate_shared_skill('5e100000-0000-4000-8000-000000000001', 'dinking', 6::smallint) $$,
  'ratings go from 1 to 5');
select tests.expect_error($$ insert into public.peer_ratings (session_id, owner_id, author_id, skill, rating) values
  ('5e100000-0000-4000-8000-000000000001', 'e1111111-1111-4111-8111-111111111111', 'e2222222-2222-4222-8222-222222222222', 'serve', 3) $$,
  'ratings cannot be written directly');
select tests.expect_true((select (public.shared_report('5e100000-0000-4000-8000-000000000001') -> 'my_ratings') = '{"dinking": 2}'::jsonb),
  'the shared report includes the partner''s own ratings');
select tests.expect_true(public.add_peer_note('5e100000-0000-4000-8000-000000000001', 134, 'Paddle up before the dink', 'dinking') is not null,
  'a note can be tagged with an asked skill');
select tests.expect_error($$ select public.add_peer_note('5e100000-0000-4000-8000-000000000001', 10, 'Nice serves', 'serve') $$,
  'a note cannot be tagged with a skill that was not asked about');
select tests.expect_true((select skill = 'dinking' from public.session_peer_notes('5e100000-0000-4000-8000-000000000001')),
  'the note keeps its skill tag');

-- ── Olga sees the feedback; Mia sees nothing ────────────────────────────
select set_config('request.jwt.claim.sub', 'e1111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"e1111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select tests.expect_true((select author_name || ' ' || skill || ' ' || rating from public.session_peer_ratings('5e100000-0000-4000-8000-000000000001'))
  = 'Kyle dinking 2', 'the owner sees who rated which skill');
select tests.expect_count($$ select 1 from public.peer_ratings where owner_id = auth.uid() $$, 1, 'the owner can read the ratings for Progress');
select set_config('request.jwt.claim.sub', 'e3333333-3333-4333-8333-333333333333', false);
select set_config('request.jwt.claims', '{"sub":"e3333333-3333-4333-8333-333333333333","is_anonymous":false}', false);
select tests.expect_count($$ select 1 from public.peer_ratings $$, 0, 'other players cannot read peer ratings');
select tests.expect_error($$ select * from public.session_peer_ratings('5e100000-0000-4000-8000-000000000001') $$,
  'other players cannot list peer ratings');
select tests.expect_error($$ select public.rate_shared_skill('5e100000-0000-4000-8000-000000000001', 'dinking', 3::smallint) $$,
  'other players cannot rate');

-- ── Changing the ask: ratings only, and a different skill ───────────────
select set_config('request.jwt.claim.sub', 'e1111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"e1111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select public.share_session('5e100000-0000-4000-8000-000000000001', 'e2222222-2222-4222-8222-222222222222', array['serve'], false);
select public.share_session('5e100000-0000-4000-8000-000000000002', 'e2222222-2222-4222-8222-222222222222', array['consistency'], false);
select set_config('request.jwt.claim.sub', 'e2222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claims', '{"sub":"e2222222-2222-4222-8222-222222222222","is_anonymous":false}', false);
select tests.expect_true((select r -> 'video_path' = 'null'::jsonb and r -> 'result' = 'null'::jsonb and not (r ->> 'with_video')::boolean
  from public.shared_report('5e100000-0000-4000-8000-000000000001') r), 'a ratings-only share leaves out the video and its report');
select tests.expect_count($$ select 1 from storage.objects where bucket_id = 'session-videos' $$, 0,
  'a ratings-only share cannot read the video file');
select tests.expect_count($$ select 1 from public.peer_ratings $$, 0,
  'the partner no longer sees a rating of a skill that is not asked about any more');
select tests.expect_error($$ select public.rate_shared_skill('5e100000-0000-4000-8000-000000000001', 'dinking', 3::smallint) $$,
  'or rate it');
select public.rate_shared_skill('5e100000-0000-4000-8000-000000000002', 'consistency', 4::smallint);
select tests.expect_true((select count(*) = 2 from public.shared_with_me()), 'a session without a video can be shared for ratings');

-- ── Stopping the share ends access at once ──────────────────────────────
select set_config('request.jwt.claim.sub', 'e1111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"e1111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select public.unshare_session('5e100000-0000-4000-8000-000000000002', 'e2222222-2222-4222-8222-222222222222');
select tests.expect_count($$ select 1 from public.session_peer_ratings('5e100000-0000-4000-8000-000000000002') $$, 1,
  'the owner keeps ratings after the share stops');
select set_config('request.jwt.claim.sub', 'e2222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claims', '{"sub":"e2222222-2222-4222-8222-222222222222","is_anonymous":false}', false);
select tests.expect_error($$ select public.rate_shared_skill('5e100000-0000-4000-8000-000000000002', 'consistency', 5::smallint) $$,
  'after the share stops the partner cannot rate');
select tests.expect_count($$ select 1 from public.peer_ratings $$, 0, 'or read their ratings');
reset role;
select set_config('request.jwt.claims', '', false);
