# IMG_6291.MOV — exploratory shot-detection test

Tested 2026-09-29 with the measured worker pipeline, selected court half `near`.
The recording is 24.66 seconds, portrait 1080×1920, with an average reported
frame rate of 29.848 fps. Every visible player consented to this test.

| Candidate time | Rule-based label | Review finding |
| --- | --- | --- |
| 5.802 s | drive, near side | Candidate contact only; frame review does not establish paddle contact or shot type. |
| 9.003 s | return, far side | Candidate contact only; the `return` label depends on a likely incorrect first contact. |
| 12.005 s | dink, far side | Candidate contact only; the rule reports 0.44 m/s, insufficient evidence for a dink. |
| 14.607 s | drive, near side | Candidate contact only; visible paddle movement warrants closer frame annotation. |

The court detector found usable landmarks in 242 of 244 sampled frames. The
selected player's track covers 10.352 seconds, or 42.41% of the clip. The
pipeline grouped the four candidates into one experimental rally, but it did
not verify their true contact times or labels. Some mapped player and landing
coordinates are outside the 13.41 m court length. The computed `landed_in`
values therefore have no evidential value and must not be shown as line calls.

**Decision:** This clip tests that upload decoding, court detection, tracking,
and candidate generation run. It does not validate shot classification or
support a player baseline, skill label, success rate, forecast, recommendation,
or buddy match. Those outputs stay unavailable on the real-results screen.
Formal evaluation still needs independently annotated consented singles and
doubles recordings with enough contacts and complete rallies.
