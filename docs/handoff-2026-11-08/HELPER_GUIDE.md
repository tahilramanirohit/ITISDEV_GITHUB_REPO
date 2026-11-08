# PicklePro setup: step-by-step guide

Thank you for helping. This takes about **20 minutes**. You don't need to know any coding. Just follow the steps in order and copy and paste exactly what's shown.

## Before you start

You need:

- [ ] A computer with Chrome. A phone is too small for this.
- [ ] The login for the **Supabase** account that owns PicklePro. Ask Kirk which one.
- [ ] A **Google account** (Gmail) that Kirk wants to use for the app's Google login.
- [ ] Kirk's number, in case something looks different.

**Two safety rules:**

1. You'll create a secret code called a **Client secret**. Never send it by chat, text or email, and never take a photo of it. Only copy and paste it into the box this guide tells you to.
2. Only click the buttons this guide names. If you're not sure, stop and message Kirk.

**How to copy and paste:** select the text, then press **Ctrl+C** (Windows) or **Cmd+C** (Mac) to copy. Click where it should go and press **Ctrl+V** or **Cmd+V** to paste.

---

## PART 1: Add the new database fields (5 minutes)

**1.** Open this link in Chrome:

```
https://supabase.com/dashboard/project/hbcyqmupfaeiledpzmop/sql/new
```

**2.** If it asks you to sign in, sign in with the PicklePro Supabase account.

> ✅ You should see a dark page with a big empty text area in the middle (the **SQL Editor**).
> ❌ If you see "Project not found" or "no access", you're in the wrong account. Stop and message Kirk.

**3.** Click inside the big empty text area. If there's already text, select it all (**Ctrl+A** or **Cmd+A**) and press **Delete**.

**4.** Copy everything in this box and paste it into the text area:

```
alter table public.profiles
  add column if not exists data_consent_version text,
  add column if not exists data_consent_at timestamptz,
  add column if not exists analytics_opt_in boolean not null default false,
  add column if not exists research_opt_in boolean not null default false;
```

**5.** Click the green **Run** button at the bottom right. Or press **Ctrl+Enter** (Windows) or **Cmd+Enter** (Mac).

**6.** If a box pops up asking you to confirm, click **Run this query**.

> ✅ At the bottom it should say **"Success. No rows returned."**
> ❌ If you see red error text, take a screenshot of the **error only** and send it to Kirk.

**7.** Now let's check that it worked. Select all the text in the area again, delete it, then paste this:

```
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
and column_name in ('data_consent_version','data_consent_at','analytics_opt_in','research_opt_in');
```

**8.** Click **Run** again.

> ✅ At the bottom you should see a small table with **4 rows**: `data_consent_version`, `data_consent_at`, `analytics_opt_in`, `research_opt_in`.

🎉 **Part 1 is done.** It's safe if you accidentally ran it twice.

---

## PART 2: Create the Google login key (10 minutes)

**1.** Open this link and sign in with the Google account Kirk wants to use:

```
https://console.cloud.google.com/
```

**2.** If it shows a welcome popup, tick the box to agree to the terms (if there is one), then click **Agree and continue**.

**3. Make a project.** At the top left, next to the "Google Cloud" logo, click the box that says **Select a project** (or shows a project name). In the window that opens, click **New project** (top right).
   - Project name: type `PicklePro`
   - Click **Create**.
   - Wait about 30 seconds. Then click the bell icon (top right) and click **Select project** next to PicklePro. Or choose PicklePro from the project box again.

> ✅ The box at the top left now says **PicklePro**.

**4. Set up the login screen.** Open this link:

```
https://console.cloud.google.com/auth/overview
```

Click **Get started**, then fill in each page and click **Next**:

| Page | What to enter |
| --- | --- |
| App information | App name: `PicklePro`. User support email: choose the Gmail shown. |
| Audience | Choose **External**. |
| Contact information | Type the same Gmail address. |
| Finish | Tick **I agree…**, then click **Continue**, then **Create**. |

**5. Add the website links.** In the left menu, click **Branding**. **Do not upload a logo.** A logo makes Google review the app first. Scroll to **App domain** and paste:

