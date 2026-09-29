# Adviser decisions before thesis scope is finalized

This is a decision log for the revised proposal, not a claim that the requested features exist. Record the adviser's answer, date, and resulting paper changes for each item.

| Decision | Conflict or evidence to resolve | Current implementation | Adviser decision / date |
| --- | --- | --- | --- |
| Coach access and sharing | §1.7.5 excludes coach access and live coaching; Sprint 7 and §3.5.2 include coach access and role-based access control. | Sessions and videos are private to their owner. No coach role or sharing workflow. | Pending |
| Audio coaching timing | The paper alternates between post-game analysis and “live audio coaching.” | Post-game results can read preliminary position-based practice prompts aloud using browser speech synthesis when measured player and court evidence is sufficient. There is no live coaching or spoken shot analysis. The design preview still contains sample audio. | Pending |
| Framework count and names | Objectives name three frameworks; the text describes four, while Figure 1.4.2 uses older names. | No framework taxonomy is encoded as a product claim. | Pending |
| Shot classification | Capstone 1 requires shot classes, including a “trajectory arc height” input. Ground-plane mapping from one fixed camera cannot measure ball height. | With a ball model and a mapped court, `picklepro/shots.py` estimates hits, bounces, and eight named shot types plus unclassified by explicit rules (hitter position, rally order, contact above the head, bounce before contact, ground travel rate, and a lob-height check against the far baseline). This taxonomy differs from revision 4's six classes. It is `experimental` / `not_evaluated`: checked on a synthetic rally only. It uses no arc height from the homography. | Pending: align taxonomy and precedence, or document a scope change, then evaluate on labelled footage. |
| Rally segmentation | The paper's performance language may imply rally-level metrics. | Rallies are estimated as runs of detected hits less than 3.5 s apart (`experimental`). Positioning metrics still cover the whole clip, including time between rallies. | Pending |
| Skill and play-style estimates | The proposal describes player evaluation beyond location measurements. | Neither is estimated. Positioning feedback (depth-band time, transition stays, approach time, progress between sessions) gives practice targets, not a skill rating. Sample values appear only in the design preview. | Pending: define ground truth, thresholds, and validation before making these claims. |
| Buddy-finding and player matching | These features involve player profiles and ranking criteria. | No matching or social workflow. | Pending |
| `kpp91302/Pickleball-Analytics` | The proposal names this repository as a foundation, but no license was found in the inspected repository. | Its code has not been copied. | Pending: obtain written permission or choose a licensed replacement and update citations. |
| Ultralytics YOLO | The optional detector uses Ultralytics, whose AGPL-3.0 obligations need review for intended distribution/use. | Motion detection is the default. YOLO needs a separate optional install and local weights. | Pending: licensing review and approved deployment/distribution approach. |

## Recommended paper edits after decisions

1. Make objectives, scope, Sprint 7, §3.5.2, and Figure 1.4.2 use one consistent feature list and framework names.
2. Separate implemented and measured features from proposed or experimental features. The current heatmap has only synthetic positional evaluation; it has not been evaluated on real footage.
3. State the camera geometry and evidence needed for each metric. A court homography maps points on the ground, such as estimated foot positions. It does not recover a ball's height or flight arc.
4. Specify who may access uploaded footage, any sharing or deletion rules, and consent requirements before adding coach or buddy features.

The result contract deliberately marks unsupported metrics as `not_computed` and marks a run with too little usable evidence as `insufficient_data`. Do not convert those states into successful performance claims in the paper or presentation.
