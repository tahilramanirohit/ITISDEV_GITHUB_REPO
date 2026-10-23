-- Buddy finder: opt-in listing, requests with free times, accept/decline, and safety rules.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- A = sender, B = listed player, C = listed but under 18 not confirmed, D = not listed, G = guest.
insert into auth.users (id, email, is_anonymous) values
  ('b1111111-1111-4111-8111-111111111111', 'buddy-a@example.test', false),
  ('b2222222-2222-4222-8222-222222222222', 'buddy-b@example.test', false),
  ('b3333333-3333-4333-8333-333333333333', 'buddy-c@example.test', false),
  ('b4444444-4444-4444-8444-444444444444', 'buddy-d@example.test', false),
  ('b5555555-5555-4555-8555-555555555555', null, true);
insert into public.profiles (id, display_name, self_level, is_adult_confirmed, buddy_visible) values
  ('b1111111-1111-4111-8111-111111111111', 'Ana', 'Beginner (2.0–2.5)', true, true),
  ('b2222222-2222-4222-8222-222222222222', 'Ben', 'Intermediate', true, true),
  ('b3333333-3333-4333-8333-333333333333', 'Cy', 'Advanced', false, true),
  ('b4444444-4444-4444-8444-444444444444', 'Dee', 'Novice', true, false),
  ('b5555555-5555-4555-8555-555555555555', 'Guest', 'Novice', true, true);

select tests.expect_true(public.buddy_level('New to the game') = 'beginner'
  and public.buddy_level('Beginner (2.0–2.5)') = 'beginner' and public.buddy_level('Novice') = 'novice'
  and public.buddy_level('Intermediate (3.0–3.5)') = 'intermediate' and public.buddy_level('Advanced (4.0+)') = 'advanced'
  and public.buddy_level('Not sure') is null, 'levels from old and new profile answers map to the four buddy levels');

set role authenticated;

-- ── Ana browses and asks Ben ─────────────────────────────────────────────
select set_config('request.jwt.claim.sub', 'b1111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"b1111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select tests.expect_count($$ select 1 from public.buddy_players() $$, 1,
  'only listed, adult, non-guest players other than yourself appear');
select tests.expect_true((select level from public.buddy_players()) = 'intermediate', 'the list shows the player''s level');
select tests.expect_count($$ select 1 from public.profiles where id = 'b2222222-2222-4222-8222-222222222222' $$, 0,
  'the rest of a listed player''s profile stays private');

select tests.expect_error($$ select public.send_buddy_request('b2222222-2222-4222-8222-222222222222', 'practice', 'doubles', '[]', 'Makati', 'Ayala Triangle courts') $$,
  'a request needs at least one free time');
select tests.expect_error(format($$ select public.send_buddy_request('b2222222-2222-4222-8222-222222222222', 'practice', 'doubles',
  '[{"date":"%s","start":"18:00","end":"17:00"}]', 'Makati', 'Ayala Triangle courts') $$, current_date), 'a free time must start before it ends');
select tests.expect_error(format($$ select public.send_buddy_request('b2222222-2222-4222-8222-222222222222', 'practice', 'doubles',
  '[{"date":"%s","start":"08:00","end":"10:00"}]', 'Makati', 'Ayala Triangle courts') $$, current_date + 200), 'free times more than 90 days ahead are rejected');
select tests.expect_error(format($$ select public.send_buddy_request('b4444444-4444-4444-8444-444444444444', 'practice', 'doubles',
  '[{"date":"%s","start":"08:00","end":"10:00"}]', 'Makati', 'Ayala Triangle courts') $$, current_date + 1), 'players who are not listed cannot be asked');
select tests.expect_error(format($$ select public.send_buddy_request('b3333333-3333-4333-8333-333333333333', 'practice', 'doubles',
  '[{"date":"%s","start":"08:00","end":"10:00"}]', 'Makati', 'Ayala Triangle courts') $$, current_date + 1), 'players who have not confirmed 18+ cannot be asked');
select tests.expect_error($$ insert into public.buddy_requests (from_player_id, to_player_id, purpose, play_format, slots)
  values ('b1111111-1111-4111-8111-111111111111', 'b2222222-2222-4222-8222-222222222222', 'practice', 'doubles', '[]') $$,
  'requests cannot be written directly, only through the checked functions');

select tests.expect_error(format($$ select public.send_buddy_request('b2222222-2222-4222-8222-222222222222', 'practice', 'doubles',
  '[{"date":"%s","start":"08:00","end":"10:00"}]', null, 'Ayala Triangle courts') $$, current_date + 1), 'a request needs a city');
