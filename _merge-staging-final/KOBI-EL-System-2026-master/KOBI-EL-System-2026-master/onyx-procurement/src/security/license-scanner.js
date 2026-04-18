/**
 * ═══════════════════════════════════════════════════════════════════════════
 * License Compliance Scanner — AG-X92
 * Mega-ERP Techno-Kol Uzi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Zero-dependency license compliance scanner for open-source dependency trees.
 *
 * Features:
 *   - Reads `license` / `licenses` fields from package.json
 *   - Fuzzy-matches LICENSE / LICENCE / COPYING / NOTICE file contents against
 *     embedded fingerprints of the top 30 OSI licenses (normalized Levenshtein)
 *   - Walks node_modules recursively without following symlinks into cycles
 *   - Categorizes: permissive, weak-copyleft, strong-copyleft, network-copyleft,
 *     public-domain, proprietary, commercial, unknown
 *   - Parses SPDX expressions:   (MIT OR Apache-2.0)
 *                                GPL-2.0-only WITH Classpath-exception-2.0
 *                                (MIT AND BSD-3-Clause)
 *   - Policy engine (allow / deny categories + per-license overrides)
 *   - Compatibility matrix for known incompatibilities (GPL vs Apache, etc.)
 *   - Reporters: CSV, HTML, SPDX 2.3 tag:value, THIRD_PARTY_NOTICES.txt
 *
 * Rule: NEVER DELETE — ONLY UPGRADE AND GROW. This module never mutates
 * input files; it only reads and writes its own report artifacts.
 *
 * Author:   AG-X92 (License Compliance Agent)
 * Date:     2026-04-11
 * License:  Internal — Techno-Kol Uzi mega-ERP
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// ═══════════════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const CATEGORY = Object.freeze({
  PERMISSIVE: 'permissive',
  WEAK_COPYLEFT: 'weak-copyleft',
  STRONG_COPYLEFT: 'strong-copyleft',
  NETWORK_COPYLEFT: 'network-copyleft',
  PUBLIC_DOMAIN: 'public-domain',
  PROPRIETARY: 'proprietary',
  COMMERCIAL: 'commercial',
  UNKNOWN: 'unknown',
});

/** @type {Record<string, string>} SPDX id → category */
const SPDX_CATEGORY = Object.freeze({
  // Permissive
  'MIT': CATEGORY.PERMISSIVE,
  'MIT-0': CATEGORY.PERMISSIVE,
  'X11': CATEGORY.PERMISSIVE,
  'Apache-2.0': CATEGORY.PERMISSIVE,
  'Apache-1.1': CATEGORY.PERMISSIVE,
  'BSD-2-Clause': CATEGORY.PERMISSIVE,
  'BSD-3-Clause': CATEGORY.PERMISSIVE,
  'BSD-3-Clause-Clear': CATEGORY.PERMISSIVE,
  'BSD-4-Clause': CATEGORY.PERMISSIVE,
  '0BSD': CATEGORY.PERMISSIVE,
  'ISC': CATEGORY.PERMISSIVE,
  'Zlib': CATEGORY.PERMISSIVE,
  'libpng': CATEGORY.PERMISSIVE,
  'Python-2.0': CATEGORY.PERMISSIVE,
  'PSF-2.0': CATEGORY.PERMISSIVE,
  'BSL-1.0': CATEGORY.PERMISSIVE,
  'Artistic-2.0': CATEGORY.PERMISSIVE,
  'WTFPL': CATEGORY.PERMISSIVE,
  'Beerware': CATEGORY.PERMISSIVE,

  // Public domain
  'Unlicense': CATEGORY.PUBLIC_DOMAIN,
  'CC0-1.0': CATEGORY.PUBLIC_DOMAIN,
  'PDDL-1.0': CATEGORY.PUBLIC_DOMAIN,

  // Weak copyleft
  'LGPL-2.0-only': CATEGORY.WEAK_COPYLEFT,
  'LGPL-2.0-or-later': CATEGORY.WEAK_COPYLEFT,
  'LGPL-2.1-only': CATEGORY.WEAK_COPYLEFT,
  'LGPL-2.1-or-later': CATEGORY.WEAK_COPYLEFT,
  'LGPL-3.0-only': CATEGORY.WEAK_COPYLEFT,
  'LGPL-3.0-or-later': CATEGORY.WEAK_COPYLEFT,
  'MPL-1.1': CATEGORY.WEAK_COPYLEFT,
  'MPL-2.0': CATEGORY.WEAK_COPYLEFT,
  'EPL-1.0': CATEGORY.WEAK_COPYLEFT,
  'EPL-2.0': CATEGORY.WEAK_COPYLEFT,
  'CDDL-1.0': CATEGORY.WEAK_COPYLEFT,
  'CDDL-1.1': CATEGORY.WEAK_COPYLEFT,
  'EUPL-1.1': CATEGORY.WEAK_COPYLEFT,
  'EUPL-1.2': CATEGORY.WEAK_COPYLEFT,

  // Strong copyleft
  'GPL-1.0-only': CATEGORY.STRONG_COPYLEFT,
  'GPL-1.0-or-later': CATEGORY.STRONG_COPYLEFT,
  'GPL-2.0-only': CATEGORY.STRONG_COPYLEFT,
  'GPL-2.0-or-later': CATEGORY.STRONG_COPYLEFT,
  'GPL-3.0-only': CATEGORY.STRONG_COPYLEFT,
  'GPL-3.0-or-later': CATEGORY.STRONG_COPYLEFT,

  // Network copyleft
  'AGPL-1.0-only': CATEGORY.NETWORK_COPYLEFT,
  'AGPL-1.0-or-later': CATEGORY.NETWORK_COPYLEFT,
  'AGPL-3.0-only': CATEGORY.NETWORK_COPYLEFT,
  'AGPL-3.0-or-later': CATEGORY.NETWORK_COPYLEFT,
  'SSPL-1.0': CATEGORY.NETWORK_COPYLEFT,

  // Proprietary / commercial markers
  'UNLICENSED': CATEGORY.PROPRIETARY,
  'SEE LICENSE IN LICENSE': CATEGORY.PROPRIETARY,
  'Proprietary': CATEGORY.PROPRIETARY,
  'Commercial': CATEGORY.COMMERCIAL,
});

