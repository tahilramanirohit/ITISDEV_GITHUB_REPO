-- PicklePro `cleanversion` branch, update 15 (10 Nov 2026): one video per buddy game.
-- The player who asked to play uploads; the other player adds that video with one tap.
-- Paste the whole file into Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Run AFTER pickleproapp_upgrade_14.sql. Safe to run more than once.
-- Same content as supabase/migrations/20261112090000_buddy_session_video.sql.

-- One video per buddy game (adviser notes, 10 Nov 2026).
--
-- When two buddies played a buddy session and each logged it (sessions.buddy_request_id),
-- only the player who asked to play uploads the video. The other player adds that same
-- video to their own session with one tap: the file is copied into their folder and
-- analysed for them, so they get their own report without uploading.
-- The uploader can turn this off per video ("Let Kirk use this video", on by default).
--
-- * video_assets.copied_from: the video a copy was made from.
-- * video_assets.buddy_can_use: the uploader lets the other player add it (default true).
-- * The other player (the one who was asked) cannot upload to a buddy-session game;
--   they add the asker's video instead.
-- * buddy_session_video(session): who uploads, and whether a video is ready to add.
-- * add_buddy_session_video(session): registers the copy; the app then copies the file
--   in Storage and finalises it like an upload.
-- * set_buddy_can_use(video, allowed): the uploader's switch.
--
-- Safe to run more than once.

alter table public.video_assets add column if not exists copied_from uuid references public.video_assets (id) on delete set null;
alter table public.video_assets add column if not exists buddy_can_use boolean not null default true;

-- The buddy session a game was logged from, and the caller's side of it.
create or replace function public.buddy_game_link(p_session_id uuid)
returns table (request_id uuid, asker uuid, asked uuid, owner_id uuid)
language sql stable security definer set search_path = '' as $$
  select r.id, r.from_player_id, r.to_player_id, s.owner_id
  from public.sessions s join public.buddy_requests r on r.id = s.buddy_request_id
  where s.id = p_session_id and s.owner_id in (r.from_player_id, r.to_player_id)
$$;
revoke all on function public.buddy_game_link(uuid) from public, anon, authenticated;

-- The asker's uploaded video of the same buddy game (the newest, if they logged it twice).
create or replace function public.buddy_game_source_video(p_session_id uuid) returns public.video_assets
language sql stable security definer set search_path = '' as $$
  select v.* from public.buddy_game_link(p_session_id) l
  join public.sessions s2 on s2.buddy_request_id = l.request_id and s2.owner_id = l.asker
  join public.video_assets v on v.session_id = s2.id
  where l.owner_id = l.asked and v.upload_status = 'uploaded' and v.raw_video_deleted_at is null
    and v.raw_video_deleting_at is null and v.copied_from is null
  order by v.uploaded_at desc nulls last
  limit 1
$$;
revoke all on function public.buddy_game_source_video(uuid) from public, anon, authenticated;

-- The player who was asked uploads nothing to a buddy game: they add the asker's video.
create or replace function public.buddy_game_upload_rule() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.copied_from is null and exists (select 1 from public.buddy_game_link(new.session_id) l where l.owner_id = l.asked) then
    raise exception 'buddy_game_video_from_asker' using errcode = '42501',
      hint = 'In a buddy game, the player who asked to play uploads the video; the other player adds it.';
  end if;
  return new;
end $$;
revoke all on function public.buddy_game_upload_rule() from public, anon, authenticated;
drop trigger if exists video_asset_buddy_game_rule on public.video_assets;
create trigger video_asset_buddy_game_rule before insert on public.video_assets
  for each row execute function public.buddy_game_upload_rule();

