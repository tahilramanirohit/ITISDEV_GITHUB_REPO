-- Installed immediately before the versioned-run migration to exercise its
-- upgrade path against records created by the earlier schema.
insert into auth.users(id, email) values
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'legacy@example.test');
insert into public.sessions(id, owner_id, title, session_context, play_format) values
  ('5d000000-0000-4000-8000-000000000001', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'Prior report', 'practice', 'singles'),
  ('5d000000-0000-4000-8000-000000000002', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'Broken job', 'practice', 'singles');
insert into public.video_assets(id, owner_id, session_id, storage_path, original_filename, mime_type, byte_size) values
  ('7d000000-0000-4000-8000-000000000001', 'ffffffff-ffff-4fff-8fff-ffffffffffff', '5d000000-0000-4000-8000-000000000001',
   'ffffffff-ffff-4fff-8fff-ffffffffffff/5d000000-0000-4000-8000-000000000001/7d000000-0000-4000-8000-000000000001.mp4', 'prior.mp4', 'video/mp4', 100),
  ('7d000000-0000-4000-8000-000000000002', 'ffffffff-ffff-4fff-8fff-ffffffffffff', '5d000000-0000-4000-8000-000000000002',
   'ffffffff-ffff-4fff-8fff-ffffffffffff/5d000000-0000-4000-8000-000000000002/7d000000-0000-4000-8000-000000000002.mp4', 'broken.mp4', 'video/mp4', 100);
insert into public.analysis_jobs(id, owner_id, session_id, video_asset_id, status, available_at) values
  ('9d000000-0000-4000-8000-000000000001', 'ffffffff-ffff-4fff-8fff-ffffffffffff', '5d000000-0000-4000-8000-000000000001', '7d000000-0000-4000-8000-000000000001', 'queued', now() + interval '1 day'),
  ('9d000000-0000-4000-8000-000000000002', 'ffffffff-ffff-4fff-8fff-ffffffffffff', '5d000000-0000-4000-8000-000000000002', '7d000000-0000-4000-8000-000000000002', 'completed', now() + interval '1 day');
insert into public.analysis_results(job_id, owner_id, session_id, video_asset_id, schema_version,
  result_status, data_origin, pipeline_version, result)
values ('9d000000-0000-4000-8000-000000000001', 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  '5d000000-0000-4000-8000-000000000001', '7d000000-0000-4000-8000-000000000001',
  '1', 'ok', 'measured', 'legacy', '{"status":"ok","schema_version":"1"}'::jsonb);
