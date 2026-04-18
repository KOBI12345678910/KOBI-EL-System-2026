/**
 * ═══════════════════════════════════════════════════════════════════════════
 * License Compliance Scanner — Test Suite
 * AG-X92 — Mega-ERP Techno-Kol Uzi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Target:  onyx-procurement/src/security/license-scanner.js
 * Runner:  node --test
 *
 * Synthetic packages with various licenses are built in a temp directory
 * every test so the disk is never polluted and no production files are
 * touched. Rule: לא מוחקים רק משדרגים ומגדלים — the scanner itself never
 * writes to the source tree; only reports are written, and the tests clean
 * up their own temp directory.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const scannerModule = require('../../src/security/license-scanner.js');
const {
  LicenseScanner,
  CATEGORY,
  parseSPDX,
  tokenizeSpdx,
  stripSpdxExtras,
  resolveAlias,
  levenshtein,
  stringSimilarity,
  bestSubstringSimilarity,
  normalizeText,
  findLicenseFiles,
  extractDeclaredLicense,
  pickMostPermissive,
  pickMostRestrictive,
} = scannerModule;

// ───────────────────────────────────────────────────────────────────────
//  Fixtures
// ───────────────────────────────────────────────────────────────────────

const MIT_BODY = `MIT License

Copyright (c) 2024 Acme Corp

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
`;

const APACHE_BODY = `
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
`;

const GPL3_BODY = `
                    GNU GENERAL PUBLIC LICENSE
                       Version 3, 29 June 2007

 Copyright (C) 2007 Free Software Foundation, Inc.
 Everyone is permitted to copy and distribute verbatim copies
 of this license document, but changing it is not allowed.
`;

const ISC_BODY = `
ISC License

Copyright (c) 2024, Acme

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES.
`;

/**
 * Build a throwaway project tree:
 *   tmp/
 *     root/
 *       package.json
 *       node_modules/
 *         foo/ package.json + LICENSE
 *         bar/ package.json + LICENSE
 *         @scope/baz/ package.json
 *         ...
 */
function makeFixtureTree(specs, rootPkg) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'lic-scanner-'));
  const root = path.join(base, 'root');
  fs.mkdirSync(root, { recursive: true });
  const rootManifest = rootPkg || {
    name: 'root-project',
    version: '1.0.0',
    license: 'MIT',
  };
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(rootManifest, null, 2),
    'utf8'
  );
  const nm = path.join(root, 'node_modules');
  fs.mkdirSync(nm, { recursive: true });
  for (const spec of specs) {
    const pkgDir = spec.name.startsWith('@')
      ? path.join(nm, spec.name.split('/')[0], spec.name.split('/')[1])
      : path.join(nm, spec.name);
    fs.mkdirSync(pkgDir, { recursive: true });
    const manifest = {
      name: spec.name,
      version: spec.version || '1.0.0',
    };
    if (spec.license !== undefined) manifest.license = spec.license;
    if (spec.licenses !== undefined) manifest.licenses = spec.licenses;
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );
    if (spec.licenseFileBody) {
      const fname = spec.licenseFileName || 'LICENSE';
      fs.writeFileSync(path.join(pkgDir, fname), spec.licenseFileBody, 'utf8');
    }
  }
  return { base, root };
}

