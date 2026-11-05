-- PicklePro `cleanversion` branch, update 12 (buddies as a friend list): add a
-- player as a buddy, they accept, then ask them to play or partner for video
-- feedback. Players who already played a buddy session or are partners become
-- buddies automatically.
-- Paste the whole file into Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Run AFTER pickleproapp_upgrade_11.sql. Safe to run more than once.
-- Same content as supabase/migrations/20261105130000_buddy_friends.sql.

-- Buddies as a friend list (team request, 5 Nov 2026). Find a player under
-- Players -> Find and add them as a buddy; they accept or decline. Only then can
-- either of you ask the other to play (a buddy session with purpose, format,
-- place and free times) or partner for video feedback.
--
-- * New table buddies: one row per pair, pending -> active (or declined,
--   cancelled, ended). Rows change only through the functions below.
-- * Players who already had an accepted (or later called-off) buddy session,
--   or are partners, become buddies automatically.
-- * Asking to play and partnering require being buddies (checked by triggers,
--   so every path is covered, partner codes included).
-- * Removing a buddy ends a video partnership between you and withdraws
--   requests still waiting; accepted buddy sessions stay until one of you
--   cancels them.
-- Run AFTER 20261105120000_injury.sql. Safe to run more than once.

create table if not exists public.buddies (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'declined', 'cancelled', 'ended')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  ended_at timestamptz,
  constraint buddies_not_self check (requester_id <> addressee_id)
);
-- One waiting request or friendship per pair, whoever asked.
create unique index if not exists buddies_one_open_pair on public.buddies
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id)) where status in ('pending', 'active');
create index if not exists buddies_addressee_status on public.buddies (addressee_id, status);
create index if not exists buddies_requester_status on public.buddies (requester_id, status);

alter table public.buddies enable row level security;
drop policy if exists buddies_parties_read on public.buddies;
create policy buddies_parties_read on public.buddies for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
revoke all on public.buddies from anon, authenticated;
grant select on public.buddies to authenticated;
grant all on public.buddies to service_role;

create or replace function public.are_buddies(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.buddies b where b.status = 'active'
                 and ((b.requester_id = p_a and b.addressee_id = p_b) or (b.requester_id = p_b and b.addressee_id = p_a)))
$$;
revoke all on function public.are_buddies(uuid, uuid) from public, anon, authenticated;

-- ── Existing pairs become buddies ─────────────────────────────────────────
insert into public.buddies (requester_id, addressee_id, status, created_at, responded_at)
select distinct on (least(x.a, x.b), greatest(x.a, x.b)) x.a, x.b, 'active', x.created_at, coalesce(x.responded_at, x.created_at)
from (
  select r.from_player_id as a, r.to_player_id as b, r.created_at, r.responded_at
  from public.buddy_requests r where r.status in ('accepted', 'called_off')
  union all
  select p.inviter_id, p.invitee_id, p.created_at, p.linked_at
  from public.partners p where p.status = 'active' and p.invitee_id is not null
) x
where not exists (select 1 from public.buddies b where b.status in ('pending', 'active')
                  and least(b.requester_id, b.addressee_id) = least(x.a, x.b)
                  and greatest(b.requester_id, b.addressee_id) = greatest(x.a, x.b))
order by least(x.a, x.b), greatest(x.a, x.b), x.created_at
on conflict do nothing;

-- ── Adding, answering, cancelling and removing ───────────────────────────
-- Add a listed player as a buddy. If they already asked you, this accepts their request.
create or replace function public.add_buddy(p_player uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.buddy_check_caller();
  link public.buddies;
  new_id uuid;
begin
  if not exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = p_player and p.id <> me and p.buddy_visible and p.is_adult_confirmed and not coalesce(u.is_anonymous, false)
  ) then
    raise exception 'buddy: this player is not available in Buddy' using errcode = 'P0001';
  end if;
  select * into link from public.buddies b where b.status in ('pending', 'active')
    and ((b.requester_id = me and b.addressee_id = p_player) or (b.requester_id = p_player and b.addressee_id = me));
  if found then
    if link.status = 'active' then
      raise exception 'buddy: you are already buddies' using errcode = 'P0001';
    elsif link.requester_id = me then
      raise exception 'buddy: you already asked; waiting for their answer' using errcode = 'P0001';
    end if;
    update public.buddies set status = 'active', responded_at = now() where id = link.id;
    return link.id;
  end if;
  if exists (select 1 from public.buddies b where b.requester_id = me and b.addressee_id = p_player
             and b.status = 'declined' and b.responded_at > now() - interval '7 days') then
    raise exception 'buddy: this player declined recently; you can ask again 7 days after their answer' using errcode = 'P0001';
  end if;
  if (select count(*) from public.buddies b where b.requester_id = me and b.status = 'pending') >= 20 then
    raise exception 'buddy: you already have 20 buddy requests waiting for an answer' using errcode = 'P0001';
  end if;
  insert into public.buddies (requester_id, addressee_id) values (me, p_player) returning id into new_id;
  return new_id;
end $$;

