# Hasa re-skin plan (audit)

Branch: `hasa-reskin` (from `pickleproapp` @ itisdev). Scope: presentation only, inside
`Pickleball Performance Dashboard/`. Brand source: `docs/brand/hasa/` (read-only).

Status: **audit only, nothing edited yet.** Waiting for "go".

---

## 1. Stack and theming today

| Item | Finding |
| --- | --- |
| Framework | Vite 6 + React 18 + TypeScript, `react-router` 7 with a `HashRouter` (`src/app/App.tsx`). |
| Styling | **Tailwind CSS v4.1** (`@tailwindcss/vite`, CSS-first config, no `tailwind.config.js`) for layout utilities, plus **inline `style={{…}}` objects** for almost all colour. ~480 inline style objects across 36 files. |
| Real theme | **`src/app/theme.ts`**: JS hex constants (`INK`, `DEEP`, `PICKLE`, `YELLOW`, `BORDER`, `CARD_GLOW`, `DOT_BG`, fonts…) imported by 36 component files. This is what the user actually sees (design D "Club Court"). Many legacy aliases (`NEON`, `OPTIC`, `COBALT`, `BLUE_SKY`, `LAVENDER`…) all point at the same few values. |
| shadcn/ui | 47 files in `src/app/components/ui/`, but **none of them is imported by any screen**. `src/styles/theme.css` holds the shadcn variables (an old navy/lime palette in `:root`, a grey `.dark` block) mapped via `@theme inline`. They only affect Tailwind classes like `bg-background`, which the screens don't use. `default_shadcn_theme.css` at the app root is a stock reference file, not imported. |
| MUI / emotion | Installed in package.json, **not imported anywhere** in `src/`. |
| Shared components | `src/app/shell/primitives.tsx` (Card, Pill, Chip, PrimaryButton, SegmentedTabs, PageHero, Sheet, HeroProgress, RingTile, ScreenTitle, SectionTitle, Notice, PickleProMark, PickleProLogo, PasswordInput, `fieldStyle`/`labelClass`) and `src/app/shell/AppShell.tsx` (header, BottomTabs, SideNav, LargeTextToggle). `sessions/sessionUi.tsx` holds session list/card bits. |
| Icons | `lucide-react` 0.487 already installed and used. One emoji-style glyph ("✓" in `NewSessionPage.tsx:160`). |
| Fonts | Inter 400–800 via a Google Fonts `<link>` in `index.html`; `theme.ts` sets `DISPLAY_FONT` = `BODY_FONT` = Inter. `PrivacyPage` hard-codes Inter; `DesignPreview` hard-codes Barlow Condensed. `src/styles/fonts.css` is comments only. |
| Global CSS | `src/main.tsx` → `src/styles/index.css` → `fonts.css`, `tailwind.css`, `theme.css`; plus keyframes for the waving mascot and the audio coach. `globals.css` is empty and unused. `index.html` has an inline `<style>` with `background: #0b2a1a`. |
| Dark mode | **None in the running app.** No `.dark` class is ever applied; `next-themes` is used only by the unused shadcn `sonner.tsx`. Per the prompt ("don't add a theme toggle that wasn't there"), I'll keep the app light-only, but define the Hasa dark tokens under `.dark`/`[data-theme="dark"]` so they're ready. See Q1. |
| Brand assets | `src/assets/picklepro-logo.webp` (+@2x), `picklepro-mascot.webp`, `picklepro-mascot-talking.webp`; `public/favicon.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `manifest.webmanifest` (name "PicklePro", colours `#0b2a1a`). |
| Radii | Mixed: `rounded-full` (115 uses: pill buttons and chips), `rounded-2xl` (73), `rounded-xl` (57), `rounded-[28px]` sheet, plus shadcn `--radius: 0.625rem`. |
| Shadows | `CARD_GLOW` on every card and tile, custom shadows on the tab bar, home and new-session tiles, auth card, coach player, profile; `shadow-lg`/`shadow-md` classes in a few places. |
| Gradients | Radial gradient on `PageHero` and session detail, a conic gradient on progress rings, gradients in the coach player, and a dot-grid background on `Sheet`. |
| Hard-coded colours | ~200 hex literals outside `theme.ts`, mostly `text-[#16181d]`/`text-[#101827]` classes and one-off hexes. The heaviest are `SessionDetail` (29), `LabelPage` (20), `CoachPlayer` (15), `CoachingPanel` (14), `primitives` (12) and `VideoOverlayPlayer` (11, canvas). |
| Lint | **No ESLint/Biome config and no `lint` script.** The available checks are `npm run typecheck`, `npm test` (vitest) and `npm run build`. See Q6. |

