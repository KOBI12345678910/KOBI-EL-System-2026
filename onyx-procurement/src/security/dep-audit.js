/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AG-X91 — Dependency Audit + SBOM Generator
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Agent:     X91 (Supply-Chain Security)
 * Module:    onyx-procurement/src/security/dep-audit.js
 * System:    Techno-Kol Uzi ERP — ONYX Procurement
 * Date:      2026-04-11
 * Rule:      לא מוחקים רק משדרגים ומגדלים  (never delete — only upgrade / grow)
 *
 * ─── What this module does ────────────────────────────────────────────────
 * Zero-dependency auditor that:
 *   1. Parses `package-lock.json` in v1, v2, or v3 format
 *   2. Walks an on-disk `node_modules/` tree and extracts name@version
 *   3. Matches installed versions against an injected OSV-format advisory DB
 *      (using a semver range evaluator implemented from scratch — supports
 *      ^, ~, *, >=, >, <=, <, =, ||, ` - ` hyphen ranges, X-ranges, and
 *      the special ^0.x / ^0.0.x rules from the semver spec)
 *   4. Emits a Software Bill of Materials in CycloneDX-1.5 or SPDX-2.3 JSON
 *   5. Reports findings by severity (critical / high / medium / low)
 *   6. Suggests fixes (patch / minor delta upgrades)
 *   7. Flags GPL / AGPL / SSPL licenses for commercial projects
 *   8. Exports SARIF 2.1.0 for GitHub code scanning
 *
 * ─── Zero-dependency constraint ───────────────────────────────────────────
 * This module may only use Node's core modules:
 *     `fs`, `path`, `crypto`, `url`
 * No `semver`, no `ajv`, no `sarif-sdk`. Everything is hand-rolled so that
 * this file keeps working even when the supply chain we are auditing is
 * compromised.
 *
 * ─── Never-delete discipline ──────────────────────────────────────────────
 * The audit process MUST NOT remove any package, file, or lockfile entry.
 * It only reports, suggests, and exports. Actual upgrades are performed by
 * the operator in a separate controlled step (see OPS_RUNBOOK.md §12).
 *
 * ─── Public API ───────────────────────────────────────────────────────────
 *   const { DepAudit } = require('./dep-audit');
 *   const audit = new DepAudit({ projectName, projectVersion, commercial });
 *   audit.scanLockfile('./package-lock.json');
 *   audit.scanNodeModules('./node_modules');
 *   audit.checkAdvisories({ advisoryDB });       // OSV-format array
 *   audit.detectLicenseIssues();
 *   audit.reportCritical();                      // → Finding[]
 *   audit.reportHigh();                          // → Finding[]
 *   audit.reportMedium();                        // → Finding[]
 *   audit.reportLow();                           // → Finding[]
 *   audit.fixSuggestions();                      // → FixSuggestion[]
 *   audit.generateSBOM({ format: 'cyclonedx-json' });
 *   audit.generateSBOM({ format: 'spdx-json' });
 *   audit.exportSARIF();
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ─────────────────────────────────────────────────────────────────────────
 * SECTION 1 — Semver primitives (parser + comparator + range evaluator)
 * ─────────────────────────────────────────────────────────────────────────
 * Implemented from scratch per RFC: https://semver.org/ v2.0.0
 * and npm semver range grammar. We support the practical subset that
 * appears in real-world package-lock.json files.
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Parse a semantic version string into {major, minor, patch, prerelease, build}.
 * Returns null if the string is not a valid semver 2.0.0 version.
 *
 * @param {string} v  e.g. "1.2.3", "1.2.3-alpha.1+build.7", "v1.2.3"
 * @returns {{major:number,minor:number,patch:number,prerelease:string[],build:string[]}|null}
 */
function parseVersion(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/^v/i, '');
  // main regex — SemVer 2.0.0
  const re = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  const m = s.match(re);
  if (!m) return null;
  return {
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
    patch: parseInt(m[3], 10),
    prerelease: m[4] ? m[4].split('.') : [],
    build: m[5] ? m[5].split('.') : [],
  };
}

/**
 * Compare two parsed versions.  Returns -1, 0, or 1.
 * Implements the precedence rules from SemVer 2.0.0 §11.
 *   - Major → Minor → Patch compared numerically
 *   - A version with a prerelease has *lower* precedence than without
 *   - Prerelease identifiers compared left-to-right, numeric < alpha
 */
function compareVersions(a, b) {
  if (a === null || b === null) {
    if (a === b) return 0;
    return a === null ? -1 : 1;
  }
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  // Prerelease precedence: no-pre > any-pre
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;
  const len = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < len; i++) {
    const ai = a.prerelease[i];
    const bi = b.prerelease[i];
    if (ai === undefined) return -1;
    if (bi === undefined) return 1;
    const aNum = /^\d+$/.test(ai);
    const bNum = /^\d+$/.test(bi);
    if (aNum && bNum) {
      const an = parseInt(ai, 10);
      const bn = parseInt(bi, 10);
      if (an !== bn) return an < bn ? -1 : 1;
    } else if (aNum && !bNum) {
      return -1; // numeric < alpha
    } else if (!aNum && bNum) {
      return 1;
    } else {
      if (ai !== bi) return ai < bi ? -1 : 1;
    }
  }
  return 0;
}

function cmpStr(aStr, bStr) {
  const a = parseVersion(aStr);
  const b = parseVersion(bStr);
  return compareVersions(a, b);
}

/**
 * Expand an X-range / partial version to a concrete comparator pair.
 *   "1"       → >=1.0.0  <2.0.0
 *   "1.2"     → >=1.2.0  <1.3.0
 *   "1.2.x"   → >=1.2.0  <1.3.0
 *   "*"       → >=0.0.0  (no upper)
 *
 * Returns {low, high} where each is {op,version} or null for "no bound".
 */
