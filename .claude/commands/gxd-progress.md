<purpose>
Check project progress, summarize recent work and what is ahead, then intelligently route to the next action. Provides situational awareness before continuing work. This skill is READ-ONLY — it makes zero file writes.
</purpose>

<process>

<step name="init_context">
Load all progress data via gxd-tools read commands.

```bash
INIT=$(node ".claude/bin/gxd-tools.cjs" init progress)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Extract key fields from the init JSON using python3:

```bash
PROJECT_EXISTS=$(echo "$INIT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('project_exists','false'))" 2>/dev/null || echo "false")
ROADMAP_EXISTS=$(echo "$INIT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('roadmap_exists','false'))" 2>/dev/null || echo "false")
STATE_EXISTS=$(echo "$INIT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('state_exists','false'))" 2>/dev/null || echo "false")
CURRENT_PHASE=$(echo "$INIT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('current_phase',''))" 2>/dev/null || echo "")
NEXT_PHASE=$(echo "$INIT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('next_phase',''))" 2>/dev/null || echo "")
PHASE_COUNT=$(echo "$INIT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('phase_count',0))" 2>/dev/null || echo "0")
PAUSED_AT=$(echo "$INIT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('paused_at',''))" 2>/dev/null || echo "")
MILESTONE_VERSION=$(echo "$INIT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('milestone_version','v1.0'))" 2>/dev/null || echo "v1.0")
PROJECT_ROOT=$(echo "$INIT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('project_root','.'))" 2>/dev/null || echo ".")
```

**Early exit — no planning structure:**

If `PROJECT_EXISTS` is `False`:

```
No planning structure found.

Run /gxd-discuss-phase to start a new project or /gxd-plan-phase to plan directly.
```

Exit.

**Early exit — ROADMAP.md missing but PROJECT.md exists:**

If `ROADMAP_EXISTS` is `False` and `PROJECT_EXISTS` is `True`:

Go to **Route F** (between milestones).
</step>

<step name="load">
Get structured data from gxd-tools read commands:

```bash
ROADMAP=$(node ".claude/bin/gxd-tools.cjs" roadmap analyze)
if [[ "$ROADMAP" == @file:* ]]; then ROADMAP=$(cat "${ROADMAP#@file:}"); fi

STATE=$(node ".claude/bin/gxd-tools.cjs" state-snapshot)
if [[ "$STATE" == @file:* ]]; then STATE=$(cat "${STATE#@file:}"); fi
```
</step>

<step name="analyze_roadmap">
Extract structured phase data from roadmap analyze JSON:

```bash
TOTAL_PHASES=$(echo "$ROADMAP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('phase_count',0))" 2>/dev/null || echo "0")
TOTAL_PLANS=$(echo "$ROADMAP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total_plans',0))" 2>/dev/null || echo "0")
TOTAL_SUMMARIES=$(echo "$ROADMAP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total_summaries',0))" 2>/dev/null || echo "0")
PROGRESS_PERCENT=$(echo "$ROADMAP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('progress_percent',0))" 2>/dev/null || echo "0")
ROADMAP_CURRENT_PHASE=$(echo "$ROADMAP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('current_phase',''))" 2>/dev/null || echo "")
ROADMAP_NEXT_PHASE=$(echo "$ROADMAP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('next_phase',''))" 2>/dev/null || echo "")

