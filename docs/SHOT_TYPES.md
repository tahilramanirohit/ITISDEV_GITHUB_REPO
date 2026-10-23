# Pickleball shot types and how PicklePro names them

PicklePro names each detected hit with one of **eight core shot types: serve, return, drop, drive, volley, dink, overhead and lob**, or `unclassified` when the evidence is too weak (team direction, 30 Sep 2026). The detailed rules below can recognise finer shots; each is reported as the core shot it is a kind of. A speed-up is a drive after the bounce or a volley out of the air. A counter and an erne are volleys. A reset is a dink at the kitchen line or a drop further back. `shot_type` and `public_shot_type` both use the eight types; results saved earlier keep their finer names in `shot_type`. **All automatic shot labels are experimental.** One development clip was used to tune the rules, so it is not independent validation. The local prototype shows estimated events for review; the player report withholds them until real-footage evaluation is recorded.

## Shot types

| Type | What players mean by it | How PicklePro recognises it |
| --- | --- | --- |
| Serve | Underhand first hit of a point, from outside the court behind the baseline (volley serve or drop serve). It must cross diagonally into the opposite service court and must not land in the kitchen. | 1st hit of a rally, with the hitter **behind the baseline** (0.3 m of leeway for foot-position error; team rule, 30 Sep 2026), and the ball going **over the net to the diagonally opposite half**: the bounce, or else the receiver, is on the other side and the other half across. When neither the bounce nor the receiver was seen, the direction is not checked. When the bounce is seen, the serve is marked in or a fault: did not cross the net, landed in the kitchen, landed out, or did not cross diagonally. |
| Return | The receiver's reply to the serve, after it bounces; usually deep. | 2nd hit of a rally, from the back 2 m. |
| Drive | Hard, flat shot. | Fast (≥ 9 m/s) after a bounce, when no more specific rule applies. |
| Drop | Soft shot from the back or transition zone that lands near the net. This includes the third-shot drop, which is no longer a separate type. | From behind the kitchen line, slower than 9 m/s or landing in the kitchen. |
| Dink | Soft shot from the kitchen line into the opponents' kitchen. | Hitter within about 1.1 m of their kitchen line, after the bounce (a bounce was seen, or both players are at the net and the ball took at least 1.1 s to come back: a ball that slow lands in the kitchen, where it may not be volleyed), not fast. |
| Reset (block) | Soft reply that takes the pace off a hard incoming ball. | Soft reply at the kitchen line or in the transition zone when the incoming shot was fast. |
| Speed-up | Sudden fast attack out of a soft (dinking) exchange. | Fast shot (≥ 9 m/s) from the kitchen line after a soft incoming shot. |
| Counter | Volley straight back at an opponent's speed-up. | Volley at the kitchen line when the incoming shot was a speed-up. |
| Volley | Any shot hit out of the air before the ball bounces. | Both players at the kitchen line and the ball came back within 0.85 s (no time to bounce), or no bounce seen since the previous hit with good ball coverage. Fast kitchen-line exchanges ("hands battles") stay volleys. Following the team's shot table (`Pickleball_Cap1_Notes.pdf`), **every shot hit out of the air is reported as a volley** except a serve, return, lob or overhead: dinks, drops and drives are hit after the bounce. |
| Lob | High shot over the opponents, landing deep. | Ball rises more than 3.5 m above the far-baseline image line, or hangs ≥ 2 s over ≥ 8 m. |
| Overhead smash | Hard downward shot from above the head, usually off a short lob. | Contact point above the top of the hitter's box (not on the first hit). |
| Erne | Volley near the net hit with the feet outside the sideline, beside the kitchen. | Volley at the kitchen line with the hitter's feet more than 0.25 m outside a sideline. |
| Hit (unclassified) | A hit was seen but the evidence is too weak. | Court not mapped, or no next bounce or hitter to measure the shot. |

"Ground travel" is the horizontal court distance from the hitter to the next bounce (or next hitter), divided by the time taken. A single camera cannot measure the ball's height or its true 3-D speed, so this is a travel rate across the court, not a radar speed. Speeds above 28 m/s are discarded as a mismatched bounce or hitter.

