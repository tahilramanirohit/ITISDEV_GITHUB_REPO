-- Buddy game shares: when you name a buddy as a player in a game, that game
-- (with its video and analysis, read-only) can appear on the buddy's account.
-- The buddy is asked each time, unless they chose "Accept automatically" or
-- "Always accept from <you>". Additive only: no existing table or policy changes.

-- The tagged player's choice: 'ask' (default) or 'auto'.
alter table public.profiles
  add column if not exists game_share_mode text not null default 'ask';
do $$ begin
  alter table public.profiles add constraint profiles_game_share_mode_check check (game_share_mode in ('ask', 'auto'));
exception when duplicate_object then null; end $$;

create table if not exists public.game_tags (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  tagged_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (session_id, tagged_id),
  check (owner_id <> tagged_id)
);
create index if not exists game_tags_tagged_idx on public.game_tags (tagged_id, status);

-- "Always accept from this buddy."
create table if not exists public.game_tag_trust (
  player_id uuid not null references auth.users(id) on delete cascade,
  trusted_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (player_id, trusted_id)
);

alter table public.game_tags enable row level security;
alter table public.game_tag_trust enable row level security;
drop policy if exists game_tags_parties_read on public.game_tags;
create policy game_tags_parties_read on public.game_tags for select to authenticated
  using (owner_id = (select auth.uid()) or tagged_id = (select auth.uid()));
drop policy if exists game_tag_trust_own_read on public.game_tag_trust;
create policy game_tag_trust_own_read on public.game_tag_trust for select to authenticated
  using (player_id = (select auth.uid()));
revoke all on public.game_tags, public.game_tag_trust from anon, authenticated;
grant select on public.game_tags, public.game_tag_trust to authenticated;
grant all on public.game_tags, public.game_tag_trust to service_role;

-- The caller accepted this game and is still the owner's buddy.
create or replace function public.game_tag_can_view(p_session_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.game_tags t
    where t.session_id = p_session_id and t.tagged_id = auth.uid() and t.status = 'accepted'
      and public.are_buddies(t.owner_id, t.tagged_id))
$$;

create or replace function public.game_tag_can_view_video(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.video_assets v
    where v.storage_path = p_name and v.upload_status = 'uploaded' and v.raw_video_deleted_at is null
      and public.game_tag_can_view(v.session_id))
$$;

-- A tagged buddy may create a short-lived signed link to the game's video.
drop policy if exists session_videos_select_tagged on storage.objects;
create policy session_videos_select_tagged on storage.objects for select to authenticated
  using (bucket_id = 'session-videos' and public.game_tag_can_view_video(name));

