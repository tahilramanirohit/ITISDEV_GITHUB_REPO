-- Versioned analysis beside the existing job/result API. A reanalysis creates a
-- new run; the session switches to it only after successful publication.
create table public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  video_asset_id uuid not null references public.video_assets(id) on delete cascade,
  job_id uuid not null references public.analysis_jobs(id) on delete cascade,
  run_number integer not null check (run_number > 0),
  status text not null check (status in ('queued', 'processing', 'completed', 'failed')),
  params jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  metric_definition_version text not null default 'v4-draft-2026-09-29',
  pipeline_version text,
  source_sha256 text,
  code_revision text,
  model_versions jsonb not null default '{}'::jsonb check (jsonb_typeof(model_versions) = 'object'),
  result_schema_version text,
  result_status text check (result_status in ('ok', 'insufficient_data')),
  result jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  published_at timestamptz,
  unique (session_id, run_number),
  check ((status = 'completed') = (result is not null))
);
create index analysis_runs_owner_session_idx on public.analysis_runs(owner_id, session_id, run_number desc);
alter table public.analysis_runs enable row level security;
create policy analysis_runs_select_own on public.analysis_runs for select to authenticated
  using (owner_id = (select auth.uid()));
revoke all on public.analysis_runs from anon, authenticated;
grant select on public.analysis_runs to authenticated;
grant all on public.analysis_runs to service_role;

alter table public.sessions add column active_run_id uuid references public.analysis_runs(id) on delete set null;
alter table public.analysis_jobs add column current_run_id uuid references public.analysis_runs(id) on delete set null;
alter table public.analysis_results add column run_id uuid references public.analysis_runs(id) on delete set null;

-- The session owner may edit ordinary session details, but publication is a
-- worker operation. Also reject pointers to a run from a different session.
create function public.guard_active_run() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.active_run_id is distinct from old.active_run_id then
    if current_user = 'authenticated' then
      raise exception 'active_run_is_worker_managed' using errcode = '42501';
    end if;
    if new.active_run_id is not null and not exists
      (select 1 from public.analysis_runs r where r.id = new.active_run_id
        and r.session_id = new.id and r.status = 'completed') then
      raise exception 'invalid_active_run' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
create trigger sessions_guard_active_run before update on public.sessions
  for each row execute function public.guard_active_run();
revoke all on function public.guard_active_run() from public, anon, authenticated;

-- Existing published reports become run 1. A queued or failed reanalysis that
-- was already in flight gets a separate run; the published report stays active.
insert into public.analysis_runs(owner_id, session_id, video_asset_id, job_id, run_number, status,
  params, pipeline_version, source_sha256, result_schema_version, result_status, result,
  created_at, completed_at, published_at)
select r.owner_id, r.session_id, r.video_asset_id, r.job_id, 1, 'completed', j.params,
  r.pipeline_version, r.result #>> '{provenance,source,sha256}', r.schema_version, r.result_status,
  r.result, r.created_at, coalesce(j.finished_at, r.created_at), r.created_at
from public.analysis_results r join public.analysis_jobs j on j.id = r.job_id;
update public.analysis_results r set run_id = ar.id
from public.analysis_runs ar where ar.job_id = r.job_id and ar.run_number = 1;
update public.sessions s set active_run_id = ar.id
from public.analysis_runs ar where ar.session_id = s.id and ar.run_number = 1;
-- A legacy job can be marked completed even if its result row was lost. It
-- cannot become a published run, because there is no report to preserve.
update public.analysis_jobs j set status = 'failed', error_code = 'missing_result',
  error_message = 'The completed job has no stored result.', updated_at = now()
where j.status = 'completed' and not exists
  (select 1 from public.analysis_results r where r.job_id = j.id);
insert into public.analysis_runs(owner_id, session_id, video_asset_id, job_id, run_number,
  status, params, created_at, started_at, error_code, error_message)
