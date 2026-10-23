-- Partners and peer coaching: link by code or from Buddy, share chosen sessions, timestamped notes.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- P = Pia (shares her session), Q = Quinn (her partner), R = Rex (outsider), G = guest.
insert into auth.users (id, email, is_anonymous) values
  ('c1111111-1111-4111-8111-111111111111', 'pia@example.test', false),
  ('c2222222-2222-4222-8222-222222222222', 'quinn@example.test', false),
  ('c3333333-3333-4333-8333-333333333333', 'rex@example.test', false),
  ('c5555555-5555-4555-8555-555555555555', null, true);
insert into public.profiles (id, display_name, self_level, is_adult_confirmed, buddy_visible) values
  ('c1111111-1111-4111-8111-111111111111', 'Pia', 'Intermediate', true, true),
  ('c2222222-2222-4222-8222-222222222222', 'Quinn', 'Advanced', true, true),
  ('c3333333-3333-4333-8333-333333333333', 'Rex', 'Novice', true, true),
  ('c5555555-5555-4555-8555-555555555555', 'Guest', null, false, false);

-- Pia's session with an uploaded video and a finished report, plus a second session she keeps private.
insert into public.sessions (id, owner_id, title, session_context, play_format, notes) values
  ('5e000000-0000-4000-8000-0000000000e1', 'c1111111-1111-4111-8111-111111111111', 'Sunday doubles', 'casual_match', 'doubles', 'private note'),
  ('5e000000-0000-4000-8000-0000000000e2', 'c1111111-1111-4111-8111-111111111111', 'Private drills', 'practice', 'doubles', null);
insert into public.video_assets (id, owner_id, session_id, storage_path, original_filename, mime_type, byte_size, upload_status, uploaded_at) values
  ('7e000000-0000-4000-8000-0000000000e1', 'c1111111-1111-4111-8111-111111111111', '5e000000-0000-4000-8000-0000000000e1',
   'c1111111-1111-4111-8111-111111111111/5e000000-0000-4000-8000-0000000000e1/7e000000-0000-4000-8000-0000000000e1.mp4',
   'sunday.mp4', 'video/mp4', 1000, 'uploaded', now());
insert into storage.objects (bucket_id, name, metadata) values ('session-videos',
  'c1111111-1111-4111-8111-111111111111/5e000000-0000-4000-8000-0000000000e1/7e000000-0000-4000-8000-0000000000e1.mp4', '{"size":1000}');
insert into public.analysis_jobs (id, owner_id, video_asset_id, session_id, status) values
  ('9e000000-0000-4000-8000-0000000000e1', 'c1111111-1111-4111-8111-111111111111', '7e000000-0000-4000-8000-0000000000e1',
   '5e000000-0000-4000-8000-0000000000e1', 'completed');
insert into public.analysis_results (job_id, owner_id, session_id, video_asset_id, schema_version, result_status, data_origin, pipeline_version, result) values
  ('9e000000-0000-4000-8000-0000000000e1', 'c1111111-1111-4111-8111-111111111111', '5e000000-0000-4000-8000-0000000000e1',
   '7e000000-0000-4000-8000-0000000000e1', '1', 'ok', 'measured', 'test', '{"schema_version":"1","marker":"report"}');

set role authenticated;

