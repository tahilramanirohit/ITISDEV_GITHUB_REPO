-- "I'm injured": private injury periods, hidden from Buddy while injured, listed again on "I'm back".
\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- K = Kai (listed on Buddy), M = Mia (not listed), N = Noa (looks at Buddy).
insert into auth.users (id, email) values
  ('c7111111-1111-4111-8111-111111111111', 'kai.injury@example.test'), ('c7222222-2222-4222-8222-222222222222', 'mia.injury@example.test'),
  ('c7333333-3333-4333-8333-333333333333', 'noa.injury@example.test');
insert into public.profiles (id, display_name, self_level, is_adult_confirmed, buddy_visible) values
  ('c7111111-1111-4111-8111-111111111111', 'Kai', 'Intermediate', true, true),
  ('c7222222-2222-4222-8222-222222222222', 'Mia', 'Novice', true, false),
  ('c7333333-3333-4333-8333-333333333333', 'Noa', 'Advanced', true, true);

set role authenticated;
-- Kai is injured.
select set_config('request.jwt.claim.sub', 'c7111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"c7111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select tests.expect_error($$ insert into public.injury_periods (body_area) values ('knee') $$,
  'injuries are started through start_injury, not inserted directly');
select public.start_injury('knee', '  Twisted it on a lunge  ');
select tests.expect_true((select body_area = 'knee' and note = 'Twisted it on a lunge' and ended_on is null and was_buddy_visible
  from public.injury_periods), 'start_injury records the area, a trimmed note and that the player was listed');
select tests.expect_true((select not buddy_visible from public.profiles where id = auth.uid()), 'an injured player is hidden from Buddy');
select public.start_injury('ankle', '');
select tests.expect_true((select count(*) = 1 and bool_and(body_area = 'ankle' and note is null and was_buddy_visible) from public.injury_periods),
  'starting again updates the open injury and keeps the earlier Buddy listing');
select tests.expect_error($$ select public.start_injury('broken heart', null) $$, 'only the listed body areas are allowed');
select tests.expect_error($$ update public.injury_periods set ended_on = current_date $$, 'injuries are ended through end_injury');

-- Noa no longer finds Kai on Buddy and cannot read Kai's injury.
select set_config('request.jwt.claim.sub', 'c7333333-3333-4333-8333-333333333333', false);
select set_config('request.jwt.claims', '{"sub":"c7333333-3333-4333-8333-333333333333","is_anonymous":false}', false);
select tests.expect_count($$ select 1 from public.buddy_players() where player_id = 'c7111111-1111-4111-8111-111111111111' $$, 0,
  'other players do not see an injured player on Buddy');
select tests.expect_count($$ select 1 from public.injury_periods $$, 0, 'injuries are private to the player');
select tests.expect_rows($$ delete from public.injury_periods $$, 0, 'other players cannot delete an injury');

-- Kai is back.
select set_config('request.jwt.claim.sub', 'c7111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"c7111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select public.end_injury();
select tests.expect_true((select ended_on = current_date from public.injury_periods), 'end_injury closes the open injury');
select tests.expect_true((select buddy_visible from public.profiles where id = auth.uid()), 'a player listed before is listed again');
select public.end_injury();
select tests.expect_count($$ select 1 from public.injury_periods $$, 1, 'ending with nothing open changes nothing');
select public.start_injury(null, null);
select tests.expect_count($$ select 1 from public.injury_periods $$, 2, 'a new injury starts a new period, keeping the history');
select tests.expect_rows($$ delete from public.injury_periods where ended_on is not null $$, 1, 'players can delete their own injury history');

-- Mia was not listed: "I'm back" does not list her.
select set_config('request.jwt.claim.sub', 'c7222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claims', '{"sub":"c7222222-2222-4222-8222-222222222222","is_anonymous":false}', false);
select public.start_injury('back', null);
select public.end_injury();
select tests.expect_true((select not buddy_visible from public.profiles where id = auth.uid()), 'a player who was not listed stays unlisted');

reset role;
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claims', '', false);
set role anon;
select tests.expect_error($$ select public.start_injury('knee', null) $$, 'signed-out visitors cannot start an injury');
reset role;
