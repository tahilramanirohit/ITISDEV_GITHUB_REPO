# PicklePro — Capstone Project Files

PicklePro is a mobile-first pickleball coaching web app: players log games, rate their skills, get a
practice plan, share videos with buddies for feedback, and can have a video analysed for court
position, shots and errors.

This package holds the files asked for under **Capstone Project Files**:

| Item | Folder | What is in it |
|---|---|---|
| a. Database Creation Scripts | `a_Database_Creation_Scripts/` | One-paste script that creates the whole database, every migration in order, upgrade scripts and a database check |
| b. Program Codes | `b_Program_Codes/` | The web app (React + TypeScript) and the video analyzer (Python), with their unit tests |
| c. Test Data Scripts / Files | `c_Test_Data_Scripts_Files/` | Demo accounts script, database tests, 3 test videos, hand-labelled shots, sample analysis results, and the list of unit tests |
| d. Other System Files | `d_Other_System_Files/` | Documentation, requirements and architecture PDF, the AI model files, settings templates, credits |
| e. Installers and Other Software | `e_Installers_and_Other_Software/` | Install guide with every program and version, and our start-up scripts |

Each folder has its own `README.md` that explains its files.

## Quick start (Windows)

1. Install the software in `e_Installers_and_Other_Software/README.md` (Node.js, Python, Git).
2. Create the database: run `a_Database_Creation_Scripts/new_project_setup.sql` in a new Supabase project
   (steps in that folder's README).
3. Optional demo accounts: run `c_Test_Data_Scripts_Files/demo_data/demo_data.sql`
   (sign in as `marco.santos@picklepro.com`, password `123456`).
4. Website: in `b_Program_Codes/Pickleball Performance Dashboard/`, copy `.env.example` to `.env.local`,
   fill in the Supabase URL and public anon key, then double-click `start_website.bat`.
5. Video analyzer (optional): in `.../server/`, copy `.env.example` to `.env`, fill it in, then
   double-click `start_worker.bat`.

Live site: <https://pickleprothesis.vercel.app>. Source: GitHub repository `tahilramanirohit/ITISDEV_GITHUB_REPO`, branch `cleanversion`.

## What is not included, on purpose

- **Passwords and keys** (`.env`, `.env.local`). Only the empty templates (`.env.example`) are included.
  The Supabase service-role key must never be shared or put in the website.
- **Downloaded packages** (`node_modules`, Python `.venv`). They are re-created by `npm install` and
  `start_worker.bat` from the exact version lists (`package-lock.json`, `requirements*.txt`).
- **Developer-only simulator files** used for screenshots.