-- What the session page needs: { role: 'asker' | 'asked' | null, other_name,
--   video: { id, original_filename, byte_size, duration_s } | null, allowed, my_video_allowed }.
create or replace function public.buddy_session_video(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  l record;
  src public.video_assets;
  mine public.video_assets;
begin
  if me is null then raise exception 'buddy: sign in first' using errcode = '42501'; end if;
  if not exists (select 1 from public.sessions s where s.id = p_session_id and s.owner_id = me) then
    raise exception 'buddy: this is not your session' using errcode = '42501';
  end if;
  select * into l from public.buddy_game_link(p_session_id);
  if not found then return jsonb_build_object('role', null); end if;
  select * into mine from public.video_assets v where v.session_id = p_session_id;
  if l.owner_id = l.asker then
    return jsonb_build_object('role', 'asker',
      'other_name', (select p.display_name from public.profiles p where p.id = l.asked),
      'my_video_allowed', mine.buddy_can_use);
  end if;
  src := public.buddy_game_source_video(p_session_id);
  return jsonb_build_object('role', 'asked',
    'other_name', (select p.display_name from public.profiles p where p.id = l.asker),
    'video', case when src.id is null then null else jsonb_build_object('id', src.id, 'original_filename', src.original_filename,
      'byte_size', src.byte_size, 'duration_s', src.duration_s) end,
    'allowed', coalesce(src.buddy_can_use, false));
end $$;

-- Register the copy in the caller's folder. Returns the new video row and the file to copy.
create or replace function public.add_buddy_session_video(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  src public.video_assets;
  new_id uuid := gen_random_uuid();
  ext text;
  row_ public.video_assets;
begin
  if me is null then raise exception 'buddy: sign in first' using errcode = '42501'; end if;
  if not exists (select 1 from public.sessions s where s.id = p_session_id and s.owner_id = me) then
    raise exception 'buddy: this is not your session' using errcode = '42501';
  end if;
  if not exists (select 1 from public.buddy_game_link(p_session_id) l where l.owner_id = l.asked) then
    raise exception 'buddy: only the player who was asked can add the other player''s video' using errcode = '42501';
  end if;
  if exists (select 1 from public.video_assets v where v.session_id = p_session_id) then
    raise exception 'buddy: this session already has a video' using errcode = '23505';
  end if;
  src := public.buddy_game_source_video(p_session_id);
  if src.id is null then
    raise exception 'buddy: there is no video of this game to add yet' using errcode = 'P0002';
  end if;
  if not src.buddy_can_use then
    raise exception 'buddy: the other player turned off sharing this video' using errcode = '42501';
  end if;
  ext := coalesce(nullif(substring(src.storage_path from '\.([A-Za-z0-9]+)$'), ''), 'mp4');
  insert into public.video_assets (id, owner_id, session_id, storage_path, original_filename, mime_type, byte_size, duration_s, copied_from)
  values (new_id, me, p_session_id, me::text || '/' || p_session_id::text || '/' || new_id::text || '.' || ext,
          src.original_filename, src.mime_type, src.byte_size, src.duration_s, src.id)
  returning * into row_;
  return jsonb_build_object('video', to_jsonb(row_), 'source_path', src.storage_path);
end $$;

-- The uploader's switch: let the other player add this video, or not.
create or replace function public.set_buddy_can_use(p_video_id uuid, p_allowed boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.video_assets set buddy_can_use = coalesce(p_allowed, true)
   where id = p_video_id and owner_id = auth.uid();
  if not found then raise exception 'buddy: video not found' using errcode = 'P0002'; end if;
end $$;

-- The asked player may read (and so copy) the asker's video of their buddy game while it is allowed.
create or replace function public.buddy_can_copy_video(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.video_assets v
    join public.sessions s on s.id = v.session_id
    join public.buddy_requests r on r.id = s.buddy_request_id
    where v.storage_path = p_name and v.upload_status = 'uploaded' and v.raw_video_deleted_at is null
      and v.buddy_can_use and v.copied_from is null
      and v.owner_id = r.from_player_id and r.to_player_id = auth.uid()
      and exists (select 1 from public.sessions mine where mine.owner_id = auth.uid() and mine.buddy_request_id = r.id))
$$;
drop policy if exists session_videos_select_buddy_game on storage.objects;
create policy session_videos_select_buddy_game on storage.objects for select to authenticated
  using (bucket_id = 'session-videos' and public.buddy_can_copy_video(name));

revoke all on function public.buddy_session_video(uuid), public.add_buddy_session_video(uuid),
  public.set_buddy_can_use(uuid, boolean), public.buddy_can_copy_video(text) from public, anon;
grant execute on function public.buddy_session_video(uuid), public.add_buddy_session_video(uuid),
  public.set_buddy_can_use(uuid, boolean), public.buddy_can_copy_video(text) to authenticated;
