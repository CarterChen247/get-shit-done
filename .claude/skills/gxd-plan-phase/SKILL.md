---
name: gxd-plan-phase
description: Plan a phase — orchestrates researcher, planner, and checker agents to produce verified PLAN.md files
argument-hint: "<phase_number>"
user-invocable: true
disable-model-invocation: true
allowed-tools:
  - Bash
  - Read
  - Task
  - AskUserQuestion
---

<purpose>
Orchestrate the plan-phase pipeline: validate agents exist, run researcher to produce RESEARCH.md,
run planner to produce PLAN.md, run checker to verify quality. Revision loop up to 3 iterations
on checker rejection with stall detection.
</purpose>

<process>

<step name="parse_args">
Parse and validate the phase number argument:

```bash
PHASE_NUM="$ARGUMENTS"
if [ -z "$PHASE_NUM" ]; then
  echo "ERROR: Phase number required. Usage: gxd:plan-phase <N>"
  exit 1
fi

# Validate phase number is a positive integer (prevent injection)
if ! echo "$PHASE_NUM" | grep -qE '^[0-9]+$'; then
  echo "ERROR: Phase number must be a positive integer, got '$PHASE_NUM'"
  exit 1
fi

PADDED_PHASE=$(printf "%02d" "$PHASE_NUM")
```
</step>

<step name="check_agents">
Check all 3 required agents exist BEFORE doing any work. Emit a loud error and stop if any are missing.

```bash
check_agent() {
  local TYPE="$1"
  local RESULT
  RESULT=$(node ".claude/bin/gxd-tools.cjs" agent-skills "$TYPE" 2>/dev/null)
  echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('all_present','false'))" 2>/dev/null || echo "false"
}

RESEARCHER_OK=$(check_agent researcher)
PLANNER_OK=$(check_agent planner)
CHECKER_OK=$(check_agent checker)

if [ "$RESEARCHER_OK" != "True" ] || [ "$PLANNER_OK" != "True" ] || [ "$CHECKER_OK" != "True" ]; then
  echo "ERROR: Required agents missing from .claude/agents/:"
  [ "$RESEARCHER_OK" != "True" ] && echo "  - gxd-researcher.md"
  [ "$PLANNER_OK" != "True" ]   && echo "  - gxd-planner.md"
  [ "$CHECKER_OK" != "True" ]   && echo "  - gxd-checker.md"
  echo ""
  echo "Add the missing agent files and re-run gxd:plan-phase."
  exit 1
fi

echo "All required agents present. Proceeding."
```

If ANY agent is missing: display the error and STOP. Do not proceed to init or research.
</step>

<step name="init_phase">
Initialize the phase context using gxd-tools:

```bash
INIT=$(node ".claude/bin/gxd-tools.cjs" init plan-phase "$PHASE_NUM")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi

PHASE_DIR=$(echo "$INIT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('phase_dir') or '')" 2>/dev/null || echo "")
PHASE_NAME=$(echo "$INIT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('phase_name') or '')" 2>/dev/null || echo "")
PHASE_SLUG=$(echo "$INIT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('phase_slug') or '')" 2>/dev/null || echo "")
HAS_RESEARCH=$(echo "$INIT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('has_research','false'))" 2>/dev/null || echo "false")
```

If PHASE_DIR is empty, create it and set the variable:

```bash
if [ -z "$PHASE_DIR" ]; then
  PHASE_DIR=".planning/phases/${PADDED_PHASE}-${PHASE_SLUG}"
  mkdir -p "$PHASE_DIR"
  echo "Created phase directory: $PHASE_DIR"
fi
```
</step>

<step name="extract_requirements">
Extract requirement IDs for this phase from ROADMAP.md:

```bash
PHASE_SECTION=$(node ".claude/bin/gxd-tools.cjs" roadmap get-phase "$PHASE_NUM" 2>/dev/null || echo "")
REQ_IDS=$(echo "$PHASE_SECTION" | grep "^\*\*Requirements\*\*\|^\*\*Requirements:\*\*" | sed 's/\*\*Requirements:\*\*//;s/\*\*Requirements\*\*://;s/\[//g;s/\]//g;s/^[[:space:]]*//')
```