select j.owner_id, j.session_id, j.video_asset_id, j.id,
  case when ar.id is null then 1 else 2 end, j.status, j.params,
  j.created_at, j.started_at, j.error_code, j.error_message
from public.analysis_jobs j left join public.analysis_runs ar on ar.job_id = j.id and ar.run_number = 1
where ar.id is null or j.status <> 'completed';
update public.analysis_jobs j set current_run_id = ar.id
from public.analysis_runs ar where ar.job_id = j.id
  and ar.run_number = (select max(run_number) from public.analysis_runs where job_id = j.id);

-- Metric rows are reserved for quality-gated revision-4 measurements. The
-- current whole-clip prototype does not insert rows or seed baselines here.
create table public.metric_results (
  run_id uuid not null references public.analysis_runs(id) on delete cascade,
  participant_id uuid not null references public.session_participants(id) on delete cascade,
  metric_key text not null,
  definition_version text not null,
  validation_level text not null default 'not_evaluated'
    check (validation_level in ('not_evaluated', 'synthetic_only', 'evaluated_on_real_footage')),
  quality_status text not null check (quality_status in ('available', 'insufficient_coverage', 'unvalidated', 'unavailable')),
  value numeric,
  numerator numeric,
  denominator numeric,
  valid_s numeric check (valid_s is null or valid_s >= 0),
  evaluable_s numeric check (evaluable_s is null or evaluable_s >= 0),
  contact_count integer check (contact_count is null or contact_count >= 0),
  quality_details jsonb not null default '{}'::jsonb check (jsonb_typeof(quality_details) = 'object'),
  primary key (run_id, participant_id, metric_key),
  check ((quality_status = 'available' and validation_level = 'evaluated_on_real_footage' and value is not null)
    or (quality_status <> 'available' and value is null)),
  check (valid_s is null or evaluable_s is null or valid_s <= evaluable_s)
);
create function public.require_metric_run_participant() returns trigger
language plpgsql security definer set search_path = '' as $$
declare run_session uuid; participant_session uuid; run_version text;
begin
  select session_id, metric_definition_version into run_session, run_version
    from public.analysis_runs where id = new.run_id;
  select session_id into participant_session from public.session_participants where id = new.participant_id;
  if run_session is distinct from participant_session or new.definition_version <> run_version then
    raise exception 'metric_run_participant_mismatch' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger metric_run_participant before insert or update on public.metric_results
  for each row execute function public.require_metric_run_participant();
revoke all on function public.require_metric_run_participant() from public, anon, authenticated;
alter table public.metric_results enable row level security;
create policy metric_results_self on public.metric_results for select to authenticated
  using (exists (select 1 from public.session_participants p
    where p.id = participant_id and p.player_id = (select auth.uid())));
revoke all on public.metric_results from anon, authenticated;
grant select on public.metric_results to authenticated;
grant all on public.metric_results to service_role;

create or replace function public.finalize_video_upload(p_video_id uuid, p_params jsonb default '{}'::jsonb)
returns public.analysis_jobs language plpgsql security definer set search_path = '' as $$
declare v public.video_assets; j public.analysis_jobs; obj_size bigint;
begin
  if p_params is null or jsonb_typeof(p_params) <> 'object' then
    raise exception 'invalid_params' using errcode = '22023';
  end if;
  select * into v from public.video_assets where id = p_video_id and owner_id = auth.uid() for update;
  if not found then raise exception 'video_not_found' using errcode = 'P0002'; end if;
  if v.upload_status = 'pending' then
    select (o.metadata ->> 'size')::bigint into obj_size from storage.objects o
      where o.bucket_id = v.storage_bucket and o.name = v.storage_path;
    if not found then raise exception 'upload_incomplete' using errcode = 'P0001'; end if;
    update public.video_assets set upload_status = 'uploaded', uploaded_at = now(),
      byte_size = coalesce(obj_size, byte_size) where id = v.id;
  end if;
  insert into public.analysis_jobs(owner_id, video_asset_id, session_id, params)
  values (v.owner_id, v.id, v.session_id, p_params) on conflict (video_asset_id) do nothing;
  select * into j from public.analysis_jobs where video_asset_id = v.id for update;
  if j.current_run_id is null then
    if j.status = 'completed' then
      raise exception 'completed_job_missing_run' using errcode = 'P0001';
    end if;
    insert into public.analysis_runs(owner_id, session_id, video_asset_id, job_id, run_number, status, params)
    values (j.owner_id, j.session_id, j.video_asset_id, j.id, 1, j.status, j.params)
    returning id into j.current_run_id;
    update public.analysis_jobs set current_run_id = j.current_run_id where id = j.id;
  end if;
  return j;
