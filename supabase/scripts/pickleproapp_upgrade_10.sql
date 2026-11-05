-- PicklePro `cleanversion` branch, update 10 (Buddy matching): what each
-- player is looking for, a coarse game rating and strong skills for buddy
-- suggestions, and sessions linked to the buddy session they came from.
-- Paste the whole file into Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Run AFTER pickleproapp_upgrade_9.sql. Safe to run more than once.
-- Same content as supabase/migrations/20261105110000_buddy_match.sql.

-- Buddy matching on performance (adviser feedback #2, work package WP6).
-- Players say what they are looking for (practice, casual games, competition
-- prep). Listed players also show a coarse game rating (their average
-- self-rating over their last 5 rated games, rounded to 0.5) and up to 2
-- strong skills (rated 4+ on average), so Buddy can suggest players at a
-- similar level. Never individual ratings. A logged session can point to the
-- buddy session it came from, so Progress can count games with buddies.
-- Run AFTER 20261105100000_peer_feedback.sql. Safe to run more than once.
-- buddy_players() is left unchanged so the earlier Buddy updates can still be
-- run again; the new details come from buddy_player_details().

alter table public.profiles add column if not exists buddy_looking_for text[] not null default '{}';
alter table public.profiles drop constraint if exists profiles_buddy_looking_for;
alter table public.profiles add constraint profiles_buddy_looking_for
  check (buddy_looking_for <@ array['practice', 'casual_game', 'competition']::text[]);

-- ── Coarse game summary ──────────────────────────────────────────────────
-- Games are court sessions (singles or doubles), as in sessionKind() in the app.
create or replace function public.buddy_game_summary(p_player uuid)
returns table (game_rating numeric, strong_skills text[])
language sql stable security definer set search_path = '' as $$
  with recent as (
    select a.ratings
    from public.self_assessments a join public.sessions s on s.id = a.session_id
    where a.owner_id = p_player and s.play_format in ('singles', 'doubles') and a.ratings <> '{}'::jsonb
    order by s.session_date desc, s.created_at desc
    limit 5
  ), per_game as (
    select (select avg(e.value::numeric) from jsonb_each(r.ratings) e) as rating from recent r
  ), per_skill as (
    select e.key as skill, avg(e.value::numeric) as rating from recent r, jsonb_each(r.ratings) e group by e.key
  )
  select (select round(avg(g.rating) * 2) / 2 from per_game g),
         coalesce((select array_agg(t.skill order by t.rating desc, t.ord) from (
                     select ps.skill, ps.rating, array_position(public.self_skill_keys(), ps.skill) as ord
                     from per_skill ps where ps.rating >= 4
                     order by ps.rating desc, array_position(public.self_skill_keys(), ps.skill) limit 2) t), '{}')
$$;
-- Internal: only the functions below may call it.
revoke all on function public.buddy_game_summary(uuid) from public, anon, authenticated;

-- What a listed player is looking for, with their coarse rating and strong
-- skills. Same players as buddy_players(): opted in, adult, not a guest, not you.
create or replace function public.buddy_player_details()
returns table (player_id uuid, looking_for text[], game_rating numeric, strong_skills text[])
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := public.buddy_check_caller();
begin
  return query
  select p.id, p.buddy_looking_for, g.game_rating, g.strong_skills
  from public.profiles p
  join auth.users u on u.id = p.id
  cross join lateral public.buddy_game_summary(p.id) g
  where p.buddy_visible and p.is_adult_confirmed and not coalesce(u.is_anonymous, false) and p.id <> me
  limit 200;
end $$;

-- The caller's own listing, as others see it.
create or replace function public.my_buddy_listing()
returns table (looking_for text[], game_rating numeric, strong_skills text[])
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := public.buddy_check_caller();
begin
  return query
  select p.buddy_looking_for, g.game_rating, g.strong_skills
  from public.profiles p cross join lateral public.buddy_game_summary(p.id) g
  where p.id = me;
end $$;

revoke all on function public.buddy_player_details(), public.my_buddy_listing() from public, anon;
grant execute on function public.buddy_player_details(), public.my_buddy_listing() to authenticated;

-- ── Sessions logged from a buddy session ────────────────────────────────
alter table public.sessions add column if not exists buddy_request_id uuid references public.buddy_requests (id) on delete set null;

-- A session may point only to an accepted (or later called-off) buddy session of its owner.
create or replace function public.check_session_buddy_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.buddy_request_id is not null
     and (tg_op = 'INSERT' or new.buddy_request_id is distinct from old.buddy_request_id)
     and not exists (select 1 from public.buddy_requests r
                     where r.id = new.buddy_request_id and new.owner_id in (r.from_player_id, r.to_player_id)
                       and r.status in ('accepted', 'called_off')) then
    raise exception 'buddy: a session can be linked only to your own accepted buddy session' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.check_session_buddy_request() from public, anon, authenticated;
drop trigger if exists sessions_buddy_request_check on public.sessions;
create trigger sessions_buddy_request_check before insert or update of buddy_request_id on public.sessions
  for each row execute function public.check_session_buddy_request();
