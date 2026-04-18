/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AG-X91 — dep-audit.js test suite
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Zero-dependency tests: pure Node `assert`.  No `mocha`, no `jest`, no
 * `tap`. Run with:  `node test/security/dep-audit.test.js`
 *
 * Coverage:
 *   1.  parseVersion / compareVersions primitives
 *   2.  Caret / tilde / hyphen / X-range / wildcard / OR ranges
 *   3.  Prerelease edge cases (0.x, ^0.1.0, 1.0.0-alpha vs 1.0.0)
 *   4.  OSV range evaluator with introduced/fixed events
 *   5.  Lockfile parsing (v1 nested, v2 flat, v3 deduped)
 *   6.  Advisory matching against a synthetic DB with a known-vulnerable
 *       version
 *   7.  Fix suggestions and patch/minor/major delta classification
 *   8.  License detection (MIT pass, GPL fail, AGPL fail, unknown medium)
 *   9.  SBOM schema validation — CycloneDX-1.5 shape & SPDX-2.3 shape
 *  10.  SARIF export shape
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  DepAudit,
  parseVersion,
  compareVersions,
  satisfies,
  parseRange,
  osvRangeAffects,
  normalizeLicense,
  isDenied,
  integrityToHashes,
  severityFromCVSS,
} = require('../../src/security/dep-audit');

/* ───────────────────────── Tiny test harness ────────────────────────── */

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    // only log every 10th pass to keep stdout readable
    if (passed % 10 === 0) process.stdout.write('.');
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    process.stdout.write('F');
  }
}

/* ───────────────────── 1. parseVersion / compare ────────────────────── */

test('parseVersion — plain semver', () => {
  const v = parseVersion('1.2.3');
  assert.strictEqual(v.major, 1);
  assert.strictEqual(v.minor, 2);
  assert.strictEqual(v.patch, 3);
  assert.deepStrictEqual(v.prerelease, []);
});

test('parseVersion — strips leading v', () => {
  assert.strictEqual(parseVersion('v2.0.0').major, 2);
});

test('parseVersion — prerelease', () => {
  const v = parseVersion('1.0.0-alpha.1');
  assert.deepStrictEqual(v.prerelease, ['alpha', '1']);
});

test('parseVersion — build metadata ignored in precedence', () => {
  const v = parseVersion('1.0.0+build.7');
  assert.deepStrictEqual(v.build, ['build', '7']);
});

test('parseVersion — invalid string → null', () => {
  assert.strictEqual(parseVersion('not-a-version'), null);
  assert.strictEqual(parseVersion(''), null);
});

test('compareVersions — numeric ordering', () => {
  assert.strictEqual(
    compareVersions(parseVersion('1.2.3'), parseVersion('1.2.4')),
    -1
  );
  assert.strictEqual(
    compareVersions(parseVersion('2.0.0'), parseVersion('1.99.99')),
    1
  );
  assert.strictEqual(
    compareVersions(parseVersion('1.2.3'), parseVersion('1.2.3')),
    0
  );
});

test('compareVersions — prerelease < release', () => {
  assert.strictEqual(
    compareVersions(parseVersion('1.0.0-alpha'), parseVersion('1.0.0')),
    -1
  );
  assert.strictEqual(
    compareVersions(parseVersion('1.0.0-alpha'), parseVersion('1.0.0-beta')),
    -1
  );
  assert.strictEqual(
    compareVersions(parseVersion('1.0.0-alpha.1'), parseVersion('1.0.0-alpha.2')),
    -1
  );
});

test('compareVersions — numeric identifiers are numeric, not lex', () => {
  assert.strictEqual(
    compareVersions(parseVersion('1.0.0-alpha.2'), parseVersion('1.0.0-alpha.10')),
    -1
  );
});

/* ─────────────────── 2. Caret / tilde / wildcards ───────────────────── */

