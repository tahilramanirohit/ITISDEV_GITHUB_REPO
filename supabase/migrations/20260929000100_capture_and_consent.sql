-- Private participant capture and an uploader attestation before video upload.
-- Sharing these records is deliberately not granted by report access.
alter table public.sessions drop constraint sessions_session_context_check;
alter table public.sessions add constraint sessions_session_context_check
  check (session_context in ('practice', 'casual_match', 'tournament', 'leveling_game', 'drill'));

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  dominant_hand text check (dominant_hand in ('right', 'left', 'ambidextrous')),
  years_playing numeric(4,1) check (years_playing between 0 and 99),
  usual_format text check (usual_format in ('singles', 'doubles', 'both')),
  self_level text check (char_length(btrim(self_level)) between 1 and 40),
  is_adult_confirmed boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();
alter table public.profiles enable row level security;
create policy profiles_self on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke all on public.profiles from anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- Logging-only formats cannot acquire a video or enter the CV queue through
-- direct API calls, even if a client bypasses the upload screen.
create function public.require_court_video_format() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.sessions s where s.id = new.session_id
    and s.play_format in ('wall_practice', 'ball_machine')) then
    raise exception 'logging_only_format' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger video_asset_court_format before insert or update of session_id on public.video_assets
  for each row execute function public.require_court_video_format();
create trigger analysis_job_court_format before insert or update of status on public.analysis_jobs
  for each row execute function public.require_court_video_format();
revoke all on function public.require_court_video_format() from public, anon, authenticated;

alter table public.sessions
  add column actual_start_at timestamptz,
  add column actual_end_at timestamptz,
  add constraint sessions_actual_times_check
    check (actual_end_at is null or actual_start_at is null or actual_end_at > actual_start_at);

create table public.session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  player_id uuid references auth.users(id) on delete set null,
  role text not null check (role in ('uploader', 'partner', 'opponent')),
  link_status text not null default 'anonymous' check (link_status in ('anonymous', 'accepted')),
  created_at timestamptz not null default now(),
  unique (session_id, player_id),
  check ((player_id is null and link_status = 'anonymous') or player_id is not null)
);

create function public.add_uploader_participant() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.session_participants(session_id, player_id, role, link_status)
  values (new.id, new.owner_id, 'uploader', 'accepted');
  return new;
end $$;
create trigger session_uploader_participant after insert on public.sessions
  for each row execute function public.add_uploader_participant();
insert into public.session_participants(session_id, player_id, role, link_status)
select s.id, s.owner_id, 'uploader', 'accepted' from public.sessions s
where not exists (select 1 from public.session_participants p where p.session_id = s.id and p.player_id = s.owner_id);

create table public.checkins (
  participant_id uuid primary key references public.session_participants(id) on delete cascade,
  captured_at timestamptz not null default now(),
  warmup_done boolean,
  sleep_hours numeric(4,1) check (sleep_hours between 0 and 24),
  readiness smallint check (readiness between 1 and 5),
  focus text check (char_length(focus) <= 500),
  timing_status text not null default 'unverified' check (timing_status in ('pre_game', 'retrospective', 'unverified'))
);
create function public.set_checkin_timing() returns trigger
language plpgsql security definer set search_path = '' as $$
declare start_time timestamptz;
begin
  if tg_op = 'INSERT' then
    new.captured_at := now();
  elsif row(new.warmup_done, new.sleep_hours, new.readiness, new.focus)
      is distinct from row(old.warmup_done, old.sleep_hours, old.readiness, old.focus) then
    -- A changed answer is a new capture. A reclassification caused only by
    -- correcting actual_start_at must retain the original capture time.
    new.captured_at := now();
  else
    new.captured_at := old.captured_at;
  end if;
  select s.actual_start_at into start_time from public.session_participants p
  join public.sessions s on s.id = p.session_id where p.id = new.participant_id;
  new.timing_status := case when start_time is null then 'unverified'
    when new.captured_at < start_time then 'pre_game' else 'retrospective' end;
  return new;
end $$;
create trigger checkin_timing before insert or update on public.checkins
  for each row execute function public.set_checkin_timing();
create function public.refresh_checkin_timing() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.actual_start_at is distinct from old.actual_start_at then
    update public.checkins c set timing_status = case
      when new.actual_start_at is null then 'unverified'
      when c.captured_at < new.actual_start_at then 'pre_game'
      else 'retrospective' end
    from public.session_participants p
    where p.id = c.participant_id and p.session_id = new.id;
  end if;
  return new;
end $$;
create trigger session_start_retimes_checkins after update of actual_start_at on public.sessions
  for each row execute function public.refresh_checkin_timing();

