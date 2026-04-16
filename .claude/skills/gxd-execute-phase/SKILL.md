---
name: gxd-execute-phase
description: Execute all plans in a phase sequentially with atomic commits per task, followed by verification and phase completion
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
Orchestrate the execute-phase pipeline: validate agents, initialize phase state, iterate all plans
in wave order spawning one executor agent per plan, spawn a verifier agent after all plans complete,
and update STATE.md + ROADMAP.md on completion. Handles three verification outcomes: passed
(phase complete), gaps_found (present to user, suggest gap closure), and human_needed (prompt
user for manual confirmation).
</purpose>

<process>

<step name="parse_args">
Parse and validate the phase number argument:

```bash
PHASE_NUM="$ARGUMENTS"
if [ -z "$PHASE_NUM" ]; then
  echo "ERROR: Phase number required. Usage: gxd:execute-phase <N>"
  exit 1
fi

# Validate positive integer (prevent injection -- ASVS V5)
if ! echo "$PHASE_NUM" | grep -qE '^[0-9]+$'; then
  echo "ERROR: Phase number must be a positive integer, got '$PHASE_NUM'"
  exit 1
fi

PADDED_PHASE=$(printf "%02d" "$PHASE_NUM")
```
</step>

<step name="install_agents">
Install bundled agent definitions to `.claude/agents/` if not already present. This makes the
skill folder self-contained — copying `gxd-execute-phase/` is all that is needed.

```bash
SKILL_DIR=".claude/skills/gxd-execute-phase"
AGENTS_DIR=".claude/agents"
mkdir -p "$AGENTS_DIR"

for AGENT in gxd-executor gxd-verifier; do
  SRC="$SKILL_DIR/${AGENT}.md"
  DST="$AGENTS_DIR/${AGENT}.md"
  if [ -f "$SRC" ] && [ ! -f "$DST" ]; then
    cp "$SRC" "$DST"
    echo "Installed agent: $DST"
  fi
done
```

Then verify both agents are in place:

```bash
MISSING=""
for AGENT in gxd-executor gxd-verifier; do
  if [ ! -f "$AGENTS_DIR/${AGENT}.md" ]; then
    MISSING="$MISSING  - ${AGENT}.md\n"
  fi
done

if [ -n "$MISSING" ]; then
  echo "ERROR: Required agents missing from .claude/agents/:"
  echo -e "$MISSING"
  echo "Expected source files in $SKILL_DIR/ -- check your installation."
  exit 1
fi

echo "All required agents present. Proceeding."
```

If ANY agent is missing after install attempt: display the error and STOP.
</step>

<step name="init_phase">
Initialize the phase context using gxd-tools:

```bash
INIT=$(node ".claude/skills/gxd-execute-phase/gxd-tools.cjs" init execute-phase "$PHASE_NUM")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi

PHASE_DIR=$(echo "$INIT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('phase_dir') or '')" 2>/dev/null || echo "")
PHASE_NAME=$(echo "$INIT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('phase_name') or '')" 2>/dev/null || echo "")
PLAN_COUNT=$(echo "$INIT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('plan_count') or '0')" 2>/dev/null || echo "0")
INCOMPLETE_COUNT=$(echo "$INIT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('incomplete_count') or '0')" 2>/dev/null || echo "0")
```

Error checks:

```bash
if [ -z "$PHASE_DIR" ]; then
  echo "ERROR: Phase $PHASE_NUM not found. Check that .planning/phases/ contains a directory for phase $PHASE_NUM."
  exit 1
fi

if [ "$PLAN_COUNT" = "0" ]; then
  echo "ERROR: No plans found in phase $PHASE_NUM ($PHASE_DIR). Run gxd:plan-phase $PHASE_NUM first."
  exit 1
fi

if [ "$INCOMPLETE_COUNT" = "0" ]; then
  echo "Phase $PHASE_NUM ($PHASE_NAME) already complete -- all $PLAN_COUNT plans have SUMMARYs."
  echo "To re-verify: delete the SUMMARY.md files you want re-executed and re-run."
  exit 0
fi

echo "Phase $PHASE_NUM: $PHASE_NAME"
echo "Plans: $PLAN_COUNT total, $INCOMPLETE_COUNT incomplete"
```
</step>