### Things that block a pure "swap the constants" approach

1. **Alpha suffixes on constants.** About 23 places build colours as `` `${BLUE_SKY}60` `` (hex + alpha), in `primitives.tsx` (Pill, Notice), `PlayerPicker`, `ShotsPanel`, `SessionDetail`, `ProfilePage`, `EditProfilePage` and `DesignPreview`. These break if a constant becomes `var(--x)`. Plan: rewrite those few expressions as `color-mix(in srgb, var(--x) 38%, transparent)`, which is presentational.
2. **Canvas drawing** (`VideoOverlayPlayer`, `LabelPage`) can't read CSS variables. Those colours (player boxes, ball, court lines over video) are data-visualisation on top of footage, and `VideoOverlayPlayer.test.tsx` inspects canvas calls, so **I won't change canvas colours.**

---

## 2. Screens and components

Signed-in app (bottom tabs on touch, sidebar on desktop):

| Route | File | Notes |
| --- | --- | --- |
| `#/` Home | `home/HomePage.tsx` | PageHero + mascot, ring tiles, coach player entry, yellow CTA tiles. |
| `#/sessions` | `sessions/SessionsPage.tsx`, `sessionUi.tsx` | List and empty state. |
| `#/new` Log | `sessions/NewSessionPage.tsx`, `CapturePanel.tsx`, `GoalFields.tsx` | The log wizard: rate skills, or upload a video. |
| `#/sessions/:id` | `sessions/SessionDetail.tsx` (672 lines) | Self-report (`selfAssessment/*`) or video result (`analysis/*`: ResultView, AnalysisStatus, CoachingPanel, ShotsPanel, ZoneTimePanel, CourtDwellHeatmap, CourtCorrection, PlayerPicker, VideoOverlayPlayer). |
| Rate skills | `selfAssessment/SelfAssessmentPanel.tsx`, `SkillRater.tsx`, `SelfReportView.tsx` | Ten-skill rating input and the "rate & plan" result (uses the logo as a mascot). |
| `#/progress` | `progress/ProgressPage.tsx` | |
| `#/profile`, `#/profile/edit` | `profile/ProfilePage.tsx`, `EditProfilePage.tsx`, `ProfileAvatar.tsx`, `NavAvatar.tsx` | |
| `#/settings` | `settings/SettingsPage.tsx` | Includes LargeTextToggle and the research footer. |
| `#/welcome` + first run | `onboarding/Onboarding.tsx`, `OnboardingGate.tsx` | |
| Audio coach | `coach/CoachPlayer.tsx` | Talking pickle with a drawn mouth calibrated to the raster mascot. See Q4. |

Signed-out and other routes: `auth/AuthScreen.tsx` (welcome, sign in, sample sessions), `#/privacy` `privacy/PrivacyPage.tsx`, `shell/InstallTip.tsx`.
Dev/research-only routes (behind config flags): `#/label` `labelling/LabelPage.tsx`, `#/design-preview` `design-preview/DesignPreview.tsx`, `#/local-prototype` `local/LocalPrototype.tsx`. See Q5.

---

## 3. Plan per step (one commit each)

**Step 2: tokens.**
- Put the Hasa variables (light, plus dark under `.dark, [data-theme="dark"]`) at the top of `src/styles/theme.css`, the single token home. Point the existing shadcn variables at them using the tokens.css mapping, and add Hasa names to `@theme inline` (`bg-paper`, `text-ink`, `border-line`, `rounded-card`, …).
- Re-point `src/app/theme.ts` constants to `var(--token)` strings, so all 36 importers recolour with no logic edits. Collapse the legacy aliases onto Hasa roles:
  - `DEEP`/`NEON`/`HERO` → `--action-bg` / `--forest`
  - `YELLOW`/`OPTIC` (main actions) → `--action-bg`. Ball yellow stays accent only.
  - `PICKLE` (progress, active) → `--pickle-ink`; `BLUE`/`GREEN`/`COBALT` → `--pickle-ink`
  - `PAGE_BG` → `--paper`; `WHITE` (card surface) → `--surface-raised`; `BORDER` → `--line`; `WHITE_DIM`/`WHITE_SUB` → `--ink-muted`
  - `ORANGE` → `--warning`; `ROSE` → `--danger`; `CARD_GLOW` → `none`; `DOT_BG` → `none`
  - Fonts → `var(--font-display)` / `var(--font-body)`
