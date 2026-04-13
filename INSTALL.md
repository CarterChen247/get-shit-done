# Installing gxd into a project

Copy these files from this repo into your target project:

```
.claude/skills/
  gxd-progress/
    SKILL.md                          # /gxd-progress — phase status report
    gxd-tools.cjs                     # helper script (bundled per skill)
  gxd-plan-phase/
    SKILL.md                          # /gxd-plan-phase (Phase 3)
    gxd-tools.cjs
  gxd-execute-phase/
    SKILL.md                          # /gxd-execute-phase (Phase 4-5)
    gxd-tools.cjs
  gxd-pr-branch/
    SKILL.md                          # /gxd-pr-branch (Phase 2, no gxd-tools)
.claude/agents/
  gxd-researcher.md                   # phase researcher (Phase 3)
  gxd-planner.md                      # plan writer (Phase 3)
  gxd-checker.md                      # plan verifier (Phase 3)
  gxd-executor.md                     # plan executor (Phase 4)
  gxd-verifier.md                     # phase verifier (Phase 4)
```

Only `gxd-progress/` exists today. The rest will be added in Phases 2-5.

Each skill is self-contained — copy one folder and it works. For personal (cross-project) use, copy to `~/.claude/skills/` instead.

## What this does NOT do

- No `npm install`
- No symlinks
- No git hooks
- No network calls
- No modifications to `settings.json` or `CLAUDE.md`

Every file is a plain text file you can audit before copying.
