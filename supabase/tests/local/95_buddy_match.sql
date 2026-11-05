-- Buddy matching: looking-for, coarse game rating and strong skills, and sessions linked to a buddy session.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- F = Fay (looks for buddies), G = Gus (listed), H = Hal (hidden), J = Jo (listed, no ratings).
insert into auth.users (id, email) values
  ('a1111111-1111-4111-8111-111111111111', 'fay@example.test'), ('a2222222-2222-4222-8222-222222222222', 'gus@example.test'),
  ('a3333333-3333-4333-8333-333333333333', 'hal@example.test'), ('a4444444-4444-4444-8444-444444444444', 'jo@example.test');
insert into public.profiles (id, display_name, self_level, is_adult_confirmed, buddy_visible) values
  ('a1111111-1111-4111-8111-111111111111', 'Fay', 'Intermediate', true, true),
  ('a2222222-2222-4222-8222-222222222222', 'Gus', 'Intermediate', true, true),
  ('a3333333-3333-4333-8333-333333333333', 'Hal', 'Advanced', true, false),
  ('a4444444-4444-4444-8444-444444444444', 'Jo', 'Novice', true, true);
-- Gus: 6 rated games (only the last 5 count) and one solo drill (not a game).
insert into public.sessions (id, owner_id, title, session_context, play_format, session_date)
select ('6f000000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'a2222222-2222-4222-8222-222222222222', 'Game ' || i,
       'casual_match', case when i = 7 then 'wall_practice' else 'doubles' end, current_date - (10 - i)
from generate_series(1, 7) i;
insert into public.self_assessments (session_id, owner_id, ratings)
select ('6f000000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'a2222222-2222-4222-8222-222222222222',
       case when i = 1 then '{"dinking": 1, "serve": 1}'::jsonb   -- oldest: dropped
            when i = 7 then '{"dinking": 1, "serve": 1}'::jsonb   -- solo drill: not a game
            else '{"dinking": 5, "serve": 4, "volleys": 2}'::jsonb end
from generate_series(1, 7) i;
-- Hal is hidden but has ratings.
insert into public.sessions (id, owner_id, title, session_context, play_format) values
  ('6f000000-0000-4000-8000-000000000099', 'a3333333-3333-4333-8333-333333333333', 'Hidden game', 'casual_match', 'singles');
insert into public.self_assessments (session_id, owner_id, ratings) values
  ('6f000000-0000-4000-8000-000000000099', 'a3333333-3333-4333-8333-333333333333', '{"dinking": 5}');

set role authenticated;
select set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222222","is_anonymous":false}', false);
select tests.expect_rows($$ update public.profiles set buddy_looking_for = array['practice', 'competition'] where id = auth.uid() $$, 1,
  'a player sets what they are looking for');
select tests.expect_error($$ update public.profiles set buddy_looking_for = array['dating'] where id = auth.uid() $$,
  'only practice, casual_game and competition are allowed');
select tests.expect_true((select game_rating = 3.5 and strong_skills = array['dinking', 'serve'] from public.my_buddy_listing()),
  'game rating: average of the last 5 rated games, rounded to 0.5; strong skills: 4+ on average, best first');

select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select tests.expect_true((select array_agg(player_id order by player_id) from public.buddy_player_details())
  = (select array_agg(player_id order by player_id) from public.buddy_players()), 'details cover the same listed players as buddy_players');
select tests.expect_true((select looking_for = array['practice', 'competition'] and game_rating = 3.5
  from public.buddy_player_details() where player_id = 'a2222222-2222-4222-8222-222222222222'), 'other players see the coarse summary');
select tests.expect_true((select game_rating is null and strong_skills = '{}' from public.buddy_player_details()
  where player_id = 'a4444444-4444-4444-8444-444444444444'), 'players without rated games have no rating');
select tests.expect_count($$ select 1 from public.buddy_player_details() where player_id = 'a3333333-3333-4333-8333-333333333333' $$, 0,
  'hidden players are not summarised');
select tests.expect_error($$ select * from public.buddy_game_summary('a3333333-3333-4333-8333-333333333333') $$,
  'the summary function cannot be called directly');
select tests.expect_count($$ select 1 from public.self_assessments $$, 0, 'individual ratings stay private');

-- ── Logging a session from a buddy session ──────────────────────────────
select public.send_buddy_request('a2222222-2222-4222-8222-222222222222', 'practice', 'doubles',
  format('[{"date":"%s","start":"08:00","end":"10:00"}]', current_date + 1)::jsonb, 'Makati', 'Ayala Triangle courts');
select id as fay_request from public.my_buddy_requests() limit 1 \gset
select tests.expect_error(format($$ insert into public.sessions (owner_id, title, session_context, play_format, buddy_request_id)
  values (auth.uid(), 'Too early', 'practice', 'doubles', %L) $$, :'fay_request'), 'a session cannot link a request that is not accepted');
select set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222222","is_anonymous":false}', false);
select public.respond_buddy_request(:'fay_request', true);
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select tests.expect_rows(format($$ insert into public.sessions (owner_id, title, session_context, play_format, buddy_request_id)
  values (auth.uid(), 'With Gus', 'practice', 'doubles', %L) $$, :'fay_request'), 1, 'a session links the accepted buddy session it came from');
select set_config('request.jwt.claim.sub', 'a4444444-4444-4444-8444-444444444444', false);
select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-8444-444444444444","is_anonymous":false}', false);
select tests.expect_error(format($$ insert into public.sessions (owner_id, title, session_context, play_format, buddy_request_id)
  values (auth.uid(), 'Not mine', 'practice', 'doubles', %L) $$, :'fay_request'), 'a session cannot link someone else''s buddy session');
reset role;
select set_config('request.jwt.claims', '', false);