test('satisfies — caret on 1.x (normal)', () => {
  assert.strictEqual(satisfies('1.2.3', '^1.2.0'), true);
  assert.strictEqual(satisfies('1.9.9', '^1.2.0'), true);
  assert.strictEqual(satisfies('2.0.0', '^1.2.0'), false);
  assert.strictEqual(satisfies('1.1.9', '^1.2.0'), false);
});

test('satisfies — caret on 0.x (minor bump = breaking)', () => {
  // ^0.1.0 → >=0.1.0 <0.2.0 (0.2 is a breaking change)
  assert.strictEqual(satisfies('0.1.0', '^0.1.0'), true);
  assert.strictEqual(satisfies('0.1.9', '^0.1.0'), true);
  assert.strictEqual(satisfies('0.2.0', '^0.1.0'), false);
});

test('satisfies — caret on 0.0.x (patch bump = breaking)', () => {
  // ^0.0.3 → >=0.0.3 <0.0.4
  assert.strictEqual(satisfies('0.0.3', '^0.0.3'), true);
  assert.strictEqual(satisfies('0.0.4', '^0.0.3'), false);
  assert.strictEqual(satisfies('0.1.0', '^0.0.3'), false);
});

test('satisfies — tilde patch-range', () => {
  // ~1.2.3 → >=1.2.3 <1.3.0
  assert.strictEqual(satisfies('1.2.3', '~1.2.3'), true);
  assert.strictEqual(satisfies('1.2.9', '~1.2.3'), true);
  assert.strictEqual(satisfies('1.3.0', '~1.2.3'), false);
});

test('satisfies — X-range major-only', () => {
  // "1.x" → >=1.0.0 <2.0.0
  assert.strictEqual(satisfies('1.5.5', '1.x'), true);
  assert.strictEqual(satisfies('2.0.0', '1.x'), false);
});

test('satisfies — wildcard matches everything', () => {
  assert.strictEqual(satisfies('99.99.99', '*'), true);
  assert.strictEqual(satisfies('0.0.1', '*'), true);
});

test('satisfies — OR (||) ranges', () => {
  assert.strictEqual(satisfies('1.2.3', '^1.0.0 || ^2.0.0'), true);
  assert.strictEqual(satisfies('2.5.0', '^1.0.0 || ^2.0.0'), true);
  assert.strictEqual(satisfies('3.0.0', '^1.0.0 || ^2.0.0'), false);
});

test('satisfies — hyphen range', () => {
  assert.strictEqual(satisfies('1.5.0', '1.2.3 - 2.0.0'), true);
  assert.strictEqual(satisfies('1.2.3', '1.2.3 - 2.0.0'), true);
  assert.strictEqual(satisfies('2.0.0', '1.2.3 - 2.0.0'), true);
  assert.strictEqual(satisfies('2.0.1', '1.2.3 - 2.0.0'), false);
});

test('satisfies — >= and < combined', () => {
  assert.strictEqual(satisfies('1.5.0', '>=1.0.0 <2.0.0'), true);
  assert.strictEqual(satisfies('2.0.0', '>=1.0.0 <2.0.0'), false);
});

test('satisfies — prerelease rejected outside its own base', () => {
  // classic npm semver rule: 2.0.0-alpha does NOT satisfy ^1.0.0
  assert.strictEqual(satisfies('2.0.0-alpha', '^1.0.0'), false);
});

test('satisfies — prerelease accepted when base mentioned', () => {
  assert.strictEqual(satisfies('2.0.0-alpha', '>=2.0.0-alpha <2.0.1'), true);
});

/* ─────────────────────── 3. parseRange shape ────────────────────────── */

test('parseRange — single set', () => {
  const sets = parseRange('^1.2.3');
  assert.strictEqual(sets.length, 1);
  assert.strictEqual(sets[0].length, 2); // low + high
});

test('parseRange — multi set via ||', () => {
  const sets = parseRange('^1.0.0 || ^2.0.0');
  assert.strictEqual(sets.length, 2);
});

/* ─────────────────────── 4. OSV range events ────────────────────────── */

