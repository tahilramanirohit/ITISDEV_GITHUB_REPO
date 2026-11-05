-- Measured court tests: private to the player, limits match each test, history is kept.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

insert into auth.users (id, email) values
  ('d1111111-1111-4111-8111-111111111111', 'tester@example.test'),
  ('d2222222-2222-4222-8222-222222222222', 'other@example.test');

set role authenticated;
select set_config('request.jwt.claim.sub', 'd1111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"d1111111-1111-4111-8111-111111111111"}', false);

insert into public.baseline_tests (test_key, value, out_of, tested_on) values
  ('deep_serves', 9, 20, current_date - 30), ('dinks_in_a_row', 8, null, current_date - 30);
select tests.expect_true((select count(*) = 2 and bool_and(owner_id = auth.uid()) from public.baseline_tests),
  'a player saves test results, owned by them by default');
insert into public.baseline_tests (test_key, value, out_of) values ('deep_serves', 13, 20);
select tests.expect_count($$ select 1 from public.baseline_tests where test_key = 'deep_serves' $$, 2,
  're-testing adds a new row, so the history is kept');
select tests.expect_true((select tested_on = current_date from public.baseline_tests where value = 13), 'the test date defaults to today');

select tests.expect_error($$ insert into public.baseline_tests (test_key, value, out_of) values ('lobs', 3, 10) $$, 'unknown tests are rejected');
select tests.expect_error($$ insert into public.baseline_tests (test_key, value, out_of) values ('deep_serves', 21, 20) $$,
  'a count cannot be more than its tries');
select tests.expect_error($$ insert into public.baseline_tests (test_key, value, out_of) values ('deep_serves', 12, 30) $$,
  'each test has its fixed number of tries');
select tests.expect_error($$ insert into public.baseline_tests (test_key, value, out_of) values ('dinks_in_a_row', 12, 20) $$,
  'best-run tests have no number of tries');
select tests.expect_error($$ insert into public.baseline_tests (test_key, value, out_of) values ('deep_returns', -1, 10) $$,
  'counts cannot be negative');
select tests.expect_error($$ insert into public.baseline_tests (test_key, value, out_of, tested_on) values ('deep_returns', 4, 10, current_date + 5) $$,
  'results cannot be dated in the future');
select tests.expect_error($$ insert into public.baseline_tests (owner_id, test_key, value, out_of)
  values ('d2222222-2222-4222-8222-222222222222', 'deep_returns', 4, 10) $$, 'a player cannot save results for someone else');

-- ── Another player sees and changes nothing ─────────────────────────────
select set_config('request.jwt.claim.sub', 'd2222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claims', '{"sub":"d2222222-2222-4222-8222-222222222222"}', false);
select tests.expect_count($$ select 1 from public.baseline_tests $$, 0, 'other players cannot read anyone''s test results');
select tests.expect_rows($$ update public.baseline_tests set value = 0 $$, 0, 'other players cannot change them');
select tests.expect_rows($$ delete from public.baseline_tests $$, 0, 'other players cannot delete them');

-- ── The owner can correct and delete their own ───────────────────────────
select set_config('request.jwt.claim.sub', 'd1111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"d1111111-1111-4111-8111-111111111111"}', false);
select tests.expect_rows($$ update public.baseline_tests set value = 14 where value = 13 $$, 1, 'the owner can correct a result');
select tests.expect_rows($$ delete from public.baseline_tests where test_key = 'dinks_in_a_row' $$, 1, 'the owner can delete a result');
reset role;
select set_config('request.jwt.claims', '', false);

set role anon;
select tests.expect_error($$ select * from public.baseline_tests $$, 'signed-out visitors cannot read test results');
reset role;
