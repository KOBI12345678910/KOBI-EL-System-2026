/**
 * Grand Aggregator — Mega-ERP Techno-Kol Uzi
 * סוכן-X100 — אגרגטור אב לדוחות QA
 *
 * Mission / משימה:
 *   Walk every `_qa-reports/*.md` file across the mono-repo, parse the
 *   light-weight YAML-ish headers that every QA / Agent report uses, walk
 *   `src/` to count the new modules produced by each swarm, walk `test/`
 *   to count the tests, and write a unified executive report at
 *   `_qa-reports/GRAND-FINAL.md`.
 *
 *   The aggregator is RULE #1 compliant: "לא מוחקים רק משדרגים ומגדלים" —
 *   we never delete, never overwrite non-GRAND files, and always skip
 *   missing reports gracefully.
 *
 * Public API:
 *   aggregateAll({ reportDirs, outputPath, srcDirs, testDirs, writeOutput })
 *     → Promise<AggregationResult>
 *
 *   parseReport(filePath, rawContent)       — pure parser, no I/O
 *   classifyAgent(id)                        — wave / swarm classifier
 *   classifyDomain(text)                     — domain (tax/payroll/crm/…)
 *   computeVerdict(summary)                  — Go / No-Go / Conditional
 *   renderGrandFinal(result)                 — bilingual Markdown
 *
 * Zero runtime deps — built-ins only: fs, path.
 *
 * Robustness notes:
 *   - Missing directories: skipped with a warning (result.warnings[]).
 *   - Unparseable files: kept in result.parse_failures[] with the error,
 *     never silently dropped.
 *   - Binary / non-markdown files in the reports directory: ignored.
 *   - Re-running is idempotent: the aggregator only writes to
 *     `GRAND-FINAL.md` and never mutates source reports.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── constants ─────────────────────────────────────────────────

const REPORT_GLOB_EXT = /\.md$/i;
const AGENT_ID_RE = /^(?:QA|AG|AGENT|WAVE|SWARM|Y)[-_]?([A-Z]?\d+[A-Z]?[-_]?\d*)/i;
const FILENAME_ID_RE = /^(QA|AG|AGENT|WAVE|SWARM|Y)[-_]([A-Z0-9-]+?)(?:[-_][a-z0-9][a-zA-Z0-9-]*)?\.md$/i;

// Severity ordering used for sorting action items & bug counts.
const SEVERITY_RANK = {
  CRITICAL: 5,
  BLOCKER: 5,
  HIGH: 4,
  MAJOR: 4,
  MEDIUM: 3,
  MODERATE: 3,
  LOW: 2,
  MINOR: 2,
  INFO: 1,
  INFORMATIONAL: 1,
};

const SEVERITY_LABEL_HE = {
  CRITICAL: 'קריטי',
  BLOCKER: 'חוסם',
  HIGH: 'גבוה',
  MAJOR: 'עיקרי',
  MEDIUM: 'בינוני',
  MODERATE: 'בינוני',
  LOW: 'נמוך',
  MINOR: 'זניח',
  INFO: 'מידע',
  INFORMATIONAL: 'מידע',
};

// Swarm / wave classifier — the project has grown through many swarms.
//   Waves 1-10   : foundational QA waves (agents 1..100, decimals allowed)
//   QA-01..20    : the 20-agent QA framework
//   Swarm-2 51-100: the second build swarm (IDs AG-51..AG-100)
//   Swarm-3 X-01..X-100: the AG-X## line (hundreds of AI modules)
//   Wave Y-001..Y-200: the Y-prefixed auxiliary wave
const SWARM_DEFINITIONS = [
  {
    id: 'qa-framework',
    label_en: 'QA-01..20 (20-Agent QA Framework)',
    label_he: 'מסגרת QA — 20 סוכנים',
    match(agentId) {
      if (!agentId) return false;
      const m = /^QA[-_]?(\d+)/i.exec(agentId);
      if (!m) return false;
      const n = Number(m[1]);
      return n >= 1 && n <= 20;
    },
  },
  {
    id: 'swarm-2',
    label_en: 'Swarm-2 (AG-51..AG-100)',
    label_he: 'נחיל-2 (AG-51..AG-100)',
    match(agentId) {
      const m = /^(?:AG|AGENT)[-_]?(\d+)$/i.exec(agentId || '');
      if (!m) return false;
      const n = Number(m[1]);
      return n >= 51 && n <= 100;
    },
  },
  {
    id: 'swarm-1',
    label_en: 'Swarm-1 (AG-01..AG-50)',
    label_he: 'נחיל-1 (AG-01..AG-50)',
    match(agentId) {
      const m = /^(?:AG|AGENT)[-_]?(\d+)$/i.exec(agentId || '');
      if (!m) return false;
      const n = Number(m[1]);
      return n >= 1 && n <= 50;
    },
  },
  {
    id: 'swarm-3',
    label_en: 'Swarm-3 (AG-X01..AG-X100)',
    label_he: 'נחיל-3 (AG-X01..AG-X100)',
    match(agentId) {
      return /^(?:AG|AGENT)[-_]?X\d+$/i.test(agentId || '');
    },
  },
  // NOTE: waves-1-10 must be checked BEFORE wave-y, since WAVE-1 would
  // otherwise match the broader wave-y regex.
  {
    id: 'waves-1-10',
    label_en: 'Waves 1-10 (Foundational)',
    label_he: 'גלים 1-10 (יסוד)',
    match(agentId) {
      return /^WAVE[-_]?(?:[1-9]|10)(?:\.\d+)?$/i.test(agentId || '');
    },
  },
  {
    id: 'wave-y',
    label_en: 'Wave Y-001..Y-200',
    label_he: 'גל Y-001..Y-200',
    match(agentId) {
      // Y-prefixed IDs only: Y-001..Y-200, WAVE-Y###.
      if (/^Y[-_]?\d+$/i.test(agentId || '')) return true;
      if (/^WAVE[-_]?Y\d+$/i.test(agentId || '')) return true;
      return false;
    },
  },
];

const UNCLASSIFIED_SWARM = {
  id: 'unclassified',
  label_en: 'Unclassified Reports',
  label_he: 'דוחות לא מסווגים',
};

// Domains used for module counting in src/.
//   label_en / label_he are displayed verbatim in the report.
//   keywords — case-insensitive substrings matched against the relative
//              path of each file inside src/.
const DOMAINS = [
  { id: 'tax', label_en: 'Tax & VAT', label_he: 'מסים ומע"מ',
    keywords: ['tax', 'vat', '/vat/', 'pcn', 'form-builder'] },
  { id: 'payroll', label_en: 'Payroll & HR', label_he: 'שכר ומשאבי אנוש',
    keywords: ['payroll', 'wage', 'hr/', 'bituach', 'pension'] },
  { id: 'crm', label_en: 'CRM & Sales', label_he: 'CRM ומכירות',
    keywords: ['crm', 'customer', 'lead', 'pipeline', 'supplier-portal'] },
  { id: 'wms', label_en: 'Warehouse & Logistics', label_he: 'לוגיסטיקה ומחסן',
    keywords: ['wms', 'warehouse', 'inventory', 'logistic', 'shipping'] },
  { id: 'finance', label_en: 'Finance & Accounting', label_he: 'כספים וחשבונאות',
    keywords: ['finance', 'bank', 'gl/', 'ledger', 'journal', 'reconcil', 'ap/', 'ar/', 'invoice'] },
  { id: 'observability', label_en: 'Observability & Ops',
    label_he: 'תצפיתיות ותפעול',
    keywords: ['observab', 'metric', 'logger', 'log-store', 'tracer', 'prom-metric', 'slo', 'apm',
               'uptime', 'status-page', 'alert', 'incident', 'health', 'profiler', 'ops/'] },
  { id: 'integrations', label_en: 'Integrations & Bridges',
    label_he: 'אינטגרציות וגשרים',
    keywords: ['integration', 'bridge', 'webhook', 'whatsapp', 'sms', 'email', 'connector', 'webhooks'] },
];

const UNCATEGORIZED_DOMAIN = { id: 'uncategorized', label_en: 'Uncategorized', label_he: 'שונות' };

// Completed statuses that count as "done" for completion-rate math.
const COMPLETED_STATUSES = new Set(['GREEN', 'DONE', 'COMPLETE', 'COMPLETED', 'PASS', 'PASSING', 'OK', 'SIGNED-OFF', 'SIGN-OFF', 'CLOSED']);
const FAILED_STATUSES = new Set(['RED', 'FAIL', 'FAILED', 'NO-GO', 'BLOCKED', 'BLOCKER']);
const PARTIAL_STATUSES = new Set(['YELLOW', 'AMBER', 'CONDITIONAL', 'GO-WITH-WARNINGS', 'PARTIAL', 'IN-PROGRESS', 'WIP', 'DRAFT']);

// ─── tiny utilities ────────────────────────────────────────────

function safeStat(p) {
  try { return fs.statSync(p); } catch { return null; }
}

function exists(p) {
  return safeStat(p) !== null;
}

function walkDir(root, { ext = null, onFile, onError } = {}) {
  if (!root || !exists(root)) return;
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch (err) {
      if (onError) onError(err, cur);
      continue;
    }
    for (const ent of entries) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) {
        // Skip noisy directories.
        if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist' || ent.name === 'coverage') continue;
        stack.push(full);
      } else if (ent.isFile()) {
        if (ext && !ext.test(ent.name)) continue;
        try {
          onFile && onFile(full, ent);
        } catch (err) {
          if (onError) onError(err, full);
        }
      }
    }
  }
}

function toLines(text) {
  if (!text) return [];
  return String(text).replace(/\r\n/g, '\n').split('\n');
}

function uniq(list) {
  return Array.from(new Set(list.filter((x) => x !== undefined && x !== null && x !== '')));
}

function normStatus(raw) {
  if (!raw) return null;
  const cleaned = String(raw)
    .toUpperCase()
    .replace(/\s*[—–-]\s*.*$/, '')
    .replace(/[*`_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Direct hits first.
  if (COMPLETED_STATUSES.has(cleaned)) return cleaned;
  if (FAILED_STATUSES.has(cleaned)) return cleaned;
  if (PARTIAL_STATUSES.has(cleaned)) return cleaned;
  // Fall-back token scan.
  for (const tok of cleaned.split(/\s+/)) {
    if (COMPLETED_STATUSES.has(tok)) return tok;
    if (FAILED_STATUSES.has(tok)) return tok;
    if (PARTIAL_STATUSES.has(tok)) return tok;
  }
  return cleaned;
}

function statusBucket(status) {
  if (!status) return 'unknown';
  const s = String(status).toUpperCase();
  if (COMPLETED_STATUSES.has(s)) return 'completed';
  if (FAILED_STATUSES.has(s)) return 'failed';
  if (PARTIAL_STATUSES.has(s)) return 'partial';
  // Token scan fallback.
  for (const tok of s.split(/[^A-Z-]+/)) {
    if (COMPLETED_STATUSES.has(tok)) return 'completed';
    if (FAILED_STATUSES.has(tok)) return 'failed';
    if (PARTIAL_STATUSES.has(tok)) return 'partial';
  }
  return 'unknown';
}

// ─── classification ────────────────────────────────────────────

function classifyAgent(agentId) {
  if (!agentId) return UNCLASSIFIED_SWARM;
  for (const def of SWARM_DEFINITIONS) {
    if (def.match(agentId)) return def;
  }
  return UNCLASSIFIED_SWARM;
}

function classifyDomain(text) {
  if (!text) return UNCATEGORIZED_DOMAIN;
  const lower = String(text).toLowerCase();
  for (const d of DOMAINS) {
    if (d.keywords.some((kw) => lower.includes(kw))) return d;
  }
  return UNCATEGORIZED_DOMAIN;
}

// ─── report parser ─────────────────────────────────────────────

/**
 * parseReport — pure parser. Given a filePath (for heuristics) and the raw
 * markdown content, returns a structured record. Never throws; errors become
 * `parse_error` on the result object so the aggregator can keep running.
 */
