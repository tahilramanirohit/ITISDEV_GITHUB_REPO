-- PicklePro `coaching` branch, update 7 (Partners and peer coaching): link
-- with a partner by invite code or from Buddy, share chosen sessions, and
-- timestamped partner notes on the video.
-- Paste the whole file into Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Run AFTER pickleproapp_upgrade_6.sql. Safe to run more than once.
-- Same content as supabase/migrations/20261024090000_partners.sql.

-- Partners and peer coaching (requirements M01-M03, A03-A04; spec R4a, C1).
-- A player links with someone they trust: by a one-time invite code, or from
-- Buddy after an accepted buddy session. The other player must accept, and
-- either player can unlink (M01). Each player chooses which of their own
-- sessions to share with which partner (M02). A partner sees only that
-- session's video report (metrics, heatmap, video) and can leave notes pinned
-- to moments in the video (M03). Goals, ratings, notes, reflections, the
-- practice plan and audio are never shared. Unlinking removes every share
-- between the two players; signed video links last 5 minutes (A04).
-- Run AFTER 20261023100000_buddy_cancel.sql. Safe to run more than once.

-- ── Links ────────────────────────────────────────────────────────────────
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  -- Empty until someone uses the invite code.
  invitee_id uuid references public.profiles (id) on delete cascade,
  -- 8 characters without look-alikes (no I, O, 0 or 1).
  invite_code text unique check (invite_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  status text not null default 'pending' check (status in ('pending', 'active', 'declined', 'cancelled', 'ended')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  linked_at timestamptz,
  ended_at timestamptz,
  ended_by uuid references public.profiles (id) on delete set null,
  constraint partners_not_self check (inviter_id <> invitee_id),
  constraint partners_has_target check (invitee_id is not null or invite_code is not null)
);
-- One waiting invite or link per pair of players, whoever sent it.
create unique index if not exists partners_one_open_pair on public.partners
  (least(inviter_id, invitee_id), greatest(inviter_id, invitee_id))
  where status in ('pending', 'active') and invitee_id is not null;
create index if not exists partners_invitee_status on public.partners (invitee_id, status);
create index if not exists partners_inviter_status on public.partners (inviter_id, status);

alter table public.partners enable row level security;
drop policy if exists partners_parties_read on public.partners;
create policy partners_parties_read on public.partners for select to authenticated
  using ((select auth.uid()) in (inviter_id, invitee_id));
-- Rows change only through the functions below.
revoke all on public.partners from anon, authenticated;
grant select on public.partners to authenticated;
grant all on public.partners to service_role;

-- ── Shared sessions ──────────────────────────────────────────────────────
create table if not exists public.report_shares (
  session_id uuid not null references public.sessions (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  partner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, partner_id),
  constraint report_shares_not_self check (owner_id <> partner_id)
);
create index if not exists report_shares_partner on public.report_shares (partner_id);

alter table public.report_shares enable row level security;
drop policy if exists report_shares_parties_read on public.report_shares;
create policy report_shares_parties_read on public.report_shares for select to authenticated
  using ((select auth.uid()) in (owner_id, partner_id));
revoke all on public.report_shares from anon, authenticated;
grant select on public.report_shares to authenticated;
grant all on public.report_shares to service_role;

-- ── Peer notes ───────────────────────────────────────────────────────────
create table if not exists public.peer_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  -- Seconds into the session's video; empty for a note about the whole session.
  video_time_s numeric(7,2) check (video_time_s between 0 and 36000),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists peer_notes_session on public.peer_notes (session_id, video_time_s);

-- ── Checks ───────────────────────────────────────────────────────────────
-- A signed-in player with a full account (guest accounts cannot link).
create or replace function public.partner_check_caller() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'partners: sign in first' using errcode = '42501';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'partners: guest accounts cannot link partners; create an account first' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = me) then
    raise exception 'partners: finish setting up your profile first' using errcode = '42501';
  end if;
  return me;
end $$;

create or replace function public.partners_linked(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.partners p where p.status = 'active'
    and ((p.inviter_id = p_a and p.invitee_id = p_b) or (p.inviter_id = p_b and p.invitee_id = p_a)))
$$;

-- The caller is a linked partner the session is shared with.
create or replace function public.partner_can_view(p_session_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.report_shares rs
    where rs.session_id = p_session_id and rs.partner_id = auth.uid() and public.partners_linked(rs.owner_id, rs.partner_id))
$$;

