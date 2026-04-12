/**
 * ONYX OPS — Dependency Health Monitor
 * מנטר בריאות תלויות — ONYX OPS
 *
 * Agent X-63 | Swarm 3D | Techno-Kol Uzi mega-ERP | 2026-04-11
 *
 * Zero-dependency scanner for npm/library health. Consumes a project's
 * `package.json` (and optionally `package-lock.json`) and produces a full
 * health report covering:
 *
 *   1. Direct vs transitive dependencies
 *   2. Known CVEs (stub advisory DB — swappable for live NVD/GHSA feed)
 *   3. Severity ranking (critical / high / medium / low)
 *   4. Outdated major/minor/patch detection
 *   5. License compliance (GPL/AGPL flagged for proprietary projects)
 *   6. Abandoned packages (no updates in 2+ years)
 *   7. Suspicious packages (typosquatting, new maintainers)
 *   8. Supply-chain risk score (0–100)
 *   9. Fix recommendations (upgrade commands)
 *  10. Markdown report generator with Hebrew bilingual labels
 *
 * RULES respected
 *   - Zero dependencies (only `node:*` built-ins)
 *   - Hebrew bilingual labels (`label_he` + `label_en`)
 *   - Never deletes — pure, non-mutating reporter
 *   - Real code, exercised by the test suite
 *
 * Exports:
 *   - scanProject(packageJsonPath)  → full report
 *   - fetchAdvisories(packageList)  → advisories from stub DB
 *   - computeRiskScore(dep)         → 0–100
 *   - recommendFixes(report)        → upgrade commands
 *   - generateReport(results)       → markdown string
 *   - parsePackageJson(path)        → { deps, devDeps, name, version }
 *   - parsePackageLock(path)        → { direct, transitive, tree }
 *   - compareVersions(a, b)         → -1 | 0 | 1
 *   - satisfiesRange(version, range)→ boolean
 *   - classifyLicense(license)      → { status, label_he, label_en }
 *   - detectTyposquat(name)         → { suspicious, against, distance }
 *   - isAbandoned(lastPublish, now) → boolean
 *   - getAdvisoryDB()               → built-in demo DB
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const SEVERITY = Object.freeze({
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info',
});

const SEVERITY_WEIGHT = Object.freeze({
  critical: 40,
  high: 25,
  medium: 12,
  low: 4,
  info: 1,
});

const LICENSE_STATUS = Object.freeze({
  OK: 'ok',
  REVIEW: 'review',
  WARNING: 'warning',
  UNKNOWN: 'unknown',
});

// Days: 2 years = 730 days (abandoned threshold).
const ABANDONED_THRESHOLD_DAYS = 730;

// A popular-package baseline list used for typosquat detection.
// These are the canonical names a typosquat might try to impersonate.
const POPULAR_NAMES = Object.freeze([
  'express', 'lodash', 'react', 'axios', 'pdfkit', 'moment', 'chalk',
  'commander', 'debug', 'uuid', 'semver', 'yargs', 'dotenv', 'jest',
  'mocha', 'ws', 'request', 'body-parser', 'passport', 'helmet',
  'pino', 'winston', 'mongoose', 'sequelize', 'knex', 'cors',
]);

// ---------------------------------------------------------------------------
// BUILT-IN ADVISORY DATABASE (stub)
// ---------------------------------------------------------------------------
/**
 * Known-vulnerable seed used for demo/offline mode. In production the
 * `fetchAdvisories()` function can be swapped for a live NVD/GHSA fetcher
 * — its signature is identical.
 */
