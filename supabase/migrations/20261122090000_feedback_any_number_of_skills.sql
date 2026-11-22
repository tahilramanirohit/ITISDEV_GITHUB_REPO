-- Ask for feedback on any number of shots (team request, 22 Nov 2026).
-- A feedback request used to allow at most 3 skills. Now it allows one or more, any of
-- the listed skills; repeats are still removed and unknown skills still rejected.
-- The app asks for at least one (an empty list stays valid here: a video-only share).
-- Safe to run more than once.

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