function expandXRange(str) {
  const trimmed = str.trim();
  if (trimmed === '' || trimmed === '*' || /^x(\.x(\.x)?)?$/i.test(trimmed)) {
    return { low: { op: '>=', version: '0.0.0' }, high: null };
  }
  const parts = trimmed.split('.');
  // Substitute 'x' / 'X' / '*' with the appropriate zero
  const hasMinor = parts.length >= 2 && parts[1] !== undefined;
  const hasPatch = parts.length >= 3 && parts[2] !== undefined;
  const major = parts[0];
  const minor = hasMinor ? parts[1] : 'x';
  const patch = hasPatch ? parts[2] : 'x';
  const isX = (t) => t === 'x' || t === 'X' || t === '*' || t === undefined;

  if (isX(major)) return { low: { op: '>=', version: '0.0.0' }, high: null };
  if (isX(minor)) {
    // e.g. "1" or "1.x"
    const m = parseInt(major, 10);
    return {
      low: { op: '>=', version: `${m}.0.0` },
      high: { op: '<', version: `${m + 1}.0.0` },
    };
  }
  if (isX(patch)) {
    // e.g. "1.2" or "1.2.x"
    const m = parseInt(major, 10);
    const n = parseInt(minor, 10);
    return {
      low: { op: '>=', version: `${m}.${n}.0` },
      high: { op: '<', version: `${m}.${n + 1}.0` },
    };
  }
  // Fully specified — exact match
  return {
    low: { op: '>=', version: `${major}.${minor}.${patch}` },
    high: { op: '<=', version: `${major}.${minor}.${patch}` },
  };
}

/**
 * Expand a tilde range: tilde allows patch-level changes if minor is
 * specified, otherwise minor-level changes.
 *   ~1.2.3   → >=1.2.3 <1.3.0
 *   ~1.2     → >=1.2.0 <1.3.0
 *   ~1       → >=1.0.0 <2.0.0
 *   ~0.2.3   → >=0.2.3 <0.3.0
 */
function expandTilde(str) {
  const trimmed = str.replace(/^~/, '').trim();
  const parts = trimmed.split(/[.\-+]/);
  const m = parseInt(parts[0], 10);
  const n = parts[1] !== undefined ? parseInt(parts[1], 10) : null;
  const p = parts[2] !== undefined ? parseInt(parts[2], 10) : null;
  if (n === null) {
    // ~1  → >=1.0.0 <2.0.0
    return {
      low: { op: '>=', version: `${m}.0.0` },
      high: { op: '<', version: `${m + 1}.0.0` },
    };
  }
  // ~1.2 or ~1.2.3 → >=1.2.(p||0) <1.3.0
  return {
    low: { op: '>=', version: `${m}.${n}.${p || 0}` },
    high: { op: '<', version: `${m}.${n + 1}.0` },
  };
}

/**
 * Expand a caret range. The caret is the tricky one because of the 0.x rule:
 *   ^1.2.3   → >=1.2.3 <2.0.0
 *   ^0.2.3   → >=0.2.3 <0.3.0    (minor bump is a breaking change when major===0)
 *   ^0.0.3   → >=0.0.3 <0.0.4    (patch bump is a breaking change when major===0 && minor===0)
 *   ^1.2.x   → >=1.2.0 <2.0.0
 *   ^0.0     → >=0.0.0 <0.1.0
 *   ^1       → >=1.0.0 <2.0.0
 */
function expandCaret(str) {
  const trimmed = str.replace(/^\^/, '').trim();
  // Split off any prerelease / build
  const core = trimmed.split(/[-+]/)[0];
  const parts = core.split('.');
  const isX = (t) => t === undefined || t === 'x' || t === 'X' || t === '*';
  let m, n, p;
  if (isX(parts[0])) return { low: { op: '>=', version: '0.0.0' }, high: null };
  m = parseInt(parts[0], 10);
  n = isX(parts[1]) ? null : parseInt(parts[1], 10);
  p = isX(parts[2]) ? null : parseInt(parts[2], 10);
  // Re-attach prerelease tag to the lower bound if present
  const preSuffix = trimmed.includes('-')
    ? '-' + trimmed.slice(trimmed.indexOf('-') + 1)
    : '';

  if (m > 0) {
    return {
      low: { op: '>=', version: `${m}.${n || 0}.${p || 0}${preSuffix}` },
      high: { op: '<', version: `${m + 1}.0.0` },
    };
  }
  // m === 0
  if (n === null) {
    // ^0  → >=0.0.0 <1.0.0
    return {
      low: { op: '>=', version: '0.0.0' },
      high: { op: '<', version: '1.0.0' },
    };
  }
  if (n > 0) {
    // ^0.2.3 → >=0.2.3 <0.3.0
    return {
      low: { op: '>=', version: `0.${n}.${p || 0}${preSuffix}` },
      high: { op: '<', version: `0.${n + 1}.0` },
    };
  }
  // n === 0
  if (p === null) {
    return {
      low: { op: '>=', version: '0.0.0' },
      high: { op: '<', version: '0.1.0' },
    };
  }
  // ^0.0.3 → >=0.0.3 <0.0.4
  return {
    low: { op: '>=', version: `0.0.${p}${preSuffix}` },
    high: { op: '<', version: `0.0.${p + 1}` },
  };
}

/**
 * Expand a hyphen range "1.2.3 - 2.3.4" → >=1.2.3 <=2.3.4
 * The right side may be partial, in which case we upgrade to an exclusive
 * upper bound at the next segment.
 */
function expandHyphen(str) {
  const m = str.split(/\s+-\s+/);
  const leftRaw = m[0].trim();
  const rightRaw = m[1].trim();

  // Left side: pad missing fields with 0
  const lparts = leftRaw.split('.');
  const lLow = `${lparts[0]}.${lparts[1] || 0}.${lparts[2] || 0}`;
  // Right side: if fully specified use <=, otherwise upgrade to exclusive
  const rparts = rightRaw.split('.');
  if (rparts.length === 3 && !/^[xX*]$/.test(rparts[2])) {
    return {
      low: { op: '>=', version: lLow },
      high: { op: '<=', version: `${rparts[0]}.${rparts[1]}.${rparts[2]}` },
    };
  }
  if (rparts.length === 2) {
    const rm = parseInt(rparts[0], 10);
    const rn = parseInt(rparts[1], 10);
    return {
      low: { op: '>=', version: lLow },
      high: { op: '<', version: `${rm}.${rn + 1}.0` },
    };
  }
  if (rparts.length === 1) {
    const rm = parseInt(rparts[0], 10);
    return {
      low: { op: '>=', version: lLow },
      high: { op: '<', version: `${rm + 1}.0.0` },
    };
  }
  // fallback: exact upper
  return {
    low: { op: '>=', version: lLow },
    high: { op: '<=', version: rightRaw },
  };
}

