# gxd Skills

## What This Is

A self-contained set of Claude Code skill files and a helper script (`gxd-tools.cjs`) that replicate the core GSD workflow experience — without requiring marketplace installation. Designed to be copy-pasted into any repo's `.claude/commands/` directory, fully auditable, no network calls, no hooks, no symlinks.

## Core Value

Drop four skill files into any repo and get plan → execute → verify → PR workflow with the same experience as GSD, but fully owned and auditable.

## Requirements

### Validated

- [x] `gxd:plan-phase` — Research phase, generate PLAN.md with task breakdown — Validated in Phase 3: Plan-Phase Pipeline

### Active

- [ ] `gxd:execute-phase` — Execute plans with atomic commits and wave-based parallelization
- [ ] `gxd:progress` — Check active phase status, show what's done and what's next
- [ ] `gxd:branch-pr` — Create clean PR branch filtering out `.planning/` commits
- [ ] `gxd-tools.cjs` — Audited copy of `gsd-tools.cjs` with gxd path references

### Out of Scope

- Full GSD suite (30+ skills) — scope is the 4 most-used workflow skills only; expand later as needed
- Marketplace/npm distribution — copy-paste is the intentional distribution model
- New-project initialization (`gxd:new-project`) — the user is familiar with GSD questioning flow; skip for v1
- Hooks or symlinks — explicitly excluded by design (the whole point)

## Context

- Source of truth: `/Users/carterchen/Documents/Github/get-shit-done/.claude/get-shit-done/` contains the original GSD skill implementations to adapt from
- Target: files will be dropped into `.claude/commands/` in the user's workspace repos (e.g. `cardbox2026`)
- `gsd-tools.cjs` is 1090 lines, local-only (no network), handles state management, git commits, config parsing, and phase/roadmap operations
- Company policy triggered this: the "gstack" marketplace plugin was flagged for phoning home, adding hooks, and creating symlinks — the response is to own all plugin code directly
- Skills reference the helper script via a relative path like `node ".claude/bin/gxd-tools.cjs"`

## Constraints

- **Portability**: Skills must work with a fresh `.claude/commands/` drop-in — no global installs, no npm dependencies
- **Auditability**: Every file must be readable and understandable before use — no obfuscation
- **Network**: `gxd-tools.cjs` must make zero outbound network calls
- **Fidelity**: Maintain the same user-facing experience as GSD equivalents — same banners, checkpoints, commit patterns

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Copy `gsd-tools.cjs` rather than inline bash | Full fidelity to GSD behavior; user can audit the file before deploying | — Pending |
| 4 skills only for v1 | Ship the most-used ones first; expand based on real usage | — Pending |
| No `gxd:new-project` in v1 | User knows GSD's questioning flow; this is the least-used one-time skill | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-15 after Phase 3 completion — plan-phase pipeline agents and orchestrator skill built*
