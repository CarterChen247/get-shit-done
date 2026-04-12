---
name: gxd-branch-pr
description: Create a clean {branch}-pr branch with no .planning/ phase files — ready for code review
argument-hint: "[target branch, default: main]"
user-invocable: true
disable-model-invocation: true
allowed-tools:
  - Bash
  - AskUserQuestion
---

<purpose>
Create a clean branch for pull requests by filtering out transient .planning/ commits.
The PR branch contains only code changes and structural planning state — reviewers
don't see GSD transient artifacts (PLAN.md, SUMMARY.md, CONTEXT.md, RESEARCH.md, etc.)
but structural planning files (STATE.md, ROADMAP.md, MILESTONES.md, PROJECT.md,
REQUIREMENTS.md, and .planning/milestones/) are preserved.

Uses git cherry-pick with path filtering to rebuild a clean history.
Pure git commands only — no external script dependencies.
</purpose>

<process>

<step name="detect_state">
Parse $ARGUMENTS for target branch (default: main):

```bash
TARGET="${ARGUMENTS:-main}"

# Validate branch name — only allow safe characters (shell injection prevention)
if ! echo "$TARGET" | grep -qE '^[a-zA-Z0-9._/-]+$'; then
  echo "ERROR: Invalid target branch name '$TARGET'. Only alphanumeric, '.', '_', '/', and '-' are allowed."
  exit 1
fi

CURRENT_BRANCH=$(git branch --show-current)
```

Check dirty working tree (D-11):

```bash
if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: Uncommitted changes detected. Commit or stash before running gxd:branch-pr."
  exit 1
fi
```

Check not on target branch:

```bash
if [ "$CURRENT_BRANCH" = "$TARGET" ]; then
  echo "ERROR: Already on $TARGET. Switch to a feature branch first."
  exit 1
fi
```

Count commits ahead:

```bash
AHEAD=$(git rev-list --count "$TARGET".."$CURRENT_BRANCH" 2>/dev/null || echo 0)
if [ "$AHEAD" = "0" ]; then
  echo "No commits ahead of $TARGET — nothing to filter."
  exit 0
fi
```

Check if PR branch already exists (D-14):

```bash
PR_BRANCH="${CURRENT_BRANCH}-pr"
if git rev-parse --verify "${CURRENT_BRANCH}-pr" >/dev/null 2>&1; then
```

Use AskUserQuestion:
> "${CURRENT_BRANCH}-pr already exists. Overwrite it? [y/N]"

```bash
  if [ "$ANSWER" = "y" ] || [ "$ANSWER" = "Y" ]; then
    git branch -D "${CURRENT_BRANCH}-pr"
  else
    echo "Aborted."
    exit 0
  fi
fi
```

Display banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 gxd ► BRANCH-PR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Branch: ${CURRENT_BRANCH}
Target: ${TARGET}
Commits: ${AHEAD} ahead
```
</step>

<step name="analyze_commits">
Classify each commit ahead of target.

**Structural planning files** — always preserved on PR branch (repository planning state):
- `.planning/STATE.md`
- `.planning/ROADMAP.md`
- `.planning/MILESTONES.md`
- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/milestones/`

**Transient planning files** — excluded from PR branch (reviewer noise):
- `.planning/phases/`
- `.planning/quick/`
- `.planning/research/`
- `.planning/threads/`
- `.planning/todos/`
- `.planning/debug/`
- `.planning/seeds/`
- `.planning/codebase/`
- `.planning/ui-reviews/`

Commit classification loop (D-12: --no-merges skips merge commits):

