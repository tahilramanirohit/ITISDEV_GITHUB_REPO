-- Video comments for everyone on a shared session, and players' profile photos (adviser notes, 10 Nov 2026).
--
-- 1. Comments on a shared video: the owner can now comment too (pinned to a second of the video,
--    like partners), and everyone who can open the session sees every comment on it: the owner and
--    each partner it is shared with. Before, a partner saw only their own notes and the owner could
--    only read and delete them. Each author still edits only their own comments; the owner can
--    delete any comment on their session.
-- 2. Every signed-in player can see every player's profile photo (adviser request: photos on the
--    Players tab). player_photos() gives the photo paths for the players on screen.
-- 3. A cancelled buddy session can be removed from your own list (hidden for you only).
--
-- Safe to run more than once.

-- ── 1. Comments ──────────────────────────────────────────────────────────
create or replace function public.add_peer_note(p_session_id uuid, p_video_time_s numeric, p_body text, p_skill text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.partner_check_caller();
  text_ text := btrim(coalesce(p_body, ''), E' \t\r\n');
  is_owner boolean;
  new_id uuid;
begin
  is_owner := exists (select 1 from public.sessions s where s.id = p_session_id and s.owner_id = me);
  if not is_owner and not public.partner_can_view(p_session_id) then
    raise exception 'partners: this session is not shared with you' using errcode = '42501';
  end if;
  if char_length(text_) not between 1 and 500 then
    raise exception 'partners: write a note of 1 to 500 characters' using errcode = '22023';
  end if;
  if p_video_time_s is not null and p_video_time_s not between 0 and 36000 then
    raise exception 'partners: the video time is not valid' using errcode = '22023';
  end if;
  -- Partners tag a comment only with a skill they were asked about; the owner does not tag.
  if (is_owner and p_skill is not null) or (not is_owner and not public.peer_note_skill_ok(p_session_id, p_skill)) then
    raise exception 'partners: tag a note only with a skill you were asked about' using errcode = '22023';
  end if;
  if (select count(*) from public.peer_notes n where n.session_id = p_session_id and n.author_id = me) >= 200 then
    raise exception 'partners: you can leave at most 200 notes on one session' using errcode = 'P0001';
  end if;
  insert into public.peer_notes (session_id, owner_id, author_id, video_time_s, body, skill)
  select s.id, s.owner_id, me, round(p_video_time_s, 2), text_, p_skill from public.sessions s where s.id = p_session_id
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.edit_peer_note(p_id uuid, p_body text, p_skill text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  text_ text := btrim(coalesce(p_body, ''), E' \t\r\n');
  note public.peer_notes;
begin
  if char_length(text_) not between 1 and 500 then
    raise exception 'partners: write a note of 1 to 500 characters' using errcode = '22023';
  end if;
  -- Your own comment, on your own session or on one still shared with you.
  select * into note from public.peer_notes n
   where n.id = p_id and n.author_id = me and (n.owner_id = me or public.partner_can_view(n.session_id));
  if not found then
    raise exception 'partners: you can edit only your own notes on a session shared with you' using errcode = '42501';
  end if;
  if (note.owner_id = me and p_skill is not null) or (note.owner_id <> me and not public.peer_note_skill_ok(note.session_id, p_skill)) then
    raise exception 'partners: tag a note only with a skill you were asked about' using errcode = '22023';
  end if;
  update public.peer_notes set body = text_, skill = p_skill, updated_at = now() where id = p_id;
end $$;

-- Everyone who can open the session reads every comment on it.
create or replace function public.session_peer_notes(p_session_id uuid)
returns table (id uuid, author_id uuid, author_name text, mine boolean, video_time_s numeric,
               body text, created_at timestamptz, updated_at timestamptz, skill text)
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'partners: sign in first' using errcode = '42501';
  end if;
  if not exists (select 1 from public.sessions s where s.id = p_session_id and s.owner_id = me)
     and not public.partner_can_view(p_session_id) then
    raise exception 'partners: this session is not shared with you' using errcode = '42501';
  end if;
  return query
  select n.id, n.author_id, a.display_name, n.author_id = me, n.video_time_s, n.body, n.created_at, n.updated_at, n.skill
  from public.peer_notes n join public.profiles a on a.id = n.author_id
  where n.session_id = p_session_id
  order by n.video_time_s nulls first, n.created_at
  limit 500;
end $$;

revoke all on function public.add_peer_note(uuid, numeric, text, text), public.edit_peer_note(uuid, text, text),
  public.session_peer_notes(uuid) from public, anon;
grant execute on function public.add_peer_note(uuid, numeric, text, text), public.edit_peer_note(uuid, text, text),
  public.session_peer_notes(uuid) to authenticated;

-- ── 2. Players' photos ───────────────────────────────────────────────────
-- Every signed-in player (not guests) can see every player's profile photo, so photos
-- show on the Players tab: Find, requests and partner cards. Uploading, changing and
-- deleting stay limited to the photo's owner.
drop policy if exists profile_photos_select_buddies on storage.objects;
drop policy if exists profile_photos_select_players on storage.objects;
create policy profile_photos_select_players on storage.objects for select to authenticated
  using (bucket_id = 'profile-photos' and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false));

-- Photo paths for the players on screen (at most 500 at a time). Only the path: nothing
-- else from the profile.
create or replace function public.player_photos(p_ids uuid[])
returns table (player_id uuid, avatar_path text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'players: sign in with an account first' using errcode = '42501';
  end if;
  if coalesce(array_length(p_ids, 1), 0) > 500 then
    raise exception 'players: ask for at most 500 photos at a time' using errcode = '22023';
  end if;
  return query
  select p.id, p.avatar_path from public.profiles p where p.id = any (p_ids) and p.avatar_path is not null;
end $$;
revoke all on function public.player_photos(uuid[]) from public, anon;
grant execute on function public.player_photos(uuid[]) to authenticated;

-- ── 3. Removing cancelled buddy sessions from your list ──────────────────
-- A cancelled ("called off") buddy session can be removed from your own list. It is only
-- hidden for you: the other player still sees it until they remove it too.
create table if not exists public.hidden_buddy_sessions (
  request_id uuid not null references public.buddy_requests (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (request_id, player_id)
);
alter table public.hidden_buddy_sessions enable row level security;
drop policy if exists hidden_buddy_sessions_own_read on public.hidden_buddy_sessions;
create policy hidden_buddy_sessions_own_read on public.hidden_buddy_sessions for select to authenticated
  using (player_id = (select auth.uid()));
revoke all on public.hidden_buddy_sessions from anon, authenticated;
grant select on public.hidden_buddy_sessions to authenticated;
grant all on public.hidden_buddy_sessions to service_role;

create or replace function public.hide_cancelled_session(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'buddy: sign in first' using errcode = '42501';
  end if;
  if not exists (select 1 from public.buddy_requests r where r.id = p_request_id and r.status = 'called_off'
                 and me in (r.from_player_id, r.to_player_id)) then
    raise exception 'buddy: only your cancelled sessions can be removed' using errcode = '42501';
  end if;
  insert into public.hidden_buddy_sessions (request_id, player_id) values (p_request_id, me) on conflict do nothing;
end $$;
revoke all on function public.hide_cancelled_session(uuid) from public, anon;
grant execute on function public.hide_cancelled_session(uuid) to authenticated;