<step name="begin_phase">
```bash
node ".claude/skills/gxd-execute-phase/gxd-tools.cjs" state begin-phase \
  --phase "$PHASE_NUM" --name "$PHASE_NAME" --plans "$PLAN_COUNT"
echo "Phase state set to Executing."
```
</step>

<step name="get_plan_index">
Discover all plans in wave order, filtering to incomplete plans only:

```bash
PLAN_INDEX=$(node ".claude/skills/gxd-execute-phase/gxd-tools.cjs" phase-plan-index "$PHASE_NUM")

# Parse the JSON array to get incomplete plan files in wave order
# Each entry: { "plan_file": "XX-NN-PLAN.md", "wave": N, "has_summary": bool, ... }
INCOMPLETE_PLANS=$(echo "$PLAN_INDEX" | python3 -c "
import sys, json
plans = json.load(sys.stdin)
incomplete = [p for p in plans if not p.get('has_summary', False)]
for p in incomplete:
    print(p['plan_file'])
" 2>/dev/null || echo "")

if [ -z "$INCOMPLETE_PLANS" ]; then
  echo "No incomplete plans found (all have SUMMARY.md). Phase may already be complete."
  exit 0
fi

PLAN_TOTAL=$(echo "$INCOMPLETE_PLANS" | wc -l | tr -d ' ')
echo "Executing $PLAN_TOTAL incomplete plans in wave order:"
echo "$INCOMPLETE_PLANS"
```
</step>

<step name="execute_plans_sequential">
Execute each incomplete plan one at a time in wave order. No parallel spawning -- one executor
agent completes before the next begins.

```bash
PLAN_CURRENT=0
```

For each plan file in the INCOMPLETE_PLANS list:

```bash
PLAN_CURRENT=$((PLAN_CURRENT + 1))
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Executing plan $PLAN_CURRENT/$PLAN_TOTAL: $PLAN_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

Spawn the executor agent via Task():

```
Task(
  prompt="Execute plan: {PHASE_DIR}/{PLAN_FILE}

<objective>
Execute all tasks in the plan file, commit each task atomically, and create SUMMARY.md.
Do NOT update STATE.md or ROADMAP.md -- the orchestrator handles those.
</objective>

<files_to_read>
Read these files at execution start using the Read tool:
- {PHASE_DIR}/{PLAN_FILE} (Plan to execute)
- .planning/STATE.md (Project state)
- ./CLAUDE.md (Project instructions, if exists)
- {PHASE_DIR}/{PADDED_PHASE}-CONTEXT.md (User decisions, if exists)
- {PHASE_DIR}/{PADDED_PHASE}-RESEARCH.md (Technical research, if exists)
</files_to_read>

<sequential_execution>
You are running as a SEQUENTIAL executor agent on the main working tree.
Use normal git commits (with hooks). Do NOT use --no-verify.
</sequential_execution>

<important_note>
The directory .claude/skills/ may be in .gitignore. If staging files under .claude/, use
`git add -f` to force-stage them.
</important_note>

<success_criteria>
- [ ] All tasks executed
- [ ] Each task committed individually
- [ ] SUMMARY.md created in {PHASE_DIR}
</success_criteria>
",
  subagent_type="gxd-executor",
  description="Execute plan {PLAN_FILE} ({PLAN_CURRENT}/{PLAN_TOTAL})"
)
```

After the executor returns, check the return value:

**If return value contains `## PLAN COMPLETE`:** Plan succeeded. Continue.

**If return value contains `## CHECKPOINT REACHED`:** The executor paused at a checkpoint.
Display the checkpoint details to the user:

```
Task {PLAN_FILE} paused at a checkpoint.

{CHECKPOINT_DETAILS from executor return value}
```

Use AskUserQuestion:
"Plan {PLAN_FILE} has reached a checkpoint. Review the details above.
Options:
(a) Continue -- I have completed the required action, resume execution
(b) Abort -- stop and I will resolve this manually"

