# Running PicklePro on another computer

This guide sets up PicklePro on a second Windows computer, for example a new laptop, using the code from GitHub.

## The short answer

**Yes, it works on the laptop, and you do not need a new Supabase project.** The database, the uploaded videos and the player accounts are not on your desktop. They are in your Supabase project on Supabase's servers (`https://<project-ref>.supabase.co`). Your desktop only holds:

- the code, which is on GitHub;
- two small settings files with the project's address and keys, which are **not** on GitHub on purpose;
- the downloaded model files, which the worker downloads again by itself.

Any computer that has the code and those two settings files talks to the same Supabase project. It sees the same accounts, sessions, videos and results.

There are two different logins. Don't mix them up:

| Login | What it is | Needed on the laptop? |
| --- | --- | --- |
| **PicklePro account** (email and password on the PicklePro sign-in page) | Your player account inside the app. It is stored in your Supabase project. | **Yes:** sign in with the same email and password to see the same sessions. |
| **Supabase dashboard account** (supabase.com) | The account that owns and manages the project. | Only for admin tasks: copying keys from the dashboard, or applying a database update (step 7). |

## What runs where

```
 Laptop or desktop                          Supabase (online)
 ┌────────────────────────────┐             ┌──────────────────────────┐
 │ Website  (start_website.bat)│── sign in ─▶│ Accounts                 │
 │ http://localhost:5173       │── upload ──▶│ Video storage            │
 └────────────────────────────┘             │ Sessions, jobs, results  │
 ┌────────────────────────────┐             │                          │
 │ Analyzer (start_worker.bat) │◀─ jobs ─────│                          │
 │ Python + models             │── results ─▶│                          │
 └────────────────────────────┘             └──────────────────────────┘
```

- **Website:** run it on whichever computer you are using.
- **Analyzer (worker):** at least one must be running *somewhere* for uploads to be analysed. It can run on the desktop while you upload from the laptop, or the other way round. If two workers run at the same time, they share the queue safely: each video is analysed once. If none is running, uploads wait with the status **Waiting**.

## Step by step on the laptop

### 1. Install the tools (once)

1. **Git:** <https://git-scm.com/download/win>. Keep the default options.
2. **Node.js LTS:** <https://nodejs.org>.
3. **Python 3.12:** <https://www.python.org/downloads/>. On the first installer screen, tick **"Add python.exe to PATH"**.

Close and reopen Command Prompt after installing, so it finds the new programs.

### 2. Download the code

In Command Prompt:

```bat
cd %USERPROFILE%\Desktop
git clone https://github.com/tahilramanirohit/ITISDEV_GITHUB_REPO.git
cd ITISDEV_GITHUB_REPO
git checkout picklepro-coaching
```

If the repository is private, Git asks you to sign in to GitHub in a browser window. Use an account that has access to the repository.

### 3. Bring the two settings files

These files hold the project's address and keys. They are deliberately **not** on GitHub.

