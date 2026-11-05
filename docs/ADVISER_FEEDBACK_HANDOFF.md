# Handoff: adviser feedback update (PicklePro)

> **For the AI reading this:** this file is a complete brief. Read all of it before writing code. Work on the git branch `cleanversion`. Follow the "Rules" section exactly. Build one work package at a time, run the checks after each one, and do not commit or push unless the person you work for asks.

## 0. Progress log (read this first)

| Work package | Status | Database change needed? |
|---|---|---|
| WP1 Baseline as the starting point | ✅ Done (5 Nov 2026) | No |
| WP2 Progress centred on game performance | ✅ Done (peer column added with WP5) | No |
| WP3 Pre-game / In-game / Post-game | ✅ Done | No |
| WP4 Measured court tests | ✅ Done (5 Nov 2026) | **Yes**: `20261105090000_baseline_tests.sql` (`pickleproapp_upgrade_8.sql`) |
| WP5 Peer ratings and targeted feedback | ✅ Done (5 Nov 2026) | **Yes**: `20261105100000_peer_feedback.sql` (`pickleproapp_upgrade_9.sql`) |
| WP6 Buddy | ✅ Done (5 Nov 2026) | **Yes**: `20261105110000_buddy_match.sql` (`pickleproapp_upgrade_10.sql`) |
| WP7 Optimise and tidy | 🟡 Partly done (see below) | No |

**Next AI: start at WP7.** Everything left needs a new migration, so read rule 6 in section 3 first.

### 5 Nov 2026: WP6 Buddy looking-for, suggestions and linked sessions

- **DB:** `20261105110000_buddy_match.sql` (also `pickleproapp_upgrade_10.sql`). `profiles.buddy_looking_for` (practice / casual_game / competition); internal `buddy_game_summary()` (average self-rating over the last 5 rated singles/doubles sessions, rounded to 0.5, and up to 2 skills averaging 4+); `buddy_player_details()` returns those for the same players `buddy_players()` lists; `my_buddy_listing()` for the caller. `buddy_players()` is **not** changed (changing its columns would break re-running update 4). `sessions.buddy_request_id` with a trigger that allows only the owner's own accepted (or later called-off) buddy session. Local SQL tests: `95_buddy_match.sql`.
- **Buddy page:** "I'm looking for" toggles (Practice / Competition prep / Casual game) and "Others see: Sam · Novice · game 2.5 · looking for practice" on the listing card, with a privacy line; "Suggested for you" (up to 3: shares a looking-for value, game rating within 0.5, or the same level when a rating is missing; strong at one of your goal skills first, with the reason line); a purpose filter (All purposes / Practice / Competition prep) under the level filter; looking-for tags and the game rating on each player. "Ask" scrolls to the player's card and opens the request form.
- **Log this session:** `logBuddySessionHref()` adds `buddy=<request id>`; `NewSessionPage` saves it as `buddy_request_id` (`createSession` retries without it before update 10). Progress shows "N with a buddy" on the Game results card.
- **Logic:** `suggestBuddies()` in `src/lib/api/buddy.ts` (tested).

### 5 Nov 2026: WP5 targeted peer feedback and peer ratings

