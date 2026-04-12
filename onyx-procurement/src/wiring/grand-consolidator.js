/**
 * Grand Consolidator — Mega-ERP Techno-Kol Uzi
 * Agent Y-200 — FINAL agent of the 200-agent wave.
 *
 * Mission / משימה:
 *   Scan the `_qa-reports/` directory, extract lightweight metadata from
 *   every `AG-*.md` / `QA-*.md` report, and emit:
 *
 *     • `_qa-reports/MASTER_INDEX.md`   — bilingual markdown index.
 *     • `_qa-reports/MASTER_INDEX.json` — machine-readable manifest.
 *
 *   Both artifacts are **append / summarize only** — we NEVER delete a
 *   report, and we NEVER overwrite prior runs of the MASTER_INDEX.md
 *   rolling log at the bottom of the file: new runs are appended with
 *   a timestamp header so history is preserved forever.
 *
 *   Rule / כלל:  "לא מוחקים רק משדרגים ומגדלים"
 *                (Never delete, only upgrade & grow.)
 *
 * Public API:
 *   const consolidator = new GrandConsolidator({ reportDir, outputDir });
 *   await consolidator.scanReports(dir)     → Array<MetaRecord>
 *   consolidator.parseMetadata(file, raw)   → MetaRecord
 *   consolidator.buildIndex(records, opts)  → { markdown, json, summary }
 *   await consolidator.run()                → AggregationResult
 *
 *   Also exported as a flat function surface for easy consumption from
 *   scripts and tests:
 *
 *   const { scanReports, parseMetadata, buildIndex, run } =
 *     require('./src/wiring/grand-consolidator');
 *
 * Node built-ins only: fs, path. Zero external dependencies.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// ─── constants ──────────────────────────────────────────────────

const REPORT_EXT_RE = /\.md$/i;

// File-name pattern: AG-Y200-grand-consolidator.md, QA-02-unit-tests.md, ...
// Captures: (prefix)(sep)(id)(-slug)?
const FILENAME_ID_RE =
  /^(QA|AG|AGENT|WAVE|SWARM|Y)[-_]?([A-Z]?\d+[A-Za-z0-9]*)(?:[-_](.+?))?\.md$/i;

// Title line: "# AG-Y200 — Grand Consolidator" or "# QA-02 ..."
const TITLE_ID_RE =
  /^#\s*(QA|AG|AGENT|WAVE|SWARM|Y)[-_]?([A-Z]?\d+[A-Za-z0-9]*)/i;

// Meta fields.
const AGENT_RE = /\*\*Agent(?:\s*ID)?:\*\*\s*([^\n\r|]+)/i;
const STATUS_RE = /\*\*Status:\*\*\s*([^\n\r|]+)/i;
const DATE_RE = /\*\*Date:\*\*\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i;

// Test-count heuristics. First one wins.
const TEST_COUNT_PATTERNS = [
  // "PASS (28/28)" or "GREEN — 53/53 passing"
  /([0-9]+)\s*\/\s*[0-9]+\s*(?:passing|pass|tests?|ok)?/i,
  // "53 tests, all passing" / "251 tests"
  /([0-9]+)\s*tests?\s*(?:,|\s)\s*(?:all\s+)?(?:pass|passing|green)/i,
  // "tests 53 / pass 53 / fail 0"
  /tests\s+([0-9]+)\s*\/\s*pass/i,
  // "**28 tests**" or "28 unit tests"
  /\*?\*?([0-9]+)\s*(?:unit\s+)?tests?\*?\*?/i,
];

// Status claim normalization — checked in this ORDER so that explicit
// RED/YELLOW tokens beat accidental substring matches of PASS/PASSING.
const STATUS_PRIORITY = [
  // RED first — any explicit red/fail token wins.
  ['RED', 'RED'],
  ['FAILED', 'RED'],
  ['FAILING', 'RED'],
  ['FAIL', 'RED'],
  ['BLOCKED', 'RED'],
  ['BROKEN', 'RED'],
  ['ERROR', 'RED'],
  // YELLOW second — warnings/partials beat success.
  ['YELLOW', 'YELLOW'],
  ['WARNING', 'YELLOW'],
  ['WARN', 'YELLOW'],
  ['CONDITIONAL', 'YELLOW'],
  ['PARTIAL', 'YELLOW'],
  ['INPROGRESS', 'YELLOW'],
  // GREEN last — success tokens come last so YELLOW/RED beat them.
  ['GREEN', 'GREEN'],
  ['PASSING', 'GREEN'],
  ['PASSED', 'GREEN'],
  ['PASS', 'GREEN'],
  ['COMPLETED', 'GREEN'],
  ['COMPLETE', 'GREEN'],
  ['SIGNED', 'GREEN'],
  ['DONE', 'GREEN'],
  ['OK', 'GREEN'],
];

// Swarm buckets — used for grouping in the bilingual index.
// Order here is also the display order.
const SWARM_DEFS = [
  {
    key: 'SWARM1',
    label_he: 'נחיל 1 — בסיס (גלים 1–10 / AG-1..AG-50)',
    label_en: 'Swarm 1 — Foundation (Waves 1-10 / AG-1..AG-50)',
  },
  {
    key: 'SWARM2',
    label_he: 'נחיל 2 — הרחבה (AG-51..AG-100)',
    label_en: 'Swarm 2 — Expansion (AG-51..AG-100)',
  },
  {
    key: 'SWARM3',
    label_he: 'נחיל 3 — מודולי AI (AG-X01..AG-X100)',
    label_en: 'Swarm 3 — AI Modules (AG-X01..AG-X100)',
  },
  {
    key: 'QA_FRAMEWORK',
    label_he: 'מסגרת QA — 20 סוכנים (QA-01..QA-20)',
    label_en: 'QA Framework — 20 Agents (QA-01..QA-20)',
  },
  {
    key: 'WAVE_Y_01_14',
    label_he: 'גל Y — חטיבה ראשונה (Y-001..Y-014)',
    label_en: 'Wave Y — Division 1 (Y-001..Y-014)',
  },
  {
    key: 'WAVE_Y_15_50',
    label_he: 'גל Y — חטיבת מכירות/תפעול (Y-015..Y-050)',
    label_en: 'Wave Y — Sales/Ops Division (Y-015..Y-050)',
  },
  {
    key: 'WAVE_Y_51_100',
    label_he: 'גל Y — חטיבת לקוחות/HR (Y-051..Y-100)',
    label_en: 'Wave Y — Customer/HR Division (Y-051..Y-100)',
  },
  {
    key: 'WAVE_Y_101_150',
    label_he: 'גל Y — חטיבת מסמכים/תקשורת (Y-101..Y-150)',
    label_en: 'Wave Y — Docs/Comms Division (Y-101..Y-150)',
  },
  {
    key: 'WAVE_Y_151_200',
    label_he: 'גל Y — חטיבת הסיום (Y-151..Y-200)',
    label_en: 'Wave Y — Final Division (Y-151..Y-200)',
  },
  {
    key: 'OTHER',
    label_he: 'אחר / לא מסווג',
    label_en: 'Other / Unclassified',
  },
];

const ROLLING_LOG_MARKER = '<!-- GRAND-CONSOLIDATOR:ROLLING-LOG -->';
const ROLLING_LOG_HEADER = '## Rolling Run Log · יומן הרצות מצטבר';

// Celebration / closing paragraph — bilingual, per brief.
const CELEBRATION = 'כל 200 הסוכנים הושלמו · All 200 agents completed';

// ─── helpers ────────────────────────────────────────────────────

function normalizeStatus(raw) {
  if (!raw) return 'UNKNOWN';
  const upper = String(raw).toUpperCase().trim();
  // Priority-ordered scan: first matching entry in STATUS_PRIORITY wins,
  // so RED / YELLOW tokens beat a trailing PASS/PASSING substring.
  for (const [token, canonical] of STATUS_PRIORITY) {
    if (upper.includes(token)) return canonical;
  }
  return 'UNKNOWN';
}

function extractTestCount(raw) {
  if (!raw) return 0;
  for (const re of TEST_COUNT_PATTERNS) {
    const m = raw.match(re);
    if (m && m[1]) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n >= 0 && n < 100000) return n;
    }
  }
  return 0;
}

function bytesToKb(n) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round((n / 1024) * 100) / 100;
}

function classifySwarm(agentId) {
  if (!agentId) return 'OTHER';
  const id = String(agentId).toUpperCase();

  // QA framework.
  if (/^QA[-_]?\d+/.test(id)) return 'QA_FRAMEWORK';

  // Wave Y — split by numeric range.
  const yMatch = id.match(/^(?:AG[-_]?)?Y[-_]?0*(\d+)/);
  if (yMatch) {
    const n = parseInt(yMatch[1], 10);
    if (n >= 1 && n <= 14) return 'WAVE_Y_01_14';
    if (n >= 15 && n <= 50) return 'WAVE_Y_15_50';
    if (n >= 51 && n <= 100) return 'WAVE_Y_51_100';
    if (n >= 101 && n <= 150) return 'WAVE_Y_101_150';
    if (n >= 151 && n <= 200) return 'WAVE_Y_151_200';
    return 'OTHER';
  }

  // Swarm 3 — AG-X## (AI modules).
  if (/^AG[-_]?X\d+/.test(id)) return 'SWARM3';

  // Swarm 1 / Swarm 2 — plain AG-## split at 50.
  const agMatch = id.match(/^AG[-_]?0*(\d+)/);
  if (agMatch) {
    const n = parseInt(agMatch[1], 10);
    if (n >= 1 && n <= 50) return 'SWARM1';
    if (n >= 51 && n <= 100) return 'SWARM2';
    return 'OTHER';
  }

  return 'OTHER';
}

function parseIdFromFilename(fileName) {
  const m = fileName.match(FILENAME_ID_RE);
  if (!m) return null;
  const prefix = m[1].toUpperCase();
  const core = m[2].toUpperCase();
  const slug = m[3] || '';
  return { id: `${prefix}-${core}`, slug };
}

function parseIdFromContent(raw) {
  if (!raw) return null;
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(TITLE_ID_RE);
    if (m) {
      return `${m[1].toUpperCase()}-${m[2].toUpperCase()}`;
    }
    if (line.trim() && !line.startsWith('#')) break;
  }
  return null;
}

function extractTitle(raw) {
  if (!raw) return '';
  const lines = raw.split(/\r?\n/).slice(0, 20);
  for (const line of lines) {
    if (line.startsWith('# ')) {
      return line.replace(/^#\s*/, '').trim();
    }
  }
  return '';
}

