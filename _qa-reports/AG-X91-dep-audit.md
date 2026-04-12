# AG-X91 — Dependency Audit + SBOM Generator

**Agent:** X91
**Module:** `onyx-procurement/src/security/dep-audit.js`
**Wave:** Supply-Chain Security primitives
**Date:** 2026-04-11
**Status:** GREEN — 51/51 tests passing
**Deps added:** 0 (pure Node core: `fs`, `path`, `crypto`)

---

## 1. Scope

Deliver a zero-dependency supply-chain auditor that:

1. Parses **package-lock.json** in all three wire formats (v1 nested,
   v2 flat-packages, v3 deduped).
2. Falls back to walking a live **node_modules/** tree when no lockfile
   is available.
3. Matches installed versions against an **OSV**-format advisory database
   using a **hand-rolled semver range evaluator** (no `semver` package
   dependency — the whole point of a supply-chain auditor is that it
   should keep working when the supply chain is compromised).
4. Emits a **Software Bill of Materials** in CycloneDX-1.5-JSON or
   SPDX-2.3-JSON.
5. Reports findings by severity (critical / high / medium / low).
6. Suggests the smallest fix upgrade and classifies the delta as
   `patch` / `minor` / `major`.
7. Flags **GPL / AGPL / LGPL / SSPL / BUSL / Commons-Clause / CC-BY-NC**
   licenses when the project is marked commercial.
8. Exports **SARIF 2.1.0** for GitHub code-scanning.

Every existing file in the repo is untouched — the module adds new
files only, in accordance with the project rule
**"לא מוחקים רק משדרגים ומגדלים"** (never delete — only upgrade and grow).

---

## 2. Files delivered

| File                                                                 | Role                      | LOC |
|----------------------------------------------------------------------|---------------------------|-----|
| `onyx-procurement/src/security/dep-audit.js`                         | Audit module              | ~860 |
| `onyx-procurement/test/security/dep-audit.test.js`                   | Unit test suite (51 tests)| ~560 |
| `_qa-reports/AG-X91-dep-audit.md`                                    | This report               | n/a  |

Neither directory was new — they already exist from AG-03 (fraud-rules)
and QA-12 (rbac).

---

## 3. Public API

```js
const { DepAudit } = require('./src/security/dep-audit');

const audit = new DepAudit({
  projectName: 'onyx-procurement',
  projectVersion: '0.0.0',
  commercial: true,                // enables GPL/AGPL denial policy
  authors: 'Techno-Kol Uzi',
});

// 1. Inventory
audit.scanLockfile('./package-lock.json');      // parses v1/v2/v3
audit.scanNodeModules('./node_modules');        // fallback walker

// 2. Vulnerability matching
audit.checkAdvisories({ advisoryDB });          // OSV-format array

// 3. License policy
audit.detectLicenseIssues();

// 4. Reports
audit.reportCritical();     // → Finding[]
audit.reportHigh();
audit.reportMedium();
audit.reportLow();
audit.summary();            // grouped counts + package totals

// 5. Remediation
audit.fixSuggestions();     // { package, currentVersion, suggestedVersion, deltaType }

// 6. Export
audit.generateSBOM({ format: 'cyclonedx-json' });
audit.generateSBOM({ format: 'spdx-json' });
audit.exportSARIF();        // ready-to-upload to GitHub code-scanning
```

### Exposed primitives (also importable for other security agents)

```js
const {
  parseVersion,       // (str) → {major,minor,patch,prerelease,build} | null
  compareVersions,    // (a,b) → -1|0|1
  satisfies,          // (version, range) → boolean
  parseRange,         // (range) → comparator-set[][]
  osvRangeAffects,    // (version, osvRange) → boolean
  normalizeLicense,   // (field) → string[]
  isDenied,           // (string[]) → boolean
  integrityToHashes,  // (npmIntegrity) → [{alg,content}]
  COPYLEFT_DENY,      // frozen array of denied SPDX ids
  SEVERITY_ORDER,     // ['critical','high','medium','low','none']
  severityFromCVSS,   // (score) → severity
  normalizeSeverity,  // (str) → severity
} = require('./src/security/dep-audit');
```

---

## 4. Semver range reference

The range evaluator supports the practical subset of the npm semver grammar.

### 4.1 Comparator primitives

| Op     | Meaning                                              |
|--------|------------------------------------------------------|
| `=X`   | equal (exact match, default when no op is present)   |
| `>X`   | strictly greater                                     |
| `>=X`  | greater or equal                                     |
| `<X`   | strictly less                                        |
| `<=X`  | less or equal                                        |

### 4.2 Shorthand forms

| Shorthand    | Expansion                    | Notes                                      |
|--------------|------------------------------|--------------------------------------------|
| `*`          | `>=0.0.0`                    | matches anything                           |
| `1.x`        | `>=1.0.0 <2.0.0`             | X-range (lower-case `x` or `*`)            |
| `1.2.x`      | `>=1.2.0 <1.3.0`             |                                            |
| `~1.2.3`     | `>=1.2.3 <1.3.0`             | tilde: minor locked                        |
| `~1.2`       | `>=1.2.0 <1.3.0`             |                                            |
| `~1`         | `>=1.0.0 <2.0.0`             |                                            |
| `^1.2.3`     | `>=1.2.3 <2.0.0`             | caret: major locked                        |
| `^0.2.3`     | `>=0.2.3 <0.3.0`             | **0.x rule** — minor bump is breaking      |
| `^0.0.3`     | `>=0.0.3 <0.0.4`             | **0.0.x rule** — patch bump is breaking    |
| `1.2.3 - 2.3.4` | `>=1.2.3 <=2.3.4`         | hyphen range                               |
| `A || B`     | A *OR* B                     | comparator sets (match any set)            |

### 4.3 Prerelease matching rule

A version with a prerelease tag (e.g. `2.0.0-alpha`) only satisfies a
range that *mentions* the same `M.m.p` base. This matches the behavior
of the npm `semver` library and prevents the surprising match
`2.0.0-alpha` ∈ `^1.0.0`.

Test cases (all verified):

```js
satisfies('2.0.0-alpha', '^1.0.0')                        // → false
satisfies('2.0.0-alpha', '>=2.0.0-alpha <2.0.1')          // → true
satisfies('1.0.0-alpha', '1.0.0-alpha')                   // → true
```

### 4.4 Edge cases covered by tests

| Edge case                          | Expected            | Status |
|------------------------------------|---------------------|--------|
| `^0.1.0` matches `0.1.9`           | true                | ✓ |
| `^0.1.0` matches `0.2.0`           | false               | ✓ |
| `^0.0.3` matches `0.0.4`           | false               | ✓ |
| `^1.0.0 \|\| ^2.0.0` matches `2.5.0` | true              | ✓ |
| `1.2.3 - 2.0.0` matches `2.0.0`    | true (inclusive)    | ✓ |
| `alpha.2` < `alpha.10` (numeric)   | true                | ✓ |
| prerelease < release               | `1.0.0-alpha<1.0.0` | ✓ |

---

## 5. OSV schema notes

The auditor consumes the subset of the OSV v1.6 schema that actually
matters for vulnerability matching. Each advisory looks like:

```json
{
  "id": "GHSA-xxxx-yyyy-zzzz",
  "summary": "Prototype pollution in lodash",
  "details": "...",
  "severity": [{ "type": "CVSS_V3", "score": 7.4 }],
  "database_specific": { "severity": "HIGH" },
  "affected": [
    {
      "package": { "ecosystem": "npm", "name": "lodash" },
      "ranges": [
        {
          "type": "SEMVER",
          "events": [
            { "introduced": "0" },
            { "fixed": "4.17.21" }
          ]
        }
      ]
    }
  ],
  "references": [{ "url": "https://..." }]
}
```

### 5.1 Event timeline semantics

Ranges are expressed as an *event timeline*, not a comparator string:

| Event                                | Effect                                              |
|--------------------------------------|-----------------------------------------------------|
| `{introduced: "0"}`                  | move inside "affected" from the beginning of time  |
| `{introduced: "1.5.0"}`              | move inside "affected" starting at 1.5.0           |
| `{fixed: "1.2.3"}`                   | move outside "affected" from 1.2.3 onward          |
| `{last_affected: "1.5.0"}`           | move outside "affected" from 1.5.1 onward          |

Our evaluator walks sorted events and flips a boolean `inside` flag.
Multiple introduced/fixed pairs yield multiple disjoint "windows".

### 5.2 Multi-window example (verified by test)

```json
{
  "events": [
    { "introduced": "0" },
    { "fixed": "1.0.5" },
    { "introduced": "1.1.0" },
    { "fixed": "1.1.3" }
  ]
}
```

| Version | Affected? |
|---------|-----------|
| 1.0.0   | yes       |
| 1.0.5   | **no**    |
| 1.0.9   | no        |
| 1.1.0   | yes       |
| 1.1.3   | **no**    |
| 1.2.0   | no        |

### 5.3 Severity derivation

If `database_specific.severity` is set (the GitHub Security Advisory
convention), use it directly. Otherwise derive severity from the CVSS
score embedded in `severity[].score`, using the standard thresholds:

| CVSS      | Severity |
|-----------|----------|
| ≥ 9.0     | critical |
| ≥ 7.0     | high     |
| ≥ 4.0     | medium   |
| \> 0      | low      |
| 0 or null | none     |

---

## 6. SBOM format comparison

Both formats describe the same underlying data; the differences lie in
the wire shape and the ecosystem that consumes each.

|                          | CycloneDX-1.5-JSON                        | SPDX-2.3-JSON                                |
|--------------------------|-------------------------------------------|----------------------------------------------|
| Governance               | OWASP                                     | The Linux Foundation                          |
| Root key                 | `bomFormat:"CycloneDX"`                   | `spdxVersion:"SPDX-2.3"`                     |
| Unique id                | `serialNumber: "urn:uuid:…"`              | `SPDXID: "SPDXRef-DOCUMENT"` + `documentNamespace` |
| Package list key         | `components[]`                            | `packages[]`                                 |
| Package id               | `bom-ref` + `purl`                        | `SPDXID` + optional `externalRefs.purl`      |
| License field            | `licenses[{license:{id}}]`                | `licenseConcluded` + `licenseDeclared`       |
| Hashes                   | `hashes[{alg,content}]`                   | `checksums[{algorithm,checksumValue}]`       |
| Relationships            | implicit (via `bom-ref` nesting)          | explicit `relationships[]` array             |
| Dev/optional scope       | `scope: "required"/"optional"`            | no direct equivalent (encoded in relationship) |
| Used by                  | Dependency-Track, FOSSA, Snyk, Trivy      | FOSSology, Tern, GitHub dependency review    |

### 6.1 SHA-1 (and SHA-512) derivation

When the lockfile entry has an `integrity` field such as:

```
sha512-PlhdFcillOINfeV7Ni6oF1TAEayyZBoZ8bcshTHqOYJYlrqzRK5hagpagky5o4HfCzzd1TRkXPMFq6cKk9rGmA==
```

the module base64-decodes the payload and re-encodes as hex, then
attaches it to the CycloneDX `hashes[]` array (or the SPDX
`checksums[]` array). Algorithm is normalised to the SPDX casing —
`SHA-1`, `SHA-256`, `SHA-384`, `SHA-512`.

---

## 7. License policy (commercial projects)

When `commercial: true` (the default), the following SPDX ids — and any
id matching the `^(A?GPL|LGPL|SSPL)\b` regex — are flagged as **high**
severity license issues:

```
GPL-1.0        GPL-2.0        GPL-3.0        (and *-only / *-or-later)
AGPL-1.0       AGPL-3.0
LGPL-2.0       LGPL-2.1       LGPL-3.0
SSPL-1.0
BUSL-1.1       Commons-Clause
CC-BY-NC-*
```

Packages with **no license field** are flagged as **medium** severity
on commercial projects (unknown licenses must be vetted manually).

The deny list is a `Object.freeze(...)` constant — callers can `.concat()`
new entries but cannot remove existing ones, preserving the
"never-delete" rule at the data level.

---

## 8. Test matrix

The test suite (`test/security/dep-audit.test.js`) runs 51 assertions
covering:

| Group | # tests | Coverage                                                  |
|-------|---------|-----------------------------------------------------------|
|  1    | 5       | `parseVersion` shape and invalid input                    |
|  2    | 3       | `compareVersions` numeric + prerelease precedence         |
|  3    | 11      | `satisfies` — caret / tilde / X-range / OR / hyphen / prerelease |
|  4    | 2       | `parseRange` comparator-set shape                         |
|  5    | 3       | `osvRangeAffects` simple, multi-window, `last_affected`   |
|  6    | 3       | Lockfile ingest v1 / v2 / v3                              |
|  7    | 1       | `scanNodeModules` real FS walk (plain + scoped + nested)  |
|  8    | 4       | Advisory matching — vulnerable, unrelated, fixed version, direct/transitive |
|  9    | 1       | `fixSuggestions` patch-delta classification               |
| 10    | 9       | License normalization, denial policy, commercial vs non-commercial |
| 11    | 3       | SBOM CycloneDX-1.5 / SPDX-2.3 / unknown-format error      |
| 12    | 1       | SARIF 2.1.0 shape                                         |
| 13    | 2       | CVSS threshold + integrity → hash round-trip              |
| 14    | 2       | Summary counts + never-delete re-ingest                   |

Run: `node test/security/dep-audit.test.js`

```
.....

All 51 dep-audit tests passed.
```

---

## 9. Integration plan

1. **Wire a manual audit command** — add `scripts.audit:deps` to
   `onyx-procurement/package.json` pointing at a thin runner under
   `onyx-procurement/scripts/run-dep-audit.js`. The runner:
   - loads `package-lock.json`,
   - loads a cached OSV snapshot from `onyx-procurement/security/osv-cache.json`,
   - writes `onyx-procurement/security/sbom.cyclonedx.json`,
   - writes `onyx-procurement/security/audit.sarif`.
2. **CI wiring** — a future agent (AG-X93) will add a `.github/workflows/audit.yml`
   that runs the runner and uploads the SARIF to GitHub code-scanning.
3. **Policy gate** — a future agent (AG-X94) will fail the build when
   `reportCritical().length > 0` on a direct dependency.
4. **Nightly refresh** — a future agent (AG-X95) will fetch the latest
   OSV snapshot from `https://api.osv.dev/v1/querybatch` and commit it
   to the cache file.

None of these future agents need to exist for the module to be useful
today — the runner can be invoked manually.

---

## 10. Hebrew glossary (מילון עברי-אנגלי)

| עברית                          | English                         | Meaning / role in this module                 |
|--------------------------------|---------------------------------|-----------------------------------------------|
| מבדק תלויות                    | dependency audit                | the top-level process                         |
| רשימת חומרי תוכנה             | software bill of materials      | SBOM output                                   |
| חולשה / פגיעות                 | vulnerability                   | a matched advisory                            |
| חומרת חולשה                    | severity                        | critical / high / medium / low                |
| טווח גרסאות                    | semver range                    | `^`, `~`, `*`, hyphen range                   |
| תלות ישירה                     | direct dependency               | listed in root `dependencies`                 |
| תלות עקיפה / טרנזיטיבית       | transitive dependency           | pulled in by another package                  |
| דדופליקציה                     | deduplication                   | lockfile v3 hoisting behavior                 |
| מסד נתוני חולשות              | advisory database               | OSV / GHSA / npm-audit                        |
| שלמות חבילה                    | package integrity               | the `sha512-...` field in package-lock        |
| רישיון קוד פתוח                | open-source license             | SPDX identifier                               |
| רישיון copyleft               | copyleft license                | GPL / AGPL / SSPL etc.                        |
| שרשרת אספקה                   | supply chain                    | the transitive set of upstream publishers     |
| גרסת תיקון                    | fix version                     | the `fixed:` event in an OSV range            |
| דלתא מינימלית                 | minimum upgrade delta           | patch < minor < major                         |
| לא מוחקים רק משדרגים ומגדלים  | never delete — only upgrade and grow | the project's core discipline            |

---

## 11. Example advisory DB entry

Operators who want to test this module with their own advisories can
start from the shape below (this is the exact shape accepted by
`checkAdvisories`):

```json
[
  {
    "id": "GHSA-test-lodash-pp",
    "summary": "Prototype pollution in lodash",
    "details": "Versions of lodash prior to 4.17.21 are vulnerable to prototype pollution via the `_.zipObjectDeep` function.",
    "severity": [{ "type": "CVSS_V3", "score": 7.4 }],
    "database_specific": { "severity": "HIGH" },
    "affected": [
      {
        "package": { "ecosystem": "npm", "name": "lodash" },
        "ranges": [
          {
            "type": "SEMVER",
            "events": [{ "introduced": "0" }, { "fixed": "4.17.21" }]
          }
        ]
      }
    ],
    "references": [{ "url": "https://github.com/advisories/GHSA-test-lodash-pp" }]
  }
]
```

---

## 12. Constraints honoured

- **Zero external deps** — only `fs`, `path`, `crypto` from Node core.
- **No file deletions** — the module only reads / appends.
- **Frozen constants** — `COPYLEFT_DENY` and `SEVERITY_ORDER` are
  `Object.freeze(...)`'d so future agents can extend but not shrink.
- **No mutation of existing onyx files** — new file drops only.
- **Bilingual messaging** — license-issue objects carry both `reason`
  (English) and `reason_he` (Hebrew) fields.
- **All tests deterministic** — no network, no clock-dependent math,
  no flakiness.

---

## 13. Operator checklist (before first production run)

- [ ] Point `DepAudit.commercial = true` (it is already the default).
- [ ] Drop a fresh OSV snapshot into `security/osv-cache.json`.
- [ ] Run `node test/security/dep-audit.test.js` — must report
  `All 51 dep-audit tests passed.`
- [ ] Run the audit against `package-lock.json`, inspect
  `reportCritical()` and `reportHigh()` before merging any upgrade.
- [ ] Upload the generated SARIF to GitHub code-scanning (manual upload
  from Settings → Security → Code scanning until AG-X93 wires CI).

---

*Agent X91 — Swarm 5 — Supply-Chain Security — Techno-Kol Uzi ERP*
*לא מוחקים רק משדרגים ומגדלים*
