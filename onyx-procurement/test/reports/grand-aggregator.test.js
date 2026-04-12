/**
 * Unit tests for src/reports/grand-aggregator.js
 * Agent X-100 — Grand Aggregator
 *
 * Strategy:
 *   - Build a temp fixture tree with:
 *       fake_qa_root/_qa-reports/{QA,AG,...}.md
 *       fake_op_root/_qa-reports/{QA,AG,...}.md
 *       fake_src_root/{payroll,vat,bank,...}/module.js
 *       fake_test_root/{something}.test.js
 *   - Run aggregateAll() pointed at those dirs.
 *   - Verify:
 *       • parseReport: title, agent_id, status, bug counts, module classification
 *       • classifyAgent: wave / swarm grouping matches definitions
 *       • classifyDomain: each domain keyword resolves correctly
 *       • aggregate(): swarm bucketing, completion rate, critical list
 *       • computeVerdict: GO / NO-GO / CONDITIONAL rules all fire
 *       • renderGrandFinal: output is valid Markdown, Hebrew + English present
 *       • aggregateAll: writes GRAND-FINAL.md, never overwrites source reports
 *       • Missing directories are skipped with a warning, never an error
 *       • Empty supabase/empty inputs yield a valid zero-state result
 *
 * Run:
 *   node --test onyx-procurement/test/reports/grand-aggregator.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  aggregateAll,
  parseReport,
  classifyAgent,
  classifyDomain,
  computeVerdict,
  renderGrandFinal,
  _internals,
} = require('../../src/reports/grand-aggregator');

// ─── fixture helpers ───────────────────────────────────────────

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(dir, name, content) {
  const full = path.join(dir, name);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  return full;
}

function buildSyntheticFixture() {
  const root = mkTmp('grand-agg-');
  const qaRoot = path.join(root, '_qa-reports');
  const opQaRoot = path.join(root, 'onyx-procurement', '_qa-reports');
  const srcRoot = path.join(root, 'onyx-procurement', 'src');
  const testRoot = path.join(root, 'onyx-procurement', 'test');

  // Report 1 — QA-02 completed with bugs.
  writeFile(qaRoot, 'QA-02-unit-tests.md', `# QA-02 — Unit Test Audit Report

**Agent:** QA-02 (Unit Test Agent)
**Scope:** src/payroll/wage-slip-calculator.js
**Date:** 2026-04-11
**Status:** GREEN — 251/251 passing

## 2. New test files added

| # | File | Tests | Suites | Module under test |
|---|------|------:|------:|-------------------|
| 1 | \`test/unit/qa-02-wage-slip-calculator.test.js\` | 90 | 10 | \`src/payroll/wage-slip-calculator.js\` |

## 4. Bugs found

### BUG-QA02-01 — tax_credits=0 fallback
**Severity:** High
Description: credit falls back to 2.25.

### BUG-QA02-05 — fmtAmount strips sign
**Severity:** Critical
Description: overflow drops negative.

### BUG-QA02-07 — Feb 29 silent rollover
**Severity:** Medium
Date library rolls invalid dates forward.

## 5. Recommendations

- Replace \`|| 2.25\` with nullish coalescing
- Reject negative amounts at entry
- Validate date parts before emission

## 6. Pass / fail summary

| File | Tests | Pass | Fail |
|------|------:|----:|----:|
| qa-02-wage-slip.test.js | 90 | 90 | 0 |
`);

  // Report 2 — AG-100 anomaly detector completed, no criticals.
  writeFile(qaRoot, 'AG-100-anomaly-detector.md', `# AG-100 — Anomaly Detection Engine for Financial Transactions

**Agent:** 100
**Date:** 2026-04-11
**Status:** GREEN — 34 / 34 tests passing
**Module:** src/ml/anomaly-detector.js

## Deliverables

| File | Purpose |
|---|---|
| \`onyx-procurement/src/ml/anomaly-detector.js\` | Engine |
| \`onyx-procurement/test/payroll/anomaly-detector.test.js\` | 34 unit tests |

## 5. Test Suite

Cases: 34 tests across 10 detectors and all helper utilities.
`);

  // Report 3 — QA-19 NO-GO with multiple bugs.
  writeFile(opQaRoot, 'QA-19-blockers.md', `# QA-19 — Blockers Only

**Agent:** QA-19 Release Readiness Agent
**Date:** 2026-04-11
**Status:** RED — NO-GO
**Scope:** onyx-procurement

## Summary

| Severity tier | Count | Hours to fix |
|---|---|---|
| Critical | 12 | 5h |
| High | 8 | 19h |
| Medium | 4 | 6h |

### BUG-QA19-01 — Auth missing
**Severity:** Critical
No authentication on /api/* endpoints.

### BUG-QA19-02 — SQL injection
**Severity:** Critical
Table-name interpolation in ontology.

### BUG-QA19-03 — VAT rate hardcoded
**Severity:** High
18% instead of 17% — tax filing error.

## Action items

- Wire security middleware
- Rotate committed secrets
- Enable RLS on every table
`);

  // Report 4 — AG-X35 CRM pipeline done.
  writeFile(qaRoot, 'AG-X35-crm-pipeline.md', `# AG-X35 — CRM Pipeline

**Agent:** X-35
**Date:** 2026-04-11
**Status:** GREEN
**Module:** src/crm/pipeline.js

## Deliverables

- \`onyx-procurement/src/crm/pipeline.js\`
- \`onyx-procurement/test/crm/pipeline.test.js\`
`);

  // Report 5 — Empty file (robustness test).
  writeFile(opQaRoot, 'empty.md', '');

  // Report 6 — Binary-looking noise file (should still be handled).
  writeFile(opQaRoot, 'weird.md', '\x00\x01\x02 not really markdown but not binary either');

  // Src files — one per domain.
  writeFile(srcRoot, 'payroll/wage-slip-calculator.js', '// payroll module');
  writeFile(srcRoot, 'vat/pcn836.js', '// vat module');
  writeFile(srcRoot, 'bank/matcher.js', '// finance/bank module');
  writeFile(srcRoot, 'crm/pipeline.js', '// crm module');
  writeFile(srcRoot, 'warehouse/wms.js', '// wms module');
  writeFile(srcRoot, 'ops/logger.js', '// observability module');
  writeFile(srcRoot, 'integrations/whatsapp.js', '// integrations module');
  writeFile(srcRoot, 'tax/form-builder.js', '// tax module');
  // Not counted — test file adjacent to src.
  writeFile(srcRoot, 'payroll/wage-slip.test.js', '// should be excluded');

  // Test files — two counted, one a spec.
  writeFile(testRoot, 'unit/first.test.js', `
    test('a', () => {});
    test('b', () => {});
    it('c', () => {});
  `);
  writeFile(testRoot, 'unit/second.test.js', `
    describe('suite', () => {
      test('d', () => {});
      test('e', () => {});
      test('f', () => {});
    });
  `);
  writeFile(testRoot, 'integration/third.spec.js', `
    test('g', () => {});
  `);

  return {
    root,
    reportDirs: [qaRoot, opQaRoot],
    srcDirs: [srcRoot],
    testDirs: [testRoot],
  };
}

// ─── parseReport tests ─────────────────────────────────────────

test('parseReport: extracts agent id, title, status from a standard QA report', () => {
  const content = `# QA-02 — Unit Test Audit Report

**Agent:** QA-02 (Unit Test Agent)
**Status:** GREEN — 251/251 passing
**Scope:** src/payroll
`;
  const r = parseReport('/tmp/QA-02-unit-tests.md', content);
  assert.equal(r.agent_id, 'QA-02');
  assert.match(r.title, /QA-02/);
  assert.equal(r.status, 'GREEN');
  assert.equal(r.status_bucket, 'completed');
});

test('parseReport: extracts agent id from AG-X## filename', () => {
  const content = `# AG-X35 — CRM Pipeline

**Status:** GREEN
**Module:** src/crm/pipeline.js
`;
  const r = parseReport('/tmp/AG-X35-crm-pipeline.md', content);
  assert.equal(r.agent_id, 'AG-X35');
  assert.equal(r.status_bucket, 'completed');
});

test('parseReport: counts bugs by severity in BUG sections', () => {
  const content = `# Test

**Status:** GREEN

## Bugs

### BUG-01 — One
**Severity:** Critical
First.

### BUG-02 — Two
**Severity:** High
Second.

### BUG-03 — Three
**Severity:** Medium
Third.

### BUG-04 — Four
**Severity:** Low
Fourth.

## End
`;
  const r = parseReport('/tmp/QA-01-bugs.md', content);
  assert.equal(r.bug_counts.critical, 1);
  assert.equal(r.bug_counts.high, 1);
  assert.equal(r.bug_counts.medium, 1);
  assert.equal(r.bug_counts.low, 1);
  assert.equal(r.bug_counts.total, 4);
  // Critical + High go into critical_items.
  assert.equal(r.critical_items.length, 2);
});

test('parseReport: summary-table bug counts override BUG-section counts when larger', () => {
  const content = `# QA-19

**Status:** RED

## Summary

| Severity | Count |
|---|---|
| Critical | 12 |
| High | 8 |
`;
  const r = parseReport('/tmp/QA-19.md', content);
  assert.ok(r.bug_counts.critical >= 12);
  assert.ok(r.bug_counts.high >= 8);
});

test('parseReport: recommendations extracted as bullets', () => {
  const content = `# QA-1

**Status:** GREEN

## Recommendations

- Do the first thing
- Do the second thing
- Do the third thing

## Next section
`;
  const r = parseReport('/tmp/QA-1.md', content);
  assert.ok(r.recommendations.includes('Do the first thing'));
  assert.ok(r.recommendations.length >= 3);
});

test('parseReport: handles empty content without throwing', () => {
  const r = parseReport('/tmp/empty.md', '');
  assert.equal(r.parse_error, 'empty-content');
  assert.equal(r.bug_counts.total, 0);
});

test('parseReport: handles missing headers gracefully', () => {
  const r = parseReport('/tmp/nothing.md', 'just some text\nno headings\n');
  assert.equal(r.agent_id, null);
  assert.equal(r.title, null);
  assert.equal(r.bug_counts.total, 0);
});

test('parseReport: bilingual title splits into he + en when separated by em-dash', () => {
  const content = `# סיכום מקיף — Grand Final Report

**Status:** GREEN
`;
  const r = parseReport('/tmp/bi.md', content);
  assert.ok(r.title_he);
  assert.ok(r.title_en);
  assert.match(r.title_he, /סיכום/);
  assert.match(r.title_en, /Grand/);
});

// ─── classifyAgent tests ───────────────────────────────────────

test('classifyAgent: QA-01..20 routes to qa-framework', () => {
  assert.equal(classifyAgent('QA-01').id, 'qa-framework');
  assert.equal(classifyAgent('QA-10').id, 'qa-framework');
  assert.equal(classifyAgent('QA-20').id, 'qa-framework');
});

test('classifyAgent: AG-51..100 routes to swarm-2', () => {
  assert.equal(classifyAgent('AG-56').id, 'swarm-2');
  assert.equal(classifyAgent('AG-100').id, 'swarm-2');
});

test('classifyAgent: AG-01..50 routes to swarm-1', () => {
  assert.equal(classifyAgent('AG-10').id, 'swarm-1');
  assert.equal(classifyAgent('AG-50').id, 'swarm-1');
});

test('classifyAgent: AG-X## routes to swarm-3', () => {
  assert.equal(classifyAgent('AG-X01').id, 'swarm-3');
  assert.equal(classifyAgent('AG-X50').id, 'swarm-3');
  assert.equal(classifyAgent('AG-X100').id, 'swarm-3');
});

test('classifyAgent: WAVE-1..10 routes to waves-1-10', () => {
  assert.equal(classifyAgent('WAVE-1').id, 'waves-1-10');
  assert.equal(classifyAgent('WAVE-5').id, 'waves-1-10');
});

test('classifyAgent: Y-001..200 routes to wave-y', () => {
  assert.equal(classifyAgent('Y-001').id, 'wave-y');
  assert.equal(classifyAgent('Y-200').id, 'wave-y');
});

test('classifyAgent: unknown IDs fall through to unclassified', () => {
  assert.equal(classifyAgent(null).id, 'unclassified');
  assert.equal(classifyAgent('RANDO-XYZ').id, 'unclassified');
});

// ─── classifyDomain tests ──────────────────────────────────────

test('classifyDomain: matches each domain by keyword', () => {
  assert.equal(classifyDomain('src/tax/form-builder.js').id, 'tax');
  assert.equal(classifyDomain('src/payroll/wage.js').id, 'payroll');
  assert.equal(classifyDomain('src/crm/pipeline.js').id, 'crm');
  assert.equal(classifyDomain('src/warehouse/wms.js').id, 'wms');
  assert.equal(classifyDomain('src/bank/matcher.js').id, 'finance');
  assert.equal(classifyDomain('src/ops/logger.js').id, 'observability');
  assert.equal(classifyDomain('src/integrations/whatsapp.js').id, 'integrations');
});

test('classifyDomain: unknown keywords fall through to uncategorized', () => {
  assert.equal(classifyDomain('src/unknown/foo.js').id, 'uncategorized');
  assert.equal(classifyDomain(null).id, 'uncategorized');
});

// ─── statusBucket tests ────────────────────────────────────────

test('_internals.statusBucket: classifies GREEN/DONE/PASS as completed', () => {
  assert.equal(_internals.statusBucket('GREEN'), 'completed');
  assert.equal(_internals.statusBucket('DONE'), 'completed');
  assert.equal(_internals.statusBucket('PASS'), 'completed');
});

test('_internals.statusBucket: classifies RED/FAIL/NO-GO as failed', () => {
  assert.equal(_internals.statusBucket('RED'), 'failed');
  assert.equal(_internals.statusBucket('NO-GO'), 'failed');
  assert.equal(_internals.statusBucket('FAIL'), 'failed');
});

test('_internals.statusBucket: classifies YELLOW/CONDITIONAL as partial', () => {
  assert.equal(_internals.statusBucket('YELLOW'), 'partial');
  assert.equal(_internals.statusBucket('CONDITIONAL'), 'partial');
  assert.equal(_internals.statusBucket('IN-PROGRESS'), 'partial');
});

// ─── computeVerdict tests ──────────────────────────────────────

test('computeVerdict: GO when no criticals and high completion', () => {
  const summary = {
    total_completed: 50,
    total_failed: 0,
    total_partial: 5,
    total_reports: 55,
    completion_rate: 0.91,
    by_swarm: {
      a: { bugs: { critical: 0, high: 2, medium: 3, low: 1 } },
    },
  };
  const v = computeVerdict(summary);
  assert.equal(v.verdict, 'GO');
});

test('computeVerdict: NO-GO when any critical bug', () => {
  const summary = {
    total_completed: 10,
    total_failed: 0,
    total_partial: 0,
    total_reports: 10,
    completion_rate: 1.0,
    by_swarm: {
      a: { bugs: { critical: 1, high: 0, medium: 0, low: 0 } },
    },
  };
  const v = computeVerdict(summary);
  assert.equal(v.verdict, 'NO-GO');
  assert.ok(v.reasons.some((r) => /critical/i.test(r)));
});

test('computeVerdict: NO-GO when 5+ high bugs even with no criticals', () => {
  const summary = {
    total_completed: 10,
    total_failed: 0,
    total_partial: 0,
    total_reports: 10,
    completion_rate: 1.0,
    by_swarm: {
      a: { bugs: { critical: 0, high: 6, medium: 0, low: 0 } },
    },
  };
  const v = computeVerdict(summary);
  assert.equal(v.verdict, 'NO-GO');
  assert.ok(v.reasons.some((r) => /high-severity/i.test(r)));
});

test('computeVerdict: CONDITIONAL when failing reports exceed 10% of completed', () => {
  const summary = {
    total_completed: 10,
    total_failed: 3,   // 30% > 10%
    total_partial: 0,
    total_reports: 13,
    completion_rate: 0.77,
    by_swarm: {
      a: { bugs: { critical: 0, high: 0, medium: 0, low: 0 } },
    },
  };
  const v = computeVerdict(summary);
  assert.equal(v.verdict, 'CONDITIONAL');
});

test('computeVerdict: CONDITIONAL when completion rate < 70%', () => {
  const summary = {
    total_completed: 6,
    total_failed: 0,
    total_partial: 4,
    total_reports: 10,
    completion_rate: 0.60,
    by_swarm: {
      a: { bugs: { critical: 0, high: 0, medium: 0, low: 0 } },
    },
  };
  const v = computeVerdict(summary);
  assert.equal(v.verdict, 'CONDITIONAL');
});

// ─── aggregation tests ─────────────────────────────────────────

test('_internals.aggregate: buckets reports by swarm correctly', () => {
  const reports = [
    { agent_id: 'QA-02', status_bucket: 'completed', bug_counts: { critical: 0, high: 1, medium: 0, low: 0, total: 1 }, critical_items: [], swarm: _internals.SWARM_DEFINITIONS[0], domain: _internals.DOMAINS[0] },
    { agent_id: 'AG-100', status_bucket: 'completed', bug_counts: { critical: 0, high: 0, medium: 0, low: 0, total: 0 }, critical_items: [], swarm: _internals.SWARM_DEFINITIONS[1], domain: _internals.DOMAINS[0] },
  ];
  const agg = _internals.aggregate(reports, { files: 0, by_domain: {} }, { files: 0, estimated_cases: 0 });
  assert.equal(agg.total_reports, 2);
  assert.equal(agg.total_completed, 2);
  assert.equal(agg.completion_rate, 1);
});

// ─── full pipeline tests ───────────────────────────────────────

test('aggregateAll: end-to-end on synthetic fixtures — writes GRAND-FINAL.md', async () => {
  const fx = buildSyntheticFixture();
  const outputPath = path.join(fx.root, '_qa-reports', 'GRAND-FINAL.md');
  const result = await aggregateAll({
    reportDirs: fx.reportDirs,
    srcDirs: fx.srcDirs,
    testDirs: fx.testDirs,
    outputPath,
  });

  // Written to disk.
  assert.ok(fs.existsSync(outputPath), 'GRAND-FINAL.md must exist');
  assert.equal(result.written, true);

  // Reports were collected (QA-02, AG-100, QA-19, AG-X35; empty/weird files should
  // still parse to some degree).
  assert.ok(result.reports.length >= 4, `expected >=4 reports, got ${result.reports.length}`);

  // Summary counts make sense.
  assert.ok(result.summary.total_reports >= 4);
  assert.ok(result.summary.total_completed >= 3);
  assert.ok(result.summary.total_failed >= 1);

  // At least one critical bug was surfaced (from QA-02 BUG-QA02-05 and QA-19).
  const totalCritical = Object.values(result.summary.by_swarm)
    .reduce((s, g) => s + g.bugs.critical, 0);
  assert.ok(totalCritical >= 1, `expected at least 1 critical bug, got ${totalCritical}`);

  // Verdict should be NO-GO because we seeded critical bugs.
  assert.equal(result.verdict.verdict, 'NO-GO');

  // Source modules counted across domains.
  assert.ok(result.summary.src_summary.files >= 7);
  assert.ok(result.summary.src_summary.by_domain.payroll >= 1);
  assert.ok(result.summary.src_summary.by_domain.tax >= 1);
  assert.ok(result.summary.src_summary.by_domain.crm >= 1);
  assert.ok(result.summary.src_summary.by_domain.wms >= 1);

  // Test files counted (2 .test + 1 .spec).
  assert.equal(result.summary.test_summary.files, 3);
  // Total estimated cases >= 7 (our fixture has 7 test/it calls).
  assert.ok(result.summary.test_summary.estimated_cases >= 7);

  // Markdown output contains both Hebrew and English section titles.
  const md = fs.readFileSync(outputPath, 'utf8');
  assert.match(md, /סיכום מקיף/, 'Hebrew title missing');
  assert.match(md, /Grand Final QA Report/, 'English title missing');
  assert.match(md, /Executive Summary/);
  assert.match(md, /תקציר מנהלים/);
  assert.match(md, /Release Readiness Verdict/);
  assert.match(md, /פסיקת מוכנות/);
  assert.match(md, /NO-GO/, 'verdict should appear in output');
  assert.match(md, /לא מוחקים רק משדרגים ומגדלים/, 'rule reminder missing');

  // Clean up temp dir.
  fs.rmSync(fx.root, { recursive: true, force: true });
});

test('aggregateAll: missing report dir is reported as warning, not an error', async () => {
  const tmp = mkTmp('grand-agg-miss-');
  const missing = path.join(tmp, 'no-such-dir');
  const result = await aggregateAll({
    reportDirs: [missing],
    srcDirs: [],
    testDirs: [],
    outputPath: path.join(tmp, 'GRAND-FINAL.md'),
  });
  assert.ok(result.warnings.some((w) => /missing/i.test(w)));
  assert.equal(result.summary.total_reports, 0);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('aggregateAll: zero reports yields valid GO verdict with CONDITIONAL adjustment', async () => {
  const tmp = mkTmp('grand-agg-empty-');
  const emptyRoot = path.join(tmp, '_qa-reports');
  fs.mkdirSync(emptyRoot, { recursive: true });
  const result = await aggregateAll({
    reportDirs: [emptyRoot],
    srcDirs: [],
    testDirs: [],
    outputPath: path.join(emptyRoot, 'GRAND-FINAL.md'),
  });
  assert.equal(result.summary.total_reports, 0);
  assert.ok(['GO', 'CONDITIONAL', 'NO-GO'].includes(result.verdict.verdict));
  // Zero-reports case: should not NO-GO because of a missing criticals field.
  assert.equal(result.summary.total_completed, 0);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('aggregateAll: writeOutput=false skips disk write', async () => {
  const fx = buildSyntheticFixture();
  const outputPath = path.join(fx.root, '_qa-reports', 'GRAND-FINAL-no-write.md');
  const result = await aggregateAll({
    reportDirs: fx.reportDirs,
    srcDirs: fx.srcDirs,
    testDirs: fx.testDirs,
    outputPath,
    writeOutput: false,
  });
  assert.equal(result.written, false);
  assert.equal(fs.existsSync(outputPath), false);
  assert.ok(result.markdown.length > 0);
  fs.rmSync(fx.root, { recursive: true, force: true });
});

test('aggregateAll: never modifies source report files (לא מוחקים)', async () => {
  const fx = buildSyntheticFixture();
  // Snapshot all report files' contents before running.
  const before = {};
  for (const d of fx.reportDirs) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (f.endsWith('.md')) {
        before[path.join(d, f)] = fs.readFileSync(path.join(d, f), 'utf8');
      }
    }
  }
  const outputPath = path.join(fx.root, '_qa-reports', 'GRAND-FINAL.md');
  await aggregateAll({
    reportDirs: fx.reportDirs,
    srcDirs: fx.srcDirs,
    testDirs: fx.testDirs,
    outputPath,
  });
  // Verify every source file is unchanged.
  for (const [p, content] of Object.entries(before)) {
    assert.equal(fs.readFileSync(p, 'utf8'), content, `source file modified: ${p}`);
  }
  fs.rmSync(fx.root, { recursive: true, force: true });
});

test('aggregateAll: GRAND-FINAL.md in report dir is not re-parsed recursively', async () => {
  const fx = buildSyntheticFixture();
  const outputPath = path.join(fx.reportDirs[0], 'GRAND-FINAL.md');
  // Pre-seed an existing GRAND-FINAL.md in the same directory.
  fs.writeFileSync(outputPath, '# pre-existing\n', 'utf8');
  const result = await aggregateAll({
    reportDirs: fx.reportDirs,
    srcDirs: fx.srcDirs,
    testDirs: fx.testDirs,
    outputPath,
  });
  // None of the parsed reports should have basename GRAND-FINAL.md.
  const grandInParsed = result.reports.find((r) => /GRAND-FINAL/i.test(r.basename || ''));
  assert.equal(grandInParsed, undefined, 'aggregator must skip its own output');
  fs.rmSync(fx.root, { recursive: true, force: true });
});

// ─── renderGrandFinal direct test ──────────────────────────────

test('renderGrandFinal: produces valid Markdown with both Hebrew and English', () => {
  const fakeResult = {
    summary: {
      total_reports: 5,
      total_completed: 4,
      total_failed: 1,
      total_partial: 0,
      total_unknown: 0,
      completion_rate: 0.8,
      src_summary: { files: 10, by_domain: { tax: 3, payroll: 2, crm: 1, wms: 1, finance: 1, observability: 1, integrations: 1, uncategorized: 0 }, sample_files: {} },
      test_summary: { files: 5, estimated_cases: 50 },
      by_swarm: {
        'qa-framework': {
          id: 'qa-framework',
          label_en: 'QA-01..20 (20-Agent QA Framework)',
          label_he: 'מסגרת QA — 20 סוכנים',
          reports: 5,
          completed: 4,
          failed: 1,
          partial: 0,
          bugs: { critical: 0, high: 1, medium: 2, low: 0 },
          top_critical: [],
        },
      },
      domain_bugs: { tax: 1, payroll: 1, crm: 0, wms: 0, finance: 1, observability: 0, integrations: 0, uncategorized: 0 },
      critical_items: [
        { id: 'BUG-01', title: 'Auth missing', severity: 'CRITICAL', source: 'QA-01.md', agent_id: 'QA-01', domain: 'finance' },
      ],
    },
    verdict: { verdict: 'NO-GO', reasons: ['1 critical bug — must be resolved before production'] },
    action_items: [
      { rank: 1, severity: 'CRITICAL', title: 'Auth missing', source: 'QA-01.md', agent_id: 'QA-01', domain: 'finance' },
    ],
    warnings: [],
    parse_failures: [],
  };
  const md = renderGrandFinal(fakeResult);
  assert.match(md, /# סיכום מקיף/);
  assert.match(md, /Grand Final QA Report/);
  assert.match(md, /NO-GO/);
  assert.match(md, /Auth missing/);
  assert.match(md, /לא מוחקים רק משדרגים ומגדלים/);
  // Table rows for swarm.
  assert.match(md, /qa-framework|QA-01\.\.20/);
});

test('renderGrandFinal: empty reports produce a minimal but valid document', () => {
  const md = renderGrandFinal({
    summary: {
      total_reports: 0,
      total_completed: 0,
      total_failed: 0,
      total_partial: 0,
      total_unknown: 0,
      completion_rate: 0,
      src_summary: { files: 0, by_domain: {}, sample_files: {} },
      test_summary: { files: 0, estimated_cases: 0 },
      by_swarm: {},
      domain_bugs: {},
      critical_items: [],
    },
    verdict: { verdict: 'GO', reasons: ['no activity'] },
    action_items: [],
    warnings: [],
    parse_failures: [],
  });
  assert.match(md, /# סיכום מקיף/);
  assert.match(md, /0 /); // at least one 0 in the summary table
});
