# Owner setup: consent migration + Google sign-in

These are the last steps after the app code was built (8 Nov 2026). They need your own Supabase and Google accounts.

| What | Value |
| --- | --- |
| Live Supabase project | `hbcyqmupfaeiledpzmop` (the one the video analyzer uses) |
| Supabase callback URL | `https://hbcyqmupfaeiledpzmop.supabase.co/auth/v1/callback` |
| Main address (new) | `https://picklepro.kirkorino.com` (attached to Vercel project `picklepro-app`, team thekirx's projects) |
| Vercel address | `https://picklepro-app.vercel.app` |
| Branch preview | `https://pickleprothesis-git-cleanversion-bumbai.vercel.app` |
| Local dev | `http://localhost:5173` |

## 1. Apply the consent migration (about 1 minute)

1. Open the SQL editor: https://supabase.com/dashboard/project/hbcyqmupfaeiledpzmop/sql/new
2. Paste the SQL below and click **Run**. It only adds columns; it changes no existing data. It is safe to run twice.

```sql
alter table public.profiles
  add column if not exists data_consent_version text,
  add column if not exists data_consent_at timestamptz,
  add column if not exists analytics_opt_in boolean not null default false,
  add column if not exists research_opt_in boolean not null default false;
```

3. Check that it worked by running the query below. It should list the 4 new columns.

```sql
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('data_consent_version','data_consent_at','analytics_opt_in','research_opt_in');
```

The same SQL is in `supabase/migrations/20261108132612_data_consent.sql`. If you use the Supabase CLI instead, log in to the account that owns this project and run `supabase link --project-ref hbcyqmupfaeiledpzmop`, then `supabase db push --dry-run`, then `supabase db push`. Never run `supabase config push` or `db reset`.

**Until this runs, new players get stuck on the consent screen (saving fails), so do this before deploying the new code.**

## 2. Create the Google sign-in client

1. Open https://console.cloud.google.com/apis/credentials (pick or create a project, e.g. "PicklePro").
2. If asked, set up the **OAuth consent screen**:
   - User type: External. App name: PicklePro. Add your support email.
   - Scopes: the default `email`, `profile` and `openid`.
   - While the app is in **Testing**, add each Google account that should be able to sign in under **Test users**. Publish the app to let anyone sign in.
3. Go to **Create credentials → OAuth client ID → Web application**, name it "PicklePro web".
   - **Authorized JavaScript origins:**
     - `https://picklepro.kirkorino.com`
     - `https://picklepro-app.vercel.app`
     - `https://pickleprothesis-git-cleanversion-bumbai.vercel.app`
     - `http://localhost:5173`
   - **Authorized redirect URIs:** `https://hbcyqmupfaeiledpzmop.supabase.co/auth/v1/callback`
4. Click **Create**, then copy the **Client ID** and **Client secret**. Keep them private; don't paste them into chat or Git.

## 3. Turn on Google in Supabase

1. Open https://supabase.com/dashboard/project/hbcyqmupfaeiledpzmop/auth/providers, then **Google**, then **Enable**.
2. Paste the Client ID and Client secret, then **Save**.
3. Open https://supabase.com/dashboard/project/hbcyqmupfaeiledpzmop/auth/url-configuration.
   - **Site URL:** `https://picklepro.kirkorino.com`
   - **Redirect URLs:** add each of these:
     - `https://picklepro.kirkorino.com/**`
     - `https://picklepro-app.vercel.app/**`
     - `https://pickleprothesis-git-cleanversion-bumbai.vercel.app/**`
     - `http://localhost:5173/**`

## 4. Deploy and test

**Note:** as of 8 Nov, `picklepro.kirkorino.com` shows the current production build of `picklepro-app`, an older "Hasa" reskin. Deploy the new `cleanversion` build there (e.g. `vercel --prod` from `Pickleball Performance Dashboard/`) **only after step 1**, or new players can't save their consent. `picklepro-app` already has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set for Production; check they point to `hbcyqmupfaeiledpzmop`.


1. Commit and push `cleanversion` (only when you're ready). Vercel then builds the branch preview.
2. On the preview, test each flow:
   - **Email sign-up:** sign up with a new email, then the consent screen, then onboarding (the tiles), then the new home page.
   - **Google:** "Continue with Google", then consent, then onboarding. Sign out and back in: there should be no second consent or onboarding, and no duplicate profile.
   - **Settings:** switch analytics and research on and off, then reload. The choices should stay.
   - **First game:** log a game with a score like `11-7, 9-11, 11-5`. It should show AUTO 3 played, 2 won, Won. Home then shows the full dashboard.
   - **Feedback:** ask a partner for feedback. It should appear under "Shared with" and on the partner's account.
3. In Supabase, open **Table editor → profiles** and confirm that your test user has `data_consent_at` filled in.
