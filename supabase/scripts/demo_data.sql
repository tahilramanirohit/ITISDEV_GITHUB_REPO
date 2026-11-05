-- PicklePro demo data: four sign-in accounts with 6-9 weeks of history, for the
-- walkthrough "with data" (the blank-slate walkthrough uses a new sign-up).
--
-- Paste the whole file into Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Needs every update through pickleproapp_upgrade_10.sql. Running it again
-- deletes the four demo accounts (and everything they own) and creates them fresh.
--
-- Accounts (password below; change it first if this repository is public):
--   bea.reyes@picklepro.demo   Beginner, mostly solo drills, a buddy request waiting for her
--   marco.santos@picklepro.demo  Intermediate, 10 games with results and journal, court tests,
--                                a partner (Lia) who rated two skills, a buddy session coming up
--   lia.cruz@picklepro.demo    Advanced, competition, Marco's partner and buddy
--   jun.tan@picklepro.demo     Novice, looking for practice
--
-- Only self-reported data is created (ratings, results, journal, court test counts,
-- buddy and partner activity). No video reports are faked: upload a real clip with
-- the analyzer running to show the video part.

begin;

-- Past-dated history: keep the original capture times instead of "now".
alter table public.checkins disable trigger checkin_timing;
alter table public.recovery_logs disable trigger recovery_capture_time;
alter table public.reflections disable trigger reflection_capture_time;

create or replace function pg_temp.demo_user(p_email text, p_password text) returns uuid
language plpgsql as $$
declare
  uid uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', p_email,
          extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{}', now() - interval '70 days', now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', p_email, 'email_verified', true),
          'email', now(), now(), now());
  return uid;
end $$;

-- One logged session: the session, its self-rating, and the pre-game, post-game and reflection entries.
create or replace function pg_temp.demo_session(p_owner uuid, p_days_ago int, p_title text, p_context text, p_format text,
  p_ratings jsonb, p_played int, p_won int, p_errors text, p_result text, p_score text,
  p_sleep numeric, p_readiness int, p_warmup boolean, p_exertion int, p_soreness int,
  p_went_well text, p_change_next text, p_struggle text default null, p_buddy_request uuid default null) returns uuid
language plpgsql as $$
declare
  d date := current_date - p_days_ago;
  start_at timestamptz := (current_date - p_days_ago) + time '18:00';
  sid uuid;
  pid uuid;
begin
  insert into public.sessions (owner_id, title, session_date, session_context, play_format, review_mode, improvement_goals,
                               match_result, match_score, actual_start_at, created_at, updated_at, buddy_request_id)
  values (p_owner, p_title, d, p_context, p_format, 'self', array['positioning', 'shot_technique'],
          p_result, p_score, start_at, start_at + interval '3 hours', start_at + interval '3 hours', p_buddy_request)
  returning id into sid;
  select id into pid from public.session_participants where session_id = sid and role = 'uploader';
  if p_ratings is not null then
    insert into public.self_assessments (session_id, owner_id, ratings, games_played, games_won, unforced_errors, biggest_struggle)
    values (sid, p_owner, p_ratings, p_played, p_won, p_errors, p_struggle);
  end if;
  insert into public.checkins (participant_id, captured_at, warmup_done, sleep_hours, readiness, focus, timing_status)
  values (pid, start_at - interval '45 minutes', p_warmup, p_sleep, p_readiness, 'Get to the kitchen line after the return', 'pre_game');
  insert into public.recovery_logs (participant_id, captured_at, exertion, soreness, cooldown_done)
  values (pid, start_at + interval '2 hours', p_exertion, p_soreness, p_soreness < 4);
  insert into public.reflections (participant_id, captured_at, went_well, change_next)
  values (pid, start_at + interval '2 hours 10 minutes', p_went_well, p_change_next);
  return sid;
end $$;

do $$
declare
  pw constant text := 'PickleDemo-2026';
  bea uuid; marco uuid; lia uuid; jun uuid;
  marco_lia uuid; marco_jun uuid; jun_bea uuid;
  shared uuid;
  i int;
  sleep numeric;
  boost int;