/** Legacy / shorthand → canonical SPDX id (for common dirty input) */
const ALIAS = Object.freeze({
  'MIT LICENSE': 'MIT',
  'THE MIT LICENSE': 'MIT',
  'MIT/X11': 'MIT',
  'APACHE': 'Apache-2.0',
  'APACHE 2': 'Apache-2.0',
  'APACHE-2': 'Apache-2.0',
  'APACHE2': 'Apache-2.0',
  'APACHE 2.0': 'Apache-2.0',
  'APACHE LICENSE 2.0': 'Apache-2.0',
  'APACHE SOFTWARE LICENSE 2.0': 'Apache-2.0',
  'ASL-2.0': 'Apache-2.0',
  'AL-2.0': 'Apache-2.0',
  'BSD': 'BSD-3-Clause',
  'BSD3': 'BSD-3-Clause',
  'BSD-3': 'BSD-3-Clause',
  'NEW BSD': 'BSD-3-Clause',
  'MODIFIED BSD': 'BSD-3-Clause',
  'BSD-2': 'BSD-2-Clause',
  'SIMPLIFIED BSD': 'BSD-2-Clause',
  'GPL': 'GPL-3.0-or-later',
  'GPL2': 'GPL-2.0-only',
  'GPL-2': 'GPL-2.0-only',
  'GPL-2.0': 'GPL-2.0-only',
  'GPLV2': 'GPL-2.0-only',
  'GPL3': 'GPL-3.0-only',
  'GPL-3': 'GPL-3.0-only',
  'GPL-3.0': 'GPL-3.0-only',
  'GPLV3': 'GPL-3.0-only',
  'LGPL': 'LGPL-3.0-or-later',
  'LGPL2': 'LGPL-2.1-only',
  'LGPL-2': 'LGPL-2.1-only',
  'LGPL-2.1': 'LGPL-2.1-only',
  'LGPL3': 'LGPL-3.0-only',
  'LGPL-3': 'LGPL-3.0-only',
  'LGPL-3.0': 'LGPL-3.0-only',
  'AGPL': 'AGPL-3.0-or-later',
  'AGPL3': 'AGPL-3.0-only',
  'AGPL-3': 'AGPL-3.0-only',
  'AGPL-3.0': 'AGPL-3.0-only',
  'MPL': 'MPL-2.0',
  'MPL2': 'MPL-2.0',
  'MPL-2': 'MPL-2.0',
  'EPL': 'EPL-2.0',
  'EPL-1': 'EPL-1.0',
  'EPL-2': 'EPL-2.0',
  'CDDL': 'CDDL-1.1',
  'PUBLIC DOMAIN': 'CC0-1.0',
  'CC0': 'CC0-1.0',
  'ISC LICENSE': 'ISC',
  'ZLIB': 'Zlib',
  'BOOST': 'BSL-1.0',
  'BOOST SOFTWARE LICENSE': 'BSL-1.0',
  'PYTHON': 'Python-2.0',
});

/**
 * Fingerprint phrases — highly distinctive sentences taken from each license
 * body. Fuzzy matcher scores a candidate file as "N out of M fingerprints
 * present within tolerance". Keeping it to a handful of phrases per license
 * keeps the module file small and the matcher fast.
 */
const FINGERPRINTS = Object.freeze({
  'MIT': [
    'permission is hereby granted free of charge to any person obtaining a copy',
    'the software is provided as is without warranty of any kind express or implied',
    'the above copyright notice and this permission notice shall be included',
  ],
  'Apache-2.0': [
    'apache license version 2.0',
    'licensed under the apache license version 2.0',
    'unless required by applicable law or agreed to in writing software',
    'you may obtain a copy of the license at',
  ],
  'BSD-2-Clause': [
    'redistribution and use in source and binary forms with or without modification are permitted',
    'redistributions of source code must retain the above copyright notice',
    'redistributions in binary form must reproduce the above copyright notice',
  ],
  'BSD-3-Clause': [
    'redistribution and use in source and binary forms with or without modification are permitted',
    'neither the name of the copyright holder nor the names of its contributors may be used to endorse',
  ],
  'BSD-4-Clause': [
    'all advertising materials mentioning features or use of this software must display',
  ],
  '0BSD': [
    'bsd zero clause license',
    'permission to use copy modify and or distribute this software for any purpose with or without fee is hereby granted',
  ],
  'ISC': [
    'isc license',
    'permission to use copy modify and or distribute this software for any purpose with or without fee is hereby granted provided that the above copyright notice and this permission notice appear in all copies',
  ],
  'Zlib': [
    'this software is provided as is without any express or implied warranty',
    'the origin of this software must not be misrepresented',
  ],
  'BSL-1.0': [
    'boost software license version 1.0',
    'permission is hereby granted free of charge to any person or organization',
  ],
  'Unlicense': [
    'this is free and unencumbered software released into the public domain',
  ],
  'CC0-1.0': [
    'creative commons cc0 1.0 universal',
    'has dedicated the work to the public domain',
  ],
  'WTFPL': [
    'do what the fuck you want to public license',
  ],
  'MPL-2.0': [
    'mozilla public license version 2.0',
    'this source code form is subject to the terms of the mozilla public license',
  ],
  'MPL-1.1': [
    'mozilla public license version 1.1',
  ],
  'EPL-1.0': [
    'eclipse public license v 1.0',
  ],
  'EPL-2.0': [
    'eclipse public license version 2.0',
  ],
  'CDDL-1.0': [
    'common development and distribution license version 1.0',
  ],
  'CDDL-1.1': [
    'common development and distribution license version 1.1',
  ],
  'LGPL-2.1-only': [
    'gnu lesser general public license',
    'version 2.1 february 1999',
  ],
  'LGPL-3.0-only': [
    'gnu lesser general public license',
    'version 3 29 june 2007',
  ],
  'GPL-2.0-only': [
    'gnu general public license',
    'version 2 june 1991',
  ],
  'GPL-3.0-only': [
    'gnu general public license',
    'version 3 29 june 2007',
  ],
  'AGPL-3.0-only': [
    'gnu affero general public license',
    'version 3 19 november 2007',
  ],
  'SSPL-1.0': [
    'server side public license version 1',
  ],
  'EUPL-1.2': [
    'european union public licence v 1.2',
  ],
  'Python-2.0': [
    'python software foundation license',
  ],
  'Artistic-2.0': [
    'the artistic license 2.0',
  ],
  'Beerware': [
    'as long as you retain this notice you can do whatever you want with this stuff',
  ],
});