create or replace function public.respond_buddy(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.buddy_check_caller();
begin
  update public.buddies set status = case when p_accept then 'active' else 'declined' end, responded_at = now()
   where id = p_id and addressee_id = me and status = 'pending';
  if not found then
    raise exception 'buddy: this buddy request is no longer waiting for your answer' using errcode = 'P0001';
  end if;
end $$;

create or replace function public.cancel_buddy_add(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.buddy_check_caller();
begin
  update public.buddies set status = 'cancelled', responded_at = now()
   where id = p_id and requester_id = me and status = 'pending';
  if not found then
    raise exception 'buddy: only a buddy request you sent that is still waiting can be cancelled' using errcode = 'P0001';
  end if;
end $$;

-- Stop being buddies. Ends a video partnership between you and withdraws requests still waiting.
create or replace function public.remove_buddy(p_player uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'buddy: sign in first' using errcode = '42501';
  end if;
  update public.buddies set status = 'ended', ended_at = now()
   where status = 'active' and ((requester_id = me and addressee_id = p_player) or (requester_id = p_player and addressee_id = me));
  if not found then
    raise exception 'buddy: you are not buddies with this player' using errcode = 'P0001';
  end if;
  update public.partners set status = case when status = 'active' then 'ended' else 'cancelled' end, ended_at = now(), ended_by = me
   where status in ('pending', 'active') and ((inviter_id = me and invitee_id = p_player) or (inviter_id = p_player and invitee_id = me));
  -- Shares between you go with the partnership (as when unlinking).
  delete from public.report_shares where (owner_id = me and partner_id = p_player) or (owner_id = p_player and partner_id = me);
  update public.buddy_requests set status = 'cancelled', responded_at = now()
   where status = 'pending' and ((from_player_id = me and to_player_id = p_player) or (from_player_id = p_player and to_player_id = me));
end $$;

-- The caller's buddies and buddy requests (waiting or active), with the other player's name and level.
create or replace function public.my_buddies()
returns table (id uuid, status text, direction text, other_id uuid, other_name text, other_level text,
               created_at timestamptz, responded_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'buddy: sign in first' using errcode = '42501';
  end if;
  return query
  select b.id, b.status, case when b.requester_id = me then 'sent' else 'received' end,
         o.id, o.display_name, public.buddy_level(o.self_level), b.created_at, b.responded_at
  from public.buddies b
  join public.profiles o on o.id = case when b.requester_id = me then b.addressee_id else b.requester_id end
  where me in (b.requester_id, b.addressee_id) and b.status in ('pending', 'active')
  order by b.status, b.created_at desc
  limit 300;
end $$;

revoke all on function public.add_buddy(uuid), public.respond_buddy(uuid, boolean), public.cancel_buddy_add(uuid),
  public.remove_buddy(uuid), public.my_buddies() from public, anon;
grant execute on function public.add_buddy(uuid), public.respond_buddy(uuid, boolean), public.cancel_buddy_add(uuid),
  public.remove_buddy(uuid), public.my_buddies() to authenticated;

-- ── Asking to play needs a buddy ──────────────────────────────────────────
create or replace function public.check_buddy_request_buddies() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.are_buddies(new.from_player_id, new.to_player_id) then
    raise exception 'buddy: add this player as a buddy first; once they accept, you can ask them to play' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists buddy_requests_need_buddies on public.buddy_requests;
create trigger buddy_requests_need_buddies before insert on public.buddy_requests
  for each row execute function public.check_buddy_request_buddies();

-- A buddy can be asked to play even while they are hidden from the Buddy list.
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
    where p.id = p_to and p.id <> me and p.is_adult_confirmed and not coalesce(u.is_anonymous, false)
  ) or not public.are_buddies(me, p_to) then
    raise exception 'buddy: add this player as a buddy first; once they accept, you can ask them to play' using errcode = 'P0001';
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
revoke all on function public.send_buddy_request(uuid, text, text, jsonb, text, text) from public, anon;
grant execute on function public.send_buddy_request(uuid, text, text, jsonb, text, text) to authenticated;

-- ── Video partners need a buddy ───────────────────────────────────────────
create or replace function public.check_partner_buddies() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.invitee_id is not null and new.status in ('pending', 'active')
     and (tg_op = 'INSERT' or old.invitee_id is distinct from new.invitee_id or old.status is distinct from new.status)
     and not public.are_buddies(new.inviter_id, new.invitee_id) then
    raise exception 'partners: you can partner only with a buddy; add them as a buddy first' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists partners_need_buddies on public.partners;
create trigger partners_need_buddies before insert or update on public.partners
  for each row execute function public.check_partner_buddies();

-- Any buddy can be invited to be a video partner (before: only after an accepted buddy session).
create or replace function public.invite_buddy_as_partner(p_player uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.partner_check_caller();
  new_id uuid;
begin
  if not public.are_buddies(me, p_player) then
    raise exception 'partners: you can partner only with a buddy; add them as a buddy first' using errcode = 'P0001';
  end if;
  perform public.partner_limit_check(me);
  begin
    insert into public.partners (inviter_id, invitee_id) values (me, p_player) returning id into new_id;
  exception when unique_violation then
    raise exception 'partners: you are already partners with this player, or an invite between you is waiting' using errcode = 'P0001';
  end;
  return new_id;
end $$;
