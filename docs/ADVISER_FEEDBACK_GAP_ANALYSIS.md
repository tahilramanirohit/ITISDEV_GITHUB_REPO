# Adviser feedback: gap analysis (branch `cleanversion`)

Checked against the code on `cleanversion` (commit `5ec59a4`) on 5 November 2026. The table below this note was the starting point; see **Status after the update** for what is now done.

## Status after the update (5 November 2026)

Built in work packages WP1–WP7 (details in [`ADVISER_FEEDBACK_HANDOFF.md`](ADVISER_FEEDBACK_HANDOFF.md)).

| # | Feedback | Now | What closed the gap |
|---|---|---|---|
| 1 | Game performance | **Done** | Progress: Games / Practice / All, win rate, games won, unforced-error trend, games with a buddy (WP2, WP6) |
| 2 | Buddy for practice and competition | **Done** | "Looking for", purpose filter, suggestions by game rating and strong skills, "Log this session" linked to the buddy session (WP6) |
| 3 | Pre / in / post-game data | **Done** | Pre-game / In-game / Post-game steps; sleep, readiness and warm-up patterns on Progress; lighter plan after heavy soreness or effort (WP3) |
| 4a | Peer coaching | **Done** | Owner picks up to 3 skills; partner rates them 1–5 and tags notes; You vs partner view; a lower peer rating sets the first focus; peer column on Progress; ratings-only shares without video (WP5) |
| 4b | Video for practice or real games | **Partly** | Sessions without a video can be shared for ratings (WP5). Still open: a review-only video for solo drills that skips court analysis |
| 5 | Baseline metrics | **Done** | Required baseline (3+ skills), 4-week +1 goals, baseline on Progress, re-test reminder (WP1, WP2), measured court tests with targets and history (WP4) |

Suggested improvements from the sections below, one by one:

- §1: 1 ✅, 2 ✅; 3 is proposal text (not code).
- §2: 1 ✅, 2 ✅ (similar rating; "complementary skills" is used as "strong at your focus skill"), 3 ✅.
- §3: 1 ✅, 2 ✅, 3 ✅; 4 is proposal text.
- §4a: 1 ✅, 2 ✅, 3 ✅, 4 ✅.
- §4b: 1 open (see above); 2 is proposal text.
- §5: 1 ✅, 2 ✅, 3 ✅, 4 ✅, 5 ✅ (re-test card after 4 weeks).
- Not planned: a separate baseline for game results or recovery. Progress compares recent games with the ones before instead.

| # | Feedback | Status in the app | Main gap |
|---|---|---|---|
| 1 | Focus the proposal on the player's game performance | **Partly there** | Game results are recorded but not tracked over time; Progress shows only self-ratings |
| 2 | Collaboration = finding a buddy for practice and competition | **Mostly there** | Matching uses self-declared level only; a buddy session is not linked to the logged session |
| 3 | Game data covers pre-game, in-game and post-game recovery | **Built, not used** | All three phases are captured, but the data is "context only" and never shows up in plans or Progress |
| 4a | Scope: peer coaching | **Mostly there** | Peer notes are free text only, with no link to the 10 skills or the player's goals |
| 4b | Video for practice or real games | **There** | Filming guide assumes a full-court game, so solo drill clips do not fit well |
| 5 | Baseline metrics to set clear goals | **Partly there** | Onboarding baseline is optional, only used for the first plan, and not shown as the starting point in Progress |

---

## 1. Focus on the player's game performance

**What the app has**
- Sessions are tagged as solo practice, casual game or tournament (`src/lib/api/types.ts`).
- Each session can be rated on 10 game skills, 1 to 5, with a written description for every score so ratings stay consistent (`src/lib/coaching/selfAssessment.ts`).
- Optional game numbers: games played, games won, unforced errors (few/some/many), biggest struggle (`self_assessments` table).
- Match result (win/loss) and score (`20261006110000_adviser_notes.sql`).
- Optional video analysis: court position, time spent in each court zone, shot list.