- Keep a small hex mirror (`HEX`) in `theme.ts` for anything that can't take a CSS variable.
- Fix the ~23 alpha-suffix expressions with `color-mix()`.

**Step 3: fonts.** In `index.html`, replace the Inter `<link>` with Bricolage Grotesque 800 + DM Sans 400/700 (`display=swap`, keep the preconnects). Update the `fonts.css` comment and the hard-coded Inter in `PrivacyPage`.

**Step 4: brand assets.**
- `src/app/brand.ts`: `BRAND_NAME = "Hasa"`, `BRAND_TAGLINE = "Know what to practice next."`
- `shell/Wordmark.tsx`: the h SVG plus live "asa" text with the 01c spacing and an `aria-label`.
- `shell/Coach.tsx`: the coach artwork inlined as a React SVG.
- Copy the logos into `public/brand/`.
- Favicon (16/32/48 from the small icon, plus an SVG favicon), `apple-touch-icon.png` 180, `icon-192.png`, `icon-512.png` from the full icon.
- `theme-color` `#0F3D24`, `<title>`, `apple-mobile-web-app-title`, meta description and manifest `name`/`short_name`/colours.
- `PickleProLogo`/`PickleProMark` keep their export names but render the wordmark and app icon, so call sites don't change.
- Delete the old `picklepro-*.webp` only once nothing references them.

**Step 5: shared components (then PAUSE for your review).** Restyle in `primitives.tsx`, `AppShell.tsx` and `sessionUi.tsx`:
- **Buttons:** 48px, `--radius-md`, forest. The `optic` tone becomes primary, `light` becomes secondary.
- **Cards:** border, no shadow, `--radius-lg`, 16/24 padding.
- **Chips:** pill, sunken, selected = action + check icon.
- **Pill/Notice:** status colour plus an icon.
- **Tabs and RingTile/HeroProgress:** pickle-ink fill, sunken track, 8px meters.
- **Inputs:** 48px, `--radius-sm`.
- **Header:** 56px, paper, `--line` border, wordmark.
- **Bottom tabs/side nav:** surfaces, `--shadow-lift` on the floating bar, no yellow.
- **PageHero:** flat. See Q2.
- **Sheet:** no dot grid.
- **Global:** `:focus-visible` ring (2px `--focus`, 2px offset) in global CSS.

**Step 6: screens, one commit each where practical.** In order: Auth → Onboarding → Home → Log (NewSession, Capture, Goal, SelfAssessment, SkillRater) → SessionDetail and results (SelfReportView, analysis panels, CoachPlayer) → Sessions → Progress → Profile/Edit → Settings → Privacy → InstallTip.
- Replace one-off hexes with tokens, remove gradients and extra shadows, unify radii, and use the type scale (display-lg titles, `stat` numbers).
- One primary action per screen; the rest become secondary or text buttons, by styling only.
- Coach only on onboarding, empty states and milestones.
- Swap the "✓" glyph for the lucide `Check` icon.

**Step 7: verify.**
- Run `npm run typecheck`, `npm test` and `npm run build`.
- Before/after screenshots at 390px via the `pickleproapp-web` preview (`preview.html?onboarded` sample data), plus checks at 360, 768 and desktop widths.
- Contrast spot-checks, then grep for leftover hexes, Inter and old logos.
- Check `git diff --stat` and report.

---

## 4. Files I plan to change

- `index.html`, `public/manifest.webmanifest`, `public/*.png` (regenerated), new `public/brand/*.svg`, new `public/favicon.svg`
- `src/styles/theme.css`, `src/styles/index.css`, `src/styles/fonts.css`
- `src/app/theme.ts`, new `src/app/brand.ts`, new `src/app/shell/Wordmark.tsx`, new `src/app/shell/Coach.tsx`
- `src/app/shell/primitives.tsx`, `AppShell.tsx`, `InstallTip.tsx`
- Presentational markup, classes and inline styles in the screen files listed in §2 (`home`, `sessions`, `selfAssessment`, `analysis` except canvas colours, `coach`, `progress`, `profile`, `settings`, `onboarding`, `auth`, `privacy`)
- `src/assets/picklepro-*.webp`: removed only if unreferenced at the end