create table public.recovery_logs (
  participant_id uuid primary key references public.session_participants(id) on delete cascade,
  captured_at timestamptz not null default now(),
  exertion smallint check (exertion between 1 and 10),
  soreness smallint check (soreness between 1 and 5),
  cooldown_done boolean
);
create table public.reflections (
  participant_id uuid primary key references public.session_participants(id) on delete cascade,
  captured_at timestamptz not null default now(),
  went_well text check (char_length(went_well) <= 2000),
  change_next text check (char_length(change_next) <= 2000)
);
create function public.stamp_capture_time() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.captured_at := now();
  else new.captured_at := old.captured_at; end if;
  return new;
end $$;
create trigger recovery_capture_time before insert or update on public.recovery_logs
  for each row execute function public.stamp_capture_time();
create trigger reflection_capture_time before insert or update on public.reflections
  for each row execute function public.stamp_capture_time();

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references auth.users(id) on delete cascade,
  policy_version text not null,
  accepted_at timestamptz not null default now(),
  scope text not null check (scope = 'recording_upload'),
  retention_days integer not null check (retention_days = 30)
);
create function public.stamp_consent_time() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.accepted_at := now();
  return new;
end $$;
create trigger consent_time before insert on public.consent_records
  for each row execute function public.stamp_consent_time();

alter table public.session_participants enable row level security;
alter table public.checkins enable row level security;
alter table public.recovery_logs enable row level security;
alter table public.reflections enable row level security;
alter table public.consent_records enable row level security;
create policy participants_self on public.session_participants for select to authenticated
  using (player_id = (select auth.uid()));
create policy checkins_self on public.checkins for all to authenticated
  using (exists (select 1 from public.session_participants p where p.id = participant_id and p.player_id = (select auth.uid())))
  with check (exists (select 1 from public.session_participants p where p.id = participant_id and p.player_id = (select auth.uid())));
create policy recovery_self on public.recovery_logs for all to authenticated
  using (exists (select 1 from public.session_participants p where p.id = participant_id and p.player_id = (select auth.uid())))
  with check (exists (select 1 from public.session_participants p where p.id = participant_id and p.player_id = (select auth.uid())));
create policy reflections_self on public.reflections for all to authenticated
  using (exists (select 1 from public.session_participants p where p.id = participant_id and p.player_id = (select auth.uid())))
  with check (exists (select 1 from public.session_participants p where p.id = participant_id and p.player_id = (select auth.uid())));
create policy consent_self on public.consent_records for select to authenticated
  using (player_id = (select auth.uid()));
create policy consent_insert_self on public.consent_records for insert to authenticated
  with check (player_id = (select auth.uid()) and policy_version = '2026-09-29-v4');

revoke all on public.session_participants, public.checkins, public.recovery_logs,
  public.reflections, public.consent_records from anon, authenticated;
grant select on public.session_participants to authenticated;
grant select, insert, update, delete on public.checkins, public.recovery_logs, public.reflections to authenticated;
grant select, insert on public.consent_records to authenticated;
grant all on public.session_participants, public.checkins, public.recovery_logs,
  public.reflections, public.consent_records to service_role;
revoke all on function public.add_uploader_participant() from public, anon, authenticated;
revoke all on function public.set_checkin_timing() from public, anon, authenticated;
revoke all on function public.refresh_checkin_timing() from public, anon, authenticated;
revoke all on function public.stamp_consent_time() from public, anon, authenticated;
revoke all on function public.stamp_capture_time() from public, anon, authenticated;

-- A browser cannot bypass the consent screen by uploading straight to Storage.
drop policy session_videos_insert_own on storage.objects;
create policy session_videos_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'session-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.video_assets v
      where v.storage_path = name and v.owner_id = (select auth.uid()) and v.upload_status = 'pending')
    and exists (select 1 from public.consent_records c
      where c.player_id = (select auth.uid()) and c.policy_version = '2026-09-29-v4')
  );

-- Preserve the last published report while reanalysis is queued or fails.
create or replace function public.request_reanalysis(p_job_id uuid, p_params jsonb default null)
returns public.analysis_jobs
language plpgsql security definer set search_path = '' as $$
declare j public.analysis_jobs;
begin
  if p_params is not null and jsonb_typeof(p_params) <> 'object' then
    raise exception 'invalid_params' using errcode = '22023';
  end if;
  select * into j from public.analysis_jobs
    where id = p_job_id and owner_id = auth.uid() for update;
  if not found then
    raise exception 'job_not_found' using errcode = 'P0002';
  end if;
  if j.status not in ('completed', 'failed') then
    raise exception 'job_not_finished' using errcode = 'P0001', hint = 'Wait for the current run to finish.';
  end if;
  update public.analysis_jobs
    set status = 'queued', attempts = 0, available_at = now(), params = coalesce(p_params, params),
        error_code = null, error_message = null, locked_by = null, lease_expires_at = null,
        started_at = null, finished_at = null, updated_at = now()
    where id = j.id returning * into j;
  return j;
end $$;