begin
  -- Start fresh: deleting the users removes everything they own. Sessions go first:
  -- deleting a user directly would try to empty the session's uploader link.
  delete from public.sessions where owner_id in (select id from auth.users where email like '%@picklepro.demo');
  delete from auth.users where email like '%@picklepro.demo';

  bea := pg_temp.demo_user('bea.reyes@picklepro.demo', pw);
  marco := pg_temp.demo_user('marco.santos@picklepro.demo', pw);
  lia := pg_temp.demo_user('lia.cruz@picklepro.demo', pw);
  jun := pg_temp.demo_user('jun.tan@picklepro.demo', pw);

  insert into public.profiles (id, display_name, dominant_hand, years_playing, usual_format, self_level, is_adult_confirmed,
    play_frequency, play_reasons, main_goals, baseline_ratings, onboarding_completed_at, bio, home_court,
    default_review_mode, default_session_kind, buddy_visible, buddy_looking_for) values
  (bea, 'Bea Reyes', 'right', 0.5, 'doubles', 'Beginner', true, 'weekly', array['fun', 'fitness'], array['shot_technique'],
   '{"serve": 2, "return": 2, "dinking": 1, "consistency": 2, "footwork": 2}', now() - interval '43 days',
   'New to pickleball, practising drills twice a week.', 'Pasig Sports Center', 'self', 'solo', true, array['practice']),
  (marco, 'Marco Santos', 'right', 2, 'doubles', 'Intermediate', true, 'few_per_week', array['compete', 'social'],
   array['positioning', 'shot_technique'],
   '{"serve": 3, "return": 3, "third_shot": 2, "dinking": 2, "volleys": 3, "kitchen_line": 2, "consistency": 3, "strategy": 3}',
   now() - interval '64 days', 'League doubles on weeknights.', 'BGC Pickle Hub', 'self', 'match', true, array['practice', 'competition']),
  (lia, 'Lia Cruz', 'left', 5, 'both', 'Advanced', true, 'few_per_week', array['compete', 'tournaments'], array['shot_outcomes'],
   '{"serve": 4, "return": 4, "third_shot": 4, "dinking": 5, "volleys": 4, "kitchen_line": 5, "consistency": 4, "strategy": 4}',
   now() - interval '60 days', 'Tournament player. Happy to help newer players.', 'Capitol Commons', 'self', 'match', true,
   array['competition']),
  (jun, 'Jun Tan', 'right', 1, 'doubles', 'Novice', true, 'weekly', array['fun', 'social'], array['positioning'],
   '{"serve": 3, "return": 2, "dinking": 2, "kitchen_line": 2, "consistency": 2}', now() - interval '30 days',
   'Looking for practice partners on weekends.', 'Makati Pickleball Courts', 'self', 'match', true, array['practice', 'casual_game']);

  -- ── Buddy sessions ───────────────────────────────────────────────────
  -- Marco and Lia: an accepted practice session six weeks ago.
  insert into public.buddy_requests (from_player_id, to_player_id, purpose, play_format, slots, status, city, location, created_at, responded_at)
  values (marco, lia, 'practice', 'doubles', jsonb_build_array(jsonb_build_object('date', current_date - 42, 'start', '18:00', 'end', '20:00')),
          'accepted', 'Taguig', 'BGC Pickle Hub, court 2', now() - interval '45 days', now() - interval '44 days')
  returning id into marco_lia;
  -- Marco and Jun: accepted, coming up next week ("Coming up" card and "Log this session").
  insert into public.buddy_requests (from_player_id, to_player_id, purpose, play_format, slots, status, city, location, created_at, responded_at)
  values (marco, jun, 'casual_game', 'doubles', jsonb_build_array(
            jsonb_build_object('date', current_date + 3, 'start', '17:00', 'end', '19:00'),
            jsonb_build_object('date', current_date + 6, 'start', '08:00', 'end', '10:00')),
          'accepted', 'Makati', 'Makati Pickleball Courts', now() - interval '2 days', now() - interval '1 day')
  returning id into marco_jun;
  -- Jun asks Bea: waiting for her answer (Buddy badge).
  insert into public.buddy_requests (from_player_id, to_player_id, purpose, play_format, slots, status, city, location, created_at)
  values (jun, bea, 'practice', 'doubles', jsonb_build_array(jsonb_build_object('date', current_date + 4, 'start', '07:00', 'end', '09:00')),
          'pending', 'Pasig', 'Pasig Sports Center', now() - interval '6 hours')
  returning id into jun_bea;

  -- ── Marco: 10 games over 9 weeks ─────────────────────────────────────
  -- Better ratings on nights with 7+ hours of sleep (shows on Progress, "Before and after your games").
  for i in 0..9 loop
    sleep := case when i % 2 = 0 then 7.5 else 6 end;
    boost := case when i % 2 = 0 then 1 else 0 end;
    perform pg_temp.demo_session(marco, (array[63, 56, 49, 45, 38, 31, 24, 17, 10, 3])[i + 1],
      (array['League night', 'Open play', 'League night', 'Practice with Lia', 'League night', 'Open play', 'Ladder match',
             'League night', 'Weekend doubles', 'League night'])[i + 1],
      'casual_match', 'doubles',
      jsonb_build_object('serve', 3, 'return', 3 + boost * (i / 5), 'third_shot', 2 + (i + boost) / 6,
        'dinking', least(4, 2 + (i + boost) / 4), 'volleys', 3, 'kitchen_line', least(4, 2 + (i + boost) / 3),
        'transition', 2 + boost, 'consistency', 3 + boost * (i / 4 > 0)::int, 'strategy', 3),
      3, least(3, 1 + (i + boost) / 4), (array['many', 'many', 'some', 'some', 'some', 'some', 'few', 'some', 'few', 'few'])[i + 1],
      case when (i + boost) % 3 = 0 then 'loss' else 'win' end, case when (i + boost) % 3 = 0 then '9-11' else '11-8' end,
      sleep, 3 + boost, i % 3 <> 1, case when i >= 8 then 8 else 6 end, case when i >= 8 then 4 else 2 end,
      (array['Deep serves all night', 'Stayed patient in dinks', 'Third shots landed soft', 'Got to the kitchen line',
             'Good communication', 'Returns were deep', 'Reset fast hands well', 'Won the long rallies',
             'Moved up after every return', 'Dinks were steady'])[i + 1],
      (array['Stop rushing the third shot', 'Split step earlier', 'Fewer pop-ups', 'Watch the middle', 'Move up faster',
             'Drop more, drive less', 'Keep paddle up', 'Stay low in dinks', 'Rest more between games', 'Ice the knee'])[i + 1],
      case when i < 4 then 'Third-shot drops kept popping up' else null end,
      case when i = 3 then marco_lia else null end);
  end loop;

  -- Marco shares his latest game with Lia, asking about dinking and third-shot drops (ratings only, no video).
  select id into shared from public.sessions where owner_id = marco order by session_date desc limit 1;
  insert into public.partners (inviter_id, invitee_id, status, created_at, expires_at, linked_at)
  values (marco, lia, 'active', now() - interval '41 days', now() - interval '34 days', now() - interval '40 days');
  insert into public.report_shares (session_id, owner_id, partner_id, focus_skills, with_video, created_at)
  values (shared, marco, lia, array['dinking', 'third_shot'], false, now() - interval '2 days');
  insert into public.peer_ratings (session_id, owner_id, author_id, skill, rating) values
    (shared, marco, lia, 'dinking', 3), (shared, marco, lia, 'third_shot', 2);
  insert into public.peer_notes (session_id, owner_id, author_id, video_time_s, body, skill) values
    (shared, marco, lia, null, 'Your dinks float when you rush. Stay low and push them to my backhand.', 'dinking'),
    (shared, marco, lia, null, 'Drops land short of the kitchen when you are tired. Bend your knees more.', 'third_shot'),
    (shared, marco, lia, null, 'Much better at moving up after the return than last month.', null);

  -- Court tests: a baseline nine weeks ago and a re-test ten days ago.
  insert into public.baseline_tests (owner_id, test_key, value, out_of, tested_on, created_at) values
    (marco, 'deep_serves', 9, 20, current_date - 63, now() - interval '63 days'),
    (marco, 'dinks_in_a_row', 8, null, current_date - 63, now() - interval '63 days'),
    (marco, 'third_shot_drops', 3, 10, current_date - 63, now() - interval '63 days'),
    (marco, 'deep_returns', 4, 10, current_date - 63, now() - interval '63 days'),
    (marco, 'rally_to_20', 9, 20, current_date - 63, now() - interval '63 days'),
    (marco, 'deep_serves', 14, 20, current_date - 10, now() - interval '10 days'),
    (marco, 'dinks_in_a_row', 11, null, current_date - 10, now() - interval '10 days'),
    (marco, 'third_shot_drops', 5, 10, current_date - 10, now() - interval '10 days'),
    (marco, 'deep_returns', 6, 10, current_date - 10, now() - interval '10 days'),
    (marco, 'rally_to_20', 13, 20, current_date - 10, now() - interval '10 days');

  -- ── Bea: six weeks of mostly solo drills ─────────────────────────────
  for i in 0..6 loop
    perform pg_temp.demo_session(bea, (array[41, 35, 28, 21, 14, 8, 2])[i + 1],
      (array['Wall drills', 'Serve practice', 'Wall drills', 'Open play', 'Dink drills', 'Serve practice', 'Open play'])[i + 1],
      case when i in (3, 6) then 'casual_match' else 'practice' end,
      case when i in (3, 6) then 'doubles' when i in (0, 2) then 'wall_practice' else 'drill_other' end,
      jsonb_build_object('serve', least(4, 2 + i / 3), 'return', 2, 'dinking', least(3, 1 + i / 2), 'consistency', 2 + i / 4, 'footwork', 2 + i / 5),
      case when i in (3, 6) then 3 else null end, case when i = 3 then 1 when i = 6 then 2 else null end,
      case when i in (3, 6) then (case when i = 3 then 'many' else 'some' end) else null end,
      case when i = 6 then 'win' when i = 3 then 'loss' else null end, case when i = 6 then '11-9' when i = 3 then '6-11' else null end,
      7 + (i % 2), 3 + (i % 2), true, 5, 2,
      'Felt more in control of my serve', 'Keep my paddle up between shots');
  end loop;
  insert into public.baseline_tests (owner_id, test_key, value, out_of, tested_on, created_at) values
    (bea, 'deep_serves', 5, 20, current_date - 42, now() - interval '42 days'),
    (bea, 'dinks_in_a_row', 3, null, current_date - 42, now() - interval '42 days'),
    (bea, 'deep_serves', 9, 20, current_date - 5, now() - interval '5 days'),
    (bea, 'dinks_in_a_row', 6, null, current_date - 5, now() - interval '5 days');

  -- ── Lia: competition games, one tournament ───────────────────────────
  for i in 0..5 loop
    perform pg_temp.demo_session(lia, (array[52, 40, 33, 19, 12, 4])[i + 1],
      (array['Club ladder', 'Practice with Marco', 'Club ladder', 'Metro Open', 'Club ladder', 'Open play'])[i + 1],
      case when i = 3 then 'tournament' else 'casual_match' end, case when i = 3 then 'singles' else 'doubles' end,
      jsonb_build_object('serve', 4, 'return', 4, 'third_shot', 4, 'dinking', 5, 'volleys', 4 + (i % 2), 'kitchen_line', 5,
        'transition', 4, 'footwork', 4, 'consistency', 4, 'strategy', 4 + i / 4),
      3, 2 + (i % 2), case when i % 2 = 0 then 'few' else 'some' end, case when i = 2 then 'loss' else 'win' end,
      case when i = 3 then '11-7, 11-9' when i = 2 then '8-11' else '11-6' end,
      7.5, 4, true, 7, 3, 'Controlled the kitchen', 'Mix in more lobs');
  end loop;
  update public.sessions set tournament_name = 'Metro Open', tournament_round = 'Semifinal'
   where owner_id = lia and session_context = 'tournament';

  -- ── Jun: a few casual games ──────────────────────────────────────────
  for i in 0..2 loop
    perform pg_temp.demo_session(jun, (array[25, 14, 6])[i + 1], 'Weekend doubles', 'casual_match', 'doubles',
      jsonb_build_object('serve', 3, 'return', 2 + i / 2, 'dinking', 2, 'kitchen_line', 2 + i / 2, 'consistency', 2),
      3, i, 'some', case when i = 2 then 'win' else 'loss' end, case when i = 2 then '11-9' else '7-11' end,
      6.5 + i, 3, i > 0, 6, 2, 'Had fun, met new players', 'Get to the kitchen line');
  end loop;
end $$;

alter table public.checkins enable trigger checkin_timing;
alter table public.recovery_logs enable trigger recovery_capture_time;
alter table public.reflections enable trigger reflection_capture_time;

commit;

select p.display_name, u.email,
       (select count(*) from public.sessions s where s.owner_id = p.id) as sessions,
       (select count(*) from public.baseline_tests t where t.owner_id = p.id) as court_tests
from public.profiles p join auth.users u on u.id = p.id
where u.email like '%@picklepro.demo' order by u.email;
