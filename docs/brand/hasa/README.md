# Hasa brand kit

Everything needed to re-skin the PicklePro app to the Hasa identity (concept 01c). This folder is reference material: the coding agent reads it but doesn't edit it.

| File | What it is |
| --- | --- |
| `CLAUDE_CODE_PROMPT.md` | The task for Claude Code: a frontend-only re-skin with hard rules against logic, API and data changes. |
| `BRAND_BOOK.html` | The visual brand book, with reference screens for the re-skin. Open in a browser. |
| `BRAND_BOOK.md` | Brand rules: name, voice, logo, mascot, app icon, colour, type, layout, and how to make the app cleaner. |
| `tokens.css` | CSS variables for light and dark themes, plus a mapping onto the shadcn theme. |
| `tokens.json` | The same tokens as data. |
| `logos/` | Vector mocks: app icon (full and small), coach, one-colour mark, the custom h. |

## How to run it

1. Open a terminal in the repo root (`ITISDEV_PICKLEPRO_APP`), ideally on a new branch, e.g. `git switch -c hasa-reskin`.
2. Start Claude Code with `claude`.
3. Say: **"Read docs/brand/hasa/CLAUDE_CODE_PROMPT.md and follow it. Start with step 1 (audit) and show me RESKIN_PLAN.md before editing."**
4. Review the plan, then let it continue step by step and review each commit.

## Status

- The name "Hasa" is not trademark-cleared yet (IPOPHL, app stores, domains). The prompt keeps it in one constant so a rename is cheap.
- The logos are clean vector mocks. Have a designer redraw final masters before launch.
- Live references: the logo canvas and the "Hasa Brand System" artifact on claude.ai.
