-- Buddies as a friend list: add, accept or decline, then ask to play or partner for video feedback.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- A = Ava (adds people), B = Bo (listed), C = Cal (listed), H = Hana (hidden from the list), O = Old pair (played before this update).
insert into auth.users (id, email) values
  ('d7111111-1111-4111-8111-111111111111', 'ava.friends@example.test'), ('d7222222-2222-4222-8222-222222222222', 'bo.friends@example.test'),
  ('d7333333-3333-4333-8333-333333333333', 'cal.friends@example.test'), ('d7444444-4444-4444-8444-444444444444', 'hana.friends@example.test'),
  ('d7555555-5555-4555-8555-555555555555', 'old.friends@example.test');
insert into public.profiles (id, display_name, self_level, is_adult_confirmed, buddy_visible) values
  ('d7111111-1111-4111-8111-111111111111', 'Ava', 'Novice', true, true),
  ('d7222222-2222-4222-8222-222222222222', 'Bo', 'Intermediate', true, true),
  ('d7333333-3333-4333-8333-333333333333', 'Cal', 'Advanced', true, true),
  ('d7444444-4444-4444-8444-444444444444', 'Hana', 'Novice', true, false),
  ('d7555555-5555-4555-8555-555555555555', 'Olu', 'Novice', true, true);

-- Before this update, Ava and Olu played a buddy session: running the update makes them buddies.
alter table public.buddy_requests disable trigger buddy_requests_need_buddies;
insert into public.buddy_requests (from_player_id, to_player_id, purpose, play_format, slots, status, city, location, responded_at)
values ('d7111111-1111-4111-8111-111111111111', 'd7555555-5555-4555-8555-555555555555', 'practice', 'doubles',
        format('[{"date":"%s","start":"08:00","end":"10:00"}]', current_date - 3)::jsonb, 'accepted', 'Pasig', 'Court 1', now());
alter table public.buddy_requests enable trigger buddy_requests_need_buddies;
\ir ../../migrations/20261105130000_buddy_friends.sql
select tests.expect_true(public.are_buddies('d7111111-1111-4111-8111-111111111111', 'd7555555-5555-4555-8555-555555555555'),
  'players with an accepted buddy session before the update become buddies');

set role authenticated;
select set_config('request.jwt.claim.sub', 'd7111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"d7111111-1111-4111-8111-111111111111","is_anonymous":false}', false);

-- ── Ava adds Bo ─────────────────────────────────────────────────────────
select tests.expect_error(format($$ select public.send_buddy_request('d7222222-2222-4222-8222-222222222222', 'practice', 'doubles',
  '[{"date":"%s","start":"08:00","end":"10:00"}]', 'Makati', 'Court 2') $$, current_date + 1), 'you cannot ask a stranger to play');
select tests.expect_error($$ select public.invite_buddy_as_partner('d7222222-2222-4222-8222-222222222222') $$,
  'you cannot partner with a stranger');
select tests.expect_error($$ select public.add_buddy('d7444444-4444-4444-8444-444444444444') $$, 'players hidden from the list cannot be added');
select tests.expect_error($$ select public.add_buddy('d7111111-1111-4111-8111-111111111111') $$, 'you cannot add yourself');
select tests.expect_error($$ insert into public.buddies (requester_id, addressee_id) values
  ('d7111111-1111-4111-8111-111111111111', 'd7222222-2222-4222-8222-222222222222') $$, 'buddies change only through the functions');
select tests.expect_true(public.add_buddy('d7222222-2222-4222-8222-222222222222') is not null, 'a listed player can be added');
select tests.expect_error($$ select public.add_buddy('d7222222-2222-4222-8222-222222222222') $$, 'adding twice waits for the first answer');
select tests.expect_true((select direction = 'sent' and status = 'pending' and other_name = 'Bo' from public.my_buddies()
  where other_id = 'd7222222-2222-4222-8222-222222222222'), 'the sender sees the request waiting');
select tests.expect_error($$ select public.respond_buddy((select id from public.my_buddies() where other_name = 'Bo'), true) $$,
  'the sender cannot accept their own request');

-- Bo accepts.
select set_config('request.jwt.claim.sub', 'd7222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claims', '{"sub":"d7222222-2222-4222-8222-222222222222","is_anonymous":false}', false);
select tests.expect_true((select direction = 'received' from public.my_buddies() where other_name = 'Ava'), 'Bo sees the request');
select public.respond_buddy((select id from public.my_buddies() where other_name = 'Ava'), true);
select tests.expect_true((select status = 'active' from public.my_buddies() where other_name = 'Ava'), 'accepting makes them buddies');