// ─── core class ─────────────────────────────────────────────────

class GrandConsolidator {
  constructor(opts = {}) {
    this.reportDir =
      opts.reportDir ||
      path.resolve(__dirname, '..', '..', '..', '_qa-reports');
    this.outputDir = opts.outputDir || this.reportDir;
    this.now = opts.now || (() => new Date());
    this.fsImpl = opts.fs || fs;
    this.warnings = [];
    this.errors = [];
  }

  /**
   * scanReports(dir) — recursively list every `*.md` file in `dir`.
   * Returns an array of absolute file paths (lexicographically sorted).
   */
  scanReports(dir) {
    const target = dir || this.reportDir;
    const out = [];
    if (!target) return out;
    if (!this.fsImpl.existsSync(target)) {
      this.warnings.push(`Report directory not found: ${target}`);
      return out;
    }
    let entries;
    try {
      entries = this.fsImpl.readdirSync(target, { withFileTypes: true });
    } catch (e) {
      this.warnings.push(`Cannot read ${target}: ${e.message}`);
      return out;
    }
    for (const ent of entries) {
      const full = path.join(target, ent.name);
      if (ent.isDirectory()) {
        // Intentional shallow scan: only the root level of `_qa-reports`
        // holds AG/QA markdown. Deeper sub-folders (if any) are ignored
        // to keep the index deterministic and fast.
        continue;
      }
      // Exclude the consolidator's own output so that repeat runs don't
      // re-ingest the index into itself.
      if (/^MASTER_INDEX\.(md|json)$/i.test(ent.name)) continue;
      if (REPORT_EXT_RE.test(ent.name)) {
        out.push(full);
      }
    }
    out.sort();
    return out;
  }

