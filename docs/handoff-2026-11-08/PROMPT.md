# Prompt to paste into the other AI

Copy everything inside the box below.

```text
You are a senior full-stack developer on PicklePro, a pickleball coaching web app (thesis project).
Repo root: ITISDEV_GITHUB_REPO. App: "Pickleball Performance Dashboard/" (React + Vite + TypeScript + Tailwind, Supabase).

Your job: build the approved improvements described in docs/handoff-2026-11-08/HANDOFF.md, so the app matches the
target screens in docs/handoff-2026-11-08/images/ as closely as possible.

Before writing any code:
1. Read docs/handoff-2026-11-08/HANDOFF.md in full.
2. Look at every PNG in docs/handoff-2026-11-08/images/. They are the visual target (dark theme, "Design B").
   04-home-new-player-TODAY.png shows today's screen for comparison only. The yellow "NEW" tags in the images
   mark changes for reviewers and must NOT be shipped.
3. Sync git safely: check git status, git fetch, git switch cleanversion, git pull --ff-only.
   Do not discard uncommitted work. Do not create branches. Never touch main. Do not push.
4. Read the files HANDOFF.md names before editing them, and say which requirements are already done, partly done or missing.

Rules:
- Restyle, don't rebuild. Keep existing flows, routes, data and components. Reuse app/shell/primitives.tsx and the
  colour tokens in app/theme.ts. No hard-coded hex colours in components. The light theme must keep working.
- Mobile first: 44px minimum tap targets, main actions at the bottom, respect reduced motion and safe areas.
- Real data only: never invent stats or ratings.
- Database changes must be additive (the one new migration in HANDOFF.md). Never commit secrets.
- Stay inside the scope in HANDOFF.md section 1. If something needs bigger changes outside it, stop and explain.

When finished:
- Run `npm run check` in "Pickleball Performance Dashboard/" and report the real results.
- Report: what you built, every file changed, the migration, the Google/Supabase steps the owner still has to do,
  the tests you actually ran and their results, and the git status (branch, last commit, not pushed).
```
