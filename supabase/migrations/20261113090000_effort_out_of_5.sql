-- Every rating in the app is now out of 5. Effort after a game was 1-10: convert saved
-- values to 1-5 (1-2 -> 1, 3-4 -> 2, 5-6 -> 3, 7-8 -> 4, 9-10 -> 5) and allow only 1-5.
-- Runs the conversion only while the old 1-10 rule is still in place, so running it
-- again never halves the values twice.
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
