# Pickleball shot types and how PicklePro names them

PicklePro names every detected hit with one of the shot types below. The names follow common coaching usage and the USA Pickleball rules. The rules that assign them use only what the video measures. **The labels are experimental.** They have been scored against one hand-labelled clip (see below), and accuracy is still low. The app marks them `EXPERIMENTAL` and links each one to its moment in the video.

## Shot types

| Type | What players mean by it | How PicklePro recognises it |
| --- | --- | --- |
| Serve | Underhand first hit of a point, from outside the court behind the baseline (volley serve or drop serve). It must cross diagonally into the opposite service court and must not land in the kitchen. | 1st hit of a rally, hitter behind or within 1.2 m of their baseline (allows for foot-position error). When its bounce is seen, the serve is marked in or a fault: did not cross the net, landed in the kitchen, landed out, or did not cross diagonally. |
| Return | The receiver's reply to the serve, after it bounces; usually deep. | 2nd hit of a rally, from the back 2 m. |
| Drive | Hard, flat shot. | Fast (≥ 9 m/s) after a bounce, when no more specific rule applies. |
| Drop | Soft shot from the back or transition zone that lands near the net. This includes the third-shot drop, which is no longer a separate type. | From behind the kitchen line, slower than 9 m/s or landing in the kitchen. |
| Dink | Soft shot from the kitchen line into the opponents' kitchen. | Hitter within about 1.1 m of their kitchen line, after the bounce (a bounce was seen, or both players are at the net and the ball took at least 1.1 s to come back: a ball that slow lands in the kitchen, where it may not be volleyed), not fast. |
| Reset (block) | Soft reply that takes the pace off a hard incoming ball. | Soft reply at the kitchen line or in the transition zone when the incoming shot was fast. |
| Speed-up | Sudden fast attack out of a soft (dinking) exchange. | Fast shot (≥ 9 m/s) from the kitchen line after a soft incoming shot. |
| Counter | Volley straight back at an opponent's speed-up. | Volley at the kitchen line when the incoming shot was a speed-up. |
| Volley | Any shot hit out of the air before the ball bounces. | Both players at the kitchen line and the ball came back within 0.85 s (no time to bounce), or no bounce seen since the previous hit with good ball coverage. Fast kitchen-line exchanges ("hands battles") stay volleys. |
| Lob | High shot over the opponents, landing deep. | Ball rises more than 3.5 m above the far-baseline image line, or hangs ≥ 2 s over ≥ 8 m. |
| Overhead smash | Hard downward shot from above the head, usually off a short lob. | Contact point above the top of the hitter's box (not on the first hit). |
| Erne | Volley near the net hit with the feet outside the sideline, beside the kitchen. | Volley at the kitchen line with the hitter's feet more than 0.25 m outside a sideline. |
| Hit (unclassified) | A hit was seen but the evidence is too weak. | Court not mapped, or no next bounce or hitter to measure the shot. |

"Ground travel" is the horizontal court distance from the hitter to the next bounce (or next hitter), divided by the time taken. A single camera cannot measure the ball's height or its true 3-D speed, so this is a travel rate across the court, not a radar speed. Speeds above 28 m/s are discarded as a mismatched bounce or hitter.