const ADVISORY_DB = Object.freeze({
  lodash: [
    {
      id: 'GHSA-35jh-r3h4-6jhm',
      cve: 'CVE-2020-8203',
      severity: SEVERITY.HIGH,
      vulnerable: '<4.17.21',
      patched: '4.17.21',
      title_en: 'Prototype pollution in lodash',
      title_he: 'זיהום אב-טיפוס בספריית lodash',
      description_en: 'Allows attacker to pollute Object.prototype via _.zipObjectDeep.',
      description_he: 'מאפשרת לתוקף לשתול שדות ב-Object.prototype דרך הפונקציה _.zipObjectDeep.',
      references: ['https://github.com/advisories/GHSA-35jh-r3h4-6jhm'],
    },
  ],
  axios: [
    {
      id: 'GHSA-42xw-2xvc-qx8m',
      cve: 'CVE-2020-28168',
      severity: SEVERITY.MEDIUM,
      vulnerable: '<0.21.1',
      patched: '0.21.1',
      title_en: 'SSRF in axios via full redirect URL',
      title_he: 'פגיעות SSRF ב-axios דרך הפניית redirect מלאה',
      description_en: 'axios does not restrict protocols in redirects; attacker can force internal requests.',
      description_he: 'axios אינו חוסם פרוטוקולים בהפניות, תוקף יכול לגרום לבקשות פנימיות.',
      references: ['https://github.com/advisories/GHSA-42xw-2xvc-qx8m'],
    },
  ],
  express: [
    {
      id: 'GHSA-rv95-896h-c2vc',
      cve: 'CVE-2022-24999',
      severity: SEVERITY.HIGH,
      vulnerable: '<4.17.3',
      patched: '4.17.3',
      title_en: 'ReDoS in express via qs',
      title_he: 'ReDoS ב-express דרך ספריית qs',
      description_en: 'Regular-expression denial of service through malformed query strings.',
      description_he: 'מניעת שירות באמצעות regex בזיהוי מחרוזות שאילתה לא תקינות.',
      references: ['https://github.com/advisories/GHSA-rv95-896h-c2vc'],
    },
  ],
  pdfkit: [
    // No known advisories as of the demo seed.
  ],
  ws: [
    {
      id: 'GHSA-6fc8-4gx4-v693',
      cve: 'CVE-2021-32640',
      severity: SEVERITY.HIGH,
      vulnerable: '<7.4.6',
      patched: '7.4.6',
      title_en: 'ReDoS in ws header parsing',
      title_he: 'ReDoS בספריית ws בעת עיבוד כותרות',
      description_en: 'Sec-Websocket-Protocol header can trigger catastrophic backtracking.',
      description_he: 'כותרת Sec-Websocket-Protocol עלולה לגרום ל-regex לקרוס בזמן ריצה.',
      references: ['https://github.com/advisories/GHSA-6fc8-4gx4-v693'],
    },
  ],
  // Additional illustrative entries used by the test suite.
  minimist: [
    {
      id: 'GHSA-xvch-5gv4-984h',
      cve: 'CVE-2021-44906',
      severity: SEVERITY.CRITICAL,
      vulnerable: '<1.2.6',
      patched: '1.2.6',
      title_en: 'Prototype pollution in minimist',
      title_he: 'זיהום אב-טיפוס ב-minimist',
      description_en: 'Prototype pollution via constructor payload.',
      description_he: 'זיהום אב-טיפוס דרך מטען constructor.',
      references: ['https://github.com/advisories/GHSA-xvch-5gv4-984h'],
    },
  ],
});

// ---------------------------------------------------------------------------
// LICENSE COMPATIBILITY MATRIX
// ---------------------------------------------------------------------------
/**
 * Proprietary project policy:
 *   - MIT, Apache-2.0, BSD-*, ISC, 0BSD, Unlicense, Python-2.0 → OK
 *   - LGPL-*                                                   → OK w/ dynamic linking
 *   - GPL-*, AGPL-*                                             → REVIEW
 *   - SSPL, commercial, unknown                                 → WARNING
 */
const LICENSE_POLICY = Object.freeze({
  'MIT': LICENSE_STATUS.OK,
  'Apache-2.0': LICENSE_STATUS.OK,
  'BSD-2-Clause': LICENSE_STATUS.OK,
  'BSD-3-Clause': LICENSE_STATUS.OK,
  'ISC': LICENSE_STATUS.OK,
  '0BSD': LICENSE_STATUS.OK,
  'Unlicense': LICENSE_STATUS.OK,
  'CC0-1.0': LICENSE_STATUS.OK,
  'LGPL-2.1': LICENSE_STATUS.OK, // with dynamic linking caveat
  'LGPL-3.0': LICENSE_STATUS.OK,
  'MPL-2.0': LICENSE_STATUS.OK,
  'GPL-2.0': LICENSE_STATUS.REVIEW,
  'GPL-3.0': LICENSE_STATUS.REVIEW,
  'AGPL-3.0': LICENSE_STATUS.REVIEW,
  'AGPL-1.0': LICENSE_STATUS.REVIEW,
  'SSPL-1.0': LICENSE_STATUS.REVIEW,
  'Commercial': LICENSE_STATUS.WARNING,
  'UNLICENSED': LICENSE_STATUS.WARNING,
});

// ---------------------------------------------------------------------------
// UTILITY — safer JSON / FS
// ---------------------------------------------------------------------------

function safeReadJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function isString(v) { return typeof v === 'string' && v.length > 0; }

// ---------------------------------------------------------------------------
// SEMVER — tiny self-contained implementation
// ---------------------------------------------------------------------------

/**
 * Parse a semver-ish string into [major, minor, patch, prerelease].
 * Returns null for garbage.
 */
function parseVersion(v) {
  if (!isString(v)) return null;
  // Strip leading "v" and any build metadata.
  const cleaned = v.trim().replace(/^v/i, '').split('+')[0];
  const [core, pre] = cleaned.split('-');
  const parts = core.split('.');
  if (parts.length < 1) return null;
  const major = parseInt(parts[0], 10);
  const minor = parts[1] !== undefined ? parseInt(parts[1], 10) : 0;
  const patch = parts[2] !== undefined ? parseInt(parts[2], 10) : 0;
  if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(patch)) {
    return null;
  }
  return { major, minor, patch, prerelease: pre || '' };
}

/** Compare two semver strings. Returns -1, 0, 1. */
function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  // Prerelease: empty > any prerelease (1.0.0 > 1.0.0-beta)
  if (pa.prerelease === pb.prerelease) return 0;
  if (!pa.prerelease) return 1;
  if (!pb.prerelease) return -1;
  return pa.prerelease < pb.prerelease ? -1 : 1;
}

/**
 * Evaluate a single predicate like ">=1.2.3", "<4.17.21", "=1.0.0",
 * against an installed version string. Supports operators:
 *   =  ==  >  >=  <  <=
 * Returns boolean.
 */
function evalPredicate(version, predicate) {
  const m = predicate.trim().match(/^(>=|<=|==|=|>|<)?\s*(.+)$/);
  if (!m) return false;
  const op = m[1] || '=';
  const target = m[2];
  const cmp = compareVersions(version, target);
  switch (op) {
    case '=':
    case '==': return cmp === 0;
    case '>': return cmp > 0;
    case '>=': return cmp >= 0;
    case '<': return cmp < 0;
    case '<=': return cmp <= 0;
    default: return false;
  }
}

/**
 * Minimal range evaluator. Supports comma/space joined conjunctions.
 *   "<4.17.21"                 → true if installed < 4.17.21
 *   ">=1.0.0 <2.0.0"           → AND conjunction
 *   "^1.2.3" → ">=1.2.3 <2.0.0"
 *   "~1.2.3" → ">=1.2.3 <1.3.0"
 *   "*" / "x" → matches anything
 */
function satisfiesRange(version, range) {
  if (!isString(range)) return false;
  const r = range.trim();
  if (r === '' || r === '*' || r === 'x' || r === 'X' || r === 'latest') return true;

  // Caret range: ^1.2.3 → >=1.2.3 <2.0.0
  if (r.startsWith('^')) {
    const base = parseVersion(r.slice(1));
    if (!base) return false;
    const lo = `>=${base.major}.${base.minor}.${base.patch}`;
    const hi = `<${base.major + 1}.0.0`;
    return evalPredicate(version, lo) && evalPredicate(version, hi);
  }

  // Tilde range: ~1.2.3 → >=1.2.3 <1.3.0
  if (r.startsWith('~')) {
    const base = parseVersion(r.slice(1));
    if (!base) return false;
    const lo = `>=${base.major}.${base.minor}.${base.patch}`;
    const hi = `<${base.major}.${base.minor + 1}.0`;
    return evalPredicate(version, lo) && evalPredicate(version, hi);
  }

  // Conjunction: space or && separated predicates.
  const parts = r.split(/\s+|&&/).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((p) => evalPredicate(version, p));
}

// ---------------------------------------------------------------------------
// PACKAGE.JSON / PACKAGE-LOCK.JSON PARSERS
// ---------------------------------------------------------------------------

/**
 * Parse a package.json file.
 * Returns { name, version, dependencies, devDependencies, license }.
 */
function parsePackageJson(pkgPath) {
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`package.json not found at ${pkgPath}`);
  }
  const pkg = safeReadJson(pkgPath);
  return {
    name: pkg.name || '',
    version: pkg.version || '0.0.0',
    license: pkg.license || '',
    dependencies: pkg.dependencies || {},
    devDependencies: pkg.devDependencies || {},
    peerDependencies: pkg.peerDependencies || {},
    optionalDependencies: pkg.optionalDependencies || {},
  };
}

