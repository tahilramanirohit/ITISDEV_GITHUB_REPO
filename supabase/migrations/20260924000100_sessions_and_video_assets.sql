-- Sessions and private video assets.
--
-- Access model: every row belongs to exactly one auth user (owner_id). Players
-- can only see and change their own rows. Sharing with a buddy/coach is NOT
-- implemented here; it needs an explicit grant table and an adviser decision
-- (see docs/ADVISER_DECISIONS.md).

-- ── sessions ────────────────────────────────────────────────────────────────
create table public.sessions (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title             text not null check (char_length(btrim(title)) between 1 and 120),
  session_date      date not null default current_date,
  -- Gameplay context (paper §3.2.1 / §3.2.6).
  session_context   text not null check (session_context in ('practice', 'casual_match', 'tournament', 'leveling_game')),
  play_format       text not null check (play_format in ('singles', 'doubles', 'wall_practice', 'ball_machine', 'drill_other')),
  performance_scope text not null default 'individual' check (performance_scope in ('individual', 'pair')),
  notes             text check (char_length(notes) <= 2000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index sessions_owner_date_idx on public.sessions (owner_id, session_date desc, created_at desc);

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger sessions_touch_updated_at before update on public.sessions
  for each row execute function public.touch_updated_at();

alter table public.sessions enable row level security;

create policy sessions_select_own on public.sessions for select to authenticated
  using (owner_id = (select auth.uid()));
create policy sessions_insert_own on public.sessions for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy sessions_update_own on public.sessions for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy sessions_delete_own on public.sessions for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ── video_assets ────────────────────────────────────────────────────────────
-- Storage path convention: <owner_id>/<session_id>/<video_id>.<ext>
-- One video per session for this milestone.
create table public.video_assets (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id        uuid not null unique references public.sessions (id) on delete cascade,
  storage_bucket    text not null default 'session-videos' check (storage_bucket = 'session-videos'),
  storage_path      text not null unique,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  mime_type         text not null check (mime_type in ('video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo')),
  -- 500 MiB, matching the bucket limit below. The hosted project's global
  -- upload limit may be lower (50 MB on the Free plan).
  byte_size         bigint not null check (byte_size > 0 and byte_size <= 524288000),
  upload_status     text not null default 'pending' check (upload_status in ('pending', 'uploaded')),
  created_at        timestamptz not null default now(),
  uploaded_at       timestamptz,
  constraint video_assets_path_convention check (
    split_part(storage_path, '/', 1) = owner_id::text
    and split_part(storage_path, '/', 2) = session_id::text
    and split_part(storage_path, '/', 3) like id::text || '.%'
    and split_part(storage_path, '/', 4) = ''
  )
);

create index video_assets_owner_idx on public.video_assets (owner_id);

alter table public.video_assets enable row level security;

create policy video_assets_select_own on public.video_assets for select to authenticated
  using (owner_id = (select auth.uid()));
-- A player registers an upload for one of their own sessions. upload_status
-- can only move to 'uploaded' through finalize_video_upload(), which checks
-- that the object really exists in storage.
create policy video_assets_insert_own on public.video_assets for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and upload_status = 'pending'
    and exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = (select auth.uid()))
  );
create policy video_assets_delete_own on public.video_assets for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ── Table privileges (defence in depth on top of RLS) ───────────────────────
revoke all on public.sessions, public.video_assets from anon;
revoke all on public.sessions, public.video_assets from authenticated;
grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, delete on public.video_assets to authenticated;
grant all on public.sessions, public.video_assets to service_role;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

-- ── Private storage bucket ──────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('session-videos', 'session-videos', false, 524288000,
        array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Uploads are only accepted into the caller's own folder AND for a registered,
-- still-pending video asset at exactly that path.
create policy session_videos_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'session-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.video_assets v
      where v.storage_path = name and v.owner_id = (select auth.uid()) and v.upload_status = 'pending'
    )
  );
create policy session_videos_select_own on storage.objects for select to authenticated
  using (bucket_id = 'session-videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy session_videos_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'session-videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