| File (inside `ITISDEV_GITHUB_REPO\Pickleball Performance Dashboard\`) | Contains | Safe for the browser? |
| --- | --- | --- |
| `.env.local` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public "anon" key) | Yes |
| `server\.env` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (full-access key) | **No, keep it secret** |

Choose one way:

- **Copy them from the desktop** with a USB stick, into the same folders on the laptop. This is the easiest way.
- **Or re-create them.** Double-clicking `start_website.bat` or `server\start_worker.bat` creates each file from its template and opens it in Notepad. Fill in the values from the Supabase dashboard: **Project Settings → API** gives the Project URL, the `anon` key and the `service_role` key.

Never send these files or keys through chat, email or GitHub. The service-role key can read and delete everything in the project. If a key leaks, rotate it in the Supabase dashboard and update both computers.

If you only use the website on the laptop and the analyzer stays on the desktop, the laptop needs only `.env.local`.

### 4. Start the website

Double-click `Pickleball Performance Dashboard\start_website.bat`.

The first run installs the website's packages, which takes a few minutes. The browser then opens at <http://localhost:5173>. Leave the black window open while you use the site.

<details><summary>Same thing by hand</summary>

```bat
cd "%USERPROFILE%\Desktop\ITISDEV_GITHUB_REPO\Pickleball Performance Dashboard"
npm ci
npm run dev
```
</details>

### 5. Sign in

Sign in with your **existing PicklePro email and password**. Your sessions and reports from the desktop appear. Don't create a new account unless you want a separate, empty one.

### 6. Start the analyzer (only on the computer that should analyse)

Double-click `Pickleball Performance Dashboard\server\start_worker.bat`, then choose **2 = measured**.

The first run on a new computer takes a while:

- It creates the Python environment and installs the packages. The PyTorch download is large, over 1 GB.
- It downloads the court, ball and player models, about 60 MB, and checks them against pinned checksums.

Later starts take seconds. Leave the window open; closing it stops analysis. An analysis that was interrupted is retried automatically when a worker runs again.

The worker checks that `server\.env` and `.env.local` point to the same Supabase project, and stops with a message if they don't.

### 7. Apply database updates (once per update, from any one computer)

Some updates change the database. The progress bar added on 30 September 2026 is one of them: migration `supabase/migrations/20260930090000_analysis_progress.sql`. Committing a migration to GitHub does **not** apply it to your Supabase project. Apply it once, from any computer that has the code:

```bat
cd %USERPROFILE%\Desktop\ITISDEV_GITHUB_REPO
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push --dry-run
npx supabase db push
```

- `npx supabase login` opens the browser to sign in with the **Supabase dashboard account**.
- `<your-project-ref>` is the part before `.supabase.co` in your project URL. It is safe to share.
- `--dry-run` lists what would change; check that it only lists the new migration.
- Never run `supabase db reset --linked` or `supabase config push` against this project. See [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

Until this migration is applied, everything still works. The analysis bar just moves without a percentage.

### 8. Keep both computers up to date

Before working on a computer, get the latest code:

```bat
cd %USERPROFILE%\Desktop\ITISDEV_GITHUB_REPO
git pull
```

Then restart the website and the worker. The batch files reinstall packages or download new models by themselves when an update needs them.

## Progress while a video is analysed

On a session page:

1. **Uploading · N%:** the video goes from your browser straight to Supabase Storage. An interrupted upload resumes if you choose the same file again.
2. **Waiting:** no worker has picked the video up yet. Is `start_worker.bat` running on some computer?
3. **Analyzing:** the bar shows the stage and percentage:
   - downloading the video to the analyzer;
   - checking the video;
   - finding the players, the court and the ball;
   - saving the report.

   Once about 10% is done, it also estimates the time left from the pace so far. The page updates by itself every few seconds; you can close it and come back later.
4. If the analyzer stops reporting for a few minutes, the page warns you to check that the worker window is still open.

The local prototype (`#/local-prototype`) shows the same kind of bar: first the upload to the local Python server, then the analysis.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| "Supabase is not configured" | `.env.local` is missing or empty. See step 3, then restart `start_website.bat`. |
| Sign-in says the email or password is wrong | You are using the Supabase dashboard login. Use your PicklePro account (step 5). |
| Upload stays on **Waiting** | No worker is running. Start `server\start_worker.bat` on one computer. |
| The worker says the projects don't match | `server\.env` and `.env.local` name different Supabase projects. Copy both from the same place. |
| The analysis bar moves but shows no percentage | Apply the database update (step 7). |
| `'git' / 'node' / 'python' is not recognized` | Install the tool (step 1), then close and reopen Command Prompt. |
| `npm ci` fails with EPERM on Windows | Close any running website window (it locks files), then run it again. |

## Optional: use the desktop's website from the laptop on the same Wi-Fi

You can also skip setting up the laptop and open the desktop's website from it:

1. On the desktop, run `npm run dev -- --host` in the dashboard folder. Windows may ask to allow Node.js through the firewall; allow it for private networks.
2. On the laptop, open `http://<desktop-IP>:5173`. Find the IP with `ipconfig` on the desktop, under "IPv4 Address".

Only do this on a trusted home network.
