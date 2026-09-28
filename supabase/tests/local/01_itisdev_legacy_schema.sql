-- The ITISDEV project's state before supabase/scripts/itisdev_upgrade.sql:
-- a small `sessions` table, an over-broad policy and none of the video/job
-- tables. Used only by run_upgrade_script_test.sh.
create table public.sessions (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid,
  title        text not null,
  session_date date,
  notes        text,
  created_at   timestamptz not null default now()
);
alter table public.sessions enable row level security;
create policy "Enable read access for all users" on public.sessions for select using (true);
insert into auth.users (id, email) values ('12121212-1212-4121-8121-121212121212', 'legacy@example.test');
insert into public.sessions (owner_id, title, session_date)
values ('12121212-1212-4121-8121-121212121212', 'Legacy session', '2026-09-01');
