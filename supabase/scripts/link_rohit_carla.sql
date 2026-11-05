-- Link two real accounts for a demo: Carla becomes Rohit's buddy and video partner,
-- and Rohit's "videotest" session is shared with her, with the video.
-- Afterwards both see it under Players -> Shared: Carla can watch it, rate and
-- leave notes; Rohit sees the session he shared and her feedback.
--
-- Paste the whole file into Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Needs the updates through pickleproapp_upgrade_10.sql. Safe to run more than once.
--
-- Change the four values just below if the names, emails or title differ. Emails
-- win when set; otherwise each player is found by display name (it must match
-- exactly one profile). Nothing is changed if a player or the session is not found.
-- No ratings or notes are invented: Carla gives feedback herself by signing in.

do $$
declare
  owner_email   text := '';           -- e.g. 'rohit@example.com'; leave '' to use the name
  owner_name    text := 'Rohit';
  partner_email text := '';           -- e.g. 'carla@example.com'; leave '' to use the name
  partner_name  text := 'Carla';
  session_title text := 'videotest';  -- matched without case, anywhere in the title; newest wins

  rohit uuid;
  carla uuid;
  matches int;
  sid uuid;
  session_day date;
  has_video boolean;
begin
  -- ── Find the two players ───────────────────────────────────────────
  select count(*), min(p.id::text)::uuid into matches, rohit
  from public.profiles p join auth.users u on u.id = p.id
  where case when owner_email <> '' then lower(u.email) = lower(owner_email)
             else p.display_name ilike owner_name || '%' end;
  if matches <> 1 then
    raise exception 'Found % players for "%". Set owner_email at the top of this script.', matches,
      coalesce(nullif(owner_email, ''), owner_name);
  end if;

  select count(*), min(p.id::text)::uuid into matches, carla
  from public.profiles p join auth.users u on u.id = p.id
  where case when partner_email <> '' then lower(u.email) = lower(partner_email)
             else p.display_name ilike partner_name || '%' end;
  if matches <> 1 then
    raise exception 'Found % players for "%". Set partner_email at the top of this script.', matches,
      coalesce(nullif(partner_email, ''), partner_name);
  end if;
  if rohit = carla then
    raise exception 'Both names matched the same account.';
  end if;

  -- ── Rohit's session ────────────────────────────────────────────────
  select s.id, s.session_date into sid, session_day
  from public.sessions s
  where s.owner_id = rohit and s.title ilike '%' || session_title || '%'
  order by s.created_at desc
  limit 1;
  if sid is null then
    raise exception 'No session of % has a title containing "%".', owner_name, session_title;
  end if;
  select exists (select 1 from public.video_assets v where v.session_id = sid) into has_video;

  -- ── 1. Buddies: an accepted buddy session between them ─────────────
  if not exists (select 1 from public.buddy_requests r where r.status = 'accepted'
                 and ((r.from_player_id = rohit and r.to_player_id = carla) or (r.from_player_id = carla and r.to_player_id = rohit))) then
    -- A waiting request between them would block the new one; it is answered by this link.
    update public.buddy_requests r set status = 'accepted', responded_at = now()
    where r.status = 'pending'
      and ((r.from_player_id = rohit and r.to_player_id = carla) or (r.from_player_id = carla and r.to_player_id = rohit));
    if not found then
      insert into public.buddy_requests (from_player_id, to_player_id, purpose, play_format, slots, status, city, location, created_at, responded_at)
      values (rohit, carla, 'practice', 'doubles',
              jsonb_build_array(jsonb_build_object('date', session_day, 'start', '18:00', 'end', '20:00')),
              'accepted', 'Manila', 'Video test session', now() - interval '1 day', now());
    end if;
  end if;

  -- ── 2. Video partners ──────────────────────────────────────────────
  update public.partners p set status = 'active', linked_at = coalesce(p.linked_at, now())
  where p.status in ('pending', 'active')
    and ((p.inviter_id = rohit and p.invitee_id = carla) or (p.inviter_id = carla and p.invitee_id = rohit));
  if not found then
    insert into public.partners (inviter_id, invitee_id, status, linked_at) values (rohit, carla, 'active', now());
  end if;

  -- ── 3. Share "videotest" with Carla, with the video ────────────────
  insert into public.report_shares (session_id, owner_id, partner_id, focus_skills, with_video)
  values (sid, rohit, carla, '{}', true)
  on conflict (session_id, partner_id) do update set with_video = true;

  raise notice 'Done: % and % are buddies and video partners; session % is shared with the video%.',
    owner_name, partner_name, sid, case when has_video then '' else ' (note: this session has no uploaded video yet)' end;
end $$;
