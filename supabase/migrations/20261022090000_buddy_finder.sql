-- Buddy finder (requirements N01-N05, as scoped by the team on 22 Oct 2026).
-- Players who opt in are listed with their name and level (beginner, novice,
-- intermediate, advanced). Another player sends a buddy request with a
-- purpose, a format and the dates and times they are free; the receiver
-- accepts or declines. No booking, payments or public game listings (N04).
-- Safe to run more than once.

-- ── Opt-in ───────────────────────────────────────────────────────────────
-- Off by default: nobody is listed until they choose to be (N01, N05).
alter table public.profiles add column if not exists buddy_visible boolean not null default false;

-- ── Levels ───────────────────────────────────────────────────────────────
-- The profile stores the level as text. Earlier versions of the app offered
-- "New to the game", "Beginner (2.0-2.5)", "Intermediate (3.0-3.5)" and
-- "Advanced (4.0+)"; they map onto the four buddy levels here.
create or replace function public.buddy_level(p_level text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_level is null then null
    when lower(p_level) like '%advanced%' then 'advanced'
    when lower(p_level) like '%intermediate%' then 'intermediate'
    when lower(p_level) like '%novice%' then 'novice'
    when lower(p_level) like '%beginner%' or lower(p_level) like '%new to%' then 'beginner'
    else null
  end
$$;

-- ── Requests ─────────────────────────────────────────────────────────────
create table if not exists public.buddy_requests (
  id uuid primary key default gen_random_uuid(),
  from_player_id uuid not null references public.profiles (id) on delete cascade,
  to_player_id uuid not null references public.profiles (id) on delete cascade,
  purpose text not null check (purpose in ('practice', 'casual_game', 'competition')),
  play_format text not null check (play_format in ('singles', 'doubles', 'either')),
  -- [{"date": "YYYY-MM-DD", "start": "HH:MM", "end": "HH:MM"}, ...]; checked by buddy_slots_valid.
  slots jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint buddy_requests_not_self check (from_player_id <> to_player_id)
);
-- One open request per pair of players, whichever of them sent it.
create unique index if not exists buddy_requests_one_pending on public.buddy_requests
  (least(from_player_id, to_player_id), greatest(from_player_id, to_player_id)) where status = 'pending';
create index if not exists buddy_requests_to_status on public.buddy_requests (to_player_id, status);
create index if not exists buddy_requests_from_status on public.buddy_requests (from_player_id, status);

alter table public.buddy_requests enable row level security;
drop policy if exists buddy_requests_parties_read on public.buddy_requests;
create policy buddy_requests_parties_read on public.buddy_requests for select to authenticated
  using ((select auth.uid()) in (from_player_id, to_player_id));
-- Rows change only through the functions below, which check every rule.
revoke all on public.buddy_requests from anon, authenticated;
grant select on public.buddy_requests to authenticated;
grant all on public.buddy_requests to service_role;

-- 1 to 10 free times, each a real date from today up to 90 days ahead, with
-- a start before the end.
create or replace function public.buddy_slots_valid(p_slots jsonb) returns boolean
language plpgsql stable set search_path = '' as $$
declare
  s jsonb;
  d date;
  t_start time;
  t_end time;
begin
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) not between 1 and 10 then
    return false;
  end if;
  for s in select value from jsonb_array_elements(p_slots) loop
    if jsonb_typeof(s) <> 'object' or s ->> 'date' !~ '^\d{4}-\d{2}-\d{2}$'
       or s ->> 'start' !~ '^\d{2}:\d{2}$' or s ->> 'end' !~ '^\d{2}:\d{2}$' then
      return false;
    end if;
    begin
      d := (s ->> 'date')::date;
      t_start := (s ->> 'start')::time;
      t_end := (s ->> 'end')::time;
    exception when others then
      return false;
    end;
    -- One day of slack for players in time zones ahead of the server.
    if d < current_date - 1 or d > current_date + 90 or t_start >= t_end then
      return false;
    end if;
  end loop;
  return true;
end $$;

-- The caller may use the buddy finder: a signed-in, non-guest player who
-- confirmed being 18 or older (N05).
create or replace function public.buddy_check_caller() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'buddy: sign in first' using errcode = '42501';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'buddy: guest accounts cannot use Buddy' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = me and p.is_adult_confirmed) then
    raise exception 'buddy: confirm in your profile that you are 18 or older' using errcode = '42501';
  end if;
  return me;
end $$;