-- Owner: share the game with these buddies (others are ignored). Returns how many were asked or added.
create or replace function public.tag_buddies_in_game(p_session_id uuid, p_players uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  p uuid;
  n integer := 0;
  auto boolean;
begin
  if me is null then raise exception 'game shares: sign in first' using errcode = '42501'; end if;
  if not exists (select 1 from public.sessions s where s.id = p_session_id and s.owner_id = me) then
    raise exception 'game shares: only the player who logged the game can share it' using errcode = '42501';
  end if;
  foreach p in array coalesce(p_players, '{}'::uuid[]) loop
    continue when p = me or not public.are_buddies(me, p);
    select coalesce(pr.game_share_mode = 'auto', false)
           or exists (select 1 from public.game_tag_trust tr where tr.player_id = p and tr.trusted_id = me)
      into auto from public.profiles pr where pr.id = p;
    insert into public.game_tags (session_id, owner_id, tagged_id, status, responded_at)
    values (p_session_id, me, p, case when coalesce(auto, false) then 'accepted' else 'pending' end,
            case when coalesce(auto, false) then now() end)
    on conflict (session_id, tagged_id) do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Owner: stop sharing the game with one buddy.
create or replace function public.untag_buddy_in_game(p_session_id uuid, p_player uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.game_tags t where t.session_id = p_session_id and t.owner_id = auth.uid() and t.tagged_id = p_player
$$;

-- Tagged buddy: accept or decline; "always" also trusts this buddy for future games.
create or replace function public.respond_game_tag(p_id uuid, p_accept boolean, p_always boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  t public.game_tags;
begin
  select * into t from public.game_tags where id = p_id and tagged_id = me;
  if not found then raise exception 'game shares: request not found' using errcode = 'P0002'; end if;
  update public.game_tags set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
   where id = p_id;
  if p_accept and p_always then
    insert into public.game_tag_trust (player_id, trusted_id) values (me, t.owner_id) on conflict do nothing;
  end if;
end $$;

-- Tagged buddy: remove an accepted game from their Sessions.
create or replace function public.hide_shared_game(p_session_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.game_tags set status = 'declined', responded_at = now()
   where session_id = p_session_id and tagged_id = auth.uid()
$$;

-- Tagged buddy: start being asked again for everyone.
create or replace function public.clear_game_tag_trust() returns void
language sql security definer set search_path = '' as $$
  delete from public.game_tag_trust where player_id = auth.uid()
$$;

-- Games waiting for the caller's answer, and games they accepted.
create or replace function public.my_game_shares()
returns table (id uuid, session_id uuid, status text, owner_id uuid, owner_name text, title text, session_date date,
               session_context text, play_format text, match_result text, match_score text, has_video boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'game shares: sign in first' using errcode = '42501'; end if;
  return query
  select t.id, s.id, t.status, s.owner_id, o.display_name, s.title, s.session_date, s.session_context, s.play_format,
         s.match_result, s.match_score,
         exists (select 1 from public.video_assets v where v.session_id = s.id and v.upload_status = 'uploaded'),
         t.created_at
  from public.game_tags t
  join public.sessions s on s.id = t.session_id
  join public.profiles o on o.id = t.owner_id
  where t.tagged_id = me and t.status in ('pending', 'accepted') and public.are_buddies(t.owner_id, me)
  order by s.session_date desc, t.created_at desc
  limit 200;
end $$;

-- What a tagged buddy sees: the game's name, date, format, score, named players,
-- the video analysis and the video's storage path. Not the owner's ratings or journal.
create or replace function public.shared_game(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  out jsonb;
begin
  if not public.game_tag_can_view(p_session_id) then
    raise exception 'game shares: this game is not shared with you' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'session', jsonb_build_object('id', s.id, 'title', s.title, 'session_date', s.session_date,
      'session_context', s.session_context, 'play_format', s.play_format, 'match_result', s.match_result,
      'match_score', s.match_score, 'owner_id', s.owner_id, 'owner_name', o.display_name),
    'players', coalesce((select jsonb_agg(jsonb_build_object('role', sp.role, 'display_name', sp.display_name))
                          from public.session_participants sp
                         where sp.session_id = s.id and sp.role in ('partner', 'opponent') and sp.display_name is not null), '[]'::jsonb),
    'result', (select r.result from public.video_assets v
                 join public.analysis_jobs j on j.video_asset_id = v.id
                 join public.analysis_results r on r.job_id = j.id
                where v.session_id = s.id limit 1),
    'video_path', (select v.storage_path from public.video_assets v
                    where v.session_id = s.id and v.upload_status = 'uploaded'
                      and v.raw_video_deleted_at is null and v.raw_video_deleting_at is null))
  into out
  from public.sessions s join public.profiles o on o.id = s.owner_id
  where s.id = p_session_id;
  return out;
end $$;

revoke all on function public.game_tag_can_view(uuid), public.game_tag_can_view_video(text),
  public.tag_buddies_in_game(uuid, uuid[]), public.untag_buddy_in_game(uuid, uuid),
  public.respond_game_tag(uuid, boolean, boolean), public.hide_shared_game(uuid), public.clear_game_tag_trust(),
  public.my_game_shares(), public.shared_game(uuid) from public, anon;
grant execute on function public.tag_buddies_in_game(uuid, uuid[]), public.untag_buddy_in_game(uuid, uuid),
  public.respond_game_tag(uuid, boolean, boolean), public.hide_shared_game(uuid), public.clear_game_tag_trust(),
  public.my_game_shares(), public.shared_game(uuid) to authenticated;
grant execute on function public.game_tag_can_view(uuid), public.game_tag_can_view_video(text) to authenticated;
