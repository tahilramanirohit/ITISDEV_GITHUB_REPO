# PicklePro improvements — build handoff (2026-11-08)

This folder is everything needed to build the approved improvements in the PicklePro app. The screens in `images/` are the target. Match them as closely as the app's existing components allow.

- Approved mockup (interactive canvas): https://claude.ai/artifact/DD1fMpThmU2nAQwLBrMFnB (private to the owner)
- Look: the saved **Design B, dark green** (`docs/mockups/design-b-dark-green.html`). The app's dark theme already uses these colors.
- App: `Pickleball Performance Dashboard/` (React + Vite + TypeScript + Tailwind, Supabase backend)

---

## 1. Ground rules

1. **Branch:** work on `cleanversion`. There is no `clean` branch. First run `git fetch`, then `git switch cleanversion`, then `git pull --ff-only`. Do not discard uncommitted work. Do not create branches. Never touch, merge into, or push to `main`.
2. **Do not push.** Commit only if the owner asks.
3. **Restyle, don't rebuild.** Keep existing flows, routes, data and components. Reuse `app/shell/primitives.tsx` (`Chip`, `PrimaryButton`, `Notice`, `PickleSays`, `cardStyle`, `numStyle`, `pressable`, …) and the colour tokens in `app/theme.ts`. Never hard-code hex colours in components. The mockups show the dark theme, and the light theme must keep working through the same tokens.
4. **Mobile first.** Build at 360–390px width. Tap targets must be at least 44px, and main actions sit at the bottom. Give buttons press feedback (scale .97). Respect `prefers-reduced-motion`. Respect the safe areas (`env(safe-area-inset-*)`).
5. **Real data only.** Never show made-up stats or scores.
6. **Out of scope (do not build):**
   - pickleball term tooltips
   - adjustable weekly goal periods
   - notifications
   - a redesign of shot success/error tracking
   - long-press shot rating
   - AI analytics integration
   - buddy-invite accept flows or swipe-to-accept
   - creating 20 test accounts
   - a peer-coaching redesign
   - removing coaching metrics or extra-info fields

## 2. Design tokens (Design B)

| Role | Token in `theme.ts` | Dark value |
| --- | --- | --- |
| Page | `PAGE_BG` | `#16271e` |
| Card | `SURFACE` | `#22342a` |
| Sunken / track | `SURFACE_2` | `#2b3f33` |
| Hero / darkest | `HERO` | `#0e1a13` |
| Text | `INK` / `INK_2` / `INK_3` | `#f2f5f1` / `#c6d3ca` / `#a9b8ae` |
| Lines | `LINE` / `LINE_STRONG` | `#31463a` / `#5b7263` |
| Main action | `ACTION` / `ON_ACTION` | `#febc17` / `#1f1a05` |
| Green | `CHECK` | `#3fbf63` (light green text `#7fd796`) |
| Speech bubble | `CREAM` / `ON_CREAM` | `#f6efd9` / `#121a15` |

- **Fonts:** Inter for text. Barlow Condensed (`numStyle`) for every number and range ("7–12", "3", scores).
- **Shapes:**
  - Cards: 20px radius, with a 4px green top edge where Design B has it.
  - Tiles: 22px radius.
  - Buttons: full pills, 52px tall, yellow.
  - Chips: pills, at least 44px tall.
- **"New" tags in the images** only mark changes for reviewers. **Do not ship them.**

## 3. Text size (applies everywhere)

Raise small text throughout the app. Keep the visual hierarchy, colours and spacing.

| Text | Now | Target |
| --- | --- | --- |
| Body and descriptions | 13–14px | **16px** |
| Secondary and helper text | 12–13px | **14–15px** |
| Labels (`labelClass` is `text-sm`) | | at least 14px |

The smallest text anywhere should be 12px, and only for uppercase tag pills. Inputs stay at 16px (stops iOS zoom). Check at 360px, 768px and desktop.

---

## 4. Screens

### 4.1 Sign up and sign in with Google: `images/01-sign-up-google.png`

**File:** `app/auth/AuthScreen.tsx`

- Add a white **"Continue with Google"** button (Google "G" logo, dark text, pill, 52px) at the top of both Sign in and Create account. Below it, add a divider: "or use your email". Email and password stay exactly as they are.
- Call `sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + window.location.pathname } })`. Show a friendly `Notice` on error.
- Keep sessions working. `useAuth.ts` already listens to `onAuthStateChange` and `getSession`, so the redirect back should just work.
- **No duplicate profiles.** The `profiles` row is keyed by the auth user id. A Google user gets the same flow as email users: profile created or upserted by the existing onboarding code. Do not create a second row.
- Under the button, add: "Next, Pickle shows what data PicklePro keeps and asks for your OK."
- **Never hard-code secrets.** The Google client ID and secret live only in the Supabase dashboard.

### 4.2 Data consent (new step): `images/02-data-consent.png`

**New component**, e.g. `app/onboarding/ConsentStep.tsx`. Show it **before onboarding**, for every signed-in user (email or Google) who has not given consent yet. Hook it into `OnboardingGate.tsx`:

