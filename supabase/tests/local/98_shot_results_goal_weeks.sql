-- Shots as successes out of 10, and the goal length setting.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

insert into auth.users (id, email) values ('e7111111-1111-4111-8111-111111111111', 'shots@example.test');
insert into public.profiles (id, display_name) values ('e7111111-1111-4111-8111-111111111111', 'Shots');
insert into public.sessions (id, owner_id, title, session_context, play_format) values
  ('e7000000-0000-4000-8000-000000000001', 'e7111111-1111-4111-8111-111111111111', 'Game', 'casual_match', 'doubles');

set role authenticated;
select set_config('request.jwt.claim.sub', 'e7111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"e7111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select tests.expect_true((select goal_weeks = 4 from public.profiles where id = auth.uid()), 'goals run 4 weeks unless the player changes it');
select tests.expect_rows($$ update public.profiles set goal_weeks = 2 where id = auth.uid() $$, 1, 'a player sets their own goal length');
select tests.expect_error($$ update public.profiles set goal_weeks = 0 where id = auth.uid() $$, 'a goal lasts at least a week');
select tests.expect_error($$ update public.profiles set goal_weeks = 60 where id = auth.uid() $$, 'a goal lasts at most a year');

select tests.expect_rows($$ insert into public.self_assessments (session_id, ratings, shot_results)
  values ('e7000000-0000-4000-8000-000000000001', '{"serve": 4, "dinking": 2}', '{"serve": 7, "dinking": 3}') $$, 1,
  'shot results are saved next to the ratings');
select tests.expect_error($$ update public.self_assessments set shot_results = '{"serve": 11}' $$, 'at most 10 of 10');
select tests.expect_error($$ update public.self_assessments set shot_results = '{"serve": 2.5}' $$, 'counts are whole numbers');
select tests.expect_error($$ update public.self_assessments set shot_results = '{"strategy": 3}' $$, 'only shots are counted');
select tests.expect_true((select shot_results = '{"serve": 7, "dinking": 3}'::jsonb from public.self_assessments), 'bad counts never replace good ones');
reset role;
select set_config('request.jwt.claims', '', false);
