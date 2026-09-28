-- One-off upgrade for the ITISDEV Supabase project (qycgafvyyjdgokfqclei).
--
-- That project already had a smaller `sessions` table
-- (id, owner_id, title, session_date, notes, created_at) and none of the
-- video/job/result tables, so the normal migrations fail with "already exists".
-- This script brings it to the same state as the three files in
-- supabase/migrations/ WITHOUT deleting any table or row:
--
--   * adds the missing sessions columns with defaults (existing rows become
--     practice / singles / individual sessions);
--   * creates the missing tables, functions, policies and storage bucket;
--   * replaces only policies with the names used in the migrations.
--
-- Safe to run more than once. Paste it into the SQL editor and run it as a whole.

begin;

-- ── sessions: add what the app needs ────────────────────────────────────────
alter table public.sessions alter column owner_id set default auth.uid();
alter table public.sessions alter column id set default gen_random_uuid();
alter table public.sessions alter column session_date set default current_date;
alter table public.sessions add column if not exists session_context text not null default 'practice';
alter table public.sessions add column if not exists play_format text not null default 'singles';
alter table public.sessions add column if not exists performance_scope text not null default 'individual';
alter table public.sessions add column if not exists updated_at timestamptz not null default now();
alter table public.sessions alter column session_context drop default;
alter table public.sessions alter column play_format drop default;