function cleanup(base) {
  try {
    fs.rmSync(base, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  1. Basic API surface
// ═══════════════════════════════════════════════════════════════════════════

test('exports the LicenseScanner class and helpers', () => {
  assert.equal(typeof LicenseScanner, 'function');
  const s = new LicenseScanner();
  assert.equal(typeof s.scanPackage, 'function');
  assert.equal(typeof s.scanTree, 'function');
  assert.equal(typeof s.classify, 'function');
  assert.equal(typeof s.checkCompatibility, 'function');
  assert.equal(typeof s.exportCSV, 'function');
  assert.equal(typeof s.exportHTML, 'function');
  assert.equal(typeof s.exportSPDX, 'function');
  assert.equal(typeof s.generateNoticeFile, 'function');
  assert.equal(typeof s.detectLicenseConflict, 'function');
});

// ═══════════════════════════════════════════════════════════════════════════
//  2. classify()
// ═══════════════════════════════════════════════════════════════════════════

test('classify() — permissive set', () => {
  const s = new LicenseScanner();
  for (const id of ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'BSD-2-Clause', 'ISC', '0BSD']) {
    assert.equal(s.classify(id), CATEGORY.PERMISSIVE, `expected ${id} permissive`);
  }
});

test('classify() — weak copyleft', () => {
  const s = new LicenseScanner();
  for (const id of ['LGPL-2.1-only', 'LGPL-3.0-only', 'MPL-2.0', 'EPL-2.0', 'CDDL-1.1']) {
    assert.equal(s.classify(id), CATEGORY.WEAK_COPYLEFT, `expected ${id} weak-copyleft`);
  }
});

test('classify() — strong copyleft', () => {
  const s = new LicenseScanner();
  for (const id of ['GPL-2.0-only', 'GPL-3.0-only', 'GPL-3.0-or-later']) {
    assert.equal(s.classify(id), CATEGORY.STRONG_COPYLEFT, `expected ${id} strong-copyleft`);
  }
});

test('classify() — network copyleft', () => {
  const s = new LicenseScanner();
  for (const id of ['AGPL-3.0-only', 'SSPL-1.0']) {
    assert.equal(s.classify(id), CATEGORY.NETWORK_COPYLEFT);
  }
});

test('classify() — proprietary / unknown', () => {
  const s = new LicenseScanner();
  assert.equal(s.classify('UNLICENSED'), CATEGORY.PROPRIETARY);
  assert.equal(s.classify('Commercial'), CATEGORY.COMMERCIAL);
  assert.equal(s.classify('SomethingCustom'), CATEGORY.UNKNOWN);
  assert.equal(s.classify(''), CATEGORY.UNKNOWN);
  assert.equal(s.classify(null), CATEGORY.UNKNOWN);
});

test('classify() — OR picks most permissive', () => {
  const s = new LicenseScanner();
  assert.equal(s.classify('(MIT OR GPL-3.0-only)'), CATEGORY.PERMISSIVE);
  assert.equal(s.classify('(GPL-2.0-only OR LGPL-2.1-only)'), CATEGORY.WEAK_COPYLEFT);
});

test('classify() — AND picks most restrictive', () => {
  const s = new LicenseScanner();
  assert.equal(s.classify('(MIT AND GPL-3.0-only)'), CATEGORY.STRONG_COPYLEFT);
});

// ═══════════════════════════════════════════════════════════════════════════
//  3. SPDX expression parsing
// ═══════════════════════════════════════════════════════════════════════════

test('parseSPDX() — simple id', () => {
  const r = parseSPDX('MIT');
  assert.deepEqual(r.ids, ['MIT']);
  assert.equal(r.operator, null);
});

test('parseSPDX() — OR expression', () => {
  const r = parseSPDX('(MIT OR Apache-2.0)');
  assert.equal(r.operator, 'OR');
  assert.deepEqual(r.ids.sort(), ['Apache-2.0', 'MIT']);
});

test('parseSPDX() — AND expression', () => {
  const r = parseSPDX('(MIT AND BSD-3-Clause)');
  assert.equal(r.operator, 'AND');
  assert.deepEqual(r.ids.sort(), ['BSD-3-Clause', 'MIT']);
});

test('parseSPDX() — WITH exception', () => {
  const r = parseSPDX('GPL-2.0-only WITH Classpath-exception-2.0');
  assert.deepEqual(r.ids, ['GPL-2.0-only']);
  assert.equal(r.operator, 'WITH');
  assert.equal(r.exception, 'Classpath-exception-2.0');
});

test('parseSPDX() — nested OR with WITH', () => {
  const r = parseSPDX('(GPL-2.0-only WITH Classpath-exception-2.0 OR MIT)');
  assert.ok(r.ids.includes('MIT'));
  assert.ok(r.ids.includes('GPL-2.0-only'));
});

test('tokenizeSpdx() handles parenthesized groups', () => {
  const toks = tokenizeSpdx('(MIT OR Apache-2.0) AND BSD-3-Clause');
  assert.equal(toks.length, 3);
  assert.equal(toks[1], 'AND');
});

test('stripSpdxExtras() removes WITH tail', () => {
  assert.equal(stripSpdxExtras('GPL-2.0-only WITH Classpath-exception-2.0'), 'GPL-2.0-only');
  assert.equal(stripSpdxExtras('(MIT)'), 'MIT');
});

// ═══════════════════════════════════════════════════════════════════════════
//  4. Alias resolution
// ═══════════════════════════════════════════════════════════════════════════

test('resolveAlias() normalizes legacy spellings', () => {
  assert.equal(resolveAlias('Apache 2.0', {}), 'Apache-2.0');
  assert.equal(resolveAlias('MIT License', {}), 'MIT');
  assert.equal(resolveAlias('GPLv3', {}), 'GPL-3.0-only');
  assert.equal(resolveAlias('BSD', {}), 'BSD-3-Clause');
});

test('resolveAlias() honors user overrides', () => {
  const overrides = { 'CUSTOM-LIC': 'MIT' };
  assert.equal(resolveAlias('Custom-Lic', overrides), 'MIT');
});

// ═══════════════════════════════════════════════════════════════════════════
//  5. Levenshtein + fuzzy matcher
// ═══════════════════════════════════════════════════════════════════════════

test('levenshtein() basic cases', () => {
  assert.equal(levenshtein('', ''), 0);
  assert.equal(levenshtein('abc', 'abc'), 0);
  assert.equal(levenshtein('abc', 'abd'), 1);
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('', 'abc'), 3);
  assert.equal(levenshtein('abc', ''), 3);
});

test('stringSimilarity() 0..1', () => {
  assert.equal(stringSimilarity('abc', 'abc'), 1);
  assert.ok(stringSimilarity('hello world', 'hello world!') > 0.9);
  assert.ok(stringSimilarity('abc', 'xyz') < 0.5);
});

test('bestSubstringSimilarity() finds a phrase inside larger text', () => {
  const hay = normalizeText('prefix prefix the above copyright notice suffix suffix');
  const sim = bestSubstringSimilarity(hay, 'the above copyright notice');
  assert.ok(sim >= 0.9, `expected high similarity, got ${sim}`);
});

test('fuzzyMatch() detects MIT from full license body', () => {
  const s = new LicenseScanner();
  const r = s.fuzzyMatch(MIT_BODY);
  assert.equal(r.id, 'MIT');
  assert.ok(r.similarity > 0.6);
});

test('fuzzyMatch() detects Apache-2.0', () => {
  const s = new LicenseScanner();
  const r = s.fuzzyMatch(APACHE_BODY);
  assert.equal(r.id, 'Apache-2.0');
});

test('fuzzyMatch() detects ISC', () => {
  const s = new LicenseScanner();
  const r = s.fuzzyMatch(ISC_BODY);
  assert.equal(r.id, 'ISC');
});

test('fuzzyMatch() detects GPL-3.0 signature', () => {
  const s = new LicenseScanner();
  const r = s.fuzzyMatch(GPL3_BODY);
  assert.equal(r.id, 'GPL-3.0-only');
});

// ═══════════════════════════════════════════════════════════════════════════
//  6. findLicenseFiles()
// ═══════════════════════════════════════════════════════════════════════════

test('findLicenseFiles() finds LICENSE / COPYING variants', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lic-files-'));
  try {
    fs.writeFileSync(path.join(dir, 'LICENSE'), 'x', 'utf8');
    fs.writeFileSync(path.join(dir, 'COPYING.txt'), 'x', 'utf8');
    fs.writeFileSync(path.join(dir, 'LICENSE-MIT'), 'x', 'utf8');
    fs.writeFileSync(path.join(dir, 'readme.md'), 'x', 'utf8');
    const found = findLicenseFiles(dir);
    assert.equal(found.length, 3);
  } finally {
    cleanup(dir);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  7. extractDeclaredLicense()
// ═══════════════════════════════════════════════════════════════════════════

test('extractDeclaredLicense() — string', () => {
  assert.equal(extractDeclaredLicense({ license: 'MIT' }), 'MIT');
});

test('extractDeclaredLicense() — legacy object form', () => {
  assert.equal(extractDeclaredLicense({ license: { type: 'Apache-2.0', url: 'x' } }), 'Apache-2.0');
});

test('extractDeclaredLicense() — legacy licenses array', () => {
  const r = extractDeclaredLicense({ licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] });
  assert.equal(r, '(MIT OR Apache-2.0)');
});

test('extractDeclaredLicense() — no license fields', () => {
  assert.equal(extractDeclaredLicense({}), '');
});

// ═══════════════════════════════════════════════════════════════════════════
//  8. scanPackage() — from package.json
// ═══════════════════════════════════════════════════════════════════════════

test('scanPackage() reads license from package.json', () => {
  const { base, root } = makeFixtureTree([
    { name: 'foo', license: 'MIT' },
  ]);
  try {
    const s = new LicenseScanner();
    const e = s.scanPackage(path.join(root, 'node_modules', 'foo'));
    assert.equal(e.name, 'foo');
    assert.deepEqual(e.spdxIds, ['MIT']);
    assert.equal(e.category, CATEGORY.PERMISSIVE);
    assert.equal(e.source, 'package.json');
    assert.ok(e.confidence >= 90);
  } finally {
    cleanup(base);
  }
});

test('scanPackage() falls back to LICENSE file fuzzy match', () => {
  const { base, root } = makeFixtureTree([
    { name: 'nomanifest', license: undefined, licenseFileBody: MIT_BODY },
  ]);
  try {
    const s = new LicenseScanner();
    const e = s.scanPackage(path.join(root, 'node_modules', 'nomanifest'));
    assert.deepEqual(e.spdxIds, ['MIT']);
    assert.equal(e.category, CATEGORY.PERMISSIVE);
    assert.ok(e.source.includes('LICENSE file'));
    assert.ok(e.licenseFiles.length === 1);
    assert.ok(e.noticeText.length > 0);
  } finally {
    cleanup(base);
  }
});

test('scanPackage() marks missing license as unknown', () => {
  const { base, root } = makeFixtureTree([
    { name: 'mystery', license: undefined },
  ]);
  try {
    const s = new LicenseScanner();
    const e = s.scanPackage(path.join(root, 'node_modules', 'mystery'));
    assert.equal(e.category, CATEGORY.UNKNOWN);
  } finally {
    cleanup(base);
  }
});

test('scanPackage() handles legacy "licenses" array', () => {
  const { base, root } = makeFixtureTree([
    {
      name: 'dualie',
      license: undefined,
      licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }],
    },
  ]);
  try {
    const s = new LicenseScanner();
    const e = s.scanPackage(path.join(root, 'node_modules', 'dualie'));
    assert.ok(e.spdxIds.includes('MIT'));
    assert.ok(e.spdxIds.includes('Apache-2.0'));
    assert.equal(e.category, CATEGORY.PERMISSIVE);
  } finally {
    cleanup(base);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  9. scanTree()
// ═══════════════════════════════════════════════════════════════════════════

test('scanTree() discovers scoped + unscoped packages', () => {
  const { base, root } = makeFixtureTree([
    { name: 'alpha', license: 'MIT' },
    { name: 'beta', license: 'Apache-2.0' },
    { name: 'gamma', license: 'GPL-3.0-only' },
    { name: '@scope/delta', license: 'ISC' },
  ]);
  try {
    const s = new LicenseScanner();
    const map = s.scanTree(root);
    // 4 deps + 1 root package
    assert.equal(map.size, 5);
    const names = Array.from(map.values()).map((e) => e.name).sort();
    assert.deepEqual(
      names,
      ['@scope/delta', 'alpha', 'beta', 'gamma', 'root-project']
    );
  } finally {
    cleanup(base);
  }
});

test('scanTree() returns map ready for policy check', () => {
  const { base, root } = makeFixtureTree([
    { name: 'a', license: 'MIT' },
    { name: 'b', license: 'GPL-3.0-only' },
  ]);
  try {
    const s = new LicenseScanner();
    s.scanTree(root);
    const check = s.checkCompatibility({
      projectLicense: 'MIT',
      policy: {
        allowCategories: [CATEGORY.PERMISSIVE, CATEGORY.PUBLIC_DOMAIN],
        denyCategories: [CATEGORY.STRONG_COPYLEFT, CATEGORY.NETWORK_COPYLEFT],
      },
    });
    assert.equal(check.passed, false);
    const blocked = check.violations.filter((v) => v.severity === 'block');
    assert.ok(blocked.some((v) => v.package === 'b'));
  } finally {
    cleanup(base);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  10. Policy check
// ═══════════════════════════════════════════════════════════════════════════

test('checkCompatibility() — all-permissive passes', () => {
  const { base, root } = makeFixtureTree([
    { name: 'a', license: 'MIT' },
    { name: 'b', license: 'Apache-2.0' },
    { name: 'c', license: 'BSD-3-Clause' },
  ]);
  try {
    const s = new LicenseScanner();
    s.scanTree(root);
    const r = s.checkCompatibility({
      projectLicense: 'MIT',
      policy: {
        allowCategories: [CATEGORY.PERMISSIVE, CATEGORY.PUBLIC_DOMAIN],
        denyCategories: [CATEGORY.STRONG_COPYLEFT, CATEGORY.NETWORK_COPYLEFT, CATEGORY.PROPRIETARY],
      },
    });
    assert.equal(r.passed, true);
    assert.equal(r.violations.filter((v) => v.severity === 'block').length, 0);
  } finally {
    cleanup(base);
  }
});

test('checkCompatibility() — per-license allow-list overrides category denial', () => {
  const { base, root } = makeFixtureTree([
    { name: 'legal-gpl-dep', license: 'GPL-3.0-only' },
  ]);
  try {
    const s = new LicenseScanner();
    s.scanTree(root);
    const r = s.checkCompatibility({
      projectLicense: 'GPL-3.0-only',
      policy: {
        denyCategories: [CATEGORY.STRONG_COPYLEFT],
        allowLicenses: ['GPL-3.0-only'],
      },
    });
    assert.equal(r.passed, true);
  } finally {
    cleanup(base);
  }
});

test('checkCompatibility() — deny-list blocks specific id', () => {
  const { base, root } = makeFixtureTree([
    { name: 'risky', license: 'AGPL-3.0-only' },
  ]);
  try {
    const s = new LicenseScanner();
    s.scanTree(root);
    const r = s.checkCompatibility({
      projectLicense: 'MIT',
      policy: {
        denyLicenses: ['AGPL-3.0-only'],
      },
    });
    assert.equal(r.passed, false);
    assert.ok(r.violations.some((v) => v.package === 'risky' && v.severity === 'block'));
  } finally {
    cleanup(base);
  }
});

test('checkCompatibility() — unknown categories are flagged as review', () => {
  const { base, root } = makeFixtureTree([
    { name: 'weird', license: 'Completely-Made-Up-License' },
  ]);
  try {
    const s = new LicenseScanner();
    s.scanTree(root);
    const r = s.checkCompatibility({
      projectLicense: 'MIT',
      policy: { allowCategories: [CATEGORY.PERMISSIVE] },
    });
    assert.ok(r.violations.some((v) => v.package === 'weird'));
  } finally {
    cleanup(base);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  11. Conflict detection
// ═══════════════════════════════════════════════════════════════════════════

test('detectLicenseConflict() — GPL-2.0 vs Apache-2.0', () => {
  const s = new LicenseScanner();
  const r = s.detectLicenseConflict('GPL-2.0-only', 'Apache-2.0');
  assert.equal(r.conflict, true);
  assert.equal(r.severity, 'block');
});

test('detectLicenseConflict() — MIT + Apache-2.0 is fine', () => {
  const s = new LicenseScanner();
  const r = s.detectLicenseConflict('MIT', 'Apache-2.0');
  assert.equal(r.conflict, false);
});

test('detectLicenseConflict() — SSPL poisons permissive', () => {
  const s = new LicenseScanner();
  const r = s.detectLicenseConflict('MIT', 'SSPL-1.0');
  assert.equal(r.conflict, true);
});

test('detectLicenseConflict() — identical licenses never conflict', () => {
  const s = new LicenseScanner();
  assert.equal(s.detectLicenseConflict('GPL-3.0-only', 'GPL-3.0-only').conflict, false);
});

test('detectLicenseConflict() — AGPL in permissive project', () => {
  const s = new LicenseScanner();
  const r = s.detectLicenseConflict('MIT', 'AGPL-3.0-only');
  assert.equal(r.conflict, true);
});

// ═══════════════════════════════════════════════════════════════════════════
//  12. Reporters
// ═══════════════════════════════════════════════════════════════════════════

test('exportCSV() produces a parseable csv', () => {
  const { base, root } = makeFixtureTree([
    { name: 'a', license: 'MIT' },
    { name: 'b', license: 'Apache-2.0' },
  ]);
  try {
    const s = new LicenseScanner();
    s.scanTree(root);
    const csv = s.exportCSV();
    const lines = csv.trim().split('\n');
    // header + root + a + b
    assert.equal(lines.length, 4);
    assert.ok(lines[0].startsWith('name,version,license'));
  } finally {
    cleanup(base);
  }
});

test('exportCSV() writes to disk when path given', () => {
  const { base, root } = makeFixtureTree([{ name: 'a', license: 'MIT' }]);
  try {
    const s = new LicenseScanner();
    s.scanTree(root);
    const out = path.join(base, 'report.csv');
    s.exportCSV(out);
    assert.ok(fs.existsSync(out));
    const content = fs.readFileSync(out, 'utf8');
    assert.ok(content.includes('MIT'));
  } finally {
    cleanup(base);
  }
});

test('exportHTML() includes category CSS classes', () => {
  const { base, root } = makeFixtureTree([
    { name: 'bad', license: 'GPL-3.0-only' },
  ]);
  try {
    const s = new LicenseScanner();
    s.scanTree(root);
    const html = s.exportHTML();
    assert.ok(html.includes('<table'));
    assert.ok(html.includes('cat-strong-copyleft'));
    assert.ok(html.includes('bad'));
  } finally {
    cleanup(base);
  }
});

test('exportSPDX() emits valid tag:value header', () => {
  const { base, root } = makeFixtureTree([
    { name: 'a', license: 'MIT' },
  ]);
  try {
    const s = new LicenseScanner();
    s.scanTree(root);
    const spdx = s.exportSPDX();
    assert.ok(spdx.startsWith('SPDXVersion: SPDX-2.3'));
    assert.ok(spdx.includes('PackageName: a'));
    assert.ok(spdx.includes('PackageLicenseConcluded: MIT'));
  } finally {
    cleanup(base);
  }
});

test('generateNoticeFile() aggregates all license bodies', () => {
  const { base, root } = makeFixtureTree([
    { name: 'alpha', license: 'MIT', licenseFileBody: MIT_BODY },
    { name: 'beta', license: 'Apache-2.0', licenseFileBody: APACHE_BODY },
  ]);
  try {
    const s = new LicenseScanner();
    s.scanTree(root);
    const notice = s.generateNoticeFile();
    assert.ok(notice.includes('THIRD-PARTY NOTICES'));
    assert.ok(notice.includes('Package: alpha'));
    assert.ok(notice.includes('Package: beta'));
    assert.ok(notice.includes('Permission is hereby granted'));
    assert.ok(notice.includes('Apache License'));
  } finally {
    cleanup(base);
  }
});

test('generateNoticeFile() writes to disk and is deterministic (alphabetical)', () => {
  const { base, root } = makeFixtureTree([
    { name: 'zeta', license: 'MIT' },
    { name: 'alpha', license: 'MIT' },
    { name: 'mango', license: 'MIT' },
  ]);
  try {
    const s = new LicenseScanner();
    s.scanTree(root);
    const out = path.join(base, 'NOTICES.txt');
    s.generateNoticeFile(out);
    const text = fs.readFileSync(out, 'utf8');
    const iAlpha = text.indexOf('Package: alpha');
    const iMango = text.indexOf('Package: mango');
    const iZeta = text.indexOf('Package: zeta');
    assert.ok(iAlpha < iMango);
    assert.ok(iMango < iZeta);
  } finally {
    cleanup(base);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  13. Non-destructive guarantees
// ═══════════════════════════════════════════════════════════════════════════

test('scanTree() NEVER mutates package.json files', () => {
  const { base, root } = makeFixtureTree([
    { name: 'a', license: 'MIT' },
  ]);
  try {
    const target = path.join(root, 'node_modules', 'a', 'package.json');
    const before = fs.readFileSync(target, 'utf8');
    const s = new LicenseScanner();
    s.scanTree(root);
    const after = fs.readFileSync(target, 'utf8');
    assert.equal(after, before, 'package.json was mutated!');
  } finally {
    cleanup(base);
  }
});

test('reset() clears state but re-scan repopulates', () => {
  const { base, root } = makeFixtureTree([
    { name: 'a', license: 'MIT' },
  ]);
  try {
    const s = new LicenseScanner();
    s.scanTree(root);
    assert.ok(s.results.size > 0);
    s.reset();
    assert.equal(s.results.size, 0);
    s.scanTree(root);
    assert.ok(s.results.size > 0);
  } finally {
    cleanup(base);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  14. pickMostPermissive / pickMostRestrictive
// ═══════════════════════════════════════════════════════════════════════════

test('pickMostPermissive()', () => {
  assert.equal(
    pickMostPermissive([CATEGORY.STRONG_COPYLEFT, CATEGORY.PERMISSIVE, CATEGORY.WEAK_COPYLEFT]),
    CATEGORY.PERMISSIVE
  );
});

test('pickMostRestrictive()', () => {
  assert.equal(
    pickMostRestrictive([CATEGORY.PERMISSIVE, CATEGORY.WEAK_COPYLEFT, CATEGORY.STRONG_COPYLEFT]),
    CATEGORY.STRONG_COPYLEFT
  );
});
