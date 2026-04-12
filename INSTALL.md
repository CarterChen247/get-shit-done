# Installing gxd into a project

Copy these files from this repo into your target project:

```
.claude/
  bin/
    gxd-tools.cjs        # helper script (required by most skills)
  commands/
    gxd-progress.md       # /gxd:progress — phase status report
    gxd-plan-phase.md     # /gxd:plan-phase (Phase 3)
    gxd-execute-phase.md  # /gxd:execute-phase (Phase 4-5)
    gxd-branch-pr.md      # /gxd:branch-pr (Phase 2)
  agents/
    gxd-researcher.md     # phase researcher (Phase 3)
    gxd-planner.md        # plan writer (Phase 3)
    gxd-checker.md        # plan verifier (Phase 3)
    gxd-executor.md       # plan executor (Phase 4)
    gxd-verifier.md       # phase verifier (Phase 4)
```

Only `gxd-tools.cjs` and `gxd-progress.md` exist today. The rest will be added in Phases 2-5.

## What this does NOT do

- No `npm install`
- No symlinks
- No git hooks
- No network calls
- No modifications to `settings.json` or `CLAUDE.md`

Every file is a plain text file you can audit before copying.
