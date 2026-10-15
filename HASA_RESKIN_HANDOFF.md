# HANDOFF: Hasa re-skin of the PicklePro app (for the next AI agent or developer)

Paste or read this file before you touch the front end on branch **`hasa-reskin`**. It explains what was changed, how the new design system is wired, the rules the work followed, and what is still open. It is current as of 15 October 2026.

Related files:
- [`Pickleball Performance Dashboard/RESKIN_PLAN.md`](Pickleball%20Performance%20Dashboard/RESKIN_PLAN.md): the original audit, the decisions the owner made, and the full list of copy changes (old → new). Read §7–§9.
- [`docs/brand/hasa/`](docs/brand/hasa/): the brand kit (`BRAND_BOOK.md`, `CLAUDE_CODE_PROMPT.md`, `tokens.css`, `tokens.json`, `logos/`). **Read-only reference: do not edit it.**
- [`HANDOFF.md`](HANDOFF.md) and [`PICKLEPRO_RUN_AND_HANDOFF.md`](PICKLEPRO_RUN_AND_HANDOFF.md): the computer-vision work and how to run the app. This file does not repeat them.

## 1. What happened, in one paragraph

The user-facing app was rebranded from **PicklePro** to **Hasa** ("sharpening" in Tagalog; tagline *Know what to practice next.*). The work was a **front-end-only re-skin plus a cleaner UI/UX**. Behaviour, data, API calls, Supabase, routes, form fields and validation are unchanged. The coach mascot is now **Piko**, drawn as the **full-face app icon**. That icon is the one Piko mark at every size: the header logo, the welcome screen, onboarding, the Home focus card, empty states and the talking audio coach. Screens were restructured to the brand book's mockups:
- one job and one primary action per screen
- numbers first
- fewer surfaces
- plain words

## 2. Ground rules (keep following these)

- **Branch.** Work on `hasa-reskin`, which is based on `pickleproapp`. Remote: `itisdev` (`github.com/tahilramanirohit/ITISDEV_GITHUB_REPO`). Others may push: `git fetch` and **merge** before pushing. Never force-push.
- **Front end only.** Do not change:
  - business logic, hooks' behaviour, scoring, or focus/drill selection
  - API calls, Supabase or schema, auth or env vars
  - `server/`, `contracts/`, `eval/`, `supabase/`
  - routes and navigation structure, or the order of steps in flows
  - form field names, validation, `data-testid`s or tests
  - `package.json`, `vite.config.ts` or `vercel.json`

  If a visual change needs any of these, stop and ask the owner.
- **Keep "PicklePro" in code.** Package name, identifiers, localStorage keys (`picklepro.*`), the worker command `python -m picklepro.worker`, and the repo all keep the name. Only **user-visible** text says Hasa, and it must come from `BRAND_NAME` (§4).
- **Wording the owner chose to keep as "PicklePro":** research, privacy and consent text ("PicklePro research prototype · DLSU CAPIT-01", the privacy page body, the video-upload consent line), plus the dev-only shot-labelling tool. Do not rename these without asking.
- **Tests pin some copy.** About 120 role/text queries across 9 test files. Before you change any visible text, grep the tests; if a test pins it, ask first. The only test edits made so far were the two brand-name expectations, which the owner approved.
- **Deploys.** Do not deploy. The owner runs the deploy script from the clean export folder; see their notes in the run guide.

## 3. Stack, and how styling actually works here

- **Stack:** Vite 6, React 18, TypeScript, Tailwind CSS v4 (CSS-first, no `tailwind.config.js`) and `react-router` with a `HashRouter`. The app is in `Pickleball Performance Dashboard/`.
- **Most colour is inline `style={{…}}`, not Tailwind classes.** Screens import colour constants from `src/app/theme.ts`.
- **shadcn/ui and MUI are not used.** `src/app/components/ui/*` (shadcn) is not imported by any screen. MUI is installed but unused.
- **The app is light-only.** Dark tokens exist under `.dark` / `[data-theme="dark"]`, but nothing applies them. Don't add a theme toggle unless asked.

## 4. The design system (use these, don't invent new values)