test('osvRangeAffects — simple introduced/fixed window', () => {
  const range = {
    type: 'SEMVER',
    events: [{ introduced: '0' }, { fixed: '1.2.3' }],
  };
  assert.strictEqual(osvRangeAffects('1.0.0', range), true);
  assert.strictEqual(osvRangeAffects('1.2.2', range), true);
  assert.strictEqual(osvRangeAffects('1.2.3', range), false);
  assert.strictEqual(osvRangeAffects('2.0.0', range), false);
});

test('osvRangeAffects — multi-window', () => {
  const range = {
    type: 'SEMVER',
    events: [
      { introduced: '0' },
      { fixed: '1.0.5' },
      { introduced: '1.1.0' },
      { fixed: '1.1.3' },
    ],
  };
  assert.strictEqual(osvRangeAffects('1.0.0', range), true);
  assert.strictEqual(osvRangeAffects('1.0.5', range), false);
  assert.strictEqual(osvRangeAffects('1.1.0', range), true);
  assert.strictEqual(osvRangeAffects('1.1.3', range), false);
  assert.strictEqual(osvRangeAffects('1.2.0', range), false);
});

test('osvRangeAffects — last_affected form', () => {
  const range = {
    type: 'SEMVER',
    events: [{ introduced: '1.0.0' }, { last_affected: '1.5.0' }],
  };
  assert.strictEqual(osvRangeAffects('1.0.0', range), true);
  assert.strictEqual(osvRangeAffects('1.5.0', range), true);
  assert.strictEqual(osvRangeAffects('1.5.1', range), false);
});

/* ─────────────────────── 5. Lockfile parsing ────────────────────────── */

test('scanLockfile — v1 nested format', () => {
  const lock = {
    name: 'onyx',
    version: '1.0.0',
    lockfileVersion: 1,
    dependencies: {
      lodash: {
        version: '4.17.20',
        resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.20.tgz',
        integrity: 'sha512-PlhdFcillOINfeV7Ni6oF1TAEayyZBoZ8bcshTHqOYJYlrqzRK5hagpagky5o4HfCzzd1TRkXPMFq6cKk9rGmA==',
      },
      axios: {
        version: '0.21.0',
        dependencies: {
          'follow-redirects': {
            version: '1.13.0',
          },
        },
      },
    },
  };
  const audit = new DepAudit({ projectName: 'onyx', projectVersion: '1.0.0' });
  const stats = audit.ingestLockfile(lock);
  assert.strictEqual(stats.count, 3);
  assert.strictEqual(stats.version, 1);
  assert.ok(audit.packages.has('lodash@4.17.20'));
  assert.ok(audit.packages.has('axios@0.21.0'));
  assert.ok(audit.packages.has('follow-redirects@1.13.0'));
  assert.ok(audit.direct.has('lodash'));
  assert.ok(audit.direct.has('axios'));
  assert.ok(!audit.direct.has('follow-redirects'));
});

test('scanLockfile — v2 flat packages format', () => {
  const lock = {
    name: 'onyx',
    version: '1.0.0',
    lockfileVersion: 2,
    packages: {
      '': {
        name: 'onyx',
        version: '1.0.0',
        dependencies: { lodash: '^4.17.20' },
      },
      'node_modules/lodash': {
        version: '4.17.20',
        integrity:
          'sha512-PlhdFcillOINfeV7Ni6oF1TAEayyZBoZ8bcshTHqOYJYlrqzRK5hagpagky5o4HfCzzd1TRkXPMFq6cKk9rGmA==',
        license: 'MIT',
      },
      'node_modules/axios': {
        version: '0.21.0',
        license: 'MIT',
      },
    },
    dependencies: {
      lodash: { version: '4.17.20' },
    },
  };
  const audit = new DepAudit();
  const stats = audit.ingestLockfile(lock);
  assert.strictEqual(stats.version, 2);
  assert.ok(audit.packages.has('lodash@4.17.20'));
  assert.ok(audit.packages.has('axios@0.21.0'));
  assert.ok(audit.direct.has('lodash'));
});