## 5. Files I will not touch

- `server/`, `contracts/`, `eval/`, `supabase/` (repo root), `.env*`, `vercel.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `package.json`/lockfile (fonts load via `<link>`; lucide is already installed)
- `src/lib/**` (API, analysis, coaching, upload, config, supabase): all logic. This includes `coachScript.ts`, whose spoken text says "PicklePro" (Q3).
- All hooks/state/handlers, route definitions in `App.tsx`, form field names/types/validation, `data-testid`/ids, localStorage keys (e.g. `picklepro.largeText`)
- All `*.test.ts(x)` files
- `src/app/components/ui/**` (unused shadcn; it gets the new tokens automatically through the variables)
- Canvas colours in `VideoOverlayPlayer.tsx` and `LabelPage.tsx`
- `docs/brand/hasa/**`, the repo's other docs, video and PDF files, `.preview/`/`preview.html` (local, git-excluded)

## 6. Risks

1. **Tests pin copy.** 121 role/text queries across 9 test files. Any copy change a test queries would break it, and tests can't be edited (only snapshots, and there are none). I'll check every copy change against the tests and skip it if a test pins it.
2. **The brand name is pinned by tests.** `App.test.tsx` looks for the button "Try PicklePro with sample sessions" (5 times), and `coachScript.test.ts` expects "PicklePro found you…" from `src/lib`. See Q3.
3. **Design D reversal.** Hasa replaces things you picked on 2026-10-07: the green header running into a green hero, yellow main actions, and pill buttons. That's intended by the brand book, but it's a visible change. See Q2.
4. **`var()` constants in JS.** Anything that does string maths on a theme constant breaks silently, visually only (no runtime error). Mitigation: the alpha-suffix grep above, then a full click-through.
5. **Static files can't import `BRAND_NAME`.** `index.html` (`<title>`, apple title) and `manifest.webmanifest` need the literal "Hasa"; changing that would mean a Vite plugin (`vite.config.ts` is off-limits). I'll mark them with comments pointing at `brand.ts`, and the app sets `document.title` from the constant at runtime.
6. **No SVG rasteriser installed** (no rsvg/ImageMagick/Inkscape). For PNG icons I'll try macOS `qlmanage`/`sips`, falling back to rendering in the preview browser via canvas. No new npm dependency.
7. **The brand SVGs carry embedded C2PA metadata** (about 8 KB each). Copies in `public/` would ship it as-is. The inline React components (wordmark h, coach) only need the paths. See Q7.
8. **Coach player art.** The talking animation draws a mouth path in the old raster's 349×640 coordinates. Swapping in the Hasa coach means re-mapping those geometry constants. That's presentational, but it sits inside the animation function. See Q4.
9. **Light-only app.** The status bar and `<html>` background are currently dark green (`#0b2a1a`). Moving to paper `#FAF6EA` with a `#0F3D24` theme-color changes how the installed PWA chrome looks.

## 7. Decisions so far

- Q1 dark mode: **Hasa light colours only.** No dark mode is wired up.
- Q2 design D vs Hasa: **follow the screen mockups in `~/Downloads/Hasa Brand Book.html` (§9 "Screens" and §10 "A cleaner app")**:
  - **Overall:** paper background, plain 56px header, no green hero gradients, forest primary buttons with a 14px radius.
  - **Home:** date and greeting, then **one forest brand card** ("Your focus this week", focus name, meta, and the only place a ball-yellow button is allowed), then 3 `stat` numbers, then at most 2 rows. Nothing else competes.
  - **Rate skills:** same skills, scale and steps. Progress shows as "N of 10" plus a bar, each skill rated with five 44px number buttons labelled "Still learning" … "Consistent" at the ends, and the primary action in a fixed footer.
  - **Focus areas / drills:** a numbered drill list, one row per drill (name, time, who you need).
  - **Progress:** the number first, then the trend, then per-skill meters (8px track, signed deltas in pickle-ink, low skills never red).
  - **Video analysis:** upload first, with one plain filming tip.
  - **Empty states:** coach, plus a line naming what will appear, plus one action.
  - **Coach:** onboarding, empty states and milestones only. Never in the header, data views or next to errors. On a dark background it sits on a paper disc (`#F1ECDC`).
  - **Where the mockups conflict with the hard rules, the hard rules win.** Those items are skipped and listed:
    - The mockup tab bar is Home/Log/Plan/Progress; the app's is Home/Sessions/Log/Progress/Profile. Navigation stays as it is.
    - The "Add to my plan" button on the video result is a new feature, so it's skipped.
    - The mockups show a progress line chart. If the Progress screen has no chart today, none will be added.
    - Buttons like "Start practice" or "Start drill 1" only appear where an equivalent action already exists.
    - The dark-theme empty state isn't used, because the app stays light-only (Q1).
- Q3 brand name in tests: **rename to Hasa** and update only those two text expectations (the `App.test.tsx` button name and the `coachScript.ts` line plus its test).
- Q4 talking coach: **swap to the Hasa coach** and re-map the mouth geometry.
- Q5–Q8: not answered, so the defaults apply:
  - Q5: dev/research screens get the tokens and fonts only.
  - Q6: no linter exists. Report this; don't add a dependency.
  - Q7: `public/` SVGs are byte-identical copies.
  - Q8: the research/privacy text keeps "PicklePro".

## 8. Open questions (original)

1. **Dark mode:** the app has no dark mode today. Should I keep it light-only (the prompt's rule; dark tokens defined but unused), or wire `prefers-color-scheme`? I'll keep it light-only unless you say otherwise.
2. **Design D → Hasa:** OK to drop the green hero header, the yellow main actions and the pill-shaped buttons in favour of the Hasa paper header, forest primary buttons and 14px radius? Or should I keep a single forest `--brand-surface` panel as the hero on Home only? I'd go with the second: one brand panel on Home, flat paper titles elsewhere.
3. **Brand name pinned by tests and logic:** "Try PicklePro with sample sessions" (pinned by `App.test.tsx`) and the coach line "PicklePro found you…" (in `src/lib/coaching/coachScript.ts`, pinned by its test). If I leave both, the app will say "PicklePro" in 2 places. Should I leave them, or may I update those tests and the lib string?
4. **Talking coach:** may I swap the talking pickle in `CoachPlayer` for the Hasa coach and re-map the mouth geometry constants? Otherwise it keeps the old mascot, which the brand book says must not appear next to the new coach.
5. **Research/dev screens:** `DesignPreview` (1058 lines, old neon look), `LocalPrototype` and `LabelPage` are dev or research only. I propose they get the tokens and fonts automatically with no further restyle. OK?
6. **Lint:** there's no linter configured. Should I report it as not available, or do you want one added later? Adding one would be a dependency change, so it's out of scope for now.
7. **SVG metadata:** should the copies in `public/brand/` be byte-identical to `docs/brand/hasa/logos` (C2PA metadata included), or path-only? The default is byte-identical copies.
8. **Research identity text:** the privacy page and footers say "PicklePro research prototype · DLSU CAPIT-01" and "PicklePro project team". If the study was approved under that name, I'd change these to "Hasa (PicklePro) research prototype" or leave them as they are. Which do you prefer? The privacy page is close to legal/consent text, so I'll leave it untouched unless you say otherwise.

---

## 9. Outcome (after implementation)

Direction changes during the work, from the user:
- **Cleaner UI/UX, not only a recolour.** Screens were rebuilt per the brand book mockups, using the ui-ux-pro-max rules: one primary action per screen, numbers first, progressive disclosure, empty states with an action, and labelled nav.
- **The coach is named Piko** (`MASCOT_NAME` in `src/app/brand.ts`).
- **The full-face app icon is Piko's one mark at every size.** It replaces the full-body coach, appears in the header logo (icon + wordmark), the talking coach and the favicons. The brand book suggested the simplified face at 48px and below; the user chose the full face everywhere.

Checks:
- **Build, type-check and tests:** `npm run typecheck`, `npm test` (138/138) and `npm run build` pass.
- **Lint:** none is configured.
- **Layout:** no horizontal scroll at 360, 390, 768 or 1280px.

### Copy changes (old → new)

**Brand name**

| Old | New |
| --- | --- |
| PicklePro | Hasa (`BRAND_NAME`) |

Where "Hasa" now appears:
- `<title>`, the apple title and the manifest name
- "Welcome to …" on the welcome screen and in onboarding
- The welcome intro
- "What … does" (aria-label)
- "Try … with sample sessions"
- "Use … full screen" (×2)
- "… home" (aria-labels)
- The video review lines (4)
- The shots panel line
- The log-a-video card
- The audio coach video lines (3)

**Meta and manifest description**

| Old | New |
| --- | --- |
| "Rate your pickleball game or analyze a video, then get …" | "Know what to practice next. Rate your pickleball game or analyze a video, then get …" |

**Welcome**

| Old | New |
| --- | --- |
| "Hi, I'm Pickle!" / "Tell me how your game went and I'll show you what to practice next." | "Hi, I'm Piko, your Hasa coach" |
| "Your pickleball coach, in your pocket." | "Know what to practice next." |
| "PicklePro turns a quick look back at your game into a clear plan: …" | "Rate your last game in about 2 minutes. I'll turn it into focus areas and drills. Your sessions stay private to you." (the trial text is unchanged) |
| "Create my account" | "Get started" |
| "Get started" eyebrow | (removed) |
| Four feature cards and the example-plan card | (removed) |
| "Ten quick skill ratings, or add a video for court analysis." | "10 quick skill ratings, or add a video." |
| Step numbers "01–03" | "1–3" |

Trial steps were also shortened:

| Old | New |
| --- | --- |
| "Try the interactive dashboard with clearly labelled example data." | "Try the dashboard with clearly labelled example data." |
| "Try planning a session and recording a private check-in." | "Plan a session and record a private check-in." |
| "Upload and analysis will open when an online worker is available." | "Upload opens when an online worker is available." |

**Onboarding**

| Old | New |
| --- | --- |
| "Five quick steps, about two minutes." | "5 quick steps, about 2 minutes." |
| "How does each skill usually go for you? 3 means …" | "Rate each skill from 1 to 5. 3 means …" |

**Home**

| Old | New |
| --- | --- |
| "Hi {name}" / "Today's a good day for {focus}." | today's date / "Good morning \| afternoon \| evening, {name}" |
| "Weekly challenge · {drill} · 3 times this week · START" | "Your focus this week" · {focus} · "{drill} · 3 times this week · from your last session" · "Start practice" |
| "Hear this week's plan" | "Hear Piko" |
| "{n} week streak · {n} sessions logged" | a "Week streak" stat and "{n} sessions logged" |
| "Played today? / Log today's game" | "Log today's game / Rate how it felt in about 2 minutes" |
| "Have a recording? Video analysis is optional. It maps where you stood on court, alongside your own ratings." | "Analyze a match video / Optional · where you stood on court" |
| "Your focus" list with "Full plan" | (removed; the focus list is on the plan) |
| "Recent activity" | "Recent sessions" |

When there is no focus yet, the card shows "Piko says" / "Ready to play?" / "Log a session and rate how it felt. You'll get focus areas and drills."

**Install tip**

| Old | New |
| --- | --- |
| "… Open it from your home screen, like Facebook or Instagram." | (sentence removed) |

**Audio coach**

| Old | New |
| --- | --- |
| "Your coach" | "Piko, your coach" |
| "From your video" | "Piko, from your video" |
| "From your ratings" | "Piko, from your ratings" |

**Rating**

| Old | New |
| --- | --- |
| "{n} of 10 rated" | "{n} of 10" |
| "Think about this session only. 3 means …" | "Rate each skill from 1 to 5, for this session only. 3 means …" |
| "{anchor}" | "{n} of 5 · {anchor}" |

Each skill's end labels are now shown under 1 and 5.

**Progress**

| Old | New |
| --- | --- |
| "{n} sessions logged · {n} rated" | "{n} most recent rated sessions · {n} logged in all" |

Each skill row now shows a signed change.

**Profile**

| Old | New |
| --- | --- |
| page title {name} / {email} | "Profile" (the name stays in the card) |

### Skipped, and why
- **`src/lib/analysis/state.ts` status lines** still say "PicklePro", for example "PicklePro is analyzing the video now". They need approval to edit `src/lib`.
- **Research, privacy and consent wording** keeps "PicklePro" (Q8).
- **Dev and research screens** (design preview, local prototype, shot labelling) get tokens and fonts only (Q5).
- **Mockup items that would change behaviour:**
  - The Home/Log/Plan/Progress tab bar was not adopted; the 5 existing tabs stay.
  - "Add to my plan" on video results was not added.
  - No new progress chart beyond the existing bars.
- **Data colours stay unchanged:** the video overlay, court zones, heatmap and court-correction handles keep their colours, because they match their legends.
- **The app stays light-only.** Dark tokens are defined but unused.
- **`var()` in SVG presentation attributes** was verified in Chrome only; Safari is not checked yet.