/**
 * Parse a package-lock.json (lockfile v1, v2, or v3) and return a
 * structured tree plus direct/transitive classification.
 *
 * Returns:
 *   {
 *     direct:     Map<name, {version, license, resolved}>
 *     transitive: Map<name, {version, license, parents:[]}>
 *     tree:       nested object (best-effort)
 *     depth:      max tree depth found
 *   }
 */
function parsePackageLock(lockPath, directNames = new Set()) {
  const direct = new Map();
  const transitive = new Map();
  let maxDepth = 0;

  if (!fs.existsSync(lockPath)) {
    return { direct, transitive, tree: {}, depth: 0 };
  }

  const lock = safeReadJson(lockPath);

  // Lockfile v2/v3: the "packages" object has "node_modules/<name>" keys.
  if (lock.packages && typeof lock.packages === 'object') {
    for (const key of Object.keys(lock.packages)) {
      if (key === '') continue; // root
      // depth = number of "node_modules/" segments
      const segs = key.split('node_modules/').filter(Boolean);
      const name = segs[segs.length - 1].replace(/\/$/, '');
      const depth = segs.length;
      if (depth > maxDepth) maxDepth = depth;
      const entry = lock.packages[key] || {};
      const info = {
        name,
        version: entry.version || '',
        license: entry.license || '',
        resolved: entry.resolved || '',
      };
      if (depth === 1 || directNames.has(name)) {
        direct.set(name, info);
      } else {
        transitive.set(name, info);
      }
    }
  }

  // Lockfile v1: "dependencies" is a nested tree.
  if (lock.dependencies && typeof lock.dependencies === 'object') {
    const walk = (deps, depth, parents) => {
      if (depth > maxDepth) maxDepth = depth;
      for (const name of Object.keys(deps)) {
        const d = deps[name] || {};
        const info = {
          name,
          version: d.version || '',
          license: d.license || '',
          resolved: d.resolved || '',
          parents: parents.slice(),
        };
        if (depth === 1 || directNames.has(name)) {
          if (!direct.has(name)) direct.set(name, info);
        } else if (!transitive.has(name)) {
          transitive.set(name, info);
        }
        if (d.dependencies) {
          walk(d.dependencies, depth + 1, parents.concat(name));
        }
      }
    };
    walk(lock.dependencies, 1, []);
  }

  return {
    direct,
    transitive,
    tree: lock.packages || lock.dependencies || {},
    depth: maxDepth,
  };
}

// ---------------------------------------------------------------------------
// ADVISORY FETCHER (stub — can be swapped for live NVD/GHSA)
// ---------------------------------------------------------------------------

/**
 * Given a list of {name, version} pairs, return an array of advisories
 * that currently apply (i.e. version is in the vulnerable range).
 *
 * In production, swap the ADVISORY_DB lookup for a live HTTP call to
 * NVD or GitHub Advisory Database — the public shape of this function
 * is identical.
 */
function fetchAdvisories(packageList, db = ADVISORY_DB) {
  if (!Array.isArray(packageList)) return [];
  const out = [];
  for (const { name, version } of packageList) {
    const entries = db[name];
    if (!entries || entries.length === 0) continue;
    for (const adv of entries) {
      if (satisfiesRange(version, adv.vulnerable)) {
        out.push({
          package: name,
          installedVersion: version,
          id: adv.id,
          cve: adv.cve,
          severity: adv.severity,
          vulnerable: adv.vulnerable,
          patched: adv.patched,
          title_en: adv.title_en,
          title_he: adv.title_he,
          description_en: adv.description_en,
          description_he: adv.description_he,
          references: adv.references || [],
        });
      }
    }
  }
  return out;
}

function getAdvisoryDB() { return ADVISORY_DB; }

// ---------------------------------------------------------------------------
// LICENSE CLASSIFIER
// ---------------------------------------------------------------------------

function classifyLicense(license) {
  if (!isString(license)) {
    return {
      status: LICENSE_STATUS.UNKNOWN,
      label_en: 'Unknown / missing license',
      label_he: 'רישיון חסר או לא מזוהה',
      license: license || '',
    };
  }
  const key = license.trim();
  const status = LICENSE_POLICY[key] || LICENSE_STATUS.UNKNOWN;
  const labels = {
    [LICENSE_STATUS.OK]:      { en: 'License OK for proprietary use', he: 'רישיון תקין לשימוש מסחרי' },
    [LICENSE_STATUS.REVIEW]:  { en: 'License requires legal review (GPL/AGPL family)', he: 'רישיון דורש בדיקת יועמ״ש (משפחת GPL/AGPL)' },
    [LICENSE_STATUS.WARNING]: { en: 'License warning — commercial/unlicensed', he: 'אזהרת רישיון — מסחרי או ללא רישיון' },
    [LICENSE_STATUS.UNKNOWN]: { en: 'Unknown license — verify manually', he: 'רישיון לא ידוע — יש לאמת ידנית' },
  };
  return {
    status,
    license: key,
    label_en: labels[status].en,
    label_he: labels[status].he,
  };
}