/**
 * Classpath-level incompatibilities. For each source license, list
 * categories / licenses that are KNOWN to clash when combined in a single
 * redistributable work.
 *
 * Sources:
 *   - https://www.gnu.org/licenses/license-list.html
 *   - https://opensource.google/documentation/reference/thirdparty/licenses
 *   - Apache Software Foundation category matrix
 */
const INCOMPATIBILITY_MATRIX = Object.freeze({
  'GPL-2.0-only': ['Apache-2.0', 'EPL-1.0', 'EPL-2.0', 'CDDL-1.0', 'CDDL-1.1', 'MPL-1.1'],
  'GPL-2.0-or-later': [],
  'GPL-3.0-only': ['Apache-1.1'],
  'GPL-3.0-or-later': ['Apache-1.1'],
  'LGPL-2.1-only': [],
  'AGPL-3.0-only': ['Apache-1.1'],
  'Apache-2.0': ['GPL-2.0-only'],
  'EPL-1.0': ['GPL-2.0-only', 'GPL-3.0-only'],
  'EPL-2.0': ['GPL-2.0-only'],
  'CDDL-1.0': ['GPL-2.0-only', 'GPL-3.0-only'],
  'CDDL-1.1': ['GPL-2.0-only', 'GPL-3.0-only'],
  'MPL-1.1': ['GPL-2.0-only', 'GPL-3.0-only'],
  'SSPL-1.0': [
    'GPL-2.0-only', 'GPL-3.0-only',
    'Apache-2.0', 'MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC',
  ],
});

// ═══════════════════════════════════════════════════════════════════════════
//  PUBLIC CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} ScanEntry
 * @property {string}  name       Package name (from package.json)
 * @property {string}  version    Package version
 * @property {string}  location   Absolute path to package root
 * @property {string}  declared   Raw `license` field from package.json
 * @property {string[]} spdxIds   Resolved canonical SPDX ids
 * @property {string}  category   Category from CATEGORY
 * @property {string}  source     How the license was determined
 * @property {number}  confidence 0–100 confidence score
 * @property {string[]} licenseFiles Paths to LICENSE/COPYING files found
 * @property {string}  noticeText Concatenated notice text (for redistribution)
 */

class LicenseScanner {
  /**
   * @param {object} [options]
   * @param {object} [options.aliasOverrides]  Map of `UPPERCASE ALIAS` -> SPDX
   * @param {object} [options.categoryOverrides] Map of SPDX -> category
   * @param {number} [options.fuzzyThreshold]  0–1, min similarity for a
   *                                           fingerprint hit. Default 0.82.
   * @param {boolean} [options.followSymlinks] Follow symlinks during tree
   *                                           walk. Default false.
   * @param {number} [options.maxDepth]        Max recursion depth. Default 30.
   */
  constructor(options = {}) {
    this.options = {
      aliasOverrides: options.aliasOverrides || {},
      categoryOverrides: options.categoryOverrides || {},
      fuzzyThreshold:
        typeof options.fuzzyThreshold === 'number' ? options.fuzzyThreshold : 0.82,
      followSymlinks: options.followSymlinks === true,
      maxDepth: typeof options.maxDepth === 'number' ? options.maxDepth : 30,
    };
    /** @type {Map<string, ScanEntry>} key = `${name}@${version}|${location}` */
    this.results = new Map();
    /** @type {string[]} warnings collected during scans */
    this.warnings = [];
  }

