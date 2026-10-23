# Adviser notes checklist (`pickleproapp`)

Status as of 7 Oct 2026. ✅ done · 🟡 done with a stated limit · ⬜ not done.

| # | Adviser note | Status | Where it is | Limit or next step |
|---|---|---|---|---|
| 1 | App tailored to tablet | ✅ | Tablets (768–1023 px) get the phone layout at a larger size, with bottom tabs and type scaled about 12%. Desktop from 1024 px uses a sidebar and the full screen | Check on a real iPad in both orientations |
| 2 | Different screens for different functions | ✅ | Home, Sessions, Log, Progress and Profile, plus Settings and Privacy. Each session has Rate & plan, Video and Journal tabs | |
| 3 | Copy Reclub UI | ✅ | Design D "Club Court" (chosen 7 Oct): Reclub-style heavy headlines, color blocks, underlined tabs, player avatar grids and pill buttons, plus a pickle-green greeting header with a white panel over it, ring tiles, a weekly challenge, a day strip and a "Log today's game" bar (from the Mora and Tino references). Strava-style activity cards with stat rows | Matches the style; it is not a pixel copy of their screens |
| 4 | Default settings/options | ✅ | Settings screen (`#/settings`): default review mode, session kind and format; larger text; data and privacy; research tools | |
| 5 | Internal ID + timestamps for uploads | ✅ | Video tab → "Research details": upload ID, registered, upload finished, clip length, analysis job ID and finish time. Session header shows the session ID and creation time | |
| 6 | Video upload optional | ✅ | "Rate my own game" needs no video; Video is an optional tab | |
| 7 | Names/IDs for players | 🟡 | Player ID (`PP-XXXXXX`) on Profile. Partner and opponent names are typed at logging and editable later ("Edit details & players"), and appear as avatars on cards and session pages | Names are not yet linked to the people the computer vision finds in a video (only "You" is) |
| 8 | Create database | ✅ | Supabase migrations and copy-paste scripts in `supabase/scripts/` | |
| 9 | Tournament style + solo | 🟡 | Log asks Solo practice / Match / Tournament. Tournaments record name, round, result and score, editable later. Sessions has Tournaments and Solo filters, and groups tournament matches by event with a win count | A tournament is grouped by its name, not stored as its own record (no brackets or standings) |
| 10 | Signup + onboarding questions | ✅ | Account or guest sign-up, then 5 onboarding steps once | |
| 11 | Video upload restrictions | 🟡 | 50 MB per file, 10 s to 5 min, 5 uploads a day, 1 GB stored per player (checked in the browser and enforced by the database). Landscape and at least 720p (checked in the browser) | The database can't read the video, so landscape and 720p are browser checks only. The analyzer still rejects low-quality files |

## Speed work in this pass

- App code on the first screen: about 512 KB → 59 KB. React and Supabase are separate files that stay cached between deploys.
- Onboarding (8 KB) downloads only for players who still need it. The main screens are fetched in the background after sign-in, so tab switches are instant.
- Images converted to WebP: mascot 248 KB → 30 KB, logo 22 KB → 6 KB.
- One font family (Inter) instead of four, linked with preconnect from `index.html` instead of a chained CSS import.
- Built files are cached for a year as immutable (`vercel.json`).