/**
 * Parse a single comparator set (no `||`) into an array of {op, version}.
 * Handles operator-prefixed comparators (>=1.2.3), tilde (~1.2), caret
 * (^1.2), X-ranges (1.2.x), hyphen (1.2.3 - 2.3.4), bare versions, and
 * wildcards.
 */
function parseComparatorSet(raw) {
  const str = raw.trim();
  if (!str) return [{ op: '>=', version: '0.0.0' }];

  // Hyphen range (has " - " in it)
  if (/\s+-\s+/.test(str)) {
    const r = expandHyphen(str);
    const out = [];
    if (r.low) out.push(r.low);
    if (r.high) out.push(r.high);
    return out;
  }

  // Split on whitespace — each token is its own comparator (implicit AND)
  const tokens = str.split(/\s+/).filter(Boolean);
  const out = [];
  for (const tok of tokens) {
    if (tok === '*' || /^[xX]$/.test(tok)) {
      out.push({ op: '>=', version: '0.0.0' });
      continue;
    }
    if (tok.startsWith('^')) {
      const e = expandCaret(tok);
      if (e.low) out.push(e.low);
      if (e.high) out.push(e.high);
      continue;
    }
    if (tok.startsWith('~')) {
      const e = expandTilde(tok);
      if (e.low) out.push(e.low);
      if (e.high) out.push(e.high);
      continue;
    }
    // Operator-prefixed: >=, <=, >, <, =
    let op = '=';
    let ver = tok;
    const opMatch = tok.match(/^(>=|<=|>|<|=)(.+)$/);
    if (opMatch) {
      op = opMatch[1];
      ver = opMatch[2];
    }
    // X-ranges inside bare / operator-prefixed
    if (/[xX*]/.test(ver) || ver.split('.').length < 3) {
      const e = expandXRange(ver);
      if (op === '=' || op === '>=') {
        if (e.low) out.push(e.low);
        if (e.high) out.push(e.high);
      } else {
        // >, <, <= on a partial version — use the expanded low as the pivot
        out.push({ op, version: (e.low && e.low.version) || '0.0.0' });
      }
      continue;
    }
    out.push({ op, version: ver });
  }
  return out;
}

/**
 * Parse a full range string possibly containing `||` into an array of
 * comparator sets.  Matching any one set → true.
 */
function parseRange(range) {
  if (range === undefined || range === null) return [[{ op: '>=', version: '0.0.0' }]];
  const str = String(range).trim();
  if (str === '' || str === '*' || /^latest$/i.test(str)) {
    return [[{ op: '>=', version: '0.0.0' }]];
  }
  return str.split(/\s*\|\|\s*/).map(parseComparatorSet);
}

/**
 * Test whether a single version satisfies a single comparator {op,version}.
 * The version argument is already-parsed.
 */
function testComparator(parsedVersion, comparator) {
  const target = parseVersion(comparator.version);
  if (!target || !parsedVersion) return false;
  const cmp = compareVersions(parsedVersion, target);

  // SemVer range prerelease rule: a version with a prerelease only satisfies
  // a comparator set if at least one comparator in the set has the same
  // [major,minor,patch] tuple with a prerelease tag. We approximate this
  // rule in satisfies() below by checking the raw range string.

  switch (comparator.op) {
    case '=':
      return cmp === 0;
    case '>':
      return cmp > 0;
    case '>=':
      return cmp >= 0;
    case '<':
      return cmp < 0;
    case '<=':
      return cmp <= 0;
    default:
      return false;
  }
}

/**
 * Top-level `satisfies` — the function every caller wants.
 *
 * @param {string} version    e.g. "1.2.3"
 * @param {string} range      e.g. "^1.0.0 || >=2.0.0 <3.0.0"
 * @returns {boolean}
 */
function satisfies(version, range) {
  const parsed = parseVersion(version);
  if (!parsed) return false;
  const sets = parseRange(range);
  // Prerelease tightening: if the candidate has a prerelease tag we require
  // the range to *mention* the same M.m.p, otherwise we reject. This is
  // what the npm semver library does and avoids surprising matches like
  // "2.0.0-alpha" satisfying "^1.0.0".
  if (parsed.prerelease.length > 0) {
    const rangeStr = String(range);
    const sameBase = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
    if (!rangeStr.includes(sameBase)) return false;
  }
  for (const set of sets) {
    let allOk = true;
    for (const cmp of set) {
      if (!testComparator(parsed, cmp)) {
        allOk = false;
        break;
      }
    }
    if (allOk) return true;
  }
  return false;
}

/* ─────────────────────────────────────────────────────────────────────────
 * SECTION 2 — OSV range evaluator
 * ─────────────────────────────────────────────────────────────────────────
 * OSV vulnerabilities use an event-list format under affected[].ranges[].
 * Each range is a sequence of events: {introduced:"0"}, {fixed:"1.2.3"},
 * {introduced:"1.5.0"}, {fixed:"1.5.2"}, ... A version is affected if,
 * when you walk the timeline, you are inside an "introduced-but-not-fixed"
 * window at that version.
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Evaluate whether a version is affected by an OSV range.
 *
 * @param {string} version
 * @param {{type:string,events:Array<{introduced?:string,fixed?:string,last_affected?:string}>}} range
 * @returns {boolean}
 */