If user selects (a): spawn a continuation executor:

```
Task(
  prompt="Continue execution after checkpoint for plan: {PHASE_DIR}/{PLAN_FILE}

<continuation>
The user has confirmed the required action is complete. Resume from checkpoint.
Prior checkpoint context: {CHECKPOINT_DETAILS}
</continuation>

<files_to_read>
- {PHASE_DIR}/{PLAN_FILE}
- .planning/STATE.md
</files_to_read>

<sequential_execution>
You are running as a SEQUENTIAL executor agent on the main working tree.
Use normal git commits (with hooks). Do NOT use --no-verify.
</sequential_execution>

<success_criteria>
- [ ] All remaining tasks executed
- [ ] Each task committed individually
- [ ] SUMMARY.md created or updated in {PHASE_DIR}
</success_criteria>
",
  subagent_type="gxd-executor",
  description="Continue plan {PLAN_FILE} after checkpoint"
)
```

If user selects (b): STOP. Display:
"Execution paused. Resolve the checkpoint and re-run gxd:execute-phase {PHASE_NUM} to continue."

After each plan completes (success or checkpoint resolved):

```bash
# Update ROADMAP.md progress -- counts PLANs vs SUMMARYs in the phase directory
node ".claude/skills/gxd-execute-phase/gxd-tools.cjs" roadmap update-plan-progress "$PHASE_NUM"
echo "Roadmap progress updated for phase $PHASE_NUM."
```

Continue to the next plan in the list.
</step>

<step name="run_verifier">
After all plans complete, spawn the verifier agent once for the entire phase.

Collect plan and summary file lists, then spawn the verifier:

```bash
PLAN_FILES=$(ls -1 "$PHASE_DIR"/*-PLAN.md 2>/dev/null | sed 's|^|- |')
SUMMARY_FILES=$(ls -1 "$PHASE_DIR"/*-SUMMARY.md 2>/dev/null | sed 's|^|- |')
```

```
Task(
  prompt="Verify phase {PHASE_NUM}: {PHASE_NAME}

<files_to_read>
- .planning/ROADMAP.md (Phase goal and success criteria -- NON-NEGOTIABLE contract)
- .planning/REQUIREMENTS.md (Requirement definitions)
{PLAN_FILES}
{SUMMARY_FILES}
</files_to_read>

Phase number: {PHASE_NUM}
Phase directory: {PHASE_DIR}
Verification output path: {PHASE_DIR}/{PADDED_PHASE}-VERIFICATION.md

Perform 3-level goal-backward verification:
1. Truths -- what must be TRUE (behavior, state, configuration)
2. Artifacts -- what must EXIST (files, commits, outputs)
3. Key links -- what must be CONNECTED (A calls B, X depends on Y)

ROADMAP.md success criteria are the non-negotiable contract. PLAN must_haves can add scope
but never subtract from roadmap SCs.
",
  subagent_type="gxd-verifier",
  description="Verify phase {PHASE_NUM}: {PHASE_NAME}"
)
```

After the verifier returns `## Verification Complete`, proceed to handle_verification_result.
</step>

<step name="handle_verification_result">
Parse the verification status from VERIFICATION.md frontmatter:

```bash
VERIFICATION_FILE="$PHASE_DIR/${PADDED_PHASE}-VERIFICATION.md"

if [ ! -f "$VERIFICATION_FILE" ]; then
  echo "WARNING: VERIFICATION.md not found at $VERIFICATION_FILE"
  echo "Verifier may have failed to write the file. Check the verifier output above."
  exit 1
fi

STATUS=$(head -20 "$VERIFICATION_FILE" | grep "^status:" | sed 's/status:[[:space:]]*//')
echo "Verification status: $STATUS"
```

Route based on status:

---

**If STATUS is `passed`:**

