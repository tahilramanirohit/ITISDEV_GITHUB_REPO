-- PicklePro `coaching` branch, update 6 (cancel a buddy session): either
-- player can call off an accepted buddy session, with an optional reason.
-- Paste the whole file into Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Run AFTER pickleproapp_upgrade_5.sql. Safe to run more than once. If you run
-- update 4 or 5 again later, run this file again after it.
-- Same content as supabase/migrations/20261023100000_buddy_cancel.sql.

-- Cancelling an accepted buddy session (team request, 22 Oct 2026): either
-- player can call it off, with an optional reason the other player sees.
-- Run AFTER 20261023090000_buddy_meetup.sql. Safe to run more than once; if the
-- buddy_finder or buddy_meetup file is run again later, run this one again too
-- (they recreate my_buddy_requests without the cancel columns).

-- "cancelled" stays the sender withdrawing a request that was never answered;
-- "called_off" is an accepted session that one of the two players cancelled.
alter table public.buddy_requests
  add column if not exists cancelled_by uuid references public.profiles (id) on delete set null,
  add column if not exists cancel_reason text check (char_length(cancel_reason) between 1 and 200),
  add column if not exists cancelled_at timestamptz;
alter table public.buddy_requests drop constraint if exists buddy_requests_status_check;
alter table public.buddy_requests add constraint buddy_requests_status_check
  check (status in ('pending', 'accepted', 'declined', 'cancelled', 'called_off'));

create or replace function public.cancel_buddy_session(p_request_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  reason text := nullif(btrim(coalesce(p_reason, ''), E' \t\r\n'), '');
begin
  -- No 18+ or guest check here: a player can always back out of a session.
  if me is null then
    raise exception 'buddy: sign in first' using errcode = '42501';
  end if;
  if char_length(reason) > 200 then
    raise exception 'buddy: keep the reason under 200 characters' using errcode = '22023';
  end if;
  update public.buddy_requests
     set status = 'called_off', cancelled_by = me, cancel_reason = reason, cancelled_at = now()
   where id = p_request_id and me in (from_player_id, to_player_id) and status = 'accepted';
  if not found then
    raise exception 'buddy: only an accepted buddy session can be cancelled' using errcode = 'P0001';
  end if;
end $$;

-- The request list now says who called a session off, and why.
drop function if exists public.my_buddy_requests();
create function public.my_buddy_requests()
returns table (id uuid, direction text, other_player_id uuid, other_name text, other_level text,
               purpose text, play_format text, slots jsonb, city text, location text, status text,
               created_at timestamptz, responded_at timestamptz,
               cancelled_by_me boolean, cancel_reason text, cancelled_at timestamptz)
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
         r.purpose, r.play_format, r.slots, r.city, r.location, r.status, r.created_at, r.responded_at,
         r.cancelled_by = me, r.cancel_reason, r.cancelled_at
  from public.buddy_requests r
  join public.profiles o on o.id = case when r.from_player_id = me then r.to_player_id else r.from_player_id end
  where me in (r.from_player_id, r.to_player_id) and r.status <> 'cancelled'
  order by r.created_at desc
  limit 100;
end $$;

revoke all on function public.cancel_buddy_session(uuid, text), public.my_buddy_requests() from public, anon;
grant execute on function public.cancel_buddy_session(uuid, text), public.my_buddy_requests() to authenticated;