function parseReport(filePath, rawContent) {
  const base = path.basename(filePath || '');
  const result = {
    file: filePath || null,
    basename: base,
    agent_id: null,
    title: null,
    title_en: null,
    title_he: null,
    module: null,
    status: null,
    status_bucket: 'unknown',
    domain: null,
    swarm: null,
    bug_counts: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
    critical_items: [],   // { id, title, severity, source }
    recommendations: [],  // string list
    test_counts: { cases: 0, suites: 0, files: 0 },
    deliverables: [],     // file paths referenced in the report
    errors: [],
    parse_error: null,
  };

  if (!rawContent || typeof rawContent !== 'string') {
    result.parse_error = 'empty-content';
    return result;
  }

  const lines = toLines(rawContent);

  // 1) Agent ID — from filename first (most reliable), then first heading.
  const fnMatch = FILENAME_ID_RE.exec(base);
  if (fnMatch) {
    result.agent_id = `${fnMatch[1].toUpperCase()}-${fnMatch[2].toUpperCase()}`;
  } else {
    const firstHeading = lines.find((l) => l.startsWith('# '));
    if (firstHeading) {
      const m = AGENT_ID_RE.exec(firstHeading.replace(/^#\s*/, ''));
      if (m) {
        // Reconstruct prefix.
        const prefixMatch = /^(QA|AG|AGENT|WAVE|SWARM|Y)/i.exec(firstHeading.replace(/^#\s*/, ''));
        result.agent_id = `${(prefixMatch ? prefixMatch[1] : 'AG').toUpperCase()}-${m[1]}`;
      }
    }
  }

  // 2) Title — first top-level heading, preserved verbatim.
  for (const line of lines) {
    if (line.startsWith('# ')) {
      result.title = line.replace(/^#\s*/, '').trim();
      break;
    }
  }
  if (result.title) {
    // Split Hebrew / English when they're co-located with a slash or dash.
    const sp = result.title.split(/\s*[—–/]\s*/).map((s) => s.trim()).filter(Boolean);
    for (const seg of sp) {
      if (/[\u0590-\u05FF]/.test(seg)) {
        if (!result.title_he) result.title_he = seg;
      } else if (/[A-Za-z]/.test(seg)) {
        if (!result.title_en) result.title_en = seg;
      }
    }
    if (!result.title_en && !result.title_he) {
      if (/[\u0590-\u05FF]/.test(result.title)) result.title_he = result.title;
      else result.title_en = result.title;
    }
  }

  // 3) Header metadata — any line of the form `**Key:** value` or `| Key | val |`.
  //    Accepts bold, plain, and table-pipe variants.
  const meta = {};
  for (const line of lines) {
    // Bold key style: **Status:** GREEN
    let km = /^[\s*>-]*\*\*([^:*]+):\*\*\s*(.+)$/.exec(line);
    if (km) {
      meta[km[1].trim().toLowerCase()] = km[2].trim();
      continue;
    }
    // Plain key style: Status: GREEN (only near top of file)
    km = /^([A-Za-z][A-Za-z _-]{1,30}):\s*(.+)$/.exec(line);
    if (km && !line.startsWith('#')) {
      const k = km[1].trim().toLowerCase();
      if (!meta[k]) meta[k] = km[2].trim();
      continue;
    }
    // Table pipe style: | Status | GREEN |
    km = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/.exec(line);
    if (km) {
      const k = km[1].trim().toLowerCase().replace(/[*`_]/g, '');
      const v = km[2].trim().replace(/[*`_]/g, '');
      if (!meta[k]) meta[k] = v;
    }
  }

  result.status = normStatus(meta.status || meta.overall || meta.verdict || meta.result || meta['test result']);
  result.status_bucket = statusBucket(result.status);
  result.module = meta.module || meta.scope || meta.project || null;

  // 4) Deliverables — table rows or inline `path/to/file.ext` mentions.
  //    We only extract from the Deliverables section to keep noise low.
  const delivIdx = lines.findIndex((l) => /deliverables?|new test files added|files? added|deliver/i.test(l) && /^#{1,3}\s/.test(l));
  if (delivIdx >= 0) {
    for (let i = delivIdx + 1; i < Math.min(delivIdx + 60, lines.length); i++) {
      const line = lines[i];
      if (/^#{1,3}\s/.test(line)) break; // new section
      const pathMatch = line.match(/`([^`\s][^`]*?\.(?:js|ts|tsx|jsx|py|sql|md|json))`/g);
      if (pathMatch) {
        for (const p of pathMatch) {
          result.deliverables.push(p.replace(/`/g, ''));
        }
      }
    }
  }
  result.deliverables = uniq(result.deliverables);

  // 5) Domain classification — based on the module path + deliverables + title.
  const domainHaystack = [result.module, result.title, ...result.deliverables].filter(Boolean).join(' ');
  result.domain = classifyDomain(domainHaystack);

  // 6) Swarm classification.
  result.swarm = classifyAgent(result.agent_id);

  // 7) Bug counts — two sources:
  //    a) Bug-header lines like "### BUG-XXX-01" or "### BUG-QA02-01"
  //    b) Inline "**Severity:** HIGH" fields inside those sections.
  //    c) Summary table row "| Critical | N |" if present.
  //
  //  Implementation: we collect every BUG section first, then rank each. A
  //  new BUG heading closes the previous one; a non-BUG heading also closes
  //  the current one. End-of-file flushes any trailing section.
  const bugSections = []; // [{ title, severity, resolved }]
  let currentSeverity = null;
  let currentBugTitle = null;
  let currentResolved = false;
  let inBugSection = false;

  const flushBug = () => {
    if (inBugSection && currentBugTitle) {
      bugSections.push({
        title: currentBugTitle,
        severity: currentSeverity || 'MEDIUM',
        resolved: currentResolved,
      });
    }
    inBugSection = false;
    currentBugTitle = null;
    currentSeverity = null;
    currentResolved = false;
  };

  // Accept only headings of the form `### BUG-ID` / `### BUG_ID` /
  // `### BUG: id`, not a plain `## Bugs` section title. Require at least
  // one separator character after BUG.
  const BUG_HEADING_RE = /^#{2,4}\s+.*\bBUG[-_:]\S/i;
  for (const line of lines) {
    const isBugHeading = BUG_HEADING_RE.test(line);
    const isAnyHeading = /^#{1,4}\s+/.test(line);
    if (isBugHeading) {
      // Close previous bug (if any) before starting a new one.
      flushBug();
      inBugSection = true;
      currentBugTitle = line.replace(/^#+\s*/, '').trim();
      currentSeverity = null;
      continue;
    }
    if (isAnyHeading) {
      // A non-BUG heading ends the current bug section.
      flushBug();
      continue;
    }
    // Severity + resolution hits inside a bug section.
    if (inBugSection) {
      const sev = /\*\*\s*Severity\s*:\s*\*\*\s*([A-Za-z-]+)/i.exec(line);
      if (sev) currentSeverity = sev[1].toUpperCase();
      // Agent-Y-QA03 UPGRADE: recognise a RESOLVED marker so bugs that
      // have been fixed in a later wave drop out of the critical/high
      // rollup instead of permanently poisoning the verdict. Match any
      // of these shapes (bilingual, case-insensitive):
      //   **Status:** RESOLVED
      //   **Status:** FIXED
      //   **סטטוס:** טופל
      //   ✅ RESOLVED
      //   ✅ טופל
      // The marker MUST appear inside the BUG section (between BUG
      // heading and the next heading) so we don't accidentally resolve
      // every bug just because a later paragraph mentions "resolved".
      if (
        /\*\*\s*Status\s*:\s*\*\*\s*(RESOLVED|FIXED|CLOSED)\b/i.test(line) ||
        /\*\*\s*סטטוס\s*:\s*\*\*\s*(טופל|נסגר|תוקן)/.test(line) ||
        /✅\s*(RESOLVED|FIXED|טופל|תוקן)/i.test(line)
      ) {
        currentResolved = true;
      }
    }
  }
  // Flush trailing bug if file ends mid-section.
  flushBug();

  // Translate sections into bug_counts + critical_items.
  for (const bug of bugSections) {
    const rank = bug.severity || 'MEDIUM';
    if (bug.resolved) {
      // Resolved bugs still show up in the total (so we keep the audit
      // trail intact — "never delete") but they no longer count toward
      // the critical/high/medium/low verdict buckets, and they are not
      // added to critical_items which drives the NO-GO decision.
      result.bug_counts.total++;
      result.bug_counts.resolved = (result.bug_counts.resolved || 0) + 1;
      continue;
    }
    if (rank === 'CRITICAL' || rank === 'BLOCKER') result.bug_counts.critical++;
    else if (rank === 'HIGH' || rank === 'MAJOR') result.bug_counts.high++;
    else if (rank === 'MEDIUM' || rank === 'MODERATE') result.bug_counts.medium++;
    else result.bug_counts.low++;
    result.bug_counts.total++;
    if (rank === 'CRITICAL' || rank === 'BLOCKER' || rank === 'HIGH' || rank === 'MAJOR') {
      result.critical_items.push({
        id: bug.title.split(/\s+/)[0] || 'BUG',
        title: bug.title,
        severity: rank,
        source: base,
      });
    }
  }

  // 8) Summary tables — `| Critical | 3 |` / `| High | 5 |` / etc.
  //
  // Agent-Y-QA03 UPGRADE: the old logic did `Math.max(inline, summary-row)`
  // which means a stale summary row like `| Critical bugs (BLOCKER) | **4** |`
  // permanently poisoned the count even after the 4 inline BUG sections were
  // tagged `**Status:** RESOLVED`. We now trust the inline bug sections as
  // authoritative when they exist — the summary-table override only applies
  // to reports that have no inline BUG sections at all (e.g. early QA reports
  // that captured counts in tables and nothing else).
  if (bugSections.length === 0) {
    // Agent-Y-QA aggregator hardening: only read severity-count tables
    // when they appear near a heading about bugs/findings/severity/summary.
    // This prevents SLA/config tables from inflating bug counts.
    const BUG_SECTION_RE = /^#{1,4}\s+.*(bug|finding|defect|issue|secret|summary\b.*(?:bug|finding|count)|gap\b.*(?:analysis|count)|scan\b.*(?:result|finding))/i;
    let nearBugHeading = false;
    let linesSinceHeading = 999;

    for (const line of lines) {
      if (/^#{1,4}\s+/.test(line)) {
        nearBugHeading = BUG_SECTION_RE.test(line);
        linesSinceHeading = 0;
        continue;
      }
      linesSinceHeading++;
      if (!nearBugHeading || linesSinceHeading > 30) continue;

      const row = /^\|\s*([^|]+?)\s*\|\s*\**(\d+)\**\s*\|/.exec(line);
      if (!row) continue;
      const key = row[1].trim().toLowerCase();
      const n = Number(row[2]);
      if (!Number.isFinite(n)) continue;
      const wordCount = key.split(/\s+/).length;
      if (wordCount > 3) continue;
      if (/^critical(\s+bugs?)?$|^blocker(\s+bugs?)?$/.test(key)) result.bug_counts.critical = Math.max(result.bug_counts.critical, n);
      else if (/^high(\s+bugs?)?$|^major(\s+bugs?)?$/.test(key)) result.bug_counts.high = Math.max(result.bug_counts.high, n);
      else if (/^medium(\s+bugs?)?$|^moderate(\s+bugs?)?$/.test(key)) result.bug_counts.medium = Math.max(result.bug_counts.medium, n);
      else if (/^low(\s+bugs?)?$|^minor(\s+bugs?)?$/.test(key)) result.bug_counts.low = Math.max(result.bug_counts.low, n);
    }
  }
  result.bug_counts.total = Math.max(
    result.bug_counts.total,
    result.bug_counts.critical + result.bug_counts.high + result.bug_counts.medium + result.bug_counts.low
  );

  // 9) Recommendations — bullets under a "Recommendations" or "Fix suggestion" heading.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{1,4}\s+.*(recommendations?|action items|fix suggestions?|next steps|exit criteria)/i.test(line)) {
      for (let j = i + 1; j < Math.min(i + 40, lines.length); j++) {
        const l = lines[j];
        if (/^#{1,4}\s/.test(l)) break;
        const bullet = /^[\s>]*[-*+]\s+(.+)$/.exec(l);
        if (bullet) result.recommendations.push(bullet[1].trim());
      }
    }
  }
  result.recommendations = uniq(result.recommendations).slice(0, 20);

  // 10) Test counts — grep the body for "N tests", "N passing", "N cases", etc.
  const testsRegex = /(\d{1,5})\s*(?:new\s+)?(?:unit\s+)?tests?\b/i;
  const suitesRegex = /(\d{1,5})\s*(?:describe\s+)?suites?\b/i;
  for (const line of lines) {
    const tm = testsRegex.exec(line);
    if (tm) result.test_counts.cases = Math.max(result.test_counts.cases, Number(tm[1]));
    const sm = suitesRegex.exec(line);
    if (sm) result.test_counts.suites = Math.max(result.test_counts.suites, Number(sm[1]));
  }
  // "tests 34 / pass 34" variant from node --test output.
  const passMatch = /tests?\s+(\d+)\s*\n.*?pass\s+(\d+)/is.exec(rawContent);
  if (passMatch) {
    const n = Number(passMatch[1]);
    if (n > result.test_counts.cases) result.test_counts.cases = n;
  }

  return result;
}

// ─── filesystem collection passes ──────────────────────────────

function collectReports(reportDirs, warnings) {
  const reports = [];
  const parseFailures = [];
  for (const dir of reportDirs) {
    if (!dir) continue;
    if (!exists(dir)) {
      warnings.push(`report dir missing: ${dir}`);
      continue;
    }
    walkDir(dir, {
      ext: REPORT_GLOB_EXT,
      onFile(full) {
        let raw;
        try {
          raw = fs.readFileSync(full, 'utf8');
        } catch (err) {
          parseFailures.push({ file: full, error: `read: ${err.message}` });
          return;
        }
        // Skip GRAND-FINAL.md so we never recursively parse our own output.
        if (/GRAND[-_]?FINAL/i.test(path.basename(full))) return;
        try {
          const parsed = parseReport(full, raw);
          if (parsed.parse_error) parseFailures.push({ file: full, error: parsed.parse_error });
          reports.push(parsed);
        } catch (err) {
          parseFailures.push({ file: full, error: `parse: ${err.message}` });
        }
      },
      onError(err, p) {
        warnings.push(`walk error at ${p}: ${err.message}`);
      },
    });
  }
  return { reports, parseFailures };
}

function collectSrcModules(srcDirs, warnings) {
  const totals = {
    files: 0,
    by_domain: {},
    sample_files: {},
  };
  for (const d of DOMAINS) {
    totals.by_domain[d.id] = 0;
    totals.sample_files[d.id] = [];
  }
  totals.by_domain[UNCATEGORIZED_DOMAIN.id] = 0;
  totals.sample_files[UNCATEGORIZED_DOMAIN.id] = [];

  for (const srcRoot of srcDirs) {
    if (!srcRoot) continue;
    if (!exists(srcRoot)) {
      warnings.push(`src dir missing: ${srcRoot}`);
      continue;
    }
    walkDir(srcRoot, {
      ext: /\.(js|ts|tsx|jsx)$/i,
      onFile(full) {
        // Skip tests — they're counted separately.
        if (/[/\\]test[/\\]/i.test(full)) return;
        if (/\.test\.(js|ts|tsx|jsx)$/i.test(full)) return;
        if (/\.spec\.(js|ts|tsx|jsx)$/i.test(full)) return;
        totals.files++;
        const rel = path.relative(srcRoot, full).replace(/\\/g, '/');
        const domain = classifyDomain(rel);
        totals.by_domain[domain.id] = (totals.by_domain[domain.id] || 0) + 1;
        if (totals.sample_files[domain.id].length < 5) {
          totals.sample_files[domain.id].push(rel);
        }
      },
      onError(err, p) {
        warnings.push(`src walk error at ${p}: ${err.message}`);
      },
    });
  }
  return totals;
}

function collectTests(testDirs, warnings) {
  const out = { files: 0, estimated_cases: 0 };
  for (const t of testDirs) {
    if (!t) continue;
    if (!exists(t)) {
      warnings.push(`test dir missing: ${t}`);
      continue;
    }
    walkDir(t, {
      ext: /\.(test|spec)\.(js|ts|tsx|jsx)$/i,
      onFile(full) {
        out.files++;
        // Best-effort case count: any `test(` / `it(` / `describe(` call.
        try {
          const content = fs.readFileSync(full, 'utf8');
          const caseMatches = content.match(/\b(?:test|it)\s*\(/g);
          if (caseMatches) out.estimated_cases += caseMatches.length;
        } catch (err) {
          warnings.push(`test read error at ${full}: ${err.message}`);
        }
      },
      onError(err, p) {
        warnings.push(`test walk error at ${p}: ${err.message}`);
      },
    });
  }
  return out;
}

// ─── aggregation ───────────────────────────────────────────────

function aggregate(reports, src, tests) {
  // Bucket by swarm.
  const bySwarm = {};
  for (const def of [...SWARM_DEFINITIONS, UNCLASSIFIED_SWARM]) {
    bySwarm[def.id] = {
      id: def.id,
      label_en: def.label_en,
      label_he: def.label_he,
      reports: 0,
      completed: 0,
      failed: 0,
      partial: 0,
      unknown: 0,
      bugs: { critical: 0, high: 0, medium: 0, low: 0 },
      top_critical: [],
    };
  }

  const domainBugs = {};
  for (const d of [...DOMAINS, UNCATEGORIZED_DOMAIN]) domainBugs[d.id] = 0;

  let totalReports = 0;
  let totalCompleted = 0;
  let totalFailed = 0;
  let totalPartial = 0;
  const allCritical = [];

  for (const r of reports) {
    totalReports++;
    const swarmId = (r.swarm && r.swarm.id) || UNCLASSIFIED_SWARM.id;
    const bucket = bySwarm[swarmId] || bySwarm[UNCLASSIFIED_SWARM.id];
    bucket.reports++;
    bucket[r.status_bucket] = (bucket[r.status_bucket] || 0) + 1;

    if (r.status_bucket === 'completed') totalCompleted++;
    else if (r.status_bucket === 'failed') totalFailed++;
    else if (r.status_bucket === 'partial') totalPartial++;

    bucket.bugs.critical += r.bug_counts.critical;
    bucket.bugs.high += r.bug_counts.high;
    bucket.bugs.medium += r.bug_counts.medium;
    bucket.bugs.low += r.bug_counts.low;

    if (r.domain) {
      domainBugs[r.domain.id] = (domainBugs[r.domain.id] || 0) + r.bug_counts.total;
    }

    for (const ci of r.critical_items) {
      allCritical.push({ ...ci, swarm: swarmId, agent_id: r.agent_id, domain: r.domain && r.domain.id });
      if (bucket.top_critical.length < 5) bucket.top_critical.push(ci);
    }
  }

  // Sort allCritical by severity rank desc.
  allCritical.sort((a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0));

  // Completion rate — against the "actively tracked" subset (completed + failed + partial).
  const tracked = totalCompleted + totalFailed + totalPartial;
  const completionRate = tracked > 0 ? (totalCompleted / tracked) : 0;

  return {
    total_reports: totalReports,
    total_completed: totalCompleted,
    total_failed: totalFailed,
    total_partial: totalPartial,
    total_unknown: totalReports - totalCompleted - totalFailed - totalPartial,
    completion_rate: completionRate,
    by_swarm: bySwarm,
    domain_bugs: domainBugs,
    critical_items: allCritical,
    src_summary: src,
    test_summary: tests,
  };
}

/**
 * computeVerdict — translates the aggregated summary into a release-readiness
 * decision. Rules:
 *   - Any critical bug → NO-GO
 *   - >= 5 high bugs    → NO-GO
 *   - failed reports > 0 AND failures > completed/10 → CONDITIONAL
 *   - completion rate < 0.7 → CONDITIONAL
 *   - otherwise → GO
 */
function computeVerdict(summary) {
  const reasons = [];
  let verdict = 'GO';

  const totalCritical = Object.values(summary.by_swarm)
    .reduce((s, g) => s + g.bugs.critical, 0);
  const totalHigh = Object.values(summary.by_swarm)
    .reduce((s, g) => s + g.bugs.high, 0);

  if (totalCritical > 0) {
    verdict = 'NO-GO';
    reasons.push(`${totalCritical} critical bug(s) across all swarms — must be resolved before production`);
  }
  if (totalHigh >= 5 && verdict !== 'NO-GO') {
    verdict = 'NO-GO';
    reasons.push(`${totalHigh} high-severity bug(s) — exceeds release threshold of 5`);
  }

  if (verdict === 'GO') {
    if (summary.total_failed > 0 && summary.total_failed > summary.total_completed / 10) {
      verdict = 'CONDITIONAL';
      reasons.push(`${summary.total_failed} failing report(s) — exceeds 10% of completed work`);
    } else if (summary.completion_rate < 0.7 && summary.total_reports >= 5) {
      verdict = 'CONDITIONAL';
      reasons.push(`completion rate ${(summary.completion_rate * 100).toFixed(1)}% — below 70% GO threshold`);
    }
  }

  if (verdict === 'GO') {
    if (totalHigh > 0) {
      reasons.push(`${totalHigh} high-severity bug(s) remain — address in next sprint but not a release blocker`);
    }
    reasons.push('no critical bugs, completion rate above threshold, failing reports within tolerance');
  }

  return { verdict, reasons };
}

// ─── action items ──────────────────────────────────────────────

function buildActionItems(summary) {
  // Top critical items from all critical_items, capped, deduped by title.
  const items = [];
  const seen = new Set();
  for (const ci of summary.critical_items) {
    const key = `${ci.severity}|${ci.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      rank: items.length + 1,
      severity: ci.severity,
      title: ci.title,
      source: ci.source,
      agent_id: ci.agent_id,
      domain: ci.domain,
    });
    if (items.length >= 30) break;
  }
  return items;
}

// ─── markdown rendering ────────────────────────────────────────

function renderGrandFinal(result) {
  const lines = [];
  const now = new Date().toISOString();
  const summary = result.summary;
  const verdict = result.verdict;
  const actionItems = result.action_items;

  lines.push('# סיכום מקיף — Grand Final QA Report');
  lines.push('## Mega-ERP Techno-Kol Uzi / מערכת האב טכנו-קול עוזי');
  lines.push('');
  lines.push('**Rule / כלל:** לא מוחקים רק משדרגים ומגדלים (Never delete, only upgrade & grow)');
  lines.push('');
  lines.push(`**Generated / נוצר:** ${now}`);
  lines.push(`**Aggregator / אגרגטור:** \`onyx-procurement/src/reports/grand-aggregator.js\``);
  lines.push(`**Report spec / מפרט הדוח:** \`_qa-reports/AG-X100-grand-aggregator.md\``);
  lines.push('');
  lines.push('---');
  lines.push('');

  // 1. Executive summary.
  lines.push('## 1. Executive Summary / תקציר מנהלים');
  lines.push('');
  lines.push('| Metric / מדד | Value / ערך |');
  lines.push('|---|---:|');
  lines.push(`| Total QA/Agent reports / סך הדוחות | ${summary.total_reports} |`);
  lines.push(`| Completed (GREEN/DONE) / הושלמו | ${summary.total_completed} |`);
  lines.push(`| Partial (YELLOW/CONDITIONAL) / חלקי | ${summary.total_partial} |`);
  lines.push(`| Failed (RED/NO-GO) / נכשלו | ${summary.total_failed} |`);
  lines.push(`| Unknown / לא ידוע | ${summary.total_unknown} |`);
  lines.push(`| Completion rate / שיעור השלמה | ${(summary.completion_rate * 100).toFixed(1)}% |`);
  lines.push(`| Src modules counted / מודולים | ${summary.src_summary.files} |`);
  lines.push(`| Test files counted / קבצי בדיקה | ${summary.test_summary.files} |`);
  lines.push(`| Est. test cases / בדיקות | ${summary.test_summary.estimated_cases} |`);
  lines.push('');

  // 2. Verdict.
  lines.push('## 2. Release Readiness Verdict / פסיקת מוכנות לשחרור');
  lines.push('');
  const verdictEmoji = verdict.verdict === 'GO' ? 'GO' : verdict.verdict === 'NO-GO' ? 'NO-GO' : 'CONDITIONAL';
  const verdictHe = verdict.verdict === 'GO' ? 'אישור' : verdict.verdict === 'NO-GO' ? 'עצירה' : 'מותנה';
  lines.push(`### ${verdictEmoji} — ${verdictHe}`);
  lines.push('');
  for (const reason of verdict.reasons) {
    lines.push(`- ${reason}`);
  }
  lines.push('');

  // 3. Swarm-by-swarm breakdown.
  lines.push('## 3. Swarm-by-Swarm Breakdown / פירוט לפי נחיל');
  lines.push('');
  lines.push('| Swarm / נחיל | Reports | Completed | Partial | Failed | Critical bugs | High bugs |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const key of Object.keys(summary.by_swarm)) {
    const s = summary.by_swarm[key];
    if (s.reports === 0) continue;
    lines.push(`| ${s.label_en} / ${s.label_he} | ${s.reports} | ${s.completed || 0} | ${s.partial || 0} | ${s.failed || 0} | ${s.bugs.critical} | ${s.bugs.high} |`);
  }
  lines.push('');

  // 4. Module count per domain.
  lines.push('## 4. Module Count per Domain / מודולים לפי תחום');
  lines.push('');
  lines.push('| Domain / תחום | Modules | Bug load |');
  lines.push('|---|---:|---:|');
  for (const d of [...DOMAINS, UNCATEGORIZED_DOMAIN]) {
    const mods = summary.src_summary.by_domain[d.id] || 0;
    const bugs = summary.domain_bugs[d.id] || 0;
    lines.push(`| ${d.label_en} / ${d.label_he} | ${mods} | ${bugs} |`);
  }
  lines.push('');

  // 5. Completion stats.
  lines.push('## 5. Agents Dispatched & Completion / סוכנים שיצאו למשימה והשלמה');
  lines.push('');
  lines.push(`- **Total agents dispatched / סך סוכנים שהופעלו:** ${summary.total_reports}`);
  lines.push(`- **Completion rate / שיעור השלמה:** ${(summary.completion_rate * 100).toFixed(1)}%`);
  lines.push(`- **Failed / נכשלו:** ${summary.total_failed}`);
  lines.push(`- **Partial / חלקי:** ${summary.total_partial}`);
  lines.push(`- **Unknown status / מצב לא ברור:** ${summary.total_unknown}`);
  lines.push('');

  // 6. Critical issues.
  lines.push('## 6. Critical Issues Surfaced by QA Agents / תקלות קריטיות שזוהו');
  lines.push('');
  if (summary.critical_items.length === 0) {
    lines.push('_No critical issues logged across all reports. / לא נמצאו תקלות קריטיות._');
  } else {
    const topCritical = summary.critical_items.slice(0, 25);
    lines.push('| # | Severity / חומרה | Title / כותרת | Source / מקור |');
    lines.push('|---:|---|---|---|');
    topCritical.forEach((ci, i) => {
      const sevHe = SEVERITY_LABEL_HE[ci.severity] || ci.severity;
      lines.push(`| ${i + 1} | ${ci.severity} / ${sevHe} | ${escapeMd(ci.title)} | ${ci.source || ''} |`);
    });
  }
  lines.push('');

  // 7. Action items.
  lines.push('## 7. Action Items Ranked by Severity / משימות לפי חומרה');
  lines.push('');
  if (actionItems.length === 0) {
    lines.push('_No outstanding action items. / אין משימות פתוחות._');
  } else {
    lines.push('| Rank / דירוג | Severity / חומרה | Title / כותרת | Agent / סוכן | Domain / תחום |');
    lines.push('|---:|---|---|---|---|');
    for (const a of actionItems) {
      const sevHe = SEVERITY_LABEL_HE[a.severity] || a.severity;
      lines.push(`| ${a.rank} | ${a.severity} / ${sevHe} | ${escapeMd(a.title)} | ${a.agent_id || ''} | ${a.domain || ''} |`);
    }
  }
  lines.push('');

  // 8. Warnings and parse failures.
  if (result.warnings && result.warnings.length) {
    lines.push('## 8. Warnings / אזהרות');
    lines.push('');
    for (const w of result.warnings) {
      lines.push(`- ${w}`);
    }
    lines.push('');
  }
  if (result.parse_failures && result.parse_failures.length) {
    lines.push('## 9. Parse Failures / כשלי ניתוח');
    lines.push('');
    lines.push('| File / קובץ | Error / שגיאה |');
    lines.push('|---|---|');
    for (const pf of result.parse_failures) {
      lines.push(`| ${pf.file} | ${escapeMd(pf.error)} |`);
    }
    lines.push('');
  }

  // Footer.
  lines.push('---');
  lines.push('');
  lines.push('**Methodology / מתודולוגיה:** Deterministic parse of `_qa-reports/*.md` headings, tables, and bug sections. See `_qa-reports/AG-X100-grand-aggregator.md` for the full spec, verdict rules, and Hebrew glossary.');
  lines.push('');
  lines.push('**Rule reminder / תזכורת כלל:** לא מוחקים רק משדרגים ומגדלים. This file can be regenerated — existing reports are NEVER modified or removed.');
  lines.push('');

  return lines.join('\n');
}

function escapeMd(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// ─── orchestrator ──────────────────────────────────────────────

/**
 * aggregateAll — the grand aggregator entry point.
 *
 * @param {Object} opts
 * @param {string[]} [opts.reportDirs] — report directories to scan
 * @param {string} [opts.outputPath]   — path of GRAND-FINAL.md
 * @param {string[]} [opts.srcDirs]    — src roots for module counting
 * @param {string[]} [opts.testDirs]   — test roots for test counting
 * @param {boolean} [opts.writeOutput] — default true; set false to skip disk write
 * @returns {Promise<Object>} aggregation result incl. summary, verdict, markdown
 */
async function aggregateAll(opts = {}) {
  const warnings = [];
  const reportDirs = Array.isArray(opts.reportDirs) && opts.reportDirs.length
    ? opts.reportDirs
    : defaultReportDirs();
  const srcDirs = Array.isArray(opts.srcDirs) && opts.srcDirs.length
    ? opts.srcDirs
    : defaultSrcDirs();
  const testDirs = Array.isArray(opts.testDirs) && opts.testDirs.length
    ? opts.testDirs
    : defaultTestDirs();
  const outputPath = opts.outputPath || path.join(reportDirs[0] || process.cwd(), 'GRAND-FINAL.md');
  const writeOutput = opts.writeOutput !== false;

  // 1) Collect reports.
  const { reports, parseFailures } = collectReports(reportDirs, warnings);

  // 2) Collect src modules.
  const srcSummary = collectSrcModules(srcDirs, warnings);

  // 3) Collect tests.
  const testSummary = collectTests(testDirs, warnings);

  // 4) Aggregate.
  const summary = aggregate(reports, srcSummary, testSummary);

  // 5) Verdict.
  const verdict = computeVerdict(summary);

  // 6) Action items.
  const actionItems = buildActionItems(summary);

  const result = {
    generated_at: new Date().toISOString(),
    report_dirs: reportDirs,
    src_dirs: srcDirs,
    test_dirs: testDirs,
    output_path: outputPath,
    reports,
    parse_failures: parseFailures,
    warnings,
    summary,
    verdict,
    action_items: actionItems,
    markdown: '',
  };

  // 7) Render + optionally write.
  result.markdown = renderGrandFinal(result);
  if (writeOutput) {
    try {
      const outDir = path.dirname(outputPath);
      if (!exists(outDir)) fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(outputPath, result.markdown, 'utf8');
      result.written = true;
    } catch (err) {
      warnings.push(`write error at ${outputPath}: ${err.message}`);
      result.written = false;
    }
  } else {
    result.written = false;
  }

  return result;
}

// ─── defaults ──────────────────────────────────────────────────

function defaultReportDirs() {
  // onyx-procurement/src/reports is the home of this file.
  // Walk up: onyx-procurement/src/reports → onyx-procurement/src → onyx-procurement → <root>
  const here = __dirname;
  const procurementRoot = path.resolve(here, '..', '..');
  const repoRoot = path.resolve(procurementRoot, '..');
  return [
    path.join(repoRoot, '_qa-reports'),
    path.join(procurementRoot, '_qa-reports'),
  ];
}

function defaultSrcDirs() {
  const here = __dirname;
  const procurementRoot = path.resolve(here, '..', '..');
  const repoRoot = path.resolve(procurementRoot, '..');
  return [
    path.join(procurementRoot, 'src'),
    path.join(repoRoot, 'onyx-ai', 'src'),
    path.join(repoRoot, 'techno-kol-ops', 'src'),
    path.join(repoRoot, 'payroll-autonomous', 'src'),
  ];
}

function defaultTestDirs() {
  const here = __dirname;
  const procurementRoot = path.resolve(here, '..', '..');
  const repoRoot = path.resolve(procurementRoot, '..');
  return [
    path.join(procurementRoot, 'test'),
    path.join(repoRoot, 'onyx-ai', 'test'),
    path.join(repoRoot, 'techno-kol-ops', 'test'),
    path.join(repoRoot, 'payroll-autonomous', 'test'),
  ];
}

// ─── exports ───────────────────────────────────────────────────

module.exports = {
  aggregateAll,
  parseReport,
  classifyAgent,
  classifyDomain,
  computeVerdict,
  renderGrandFinal,
  // Exposed for tests / advanced callers.
  _internals: {
    SWARM_DEFINITIONS,
    DOMAINS,
    UNCLASSIFIED_SWARM,
    UNCATEGORIZED_DOMAIN,
    SEVERITY_RANK,
    SEVERITY_LABEL_HE,
    walkDir,
    collectReports,
    collectSrcModules,
    collectTests,
    aggregate,
    buildActionItems,
    statusBucket,
    normStatus,
    defaultReportDirs,
    defaultSrcDirs,
    defaultTestDirs,
  },
};