test('scanLockfile — v3 deduped', () => {
  const lock = {
    name: 'onyx',
    version: '1.0.0',
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'onyx',
        version: '1.0.0',
        dependencies: { lodash: '^4.17.20', axios: '^0.21.0' },
        devDependencies: { mocha: '^10.0.0' },
      },
      'node_modules/lodash': { version: '4.17.20', license: 'MIT' },
      'node_modules/axios': { version: '0.21.0', license: 'MIT' },
      'node_modules/mocha': { version: '10.0.0', license: 'MIT', dev: true },
    },
  };
  const audit = new DepAudit();
  audit.ingestLockfile(lock);
  assert.strictEqual(audit.packages.size, 3);
  assert.strictEqual(audit.direct.size, 3);
});

/* ────────────────────── 6. scanNodeModules walk ─────────────────────── */

test('scanNodeModules — walks a synthetic tree', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-audit-'));
  const nm = path.join(tmp, 'node_modules');
  fs.mkdirSync(nm, { recursive: true });
  // plain package
  fs.mkdirSync(path.join(nm, 'left-pad'));
  fs.writeFileSync(
    path.join(nm, 'left-pad', 'package.json'),
    JSON.stringify({ name: 'left-pad', version: '1.3.0', license: 'MIT' })
  );
  // scoped package
  fs.mkdirSync(path.join(nm, '@scope', 'pkg'), { recursive: true });
  fs.writeFileSync(
    path.join(nm, '@scope', 'pkg', 'package.json'),
    JSON.stringify({ name: '@scope/pkg', version: '2.0.0', license: 'MIT' })
  );
  // nested dependency
  fs.mkdirSync(path.join(nm, 'left-pad', 'node_modules', 'helper'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(nm, 'left-pad', 'node_modules', 'helper', 'package.json'),
    JSON.stringify({ name: 'helper', version: '0.5.0', license: 'ISC' })
  );

  const audit = new DepAudit();
  const stats = audit.scanNodeModules(nm);
  assert.ok(stats.count >= 3);
  assert.ok(audit.packages.has('left-pad@1.3.0'));
  assert.ok(audit.packages.has('@scope/pkg@2.0.0'));
  assert.ok(audit.packages.has('helper@0.5.0'));

  // never-delete rule: re-scanning should not lose anything
  audit.scanNodeModules(nm);
  assert.ok(audit.packages.has('left-pad@1.3.0'));
});

/* ─────────────── 7. Advisory matching + known vuln ─────────────────── */

const syntheticAdvisoryDB = [
  {
    id: 'GHSA-test-lodash-pp',
    summary: 'Prototype pollution in lodash',
    details: 'Versions of lodash prior to 4.17.21 are vulnerable to prototype pollution.',
    severity: [{ type: 'CVSS_V3', score: 7.4 }],
    database_specific: { severity: 'HIGH' },
    affected: [
      {
        package: { ecosystem: 'npm', name: 'lodash' },
        ranges: [
          {
            type: 'SEMVER',
            events: [{ introduced: '0' }, { fixed: '4.17.21' }],
          },
        ],
      },
    ],
    references: [{ url: 'https://example.test/GHSA-test-lodash-pp' }],
  },
  {
    id: 'GHSA-test-axios-ssrf',
    summary: 'SSRF in axios <0.21.1',
    severity: [{ type: 'CVSS_V3', score: 9.1 }],
    database_specific: { severity: 'CRITICAL' },
    affected: [
      {
        package: { ecosystem: 'npm', name: 'axios' },
        ranges: [
          {
            type: 'SEMVER',
            events: [{ introduced: '0' }, { fixed: '0.21.1' }],
          },
        ],
      },
    ],
  },
  {
    id: 'GHSA-test-noise',
    summary: 'Unrelated package advisory',
    database_specific: { severity: 'LOW' },
    affected: [
      {
        package: { ecosystem: 'npm', name: 'nonexistent-pkg' },
        ranges: [
          {
            type: 'SEMVER',
            events: [{ introduced: '0' }],
          },
        ],
      },
    ],
  },
];

