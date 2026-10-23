-- Self-assessment path: a session can be reviewed from the player's own
-- ratings, without uploading a video. Video analysis stays available as an
-- optional extra on any session. Safe to run more than once (for example by
-- pasting it into the Supabase SQL editor of an existing project).

alter table public.sessions
  add column if not exists review_mode text not null default 'video'
    check (review_mode in ('self', 'video'));

-- Ratings are 1-5 per skill. Keys must match SELF_SKILLS in
-- src/lib/coaching/selfAssessment.ts.
create or replace function public.valid_self_ratings(r jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(r) = 'object' and not exists (
    select 1 from jsonb_each(r) e
    where e.key not in ('serve', 'return', 'third_shot', 'dinking', 'volleys',
                        'kitchen_line', 'transition', 'footwork', 'consistency', 'strategy')
       or jsonb_typeof(e.value) <> 'number'
       or e.value::text not in ('1', '2', '3', '4', '5')
  )
$$;

create table if not exists public.self_assessments (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ratings jsonb not null default '{}'::jsonb check (public.valid_self_ratings(ratings)),
  -- Optional rough counts from the player's memory of the session.
  games_played smallint check (games_played between 0 and 50),
  games_won smallint check (games_won between 0 and 50),
  unforced_errors text check (unforced_errors in ('few', 'some', 'many')),
  biggest_struggle text check (char_length(biggest_struggle) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (games_won is null or games_played is null or games_won <= games_played)
);
create index if not exists self_assessments_owner_idx on public.self_assessments (owner_id);

create or replace function public.touch_self_assessment() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end $$;
drop trigger if exists self_assessment_touch on public.self_assessments;
create trigger self_assessment_touch before insert or update on public.self_assessments
  for each row execute function public.touch_self_assessment();

alter table public.self_assessments enable row level security;
drop policy if exists self_assessments_own on public.self_assessments;
create policy self_assessments_own on public.self_assessments for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
    and exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = (select auth.uid())));

revoke all on public.self_assessments from anon, authenticated;
grant select, insert, update, delete on public.self_assessments to authenticated;