  /**
   * parseMetadata(file) — read + parse a single report file.
   * Returns { agentId, title, testsCount, statusClaim, sizeKb, lastModified, fileName, flags }.
   * On I/O or parse failure, returns a record with `error` populated and
   * `flags.ERROR = true` — the caller never throws.
   */
  parseMetadata(file, rawOverride) {
    const fileName = path.basename(file);
    const flags = {};
    let stat = null;
    let raw = rawOverride;

    if (raw == null) {
      try {
        stat = this.fsImpl.statSync(file);
      } catch (e) {
        flags.ERROR = true;
        return {
          agentId: null,
          title: fileName,
          testsCount: 0,
          statusClaim: 'ERROR',
          sizeKb: 0,
          lastModified: null,
          fileName,
          filePath: file,
          swarm: 'OTHER',
          flags,
          error: `stat failed: ${e.message}`,
        };
      }
      try {
        raw = this.fsImpl.readFileSync(file, 'utf8');
      } catch (e) {
        flags.ERROR = true;
        return {
          agentId: null,
          title: fileName,
          testsCount: 0,
          statusClaim: 'ERROR',
          sizeKb: bytesToKb((stat && stat.size) || 0),
          lastModified: stat ? stat.mtime.toISOString() : null,
          fileName,
          filePath: file,
          swarm: 'OTHER',
          flags,
          error: `read failed: ${e.message}`,
        };
      }
    }

    // Derive agent id — filename first, content title as fallback.
    const fromFile = parseIdFromFilename(fileName);
    const fromContent = parseIdFromContent(raw);
    const agentId = fromContent || (fromFile && fromFile.id) || null;
    if (!agentId) {
      flags.ERROR = true;
      flags.NO_ID = true;
    }

    const title = extractTitle(raw) || fileName.replace(/\.md$/i, '');

    // Status — only from an explicit **Status:** line. Content-body
    // prose almost always contains status-like words (e.g. "fail-safe",
    // "red flag") which would otherwise poison the classification, so
    // we refuse to guess when no explicit field is present.
    let statusClaim = 'UNKNOWN';
    const statusMatch = raw.match(STATUS_RE);
    if (statusMatch) {
      statusClaim = normalizeStatus(statusMatch[1]);
    } else {
      // Secondary: look in the first 8 lines for a title-level "PASS (N/N)"
      // or "GREEN — N/N" pattern. This catches reports that put the
      // status in the H1 line itself but don't include a bold Status field.
      const head = raw.split(/\r?\n/).slice(0, 8).join(' ');
      const titleStatus =
        head.match(/\b(GREEN|PASS(?:ING|ED)?|YELLOW|RED|FAIL(?:ED|ING)?|BLOCKED|CONDITIONAL)\b/i);
      if (titleStatus) {
        statusClaim = normalizeStatus(titleStatus[1]);
      }
    }

    const testsCount = extractTestCount(raw);
    if (testsCount === 0) flags.NO_TESTS = true;
    if (statusClaim === 'UNKNOWN') flags.NO_STATUS = true;
    if (statusClaim === 'RED') flags.RED = true;

    const size = (stat && stat.size) || Buffer.byteLength(raw, 'utf8');
    const lastModified = stat
      ? stat.mtime.toISOString()
      : this.now().toISOString();

    const swarm = classifySwarm(agentId);

    return {
      agentId,
      title,
      testsCount,
      statusClaim,
      sizeKb: bytesToKb(size),
      lastModified,
      fileName,
      filePath: file,
      swarm,
      flags,
    };
  }

