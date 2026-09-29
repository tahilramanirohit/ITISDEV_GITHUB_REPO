# Video storage decision — Free pilot

Decision recorded 29 September 2026: stay on Supabase Free for now and accept
short rally clips only. Buddy matching can improve as the system is used; it is
not a reason to change the storage plan. The app now caps uploads at exactly
50,000,000 bytes, including when a larger `VITE_MAX_UPLOAD_MB` is configured.
The private bucket and database still allow up to 500 MiB, but
[Supabase's Free global limit](https://supabase.com/docs/guides/storage/uploads/file-limits)
is 50 MB and takes precedence. Uploads use resumable chunks.

The supplied `IMG_6291.MOV` is 26,969,939 bytes over 24.4 seconds at 1080p.
At that average bitrate, 50 MB holds about 45 seconds and ten minutes would be
about 663 MB. This is an estimate, not a guaranteed duration: bitrate varies
by device and scene. The app must not promise a full ten-minute match upload on
the Free plan. Keep useful rally segments at 720p and at least 30 fps; avoid
aggressive compression that makes the ball or court lines hard to see.

The Free plan also includes 1 GB of total file storage
([current pricing](https://supabase.com/pricing)). About 37 clips the size of
the supplied sample would reach that amount before other files and overhead.
Raw videos expire 30 days after their first measured report unless the owner
keeps them, but the file is only deleted while an analysis worker is running
(see [SUPABASE_SETUP.md](SUPABASE_SETUP.md#raw-video-retention-migration)).
Kept videos, fixture-only sessions and sessions whose analysis failed are never
removed automatically, so still review usage and delete unneeded sessions
manually in the pilot.

If full-length uploads become necessary, revisit the plan. For this sample's
bitrate, a ten-minute clip needs more than the existing 500 MiB bucket and
database caps, so a paid-plan change alone would not be enough. The client,
bucket, database and hosted global limits would all need coordinated changes
and a large-file upload test. The local FastAPI prototype has its own separate
150 MB request limit and is not the hosted Sessions upload flow.
