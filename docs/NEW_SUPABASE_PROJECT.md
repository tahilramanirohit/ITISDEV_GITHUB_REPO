# Moving PicklePro to a new Supabase project

Use this when the old project cannot be used (for example, a restore after a pause failed).
It takes about 20 minutes. Nothing in the app's code names the old project: only the
settings below change.

What comes across: the database structure and the four demo accounts.
What does not: accounts people made themselves, their sessions, and uploaded videos and photos.
Real data can only come back from the old project's backup (step 8) or from Supabase support.

## 1. Create the project

supabase.com/dashboard → **New project**. Pick a region near you (for example Singapore),
write the database password down somewhere private, and wait until it says it is ready.

## 2. Build the database (one paste)

**SQL Editor → New query** → paste all of `supabase/scripts/new_project_setup.sql` → **Run**.
It is every file in `supabase/migrations`, in order. It should end with "Success. No rows returned".
If it reports an error, nothing was saved (it runs as one unit): send the error message.

Alternative with the CLI: `supabase link --project-ref <new-ref>` then `supabase db push`.
Never run `supabase config push` or `supabase db reset --linked`.

## 3. Check it

New query → paste `supabase/scripts/check_database.sql` → Run. Every row should say **OK**.

## 4. Demo accounts (optional)

New query → paste `supabase/scripts/demo_data.sql` → Run. Creates bea.reyes, marco.santos,
lia.cruz and jun.tan `@picklepro.com` with weeks of history, all with the password `123456`.

## 5. Sign-in settings

Authentication → Sign In / Providers:
- **Email**: on. For a class demo, turning off "Confirm email" saves waiting for emails.
- **Anonymous sign-ins**: on only if you use the Guest or Dev mode buttons.

Authentication → URL Configuration:
- **Site URL**: the address people open, e.g. `https://picklepro-app.vercel.app`.
- **Redirect URLs**: add that address with `/**` after it, every Vercel preview you use
  (e.g. `https://pickleprothesis-git-cleanversion-bumbai.vercel.app/**`) and
  `http://localhost:5173/**`.

## 6. Point the app at the new project

Project Settings → API: copy the **Project URL** and the **anon public** key.
(Never use the `service_role` key in the app.)

- Your computer: in `Pickleball Performance Dashboard/.env.local` set `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY`, then restart `npm run dev`.
- Vercel: Project → Settings → Environment Variables → change the same two (Production and
  Preview) → Deployments → **Redeploy**. Vite builds the values in, so a redeploy is required.
- Video analysis worker: in `Pickleball Performance Dashboard/server/.env` set `SUPABASE_URL`
  and `SUPABASE_SERVICE_ROLE_KEY` (the service_role key belongs only here), then restart it.
- Everyone else on the team (their `.env.local` still points at the old project).

## 7. Try it

Sign up (or sign in as a demo account) → log a game → rate it → upload a short clip with the
worker running. Video uploads are limited to 50 MB on the Free plan.
To link real accounts for the demo again: `supabase/scripts/link_rohit_carla.sql` and
`buddy_request_for_rohit.sql`, after those people have signed up.

## 8. Old data (if you have the backup file)

Do steps 1 to 3 on a new project you only use for this, not the one from step 2, then follow
Supabase's guide "Restore a dashboard backup" to load the file. Ask before mixing it into the
live project: the backup also contains the old project's accounts and settings.

## Keeping it awake

Free projects pause after about a week without use. Open the app at least weekly before a
deadline, or use a paid plan, which does not pause.
