# Rallies and shot types (experimental)

With a ball model configured, the worker tracks the ball, finds hits and bounce candidates, splits the clip into rallies and gives each hit one shot type. Everything here is **experimental and unvalidated** until it has been compared with hand-labelled footage from the team's own camera setup (requirements F10, Q03 to Q05). The results page marks it that way.

Code: `server/picklepro/ball_track.py` (ball track), `server/picklepro/shots.py` (events, rallies and rules; all thresholds are in `RULES`), `server/picklepro/shot_eval.py` (review and evaluation).

## Camera assumption

One fixed camera **behind the near baseline**, raised on a tripod, with the whole court in view and 30 fps or more. "Near side" means the camera's side of the net. From this view:

- a hit by a near-side player sends the ball **up** the image (away from the camera) and a far-side hit sends it **down**. This is the main evidence for which side hit the ball;
- speed and arc are **image-space proxies**. Speed is image pixels per second divided by the hitter's box height, which makes it roughly comparable between near and far players, but it is not km/h. A court homography is only valid on the ground, so it is used for player feet and bounce points, never for the ball in flight (F07, [S2]).

## Pipeline

0. **Picture and camera checks.**
   - **Upright picture:** some phones save landscape recordings with sideways pixels and no rotation tag. With a court model, each rotation of a few sample frames is scored by whether the court looks upright, meaning the near baseline sits lower in the image than the far baseline. Box and person detectors are fooled by upside-down frames, but perspective is not. Frames are turned before any analysis, and the result records `video.rotation_applied_deg`. The web player turns the video the same way.
   - **Camera moves and cuts:** a thumbnail of every analyzed frame is compared with the previous one. A change above 12 grey levels, and at least 8× the clip's typical change, marks a cut. The court is located again after each cut (E02), and rallies never span one.
   - **Static false positives:** the ball model keeps up to 3 candidates per frame. A place where "a ball" sits still again and again in at least 3 different seconds (lights, reflections, a ball at rest) is ignored, and the best remaining candidate is used.
1. **Ball track (E05, E06).** The ball model runs on every frame (`PICKLEPRO_BALL_FPS`, default 30). Detections without a consistent neighbour within 0.2 s, and detections that do not move (a ball lying on the ground), are dropped. A constant-velocity Kalman filter with a backward smoothing pass fills gaps of at most 0.10 s; those samples are flagged as interpolated and never create an event by themselves.
2. **Contacts (E08).** Local velocity fits before and after each observed sample (0.2 s windows). A direction change of at least 45° next to a player box is a contact, unless one smooth curve fits the ball path around it (±0.25 s). That shape is the top of an arc or a ball curving in flight; a hit or bounce leaves a kink. The hitter is the player whose box is closest to the ball in pixels. Every box gets a minimum reach of 6% of the frame height, because far players are small. When the player hides the ball at the moment of the hit, the change is measured across the gap (up to 0.6 s) and the contact is marked hidden. The first sighting of the ball leaving a player after a pause is also a contact, which is how serves are found.
3. **Bounce candidates (E09).** A sharp drop in the ball's image-y velocity away from every player. Because each side hits once, two same-side "hits" within 1 s where the ball also lost speed are re-labelled: the first becomes a bounce candidate. These are candidates, not proof of a bounce.
4. **Rallies (E07).** Ball activity with no gap longer than 1.5 s. A rally is *complete* only when the ball was seen out of play for at least 1 s before and after it inside the clip.
5. **Shot types (F06 to F08).** One label per contact, checked in this order:

| Order | Class | Rule (pilot thresholds in `RULES`) |
| --- | --- | --- |
| 1 | serve | First contact at the start of a complete rally. With a court calibration, the server's foot must be behind the baseline, otherwise the evidence is "weak". |
| 2 | return | Second contact after an observed serve, by the other side, at least 0.5 s later. |
| 3 | overhead | Hard hit (at least 3 box heights/s) back over the net, with the ball at least 15% of the box height above the hitter's head. It must answer a high ball: the incoming ball rose at least one box height above the head, or the previous shot was a lob. |
| 4 | volley | 4th shot or later (two-bounce rule), after the other side's hit, ball observed at least 70% of the time in between with no gap over 0.15 s, and no bounce candidate. |
| 5 | dink | Soft ball (at most 3.5 box heights/s) from a hitter within 1 m of their kitchen line, landing in the opponent's kitchen, or next played by an opponent at their kitchen line. Needs a court calibration. |
| 6 | drop | Soft ball (at most 4.5 box heights/s) from further back (third-shot drop, transition reset) with the same landing evidence as a dink. Needs a court calibration. |
| 7 | drive | Fast (at least 5 box heights/s) and flat (arc ratio at most 0.35). |
| 8 | lob | High path (arc ratio at least 0.6) with at least 1 s of flight; "strong" only when a deep landing is observed. |
| 9 | unclassified | Anything else, including speeds above 16 box heights/s (about 60 mph, the fastest shots measured), which mean the ball track jumped to another object. It stays in the counts and the denominator, with the reason shown. |

**Return, overhead and drop are additions** to the revision-4 class list (serve, volley, dink, drive, lob). Record them as a scope change and a new metric version (`RULE_VERSION`), and describe the precedence in the labelling guide. `evidence` ("strong"/"weak") describes the rule evidence. It is not an accuracy probability (E11).

