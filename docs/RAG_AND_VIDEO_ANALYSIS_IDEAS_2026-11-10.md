# RAG and video analysis: improvement ideas (10 Nov 2026)

Notes from a review of how PicklePro could use RAG, and what would most improve the video analysis. Nothing here is built yet.

---

## Part 1: How RAG can improve PicklePro

RAG (retrieval-augmented generation) first looks up trusted notes, then has an AI write the answer from them, citing what it used.

**Principle: the rules decide, RAG explains.** The rule-based coaching stays the source of truth. RAG adds a personal, plain-language "why", with sources.

### Where it stands

- Coaching today is rule-based (`src/lib/coaching/coachScript.ts`, `selfAssessment.ts`). The normal flow needs no AI key.
- An experimental prototype exists: `server/rag_coach.py`, off unless `PICKLEPRO_ENABLE_EXPERIMENTAL_RAG=1`.
  - Its knowledge base is only 3 hand-written notes (dinks, rally fatigue, court positioning), held in a temporary in-memory store (Chroma).
  - It expects stats the app no longer collects (dink rate, volley rate, unforced errors as averages). The app now collects self-ratings, journals, court tests and heatmap kitchen time.

### Where RAG would help

1. **Explain the drill plan.** The rules pick the focus (for example dinks). RAG finds the matching drill notes for the player's level and explains why, citing the note. This is the easiest one to defend.
2. **Use the player's own history.** Search their past journals, check-ins and peer feedback. For example: "the last 3 times you rated dinks low, you'd also logged poor sleep." Store these as vectors in Supabase (pgvector), where the existing row-level security keeps each player's data private.
3. **Explain the heatmap.** Turn "38% at the kitchen line" into advice from positioning notes ("move up after the third shot").
4. **"Ask Pickle" Q&A** for strategy and rules questions, answered only from approved notes.

### What RAG won't fix, and risks

- It won't make the video analysis more accurate, and it won't make self-ratings objective.
- AI can still get things wrong. If no matching note is found, it should say so instead of guessing.
- Before sending journal text to an AI service, make sure the consent step covers it. Keep the API key on the server only, never in a `VITE_` variable.
- Write our own drill notes. Don't copy the official rulebook or coaching sites, which are copyrighted.

### Steps to make it real

1. Replace the 3 sample notes with our own drill library.
2. Move from Chroma to pgvector in Supabase.
3. Change the request so it takes the data the app actually has.
4. Test on about 20 sample players, so there are numbers to show at the defense.

---

## Part 2: What can improve the video analysis

### Where it stands

- Pipeline: YOLO person and pose models, a pool of YOLO ball models plus optional TrackNet, court mapping from confirmed landmarks, track grouping by clothing colour, and rule-based shot detection (`server/picklepro/shots.py`).
- About **73% of hits found** and **53–58% of shot types right**. These come from the one clip the rules were tuned on (`docs/SHOT_TYPES.md`), so they are not independent accuracy, and there is no held-out test set yet.
- Main causes of misses (from `SHOT_TYPES.md`):
  - the ball is missed in fast exchanges and at contact
  - the near baseline is out of the picture, so the server's position is unknown
  - court positions used to tell dinks and drops from drives are often off

### Ideas, roughly in order of value for the effort

1. **Label more videos, with a separate test set.** Label 10–20 videos frame by frame on the Label shots page (`#/label`), from different courts, lighting and players. Tune on some of them and keep the rest untouched for final testing. This gives numbers we can defend and enables idea 4.
2. **Recording guidance in the app (cheap, large effect).** Show a checklist before upload:
   - camera on a tripod, raised, behind the baseline, horizontal
   - the whole court in view, including the near baseline
   - 1080p at 60 frames per second if the phone allows

   Then check one frame and warn if lines or a baseline are missing. This fixes the "server's position unknown" problem at the source.
3. **Listen for the paddle "pop".** A paddle hit makes a sharp, distinctive sound. Finding it in the audio gives exact hit times even when the ball is blurred or hidden, which is where hits are missed now (fast exchanges, serves, overheads). It's cheap, and it can be combined with the existing swing and ball signals.
4. **Train a model instead of hand-set rules.** Pose, ball and court features already exist for every hit. With labeled videos, a small model can learn the shot types from them. Also fine-tune the ball detector (YOLO or TrackNet) on frames from our own videos to stop missing balls at contact.
5. **Analyze every frame only where it matters.** Analyzing every frame got shot types right 75% of the time instead of 53%, but found fewer hits and costs more. Take a quick pass on fewer frames first, then re-check every frame only around moments that look like hits.
6. **Steadier player tracking.** A tracker that recognizes people by appearance (for example BoT-SORT with re-identification) keeps one ID per player, instead of the ~20 fragments the code now stitches together by clothing colour. This makes "this is me" and the heatmaps more reliable.
7. **Let players correct the results.** If players can confirm or fix a shot in the app, each correction becomes new labeled data (with consent), so the analysis improves as people use it.

**Suggested start:** ideas 2 and 3. Both are quick to build, help with the videos we already have, and are easy to explain at the defense. Idea 1 underpins everything else.
