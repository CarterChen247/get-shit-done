#!/usr/bin/env node
// ─── Built-in requires ──────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Shared utilities ───────────────────────────────────────────────────────

/**
 * Output result to stdout. If JSON exceeds 50KB, write to tmpfile and output @file: path.
 */
function output(result, raw, rawValue) {
  let data;
  if (raw && rawValue !== undefined) {
    data = String(rawValue);
  } else {
    const json = JSON.stringify(result, null, 2);
    if (json.length > 50000) {
      const tmpPath = path.join(os.tmpdir(), 'gxd-' + Date.now() + '.json');
      fs.writeFileSync(tmpPath, json, 'utf-8');
      data = '@file:' + tmpPath;
    } else {
      data = json;
    }
  }
  fs.writeSync(1, data);
}

/**
 * Write error to stderr and exit 1.
 */
function error(message) {
  fs.writeSync(2, 'Error: ' + message + '\n');
  process.exit(1);
}

/**
 * Normalize path separators to forward slashes.
 */
function toPosixPath(p) {
  return p.split(path.sep).join('/');
}

// ─── Path helpers ────────────────────────────────────────────────────────────

/**
 * Returns the .planning directory path for the given cwd.
 */
function planningDir(cwd) {
  return path.join(cwd, '.planning');
}

/**
 * Returns all key paths derived from cwd.
 */
function planningPaths(cwd) {
  const planning = planningDir(cwd);
  return {
    planning,
    phases: path.join(planning, 'phases'),
    roadmap: path.join(planning, 'ROADMAP.md'),
    state: path.join(planning, 'STATE.md'),
    config: path.join(planning, 'config.json'),
  };
}

/**
 * Ensures .planning/ exists; errors with actionable message if not.
 * Returns planningPaths(cwd).
 */
function requirePlanning(cwd) {
  if (!fs.existsSync(planningDir(cwd))) {
    error('.planning/ directory not found. Run project initialization first. (looked in: ' + cwd + ')');
  }
  return planningPaths(cwd);
}

// ─── Config loader ───────────────────────────────────────────────────────────

const CONFIG_DEFAULTS = { commit_docs: true };

/**
 * Load .planning/config.json and merge with defaults.
 */
function loadConfig(cwd) {
  const configPath = planningPaths(cwd).config;
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Object.assign({}, CONFIG_DEFAULTS, parsed);
  } catch {
    return Object.assign({}, CONFIG_DEFAULTS);
  }
}

// ─── Frontmatter parser ──────────────────────────────────────────────────────

/**
 * Split an inline YAML array body on commas, respecting quoted strings.
 */
function splitInlineArray(body) {
  const items = [];
  let current = '';
  let inQuote = null;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inQuote) {
      if (ch === inQuote) { inQuote = null; } else { current += ch; }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === ',') {
      const trimmed = current.trim();
      if (trimmed) items.push(trimmed);
      current = '';
    } else {
      current += ch;
    }
  }
  const trimmed = current.trim();
  if (trimmed) items.push(trimmed);
  return items;
}

/**
 * Parse YAML frontmatter from a markdown file.
 * Returns a plain object with parsed fields.
 */
