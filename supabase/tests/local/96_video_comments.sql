-- Comments on a shared video (owner and partners see and write them) and players' profile photos.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- R = Ria (owner), C = Cal and D = Dee (partners she shared with), X = Xan (no access).
insert into auth.users (id, email) values
  ('e8111111-1111-4111-8111-111111111111', 'ria@example.test'),
  ('e8222222-2222-4222-8222-222222222222', 'cal@example.test'),
  ('e8333333-3333-4333-8333-333333333333', 'dee@example.test'),
  ('e8444444-4444-4444-8444-444444444444', 'xan@example.test');
insert into public.profiles (id, display_name, avatar_path) values
  ('e8111111-1111-4111-8111-111111111111', 'Ria', 'e8111111-1111-4111-8111-111111111111/avatar-1.webp'),
  ('e8222222-2222-4222-8222-222222222222', 'Cal', null),
  ('e8333333-3333-4333-8333-333333333333', 'Dee', null),
  ('e8444444-4444-4444-8444-444444444444', 'Xan', null);
insert into storage.objects (bucket_id, name) values ('profile-photos', 'e8111111-1111-4111-8111-111111111111/avatar-1.webp');
insert into public.sessions (id, owner_id, title, session_context, play_format) values
  ('5e800000-0000-4000-8000-000000000001', 'e8111111-1111-4111-8111-111111111111', 'Open play', 'casual_match', 'doubles');
select tests.make_buddies('e8111111-1111-4111-8111-111111111111', 'e8222222-2222-4222-8222-222222222222');
select tests.make_buddies('e8111111-1111-4111-8111-111111111111', 'e8333333-3333-4333-8333-333333333333');
insert into public.partners (inviter_id, invitee_id, status, linked_at) values
  ('e8111111-1111-4111-8111-111111111111', 'e8222222-2222-4222-8222-222222222222', 'active', now()),
  ('e8111111-1111-4111-8111-111111111111', 'e8333333-3333-4333-8333-333333333333', 'active', now());
insert into public.report_shares (session_id, owner_id, partner_id) values
  ('5e800000-0000-4000-8000-000000000001', 'e8111111-1111-4111-8111-111111111111', 'e8222222-2222-4222-8222-222222222222'),
  ('5e800000-0000-4000-8000-000000000001', 'e8111111-1111-4111-8111-111111111111', 'e8333333-3333-4333-8333-333333333333');

set role authenticated;
-- Cal comments at 0:12.
select set_config('request.jwt.claim.sub', 'e8222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claims', '{"sub":"e8222222-2222-4222-8222-222222222222","is_anonymous":false}', false);
select public.add_peer_note('5e800000-0000-4000-8000-000000000001', 12, 'Nice third-shot drop here');
-- Ria answers at the same second.
select set_config('request.jwt.claim.sub', 'e8111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"e8111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select tests.expect_true(public.add_peer_note('5e800000-0000-4000-8000-000000000001', 12.4, 'Thanks! I was aiming for the backhand') is not null,
  'the owner comments on their own video');
select tests.expect_error($$ select public.add_peer_note('5e800000-0000-4000-8000-000000000001', 1, 'x', 'dinking') $$,
  'the owner does not tag comments with a skill');
select id as ria_note from public.session_peer_notes('5e800000-0000-4000-8000-000000000001') where mine \gset
select public.edit_peer_note(:'ria_note', 'Thanks! I aimed for the backhand');
select tests.expect_true((select body = 'Thanks! I aimed for the backhand' and video_time_s = 12.40
  from public.session_peer_notes('5e800000-0000-4000-8000-000000000001') where mine), 'the owner edits their own comment');
select id as cal_note from public.session_peer_notes('5e800000-0000-4000-8000-000000000001') where not mine \gset
select tests.expect_error(format($$ select public.edit_peer_note(%L, 'changed') $$, :'cal_note'), 'the owner cannot edit a partner''s comment');

-- Dee sees both comments, in video order, and adds her own.
select set_config('request.jwt.claim.sub', 'e8333333-3333-4333-8333-333333333333', false);
select set_config('request.jwt.claims', '{"sub":"e8333333-3333-4333-8333-333333333333","is_anonymous":false}', false);
select tests.expect_true((select string_agg(author_name, ',' order by video_time_s, created_at)
  from public.session_peer_notes('5e800000-0000-4000-8000-000000000001')) = 'Cal,Ria', 'a partner sees every comment on the shared video');
select public.add_peer_note('5e800000-0000-4000-8000-000000000001', 30, 'Move up after the return');
select tests.expect_error(format($$ select public.edit_peer_note(%L, 'changed') $$, :'ria_note'), 'a partner cannot edit the owner''s comment');
select tests.expect_error(format($$ select public.delete_peer_note(%L) $$, :'cal_note'), 'a partner cannot delete another partner''s comment');
-- Photos: any signed-in player sees them; player_photos() gives the path.
select tests.expect_count($$ select 1 from storage.objects where bucket_id = 'profile-photos' and name like 'e8111111-%' $$, 1, 'a player can see another player''s photo');
select tests.expect_true((select avatar_path from public.player_photos(array['e8111111-1111-4111-8111-111111111111'::uuid, 'e8444444-4444-4444-8444-444444444444'::uuid]))
  = 'e8111111-1111-4111-8111-111111111111/avatar-1.webp', 'player_photos() returns only players with a photo');