# Get current phase info
PHASE_NAME=$(echo "$ROADMAP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
cp = d.get('current_phase','')
for p in d.get('phases',[]):
    if str(p.get('number','')) == str(cp):
        print(p.get('name',''))
        break
" 2>/dev/null || echo "")

PHASE_GOAL=$(echo "$ROADMAP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
cp = d.get('current_phase','')
for p in d.get('phases',[]):
    if str(p.get('number','')) == str(cp):
        print(p.get('goal',''))
        break
" 2>/dev/null || echo "")

# Get next phase info
NEXT_PHASE_NAME=$(echo "$ROADMAP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
np = d.get('next_phase','')
for p in d.get('phases',[]):
    if str(p.get('number','')) == str(np):
        print(p.get('name',''))
        break
" 2>/dev/null || echo "")

NEXT_PHASE_GOAL=$(echo "$ROADMAP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
np = d.get('next_phase','')
for p in d.get('phases',[]):
    if str(p.get('number','')) == str(np):
        print(p.get('goal',''))
        break
" 2>/dev/null || echo "")
```
</step>

<step name="recent">
Find the 2-3 most recent SUMMARY.md files in the current phase directory and extract one-liners:

```bash
# Find phase directory
PHASE_DIR=$(echo "$INIT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
cp = d.get('current_phase','')
for p in d.get('phases',[]):
    if str(p.get('number','')) == str(cp):
        print(p.get('directory',''))
        break
" 2>/dev/null || echo "")

RECENT_WORK=""
if [ -n "$PHASE_DIR" ] && [ -d "$PHASE_DIR" ]; then
    for summary_file in $(ls -1t "$PHASE_DIR"/*-SUMMARY.md 2>/dev/null | head -3); do
        ONE_LINER=$(node ".claude/bin/gxd-tools.cjs" summary-extract "$summary_file" --fields one_liner 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('one_liner',''))" 2>/dev/null || echo "")
        PLAN_NUM=$(basename "$summary_file" | sed 's/[0-9]*-\([0-9]*\)-SUMMARY.md/\1/')
        if [ -n "$ONE_LINER" ]; then
            RECENT_WORK="${RECENT_WORK}\n- Phase ${CURRENT_PHASE}, Plan ${PLAN_NUM}: ${ONE_LINER}"
        fi
    done
fi
```
</step>

<step name="position">
Parse current position and note any paused work:

```bash
STOPPED_AT=$(echo "$STATE" | python3 -c "
import sys,json
d=json.load(sys.stdin)
pos = d.get('current_position',{})
print(pos.get('stopped_at','') if isinstance(pos,dict) else '')
" 2>/dev/null || echo "$PAUSED_AT")

DECISIONS=$(echo "$STATE" | python3 -c "
import sys,json
d=json.load(sys.stdin)
decisions = d.get('decisions',[])
for dec in decisions[:3]:
    if isinstance(dec,dict):
        print('- ' + dec.get('decision', dec.get('summary',str(dec))))
    else:
        print('- ' + str(dec))
" 2>/dev/null || echo "")

BLOCKERS=$(echo "$STATE" | python3 -c "
import sys,json
d=json.load(sys.stdin)
blockers = d.get('blockers',[])
for b in blockers:
    if isinstance(b,dict):
        print('- ' + b.get('text', b.get('description',str(b))))
    else:
        print('- ' + str(b))
" 2>/dev/null || echo "")
```
</step>

<step name="report">
Get the progress bar and present the formatted status report:

```bash
PROGRESS_BAR=$(node ".claude/bin/gxd-tools.cjs" progress bar --raw 2>/dev/null || echo "[░░░░░░░░░░] 0%")
```

Present the report in this format:

```
# gxd Skills

**Progress:** {PROGRESS_BAR}
**Milestone:** {MILESTONE_VERSION}

## Recent Work
{RECENT_WORK — each summary's one-liner, or "No summaries yet" if empty}

## Current Position
Phase {CURRENT_PHASE} of {TOTAL_PHASES}: {PHASE_NAME}
{if PAUSED_AT is set: "Last paused at: {PAUSED_AT}"}

## Key Decisions Made
{DECISIONS — up to 3 most recent, or "None recorded yet" if empty}

## Blockers/Concerns
{BLOCKERS — or "None" if empty}

## What's Next
{PHASE_GOAL}
```

If there are blockers, highlight them prominently before routing.
</step>

<step name="route">
Determine next action based on verified counts from disk (not cached values).

**Step 1: Count plans and summaries in current phase directory**

```bash
PLAN_COUNT=$(ls -1 "$PHASE_DIR"/*-PLAN.md 2>/dev/null | wc -l | tr -d ' ')
SUMMARY_COUNT=$(ls -1 "$PHASE_DIR"/*-SUMMARY.md 2>/dev/null | wc -l | tr -d ' ')
CONTEXT_FILE="${PHASE_DIR}/${CURRENT_PHASE}-CONTEXT.md"
HAS_CONTEXT="false"
[ -f "$CONTEXT_FILE" ] && HAS_CONTEXT="true"
```

State: "This phase has {PLAN_COUNT} plans, {SUMMARY_COUNT} summaries."

**Step 2: Route based on counts**

Apply the first matching route:

| Condition | Route |
|-----------|-------|
| `SUMMARY_COUNT` < `PLAN_COUNT` | Route A — unexecuted plan exists |
| `PLAN_COUNT` = 0 AND `HAS_CONTEXT` = "false" | Route B (no context) — phase needs discussion |
| `PLAN_COUNT` = 0 AND `HAS_CONTEXT` = "true" | Route B (has context) — phase ready to plan |
| `SUMMARY_COUNT` = `PLAN_COUNT` AND `CURRENT_PHASE` < `TOTAL_PHASES` | Route C — phase complete, more remain |
| `SUMMARY_COUNT` = `PLAN_COUNT` AND `CURRENT_PHASE` = `TOTAL_PHASES` | Route D — milestone complete |

---

**Route A: Unexecuted plan exists**

Find the first PLAN.md file without a matching SUMMARY.md:

```bash
FIRST_UNEXECUTED=""
for plan_file in $(ls -1 "$PHASE_DIR"/*-PLAN.md 2>/dev/null | sort); do
    plan_base=$(basename "$plan_file" -PLAN.md)
    summary_file="${PHASE_DIR}/${plan_base}-SUMMARY.md"
    if [ ! -f "$summary_file" ]; then
        FIRST_UNEXECUTED="$plan_file"
        break
    fi
done
PLAN_LABEL=$(basename "$FIRST_UNEXECUTED" .md 2>/dev/null || echo "next plan")
```

Read the `<objective>` section from that PLAN.md and summarize in one line.

```
---

## Next Up

**{PLAN_LABEL}** — {objective summary from PLAN.md}

`/clear` then:

`/gxd-execute-phase {CURRENT_PHASE}`

---
```

---

**Route B (no context): Phase needs discussion**

```
---

## Next Up

**Phase {CURRENT_PHASE}: {PHASE_NAME}** — {PHASE_GOAL}

`/clear` then:

`/gxd-discuss-phase {CURRENT_PHASE}` — gather context and clarify approach

---

**Also available:**
- `/gxd-plan-phase {CURRENT_PHASE}` — skip discussion, plan directly

---
```

---

**Route B (has context): Phase ready to plan**

```
---

## Next Up

**Phase {CURRENT_PHASE}: {PHASE_NAME}** — {PHASE_GOAL}
Context gathered, ready to plan.

`/clear` then:

`/gxd-plan-phase {CURRENT_PHASE}`

---
```

---

**Route C: Phase complete, more phases remain**

```bash
NEXT_NUM="$NEXT_PHASE"
```

```
---

## Phase {CURRENT_PHASE} Complete

## Next Up

**Phase {NEXT_NUM}: {NEXT_PHASE_NAME}** — {NEXT_PHASE_GOAL}

`/clear` then:

`/gxd-discuss-phase {NEXT_NUM}` — gather context and clarify approach

---

**Also available:**
- `/gxd-plan-phase {NEXT_NUM}` — skip discussion, plan directly

---
```

---

**Route D: Milestone complete**

```
---

## Milestone Complete

All {TOTAL_PHASES} phases finished!

## Next Up

All plans executed. Milestone {MILESTONE_VERSION} is complete.

`/clear` then:

Consider archiving this milestone and starting the next planning cycle.

---
```

---

**Route F: Between milestones (ROADMAP.md missing, PROJECT.md exists)**

This is reached from the early exit check in `init_context`. A milestone was completed and archived.

```
---

## Milestone {MILESTONE_VERSION} Complete

Ready to plan the next milestone.

## Next Up

**Start Next Milestone** — discuss goals, define phases, write ROADMAP.md

`/clear` then:

`/gxd-discuss-phase 1` — begin next milestone planning cycle

---
```

---

**No planning structure (fallback)**

If no phase directory found and no route matched:

```
No planning structure found. Run /gxd-plan-phase to begin.
```

</step>

</process>

<success_criteria>
- [ ] Progress bar displayed with percentage and milestone label
- [ ] Recent work summaries shown (one-liner per SUMMARY.md)
- [ ] Current phase position shown (Phase N of total)
- [ ] Key decisions and blockers from STATE.md surfaced
- [ ] Correct route selected based on verified disk counts
- [ ] Route A: suggests `/gxd-execute-phase` when unexecuted plans exist
- [ ] Route B: suggests `/gxd-discuss-phase` or `/gxd-plan-phase` when phase unplanned
- [ ] Route C: suggests `/gxd-discuss-phase {N+1}` when phase complete and more remain
- [ ] Route D: shows milestone complete message when all phases done
- [ ] Route F: shows "between milestones" message when ROADMAP.md absent
- [ ] Zero file writes — STATE.md unchanged after invocation
- [ ] All gxd-tools references use relative paths — no absolute system paths anywhere
- [ ] Missing ROADMAP.md produces actionable message via Route F (PORT-04)
</success_criteria>
