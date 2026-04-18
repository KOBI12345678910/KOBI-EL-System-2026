/**
 * Unit tests for onyx-procurement/src/ops/dep-health.js
 * Agent X-63 — Swarm 3D — Techno-Kol Uzi mega-ERP — 2026-04-11
 *
 * Run:
 *   node --test test/payroll/dep-health.test.js
 *
 * Scope:
 *   - Semver parsing / comparison / range evaluation
 *   - package.json + package-lock.json parsing (v1 and v2/v3)
 *   - Direct vs transitive classification
 *   - Advisory fetcher (stub DB) — hits for lodash/axios/express/ws
 *   - Outdated classification (major/minor/patch)
 *   - License classification (MIT / LGPL / GPL / AGPL / unknown)
 *   - Typosquat detection (levenshtein distance)
 *   - Abandoned detection (ISO date)
 *   - Risk score math (components & clamping)
 *   - Fix recommendations (commands + reasons)
 *   - End-to-end scanProject() on a synthetic fixture
 *   - Markdown report generation (Hebrew bilingual)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dh = require('../../onyx-procurement/src/ops/dep-health');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tempFixtureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-fixture-'));
  return dir;
}

function writeFixture(dir, pkg, lock) {
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  if (lock) {
    fs.writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify(lock, null, 2));
  }
  return path.join(dir, 'package.json');
}

// ---------------------------------------------------------------------------
// 1. parseVersion / compareVersions
// ---------------------------------------------------------------------------
test('parseVersion handles plain, prefixed v, and prerelease', () => {
  assert.deepEqual(dh.parseVersion('1.2.3'), { major: 1, minor: 2, patch: 3, prerelease: '' });
  assert.deepEqual(dh.parseVersion('v4.17.21'), { major: 4, minor: 17, patch: 21, prerelease: '' });
  assert.deepEqual(dh.parseVersion('1.0.0-beta.1'), { major: 1, minor: 0, patch: 0, prerelease: 'beta.1' });
  assert.equal(dh.parseVersion('not-a-version'), null);
});

test('compareVersions orders semver correctly', () => {
  assert.equal(dh.compareVersions('1.2.3', '1.2.3'), 0);
  assert.equal(dh.compareVersions('1.2.3', '1.2.4'), -1);
  assert.equal(dh.compareVersions('2.0.0', '1.9.9'), 1);
  assert.equal(dh.compareVersions('1.0.0-beta', '1.0.0'), -1);
  assert.equal(dh.compareVersions('4.17.20', '4.17.21'), -1);
});

// ---------------------------------------------------------------------------
// 2. satisfiesRange
// ---------------------------------------------------------------------------
test('satisfiesRange handles basic predicates', () => {
  assert.equal(dh.satisfiesRange('4.17.20', '<4.17.21'), true);
  assert.equal(dh.satisfiesRange('4.17.21', '<4.17.21'), false);
  assert.equal(dh.satisfiesRange('1.2.3', '>=1.0.0 <2.0.0'), true);
  assert.equal(dh.satisfiesRange('2.0.0', '>=1.0.0 <2.0.0'), false);
  assert.equal(dh.satisfiesRange('1.2.3', '*'), true);
});

test('satisfiesRange handles caret and tilde', () => {
  assert.equal(dh.satisfiesRange('1.2.5', '^1.2.3'), true);
  assert.equal(dh.satisfiesRange('2.0.0', '^1.2.3'), false);
  assert.equal(dh.satisfiesRange('1.2.9', '~1.2.3'), true);
  assert.equal(dh.satisfiesRange('1.3.0', '~1.2.3'), false);
});

// ---------------------------------------------------------------------------
// 3. parsePackageJson
// ---------------------------------------------------------------------------
test('parsePackageJson reads name/version/deps', () => {
  const dir = tempFixtureDir();
  const pkgPath = writeFixture(dir, {
    name: 'onyx-test',
    version: '1.0.0',
    license: 'MIT',
    dependencies: { express: '^4.17.0', lodash: '^4.17.20' },
    devDependencies: { eslint: '^9.0.0' },
  });
  const pkg = dh.parsePackageJson(pkgPath);
  assert.equal(pkg.name, 'onyx-test');
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.dependencies.express, '^4.17.0');
  assert.equal(pkg.devDependencies.eslint, '^9.0.0');
});

// ---------------------------------------------------------------------------
// 4. parsePackageLock (v2/v3 "packages" layout)
// ---------------------------------------------------------------------------
test('parsePackageLock v2 classifies direct vs transitive', () => {
  const dir = tempFixtureDir();
  const pkgPath = writeFixture(
    dir,
    {
      name: 'onyx-test',
      version: '1.0.0',
      dependencies: { express: '^4.17.0' },
    },
    {
      name: 'onyx-test',
      lockfileVersion: 3,
      packages: {
        '': { name: 'onyx-test', version: '1.0.0' },
        'node_modules/express': { version: '4.17.1', license: 'MIT' },
        'node_modules/express/node_modules/qs': { version: '6.7.0', license: 'BSD-3-Clause' },
      },
    }
  );
  const lock = dh.parsePackageLock(
    path.join(path.dirname(pkgPath), 'package-lock.json'),
    new Set(['express'])
  );
  assert.ok(lock.direct.has('express'));
  assert.ok(lock.transitive.has('qs'));
  assert.ok(lock.depth >= 2);
});

// ---------------------------------------------------------------------------
// 5. fetchAdvisories — seed DB
// ---------------------------------------------------------------------------
test('fetchAdvisories finds lodash<4.17.21 prototype pollution', () => {
  const advs = dh.fetchAdvisories([{ name: 'lodash', version: '4.17.20' }]);
  assert.equal(advs.length, 1);
  assert.equal(advs[0].severity, 'high');
  assert.match(advs[0].title_he, /זיהום/);
});

test('fetchAdvisories clears when version is patched', () => {
  const advs = dh.fetchAdvisories([
    { name: 'lodash', version: '4.17.21' },
    { name: 'axios', version: '0.21.1' },
    { name: 'express', version: '4.17.3' },
    { name: 'ws', version: '7.4.6' },
    { name: 'pdfkit', version: '0.13.0' },
  ]);
  assert.equal(advs.length, 0);
});

test('fetchAdvisories hits all demo seeds', () => {
  const advs = dh.fetchAdvisories([
    { name: 'lodash', version: '4.17.20' },   // high
    { name: 'axios', version: '0.20.0' },     // medium
    { name: 'express', version: '4.17.0' },   // high
    { name: 'ws', version: '7.4.5' },         // high
    { name: 'minimist', version: '1.2.5' },   // critical
  ]);
  assert.equal(advs.length, 5);
  const ids = new Set(advs.map((a) => a.package));
  assert.ok(ids.has('lodash'));
  assert.ok(ids.has('axios'));
  assert.ok(ids.has('express'));
  assert.ok(ids.has('ws'));
  assert.ok(ids.has('minimist'));
});

// ---------------------------------------------------------------------------
// 6. classifyOutdated
// ---------------------------------------------------------------------------
test('classifyOutdated distinguishes major/minor/patch', () => {
  assert.deepEqual(dh.classifyOutdated('1.0.0', '2.0.0'), { outdated: true, severity: 'major' });
  assert.deepEqual(dh.classifyOutdated('1.0.0', '1.1.0'), { outdated: true, severity: 'minor' });
  assert.deepEqual(dh.classifyOutdated('1.0.0', '1.0.1'), { outdated: true, severity: 'patch' });
  assert.deepEqual(dh.classifyOutdated('1.0.0', '1.0.0'), { outdated: false, severity: 'none' });
});

// ---------------------------------------------------------------------------
// 7. classifyLicense
// ---------------------------------------------------------------------------
test('classifyLicense recognises MIT/GPL/AGPL/unknown', () => {
  assert.equal(dh.classifyLicense('MIT').status, 'ok');
  assert.equal(dh.classifyLicense('Apache-2.0').status, 'ok');
  assert.equal(dh.classifyLicense('LGPL-3.0').status, 'ok');
  assert.equal(dh.classifyLicense('GPL-3.0').status, 'review');
  assert.equal(dh.classifyLicense('AGPL-3.0').status, 'review');
  assert.equal(dh.classifyLicense('').status, 'unknown');
  assert.equal(dh.classifyLicense('UNLICENSED').status, 'warning');
  assert.match(dh.classifyLicense('MIT').label_he, /מסחרי/);
});

// ---------------------------------------------------------------------------
// 8. detectTyposquat
// ---------------------------------------------------------------------------
test('detectTyposquat flags near-matches but not exact', () => {
  const a = dh.detectTyposquat('expres'); // 1 edit from express
  assert.equal(a.suspicious, true);
  assert.equal(a.against, 'express');
  assert.match(a.label_he, /מרחק/);

  const b = dh.detectTyposquat('express');
  assert.equal(b.suspicious, false);

  const c = dh.detectTyposquat('totally-unique-pkg-xyz');
  assert.equal(c.suspicious, false);
});

// ---------------------------------------------------------------------------
// 9. isAbandoned
// ---------------------------------------------------------------------------
test('isAbandoned uses 2-year threshold', () => {
  const now = new Date('2026-04-11');
  assert.equal(dh.isAbandoned('2024-04-15', now), false); // ~2y minus
  assert.equal(dh.isAbandoned('2024-04-10', now), true);  // just over 2y
  assert.equal(dh.isAbandoned('2023-01-01', now), true);
  assert.equal(dh.isAbandoned('', now), false);
});

// ---------------------------------------------------------------------------
// 10. computeRiskScore — components
// ---------------------------------------------------------------------------
test('computeRiskScore combines vulnerability severities', () => {
  const score = dh.computeRiskScore({
    advisories: [{ severity: 'critical' }, { severity: 'high' }],
  });
  // 40 + 25 = 65, capped at 60 for vuln component
  assert.equal(score, 60);
});

test('computeRiskScore clamps to 100', () => {
  const score = dh.computeRiskScore({
    advisories: [{ severity: 'critical' }, { severity: 'critical' }],
    outdated: { outdated: true, severity: 'major' },
    abandoned: true,
    typosquat: { suspicious: true },
    license: { status: 'review' },
    depth: 7,
  });
  assert.equal(score, 100);
});

test('computeRiskScore returns 0 for a clean dep', () => {
  const score = dh.computeRiskScore({
    advisories: [],
    outdated: { outdated: false },
    abandoned: false,
    license: { status: 'ok' },
  });
  assert.equal(score, 0);
});

// ---------------------------------------------------------------------------
// 11. recommendFixes
// ---------------------------------------------------------------------------
test('recommendFixes emits upgrade commands for vulns', () => {
  const fixes = dh.recommendFixes({
    vulnerabilities: [
      { package: 'lodash', severity: 'high', id: 'GHSA-1', cve: 'CVE-1', patched: '4.17.21' },
    ],
    outdated: [
      { package: 'express', installed: '3.0.0', latest: '4.21.0', severity: 'major' },
    ],
    licenses: [
      { package: 'some-gpl', license: 'GPL-3.0', status: 'review' },
    ],
  });
  const cmds = fixes.map((f) => f.command);
  assert.ok(cmds.includes('npm install lodash@4.17.21'));
  assert.ok(cmds.includes('npm install express@4.21.0'));
  assert.ok(cmds.some((c) => c.startsWith('# review license')));
});

// ---------------------------------------------------------------------------
// 12. scanProject — end-to-end
// ---------------------------------------------------------------------------
test('scanProject produces a full report with vulns/outdated/licenses', () => {
  const dir = tempFixtureDir();
  const pkgPath = writeFixture(
    dir,
    {
      name: 'onyx-synth',
      version: '1.0.0',
      license: 'MIT',
      dependencies: { lodash: '^4.17.20', express: '^4.17.0' },
      devDependencies: {},
    },
    {
      name: 'onyx-synth',
      lockfileVersion: 3,
      packages: {
        '': { name: 'onyx-synth', version: '1.0.0' },
        'node_modules/lodash': { version: '4.17.20', license: 'MIT' },
        'node_modules/express': { version: '4.17.0', license: 'MIT' },
        'node_modules/express/node_modules/qs': { version: '6.7.0', license: 'BSD-3-Clause' },
      },
    }
  );
  const result = dh.scanProject(pkgPath, {
    now: new Date('2026-04-11'),
    registry: {
      lodash: { latest: '4.17.21', license: 'MIT', lastPublish: '2023-05-01' },
      express: { latest: '4.21.0', license: 'MIT', lastPublish: '2025-01-10' },
    },
  });
  assert.equal(result.project.name, 'onyx-synth');
  assert.ok(result.counts.vulnerable >= 2, 'should find lodash + express vulns');
  assert.ok(result.counts.outdated >= 2);
  assert.ok(result.projectRisk > 0 && result.projectRisk <= 100);
  // Transitive qs was brought in via express; direct should include express/lodash
  const directNames = result.deps.filter((d) => d.kind === 'direct').map((d) => d.name);
  assert.ok(directNames.includes('lodash'));
  assert.ok(directNames.includes('express'));
});

// ---------------------------------------------------------------------------
// 13. scanProject without lockfile (fallback)
// ---------------------------------------------------------------------------
test('scanProject falls back to package.json ranges when no lock', () => {
  const dir = tempFixtureDir();
  const pkgPath = writeFixture(
    dir,
    {
      name: 'onyx-nolock',
      version: '0.1.0',
      dependencies: { lodash: '4.17.20' },
    },
    null
  );
  const result = dh.scanProject(pkgPath, { now: new Date('2026-04-11') });
  assert.equal(result.counts.total, 1);
  assert.equal(result.vulnerabilities.length, 1);
  assert.equal(result.vulnerabilities[0].package, 'lodash');
});

// ---------------------------------------------------------------------------
// 14. generateReport — markdown structure
// ---------------------------------------------------------------------------
test('generateReport emits bilingual markdown', () => {
  const dir = tempFixtureDir();
  const pkgPath = writeFixture(
    dir,
    {
      name: 'onyx-md',
      version: '1.0.0',
      dependencies: { lodash: '4.17.20' },
    },
    null
  );
  const result = dh.scanProject(pkgPath, { now: new Date('2026-04-11') });
  const md = dh.generateReport(result);
  assert.match(md, /Dependency Health Report/);
  assert.match(md, /דו"ח בריאות תלויות/);
  assert.match(md, /lodash/);
  assert.match(md, /HIGH \/ גבוה/);
  assert.match(md, /npm install lodash@4\.17\.21/);
});

// ---------------------------------------------------------------------------
// 15. levenshtein
// ---------------------------------------------------------------------------
test('levenshtein returns expected edit distances', () => {
  assert.equal(dh.levenshtein('kitten', 'sitting'), 3);
  assert.equal(dh.levenshtein('same', 'same'), 0);
  assert.equal(dh.levenshtein('abc', 'abcd'), 1);
  assert.equal(dh.levenshtein('abcd', 'abef'), 2);
});

// ---------------------------------------------------------------------------
// 16. License scan — non-mutating
// ---------------------------------------------------------------------------
test('scanProject never mutates the package.json file', () => {
  const dir = tempFixtureDir();
  const pkgPath = writeFixture(
    dir,
    {
      name: 'onyx-immut',
      version: '1.0.0',
      dependencies: { lodash: '4.17.20' },
    },
    null
  );
  const before = fs.readFileSync(pkgPath, 'utf8');
  dh.scanProject(pkgPath, { now: new Date('2026-04-11') });
  const after = fs.readFileSync(pkgPath, 'utf8');
  assert.equal(after, before);
});

// ---------------------------------------------------------------------------
// 17. Empty project — no deps
// ---------------------------------------------------------------------------
test('scanProject on empty deps returns zeros', () => {
  const dir = tempFixtureDir();
  const pkgPath = writeFixture(
    dir,
    { name: 'empty', version: '0.1.0', dependencies: {}, devDependencies: {} },
    null
  );
  const result = dh.scanProject(pkgPath);
  assert.equal(result.counts.total, 0);
  assert.equal(result.counts.vulnerable, 0);
  assert.equal(result.projectRisk, 0);
});

// ---------------------------------------------------------------------------
// 18. Advisory DB swap — custom DB for test
// ---------------------------------------------------------------------------
test('fetchAdvisories supports custom DB', () => {
  const customDb = {
    'my-pkg': [{
      id: 'TEST-1',
      cve: 'CVE-TEST',
      severity: 'critical',
      vulnerable: '<2.0.0',
      patched: '2.0.0',
      title_en: 'Test vuln',
      title_he: 'פגיעות בדיקה',
      description_en: 'test',
      description_he: 'בדיקה',
      references: [],
    }],
  };
  const advs = dh.fetchAdvisories([{ name: 'my-pkg', version: '1.9.9' }], customDb);
  assert.equal(advs.length, 1);
  assert.equal(advs[0].severity, 'critical');
});
