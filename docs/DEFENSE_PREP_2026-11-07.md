# Mock defense prep (7 November 2026)

## User stories (cleanversion)

### 1. Rate my game and get a plan

**As a** recreational pickleball player, **I want to** rate how I played after a session, **so that** I get a focused practice plan without needing a video.

Acceptance criteria:

- I can rate up to ten skills from 1 to 5. Each skill has one plain question and a short label for each number.
- Skills I skip count as "didn't come up", not as low scores.
- I need at least 3 rated skills to get a plan, and the screen tells me why.
- The plan shows this week's drill, three focus areas with the reason each was picked, and a target for next time.
- Pickle can read the plan aloud.

### 2. Measure progress against my starting point

**As a** player who wants to improve, **I want to** set a baseline and track my progress against it, **so that** I can see whether practice is working.

Acceptance criteria:

- During sign-up I rate my usual level in at least 3 skills. This becomes my baseline.
- PicklePro sets two four-week goals from my lowest skills.
- Progress shows my average rating against the baseline, for Games, Practice or All.
- Progress shows my win rate, games won and unforced errors over time.
- I can record counted court tests (for example, deep serves out of 20). After a few weeks I'm reminded to re-test.

### 3. Analyze a match video

**As a** player who films my games, **I want to** upload a clip and see where I stood, my shots and my errors, **so that** I know what to fix on court.

Acceptance criteria:

- Before upload I see the limits: 50 MB, 10 seconds to 5 minutes, 5 uploads a day, landscape, 720p or better.
- I confirm that everyone in the clip agreed to be recorded.
- I choose whether the video has 2 or 4 players. While it is analyzed I see each step without refreshing.
- I pick which player is me.
- I see my shots on a timeline and can tap one to jump to that moment.
- I see where I stood (kitchen, transition, baseline) and errors counted from the video: serve faults, shots out, kitchen faults, and positioning errors.
- Results the video can't support are shown as "not enough data", never as made-up numbers. Experimental results are labelled.

### 4. Get feedback from a partner I trust

**As a** player, **I want to** ask a buddy to rate specific skills from one of my sessions, **so that** I get an honest outside view of my game.

Acceptance criteria:

- I add a player as a buddy, then invite them as a video partner.
- I choose one session, up to 3 skills, and whether to share the video.
- My partner rates only those skills from 1 to 5 and can leave notes pinned to times in the video.
- I see my ratings next to my partner's. A lower partner rating can set my next focus.
- My other ratings, my journal and my plan stay private. I can stop sharing at any time.

### 5. Pause my plan when I'm hurt

**As a** player who gets injured or sore, **I want to** switch to a rest plan, **so that** I don't keep training through pain or lose my goals.

Acceptance criteria:

- Tapping "I'm injured" switches Home to a rest plan, pauses my goal deadlines and hides me from the Buddy list.
- If I log high soreness (4 of 5) or effort (8 of 10) after a game, my next plan is lighter.
- Tapping "I'm back" restores my goals and my Buddy listing.
- The screen says the advice is not medical advice.

## Adviser comments: draft responses

**1. Name ideas (acronym preferred).** We propose **HASA: Holistic Assessment for Skill Advancement**. "Hasa" is Filipino for "to sharpen", which fits an app that sharpens your game. A quick web search found no pickleball app or brand using it. The other ideas are already in use:

- PICA: there is an app called "Pica Ball".
- PIKO: Piko House is a pickleball court, and Piko Bounce is a pickleball mascot game.
- PASA: the Philippine Athletic Sports Association runs pickleball tournaments.

**2. Highlight peer coaching.** It now has its own slide and its own section in the demo:

- buddy → video partner
- ask about up to 3 skills
- partner rates and leaves timed notes
- "You vs your partner"

**3. Walkthrough of the whole transaction.** The demo follows Design B from sign-up to six weeks of progress, using Rohit's account. The earlier PDF walkthroughs are kept as reference only.

**4. Wireframe with logic.** One slide maps the full flow with its decision points:

- at least 3 skills rated?
- rate it yourself or upload a video?
- video passes the checks? court found?
- high soreness?
- injured?

**5. Different features and user-side issues (e.g. injured).** A "What if" slide covers six situations:

- injury
- high soreness
- no video
- a poor video
- a partner who stops sharing
- an email that already has an account

**6. 5-minute slides, 20-minute presentation and demo.** The deck is timed: 5 minutes of slides, then the live demo, then Q&A. Timing is in the speaker notes.

**7. Add scope.** A Scope and limitations slide lists what is in and out of scope, and which parts are experimental.

**8. Service errors and court positioning errors.** One slide covers how service errors are handled:

- an interrupted upload resumes
- analysis retries up to 3 times
- "not enough data" instead of fake results
- manual court correction when the court isn't found

The same slide shows positioning errors counted from the video.

**9. Count the errors.** The video report counts five error types:

- serve faults
- shots out
- kitchen faults
- no-man's land
- staying back after the return

Errors are grouped and color-coded, each can be watched, and they are labelled experimental until checked against hand counts.

**10. Real-time audio coaching.**
- **Today:** coaching is read aloud after the game, with the words lighting up as they are spoken.
- **Next:** real-time cues during drills.
- **Out of scope:** live coaching during a match.

**11. Which server is used.**
- **Website:** React app hosted on Vercel.
- **Database, sign-in and storage:** Supabase (PostgreSQL with row-level security, Auth, Storage, Realtime).
- **Video analysis:** a Python worker (FastAPI, OpenCV, YOLO11n for players, pinned ball and court models). It runs on a trusted machine today; a hosted worker is planned.

**12. Automation and triggers.** 20 database triggers already automate checks such as:

- upload limits
- marking a check-in as before or after play
- raw-video deletion dates
- linking buddy sessions
- carrying the 2/4-player setting into the analysis

App rules also generate plans automatically, lighten plans after a hard game and pause goals during injury. Next steps: reminders and pre-filled sessions.

**13. Marketing video.** Noted; to follow.

**14. Populate the database (mock data only).** Noted; to follow. A demo-data script for four sample accounts already exists in `supabase/scripts/demo_data.sql`.

**Minor items, status:**

- Interactive analysis: done (tap a shot or error to jump to it in the video).
- Toggle 2 and 4 players: done (chosen at upload).
- Color-coded feedback: done (errors many/some/few, you vs partner, goals reached).
- Chat bubbles and organized UI: done (Pickle's speech bubbles and the Design B layout).
- Dark mode: done (Design B is dark green).