-- Used by the storage policy below: the video of a session shared with the caller.
create or replace function public.partner_can_view_video(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.video_assets v
    where v.storage_path = p_name and v.upload_status = 'uploaded' and v.raw_video_deleted_at is null
      and public.partner_can_view(v.session_id))
$$;

alter table public.peer_notes enable row level security;
-- Session owners read every note on their sessions; partners read their own
-- notes, and only while the session is still shared with them.
drop policy if exists peer_notes_read on public.peer_notes;
create policy peer_notes_read on public.peer_notes for select to authenticated
  using (owner_id = (select auth.uid())
    or (author_id = (select auth.uid()) and public.partner_can_view(session_id)));
revoke all on public.peer_notes from anon, authenticated;
grant select on public.peer_notes to authenticated;
grant all on public.peer_notes to service_role;

-- A partner may create a short-lived signed link to a shared session's video.
drop policy if exists session_videos_select_partner on storage.objects;
create policy session_videos_select_partner on storage.objects for select to authenticated
  using (bucket_id = 'session-videos' and public.partner_can_view_video(name));

-- ── Linking ──────────────────────────────────────────────────────────────
create or replace function public.partner_limit_check(p_player uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select count(*) from public.partners p where p.status = 'active' and p_player in (p.inviter_id, p.invitee_id)) >= 20 then
    raise exception 'partners: a player can have at most 20 partners' using errcode = 'P0001';
  end if;
end $$;