end $$;

create or replace function public.request_reanalysis(p_job_id uuid, p_params jsonb default null)
returns public.analysis_jobs language plpgsql security definer set search_path = '' as $$
declare j public.analysis_jobs; next_run uuid; n integer;
begin
  if p_params is not null and jsonb_typeof(p_params) <> 'object' then
    raise exception 'invalid_params' using errcode = '22023';
  end if;
  select * into j from public.analysis_jobs where id = p_job_id and owner_id = auth.uid() for update;
  if not found then raise exception 'job_not_found' using errcode = 'P0002'; end if;
  if j.status not in ('completed', 'failed') then
    raise exception 'job_not_finished' using errcode = 'P0001';
  end if;
  select coalesce(max(run_number), 0) + 1 into n from public.analysis_runs where session_id = j.session_id;
  insert into public.analysis_runs(owner_id, session_id, video_asset_id, job_id, run_number, status, params)
  values (j.owner_id, j.session_id, j.video_asset_id, j.id, n, 'queued', coalesce(p_params, j.params))
  returning id into next_run;
  update public.analysis_jobs set status = 'queued', attempts = 0, available_at = now(),
    params = coalesce(p_params, params), current_run_id = next_run,
    error_code = null, error_message = null, locked_by = null, lease_expires_at = null,
    started_at = null, finished_at = null, updated_at = now()
    where id = j.id returning * into j;
  return j;
end $$;

create or replace function public.claim_analysis_job(p_worker_id text, p_lease_seconds int default 300)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.analysis_jobs; v public.video_assets;
begin
  update public.analysis_jobs set status = 'failed', locked_by = null, lease_expires_at = null,
    finished_at = now(), updated_at = now(), error_code = 'lease_expired',
    error_message = 'The worker stopped responding on the final attempt.'
    where status = 'processing' and lease_expires_at < now() and attempts >= max_attempts;
  update public.analysis_runs ar set status = 'failed', error_code = 'lease_expired',
    error_message = 'The worker stopped responding on the final attempt.'
    from public.analysis_jobs aj where aj.current_run_id = ar.id and aj.status = 'failed'
      and aj.error_code = 'lease_expired' and ar.status = 'processing';
  select * into j from public.analysis_jobs
    where (status = 'queued' and available_at <= now())
       or (status = 'processing' and lease_expires_at < now())
    order by available_at, created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.analysis_jobs set status = 'processing', locked_by = p_worker_id,
    attempts = attempts + 1, lease_expires_at = now() + make_interval(secs => greatest(p_lease_seconds, 30)),
    started_at = coalesce(started_at, now()), updated_at = now()
    where id = j.id returning * into j;
  update public.analysis_runs set status = 'processing', started_at = coalesce(started_at, now())
    where id = j.current_run_id;
  select * into v from public.video_assets where id = j.video_asset_id;
  return jsonb_build_object('id', j.id, 'run_id', j.current_run_id, 'owner_id', j.owner_id,
    'video_asset_id', j.video_asset_id, 'session_id', j.session_id,
    'storage_bucket', v.storage_bucket, 'storage_path', v.storage_path,
    'original_filename', v.original_filename, 'attempts', j.attempts,
    'max_attempts', j.max_attempts, 'params', j.params);
