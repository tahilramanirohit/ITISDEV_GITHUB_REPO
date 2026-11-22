-- PicklePro `cleanversion` branch, update 18 (22 Nov 2026): ask for feedback on any
-- number of shots (before: at most 3).
-- Paste the whole file into Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Run AFTER pickleproapp_upgrade_9.sql. Safe to run more than once. Running update 9
-- again puts the limit of 3 back; check_database.sql shows that, and this file fixes it.
-- Same content as supabase/migrations/20261122090000_feedback_any_number_of_skills.sql.

alter table public.report_shares drop constraint if exists report_shares_focus_skills;
alter table public.report_shares add constraint report_shares_focus_skills
  check (focus_skills <@ public.self_skill_keys());

create or replace function public.share_session(p_session_id uuid, p_partner_id uuid,
                                                p_focus_skills text[] default '{}', p_with_video boolean default true)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.partner_check_caller();
  -- Duplicates removed, the owner's order kept.
  skills text[] := array(select u.s from unnest(coalesce(p_focus_skills, '{}')) with ordinality u(s, i)
                         group by u.s order by min(u.i));
begin
  if not exists (select 1 from public.sessions s where s.id = p_session_id and s.owner_id = me) then
    raise exception 'partners: you can share only your own sessions' using errcode = '42501';
  end if;
  if not public.partners_linked(me, p_partner_id) then
    raise exception 'partners: you can share only with a linked partner' using errcode = 'P0001';
  end if;
  if not skills <@ public.self_skill_keys() then
    raise exception 'partners: pick the skills to get feedback on from the list' using errcode = '22023';
  end if;
  insert into public.report_shares (session_id, owner_id, partner_id, focus_skills, with_video)
  values (p_session_id, me, p_partner_id, skills, coalesce(p_with_video, true))
  on conflict (session_id, partner_id) do update set focus_skills = excluded.focus_skills, with_video = excluded.with_video;
end $$;