function buildVulnerableAudit() {
  const lock = {
    name: 'onyx',
    version: '1.0.0',
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'onyx',
        version: '1.0.0',
        dependencies: { lodash: '^4.17.20', axios: '^0.21.0' },
      },
      'node_modules/lodash': {
        version: '4.17.20',
        license: 'MIT',
        integrity:
          'sha512-PlhdFcillOINfeV7Ni6oF1TAEayyZBoZ8bcshTHqOYJYlrqzRK5hagpagky5o4HfCzzd1TRkXPMFq6cKk9rGmA==',
      },
      'node_modules/axios': {
        version: '0.21.0',
        license: 'MIT',
      },
    },
  };
  const audit = new DepAudit();
  audit.ingestLockfile(lock);
  audit.checkAdvisories({ advisoryDB: syntheticAdvisoryDB });
  return audit;
}

test('checkAdvisories — finds known-vulnerable lodash 4.17.20', () => {
  const audit = buildVulnerableAudit();
  const high = audit.reportHigh();
  const crit = audit.reportCritical();
  assert.ok(
    high.find((f) => f.package === 'lodash' && f.severity === 'high'),
    'expected lodash advisory reported as high'
  );
  assert.ok(
    crit.find((f) => f.package === 'axios' && f.severity === 'critical'),
    'expected axios advisory reported as critical'
  );
});

test('checkAdvisories — ignores unrelated package', () => {
  const audit = buildVulnerableAudit();
  assert.ok(!audit.findings.find((f) => f.package === 'nonexistent-pkg'));
});

test('checkAdvisories — fixed version extracted', () => {
  const audit = buildVulnerableAudit();
  const lodashFinding = audit.findings.find((f) => f.package === 'lodash');
  assert.strictEqual(lodashFinding.fixed, '4.17.21');
});

test('checkAdvisories — direct vs transitive marked', () => {
  const audit = buildVulnerableAudit();
  const lodashFinding = audit.findings.find((f) => f.package === 'lodash');
  assert.strictEqual(lodashFinding.direct, true);
});

/* ─────────────────────── 8. Fix suggestions ─────────────────────────── */

test('fixSuggestions — classifies patch vs minor vs major', () => {
  const audit = buildVulnerableAudit();
  const fixes = audit.fixSuggestions();
  const lodashFix = fixes.find((f) => f.package === 'lodash');
  assert.ok(lodashFix);
  // 4.17.20 → 4.17.21 is a patch bump
  assert.strictEqual(lodashFix.deltaType, 'patch');
});

/* ──────────────────── 9. License detection ──────────────────────────── */

test('normalizeLicense — plain string', () => {
  assert.deepStrictEqual(normalizeLicense('MIT'), ['MIT']);
});

test('normalizeLicense — SPDX OR expression', () => {
  assert.deepStrictEqual(normalizeLicense('(MIT OR Apache-2.0)'), ['MIT', 'Apache-2.0']);
});

test('normalizeLicense — legacy object form', () => {
  assert.deepStrictEqual(normalizeLicense({ type: 'BSD-3-Clause' }), ['BSD-3-Clause']);
});

test('isDenied — GPL is denied', () => {
  assert.strictEqual(isDenied(['GPL-3.0']), true);
  assert.strictEqual(isDenied(['GPL-3.0-or-later']), true);
});

test('isDenied — AGPL is denied', () => {
  assert.strictEqual(isDenied(['AGPL-3.0']), true);
});

test('isDenied — SSPL is denied', () => {
  assert.strictEqual(isDenied(['SSPL-1.0']), true);
});

test('isDenied — MIT is allowed', () => {
  assert.strictEqual(isDenied(['MIT']), false);
});

