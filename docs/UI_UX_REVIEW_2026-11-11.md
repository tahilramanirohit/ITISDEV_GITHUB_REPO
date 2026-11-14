# PicklePro UI/UX review (phone), 11 Nov 2026

**What was reviewed.** Phone size (375 px wide). The sign-in page was reviewed on the live site
(picklepro.kirkorino.com). The signed-in screens were reviewed on the local preview of the
`cleanversion` branch with sample data, because the live site needs a sign-in. Screens covered:
sign-in, data consent, Home (new user and active user), Sessions list, session page (Rate & plan
and Video tabs), Log a session (both steps), Progress, Players, Profile.

Mocks for items 1 to 4: `docs/mockups/ux-review/index.html`.

## High impact

1. **Video review: the video is below the first screen.** On the Video tab the player starts about
   560 px down. Above it: title, scoreboard, avatars, focus chips, "Edit focus", three phase chips,
   four tabs, result header, two audio buttons and the player picker. The shots list is a further
   ~1,800 px down, so tapping a shot jumps a video the user can no longer see.
   *Fix:* video first, pinned to the top while scrolling; shots as a strip right under it.

2. **Session page header is heavy on every tab.** About 430 px of header (two title lines,
   scoreboard, avatars, focus chips, phase chips, tabs) before any content.
   *Fix:* one compact header (title, score, date); phases and focus move into a "Details" row.

3. **The video practice plan is a wall of text.** Three focus areas, each five paragraphs
   (finding, why, drill, target, evidence). The sentence "3 focus areas for your next practice…"
   appears three times. The self-rated plan already uses neat expandable cards; the video plan does not.
   *Fix:* same expandable cards: one number, one line, drill on tap, evidence behind "Why?".

4. **Log a session, step 2 is one long form.** About 1,500 px: session kind, setting, format,
   three name fields, three focus options with rating balls, name, date, notes. The "Start rating"
   button is at the very bottom.
   *Fix:* ask only what is needed (kind, format, focus); fold the optional fields under
   "Add details"; keep "Start rating" pinned at the bottom.

5. **Home says the same thing twice.** "Next up: serve · Target serves, 3 times this week" and
   "Practice next · Target serves · 15 minutes" are the same message. "Log today's game" and the
   centre "+" are the same action.
   *Fix:* one practice card; drop the extra log button (or keep it only for new users).

## Medium

6. **Names are inconsistent.** The video now shows "Kenneth", "Kyle", "Opp 1"; the shots list
   still says "You", "Player 4", and the filter says "Them". Use the same labels everywhere.

7. **Three audio buttons, unclear difference.** "Play coaching · 1:08" and "Hear full plan · 2:25"
   on a session, "Hear this week's plan · 41 s" on Home. *Fix:* one "Listen" button with a
   Short / Full choice.

8. **Sessions list.** Titles are cut off ("Thursday doubles wit…") while the line below repeats
   "with Kyle". Every row has a "Plan ready" pill, so it carries no information. *Fix:* let titles
   wrap to two lines; show a pill only when something needs the user (e.g. "Video review ready",
   "Rate this game").

9. **Players: button order flips.** The buddy request shows Decline then Accept; the play request
   right below shows Accept then Decline. Keep one order (primary action on the right, in the
   thumb zone). "How it works" (buddy vs video partner) is at the bottom, after the user has
   already had to decide.

10. **Progress: "By skill" table is hard to scan.** Three columns of small numbers (base, now,
    peer). *Fix:* a small bar per skill with the baseline marked, and an arrow for change.
    "Unforced errors" dots have no scale; add "fewer is better" or a label per dot.

11. **Rating by holding the ball.** "Hold the ball, let go to rate" is a hidden gesture. Make sure
    a plain tap on 1 to 5 also works, and say so.

## Small

12. Sign-in: "How it works" is collapsed below the form; a single preview image of a report would
    sell the app better than the tagline alone.
13. Profile: "Self-rated progress" duplicates the Progress tab.
14. Video tab: "Update my court feedback (re-runs the analysis)" is a long underlined link under
    the picker; it reads as a warning. A small button with a one-line hint is clearer.
15. Several captions are 11 to 12 px (legend, evidence, table headers); 13 px is a safer floor on phones.

## Suggested order

1, 3 and 6 together (the video review is the defense centrepiece), then 2, 4, 5. The rest are small.
