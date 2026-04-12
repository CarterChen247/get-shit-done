# Roadmap: gxd Skills

## Overview

Build and validate 10 portable Claude Code skill files that replicate the GSD plan → execute → verify → PR workflow. Each phase ships something runnable: the helper script and progress skill first, then branch-pr, then the full planning pipeline, then sequential execution, then parallel worktree execution. At the end, any repo with Node.js can get the full GSD experience by copying 10 files.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Helper Script + Progress** - gxd-tools.cjs read/write commands working and gxd:progress reports phase status end-to-end
- [ ] **Phase 2: Branch-PR** - gxd:branch-pr creates clean PR branches without .planning/ phase files
- [ ] **Phase 3: Plan-Phase Pipeline** - gxd:plan-phase orchestrates researcher → planner → checker and produces a verified PLAN.md
- [ ] **Phase 4: Execute-Phase Sequential** - gxd:execute-phase runs plans atomically in sequential mode and marks phase complete
- [ ] **Phase 5: Execute-Phase Parallel** - gxd:execute-phase parallel mode with wave-based git worktree execution

## Phase Details

### Phase 1: Helper Script + Progress
**Goal**: Users can run `gxd:progress` in any repo and get an accurate phase status report backed by a portable, zero-dependency helper script.
**Depends on**: Nothing (first phase)
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05, TOOL-06, TOOL-07, PROG-01, PROG-02, PROG-03, PROG-04, PORT-01, PORT-02, PORT-03, PORT-04
**Success Criteria** (what must be TRUE):
  1. `gxd-tools.cjs` runs with `node ".claude/bin/gxd-tools.cjs" <command>` from any repo root with no npm install
  2. All 18 commands (init, roadmap, state, phase, config, progress, agent-skills) return correct output against a real `.planning/` directory
  3. Script produces an actionable error message when `.planning/ROADMAP.md` is missing
  4. Running `gxd:progress` in a repo with a valid `.planning/` shows plan count, summary count, UAT status, and routes to the correct next command
  5. `gxd:progress` makes no file writes — STATE.md is unchanged after invocation
**Plans**: 4 plans

Plans:
- [ ] 01-01: Build gxd-tools.cjs read commands (roadmap get-phase, state-snapshot, find-phase, config-get, progress bar, summary-extract, audit-uat)
- [ ] 01-02: Build gxd-tools.cjs write commands (state begin-phase, state planned-phase, roadmap update-plan-progress, roadmap analyze, config-set, agent-skills, init plan-phase, init execute-phase)
- [ ] 01-03: Build gxd-tools.cjs execute commands (phase-plan-index, phase complete) and validate all 18 commands against test fixtures
- [ ] 01-04: Build gxd:progress skill — read STATE.md + ROADMAP.md, implement 7-route routing table, validate read-only behavior

### Phase 2: Branch-PR
**Goal**: Users can run `gxd:branch-pr` on a mixed-commit branch and get a clean `{branch}-pr` branch that contains only app code commits with no `.planning/` phase file history.
**Depends on**: Phase 1
**Requirements**: PR-01, PR-02, PR-03, PR-04
**Success Criteria** (what must be TRUE):
  1. Running `gxd:branch-pr` creates a `{current-branch}-pr` branch
  2. Structural planning files (STATE.md, ROADMAP.md, MILESTONES.md, PROJECT.md, REQUIREMENTS.md) are present on the PR branch
  3. Phase-specific planning files (PLAN.md, SUMMARY.md, RESEARCH.md) are absent from the PR branch history
  4. Commits that touched both app code and planning files are preserved with planning dirs stripped from the index
  5. Skill requires no gxd-tools.cjs invocation — pure git commands only
**Plans**: 3 plans

Plans:
- [ ] 02-01: Implement pure-git branch creation and structural file preservation logic
- [ ] 02-02: Implement mixed-commit cherry-pick with planning dir index stripping
- [ ] 02-03: End-to-end test on a repo with mixed commits; validate PR branch contents

