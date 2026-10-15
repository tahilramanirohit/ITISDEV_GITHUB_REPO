# Hasa Brand System

Hasa is a pickleball coaching app: log a session, rate ten skills, get focus areas and drills, and track progress, with optional video court-position analysis. This brand book is the single source for how Hasa looks and sounds, and the reference for re-skinning the current app (still named PicklePro in code).

**Status:** concept identity, version 01c. The name has not been cleared: trademark (IPOPHL), app-store and domain checks are still pending. The logo files here are clean vector mocks; a designer should redraw the final masters from them.

## 1. Name and story

*Hasa* (Tagalog) means sharpening or training; *hasâ* means honed, highly skilled. The story: **every session sharpens your game.** The app's job is to tell a player what to sharpen next.

- Write it lowercase in the logo (**hasa**) and capitalised in sentences (**Hasa**).
- Never "HASA", "Hasa App", or "Hasa Pickleball" as a product name. "Hasa, pickleball coaching" is fine as a descriptor.
- Tagline: **Know what to practice next.** Use it under the wordmark and as the landing headline. Don't rewrite it per page.

## 2. Voice

Hasa talks like a good club coach: specific, encouraging, brief. It names the next action, not the player's flaws.

| Do | Don't |
| --- | --- |
| "Work on your third-shot drop this week." | "Your third shot is weak." |
| "Nice, 3 sessions in a row." | "Amazing!!! You're crushing it 🔥" |
| "Rate each skill from 1 to 5." | "Please kindly provide your self-assessment ratings." |
| "We couldn't read the court lines. Try a video filmed from behind the baseline." | "Error: analysis failed." |

Rules: sentence case everywhere (buttons too); numbers as digits; no emoji in UI copy; one exclamation mark per screen at most; second person ("you", "your game").

## 3. Logo

### Wordmark

The wordmark is **hasa** in lowercase: a custom **h** followed by **asa** set in Bricolage Grotesque ExtraBold (800).

- **The h** is a drawn glyph (asset `hasa-h-glyph.svg`). Its top is cut at a shallow angle, like a sharpened edge; the cut removes the corner and never leaves a spike.
- **Spacing (01c):** h→a +0.005em, a→s −0.03em, s→a −0.005em, with tracking 0 on the letters themselves. This tightens "ha" and opens "s/a" so the four letters read evenly.
- **Height:** the h glyph's ascender equals about 0.72 of the font size (138 px at 190 px).
- Until a designer outlines the full word, build it as the h SVG plus live text with the spacing above, never as plain text "hasa".

Colours: forest (`forest`) on paper; paper (`paper`, light value) on forest or ink. Never pickle or ball for the wordmark.

Clear space: the height of the "a" on every side. Minimum size: 20 px tall on screen.

### Lockups

1. **Wordmark alone**: the default, used in the app header and on the web.
2. **Mark + wordmark**: the coach's head crop to the left of the wordmark, head height = wordmark height. For splash screens, social, print.
3. **Wordmark + tagline**: the tagline in `body-strong` below, left-aligned, with the "PICKLEBALL COACHING" descriptor in `label` under it.

## 4. The coach (mascot)

A pickle in a sweatband who plays pickleball. One geometry is used for the mascot, the app icon and every lockup:

- Straight cylindrical body; a stem nub leaning slightly right; bumps only on the silhouette edge (never dark spots inside the body); a paper-coloured sweatband; two oval eyes with highlights, short brows and a closed smile.
- **Flat fills only.** No outlines, gradients, shading or ground shadow.
- **Pose library:** ready stance (knees bent, feet balanced, paddle up and forward) is the master pose. New poses reuse the same body, face and limb weights (arms 13, legs 15 at master size).
- **Where it appears:** onboarding, empty states, milestone moments, the drill of the week. **Where it doesn't:** inside data views, next to errors, or on every screen. One coach per screen at most.
- An in-app name ("Piko") is optional and not yet decided. Don't print a name in the logo.

## 5. App icon

- Forest square, corner radius 22.5% of the side, the coach's head and body cropped at the bottom, head filling 76% of the width, stem with clear padding above.
- **Full face** (`hasa-app-icon.svg`) at 96 px and up, including the store listing.
- **Simplified face** (`hasa-app-icon-small.svg`) at 48 px and below (favicon, notifications, settings rows): no brows or highlights, larger eyes, thicker smile and band.
- One-colour and reversed versions keep the face and band knocked out of the solid body so they stay legible.

## 6. Colour

Paper and ink carry the interface; forest is the brand; pickle and ball are seasoning.

- **Ratio guide:** about 70% paper/surfaces, 20% ink and line, 8% forest or green, 2% ball.
- **Text:** `ink` or `ink-muted` on `paper`/`surface-raised`; `action-ink` on `action-bg`. Never `pickle` or `ball` as text on paper; use `pickle-ink` for green text.
- **One primary action** per screen, in `action-bg`.
- **Status:** `pickle-ink` for improvement, `warning` for cautions, `danger` for errors. Pair colour with an icon or a word, never colour alone.
- Both light and dark themes are defined. The current app uses a dark green theme colour, so dark is a first-class theme, not an afterthought.

## 7. Type

- **Bricolage Grotesque 800** (`display`) for the wordmark, screen titles and big numbers only.
- **DM Sans** (`body`) for everything else, at 400 and 700.
- Both are free Google Fonts: load Bricolage Grotesque at weight 800 and DM Sans at 400 and 700, with `display=swap`.
- Use the type styles in the tokens; don't invent sizes. Minimum text size 12 px (`label`), 14 px for anything a player must read to act.

## 8. Layout and shape

- 4 px base grid; spacing tokens `space-1` to `space-12`.
- Cards: `surface-raised`, 1 px `line` border, `radius-lg`, padding `space-4` (phone) or `space-6` (wide). No card shadows.
- Shadows (`shadow-lift`) only on floating layers: sheets, menus, toasts.
- Single column on phones, 16 px side gutter; content max width 720 px on larger screens.
- Touch targets at least 44 × 44 px.

## 9. Making the app cleaner

These are the principles for aligning the current app to Hasa:

1. **One job per screen.** Each screen leads with its single main action; secondary actions become text buttons or move into a menu.
2. **Fewer surfaces.** Paper background, white (or raised) cards, one border style. Remove nested cards, decorative gradients and stacked shadows.
3. **Numbers first.** Skill scores and progress use the `stat` style with a short label; let the number carry the screen.
4. **Plain words.** Rewrite labels per the voice table; remove instructional paragraphs where a clear label will do.
5. **Consistent components.** Every button, chip, meter and card comes from the components in this system.
6. **Mascot with a job.** The coach appears where it helps (onboarding, empty states, milestones) and nowhere else.
7. **Accessible by default.** 4.5:1 text contrast in both themes, visible focus rings (`focus`), real buttons and labels.

## 10. Iconography

Use one outline icon set at 1.75–2 px stroke with rounded caps (Lucide is a good free match), in `ink` or `ink-muted`. Icons sit beside a label, rarely alone; an icon-only button needs an accessible name. No emoji as icons.

## 11. Don'ts

- Don't recolour the coach, stretch it, add outlines, or put it on a busy photo.
- Don't use the old detailed PicklePro mascot alongside the new coach.
- Don't set the wordmark in any other font or as plain text.
- Don't put text on top of the pickle green or ball yellow.
- Don't introduce new colours, gradients or fonts outside this system.
