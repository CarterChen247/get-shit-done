# Requirements: gxd Skills

**Defined:** 2026-04-12
**Core Value:** Drop 10 files into any repo and get plan → execute → verify → PR workflow with full GSD fidelity, fully owned and auditable

## v1 Requirements

### Helper Script

- [ ] **TOOL-01**: `gxd-tools.cjs` is a single flat file (~600 lines) with zero external npm dependencies
- [ ] **TOOL-02**: Script makes zero outbound network calls
- [ ] **TOOL-03**: Script never writes outside `.planning/` or `.claude/` directories
- [ ] **TOOL-04**: Script never modifies `CLAUDE.md`, `settings.json`, or creates git hooks or symlinks
- [ ] **TOOL-05**: Script handles missing `.planning/` gracefully with actionable error messages
- [ ] **TOOL-06**: `init` commands emit `@file:` redirect when output exceeds ~50KB
- [ ] **TOOL-07**: Script supports 18 core commands: init, roadmap, state, phase, config, progress, agent-skills

### Progress Skill

- [ ] **PROG-01**: `gxd:progress` reads STATE.md and ROADMAP.md to report active phase status
- [ ] **PROG-02**: Shows plan count, summary count, and UAT status for active phase
- [ ] **PROG-03**: Routes to correct next command based on project state (7 routing paths)
- [ ] **PROG-04**: No file writes — read-only skill

### Branch-PR Skill

- [ ] **PR-01**: `gxd:branch-pr` creates a clean `{branch}-pr` branch without `.planning/` phase files
- [ ] **PR-02**: Preserves structural planning files (STATE.md, ROADMAP.md, MILESTONES.md, PROJECT.md, REQUIREMENTS.md)
- [ ] **PR-03**: Handles mixed commits (app code + planning files) by cherry-picking and stripping planning dirs from index
- [ ] **PR-04**: Works with zero gxd-tools.cjs dependency — pure git

### Plan-Phase Skill

- [ ] **PLAN-01**: `gxd:plan-phase <N>` orchestrates researcher → planner → checker agent pipeline
- [ ] **PLAN-02**: Revision loop runs max 3 iterations; stalls present both artifacts to user at iteration 3
- [ ] **PLAN-03**: Planner produces PLAN.md in `.planning/phases/{NN}-{slug}/` directory
- [ ] **PLAN-04**: Checker verifies plan achieves phase goal before proceeding
- [ ] **PLAN-05**: Requirements coverage gate verifies all phase req IDs appear in plan
- [ ] **PLAN-06**: Fails loudly if required agents (gxd-planner, gxd-researcher, gxd-checker) are missing

### Execute-Phase Skill

- [ ] **EXEC-01**: `gxd:execute-phase <N>` executes plans with atomic git commits per task
- [ ] **EXEC-02**: Sequential mode (default): plans run one at a time, no worktree complexity
- [ ] **EXEC-03**: Parallel mode (opt-in): wave-based execution via git worktrees, one Task() per message
- [ ] **EXEC-04**: STATE.md and ROADMAP.md protected during worktree merges (snapshot → merge → restore)
- [ ] **EXEC-05**: Orphaned worktrees cleaned up via `git worktree prune` at startup
- [ ] **EXEC-06**: Spawns verifier agent post-execution, produces VERIFICATION.md
- [ ] **EXEC-07**: Marks phase complete in STATE.md and ROADMAP.md after verification

### Portability

- [ ] **PORT-01**: All skill files use `node ".claude/bin/gxd-tools.cjs"` (relative path, no absolute paths)
- [ ] **PORT-02**: All 10 files can be dropped into any repo's `.claude/` directory with no additional setup
- [ ] **PORT-03**: No npm install required — Node.js only (standard in dev environments)
- [ ] **PORT-04**: Skills fail with actionable error if `.planning/ROADMAP.md` not found

### Agents

- [ ] **AGNT-01**: `gxd-planner.md` agent produces PLAN.md and returns `## PLANNING COMPLETE` or `## REVISIONS NEEDED`
- [ ] **AGNT-02**: `gxd-researcher.md` agent produces RESEARCH.md for a phase
- [ ] **AGNT-03**: `gxd-checker.md` agent verifies plan quality and returns structured assessment
- [ ] **AGNT-04**: `gxd-executor.md` agent executes a single plan with atomic commits
- [ ] **AGNT-05**: `gxd-verifier.md` agent produces VERIFICATION.md assessing phase goal achievement

## v2 Requirements

### Additional Skills

- **INIT-01**: `gxd:new-project` — questioning → PROJECT.md → REQUIREMENTS.md → ROADMAP.md initialization
- **INIT-02**: `gxd:init` — scaffold `.planning/` structure for uninitialized repos
- **MISC-01**: `gxd:discuss-phase` — socratic phase exploration before planning
- **MISC-02**: `gxd:verify-work` — conversational UAT for completed phases

### Enhanced Execute

- **EXEC-08**: Code review agent integration post-execution
- **EXEC-09**: Schema drift detection after database changes

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full 30+ GSD skill suite | v1 covers the 4 most-used; expand based on real usage |
| Marketplace/npm distribution | Copy-paste is the intentional distribution model |
| Network calls in gxd-tools.cjs | Explicit security requirement — never phone home |
| Git hooks, symlinks, settings.json writes | Exact behaviors that made gstack dangerous |
| Global `~/.gxd/` config | Unnecessary complexity; per-repo config only |
| GSD-identical UX (100% parity) | Goal is same *experience*, not byte-identical output |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TOOL-01 | Phase 1 | Pending |
| TOOL-02 | Phase 1 | Pending |
| TOOL-03 | Phase 1 | Pending |
| TOOL-04 | Phase 1 | Pending |
| TOOL-05 | Phase 1 | Pending |
| TOOL-06 | Phase 1 | Pending |
| TOOL-07 | Phase 1 | Pending |
| PROG-01 | Phase 1 | Pending |
| PROG-02 | Phase 1 | Pending |
| PROG-03 | Phase 1 | Pending |
| PROG-04 | Phase 1 | Pending |
| PORT-01 | Phase 1 | Pending |
| PORT-02 | Phase 1 | Pending |
| PORT-03 | Phase 1 | Pending |
| PORT-04 | Phase 1 | Pending |
| PR-01 | Phase 2 | Pending |
| PR-02 | Phase 2 | Pending |
| PR-03 | Phase 2 | Pending |
| PR-04 | Phase 2 | Pending |
| PLAN-01 | Phase 3 | Pending |
| PLAN-02 | Phase 3 | Pending |
| PLAN-03 | Phase 3 | Pending |
| PLAN-04 | Phase 3 | Pending |
| PLAN-05 | Phase 3 | Pending |
| PLAN-06 | Phase 3 | Pending |
| AGNT-01 | Phase 3 | Pending |
| AGNT-02 | Phase 3 | Pending |
| AGNT-03 | Phase 3 | Pending |
| EXEC-01 | Phase 4 | Pending |
| EXEC-02 | Phase 4 | Pending |
| EXEC-06 | Phase 4 | Pending |
| EXEC-07 | Phase 4 | Pending |
| AGNT-04 | Phase 4 | Pending |
| AGNT-05 | Phase 4 | Pending |
| EXEC-03 | Phase 5 | Pending |
| EXEC-04 | Phase 5 | Pending |
| EXEC-05 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-12*
*Last updated: 2026-04-12 after roadmap creation*