## Why the rules look like this (shot research, 29 September 2026)

Collected from web search results. Direct page fetches were blocked, so verify numbers against the primary documents before citing them in the paper.

- **Two-bounce rule:** the serve and the return must bounce, and so does the 3rd shot, so a volley can first happen on shot 4. The serve is diagonal, from behind the baseline, and hit below the waist. ([USA Pickleball rules summary](https://usapickleball.org/rules/summary/), [two-bounce rule](https://www.pickleheads.com/guides/two-bounce-rule-in-pickleball))
- **Speeds:** the fastest pickleball shots are about 60 mph, and dinks are typically under 10 mph ([TWU aerodynamics](https://twu.tennis-warehouse.com/learning_center/pickleball/pickleball_aerodynamics.php)). A third-shot drop from the baseline launches at about 24–36 mph and 12.5–22.5° and lands in the kitchen ([Steyn et al.](https://arxiv.org/abs/2501.00163)).
- **Shot shapes:**
  - Dink: from the kitchen line, a few inches over the net, lands in the opposite kitchen.
  - Drop / reset: same landing, but hit from the baseline or transition zone, peaking before the net.
  - Drive: fast and flat, lands deep.
  - Lob: apex about 10–15 ft, lands near the baseline, 1.5–2 s of hang time.
  - Overhead: answers a lob or pop-up, hit above the head and downward.
  - ([USA Pickleball skills](https://usapickleball.org/pickleball-skills/level-three/basics-of-the-third-shot-drop/), [lob guide](https://www.thedinkpickleball.com/the-ultimate-guide-to-lobbing-in-pickleball/))
- **Rally shape:** professional doubles rallies are often 10 or more shots, and most shots are volleys. Fast exchanges at the net take only about 0.25–0.35 s per shot, so hits by opposite sides that close together are kept as separate hits.
- **Camera advice from a commercial system:** PB Vision recommends filming at least 5 ft high with all four court corners visible. It warns that from directly behind the baseline, players hide the ball during dinks ([PB Vision framing tips](https://help.pb.vision/help/articles/1108176-video-recording-and-framing-tips)).
- **Not implemented yet:** speed-up, block, ATP and Erne. They need player pose, or sideline positions the current camera view rarely covers.

## Known limitations

These were seen on the model author's public doubles broadcast clip, which is filmed from higher and further back than the team's setup:

- The ball model found the ball in about 43% of frames. Hits during fast net exchanges were often hidden behind a player, and many became `unclassified`.
- Far-side players are small. When the player model misses one, their hit can be credited to a near-side player or missed.
- The top of a lob can appear next to a far player's head in the image and look like a far-side hit.
- A bounce just in front of the near player looks like a hit from behind the baseline. The same-side rule only fixes part of this.
- When a far player lobs a ball that was already rising in the image, there is no visible direction change from behind the baseline, so that hit can be missed.
- From a low camera, a ball in flight often appears "above the head" of the near players. The overhead rule therefore also needs a high incoming ball and a hard hit back over the net.
- In doubles, "near side" counts include the partner. Use a track id for one player, and check track IDs for swaps.

## First team clip (29 September 2026)

`testvid.mp4` is 14.7 s of indoor doubles, filmed from behind the near baseline in portrait at 368×640 and 20 fps. Automatic court calibration was good (8 landmarks, 0.05 m error). The ball was found in 132 of 293 frames (45%). Rules 0.2 found 6 hits in one truncated rally: 2 dinks (weak) and 4 unclassified. The ball path shows about 10 direction changes, so hits were missed, mainly where the ball was not detected or a player at the frame edge was not detected. Rules 0.1 labelled 4 hits "overhead"; frame review showed those were a ball at head height, the top of an arc, and a hit credited to the wrong player, which led to the 0.2 changes. The clip is too short and too narrow for the court metrics: the whole court width is not in view, and two near-side players make "near half" ambiguous.

## Tune on your own footage

1. Record a clip with consent from every visible player (Q01). Keep the final test clips unopened until the thresholds are frozen (Q02).
2. Analyze it locally:

   ```sh
   python -m picklepro.fetch_models
   python -m picklepro.cli analyze clip.mp4 --detector yolo --yolo-weights "models/ball,person,paddle.pt" \
       --ball-weights "models/ball,person,paddle.pt" --court-weights models/court_best.pt --court-half near --out result.json
   ```

3. `python -m picklepro.cli review-shots clip.mp4 result.json --out review/` saves one image per detected hit (green dots show the ball before the hit, red after) and `review/labels_template.csv`.
4. Watch the video and turn the template into labels: one row per **real** hit with `time_seconds,side,shot_class`. Delete rows that were not hits and add the hits that were missed. Double-label a subset and adjudicate disagreements (Q03).
5. `python -m picklepro.cli evaluate-shots result.json labels.csv` prints contact precision and recall (0.2 s window), hitter-side accuracy, per-class precision, recall and F1, macro F1 over classes with at least 20 labels, and the unclassified share. It also prints the pilot gate for comparison.
6. Change thresholds in `RULES`, bump `RULE_VERSION`, re-run and re-evaluate on the tuning clips only. Freeze the values before evaluating the held-out set.
