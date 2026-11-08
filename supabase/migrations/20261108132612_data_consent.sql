-- Additive, separate from recording_upload consent_records.
-- profiles_self already covers SELECT/INSERT/UPDATE with auth.uid() = id.
alter table public.profiles
  add column if not exists data_consent_version text,
  add column if not exists data_consent_at timestamptz,
  add column if not exists analytics_opt_in boolean not null default false,
  add column if not exists research_opt_in boolean not null default false;