**Gaps**
- Progress (`src/app/progress/ProgressPage.tsx`) shows only the average self-rating and per-skill ratings. Win rate, games won and unforced errors are saved but never charted.
- Progress does not separate practice from games. The adviser wants game performance, so practice and game ratings should not be averaged together.
- Several features are not about performance (profile photo, bio, paddle, themes, audio coach voice). They are fine to keep, but the proposal should list them as supporting features, not core scope.

**Suggested improvements**
1. Add a **Game results** card to Progress: win rate, games won / played, and the unforced-error trend over the last 10 games.
2. Add a **Practice / Games** toggle to Progress so the trend can show game performance only.
3. In the proposal, make "game performance" the central measure and list every other feature under it.

---

## 2. Collaboration: finding a buddy for practice and competition

**What the app has** (`src/app/buddy/BuddyPage.tsx`, `20261022090000_buddy_finder.sql`)
- Opt-in buddy list showing name and level (Beginner, Novice, Intermediate, Advanced), with a level filter.
- A request has a purpose — **Practice / drills**, **Casual game** or **Competition prep** — plus format, city, place and free times. This matches the adviser's "practice and competition contexts".
- Accept, decline and cancel with a reason, plus safety rules (adults only, request limits, 7-day pause after a decline).

**Gaps**
- Matching uses only the level the player picks for themselves. Their performance data (ratings, results) is not used, even though the feedback calls this "an extension of performance informatics".
- The listing does not show what each player is looking for (practice or competition), so you only find out after sending a request.
- After a buddy session happens, nothing connects it to performance. The player types the partner's name as free text when logging the session.

**Suggested improvements**
1. Let players set what they are **looking for** (practice, competition prep or both) on their listing, with a filter.
2. Show a **suggested buddies** row based on recent average rating (players within about ±0.5), and optionally on complementary skills (my weakest skill is their strongest).
3. On an accepted buddy session, add **Log this session**, which opens New Session with the buddy, purpose and format already filled in. Then Progress can show "games with buddies" and the proposal can claim the link between collaboration and performance.

---

## 3. Pre-game, in-game and post-game recovery data

**What the app has**: all three phases already exist.

| Phase | Data captured | Where |
|---|---|---|
| Pre-game | Warm-up done, sleep hours, readiness 1–5, session focus, plus a check that the entry was made **before** play started (`pre_game` / `retrospective`) | `checkins` table, `CapturePanel.tsx` step 1 |
| In-game | 10 skill ratings, games played and won, unforced errors, win/loss and score, optional video (positions, zones, shots) | `self_assessments`, `sessions`, video analysis |
| Post-game recovery | Exertion 1–10, soreness 1–5, cool-down done | `recovery_logs`, `CapturePanel.tsx` step 2 |
| Reflection | What went well, what to change next | `reflections`, `CapturePanel.tsx` step 3 |

**Gaps**
- The app does not present these as one pre / in / post model. The screens are labelled "Before play", "After play" and "Reflection", and the in-game part sits in a separate tab.
- Pre-game and recovery data are never used. Nothing in `selfAssessment.ts`, `coaching.ts`, Home or Progress reads sleep, readiness, exertion or soreness. The screen says "context only".
- The proposal needs an explicit section on this, as the adviser asked.

**Suggested improvements**
1. Rename the session steps to **Pre-game → In-game → Post-game recovery** so the app matches the proposal's wording.
2. In Progress, show readiness, sleep and soreness next to each game's rating, with a simple observation once there are enough games, for example: *"Your ratings were higher on days you slept 7+ hours (5 games)."* Keep the wording descriptive, not medical.
3. Let the practice plan respond to recovery, for example lighter drills when soreness ≥ 4 or exertion ≥ 8 last time.
4. In the proposal, add a section with the table above, explaining what each phase captures and why.

---

## 4. Scope: peer coaching, with video

### 4a. Peer coaching

