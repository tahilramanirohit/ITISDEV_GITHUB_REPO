-- The raw recording expires 30 days after its first measured analysis.
-- Results remain available after Storage deletes the original file.
alter table public.video_assets
  add column raw_video_expires_at timestamptz,
  add column raw_video_kept boolean not null default false,
  add column raw_video_deleting_at timestamptz,
  add column raw_video_deleted_at timestamptz;

create index video_assets_expiry_idx on public.video_assets (raw_video_expires_at)
  where raw_video_deleted_at is null and raw_video_kept = false;

create function public.set_raw_video_expiry_after_result()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed'
     and new.result ->> 'data_origin' = 'measured' then
    update public.video_assets
      set raw_video_expires_at = coalesce(raw_video_expires_at, now() + interval '30 days')
      where id = new.video_asset_id and raw_video_deleted_at is null;
  end if;
  return new;
end $$;

create trigger analysis_run_sets_raw_video_expiry
  after update of status on public.analysis_runs
  for each row execute function public.set_raw_video_expiry_after_result();

-- Existing measured reports start their retention clock at this migration.
update public.video_assets v
set raw_video_expires_at = now() + interval '30 days'
where v.raw_video_expires_at is null
  and exists (select 1 from public.analysis_runs r
    where r.video_asset_id = v.id and r.status = 'completed'
      and r.result ->> 'data_origin' = 'measured');

create function public.set_raw_video_keep(p_video_id uuid, p_keep boolean)
returns public.video_assets language plpgsql security definer set search_path = '' as $$
declare v public.video_assets;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v from public.video_assets where id = p_video_id and owner_id = auth.uid() for update;
  if not found then raise exception 'video_not_found' using errcode = 'P0002'; end if;
  if v.raw_video_deleted_at is not null or v.raw_video_deleting_at is not null then
    raise exception 'raw_video_deletion_started' using errcode = 'P0001';
  end if;
  update public.video_assets set raw_video_kept = p_keep where id = p_video_id returning * into v;
  return v;
end $$;

-- A trusted worker claims one expired object. A one-hour lease permits retry
-- after a crash; the UI cannot alter a video once deletion has begun.
create function public.claim_expired_raw_video()
returns table (id uuid, storage_bucket text, storage_path text)
language plpgsql security invoker set search_path = '' as $$
declare v public.video_assets;
begin
  select * into v from public.video_assets a
    where a.raw_video_expires_at <= now() and a.raw_video_kept = false
      and a.raw_video_deleted_at is null
      and (a.raw_video_deleting_at is null or a.raw_video_deleting_at < now() - interval '1 hour')
      and not exists (select 1 from public.analysis_jobs j
        where j.video_asset_id = a.id and j.status in ('queued', 'processing'))
    order by a.raw_video_expires_at, a.id for update skip locked limit 1;
  if not found then return; end if;
  update public.video_assets set raw_video_deleting_at = now() where video_assets.id = v.id;
  return query select v.id, v.storage_bucket, v.storage_path;
end $$;

create function public.complete_raw_video_deletion(p_video_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.video_assets
    set raw_video_deleted_at = now(), raw_video_deleting_at = null
    where id = p_video_id and raw_video_deleting_at is not null
      and raw_video_deleted_at is null;
end $$;

create function public.reject_reanalysis_after_raw_video_deletion()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'queued' and old.status is distinct from 'queued'
     and exists (select 1 from public.video_assets v
       where v.id = new.video_asset_id
         and (v.raw_video_deleted_at is not null or v.raw_video_deleting_at is not null)) then
    raise exception 'raw_video_expired' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger analysis_jobs_reject_expired_reanalysis
  before update of status on public.analysis_jobs
  for each row execute function public.reject_reanalysis_after_raw_video_deletion();

revoke all on function public.set_raw_video_expiry_after_result() from public, anon, authenticated;
revoke all on function public.set_raw_video_keep(uuid, boolean) from public, anon;
grant execute on function public.set_raw_video_keep(uuid, boolean) to authenticated;
revoke all on function public.claim_expired_raw_video() from public, anon, authenticated;
grant execute on function public.claim_expired_raw_video() to service_role;
revoke all on function public.complete_raw_video_deletion(uuid) from public, anon, authenticated;
grant execute on function public.complete_raw_video_deletion(uuid) to service_role;
revoke all on function public.reject_reanalysis_after_raw_video_deletion() from public, anon, authenticated;
