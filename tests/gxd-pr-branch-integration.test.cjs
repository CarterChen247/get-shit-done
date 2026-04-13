'use strict';

/**
 * Integration tests for gxd:pr-branch SKILL.md
 *
 * Creates a temporary git repo with a mix of commit types (code-only,
 * structural-only, transient-only, mixed, code-only) and runs the exact
 * cherry-pick loop and commit classification logic extracted from SKILL.md.
 *
 * Validates:
 * - Transient-only commits are excluded from the PR branch
 * - Code commits are included
 * - Structural-only commits are included
 * - Mixed commits are included (with transient dirs stripped)
 * - Commit messages are preserved via git commit -C
 * - .planning/phases/ is absent from the PR branch
 * - Structural .planning/STATE.md is present on the PR branch
 */

const { describe, before, after, it } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * Creates a temporary git fixture repo with:
 * - main branch: initial commit (README.md)
 * - feature branch: 5 commits of mixed types
 *
 * Returns { dir, cleanup }
 */
function createFixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gxd-branch-pr-'));

  function run(cmd) {
    return execSync(cmd, { cwd: dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  }

  // Initialize repo with a stable git identity and force "main" as default branch
  run('git init -b main');
  run('git config user.email "test@gxd.test"');
  run('git config user.name "GXD Test"');
  run('git config commit.gpgsign false');

  // Initial commit on main
  fs.writeFileSync(path.join(dir, 'README.md'), '# Fixture repo\n');
  run('git add README.md');
  run('git commit -m "initial"');

  // Create feature branch
  run('git checkout -b feature');

  // Commit A: code-only — src/app.js
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'app.js'), 'module.exports = {};\n');
  run('git add src/app.js');
  run('git commit -m "feat: add app"');

  // Commit B: structural-only — .planning/STATE.md
  fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'STATE.md'), '# State\n');
  run('git add .planning/STATE.md');
  run('git commit -m "docs: update state"');

  // Commit C: transient-only — .planning/phases/01-test/01-01-PLAN.md
  fs.mkdirSync(path.join(dir, '.planning', 'phases', '01-test'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'phases', '01-test', '01-01-PLAN.md'), '# Plan\n');
  run('git add ".planning/phases/01-test/01-01-PLAN.md"');
  run('git commit -m "docs: add plan"');

  // Commit D: mixed — src/utils.js + .planning/phases/01-test/01-01-SUMMARY.md
  fs.writeFileSync(path.join(dir, 'src', 'utils.js'), 'module.exports = {};\n');
  fs.writeFileSync(path.join(dir, '.planning', 'phases', '01-test', '01-01-SUMMARY.md'), '# Summary\n');
  run('git add src/utils.js ".planning/phases/01-test/01-01-SUMMARY.md"');
  run('git commit -m "feat: add utils + summary"');

  // Commit E: code-only — src/index.js
  fs.writeFileSync(path.join(dir, 'src', 'index.js'), 'module.exports = {};\n');
  run('git add src/index.js');
  run('git commit -m "feat: add index"');

  function cleanup() {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {
      // best-effort cleanup
    }
  }

  return { dir, cleanup };
}

