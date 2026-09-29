# Pickleball shot types and how PicklePro names them

PicklePro names every detected hit with one of the shot types below. The names follow common coaching usage and the USA Pickleball rules. The rules that assign them use only what the video measures. **The labels are experimental.** They have not been checked against hand-labelled footage, so the app marks them `EXPERIMENTAL` and links each one to its moment in the video.

## Shot types

| Type | What players mean by it | How PicklePro recognises it |
| --- | --- | --- |
| Serve | Underhand first hit of a point, from behind the baseline (volley serve or drop serve). | 1st hit of a rally, hitter within 1.2 m of their baseline. |
| Return | The receiver's reply to the serve, after it bounces; usually deep. | 2nd hit of a rally, from the back 2 m. |
| Third-shot drop | Soft 3rd shot from the back into the opponents' kitchen so the serving team can move up. | 3rd hit, from behind the kitchen area, soft (< 6 m/s ground travel) or landing in the kitchen. |
| Third-shot drive | Hard, low 3rd shot instead of a drop. | 3rd hit from the back, fast (≥ 9 m/s). |
| Drive | Hard, flat shot. | Fast (≥ 9 m/s) after a bounce, when no more specific rule applies. |
| Drop | Soft shot from the back or transition zone that lands near the net. | From behind the kitchen line, slower than 9 m/s or landing in the kitchen. |
| Dink | Soft shot from the kitchen line into the opponents' kitchen. | Hitter within about 1.1 m of their kitchen line, soft (< 6 m/s). |
| Reset (block) | Soft reply that takes the pace off a hard incoming ball. | Soft reply at the kitchen line or in the transition zone when the incoming shot was fast. |
| Speed-up | Sudden fast attack out of a soft (dinking) exchange. | Fast shot from the kitchen line after a soft incoming shot. |
| Counter | Fast reply, out of the air, to a fast incoming ball (hands battle). | Fast volley at the kitchen line after a fast incoming shot. |
| Volley | Any shot hit out of the air before the ball bounces. | No bounce seen since the previous hit (with good ball coverage), when no rule above applies. |
| Lob | High shot over the opponents, landing deep. | Ball rises more than 3.5 m above the far-baseline image line, or hangs ≥ 2 s over ≥ 8 m. |
| Overhead smash | Hard downward shot from above the head, usually off a short lob. | Contact point above the top of the hitter's box (not on the first hit). |
| Erne | Volley near the net hit with the feet outside the sideline, beside the kitchen. | Volley at the kitchen line with the hitter's feet more than 0.25 m outside a sideline. |
| Hit (unclassified) | A hit was seen but the evidence is too weak. | Court not mapped, or no next bounce or hitter to measure the shot. |

"Ground travel" is the horizontal court distance from the hitter to the next bounce (or next hitter), divided by the time taken. A single camera cannot measure the ball's height or its true 3-D speed, so this is a travel rate across the court, not a radar speed. Speeds above 28 m/s are discarded as a mismatched bounce or hitter.

**Not named, because a single video cannot show them reliably:** around-the-post (ATP) shots, spin (topspin, slice), forehand versus backhand, "tweeners", poaches (the partner's side is ambiguous in doubles), and whether a shot won the point.

## How hits are found

1. **Ball path.** The ball model runs at 1280 px, 15 times per second. Candidates that never move (a ball printed on a banner, a lamp) are removed. The rest are linked into flights using their velocity. Only observed boxes are kept, so nothing is interpolated.
2. **Hits and bounces.** A sharp change of direction near a player is a hit. An upward kick in the image with no player in reach is a bounce. The ball's apparent size must fit a ball beside that player; this stops a far-court ball from "touching" a near player in the image.
3. **Not a stroke.** A ball that stays within about a third of a body height of the player for the whole half second around the "hit" is being carried, caught or bounced before a serve, so it is ignored. So is a "shot" that travels slower than 0.8 m/s.
4. **Rallies.** Hits more than 3.5 s apart start a new rally. Shot numbers (serve, return, third shot) come from this, so a missed serve shifts the numbering.

## Players

The person model (`yolo11n.pt`, COCO person class) runs at 1280 px so that players on the far side, only 60–90 px tall in 1080p, are found. Tracker IDs that break when players cross or leave the frame are joined into one ID per player. Two pieces are joined only when all of these hold:

- They are never seen at the same time.
- They are on the same side of the net.
- They are plausibly close in time and place.
- Their shirt and shorts colours match. The colour signature includes brightness, which separates black and white shirts.

Very short sightings are folded into the matching player on the same side. People standing mostly off the court (a referee, spectators) are listed separately and never counted as hitters. The app shows a photo of each player so you can pick yourself; "My shots" then shows only your shots.

## Check on `TestVideoKirk_REAL.mp4` (29 Sep 2026)

This is a 51 s doubles clip, 1080p at 30 fps, filmed from behind the near baseline with a slightly moving handheld camera. The whole pipeline took about 4 minutes on a 4-core CPU.

- **Players:** exactly 4 on-court players, each followed through the whole clip. The referee was split into 4 pieces, all correctly set aside as off court. Before this work, the same clip produced 21 track IDs and the far-side players were missed for the first 12 seconds.
- **Court:** mapped in 508 of 512 sampled frames. Before, it was 331; the difference is 177 frames where the court map was carried over from up to 1 s earlier.
- **Ball:** 531 fixed ball-like detections were removed, mostly the ball in the USA Pickleball banner logo.
- **Shots:** each detected hit was drawn on its video frame and inspected by eye, without frame-accurate labels.
  - The rallies at 18–35 s and 46–51 s read as plausible sequences: drop, drive, reset, speed-up, counter, volley, third-shot drop. The ball was beside the named hitter.
  - Most between-point ball handling is now rejected. A few borderline moments remain, labelled "Hit" (unclassified) or "Drive".
  - This is not an accuracy measurement. Recall, precision and per-type accuracy need frame-labelled clips; see requirement F10 in the revision-4 specification.

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
| 5urabhi/Pickle_ball_tracking | Idea only | No licence file, so no code or weights are copied. Its Kalman-filter ball smoothing inspired the independent velocity-gated linking in `ball_tracking.py`. |
| AndrewDettor/TrackNet-Pickleball | No | No licence file; weights hosted separately. A TrackNet-style heatmap model is the natural next step for ball recall. |
| kpp91302/Pickleball-Analytics | No | No licence (see `CV_REFERENCE_REPO_EVALUATION.md`). |
| Roboflow pickleball-detection dataset | Not yet | Candidate training or evaluation data; check its licence first. |