If REQ_IDS is empty, warn but continue (some phases may not have explicit IDs):

```bash
if [ -z "$REQ_IDS" ]; then
  echo "WARNING: No requirement IDs found in ROADMAP.md for phase $PHASE_NUM. Proceeding without explicit requirement IDs."
fi
```
</step>

<step name="run_researcher">
Skip this step if `HAS_RESEARCH` is `True` — RESEARCH.md already exists for this phase.

```bash
if [ "$HAS_RESEARCH" = "True" ]; then
  echo "Existing RESEARCH.md found for phase $PHASE_NUM — skipping researcher."
else
  echo "Running researcher for phase $PHASE_NUM..."
fi
```

If no existing research, spawn the researcher agent via Task():

```
Task(
  prompt="Research Phase {PHASE_NUM}: {PHASE_NAME}

<files_to_read>
- .planning/ROADMAP.md
- .planning/REQUIREMENTS.md
</files_to_read>

Phase number: {PHASE_NUM}
Phase description: {PHASE_SECTION}
Requirement IDs: {REQ_IDS}
Output path: {PHASE_DIR}/{PADDED_PHASE}-RESEARCH.md

Produce RESEARCH.md for this phase.",
  subagent_type="gxd-researcher",
  description="Research Phase {PHASE_NUM}"
)
```

Check the researcher return value:
- If it contains `## RESEARCH COMPLETE`: continue to run_planner.
- If it contains `## RESEARCH BLOCKED`: display the blocker reason, then use AskUserQuestion:
  "Research for phase {PHASE_NUM} is blocked. Review the blocker above. Options:
   (a) Continue without research — planner will work from ROADMAP.md only
   (b) Abort — resolve the blocker and re-run gxd:plan-phase"

  If user selects (b): stop.
</step>

<step name="run_planner">
Spawn the planner agent via Task():

```
Task(
  prompt="Plan Phase {PHASE_NUM}: {PHASE_NAME}

<files_to_read>
- .planning/ROADMAP.md
- .planning/REQUIREMENTS.md
- {PHASE_DIR}/{PADDED_PHASE}-RESEARCH.md
</files_to_read>

Phase number: {PHASE_NUM}
Padded phase: {PADDED_PHASE}
Phase directory: {PHASE_DIR}
Phase description: {PHASE_SECTION}
Requirement IDs: {REQ_IDS}

Produce PLAN.md files for this phase.",
  subagent_type="gxd-planner",
  description="Plan Phase {PHASE_NUM}"
)
```

Verify the planner return value:
- If it contains `## PLANNING COMPLETE`: continue to revision_loop.
- If it contains `## REVISIONS NEEDED`: treat as unexpected on first pass — display the issues and use AskUserQuestion:
  "The planner self-rejected its output (## REVISIONS NEEDED). This is unusual on the first pass.
   Options: (a) Re-run the planner, (b) Proceed to checker anyway, (c) Abort"
</step>

<step name="revision_loop">
Run the checker and loop with planner revisions up to 3 times.

Initialize counters:
```
prev_issue_count = Infinity  # (use a large number like 999999 in bash)
iteration = 0
```

LOOP (repeat until exit condition):

**1. Spawn the checker agent:**

```
Task(
  prompt="Check Phase {PHASE_NUM} plans

<files_to_read>
- .planning/ROADMAP.md
{list all PLAN.md files found in PHASE_DIR}
</files_to_read>

Phase directory: {PHASE_DIR}
Phase requirement IDs: {REQ_IDS}
Phase goal: {extract goal from PHASE_SECTION}

Verify all plans achieve the phase goal.",
  subagent_type="gxd-checker",
  description="Check Phase {PHASE_NUM} plans"
)
```

**2. Parse checker return value:**
- If starts with `## VERIFICATION PASSED`: plans accepted. Exit loop. Go to complete step.
- If starts with `## ISSUES FOUND`: continue to step 3.

**3. Increment iteration:**
```bash
iteration=$((iteration + 1))
```