select tests.expect_rows($$ delete from storage.objects where bucket_id = 'profile-photos' and name like 'e8111111-%' $$, 0, 'a player cannot delete another player''s photo');

-- Xan: nothing shared with him.
select set_config('request.jwt.claim.sub', 'e8444444-4444-4444-8444-444444444444', false);
select set_config('request.jwt.claims', '{"sub":"e8444444-4444-4444-8444-444444444444","is_anonymous":false}', false);
select tests.expect_error($$ select * from public.session_peer_notes('5e800000-0000-4000-8000-000000000001') $$, 'others cannot read the comments');
select tests.expect_error($$ select public.add_peer_note('5e800000-0000-4000-8000-000000000001', 1, 'hi') $$, 'others cannot comment');
select tests.expect_count($$ select 1 from storage.objects where bucket_id = 'profile-photos' and name like 'e8111111-%' $$, 1, 'every signed-in player sees photos, buddy or not');
select set_config('request.jwt.claims', '{"sub":"e8444444-4444-4444-8444-444444444444","is_anonymous":true}', false);
select tests.expect_count($$ select 1 from storage.objects where bucket_id = 'profile-photos' and name like 'e8111111-%' $$, 0, 'guests do not see photos');
select tests.expect_error($$ select * from public.player_photos(array['e8111111-1111-4111-8111-111111111111'::uuid]) $$, 'guests cannot look up photos');

-- When Ria stops sharing with Cal, Cal loses the comments; Dee keeps them.
select set_config('request.jwt.claim.sub', 'e8111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"e8111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select public.unshare_session('5e800000-0000-4000-8000-000000000001', 'e8222222-2222-4222-8222-222222222222');
select tests.expect_count($$ select 1 from public.session_peer_notes('5e800000-0000-4000-8000-000000000001') $$, 3,
  'the owner keeps every comment');
select set_config('request.jwt.claim.sub', 'e8222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claims', '{"sub":"e8222222-2222-4222-8222-222222222222","is_anonymous":false}', false);
select tests.expect_error($$ select * from public.session_peer_notes('5e800000-0000-4000-8000-000000000001') $$,
  'after the share stops, the partner cannot read the comments');
select set_config('request.jwt.claim.sub', 'e8333333-3333-4333-8333-333333333333', false);
select set_config('request.jwt.claims', '{"sub":"e8333333-3333-4333-8333-333333333333","is_anonymous":false}', false);
select tests.expect_count($$ select 1 from public.session_peer_notes('5e800000-0000-4000-8000-000000000001') $$, 3,
  'the other partner still sees them');
reset role;
select set_config('request.jwt.claims', '', false);

-- ── Removing a cancelled buddy session from your list ────────────────────
insert into public.buddy_requests (id, from_player_id, to_player_id, purpose, play_format, slots, status) values
  ('b8000000-0000-4000-8000-000000000001', 'e8111111-1111-4111-8111-111111111111', 'e8222222-2222-4222-8222-222222222222',
   'practice', 'doubles', '[]', 'called_off'),
  ('b8000000-0000-4000-8000-000000000002', 'e8111111-1111-4111-8111-111111111111', 'e8222222-2222-4222-8222-222222222222',
   'practice', 'doubles', '[]', 'accepted');
set role authenticated;
select set_config('request.jwt.claim.sub', 'e8111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"e8111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select public.hide_cancelled_session('b8000000-0000-4000-8000-000000000001');
select public.hide_cancelled_session('b8000000-0000-4000-8000-000000000001');
select tests.expect_count($$ select 1 from public.hidden_buddy_sessions $$, 1, 'a player removes a cancelled session from their list (twice is fine)');
select tests.expect_error($$ select public.hide_cancelled_session('b8000000-0000-4000-8000-000000000002') $$,
  'only cancelled sessions can be removed');
select tests.expect_error($$ insert into public.hidden_buddy_sessions (request_id, player_id) values
  ('b8000000-0000-4000-8000-000000000002', 'e8111111-1111-4111-8111-111111111111') $$, 'rows are added only through the function');
select set_config('request.jwt.claim.sub', 'e8222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claims', '{"sub":"e8222222-2222-4222-8222-222222222222","is_anonymous":false}', false);
select tests.expect_count($$ select 1 from public.hidden_buddy_sessions $$, 0, 'the other player still has it on their list');
select set_config('request.jwt.claim.sub', 'e8444444-4444-4444-8444-444444444444', false);
select set_config('request.jwt.claims', '{"sub":"e8444444-4444-4444-8444-444444444444","is_anonymous":false}', false);
select tests.expect_error($$ select public.hide_cancelled_session('b8000000-0000-4000-8000-000000000001') $$,
  'players cannot remove sessions they are not part of');
reset role;
select set_config('request.jwt.claims', '', false);
