# e. Installers and Other Software

PicklePro is a web app, so players install nothing: they open the website on a phone or computer.
The software below is for running, changing or testing the system. Download each program only from its
official site (links below).

## Software to install

| Software | Version | Needed for | Download |
|---|---|---|---|
| Node.js (includes npm) | 22 LTS (tested with 22.x) | Running and building the website | <https://nodejs.org> |
| Python | 3.12 (3.10+ works) | The video analyzer | <https://www.python.org/downloads/>, tick **"Add python.exe to PATH"** |
| Git | any recent 2.x | Downloading and updating the code | <https://git-scm.com/downloads> |
| A web browser | latest Chrome, Edge, Safari or Firefox | Using the app | — |
| PostgreSQL (optional) | 15 or newer | Running the database tests only | <https://www.postgresql.org/download/> |

## Packages installed automatically

You don't install these by hand. The start-up scripts install the exact versions from the version lists.

- **Website** (`npm install`, from `package-lock.json`): React 18.3.1, Vite 6.3.5, TypeScript 5.9.3,
  Tailwind CSS 4.1.12, Supabase JS 2.117.1, React Router 7.13.0, tus-js-client 4.3.1 (resumable uploads),
  Vitest 3.2.4 (tests).
- **Video analyzer** (`pip install -r requirements.txt` and `requirements-yolo.txt`): FastAPI, Uvicorn,
  OpenCV, NumPy, Pydantic, HTTPX, Ultralytics 8.4.163 (YOLO; also installs PyTorch), LAP 0.5.12.
  Tests: `requirements-dev.txt` (pytest).
- **AI model files:** downloaded and checked by `python -m picklepro.fetch_models`. They are also included in
  `d_Other_System_Files/ai_models/`.

## Online services (accounts, no install)

| Service | Plan | Used for |
|---|---|---|
| Supabase (<https://supabase.com>) | Free | Database, sign-in, video storage |
| Vercel (<https://vercel.com>) | Hobby (free) | Hosting the public website |
| GitHub (<https://github.com>) | Free | Code and version history |
| Google Cloud Console (<https://console.cloud.google.com>) | Free | "Continue with Google" sign-in (OAuth client) |

## Our start-up scripts (`scripts/`)

These are copies; the working versions are in `b_Program_Codes/Pickleball Performance Dashboard/`
(`start_website.bat`) and `.../server/` (the others), and must be run from there.

| Script | What it does |
|---|---|
| `start_website.bat` | Windows: checks Node.js, creates `.env.local` from the template on first run, installs packages, starts the website at <http://localhost:5173> |
| `start_worker.bat` | Windows: creates the Python environment, installs the packages, downloads and checks the AI models, then starts the video analyzer |
| `PicklePro Analyzer (On-Off).bat` | Windows: one button that turns the analyzer on or off |
| `start_mac_worker.sh` | Mac: the same as `start_worker.bat`, and keeps the Mac awake while it runs |
| `requirements.txt`, `requirements-yolo.txt`, `requirements-dev.txt` | The Python package lists the scripts install |

## Step by step (Windows)

1. Install Node.js, Python 3.12 and Git (table above). Close and reopen Command Prompt.
2. **Database:** follow `a_Database_Creation_Scripts/README.md` (one SQL file in a new Supabase project).
3. **Website:** in `b_Program_Codes/Pickleball Performance Dashboard/`, double-click `start_website.bat`.
   The first time, Notepad opens `.env.local`: paste the Supabase **Project URL** and public **anon** key
   (Supabase → Project Settings → API), save, and double-click the script again. The site opens at
   <http://localhost:5173>.
4. **Video analyzer (optional):** in `.../server/`, copy `.env.example` to `.env` and fill in `SUPABASE_URL`
   and `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API). **Keep this key secret:** it is for this
   computer only and never goes in the website. Then double-click `start_worker.bat`. Uploaded videos are
   analysed while it runs.
5. **Public website (optional):** import the GitHub repository in Vercel, set the root folder to
   `Pickleball Performance Dashboard`, and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

More detail: `d_Other_System_Files/docs/NEW_COMPUTER_SETUP.md`, `NEW_SUPABASE_PROJECT.md` and
`WINDOWS_ANALYZER.md`.
