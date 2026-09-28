# Larger match videos

The app currently allows 50 MiB in `VITE_MAX_UPLOAD_MB`. The private
`session-videos` bucket and `video_assets.byte_size` constraint are already
set to 500 MiB, and uploads use resumable chunks. The live project is recorded
as a Supabase Free project. [Supabase's Storage limits](https://supabase.com/docs/guides/storage/uploads/file-limits)
cap a Free project's global per-file size at 50 MB, regardless of a larger
bucket setting. Raising the frontend number alone would allow the picker to
start a video that Storage will reject.

For a paid Supabase project, set the project's **Global file size limit** in
Storage Settings to at least 500 MiB. Confirm the private bucket still allows
500 MiB, set `VITE_MAX_UPLOAD_MB=500` for the frontend build, redeploy or
restart the frontend, and test a file above the old limit. The database and
bucket would then still cap each video at 500 MiB. No database migration is
needed for that target.

If staying on Free, the alternatives are a different video storage service or
transcoding the source clip below the project's limit before upload. Both
need an explicit product choice and end-to-end testing; neither is enabled by
this repository. The local FastAPI prototype has its own separate 150 MB
request limit and is not the hosted Sessions upload flow.
