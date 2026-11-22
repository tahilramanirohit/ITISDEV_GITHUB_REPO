# Group video partnering (2–4 players): plan for next term

Status: **planned, not started.** Moved to next term's remaining 20% (decided 22 Nov 2026).

Goal: one game with 2–4 players who have accounts. One person films and uploads. The others use the
same video in their own session, each picks themselves, and anyone in the game can ask the others for
feedback.

## What exists today (as of commit 6a778a8 on `cleanversion`)

Migrations are in `supabase/migrations/`; the same SQL is in `supabase/scripts/new_project_setup.sql`.

| Part | Where | Limit today |
|---|---|---|
| Buddies | `buddies`, `20261105130000_buddy_friends.sql` | One row per pair (unique index on the pair) |
| Play requests | `buddy_requests`, `20261022090000_buddy_finder.sql` | One `from_player_id`, one `to_player_id` |
| Video partners | `partners`, `20261024090000_partners.sql` | One row per pair; max 20 active partners |
| Asking for feedback | `report_shares` + `share_session` (`20261105100000_peer_feedback.sql`) | One partner per row (several rows already work); the Ask sheet sends to one person |
| Tag buddies in a game | `game_tags` (`20261109090000_buddy_game_shares.sql`) | Several buddies per game, but they only **view** the owner's analysis |
| "Add Kirk's video" | `20261112090000_buddy_session_video.sql` | Asker and asked player only (from `sessions.buddy_request_id`) |
| Other players in a session | `session_participants` | Partner and opponents are typed names, not linked to accounts |
| Video per session | `video_assets.session_id` is unique | One video and one analysis per session; each copy is analysed again |
| "This is me" | `PlayerPicker.tsx`, `ResultView.tsx` | Saved in `localStorage` on one device only |

## Phases (each can ship on its own)

### Phase 1 — Who was in the game (small)
- In New session and "Edit details & players", each of the 3 other slots can be linked to a buddy, as partner or opponent.
- Build on `game_tags` and add a `role` column (partner / opponent).
- The game page shows "In this game: Kirk (partner) · Carla, Jun (opponents)".
- Limit: 2 players for singles, 4 for doubles.

### Phase 2 — One video for everyone (medium)
- Widen "Add Kirk's video" from the one asked buddy to every linked player who accepted. Base it on `game_tags` instead of `buddy_request_id`.
- Only one person uploads. The others get "Add Rohit's video" in their own session (extend `buddy_game_upload_rule`).
- The uploader has one switch: "Let players in this game use this video" (reuse `buddy_can_use`).
- Security: `buddy_can_copy_video` allows only accepted, linked players of that game.

### Phase 3 — Each player finds themselves (medium)
- Save "This is me" to the account (a new table, e.g. `game_track_claims(session, player, track_id)`), not to one phone.
- When Kirk picks his player, the other three see "Kirk" on that player automatically.
- Two people can't claim the same player.

### Phase 4 — Feedback across the group (medium)
- The Ask sheet picks 1–3 people, or "Everyone in this game" (one `report_shares` row each).
- The "Get a partner's view" card lists the players from the game, not only one buddy.
- Feedback is labelled by who gave it, e.g. "Kirk (partner)" or "Carla (opponent)".

### Phase 5 — Analyse once for everyone (large; Kirk's analysis code)
- One run works out results for all 4 players, and every copy reuses it.
- Saves 4× the analysis work and gives everyone the same shot counts.
- Without it, Phases 1–4 still work; each copy is just analysed again.

### Optional — Group play request
- "Ask 3 buddies to play doubles". Separate from video; can wait.

## Decisions to make before starting

1. **Who has to be buddies?** Recommended: each player only needs to be a buddy of the uploader. If everyone had to be buddies with everyone, opponents could be blocked from the video.
2. **Who sees comments on the video?** Recommended: only the person the comment is about, plus whoever wrote it. The other option is the whole game.
3. **Phase 5 now or later?** Recommended: Phases 1–4 first, then Phase 5 with Kirk.

## Testing for every phase
- SQL tests that a player not in the game can't see the video, the result or the comments.
- Unit tests for the new screens and helpers.
- Before/after screenshots from the simulator.
- A demo game with 4 demo accounts (`supabase/scripts/demo_data.sql`).