-- Players listed in Buddy, with the latest open or accepted request between
-- the caller and each of them.
create or replace function public.buddy_players()
returns table (player_id uuid, display_name text, level text, usual_format text,
               request_id uuid, request_status text, request_direction text)
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := public.buddy_check_caller();
begin
  return query
  select p.id, p.display_name, public.buddy_level(p.self_level), p.usual_format,
         r.id, r.status, case when r.id is null then null when r.from_player_id = me then 'outgoing' else 'incoming' end
  from public.profiles p
  join auth.users u on u.id = p.id
  left join lateral (
    select br.id, br.status, br.from_player_id from public.buddy_requests br
    where br.status in ('pending', 'accepted')
      and ((br.from_player_id = me and br.to_player_id = p.id) or (br.from_player_id = p.id and br.to_player_id = me))
    order by (br.status = 'pending') desc, br.created_at desc
    limit 1
  ) r on true
  where p.buddy_visible and p.is_adult_confirmed and not coalesce(u.is_anonymous, false) and p.id <> me
  order by p.display_name
  limit 200;
end $$;

create or replace function public.send_buddy_request(p_to uuid, p_purpose text, p_format text, p_slots jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.buddy_check_caller();
  new_id uuid;
begin
  if not exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = p_to and p.id <> me and p.buddy_visible and p.is_adult_confirmed and not coalesce(u.is_anonymous, false)
  ) then
    raise exception 'buddy: this player is not available in Buddy' using errcode = 'P0001';
  end if;
  if not public.buddy_slots_valid(p_slots) then
    raise exception 'buddy: add 1 to 10 free times, each with a date in the next 90 days and a start before the end'
      using errcode = '22023';
  end if;
  if (select count(*) from public.buddy_requests where from_player_id = me and status = 'pending') >= 10 then
    raise exception 'buddy: you already have 10 requests waiting for an answer' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.buddy_requests where from_player_id = me and to_player_id = p_to
             and status = 'declined' and responded_at > now() - interval '7 days') then
    raise exception 'buddy: this player declined recently; you can ask again 7 days after their answer' using errcode = 'P0001';
  end if;
  begin
    insert into public.buddy_requests (from_player_id, to_player_id, purpose, play_format, slots)
    values (me, p_to, p_purpose, p_format, p_slots)
    returning id into new_id;
  exception when unique_violation then
    raise exception 'buddy: there is already an open request between you and this player' using errcode = 'P0001';
  end;
  return new_id;
end $$;

create or replace function public.respond_buddy_request(p_request_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.buddy_check_caller();
begin
  update public.buddy_requests
     set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
   where id = p_request_id and to_player_id = me and status = 'pending';
  if not found then
    raise exception 'buddy: this request is no longer waiting for your answer' using errcode = 'P0001';
  end if;
end $$;

create or replace function public.cancel_buddy_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.buddy_check_caller();
begin
  update public.buddy_requests set status = 'cancelled', responded_at = now()
   where id = p_request_id and from_player_id = me and status = 'pending';
  if not found then
    raise exception 'buddy: only a request you sent that is still waiting can be cancelled' using errcode = 'P0001';
  end if;
end $$;

-- Requests the caller sent or received, with the other player's name and level.
create or replace function public.my_buddy_requests()
returns table (id uuid, direction text, other_player_id uuid, other_name text, other_level text,
               purpose text, play_format text, slots jsonb, status text, created_at timestamptz,
               responded_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'buddy: sign in first' using errcode = '42501';
  end if;
  return query
  select r.id, case when r.from_player_id = me then 'outgoing' else 'incoming' end,
         o.id, o.display_name, public.buddy_level(o.self_level),
         r.purpose, r.play_format, r.slots, r.status, r.created_at, r.responded_at
  from public.buddy_requests r
  join public.profiles o on o.id = case when r.from_player_id = me then r.to_player_id else r.from_player_id end
  where me in (r.from_player_id, r.to_player_id) and r.status <> 'cancelled'
  order by r.created_at desc
  limit 100;
end $$;

revoke all on function public.buddy_level(text), public.buddy_slots_valid(jsonb), public.buddy_check_caller(),
  public.buddy_players(), public.send_buddy_request(uuid, text, text, jsonb), public.respond_buddy_request(uuid, boolean),
  public.cancel_buddy_request(uuid), public.my_buddy_requests() from public, anon;
grant execute on function public.buddy_level(text), public.buddy_slots_valid(jsonb), public.buddy_players(),
  public.send_buddy_request(uuid, text, text, jsonb), public.respond_buddy_request(uuid, boolean),
  public.cancel_buddy_request(uuid), public.my_buddy_requests() to authenticated;
