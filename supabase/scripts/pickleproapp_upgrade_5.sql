-- PicklePro `coaching` branch, update 5 (Buddy meetup place): a buddy request
-- also names the city and the court or place to meet.
-- Paste the whole file into Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Run AFTER pickleproapp_upgrade_4.sql. Safe to run more than once.
-- Same content as supabase/migrations/20261023090000_buddy_meetup.sql.

-- Buddy meetup place (team request, 22 Oct 2026): a buddy request also names
-- the city and the court or place to meet, typed by the player.
-- Run AFTER 20261022090000_buddy_finder.sql. Safe to run more than once.

-- Requests sent before this update have no city or location; new ones must have both.
alter table public.buddy_requests
  add column if not exists city text check (char_length(btrim(city)) between 1 and 60),
  add column if not exists location text check (char_length(btrim(location)) between 1 and 120);

-- The request now takes the city and location too.
drop function if exists public.send_buddy_request(uuid, text, text, jsonb);
create or replace function public.send_buddy_request(p_to uuid, p_purpose text, p_format text, p_slots jsonb,
                                                     p_city text, p_location text)
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
  if char_length(btrim(coalesce(p_city, ''))) not between 1 and 60 then
    raise exception 'buddy: enter the city (up to 60 characters)' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_location, ''))) not between 1 and 120 then
    raise exception 'buddy: enter where to meet, such as a court name (up to 120 characters)' using errcode = '22023';
  end if;
  if (select count(*) from public.buddy_requests where from_player_id = me and status = 'pending') >= 10 then
    raise exception 'buddy: you already have 10 requests waiting for an answer' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.buddy_requests where from_player_id = me and to_player_id = p_to
             and status = 'declined' and responded_at > now() - interval '7 days') then
    raise exception 'buddy: this player declined recently; you can ask again 7 days after their answer' using errcode = 'P0001';
  end if;
  begin
    insert into public.buddy_requests (from_player_id, to_player_id, purpose, play_format, slots, city, location)
    values (me, p_to, p_purpose, p_format, p_slots, btrim(p_city), btrim(p_location))
    returning id into new_id;
  exception when unique_violation then
    raise exception 'buddy: there is already an open request between you and this player' using errcode = 'P0001';
  end;
  return new_id;
end $$;

-- The request list now includes the city and location.
drop function if exists public.my_buddy_requests();
create function public.my_buddy_requests()
returns table (id uuid, direction text, other_player_id uuid, other_name text, other_level text,
               purpose text, play_format text, slots jsonb, city text, location text, status text,
               created_at timestamptz, responded_at timestamptz)
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
         r.purpose, r.play_format, r.slots, r.city, r.location, r.status, r.created_at, r.responded_at
  from public.buddy_requests r
  join public.profiles o on o.id = case when r.from_player_id = me then r.to_player_id else r.from_player_id end
  where me in (r.from_player_id, r.to_player_id) and r.status <> 'cancelled'
  order by r.created_at desc
  limit 100;
end $$;

revoke all on function public.send_buddy_request(uuid, text, text, jsonb, text, text), public.my_buddy_requests() from public, anon;
grant execute on function public.send_buddy_request(uuid, text, text, jsonb, text, text), public.my_buddy_requests() to authenticated;