test('detectLicenseIssues — commercial project flags GPL', () => {
  const audit = new DepAudit({ commercial: true });
  audit.ingestLockfile({
    name: 'onyx',
    version: '1.0.0',
    lockfileVersion: 3,
    packages: {
      '': { name: 'onyx', version: '1.0.0' },
      'node_modules/gpl-lib': { version: '1.0.0', license: 'GPL-3.0' },
      'node_modules/mit-lib': { version: '1.0.0', license: 'MIT' },
      'node_modules/unknown-lib': { version: '1.0.0' },
    },
  });
  const issues = audit.detectLicenseIssues();
  const gplIssue = issues.find((i) => i.package === 'gpl-lib');
  assert.ok(gplIssue);
  assert.strictEqual(gplIssue.severity, 'high');
  assert.ok(/copyleft/i.test(gplIssue.reason));
  const unknownIssue = issues.find((i) => i.package === 'unknown-lib');
  assert.ok(unknownIssue);
  assert.strictEqual(unknownIssue.severity, 'medium');
  const mitIssue = issues.find((i) => i.package === 'mit-lib');
  assert.strictEqual(mitIssue, undefined);
});

test('detectLicenseIssues — non-commercial project ignores GPL', () => {
  const audit = new DepAudit({ commercial: false });
  audit.ingestLockfile({
    lockfileVersion: 3,
    packages: {
      '': { name: 'onyx', version: '1.0.0' },
      'node_modules/gpl-lib': { version: '1.0.0', license: 'GPL-3.0' },
    },
  });
  const issues = audit.detectLicenseIssues();
  assert.strictEqual(issues.length, 0);
});

/* ───────────────── 10. SBOM schema validation ───────────────────────── */

test('generateSBOM — CycloneDX-1.5 shape', () => {
  const audit = buildVulnerableAudit();
  const sbom = audit.generateSBOM({ format: 'cyclonedx-json' });
  assert.strictEqual(sbom.bomFormat, 'CycloneDX');
  assert.strictEqual(sbom.specVersion, '1.5');
  assert.ok(sbom.serialNumber.startsWith('urn:uuid:'));
  assert.ok(Array.isArray(sbom.components));
  assert.ok(sbom.components.length >= 2);
  for (const c of sbom.components) {
    assert.strictEqual(c.type, 'library');
    assert.ok(c['bom-ref']);
    assert.ok(c.purl && c.purl.startsWith('pkg:npm/'));
    assert.ok(Array.isArray(c.licenses));
    assert.ok(Array.isArray(c.hashes));
  }
  // integrity field must have been decoded to sha-512 hashes for lodash
  const lodashC = sbom.components.find((c) => c.name === 'lodash');
  assert.ok(lodashC.hashes.length > 0);
  assert.strictEqual(lodashC.hashes[0].alg, 'SHA-512');
});

test('generateSBOM — SPDX-2.3 shape', () => {
  const audit = buildVulnerableAudit();
  const sbom = audit.generateSBOM({ format: 'spdx-json' });
  assert.strictEqual(sbom.spdxVersion, 'SPDX-2.3');
  assert.strictEqual(sbom.dataLicense, 'CC0-1.0');
  assert.strictEqual(sbom.SPDXID, 'SPDXRef-DOCUMENT');
  assert.ok(Array.isArray(sbom.packages));
  assert.ok(Array.isArray(sbom.relationships));
  // root package present
  const root = sbom.packages.find((p) => p.SPDXID === 'SPDXRef-Package-root');
  assert.ok(root);
  // each non-root package has a SPDXID starting with SPDXRef-Package-
  for (const p of sbom.packages) {
    assert.ok(/^SPDXRef-Package-/.test(p.SPDXID));
  }
  // DESCRIBES relationship exists
  assert.ok(sbom.relationships.find((r) => r.relationshipType === 'DESCRIBES'));
});

test('generateSBOM — unknown format throws', () => {
  const audit = buildVulnerableAudit();
  let threw = false;
  try {
    audit.generateSBOM({ format: 'bogus' });
  } catch (_e) {
    threw = true;
  }
  assert.strictEqual(threw, true);
});

/* ────────────────────── 11. SARIF export ────────────────────────────── */