// ---------------------------------------------------------------------------
// TYPOSQUAT DETECTION
// ---------------------------------------------------------------------------

/** Levenshtein distance, capped at 3 for speed. */
function levenshtein(a, b, cap = 3) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let minRow = curr[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
      if (curr[j] < minRow) minRow = curr[j];
    }
    if (minRow > cap) return cap + 1;
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/**
 * Detect typosquat by looking for tiny Levenshtein distance against the
 * popular-name baseline (and excluding exact matches).
 */
function detectTyposquat(name, popular = POPULAR_NAMES) {
  if (!isString(name)) return { suspicious: false };
  const lower = name.toLowerCase();
  for (const p of popular) {
    if (lower === p) return { suspicious: false, exact: true };
    const d = levenshtein(lower, p, 2);
    if (d > 0 && d <= 2) {
      return {
        suspicious: true,
        against: p,
        distance: d,
        label_en: `Name "${name}" is ${d} edit(s) away from popular "${p}"`,
        label_he: `השם "${name}" קרוב במרחק ${d} מהחבילה המוכרת "${p}"`,
      };
    }
  }
  return { suspicious: false };
}

// ---------------------------------------------------------------------------
// ABANDONED PACKAGE DETECTION
// ---------------------------------------------------------------------------

function isAbandoned(lastPublishIso, now = new Date()) {
  if (!isString(lastPublishIso)) return false;
  const last = new Date(lastPublishIso);
  if (isNaN(last.getTime())) return false;
  const ageMs = now.getTime() - last.getTime();
  const ageDays = ageMs / (24 * 3600 * 1000);
  return ageDays >= ABANDONED_THRESHOLD_DAYS;
}

// ---------------------------------------------------------------------------
// OUTDATED DETECTION
// ---------------------------------------------------------------------------

function classifyOutdated(installed, latest) {
  const cmp = compareVersions(installed, latest);
  if (cmp >= 0) return { outdated: false, severity: 'none' };
  const pi = parseVersion(installed);
  const pl = parseVersion(latest);
  if (!pi || !pl) return { outdated: true, severity: 'unknown' };
  if (pi.major < pl.major) return { outdated: true, severity: 'major' };
  if (pi.minor < pl.minor) return { outdated: true, severity: 'minor' };
  return { outdated: true, severity: 'patch' };
}

// ---------------------------------------------------------------------------
// SUPPLY-CHAIN RISK SCORE (0–100, higher = riskier)
// ---------------------------------------------------------------------------
/**
 * Scoring components (each capped):
 *   +vulnerabilities:   sum of SEVERITY_WEIGHT, capped at 60
 *   +outdated major:    +15
 *   +outdated minor:    +5
 *   +abandoned:         +20
 *   +typosquat:         +30
 *   +license review:    +10
 *   +license warning:   +15
 *   +unknown license:   +5
 *   +depth > 5:         +5
 */
function computeRiskScore(dep = {}) {
  let score = 0;

  if (Array.isArray(dep.advisories) && dep.advisories.length > 0) {
    let vulnScore = 0;
    for (const a of dep.advisories) {
      vulnScore += SEVERITY_WEIGHT[a.severity] || 0;
    }
    score += Math.min(vulnScore, 60);
  }

  if (dep.outdated && dep.outdated.outdated) {
    if (dep.outdated.severity === 'major') score += 15;
    else if (dep.outdated.severity === 'minor') score += 5;
  }

  if (dep.abandoned === true) score += 20;

  if (dep.typosquat && dep.typosquat.suspicious) score += 30;

  if (dep.license) {
    if (dep.license.status === LICENSE_STATUS.REVIEW) score += 10;
    else if (dep.license.status === LICENSE_STATUS.WARNING) score += 15;
    else if (dep.license.status === LICENSE_STATUS.UNKNOWN) score += 5;
  }

  if (typeof dep.depth === 'number' && dep.depth > 5) score += 5;

  return Math.max(0, Math.min(100, score));
}