-- Now either can ask the other to play, or partner for video feedback.
select tests.expect_true(public.send_buddy_request('d7111111-1111-4111-8111-111111111111', 'casual_game', 'doubles',
  format('[{"date":"%s","start":"08:00","end":"10:00"}]', current_date + 2)::jsonb, 'Makati', 'Court 2') is not null,
  'a buddy can be asked to play');
select tests.expect_true(public.invite_buddy_as_partner('d7111111-1111-4111-8111-111111111111') is not null,
  'a buddy can be invited to be a video partner, no game needed');

-- ── A request crossing one already sent is accepted; a decline pauses re-asking ──
select set_config('request.jwt.claim.sub', 'd7333333-3333-4333-8333-333333333333', false);
select set_config('request.jwt.claims', '{"sub":"d7333333-3333-4333-8333-333333333333","is_anonymous":false}', false);
select public.add_buddy('d7111111-1111-4111-8111-111111111111');
select set_config('request.jwt.claim.sub', 'd7111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"d7111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select public.add_buddy('d7333333-3333-4333-8333-333333333333');
select tests.expect_true((select status = 'active' from public.my_buddies() where other_name = 'Cal'),
  'adding someone who already asked you accepts their request');
select public.remove_buddy('d7333333-3333-4333-8333-333333333333');
select tests.expect_count($$ select 1 from public.my_buddies() where other_name = 'Cal' $$, 0, 'a removed buddy leaves the list');
select public.add_buddy('d7333333-3333-4333-8333-333333333333');
select set_config('request.jwt.claim.sub', 'd7333333-3333-4333-8333-333333333333', false);
select set_config('request.jwt.claims', '{"sub":"d7333333-3333-4333-8333-333333333333","is_anonymous":false}', false);
select public.respond_buddy((select id from public.my_buddies() where other_name = 'Ava'), false);
select set_config('request.jwt.claim.sub', 'd7111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"d7111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select tests.expect_error($$ select public.add_buddy('d7333333-3333-4333-8333-333333333333') $$, 'after a decline, wait 7 days to ask again');

-- ── Buddies hidden from the list can still be asked to play ──────────
reset role;
update public.profiles set buddy_visible = false where id = 'd7222222-2222-4222-8222-222222222222';
set role authenticated;
select set_config('request.jwt.claim.sub', 'd7111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"d7111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select public.respond_buddy_request((select id from public.my_buddy_requests() where other_player_id = 'd7222222-2222-4222-8222-222222222222'), false);
select tests.expect_true(public.send_buddy_request('d7222222-2222-4222-8222-222222222222', 'practice', 'singles',
  format('[{"date":"%s","start":"08:00","end":"10:00"}]', current_date + 3)::jsonb, 'Makati', 'Court 2') is not null,
  'a buddy can be asked to play while hidden from the list');
select tests.expect_true(public.send_buddy_request('d7555555-5555-4555-8555-555555555555', 'practice', 'singles',
  format('[{"date":"%s","start":"08:00","end":"10:00"}]', current_date + 3)::jsonb, 'Pasig', 'Court 1') is not null,
  'buddies from before the update can ask each other to play');

-- ── Removing a buddy ends the video partnership and withdraws waiting requests ──
select public.respond_partner_invite((select id from public.my_partners() where other_id = 'd7222222-2222-4222-8222-222222222222'), true);
select tests.expect_count($$ select 1 from public.my_partners() where status = 'active' $$, 1, 'Ava and Bo are video partners');
select public.remove_buddy('d7222222-2222-4222-8222-222222222222');
select tests.expect_count($$ select 1 from public.my_partners() where status = 'active' $$, 0, 'removing a buddy ends the video partnership');
select tests.expect_count($$ select 1 from public.my_buddy_requests() where other_player_id = 'd7222222-2222-4222-8222-222222222222' and status = 'pending' $$, 0,
  'removing a buddy withdraws play requests still waiting');
select tests.expect_error($$ select public.remove_buddy('d7222222-2222-4222-8222-222222222222') $$, 'you can only remove a buddy');

-- ── Partner codes need a buddy too ──────────────────────────────────────
select invite_code as ava_code from public.create_partner_invite() \gset
select set_config('request.jwt.claim.sub', 'd7333333-3333-4333-8333-333333333333', false);
select set_config('request.jwt.claims', '{"sub":"d7333333-3333-4333-8333-333333333333","is_anonymous":false}', false);
select tests.expect_error(format($$ select public.redeem_partner_code(%L) $$, :'ava_code'), 'a partner code works only between buddies');
reset role;
select set_config('request.jwt.claims', '', false);
