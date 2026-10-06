-- "Getting to know the player" at account creation. Answers live on the
-- player's private profile and seed a starting practice plan before any
-- session is logged. Safe to run more than once.
-- Needs 20261006090000_self_assessment.sql (valid_self_ratings).

alter table public.profiles
  add column if not exists play_frequency text
    check (play_frequency in ('first_time', 'monthly', 'weekly', 'few_per_week', 'daily')),
  add column if not exists play_reasons text[] not null default '{}'::text[]
    check (play_reasons <@ array['fun', 'fitness', 'social', 'compete', 'tournaments']::text[]),
  add column if not exists main_goals text[] not null default '{}'::text[]
    check (main_goals <@ array['positioning', 'shot_outcomes', 'shot_technique']::text[]),
  -- The player's usual level per skill, same keys and 1-5 scale as self_assessments.ratings.
  add column if not exists baseline_ratings jsonb not null default '{}'::jsonb
    check (public.valid_self_ratings(baseline_ratings)),
  add column if not exists onboarding_completed_at timestamptz;