-- ── Pia makes a code; Quinn uses it ──────────────────────────────────────
select set_config('request.jwt.claim.sub', 'c1111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"c1111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select invite_code as pia_code from public.create_partner_invite() \gset
select tests.expect_true(:'pia_code' ~ '^[A-HJ-NP-Z2-9]{8}$', 'an invite code is 8 easy-to-read characters');
select tests.expect_error(format($$ select public.redeem_partner_code(%L) $$, :'pia_code'), 'a player cannot use their own code');
select tests.expect_error($$ select public.share_session('5e000000-0000-4000-8000-0000000000e1', 'c2222222-2222-4222-8222-222222222222') $$,
  'sessions can be shared only with a linked partner');
select public.create_partner_invite();
select public.create_partner_invite();
select tests.expect_error($$ select public.create_partner_invite() $$, 'at most 3 unused codes at a time');
select tests.expect_error($$ insert into public.partners (inviter_id, invitee_id, status)
  values ('c1111111-1111-4111-8111-111111111111', 'c3333333-3333-4333-8333-333333333333', 'active') $$,
  'links cannot be written directly, only through the checked functions');

select set_config('request.jwt.claim.sub', 'c5555555-5555-4555-8555-555555555555', false);
select set_config('request.jwt.claims', '{"sub":"c5555555-5555-4555-8555-555555555555","is_anonymous":true}', false);
select tests.expect_error(format($$ select public.redeem_partner_code(%L) $$, :'pia_code'), 'guest accounts cannot link partners');

select set_config('request.jwt.claim.sub', 'c2222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claims', '{"sub":"c2222222-2222-4222-8222-222222222222","is_anonymous":false}', false);
select tests.expect_error($$ select public.redeem_partner_code('ZZZZ-ZZZZ') $$, 'an unknown code is rejected');
select tests.expect_true(public.redeem_partner_code(lower(substr(:'pia_code', 1, 4) || '-' || substr(:'pia_code', 5))) is not null,
  'the code works typed in lower case with a dash');
select tests.expect_error(format($$ select public.redeem_partner_code(%L) $$, :'pia_code'), 'a code works only once');
select tests.expect_true((select other_name || ' ' || other_level || ' ' || status from public.my_partners() where status = 'active') = 'Pia intermediate active',
  'the new partner sees who they are linked with');
select id as link_id from public.my_partners() where status = 'active' \gset
select tests.expect_count($$ select 1 from public.shared_with_me() $$, 0, 'nothing is shared until the owner chooses');
select tests.expect_error($$ select public.shared_report('5e000000-0000-4000-8000-0000000000e1') $$, 'an unshared session cannot be opened');
select tests.expect_count($$ select 1 from storage.objects where bucket_id = 'session-videos' $$, 0, 'an unshared video cannot be read');

-- ── Pia shares one session ──────────────────────────────────────────────
select set_config('request.jwt.claim.sub', 'c1111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"c1111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select public.share_session('5e000000-0000-4000-8000-0000000000e1', 'c2222222-2222-4222-8222-222222222222');
select public.share_session('5e000000-0000-4000-8000-0000000000e1', 'c2222222-2222-4222-8222-222222222222');
select tests.expect_count($$ select 1 from public.report_shares $$, 1, 'the owner sees one share (sharing twice changes nothing)');

select set_config('request.jwt.claim.sub', 'c2222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claims', '{"sub":"c2222222-2222-4222-8222-222222222222","is_anonymous":false}', false);
select tests.expect_error($$ select public.share_session('5e000000-0000-4000-8000-0000000000e2', 'c1111111-1111-4111-8111-111111111111') $$,
  'a player cannot share someone else''s session');
select tests.expect_true((select owner_name || ' / ' || title || ' / ' || has_report from public.shared_with_me()) = 'Pia / Sunday doubles / true',
  'the partner sees the shared session in their list');
select tests.expect_true((select public.shared_report('5e000000-0000-4000-8000-0000000000e1') -> 'result' ->> 'marker') = 'report',
  'the partner can open the shared video report');
select tests.expect_true((select public.shared_report('5e000000-0000-4000-8000-0000000000e1') ->> 'video_path') like 'c1111111-%.mp4',
  'the shared report includes the video');
select tests.expect_true(not (public.shared_report('5e000000-0000-4000-8000-0000000000e1') -> 'session' ? 'notes'),
  'the owner''s private session notes are not shared');
select tests.expect_count($$ select 1 from storage.objects where bucket_id = 'session-videos' $$, 1, 'the partner can read the shared video');
select tests.expect_error($$ select public.shared_report('5e000000-0000-4000-8000-0000000000e2') $$,
  'sessions the owner did not share stay private');
select tests.expect_count($$ select 1 from public.sessions $$, 0, 'the partner still cannot read the owner''s sessions table');
select tests.expect_count($$ select 1 from public.analysis_results $$, 0, 'or the owner''s results table');

-- ── Peer notes ───────────────────────────────────────────────────────────
select tests.expect_true(public.add_peer_note('5e000000-0000-4000-8000-0000000000e1', 42.5, ' You stayed back after the return ') is not null,
  'the partner leaves a note at 0:42');
select tests.expect_error($$ select public.add_peer_note('5e000000-0000-4000-8000-0000000000e1', 10, '   ') $$, 'an empty note is rejected');
select tests.expect_error($$ select public.add_peer_note('5e000000-0000-4000-8000-0000000000e1', 10, repeat('x', 501)) $$, 'a note is at most 500 characters');
select tests.expect_error($$ select public.add_peer_note('5e000000-0000-4000-8000-0000000000e2', 10, 'hi') $$, 'no notes on unshared sessions');
select tests.expect_error($$ insert into public.peer_notes (session_id, owner_id, author_id, body) values
  ('5e000000-0000-4000-8000-0000000000e1', 'c1111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222', 'x') $$,
  'notes cannot be written directly');
select id as note_id from public.session_peer_notes('5e000000-0000-4000-8000-0000000000e1') \gset
select public.edit_peer_note(:'note_id', 'You stayed back after the return. Move up to the kitchen.');
select tests.expect_true((select body = 'You stayed back after the return. Move up to the kitchen.' and video_time_s = 42.5 and mine
  from public.session_peer_notes('5e000000-0000-4000-8000-0000000000e1')), 'the author edits their own note; the time stays');

select set_config('request.jwt.claim.sub', 'c1111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"c1111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select tests.expect_true((select author_name || ' ' || video_time_s || ' ' || not mine from public.session_peer_notes('5e000000-0000-4000-8000-0000000000e1'))
  = 'Quinn 42.50 true', 'the owner sees the partner''s note with its time');
select tests.expect_error(format($$ select public.edit_peer_note(%L, 'changed') $$, :'note_id'), 'the owner cannot edit a partner''s note');
select tests.expect_error(format($$ select public.add_peer_note('5e000000-0000-4000-8000-0000000000e1', 1, 'self') $$),
  'notes come from partners, not the owner');

-- ── Rex is not linked ───────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', 'c3333333-3333-4333-8333-333333333333', false);
select set_config('request.jwt.claims', '{"sub":"c3333333-3333-4333-8333-333333333333","is_anonymous":false}', false);
select tests.expect_error($$ select public.shared_report('5e000000-0000-4000-8000-0000000000e1') $$, 'other players cannot open the report');
select tests.expect_error($$ select * from public.session_peer_notes('5e000000-0000-4000-8000-0000000000e1') $$, 'other players cannot read the notes');
select tests.expect_count($$ select 1 from public.peer_notes $$, 0, 'other players see no notes in the table');
select tests.expect_count($$ select 1 from storage.objects where bucket_id = 'session-videos' $$, 0, 'other players cannot read the video');
select tests.expect_error(format($$ select public.end_partnership(%L) $$, :'link_id'), 'other players cannot end someone else''s link');

-- ── Revoking a share hides the report and notes from the partner ─────────
select set_config('request.jwt.claim.sub', 'c1111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"c1111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select public.unshare_session('5e000000-0000-4000-8000-0000000000e1', 'c2222222-2222-4222-8222-222222222222');
select set_config('request.jwt.claim.sub', 'c2222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claims', '{"sub":"c2222222-2222-4222-8222-222222222222","is_anonymous":false}', false);
select tests.expect_error($$ select public.shared_report('5e000000-0000-4000-8000-0000000000e1') $$, 'after revoking, the partner cannot open the report');
select tests.expect_count($$ select 1 from public.peer_notes $$, 0, 'after revoking, the partner cannot read their notes');
select tests.expect_error(format($$ select public.edit_peer_note(%L, 'late edit') $$, :'note_id'), 'after revoking, the partner cannot edit their note');
select tests.expect_count($$ select 1 from storage.objects where bucket_id = 'session-videos' $$, 0, 'after revoking, the partner cannot read the video');

-- ── Unlinking ends every share ──────────────────────────────────────────
select set_config('request.jwt.claim.sub', 'c1111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"c1111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select public.share_session('5e000000-0000-4000-8000-0000000000e1', 'c2222222-2222-4222-8222-222222222222');
select public.share_session('5e000000-0000-4000-8000-0000000000e2', 'c2222222-2222-4222-8222-222222222222');
select set_config('request.jwt.claim.sub', 'c2222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claims', '{"sub":"c2222222-2222-4222-8222-222222222222","is_anonymous":false}', false);
select tests.expect_count($$ select 1 from public.shared_with_me() $$, 2, 'the partner sees both shared sessions');
select public.end_partnership(:'link_id');
select tests.expect_count($$ select 1 from public.shared_with_me() $$, 0, 'unlinking ends every share');
select tests.expect_count($$ select 1 from public.report_shares $$, 0, 'unlinking removes the share rows');
select tests.expect_count($$ select 1 from public.my_partners() $$, 0, 'the link is no longer listed');
select set_config('request.jwt.claim.sub', 'c1111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"c1111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select tests.expect_count($$ select 1 from public.session_peer_notes('5e000000-0000-4000-8000-0000000000e1') $$, 1,
  'the owner keeps the notes left on their session');
select public.delete_peer_note(:'note_id');
select tests.expect_count($$ select 1 from public.peer_notes $$, 0, 'the owner can delete any note on their session');

-- ── From Buddy: invite an accepted buddy, who must accept ───────────────
select tests.expect_error($$ select public.invite_buddy_as_partner('c3333333-3333-4333-8333-333333333333') $$,
  'only players with an accepted buddy session can be invited from Buddy');
select public.send_buddy_request('c3333333-3333-4333-8333-333333333333', 'practice', 'doubles',
  format('[{"date":"%s","start":"08:00","end":"10:00"}]', current_date + 1)::jsonb, 'Makati', 'Ayala Triangle courts');
select set_config('request.jwt.claim.sub', 'c3333333-3333-4333-8333-333333333333', false);
select set_config('request.jwt.claims', '{"sub":"c3333333-3333-4333-8333-333333333333","is_anonymous":false}', false);
select public.respond_buddy_request((select id from public.my_buddy_requests() limit 1), true);
select tests.expect_true(public.invite_buddy_as_partner('c1111111-1111-4111-8111-111111111111') is not null, 'an accepted buddy can be invited as a partner');
select tests.expect_error($$ select public.invite_buddy_as_partner('c1111111-1111-4111-8111-111111111111') $$, 'only one waiting invite per pair');
select set_config('request.jwt.claim.sub', 'c1111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claims', '{"sub":"c1111111-1111-4111-8111-111111111111","is_anonymous":false}', false);
select tests.expect_count($$ select 1 from public.partners where invitee_id = auth.uid() and status = 'pending' $$, 1,
  'the invited player can count waiting invites (notification badge)');
select tests.expect_true((select other_name from public.my_partners() where direction = 'received') = 'Rex', 'the invited player sees who asked');
select tests.expect_true((select count(*) = 2 and bool_and(other_id is null and invite_code is not null) from public.my_partners() where direction = 'sent'),
  'unused codes are listed for the player who made them');
select id as rex_invite from public.my_partners() where direction = 'received' \gset
select public.respond_partner_invite(:'rex_invite', true);
select tests.expect_true((select status from public.my_partners() where id = :'rex_invite') = 'active', 'accepting links the two players');
select tests.expect_error(format($$ select public.respond_partner_invite(%L, true) $$, :'rex_invite'), 'an answered invite cannot be answered again');
select public.cancel_partner_invite((select id from public.my_partners() where direction = 'sent' limit 1));
select tests.expect_count($$ select 1 from public.my_partners() where direction = 'sent' and status = 'pending' $$, 1, 'the player can cancel an unused code');
reset role;
select set_config('request.jwt.claims', '', false);
