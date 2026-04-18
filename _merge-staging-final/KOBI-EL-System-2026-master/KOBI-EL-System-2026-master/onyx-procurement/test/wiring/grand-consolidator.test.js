/**
 * Unit tests for src/wiring/grand-consolidator.js
 * Agent Y-200 — Grand Consolidator
 *
 * Strategy:
 *   Build an ephemeral fixture directory under `os.tmpdir()` containing a
 *   handful of AG / QA / Y reports with varying shapes (GREEN, YELLOW,
 *   RED, missing status, malformed). Run the consolidator against the
 *   fixture and assert on:
 *
 *     • scanReports — correct file enumeration, deterministic order
 *     • parseMetadata — agent id, title, test count, status, size, mtime
 *     • classifySwarm — numeric ranges resolve correctly
 *     • buildIndex — bilingual markdown, group totals, JSON manifest
 *     • run — writes both artifacts, preserves rolling log on re-run,
 *              never overwrites prior entries
 *     • Error handling — missing dir, unreadable file, no ID
 *
 * Run:
 *   node --test onyx-procurement/test/wiring/grand-consolidator.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  GrandConsolidator,
  scanReports,
  parseMetadata,
  buildIndex,
  run,
  _internals,
} = require('../../src/wiring/grand-consolidator');

// ─── fixture helpers ───────────────────────────────────────────

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'grand-cons-'));
}

function writeFile(dir, name, content) {
  const full = path.join(dir, name);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  return full;
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {
    // ignore
  }
}

function buildFixtureReports(reportDir) {
  writeFile(
    reportDir,
    'AG-Y200-grand-consolidator.md',
    `# AG-Y200 — Grand Consolidator

**Agent:** Y-200
**Status:** GREEN — 17/17 passing
**Date:** 2026-04-11

Seventeen tests, all passing.
`,
  );

  writeFile(
    reportDir,
    'AG-Y001-form-1301.md',
    `# AG-Y001 — Form 1301

**Agent:** Y-001
**Status:** PASS (24/24)
**Date:** 2026-04-11
`,
  );

  writeFile(
    reportDir,
    'AG-Y060-customer-success.md',
    `# AG-Y060 — Customer Success

**Agent:** Y-060
**Status:** GREEN — 31 tests passing
`,
  );

  writeFile(
    reportDir,
    'AG-Y180-final-pipeline.md',
    `# AG-Y180 — Final Pipeline

**Agent:** Y-180
**Status:** YELLOW — 4/10 passing
`,
  );

  writeFile(
    reportDir,
    'AG-05-payroll-calc.md',
    `# AG-05 — Payroll Calculator

**Agent:** AG-05
**Status:** GREEN — 90 tests, all passing
**Date:** 2026-03-01
`,
  );

  writeFile(
    reportDir,
    'AG-75-supplier-scorer.md',
    `# AG-75 — Supplier Scorer

**Agent:** AG-75
**Status:** GREEN — 42/42 tests
`,
  );

  writeFile(
    reportDir,
    'AG-X07-price-optimizer.md',
    `# AG-X07 — Price Optimizer

**Agent:** X-07
**Status:** GREEN — 66/66 passing
`,
  );

  writeFile(
    reportDir,
    'QA-02-unit-tests.md',
    `# QA-02 — Unit Test Audit Report

**Agent:** QA-02
**Status:** RED — 12 failing
`,
  );

  writeFile(
    reportDir,
    'AG-corrupt-no-title.md',
    `No heading at all. No id. No status.

Just some text.`,
  );

  writeFile(
    reportDir,
    'not-a-report.txt',
    'This txt file should be ignored by scanReports.',
  );
}

// ─── tests ─────────────────────────────────────────────────────

test('1. module exports the documented surface', () => {
  assert.equal(typeof GrandConsolidator, 'function');
  assert.equal(typeof scanReports, 'function');
  assert.equal(typeof parseMetadata, 'function');
  assert.equal(typeof buildIndex, 'function');
  assert.equal(typeof run, 'function');
  assert.ok(_internals, 'internals bucket is present');
  assert.equal(typeof _internals.classifySwarm, 'function');
});

test('2. scanReports returns only .md files, sorted', () => {
  const dir = mkTmp();
  try {
    buildFixtureReports(dir);
    const files = scanReports(dir);
    assert.ok(files.length >= 8, 'at least 8 .md reports');
    for (const f of files) {
      assert.match(f, /\.md$/);
    }
    const names = files.map((f) => path.basename(f));
    const sorted = names.slice().sort();
    assert.deepEqual(names, sorted, 'results are sorted');
    assert.ok(!names.some((n) => n === 'not-a-report.txt'), 'txt files skipped');
  } finally {
    cleanup(dir);
  }
});

test('3. scanReports tolerates a missing directory (warning, no throw)', () => {
  const missing = path.join(os.tmpdir(), 'grand-cons-missing-xyz-' + Date.now());
  const c = new GrandConsolidator({ reportDir: missing });
  const result = c.scanReports(missing);
  assert.deepEqual(result, []);
  assert.ok(c.warnings.length >= 1, 'warning recorded');
});

test('4. parseMetadata extracts agentId from filename and title', () => {
  const dir = mkTmp();
  try {
    buildFixtureReports(dir);
    const file = path.join(dir, 'AG-Y200-grand-consolidator.md');
    const meta = parseMetadata(file);
    assert.equal(meta.agentId, 'AG-Y200');
    assert.match(meta.title, /Grand Consolidator/);
    assert.equal(meta.statusClaim, 'GREEN');
    assert.equal(meta.testsCount, 17);
    assert.ok(meta.sizeKb > 0);
    assert.ok(meta.lastModified);
    assert.equal(meta.swarm, 'WAVE_Y_151_200');
  } finally {
    cleanup(dir);
  }
});

test('5. parseMetadata correctly reads different test-count patterns', () => {
  const dir = mkTmp();
  try {
    buildFixtureReports(dir);
    const m1 = parseMetadata(path.join(dir, 'AG-Y001-form-1301.md'));
    assert.equal(m1.testsCount, 24, 'PASS (24/24) → 24');
    const m2 = parseMetadata(path.join(dir, 'AG-Y060-customer-success.md'));
    assert.equal(m2.testsCount, 31, '31 tests passing → 31');
    const m3 = parseMetadata(path.join(dir, 'AG-05-payroll-calc.md'));
    assert.equal(m3.testsCount, 90, '90 tests, all passing → 90');
  } finally {
    cleanup(dir);
  }
});

test('6. parseMetadata normalizes status claims (GREEN/YELLOW/RED)', () => {
  const dir = mkTmp();
  try {
    buildFixtureReports(dir);
    const red = parseMetadata(path.join(dir, 'QA-02-unit-tests.md'));
    assert.equal(red.statusClaim, 'RED');
    assert.equal(red.flags.RED, true);
    const yellow = parseMetadata(path.join(dir, 'AG-Y180-final-pipeline.md'));
    assert.equal(yellow.statusClaim, 'YELLOW');
    const green = parseMetadata(path.join(dir, 'AG-75-supplier-scorer.md'));
    assert.equal(green.statusClaim, 'GREEN');
  } finally {
    cleanup(dir);
  }
});

test('7. parseMetadata flags reports with no ID / no status', () => {
  const dir = mkTmp();
  try {
    buildFixtureReports(dir);
    const bad = parseMetadata(path.join(dir, 'AG-corrupt-no-title.md'));
    assert.equal(bad.statusClaim, 'UNKNOWN');
    assert.equal(bad.flags.NO_STATUS, true);
    assert.equal(bad.flags.NO_TESTS, true);
  } finally {
    cleanup(dir);
  }
});

test('8. classifySwarm routes IDs into the correct bucket', () => {
  const { classifySwarm } = _internals;
  assert.equal(classifySwarm('QA-02'), 'QA_FRAMEWORK');
  assert.equal(classifySwarm('AG-05'), 'SWARM1');
  assert.equal(classifySwarm('AG-75'), 'SWARM2');
  assert.equal(classifySwarm('AG-X07'), 'SWARM3');
  assert.equal(classifySwarm('AG-Y001'), 'WAVE_Y_01_14');
  assert.equal(classifySwarm('AG-Y020'), 'WAVE_Y_15_50');
  assert.equal(classifySwarm('AG-Y060'), 'WAVE_Y_51_100');
  assert.equal(classifySwarm('AG-Y120'), 'WAVE_Y_101_150');
  assert.equal(classifySwarm('AG-Y200'), 'WAVE_Y_151_200');
  assert.equal(classifySwarm(''), 'OTHER');
  assert.equal(classifySwarm(null), 'OTHER');
});

test('9. buildIndex returns bilingual markdown + JSON + summary', () => {
  const records = [
    {
      agentId: 'AG-Y200',
      title: 'Grand Consolidator',
      testsCount: 17,
      statusClaim: 'GREEN',
      sizeKb: 3.5,
      lastModified: '2026-04-11T10:00:00.000Z',
      fileName: 'AG-Y200-grand-consolidator.md',
      swarm: 'WAVE_Y_151_200',
      flags: {},
    },
    {
      agentId: 'QA-02',
      title: 'Unit Tests',
      testsCount: 0,
      statusClaim: 'RED',
      sizeKb: 1.2,
      lastModified: '2026-04-11T10:00:00.000Z',
      fileName: 'QA-02-unit-tests.md',
      swarm: 'QA_FRAMEWORK',
      flags: { RED: true },
    },
  ];
  const built = buildIndex(records, { timestamp: '2026-04-11 10:00:00' });
  assert.match(built.markdown, /MASTER INDEX/);
  assert.match(built.markdown, /מפתח ראשי/);
  assert.match(built.markdown, /Grand Consolidator/);
  assert.match(built.markdown, /QA Framework/);
  assert.match(built.markdown, /מסגרת QA/);
  assert.match(built.markdown, /17/);
  assert.match(built.markdown, /GREEN/);
  assert.match(built.markdown, /RED/);
  assert.equal(built.summary.totals.reports, 2);
  assert.equal(built.summary.totals.tests, 17);
  assert.equal(built.summary.totals.green, 1);
  assert.equal(built.summary.totals.red, 1);
  assert.equal(built.json.agent, 'Y-200');
  assert.equal(built.json.reports.length, 2);
});

test('10. buildIndex contains the bilingual celebration paragraph', () => {
  const built = buildIndex([], { timestamp: '2026-04-11 10:00:00' });
  assert.match(
    built.markdown,
    /כל 200 הסוכנים הושלמו · All 200 agents completed/,
  );
  assert.equal(
    built.json.celebration,
    'כל 200 הסוכנים הושלמו · All 200 agents completed',
  );
});

test('11. buildIndex groups records by swarm in display order', () => {
  const records = [
    { agentId: 'AG-Y200', title: 't', testsCount: 1, statusClaim: 'GREEN', sizeKb: 1, lastModified: '2026-04-11T00:00:00.000Z', fileName: 'a.md', swarm: 'WAVE_Y_151_200', flags: {} },
    { agentId: 'AG-05', title: 't', testsCount: 2, statusClaim: 'GREEN', sizeKb: 1, lastModified: '2026-04-11T00:00:00.000Z', fileName: 'b.md', swarm: 'SWARM1', flags: {} },
    { agentId: 'AG-X07', title: 't', testsCount: 3, statusClaim: 'GREEN', sizeKb: 1, lastModified: '2026-04-11T00:00:00.000Z', fileName: 'c.md', swarm: 'SWARM3', flags: {} },
  ];
  const built = buildIndex(records, { timestamp: '2026-04-11 10:00:00' });
  const swarm1Idx = built.markdown.indexOf('Swarm 1');
  const swarm3Idx = built.markdown.indexOf('Swarm 3');
  const waveYIdx = built.markdown.indexOf('Wave Y — Final Division');
  assert.ok(swarm1Idx > 0 && swarm3Idx > 0 && waveYIdx > 0);
  assert.ok(swarm1Idx < swarm3Idx, 'Swarm 1 before Swarm 3');
  assert.ok(swarm3Idx < waveYIdx, 'Swarm 3 before Wave Y 151-200');
});

test('12. run writes MASTER_INDEX.md and MASTER_INDEX.json to disk', async () => {
  const dir = mkTmp();
  try {
    buildFixtureReports(dir);
    const c = new GrandConsolidator({ reportDir: dir, outputDir: dir });
    const result = await c.run({ timestamp: '2026-04-11 10:00:00' });
    assert.ok(fs.existsSync(result.mdPath));
    assert.ok(fs.existsSync(result.jsonPath));
    const md = fs.readFileSync(result.mdPath, 'utf8');
    const jsonRaw = fs.readFileSync(result.jsonPath, 'utf8');
    assert.match(md, /MASTER INDEX/);
    assert.match(md, /ROLLING-LOG/);
    const parsed = JSON.parse(jsonRaw);
    assert.equal(parsed.agent, 'Y-200');
    assert.ok(parsed.reports.length >= 8);
    assert.ok(parsed.totals.reports >= 8);
  } finally {
    cleanup(dir);
  }
});

test('13. run is append-only on subsequent invocations (rolling log grows)', async () => {
  const dir = mkTmp();
  try {
    buildFixtureReports(dir);
    const c1 = new GrandConsolidator({ reportDir: dir, outputDir: dir });
    await c1.run({ timestamp: '2026-04-11 10:00:00' });
    const firstMd = fs.readFileSync(path.join(dir, 'MASTER_INDEX.md'), 'utf8');
    const firstLines = firstMd.split('\n').length;

    const c2 = new GrandConsolidator({ reportDir: dir, outputDir: dir });
    await c2.run({ timestamp: '2026-04-11 11:30:00' });
    const secondMd = fs.readFileSync(path.join(dir, 'MASTER_INDEX.md'), 'utf8');

    // Both timestamps must be present — prior run preserved.
    assert.match(secondMd, /2026-04-11 10:00:00/);
    assert.match(secondMd, /2026-04-11 11:30:00/);
    assert.ok(secondMd.length > firstMd.length, 'file grows (append-only)');
    assert.ok(secondMd.split('\n').length > firstLines);
  } finally {
    cleanup(dir);
  }
});

test('14. run never deletes or modifies source reports (rule #1)', async () => {
  const dir = mkTmp();
  try {
    buildFixtureReports(dir);
    // Snapshot source files first.
    const before = {};
    for (const f of fs.readdirSync(dir)) {
      if (!/\.md$/.test(f) || /MASTER_INDEX/.test(f)) continue;
      before[f] = fs.readFileSync(path.join(dir, f), 'utf8');
    }
    const c = new GrandConsolidator({ reportDir: dir, outputDir: dir });
    await c.run({ timestamp: '2026-04-11 12:00:00' });
    // Confirm each source report is byte-for-byte unchanged.
    for (const f of Object.keys(before)) {
      const after = fs.readFileSync(path.join(dir, f), 'utf8');
      assert.equal(after, before[f], `${f} unchanged`);
    }
  } finally {
    cleanup(dir);
  }
});

test('15. ERROR-flagged reports surface in the index', () => {
  const records = [
    {
      agentId: null,
      title: 'broken.md',
      testsCount: 0,
      statusClaim: 'UNKNOWN',
      sizeKb: 0,
      lastModified: null,
      fileName: 'broken.md',
      swarm: 'OTHER',
      flags: { ERROR: true, NO_ID: true },
      error: 'could not parse',
    },
  ];
  const built = buildIndex(records, { timestamp: '2026-04-11 13:00:00' });
  assert.match(built.markdown, /ERROR Flags/);
  assert.match(built.markdown, /broken\.md/);
  assert.equal(built.summary.totals.errors, 1);
  assert.equal(built.json.totals.errors, 1);
});

test('16. buildIndex handles an empty record list cleanly', () => {
  const built = buildIndex([], { timestamp: '2026-04-11 14:00:00' });
  assert.equal(built.summary.totals.reports, 0);
  assert.equal(built.summary.totals.tests, 0);
  assert.match(built.markdown, /MASTER INDEX/);
  assert.match(built.markdown, /No reports flagged/);
});

test('17. _internals.bytesToKb rounds to 2 decimals and guards negatives', () => {
  const { bytesToKb } = _internals;
  assert.equal(bytesToKb(0), 0);
  assert.equal(bytesToKb(-5), 0);
  assert.equal(bytesToKb(1024), 1);
  assert.equal(bytesToKb(2048), 2);
  assert.equal(bytesToKb(1536), 1.5);
});

test('18. _internals.parseIdFromFilename handles QA / AG / Y prefixes', () => {
  const { parseIdFromFilename } = _internals;
  assert.equal(parseIdFromFilename('QA-02-unit-tests.md').id, 'QA-02');
  assert.equal(parseIdFromFilename('AG-05-payroll.md').id, 'AG-05');
  assert.equal(parseIdFromFilename('AG-X07-price.md').id, 'AG-X07');
  assert.equal(
    parseIdFromFilename('AG-Y200-grand-consolidator.md').id,
    'AG-Y200',
  );
  assert.equal(parseIdFromFilename('totally-random-file.md'), null);
});