select tests.expect_error(format($$ select public.send_buddy_request('b2222222-2222-4222-8222-222222222222', 'practice', 'doubles',
  '[{"date":"%s","start":"08:00","end":"10:00"}]', 'Makati', '   ') $$, current_date + 1), 'a request needs a meetup location');
select tests.expect_true(public.send_buddy_request('b2222222-2222-4222-8222-222222222222', 'practice', 'doubles',
  format('[{"date":"%s","start":"08:00","end":"10:00"},{"date":"%s","start":"18:30","end":"20:00"}]',
         current_date + 1, current_date + 3)::jsonb, 'Makati', 'Ayala Triangle courts') is not null, 'a request with two free times is sent');
select tests.expect_error(format($$ select public.send_buddy_request('b2222222-2222-4222-8222-222222222222', 'casual_game', 'singles',
  '[{"date":"%s","start":"08:00","end":"10:00"}]', 'Makati', 'Ayala Triangle courts') $$, current_date + 2), 'only one open request per pair');
select tests.expect_true((select request_status from public.buddy_players()) = 'pending', 'the list shows the request is waiting');
select tests.expect_error($$ select public.respond_buddy_request((select id from public.buddy_requests limit 1), true) $$,
  'the sender cannot accept their own request');

-- ── Ben sees it and accepts ──────────────────────────────────────────────
select set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-4222-8222-222222222222","is_anonymous":false}', false);
select tests.expect_count($$ select 1 from public.buddy_requests where to_player_id = auth.uid() and status = 'pending' $$, 1,
  'the receiver can count waiting requests (notification badge)');
select tests.expect_true((select other_name || ' ' || other_level || ' ' || direction from public.my_buddy_requests()) = 'Ana beginner incoming',
  'the receiver sees who asked and their level');
select tests.expect_true((select city || ' / ' || location from public.my_buddy_requests()) = 'Makati / Ayala Triangle courts',
  'the receiver sees the city and where to meet');
select public.respond_buddy_request((select id from public.my_buddy_requests() limit 1), true);
select tests.expect_true((select status from public.my_buddy_requests()) = 'accepted', 'the receiver accepts');
select tests.expect_error($$ select public.respond_buddy_request((select id from public.my_buddy_requests() limit 1), false) $$,
  'an answered request cannot be answered again');

-- ── Dee (not listed) cannot read other players' requests ────────────────
select set_config('request.jwt.claim.sub', 'b4444444-4444-4444-8444-444444444444', false);
select set_config('request.jwt.claims', '{"sub":"b4444444-4444-4444-8444-444444444444","is_anonymous":false}', false);
select tests.expect_count($$ select 1 from public.buddy_requests $$, 0, 'other players cannot see the request');
select tests.expect_count($$ select 1 from public.my_buddy_requests() $$, 0, 'other players have no requests listed');

-- ── Declines start a 7-day pause; senders can cancel their own request ──
select set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-4222-8222-222222222222","is_anonymous":false}', false);
select tests.expect_true(public.send_buddy_request('b1111111-1111-4111-8111-111111111111', 'competition', 'either',
  format('[{"date":"%s","start":"09:00","end":"11:00"}]', current_date + 5)::jsonb, 'Makati', 'Ayala Triangle courts') is not null, 'a second, later request is allowed');
select set_config('request.jwt.claim.sub', 'b1111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"b1111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select tests.expect_error($$ select public.cancel_buddy_request((select id from public.my_buddy_requests() where status = 'pending')) $$,
  'the receiver cannot cancel someone else''s request');
select public.respond_buddy_request((select id from public.my_buddy_requests() where status = 'pending'), false);
select set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-4222-8222-222222222222","is_anonymous":false}', false);
select tests.expect_error(format($$ select public.send_buddy_request('b1111111-1111-4111-8111-111111111111', 'practice', 'doubles',
  '[{"date":"%s","start":"08:00","end":"10:00"}]', 'Makati', 'Ayala Triangle courts') $$, current_date + 6), 'asking again within 7 days of a decline is blocked');

-- ── Either player can call off an accepted session, with a reason ──────
-- Ben: the session Ana asked for is accepted; his own later request was declined.
select id as accepted_id from public.my_buddy_requests() where status = 'accepted' \gset
select tests.expect_error($$ select public.cancel_buddy_session((select id from public.my_buddy_requests() where status = 'declined'), 'Busy') $$,
  'only an accepted session can be called off');
