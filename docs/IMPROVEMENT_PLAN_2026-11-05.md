# PicklePro: current status and proposed priorities

Checked on 5 November 2026, Manila time. This is a recommendation and release checklist, not a record of user-approved product changes.

## What is online

- Current source: `cleanversion`, commit `70d49adfa3fed8f09b0941044553afa118e59ef6`.
- GitHub's Vercel commit status reports a completed deployment on 5 November at 7:18 PM Manila time: https://vercel.com/bumbai/pickleprothesis/AHhZBbubQgwTRZwQz2N7mpFhmHda
- The branch test site responds with HTTP 200: https://pickleprothesis-git-cleanversion-bumbai.vercel.app
- The separate https://picklepro-app.vercel.app also responds, but its latest production deployment in the connected account is from 16 October. Treat it as an older site.
- The current deployment belongs to the `bumbai` Vercel team. The connected Vercel account exposes only `thekirxs-projects`, so its settings and production promotion could not be inspected directly.
- A responding website and a successful deployment do not establish that sign-in, saving data, sharing, or video processing work end to end.

## What was recently added

The 3 November redesign introduced the green/yellow mobile design. The 5 November updates added:

1. Required starting ratings for at least three skills, two four-week goals, and progress against the starting point.
2. Game-focused progress: games/practice filters, game results, reported mistakes, recovery patterns, and re-test reminders.
3. Guided pre-game, in-game and post-game steps, with lighter practice suggestions after high reported soreness or effort.
4. Five counted court drills, saved results, targets and re-test history.
5. Requests for a partner to rate up to three skills, comparison with the player's ratings, and feedback without needing video.
6. Buddy suggestions based on purpose and recent self-ratings, plus a shortcut to log an accepted buddy session.
7. A script for four demonstration accounts with history. The script's presence does not establish that these accounts exist in the hosted database.
8. Experimental video error counts and a choice of two or four players. Error categories include serve faults, shots out, kitchen faults and positioning patterns. Counts depend on what the camera and detector can observe; shots without a seen bounce are omitted. Positioning patterns are coaching cues and should be explained separately from rule violations.

## What has been verified

- Fresh `npm run check`: TypeScript passed, 223 tests across 40 files passed, production build passed.
- HTTP availability of the current branch site and the older app site.
- Vercel's successful status attached to the exact current commit, obtained through GitHub.

Not verified: real-account flows, hosted database updates, deployed video API reachability, running worker, backend test suite, or video-count accuracy. Earlier commit notes report an existing synthetic positioning test failure; re-run and investigate it before a video release.

## Recommended decisions

| Decision | Recommendation | Reason |
| --- | --- | --- |
| Immediate priority | Reliable thesis walkthrough | Most requested features already exist; prove the complete experience before expanding it. |
| Website to test | Use the `cleanversion` test site | It is tied to the latest completed deployment. |
| Main story | Starting point → play/practice → partner feedback → progress | This directly connects the adviser requirements. |
| Video | Keep optional and clearly experimental | It needs separate services and accuracy validation. |
| Next feature after stability | Review-only solo-practice video | This is the specific remaining app gap identified in the adviser analysis. |
| Further visual redesign | Defer until phone testing finds concrete problems | The recent redesign is already implemented. |

These are proposed defaults, not permissions to change hosted services.

## Work order and acceptance checks

### 1. Confirm the correct hosted setup

- Inspect the `bumbai/pickleprothesis` project using access to its owning team. Confirm which branch is the public production version and record one canonical demo link.
- Identify the actual Supabase project used by that deployment. The connected Supabase tool currently returns no accessible projects, so hosted schema status remains unknown. The local `.env.local` points to a placeholder and cannot support a real-account local walkthrough as configured.
- Inspect existing database tables/functions before applying anything. If earlier updates are present, verify the new court-tests, peer-feedback and Buddy-matching changes (upgrade scripts 8, 9 and 10, in order). Do not reset data or run the whole upgrade chain blindly.
- Check that sign-in return links point to the intended website.

Done when: a real test account signs in, saves a session and court result, reloads, and sees both retained.

### 2. Prove the core experience with two accounts

- Account A sets starting ratings and goals, records pre-game details, logs a result, rates skills and records recovery.
- A asks account B about selected skills. B responds; A sees the comparison and resulting practice focus.
- Confirm that B cannot access A's private journal and loses shared access when A stops sharing.
- Send and accept a Buddy request, then use its logging shortcut and check the saved session.
- Test on a real phone, including an empty account and both themes. Use clearly labelled demonstration data separately from genuine participant results.

Done when: the entire walkthrough works without manual database repair or unexplained missing data.

### 3. Resolve video service readiness

- Verify a public HTTPS court-preview/validation API and a running analyzer worker connected to the same database as the website.
- Check deployed configuration: the shipped bundle contains a `localhost:8000` fallback, which by itself does not prove the active setting. A visitor's phone cannot use a backend running only on the developer's localhost.
- Update/restart the worker with the current analyzer code; deploying the website does not update that worker.
- Run the backend suite and investigate the previously reported positioning failure.
- Process a short consented clip end to end. If services will not be available for the demo, use the existing no-worker trial setting to disable new analysis uploads and keep the core app usable.

Done when: an uploaded video finishes from a separate device, or uploads are clearly unavailable while the rest of the demo works.

### 4. Validate the experimental counts

- Have a person mark events and times on a small, varied set of consented singles and doubles clips.
- Compare those marks with detected events; record missed events, false alarms and unusable footage by category.
- Explain positioning suggestions separately from official faults. Report self-ratings as self-ratings and counted drills as counted drills.

Done when: thesis claims match observed evidence, with known limits documented.

### 5. Close the remaining adviser gap

Design a review-only solo-drill video flow: upload and privately share a practice clip, request feedback on selected skills, and let a partner comment without requiring successful full-court analysis. Confirm the design before implementing it.

Update the written proposal to describe game performance, starting measurements, the three game phases, and peer coaching. Show a before/after walkthrough and keep demonstration results distinct from research findings.

## Approaches to choose between

1. **Thesis-ready first (recommended):** complete steps 1–2, use optional video only where ready, then close the solo-drill gap. Best fit for a dependable presentation and adviser alignment.
2. **Video-first:** complete service setup and accuracy evaluation before additional product work. Best if measured video performance is the central research requirement; entails more technical uncertainty.
3. **Public-launch first:** prioritize sustained hosting, support, operational monitoring and release ownership. Best if external users are the immediate goal; a larger effort than preparing a thesis demo.

Next user decision: whether the immediate milestone is the thesis presentation, video research validation, or a public launch.