| Where | What |
| --- | --- |
| `src/styles/theme.css` | **The one home for tokens.** CSS variables such as `--paper`, `--surface-raised`, `--surface-sunken`, `--line`, `--ink`, `--ink-muted`, `--forest`, `--brand-surface`, `--pickle` and `--pickle-ink`. Also: `--ball`, `--action-bg`, `--action-ink`, `--focus`, `--danger`, `--warning`, the fonts, `--space-*`, `--radius-sm/md/lg` (8/14/22px) and `--shadow-lift`. The shadcn variables point at them. It also adds Tailwind utilities (`bg-paper`, `text-ink`, `border-line`, `bg-sunken`, …) and the **type scale**: `type-display-xl`, `type-display-lg`, `type-stat`, `type-heading`, `type-body`, `type-body-strong`, `type-small`, `type-label`. All are rem-based so the "Larger text" setting still scales them. |
| `src/app/theme.ts` | The older JS constants, now pointing at CSS variables (`INK = "var(--ink)"`, `NEON` = primary button, `PAPER` = sunken, `WHITE` = raised surface, `GREEN`/`PICKLE` = pickle-ink, `YELLOW` = ball, and so on). The other entries: `ON_BRAND*` (text on the forest brand card), `SHADOW_LIFT`, and `withAlpha(color, 0.25)` for translucent tints. **Never** append hex alpha to a constant (`${X}40`), because it is a `var()`. **Never** pass these to a `<canvas>`; canvas needs literal colours. |
| `src/app/brand.ts` | `BRAND_NAME = "Hasa"`, `BRAND_TAGLINE`, `BRAND_DESCRIPTOR`, `MASCOT_NAME = "Piko"`. The name is not trademark-cleared yet, so it must stay in one constant. Static files can't import it: `index.html` (`<title>`, apple title) and `public/manifest.webmanifest` repeat "Hasa" by hand. |
| `src/app/shell/Wordmark.tsx` | `Wordmark` (custom "h" SVG plus live "asa" in Bricolage Grotesque 800, 01c spacing; never plain text "hasa"), `AppIcon` (Piko full-face icon from `/brand/hasa-app-icon.svg`) and `Logo` (icon + wordmark, used in the header, sidebar and welcome). |
| `src/app/shell/Coach.tsx` | `Coach`: Piko's full-face icon as inline SVG. The `mouth` prop is used by the talking coach. Use it on onboarding, empty states and milestone or brand cards only, one per screen. Not in data views or next to errors. |
| `src/app/shell/primitives.tsx` | Shared parts. Exports and props are unchanged so call sites didn't move:<br>• `Card`: raised, 1px line, 22px radius, no shadow.<br>• `PrimaryButton`: `dark` = forest primary, `light` = secondary, `optic` = ball yellow, **only on a forest brand card**.<br>• `Chip`: pill; selected = forest with a check.<br>• `Pill`<br>• `Notice`: icon + colour, never colour alone.<br>• `PageHero`: now a plain paper title block.<br>• `Sheet`: now a plain wrapper.<br>• `HeroProgress`: 8px meter.<br>• `RingTile`, `ScreenTitle`, `SectionTitle`, `SegmentedTabs`, `PasswordInput`.<br>• `fieldStyle`: 48px inputs, 8px radius.<br>• `labelClass` / `labelStyle`: visible labels.<br>• `PickleProLogo` / `PickleProMark`: render the Hasa logo and icon; the old names are kept on purpose. |
| `src/app/shell/AppShell.tsx` | 56px paper header with the logo; floating raised tab bar with icon and label (the only lifted layer); desktop sidebar on paper; forest "Log" action. |
| `src/styles/index.css` | Global `:focus-visible` ring (2px `--focus`), body paper/ink/DM Sans, and the audio-coach animations. |
| `index.html` | Fonts: Bricolage Grotesque 800 and DM Sans 400/700 with `display=swap`. Also `theme-color #0F3D24` and the favicons. |
| `public/brand/*.svg` | Byte-identical copies of the brand kit logos, C2PA metadata included. `public/*.png` icons were rendered from the full-face icon. |

Brand rules worth remembering:
- About 70% paper and surfaces, 20% ink and lines, 8% green and 2% ball yellow.
- Never `--pickle` or `--ball` as text on paper; use `--pickle-ink` for green text.
- **One** forest brand card per screen. The yellow button appears only on that card.
- Low skill scores are never red. Changes carry a sign (`+0.5`) and use pickle-ink (up) or muted ink (down).
- Touch targets are at least 44px and main buttons 48px.
- No emoji as icons. Use lucide-react, which is already installed.

## 5. What each screen looks like now