**What the app has** (`src/app/partners/`, `20261024090000_partners.sql`)
- Link with a trusted partner by invite code, or with "Invite as partner" from an accepted buddy.
- Share one session's video report with chosen partners. Goals, ratings, journal and plan stay private.
- Partners leave notes pinned to a moment in the video. The owner can jump to that moment and delete notes.

**Gaps**
- Peer notes are free text only (`peer_notes.body`). A partner cannot rate the same 10 skills, so there is no "self rating vs peer rating" comparison, which would be the most useful peer-coaching data.
- The partner cannot see what the player wants feedback on, because goals are hidden for privacy, so feedback is not targeted.
- Peer notes do not feed into the practice plan.
- Sharing requires a video. Peer coaching without a video (for example a buddy who played with you) is not possible.

**Suggested improvements**
1. When sharing, the owner picks **what they want feedback on** (1–3 skills). Only those are shown to the partner, so the privacy rule still holds.
2. Add optional **peer ratings** for those skills on the same 1–5 scale, then show self vs peer ratings in the report and in Progress.
3. Allow sharing a session **without video** (ratings request only), for buddy games.
4. Tag each peer note with a skill so notes can be grouped and counted.

### 4b. Video for practice or real games

**What the app has**: video upload works on any session type (solo practice, casual game, tournament), and the session type is stored with it.

**Gaps**
- The filming guide (`BaselineNotice.tsx`) and the analysis assume a full-court game filmed from behind the baseline. Solo drills such as wall practice or ball machine will often fail the court check.

**Suggested improvements**
1. For solo drill sessions, allow a **review-only video** (no court analysis) that can still be shared for peer notes.
2. In the proposal, state that video is optional and can capture both practice and real games.

---

## 5. Baseline metrics

**What the app has**
- Onboarding step 5 asks for baseline ratings of the 10 skills (`Onboarding.tsx`), saved as `profiles.baseline_ratings`.
- Home uses them to build a starting plan before the first rated session (`HomePage.tsx`).

**Gaps**
- The baseline is optional: "Skip any you're unsure about." A player can finish onboarding with no baseline.
- After the first rated session, the baseline is never used again. Progress compares against the **first rated session**, not the onboarding baseline.
- There is no baseline for game results (win rate, errors) or for pre-game and recovery data.
- Goals (positioning, shot technique, shot outcomes) are categories, not targets. Nothing says "dinking 2 → 3 in 4 weeks".
- All baseline numbers are self-ratings. The drills already describe countable tests (for example "serve 20 balls, count how many land deep"), but the counts are never recorded.

**Suggested improvements**
1. Make the baseline required: at least 3 skills, the same minimum the plan already needs.
2. Add a **Baseline** column to Progress (baseline → now) and keep "first game" as a fallback.
3. Set **goal targets from the baseline**: for the 1–3 weakest skills, target +1 over 4 weeks, shown on Home and Progress.
4. Add **measured drill baselines**: record the drill count (for example serves deep out of 20, longest dink rally), then re-test every 4 weeks. This gives one objective number per skill alongside the self-rating.
5. Offer a **re-baseline** prompt every 4–6 weeks.

---

## Suggested order of work

| Priority | Change | Covers | Size |
|---|---|---|---|
| 1 | Baseline column and goal targets in Progress; required baseline | #5 | Small |
| 2 | Game results card and Practice / Games toggle in Progress | #1 | Small |
| 3 | Rename to Pre-game / In-game / Post-game; show readiness and recovery next to ratings | #3 | Small–medium |
| 4 | Peer ratings on chosen skills; self vs peer view | #4a | Medium (new column + RLS) |
| 5 | Buddy "looking for" field, suggested buddies, "Log this session" | #2 | Medium |
| 6 | Measured drill baselines | #5 | Medium |
| 7 | Review-only video for solo drills; share without video | #4a, #4b | Medium |

The proposal document needs edits for #1, #3 and #4 whatever is built: put game performance at the centre, add a pre / in / post data section, and narrow the scope to peer coaching with optional video.
