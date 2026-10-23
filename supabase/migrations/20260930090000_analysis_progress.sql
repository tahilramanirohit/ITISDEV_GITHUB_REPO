-- Progress of a running analysis, for the progress bar on the session page.
-- Only the worker that holds the job's lease can write it (through
-- update_analysis_progress); owners read it with the rest of the job row.

alter table public.analysis_jobs
  add column progress real check (progress between 0 and 1),
  add column progress_stage text check (progress_stage in ('downloading', 'checking', 'analyzing', 'finishing')),
  add column progress_updated_at timestamptz;

comment on column public.analysis_jobs.progress is
  'Share of the analysis done (0-1) while processing; 1 when completed; null otherwise.';

-- A status change or a new worker starts the bar over (claim, retry, re-analysis, a
-- takeover after a worker stopped responding) or fills it (completed).
create function public.reset_analysis_progress()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status or new.locked_by is distinct from old.locked_by then
    new.progress := case when new.status = 'completed' then 1 else null end;
    new.progress_stage := null;
    new.progress_updated_at := case when new.status = 'completed' then now() else null end;
  end if;
  return new;
end $$;

create trigger analysis_jobs_reset_progress
  before update of status, locked_by on public.analysis_jobs
  for each row execute function public.reset_analysis_progress();

create function public.update_analysis_progress(p_job_id uuid, p_worker_id text, p_progress real, p_stage text)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_stage not in ('downloading', 'checking', 'analyzing', 'finishing') then
    raise exception 'unknown progress stage: %', p_stage using errcode = '22023';
  end if;
  update public.analysis_jobs
     set progress = greatest(0, least(1, coalesce(p_progress, 0))), progress_stage = p_stage,
         progress_updated_at = now()
   where id = p_job_id and status = 'processing' and locked_by = p_worker_id and lease_expires_at >= now();
  return found;
end $$;

-- Supabase grants EXECUTE on new public functions to anon/authenticated by default.
revoke all on function public.reset_analysis_progress() from public, anon, authenticated;
revoke all on function public.update_analysis_progress(uuid, text, real, text) from public, anon, authenticated;
grant execute on function public.update_analysis_progress(uuid, text, real, text) to service_role;