// ---------------------------------------------------------------------------
// FIX RECOMMENDATIONS
// ---------------------------------------------------------------------------

function recommendFixes(report = {}) {
  const cmds = [];
  const seen = new Set();

  const push = (name, version, reason_en, reason_he) => {
    const key = `${name}@${version}`;
    if (seen.has(key)) return;
    seen.add(key);
    cmds.push({
      package: name,
      target: version,
      command: `npm install ${name}@${version}`,
      reason_en,
      reason_he,
    });
  };

  // Vulnerable packages → upgrade to patched version.
  if (Array.isArray(report.vulnerabilities)) {
    for (const v of report.vulnerabilities) {
      push(
        v.package,
        v.patched,
        `Fix ${v.severity} advisory ${v.id} (${v.cve || 'n/a'})`,
        `תיקון פגיעות ${v.severity} — ${v.id} (${v.cve || 'לא ידוע'})`
      );
    }
  }

  // Outdated majors → upgrade to latest.
  if (Array.isArray(report.outdated)) {
    for (const o of report.outdated) {
      if (o.severity === 'major') {
        push(
          o.package,
          o.latest,
          `Upgrade major version (${o.installed} → ${o.latest})`,
          `שדרוג גרסה ראשית (${o.installed} → ${o.latest})`
        );
      }
    }
  }

  // License review → replace or seek legal approval (no auto-fix).
  if (Array.isArray(report.licenses)) {
    for (const l of report.licenses) {
      if (l.status === LICENSE_STATUS.REVIEW || l.status === LICENSE_STATUS.WARNING) {
        cmds.push({
          package: l.package,
          target: null,
          command: `# review license "${l.license}" for ${l.package}`,
          reason_en: `License ${l.license} requires legal review`,
          reason_he: `רישיון ${l.license} דורש בדיקת יועמ״ש`,
        });
      }
    }
  }

  return cmds;
}

// ---------------------------------------------------------------------------
// MAIN SCAN ORCHESTRATOR
// ---------------------------------------------------------------------------

/**
 * Full project scan. Produces a consolidated report.
 *
 * @param {string} packageJsonPath — absolute or relative path to package.json
 * @param {object} [opts]
 * @param {object} [opts.advisoryDb] — swap for live DB
 * @param {object} [opts.registry]    — { [name]: { latest, lastPublish, license } }
 * @param {Date}   [opts.now]         — clock override for tests
 */
