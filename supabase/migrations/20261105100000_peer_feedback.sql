-- Targeted peer feedback (adviser feedback #4a/#4b, work package WP5).
-- When sharing a session, the owner picks up to 3 skills to get feedback on,
-- and whether the partner sees the video ("with video") or only rates
-- ("ratings only", also for sessions without a video). The partner rates only
-- those skills on the same 1-5 scale and can tag notes with one of them.
-- Everything else stays private (M02): a partner never sees the owner's own
-- ratings, journal, plan or goals.
-- Run AFTER 20261105090000_baseline_tests.sql. Safe to run more than once; if
-- 20261024090000_partners.sql is run again later, run this file again too.

-- The 10 skill keys, as in public.valid_self_ratings and src/lib/coaching/selfAssessment.ts.
create or replace function public.self_skill_keys() returns text[]
language sql immutable set search_path = '' as $$
  select array['serve', 'return', 'third_shot', 'dinking', 'volleys',
               'kitchen_line', 'transition', 'footwork', 'consistency', 'strategy']
$$;

-- ── What a share asks for ────────────────────────────────────────────────
alter table public.report_shares
  add column if not exists focus_skills text[] not null default '{}',
  add column if not exists with_video boolean not null default true;
alter table public.report_shares drop constraint if exists report_shares_focus_skills;
alter table public.report_shares add constraint report_shares_focus_skills
  check (cardinality(focus_skills) <= 3 and focus_skills <@ public.self_skill_keys());

-- ── Peer ratings ─────────────────────────────────────────────────────────
create table if not exists public.peer_ratings (
  session_id uuid not null references public.sessions (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  skill text not null check (skill = any (public.self_skill_keys())),
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, author_id, skill),
  constraint peer_ratings_not_self check (owner_id <> author_id)
);
create index if not exists peer_ratings_owner on public.peer_ratings (owner_id, updated_at);

-- Notes can be tagged with one of the skills the owner asked about.
alter table public.peer_notes add column if not exists skill text;
alter table public.peer_notes drop constraint if exists peer_notes_skill;
alter table public.peer_notes add constraint peer_notes_skill check (skill is null or skill = any (public.self_skill_keys()));

-- ── Checks ───────────────────────────────────────────────────────────────
-- The caller is a linked partner whose live share of this session asks about this skill.
create or replace function public.partner_can_rate(p_session_id uuid, p_skill text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.report_shares rs
    where rs.session_id = p_session_id and rs.partner_id = auth.uid() and p_skill = any (rs.focus_skills)
      and public.partners_linked(rs.owner_id, rs.partner_id))
$$;

-- Videos are readable only through a share that includes the video.
create or replace function public.partner_can_view_video(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.video_assets v
    join public.report_shares rs on rs.session_id = v.session_id
    where v.storage_path = p_name and v.upload_status = 'uploaded' and v.raw_video_deleted_at is null
      and rs.partner_id = auth.uid() and rs.with_video and public.partners_linked(rs.owner_id, rs.partner_id))
$$;

alter table public.peer_ratings enable row level security;
-- Owners read every rating of their sessions; partners read their own, only
-- for skills the owner still asks about, and only while the share lasts.
drop policy if exists peer_ratings_read on public.peer_ratings;
create policy peer_ratings_read on public.peer_ratings for select to authenticated
  using (owner_id = (select auth.uid())
    or (author_id = (select auth.uid()) and public.partner_can_rate(session_id, skill)));
revoke all on public.peer_ratings from anon, authenticated;
grant select on public.peer_ratings to authenticated;
grant all on public.peer_ratings to service_role;

-- ── Sharing with focus skills ────────────────────────────────────────────
drop function if exists public.share_session(uuid, uuid);
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
  if cardinality(skills) > 3 or not skills <@ public.self_skill_keys() then
    raise exception 'partners: pick up to 3 skills to get feedback on' using errcode = '22023';
  end if;
  insert into public.report_shares (session_id, owner_id, partner_id, focus_skills, with_video)
  values (p_session_id, me, p_partner_id, skills, coalesce(p_with_video, true))
  on conflict (session_id, partner_id) do update set focus_skills = excluded.focus_skills, with_video = excluded.with_video;
end $$;

-- Sessions partners shared with the caller, with what they asked about.
drop function if exists public.shared_with_me();
create function public.shared_with_me()
returns table (session_id uuid, owner_id uuid, owner_name text, title text, session_date date,
               session_context text, play_format text, has_report boolean, my_notes bigint, shared_at timestamptz,
               focus_skills text[], with_video boolean, my_ratings bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'partners: sign in first' using errcode = '42501';
  end if;
  return query
  select s.id, s.owner_id, o.display_name, s.title, s.session_date, s.session_context, s.play_format,
         rs.with_video and exists (select 1 from public.analysis_results r where r.session_id = s.id),
         (select count(*) from public.peer_notes n where n.session_id = s.id and n.author_id = me),
         rs.created_at, rs.focus_skills, rs.with_video,
         (select count(*) from public.peer_ratings pr where pr.session_id = s.id and pr.author_id = me and pr.skill = any (rs.focus_skills))
  from public.report_shares rs
  join public.sessions s on s.id = rs.session_id
  join public.profiles o on o.id = rs.owner_id
  where rs.partner_id = me and public.partners_linked(rs.owner_id, me)
  order by s.session_date desc, rs.created_at desc
  limit 200;
end $$;

-- What a partner sees of a shared session: its name, date and format, the
-- skills the owner asked about, and the video report and video only when the
-- share includes the video. Nothing else from the session.
create or replace function public.shared_report(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  asked public.report_shares;
  out jsonb;
begin
  select * into asked from public.report_shares rs
   where rs.session_id = p_session_id and rs.partner_id = auth.uid() and public.partners_linked(rs.owner_id, rs.partner_id);
  if not found then
    raise exception 'partners: this session is not shared with you' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'session', jsonb_build_object('id', s.id, 'title', s.title, 'session_date', s.session_date,
      'session_context', s.session_context, 'play_format', s.play_format, 'owner_id', s.owner_id, 'owner_name', o.display_name),
    'focus_skills', to_jsonb(asked.focus_skills),
    'with_video', asked.with_video,
    'my_ratings', coalesce((select jsonb_object_agg(pr.skill, pr.rating) from public.peer_ratings pr
                             where pr.session_id = s.id and pr.author_id = auth.uid() and pr.skill = any (asked.focus_skills)), '{}'::jsonb),
    'result', case when asked.with_video then (select r.result from public.video_assets v
                 join public.analysis_jobs j on j.video_asset_id = v.id
                 join public.analysis_results r on r.job_id = j.id
                where v.session_id = s.id limit 1) end,
    'video_path', case when asked.with_video then (select v.storage_path from public.video_assets v
                    where v.session_id = s.id and v.upload_status = 'uploaded'
                      and v.raw_video_deleted_at is null and v.raw_video_deleting_at is null) end)
  into out
  from public.sessions s join public.profiles o on o.id = s.owner_id
  where s.id = p_session_id;
  return out;
end $$;

-- ── Rating ───────────────────────────────────────────────────────────────
-- A partner rates one of the skills they were asked about; a null rating removes it.
create or replace function public.rate_shared_skill(p_session_id uuid, p_skill text, p_rating smallint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.partner_check_caller();
begin
  if not public.partner_can_rate(p_session_id, p_skill) then
    raise exception 'partners: you can rate only the skills you were asked about, on a session shared with you' using errcode = '42501';
  end if;
  if p_rating is null then
    delete from public.peer_ratings where session_id = p_session_id and author_id = me and skill = p_skill;
    return;
  end if;
  if p_rating not between 1 and 5 then
    raise exception 'partners: ratings go from 1 to 5' using errcode = '22023';
  end if;
  insert into public.peer_ratings (session_id, owner_id, author_id, skill, rating)
  select s.id, s.owner_id, me, p_skill, p_rating from public.sessions s where s.id = p_session_id
  on conflict (session_id, author_id, skill) do update set rating = excluded.rating, updated_at = now();
end $$;

-- Owners see every partner's ratings of their session; partners see their own.
drop function if exists public.session_peer_ratings(uuid);
create function public.session_peer_ratings(p_session_id uuid)
returns table (author_id uuid, author_name text, mine boolean, skill text, rating smallint, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  is_owner boolean;
begin
  if me is null then
    raise exception 'partners: sign in first' using errcode = '42501';
  end if;
  is_owner := exists (select 1 from public.sessions s where s.id = p_session_id and s.owner_id = me);
  if not is_owner and not public.partner_can_view(p_session_id) then
    raise exception 'partners: this session is not shared with you' using errcode = '42501';
  end if;
  return query
  select pr.author_id, a.display_name, pr.author_id = me, pr.skill, pr.rating, pr.updated_at
  from public.peer_ratings pr join public.profiles a on a.id = pr.author_id
  where pr.session_id = p_session_id and (is_owner or (pr.author_id = me and public.partner_can_rate(p_session_id, pr.skill)))
  order by a.display_name, array_position(public.self_skill_keys(), pr.skill);
end $$;

-- ── Notes with a skill tag ───────────────────────────────────────────────
drop function if exists public.session_peer_notes(uuid);
create function public.session_peer_notes(p_session_id uuid)
returns table (id uuid, author_id uuid, author_name text, mine boolean, video_time_s numeric,
               body text, created_at timestamptz, updated_at timestamptz, skill text)
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  is_owner boolean;
begin
  if me is null then
    raise exception 'partners: sign in first' using errcode = '42501';
  end if;
  is_owner := exists (select 1 from public.sessions s where s.id = p_session_id and s.owner_id = me);
  if not is_owner and not public.partner_can_view(p_session_id) then
    raise exception 'partners: this session is not shared with you' using errcode = '42501';
  end if;
  return query
  select n.id, n.author_id, a.display_name, n.author_id = me, n.video_time_s, n.body, n.created_at, n.updated_at, n.skill
  from public.peer_notes n join public.profiles a on a.id = n.author_id
  where n.session_id = p_session_id and (is_owner or n.author_id = me)
  order by n.video_time_s nulls first, n.created_at
  limit 500;
end $$;

-- The skill tag must be one the owner asked about.
create or replace function public.peer_note_skill_ok(p_session_id uuid, p_skill text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_skill is null or public.partner_can_rate(p_session_id, p_skill)
$$;

drop function if exists public.add_peer_note(uuid, numeric, text);
create or replace function public.add_peer_note(p_session_id uuid, p_video_time_s numeric, p_body text, p_skill text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.partner_check_caller();
  text_ text := btrim(coalesce(p_body, ''), E' \t\r\n');
  new_id uuid;
begin
  if not public.partner_can_view(p_session_id) then
    raise exception 'partners: this session is not shared with you' using errcode = '42501';
  end if;
  if char_length(text_) not between 1 and 500 then
    raise exception 'partners: write a note of 1 to 500 characters' using errcode = '22023';
  end if;
  if p_video_time_s is not null and p_video_time_s not between 0 and 36000 then
    raise exception 'partners: the video time is not valid' using errcode = '22023';
  end if;
  if not public.peer_note_skill_ok(p_session_id, p_skill) then
    raise exception 'partners: tag a note only with a skill you were asked about' using errcode = '22023';
  end if;
  if (select count(*) from public.peer_notes n where n.session_id = p_session_id and n.author_id = me) >= 200 then
    raise exception 'partners: you can leave at most 200 notes on one session' using errcode = 'P0001';
  end if;
  insert into public.peer_notes (session_id, owner_id, author_id, video_time_s, body, skill)
  select s.id, s.owner_id, me, round(p_video_time_s, 2), text_, p_skill from public.sessions s where s.id = p_session_id
  returning id into new_id;
  return new_id;
end $$;

drop function if exists public.edit_peer_note(uuid, text);
create or replace function public.edit_peer_note(p_id uuid, p_body text, p_skill text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  text_ text := btrim(coalesce(p_body, ''), E' \t\r\n');
  note_session uuid;
begin
  if char_length(text_) not between 1 and 500 then
    raise exception 'partners: write a note of 1 to 500 characters' using errcode = '22023';
  end if;
  select n.session_id into note_session from public.peer_notes n
   where n.id = p_id and n.author_id = me and public.partner_can_view(n.session_id);
  if not found then
    raise exception 'partners: you can edit only your own notes on a session shared with you' using errcode = '42501';
  end if;
  if not public.peer_note_skill_ok(note_session, p_skill) then
    raise exception 'partners: tag a note only with a skill you were asked about' using errcode = '22023';
  end if;
  update public.peer_notes set body = text_, skill = p_skill, updated_at = now() where id = p_id;
end $$;

revoke all on function public.self_skill_keys(), public.partner_can_rate(uuid, text), public.partner_can_view_video(text),
  public.share_session(uuid, uuid, text[], boolean), public.shared_with_me(), public.shared_report(uuid),
  public.rate_shared_skill(uuid, text, smallint), public.session_peer_ratings(uuid), public.session_peer_notes(uuid),
  public.peer_note_skill_ok(uuid, text), public.add_peer_note(uuid, numeric, text, text), public.edit_peer_note(uuid, text, text)
  from public, anon;
-- self_skill_keys, partner_can_rate and partner_can_view_video are used inside checks and policies.
grant execute on function public.self_skill_keys(), public.partner_can_rate(uuid, text), public.partner_can_view_video(text),
  public.share_session(uuid, uuid, text[], boolean), public.shared_with_me(), public.shared_report(uuid),
  public.rate_shared_skill(uuid, text, smallint), public.session_peer_ratings(uuid), public.session_peer_notes(uuid),
  public.add_peer_note(uuid, numeric, text, text), public.edit_peer_note(uuid, text, text) to authenticated;