### Phase 3: Plan-Phase Pipeline
**Goal**: Users can run `gxd:plan-phase <N>` and get a PLAN.md that has been researched, written, and checker-verified against the phase goal and all phase requirement IDs.
**Depends on**: Phase 1
**Requirements**: PLAN-01, PLAN-02, PLAN-03, PLAN-04, PLAN-05, PLAN-06, AGNT-01, AGNT-02, AGNT-03
**Success Criteria** (what must be TRUE):
  1. `gxd:plan-phase 1` calls gxd-researcher, then gxd-planner, then gxd-checker in sequence
  2. PLAN.md is written to `.planning/phases/{NN}-{slug}/` after a passing checker run
  3. Revision loop retries up to 3 times on checker rejection; at iteration 3 it presents both artifacts to the user instead of failing silently
  4. Skill emits a loud error and stops if any of gxd-planner, gxd-researcher, or gxd-checker agents are missing from `.claude/agents/`
  5. PLAN.md contains all requirement IDs mapped to the phase; checker gate blocks merge if any ID is absent
**Plans**: 4 plans

Plans:
- [ ] 03-01: Build gxd-researcher.md agent — produces RESEARCH.md for a given phase
- [ ] 03-02: Build gxd-planner.md agent — produces PLAN.md, returns PLANNING COMPLETE or REVISIONS NEEDED
- [ ] 03-03: Build gxd-checker.md agent — verifies plan quality and requirement coverage, returns structured assessment
- [ ] 03-04: Build gxd:plan-phase orchestrator skill — agent-missing guard, researcher → planner → checker loop with 3-iteration stall detection, requirements coverage gate

### Phase 4: Execute-Phase Sequential
**Goal**: Users can run `gxd:execute-phase <N>` in sequential mode and have each plan executed with atomic commits, followed by a verifier-produced VERIFICATION.md and phase completion recorded in STATE.md and ROADMAP.md.
**Depends on**: Phase 3
**Requirements**: EXEC-01, EXEC-02, EXEC-06, EXEC-07, AGNT-04, AGNT-05
**Success Criteria** (what must be TRUE):
  1. `gxd:execute-phase <N>` runs each plan in the phase one at a time, producing an atomic git commit per task
  2. After all plans complete, gxd-verifier agent runs and writes VERIFICATION.md to the phase directory
  3. STATE.md `Status` field and ROADMAP.md phase checkbox are both updated to Complete after verification
  4. The skill works with zero worktree involvement — no `git worktree` commands in sequential mode
**Plans**: 3 plans

Plans:
- [ ] 04-01: Build gxd-executor.md agent — executes a single plan file with atomic commits per task
- [ ] 04-02: Build gxd-verifier.md agent — assesses phase goal achievement and writes VERIFICATION.md
- [ ] 04-03: Build gxd:execute-phase skill (sequential mode) — plan iteration loop, executor invocation, verifier invocation, STATE.md + ROADMAP.md completion update

### Phase 5: Execute-Phase Parallel
**Goal**: Users can opt into parallel execution mode and have independent plans run simultaneously in git worktrees, with STATE.md and ROADMAP.md protected across the merge and orphaned worktrees cleaned up automatically.
**Depends on**: Phase 4
**Requirements**: EXEC-03, EXEC-04, EXEC-05
**Success Criteria** (what must be TRUE):
  1. Passing `--parallel` (or equivalent flag) to `gxd:execute-phase` triggers wave-based worktree execution with one Task() per message
  2. STATE.md and ROADMAP.md contents are identical before and after worktree merge (snapshot → merge → restore pattern)
  3. Stale worktrees from a previous interrupted run are pruned via `git worktree prune` before new worktrees are created
**Plans**: 3 plans

Plans:
- [ ] 05-01: Implement wave-based worktree creation and parallel Task() dispatch (one per message, run_in_background: true)
- [ ] 05-02: Implement STATE.md/ROADMAP.md snapshot-merge-restore protection
- [ ] 05-03: Implement orphaned worktree detection and prune on startup; end-to-end parallel execution test

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Helper Script + Progress | 0/4 | Not started | - |
| 2. Branch-PR | 0/3 | Not started | - |
| 3. Plan-Phase Pipeline | 0/4 | Not started | - |
| 4. Execute-Phase Sequential | 0/3 | Not started | - |
| 5. Execute-Phase Parallel | 0/3 | Not started | - |
