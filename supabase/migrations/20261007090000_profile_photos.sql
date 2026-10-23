-- Profile editing (7 Oct 2026): profile photo, short bio, home court and
-- paddle. Profiles stay private to their owner, and photos live in a
-- private bucket inside the owner's folder. Safe to run more than once.

alter table public.profiles
  add column if not exists avatar_path text,
  add column if not exists bio text check (char_length(bio) <= 160),
  add column if not exists home_court text check (char_length(btrim(home_court)) between 1 and 80),
  add column if not exists paddle text check (char_length(btrim(paddle)) between 1 and 60);

-- The photo path must point into the owner's own folder of the photo bucket.
alter table public.profiles drop constraint if exists profiles_avatar_path_own;
alter table public.profiles add constraint profiles_avatar_path_own
  check (avatar_path is null or avatar_path ~ ('^' || id::text || '/avatar-[0-9]+\.(webp|jpg)$'));

-- ── Private photo bucket ─────────────────────────────────────────────────
-- The app shrinks photos to 512 px before upload, so 2 MB is plenty.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 2000000, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_photos_select_own on storage.objects;
create policy profile_photos_select_own on storage.objects for select to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists profile_photos_insert_own on storage.objects;
create policy profile_photos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists profile_photos_update_own on storage.objects;
create policy profile_photos_update_own on storage.objects for update to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists profile_photos_delete_own on storage.objects;
create policy profile_photos_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
