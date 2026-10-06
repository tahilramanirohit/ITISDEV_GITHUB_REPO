-- Adviser notes (6 Oct 2026): default settings, tournament and solo sessions,
-- named players, and limits on video uploads. Safe to run more than once.

-- ── Default settings for new sessions ────────────────────────────────────
alter table public.profiles
  add column if not exists default_review_mode text check (default_review_mode in ('self', 'video')),
  add column if not exists default_session_kind text check (default_session_kind in ('solo', 'match', 'tournament')),
  add column if not exists default_play_format text
    check (default_play_format in ('singles', 'doubles', 'wall_practice', 'ball_machine', 'drill_other'));

-- ── Tournament details ───────────────────────────────────────────────────
alter table public.sessions
  add column if not exists tournament_name text check (char_length(btrim(tournament_name)) between 1 and 120),
  add column if not exists tournament_round text check (char_length(btrim(tournament_round)) between 1 and 60),
  add column if not exists match_result text check (match_result in ('win', 'loss')),
  add column if not exists match_score text check (char_length(btrim(match_score)) between 1 and 40);

-- ── Named partners and opponents ─────────────────────────────────────────
-- Other players are names typed by the session owner; they are not linked
-- to accounts and are visible only to the owner.
alter table public.session_participants
  add column if not exists display_name text check (char_length(btrim(display_name)) between 1 and 80);

drop policy if exists participants_owner_manage on public.session_participants;
create policy participants_owner_manage on public.session_participants for all to authenticated
  using (role in ('partner', 'opponent') and player_id is null
    and exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = (select auth.uid())))
  with check (role in ('partner', 'opponent') and player_id is null and link_status = 'anonymous'
    and exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = (select auth.uid())));
grant insert, update, delete on public.session_participants to authenticated;

-- ── Video upload limits ──────────────────────────────────────────────────
-- One place for the limits; the web app reads them with rpc('video_upload_limits').
create or replace function public.video_upload_limits() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'max_file_bytes', 50000000,        -- 50 MB per video (matches the storage bucket)
    'min_duration_s', 10,              -- long enough to see a rally
    'max_duration_s', 300,             -- 5 minutes per clip
    'max_total_bytes', 1000000000,     -- 1 GB of stored raw video per player
    'max_uploads_per_day', 5)
$$;
grant execute on function public.video_upload_limits() to authenticated;

alter table public.video_assets
  add column if not exists duration_s numeric(7,2) check (duration_s > 0);

create or replace function public.enforce_video_upload_limits() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  lim jsonb := public.video_upload_limits();
  used bigint;
  today int;
begin
  if new.byte_size > (lim->>'max_file_bytes')::bigint then
    raise exception 'video_too_large' using errcode = '22023';
  end if;
  -- Older web builds do not send a duration; the limit applies when it is known.
  if new.duration_s is not null and (new.duration_s < (lim->>'min_duration_s')::numeric
      or new.duration_s > (lim->>'max_duration_s')::numeric) then
    raise exception 'video_duration_out_of_range' using errcode = '22023';
  end if;
  select coalesce(sum(v.byte_size), 0), count(*) filter (where v.created_at > now() - interval '1 day')
    into used, today
    from public.video_assets v
    where v.owner_id = new.owner_id and v.raw_video_deleted_at is null;
  if used + new.byte_size > (lim->>'max_total_bytes')::bigint then
    raise exception 'video_storage_quota_exceeded' using errcode = '22023';
  end if;
  if today >= (lim->>'max_uploads_per_day')::int then
    raise exception 'video_daily_limit_reached' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function public.enforce_video_upload_limits() from public, anon, authenticated;
drop trigger if exists video_asset_upload_limits on public.video_assets;
create trigger video_asset_upload_limits before insert on public.video_assets
  for each row execute function public.enforce_video_upload_limits();
