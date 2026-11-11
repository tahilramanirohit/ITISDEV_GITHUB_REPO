-- PicklePro `cleanversion` branch, update 17: every rating out of 5.
-- Effort after a game changes from 1-10 to 1-5; saved values are converted
-- (1-2 -> 1, 3-4 -> 2, 5-6 -> 3, 7-8 -> 4, 9-10 -> 5).
-- Paste the whole file into Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once: values are converted only the first time.
-- Same content as supabase/migrations/20261113090000_effort_out_of_5.sql.

do $$
declare
  old_rule text;
begin
  select pg_get_constraintdef(c.oid) into old_rule
  from pg_constraint c
  where c.conrelid = 'public.recovery_logs'::regclass and c.conname = 'recovery_logs_exertion_check';
  if old_rule is null or old_rule like '%10%' then
    alter table public.recovery_logs drop constraint if exists recovery_logs_exertion_check;
    update public.recovery_logs set exertion = ceil(exertion / 2.0)::smallint where exertion is not null;
    alter table public.recovery_logs add constraint recovery_logs_exertion_check check (exertion between 1 and 5);
  end if;
end $$;

-- Check: shows "OK" and the new rule once the update is in place.
select case when pg_get_constraintdef(c.oid) not like '%10%' then 'OK' else 'NOT UPDATED' end as "Update 17",
       pg_get_constraintdef(c.oid) as "Effort rule",
       (select max(exertion) from public.recovery_logs) as "Highest saved effort"
from pg_constraint c
where c.conrelid = 'public.recovery_logs'::regclass and c.conname = 'recovery_logs_exertion_check';
