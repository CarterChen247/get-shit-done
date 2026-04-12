#!/usr/bin/env bash
# gxd-validate.sh — Validate all 18 gxd-tools commands against a fixture directory.
# Usage: bash .claude/bin/gxd-validate.sh
# Exit 0 if all tests pass, exit 1 if any fail.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GXD_TOOLS="$REPO_ROOT/.claude/skills/gxd-progress/gxd-tools.cjs"

if [ ! -f "$GXD_TOOLS" ]; then
  echo "ERROR: gxd-tools.cjs not found at $GXD_TOOLS" >&2
  exit 1
fi

# ─── Create fixture directory with trap cleanup ───────────────────────────────
FIXTURE=$(mktemp -d)
trap 'rm -rf "$FIXTURE"' EXIT

mkdir -p "$FIXTURE/.planning/phases/01-test-phase"

# ─── Write fixture STATE.md (YAML frontmatter inside heredoc, not as script fence) ──
cat > "$FIXTURE/.planning/STATE.md" << 'STATEFILE'
---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: test-milestone
status: executing
stopped_at: Phase 1 Test Phase
last_updated: "2026-04-12T00:00:00.000Z"
last_activity: 2026-04-12
progress:
  total_phases: 2
  completed_phases: 0
  total_plans: 3
  completed_plans: 1
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Test fixture for gxd-validate.sh
**Current focus:** Phase 1 — Test Phase

## Current Position

Phase: 1 of 2 (Test Phase)
Plan: 1 of 3 in current phase
Status: Executing
Last activity: 2026-04-12

Progress: [███░░░░░░░] 33%

## Performance Metrics

**Velocity:**

- Total plans completed: 1
- Average duration: -

## Accumulated Context

### Decisions

- [Init]: Use fixture directory for validation testing

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-04-12T00:00:00.000Z
Stopped at: Phase 1 Test Phase
Resume file: None
STATEFILE

# ─── Write fixture ROADMAP.md ────────────────────────────────────────────────
cat > "$FIXTURE/.planning/ROADMAP.md" << 'ROADMAPFILE'
# Roadmap: Fixture Project

## Overview

Test fixture for gxd-validate.sh.

## Phases

- [ ] **Phase 1: Test Phase** - First test phase
- [ ] **Phase 2: Second Phase** - Second test phase

## Phase Details

### Phase 1: Test Phase
**Goal**: Validate all gxd-tools commands.
**Depends on**: Nothing (first phase)
**Requirements**: TOOL-01
**Success Criteria** (what must be TRUE):
  1. All commands return valid output
**Plans**: 1 plan

Plans:
- [ ] 01-01: First plan in test phase

### Phase 2: Second Phase
**Goal**: Test the second phase slot.
**Depends on**: Phase 1
**Requirements**: TOOL-02
**Success Criteria** (what must be TRUE):
  1. Phase 2 executes after Phase 1
**Plans**: 2 plans

Plans:
- [ ] 02-01: First plan in second phase
- [ ] 02-02: Second plan in second phase

## Progress Table

| Phase | Name | Summaries | Status | Date |
|-------|------|-----------|--------|------|
| 1. Test Phase | Test Phase | 0/1 | Planned     |  |
| 2. Second Phase | Second Phase | 0/2 | Planned     |  |
ROADMAPFILE

# ─── Write fixture config.json ────────────────────────────────────────────────
cat > "$FIXTURE/.planning/config.json" << 'CONFIGFILE'
{"commit_docs": true}
CONFIGFILE

# ─── Write fixture PROJECT.md ─────────────────────────────────────────────────
cat > "$FIXTURE/.planning/PROJECT.md" << 'PROJECTFILE'
# Test Project

Test fixture project for gxd-validate.sh.
PROJECTFILE

# ─── Write fixture PLAN.md ────────────────────────────────────────────────────
cat > "$FIXTURE/.planning/phases/01-test-phase/01-01-PLAN.md" << 'PLANFILE'
---
phase: 01-test-phase
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
---

# Test Plan 01

This is a test plan for validation purposes.
PLANFILE

# ─── Write fixture SUMMARY.md ─────────────────────────────────────────────────
cat > "$FIXTURE/.planning/phases/01-test-phase/01-01-SUMMARY.md" << 'SUMMARYFILE'
---
phase: 01-test-phase
plan: 01
one_liner: "Test plan executed successfully"
status: complete
---

# Test Summary 01

Test summary for validation purposes.
SUMMARYFILE

# ─── Test helpers ─────────────────────────────────────────────────────────────
PASS_COUNT=0
FAIL_COUNT=0
FAILURES=""

run_test_contains() {
  local name="$1"
  local expected="$2"
  shift 2
  local output
  output=$("$@" 2>&1) || true
  if echo "$output" | grep -qF "$expected"; then
    echo "PASS: $name"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "FAIL: $name"
    echo "  Expected: $expected"
    echo "  Got: $(echo "$output" | head -5)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAILURES="${FAILURES}\n  - $name"
  fi
}

run_test_not_contains() {
  local name="$1"
  local unexpected="$2"
  shift 2
  local output
  output=$("$@" 2>&1) || true
  if ! echo "$output" | grep -qF "$unexpected"; then
    echo "PASS: $name"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "FAIL: $name"
    echo "  Should NOT contain: $unexpected"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAILURES="${FAILURES}\n  - $name"
  fi
}

echo ""
echo "=== gxd-tools validation: all 18 commands ==="
echo ""

# ─── Read commands (7) ────────────────────────────────────────────────────────
echo "--- Read commands ---"

run_test_contains "roadmap get-phase" "Test Phase" \
  node "$GXD_TOOLS" --cwd "$FIXTURE" roadmap get-phase 1