**Not named, because a single video cannot show them reliably:** around-the-post (ATP) shots, spin (topspin, slice), forehand versus backhand, "tweeners", poaches (the partner's side is ambiguous in doubles), and whether a shot won the point.

## How hits are found

1. **Ball path.** The ball model (`ball,person,paddle.pt`) runs at 1280 px, 15 times per second. Boxes far too big for a ball, and candidates that never move (a ball printed on a banner, a lamp), are removed. The rest are linked into flights using their velocity. Only observed boxes are kept, so nothing is interpolated.
2. **Hits and bounces.** A sharp change of direction is a candidate hit. An upward kick in the image with no player in reach is a bounce. Seen from behind a baseline, a near player's box covers much of the far court in the picture, so a candidate can fit a player on either side of the net.
   **Hits alternate sides.** Every shot must cross the net, so within a rally the hitters must alternate between the near and far teams. For each candidate, PicklePro considers the closest player on each side, then picks the sequence of hits and sides that scores best: the ball turned sharply and passed close to the chosen player. Weak candidates that would break the alternation are dropped.
   A ball at shoe level (below about 85% of the player's height) is rolling or bouncing past, not being struck, so it is never a hit for that player.
   The ball's apparent size is only a coarse check: detector boxes are padded and blurred to about twice the ball's true size, so size cannot tell a near ball from a far one.
3. **Not a stroke.** A ball that stays within about a third of a body height of the player for the whole half second around the "hit" is being carried, caught or bounced before a serve, so it is ignored. So is a "shot" that travels slower than 0.8 m/s.
4. **Rallies.** Hits more than 3.5 s apart start a new rally. A rally starts at its first hit from a serving position: behind or near the baseline, or, on the near side, with the player's feet below the bottom of the picture (the near baseline is often out of view). Hits before that are balls knocked back between points and are dropped. A run of hits without a serving position counts only if it has at least 4 hits. Shot numbers (serve, return, third shot) come from this, so a missed serve shifts the numbering.

## Why hits were missed on chvsBJ_v2 (30 Sep 2026)

On `chvsBJ_v2.mp4` (8 labelled shots) only the serve was found, although the ball was followed through the whole rally. Three causes were found and fixed:

1. **Near-player volleys looked like bounces.** From behind the near baseline, a ball the near player hits back moves down the picture and then up, just like a bounce. A bounce within reach of a player is now also offered as a possible hit, and kept only when the rally needs it: the two sides must alternate, so a "bounce" between two far-side hits was really the near player's shot.
2. **"Close to the player" was measured from the middle of the player's box.** On a volley the ball meets the paddle at arm's length, about 0.75 player-heights from the middle, which scored almost nothing. It is now measured from the nearer wrist, less a paddle length (`REACH_FROM_WRIST`, `PADDLE_REACH_FRAC`), with `REACH_SCALE` 0.7.
3. **A far player's drive was 0.01 outside the contact distance.** `FAR_CONTACT_MAX_DIST` is now 0.6.

Measured on all four labelled clips (87 shots):

| | Found | Real | Right type |
| --- | --- | --- | --- |
| Before | 45 (52%) | 76% | 25 |
| After | 65 (75%) | 74% | 37 |

Per clip, found before and after:

| Clip | Before | After |
| --- | --- | --- |
| chvsBJ_v2 | 2 of 8 | 7 of 8 |
| CHvsBJ | 9 of 15 | 13 of 15 |
| PickleballVideo | 15 of 38 | 22 of 38 |
| Kirk | 19 of 26 | 23 of 26 |

The cost is on the Kirk clip: 34 detections for 26 shots, so 68% real, down from 83%. The label scorer also merges a shot marked on several consecutive frames into one shot.

## Swings and posture (pose model)

With the pose model (`yolo11n-pose.pt`, found automatically in `server/models`), each player found by the person model (`yolo11n.pt`) also gets 17 body points: head, shoulders, elbows, wrists, hips, knees and ankles. `picklepro/swings.py` turns them into two kinds of evidence, the way racket-sport apps such as SwingVision read strokes from the player as well as the ball:

- **Swing strength.** How fast a wrist moves relative to the player's own shoulders, in body heights per second. Walking moves the shoulders too, so it does not count as a swing. When the ball turns near two partners, the one who swung is preferred. A candidate hit with no swing near it scores lower, so fewer non-shots are reported.
- **Contact posture.** Where the hitting wrist was at contact: above the head (overhead), between hips and head, or below the hips. A low, soft contact at the kitchen line is a dink.

Without a pose model, these steps are skipped and the rules use ball and court evidence alone.

**Measured on the development clip (30 Sep 2026).** In each labelled second, the player swinging fastest on the hitting side was the labelled hitter in 21 of 26 shots. Swings alone do not find shots, though. Pose runs 10 times a second, and the short swings of dinks and net volleys barely register: a threshold that caught 16 of the 26 shots also produced 65 swing peaks. So the ball still decides *when* a shot happened, and swings help decide *who* hit it and *what* it was.

| This branch, one ball model | Detections (26 real) | Shots found | Detections that are real | Right side of the net | Right player | Right type |
| --- | --- | --- | --- | --- | --- | --- |
| Person model, no swings | 28 | 77% | 71% | 70% | 55% | 50% |
| **Pose model with swings and posture** | **25** | **73%** | **76%** | **74%** | **58%** | **53%** |

Hitter figures here match each label to the labelled player's detection within that second. The official `picklepro.evaluate` matcher pairs by time alone; with whole-second labels, where several seconds hold two shots, it reports 32% for the same run. Frame-precise labels from `#/label` remove that ambiguity. All numbers come from the clip used to choose the rules, so they are not independent accuracy.

**What stops higher accuracy on this footage:** the ball is missed in fast exchanges and at contact (0:25, the overhead at 0:31, both serves); the near baseline is out of the picture, so a server's position is unknown; and the pace used to separate dinks and drops from drives comes from mapped positions that are often off. More frame-precise labelled clips are the next step. With them, a classifier can be trained on the pose, ball and court features instead of hand-set thresholds.

## Players

The person model (`yolo11n.pt`, COCO person class) runs at 1280 px so that players on the far side, only 60–90 px tall in 1080p, are found. Tracker IDs that break when players cross or leave the frame are joined into one ID per player. Two pieces are joined only when all of these hold:

- They are never seen at the same time.
- They are on the same side of the net.
- They are plausibly close in time and place.
- Their shirt and shorts colours match. The colour signature includes brightness, which separates black and white shirts.

Very short sightings are folded into the matching player on the same side. **A side never has more than two players** (doubles): within one camera view, the two people seen most on each side are the players, and any other on-court piece is joined to the one whose clothes match best, as long as the two are never seen at the same moment. Someone on court alongside both players (a coach, a ball fetcher) is set aside. People standing mostly off the court (a referee, spectators) are listed separately, are not drawn on the video, and are never counted as hitters. The app shows a photo of each player so you can pick yourself; "My shots" then shows only your shots.

**Players are found by `yolo11n.pt`, body points added by `yolo11n-pose.pt` (30 Sep 2026).** On `PickleballVideo.mp4` the pose model alone often saw only 1–2 of the 4 players in the first seconds, because the far players are small; the serve at 0:03 then had no hitter. The plain person model found 93% of on-court players against 72% (see `MODEL_SETUP.md`), and with it all four players are found from about 0:04.

**Ball outside the court.** Keeping only ball detections over the court was tested (30 Sep 2026) and not adopted. With the camera just behind the baseline, every line of sight passes through the space above the near court, so a 3-D check rejected nothing. A picture-based boundary rejected 100 of 251 ball points, mostly real high balls, because a ball in the air appears above the narrower far court. Look-alikes outside play are instead removed because they do not move like a ball in flight.

A narrower rule is available but off by default (`drop_floor_balls_off_court`). It drops a detection that maps to the floor well outside the court (2 m beyond a sideline, 3 m beyond a baseline) *and* is about as big as a ball lying there would look, which is a ball on a neighbouring court or rolling away. A ball in the air maps to a floor spot much further away, where a ball would look far smaller, so it is kept. On the test clip it removed 14 of 975 candidates, but no neighbouring court is in view there, and it still cost two real shots. Turn it on for footage that shows other courts.

**Ball models compared on the test clip (30 Sep 2026)**, each alone with the pose model and the same shot rules:

| Ball detections | Detections (26 real) | Shots found | Detections that are real | Right type |
| --- | --- | --- | --- | --- |
| **pickleball-analysis `ball,person,paddle.pt` (default)** | **25** | **73%** | **76%** | **53%** |
| kpp91302 `ball_tracking.pt` | 27 | 73% | 70% | 47% |
| 5urabhi `best.pt` | 42 | 85% | 52% | 27% |
| 5urabhi, stricter swing and hit thresholds | 33 | 77% | 61% | 35% |
| default model, every frame (30 per second) | 20 | 62% | 80% | 75% |

The 5urabhi model sees the ball in more frames and finds more shots, but the extra points also create false shots and confuse the shot types. Detecting every frame helps the types but loses shots, because the hit rules are tuned for 15 samples a second. None beats the default overall, so the default is unchanged.

**Ball of a neighbouring court (30 Sep 2026).** On `PickleballVideo.mp4` the tracker followed the ball of the court to the left for most of the first rally: it was detected more steadily than the rally ball. Size cannot separate them either: the ball model's boxes are 1.1–2.9 times the real ball size, so a ball on the next court looks like one 2 m up near the near sideline. What separates them is **whose ball it is**. A flight of ball points that passes within reach of one of this court's players now counts 5 times as strong when two flights claim the same moment (`PLAYER_FLIGHT_BONUS`). Measured:

| Setting (PickleballVideo.mp4, 38 shots) | Found | Real | Right type |
| --- | --- | --- | --- |
| Before | 11 | 79% | 18% |
| Prefer this court's flights (kept) | 15 | 79% | 33% |
| ... and air contact = volley (kept) | 15 | 79% | 40% |
| Drop flights never near a player instead | 15 | 88% | 27% |

On `TestVideoKirk_REAL.mp4`, where no other court is in view, the preference changes nothing, and the volley rule raises right types from 58% to 63%.

**Analysis detail.** The upload form has two choices (`frame_mode`):

- **Standard** (default): players 10 times and the ball 15 times a second.
- **Detailed near players:** the same, plus the ball on *every* frame while it is near a player on the court, for a quarter of a second after it was last seen there. Hits happen there, so this looks closely only where it matters.

Analysing every frame of the video was tried and dropped (team decision, 30 Sep 2026): a 30-second 60 fps clip took over an hour of processor time on a 4-core laptop CPU.

## Zone time (F01, F02, F12)

The report shows **where each player on the court stood** (`metrics.zone_time`, `picklepro/zones.py`), using the zones of the requirements' metric dictionary. Distances are from the net toward the player's own baseline:

| Zone | Where |
| --- | --- |
| Kitchen | 0 to 2.13 m (inside the non-volley zone) |
| Transition | 2.13 to 5.2 m |
| Baseline | 5.2 m to the baseline (6.71 m) |
| Outside | beyond a sideline or behind the baseline (for example serving and returning) |
| At the kitchen line (F01) | the 1 m just behind the kitchen line, within the sidelines; part of transition |

- **Time measured.** Detected rallies, from 1 s before the first hit to 1.5 s after the last (rallies of 2 or more hits). With no rallies, the whole video is used, and the report says so.
- **Seen by the camera (coverage, F12).** Share of that time the player's feet were seen and mapped.
- **Estimated position** (team choice, 30 Sep 2026). When a player cannot be seen, their position is estimated, and the estimated share is always shown next to the result:
  - feet below the picture: placed from the head position and the camera, assuming a person about 1.7 m tall;
  - out of the picture and back within 8 s: a straight line between the two positions;
  - out at the start or end: the last position is kept for 3 s.

  The requirements allow only gaps up to 0.5 s to be filled, so this is a recorded change.
- **Brief detections are left out.** Someone seen for less than 15% of the time (on CHvsBJ, a false detection near the net for 2 s) gets no zone time.

**First results (30 Sep 2026, not yet checked against labels):**

| Clip | Player | Kitchen | Transition | Baseline | Outside | At kitchen line | Seen | Estimated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PickleballVideo | Near left | 2% | 68% | 3% | 27% | 46% | 75% | 25% |
| PickleballVideo | Near right | 6% | 63% | 7% | 24% | 47% | 73% | 27% |
| PickleballVideo | Far left | 6% | 45% | 12% | 37% | 13% | 71% | 17% |
| PickleballVideo | Far right | 0% | 66% | 11% | 23% | 4% | 75% | 22% |
| CHvsBJ (singles) | Near | 0% | 56% | 4% | 40% | 37% | 70% | 30% |
| CHvsBJ (singles) | Far | 0% | 18% | 14% | 68% | 8% | 100% | 0% |
| Kirk | Near left | 0% | 100% | 0% | 0% | 53% | 86% | 14% |
| Kirk | Near right | 0% | 93% | 7% | 0% | 53% | 86% | 14% |
| Kirk | Far left | 93% | 5% | 2% | 0% | 1% | 70% | 30% |
| Kirk | Far right | 91% | 3% | 0% | 7% | 1% | 89% | 11% |

Spot checks on the video agreed:
- On PickleballVideo, the near players' "outside" time is mostly serving and returning from just behind the baseline, which the head-based estimate places correctly.
- On CHvsBJ, the far player stands well behind his baseline, as singles players do.

**Known limit: Kirk's far players are not reliable.** That camera is low, so the far half of the court is squeezed into a few dozen pixels, and a few pixels of foot error is about a metre. Their feet map just in front of the far kitchen line, so the 91–93% "kitchen" should be treated as wrong, not as a finding.

**Validation still needed (gate: mean zone-share error ≤ 10 percentage points).** Mark each player's zone every few seconds on a labelled clip, then compare.

## Labelling a clip

Scores need hand labels. The web app has a labelling page at `#/label` (the **Label shots** link in the header; no account needed). The video is played from your own disk and never uploaded.

1. Open the local prototype's research result and export its JSON if useful. This file is optional; with it the page draws player boxes and tracker IDs on the video. Human player numbers in the label file are separate.
2. On `#/label`, choose the video, then the result file. To continue an earlier file, also choose it under **Existing labels**.
3. Pause on the frame where the paddle meets the ball. Use ← and → to step one frame, and Shift+← → for half a second.
4. Give each person a stable human number (1–9), then press that number and the shot's letter: **S** serve, **R** return, **D** dink, **P** drop, **I** drive, **E** reset, **U** speed-up, **C** counter, **V** volley, **L** lob, **O** overhead, **N** erne, **H** unclassified, **X** not a shot. **F** marks the selected shot as a fault, error or winner. Describe the people and explicitly map each human number to a tracker ID if an analysis result is loaded.
5. Optionally, **Add PicklePro's detections as suggestions**. They appear dashed. Use ↑ and ↓ to jump between them, fix the player or type with the keys, and press Enter to confirm or Delete to remove. Unconfirmed suggestions are never saved into the file.
6. Press **Download labels** and save the file in `eval/` next to the clip's name.

Labels are saved in the browser as you go. The downloaded file has `identity_scheme: human` and keeps each shot's exact time (`time_resolution_s: 0.1`). `picklepro.evaluate` matches a frame-precise label to the nearest unused detection within 0.35 s, independent of predicted hitter; it scores hitter identity only when a human-to-tracker mapping is supplied. Older whole-second labels stay marked `±1 s` until they are moved to their exact frame (**Move here** or **M**). Older files without an identity scheme still interpret `player` as a tracker ID.

## Historical development checks on `TestVideoKirk_REAL.mp4` (29 Sep 2026)

This is a 51 s doubles clip, 1080p at 30 fps, filmed from behind the near baseline with a slightly moving handheld camera. A team member labelled every shot to the nearest second: 26 shots, plus 2 moments that are not shots (`eval/TestVideoKirk_REAL.labels.json`). Score a result with:

```sh
python -m picklepro.evaluate result.json ../eval/TestVideoKirk_REAL.labels.json
```

A detected hit matches a label when it falls in that second (±0.35 s). The revised evaluator picks by time without preferring the labelled player; the historical development numbers below were produced by the older scorer and should not be compared directly with new runs.

Players and court on the same clip:

- **Players:** the 4 on-court players are each followed through the whole clip. The referee and one other person are set aside as off court.
- **Court:** mapped in 507 of 512 sampled frames by fitting the camera to the painted lines. Every map is checked against the lines, including the 505 frames where it was carried along with the camera's movement.
- **Ball:** 2,296 ball-like detections that never moved were removed, mostly the ball in the USA Pickleball banner logo.

| Version | Shots found (recall) | Detections that match a label (precision) | Right player | Right side of the net | Right type | Player and type both right |
| --- | --- | --- | --- | --- | --- | --- |
| First version (29 Sep, one ball model) | 62% | 76% | 63% | – | 6% | 1 of 26 |
| Side alternation, three ball models (29 Sep) | 100% | 39% (67 detections) | 69% | 85% | 23% | 5 of 26 |
| Earlier 30 Sep run: one ball model, stricter hits, no shoe-level hits | 73% | 83% (23 detections) | 53% | 89% | 42% | 1 of 26 |

The team judged the three-model version unusable: it reported many shots that were never played, for example while the ball was dead after the service fault at 0:01. These rows record past development runs; they are not a score for this integration branch.

What the earlier development run suggested:

- **Few false shots.** Most detections are real shots. The remaining false ones are a ball rolling across the far court after a point (0:33, 0:50), which in the picture passes a near player at knee height, and extra hits in fast exchanges.
- **Missed shots:** both serves at 0:15 and 0:45 (the server's feet are out of the picture), the overhead at 0:31, and some volleys in the 0:28–0:31 exchange.
- **Which side hit is usually right.** Which partner hit it is often wrong: from behind the baseline, both partners' boxes overlap the ball's path.
- **Shot types are still unreliable.** The fast volley exchange at 28–31 s is mostly right. When the serve is missed, the return becomes shot 1 and is called a serve, which shifts the names of the next shots.
- These numbers come from one clip whose labels were also used to choose the rules, so they are optimistic. More labelled clips, with times to 0.1 s, are needed for a fair measure (requirement F10).
- A pipeline run takes about 4 minutes for this clip on a 4-core CPU with one ball model (about 9 minutes with three).

**Tried and rejected.** Pooling three ball models (see the table). A 3D ball-flight fit using the camera pose recovered from the court lines: 15 samples a second and jittery boxes cannot pin down depth over short flights. Measuring the ball's true size from its colour: video compression makes every ball look about 20 px wide, near or far. Treating the ball's highest and lowest points in the picture as far and near hits: at the net, both teams contact the ball at about the same height in the picture.

## Sources consulted for the shot definitions

- [Pickleball Shots & Techniques Library (pickleball.com)](https://pickleball.com/docs/en/article/pickleball-shots-techniques-library-every-shot-you-need-to-know.html)
- [What is a reset and how to hit it (USA Pickleball)](https://usapickleball.org/pickleball-training-tips/what-is-a-reset-and-how-to-hit-it/page/2)
- [Complete Pickleball Rules Guide (pickleball.com)](https://pickleball.com/docs/en/article/complete-pickleball-rules-guide-1.html)
- [Every Pickleball Term, Explained (The Kitchen)](https://thekitchenpickle.com/pickleball-terms/)
- [Reset, block or counter (The Dink)](https://www.thedinkpickleball.com/pickleball-reset-block-or-counter-theyre-the-same-shot/)
- [Roll volley vs punch volley (The Dink)](https://www.thedinkpickleball.com/roll-volley-vs-punch-volley-which-pickleball-shot-to-hit/)
- [When to use a third-shot drop (Engage)](https://engagepickleball.com/blogs/tips/when-to-use-a-third-shot-drop)

## Capstone-notes repositories

| Repository | Used? | Why |
| --- | --- | --- |
| sumanblack666/pickleball-analysis | Court and ball weights (MIT) | Pinned revision and checksums in `picklepro/fetch_models.py`. |
| 5urabhi/Pickle_ball_tracking | Optional ball weights | No licence file; tried at the team's direction (see `ADVISER_DECISIONS.md`). Not used by default because it added false hits. `fetch_models --extra` downloads `best.pt` as `ball_5urabhi.pt`. No code is copied. |
| AndrewDettor/TrackNet-Pickleball | No | No licence file; weights hosted separately. A TrackNet-style heatmap model is the natural next step for ball recall. |
| kpp91302/Pickleball-Analytics | Optional ball weights | No licence file; tried at the team's direction. Not used by default because it added false hits. `fetch_models --extra` downloads `models/ball_tracking.pt` as `ball_kpp91302.pt`. Its court model was tested and not used: it misplaces corners when the near baseline is out of view. It has no shot detection. |
| Roboflow pickleball-detection dataset | Not yet | Candidate training or evaluation data; check its licence first. |