function osvRangeAffects(version, range) {
  if (!range || !Array.isArray(range.events)) return false;
  // Normalize events into a sorted timeline. For SEMVER ranges the events
  // come in order; we re-sort defensively.
  const v = parseVersion(version);
  if (!v) return false;

  // OSV spec: walk events in order; track "inside" flag.
  // When you encounter an "introduced" event with version X and v >= X,
  // move inside. When you encounter "fixed" with version X and v >= X,
  // move outside. `last_affected` means "outside" once v > X.
  let inside = false;
  const sorted = range.events.slice().sort((a, b) => {
    const aKey = a.introduced || a.fixed || a.last_affected || '0';
    const bKey = b.introduced || b.fixed || b.last_affected || '0';
    if (aKey === '0') return -1;
    if (bKey === '0') return 1;
    return cmpStr(aKey, bKey);
  });
  for (const ev of sorted) {
    if (ev.introduced !== undefined) {
      // "0" means "from the beginning"
      if (ev.introduced === '0' || cmpStr(version, ev.introduced) >= 0) {
        inside = true;
      }
    } else if (ev.fixed !== undefined) {
      if (cmpStr(version, ev.fixed) >= 0) {
        inside = false;
      }
    } else if (ev.last_affected !== undefined) {
      if (cmpStr(version, ev.last_affected) > 0) {
        inside = false;
      }
    }
  }
  return inside;
}

/* ─────────────────────────────────────────────────────────────────────────
 * SECTION 3 — License policy
 * ─────────────────────────────────────────────────────────────────────────
 * Copyleft license families to flag on commercial projects. We use the
 * SPDX short identifiers. Lists are append-only (never-delete rule) —
 * new entries may be added in future agents.
 * ────────────────────────────────────────────────────────────────────── */

const COPYLEFT_DENY = Object.freeze([
  'GPL-1.0',
  'GPL-1.0-only',
  'GPL-1.0-or-later',
  'GPL-2.0',
  'GPL-2.0-only',
  'GPL-2.0-or-later',
  'GPL-3.0',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'AGPL-1.0',
  'AGPL-1.0-only',
  'AGPL-1.0-or-later',
  'AGPL-3.0',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  'SSPL-1.0',
  'LGPL-2.0',
  'LGPL-2.0-only',
  'LGPL-2.0-or-later',
  'LGPL-2.1',
  'LGPL-2.1-only',
  'LGPL-2.1-or-later',
  'LGPL-3.0',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
  'CC-BY-NC-1.0',
  'CC-BY-NC-2.0',
  'CC-BY-NC-2.5',
  'CC-BY-NC-3.0',
  'CC-BY-NC-4.0',
  'Commons-Clause',
  'BUSL-1.1',
]);

const COPYLEFT_DENY_SET = new Set(COPYLEFT_DENY);

/**
 * Normalize a license field (may be string, {type:'MIT'}, array, or SPDX
 * expression like "(MIT OR Apache-2.0)") into a sorted array of SPDX ids.
 */
function normalizeLicense(lic) {
  if (!lic) return [];
  if (typeof lic === 'string') {
    // SPDX expression: strip parens, split on OR / AND / WITH
    const cleaned = lic.replace(/[()]/g, '').trim();
    const ids = cleaned.split(/\s+(?:OR|AND|WITH)\s+/i).map((s) => s.trim()).filter(Boolean);
    return ids;
  }
  if (Array.isArray(lic)) {
    const out = [];
    for (const entry of lic) {
      out.push(...normalizeLicense(entry));
    }
    return out;
  }
  if (typeof lic === 'object') {
    if (lic.type) return normalizeLicense(lic.type);
    if (lic.id) return normalizeLicense(lic.id);
  }
  return [];
}

/**
 * Determine whether a license set contains any copyleft-denied entry.
 */
function isDenied(licenses) {
  for (const id of licenses) {
    if (COPYLEFT_DENY_SET.has(id)) return true;
    // Also match GPL-like prefixes without a version suffix
    if (/^(A?GPL|LGPL|SSPL)\b/i.test(id)) return true;
  }
  return false;
}

/* ─────────────────────────────────────────────────────────────────────────
 * SECTION 4 — Helpers: severity ordering, tarball hashing, path utils
 * ─────────────────────────────────────────────────────────────────────── */

const SEVERITY_ORDER = Object.freeze(['critical', 'high', 'medium', 'low', 'none']);

function normalizeSeverity(s) {
  if (!s) return 'none';
  const str = String(s).toLowerCase().trim();
  if (str === 'crit' || str === 'critical') return 'critical';
  if (str === 'hi' || str === 'high') return 'high';
  if (str === 'med' || str === 'medium' || str === 'moderate') return 'medium';
  if (str === 'lo' || str === 'low') return 'low';
  return 'none';
}

function severityFromCVSS(score) {
  if (typeof score !== 'number' || Number.isNaN(score)) return 'none';
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  if (score > 0) return 'low';
  return 'none';
}

/**
 * Convert an npm package-lock integrity string (sha512-... / sha1-...) into
 * a CycloneDX / SPDX-compatible hash object array.
 */
function integrityToHashes(integrity) {
  if (!integrity || typeof integrity !== 'string') return [];
  const out = [];
  for (const item of integrity.split(/\s+/)) {
    const idx = item.indexOf('-');
    if (idx < 0) continue;
    const algo = item.slice(0, idx);
    const b64 = item.slice(idx + 1);
    let alg = '';
    if (/^sha1$/i.test(algo)) alg = 'SHA-1';
    else if (/^sha256$/i.test(algo)) alg = 'SHA-256';
    else if (/^sha384$/i.test(algo)) alg = 'SHA-384';
    else if (/^sha512$/i.test(algo)) alg = 'SHA-512';
    else alg = algo.toUpperCase();
    let hex = b64;
    try {
      hex = Buffer.from(b64, 'base64').toString('hex');
    } catch (_e) {
      /* keep raw */
    }
    out.push({ alg, content: hex });
  }
  return out;
}

/**
 * Derive the package name from a package-lock.json v2/v3 key like
 * "node_modules/lodash" or "node_modules/@scope/pkg/node_modules/dep".
 * We always take the LAST "node_modules/<name>" segment.
 */
