-- Keep a player's own assessment separate from measured video results.
-- Existing sessions have no selected goals or self ratings.
alter table public.sessions
  add column improvement_goals text[] not null default '{}'::text[],
  add column positioning_rating smallint,
  add column shot_outcomes_rating smallint,
  add column shot_technique_rating smallint;

alter table public.sessions
  add constraint sessions_improvement_goals_check
    check (improvement_goals <@ array['positioning', 'shot_outcomes', 'shot_technique']::text[]),
  add constraint sessions_positioning_rating_check check (positioning_rating between 1 and 5),
  add constraint sessions_shot_outcomes_rating_check check (shot_outcomes_rating between 1 and 5),
  add constraint sessions_shot_technique_rating_check check (shot_technique_rating between 1 and 5);