  // ───────────────────────────────────────────────────────────────────────
  //  scanPackage
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Scan a single package directory.
   * @param {string} packagePath Absolute path to a package root (contains package.json)
   * @returns {ScanEntry}
   */
  scanPackage(packagePath) {
    if (typeof packagePath !== 'string' || packagePath.length === 0) {
      throw new TypeError('scanPackage: packagePath must be a non-empty string');
    }
    const pkgJsonPath = path.join(packagePath, 'package.json');
    /** @type {ScanEntry} */
    const entry = {
      name: '',
      version: '',
      location: packagePath,
      declared: '',
      spdxIds: [],
      category: CATEGORY.UNKNOWN,
      source: 'none',
      confidence: 0,
      licenseFiles: [],
      noticeText: '',
    };

    let pkg = null;
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const raw = fs.readFileSync(pkgJsonPath, 'utf8');
        pkg = JSON.parse(raw);
      } catch (err) {
        this.warnings.push(
          `[${packagePath}] package.json unreadable: ${err.message}`
        );
      }
    }

    if (pkg) {
      entry.name = typeof pkg.name === 'string' ? pkg.name : '';
      entry.version = typeof pkg.version === 'string' ? pkg.version : '';
      const decl = extractDeclaredLicense(pkg);
      if (decl) {
        entry.declared = decl;
        const parsed = parseSPDX(decl);
        if (parsed.ids.length > 0) {
          entry.spdxIds = parsed.ids.map((id) =>
            resolveAlias(id, this.options.aliasOverrides)
          );
          entry.source = 'package.json';
          entry.confidence = 95;
        }
      }
    }

    // File-based scan (runs even if declared is present, to fill noticeText)
    const licenseFiles = findLicenseFiles(packagePath);
    entry.licenseFiles = licenseFiles;

    if (licenseFiles.length > 0) {
      const fileText = licenseFiles
        .map((p) => safeReadFile(p))
        .filter(Boolean)
        .join('\n\n');
      entry.noticeText = fileText.trim();

      if (entry.spdxIds.length === 0 && fileText) {
        const fuzz = this.fuzzyMatch(fileText);
        if (fuzz.id) {
          entry.spdxIds = [fuzz.id];
          entry.source = 'LICENSE file (fuzzy match)';
          entry.confidence = Math.round(fuzz.similarity * 100);
          if (!entry.declared) entry.declared = fuzz.id;
        }
      }
    }

    entry.category = this.classify(
      entry.spdxIds.length ? entry.spdxIds.join(' OR ') : entry.declared
    );

    const key = this._entryKey(entry);
    this.results.set(key, entry);
    return entry;
  }

  // ───────────────────────────────────────────────────────────────────────
  //  scanTree
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Walk node_modules recursively and build a license map.
   * @param {string} rootPath Project root (contains node_modules)
   * @returns {Map<string, ScanEntry>}
   */
  scanTree(rootPath) {
    if (typeof rootPath !== 'string' || rootPath.length === 0) {
      throw new TypeError('scanTree: rootPath must be a non-empty string');
    }
    const seen = new Set();
    const nodeModules = path.join(rootPath, 'node_modules');

    // Also scan the root package itself
    if (fs.existsSync(path.join(rootPath, 'package.json'))) {
      this.scanPackage(rootPath);
    }

    if (fs.existsSync(nodeModules)) {
      this._walk(nodeModules, 0, seen);
    }
    return this.results;
  }

  /**
   * @private
   * @param {string} dir
   * @param {number} depth
   * @param {Set<string>} seen
   */
  _walk(dir, depth, seen) {
    if (depth > this.options.maxDepth) return;
    let real;
    try {
      real = fs.realpathSync(dir);
    } catch (err) {
      this.warnings.push(`[walk] realpath failed for ${dir}: ${err.message}`);
      return;
    }
    if (seen.has(real)) return;
    seen.add(real);

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      this.warnings.push(`[walk] readdir failed for ${dir}: ${err.message}`);
      return;
    }

    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);

      // Scoped packages: `@scope/pkg`
      if (e.name.startsWith('@') && (e.isDirectory() || e.isSymbolicLink())) {
        this._walk(full, depth + 1, seen);
        continue;
      }

      // Skip non-directories
      const isDir = e.isDirectory() || (this.options.followSymlinks && e.isSymbolicLink());
      if (!isDir) continue;

      const pkgJson = path.join(full, 'package.json');
      if (fs.existsSync(pkgJson)) {
        this.scanPackage(full);
        // Recurse into nested node_modules
        const nested = path.join(full, 'node_modules');
        if (fs.existsSync(nested)) {
          this._walk(nested, depth + 1, seen);
        }
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  //  classify
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Classify a raw license string or SPDX expression.
   * @param {string} license
   * @returns {string} one of CATEGORY.*
   */
  classify(license) {
    if (!license || typeof license !== 'string') return CATEGORY.UNKNOWN;
    const parsed = parseSPDX(license);
    if (parsed.ids.length === 0) return CATEGORY.UNKNOWN;

    // OR expression: caller can pick the best license -> use most permissive
    // AND expression: caller must satisfy ALL -> use most restrictive
    const categories = parsed.ids.map((id) => {
      const resolved = resolveAlias(id, this.options.aliasOverrides);
      if (this.options.categoryOverrides[resolved]) {
        return this.options.categoryOverrides[resolved];
      }
      return SPDX_CATEGORY[resolved] || CATEGORY.UNKNOWN;
    });

    if (parsed.operator === 'OR') {
      // Most permissive wins
      return pickMostPermissive(categories);
    }
    // AND or single → most restrictive wins
    return pickMostRestrictive(categories);
  }

  // ───────────────────────────────────────────────────────────────────────
  //  checkCompatibility
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Evaluate the current results map against a policy.
   * @param {Object} args
   * @param {string} args.projectLicense Project's own license (SPDX id)
   * @param {Object} args.policy
   * @param {string[]} [args.policy.allowCategories] Allowed category ids
   * @param {string[]} [args.policy.denyCategories]  Denied category ids
   * @param {string[]} [args.policy.allowLicenses]   Per-SPDX allow-list
   * @param {string[]} [args.policy.denyLicenses]    Per-SPDX deny-list
   * @returns {{passed:boolean, violations: Array<{package,version,license,reason,severity}>, summary:object}}
   */
  checkCompatibility({ projectLicense, policy }) {
    policy = policy || {};
    const allowCats = new Set(policy.allowCategories || []);
    const denyCats = new Set(policy.denyCategories || []);
    const allowLics = new Set(policy.allowLicenses || []);
    const denyLics = new Set(policy.denyLicenses || []);

    const violations = [];
    const summary = {
      total: this.results.size,
      byCategory: {},
      byLicense: {},
    };

    for (const e of this.results.values()) {
      summary.byCategory[e.category] = (summary.byCategory[e.category] || 0) + 1;
      const spdxKey = e.spdxIds.join(' OR ') || '(unknown)';
      summary.byLicense[spdxKey] = (summary.byLicense[spdxKey] || 0) + 1;

      // Per-license allow-list short-circuits all category logic
      const allAllowed = e.spdxIds.length > 0 && e.spdxIds.every((id) => allowLics.has(id));
      if (allAllowed) continue;

      const anyDenied = e.spdxIds.some((id) => denyLics.has(id));
      if (anyDenied) {
        violations.push({
          package: e.name,
          version: e.version,
          license: spdxKey,
          category: e.category,
          reason: `license on deny-list`,
          severity: 'block',
        });
        continue;
      }

      if (denyCats.has(e.category)) {
        violations.push({
          package: e.name,
          version: e.version,
          license: spdxKey,
          category: e.category,
          reason: `category "${e.category}" is denied`,
          severity: 'block',
        });
        continue;
      }

      if (allowCats.size > 0 && !allowCats.has(e.category)) {
        violations.push({
          package: e.name,
          version: e.version,
          license: spdxKey,
          category: e.category,
          reason: `category "${e.category}" is not in the allow-list`,
          severity: 'warn',
        });
        continue;
      }

      if (e.category === CATEGORY.UNKNOWN && !allAllowed) {
        violations.push({
          package: e.name,
          version: e.version,
          license: spdxKey,
          category: e.category,
          reason: 'license unknown — manual legal review required',
          severity: 'review',
        });
      }

      // Project-level conflict (GPL-in-Apache-project, etc.)
      if (projectLicense) {
        for (const id of e.spdxIds) {
          const conflict = this.detectLicenseConflict(projectLicense, id);
          if (conflict.conflict) {
            violations.push({
              package: e.name,
              version: e.version,
              license: id,
              category: e.category,
              reason: `conflicts with project license ${projectLicense}: ${conflict.reason}`,
              severity: 'block',
            });
          }
        }
      }
    }

    return {
      passed: violations.filter((v) => v.severity === 'block').length === 0,
      violations,
      summary,
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  //  Reporters
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Export a CSV license report.
   * @param {string} outputPath
   * @returns {string} absolute path written
   */
  exportCSV(outputPath) {
    const header = [
      'name', 'version', 'license', 'spdx', 'category',
      'source', 'confidence', 'location',
    ];
    const rows = [header.join(',')];
    for (const e of this.results.values()) {
      rows.push([
        csvField(e.name),
        csvField(e.version),
        csvField(e.declared),
        csvField(e.spdxIds.join(' OR ')),
        csvField(e.category),
        csvField(e.source),
        String(e.confidence),
        csvField(e.location),
      ].join(','));
    }
    const body = rows.join('\n') + '\n';
    if (outputPath) {
      ensureDir(path.dirname(outputPath));
      fs.writeFileSync(outputPath, body, 'utf8');
    }
    return body;
  }

  /**
   * Export an HTML license report.
   * @param {string} outputPath
   * @returns {string} html body (also written to disk if outputPath)
   */
  exportHTML(outputPath) {
    const rows = [];
    for (const e of this.results.values()) {
      rows.push(
        '<tr>' +
          `<td>${htmlEscape(e.name)}</td>` +
          `<td>${htmlEscape(e.version)}</td>` +
          `<td>${htmlEscape(e.declared || '(none)')}</td>` +
          `<td>${htmlEscape(e.spdxIds.join(' OR '))}</td>` +
          `<td class="cat-${e.category}">${htmlEscape(e.category)}</td>` +
          `<td>${htmlEscape(e.source)}</td>` +
          `<td>${e.confidence}%</td>` +
        '</tr>'
      );
    }
    const html =
      '<!doctype html>\n' +
      '<html lang="en" dir="ltr">\n' +
      '<head><meta charset="utf-8"><title>License Report</title>\n' +
      '<style>\n' +
      'body{font-family:system-ui,sans-serif;max-width:1100px;margin:2rem auto;padding:0 1rem}\n' +
      'h1{border-bottom:2px solid #333}\n' +
      'table{border-collapse:collapse;width:100%}\n' +
      'th,td{border:1px solid #ddd;padding:.4rem .6rem;text-align:left;font-size:.9rem}\n' +
      'th{background:#f5f5f5}\n' +
      '.cat-permissive{background:#d4edda}\n' +
      '.cat-weak-copyleft{background:#fff3cd}\n' +
      '.cat-strong-copyleft{background:#f8d7da}\n' +
      '.cat-network-copyleft{background:#f5c6cb}\n' +
      '.cat-proprietary{background:#fdecea}\n' +
      '.cat-unknown{background:#e2e3e5}\n' +
      '</style></head>\n' +
      '<body>\n' +
      `<h1>License Compliance Report</h1>\n` +
      `<p>Generated: ${new Date().toISOString()}<br>Total packages: ${this.results.size}</p>\n` +
      '<table><thead><tr>' +
      '<th>Name</th><th>Version</th><th>Declared</th><th>SPDX</th>' +
      '<th>Category</th><th>Source</th><th>Confidence</th>' +
      '</tr></thead><tbody>\n' +
      rows.join('\n') +
      '\n</tbody></table>\n</body></html>\n';
    if (outputPath) {
      ensureDir(path.dirname(outputPath));
      fs.writeFileSync(outputPath, html, 'utf8');
    }
    return html;
  }

  /**
   * Export an SPDX 2.3 tag:value document.
   * @param {string} outputPath
   * @returns {string}
   */
  exportSPDX(outputPath) {
    const lines = [];
    lines.push('SPDXVersion: SPDX-2.3');
    lines.push('DataLicense: CC0-1.0');
    lines.push('SPDXID: SPDXRef-DOCUMENT');
    lines.push('DocumentName: TechnoKolUzi-LicenseScan');
    lines.push(`DocumentNamespace: https://techno-kol-uzi.local/spdx/${Date.now()}`);
    lines.push('Creator: Tool: onyx-procurement-license-scanner-1.0');
    lines.push(`Created: ${new Date().toISOString()}`);
    lines.push('');
    let i = 0;
    for (const e of this.results.values()) {
      i += 1;
      const spdxId = `SPDXRef-Pkg-${i}-${sanitizeSpdxId(e.name)}`;
      lines.push(`##### Package: ${e.name}`);
      lines.push(`PackageName: ${e.name || 'UNKNOWN'}`);
      lines.push(`SPDXID: ${spdxId}`);
      lines.push(`PackageVersion: ${e.version || 'NOASSERTION'}`);
      lines.push(`PackageDownloadLocation: NOASSERTION`);
      lines.push(`FilesAnalyzed: false`);
      lines.push(`PackageLicenseConcluded: ${e.spdxIds.join(' OR ') || 'NOASSERTION'}`);
      lines.push(`PackageLicenseDeclared: ${e.declared || 'NOASSERTION'}`);
      lines.push(`PackageCopyrightText: NOASSERTION`);
      lines.push('');
    }
    const body = lines.join('\n');
    if (outputPath) {
      ensureDir(path.dirname(outputPath));
      fs.writeFileSync(outputPath, body, 'utf8');
    }
    return body;
  }

  /**
   * Produce a THIRD_PARTY_NOTICES.txt aggregating every dep's license text,
   * suitable for shipping alongside a redistributable binary/installer.
   * @param {string} [outputPath]
   * @returns {string}
   */
  generateNoticeFile(outputPath) {
    const sep = '\n' + '='.repeat(72) + '\n';
    const parts = [];
    parts.push('THIRD-PARTY NOTICES');
    parts.push('Techno-Kol Uzi mega-ERP — open-source license acknowledgements');
    parts.push(`Generated: ${new Date().toISOString()}`);
    parts.push(`Total packages: ${this.results.size}`);
    parts.push(sep);

    // Sort by name for deterministic output
    const sorted = Array.from(this.results.values()).sort((a, b) =>
      (a.name || '').localeCompare(b.name || '')
    );

    for (const e of sorted) {
      parts.push(`Package: ${e.name || '(unnamed)'}`);
      if (e.version) parts.push(`Version: ${e.version}`);
      parts.push(`License: ${e.spdxIds.join(' OR ') || e.declared || 'UNKNOWN'}`);
      parts.push(`Category: ${e.category}`);
      if (e.noticeText) {
        parts.push('');
        parts.push(e.noticeText);
      } else {
        parts.push('');
        parts.push('(No LICENSE file bundled with this package — see ' +
          'package.json metadata.)');
      }
      parts.push(sep);
    }

    const body = parts.join('\n');
    if (outputPath) {
      ensureDir(path.dirname(outputPath));
      fs.writeFileSync(outputPath, body, 'utf8');
    }
    return body;
  }

  // ───────────────────────────────────────────────────────────────────────
  //  Compatibility
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Check whether combining two licenses in a single work is known to clash.
   * @param {string} license1
   * @param {string} license2
   * @returns {{conflict:boolean, reason:string, severity:string}}
   */
  detectLicenseConflict(license1, license2) {
    const a = resolveAlias(stripSpdxExtras(license1), this.options.aliasOverrides);
    const b = resolveAlias(stripSpdxExtras(license2), this.options.aliasOverrides);
    if (!a || !b) {
      return { conflict: false, reason: 'insufficient data', severity: 'none' };
    }
    if (a === b) {
      return { conflict: false, reason: 'identical licenses', severity: 'none' };
    }

    const forward = INCOMPATIBILITY_MATRIX[a] || [];
    const reverse = INCOMPATIBILITY_MATRIX[b] || [];

    if (forward.includes(b)) {
      return {
        conflict: true,
        reason: `${a} explicitly incompatible with ${b}`,
        severity: 'block',
      };
    }
    if (reverse.includes(a)) {
      return {
        conflict: true,
        reason: `${b} explicitly incompatible with ${a}`,
        severity: 'block',
      };
    }

    // Category-level rough check: strong-copyleft dep in permissive project
    const catA = SPDX_CATEGORY[a] || CATEGORY.UNKNOWN;
    const catB = SPDX_CATEGORY[b] || CATEGORY.UNKNOWN;
    if (
      (catA === CATEGORY.PERMISSIVE && catB === CATEGORY.NETWORK_COPYLEFT) ||
      (catB === CATEGORY.PERMISSIVE && catA === CATEGORY.NETWORK_COPYLEFT)
    ) {
      return {
        conflict: true,
        reason: `network-copyleft ${catA === CATEGORY.NETWORK_COPYLEFT ? a : b} imposes obligations on permissive project`,
        severity: 'block',
      };
    }

    return { conflict: false, reason: 'no known conflict', severity: 'none' };
  }

  // ───────────────────────────────────────────────────────────────────────
  //  Fuzzy matcher
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Fuzzy-match a LICENSE file body against embedded fingerprints.
   * @param {string} text
   * @returns {{id:string, similarity:number, matchedPhrases:number, total:number}}
   */
  fuzzyMatch(text) {
    const norm = normalizeText(text);
    let best = { id: '', similarity: 0, matchedPhrases: 0, total: 0 };

    for (const [spdxId, phrases] of Object.entries(FINGERPRINTS)) {
      let matched = 0;
      let sumSim = 0;
      for (const phrase of phrases) {
        const sim = bestSubstringSimilarity(norm, phrase);
        if (sim >= this.options.fuzzyThreshold) {
          matched += 1;
        }
        sumSim += sim;
      }
      const ratio = matched / phrases.length;
      // Weighted: how many phrases matched + avg similarity
      const composite = ratio * 0.7 + (sumSim / phrases.length) * 0.3;
      if (composite > best.similarity && matched > 0) {
        best = {
          id: spdxId,
          similarity: composite,
          matchedPhrases: matched,
          total: phrases.length,
        };
      }
    }
    return best;
  }

  // ───────────────────────────────────────────────────────────────────────
  //  Helpers
  // ───────────────────────────────────────────────────────────────────────

  /** @returns {ScanEntry[]} */
  getResults() {
    return Array.from(this.results.values());
  }

  /** Reset accumulated state (non-destructive wrt files). */
  reset() {
    this.results = new Map();
    this.warnings = [];
  }

  /** @private */
  _entryKey(entry) {
    return `${entry.name}@${entry.version}|${entry.location}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  PURE HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract the declared license from package.json.
 * Supports `license` (string) and deprecated `licenses` (array).
 */
function extractDeclaredLicense(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license && typeof pkg.license === 'object' && typeof pkg.license.type === 'string') {
    return pkg.license.type;
  }
  if (Array.isArray(pkg.licenses) && pkg.licenses.length > 0) {
    const ids = pkg.licenses
      .map((l) => (typeof l === 'string' ? l : l && l.type))
      .filter(Boolean);
    if (ids.length === 0) return '';
    if (ids.length === 1) return ids[0];
    return `(${ids.join(' OR ')})`;
  }
  return '';
}

/**
 * Find LICENSE / LICENCE / COPYING / NOTICE files in a package root.
 * Matches (case-insensitive):
 *   LICENSE, LICENCE, LICENSE.txt, LICENSE.md, LICENSE-MIT, COPYING, NOTICE
 * @returns {string[]}
 */
function findLicenseFiles(packagePath) {
  const patterns = [
    /^license(\..+)?$/i,
    /^licence(\..+)?$/i,
    /^copying(\..+)?$/i,
    /^copyright(\..+)?$/i,
    /^notice(\..+)?$/i,
    /^license-[\w.-]+$/i,
    /^licence-[\w.-]+$/i,
  ];
  let entries;
  try {
    entries = fs.readdirSync(packagePath, { withFileTypes: true });
  } catch {
    return [];
  }
  const found = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (patterns.some((r) => r.test(e.name))) {
      found.push(path.join(packagePath, e.name));
    }
  }
  return found;
}

function safeReadFile(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Parse an SPDX expression into ids and operator.
 *   "MIT"                                        -> {ids:['MIT'], operator:null}
 *   "(MIT OR Apache-2.0)"                        -> {ids:[...], operator:'OR'}
 *   "GPL-2.0-only WITH Classpath-exception-2.0"  -> {ids:['GPL-2.0-only'], operator:'WITH', exception:'Classpath-exception-2.0'}
 * @param {string} expr
 * @returns {{ids:string[], operator:string|null, exception:string|null, raw:string}}
 */
function parseSPDX(expr) {
  const result = { ids: [], operator: null, exception: null, raw: expr };
  if (!expr || typeof expr !== 'string') return result;

  let cleaned = expr.trim();
  // Strip outer parens (only if truly outer, not e.g. "(a) OR (b)")
  while (cleaned.startsWith('(') && cleaned.endsWith(')') && _outerParensWrap(cleaned)) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // First split on outermost AND/OR at depth 0 — this runs BEFORE WITH so
  // that `GPL-2.0-only WITH Classpath-exception-2.0 OR MIT` splits into
  // [`GPL-2.0-only WITH Classpath-exception-2.0`, `MIT`]
  const tokens = tokenizeSpdx(cleaned);
  if (tokens.length === 0) return result;

  const ops = new Set(['AND', 'OR']);
  const parts = [];
  let buffer = [];
  let operator = null;
  for (const t of tokens) {
    const up = t.toUpperCase();
    if (ops.has(up) && buffer.length > 0) {
      if (!operator) operator = up;
      parts.push(buffer.join(' '));
      buffer = [];
    } else {
      buffer.push(t);
    }
  }
  if (buffer.length > 0) parts.push(buffer.join(' '));

  if (parts.length === 1) {
    // Maybe it's "X WITH Y"
    const withMatch = parts[0].match(/^(.+?)\s+WITH\s+(.+)$/i);
    if (withMatch) {
      const inner = parseSPDX(withMatch[1]);
      result.ids = inner.ids;
      result.operator = 'WITH';
      result.exception = withMatch[2].trim();
      return result;
    }
    const only = parts[0].trim().replace(/^\(|\)$/g, '').trim();
    if (only) result.ids.push(only);
    return result;
  }

  for (const p of parts) {
    const trimmed = p.trim().replace(/^\(|\)$/g, '').trim();
    if (!trimmed) continue;
    if (/\s+(WITH|AND|OR)\s+/i.test(trimmed)) {
      const sub = parseSPDX(trimmed);
      result.ids.push(...sub.ids);
      if (sub.exception && !result.exception) result.exception = sub.exception;
    } else {
      result.ids.push(trimmed);
    }
  }
  result.operator = operator;
  return result;
}

/**
 * True iff the outermost `(` and `)` belong to the same pair
 * (so we can safely strip them).
 */
function _outerParensWrap(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0 && i < s.length - 1) return false;
    }
  }
  return depth === 0;
}

/** Split an SPDX expression into tokens, respecting parens. */
function tokenizeSpdx(expr) {
  const tokens = [];
  let buf = '';
  let depth = 0;
  for (let i = 0; i < expr.length; i += 1) {
    const c = expr[i];
    if (c === '(') {
      depth += 1;
      buf += c;
    } else if (c === ')') {
      depth -= 1;
      buf += c;
    } else if (/\s/.test(c) && depth === 0) {
      if (buf) {
        tokens.push(buf);
        buf = '';
      }
    } else {
      buf += c;
    }
  }
  if (buf) tokens.push(buf);
  return tokens;
}

/** Remove `WITH exception` tail and extra whitespace. */
function stripSpdxExtras(expr) {
  if (!expr || typeof expr !== 'string') return '';
  let s = expr.trim();
  while (s.startsWith('(') && s.endsWith(')')) s = s.slice(1, -1).trim();
  s = s.replace(/\s+WITH\s+[\w.-]+/i, '');
  return s.trim();
}

/** Resolve an alias to canonical SPDX id. */
function resolveAlias(id, overrides) {
  if (!id || typeof id !== 'string') return '';
  const stripped = stripSpdxExtras(id);
  const upper = stripped.toUpperCase();
  if (overrides && typeof overrides[upper] === 'string') return overrides[upper];
  if (ALIAS[upper]) return ALIAS[upper];
  // Already SPDX?
  if (SPDX_CATEGORY[stripped]) return stripped;
  // Case-insensitive lookup on SPDX table
  for (const key of Object.keys(SPDX_CATEGORY)) {
    if (key.toUpperCase() === upper) return key;
  }
  return stripped;
}

/** Hierarchy for category arithmetic. Lower index = more permissive. */
const PERMISSIVE_HIERARCHY = [
  CATEGORY.PUBLIC_DOMAIN,
  CATEGORY.PERMISSIVE,
  CATEGORY.WEAK_COPYLEFT,
  CATEGORY.STRONG_COPYLEFT,
  CATEGORY.NETWORK_COPYLEFT,
  CATEGORY.COMMERCIAL,
  CATEGORY.PROPRIETARY,
  CATEGORY.UNKNOWN,
];

function pickMostPermissive(cats) {
  let bestIdx = Infinity;
  let best = CATEGORY.UNKNOWN;
  for (const c of cats) {
    const idx = PERMISSIVE_HIERARCHY.indexOf(c);
    if (idx !== -1 && idx < bestIdx) {
      bestIdx = idx;
      best = c;
    }
  }
  return bestIdx === Infinity ? CATEGORY.UNKNOWN : best;
}

function pickMostRestrictive(cats) {
  let bestIdx = -1;
  let best = CATEGORY.UNKNOWN;
  for (const c of cats) {
    const idx = PERMISSIVE_HIERARCHY.indexOf(c);
    if (idx !== -1 && idx > bestIdx) {
      bestIdx = idx;
      best = c;
    }
  }
  return bestIdx === -1 ? CATEGORY.UNKNOWN : best;
}

// ───────────────────────────────────────────────────────────────────────
//  Fuzzy text matching
// ───────────────────────────────────────────────────────────────────────

/**
 * Normalize license text so that minor whitespace / punctuation / case
 * differences don't hurt matching.
 */
function normalizeText(s) {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find the best similarity score between `needle` and any substring of
 * `haystack` roughly the same length as `needle`. Uses normalized
 * Levenshtein distance.
 *
 * @param {string} haystack (already normalized)
 * @param {string} needle   (raw — will be normalized)
 * @returns {number} 0–1
 */
function bestSubstringSimilarity(haystack, needle) {
  const n = normalizeText(needle);
  if (!n) return 0;
  if (!haystack) return 0;
  // Exact substring short-circuit
  if (haystack.includes(n)) return 1.0;

  const step = Math.max(1, Math.floor(n.length / 4));
  const windowLen = n.length;
  let best = 0;
  for (let i = 0; i + windowLen <= haystack.length; i += step) {
    const slice = haystack.slice(i, i + windowLen);
    const sim = stringSimilarity(slice, n);
    if (sim > best) {
      best = sim;
      if (best === 1) break;
    }
  }
  // Also check final trailing window
  if (haystack.length >= windowLen) {
    const tail = haystack.slice(haystack.length - windowLen);
    const sim = stringSimilarity(tail, n);
    if (sim > best) best = sim;
  }
  return best;
}

/**
 * Normalized Levenshtein similarity between two strings.
 * Returns 0 (totally different) .. 1 (identical).
 */
function stringSimilarity(a, b) {
  if (a === b) return 1;
  const len = Math.max(a.length, b.length);
  if (len === 0) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / len;
}

/**
 * Classic Levenshtein distance with O(min(a,b)) memory.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  // Ensure a is the shorter string
  if (a.length > b.length) {
    const tmp = a;
    a = b;
    b = tmp;
  }
  const m = a.length;
  const n = b.length;
  const prev = new Array(m + 1);
  const curr = new Array(m + 1);
  for (let i = 0; i <= m; i += 1) prev[i] = i;
  for (let j = 1; j <= n; j += 1) {
    curr[0] = j;
    for (let i = 1; i <= m; i += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let v = prev[i - 1] + cost;
      if (curr[i - 1] + 1 < v) v = curr[i - 1] + 1;
      if (prev[i] + 1 < v) v = prev[i] + 1;
      curr[i] = v;
    }
    for (let i = 0; i <= m; i += 1) prev[i] = curr[i];
  }
  return prev[m];
}

// ───────────────────────────────────────────────────────────────────────
//  Output helpers
// ───────────────────────────────────────────────────────────────────────

function csvField(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function htmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ensureDir(dir) {
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
}

function sanitizeSpdxId(name) {
  return String(name || 'UNKNOWN')
    .replace(/[^A-Za-z0-9.\-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'UNKNOWN';
}

// ═══════════════════════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  LicenseScanner,
  CATEGORY,
  SPDX_CATEGORY,
  ALIAS,
  FINGERPRINTS,
  INCOMPATIBILITY_MATRIX,
  // Exposed helpers for unit-testing
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
};