function keyToName(key) {
  if (!key) return '';
  const parts = key.split('node_modules/');
  const tail = parts[parts.length - 1];
  // handle scoped packages "@scope/pkg"
  if (tail.startsWith('@')) {
    const slash = tail.indexOf('/');
    if (slash < 0) return tail;
    const rest = tail.slice(slash + 1);
    const restSlash = rest.indexOf('/');
    return restSlash < 0 ? tail : tail.slice(0, slash + 1 + restSlash);
  }
  const slash = tail.indexOf('/');
  return slash < 0 ? tail : tail.slice(0, slash);
}

/* ─────────────────────────────────────────────────────────────────────────
 * SECTION 5 — The DepAudit class
 * ─────────────────────────────────────────────────────────────────────── */

class DepAudit {
  /**
   * @param {object} [opts]
   * @param {string} [opts.projectName='onyx-procurement']
   * @param {string} [opts.projectVersion='0.0.0']
   * @param {boolean} [opts.commercial=true]   — true flips the GPL/AGPL policy on
   * @param {string} [opts.authors='Techno-Kol Uzi']
   */
  constructor(opts) {
    const o = opts || {};
    this.projectName = o.projectName || 'onyx-procurement';
    this.projectVersion = o.projectVersion || '0.0.0';
    this.commercial = o.commercial !== undefined ? !!o.commercial : true;
    this.authors = o.authors || 'Techno-Kol Uzi';

    /** @type {Map<string, PackageEntry>} key = "name@version" */
    this.packages = new Map();
    /** @type {Set<string>} names that appear as direct dependencies */
    this.direct = new Set();
    /** @type {Finding[]} */
    this.findings = [];
    /** @type {LicenseIssue[]} */
    this.licenseIssues = [];
    /** @type {Array<{name:string,version:string,latestKnown:string|null}>} */
    this.fixes = [];
  }

  /* ───────────────────────── Lockfile parsing ─────────────────────────── */

  /**
   * Parse a package-lock.json (v1, v2, or v3).  Populates `this.packages`
   * and `this.direct`.
   *
   * @param {string} lockPath  absolute or cwd-relative path to lockfile
   * @returns {{count:number, version:number, direct:number}}
   */
  scanLockfile(lockPath) {
    if (!lockPath) throw new Error('scanLockfile: lockPath required');
    const raw = fs.readFileSync(lockPath, 'utf8');
    let lock;
    try {
      lock = JSON.parse(raw);
    } catch (e) {
      throw new Error(`scanLockfile: invalid JSON in ${lockPath}: ${e.message}`);
    }
    return this.ingestLockfile(lock);
  }

  /**
   * Ingest an already-parsed lockfile object. Exposed for testability.
   */
  ingestLockfile(lock) {
    const lockfileVersion = lock.lockfileVersion || 1;
    let count = 0;
    let directCount = 0;

    // Record direct deps from root-level `dependencies` / `packages[""]`
    if (lock.packages && lock.packages['']) {
      const root = lock.packages[''];
      for (const sec of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        if (root[sec]) {
          for (const n of Object.keys(root[sec])) {
            this.direct.add(n);
            directCount++;
          }
        }
      }
    }
    if (lock.dependencies && (!lock.packages || !lock.packages[''])) {
      // v1 lockfile — the top-level `dependencies` map *is* the direct set
      // (nested children inside it are transitive).
      for (const n of Object.keys(lock.dependencies)) {
        this.direct.add(n);
        directCount++;
      }
    }

    // v2 / v3: walk `packages` object. v3 is deduped (hoisted) but the
    // traversal is identical.
    if (lock.packages) {
      for (const key of Object.keys(lock.packages)) {
        if (key === '') continue; // root itself
        const entry = lock.packages[key];
        const name = entry.name || keyToName(key);
        if (!name) continue;
        const version = entry.version;
        if (!version) continue;
        this.addPackage({
          name,
          version,
          integrity: entry.integrity || null,
          resolved: entry.resolved || null,
          license: entry.license || entry.licenses || null,
          dev: !!entry.dev,
          optional: !!entry.optional,
          path: key,
          source: 'lockfile',
          lockfileVersion,
        });
        count++;
      }
    }

    // v1 fallback: walk nested `dependencies` tree recursively.
    if ((!lock.packages || Object.keys(lock.packages).length === 0) && lock.dependencies) {
      const walk = (deps, parentPath) => {
        for (const depName of Object.keys(deps)) {
          const d = deps[depName];
          if (!d || !d.version) continue;
          this.addPackage({
            name: depName,
            version: d.version,
            integrity: d.integrity || null,
            resolved: d.resolved || null,
            license: d.license || null,
            dev: !!d.dev,
            optional: !!d.optional,
            path: parentPath + '/node_modules/' + depName,
            source: 'lockfile',
            lockfileVersion,
          });
          count++;
          if (d.dependencies) walk(d.dependencies, parentPath + '/node_modules/' + depName);
        }
      };
      walk(lock.dependencies, '');
    }

    return { count, version: lockfileVersion, direct: directCount };
  }

  /* ────────────────────── node_modules walker ─────────────────────────── */

  /**
   * Walk a node_modules directory, read each nested `package.json`, and
   * record every `name@version` found. This is the fallback when no
   * lockfile exists.
   */
  scanNodeModules(rootPath) {
    if (!rootPath) throw new Error('scanNodeModules: rootPath required');
    if (!fs.existsSync(rootPath)) {
      throw new Error(`scanNodeModules: path not found: ${rootPath}`);
    }
    let count = 0;
    const visited = new Set();

    const walk = (dir) => {
      if (visited.has(dir)) return;
      visited.add(dir);
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (_e) {
        return;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === '.bin' || entry.name === '.cache' || entry.name === '.package-lock.json') continue;
        const full = path.join(dir, entry.name);
        if (entry.name.startsWith('@')) {
          // scoped package — descend one more level
          let scoped;
          try {
            scoped = fs.readdirSync(full, { withFileTypes: true });
          } catch (_e) {
            continue;
          }
          for (const s of scoped) {
            if (!s.isDirectory()) continue;
            const sFull = path.join(full, s.name);
            this._readPkgJsonAt(sFull);
            count++;
            const inner = path.join(sFull, 'node_modules');
            if (fs.existsSync(inner)) walk(inner);
          }
          continue;
        }
        this._readPkgJsonAt(full);
        count++;
        const inner = path.join(full, 'node_modules');
        if (fs.existsSync(inner)) walk(inner);
      }
    };

