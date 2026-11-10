# Demo walkthrough

Two walkthroughs: a **blank slate** (a new sign-up) and one **with data** (the demo accounts).

## Set up the demo accounts

1. Apply every database update through `supabase/scripts/pickleproapp_upgrade_16.sql`. `supabase/scripts/check_database.sql` lists anything still missing.
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
4. **Players → My partners:** the "Coming up" card with Jun → **Log this session** (fills in New session and links it). Lia's card (Video partner): games together, last played, feedback both ways, **Ask for feedback** → pick a session (the Ask sheet opens for Lia). Jun's card (Buddy): **Ask to play** or **Partner for video feedback**. **Find:** Lia and Jun show "Buddies"; anyone else has **Add buddy**. Read **How it works, and who sees what** at the bottom. **Shared:** "You shared" shows Marco's game shared with Lia and that she sent feedback. **Find:** "I'm looking for", Suggested for you, purpose filter.
5. **Court tests** from Progress: re-test one drill and watch the goal bar move.

6. **What if I'm injured?** Open any session → Journal → Post-game → tick **I'm injured right now** (pick Knee) → Save. Home now shows **Recovery mode** with a rest plan, Progress says the goals are paused, Players → Find says you're hidden, and the session plan is a rest plan. Tap **I'm back to playing** to undo it (Marco is listed again on the Buddy list).

Then sign in as **Lia** → Players → **Shared** → Marco's game → rate the asked skills → Send feedback. Sign in as **Bea** → Players → **My partners** → "Wants to be your buddy" → accept Jun. Jun's card appears: now either can ask the other to play.

**Your own accounts (Rohit and Carla, or any two players):** run [`supabase/scripts/link_rohit_carla.sql`](../supabase/scripts/link_rohit_carla.sql) (change the names, or set the emails, and the session title at the top). Carla becomes Rohit's buddy and video partner and his "videotest" session is shared with her, with the video. Both see it under Players → Shared.

**Rohit accepts a buddy live:** run [`supabase/scripts/buddy_request_for_rohit.sql`](../supabase/scripts/buddy_request_for_rohit.sql) (set `from_name` to a player who is not already Rohit's buddy). Sign in as Rohit → Players → My partners → "Wants to be your buddy" → **Accept**.

**Comments on a shared video:** Rohit opens his shared session → Video → under the video, **Comments**: pause at a moment, write, **Comment at 0:21**. Carla opens it from Players → Shared → Rohit's session: she sees Rohit's comment and adds her own at another second; tapping a time jumps the video there. Both see every comment.

**One video for a buddy game:** Kirk asks Rohit to play, both log the session from the buddy session. Kirk uploads the video in his session's Video tab. Rohit opens his own session → Video → **Add Kirk's video** (no upload) and gets his own analysis. Kirk can switch off "Let Rohit use this video".

**Players:** partner cards open with a tap (photo, name, level and since when show while closed). Under Cancelled sessions, **Remove** takes a cancelled session off your list only.

**Rating a game (hold the ball):** open a session → Rate & plan. For each shot, press and hold the pickleball: the ring fills one step at a time; let go at the number of shots out of 10 that went in (it shows "7 in · 3 errors · 70%"). A quick tap adds one. Tap (?) beside a skill to see what it means. Court and game skills use the same ball from 1 to 5. **Goal length:** Settings → Goals → 2 weeks; Progress → Your goals now says "2 weeks · due …".

**Video (live):** with the analyzer running, open any session → Video → upload a clip → the report with the court overlay, player boxes, heatmap and shots appears when the analysis finishes. Then Ask for feedback "With video" so the partner can leave notes at moments in the video.
