# d. Other System Files

| Folder / file | What it is |
|---|---|
| `PicklePro_Requirements_and_Architecture_v4.pdf` | Requirements and system architecture (version 4) |
| `WORKING-CAP-PROPOSAL.pdf` | The capstone proposal |
| `PB CAPSTONE NOTES.pdf` | Project notes |
| `PROJECT_README.md` | The main README of the code: features, architecture, how each part works |
| `HANDOFF.md`, `PICKLEPRO_RUN_AND_HANDOFF.md` | How to run the system and hand it over |
| `docs/` | Detailed guides: database setup, new computer setup, video analysis pipeline, AI models, shot types, large uploads, demo walkthrough, adviser feedback and decisions, plans |
| `ai_models/` | The four AI model files the video analyzer uses (see the table below) |
| `settings_templates/` | `website.env.example` and `analyzer.env.example`: empty settings files to copy and fill in |
| `ATTRIBUTIONS.md` | Credits for third-party interface components (shadcn/ui, MIT) and photos (Unsplash); model credits are in the table below |

## AI models (`ai_models/`)

Copy these into `b_Program_Codes/Pickleball Performance Dashboard/server/models/`. If they are missing,
`start_worker.bat` downloads them by itself and checks each file's SHA-256.

| File | Used for | Source and licence |
|---|---|---|
| `yolo11n.pt` | Finding and following the players | Ultralytics YOLO11, v8.3.0 release, AGPL-3.0 |
| `yolo11n-pose.pt` | Players' body points (swings) | Ultralytics YOLO11, v8.3.0 release, AGPL-3.0 |
| `court_best.pt` | Court lines (14 points) | pickleball-analysis (sumanblack666), MIT |
| `ball,person,paddle.pt` | The ball | pickleball-analysis (sumanblack666), MIT |