```bash
# Stage and commit VERIFICATION.md and any SUMMARY.md files
git add -f "$PHASE_DIR"/*-VERIFICATION.md 2>/dev/null || true
git add -f "$PHASE_DIR"/*-SUMMARY.md 2>/dev/null || true
git add .planning/STATE.md .planning/ROADMAP.md 2>/dev/null || true
git commit -m "docs(${PADDED_PHASE}): phase verification passed"

# Mark phase complete in STATE.md and ROADMAP.md
node ".claude/skills/gxd-execute-phase/gxd-tools.cjs" phase complete "$PHASE_NUM"

# Commit the phase completion state updates
git add .planning/STATE.md .planning/ROADMAP.md 2>/dev/null || true
git commit -m "docs(${PADDED_PHASE}): mark phase complete"
```

Display success:
```
Phase {PHASE_NUM}: {PHASE_NAME} -- COMPLETE
Verification: PASSED
Report: {VERIFICATION_FILE}
STATE.md and ROADMAP.md updated.
```

---

**If STATUS is `gaps_found`:**

```bash
# Stage and commit VERIFICATION.md
git add -f "$PHASE_DIR"/*-VERIFICATION.md 2>/dev/null || true
git add -f "$PHASE_DIR"/*-SUMMARY.md 2>/dev/null || true
git commit -m "docs(${PADDED_PHASE}): phase verification found gaps"
```

Read and display the gaps section from VERIFICATION.md:

```bash
cat "$VERIFICATION_FILE"
```

Display next steps:
```
To create gap closure plans: gxd:plan-phase {PHASE_NUM} --gaps
Then re-execute: gxd:execute-phase {PHASE_NUM}
```

---

**If STATUS is `human_needed`:**

```bash
# Stage and commit VERIFICATION.md
git add -f "$PHASE_DIR"/*-VERIFICATION.md 2>/dev/null || true
git add -f "$PHASE_DIR"/*-SUMMARY.md 2>/dev/null || true
git commit -m "docs(${PADDED_PHASE}): phase verification needs human review"
```

Read VERIFICATION.md and use AskUserQuestion to present human verification items:
"Phase {PHASE_NUM} verification requires manual testing. Review {VERIFICATION_FILE} for the
human_verification items. After completing the checks, type 'passed' to mark the phase
complete, or describe any issues found."

If user responds with "passed" (case-insensitive):

```bash
node ".claude/skills/gxd-execute-phase/gxd-tools.cjs" phase complete "$PHASE_NUM"
git add .planning/STATE.md .planning/ROADMAP.md 2>/dev/null || true
git commit -m "docs(${PADDED_PHASE}): mark phase complete after human verification"
echo "Phase $PHASE_NUM marked complete."
```

If user describes issues: treat as gaps_found.
```
To create gap closure plans: gxd:plan-phase {PHASE_NUM} --gaps
Then re-execute: gxd:execute-phase {PHASE_NUM}
```

---

**If STATUS is empty or unrecognized:**

Use AskUserQuestion:
"Unrecognized verification status '$STATUS' in {VERIFICATION_FILE}. Options:
(a) Mark phase complete -- verification is acceptable
(b) Re-run the verifier
(c) Abort -- handle manually"

If (a): run phase complete and commit. If (b): repeat run_verifier step. If (c): stop.
</step>

</process>

<success_criteria>
- [ ] All agents installed and verified before execution begins
- [ ] Phase state set to Executing before first plan (state begin-phase)
- [ ] Each plan executed sequentially in wave order (EXEC-02)
- [ ] Each plan produced atomic commits per task (EXEC-01)
- [ ] ROADMAP.md updated after each plan completion (roadmap update-plan-progress)
- [ ] Verifier spawned after all plans complete (EXEC-06)
- [ ] VERIFICATION.md produced in phase directory
- [ ] Phase marked complete in STATE.md and ROADMAP.md on passed status (EXEC-07)
- [ ] Gaps presented to user with next-step guidance on gaps_found status
- [ ] Human verification items presented via AskUserQuestion on human_needed status
- [ ] No isolated-branch parallel execution used (sequential mode only)
- [ ] All gxd-tools calls use skill-local path: node ".claude/skills/gxd-execute-phase/gxd-tools.cjs"
</success_criteria>