| Box | Paste this |
| --- | --- |
| Application home page | `https://picklepro.kirkorino.com` |
| Application privacy policy link | `https://picklepro.kirkorino.com/#/privacy` |
| Application terms of service link | leave empty |

Under **Authorized domains**, click **+ Add domain** and type `kirkorino.com`. Then click **Save** at the bottom.

**6. Let people sign in.** In the left menu, click **Audience**. Under **Publishing status**, click **Publish app**, then **Confirm**.

> ❌ If **Publish app** is greyed out, go back to Branding and check that both links from step 5 are saved.

> If Kirk says to keep it in "Testing" instead: scroll to **Test users**, click **+ Add users**, type each Gmail that will test the app, and click **Save**.

**7. Create the key.** In the left menu, click **Clients**, then **+ Create client** (at the top).
   - **Application type:** choose **Web application**.
   - **Name:** type `PicklePro web`

**8.** Under **Authorized JavaScript origins**, click **+ Add URI** and paste the first line below. Click **+ Add URI** again for each of the next lines, so you have 4 boxes:

```
https://picklepro.kirkorino.com
```
```
https://picklepro-app.vercel.app
```
```
https://pickleprothesis-git-cleanversion-bumbai.vercel.app
```
```
http://localhost:5173
```

**9.** Under **Authorized redirect URIs**, click **+ Add URI** and paste exactly:

```
https://hbcyqmupfaeiledpzmop.supabase.co/auth/v1/callback
```

> ⚠️ Check that there are no spaces at the start or end of what you pasted.

**10.** Click **Create**.

> ✅ A window shows your **Client ID** (a long code ending in `.apps.googleusercontent.com`) and your **Client secret**.

**11. Keep this tab open.** You'll copy these two codes in Part 3. If the window closed, click **PicklePro web** in the Clients list to see them again.

---

## PART 3: Turn on Google login in Supabase (5 minutes)

**1.** Open a **new tab** (Ctrl+T or Cmd+T) and go to:

```
https://supabase.com/dashboard/project/hbcyqmupfaeiledpzmop/auth/providers
```

**2.** Find **Google** in the list and click it.

**3.** Turn on the **Enable Sign in with Google** switch, so it turns green.

**4.** Go back to the Google tab and copy the **Client ID**. Return to the Supabase tab and paste it into the **Client IDs** box.

**5.** Go back to the Google tab and copy the **Client secret**. Return to the Supabase tab and paste it into the **Client Secret** box.

> 🔒 Remember: don't send the secret to anyone, not even Kirk. Pasting it here is enough.

**6.** Click **Save** at the bottom.

> ✅ Google should now show as **Enabled** in the list.

**7. Allow the website addresses.** Open:

```
https://supabase.com/dashboard/project/hbcyqmupfaeiledpzmop/auth/url-configuration
```

**8.** In the **Site URL** box, delete what's there and paste the address below. Then click **Save** next to it.

```
https://picklepro.kirkorino.com
```

**9.** Under **Redirect URLs**, click **Add URL**, paste the first line below and click **Save URLs**. Do this for each line, so you add 4 in total:

```
https://picklepro.kirkorino.com/**
```
```
https://picklepro-app.vercel.app/**
```
```
https://pickleprothesis-git-cleanversion-bumbai.vercel.app/**
```
```
http://localhost:5173/**
```

> ✅ You should see the 4 addresses listed under Redirect URLs.

🎉 **All done.** You can close the tabs.

---

## Message to send Kirk when you finish

Copy this, tick what you finished, and send it:

```
PicklePro setup done:
[ ] Part 1 – database fields added (saw the 4 rows)
[ ] Part 2 – Google login key created (app published / test users added)
[ ] Part 3 – Google turned on in Supabase + 4 redirect URLs added
Anything odd: ____
```

## If something looks different

Websites change their buttons sometimes. If you can't find a button:

- Look for a word that means the same thing (for example **Clients** may be called **Credentials**).
- If you still can't find it, take a screenshot. **Make sure no Client secret is visible in it.** Then send it to Kirk and wait.