| Screen | File(s) | What changed |
| --- | --- | --- |
| Welcome / sign-in | `auth/AuthScreen.tsx` | Paper, not navy. Small logo, large Piko, tagline headline, one promise line, "Get started" + "I already have an account". How it works as 3 numbered rows. The feature cards and example plan were removed. |
| Onboarding | `onboarding/Onboarding.tsx` | Piko intro, pickle-ink step bar, 44px Back/Cancel, Hasa check style. |
| Home | `home/HomePage.tsx` | Date + "Good evening, {name}". One forest "Your focus this week" card (Piko, drill, **Start practice**, Hear Piko). Then 3 stats + week strip in one card, 2 rows (Log today's game, Analyze a match video → `#/new?mode=video`), the install tip, and the 2 latest sessions. |
| Log a session | `sessions/NewSessionPage.tsx`, `GoalFields.tsx` | Raised mode and kind cards with a forest selected state and check icon. The "✓" glyph was removed. |
| Rate your game | `selfAssessment/SelfAssessmentPanel.tsx`, `SkillRater.tsx` | "N of 10" + 8px bar; five 48px number buttons with the skill's end labels; Next/See plan pinned above the tab bar. |
| Plan | `selfAssessment/SelfReportView.tsx` | Forest "This week's drill" card with Piko and the audio coach; self rating as a stat + meter; numbered focus cards and week steps; signed "since last time". |
| Session detail | `sessions/SessionDetail.tsx` | Paper title block (the gradient header is gone); bordered 44px delete button; session ID moved to a footer line. |
| Video panels | `analysis/*.tsx` | Tokens, forest buttons, one radius scale. **Data colours unchanged**: overlay boxes, ball, zones, heatmap and court handles still match their legends. |
| Audio coach | `coach/CoachPlayer.tsx` | Flat forest player; Piko's icon talks. Its mouth path is in coach-head coordinates; see `mouthPath()`. |
| Progress | `progress/ProgressPage.tsx` | Average as a stat with a signed change, quiet bar trend, each skill as an 8px meter with a signed change. Empty state with Piko. |
| Sessions, Profile, Settings, Privacy | `sessions/SessionsPage.tsx`, `profile/*`, `settings/*`, `privacy/*` | Same parts. Profile no longer overlaps the header; the name is an `h2` under the page `h1`. |
| Dev-only (design preview, local prototype, shot labelling) | `design-preview/`, `local/`, `labelling/` | Tokens and fonts only, by decision. Not hand-restyled. |

Old PicklePro images (`src/assets/picklepro-*.webp`) were deleted once nothing referenced them.

## 6. Commits on `hasa-reskin` (oldest first)

1. Tokens
2. Fonts
3. Name, wordmark, coach and icons
4. Shared components
5. Piko + Home
6. Welcome / onboarding
7. Piko icon everywhere
8. Log and rating
9. Session detail + plan
10. Video panels
11. Progress / sessions / profile / settings / privacy
12. Verify fixes
13. RESKIN_PLAN outcome
14. `state.ts` brand name
15. This guide

Use `git log pickleproapp..hasa-reskin` for details.

Files outside pure presentation that were touched, all approved by the owner:
- `src/lib/coaching/coachScript.ts` + test: the spoken brand name.
- `src/lib/analysis/state.ts`: status lines use `BRAND_NAME`.
- `src/app/App.test.tsx`: the "Try Hasa with sample sessions" button name.
- `src/main.tsx`: sets `document.title` from `BRAND_NAME`.

## 7. How to check your work

From `Pickleball Performance Dashboard/`:

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

All three passed at hand-off: typecheck clean, 25 files and 138 tests, build OK. **There is no linter configured.** Adding one is a dependency change; ask first.

Visual checks: run the dev server (`npm run dev`, port 5179 in the owner's setup) and check 360, 390, 768 and desktop widths for horizontal scroll. The owner's local `preview.html` + `.preview/main.tsx` harness gives sample data without Supabase (`preview.html?onboarded#/`, add `?signedout` for the welcome screen). **It is git-excluded and not in the repo**, so other machines need a real Supabase `.env.local` or their own mock.

## 8. Open items and good next steps

- **Safari check:** CSS variables inside SVG presentation attributes (lucide icon colours, charts) were verified in Chrome only. Check on an iPhone.
- **Mockup items deliberately not built**, because they would change behaviour or add features:
  - a Home/Log/Plan/Progress tab bar (the app has Home/Sessions/Log/Progress/Profile)
  - an "Add to my plan" button on video results
  - a new progress line chart

  Ask before doing any of these.
- **Research text and the brand name:** whether the research and privacy text should say "Hasa (PicklePro)" is the owner's call.
- **Brand masters:** the name is not trademark-cleared and the logos are vector mocks. A designer should redraw the masters later. Keep `BRAND_NAME` as the single switch.
- **Dark mode:** tokens exist but are unused. Only wire it up if the owner asks.