  /**
   * buildIndex(records, opts) — render the bilingual markdown index, the
   * JSON manifest, and a summary object. Pure: does not touch the disk.
   */
  buildIndex(records, opts = {}) {
    const timestamp =
      opts.timestamp || this.now().toISOString().replace('T', ' ').slice(0, 19);
    const safeRecords = Array.isArray(records) ? records.slice() : [];

    // Group by swarm, preserving SWARM_DEFS order.
    const groups = new Map();
    for (const def of SWARM_DEFS) groups.set(def.key, []);
    for (const rec of safeRecords) {
      const key = rec.swarm && groups.has(rec.swarm) ? rec.swarm : 'OTHER';
      groups.get(key).push(rec);
    }
    for (const arr of groups.values()) {
      arr.sort((a, b) =>
        String(a.agentId || a.fileName).localeCompare(
          String(b.agentId || b.fileName),
          'en',
          { numeric: true, sensitivity: 'base' },
        ),
      );
    }

    // Totals.
    const totalReports = safeRecords.length;
    const totalTests = safeRecords.reduce(
      (s, r) => s + (Number(r.testsCount) || 0),
      0,
    );
    const totalSizeKb =
      Math.round(
        safeRecords.reduce((s, r) => s + (Number(r.sizeKb) || 0), 0) * 100,
      ) / 100;
    const greenCount = safeRecords.filter((r) => r.statusClaim === 'GREEN')
      .length;
    const yellowCount = safeRecords.filter((r) => r.statusClaim === 'YELLOW')
      .length;
    const redCount = safeRecords.filter((r) => r.statusClaim === 'RED').length;
    const unknownCount = safeRecords.filter(
      (r) => r.statusClaim === 'UNKNOWN',
    ).length;
    const errorFlagged = safeRecords.filter(
      (r) => r.flags && r.flags.ERROR === true,
    );

    const summary = {
      timestamp,
      totals: {
        reports: totalReports,
        tests: totalTests,
        sizeKb: totalSizeKb,
        green: greenCount,
        yellow: yellowCount,
        red: redCount,
        unknown: unknownCount,
        errors: errorFlagged.length,
      },
      groups: SWARM_DEFS.map((def) => ({
        key: def.key,
        label_he: def.label_he,
        label_en: def.label_en,
        count: groups.get(def.key).length,
        tests: groups
          .get(def.key)
          .reduce((s, r) => s + (Number(r.testsCount) || 0), 0),
      })),
      celebration: CELEBRATION,
    };

    // ─── Markdown render ────────────────────────────────────────
    const lines = [];
    lines.push('# MASTER INDEX · מפתח ראשי');
    lines.push('');
    lines.push(
      '**Agent Y-200 — Grand Consolidator · סוכן Y-200 — מאחד-על**',
    );
    lines.push(
      `**Generated / נוצר:** ${timestamp}  `,
    );
    lines.push(
      `**Rule / כלל:** לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.`,
    );
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## 1. Summary · סיכום');
    lines.push('');
    lines.push('| Metric · מדד | Value · ערך |');
    lines.push('|---|---:|');
    lines.push(`| Total reports · סך הדוחות | ${totalReports} |`);
    lines.push(`| Total tests · סך הבדיקות | ${totalTests} |`);
    lines.push(`| Total size (KB) · סך הגודל | ${totalSizeKb} |`);
    lines.push(`| GREEN · ירוק | ${greenCount} |`);
    lines.push(`| YELLOW · צהוב | ${yellowCount} |`);
    lines.push(`| RED · אדום | ${redCount} |`);
    lines.push(`| UNKNOWN · לא ידוע | ${unknownCount} |`);
    lines.push(`| ERROR flags · דגלי שגיאה | ${errorFlagged.length} |`);
    lines.push('');
    lines.push('---');
    lines.push('');

    lines.push('## 2. Groups · קבוצות');
    lines.push('');
    lines.push(
      '| # | Group · קבוצה | Reports · דוחות | Tests · בדיקות |',
    );
    lines.push('|:-:|---|---:|---:|');
    summary.groups.forEach((g, i) => {
      lines.push(
        `| ${i + 1} | ${g.label_en} / ${g.label_he} | ${g.count} | ${g.tests} |`,
      );
    });
    lines.push('');
    lines.push('---');
    lines.push('');

    // Detail tables per group.
    lines.push('## 3. Reports by Swarm · דוחות לפי נחיל');
    lines.push('');
    let sectionNum = 1;
    for (const def of SWARM_DEFS) {
      const rows = groups.get(def.key);
      if (!rows || rows.length === 0) continue;
      lines.push(`### 3.${sectionNum} ${def.label_en} — ${def.label_he}`);
      lines.push('');
      lines.push(
        '| # | Agent ID · מזהה | Title · כותרת | Tests · בדיקות | Status · סטטוס | Size (KB) · גודל | Last Modified · עודכן |',
      );
      lines.push('|:-:|---|---|---:|:-:|---:|---|');
      rows.forEach((r, idx) => {
        const flagStr =
          r.flags && (r.flags.ERROR || r.flags.NO_ID || r.flags.NO_STATUS)
            ? ' ⚠'
            : '';
        lines.push(
          `| ${idx + 1} | \`${r.agentId || '—'}\` | ${escapeTableCell(
            r.title,
          )}${flagStr} | ${r.testsCount} | ${r.statusClaim} | ${r.sizeKb} | ${
            r.lastModified ? r.lastModified.slice(0, 10) : '—'
          } |`,
        );
      });
      lines.push('');
      sectionNum += 1;
    }

    lines.push('---');
    lines.push('');
    lines.push('## 4. ERROR Flags · דגלי שגיאה');
    lines.push('');
    if (errorFlagged.length === 0) {
      lines.push('_No reports flagged. · אין דוחות מסומנים._');
    } else {
      lines.push('| # | File · קובץ | Reason · סיבה |');
      lines.push('|:-:|---|---|');
      errorFlagged.forEach((r, i) => {
        const reasons = Object.keys(r.flags || {}).join(', ') || 'ERROR';
        lines.push(
          `| ${i + 1} | \`${r.fileName}\` | ${escapeTableCell(
            r.error || reasons,
          )} |`,
        );
      });
    }
    lines.push('');
    lines.push('---');
    lines.push('');

    lines.push('## 5. Celebration · חגיגה');
    lines.push('');
    lines.push(`> **${CELEBRATION}**`);
    lines.push('');
    lines.push(
      'Agent Y-200, the final agent of the 200-agent wave, is hereby signed off. ' +
        'The Techno-Kol Uzi mega-ERP swarm has walked its full course: three build swarms, ' +
        'a 20-agent QA framework, and a 200-agent Y-wave — all without deleting a single line.',
    );
    lines.push('');
    lines.push(
      'סוכן Y-200, הסוכן האחרון בגל בן 200 הסוכנים, חותם את המשמרת. ' +
        'נחיל מערכת ה-ERP של טכנו-קול עוזי עבר את מסלולו המלא: שלושה נחילי בנייה, ' +
        'מסגרת QA בת 20 סוכנים, וגל Y בן 200 סוכנים — כולם מבלי למחוק שורה אחת.',
    );
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(ROLLING_LOG_MARKER);
    lines.push(ROLLING_LOG_HEADER);
    lines.push('');
    lines.push(
      '_Each run of the consolidator appends a dated entry below. ' +
        'Prior runs are never overwritten. · ' +
        'כל הרצה מוסיפה רשומה עם חותמת־זמן למטה. הרצות קודמות אינן נדרסות._',
    );
    lines.push('');
    const markdown = lines.join('\n');

    // ─── JSON manifest ──────────────────────────────────────────
    const json = {
      schema: 'grand-consolidator/v1',
      agent: 'Y-200',
      generated: timestamp,
      rule: 'לא מוחקים רק משדרגים ומגדלים',
      celebration: CELEBRATION,
      totals: summary.totals,
      groups: summary.groups,
      reports: safeRecords.map((r) => ({
        agentId: r.agentId,
        title: r.title,
        testsCount: r.testsCount,
        statusClaim: r.statusClaim,
        sizeKb: r.sizeKb,
        lastModified: r.lastModified,
        fileName: r.fileName,
        swarm: r.swarm,
        flags: r.flags || {},
      })),
    };

    return { markdown, json, summary };
  }

