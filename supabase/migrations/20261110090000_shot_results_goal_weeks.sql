-- Adviser notes of 7 Nov 2026:
-- * Shots are rated as successes out of 10 ("Out of 10 serves, how many went in?")
--   instead of 1-5. The 1-5 rating that follows from the count is still saved in
--   `ratings`, so plans, Progress and peer comparisons work as before; the count
--   itself is kept here so the plan can quote it ("6 of 10 serves in").
-- * The goal length is a setting: any number of weeks from 1 to 52 (default 4).
-- Run AFTER 20261105130000_buddy_friends.sql. Safe to run more than once.

alter table public.self_assessments add column if not exists shot_results jsonb not null default '{}'::jsonb;

-- Keys must match the shots in src/lib/coaching/selfAssessment.ts (checked by its tests); whole numbers 0 to 10.
create or replace function public.valid_shot_results(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object' and not exists (
    select 1 from jsonb_each(p) e
    where e.key not in ('serve', 'return', 'third_shot', 'dinking', 'volleys')
       or jsonb_typeof(e.value) <> 'number'
       or (e.value #>> '{}')::numeric not between 0 and 10
       or (e.value #>> '{}')::numeric <> trunc((e.value #>> '{}')::numeric))
$$;
alter table public.self_assessments drop constraint if exists self_assessments_shot_results;
alter table public.self_assessments add constraint self_assessments_shot_results check (public.valid_shot_results(shot_results));

alter table public.profiles add column if not exists goal_weeks smallint not null default 4;
alter table public.profiles drop constraint if exists profiles_goal_weeks;
alter table public.profiles add constraint profiles_goal_weeks check (goal_weeks between 1 and 52);