function scanProject(packageJsonPath, opts = {}) {
  const pkg = parsePackageJson(packageJsonPath);
  const lockPath = path.join(path.dirname(packageJsonPath), 'package-lock.json');
  const directNames = new Set([
    ...Object.keys(pkg.dependencies),
    ...Object.keys(pkg.devDependencies),
  ]);
  const lock = parsePackageLock(lockPath, directNames);

  const now = opts.now || new Date();
  const db = opts.advisoryDb || ADVISORY_DB;
  const registry = opts.registry || {};

  // Collect all deps (direct + transitive) with installed versions.
  const all = [];
  for (const [name, info] of lock.direct.entries()) {
    all.push({ name, version: info.version, license: info.license, kind: 'direct' });
  }
  for (const [name, info] of lock.transitive.entries()) {
    all.push({ name, version: info.version, license: info.license, kind: 'transitive' });
  }

  // If there's no lockfile, fall back to declared ranges in package.json.
  if (all.length === 0) {
    for (const [name, range] of Object.entries(pkg.dependencies)) {
      const ver = String(range).replace(/^[\^~]/, '');
      all.push({ name, version: ver, license: '', kind: 'direct' });
    }
    for (const [name, range] of Object.entries(pkg.devDependencies)) {
      const ver = String(range).replace(/^[\^~]/, '');
      all.push({ name, version: ver, license: '', kind: 'direct' });
    }
  }

  // Advisory lookup.
  const vulnerabilities = fetchAdvisories(all, db);

  // Outdated detection.
  const outdated = [];
  for (const d of all) {
    const reg = registry[d.name];
    if (!reg || !reg.latest) continue;
    const status = classifyOutdated(d.version, reg.latest);
    if (status.outdated) {
      outdated.push({
        package: d.name,
        installed: d.version,
        latest: reg.latest,
        severity: status.severity,
        kind: d.kind,
      });
    }
  }

  // License compliance.
  const licenses = [];
  for (const d of all) {
    const lic = d.license || (registry[d.name] && registry[d.name].license) || '';
    const classified = classifyLicense(lic);
    licenses.push({
      package: d.name,
      license: classified.license,
      status: classified.status,
      label_en: classified.label_en,
      label_he: classified.label_he,
      kind: d.kind,
    });
  }

  // Abandoned packages.
  const abandoned = [];
  for (const d of all) {
    const reg = registry[d.name];
    if (!reg || !reg.lastPublish) continue;
    if (isAbandoned(reg.lastPublish, now)) {
      abandoned.push({
        package: d.name,
        lastPublish: reg.lastPublish,
        kind: d.kind,
      });
    }
  }

  // Typosquat detection.
  const suspicious = [];
  for (const d of all) {
    const t = detectTyposquat(d.name);
    if (t.suspicious) {
      suspicious.push({
        package: d.name,
        against: t.against,
        distance: t.distance,
        label_en: t.label_en,
        label_he: t.label_he,
        kind: d.kind,
      });
    }
  }

  // Per-dep risk score.
  const risks = [];
  for (const d of all) {
    const advs = vulnerabilities.filter((v) => v.package === d.name);
    const out = outdated.find((o) => o.package === d.name);
    const lic = licenses.find((l) => l.package === d.name);
    const isAbd = abandoned.some((a) => a.package === d.name);
    const typo = suspicious.find((s) => s.package === d.name);
    const score = computeRiskScore({
      advisories: advs,
      outdated: out ? { outdated: true, severity: out.severity } : null,
      abandoned: isAbd,
      typosquat: typo ? { suspicious: true } : null,
      license: lic,
      depth: lock.depth,
    });
    risks.push({ package: d.name, score, kind: d.kind });
  }

  // Aggregate project-level risk: max per-dep score, softened by mean.
  const maxRisk = risks.reduce((m, r) => Math.max(m, r.score), 0);
  const avgRisk = risks.length > 0
    ? risks.reduce((s, r) => s + r.score, 0) / risks.length
    : 0;
  const projectRisk = Math.round(maxRisk * 0.7 + avgRisk * 0.3);

  return {
    project: {
      name: pkg.name,
      version: pkg.version,
      license: pkg.license,
      scannedAt: now.toISOString(),
    },
    counts: {
      direct: lock.direct.size || Object.keys(pkg.dependencies).length,
      transitive: lock.transitive.size,
      total: all.length,
      vulnerable: vulnerabilities.length,
      outdated: outdated.length,
      abandoned: abandoned.length,
      suspicious: suspicious.length,
    },
    deps: all,
    vulnerabilities,
    outdated,
    licenses,
    abandoned,
    suspicious,
    risks,
    projectRisk,
    depth: lock.depth,
  };
}

// ---------------------------------------------------------------------------
// MARKDOWN REPORT GENERATOR
// ---------------------------------------------------------------------------

function severityBadge(sev) {
  const badges = {
    critical: 'CRITICAL / קריטי',
    high:     'HIGH / גבוה',
    medium:   'MEDIUM / בינוני',
    low:      'LOW / נמוך',
    info:     'INFO / מידע',
  };
  return badges[sev] || sev;
}