test('exportSARIF — valid 2.1.0 shape', () => {
  const audit = buildVulnerableAudit();
  const sarif = audit.exportSARIF();
  assert.strictEqual(sarif.version, '2.1.0');
  assert.ok(Array.isArray(sarif.runs));
  assert.strictEqual(sarif.runs.length, 1);
  const run = sarif.runs[0];
  assert.ok(run.tool && run.tool.driver);
  assert.strictEqual(run.tool.driver.name, 'onyx-dep-audit');
  assert.ok(Array.isArray(run.tool.driver.rules));
  assert.ok(run.tool.driver.rules.length >= 2);
  assert.ok(Array.isArray(run.results));
  assert.ok(run.results.length >= 2);
  for (const r of run.results) {
    assert.ok(r.ruleId);
    assert.ok(['error', 'warning', 'note', 'none'].includes(r.level));
    assert.ok(r.message && r.message.text);
  }
});

/* ──────────────────── 12. Severity helpers ──────────────────────────── */

test('severityFromCVSS — thresholds', () => {
  assert.strictEqual(severityFromCVSS(9.5), 'critical');
  assert.strictEqual(severityFromCVSS(7.5), 'high');
  assert.strictEqual(severityFromCVSS(5.0), 'medium');
  assert.strictEqual(severityFromCVSS(2.0), 'low');
  assert.strictEqual(severityFromCVSS(0), 'none');
});

test('integrityToHashes — sha512 round-trips', () => {
  const hashes = integrityToHashes(
    'sha512-PlhdFcillOINfeV7Ni6oF1TAEayyZBoZ8bcshTHqOYJYlrqzRK5hagpagky5o4HfCzzd1TRkXPMFq6cKk9rGmA=='
  );
  assert.strictEqual(hashes.length, 1);
  assert.strictEqual(hashes[0].alg, 'SHA-512');
  // hex is 128 chars for sha-512
  assert.strictEqual(hashes[0].content.length, 128);
});

test('integrityToHashes — sha1 round-trips', () => {
  // arbitrary 20-byte payload base64 → sha1 shape
  const payload = Buffer.from('abcdefghij1234567890').toString('base64');
  const hashes = integrityToHashes(`sha1-${payload}`);
  assert.strictEqual(hashes[0].alg, 'SHA-1');
  // hex is 40 chars for sha-1
  assert.strictEqual(hashes[0].content.length, 40);
});

/* ─────────────────── 13. Summary + never-delete ─────────────────────── */

test('summary — counts match findings', () => {
  const audit = buildVulnerableAudit();
  const s = audit.summary();
  assert.strictEqual(s.total_packages, 2);
  assert.strictEqual(s.direct_packages, 2);
  assert.strictEqual(s.transitive_packages, 0);
  assert.ok(s.critical >= 1);
  assert.ok(s.high >= 1);
});

test('never-delete rule — re-ingesting same lockfile preserves entries', () => {
  const audit = buildVulnerableAudit();
  const beforeSize = audit.packages.size;
  const beforeFindings = audit.findings.length;
  audit.ingestLockfile({
    lockfileVersion: 3,
    packages: {
      '': { name: 'onyx', version: '1.0.0' },
      'node_modules/lodash': { version: '4.17.20', license: 'MIT' },
    },
  });
  assert.ok(audit.packages.size >= beforeSize);
  // findings should not have been wiped by re-ingest
  assert.strictEqual(audit.findings.length, beforeFindings);
});

/* ────────────────────────── report footer ───────────────────────────── */

process.stdout.write('\n');
if (failed > 0) {
  console.error(`\n✗ ${failed} test(s) failed, ${passed} passed`);
  for (const f of failures) {
    console.error(`  - ${f.name}`);
    console.error(`      ${f.error && f.error.message}`);
    if (f.error && f.error.stack) {
      console.error(`      ${f.error.stack.split('\n').slice(1, 3).join('\n      ')}`);
    }
  }
  process.exit(1);
} else {
  console.log(`\nAll ${passed} dep-audit tests passed.`);
}
