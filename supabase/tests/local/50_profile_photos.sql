-- Profile photos and extra profile fields stay private to their owner.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

insert into auth.users (id, email) values
  ('f5555555-5555-4555-8555-555555555555', 'f5@example.test'),
  ('f6666666-6666-4666-8666-666666666666', 'f6@example.test');

set role authenticated;
select set_config('request.jwt.claim.sub', 'f5555555-5555-4555-8555-555555555555', false);

insert into public.profiles (id, display_name, bio, home_court, paddle, avatar_path)
values ('f5555555-5555-4555-8555-555555555555', 'Player H', 'Lefty who loves dinks', 'Rizal Park', 'Joola Hyperion',
  'f5555555-5555-4555-8555-555555555555/avatar-1.webp');
select tests.expect_count($$ select 1 from public.profiles where home_court = 'Rizal Park' $$, 1, 'profile details are stored');
select tests.expect_error($$ update public.profiles set bio = repeat('x', 161) $$, 'bio over 160 characters is rejected');
select tests.expect_error($$ update public.profiles set avatar_path = 'f6666666-6666-4666-8666-666666666666/avatar-1.webp' $$,
  'profile photo path in another player''s folder is rejected');
select tests.expect_error($$ update public.profiles set avatar_path = 'f5555555-5555-4555-8555-555555555555/../x.webp' $$,
  'odd photo path is rejected');

insert into storage.objects (bucket_id, name) values ('profile-photos', 'f5555555-5555-4555-8555-555555555555/avatar-1.webp');
select tests.expect_error($$ insert into storage.objects (bucket_id, name) values ('profile-photos', 'f6666666-6666-4666-8666-666666666666/avatar-1.webp') $$,
  'cannot upload into another player''s photo folder');

select set_config('request.jwt.claim.sub', 'f6666666-6666-4666-8666-666666666666', false);
select tests.expect_count($$ select 1 from public.profiles where id = 'f5555555-5555-4555-8555-555555555555' $$, 0, 'other players cannot read the profile');
select tests.expect_count($$ select 1 from storage.objects where bucket_id = 'profile-photos' $$, 0, 'other players cannot see the photo');
select tests.expect_rows($$ delete from storage.objects where bucket_id = 'profile-photos' $$, 0, 'other players cannot delete the photo');
reset role;

select tests.expect_count($$ select 1 from storage.buckets where id = 'profile-photos' and not public and file_size_limit = 2000000 $$, 1,
  'photo bucket is private and small');