- If there's no consent yet, show `ConsentStep`.
- Else if `needsOnboarding(profile)` is true, show `Onboarding`.
- Otherwise, show the app.

Existing users see the consent step once.

**Layout, top to bottom:**
1. A Back link.
2. The Pickle mascot with a cream bubble: **"Before we start, your data."** / "Here's what I keep and why. Change it any time in Settings."
3. A **"What we collect"** card with three check rows:
   - Your profile: name, email, level, how long and how often you play.
   - Your games: scores, your 1–5 skill ratings and journal notes.
   - Videos, if you add one: where you stood and your shots.
4. Under the rows, in the same card: "We use it to track your progress, show your stats and pick drills for you. Your password stays with our sign-in provider; PicklePro never stores it."
5. A card with three switches (`role="switch"`):
   - **Keep my profile and games:** required, on and locked.
   - **Performance analytics · optional:** off by default. "Trends, win rate and tips from your games and videos."
   - **Help our research · optional:** off by default. "Use my data, without my name, in the PicklePro study."
6. A yellow **"Agree and continue"** button, then a "Read the full privacy notice" link to `#/privacy`.

**Storage.** Do **not** reuse `consent_records`: it is locked to video uploads (`scope = 'recording_upload'`, fixed policy version). Add a new **additive** migration, e.g. `supabase/migrations/20261108090000_data_consent.sql`:

```sql
alter table public.profiles
  add column if not exists data_consent_version text,
  add column if not exists data_consent_at timestamptz,
  add column if not exists analytics_opt_in boolean not null default false,
  add column if not exists research_opt_in boolean not null default false;
```

- Existing profile RLS (owner can update their own row) should cover this. Verify it.
- Save with `profiles.upsert` (id = user id), setting `data_consent_at = now()` and a version string such as `'2026-11-08-v1'`.
- Add the fields to `PlayerProfile` in `lib/api/profile.ts`, plus a `needsConsent(profile)` helper.
- Add the two optional switches to Settings (`app/settings/SettingsPage.tsx`) so players can change them later.
- Nothing optional (analytics or research use) may read data when its switch is off.

### 4.3 Onboarding, "How long have you been playing pickleball?": `images/03-onboarding-how-long.png`

**Files:** `app/onboarding/Onboarding.tsx` (the `EXPERIENCE` constant, steps 0–1) and `app/profile/EditProfilePage.tsx` if it reuses `EXPERIENCE`.

- **Question text:** exactly **"How long have you been playing pickleball?"**, with the helper line "Count from your first game."
- **Answers:** five big number tiles in two columns (Barlow Condensed number, word under it). The last tile is full width.

  | Tile | Label | Stored `years_playing` |
  | --- | --- | --- |
  | `<3` months | Less than 3 months | `0.1` |
  | `3–6` months | 3 to 6 months | `0.4` |
  | `7–12` months | 7 to 12 months | `0.8` |
  | `1–2` years | 1 to 2 years | `1.5` |
  | `2+` years, a long time | More than 2 years | `3.0` |

  The column is `numeric(4,1)` with a check of 0–99, so all five values fit. **No migration is needed.**
- **Old answers map automatically.** Keep `nearestExperience()` as it is. Old values become: 0 → 0.1, 0.5 → 0.4, 1.5 → 1.5, 3 → 3.0, 5 → 3.0. "Brand new" is removed.
- **Selected tile:** yellow background (`ACTION`), dark text, soft glow. Unselected tiles use `SURFACE` with a green top edge. Use `role="radiogroup"` and `role="radio"`, and give each tile an `aria-label` with the full words ("7 to 12 months").
- **Pickle's reply:** after a pick, show Pickle (mascot plus cream bubble, the existing `PickleSays` if it fits) with a plain-words line for that answer:
  - Less than 3 months: "Got it. You're new, so we'll start with serving and keeping score."
  - 3 to 6 months: "Got it. You know the basics; we'll work on keeping the ball in."
  - 7 to 12 months: "7 to 12 months, got it. So you can keep the ball going, but still miss a lot. I'll plan for that."
  - 1 to 2 years: "Got it. You know the rules; we'll work on making fewer mistakes."
  - More than 2 years: "Got it. You've played a while; we'll work on winning more points."
- **Step layout:**
  - Step 1 ("About you") = name + this question.
  - **"How often do you play?" moves to step 2 ("Your game")**, alongside format and hand.
  - The step count stays the same. Don't change any other onboarding question.

### 4.4 Home for a new player: `images/04-home-new-player-TODAY.png` (before) and `images/05-home-new-player-NEW.png` (target)

**File:** `app/home/HomePage.tsx`

**While the player has no recorded games (`sessions.length === 0`):**