    walk(rootPath);
    return { count };
  }

  _readPkgJsonAt(dirFull) {
    const pj = path.join(dirFull, 'package.json');
    if (!fs.existsSync(pj)) return;
    let obj;
    try {
      obj = JSON.parse(fs.readFileSync(pj, 'utf8'));
    } catch (_e) {
      return;
    }
    if (!obj.name || !obj.version) return;
    this.addPackage({
      name: obj.name,
      version: obj.version,
      integrity: null,
      resolved: obj._resolved || null,
      license: obj.license || obj.licenses || null,
      dev: false,
      optional: false,
      path: dirFull,
      source: 'node_modules',
      lockfileVersion: null,
    });
  }

  /**
   * Internal: merge a package record into `this.packages`. Never deletes
   * an existing entry — if a key collides we keep the first-seen and add a
   * path alias for the second. This preserves the "never delete" rule
   * while still supporting lockfile v3 deduping.
   */
  addPackage(rec) {
    const key = `${rec.name}@${rec.version}`;
    const existing = this.packages.get(key);
    if (existing) {
      existing.paths.push(rec.path);
      // merge integrity if previously null
      if (!existing.integrity && rec.integrity) existing.integrity = rec.integrity;
      // merge license if previously null
      if (!existing.licenses.length) {
        existing.licenses = normalizeLicense(rec.license);
      }
      return existing;
    }
    const entry = {
      name: rec.name,
      version: rec.version,
      integrity: rec.integrity,
      resolved: rec.resolved,
      licenses: normalizeLicense(rec.license),
      dev: rec.dev,
      optional: rec.optional,
      paths: [rec.path],
      source: rec.source,
      lockfileVersion: rec.lockfileVersion,
    };
    this.packages.set(key, entry);
    return entry;
  }

  /* ─────────────────────── Advisory matching ──────────────────────────── */

  /**
   * Match installed packages against an OSV-format advisory DB.  Expected
   * shape for each entry:
   *
   *   {
   *     id: 'GHSA-xxxx-yyyy-zzzz',
   *     summary: '...',
   *     details: '...',
   *     severity: [{type:'CVSS_V3',score:'CVSS:3.1/.../7.5'}]  // optional
   *     database_specific: { severity: 'HIGH' },                // optional
   *     affected: [
   *       {
   *         package: { ecosystem: 'npm', name: 'lodash' },
   *         ranges: [{ type: 'SEMVER', events: [{introduced:'0'},{fixed:'4.17.21'}] }]
   *       }
   *     ],
   *     references: [...]
   *   }
   *
   * @param {{advisoryDB:Array<object>}} input
   * @returns {Finding[]} same as this.findings
   */
  checkAdvisories(input) {
    const db = (input && input.advisoryDB) || [];
    if (!Array.isArray(db)) {
      throw new Error('checkAdvisories: advisoryDB must be an array');
    }
    // Build a name-indexed bucket for fast lookup
    const byName = new Map();
    for (const adv of db) {
      if (!adv || !Array.isArray(adv.affected)) continue;
      for (const a of adv.affected) {
        const name = a && a.package && a.package.name;
        const eco = a && a.package && a.package.ecosystem;
        if (!name) continue;
        if (eco && eco.toLowerCase() !== 'npm') continue;
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push({ adv, affected: a });
      }
    }

    for (const pkg of this.packages.values()) {
      const buckets = byName.get(pkg.name);
      if (!buckets) continue;
      for (const b of buckets) {
        if (this._isAffected(pkg.version, b.affected)) {
          const sev = this._deriveSeverity(b.adv);
          this.findings.push({
            id: b.adv.id || '(unknown)',
            package: pkg.name,
            version: pkg.version,
            severity: sev,
            cvss: this._extractCVSS(b.adv),
            summary: b.adv.summary || '(no summary)',
            details: b.adv.details || null,
            fixed: this._earliestFixed(b.affected),
            direct: this.direct.has(pkg.name),
            references: (b.adv.references || []).map((r) => r.url || r),
          });
        }
      }
    }
    // Sort findings critical → low
    this.findings.sort((a, b) => {
      const ai = SEVERITY_ORDER.indexOf(a.severity);
      const bi = SEVERITY_ORDER.indexOf(b.severity);
      if (ai !== bi) return ai - bi;
      return a.package.localeCompare(b.package);
    });
    return this.findings;
  }

  _isAffected(version, affected) {
    // Strategy:
    //   1. If `versions` array is present, exact match.
    //   2. If `ranges` contain SEMVER ranges, walk events.
    //   3. If ranges contain ECOSYSTEM ranges (npm style `>=1.0 <2.0`),
    //      fall back to satisfies().
    if (Array.isArray(affected.versions) && affected.versions.indexOf(version) !== -1) {
      return true;
    }
    if (Array.isArray(affected.ranges)) {
      for (const r of affected.ranges) {
        const type = (r.type || '').toUpperCase();
        if (type === 'SEMVER' || type === '' || type === 'GIT') {
          if (osvRangeAffects(version, r)) return true;
        } else if (type === 'ECOSYSTEM') {
          // Try OSV events first, then fall back to range-string form
          if (osvRangeAffects(version, r)) return true;
          if (r.range && satisfies(version, r.range)) return true;
        }
      }
    }
    return false;
  }

  _deriveSeverity(adv) {
    if (adv.database_specific && adv.database_specific.severity) {
      return normalizeSeverity(adv.database_specific.severity);
    }
    if (Array.isArray(adv.severity)) {
      for (const s of adv.severity) {
        if (!s) continue;
        if (typeof s.score === 'number') return severityFromCVSS(s.score);
        if (typeof s.score === 'string') {
          const m = s.score.match(/([0-9]+(?:\.[0-9]+)?)/);
          if (m) return severityFromCVSS(parseFloat(m[1]));
        }
      }
    }
    return 'none';
  }

  _extractCVSS(adv) {
    if (!Array.isArray(adv.severity)) return null;
    for (const s of adv.severity) {
      if (s && s.score !== undefined) {
        if (typeof s.score === 'number') return s.score;
        if (typeof s.score === 'string') {
          const m = s.score.match(/([0-9]+(?:\.[0-9]+)?)/);
          if (m) return parseFloat(m[1]);
        }
      }
    }
    return null;
  }

  _earliestFixed(affected) {
    if (!Array.isArray(affected.ranges)) return null;
    let best = null;
    for (const r of affected.ranges) {
      if (!Array.isArray(r.events)) continue;
      for (const ev of r.events) {
        if (ev.fixed) {
          if (!best || cmpStr(ev.fixed, best) < 0) best = ev.fixed;
        }
      }
    }
    return best;
  }

  /* ───────────────────────── Reporting ────────────────────────────────── */

  reportCritical() {
    return this.findings.filter((f) => f.severity === 'critical');
  }
  reportHigh() {
    return this.findings.filter((f) => f.severity === 'high');
  }
  reportMedium() {
    return this.findings.filter((f) => f.severity === 'medium');
  }
  reportLow() {
    return this.findings.filter((f) => f.severity === 'low');
  }

  /**
   * Group findings by severity into a single summary object (useful for
   * logging or a dashboard).
   */
  summary() {
    return {
      project: this.projectName,
      version: this.projectVersion,
      total_packages: this.packages.size,
      direct_packages: this.direct.size,
      transitive_packages: Math.max(0, this.packages.size - this.direct.size),
      critical: this.reportCritical().length,
      high: this.reportHigh().length,
      medium: this.reportMedium().length,
      low: this.reportLow().length,
      license_issues: this.licenseIssues.length,
      generated_at: new Date().toISOString(),
    };
  }

  /* ───────────────────── Fix suggestions ──────────────────────────────── */

  /**
   * For each finding, suggest the smallest upgrade that exits the vulnerable
   * range. Delta is classified as patch / minor / major.
   *
   * @returns {Array<{package, currentVersion, suggestedVersion, deltaType, findingId, severity, direct}>}
   */
  fixSuggestions() {
    const out = [];
    for (const f of this.findings) {
      if (!f.fixed) continue;
      const cur = parseVersion(f.version);
      const sug = parseVersion(f.fixed);
      if (!cur || !sug) continue;
      let delta = 'none';
      if (sug.major !== cur.major) delta = 'major';
      else if (sug.minor !== cur.minor) delta = 'minor';
      else if (sug.patch !== cur.patch) delta = 'patch';
      out.push({
        package: f.package,
        currentVersion: f.version,
        suggestedVersion: f.fixed,
        deltaType: delta,
        findingId: f.id,
        severity: f.severity,
        direct: f.direct,
      });
    }
    this.fixes = out;
    return out;
  }

  /* ───────────────────── License scanning ─────────────────────────────── */

  /**
   * Flag every installed package whose license matches COPYLEFT_DENY when
   * the project is marked commercial.
   */
  detectLicenseIssues() {
    this.licenseIssues = [];
    if (!this.commercial) return this.licenseIssues;
    for (const pkg of this.packages.values()) {
      if (!pkg.licenses || pkg.licenses.length === 0) {
        // unknown license on a commercial project is a medium issue
        this.licenseIssues.push({
          package: pkg.name,
          version: pkg.version,
          license: '(unknown)',
          severity: 'medium',
          reason: 'No license field found — commercial projects must vet unknown licenses',
          reason_he: 'אין שדה רישיון — יש לוודא רישיון לפני שימוש מסחרי',
          direct: this.direct.has(pkg.name),
        });
        continue;
      }
      if (isDenied(pkg.licenses)) {
        this.licenseIssues.push({
          package: pkg.name,
          version: pkg.version,
          license: pkg.licenses.join(' OR '),
          severity: 'high',
          reason: `Copyleft license (${pkg.licenses.join(', ')}) conflicts with commercial policy`,
          reason_he: `רישיון copyleft (${pkg.licenses.join(', ')}) אינו תואם לשימוש מסחרי`,
          direct: this.direct.has(pkg.name),
        });
      }
    }
    return this.licenseIssues;
  }

  /* ─────────────────────── SBOM generation ────────────────────────────── */

  /**
   * Generate a SBOM in the requested format.
   *
   * @param {{format:'cyclonedx-json'|'spdx-json'}} opts
   * @returns {object}
   */
  generateSBOM(opts) {
    const o = opts || {};
    const format = (o.format || 'cyclonedx-json').toLowerCase();
    if (format === 'cyclonedx-json' || format === 'cyclonedx') {
      return this._generateCycloneDX();
    }
    if (format === 'spdx-json' || format === 'spdx') {
      return this._generateSPDX();
    }
    throw new Error(`generateSBOM: unknown format "${format}"`);
  }

  _generateCycloneDX() {
    const serial = 'urn:uuid:' + this._uuidFromString(`${this.projectName}@${this.projectVersion}`);
    const components = [];
    for (const pkg of this.packages.values()) {
      components.push({
        type: 'library',
        'bom-ref': `pkg:npm/${encodeURIComponent(pkg.name)}@${pkg.version}`,
        name: pkg.name,
        version: pkg.version,
        purl: `pkg:npm/${encodeURIComponent(pkg.name)}@${pkg.version}`,
        scope: pkg.dev ? 'optional' : 'required',
        licenses: pkg.licenses.map((id) => ({ license: { id } })),
        hashes: integrityToHashes(pkg.integrity),
        properties: [
          { name: 'onyx:direct', value: this.direct.has(pkg.name) ? 'true' : 'false' },
          { name: 'onyx:source', value: pkg.source },
          pkg.lockfileVersion != null
            ? { name: 'onyx:lockfileVersion', value: String(pkg.lockfileVersion) }
            : null,
        ].filter(Boolean),
      });
    }
    return {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      serialNumber: serial,
      version: 1,
      metadata: {
        timestamp: new Date().toISOString(),
        tools: [
          {
            vendor: 'Techno-Kol Uzi',
            name: 'onyx-dep-audit',
            version: '1.0.0',
          },
        ],
        component: {
          type: 'application',
          'bom-ref': `root:${this.projectName}@${this.projectVersion}`,
          name: this.projectName,
          version: this.projectVersion,
        },
      },
      components,
    };
  }

  _generateSPDX() {
    const ns = `https://onyx.local/sbom/${this.projectName}/${this.projectVersion}`;
    const docId = 'SPDXRef-DOCUMENT';
    const rootId = 'SPDXRef-Package-root';
    const packages = [
      {
        SPDXID: rootId,
        name: this.projectName,
        versionInfo: this.projectVersion,
        downloadLocation: 'NOASSERTION',
        filesAnalyzed: false,
        licenseConcluded: 'NOASSERTION',
        licenseDeclared: 'NOASSERTION',
        copyrightText: `Copyright (c) ${new Date().getFullYear()} ${this.authors}`,
      },
    ];
    const relationships = [
      {
        spdxElementId: docId,
        relatedSpdxElement: rootId,
        relationshipType: 'DESCRIBES',
      },
    ];
    let i = 0;
    for (const pkg of this.packages.values()) {
      i++;
      const spdxid = `SPDXRef-Package-${i}-${pkg.name.replace(/[^A-Za-z0-9]/g, '-')}`;
      const checksums = integrityToHashes(pkg.integrity).map((h) => ({
        algorithm: h.alg,
        checksumValue: h.content,
      }));
      packages.push({
        SPDXID: spdxid,
        name: pkg.name,
        versionInfo: pkg.version,
        downloadLocation: pkg.resolved || 'NOASSERTION',
        filesAnalyzed: false,
        licenseConcluded: pkg.licenses.length ? pkg.licenses.join(' OR ') : 'NOASSERTION',
        licenseDeclared: pkg.licenses.length ? pkg.licenses.join(' OR ') : 'NOASSERTION',
        copyrightText: 'NOASSERTION',
        externalRefs: [
          {
            referenceCategory: 'PACKAGE-MANAGER',
            referenceType: 'purl',
            referenceLocator: `pkg:npm/${encodeURIComponent(pkg.name)}@${pkg.version}`,
          },
        ],
        checksums,
      });
      relationships.push({
        spdxElementId: this.direct.has(pkg.name) ? rootId : rootId,
        relatedSpdxElement: spdxid,
        relationshipType: this.direct.has(pkg.name) ? 'DEPENDS_ON' : 'DEPENDENCY_OF',
      });
    }
    return {
      spdxVersion: 'SPDX-2.3',
      dataLicense: 'CC0-1.0',
      SPDXID: docId,
      name: `${this.projectName}-${this.projectVersion}-sbom`,
      documentNamespace: ns,
      creationInfo: {
        created: new Date().toISOString(),
        creators: [`Tool: onyx-dep-audit-1.0.0`, `Organization: ${this.authors}`],
      },
      packages,
      relationships,
    };
  }

  /* ───────────────────────── SARIF export ─────────────────────────────── */

  /**
   * Export current findings as a SARIF 2.1.0 log. GitHub's code-scanning
   * API consumes this format directly.
   */
  exportSARIF() {
    const rules = new Map();
    const results = [];
    for (const f of this.findings) {
      if (!rules.has(f.id)) {
        rules.set(f.id, {
          id: f.id,
          name: f.id.replace(/[^A-Za-z0-9]+/g, '_'),
          shortDescription: { text: f.summary.slice(0, 120) },
          fullDescription: { text: f.summary },
          helpUri: f.references[0] || undefined,
          defaultConfiguration: {
            level: this._sarifLevel(f.severity),
          },
          properties: {
            'security-severity': String(this._sarifScore(f)),
            tags: ['security', 'supply-chain', f.severity],
          },
        });
      }
      results.push({
        ruleId: f.id,
        level: this._sarifLevel(f.severity),
        message: {
          text: `${f.package}@${f.version} — ${f.summary}${f.fixed ? ` (fix: ${f.fixed})` : ''}`,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: 'package-lock.json' },
              region: { startLine: 1 },
            },
            logicalLocations: [
              {
                name: f.package,
                fullyQualifiedName: `${f.package}@${f.version}`,
                kind: 'package',
              },
            ],
          },
        ],
        partialFingerprints: {
          packageVersion: `${f.package}@${f.version}`,
          advisoryId: f.id,
        },
      });
    }
    return {
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'onyx-dep-audit',
              version: '1.0.0',
              informationUri: 'https://onyx.local/dep-audit',
              rules: Array.from(rules.values()),
            },
          },
          results,
        },
      ],
    };
  }

  _sarifLevel(sev) {
    switch (sev) {
      case 'critical':
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
        return 'note';
      default:
        return 'none';
    }
  }

  _sarifScore(f) {
    if (f.cvss != null) return f.cvss;
    switch (f.severity) {
      case 'critical':
        return 9.5;
      case 'high':
        return 7.5;
      case 'medium':
        return 5.5;
      case 'low':
        return 2.5;
      default:
        return 0;
    }
  }

  _uuidFromString(str) {
    const h = crypto.createHash('sha1').update(str).digest('hex');
    return (
      h.slice(0, 8) +
      '-' +
      h.slice(8, 12) +
      '-' +
      h.slice(12, 16) +
      '-' +
      h.slice(16, 20) +
      '-' +
      h.slice(20, 32)
    );
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * Exports — keep the public surface small and explicit.
 * ────────────────────────────────────────────────────────────────────── */

module.exports = {
  DepAudit,
  // Exposed primitives for tests and other security agents:
  parseVersion,
  compareVersions,
  satisfies,
  parseRange,
  osvRangeAffects,
  normalizeLicense,
  isDenied,
  integrityToHashes,
  COPYLEFT_DENY,
  SEVERITY_ORDER,
  severityFromCVSS,
  normalizeSeverity,
};
