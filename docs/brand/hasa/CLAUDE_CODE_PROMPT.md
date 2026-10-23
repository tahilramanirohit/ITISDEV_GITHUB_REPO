# Task: re-skin the PicklePro app to the Hasa brand (frontend-only)

You are working in the PicklePro codebase (live at https://picklepro-app.vercel.app). Your job is a **visual and presentational refresh only**: apply the Hasa brand system below and make the interface cleaner. **Behaviour must stay exactly the same.**

## Where things are

- **The app:** `Pickleball Performance Dashboard/` (Vite + React, shadcn/ui; see `default_shadcn_theme.css`, `src/`, `public/`, `index.html`). Work only here, mostly in `src/`, `public/` and `index.html`.
- **The brand kit (read first, do not edit):** `docs/brand/hasa/`
  - `BRAND_BOOK.html`: the visual brand book. Open it in a browser. Section 9 ("Screens") shows how each screen should look after the re-skin; treat those mockups as the visual target, but keep the app's real content, flows and steps.
  - `BRAND_BOOK.md`: the same rules in text form (voice, logo, mascot, colour, type, layout, cleanup principles).
  - `tokens.css`: ready-to-use CSS variables, plus a mapping onto the shadcn theme variables.
  - `tokens.json`: the same tokens as data.
  - `logos/`: `hasa-app-icon.svg` (≥96px), `hasa-app-icon-small.svg` (≤48px), `hasa-coach.svg` (mascot), `hasa-mark-one-colour.svg`, `hasa-h-glyph.svg` (the wordmark's custom h).
- **Don't touch:** `supabase/`, `Pickleball Performance Dashboard/server/`, `contracts/`, `eval/`, `.env*`, `vercel.json`, `vite.config.ts`, the repo's other docs, and any video files.
- Prefer mapping the existing shadcn variables to Hasa tokens (see the bottom of `tokens.css`) over introducing a parallel theme. Copy the logo SVGs into `public/` (or the app's asset folder) rather than importing from `docs/`.

## 0. Hard rules (read first, follow throughout)

You MUST NOT change:
- Business logic, data flow, state management, hooks' behaviour, or calculations (including skill scoring, focus-area and drill selection, progress tracking, and video/court-position analysis).
- API calls, endpoints, request/response shapes, database or Supabase schema, migrations, auth, environment variables, or server/edge functions.
- Routes, URLs, navigation structure, or the order of steps in any flow.
- Form field names, validation rules, input types, or what gets submitted.
- Analytics/tracking events, `data-testid` attributes, ids used by tests, and existing tests (other than snapshot updates caused purely by styling).
- Package dependencies, except adding fonts via the existing method (or `<link>`) and, if no icon set exists, one icon library (prefer `lucide-react`). Ask before adding anything else.
- The repository name, package name, or internal identifiers that say "PicklePro". Rename only **user-visible** brand text (see section 3).

If a visual change seems to require touching any of the above, **stop and list it as a question** instead of doing it.

You MAY change: CSS/Tailwind classes, theme files, design tokens, layout and spacing, typography, colours, component markup structure (presentational wrappers only), icons, images/logos/favicon/manifest icons, empty-state illustrations, and user-visible microcopy (see 4.5).

## 1. Work in this order

1. **Audit (no edits).** Map the stack (framework, styling approach, theme/config files, global CSS, component library), list every screen and shared component, and note where colours, fonts, radii and shadows are defined today (including hard-coded values). Write this to `RESKIN_PLAN.md` with: files you intend to touch, files you will not touch, and any risk you see. Then continue.
2. **Tokens.** Add the Hasa tokens (section 2) in ONE place (CSS variables in the global stylesheet, mapped into the Tailwind/theme config if one exists). Replace hard-coded colours, font sizes, radii and shadows with tokens.
3. **Fonts.** Load Bricolage Grotesque (800) and DM Sans (400, 700) with `display=swap`.
4. **Brand assets.** Replace the logo, favicon, Apple touch icon, PWA manifest icons, `theme-color`, and the app/page title (section 3).
5. **Shared components** (buttons, cards, inputs, chips/tags, meters/progress, header, nav, modals/sheets, toasts) per section 4.
6. **Screens**, one at a time, applying the cleanup principles (section 4).
7. **Verify** (section 5) and report.

Make small, reviewable commits per step.

## 2. Hasa design tokens

Light theme is the default; dark is first-class (the current app uses a dark green theme colour, so keep dark mode if it exists, or add it behind `prefers-color-scheme` only if theming already exists; don't add a theme toggle that wasn't there).

```css
:root {
  /* colour, light */
  --paper: #FAF6EA;          /* page background */
  --surface-raised: #FFFFFF; /* cards, inputs, sheets */
  --surface-sunken: #F1ECDC; /* wells, meter tracks, selected tint */
  --line: #E2DAC2;           /* 1px borders, dividers */
  --ink: #0B2A1A;            /* primary text */
  --ink-muted: #3E5446;      /* secondary text */
  --forest: #0F3D24;         /* brand green, wordmark */
  --brand-surface: #0F3D24;  /* one highlight panel per screen */
  --pickle: #8CC63F;         /* mascot + decorative only, NEVER text on paper */
  --pickle-ink: #2E6B2F;     /* green text: links, positive deltas, selected */
  --ball: #F5C518;           /* accent only, NEVER text */
  --action-bg: #0F3D24;      /* primary button */
  --action-ink: #FAF6EA;     /* text on primary button */
  --focus: #1F7A3A;          /* focus ring */
  --danger: #B42318;
  --warning: #8A5300;

  /* type */
  --font-display: "Bricolage Grotesque", system-ui, sans-serif; /* wordmark, screen titles, big numbers ONLY */
  --font-body: "DM Sans", system-ui, sans-serif;                /* everything else */

  /* spacing (4px grid) */
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px;

  /* radius */
  --radius-sm: 8px; --radius-md: 14px; --radius-lg: 22px; --radius-pill: 999px;

  /* shadow: floating layers only (sheets, menus, toasts). Cards use a border. */
  --shadow-lift: 0 1px 2px rgba(11,42,26,.06), 0 8px 24px rgba(11,42,26,.08);
}

[data-theme="dark"], .dark {
  --paper: #0B2A1A; --surface-raised: #123522; --surface-sunken: #082114; --line: #24493A;
  --ink: #F1EEE3; --ink-muted: #B4C2B8; --brand-surface: #1F5C38;
  --pickle-ink: #A6D86A; --action-bg: #8CC63F; --action-ink: #0B2A1A;
  --focus: #F5C518; --danger: #FF8A7A; --warning: #F5C518; --shadow-lift: none;
}
```

Type scale (use only these):

| Style | Font | Size / line height | Weight | Use |
| --- | --- | --- | --- | --- |
| display-xl | display | 48/52, tracking −0.02em | 800 | Landing hero only |
| display-lg | display | 32/38, tracking −0.015em | 800 | Screen titles |
| stat | display | 40/44, tracking −0.02em | 800 | Skill scores, streaks, counts |
| heading | body | 20/28 | 700 | Card titles, section headings |
| body | body | 16/24 | 400 | Default text |
| body-strong | body | 16/24 | 700 | Emphasis, button labels |
| small | body | 14/20 | 400 | Metadata, helper text |
| label | body | 12/16, tracking 0.12em, UPPERCASE | 700 | Eyebrows, chips |

On phones, display-xl may drop to 36/40 and display-lg to 26/32.

## 3. Brand assets and naming

- **User-visible name:** "Hasa". Put it in ONE constant (e.g. `BRAND_NAME`) and use that everywhere it's displayed (header, page `<title>`, manifest `name`/`short_name`, meta tags, onboarding). The name is not yet trademark-cleared, so a single constant keeps a rename cheap. Leave code identifiers, repo and package names as they are.
- **Tagline:** "Know what to practice next." (landing hero and meta description). Use the existing meta description's meaning; don't invent features.
- **`theme-color`:** `#0F3D24`.
- **Wordmark:** the custom "h" SVG below followed by live text "asa" in Bricolage Grotesque 800. Letter spacing: h→a `margin-left: 0.005em`, a→s `margin-left: -0.03em`, s→a `margin-left: -0.005em`, tracking 0. The h's height is 0.72 × the font size. Colour `--forest` (light) / `#FAF6EA` (dark). Wrap it in an element with `aria-label` set to the brand name. Build it as a small `Wordmark` component.

```svg
<!-- custom h, viewBox 0 0 102 150, fill = currentColor -->
<svg viewBox="0 0 102 150" aria-hidden="true"><path fill="currentColor" d="M0 16 L34 4 L34 62 C42 52 54 46 68 46 C90 46 102 60 102 84 L102 150 L68 150 L68 92 C68 81 62 76 54 76 C44 76 34 83 34 95 L34 150 L0 150 Z"/></svg>
```

- **App icon / favicon / PWA icons:** generate from these two SVGs. Use the full face for 96px and up (Apple touch icon 180px, manifest 192/512px) and the simplified face for 48px and below (favicon 16/32/48px).

```svg
<!-- hasa-app-icon.svg (full face, ≥96px) -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><clipPath id="sq"><rect width="100" height="100" rx="22.5"/></clipPath></defs><g clip-path="url(#sq)"><rect width="100" height="100" fill="#0F3D24"/><g transform="translate(12 8) scale(0.63333)"><rect x="54" y="2" width="12" height="22" rx="6" transform="rotate(10 60 14)" fill="#2E6B2F"/><path d="M60 16 C82 16 94 30 94 60 L94 168 C94 196 80 210 60 210 C40 210 26 196 26 168 L26 60 C26 30 38 16 60 16 Z" fill="#8CC63F"/><g fill="#8CC63F"><circle cx="27" cy="96" r="5"/><circle cx="27" cy="132" r="5"/><circle cx="27" cy="170" r="5"/><circle cx="93" cy="84" r="5"/><circle cx="93" cy="120" r="5"/><circle cx="93" cy="158" r="5"/></g><rect x="24" y="44" width="72" height="18" rx="6" fill="#FAF6EA"/><g fill="none" stroke="#0B2A1A" stroke-linecap="round"><path d="M39 73 Q45 68 52 71" stroke-width="4"/><path d="M68 71 Q75 68 81 73" stroke-width="4"/><path d="M49 106 Q60 116 71 106" stroke-width="4.5"/></g><g fill="#0B2A1A"><ellipse cx="46" cy="88" rx="6.5" ry="8.5"/><ellipse cx="73" cy="88" rx="6.5" ry="8.5"/></g><g fill="#FAF6EA"><circle cx="48.5" cy="84.5" r="2.3"/><circle cx="75.5" cy="84.5" r="2.3"/></g></g></g></svg>
```

```svg
<!-- hasa-app-icon-small.svg (simplified face, ≤48px) -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><clipPath id="sq"><rect width="100" height="100" rx="22.5"/></clipPath></defs><g clip-path="url(#sq)"><rect width="100" height="100" fill="#0F3D24"/><g transform="translate(12 8) scale(0.63333)"><rect x="53" y="1" width="14" height="23" rx="7" transform="rotate(10 60 14)" fill="#2E6B2F"/><path d="M60 16 C82 16 94 30 94 60 L94 168 C94 196 80 210 60 210 C40 210 26 196 26 168 L26 60 C26 30 38 16 60 16 Z" fill="#8CC63F"/><g fill="#8CC63F"><circle cx="27" cy="96" r="5"/><circle cx="27" cy="132" r="5"/><circle cx="93" cy="84" r="5"/><circle cx="93" cy="120" r="5"/></g><rect x="24" y="42" width="72" height="22" rx="7" fill="#FAF6EA"/><g fill="#0B2A1A"><ellipse cx="46" cy="90" rx="8.5" ry="10.5"/><ellipse cx="74" cy="90" rx="8.5" ry="10.5"/></g><path d="M47 112 Q60 124 73 112" fill="none" stroke="#0B2A1A" stroke-width="7" stroke-linecap="round"/></g></g></svg>
```

- **Mascot ("the coach"):** use the coach illustration only on onboarding, empty states and milestone/success moments, one per screen at most. If the app currently shows the old detailed pickle mascot elsewhere (e.g. the header), replace it with the wordmark there. If no coach file is provided in the repo, leave a clearly named placeholder component (`<Coach />`) using the app icon artwork and list it in the report; don't draw a new character.

## 4. Component and cleanup rules

### 4.1 Components
- **Buttons:** primary = `--action-bg`/`--action-ink`, `--radius-md`, body-strong, min height 48px; secondary = `--surface-raised` + 1px `--line` border + `--ink`; text = no fill, `--pickle-ink`. Sentence-case labels. **One primary button per screen.**
- **Cards:** `--surface-raised`, 1px `--line` border, `--radius-lg`, padding 16px on phones / 24px wider, **no shadow**, no cards nested in cards. Anatomy: label eyebrow → heading → body → small meta → one action.
- **Chips/tags:** pill, label style, `--surface-sunken`; selected = `--action-bg` with a check icon; a small `--ball` dot marks a current focus area.
- **Skill meters/progress:** 8px pill track `--surface-sunken`, fill `--pickle-ink`; score in heading or stat style; deltas shown with a sign ("+0.5") in `--pickle-ink`, never red for low skills. Keep the existing rating input behaviour; only restyle it (44px targets, numbers visible).
- **Inputs:** `--surface-raised`, 1px `--line` border, `--radius-sm`, 48px height, visible label above (don't rely on placeholder).
- **Header:** 56px, `--paper`, bottom border `--line`, wordmark left, at most two icon actions right.
- **Sheets/modals/toasts/menus:** the only places allowed `--shadow-lift`.
- **Icons:** one outline set (keep the current one if it exists; otherwise Lucide), 1.75–2px stroke, `--ink`/`--ink-muted`; icon-only buttons need an accessible name. No emoji as icons.
- **Focus:** every interactive element shows a 2px `--focus` outline with 2px offset on `:focus-visible`.

### 4.2 Make it cleaner (presentation only)
1. One clear job per screen: one primary action; demote the rest to secondary/text buttons.
2. Remove visual noise: decorative gradients, multiple shadow styles, stacked borders, nested cards, inconsistent radii.
3. Consistent rhythm: spacing only from the scale; 16px side gutter on phones; content max width 720px on large screens; 32px between sections.
4. Hierarchy through type, not colour: screen title (display-lg) → section headings → body. Big numbers in `stat`.
5. Colour discipline: ~70% paper/surfaces, ~20% ink/lines, ~8% green, ~2% ball. Never `--pickle` or `--ball` as text.
6. Replace duplicated one-off styles with the shared components.

### 4.3 Accessibility
Text contrast ≥ 4.5:1 (3:1 for 24px+ and for icons/borders that convey meaning) in both themes; touch targets ≥ 44×44px; real `<button>`/`<a>`/`<label>`; status never conveyed by colour alone.

### 4.4 Responsive
Phone-first. Check 360px, 390px and 768px widths and a desktop width. No horizontal scrolling.

### 4.5 Microcopy (allowed, but list every change)
You may tighten user-visible copy to the Hasa voice: specific, encouraging, brief; sentence case; digits for numbers; no emoji; at most one exclamation mark per screen; name the next action rather than the flaw. Don't change meaning, legal text, or anything that is data. **List every copy change (old → new) in the report** so it can be reviewed.

## 5. Verify before you report

- The app builds, type-checks and lints with no new errors; all existing tests pass. If a snapshot test changes only because of styling, update it and say so.
- Click through every flow end to end (log a session, rate the ten skills, view focus areas/drills, view progress, the video upload/analysis entry point, auth if present) and confirm behaviour is identical.
- Diff check: confirm no changes in API/data/logic files. Run `git diff --stat` and list any non-presentational file you touched with a one-line justification.
- Search for leftover hard-coded colours, old fonts and old logo files; remove unused old brand assets only if nothing references them.

## 6. Report back with

1. `RESKIN_PLAN.md` (audit) and a summary of what changed, per step.
2. Before/after screenshots of each screen at 390px wide, light and dark if both exist.
3. The list of copy changes (old → new).
4. Anything you skipped or questions where a visual change would have required a logic change.