describe('gxd-branch-pr integration', () => {
  let dir;
  let cleanup;

  before(() => {
    const fixture = createFixtureRepo();
    dir = fixture.dir;
    cleanup = fixture.cleanup;
  });

  after(() => {
    cleanup();
  });

  function run(cmd) {
    return execSync(cmd, { cwd: dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  }

  it('fixture: feature branch has exactly 5 commits ahead of main', () => {
    const count = run('git rev-list --count main..feature').trim();
    assert.strictEqual(count, '5', `Expected 5 commits ahead of main, got ${count}`);
  });

  it('commit classification: includes commits A, B, D, E; excludes commit C (transient-only)', () => {
    // Extract the commit classification logic from SKILL.md and run it in the fixture repo
    const classifyScript = `
set -e
INCLUDE_COMMITS=""
EXCLUDE_COMMITS=""

for HASH in $(git log --reverse --format="%H" --no-merges main..feature); do
  FILES=$(git diff-tree --no-commit-id --name-only -r "$HASH")
  NON_PLANNING=$(echo "$FILES" | grep -cv "^\\.planning/" | tr -d ' ')
  STRUCTURAL=$(echo "$FILES" | grep -cE "^\\.planning/(STATE|ROADMAP|MILESTONES|PROJECT|REQUIREMENTS)\\.md$|^\\.planning/milestones/" | tr -d ' ')
  TRANSIENT=$(echo "$FILES" | grep -c "^\\.planning/" | tr -d ' ')
  TRANSIENT_ONLY_COUNT=$(( TRANSIENT - STRUCTURAL ))

  if [ "$NON_PLANNING" -eq 0 ] && [ "$STRUCTURAL" -eq 0 ] && [ "$TRANSIENT_ONLY_COUNT" -gt 0 ]; then
    EXCLUDE_COMMITS="$EXCLUDE_COMMITS $HASH"
  else
    INCLUDE_COMMITS="$INCLUDE_COMMITS $HASH"
  fi
done

INCLUDE_COUNT=$(echo "$INCLUDE_COMMITS" | wc -w | tr -d ' ')
EXCLUDE_COUNT=$(echo "$EXCLUDE_COMMITS" | wc -w | tr -d ' ')
echo "INCLUDE_COUNT=$INCLUDE_COUNT"
echo "EXCLUDE_COUNT=$EXCLUDE_COUNT"
`;

    const output = execSync(`bash -c '${classifyScript.replace(/'/g, "'\\''")}'`, {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });

    const includeMatch = output.match(/INCLUDE_COUNT=(\d+)/);
    const excludeMatch = output.match(/EXCLUDE_COUNT=(\d+)/);

    assert.ok(includeMatch, 'Classification output must contain INCLUDE_COUNT');
    assert.ok(excludeMatch, 'Classification output must contain EXCLUDE_COUNT');

    assert.strictEqual(includeMatch[1], '4', `Expected 4 INCLUDE commits, got ${includeMatch[1]}`);
    assert.strictEqual(excludeMatch[1], '1', `Expected 1 EXCLUDE commit, got ${excludeMatch[1]}`);
  });

  it('cherry-pick loop: creates feature-pr branch', () => {
    // Run the full cherry-pick loop from SKILL.md (analyze_commits + create_pr_branch)
    // This matches the exact logic from SKILL.md steps 2 and 3
    const fullScript = `
set -e
cd "${dir}"

CURRENT_BRANCH=feature
TARGET=main
PR_BRANCH=feature-pr

# Step: analyze_commits (from SKILL.md step analyze_commits)
INCLUDE_COMMITS=""
EXCLUDE_COMMITS=""

for HASH in $(git log --reverse --format="%H" --no-merges "$TARGET".."$CURRENT_BRANCH"); do
  FILES=$(git diff-tree --no-commit-id --name-only -r "$HASH")
  NON_PLANNING=$(echo "$FILES" | grep -cv "^\\.planning/" | tr -d ' ')
  STRUCTURAL=$(echo "$FILES" | grep -cE "^\\.planning/(STATE|ROADMAP|MILESTONES|PROJECT|REQUIREMENTS)\\.md$|^\\.planning/milestones/" | tr -d ' ')
  TRANSIENT=$(echo "$FILES" | grep -c "^\\.planning/" | tr -d ' ')
  TRANSIENT_ONLY_COUNT=$(( TRANSIENT - STRUCTURAL ))

  if [ "$NON_PLANNING" -eq 0 ] && [ "$STRUCTURAL" -eq 0 ] && [ "$TRANSIENT_ONLY_COUNT" -gt 0 ]; then
    EXCLUDE_COMMITS="$EXCLUDE_COMMITS $HASH"
  else
    INCLUDE_COMMITS="$INCLUDE_COMMITS $HASH"
  fi
done

# Step: create_pr_branch (from SKILL.md step create_pr_branch)
git checkout -b "$PR_BRANCH" "$TARGET"

for HASH in $INCLUDE_COMMITS; do
  git cherry-pick "$HASH" --no-commit

  # Strip transient dirs from index and working tree
  # (rm from index only leaves untracked working-tree files that block branch switch)
  for dir_name in phases quick research threads todos debug seeds codebase ui-reviews; do
    git rm -r --cached ".planning/$dir_name/" 2>/dev/null || true
    rm -rf ".planning/$dir_name/"
  done

  # Skip empty commits
  if ! git diff --cached --quiet; then
    git commit --no-gpg-sign -C "$HASH"
  else
    git reset HEAD 2>/dev/null || true
  fi
done

# Return to original branch
git checkout "$CURRENT_BRANCH"
`;

    execSync(`bash -s`, {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      input: fullScript,
    });

    // Verify feature-pr branch exists
    const branchExists = execSync('git rev-parse --verify feature-pr', {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    assert.ok(branchExists.length > 0, 'feature-pr branch must exist after cherry-pick loop');
  });

  it('cherry-pick loop: feature-pr has exactly 4 commits ahead of main', () => {
    const count = run('git rev-list --count main..feature-pr').trim();
    assert.strictEqual(count, '4', `Expected 4 commits on feature-pr, got ${count}`);
  });

  it('cherry-pick loop: src/app.js exists on feature-pr', () => {
    const content = run('git show feature-pr:src/app.js').trim();
    assert.ok(content.length > 0, 'src/app.js must exist on feature-pr branch');
  });

  it('cherry-pick loop: src/utils.js exists on feature-pr', () => {
    const content = run('git show feature-pr:src/utils.js').trim();
    assert.ok(content.length > 0, 'src/utils.js must exist on feature-pr branch');
  });

  it('cherry-pick loop: src/index.js exists on feature-pr', () => {
    const content = run('git show feature-pr:src/index.js').trim();
    assert.ok(content.length > 0, 'src/index.js must exist on feature-pr branch');
  });

  it('cherry-pick loop: .planning/STATE.md exists on feature-pr (structural preserved)', () => {
    const content = run('git show "feature-pr:.planning/STATE.md"').trim();
    assert.ok(content.length > 0, '.planning/STATE.md must exist on feature-pr (structural file preserved)');
  });

  it('cherry-pick loop: .planning/phases/ does NOT exist on feature-pr (transient stripped)', () => {
    let planningPhaseFiles = '';
    try {
      planningPhaseFiles = execSync(
        'git ls-tree -r --name-only feature-pr',
        { cwd: dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
    } catch (_) {
      planningPhaseFiles = '';
    }

    const phaseFiles = planningPhaseFiles
      .split('\n')
      .filter(f => f.startsWith('.planning/phases/'));

    assert.strictEqual(
      phaseFiles.length,
      0,
      `.planning/phases/ must not exist on feature-pr. Found: ${phaseFiles.join(', ')}`
    );
  });

  it('cherry-pick loop: commit messages are preserved on feature-pr', () => {
    const messages = run('git log --format="%s" main..feature-pr').trim().split('\n');

    assert.ok(
      messages.includes('feat: add app'),
      `Expected "feat: add app" in PR branch commits. Got: ${messages.join(', ')}`
    );
    assert.ok(
      messages.includes('docs: update state'),
      `Expected "docs: update state" in PR branch commits. Got: ${messages.join(', ')}`
    );
    assert.ok(
      messages.includes('feat: add utils + summary'),
      `Expected "feat: add utils + summary" in PR branch commits. Got: ${messages.join(', ')}`
    );
    assert.ok(
      messages.includes('feat: add index'),
      `Expected "feat: add index" in PR branch commits. Got: ${messages.join(', ')}`
    );
  });

  it('cherry-pick loop: "docs: add plan" (transient-only) is NOT on feature-pr', () => {
    const messages = run('git log --format="%s" main..feature-pr').trim().split('\n');

    assert.ok(
      !messages.includes('docs: add plan'),
      `"docs: add plan" (transient-only commit) must NOT appear on feature-pr. Got: ${messages.join(', ')}`
    );
  });
});