select set_config('request.jwt.claim.sub', 'b4444444-4444-4444-8444-444444444444', false);
select set_config('request.jwt.claims', '{"sub":"b4444444-4444-4444-8444-444444444444","is_anonymous":false}', false);
select tests.expect_error(format($$ select public.cancel_buddy_session(%L, 'Busy') $$, :'accepted_id'),
  'players outside the session cannot call it off');
select set_config('request.jwt.claim.sub', 'b1111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"b1111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select tests.expect_error(format($$ select public.cancel_buddy_session(%L, repeat('x', 201)) $$, :'accepted_id'),
  'the reason is at most 200 characters');
select public.cancel_buddy_session(:'accepted_id', E'  Rain, the courts are closed \n');
select tests.expect_true((select status = 'called_off' and cancelled_by_me and cancelled_at is not null
  from public.my_buddy_requests() where id = :'accepted_id'), 'the sender of the request can call off the accepted session');
select tests.expect_error(format($$ select public.cancel_buddy_session(%L, null) $$, :'accepted_id'),
  'a called-off session cannot be called off again');
select set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-4222-8222-222222222222","is_anonymous":false}', false);
select tests.expect_true((select not cancelled_by_me and cancel_reason = 'Rain, the courts are closed'
  from public.my_buddy_requests() where id = :'accepted_id'), 'the other player sees who called it off and the reason');
select tests.expect_true((select request_status is null from public.buddy_players()
  where player_id = 'b1111111-1111-4111-8111-111111111111'), 'after a call-off the list no longer shows them as buddies');

-- ── Guests and players without 18+ confirmation cannot use Buddy ────────
select set_config('request.jwt.claim.sub', 'b5555555-5555-4555-8555-555555555555', false);
select set_config('request.jwt.claims', '{"sub":"b5555555-5555-4555-8555-555555555555","is_anonymous":true}', false);
select tests.expect_error($$ select * from public.buddy_players() $$, 'guest accounts cannot browse Buddy');
select set_config('request.jwt.claim.sub', 'b3333333-3333-4333-8333-333333333333', false);
select set_config('request.jwt.claims', '{"sub":"b3333333-3333-4333-8333-333333333333","is_anonymous":false}', false);
select tests.expect_error($$ select * from public.buddy_players() $$, 'players who have not confirmed 18+ cannot browse Buddy');
reset role;
select set_config('request.jwt.claims', '', false);

-- ── Cancelling and the 10-request limit ─────────────────────────────────
do $$
declare i int;
begin
  for i in 1..11 loop
    insert into auth.users (id, email) values (('b9000000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'many' || i || '@example.test');
    insert into public.profiles (id, display_name, is_adult_confirmed, buddy_visible)
    values (('b9000000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'Many ' || i, true, true);
  end loop;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', 'b4444444-4444-4444-8444-444444444444', false);
select set_config('request.jwt.claims', '{"sub":"b4444444-4444-4444-8444-444444444444","is_anonymous":false}', false);
select public.send_buddy_request(('b9000000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'practice', 'singles',
  format('[{"date":"%s","start":"07:00","end":"08:00"}]', current_date + 1)::jsonb, 'Makati', 'Ayala Triangle courts') from generate_series(1, 10) i;
select tests.expect_error(format($$ select public.send_buddy_request('b9000000-0000-4000-8000-000000000011', 'practice', 'singles',
  '[{"date":"%s","start":"07:00","end":"08:00"}]', 'Makati', 'Ayala Triangle courts') $$, current_date + 1), 'at most 10 requests can wait for an answer');
select public.cancel_buddy_request((select id from public.my_buddy_requests() where status = 'pending' limit 1));
select tests.expect_count($$ select 1 from public.my_buddy_requests() where status = 'pending' $$, 9,
  'the sender cancels a request; cancelled requests are no longer listed');

-- The receiver can call off too, and the reason is optional.
select id as many_request, other_player_id as many_player from public.my_buddy_requests() where status = 'pending' limit 1 \gset
select set_config('request.jwt.claim.sub', :'many_player', false);
select set_config('request.jwt.claims', format('{"sub":"%s","is_anonymous":false}', :'many_player'), false);
select public.respond_buddy_request(:'many_request', true);
select public.cancel_buddy_session(:'many_request', '   ');
select tests.expect_true((select status = 'called_off' and cancelled_by_me and cancel_reason is null
  from public.my_buddy_requests() where id = :'many_request'), 'the receiver can call off a session without giving a reason');
reset role;
select set_config('request.jwt.claims', '', false);