run_test_contains "state-snapshot" "frontmatter" \
  node "$GXD_TOOLS" --cwd "$FIXTURE" state-snapshot

run_test_contains "find-phase" '"exists": true' \
  node "$GXD_TOOLS" --cwd "$FIXTURE" find-phase 1

run_test_contains "config-get" '"value"' \
  node "$GXD_TOOLS" --cwd "$FIXTURE" config-get commit_docs

run_test_contains "progress bar" "[" \
  node "$GXD_TOOLS" --cwd "$FIXTURE" progress bar

run_test_contains "summary-extract" "one_liner" \
  node "$GXD_TOOLS" --cwd "$FIXTURE" summary-extract "$FIXTURE/.planning/phases/01-test-phase/01-01-SUMMARY.md"

run_test_contains "audit-uat" "total_files" \
  node "$GXD_TOOLS" --cwd "$FIXTURE" audit-uat

# ─── Write commands (8) ───────────────────────────────────────────────────────
echo ""
echo "--- Write commands ---"

run_test_contains "config-set" '"updated": true' \
  node "$GXD_TOOLS" --cwd "$FIXTURE" config-set commit_docs false

run_test_contains "config-get --raw" "false" \
  node "$GXD_TOOLS" --cwd "$FIXTURE" config-get commit_docs --raw

run_test_contains "roadmap analyze" '"total_phases"' \
  node "$GXD_TOOLS" --cwd "$FIXTURE" roadmap analyze

run_test_contains "init plan-phase" '"phase_dir"' \
  node "$GXD_TOOLS" --cwd "$FIXTURE" init plan-phase 1

run_test_contains "init execute-phase" '"plans"' \
  node "$GXD_TOOLS" --cwd "$FIXTURE" init execute-phase 1

run_test_contains "agent-skills planner" '"agent_type"' \
  node "$GXD_TOOLS" --cwd "$FIXTURE" agent-skills planner

run_test_contains "state planned-phase" '"updated": true' \
  node "$GXD_TOOLS" --cwd "$FIXTURE" state planned-phase --phase 1 --plans 3

run_test_contains "state begin-phase" '"updated": true' \
  node "$GXD_TOOLS" --cwd "$FIXTURE" state begin-phase --phase 1 --name "Test Phase" --plans 3

# ─── Execute commands (2) ─────────────────────────────────────────────────────
echo ""
echo "--- Execute commands ---"

run_test_contains "phase-plan-index" '"plan_count"' \
  node "$GXD_TOOLS" --cwd "$FIXTURE" phase-plan-index 1

# Create a second PLAN.md + SUMMARY.md so all plans have summaries before testing phase complete
cat > "$FIXTURE/.planning/phases/01-test-phase/01-02-PLAN.md" << 'PLAN2FILE'
---
phase: 01-test-phase
plan: 02
type: execute
wave: 2
depends_on: [01-01]
autonomous: true
---

# Test Plan 02

Second test plan for validation.
PLAN2FILE

cat > "$FIXTURE/.planning/phases/01-test-phase/01-02-SUMMARY.md" << 'SUMMARY2FILE'
---
phase: 01-test-phase
plan: 02
one_liner: "Second test plan executed"
status: complete
---

# Test Summary 02

Second test summary for validation.
SUMMARY2FILE

run_test_contains "phase complete" '"completed": true' \
  node "$GXD_TOOLS" --cwd "$FIXTURE" phase complete 1

# ─── Init progress (1) ────────────────────────────────────────────────────────
echo ""
echo "--- Init progress ---"

run_test_contains "init progress" '"roadmap_exists": true' \
  node "$GXD_TOOLS" --cwd "$FIXTURE" init progress

# ─── Error handling (2) ───────────────────────────────────────────────────────
echo ""
echo "--- Error handling ---"

run_test_contains "missing .planning/ error" ".planning/" \
  node "$GXD_TOOLS" --cwd /tmp roadmap get-phase 1

# init progress with missing roadmap returns roadmap_exists: false (no crash)
run_test_contains "init progress missing roadmap" '"roadmap_exists": false' \
  node "$GXD_TOOLS" --cwd /tmp init progress

# ─── Security checks (2) ──────────────────────────────────────────────────────
echo ""
echo "--- Security checks ---"

# Check for network module requires
if grep -qE "require\(['\"]https?['\"]|require\(['\"]net['\"]|require\(['\"]dgram['\"]" "$GXD_TOOLS"; then
  echo "FAIL: no network modules"
  echo "  Found network module require() in gxd-tools.cjs"
  FAIL_COUNT=$((FAIL_COUNT + 1))
  FAILURES="${FAILURES}\n  - no network modules"
else
  echo "PASS: no network modules"
  PASS_COUNT=$((PASS_COUNT + 1))
fi

# Check for home directory references
if grep -qE "os\.homedir\(\)|~/\.gxd" "$GXD_TOOLS"; then
  echo "FAIL: no home directory references"
  echo "  Found home directory reference in gxd-tools.cjs"
  FAIL_COUNT=$((FAIL_COUNT + 1))
  FAILURES="${FAILURES}\n  - no home directory references"
else
  echo "PASS: no home directory references"
  PASS_COUNT=$((PASS_COUNT + 1))
fi

# ─── Results summary ──────────────────────────────────────────────────────────
TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo ""
echo "=== Results: $PASS_COUNT passed, $FAIL_COUNT failed (All 18 commands + 4 extra checks = $TOTAL total) ==="

if [ $FAIL_COUNT -gt 0 ]; then
  echo ""
  echo "Failed tests:"
  printf "%b\n" "$FAILURES"
  exit 1
fi

exit 0