function extractFrontmatter(content) {
  const frontmatter = {};
  try {
    const allBlocks = [...content.matchAll(/(?:^|\n)\s*---\r?\n([\s\S]+?)\r?\n---/g)];
    const match = allBlocks.length > 0 ? allBlocks[allBlocks.length - 1] : null;
    if (!match) return frontmatter;

    const yaml = match[1];
    const lines = yaml.split(/\r?\n/);
    let stack = [{ obj: frontmatter, key: null, indent: -1 }];

    for (const line of lines) {
      if (line.trim() === '') continue;
      const indentMatch = line.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1].length : 0;

      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
        stack.pop();
      }

      const current = stack[stack.length - 1];
      const keyMatch = line.match(/^(\s*)([a-zA-Z0-9_-]+):\s*(.*)/);

      if (keyMatch) {
        const key = keyMatch[2];
        const value = keyMatch[3].trim();

        if (value === '' || value === '[') {
          current.obj[key] = value === '[' ? [] : {};
          current.key = null;
          stack.push({ obj: current.obj[key], key: null, indent });
        } else if (value.startsWith('[') && value.endsWith(']')) {
          current.obj[key] = splitInlineArray(value.slice(1, -1));
          current.key = null;
        } else {
          current.obj[key] = value.replace(/^["']|["']$/g, '');
          current.key = null;
        }
      } else if (line.trim().startsWith('- ')) {
        const itemValue = line.trim().slice(2).replace(/^["']|["']$/g, '');
        if (typeof current.obj === 'object' && !Array.isArray(current.obj) && Object.keys(current.obj).length === 0) {
          const parent = stack.length > 1 ? stack[stack.length - 2] : null;
          if (parent) {
            for (const k of Object.keys(parent.obj)) {
              if (parent.obj[k] === current.obj) {
                parent.obj[k] = [itemValue];
                current.obj = parent.obj[k];
                break;
              }
            }
          }
        } else if (Array.isArray(current.obj)) {
          current.obj.push(itemValue);
        }
      }
    }
  } catch {
    // Return empty object on parse errors (T-01-04 mitigation)
  }
  return frontmatter;
}

/**
 * Reconstruct YAML frontmatter from an object.
 */
function reconstructFrontmatter(obj, body) {
  const lines = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else if (value.every(v => typeof v === 'string') && value.length <= 3 && value.join(', ').length < 60) {
        lines.push(`${key}: [${value.join(', ')}]`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${item}`);
        }
      }
    } else if (typeof value === 'object') {
      lines.push(`${key}:`);
      for (const [subkey, subval] of Object.entries(value)) {
        if (subval === null || subval === undefined) continue;
        if (Array.isArray(subval)) {
          if (subval.length === 0) {
            lines.push(`  ${subkey}: []`);
          } else {
            lines.push(`  ${subkey}:`);
            for (const item of subval) {
              lines.push(`    - ${item}`);
            }
          }
        } else {
          const sv = String(subval);
          lines.push(`  ${subkey}: ${sv.includes(':') || sv.includes('#') ? `"${sv}"` : sv}`);
        }
      }
    } else {
      const sv = String(value);
      if (sv.includes(':') || sv.includes('#') || sv.startsWith('[') || sv.startsWith('{')) {
        lines.push(`${key}: "${sv}"`);
      } else {
        lines.push(`${key}: ${sv}`);
      }
    }
  }
  const yamlStr = lines.join('\n');
  if (body !== undefined) {
    return `---\n${yamlStr}\n---\n${body}`;
  }
  return yamlStr;
}

// ─── State helpers ───────────────────────────────────────────────────────────

/**
 * Extract a field value from STATE.md body content.
 * Supports both **Field:** bold and plain Field: format.
 */
function stateExtractField(body, fieldName) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const boldPattern = new RegExp(`\\*\\*${escaped}:\\*\\*\\s*(.+)`, 'i');
  const boldMatch = body.match(boldPattern);
  if (boldMatch) return boldMatch[1].trim();
  const plainPattern = new RegExp(`^${escaped}:\\s*(.+)`, 'im');
  const plainMatch = body.match(plainPattern);
  return plainMatch ? plainMatch[1].trim() : null;
}

// ─── Phase helpers ───────────────────────────────────────────────────────────

/**
 * Strip leading zeros from a phase string: "01" -> "1"
 */
function normalizePhaseName(phase) {
  return String(phase).trim().replace(/^0+(\d)/, '$1');
}

/**
 * Check if a directory name matches the given normalized phase number.
 */
function phaseTokenMatches(dirName, normalized) {
  const m = dirName.match(/^(\d+[A-Z]?(?:\.\d+)*)/);
  if (!m) return false;
  return normalizePhaseName(m[1]) === normalized;
}

/**
 * Numeric comparison for phase numbers, handling decimals.
 */
function comparePhaseNum(a, b) {
  const parsePhaseNum = s => {
    const parts = String(s).split('.').map(Number);
    return parts[0] * 1000 + (parts[1] || 0);
  };
  return parsePhaseNum(a) - parsePhaseNum(b);
}

/**
 * Find the phase directory matching the given phase number.
 * Returns the full path or null if not found.
 */
function findPhaseDir(cwd, phaseNum) {
  const phasesDir = planningPaths(cwd).phases;
  if (!fs.existsSync(phasesDir)) return null;
  const normalized = normalizePhaseName(phaseNum);
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (phaseTokenMatches(entry.name, normalized)) {
        return path.join(phasesDir, entry.name);
      }
    }
  } catch {
    // ignore
  }
  return null;
}

// ─── Roadmap helpers ─────────────────────────────────────────────────────────

/**
 * Extract the current (non-archived) milestone section from ROADMAP.md content.
 * If no milestone headers, returns full content.
 */
function extractCurrentMilestone(content) {
  const milestonePattern = /^##\s+Milestone/m;
  if (!milestonePattern.test(content)) return content;

  // Find all milestone sections
  const sections = content.split(/(?=^##\s+Milestone)/m);
  // Return the last non-archived milestone, or the full content
  for (let i = sections.length - 1; i >= 0; i--) {
    if (!sections[i].includes('(archived)') && !sections[i].includes('(Archived)')) {
      return sections[i];
    }
  }
  return content;
}

/**
 * Find the Phase N section in ROADMAP content.
 * Returns all text until next ### or end.
 */
function searchPhaseInContent(content, phaseNum) {
  const normalized = normalizePhaseName(phaseNum);
  // Match "### Phase N:" or "### Phase N " style headings
  const phasePattern = new RegExp(`###\\s+Phase\\s+${normalized.replace('.', '\\.')}[:\\s]`, 'm');
  const match = content.match(phasePattern);
  if (!match) return null;

  const start = match.index;
  const after = content.slice(start);
  // Find next ### heading (but not the current one)
  const nextSection = after.slice(after.indexOf('\n')).match(/^###/m);
  if (nextSection) {
    const nextIdx = after.indexOf('\n') + nextSection.index;
    return after.slice(0, nextIdx).trim();
  }
  return after.trim();
}

// ─── Arg parsing helpers ─────────────────────────────────────────────────────

/**
 * Extract named --flag <value> pairs from an args array.
 */
function parseNamedArgs(args, valueFlags = [], booleanFlags = []) {
  const result = {};
  for (const flag of valueFlags) {
    const idx = args.indexOf(`--${flag}`);
    result[flag] = idx !== -1 && args[idx + 1] !== undefined && !args[idx + 1].startsWith('--')
      ? args[idx + 1]
      : null;
  }
  for (const flag of booleanFlags) {
    result[flag] = args.includes(`--${flag}`);
  }
  return result;
}

/**
 * Collect all tokens after --flag until the next --flag or end of args.
 */
function parseMultiwordArg(args, flag) {
  const idx = args.indexOf(`--${flag}`);
  if (idx === -1) return null;
  const tokens = [];
  for (let i = idx + 1; i < args.length; i++) {
    if (args[i].startsWith('--')) break;
    tokens.push(args[i]);
  }
  return tokens.length > 0 ? tokens.join(' ') : null;
}

// ─── Command implementations ─────────────────────────────────────────────────

/**
 * Command 1: roadmap get-phase <N>
 * Extract phase section from ROADMAP.md
 */
function cmdRoadmapGetPhase(cwd, phaseNum, raw) {
  if (!phaseNum) error('Usage: roadmap get-phase <phase-number>');
  const paths = requirePlanning(cwd);
  let content;
  try {
    content = fs.readFileSync(paths.roadmap, 'utf-8');
  } catch {
    error('ROADMAP.md not found in ' + paths.roadmap);
  }
  const milestoneContent = extractCurrentMilestone(content);
  const phaseSection = searchPhaseInContent(milestoneContent, phaseNum);
  if (!phaseSection) {
    error('Phase ' + phaseNum + ' not found in ROADMAP.md');
  }
  output({ phase_number: phaseNum, content: phaseSection }, raw, phaseSection);
}

/**
 * Command 2: state-snapshot
 * Structured parse of STATE.md body
 */
function cmdStateSnapshot(cwd, raw) {
  const paths = requirePlanning(cwd);
  let content;
  try {
    content = fs.readFileSync(paths.state, 'utf-8');
  } catch {
    error('STATE.md not found in ' + paths.state);
  }

  const frontmatter = extractFrontmatter(content);

  // Extract body (after frontmatter)
  const bodyMatch = content.match(/^---[\s\S]+?---\r?\n([\s\S]*)$/);
  const body = bodyMatch ? bodyMatch[1] : content;

  // Parse Current Position section
  const posSection = body.match(/##\s+Current Position\s*\n([\s\S]*?)(?=\n##|$)/);
  const posContent = posSection ? posSection[1] : body;
  const phase = stateExtractField(posContent, 'Phase') || frontmatter.current_phase || null;
  const plan = stateExtractField(posContent, 'Plan') || null;
  const status = stateExtractField(posContent, 'Status') || frontmatter.status || null;

  // Parse Decisions section
  const decisionsSection = body.match(/###\s+Decisions\s*\n([\s\S]*?)(?=\n###|\n##|$)/);
  const decisions = [];
  if (decisionsSection) {
    const decisionLines = decisionsSection[1].split('\n');
    for (const line of decisionLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ') && trimmed.length > 2) {
        decisions.push(trimmed.slice(2));
      }
    }
  }

  // Parse Blockers section
  const blockersSection = body.match(/###\s+Blockers[^#]*\n([\s\S]*?)(?=\n###|\n##|$)/);
  const blockers = [];
  if (blockersSection) {
    const blockerLines = blockersSection[1].split('\n');
    for (const line of blockerLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ') && trimmed.length > 2) {
        blockers.push(trimmed.slice(2));
      }
    }
  }

  // Parse Pending Todos section
  const todosSection = body.match(/###\s+Pending Todos\s*\n([\s\S]*?)(?=\n###|\n##|$)/);
  const todos = [];
  if (todosSection) {
    const todoLines = todosSection[1].split('\n');
    for (const line of todoLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ') && trimmed.length > 2) {
        todos.push(trimmed.slice(2));
      }
    }
  }

  output({
    frontmatter,
    current_position: { phase, plan, status },
    decisions,
    blockers,
    todos,
  }, raw);
}

/**
 * Command 3: find-phase <N>
 * Locate phase directory by number
 */
function cmdFindPhase(cwd, phaseNum, raw) {
  if (!phaseNum) error('Usage: find-phase <phase-number>');
  requirePlanning(cwd);
  const fullPath = findPhaseDir(cwd, phaseNum);
  if (fullPath) {
    const relativePath = toPosixPath(path.relative(cwd, fullPath));
    output({ phase: phaseNum, directory: relativePath, exists: true }, raw, relativePath);
  } else {
    output({ phase: phaseNum, directory: null, exists: false }, raw, '');
  }
}

/**
 * Command 4: config-get <key>
 * Read a value from .planning/config.json using dot-notation path
 */
function cmdConfigGet(cwd, keyPath, raw) {
  if (!keyPath) error('Usage: config-get <key.path>');
  requirePlanning(cwd);
  const config = loadConfig(cwd);

  const keys = keyPath.split('.');
  let current = config;
  for (const key of keys) {
    if (current === undefined || current === null || typeof current !== 'object') {
      output({ key: keyPath, value: null }, raw, '');
      return;
    }
    current = current[key];
  }

  if (current === undefined) {
    output({ key: keyPath, value: null }, raw, '');
    return;
  }

  output({ key: keyPath, value: current }, raw, String(current));
}

/**
 * Command 5: progress bar
 * Render ASCII progress bar from STATE.md
 */
function cmdProgressRender(cwd, format, raw) {
  const paths = requirePlanning(cwd);
  let content = '';
  try {
    content = fs.readFileSync(paths.state, 'utf-8');
  } catch {
    // Use zeros if STATE.md missing
  }

  const fm = extractFrontmatter(content);
  const progressData = fm.progress || {};
  const completed = parseInt(String(progressData.completed_plans || '0'), 10) || 0;
  const total = parseInt(String(progressData.total_plans || '0'), 10) || 0;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Render ASCII bar: [████░░░░░░] 40% (4/10 plans)
  const barWidth = 10;
  const filled = Math.round((percent / 100) * barWidth);
  const empty = barWidth - filled;
  const bar = '[' + '\u2588'.repeat(filled) + '\u2591'.repeat(empty) + '] ' + percent + '% (' + completed + '/' + total + ' plans)';

  output({ percent, completed, total, bar }, raw, bar);
}

/**
 * Command 6: summary-extract <path> [--fields f1,f2]
 * Extract frontmatter fields from a SUMMARY.md file
 */
function cmdSummaryExtract(cwd, filePath, fieldsArg, raw) {
  if (!filePath) error('Usage: summary-extract <path> [--fields field1,field2]');

  // Null byte guard (T-01-01 mitigation)
  if (filePath.includes('\0')) error('path contains null bytes');

  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  let content;
  try {
    content = fs.readFileSync(fullPath, 'utf-8');
  } catch {
    error('File not found: ' + filePath);
  }

  const fm = extractFrontmatter(content);

  const defaultFields = ['one_liner', 'status', 'phase', 'plan'];
  const fields = fieldsArg ? fieldsArg.split(',').map(f => f.trim()) : defaultFields;

  const extractedData = {};
  for (const field of fields) {
    if (fm[field] !== undefined) {
      extractedData[field] = fm[field];
    }
  }

  output(extractedData, raw);
}

/**
 * Command 7: audit-uat
 * Scan phase directories for UAT.md files and return status
 */
function cmdAuditUat(cwd, raw) {
  const paths = requirePlanning(cwd);
  const phasesWithUat = [];
  let totalFiles = 0;

  if (!fs.existsSync(paths.phases)) {
    output({ phases_with_uat: [], total_files: 0, summary: { total_items: 0 } }, raw);
    return;
  }

  try {
    const phaseDirs = fs.readdirSync(paths.phases, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);

    for (const phaseDir of phaseDirs) {
      const phasePath = path.join(paths.phases, phaseDir);
      try {
        const files = fs.readdirSync(phasePath);
        const uatFiles = files.filter(f => f.endsWith('-UAT.md') || f === 'UAT.md');

        for (const uatFile of uatFiles) {
          totalFiles++;
          const uatPath = path.join(phasePath, uatFile);
          let uatStatus = 'unknown';
          try {
            const uatContent = fs.readFileSync(uatPath, 'utf-8');
            const lines = uatContent.split('\n').slice(0, 20).join('\n');
            if (/status:\s*diagnosed/i.test(lines)) uatStatus = 'diagnosed';
            else if (/status:\s*partial/i.test(lines)) uatStatus = 'partial';
            else if (/status:\s*complete/i.test(lines)) uatStatus = 'complete';
            else if (/status:\s*pending/i.test(lines)) uatStatus = 'pending';
          } catch { /* skip unreadable files */ }

          phasesWithUat.push({
            phase: phaseDir,
            file: uatFile,
            status: uatStatus,
          });
        }
      } catch { /* skip unreadable phase dirs */ }
    }
  } catch { /* skip if phases dir unreadable */ }

  output({
    phases_with_uat: phasesWithUat,
    total_files: totalFiles,
    summary: { total_items: totalFiles },
  }, raw);
}

/**
 * Command 8: init progress
 * Return full JSON contract for gxd:progress skill
 * Handles missing .planning/ gracefully by returning roadmap_exists: false
 */
function cmdInitProgress(cwd, raw) {
  const paths = planningPaths(cwd);

  const roadmapExists = fs.existsSync(paths.roadmap);
  const stateExists = fs.existsSync(paths.state);
  const projectExists = fs.existsSync(path.join(cwd, '.planning', 'PROJECT.md'));
  const configPath = paths.config;

  if (!roadmapExists) {
    // Graceful early return when no roadmap (handles --cwd /tmp and similar)
    output({
      commit_docs: true,
      milestone_version: 'v1.0',
      milestone_name: 'milestone',
      phases: [],
      phase_count: 0,
      completed_count: 0,
      in_progress_count: 0,
      current_phase: null,
      next_phase: null,
      paused_at: null,
      has_work_in_progress: false,
      project_exists: projectExists,
      roadmap_exists: false,
      state_exists: stateExists,
      state_path: toPosixPath(path.relative(cwd, paths.state)),
      roadmap_path: toPosixPath(path.relative(cwd, paths.roadmap)),
      project_path: '.planning/PROJECT.md',
      config_path: toPosixPath(path.relative(cwd, configPath)),
      project_root: cwd,
    }, raw);
    return;
  }

  // Read ROADMAP.md
  let roadmapContent = '';
  try {
    roadmapContent = fs.readFileSync(paths.roadmap, 'utf-8');
  } catch {
    error('Failed to read ROADMAP.md');
  }

  // Extract milestone info from ROADMAP frontmatter or STATE.md frontmatter
  let milestoneVersion = 'v1.0';
  let milestoneName = 'milestone';

  // Try STATE.md frontmatter for milestone info
  if (stateExists) {
    try {
      const stateContent = fs.readFileSync(paths.state, 'utf-8');
      const stateFm = extractFrontmatter(stateContent);
      if (stateFm.milestone) milestoneVersion = stateFm.milestone;
      if (stateFm.milestone_name) milestoneName = stateFm.milestone_name;
    } catch { /* use defaults */ }
  }

  // Parse phases from ROADMAP.md
  // Match "- [ ] **Phase N: Name**" and "- [x] **Phase N: Name**" patterns
  const phaseLinePattern = /^-\s+\[([ x])\]\s+\*\*Phase\s+(\d+(?:\.\d+)?)[:\s]+([^*]+)\*\*/gm;
  const phaseMatches = [...roadmapContent.matchAll(phaseLinePattern)];

  const phases = [];
  let completedCount = 0;
  let inProgressCount = 0;
  let currentPhase = null;
  let nextPhase = null;

  for (const match of phaseMatches) {
    const checked = match[1] === 'x';
    const phaseNum = match[2];
    const phaseName = match[3].trim().replace(/-\s*$/, '').trim();

    // Locate phase directory
    const phaseDir = findPhaseDir(cwd, phaseNum);
    const directory = phaseDir ? toPosixPath(path.relative(cwd, phaseDir)) : null;

    // Count plans and summaries in phase directory
    let planCount = 0;
    let summaryCount = 0;
    let hasResearch = false;

    if (phaseDir && fs.existsSync(phaseDir)) {
      try {
        const dirFiles = fs.readdirSync(phaseDir);
        planCount = dirFiles.filter(f => f.endsWith('-PLAN.md')).length;
        summaryCount = dirFiles.filter(f => f.endsWith('-SUMMARY.md')).length;
        hasResearch = dirFiles.some(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');
      } catch { /* skip */ }
    }

    // Determine status
    let status;
    if (checked) {
      status = 'complete';
      completedCount++;
    } else if (planCount > 0 && summaryCount > 0 && summaryCount >= planCount) {
      status = 'complete'; // All plans have summaries
      completedCount++;
    } else if (planCount > 0) {
      status = 'in_progress';
      inProgressCount++;
      if (!currentPhase) currentPhase = phaseNum;
    } else if (hasResearch) {
      status = 'in_progress';
      inProgressCount++;
      if (!currentPhase) currentPhase = phaseNum;
    } else if (directory) {
      status = 'pending';
    } else {
      status = 'not_started';
    }

    phases.push({
      number: phaseNum,
      name: phaseName,
      directory,
      status,
      plan_count: planCount,
      summary_count: summaryCount,
      has_research: hasResearch,
    });
  }

  // Find next pending phase after current
  if (currentPhase) {
    const currentIdx = phases.findIndex(p => p.number === currentPhase);
    for (let i = currentIdx + 1; i < phases.length; i++) {
      if (phases[i].status === 'pending' || phases[i].status === 'not_started') {
        nextPhase = phases[i].number;
        break;
      }
    }
  } else if (completedCount < phases.length) {
    // No current phase — find first pending
    const firstPending = phases.find(p => p.status === 'pending' || p.status === 'not_started');
    if (firstPending) {
      nextPhase = firstPending.number;
      currentPhase = firstPending.number;
    }
  }

  // Get paused_at from STATE.md frontmatter
  let pausedAt = null;
  if (stateExists) {
    try {
      const stateContent = fs.readFileSync(paths.state, 'utf-8');
      const stateFm = extractFrontmatter(stateContent);
      pausedAt = stateFm.stopped_at || null;
    } catch { /* use null */ }
  }

  const config = loadConfig(cwd);

  output({
    commit_docs: config.commit_docs,
    milestone_version: milestoneVersion,
    milestone_name: milestoneName,
    phases,
    phase_count: phases.length,
    completed_count: completedCount,
    in_progress_count: inProgressCount,
    current_phase: currentPhase,
    next_phase: nextPhase,
    paused_at: pausedAt,
    has_work_in_progress: inProgressCount > 0,
    project_exists: projectExists,
    roadmap_exists: true,
    state_exists: stateExists,
    state_path: toPosixPath(path.relative(cwd, paths.state)),
    roadmap_path: toPosixPath(path.relative(cwd, paths.roadmap)),
    project_path: '.planning/PROJECT.md',
    config_path: toPosixPath(path.relative(cwd, configPath)),
    project_root: cwd,
  }, raw);
}

// ─── CLI Router ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // Parse --cwd flag (T-01-01 mitigation: validate directory exists)
  let cwd = process.cwd();
  const cwdEqArg = args.find(arg => arg.startsWith('--cwd='));
  const cwdIdx = args.indexOf('--cwd');
  if (cwdEqArg) {
    const value = cwdEqArg.slice('--cwd='.length).trim();
    if (!value) error('Missing value for --cwd');
    args.splice(args.indexOf(cwdEqArg), 1);
    cwd = path.resolve(value);
  } else if (cwdIdx !== -1) {
    const value = args[cwdIdx + 1];
    if (!value || value.startsWith('--')) error('Missing value for --cwd');
    args.splice(cwdIdx, 2);
    cwd = path.resolve(value);
  }

  // Validate --cwd is a real directory
  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
    error('Invalid --cwd: ' + cwd);
  }

  // Parse --raw flag
  const rawIdx = args.indexOf('--raw');
  const raw = rawIdx !== -1;
  if (raw) args.splice(rawIdx, 1);

  // Parse --pick flag for dot-notation field extraction
  const pickIdx = args.indexOf('--pick');
  let pick = null;
  if (pickIdx !== -1 && args[pickIdx + 1]) {
    pick = args[pickIdx + 1];
    args.splice(pickIdx, 2);
  }

  const command = args[0];

  if (!command) {
    error('Unknown command: (none). Run without arguments for usage.');
  }

  let result;

  switch (command) {
    // ─── Roadmap ─────────────────────────────────────────────────────────
    case 'roadmap': {
      const sub = args[1];
      if (sub === 'get-phase') {
        cmdRoadmapGetPhase(cwd, args[2], raw);
      } else if (sub === 'analyze') {
        error('Command not yet implemented: roadmap analyze (plan 01-02)');
      } else if (sub === 'update-plan-progress') {
        error('Command not yet implemented: roadmap update-plan-progress (plan 01-02)');
      } else {
        error('Unknown roadmap subcommand: ' + sub);
      }
      return;
    }

    // ─── State ───────────────────────────────────────────────────────────
    case 'state-snapshot': {
      cmdStateSnapshot(cwd, raw);
      return;
    }
    case 'state': {
      const sub = args[1];
      if (sub === 'begin-phase') {
        error('Command not yet implemented: state begin-phase (plan 01-02)');
      } else if (sub === 'planned-phase') {
        error('Command not yet implemented: state planned-phase (plan 01-02)');
      } else {
        error('Unknown state subcommand: ' + sub);
      }
      return;
    }

    // ─── Phase lookup ─────────────────────────────────────────────────────
    case 'find-phase': {
      cmdFindPhase(cwd, args[1], raw);
      return;
    }

    // ─── Config ──────────────────────────────────────────────────────────
    case 'config-get': {
      cmdConfigGet(cwd, args[1], raw);
      return;
    }
    case 'config-set': {
      error('Command not yet implemented: config-set (plan 01-02)');
      return;
    }

    // ─── Progress ────────────────────────────────────────────────────────
    case 'progress': {
      cmdProgressRender(cwd, args[1], raw);
      return;
    }

    // ─── Summary extract ─────────────────────────────────────────────────
    case 'summary-extract': {
      const filePath = args[1];
      const fieldsIdx = args.indexOf('--fields');
      const fieldsArg = fieldsIdx !== -1 ? args[fieldsIdx + 1] : null;
      cmdSummaryExtract(cwd, filePath, fieldsArg, raw);
      return;
    }

    // ─── Audit UAT ───────────────────────────────────────────────────────
    case 'audit-uat': {
      cmdAuditUat(cwd, raw);
      return;
    }

    // ─── Init ────────────────────────────────────────────────────────────
    case 'init': {
      const sub = args[1];
      if (sub === 'progress') {
        cmdInitProgress(cwd, raw);
      } else if (sub === 'plan-phase') {
        error('Command not yet implemented: init plan-phase (plan 01-02)');
      } else if (sub === 'execute-phase') {
        error('Command not yet implemented: init execute-phase (plan 01-02)');
      } else {
        error('Unknown init subcommand: ' + sub);
      }
      return;
    }

    // ─── Agent skills ────────────────────────────────────────────────────
    case 'agent-skills': {
      error('Command not yet implemented: agent-skills (plan 01-02)');
      return;
    }

    // ─── Phase plan index ────────────────────────────────────────────────
    case 'phase-plan-index': {
      error('Command not yet implemented: phase-plan-index (plan 01-03)');
      return;
    }

    // ─── Phase complete ──────────────────────────────────────────────────
    case 'phase': {
      const sub = args[1];
      if (sub === 'complete') {
        error('Command not yet implemented: phase complete (plan 01-03)');
      } else {
        error('Unknown phase subcommand: ' + sub);
      }
      return;
    }

    default:
      error('Unknown command: ' + args.join(' ') + '. Run without arguments for usage.');
  }
}

main().catch(e => { error(e.message || String(e)); });
