# Mobile app and self-assessment (`pickleproapp` branch)

This branch responds to adviser feedback:

1. Make the product mobile-focused, taking design cues from the Reclub app.
2. Let players improve **without** computer vision: they assess themselves and still get things to work on. Video analysis becomes one part of the app, not the whole of it.

## Layout

- Phone-width column (`max-w-xl`) with a sticky top bar and a fixed bottom tab bar: **Home**, **Sessions**, **Log** (raised optic-yellow button), **Progress**, **Profile**. Safe-area insets are respected, so it can be added to an iPhone or Android home screen.
- Visual language: white rounded cards on a soft grey page, bold Plus Jakarta Sans headings, near-black primary buttons, court-green accents and optic-yellow highlights on dark cards. Tokens live in `src/app/theme.ts`. The older token names map onto the new palette, so the video-analysis views restyle without code changes.
- Research tools (shot labelling, local prototype, design preview) moved to **Profile → Research tools**. They use a wider layout.

## Logging a session

`#/new` asks how to review the session:

| Mode | What happens |
| --- | --- |
| **Rate my own game** (`review_mode = 'self'`) | Opens **Rate & plan** on the session. No video needed. |
| **Analyze a video** (`review_mode = 'video'`) | Opens the existing upload, court review and analysis flow on the **Video** tab. |

Every session has three tabs: **Rate & plan**, **Video** (marked *optional* for self-assessed sessions) and **Journal** (the private check-in, recovery and reflection wizard). A video session can be rated too, and a self-assessed session can add a video later.

## Self-assessment and practice plan

`src/lib/coaching/selfAssessment.ts` holds the skill list and the planning rules (unit tested in `selfAssessment.test.ts`).

- Ten skills in three groups. **Shots:** serve, return, third-shot drop, dinking, volleys. **Court:** getting to the kitchen line, transition and resets, footwork. **Game:** consistency, shot choice and teamwork. Each rating from 1 to 5 has a plain description, so a 3 means the same thing every session.
- Wrap-up: games played and won, unforced errors (few, some or many), and "what gave you the most trouble" in the player's own words.
- At least 3 rated skills are needed. The **focus** list (up to 3) ranks rated skills below 5 by `6 − rating`. It adds +1 when the skill matches a session focus the player chose, +1.5 when the player's own words mention it (keyword match), and +1.5 to consistency when they reported many unforced errors. Each focus item has an explanation, a drill and a next-session target, which is the description of the next rating up.
- **Strengths** are skills rated 4 or 5 that are not focus items. The average rating gives a level label: Building foundations, Developing, Solid or Advanced.
- **Next week** turns the focus drills into three short practice sessions, then a reminder to rate again.
- **Since last time** compares skill by skill with the most recent earlier self-assessed session. The **Progress** tab charts the average and each skill over time.

These are the player's own ratings, not measurements. The report says so, and it points to video analysis for measured court positions.

## Database

Migration `20261006090000_self_assessment.sql` (safe to run again):

- `sessions.review_mode text not null default 'video'`, either `'self'` or `'video'`.
- `self_assessments`, one row per session: `ratings jsonb`, validated by `valid_self_ratings()` to known skills with integer values 1–5, plus games, errors and the struggle text. Owner-only RLS; the row is deleted with its session.

Local SQL tests: `supabase/tests/local/30_self_assessment.sql`, run by `supabase/tests/run_local_rls_tests.sh`.

**Hosted projects need this migration before the branch is deployed.** Until it is applied, creating a session shows a message naming the missing migration. Existing screens still load.
