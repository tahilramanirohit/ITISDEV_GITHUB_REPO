-- PicklePro `cleanversion` branch, update 11 ("I'm injured"): a private
-- injury status that hides the player from Buddy until they are back.
-- Paste the whole file into Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Run AFTER pickleproapp_upgrade_10.sql. Safe to run more than once.
-- Same content as supabase/migrations/20261105120000_injury.sql.

-- "I'm injured" (adviser note: what if the user is injured?). A player can
-- mark that they are injured, for example in the post-game step. While an
-- injury is open the app shows a rest plan, pauses goal deadlines and hides
-- the player from Buddy. "I'm back" closes it and lists them on Buddy again
-- if they were listed before. Not medical advice: the app never asks for a
-- diagnosis, only an optional body area and a short private note.
-- Run AFTER 20261105110000_buddy_match.sql. Safe to run more than once.

create table if not exists public.injury_periods (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Keys must match INJURY_AREAS in src/lib/coaching/injury.ts (checked by its tests).
  body_area text check (body_area in ('shoulder', 'elbow', 'wrist', 'back', 'hip', 'knee', 'ankle', 'foot', 'other')),
  note text check (char_length(note) <= 500),
  started_on date not null default current_date,
  ended_on date,
  -- Whether the player was listed on Buddy when the injury started, so "I'm back" can list them again.
  was_buddy_visible boolean not null default false,
  created_at timestamptz not null default now(),
  constraint injury_periods_dates check (ended_on is null or ended_on >= started_on)
);
-- At most one open injury per player.
create unique index if not exists injury_periods_one_open on public.injury_periods (owner_id) where ended_on is null;

-- Private to the player: nobody else, partners and coaches included, can read them.
-- Players read and delete their own rows; starting and ending go through the functions below,
-- so the Buddy listing always changes together with the injury.
alter table public.injury_periods enable row level security;
drop policy if exists injury_periods_owner_read on public.injury_periods;
create policy injury_periods_owner_read on public.injury_periods for select to authenticated
  using (owner_id = (select auth.uid()));
drop policy if exists injury_periods_owner_delete on public.injury_periods;
create policy injury_periods_owner_delete on public.injury_periods for delete to authenticated
  using (owner_id = (select auth.uid()));
revoke all on public.injury_periods from anon, authenticated;
grant select, delete on public.injury_periods to authenticated;
grant all on public.injury_periods to service_role;

-- Start an injury, or update the area and note of the open one. Hides the player from Buddy.
create or replace function public.start_injury(p_body_area text default null, p_note text default null)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  open_id uuid;
  listed boolean;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select id into open_id from public.injury_periods where owner_id = me and ended_on is null;
  if open_id is not null then
    update public.injury_periods set body_area = p_body_area, note = nullif(btrim(p_note), '') where id = open_id;
    return open_id;
  end if;
  select coalesce(buddy_visible, false) into listed from public.profiles where id = me;
  insert into public.injury_periods (owner_id, body_area, note, was_buddy_visible)
  values (me, p_body_area, nullif(btrim(p_note), ''), coalesce(listed, false))
  returning id into open_id;
  update public.profiles set buddy_visible = false where id = me and buddy_visible;
  return open_id;
end $$;

-- "I'm back": close the open injury and list the player on Buddy again if they were listed before.
create or replace function public.end_injury()
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  relist boolean;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  update public.injury_periods set ended_on = greatest(current_date, started_on)
  where owner_id = me and ended_on is null
  returning was_buddy_visible into relist;
  if coalesce(relist, false) then
    update public.profiles set buddy_visible = true where id = me;
  end if;
end $$;

revoke all on function public.start_injury(text, text), public.end_injury() from public, anon;
grant execute on function public.start_injury(text, text), public.end_injury() to authenticated;