```bash
INCLUDE_COMMITS=""
EXCLUDE_COMMITS=""

for HASH in $(git log --reverse --format="%H" --no-merges "$TARGET".."$CURRENT_BRANCH"); do
  FILES=$(git diff-tree --no-commit-id --name-only -r "$HASH")
  NON_PLANNING=$(echo "$FILES" | grep -cv "^\.planning/" | tr -d ' ')
  STRUCTURAL=$(echo "$FILES" | grep -cE "^\.planning/(STATE|ROADMAP|MILESTONES|PROJECT|REQUIREMENTS)\.md$|^\.planning/milestones/" | tr -d ' ')
  TRANSIENT=$(echo "$FILES" | grep -c "^\.planning/" | tr -d ' ')
  TRANSIENT_ONLY_COUNT=$(( TRANSIENT - STRUCTURAL ))

  # D-06: Exclude only if: no non-planning files AND no structural files AND has transient files
  if [ "$NON_PLANNING" -eq 0 ] && [ "$STRUCTURAL" -eq 0 ] && [ "$TRANSIENT_ONLY_COUNT" -gt 0 ]; then
    # Transient-only: EXCLUDE
    EXCLUDE_COMMITS="$EXCLUDE_COMMITS $HASH"
  else
    # Code, structural-only, or mixed: INCLUDE (with transient dirs stripped in next step)
    INCLUDE_COMMITS="$INCLUDE_COMMITS $HASH"
  fi
done

INCLUDE_COUNT=$(echo "$INCLUDE_COMMITS" | wc -w | tr -d ' ')
EXCLUDE_COUNT=$(echo "$EXCLUDE_COMMITS" | wc -w | tr -d ' ')
echo "Commits to include: $INCLUDE_COUNT"
echo "Commits to exclude: $EXCLUDE_COUNT"
```
</step>

<step name="create_pr_branch">
Create the PR branch from target and cherry-pick included commits:

```bash
PR_BRANCH="${CURRENT_BRANCH}-pr"
git checkout -b "$PR_BRANCH" "$TARGET"
```

Cherry-pick loop with per-commit transient dir stripping (D-04, D-05):

```bash
for HASH in $INCLUDE_COMMITS; do
  git cherry-pick "$HASH" --no-commit

  # Strip transient dirs from index only — structural files (STATE.md, ROADMAP.md,
  # MILESTONES.md, PROJECT.md, REQUIREMENTS.md, milestones/) are untouched (D-07, D-08, D-09, D-10)
  # Each rm is scoped to a named transient subdir — never to all of .planning/ (bug-2004 guard)
  for dir in phases quick research threads todos debug seeds codebase ui-reviews; do
    git rm -r --cached ".planning/$dir/" 2>/dev/null || true
  done

  # D-13: Skip empty commits (commit touched only transient dirs that were all stripped)
  if ! git diff --cached --quiet; then
    git commit -C "$HASH"
  else
    git reset HEAD 2>/dev/null || true
  fi
done
```

Return to original branch (D-15):

```bash
git checkout "$CURRENT_BRANCH"
```
</step>

<step name="verify">
Count planning files and commits on the PR branch:

```bash
PLANNING_FILES=$(git diff --name-only "$TARGET".."$PR_BRANCH" | grep "^\.planning/" | wc -l | tr -d ' ')
TOTAL_FILES=$(git diff --name-only "$TARGET".."$PR_BRANCH" | wc -l | tr -d ' ')
PR_COMMITS=$(git rev-list --count "$TARGET".."$PR_BRANCH")
```

Display results:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PR Branch Created
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Original branch : ${CURRENT_BRANCH} (${AHEAD} commits)
PR branch       : ${PR_BRANCH} (${PR_COMMITS} commits, ${TOTAL_FILES} files)
Planning files  : ${PLANNING_FILES} (0 = clean)

Next steps:
  git push origin ${PR_BRANCH}
  gh pr create --base ${TARGET} --head ${PR_BRANCH}
```
</step>

</process>

<success_criteria>
- [ ] PR branch created from target using git checkout -b
- [ ] Transient planning-only commits excluded (phases/, quick/, research/, threads/, todos/, debug/, seeds/, codebase/, ui-reviews/)
- [ ] Structural files preserved: STATE.md, ROADMAP.md, MILESTONES.md, PROJECT.md, REQUIREMENTS.md, .planning/milestones/
- [ ] No transient .planning/ dirs in PR branch diff
- [ ] Commit messages and authorship preserved from original via git commit -C
- [ ] Returned to original branch after completion
- [ ] Pure git commands only — no external scripts or subprocess dependencies
</success_criteria>
