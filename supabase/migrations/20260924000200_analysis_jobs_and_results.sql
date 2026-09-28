-- Analysis jobs (exactly one per uploaded video) and their results.
--
-- Players can read their jobs/results but cannot write them directly. They act
-- through two SECURITY DEFINER functions:
--   finalize_video_upload(video_id, params) → marks the upload complete, creates the job once
--   request_reanalysis(job_id, params)    → re-queues a finished/failed job
-- The worker uses the service role and four functions that implement a lease:
--   claim_analysis_job / heartbeat_analysis_job / complete_analysis_job / fail_analysis_job

create table public.analysis_jobs (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  video_asset_id   uuid not null unique references public.video_assets (id) on delete cascade,
  session_id       uuid not null references public.sessions (id) on delete cascade,
  status           text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  -- Optional analysis inputs: {"calibration": {...}, "selection": {...}, "experimental_zones": bool}
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

create index analysis_jobs_claimable_idx on public.analysis_jobs (available_at, created_at)
  where status in ('queued', 'processing');
create index analysis_jobs_owner_idx on public.analysis_jobs (owner_id);

create table public.analysis_results (
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

create index analysis_results_owner_idx on public.analysis_results (owner_id, created_at desc);

alter table public.analysis_jobs enable row level security;
alter table public.analysis_results enable row level security;

create policy analysis_jobs_select_own on public.analysis_jobs for select to authenticated
  using (owner_id = (select auth.uid()));
create policy analysis_results_select_own on public.analysis_results for select to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.analysis_jobs, public.analysis_results from anon, authenticated;
grant select on public.analysis_jobs, public.analysis_results to authenticated;
grant all on public.analysis_jobs, public.analysis_results to service_role;

-- ── Player-facing functions ────────────────────────────────────────────────

-- Idempotent: calling it twice (double click, retry after a network error, two
-- tabs) returns the same job. The row lock on the video serializes concurrent
-- calls and the unique index on analysis_jobs.video_asset_id backs it up.
-- p_params is only used when the job is first created; later calls return the
-- existing job unchanged (use request_reanalysis to change params).
create function public.finalize_video_upload(p_video_id uuid, p_params jsonb default '{}'::jsonb)
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

-- Re-run analysis (e.g. after adding calibration). Only for finished jobs; the
-- previous result is removed because it no longer matches the job's params.
create function public.request_reanalysis(p_job_id uuid, p_params jsonb default null)
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

-- ── Worker functions (service role only) ───────────────────────────────────

create function public.claim_analysis_job(p_worker_id text, p_lease_seconds int default 300)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  j public.analysis_jobs;
  v public.video_assets;
begin
  -- A job whose final attempt's worker disappeared cannot be retried again.
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

create function public.heartbeat_analysis_job(p_job_id uuid, p_worker_id text, p_lease_seconds int default 300)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.analysis_jobs
     set lease_expires_at = now() + make_interval(secs => greatest(p_lease_seconds, 30)), updated_at = now()
   where id = p_job_id and status = 'processing' and locked_by = p_worker_id and lease_expires_at >= now();
  return found;
end $$;

-- Raises 'lease_lost' unless the caller still holds a live lease on the job.
create function public._lock_held_job(p_job_id uuid, p_worker_id text)
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

create function public.complete_analysis_job(p_job_id uuid, p_worker_id text, p_result jsonb)
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

-- Retryable failures go back to the queue with exponential backoff (30s, 60s, ...).
create function public.fail_analysis_job(p_job_id uuid, p_worker_id text, p_error_code text,
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

-- Supabase grants EXECUTE on new public functions to anon/authenticated by
-- default, so every function is locked down explicitly.
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