**4. Check iteration cap (max 3):**
```bash
if [ "$iteration" -gt 3 ]; then
  echo "Checker found issues after 3 revision attempts."
  echo "--- Checker output ---"
  echo "{CHECKER_OUTPUT}"
  echo "--- Current PLAN.md files ---"
  # Display plan content here
fi
```
Use AskUserQuestion:
"The checker found issues after 3 revision attempts. Review the plans and checker feedback above.
 Options: (a) Proceed anyway — accept plans with remaining issues, (b) Adjust approach manually — discuss a different approach"

STOP loop regardless of answer. If (a): go to complete step. If (b): discuss with user.

**5. Parse issue count from checker output:**
```bash
current_issue_count=$(echo "$CHECKER_OUTPUT" | grep -c "severity:")
```

**6. Stall detection — check if issue count is not decreasing:**
```bash
if [ "$current_issue_count" -ge "$prev_issue_count" ]; then
  echo "Revision loop stalled (issue count not decreasing: was ${prev_issue_count}, now ${current_issue_count})."
fi
```
Use AskUserQuestion:
"Revision loop stalled — issue count not decreasing (was {prev_issue_count}, now {current_issue_count}).
 Options: (a) Proceed anyway — accept plans with remaining issues, (b) Adjust approach manually"

STOP loop regardless of answer. Apply same logic as step 4.

**7. Update prev_issue_count:**
```bash
prev_issue_count="$current_issue_count"
```

**8. Display revision progress:**
```
Revision iteration {iteration}/3 -- {blocker_count} blockers, {warning_count} warnings
```

Where:
```bash
blocker_count=$(echo "$CHECKER_OUTPUT" | grep -c 'severity:.*blocker')
warning_count=$(echo "$CHECKER_OUTPUT" | grep -c 'severity:.*warning')
```

**9. Re-spawn planner with checker feedback:**

Extract the YAML issues block from checker output (everything after `### Issues` heading).

```
Task(
  prompt="Revise Phase {PHASE_NUM} plans

<files_to_read>
- .planning/ROADMAP.md
- .planning/REQUIREMENTS.md
- {PHASE_DIR}/{PADDED_PHASE}-RESEARCH.md
{list all current PLAN.md files in PHASE_DIR}
</files_to_read>

<checker_issues>
The issues below are in YAML format. Each has: dimension, severity, description, fix_hint.
Address ALL BLOCKER issues. Address WARNING issues where feasible.

{YAML issues block from checker output — passed verbatim}
</checker_issues>

<revision_instructions>
Address ALL BLOCKER and WARNING issues identified above.
- For each BLOCKER: make the required change
- For each WARNING: address or explain why it's acceptable
- Do NOT introduce new issues while fixing existing ones
- Preserve all content not flagged by the checker
This is revision iteration {iteration} of max 3. Previous iteration had {prev_issue_count} issues.
You must reduce the count or the loop will terminate.
Re-write the PLAN.md files and return ## PLANNING COMPLETE.
</revision_instructions>",
  subagent_type="gxd-planner",
  description="Revise Phase {PHASE_NUM} plans (iteration {iteration})"
)
```

**10. Go to LOOP step 1.**
</step>

<step name="complete">
After checker returns `## VERIFICATION PASSED`, display success summary:

```bash
PLAN_FILES=$(ls -1 "$PHASE_DIR"/*-PLAN.md 2>/dev/null)
```

Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Phase {PHASE_NUM} Planning Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Plans created in {PHASE_DIR}/:
{list all PLAN.md files with their titles — read <objective> from each}

Requirement coverage: {REQ_IDS} — all covered.

Next: Run gxd:execute-phase {PHASE_NUM} to execute.
```
</step>

</process>

<success_criteria>
- [ ] All 3 agents were invoked in sequence: researcher -> planner -> checker
- [ ] RESEARCH.md exists in phase directory (either pre-existing or newly created)
- [ ] At least one PLAN.md exists in phase directory
- [ ] Checker returned VERIFICATION PASSED (or user approved despite issues)
- [ ] No absolute paths in any command (all use relative `.claude/bin/gxd-tools.cjs`)
- [ ] Agent-missing guard fired before any work was attempted
- [ ] Revision loop bounded to max 3 iterations with stall detection
- [ ] User escalated via AskUserQuestion on stall or iteration cap
</success_criteria>