end $$;

create or replace function public.complete_analysis_job(p_job_id uuid, p_worker_id text, p_result jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare j public.analysis_jobs;
begin
  j := public._lock_held_job(p_job_id, p_worker_id);
  if p_result ->> 'schema_version' is null
    or coalesce(p_result ->> 'status', '') not in ('ok', 'insufficient_data')
    or coalesce(p_result ->> 'data_origin', '') not in ('measured', 'test_fixture')
    or p_result #>> '{provenance,pipeline_version}' is null then
    raise exception 'invalid_result' using errcode = '22023';
  end if;
  update public.analysis_runs set status = 'completed', result = p_result,
    result_schema_version = p_result ->> 'schema_version', result_status = p_result ->> 'status',
    pipeline_version = p_result #>> '{provenance,pipeline_version}',
    source_sha256 = p_result #>> '{provenance,source,sha256}',
    model_versions = jsonb_build_object('player_detector', p_result #>> '{provenance,detector,name}',
      'ball_detector', p_result #>> '{provenance,ball_detector,name}'),
    completed_at = now(), published_at = now(), error_code = null, error_message = null
    where id = j.current_run_id and status = 'processing';
  if not found then raise exception 'run_not_processing' using errcode = 'P0001'; end if;
  update public.sessions set active_run_id = j.current_run_id where id = j.session_id;
  -- Compatibility row for current clients; immutable reports remain in analysis_runs.
  insert into public.analysis_results(job_id, owner_id, session_id, video_asset_id, run_id,
    schema_version, result_status, data_origin, pipeline_version,
    analyzed_duration_s, video_duration_s, fraction_analyzed, result)
  values (j.id, j.owner_id, j.session_id, j.video_asset_id, j.current_run_id,
    p_result ->> 'schema_version', p_result ->> 'status', p_result ->> 'data_origin',
    p_result #>> '{provenance,pipeline_version}',
    (p_result #>> '{coverage,analyzed_duration_s}')::double precision,
    (p_result #>> '{video,container_duration_s}')::double precision,
    (p_result #>> '{coverage,fraction_of_video_analyzed}')::double precision, p_result)
  on conflict (job_id) do update set run_id = excluded.run_id,
    schema_version = excluded.schema_version, result_status = excluded.result_status,
    data_origin = excluded.data_origin, pipeline_version = excluded.pipeline_version,
    analyzed_duration_s = excluded.analyzed_duration_s, video_duration_s = excluded.video_duration_s,
    fraction_analyzed = excluded.fraction_analyzed, result = excluded.result, created_at = now();
  update public.analysis_jobs set status = 'completed', locked_by = null,
    lease_expires_at = null, error_code = null, error_message = null,
    finished_at = now(), updated_at = now() where id = j.id;
end $$;

create or replace function public.fail_analysis_job(p_job_id uuid, p_worker_id text,
  p_error_code text, p_error_message text, p_retryable boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare j public.analysis_jobs; new_status text;
begin
  j := public._lock_held_job(p_job_id, p_worker_id);
  new_status := case when p_retryable and j.attempts < j.max_attempts then 'queued' else 'failed' end;
  update public.analysis_jobs set status = new_status, locked_by = null, lease_expires_at = null,
    error_code = left(p_error_code, 64), error_message = left(p_error_message, 2000),
    available_at = case when new_status = 'queued'
      then now() + make_interval(secs => 30 * power(2, greatest(j.attempts - 1, 0)))
      else available_at end,
    finished_at = case when new_status = 'failed' then now() else null end,
    updated_at = now() where id = j.id;
  update public.analysis_runs set status = new_status, error_code = left(p_error_code, 64),
    error_message = left(p_error_message, 2000) where id = j.current_run_id;
  return new_status;
end $$;
