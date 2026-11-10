-- One video per buddy game: the asker uploads, the asked player adds a copy of it.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- A = Ana (asked to play, uploads), B = Bo (was asked, adds Ana's video), C = Cy (not in the game).
insert into auth.users (id, email) values
  ('e9111111-1111-4111-8111-111111111111', 'ana@example.test'),
  ('e9222222-2222-4222-8222-222222222222', 'bo@example.test'),
  ('e9333333-3333-4333-8333-333333333333', 'cy@example.test');
insert into public.profiles (id, display_name) values
  ('e9111111-1111-4111-8111-111111111111', 'Ana'), ('e9222222-2222-4222-8222-222222222222', 'Bo'),
  ('e9333333-3333-4333-8333-333333333333', 'Cy');
select tests.make_buddies('e9111111-1111-4111-8111-111111111111', 'e9222222-2222-4222-8222-222222222222');
insert into public.buddy_requests (id, from_player_id, to_player_id, purpose, play_format, slots, status) values
  ('b9000000-0000-4000-8000-000000000001', 'e9111111-1111-4111-8111-111111111111', 'e9222222-2222-4222-8222-222222222222',
   'casual_game', 'doubles', '[]', 'accepted');
insert into public.sessions (id, owner_id, title, session_context, play_format, buddy_request_id) values
  ('5e900000-0000-4000-8000-00000000000a', 'e9111111-1111-4111-8111-111111111111', 'Sunday match', 'casual_match', 'doubles', 'b9000000-0000-4000-8000-000000000001'),
  ('5e900000-0000-4000-8000-00000000000b', 'e9222222-2222-4222-8222-222222222222', 'Sunday match', 'casual_match', 'doubles', 'b9000000-0000-4000-8000-000000000001');
-- Ana's uploaded video of the game.
insert into public.video_assets (id, owner_id, session_id, storage_path, original_filename, mime_type, byte_size, upload_status, uploaded_at) values
  ('7e900000-0000-4000-8000-00000000000a', 'e9111111-1111-4111-8111-111111111111', '5e900000-0000-4000-8000-00000000000a',
   'e9111111-1111-4111-8111-111111111111/5e900000-0000-4000-8000-00000000000a/7e900000-0000-4000-8000-00000000000a.mp4',
   'sunday.mp4', 'video/mp4', 4000, 'uploaded', now());
insert into storage.objects (bucket_id, name, metadata) values ('session-videos',
  'e9111111-1111-4111-8111-111111111111/5e900000-0000-4000-8000-00000000000a/7e900000-0000-4000-8000-00000000000a.mp4', '{"size":4000}');
insert into public.consent_records (player_id, policy_version, scope, retention_days)
values ('e9222222-2222-4222-8222-222222222222', '2026-09-29-v4', 'recording_upload', 30);

set role authenticated;
-- ── Ana, who asked to play ───────────────────────────────────────────────
select set_config('request.jwt.claim.sub', 'e9111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"e9111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select tests.expect_true((select public.buddy_session_video('5e900000-0000-4000-8000-00000000000a')
  = '{"role":"asker","other_name":"Bo","my_video_allowed":true}'::jsonb), 'the asker uploads and lets Bo use the video by default');
select tests.expect_error($$ select public.add_buddy_session_video('5e900000-0000-4000-8000-00000000000a') $$,
  'the asker does not add the other player''s video');
select public.set_buddy_can_use('7e900000-0000-4000-8000-00000000000a', false);

-- ── Bo, who was asked: sharing off ───────────────────────────────────────
select set_config('request.jwt.claim.sub', 'e9222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claims', '{"sub":"e9222222-2222-4222-8222-222222222222","is_anonymous":false}', false);
select tests.expect_true((select (v ->> 'role') = 'asked' and (v ->> 'other_name') = 'Ana' and (v -> 'video' ->> 'byte_size') = '4000'
  and (v ->> 'allowed') = 'false' from public.buddy_session_video('5e900000-0000-4000-8000-00000000000b') v),
  'the asked player sees Ana''s video, not allowed while she has it off');
select tests.expect_error($$ select public.add_buddy_session_video('5e900000-0000-4000-8000-00000000000b') $$,
  'no copy while the uploader has sharing off');
select tests.expect_count($$ select 1 from storage.objects where bucket_id = 'session-videos' and name like 'e9111111-%' $$, 0,
  'and no access to the file');
select tests.expect_error($$ insert into public.video_assets (owner_id, session_id, storage_path, original_filename, mime_type, byte_size)
  values ('e9222222-2222-4222-8222-222222222222', '5e900000-0000-4000-8000-00000000000b',
  'e9222222-2222-4222-8222-222222222222/5e900000-0000-4000-8000-00000000000b/7e900000-0000-4000-8000-0000000000bb.mp4', 'mine.mp4', 'video/mp4', 10) $$,
  'the asked player cannot upload to a buddy game');

-- ── Cy cannot change Ana's switch ────────────────────────────────────────
select set_config('request.jwt.claim.sub', 'e9333333-3333-4333-8333-333333333333', false);
select set_config('request.jwt.claims', '{"sub":"e9333333-3333-4333-8333-333333333333","is_anonymous":false}', false);
select tests.expect_error($$ select public.set_buddy_can_use('7e900000-0000-4000-8000-00000000000a', true) $$, 'only the uploader sets the switch');
select tests.expect_error($$ select public.buddy_session_video('5e900000-0000-4000-8000-00000000000b') $$, 'others cannot look at Bo''s game');

-- ── Ana turns it back on; Bo adds the video ──────────────────────────────
select set_config('request.jwt.claim.sub', 'e9111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"e9111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select public.set_buddy_can_use('7e900000-0000-4000-8000-00000000000a', true);
select set_config('request.jwt.claim.sub', 'e9222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claims', '{"sub":"e9222222-2222-4222-8222-222222222222","is_anonymous":false}', false);
select tests.expect_count($$ select 1 from storage.objects where bucket_id = 'session-videos' and name like 'e9111111-%' $$, 1,
  'the asked player can read the file to copy it');
select public.add_buddy_session_video('5e900000-0000-4000-8000-00000000000b') as added \gset
select tests.expect_true((:'added'::jsonb ->> 'source_path') like 'e9111111-%/7e900000-0000-4000-8000-00000000000a.mp4'
  and (:'added'::jsonb -> 'video' ->> 'storage_path') like 'e9222222-2222-4222-8222-222222222222/5e900000-0000-4000-8000-00000000000b/%.mp4'
  and (:'added'::jsonb -> 'video' ->> 'copied_from') = '7e900000-0000-4000-8000-00000000000a', 'the copy goes into Bo''s own folder');
-- What Storage's copy does: a new object at Bo's path (allowed by the usual upload rule).
select (:'added'::jsonb -> 'video' ->> 'storage_path') as bo_path, (:'added'::jsonb -> 'video' ->> 'id') as bo_video \gset
insert into storage.objects (bucket_id, name, metadata) values ('session-videos', :'bo_path', '{"size":4000}');
select tests.expect_true((select status = 'queued' from public.finalize_video_upload(:'bo_video')), 'Bo''s copy is analysed for Bo');
select tests.expect_true((select upload_status = 'uploaded' from public.video_assets where id = :'bo_video'), 'the copy counts as uploaded');
select tests.expect_error($$ select public.add_buddy_session_video('5e900000-0000-4000-8000-00000000000b') $$, 'one video per session');
reset role;
select set_config('request.jwt.claims', '', false);
