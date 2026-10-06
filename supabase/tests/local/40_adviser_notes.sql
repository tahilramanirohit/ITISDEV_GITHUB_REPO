-- Default settings, tournament fields, named players and upload limits.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

insert into auth.users (id, email) values
  ('f3333333-3333-4333-8333-333333333333', 'f3@example.test'),
  ('f4444444-4444-4444-8444-444444444444', 'f4@example.test');

set role authenticated;
select set_config('request.jwt.claim.sub', 'f3333333-3333-4333-8333-333333333333', false);

insert into public.profiles (id, display_name, default_review_mode, default_session_kind, default_play_format)
values ('f3333333-3333-4333-8333-333333333333', 'Player G', 'self', 'tournament', 'doubles');
select tests.expect_error($$ update public.profiles set default_session_kind = 'league' $$, 'unknown default session kind is rejected');

insert into public.sessions (id, title, session_context, play_format, tournament_name, tournament_round, match_result, match_score)
values ('5f300000-0000-4000-8000-00000000000f', 'City open', 'tournament', 'doubles', 'City Open 2026', 'Quarterfinal', 'win', '11-7, 11-9');
select tests.expect_count($$ select 1 from public.sessions where match_result = 'win' $$, 1, 'tournament details are stored');
select tests.expect_error($$ update public.sessions set match_result = 'draw' $$, 'unknown match result is rejected');

insert into public.session_participants (session_id, role, display_name)
values ('5f300000-0000-4000-8000-00000000000f', 'partner', 'Ana'),
       ('5f300000-0000-4000-8000-00000000000f', 'opponent', 'Ben'),
       ('5f300000-0000-4000-8000-00000000000f', 'opponent', 'Cy');
select tests.expect_count($$ select 1 from public.session_participants where session_id = '5f300000-0000-4000-8000-00000000000f' $$,
  4, 'owner sees uploader plus named partner and opponents');
select tests.expect_error($$ insert into public.session_participants (session_id, role, display_name, player_id, link_status)
  values ('5f300000-0000-4000-8000-00000000000f', 'opponent', 'Spoof', 'f4444444-4444-4444-8444-444444444444', 'accepted') $$,
  'owner cannot link a named player to another account');
select tests.expect_error($$ insert into public.session_participants (session_id, role, display_name)
  values ('5f300000-0000-4000-8000-00000000000f', 'uploader', 'Second me') $$, 'owner cannot add another uploader');
select tests.expect_rows($$ update public.session_participants set display_name = 'Ana M.' where display_name = 'Ana' $$,
  1, 'owner can rename a player');
select tests.expect_rows($$ delete from public.session_participants where role = 'uploader' $$, 0, 'owner cannot remove their uploader row');

select tests.expect_count($$ select 1 where (public.video_upload_limits()->>'max_uploads_per_day')::int = 5 $$, 1, 'limits are readable');
-- Too long, then valid clips until the daily limit.
select tests.expect_error(format($$ insert into public.video_assets (id, session_id, storage_path, original_filename, mime_type, byte_size, duration_s)
  values ('7f300000-0000-4000-8000-000000000000', '5f300000-0000-4000-8000-00000000000f',
  'f3333333-3333-4333-8333-333333333333/5f300000-0000-4000-8000-00000000000f/7f300000-0000-4000-8000-000000000000.mp4', 'long.mp4', 'video/mp4', 1000, 900) $$),
  'clip longer than 5 minutes is rejected');
select tests.expect_error(format($$ insert into public.video_assets (id, session_id, storage_path, original_filename, mime_type, byte_size)
  values ('7f300000-0000-4000-8000-000000000009', '5f300000-0000-4000-8000-00000000000f',
  'f3333333-3333-4333-8333-333333333333/5f300000-0000-4000-8000-00000000000f/7f300000-0000-4000-8000-000000000009.mp4', 'huge.mp4', 'video/mp4', 60000000) $$),
  'file over 50 MB is rejected');
reset role;
-- Extra sessions so each clip has its own session (one video per session).
insert into public.sessions (id, owner_id, title, session_context, play_format)
select ('5f30000' || n || '-0000-4000-8000-00000000000f')::uuid, 'f3333333-3333-4333-8333-333333333333', 'Clip ' || n, 'practice', 'singles'
from generate_series(1, 5) n;
set role authenticated;
select set_config('request.jwt.claim.sub', 'f3333333-3333-4333-8333-333333333333', false);
do $$
declare n int;
begin
  for n in 1..5 loop
    insert into public.video_assets (id, session_id, storage_path, original_filename, mime_type, byte_size, duration_s)
    values (('7f30000' || n || '-0000-4000-8000-00000000000f')::uuid, ('5f30000' || n || '-0000-4000-8000-00000000000f')::uuid,
      'f3333333-3333-4333-8333-333333333333/5f30000' || n || '-0000-4000-8000-00000000000f/7f30000' || n || '-0000-4000-8000-00000000000f.mp4',
      'clip.mp4', 'video/mp4', 1000, 60);
  end loop;
end $$;
select tests.expect_count($$ select 1 from public.video_assets where duration_s = 60 $$, 5, 'five valid clips are accepted');
select tests.expect_error($$ insert into public.video_assets (id, session_id, storage_path, original_filename, mime_type, byte_size, duration_s)
  values ('7f300000-0000-4000-8000-00000000000f', '5f300000-0000-4000-8000-00000000000f',
  'f3333333-3333-4333-8333-333333333333/5f300000-0000-4000-8000-00000000000f/7f300000-0000-4000-8000-00000000000f.mp4', 'six.mp4', 'video/mp4', 1000, 60) $$,
  'sixth upload in a day is rejected');

select set_config('request.jwt.claim.sub', 'f4444444-4444-4444-8444-444444444444', false);
select tests.expect_count($$ select 1 from public.session_participants where display_name is not null $$, 0, 'other player cannot see named players');
select tests.expect_error($$ insert into public.session_participants (session_id, role, display_name)
  values ('5f300000-0000-4000-8000-00000000000f', 'opponent', 'Intruder') $$, 'other player cannot add players to the session');
reset role;
