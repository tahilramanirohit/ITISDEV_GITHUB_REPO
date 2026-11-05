-- Measured court tests (adviser feedback #5, work package WP4): a player
-- records simple counted drills, such as deep serves out of 20, as an
-- objective baseline next to their self-ratings, and re-tests later. Every
-- save adds rows, so the history is kept.
-- Run AFTER 20261024090000_partners.sql. Safe to run more than once.

create table if not exists public.baseline_tests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Keys and limits must match src/lib/coaching/baselineTests.ts (checked by its tests).
  test_key text not null check (test_key in ('deep_serves', 'dinks_in_a_row', 'third_shot_drops', 'deep_returns', 'rally_to_20')),
  value smallint not null check (value between 0 and 500),
  -- How many tries the count is out of; empty for "best run" tests.
  out_of smallint,
  tested_on date not null default current_date,
  created_at timestamptz not null default now(),
  constraint baseline_tests_out_of check (case test_key
    when 'deep_serves' then out_of = 20
    when 'third_shot_drops' then out_of = 10
    when 'deep_returns' then out_of = 10
    when 'rally_to_20' then out_of = 20
    when 'dinks_in_a_row' then out_of is null
  end),
  constraint baseline_tests_value_in_range check (out_of is null or value <= out_of),
  -- One day of slack for players in time zones ahead of the server.
  constraint baseline_tests_date check (tested_on between date '2020-01-01' and current_date + 1)
);
create index if not exists baseline_tests_owner_date on public.baseline_tests (owner_id, tested_on, created_at);

-- Private to the player: nobody else, partners included, can read or change them.
alter table public.baseline_tests enable row level security;
drop policy if exists baseline_tests_owner on public.baseline_tests;
create policy baseline_tests_owner on public.baseline_tests for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
revoke all on public.baseline_tests from anon, authenticated;
grant select, insert, update, delete on public.baseline_tests to authenticated;
grant all on public.baseline_tests to service_role;