- **DB:** `20261105100000_peer_feedback.sql` (also `pickleproapp_upgrade_9.sql`). `report_shares.focus_skills` (≤ 3 valid skill keys, owner's order kept) and `with_video`; new `peer_ratings` (written only by `rate_shared_skill`, which checks a live share that asks about that skill); `peer_notes.skill`; `share_session` takes `p_focus_skills`/`p_with_video` and updates an existing share; `shared_report` returns `focus_skills`, `with_video`, `my_ratings`, and the video report and video only when `with_video`; `partner_can_view_video` requires `with_video`; `session_peer_ratings()` for names; `self_skill_keys()` lists the 10 skills. A partner can read their own ratings only for skills still asked about, while the share lasts. Local SQL tests: `90_peer_feedback.sql` (28 checks).
- **Owner:** `src/app/partners/PeerFeedback.tsx` in the Rate & plan tab (replaces `ShareCard`): "Get a partner's view" card, current shares with Change / Stop sharing, and the "Ask for feedback" bottom sheet (Who, up to 3 skills with goal skills first, With video / Ratings only, privacy line, "Send to Kyle"; rendered in a portal so the tab bar never covers it). "Feedback from Kyle": You vs Kyle bars per skill with "You agree" / "Kyle rated this 2 lower than you", and notes grouped by skill; tapping a time opens the Video tab at that moment (`ResultView` `seekTo`). The Video tab links to it ("Ask a partner for feedback on this video").
- **Plan:** `buildSelfReport({ peerLower })` makes a skill a partner rated ≥ 1 lower the first focus; `report.peerNote` shows as a Pickle line in `SelfReportView`.
- **Partner:** `SharedReportPage.tsx`: "Sam asked you to look at Dinking and Third-shot drop", one `SkillRater` per asked skill with the question worded about the owner (`aboutPlayer()`), "Send feedback to Sam", then the video report (only with video) and notes with skill tag chips (`PeerNotes` `skills` prop). Ratings-only shares show no video or report.
- **Partners page:** "Shared with you" shows what was asked and "✓ Feedback sent" / "Rate and send feedback".
- **Progress:** "peer" column (latest peer rating per skill) when any peer rating exists.
- **Logic:** `src/lib/coaching/peerFeedback.ts` (tested): `aboutPlayer`, `askSkillOrder`, `comparePeer`, `peerAuthors`, `peerLowerSkills`, `latestPeerBySkill`.
- **Changed from the plan:** the raters sit above the video on the partner's page (the report is long on a phone, so rating it first is easier to find); the peer column appears only once there is a peer rating.

### 5 Nov 2026: WP4 measured court tests

- **DB:** `20261105090000_baseline_tests.sql` (also `supabase/scripts/pickleproapp_upgrade_8.sql`). Table `baseline_tests`, private to the owner (RLS), test keys and the tries per test fixed by check constraints, no future dates. Local SQL tests: `supabase/tests/local/80_baseline_tests.sql`.
- **Definitions:** `src/lib/coaching/baselineTests.ts`: the 5 tests (key, label, skill, instructions, tries), `courtTestGoals()` (first result = baseline, best later result = now, target = +50%, at least +1, never above the tries), `latestResults()`, `lastTestedOn()`. `baselineTests.test.ts` checks the keys and tries against the migration.
- **API:** `src/lib/api/courtTests.ts` (`listCourtTests`, `saveCourtTests`, `courtTestErrorText`).
- **UI:** `src/app/tests/CourtTests.tsx` (one open test at a time, 52 px −/+ counter with a typed number, "Done · next test", "Leave out", sticky "Save baseline · N of 5 tests"; later saves read "Save results"). Route `#/tests` (`TestsPage.tsx`, lazy-loaded). Onboarding gains an optional step 6 after the profile is saved ("Save · next: quick court tests", with "Skip for now").
- **Progress:** "Measured on court" goals in the Your goals card; a "Measure your game" link when no tests exist; the re-test card now offers "Re-rate skills" and "Court tests" and also appears 28 days after the last court test.

### 5 Nov 2026: WP1, WP2, WP3 and part of WP6 (no database changes)

All built on `cleanversion`. `npm run check` passes: typecheck, 195 tests and the build. Checked in the browser at 375 px in dark mode using the local fake-data preview (`harness.html`).

**WP1: baseline**
- `src/lib/coaching/goals.ts` (new, tested in `goals.test.ts`): `goalTargets()` picks the **2** lowest baseline skills (ties go to the player's chosen focus) and targets +1, due 28 days after the baseline. `goalProgress()` and `daysSince()` are helpers.
- `src/app/onboarding/Onboarding.tsx`: step 5 is now "Where is your game today?", needs at least 3 ratings to finish (the old "Skip and finish" is gone), shows a "✓ N rated" bar, and shows a cream "Your goals for the next 4 weeks" card.
- The baseline date is `profiles.onboarding_completed_at`, so no `baseline_set_at` column was added. "Re-rate your baseline" sends the player to `#/welcome` (onboarding again), which saves new ratings and a new date.
- Changed from the plan: goals are shown in onboarding and on Progress, **not on Home** (Home already shows the plan's focus).

**WP2: Progress (`src/app/progress/ProgressPage.tsx`, rewritten)**
- Games / Practice / All switch. Default is Games, and the choice is remembered in `localStorage`, wrapped in try/catch.
- Average rating vs the baseline, with a dashed baseline line on the chart. It falls back to the first rating when there is no baseline.
- Game results card: win rate, games won (last 8 vs the 8 before) and unforced errors with a game-by-game bar strip. Each number needs at least 2 games.
- Your goals card with progress bars and "✓ Reached".
- Before and after card, from the pre-game check-in and recovery data (WP3 helper).
- By skill table with base / now columns. The **peer column is left out until WP5** exists.
- "Time to re-rate your baseline" card after 28 days; "Set your baseline" link when there is none.
- Logic lives in `src/lib/coaching/progressStats.ts` (tested in `progressStats.test.ts`). The route now passes `userId` (`App.tsx`).
- Journal data is loaded once with the new `listJournalSummaries()` in `src/lib/api/capture.ts` (3 queries in parallel).

**WP3: Pre-game / In-game / Post-game**
- `src/app/sessions/GamePhases.tsx` (new): the 3-step strip (Done / Now / To do) and the one-line pre-game summary ("slept 7.5 h · readiness 4 · warmed up · logged before play").
- `SessionDetail.tsx`: the strip sits above the tabs; Pre-game opens Journal step 1, In-game opens Rate & plan, Post-game opens Journal step 2. After rating, a "Next: post-game recovery" button appears. The existing tabs and `?tab=` links still work.
- `CapturePanel.tsx`: renamed to "Pre-game and post-game journal", with steps Pre-game / Post-game / Reflection. New optional props `step`, `onStepChange` and `onSaved`.
- `SelfAssessmentPanel.tsx`: the wrap-up step now has **Result (Won/Lost) and Score for every game**, not only tournaments. They are saved with the new `updateMatchResult()` in `src/lib/api/sessions.ts`. The Players tab edit form also allows result and score for any game.
- `src/lib/coaching/readinessInsights.ts` (new, tested): average rating by sleep (7 h or more vs less), readiness (4–5 vs 1–3) and warm-up. Each side needs at least 3 sessions. It also adds a recovery note when the last 2 sessions had soreness ≥ 4 or effort ≥ 8.
- The plan reacts to recovery: `buildSelfReport({ recovery })` in `selfAssessment.ts` makes the plan lighter (10-minute blocks, first one at an easy pace) when soreness ≥ 4 or effort ≥ 8. `isHeavyRecovery()` lives there.

**WP6 (part): Buddy**
- `src/lib/api/buddy.ts`: `nextFreeTime()`, `upcomingBuddySessions()` and `logBuddySessionHref()` (tested in `buddy.test.ts`).
- `BuddyPage.tsx`: a "Coming up" card for the next accepted buddy session, and a "Log this session" button on it and on every accepted buddy card.
- `NewSessionPage.tsx`: `buddyPreset()` reads `?with=&date=&context=&format=` and fills in the partner (doubles) or opponent (singles), date, context and format. Saved session defaults don't override it.
- Not stored: there is no `sessions.buddy_request_id`, so Progress can't count "games with buddies" yet. Add it with the rest of WP6.

**WP7 (part): speed**
- `listSessions()` matched videos, jobs and results with nested searches; it now uses lookup maps, so each session is linked in one pass.
- Progress numbers are computed with `useMemo` from pure tested helpers; skill averages no longer build a whole practice plan per session.

## 1. Background

PicklePro is a mobile-first pickleball coaching web app (thesis project). Players log sessions, rate their game, get practice plans, and can find a buddy or share a session with a partner for peer coaching.

The thesis adviser gave five points of feedback:

1. Focus the proposal on the player's **game performance**.
2. Collaboration = **finding a buddy** for **practice and competition**.
3. Game performance data explicitly includes **pre-game, in-game and post-game recovery** data.
4. Scope = **(a) peer coaching**; **(b) video** can capture practice or real games.
5. Introduce **baseline metrics** so goals are clear.

The gap analysis is in [`docs/ADVISER_FEEDBACK_GAP_ANALYSIS.md`](ADVISER_FEEDBACK_GAP_ANALYSIS.md). Short version: most of the data is already captured, but Progress, baselines and peer coaching don't use it.

**Approved mockups:** https://claude.ai/artifact/Rjaj5E1PEviL9BujXBX19C (8 phone screens). The link is private until the owner shares it. Section 5 describes each screen in words, so you can build without it.

## 2. Project facts

| Item | Value |
|---|---|
| Repo root | `ITISDEV_GITHUB_REPO/` |
| App folder | `Pickleball Performance Dashboard/` (all `src/` paths below are inside it) |
| Branch | `cleanversion` |
| Stack | React 18, TypeScript, Vite 6, Tailwind 4, React Router (hash routes), Supabase (Auth, Postgres, Storage), vitest |
| Migrations | `supabase/migrations/` at the **repo root**, applied in timestamp order. The newest is `20261024090000_partners.sql` |
| Checks | `npm run typecheck`, `npm test`, `npm run build`, or all three with `npm run check` (run inside the app folder) |
| Run locally | `npm run dev` (needs `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`) |
| Theme tokens | `src/app/theme.ts` (names) and `src/styles/theme.css` (light/dark values) |
| Shared UI | `src/app/shell/primitives.tsx` (`Card`, `Notice`, `cardStyle`, `numStyle`, `pressable`, …) |

### Code you will touch most

| Area | Files |
|---|---|
| Skills, rating anchors, plan rules | `src/lib/coaching/selfAssessment.ts` (`SELF_SKILLS`, `SKILL_INFO`, `buildSelfReport`) |
| Progress page | `src/app/progress/ProgressPage.tsx` |
| Home | `src/app/home/HomePage.tsx` |
| Session detail tabs (`plan`, `players`, `video`, `journal`) | `src/app/sessions/SessionDetail.tsx` |
| Pre-game / post-game / reflection form | `src/app/sessions/CapturePanel.tsx`, `src/lib/api/capture.ts` |
| Self ratings form | `src/app/selfAssessment/SelfAssessmentPanel.tsx`, `SkillRater.tsx` |
| Sessions data hook | `useSessionsData` in `src/app/sessions/sessionUi.tsx` |
| Onboarding | `src/app/onboarding/Onboarding.tsx`, `src/lib/api/profile.ts` |
| Buddy | `src/app/buddy/BuddyPage.tsx`, `src/lib/api/buddy.ts` |
| Partners / peer coaching | `src/app/partners/*` (`ShareCard`, `PeerNotes`, `SharedReportPage`, `PartnersPage`), `src/lib/api/partners.ts` |
| New session form | `src/app/sessions/NewSessionPage.tsx` |
| Types | `src/lib/api/types.ts` (`SESSION_CONTEXTS`, `PLAY_FORMATS`, `sessionKind()`) |

### Existing data you can reuse (do not duplicate)

| Phase | Table / column | Fields |
|---|---|---|
| Pre-game | `checkins` (per `session_participants` row) | `warmup_done`, `sleep_hours`, `readiness` 1–5, `focus`, `timing_status` (`pre_game` / `retrospective` / `unverified`) |
| In-game | `self_assessments` (per session) | `ratings` jsonb (10 skills, 1–5), `games_played`, `games_won`, `unforced_errors` (`few`/`some`/`many`), `biggest_struggle` |
| In-game | `sessions` | `session_context`, `play_format`, `match_result` (`win`/`loss`), `match_score`, `review_mode` |
| Post-game | `recovery_logs` | `exertion` 1–10, `soreness` 1–5, `cooldown_done` |
| Post-game | `reflections` | `went_well`, `change_next` |
| Baseline | `profiles.baseline_ratings` jsonb, `profiles.main_goals` | set in onboarding step 5, currently optional |
| Buddy | `buddy_requests` (`purpose` in `practice`/`casual_game`/`competition`, `status`, `slots`, meetup fields), `profiles.buddy_visible`, function `buddy_players()` | |
| Peer coaching | `partners`, `report_shares`, `peer_notes` (`video_time_s`, `body`); functions `share_session`, `unshare_session`, `shared_report`, `add_peer_note`, `edit_peer_note`, `delete_peer_note` | |

## 3. Rules (must follow)

1. **Mobile first.** Design at 360–390 px width first. Every tap target is at least 44 px. Main actions sit at the bottom, within thumb reach. Respect safe areas (`env(safe-area-inset-*)`).
2. **Keep the palette and fonts.** Use only the tokens in `theme.ts` (pickle green `#16271e`, yellow action `#febc17`, green `#3fbf63`, Inter for text, Barlow Condensed for numbers via `numStyle`). Never hard-code new colors. Both light and dark themes must work.
3. **Smooth motion.** Press feedback (about scale 0.97), 150–300 ms ease-out, sheets slide up over a dim backdrop, and no motion under `prefers-reduced-motion`.
4. **Restyle, don't break flows.** Keep existing routes, tabs and flows working. Add to them; don't remove features.
5. **Privacy (requirements M02, A04).** A partner never sees the owner's ratings, journal, plan, goals or audio, except the specific skills the owner chooses to ask about (WP5). Enforce every access rule in the database (RLS / `security definer` functions), not only in the UI.
6. **Database changes = new migration files** in `supabase/migrations/`, named `YYYYMMDDHHMMSS_name.sql` with a timestamp after `20261024090000`. Make them safe to run more than once (`if not exists`, `create or replace`, `drop policy if exists`). Never edit old migrations. Tell the person to apply them; don't reset the hosted database.
7. **Wording.** Plain, short sentences. Pre/post-game insights are descriptive, never medical ("Patterns in your own entries, not medical advice.").
8. **Tests.** Add or update vitest tests next to the files you change (`*.test.ts(x)`). `npm run check` must pass before you call a package done.
9. **Performance ("optimized").** Compute derived numbers with `useMemo` in pure helper functions under `src/lib/` (unit-tested), not inline in JSX. Load related tables in parallel (`Promise.all`), select only the columns you need, and don't add N+1 queries inside loops. Lazy-load new heavy routes the way `App.tsx` already does.

## 4. Work packages (build in this order)

Each package lists the adviser point it covers, its database changes, its UI and what "done" means.

### WP1 — Baseline as the starting point (#5) · small

- **DB:** none (uses `profiles.baseline_ratings`). Optionally add `profiles.baseline_set_at timestamptz` in a new migration so "set 12 Sep" and the re-test reminder have a date. Set it when onboarding saves ratings.
- **Onboarding (`Onboarding.tsx` step 5):** require at least 3 ratings before Next (the plan already needs 3). Show a "✓ N rated · at least 3 needed" bar. Below the ratings, show a cream card: "Your goals for the next 4 weeks: <lowest skill> X → X+1 · <second lowest> Y → Y+1".
- **Goal targets:** new pure helper `goalTargets(baseline, goals)` in `src/lib/coaching/` returns up to 3 `{ skill, from, target, due }`: the lowest-rated skills, target = from + 1 (max 5), due = baseline date + 28 days. Break ties using `main_goals`.
- **Done when:** onboarding can't finish with fewer than 3 ratings, and targets show on onboarding, Home and Progress (WP2).

### WP2 — Progress centred on game performance (#1, #5) · small–medium

Rebuild `ProgressPage.tsx` in this order, top to bottom:

1. Header "Progress" plus a caption ("8 games · 6 weeks").
2. **Games / Practice / All** segmented control. Default **Games**. Games = `sessionKind(s) !== "solo"`, Practice = `"solo"`. Remember the choice in `localStorage`, wrapped in try/catch.
3. **Average rating card:** big number = latest average for the filter, "+0.8 since your baseline", "Baseline 2.6 · set 12 Sep". The sparkline draws a dashed baseline line. If there's no baseline, fall back to the first rated session (current behaviour).
4. **Game results card** (hidden when Practice is selected):
   - Win rate: wins/(wins+losses) from `sessions.match_result`, shown as "5 won · 3 lost".
   - Games won: sum of `games_won`/`games_played` over the last 8 games, compared with the 8 before ("Up from 9/24").
   - Errors: latest `unforced_errors` and what it was before.
   - Bar strip of `unforced_errors` for the last 8 games (many = tall/warn, some = mid/yellow, few = short/green), with a legend.
   - Every number needs at least 2 data points. Otherwise show "Log 2 games with a result to see this."
5. **Your goals card:** the WP1 targets with progress bars, now = latest rating for that skill. "✓ Reached" when now ≥ target. Measured goals from WP4 go here too ("Dinks in a row 8 → 20, best 14").
6. **Before and after your games card** (WP3).
7. **By skill table:** columns **base / now / peer** (peer from WP5, "—" if none). Colour "now" yellow when it is above base.
8. **Time to re-test card** (cream) when the baseline is 28 or more days old. It links to the court tests (WP4).

- Put all calculations in a pure, tested module, e.g. `src/lib/coaching/progressStats.ts`.
- `useSessionsData` must also return the checkins, recovery logs and the `match_result`/`games_*` fields. Fetch them in parallel, once.
- **Done when:** the page matches the mockup at 390 px in light and dark, the empty states read well for a brand-new user, and the tests for `progressStats` cover the filters, the baseline fallback and the minimum data points.

### WP3 — Pre-game / In-game / Post-game as one model (#3) · small–medium

- **Session detail (`SessionDetail.tsx`):** show a 3-step strip at the top of the session: **Pre-game** (CapturePanel step 1), **In-game** (result + `SelfAssessmentPanel` + optional video link), **Post-game** (recovery + reflection). Each step shows ✓ Done / Now / Next. Keep the existing tabs and deep links (`?tab=plan|video|journal`) working; the strip is a guided layer on top.
- **In-game step:** the result (Won/Lost chips, score, "games won X of Y"), unforced errors (Few/Some/Many chips), then the skill ratings (goal skills first, tagged "· your goal"), then an "Add game video, optional" row. The sticky bottom button reads "Save · next: Post-game recovery".
- **Pre-game summary chip** at the top of the In-game step: "slept 7.5 h · readiness 4 · warmed up · logged before play" (green if `timing_status = pre_game`), with an Edit link.
- **Rename** the labels in `CapturePanel` from "Before play / After play / Reflection" to "Pre-game check-in / Post-game recovery / Reflection".
- **Insights helper** `src/lib/coaching/readinessInsights.ts` (pure, tested) for Progress:
  - average rating when slept ≥ 7 h vs under 7 h
  - games won when warmed up
  - each line shown only with at least 3 games in each group
  - soreness ≥ 4 in the last 2 games produces the line "This week's plan is lighter"
- **Plan reacts to recovery:** in `buildSelfReport` (or a wrapper), when the latest soreness ≥ 4 or exertion ≥ 8, cut the drill reps or suggest one lighter session, and say so in the plan text.
- **Done when:** a player can go through the three steps in order on a phone, Progress shows the "Before and after your games" card, and the insight tests pass.

### WP4 — Measured court tests (#5) · medium

- **DB (new migration):** table `baseline_tests`
  - `id` uuid primary key
  - `owner_id` uuid, default `auth.uid()`
  - `test_key` text, checked against a fixed list
  - `value` smallint ≥ 0
  - `out_of` smallint, nullable
  - `tested_on` date, default today
  - `created_at`
  - RLS: the owner can do everything; nobody else has access.
  - Tests: `deep_serves` (out of 20, Serve), `dinks_in_a_row` (best of 3, Dinking), `third_shot_drops` (out of 10, Third-shot drop), `deep_returns` (out of 10, Return), `rally_to_20` (best run, Consistency).
- **Test definitions** live in TypeScript (`src/lib/coaching/baselineTests.ts`): key, label, skill, instructions, `out_of`. The SQL check list must match the keys; add a test that compares them, like the existing `capture.test.ts` pattern.
- **UI:** new route `#/tests`. It's reachable from onboarding (an optional step 6, "Quick court tests", with "Skip for now") and from the Progress re-test card. One test is open at a time with a big −/+ stepper (52 px buttons) and a big Barlow number; the others show as rows with their last value. The bottom button reads "Save baseline · N of 5 tests".
- **Progress:** the first value is the baseline, the best recent value is "now", and the target is +50% (or `out_of`).
- **Done when:** values save and reload, Progress shows them, and re-testing adds a new row (history is kept).

### WP5 — Peer coaching: targeted feedback and peer ratings (#4a, #4b) · medium

- **DB (new migration):**
  - `report_shares` gets `focus_skills text[] not null default '{}'` (at most 3, each a valid skill key) and `with_video boolean not null default true`.
  - New table `peer_ratings (session_id, owner_id, author_id, skill, rating 1–5, created_at, updated_at, primary key (session_id, author_id, skill))`. Insert or update only through a `security definer` function `rate_shared_skill(p_session, p_skill, p_rating)`. It checks that the caller is a linked, active partner with a live share **and** that `p_skill` is in that share's `focus_skills`. The owner and the author can read the row.
  - `peer_notes` gets `skill text null`, which must be a valid skill key and one of the share's `focus_skills` when set. Update `add_peer_note` / `edit_peer_note` to accept it.
  - Update `share_session` to take `p_focus_skills` and `p_with_video`. Update `shared_report` to return `focus_skills` and the caller's own peer ratings, plus the video **only if** `with_video`.
  - **Ratings-only shares:** allow a share without video. `partner_can_view_video` must return false for those shares.
- **Owner: "Ask for feedback" sheet** (replaces or extends `ShareCard`): a bottom sheet over a dim backdrop with:
  - Who (partner chips)
  - "What should they look at? Up to 3" (skill chips, goal skills first)
  - Share "With video" / "Ratings only"
  - A privacy line: "Kyle sees the video and these 2 skills. Not your ratings, journal or plan."
  - Button "Send to Kyle"
  - Allow it on sessions without a video too (ratings only). This also covers #4b for solo drill sessions.
- **Partner view (`SharedReportPage`):**
  - Header: "Sam asked you to look at **Dinking** and **Third-shot drop**".
  - The video, if shared.
  - One 1–5 rater per focus skill, using the same anchors from `SKILL_INFO`, worded about the owner ("How patient and controlled were Sam's dinks?").
  - The note composer gets a time tag ("at 2:14", from the paused video) and a skill tag chip.
  - Button "Send feedback to Sam".
- **Owner view:** a "Feedback from Kyle" block in the session report:
  - **You vs Kyle** paired bars per skill, with a line underneath: "Kyle rated this 1 lower than you" (warn colour) or "You agree" (green).
  - A Pickle bubble: if a peer rating is ≥ 1 below self on a focus skill, that skill stays focus #1 in the plan, and the bubble says so.
  - Notes grouped by tag; tapping a time jumps the video there.
- **Progress:** the "peer" column = the latest peer rating per skill.
- **Done when:** RLS tests or manual SQL checks show a partner can't read non-focus skills, can't rate skills that weren't asked, and loses access the moment the share stops. The UI works at 390 px.

### WP6 — Buddy: purpose, suggestions and "Log this session" (#2) · medium

- **DB (new migration):**
  - `profiles.buddy_looking_for text[] not null default '{}'`, values from `practice`, `casual_game`, `competition`.
  - Update `buddy_players()` to return `looking_for` and a **coarse** `game_rating` (the player's average self-rating over their last 5 rated games, rounded to 0.5, or null). Return the rating only for players who are `buddy_visible`. Never return individual skill ratings.
  - Also return a `strong_skills` list (the top 1–2 skills rated ≥ 4) so "Strong at dinking, your focus" works. This is still coarse and opt-in; mention it in the privacy text on the Buddy page.
- **Buddy page (`BuddyPage.tsx`):**
  - **Upcoming card** for the next accepted buddy session (from `buddy_requests` with `status = 'accepted'`): date/time, purpose, format, place. Big yellow button **"Log this session"** → `#/new?buddy=<requestId>`.
  - **Suggested for you:** up to 3 players with `|game_rating − mine| ≤ 0.5` who share a `looking_for` value. Rank first those whose `strong_skills` include my current focus skill, with a reason line: "Strong at dinking, your focus" or "Similar game rating". Each has an "Ask" button that opens the existing request form.
  - **All players:** add purpose filter chips (All / Practice / Competition prep) next to the existing level filter.
  - **Your listing card:** "Others see: Sam · Intermediate · looking for", with toggle chips Practice / Competition prep / Casual game.
- **New session (`NewSessionPage.tsx`):** read `?buddy=<id>` and pre-fill partner name, context (`competition` → `tournament` or `casual_match`, `practice` → `practice`), format and date. Optionally store `sessions.buddy_request_id uuid null` (new column, FK to `buddy_requests`, `on delete set null`) so Progress can later count "games with buddies".
- **Done when:** the filters and suggestions work with the existing safety rules unchanged (adults only, request limits, 7-day pause), and logging from a buddy card pre-fills correctly.

### WP7 — Optimise and tidy · small

- Measure before and after (`npm run build` bundle sizes, React Profiler on Progress with about 50 sessions from `src/app/dev/mockSessions.ts`).
- Memoise derived data, load in parallel, select only needed columns, and lazy-load the new routes (`/tests`).
- Update `README.md` ("What this branch includes", migration table) and `docs/ADVISER_FEEDBACK_GAP_ANALYSIS.md` (mark items done).

## 5. Screen reference (what the mockups show)

| Mockup | Route / place | Key elements |
|---|---|---|
| Progress | `#/progress` | Games/Practice/All, rating vs baseline with dashed baseline line, game results (win rate, games won, errors + bar strip), goals with bars, before/after card, base/now/peer table, re-test card, tab bar |
| Session | `#/sessions/:id` | Pre-game ✓ / In-game (now) / Post-game strip, pre-game summary chip, Result card (Won/Lost, score, games won, errors), Rate your game (goal skills first), optional video row, sticky "Save · next: Post-game recovery" |
| Onboarding baseline | onboarding step 5 of 6 | progress dots, "Where is your game today?", ✓ 4 rated / 3 needed, raters with anchor text, cream goals card, "Next: quick court tests" |
| Court tests | `#/tests` | Skip for now, one open test with −/+ stepper and big number, other tests as rows, "Save baseline · 2 of 5 tests" |
| Ask for feedback | sheet on the session report | Who, up to 3 skills, With video / Ratings only, privacy line, "Send to Kyle" |
| Partner gives feedback | `#/shared/:sessionId` | "Sam asked you to look at…", video with time, raters for the asked skills, note with time + skill tags, "Send feedback to Sam" |
| You vs partner | session report | avatar header, paired bars You/Kyle, agree/differ line, Pickle bubble, tagged notes |
| Buddy | `#/buddy` | Upcoming card + "Log this session", Suggested for you (reason line, looking-for tags, Ask), purpose filter chips, Your listing with looking-for toggles |

## 6. Definition of done (whole update)

- [ ] All 7 work packages built; `npm run check` passes.
- [ ] New migrations added (not applied by you) and listed in the README migration table, with a note telling the person to apply them in order.
- [ ] Every new screen checked at 390 px in light and dark, with tap targets ≥ 44 px and reduced motion respected.
- [ ] Privacy rules enforced in SQL: a partner only sees what was shared; buddy listings show only name, level, looking-for and the coarse rating.
- [ ] No changes to unrelated features; existing tests still pass.
- [ ] Short summary for the person: what changed, which migrations to apply, anything not finished.

## 7. Proposal document (not code)

The adviser also wants the written proposal updated. Suggested changes:

- Make **game performance** the central measure; list other features as supporting.
- Add a section **"Game performance data: pre-game, in-game, post-game recovery"** using the table in section 2 ("Existing data you can reuse").
- Narrow the scope to **peer coaching**, with video as an optional way to capture practice or real games.
- Describe **collaboration** as finding a buddy for practice and competition, matched on performance.
- Add **baseline metrics**: self-rated baseline (required), measured court tests, 4-week targets and re-tests.