**Not named, because a single video cannot show them reliably:** around-the-post (ATP) shots, spin (topspin, slice), forehand versus backhand, "tweeners", poaches (the partner's side is ambiguous in doubles), and whether a shot won the point.

## How hits are found

1. **Ball path.** Every ball model in `server/models` runs at 1280 px, 15 times per second, and their boxes are pooled. Boxes far too big for a ball, and candidates that never move (a ball printed on a banner, a lamp), are removed. The rest are linked into flights using their velocity. Only observed boxes are kept, so nothing is interpolated.
2. **Hits and bounces.** A sharp change of direction is a candidate hit. An upward kick in the image with no player in reach is a bounce. Seen from behind a baseline, a near player's box covers much of the far court in the picture, so a candidate can fit a player on either side of the net.
   **Hits alternate sides.** Every shot must cross the net, so within a rally the hitters must alternate between the near and far teams. For each candidate, PicklePro considers the closest player on each side, then picks the sequence of hits and sides that scores best: the ball turned sharply and passed close to the chosen player. Weak candidates that would break the alternation are dropped.
   The ball's apparent size is only a coarse check: detector boxes are padded and blurred to about twice the ball's true size, so size cannot tell a near ball from a far one.
3. **Not a stroke.** A ball that stays within about a third of a body height of the player for the whole half second around the "hit" is being carried, caught or bounced before a serve, so it is ignored. So is a "shot" that travels slower than 0.8 m/s.
4. **Rallies.** Hits more than 3.5 s apart start a new rally. A rally starts at its first hit from a serving position: behind or near the baseline, or, on the near side, with the player's feet below the bottom of the picture (the near baseline is often out of view). Hits before that are balls knocked back between points and are dropped. A run of hits without a serving position counts only if it has at least 4 hits. Shot numbers (serve, return, third shot) come from this, so a missed serve shifts the numbering.

## Players

The person model (`yolo11n.pt`, COCO person class) runs at 1280 px so that players on the far side, only 60–90 px tall in 1080p, are found. Tracker IDs that break when players cross or leave the frame are joined into one ID per player. Two pieces are joined only when all of these hold:

- They are never seen at the same time.
- They are on the same side of the net.
- They are plausibly close in time and place.
- Their shirt and shorts colours match. The colour signature includes brightness, which separates black and white shirts.

Very short sightings are folded into the matching player on the same side. People standing mostly off the court (a referee, spectators) are listed separately and never counted as hitters. The app shows a photo of each player so you can pick yourself; "My shots" then shows only your shots.

## Labelling a clip

Scores need hand labels. The web app has a labelling page at `#/label` (the **Label shots** link in the header; no account needed). The video is played from your own disk and never uploaded.

1. Open a session's results and press **Download result (JSON)**. This file is optional, but with it the page draws each player's box and ID on the video, so labels use the same player numbers as PicklePro.
2. On `#/label`, choose the video, then the result file. To continue an earlier file, also choose it under **Existing labels**.
3. Pause on the frame where the paddle meets the ball. Use ← and → to step one frame, and Shift+← → for half a second.
4. Press the player's number (1–9), then the shot's letter: **S** serve, **R** return, **D** dink, **P** drop, **I** drive, **E** reset, **U** speed-up, **C** counter, **V** volley, **L** lob, **O** overhead, **N** erne, **X** not a shot. **F** marks the selected shot as a fault, error or winner.
5. Optionally, **Add PicklePro's detections as suggestions**. They appear dashed. Use ↑ and ↓ to jump between them, fix the player or type with the keys, and press Enter to confirm or Delete to remove. Unconfirmed suggestions are never saved into the file.
6. Press **Download labels** and save the file in `eval/` next to the clip's name.

Labels are saved in the browser as you go. The file keeps each shot's exact time (`time_resolution_s: 0.1`). `picklepro.evaluate` matches a frame-precise label to a detection within 0.35 s. Older whole-second labels stay marked `±1 s` until they are moved to their exact frame (**Move here** or **M**).

## Accuracy on `TestVideoKirk_REAL.mp4` (29 Sep 2026)

This is a 51 s doubles clip, 1080p at 30 fps, filmed from behind the near baseline with a slightly moving handheld camera. A team member labelled every shot to the nearest second: 26 shots, plus 2 moments that are not shots (`eval/TestVideoKirk_REAL.labels.json`). Score a result with:

```sh
python -m picklepro.evaluate result.json ../eval/TestVideoKirk_REAL.labels.json
```

A detected hit matches a label when it falls in that second (±0.35 s), preferring the labelled player.

Players and court on the same clip:

- **Players:** the 4 on-court players are each followed through the whole clip. The referee and one other person are set aside as off court.
- **Court:** mapped in 507 of 512 sampled frames by fitting the camera to the painted lines. Every map is checked against the lines, including the 505 frames where it was carried along with the camera's movement.
- **Ball:** 2,296 ball-like detections that never moved were removed, mostly the ball in the USA Pickleball banner logo.

| Version | Shots found (recall) | Detections that match a label (precision) | Right player | Right side of the net | Right type | Player and type both right |
| --- | --- | --- | --- | --- | --- | --- |
| Before this work (one ball model) | 62% | 76% | 63% | – | 6% | 1 of 26 |
| Current rules, one ball model | 81% | 66% | 52% | 71% | 43% | 1 of 26 |
| **Current rules, three ball models (shipped)** | **100%** | **39%** | **69%** | **85%** | **23%** | **5 of 26** |

What this means:

- **Hits are found**, but there are many extra detections. Most fall between points, when players knock the ball back to the server, and in the dink exchange at 21–27 s, where extra hits make dinks look like fast volleys.
- **Which side hit is usually right.** Which partner hit it is often wrong: from behind the baseline, both partners' boxes overlap the ball's path.
- **Shot types are still unreliable.** The fast volley exchange at 28–31 s is mostly right. Serves are often missed because the server's feet are out of the picture.
- These numbers come from one clip whose labels were also used to choose the rules, so they are optimistic. More labelled clips, with times to 0.1 s, are needed for a fair measure (requirement F10).
- Each pipeline run takes about 9 minutes for this clip on a 4-core CPU with three ball models, compared with about 4 minutes before.

**Tried and rejected.** A 3D ball-flight fit using the camera pose recovered from the court lines: 15 samples a second and jittery boxes cannot pin down depth over short flights. Measuring the ball's true size from its colour: video compression makes every ball look about 20 px wide, near or far. Treating the ball's highest and lowest points in the picture as far and near hits: at the net, both teams contact the ball at about the same height in the picture.

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
| 5urabhi/Pickle_ball_tracking | Ball weights | No licence file; used at the team's direction (see `ADVISER_DECISIONS.md`). `fetch_models` downloads `best.pt` as `ball_5urabhi.pt`. No code is copied. |
| AndrewDettor/TrackNet-Pickleball | No | No licence file; weights hosted separately. A TrackNet-style heatmap model is the natural next step for ball recall. |
| kpp91302/Pickleball-Analytics | Ball weights | No licence file; used at the team's direction. `fetch_models` downloads `models/ball_tracking.pt` as `ball_kpp91302.pt`. Its court model was tested and not used: it misplaces corners when the near baseline is out of view. It has no shot detection. |
| Roboflow pickleball-detection dataset | Not yet | Candidate training or evaluation data; check its licence first. |
