-- Self-assessment rows: owner-only access and rating validation.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

insert into auth.users (id, email) values
  ('f1111111-1111-4111-8111-111111111111', 'f1@example.test'),
  ('f2222222-2222-4222-8222-222222222222', 'f2@example.test');

set role authenticated;
select set_config('request.jwt.claim.sub', 'f1111111-1111-4111-8111-111111111111', false);
insert into public.sessions (id, title, session_context, play_format, review_mode)
values ('5f000000-0000-4000-8000-00000000000f', 'D self review', 'casual_match', 'doubles', 'self');
select tests.expect_count($$ select 1 from public.sessions where review_mode = 'self' $$, 1, 'session stores self review mode');
select tests.expect_error($$ insert into public.sessions (title, session_context, play_format, review_mode)
  values ('bad', 'practice', 'singles', 'telepathy') $$, 'unknown review mode is rejected');

insert into public.self_assessments (session_id, ratings, games_played, games_won, unforced_errors, biggest_struggle)
values ('5f000000-0000-4000-8000-00000000000f', '{"serve": 4, "dinking": 2, "volleys": 3}', 6, 4, 'some', 'dinks popping up');
select tests.expect_count($$ select 1 from public.self_assessments where owner_id = 'f1111111-1111-4111-8111-111111111111' $$,
  1, 'owner defaults to the signed-in player');
select tests.expect_error($$ update public.self_assessments set ratings = '{"serve": 6}' $$, 'rating above 5 is rejected');
select tests.expect_error($$ update public.self_assessments set ratings = '{"serve": 2.5}' $$, 'fractional rating is rejected');
select tests.expect_error($$ update public.self_assessments set ratings = '{"backflip": 3}' $$, 'unknown skill is rejected');
select tests.expect_error($$ update public.self_assessments set ratings = '[3]' $$, 'non-object ratings are rejected');
select tests.expect_error($$ update public.self_assessments set games_won = 7 $$, 'more wins than games is rejected');
select tests.expect_rows($$ update public.self_assessments set ratings = '{"serve": 5, "dinking": 3, "volleys": 3}' $$,
  1, 'owner can update ratings');

select set_config('request.jwt.claim.sub', 'f2222222-2222-4222-8222-222222222222', false);
select tests.expect_count($$ select 1 from public.self_assessments $$, 0, 'other player cannot read the assessment');
select tests.expect_rows($$ update public.self_assessments set ratings = '{}' $$, 0, 'other player cannot update the assessment');
select tests.expect_error($$ insert into public.self_assessments (session_id, owner_id, ratings)
  values ('5f000000-0000-4000-8000-00000000000f', 'f1111111-1111-4111-8111-111111111111', '{}') $$,
  'other player cannot write as the owner');
select tests.expect_error($$ insert into public.self_assessments (session_id, ratings)
  values ('5f000000-0000-4000-8000-00000000000f', '{}') $$,
  'other player cannot attach an assessment to a foreign session');

select set_config('request.jwt.claim.sub', 'f1111111-1111-4111-8111-111111111111', false);
delete from public.sessions where id = '5f000000-0000-4000-8000-00000000000f';
reset role;
select tests.expect_count($$ select 1 from public.self_assessments where session_id = '5f000000-0000-4000-8000-00000000000f' $$,
  0, 'deleting the session removes its assessment');
