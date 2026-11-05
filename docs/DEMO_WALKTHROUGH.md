# Demo walkthrough

Two walkthroughs: a **blank slate** (a new sign-up) and one **with data** (the demo accounts).

## Set up the demo accounts

1. Apply every database update through `supabase/scripts/pickleproapp_upgrade_11.sql`.
2. Paste [`supabase/scripts/demo_data.sql`](../supabase/scripts/demo_data.sql) into Supabase Dashboard → SQL Editor → New query → Run. Running it again resets the four accounts.
3. Sign in with any account below. Password: `PickleDemo-2026` (change it in the script first if the repository is public).

| Account | Who | Shows |
|---|---|---|
| `bea.reyes@picklepro.demo` | Beginner, mostly solo drills | Self-assessment without video, drills, court tests (baseline and re-test), a buddy request waiting for her |
| `marco.santos@picklepro.demo` | Intermediate, league doubles | 10 games with results and journal, Progress, sleep patterns, court tests, Lia's peer ratings and notes, a buddy session coming up |
| `lia.cruz@picklepro.demo` | Advanced, tournaments | Sessions shared with her by Marco; giving peer feedback; a tournament result |
| `jun.tan@picklepro.demo` | Novice | Looking for practice partners |

The data is self-reported (ratings, results, journal, court test counts, buddy and partner activity). There are no video reports: for the computer-vision part, start the analyzer (`server/start_worker.bat`) and upload a real clip during or before the demo.

## Walkthrough 1: blank slate (about 4 minutes)

1. **Sign up** with a new email → onboarding: name, 18+, experience, why you play, goals.
2. **Baseline:** rate at least 3 skills. The cream card shows the 4-week goals (lowest skills, +1).
3. **Court tests** (optional step): count one drill with the −/+ counter, or Skip for now.
4. **Home** shows the starting plan. **Log** a solo practice → Rate & plan → the practice plan and drills.

## Walkthrough 2: with data

Sign in as **Marco**.

1. **Progress:** Games / Practice / All; average rating vs the baseline; game results (win rate, games won, unforced errors game by game, games with a buddy); goals from the baseline and from the court tests; "Before and after your games" (better ratings after 7+ hours of sleep; a recovery note after two sore games); the skill table with base / now / peer; the re-test reminder.
2. **Sessions → League night (latest):** the Pre-game / In-game / Post-game steps; Rate & plan shows Pickle's line "Lia rated your dinking 3/5, lower than your 4/5, so it stays your first focus", then **Feedback from Lia** (You vs Lia bars and her notes by skill).
3. **Ask for feedback** on another session: pick Lia, up to 3 skills, With video or Ratings only, and read the privacy line.
4. **Players → My partners:** the "Coming up" card with Jun → **Log this session** (fills in New session and links it). Lia's card (Video partner): games together, last played, feedback both ways, **Ask for feedback** → pick a session (the Ask sheet opens for Lia). Jun's card (Buddy): **Partner for video feedback**. Read **How it works, and who sees what** at the bottom. **Shared:** "You shared" shows Marco's game shared with Lia and that she sent feedback. **Find:** "I'm looking for", Suggested for you, purpose filter.
5. **Court tests** from Progress: re-test one drill and watch the goal bar move.

6. **What if I'm injured?** Open any session → Journal → Post-game → tick **I'm injured right now** (pick Knee) → Save. Home now shows **Recovery mode** with a rest plan, Progress says the goals are paused, Players → Find says you're hidden, and the session plan is a rest plan. Tap **I'm back to playing** to undo it (Marco is listed again on the Buddy list).

Then sign in as **Lia** → Players → **Shared** → Marco's game → rate the asked skills → Send feedback. Sign in as **Bea** → Players → **My partners** → accept Jun's request.

**Your own accounts (Rohit and Carla):** run [`supabase/scripts/link_rohit_carla.sql`](../supabase/scripts/link_rohit_carla.sql) (set the emails at the top if the names match more than one account). Carla becomes Rohit's buddy and video partner and his "videotest" session is shared with her, with the video. Both see it under Players → Shared.

**Video (live):** with the analyzer running, open any session → Video → upload a clip → the report with the court overlay, player boxes, heatmap and shots appears when the analysis finishes. Then Ask for feedback "With video" so the partner can leave notes at moments in the video.