do $$
begin
  -- Rows without an owner are invisible to every player under RLS; they are
  -- left alone (and reported below) rather than deleted.
  if not exists (select 1 from public.sessions where owner_id is null) then
    alter table public.sessions alter column owner_id set not null;
  else
    raise notice 'sessions has rows without owner_id; owner_id left nullable. Review them.';
  end if;
  -- NOT VALID: enforced for new rows without failing on any existing orphan rows.
  if not exists (select 1 from pg_constraint where contype = 'f' and conrelid = 'public.sessions'::regclass
                   and confrelid = 'auth.users'::regclass) then
    alter table public.sessions add constraint sessions_owner_id_fkey
      foreign key (owner_id) references auth.users (id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sessions_session_context_check') then
    alter table public.sessions add constraint sessions_session_context_check
      check (session_context in ('practice', 'casual_match', 'tournament', 'leveling_game'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sessions_play_format_check') then
    alter table public.sessions add constraint sessions_play_format_check
      check (play_format in ('singles', 'doubles', 'wall_practice', 'ball_machine', 'drill_other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sessions_performance_scope_check') then
    alter table public.sessions add constraint sessions_performance_scope_check
      check (performance_scope in ('individual', 'pair'));
  end if;
end $$;

create index if not exists sessions_owner_date_idx on public.sessions (owner_id, session_date desc, created_at desc);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists sessions_touch_updated_at on public.sessions;
create trigger sessions_touch_updated_at before update on public.sessions
  for each row execute function public.touch_updated_at();

alter table public.sessions enable row level security;
-- Policies are OR-ed together, so any older policy (for example "Enable read
-- access for all users") would let players read each other's sessions. Remove
-- every sessions policy that is not one of the four below, naming each one.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'sessions'
              and policyname not in ('sessions_select_own', 'sessions_insert_own', 'sessions_update_own', 'sessions_delete_own')
  loop
    raise notice 'Dropping older sessions policy: %', p.policyname;
    execute format('drop policy %I on public.sessions', p.policyname);
  end loop;
end $$;
drop policy if exists sessions_select_own on public.sessions;
drop policy if exists sessions_insert_own on public.sessions;
drop policy if exists sessions_update_own on public.sessions;
drop policy if exists sessions_delete_own on public.sessions;
create policy sessions_select_own on public.sessions for select to authenticated
  using (owner_id = (select auth.uid()));
create policy sessions_insert_own on public.sessions for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy sessions_update_own on public.sessions for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy sessions_delete_own on public.sessions for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ── video_assets ────────────────────────────────────────────────────────────
create table if not exists public.video_assets (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id        uuid not null unique references public.sessions (id) on delete cascade,
  storage_bucket    text not null default 'session-videos' check (storage_bucket = 'session-videos'),
  storage_path      text not null unique,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  mime_type         text not null check (mime_type in ('video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo')),
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
create index if not exists video_assets_owner_idx on public.video_assets (owner_id);
alter table public.video_assets enable row level security;
drop policy if exists video_assets_select_own on public.video_assets;
drop policy if exists video_assets_insert_own on public.video_assets;
drop policy if exists video_assets_delete_own on public.video_assets;
create policy video_assets_select_own on public.video_assets for select to authenticated
  using (owner_id = (select auth.uid()));
create policy video_assets_insert_own on public.video_assets for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and upload_status = 'pending'
    and exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = (select auth.uid()))
  );
create policy video_assets_delete_own on public.video_assets for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.sessions, public.video_assets from anon;
revoke all on public.sessions, public.video_assets from authenticated;
grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, delete on public.video_assets to authenticated;
grant all on public.sessions, public.video_assets to service_role;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

-- ── private storage bucket ──────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('session-videos', 'session-videos', false, 524288000,
        array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists session_videos_insert_own on storage.objects;
drop policy if exists session_videos_select_own on storage.objects;
drop policy if exists session_videos_delete_own on storage.objects;
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

-- ── analysis_jobs / analysis_results ────────────────────────────────────────
create table if not exists public.analysis_jobs (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  video_asset_id   uuid not null unique references public.video_assets (id) on delete cascade,
  session_id       uuid not null references public.sessions (id) on delete cascade,
  status           text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  params           jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  attempts         int not null default 0 check (attempts >= 0),
  max_attempts     int not null default 3 check (max_attempts between 1 and 10),
  available_at     timestamptz not null default now(),
  locked_by        text,
  lease_expires_at timestamptz,
  error_code       text,
  error_message    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz
);
create index if not exists analysis_jobs_claimable_idx on public.analysis_jobs (available_at, created_at)
  where status in ('queued', 'processing');
create index if not exists analysis_jobs_owner_idx on public.analysis_jobs (owner_id);

create table if not exists public.analysis_results (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null unique references public.analysis_jobs (id) on delete cascade,
  owner_id            uuid not null references auth.users (id) on delete cascade,
  session_id          uuid not null references public.sessions (id) on delete cascade,
  video_asset_id      uuid not null references public.video_assets (id) on delete cascade,
  schema_version      text not null,
  result_status       text not null check (result_status in ('ok', 'insufficient_data')),
  data_origin         text not null check (data_origin in ('measured', 'test_fixture')),
  pipeline_version    text not null,
  analyzed_duration_s double precision,
  video_duration_s    double precision,
  fraction_analyzed   double precision,
  result              jsonb not null,
  created_at          timestamptz not null default now()
);
create index if not exists analysis_results_owner_idx on public.analysis_results (owner_id, created_at desc);

alter table public.analysis_jobs enable row level security;
alter table public.analysis_results enable row level security;
drop policy if exists analysis_jobs_select_own on public.analysis_jobs;
drop policy if exists analysis_results_select_own on public.analysis_results;
create policy analysis_jobs_select_own on public.analysis_jobs for select to authenticated
  using (owner_id = (select auth.uid()));
create policy analysis_results_select_own on public.analysis_results for select to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.analysis_jobs, public.analysis_results from anon, authenticated;
grant select on public.analysis_jobs, public.analysis_results to authenticated;
grant all on public.analysis_jobs, public.analysis_results to service_role;

create or replace function public.finalize_video_upload(p_video_id uuid, p_params jsonb default '{}'::jsonb)
returns public.analysis_jobs
language plpgsql security definer set search_path = '' as $$
declare
  v public.video_assets;
  j public.analysis_jobs;
  obj_size bigint;
begin
  if p_params is null or jsonb_typeof(p_params) <> 'object' then
    raise exception 'invalid_params' using errcode = '22023';
  end if;
  select * into v from public.video_assets
   where id = p_video_id and owner_id = auth.uid()
   for update;
  if not found then
    raise exception 'video_not_found' using errcode = 'P0002';
  end if;
  if v.upload_status = 'pending' then
    select (o.metadata ->> 'size')::bigint into obj_size
      from storage.objects o
     where o.bucket_id = v.storage_bucket and o.name = v.storage_path;
    if not found then
      raise exception 'upload_incomplete' using errcode = 'P0001',
        hint = 'The file has not finished uploading to storage.';
    end if;
    update public.video_assets
       set upload_status = 'uploaded', uploaded_at = now(), byte_size = coalesce(obj_size, byte_size)
     where id = v.id;
  end if;
  insert into public.analysis_jobs (owner_id, video_asset_id, session_id, params)
  values (v.owner_id, v.id, v.session_id, p_params)
  on conflict (video_asset_id) do nothing;
  select * into j from public.analysis_jobs where video_asset_id = v.id;
  return j;
end $$;

create or replace function public.request_reanalysis(p_job_id uuid, p_params jsonb default null)
returns public.analysis_jobs
language plpgsql security definer set search_path = '' as $$
declare
  j public.analysis_jobs;
begin
  if p_params is not null and jsonb_typeof(p_params) <> 'object' then
    raise exception 'invalid_params' using errcode = '22023';
  end if;
  select * into j from public.analysis_jobs
   where id = p_job_id and owner_id = auth.uid()
   for update;
  if not found then
    raise exception 'job_not_found' using errcode = 'P0002';
  end if;
  if j.status not in ('completed', 'failed') then
    raise exception 'job_not_finished' using errcode = 'P0001', hint = 'Wait for the current run to finish.';
  end if;
  delete from public.analysis_results where job_id = j.id;
  update public.analysis_jobs
     set status = 'queued', attempts = 0, available_at = now(), params = coalesce(p_params, params),
         error_code = null, error_message = null, locked_by = null, lease_expires_at = null,
         started_at = null, finished_at = null, updated_at = now()
   where id = j.id
  returning * into j;
  return j;
end $$;

create or replace function public.claim_analysis_job(p_worker_id text, p_lease_seconds int default 300)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  j public.analysis_jobs;
  v public.video_assets;
begin
  update public.analysis_jobs
     set status = 'failed', locked_by = null, lease_expires_at = null, finished_at = now(), updated_at = now(),
         error_code = 'lease_expired', error_message = 'The worker stopped responding on the final attempt.'
   where status = 'processing' and lease_expires_at < now() and attempts >= max_attempts;
  select * into j from public.analysis_jobs
   where (status = 'queued' and available_at <= now())
      or (status = 'processing' and lease_expires_at < now())
   order by available_at, created_at
   for update skip locked
   limit 1;
  if not found then
    return null;
  end if;
  update public.analysis_jobs
     set status = 'processing', locked_by = p_worker_id, attempts = attempts + 1,
         lease_expires_at = now() + make_interval(secs => greatest(p_lease_seconds, 30)),
         started_at = coalesce(started_at, now()), updated_at = now()
   where id = j.id
  returning * into j;
  select * into v from public.video_assets where id = j.video_asset_id;
  return jsonb_build_object(
    'id', j.id, 'owner_id', j.owner_id, 'video_asset_id', j.video_asset_id, 'session_id', j.session_id,
    'storage_bucket', v.storage_bucket, 'storage_path', v.storage_path, 'original_filename', v.original_filename,
    'attempts', j.attempts, 'max_attempts', j.max_attempts, 'params', j.params);
end $$;

create or replace function public.heartbeat_analysis_job(p_job_id uuid, p_worker_id text, p_lease_seconds int default 300)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.analysis_jobs
     set lease_expires_at = now() + make_interval(secs => greatest(p_lease_seconds, 30)), updated_at = now()
   where id = p_job_id and status = 'processing' and locked_by = p_worker_id and lease_expires_at >= now();
  return found;
end $$;

create or replace function public._lock_held_job(p_job_id uuid, p_worker_id text)
returns public.analysis_jobs
language plpgsql security definer set search_path = '' as $$
declare
  j public.analysis_jobs;
begin
  select * into j from public.analysis_jobs where id = p_job_id for update;
  if not found or j.status <> 'processing' or j.locked_by is distinct from p_worker_id
     or j.lease_expires_at < now() then
    raise exception 'lease_lost' using errcode = 'P0001';
  end if;
  return j;
end $$;

create or replace function public.complete_analysis_job(p_job_id uuid, p_worker_id text, p_result jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  j public.analysis_jobs;
begin
  j := public._lock_held_job(p_job_id, p_worker_id);
  if p_result ->> 'schema_version' is null
     or coalesce(p_result ->> 'status', '') not in ('ok', 'insufficient_data')
     or coalesce(p_result ->> 'data_origin', '') not in ('measured', 'test_fixture')
     or p_result #>> '{provenance,pipeline_version}' is null then
    raise exception 'invalid_result' using errcode = '22023';
  end if;
  insert into public.analysis_results (
    job_id, owner_id, session_id, video_asset_id, schema_version, result_status, data_origin,
    pipeline_version, analyzed_duration_s, video_duration_s, fraction_analyzed, result)
  values (
    j.id, j.owner_id, j.session_id, j.video_asset_id, p_result ->> 'schema_version', p_result ->> 'status',
    p_result ->> 'data_origin', p_result #>> '{provenance,pipeline_version}',
    (p_result #>> '{coverage,analyzed_duration_s}')::double precision,
    (p_result #>> '{video,container_duration_s}')::double precision,
    (p_result #>> '{coverage,fraction_of_video_analyzed}')::double precision,
    p_result)
  on conflict (job_id) do update set
    schema_version = excluded.schema_version, result_status = excluded.result_status,
    data_origin = excluded.data_origin, pipeline_version = excluded.pipeline_version,
    analyzed_duration_s = excluded.analyzed_duration_s, video_duration_s = excluded.video_duration_s,
    fraction_analyzed = excluded.fraction_analyzed, result = excluded.result, created_at = now();
  update public.analysis_jobs
     set status = 'completed', locked_by = null, lease_expires_at = null, error_code = null,
         error_message = null, finished_at = now(), updated_at = now()
   where id = j.id;
end $$;

create or replace function public.fail_analysis_job(p_job_id uuid, p_worker_id text, p_error_code text,
                                                    p_error_message text, p_retryable boolean)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  j public.analysis_jobs;
  new_status text;
begin
  j := public._lock_held_job(p_job_id, p_worker_id);
  new_status := case when p_retryable and j.attempts < j.max_attempts then 'queued' else 'failed' end;
  update public.analysis_jobs
     set status = new_status, locked_by = null, lease_expires_at = null,
         error_code = left(p_error_code, 64), error_message = left(p_error_message, 2000),
         available_at = case when new_status = 'queued'
                             then now() + make_interval(secs => 30 * power(2, greatest(j.attempts - 1, 0)))
                             else available_at end,
         finished_at = case when new_status = 'failed' then now() else null end,
         updated_at = now()
   where id = j.id;
  return new_status;
end $$;

revoke all on function public.finalize_video_upload(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.request_reanalysis(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.claim_analysis_job(text, int) from public, anon, authenticated;
revoke all on function public.heartbeat_analysis_job(uuid, text, int) from public, anon, authenticated;
revoke all on function public._lock_held_job(uuid, text) from public, anon, authenticated;
revoke all on function public.complete_analysis_job(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_analysis_job(uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.finalize_video_upload(uuid, jsonb) to authenticated;
grant execute on function public.request_reanalysis(uuid, jsonb) to authenticated;
grant execute on function public.claim_analysis_job(text, int) to service_role;
grant execute on function public.heartbeat_analysis_job(uuid, text, int) to service_role;
grant execute on function public.complete_analysis_job(uuid, text, jsonb) to service_role;
grant execute on function public.fail_analysis_job(uuid, text, text, text, boolean) to service_role;

-- seed_dev_mock_data() from 20260928000100_dev_mock_data.sql is already on this
-- project; it starts working once the tables above exist.

-- Refresh the API so the new tables and functions are visible immediately.
notify pgrst, 'reload schema';

commit;

-- Check: all four tables exist, the dev-mock function exists, and sessions has
-- only the four owner-only policies.
select
  (select count(*) from information_schema.tables where table_schema = 'public'
     and table_name in ('sessions', 'video_assets', 'analysis_jobs', 'analysis_results')) as app_tables_of_4,
  exists (select 1 from pg_proc where proname = 'seed_dev_mock_data') as dev_mock_function,
  (select string_agg(policyname, ', ') from pg_policies where schemaname = 'public' and tablename = 'sessions') as sessions_policies;