- **Hide** the "Games this week" / week-streak section, the `GhostGame` placeholder, and any other empty stats.
- **Show first:** a dark hero card (`HERO`, 28px radius) with Pickle and a **yellow** speech bubble: "Log your first game" / "About 2 minutes. Then I'll tell you what to work on." Under the bubble, a big yellow pill button: "+ Log your first game", linking to `#/new?mode=self`.
- **Then:** "Getting started", the existing `GetStarted` steps restyled as Design B plan steps. Each step is a round node (done = green check, now = yellow numbered with a glow, next = outlined) next to a card. The steps are "Set up your profile", "Log your first game", "Get your drill plan".
- **Then:** the "Have a recording?" card (Design B yellow-soft tile).
- **Last:** the small line "Games this week and your streak appear after your first game."

**After the first game (`images/06-home-after-first-game.png`):** the normal dashboard returns automatically:

- Pickle tile
- Games this week (balls) and week streak tiles
- Last game scoreboard
- Practice next
- "Log today's game" button

The home page must refresh after a game is logged. `useSessionsData` should reload when you come back to home, so check that it does. Keep the injury/recovery behaviour.

### 4.5 Rate your game: `images/07-rate-your-game.png`

**Files:**
- `app/selfAssessment/SkillRater.tsx`: shared by session rating and onboarding
- `app/selfAssessment/SelfAssessmentPanel.tsx`
- `app/partners/PeerFeedback.tsx`: the partner rating also uses 1–5
- any other 1–5 control, e.g. "Body feels" in `app/sessions/GamePhases.tsx`

**1. Scale labels.** Under every 1–5 row, show "**1 = Lowest**" on the left and "**5 = Highest**" on the right (14px, bold, `INK_2`). Keep the existing anchor text under it ("2 · Mostly too high"). Use the same labels everywhere.

**2. Auto values from the score.** Parse the score field (e.g. `11-7, 9-11, 11-5`) with a small pure helper, e.g. `lib/coaching/scoreParse.ts` with unit tests:
- **games played:** the number of valid game scores (3)
- **games won:** games where our score is higher than theirs (2)
- **result:** won if games won > games lost

Pre-fill Won/Lost, Games played and Games won from it, each with a small green **"AUTO"** pill. If the player edits a value, it becomes theirs and the AUTO tag disappears. If the score is empty or unreadable, show nothing auto and keep today's manual steppers. Save to the existing fields (`match_result`, `games_played`, `games_won`).

**3. Ownership tag.** Skill ratings stay manual. Add a grey "**YOUR RATING**" tag on each skill card, so auto values and player-entered values are clearly different.

**Never invent ratings.** Do not touch the video/AI shot pipeline.

### 4.6 Ask for feedback: `images/08-ask-for-feedback.png`

**File:** `app/partners/PeerFeedback.tsx` (the "Ask for feedback" sheet).

The bottom sheet should have, in order:
1. A grab handle.
2. Title **"Ask {name} for feedback"**, with the session name under it.
3. **"Which shot would you like feedback on?"** with skill chips: **single select**. Pre-select the player's goal skill.
4. One card with a "Share the video" switch. It's on when the session has a video; when there's no video it's hidden and the request is ratings-only. The helper text under it reads "Your ratings, journal and plan stay private."
5. Yellow "**Send to {name}**" button.

**Who** defaults to the partner they played with (or the only partner). If there's more than one partner, show a small "Change" link instead of a full picker section. Keep the existing database calls and relationships: still write `focus_skills` (now one item) and `with_video`. Don't change other collaboration features.

---

## 5. Supabase and Google setup (the owner does this; document it, never commit secrets)

1. In Google Cloud Console, go to APIs & Services, then Credentials. Create an OAuth client ID of type "Web application".
   - **Authorized JavaScript origins:** the app URL(s), e.g. `http://localhost:5173` and the Vercel domain.
   - **Authorized redirect URI:** `https://<project-ref>.supabase.co/auth/v1/callback`
2. In the Supabase Dashboard, go to Authentication, then Providers, then Google. Turn it on and paste in the client ID and secret.
3. In the Supabase Dashboard, go to Authentication, then URL Configuration. Add the app URLs (local and Vercel) to **Redirect URLs**.
4. Run the new migration (Supabase CLI `supabase db push`, or the SQL editor).

## 6. Done when

- [ ] `npm run check` passes in `Pickleball Performance Dashboard/`. This runs typecheck, vitest and the build.
- [ ] New unit tests pass for the score parser, the experience mapping (old values become new tiles) and `needsConsent`.
- [ ] Existing tests are updated where text changed (e.g. `AuthScreen.test.tsx`, `PeerFeedback.test.tsx`, `SelfAssessmentPanel.test.tsx`).
- [ ] Checked by hand at 390px:
  - sign up (email), then consent, then onboarding
  - Google button appears; the redirect works once it's configured
  - new-player home has no empty stats
  - logging the first game switches home to the full dashboard
  - rating labels and the AUTO values work
  - feedback request sends and shows under "Shared with"
  - Settings switches update consent
- [ ] Screens compared side by side with `images/`, and the "New" tags are not shipped.
- [ ] Final report includes:
  - what was done
  - files changed
  - the migration
  - Google setup steps still to do
  - test results actually run
  - git status (branch, last commit, nothing pushed)
