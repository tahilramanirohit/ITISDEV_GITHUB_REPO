# Revision 4 alignment status

Basis: `PicklePro_Requirements_and_Architecture_v4.pdf`, 29 September 2026. The PDF is a proposed design and verification plan. This file records implementation evidence, not approval of its C1/C2 scheduling assumptions. An item is complete only when its behavior and required evidence both exist.

The [item-by-item audit](REV4_CHECKLIST_AUDIT.md) checks all 114 IDs. Its original tally is 10 locally met, 43 partial, 36 missing, 9 requiring external evidence, 14 planned for C2, and 2 stretch. The versioned-run work below improves several partial items but does not make them complete. None of these counts is a hosted release or real-footage accuracy claim. The linked test project was last confirmed to have only the two September 24 migrations.

## Implemented in this checkout

| Requirement area | Current evidence | Limit |
| --- | --- | --- |
| A01 accounts | Supabase email sign-up/sign-in and password recovery UI. | Hosted recovery redirect still needs an end-to-end check. |
| A02 private profile | `profiles` migration, self-only RLS, profile form for name, hand, experience, format and self-declared level. | Migration has passed local SQL tests; it is not deployed to the hosted project. |
| A03 upload attestation | Versioned, timestamped uploader consent recorded before upload; Storage rejects browser uploads without it. | This attests to all visible players' consent; research footage requires the separate ethics process. |
| C01–C04, H01–H02, G07 | Session check-in, actual start time, timing provenance, recovery and reflection forms; private uploader rows and null for missing values. | Other participants cannot enter their own data, and the current report does not place these alongside metric trends. |
| D01–D03, D06 partial, D07–D08, L01–L02 | Recording guide; resumable upload; context now includes drill; upload attaches to a session; queue states; original-file landscape 720p/30 fps gate; logging-only formats are blocked in the UI and database. | Full-court visibility checks remain. Free-plan video limit is 50 MB until a storage plan is selected. |
| F11 safety gate | Unevaluated shot labels, heatmap and positional advice are hidden from measured reports. Dev mock is separately labelled. | Real-footage evaluation has not been completed; corresponding metrics remain unavailable. |
| P02 partial, P04 partial | Atomic job claim and lease checks, private Storage RLS, five-minute signed video URLs. Migration `20260929000200` stores each reanalysis as a separate run, preserves earlier reports, and switches the session's active run only after a successful worker result. The session page shows run history and the last published report during processing. | This is local only. The worker lease still uses a worker ID rather than a per-attempt token, and run-specific media artifacts, sharing and revocation remain absent. |
| F11–F12 foundation | `metric_results` records a per-player metric definition version, validation level, quality state and optional coverage/contact denominators. It rejects an available value without a real-footage validation level. | The prototype does not populate these rows; real-footage evaluation, metric-specific quality thresholds and rally-window measurements remain necessary. |

## Still missing for the proposed C1 target

| Area | Work needed before marking complete |
| --- | --- |
| A04–A05, M01–M03 | Accepted partner invitations, per-player report grants, authorised clips, timestamped peer notes, revocation and deletion with negative access tests. Current session deletion is a browser action and has no tracked deletion job. |
| B01–B11, G02–G04, I01–I04 | Per-metric eligible baseline members and versions, numeric goals with deadline/status rules, comparable trends and evidence-linked reviewed drills. The existing goal form stores a focus and self-rating, not a numeric baseline goal. |
| D04–D06, E01–E12 | Player and corner correction UI; full-court visibility and media review beyond metadata; persistent player identities and correction history; ball tracks, rallies, contacts and bounces with evidence provenance. Current prototype metrics include time between rallies. |
| F01–F12, G01/G05/G06 | Implement the revision 4 metric dictionary on rally windows; report valid and evaluable seconds; validate each metric on labelled real footage; then expose KPIs, links and summaries only for passing metrics. |
| N01–N05 | Adult-gated opt-in buddy profile, city-level matching, request/accept, hide, block and report controls. The profile adult checkbox alone does not enable matching. |
| P01/P03/P06–P08 | Named GPU benchmark; once-only retry policy and stage failures; complete run provenance including checkpoint hashes and code revision; storage-plan decision; raw-video expiry, player keep choice and scheduled deletion. Consent currently says raw video remains until session deletion. |
| Q01–Q06, R01–R05/R07 | Ethics clearance and consented footage, frozen held-out set, labels and release gates, dependency register, manuscript corrections and dated related-system comparison. Synthetic tests do not validate accuracy. |

## Proposed C2 and optional scope

Audio/RAG, pair view and pair goals, CSV export, rally-end proximity and a player study remain planned, not implemented. The C1/C2 boundary and buddy-finder scope need an adviser decision under REV11. Live analysis, court administration, medical scoring, in/out calls and model training remain outside the stated scope.

## Verification performed locally

- Frontend typecheck, 60 Vitest tests and production build.
- Python worker suite: 100 tests.
- PostgreSQL RLS and job-lifecycle harness, including two-account isolation, upload consent, profile privacy, logging-only rejection, lease loss, versioned-run publication and legacy-report backfill.

These checks are local. The new migration and account flows need a deployment check in the chosen Supabase project. The accuracy, runtime, storage and ethics gates cannot be inferred from passing synthetic tests.