  /**
   * appendRollingLog(existingMarkdown, summary, timestamp) — return the
   * new markdown with an additional rolling-log entry at the bottom.
   * If the existing file had no log marker, we graft one on.
   */
  appendRollingLog(existingMarkdown, summary, timestamp) {
    const entry =
      `- **${timestamp}** — reports: ${summary.totals.reports}, tests: ${summary.totals.tests}, ` +
      `green: ${summary.totals.green}, yellow: ${summary.totals.yellow}, red: ${summary.totals.red}, ` +
      `errors: ${summary.totals.errors}`;
    if (!existingMarkdown || !existingMarkdown.includes(ROLLING_LOG_MARKER)) {
      return (
        (existingMarkdown ? existingMarkdown.trimEnd() + '\n\n' : '') +
        ROLLING_LOG_MARKER +
        '\n' +
        ROLLING_LOG_HEADER +
        '\n\n' +
        entry +
        '\n'
      );
    }
    // Append a new entry at the end of the file while keeping prior entries.
    return existingMarkdown.trimEnd() + '\n' + entry + '\n';
  }

  /**
   * run() — orchestrate scan → parse → build → write. Returns the same
   * object shape as `buildIndex`, plus the resolved output paths.
   */
  async run(opts = {}) {
    const reportDir = opts.reportDir || this.reportDir;
    const outputDir = opts.outputDir || this.outputDir;
    const writeOutput = opts.writeOutput !== false;

    const files = this.scanReports(reportDir);
    const records = [];
    for (const f of files) {
      try {
        records.push(this.parseMetadata(f));
      } catch (e) {
        this.errors.push({ file: f, error: e.message });
      }
    }
    const built = this.buildIndex(records, { timestamp: opts.timestamp });

    const mdPath = path.join(outputDir, 'MASTER_INDEX.md');
    const jsonPath = path.join(outputDir, 'MASTER_INDEX.json');

    if (writeOutput) {
      if (!this.fsImpl.existsSync(outputDir)) {
        this.fsImpl.mkdirSync(outputDir, { recursive: true });
      }

      // Preserve prior MASTER_INDEX.md history by appending, never
      // overwriting a non-empty file in a lossy way. If the file exists,
      // we keep its content above the rolling-log marker and just append
      // a new dated entry. The table sections are re-rendered at the top
      // using the freshest data.
      let existing = '';
      if (this.fsImpl.existsSync(mdPath)) {
        try {
          existing = this.fsImpl.readFileSync(mdPath, 'utf8');
        } catch (e) {
          this.warnings.push(`Could not read existing MASTER_INDEX.md: ${e.message}`);
        }
      }

      let finalMd = built.markdown;
      if (existing && existing.includes(ROLLING_LOG_MARKER)) {
        // Extract the prior rolling-log block and splice it into the fresh
        // render, then append this run's entry at the end. Never delete.
        const oldIdx = existing.indexOf(ROLLING_LOG_MARKER);
        const oldLog = existing.slice(oldIdx);
        // Strip the marker + header from the new render's log section so
        // we don't end up with two headers.
        const newIdx = finalMd.indexOf(ROLLING_LOG_MARKER);
        finalMd = finalMd.slice(0, newIdx).trimEnd() + '\n\n' + oldLog;
      }
      finalMd = this.appendRollingLog(finalMd, built.summary, built.summary.timestamp);

      try {
        this.fsImpl.writeFileSync(mdPath, finalMd, 'utf8');
      } catch (e) {
        this.errors.push({ file: mdPath, error: `write failed: ${e.message}` });
      }
      try {
        this.fsImpl.writeFileSync(
          jsonPath,
          JSON.stringify(built.json, null, 2),
          'utf8',
        );
      } catch (e) {
        this.errors.push({ file: jsonPath, error: `write failed: ${e.message}` });
      }

      built.markdown = finalMd;
    }

    return {
      ...built,
      records,
      mdPath,
      jsonPath,
      warnings: this.warnings.slice(),
      errors: this.errors.slice(),
    };
  }
}

// ─── flat function surface ─────────────────────────────────────

function scanReports(dir, opts) {
  return new GrandConsolidator(opts || {}).scanReports(dir);
}

function parseMetadata(file, rawOverride, opts) {
  return new GrandConsolidator(opts || {}).parseMetadata(file, rawOverride);
}

function buildIndex(records, opts) {
  return new GrandConsolidator(opts || {}).buildIndex(records, opts || {});
}

async function run(opts) {
  return new GrandConsolidator(opts || {}).run(opts || {});
}

function escapeTableCell(s) {
  return String(s == null ? '' : s)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

// ─── exports ────────────────────────────────────────────────────

module.exports = {
  GrandConsolidator,
  scanReports,
  parseMetadata,
  buildIndex,
  run,
  _internals: {
    normalizeStatus,
    extractTestCount,
    bytesToKb,
    classifySwarm,
    parseIdFromFilename,
    parseIdFromContent,
    extractTitle,
    escapeTableCell,
    SWARM_DEFS,
    ROLLING_LOG_MARKER,
    ROLLING_LOG_HEADER,
    CELEBRATION,
  },
};