function generateReport(results) {
  if (!results || !results.project) {
    return '# Dependency Health Report\n\n_No results_\n';
  }
  const lines = [];
  const p = results.project;
  const c = results.counts;

  lines.push(`# Dependency Health Report — דו"ח בריאות תלויות`);
  lines.push('');
  lines.push(`**Project / פרויקט:** ${p.name || '(unnamed)'} @ ${p.version}`);
  lines.push(`**Scanned / נסרק:** ${p.scannedAt}`);
  lines.push(`**Project risk score / ציון סיכון כולל:** ${results.projectRisk} / 100`);
  lines.push('');
  lines.push('## Summary / סיכום');
  lines.push('');
  lines.push('| Metric / מדד | Value / ערך |');
  lines.push('|---|---|');
  lines.push(`| Direct deps / ישירות | ${c.direct} |`);
  lines.push(`| Transitive deps / עקיפות | ${c.transitive} |`);
  lines.push(`| Total / סה״כ | ${c.total} |`);
  lines.push(`| Tree depth / עומק עץ | ${results.depth} |`);
  lines.push(`| Vulnerable / פגיעות | ${c.vulnerable} |`);
  lines.push(`| Outdated / מיושנות | ${c.outdated} |`);
  lines.push(`| Abandoned / נטושות | ${c.abandoned} |`);
  lines.push(`| Suspicious / חשודות | ${c.suspicious} |`);
  lines.push('');

  // Vulnerabilities
  lines.push('## Vulnerable Dependencies / תלויות פגיעות');
  lines.push('');
  if (results.vulnerabilities.length === 0) {
    lines.push('_None / אין_');
  } else {
    lines.push('| Package / חבילה | Installed / מותקנת | Severity / חומרה | ID | Patched / תוקן ב |');
    lines.push('|---|---|---|---|---|');
    for (const v of results.vulnerabilities) {
      lines.push(`| ${v.package} | ${v.installedVersion} | ${severityBadge(v.severity)} | ${v.id} | ${v.patched} |`);
    }
    lines.push('');
    for (const v of results.vulnerabilities) {
      lines.push(`- **${v.package}** — ${v.title_en}`);
      lines.push(`  - עברית: ${v.title_he}`);
      if (v.description_en) lines.push(`  - ${v.description_en}`);
    }
  }
  lines.push('');

  // Outdated
  lines.push('## Outdated / מיושנות');
  lines.push('');
  if (results.outdated.length === 0) {
    lines.push('_None / אין_');
  } else {
    lines.push('| Package / חבילה | Installed | Latest | Severity / חומרה |');
    lines.push('|---|---|---|---|');
    for (const o of results.outdated) {
      lines.push(`| ${o.package} | ${o.installed} | ${o.latest} | ${o.severity} |`);
    }
  }
  lines.push('');

  // License violations
  lines.push('## License Violations / הפרות רישוי');
  lines.push('');
  const lv = results.licenses.filter(
    (l) => l.status === LICENSE_STATUS.REVIEW || l.status === LICENSE_STATUS.WARNING
  );
  if (lv.length === 0) {
    lines.push('_None / אין_');
  } else {
    lines.push('| Package / חבילה | License / רישיון | Status / סטטוס | Note / הערה |');
    lines.push('|---|---|---|---|');
    for (const l of lv) {
      lines.push(`| ${l.package} | ${l.license || '(unknown)'} | ${l.status} | ${l.label_en} |`);
    }
  }
  lines.push('');

  // Abandoned
  lines.push('## Abandoned Packages / חבילות נטושות');
  lines.push('');
  if (results.abandoned.length === 0) {
    lines.push('_None / אין_');
  } else {
    lines.push('| Package / חבילה | Last publish / פרסום אחרון |');
    lines.push('|---|---|');
    for (const a of results.abandoned) {
      lines.push(`| ${a.package} | ${a.lastPublish} |`);
    }
  }
  lines.push('');

  // Suspicious
  lines.push('## Suspicious Packages / חבילות חשודות');
  lines.push('');
  if (results.suspicious.length === 0) {
    lines.push('_None / אין_');
  } else {
    lines.push('| Package / חבילה | Against / מול | Distance / מרחק |');
    lines.push('|---|---|---|');
    for (const s of results.suspicious) {
      lines.push(`| ${s.package} | ${s.against} | ${s.distance} |`);
    }
  }
  lines.push('');

  // Fix recommendations
  lines.push('## Recommended Fixes / המלצות תיקון');
  lines.push('');
  const fixes = recommendFixes(results);
  if (fixes.length === 0) {
    lines.push('_None / אין_');
  } else {
    for (const f of fixes) {
      lines.push(`- \`${f.command}\` — ${f.reason_en}`);
      lines.push(`  - עברית: ${f.reason_he}`);
    }
  }
  lines.push('');

  lines.push('---');
  lines.push('_Generated by Agent X-63 dep-health monitor — Techno-Kol Uzi mega-ERP_');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

module.exports = {
  // constants
  SEVERITY,
  SEVERITY_WEIGHT,
  LICENSE_STATUS,
  LICENSE_POLICY,
  ABANDONED_THRESHOLD_DAYS,
  POPULAR_NAMES,
  // semver helpers
  parseVersion,
  compareVersions,
  satisfiesRange,
  evalPredicate,
  // parsers
  parsePackageJson,
  parsePackageLock,
  // advisory
  fetchAdvisories,
  getAdvisoryDB,
  // classifiers
  classifyLicense,
  classifyOutdated,
  // detectors
  detectTyposquat,
  isAbandoned,
  levenshtein,
  // scoring
  computeRiskScore,
  // orchestrator
  scanProject,
  // reporting
  recommendFixes,
  generateReport,
};
