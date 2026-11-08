# Run a second PicklePro analyzer on a Windows PC

The **analyzer** is the program that watches uploaded videos and works out where players stood and what shots they hit. Kirk's Mac already runs one. This guide sets up a **second analyzer on a Windows PC**, so videos still get analyzed when the Mac is off, or get done faster when both are on.

**Running both at the same time is safe.** Each analyzer "locks" a video before working on it, so the Mac and the PC never analyze the same video twice.

| What | Value |
| --- | --- |
| Live Supabase project | `hbcyqmupfaeiledpzmop` (the same one the Mac and the website use) |
| Supabase URL | `https://hbcyqmupfaeiledpzmop.supabase.co` |
| Start / stop button | `server\PicklePro Analyzer (On-Off).bat`: double-click once for ON, again for OFF |
| First-time setup | `server\start_worker.bat` (the on/off button also uses it) |

Time needed: about **30–45 minutes** the first time, mostly waiting for downloads.

---

## Before you start

- [ ] A Windows 10 or 11 PC that can stay on and plugged in while it analyzes.
- [ ] About **3 GB of free space**.
- [ ] Internet.
- [ ] The **service role key** for the PicklePro Supabase project. Kirk (or whoever owns the Supabase account) pastes it in themselves. **Never send it by chat, text or email.**

---

## Step 1: Install Python (once)

1. Go to https://www.python.org/downloads/windows/ and download **Python 3.12** (choose "Windows installer (64-bit)").
2. Run the installer. On the first screen, **tick "Add python.exe to PATH"** at the bottom. Then click **Install Now**.
3. When it says "Setup was successful", click **Close**.

## Step 2: Get the PicklePro code (once)

**Easy way (no Git):**
1. Ask Kirk for the PicklePro code as a ZIP of the `cleanversion` branch, or download it from GitHub: open the repository, switch to the **cleanversion** branch, then click **Code → Download ZIP**.
2. Right-click the ZIP and choose **Extract All…**. Extract it to `C:\PicklePro`.

**If you use Git:**
```bat
git clone <repository URL> C:\PicklePro
cd C:\PicklePro
git switch cleanversion
```

You should now have the folder `C:\PicklePro\Pickleball Performance Dashboard\server`.

## Step 3: First-time setup (once)

1. Open `C:\PicklePro\Pickleball Performance Dashboard\server`.
2. Double-click **`start_worker.bat`**.
3. The first time, it creates a settings file and opens it in **Notepad**. Fill in these two lines (no spaces around `=`):
   ```
   SUPABASE_URL=https://hbcyqmupfaeiledpzmop.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<the owner pastes the service role key here>
   ```
   The owner finds the key in **Supabase → Project Settings → API Keys → service_role**. Paste it directly into Notepad; don't send it anywhere.
4. Save (**Ctrl+S**) and close Notepad.
5. Double-click **`start_worker.bat`** again. This time it:
   - creates the Python environment and installs packages (several minutes, the first time only)
   - downloads the court, ball and player models (about 60 MB, plus a larger first-time download)
   - runs a quick **setup check**
6. When it asks `Choose mode [1/2]`, press **2** (measured: real video analysis).
7. When you see that the worker has started, setup is done. Close the window to stop it for now.

> ❌ **If the setup check says "The web app uses Supabase project … but this worker uses …":** look for a file named `.env.local` in `C:\PicklePro\Pickleball Performance Dashboard\`. On the analyzer PC you can simply **delete** it (the PC doesn't run the website). Or change its `VITE_SUPABASE_URL=` line to the URL above. Then run `start_worker.bat` again.

## Step 4: Put the on/off button on the Desktop (once)

1. In the `server` folder, right-click **`PicklePro Analyzer (On-Off).bat`** → **Show more options** → **Send to → Desktop (create shortcut)**.
2. Optional: rename the shortcut on the Desktop to **PicklePro Analyzer**.

## Step 5: Keep the PC awake while it analyzes (once)

Windows **Settings → System → Power** (on some PCs: **Power & battery → Screen and sleep**):
- **When plugged in, put my device to sleep after:** set to **Never**.
- (Turning the screen off is fine; sleep is not.)

---

## Every day: turning it on and off

| You want… | Do this | What you'll see |
| --- | --- | --- |
| **ON** | Double-click **PicklePro Analyzer** on the Desktop | A window titled **PicklePro worker** opens. Press **2** when asked for the mode, then **leave that window open**. |
| **OFF** | Double-click **PicklePro Analyzer** again | A small window says "Turning it OFF …", the worker window closes, and you see "The PicklePro analyzer is now OFF." |

**Notes**
- **Updates:** while it's ON, leave the window open. The worker checks for new videos every few seconds. Closing that window also turns it OFF.
- **Turning off mid-video:** the analysis stops, and after about 5 minutes that video automatically goes back in the queue. The Mac, or this PC the next time it's ON, then picks it up again. No video is lost.
- **Quick test** (when nobody needs real results): choose **1** (test_fixture) instead of 2. It stores clearly labelled **TEST DATA**, which only checks that uploads reach the PC.

---

## If something goes wrong

| Problem | Fix |
| --- | --- |
| "Could not create the Python environment" | Reinstall Python 3.12 and make sure **"Add python.exe to PATH"** is ticked. |
| "Package installation failed" | Check the internet connection, then double-click `start_worker.bat` again. |
| The setup check mentions two different projects | See the ❌ note in Step 3. |
| Double-clicking the on/off button does nothing visible | Open `server` and double-click `start_worker.bat` directly to see the messages. Take a screenshot (with **no key visible**) and send it to Kirk. |
| Videos stay "Waiting for analysis" | Make sure the worker window is open and says it started, and that `SUPABASE_URL` in `server\.env` is exactly the URL above. |

**Security reminders**
- `server\.env` holds the service role key: it can read and change all PicklePro data. Don't share, email or upload that file, and don't put it in Git.
- Only run the analyzer on a PC you trust and that has a password on its Windows account.

---

*The on/off `.bat` has been written and reviewed, but not yet run on a Windows PC. If anything behaves differently on the first try, note what you saw and tell Kirk.*
