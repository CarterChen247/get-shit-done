'use strict';

/**
 * Static validation tests for gxd:branch-pr SKILL.md
 *
 * Validates that the SKILL.md at .claude/skills/gxd-pr-branch/SKILL.md
 * satisfies all four phase requirements (PR-01 through PR-04) and
 * key locked decisions (D-11, D-12, D-14, D-15).
 *
 * These are content tests — they verify the SKILL.md text contains the
 * correct git primitives and patterns without executing the skill.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skillPath = path.resolve(__dirname, '..', '.claude', 'skills', 'gxd-pr-branch', 'SKILL.md');

describe('gxd-pr-branch SKILL.md validation', () => {
  let content;

  function getContent() {
    if (!content) {
      content = fs.readFileSync(skillPath, 'utf-8');
    }
    return content;
  }

  test('setup: SKILL.md file exists and is non-empty', () => {
    assert.ok(fs.existsSync(skillPath), `SKILL.md must exist at ${skillPath}`);
    const c = fs.readFileSync(skillPath, 'utf-8');
    assert.ok(c.length > 0, 'SKILL.md must not be empty');
    content = c;
  });

  test('frontmatter: contains name: gxd-pr-branch', () => {
    const c = getContent();
    assert.ok(
      c.includes('name: gxd-pr-branch'),
      'SKILL.md frontmatter must contain "name: gxd-pr-branch"'
    );
  });

  test('frontmatter: user-invocable is true', () => {
    const c = getContent();
    assert.ok(
      c.includes('user-invocable: true'),
      'SKILL.md frontmatter must contain "user-invocable: true"'
    );
  });

  test('frontmatter: allowed-tools includes Bash and AskUserQuestion but NOT Read', () => {
    const c = getContent();
    assert.ok(
      c.includes('Bash'),
      'SKILL.md allowed-tools must include Bash'
    );
    assert.ok(
      c.includes('AskUserQuestion'),
      'SKILL.md allowed-tools must include AskUserQuestion'
    );
    // Read is NOT allowed per RESEARCH — branch-pr needs no file reads
    // Extract just the frontmatter section to check this more precisely
    const frontmatterMatch = c.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      assert.ok(
        !frontmatter.includes('Read'),
        'SKILL.md frontmatter allowed-tools must NOT include Read'
      );
    }
  });

  // PR-01: Creates a {branch}-pr branch
  test('PR-01: contains git checkout -b for branch creation', () => {
    const c = getContent();
    assert.ok(
      c.includes('git checkout -b'),
      'SKILL.md must contain "git checkout -b" for branch creation (PR-01)'
    );
  });

  test('PR-01: contains {CURRENT_BRANCH}-pr pattern for PR branch name', () => {
    const c = getContent();
    assert.ok(
      c.includes('CURRENT_BRANCH') && (c.includes('${CURRENT_BRANCH}-pr') || c.includes('"$CURRENT_BRANCH"-pr') || c.includes('"${CURRENT_BRANCH}-pr"')),
      'SKILL.md must reference ${CURRENT_BRANCH}-pr pattern (PR-01)'
    );
  });

  // PR-02: Preserves structural planning files
  test('PR-02: references STATE.md as structural file', () => {
    const c = getContent();
    assert.ok(
      c.includes('STATE.md'),
      'SKILL.md must reference STATE.md as structural file (PR-02)'
    );
  });

  test('PR-02: references ROADMAP.md as structural file', () => {
    const c = getContent();
    assert.ok(
      c.includes('ROADMAP.md'),
      'SKILL.md must reference ROADMAP.md as structural file (PR-02)'
    );
  });

  test('PR-02: references MILESTONES.md as structural file', () => {
    const c = getContent();
    assert.ok(
      c.includes('MILESTONES.md'),
      'SKILL.md must reference MILESTONES.md as structural file (PR-02)'
    );
  });

  test('PR-02: references PROJECT.md as structural file', () => {
    const c = getContent();
    assert.ok(
      c.includes('PROJECT.md'),
      'SKILL.md must reference PROJECT.md as structural file (PR-02)'
    );
  });

  test('PR-02: references REQUIREMENTS.md as structural file', () => {
    const c = getContent();
    assert.ok(
      c.includes('REQUIREMENTS.md'),
      'SKILL.md must reference REQUIREMENTS.md as structural file (PR-02)'
    );
  });

  test('PR-02: references .planning/milestones/ for milestone archive', () => {
    const c = getContent();
    assert.ok(
      c.includes('.planning/milestones/'),
      'SKILL.md must reference .planning/milestones/ for milestone archive preservation (PR-02)'
    );
  });

  // PR-03: Cherry-pick with transient dir stripping
  test('PR-03: contains git cherry-pick with --no-commit', () => {
    const c = getContent();
    assert.ok(
      c.includes('git cherry-pick') && c.includes('--no-commit'),
      'SKILL.md must contain "git cherry-pick" with "--no-commit" (PR-03)'
    );
  });

  test('PR-03: contains git rm -r --cached for transient dir stripping', () => {
    const c = getContent();
    assert.ok(
      c.includes('git rm -r --cached'),
      'SKILL.md must contain "git rm -r --cached" for transient dir stripping (PR-03)'
    );
  });

  test('PR-03: strips all 9 transient dirs (phases, quick, research, threads, todos, debug, seeds, codebase, ui-reviews)', () => {
    const c = getContent();
    const transientDirs = ['phases', 'quick', 'research', 'threads', 'todos', 'debug', 'seeds', 'codebase', 'ui-reviews'];
    for (const dir of transientDirs) {
      assert.ok(
        c.includes(dir),
        `SKILL.md must reference transient dir "${dir}" in strip loop (PR-03)`
      );
    }
  });

  test('PR-03: contains git diff --cached --quiet for empty commit detection', () => {
    const c = getContent();
    assert.ok(
      c.includes('git diff --cached --quiet'),
      'SKILL.md must contain "git diff --cached --quiet" for empty commit detection (PR-03)'
    );
  });

  test('PR-03: contains git commit -C for original commit message reuse', () => {
    const c = getContent();
    assert.ok(
      c.includes('git commit -C'),
      'SKILL.md must contain "git commit -C" for commit message reuse (PR-03)'
    );
  });

  // PR-04: Zero node/gxd-tools dependency
  test('PR-04: does NOT contain "node " anywhere in file', () => {
    const c = getContent();
    // Allow "node:test" style references in comments but no actual node subprocess calls
    const hasNodeCall = /\bnode\s+[^:"]/.test(c);
    assert.ok(
      !hasNodeCall,
      'SKILL.md must not contain "node " subprocess calls — pure git only (PR-04)'
    );
  });

  test('PR-04: does NOT contain "gxd-tools" anywhere in file', () => {
    const c = getContent();
    assert.ok(
      !c.includes('gxd-tools'),
      'SKILL.md must not reference gxd-tools — zero node dependency (PR-04)'
    );
  });

  // D-11: Dirty tree detection
  test('D-11: contains git status --porcelain for dirty tree detection', () => {
    const c = getContent();
    assert.ok(
      c.includes('git status --porcelain'),
      'SKILL.md must contain "git status --porcelain" for dirty tree detection (D-11)'
    );
  });

  // D-12: Skip merge commits
  test('D-12: contains --no-merges for skipping merge commits', () => {
    const c = getContent();
    assert.ok(
      c.includes('--no-merges'),
      'SKILL.md must contain "--no-merges" for skipping merge commits (D-12)'
    );
  });

  // D-14: Overwrite prompt via AskUserQuestion
  test('D-14: contains AskUserQuestion for overwrite prompt when PR branch exists', () => {
    const c = getContent();
    assert.ok(
      c.includes('AskUserQuestion'),
      'SKILL.md must use AskUserQuestion for overwrite confirmation (D-14)'
    );
  });

  // D-15: Return to original branch after completion
  test('D-15: contains git checkout "$CURRENT_BRANCH" to return to original branch', () => {
    const c = getContent();
    assert.ok(
      c.includes('git checkout "$CURRENT_BRANCH"') || c.includes("git checkout \"$CURRENT_BRANCH\""),
      'SKILL.md must contain git checkout "$CURRENT_BRANCH" to return to original branch after completion (D-15)'
    );
  });
});