-- A one-time code to send to someone, valid for 7 days.
create or replace function public.create_partner_invite()
returns table (id uuid, invite_code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  me uuid := public.partner_check_caller();
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea;
  code text;
  i int;
  new_id uuid;
begin
  if (select count(*) from public.partners p
      where p.inviter_id = me and p.invitee_id is null and p.status = 'pending' and p.expires_at > now()) >= 3 then
    raise exception 'partners: you already have 3 unused invite codes; cancel one first' using errcode = 'P0001';
  end if;
  loop
    -- Bytes 0-5 and 10-11 of a random UUID are fully random; 256 is a multiple of 32, so no bias.
    b := uuid_send(gen_random_uuid());
    code := '';
    foreach i in array array[0, 1, 2, 3, 4, 5, 10, 11] loop
      code := code || substr(alphabet, get_byte(b, i) % 32 + 1, 1);
    end loop;
    begin
      insert into public.partners (inviter_id, invite_code) values (me, code) returning partners.id into new_id;
      exit;
    exception when unique_violation then
      -- The same code already exists; draw another.
    end;
  end loop;
  return query select p.id, p.invite_code, p.expires_at from public.partners p where p.id = new_id;
end $$;

create or replace function public.redeem_partner_code(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.partner_check_caller();
  c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  invite public.partners;
begin
  select * into invite from public.partners p
   where p.invite_code = c and p.status = 'pending' and p.invitee_id is null
   for update;
  if not found or invite.expires_at <= now() then
    raise exception 'partners: this code is not valid or has expired; ask for a new one' using errcode = 'P0001';
  end if;
  if invite.inviter_id = me then
    raise exception 'partners: this is your own code; send it to the player you want to link with' using errcode = 'P0001';
  end if;
  perform public.partner_limit_check(me);
  perform public.partner_limit_check(invite.inviter_id);
  begin
    update public.partners set invitee_id = me, status = 'active', linked_at = now() where id = invite.id;
  exception when unique_violation then
    raise exception 'partners: you are already partners with this player, or an invite between you is waiting' using errcode = 'P0001';
  end;
  return invite.id;
end $$;

-- After an accepted buddy session, either player can invite the other straight from Buddy.
create or replace function public.invite_buddy_as_partner(p_player uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.partner_check_caller();
  new_id uuid;
begin
  if not exists (select 1 from public.buddy_requests r where r.status = 'accepted'
                 and ((r.from_player_id = me and r.to_player_id = p_player) or (r.from_player_id = p_player and r.to_player_id = me))) then
    raise exception 'partners: you can invite a buddy once a buddy session between you is accepted' using errcode = 'P0001';
  end if;
  perform public.partner_limit_check(me);
  begin
    insert into public.partners (inviter_id, invitee_id) values (me, p_player) returning id into new_id;
  exception when unique_violation then
    raise exception 'partners: you are already partners with this player, or an invite between you is waiting' using errcode = 'P0001';
  end;
  return new_id;
end $$;

create or replace function public.respond_partner_invite(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.partner_check_caller();
  other uuid;
begin
  select p.inviter_id into other from public.partners p
   where p.id = p_id and p.invitee_id = me and p.status = 'pending' and p.expires_at > now() for update;
  if not found then
    raise exception 'partners: this invite is no longer waiting for your answer' using errcode = 'P0001';
  end if;
  if p_accept then
    perform public.partner_limit_check(me);
    perform public.partner_limit_check(other);
  end if;
  update public.partners
     set status = case when p_accept then 'active' else 'declined' end,
         linked_at = case when p_accept then now() end, ended_at = case when p_accept then null else now() end
   where id = p_id;
end $$;

-- The inviter withdraws a code or an invite nobody has answered yet.
create or replace function public.cancel_partner_invite(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  update public.partners set status = 'cancelled', ended_at = now(), ended_by = me
   where id = p_id and inviter_id = me and status = 'pending';
  if not found then
    raise exception 'partners: only an invite you sent that is still waiting can be cancelled' using errcode = 'P0001';
  end if;
end $$;

-- Either player can unlink at any time; every share between them ends at once.
create or replace function public.end_partnership(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  a uuid;
  b uuid;
begin
  update public.partners set status = 'ended', ended_at = now(), ended_by = me
   where id = p_id and me in (inviter_id, invitee_id) and status = 'active'
   returning inviter_id, invitee_id into a, b;
  if not found then
    raise exception 'partners: only a current partner link can be ended' using errcode = 'P0001';
  end if;
  delete from public.report_shares rs
   where (rs.owner_id = a and rs.partner_id = b) or (rs.owner_id = b and rs.partner_id = a);
end $$;

-- Current partners and waiting invites, with the other player's name and level.
drop function if exists public.my_partners();
create function public.my_partners()
returns table (id uuid, status text, direction text, other_id uuid, other_name text, other_level text,
               invite_code text, created_at timestamptz, expires_at timestamptz, linked_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'partners: sign in first' using errcode = '42501';
  end if;
  return query
  select p.id, p.status, case when p.inviter_id = me then 'sent' else 'received' end,
         o.id, o.display_name, public.buddy_level(o.self_level),
         case when p.inviter_id = me then p.invite_code end, p.created_at, p.expires_at, p.linked_at
  from public.partners p
  left join public.profiles o on o.id = case when p.inviter_id = me then p.invitee_id else p.inviter_id end
  where me in (p.inviter_id, p.invitee_id)
    and (p.status = 'active' or (p.status = 'pending' and p.expires_at > now()))
  order by (p.status = 'active') desc, o.display_name, p.created_at desc
  limit 100;
end $$;

-- ── Sharing ──────────────────────────────────────────────────────────────
create or replace function public.share_session(p_session_id uuid, p_partner_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.partner_check_caller();
begin
  if not exists (select 1 from public.sessions s where s.id = p_session_id and s.owner_id = me) then
    raise exception 'partners: you can share only your own sessions' using errcode = '42501';
  end if;
  if not public.partners_linked(me, p_partner_id) then
    raise exception 'partners: you can share only with a linked partner' using errcode = 'P0001';
  end if;
  insert into public.report_shares (session_id, owner_id, partner_id) values (p_session_id, me, p_partner_id)
  on conflict do nothing;
end $$;

create or replace function public.unshare_session(p_session_id uuid, p_partner_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.report_shares where session_id = p_session_id and partner_id = p_partner_id and owner_id = auth.uid();
end $$;

-- Sessions partners shared with the caller.
drop function if exists public.shared_with_me();
create function public.shared_with_me()
returns table (session_id uuid, owner_id uuid, owner_name text, title text, session_date date,
               session_context text, play_format text, has_report boolean, my_notes bigint, shared_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'partners: sign in first' using errcode = '42501';
  end if;
  return query
  select s.id, s.owner_id, o.display_name, s.title, s.session_date, s.session_context, s.play_format,
         exists (select 1 from public.analysis_results r where r.session_id = s.id),
         (select count(*) from public.peer_notes n where n.session_id = s.id and n.author_id = me),
         rs.created_at
  from public.report_shares rs
  join public.sessions s on s.id = rs.session_id
  join public.profiles o on o.id = rs.owner_id
  where rs.partner_id = me and public.partners_linked(rs.owner_id, me)
  order by s.session_date desc, rs.created_at desc
  limit 200;
end $$;

-- What a partner sees of a shared session: its name, date and format, the
-- video report and the video's storage path. Nothing else from the session.
create or replace function public.shared_report(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  out jsonb;
begin
  if not public.partner_can_view(p_session_id) then
    raise exception 'partners: this session is not shared with you' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'session', jsonb_build_object('id', s.id, 'title', s.title, 'session_date', s.session_date,
      'session_context', s.session_context, 'play_format', s.play_format, 'owner_id', s.owner_id, 'owner_name', o.display_name),
    'result', (select r.result from public.video_assets v
                 join public.analysis_jobs j on j.video_asset_id = v.id
                 join public.analysis_results r on r.job_id = j.id
                where v.session_id = s.id limit 1),
    'video_path', (select v.storage_path from public.video_assets v
                    where v.session_id = s.id and v.upload_status = 'uploaded'
                      and v.raw_video_deleted_at is null and v.raw_video_deleting_at is null))
  into out
  from public.sessions s join public.profiles o on o.id = s.owner_id
  where s.id = p_session_id;
  return out;
end $$;

-- ── Notes ────────────────────────────────────────────────────────────────
-- Owners see every note on their session; partners see their own.
drop function if exists public.session_peer_notes(uuid);
create function public.session_peer_notes(p_session_id uuid)
returns table (id uuid, author_id uuid, author_name text, mine boolean, video_time_s numeric,
               body text, created_at timestamptz, updated_at timestamptz)
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
  select n.id, n.author_id, a.display_name, n.author_id = me, n.video_time_s, n.body, n.created_at, n.updated_at
  from public.peer_notes n join public.profiles a on a.id = n.author_id
  where n.session_id = p_session_id and (is_owner or n.author_id = me)
  order by n.video_time_s nulls first, n.created_at
  limit 500;
end $$;

create or replace function public.add_peer_note(p_session_id uuid, p_video_time_s numeric, p_body text) returns uuid
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
  if (select count(*) from public.peer_notes n where n.session_id = p_session_id and n.author_id = me) >= 200 then
    raise exception 'partners: you can leave at most 200 notes on one session' using errcode = 'P0001';
  end if;
  insert into public.peer_notes (session_id, owner_id, author_id, video_time_s, body)
  select s.id, s.owner_id, me, round(p_video_time_s, 2), text_ from public.sessions s where s.id = p_session_id
  returning id into new_id;
  return new_id;
end $$;

-- Authors edit only their own notes, and only while the session is shared with them.
create or replace function public.edit_peer_note(p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  text_ text := btrim(coalesce(p_body, ''), E' \t\r\n');
begin
  if char_length(text_) not between 1 and 500 then
    raise exception 'partners: write a note of 1 to 500 characters' using errcode = '22023';
  end if;
  update public.peer_notes n set body = text_, updated_at = now()
   where n.id = p_id and n.author_id = me and public.partner_can_view(n.session_id);
  if not found then
    raise exception 'partners: you can edit only your own notes on a session shared with you' using errcode = '42501';
  end if;
end $$;

-- The author (while shared) or the session owner (always) can delete a note.
create or replace function public.delete_peer_note(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  delete from public.peer_notes n
   where n.id = p_id and (n.owner_id = me or (n.author_id = me and public.partner_can_view(n.session_id)));
  if not found then
    raise exception 'partners: you can delete only your own notes or notes on your sessions' using errcode = '42501';
  end if;
end $$;

revoke all on function public.partner_check_caller(), public.partners_linked(uuid, uuid), public.partner_can_view(uuid),
  public.partner_can_view_video(text), public.partner_limit_check(uuid), public.create_partner_invite(),
  public.redeem_partner_code(text), public.invite_buddy_as_partner(uuid), public.respond_partner_invite(uuid, boolean),
  public.cancel_partner_invite(uuid), public.end_partnership(uuid), public.my_partners(),
  public.share_session(uuid, uuid), public.unshare_session(uuid, uuid), public.shared_with_me(), public.shared_report(uuid),
  public.session_peer_notes(uuid), public.add_peer_note(uuid, numeric, text), public.edit_peer_note(uuid, text),
  public.delete_peer_note(uuid) from public, anon;
-- partner_can_view and partner_can_view_video are used inside row and storage policies.
grant execute on function public.partner_can_view(uuid), public.partner_can_view_video(text), public.create_partner_invite(),
  public.redeem_partner_code(text), public.invite_buddy_as_partner(uuid), public.respond_partner_invite(uuid, boolean),
  public.cancel_partner_invite(uuid), public.end_partnership(uuid), public.my_partners(),
  public.share_session(uuid, uuid), public.unshare_session(uuid, uuid), public.shared_with_me(), public.shared_report(uuid),
  public.session_peer_notes(uuid), public.add_peer_note(uuid, numeric, text), public.edit_peer_note(uuid, text),
  public.delete_peer_note(uuid) to authenticated;
