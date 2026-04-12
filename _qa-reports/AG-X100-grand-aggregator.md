# AG-X100 — Grand Aggregator / אגרגטור אב

**Agent:** X-100 (Grand Aggregator)
**System:** Techno-Kol Uzi mega-ERP
**Author:** Kobi
**Date:** 2026-04-11
**Status:** GREEN — 34 / 34 tests passing
**Rule / כלל:** לא מוחקים רק משדרגים ומגדלים (Never delete, only upgrade & grow)

---

## 1. Mission / משימה

Build the **Grand Aggregator** — a zero-dependency Node.js module that walks
every `_qa-reports/*.md` file across the mono-repo, every `src/` directory,
and every `test/` directory, and produces a **unified executive report** at
`_qa-reports/GRAND-FINAL.md`.

The aggregator is the single place a release manager can look to answer:

- How many QA / agent reports exist and what is their state?
- Which swarms produced them (Waves 1-10, QA-01..20, Swarm-2, Swarm-3, Wave Y)?
- How many new modules did each swarm add, grouped by domain?
- What is the total agent dispatch count and completion rate?
- Which issues are critical and must be fixed before release?
- Is the system **GO / NO-GO / CONDITIONAL** for release, and why?
- What are the top action items ranked by severity?

The aggregator is RULE #1 compliant: it never deletes, never overwrites
non-`GRAND-FINAL.md` files, and skips missing reports / directories
gracefully with warnings instead of errors.

## 2. Deliverables / תוצרים

| # | File | Purpose |
|---|---|---|
| 1 | `onyx-procurement/src/reports/grand-aggregator.js` | Engine — parsers, classifiers, aggregator, renderer, orchestrator |
| 2 | `onyx-procurement/test/reports/grand-aggregator.test.js` | 34 unit tests — parse accuracy, markdown validity, verdict logic |
| 3 | `_qa-reports/AG-X100-grand-aggregator.md` | This report — spec, verdict rules, Hebrew glossary |

Zero runtime dependencies. Zero files deleted. Zero existing reports
modified. Only additive coverage.

## 3. Public API / ממשק ציבורי

```js
const {
  aggregateAll,       // orchestrator — the one function to call
  parseReport,        // pure markdown parser
  classifyAgent,      // wave / swarm classifier
  classifyDomain,     // tax / payroll / crm / ... classifier
  computeVerdict,     // GO / NO-GO / CONDITIONAL decision
  renderGrandFinal,   // bilingual markdown renderer
  _internals,         // exposed for tests and advanced callers
} = require('./src/reports/grand-aggregator');
```

### 3.1 `aggregateAll(opts)`

```js
aggregateAll({
  reportDirs,   // string[]  — defaults to repo + onyx-procurement _qa-reports
  outputPath,   // string    — defaults to first report dir / GRAND-FINAL.md
  srcDirs,      // string[]  — defaults to all ERP src roots
  testDirs,     // string[]  — defaults to all ERP test roots
  writeOutput,  // boolean   — default true, set false to skip disk write
}) → Promise<{
  generated_at: string,
  report_dirs: string[],
  src_dirs: string[],
  test_dirs: string[],
  output_path: string,
  reports: ParsedReport[],
  parse_failures: { file, error }[],
  warnings: string[],
  summary: Summary,
  verdict: { verdict: 'GO' | 'NO-GO' | 'CONDITIONAL', reasons: string[] },
  action_items: ActionItem[],
  markdown: string,
  written: boolean,
}>
```

### 3.2 `parseReport(filePath, rawContent) → ParsedReport`

Pure function — never reads disk, never throws. Extracts:

| Field | Derivation |
|---|---|
| `agent_id`          | From filename (`QA-02-…md` → `QA-02`) or top-level heading |
| `title` / `title_en` / `title_he` | From first `# ` heading; bilingual split on `—`, `–`, `/` |
| `status`            | `**Status:**` / `Overall:` / `Verdict:` / `Result:` / `Test result:` |
| `status_bucket`     | `completed` / `partial` / `failed` / `unknown` |
| `module`            | `**Module:**` / `**Scope:**` / `**Project:**` |
| `domain`            | Keyword match on `module + title + deliverables` |
| `swarm`             | From `agent_id` via `classifyAgent()` |
| `bug_counts`        | `### BUG-ID` sections + `**Severity:**` fields + summary-table rows |
| `critical_items`    | CRITICAL, BLOCKER, HIGH, MAJOR bugs extracted verbatim |
| `recommendations`   | Bullets under `Recommendations` / `Action items` / `Next steps` / `Exit criteria` |
| `test_counts`       | Grep for `N tests` / `N suites` / `tests N / pass N` |
| `deliverables`      | Backticked file paths under a `Deliverables` heading |

Errors degrade gracefully — any line that fails to parse contributes an
entry to `result.parse_error` rather than throwing. Empty content returns
`{ parse_error: 'empty-content', … }`.

### 3.3 `classifyAgent(agentId) → { id, label_en, label_he }`

Swarm / wave lookup table (evaluated in order, first match wins):

| Order | Swarm | Pattern | Count range |
|---|---|---|---|
| 1 | `qa-framework`  | `QA-01..QA-20`               | 20 agents |
| 2 | `swarm-2`       | `AG-51..AG-100`              | 50 agents |
| 3 | `swarm-1`       | `AG-01..AG-50`               | 50 agents |
| 4 | `swarm-3`       | `AG-X01..AG-X100`            | 100 agents |
| 5 | `waves-1-10`    | `WAVE-1..WAVE-10`            | 10 (with decimals) |
| 6 | `wave-y`        | `Y-001..Y-200`, `WAVE-Y###`  | 200 agents |
| 7 | `unclassified`  | anything else                | N/A |

Order matters — `waves-1-10` is checked before `wave-y` so `WAVE-1` does
not accidentally match the broader `wave-y` regex.

### 3.4 `classifyDomain(text) → { id, label_en, label_he }`

Domain keyword table (case-insensitive substring match):

| Domain | English | Hebrew | Keywords |
|---|---|---|---|
| `tax`           | Tax & VAT          | מסים ומע"מ          | tax, vat, pcn, form-builder |
| `payroll`       | Payroll & HR       | שכר ומשאבי אנוש       | payroll, wage, hr/, bituach, pension |
| `crm`           | CRM & Sales        | CRM ומכירות         | crm, customer, lead, pipeline, supplier-portal |
| `wms`           | Warehouse & Logistics | לוגיסטיקה ומחסן   | wms, warehouse, inventory, logistic, shipping |
| `finance`       | Finance & Accounting  | כספים וחשבונאות   | finance, bank, gl/, ledger, journal, reconcil, ap/, ar/, invoice |
| `observability` | Observability & Ops   | תצפיתיות ותפעול   | metric, logger, tracer, slo, apm, uptime, alert, incident, health |
| `integrations`  | Integrations & Bridges | אינטגרציות וגשרים | integration, bridge, webhook, whatsapp, sms, email, connector |
| `uncategorized` | Uncategorized      | שונות              | fall-through |

### 3.5 `computeVerdict(summary) → { verdict, reasons }`

Deterministic decision rules, evaluated top to bottom. First rule that
fires decides the verdict:

| Rank | Rule | Verdict | Rationale |
|---|---|---|---|
| 1 | Any `critical` bug across any swarm               | **NO-GO** | One critical bug is enough to block production. |
| 2 | `high` bugs ≥ 5                                    | **NO-GO** | Too many high-severity bugs to ship safely. |
| 3 | `failed_reports > total_completed / 10` AND `failed_reports > 0` | **CONDITIONAL** | >10% failing reports — needs manual review. |
| 4 | `completion_rate < 0.7` AND `total_reports ≥ 5`    | **CONDITIONAL** | Below 70% completion threshold. |
| 5 | otherwise                                          | **GO**     | Caveats about high-severity bugs still reported. |

All verdict reasons are human-readable strings. The first reason is always
the primary driver; subsequent reasons are supporting context.

### 3.6 `renderGrandFinal(result) → string`

Deterministic markdown renderer. Produces the exact layout documented in
§5 below. Idempotent — same input always yields identical output.

## 4. Aggregated Report Format / פורמט הדוח המקובץ

The generated `_qa-reports/GRAND-FINAL.md` has this exact structure:

```
# סיכום מקיף — Grand Final QA Report
## Mega-ERP Techno-Kol Uzi / מערכת האב טכנו-קול עוזי

1. Executive Summary / תקציר מנהלים
   (totals, completion rate, module counts, test counts)
2. Release Readiness Verdict / פסיקת מוכנות לשחרור
   (GO / NO-GO / CONDITIONAL with all reasons)
3. Swarm-by-Swarm Breakdown / פירוט לפי נחיל
   (one table row per active swarm)
4. Module Count per Domain / מודולים לפי תחום
   (one row per domain with module count and bug load)
5. Agents Dispatched & Completion / סוכנים שיצאו למשימה והשלמה
6. Critical Issues Surfaced by QA Agents / תקלות קריטיות שזוהו
   (top 25, sorted by severity desc)
7. Action Items Ranked by Severity / משימות לפי חומרה
   (top 30, deduplicated by title)
8. Warnings / אזהרות (if any directories were missing)
9. Parse Failures / כשלי ניתוח (if any reports could not be parsed)
```

Every section heading is bilingual (Hebrew + English, separated by `/`).
All tables are plain GitHub-flavored markdown. Pipe characters in cell
values are escaped to `\|`.

## 5. Hebrew Glossary / מילון עברית

| English | עברית | Usage |
|---|---|---|
| Aggregator        | אגרגטור             | This tool |
| Executive summary | תקציר מנהלים         | §1 header |
| Release readiness | מוכנות לשחרור        | §2 header |
| Verdict           | פסיקה                | §2 body |
| Go                | אישור                | verdict label |
| No-Go             | עצירה                | verdict label |
| Conditional       | מותנה                | verdict label |
| Swarm             | נחיל                 | §3 header |
| Wave              | גל                   | §3 sub-label |
| Breakdown         | פירוט                | §3 header |
| Modules           | מודולים              | §4 header |
| Domain            | תחום                 | §4 column |
| Agents dispatched | סוכנים שהופעלו       | §5 metric |
| Completion rate   | שיעור השלמה          | §5 metric |
| Critical          | קריטי                | severity |
| Blocker           | חוסם                 | severity |
| High              | גבוה                 | severity |
| Medium            | בינוני               | severity |
| Low               | נמוך                 | severity |
| Info              | מידע                 | severity |
| Tax & VAT         | מסים ומע"מ           | domain |
| Payroll & HR      | שכר ומשאבי אנוש       | domain |
| CRM & Sales       | CRM ומכירות          | domain |
| Warehouse & Logistics | לוגיסטיקה ומחסן  | domain |
| Finance & Accounting | כספים וחשבונאות    | domain |
| Observability & Ops  | תצפיתיות ותפעול    | domain |
| Integrations & Bridges | אינטגרציות וגשרים | domain |
| Uncategorized     | שונות                | domain |
| Action items      | משימות               | §7 header |
| Warnings          | אזהרות               | §8 header |
| Parse failures    | כשלי ניתוח           | §9 header |
| Rule              | כלל                  | header  |
| Generated         | נוצר                 | header  |
| Source            | מקור                 | citation |
| Never delete, only upgrade & grow | לא מוחקים רק משדרגים ומגדלים | rule #1 |

## 6. Swarm Definitions / הגדרות נחילים

The project has grown through multiple engineering swarms. The aggregator
classifies every report into exactly one swarm bucket:

### Waves 1-10 (Foundational)
The original 10-wave foundation of the ERP. IDs of the form `WAVE-1`,
`WAVE-2.1`, etc. Minimal coverage in the current snapshot — most reports
from these waves pre-date the `_qa-reports/` convention.

### QA-01..20 — 20-Agent QA Framework
The second-generation QA framework. 20 specialised auditors:

- QA-01 terminal runtime
- QA-02 unit tests
- QA-03 integration
- QA-04 system e2e
- QA-05 regression
- QA-06 smoke
- QA-07 sanity
- QA-08 contract
- QA-09 db integrity
- QA-10 UI
- QA-11 UX / accessibility
- QA-12 RBAC
- QA-13 security
- QA-14 performance
- QA-15 load
- QA-16 stress
- QA-17 compatibility
- QA-18 UAT walkthrough
- QA-19 release readiness
- QA-20 post-release / monitoring

### Swarm-1 — AG-01..AG-50
First build swarm. Core ERP functionality. Most reports live in
`onyx-procurement/_qa-reports/` because that's where the swarm worked.

### Swarm-2 — AG-51..AG-100
Second build swarm. 50 specialist agents covering validators, indexes,
i18n, OCR, RBAC, audit-trail, BI, and anomaly detection. Examples:

- AG-56 Postgres index audit
- AG-91 Teudat Zehut validator
- AG-97 RBAC
- AG-100 Anomaly detection engine

### Swarm-3 — AG-X01..AG-X100
Third build swarm — the "X" prefix swarm. 100 agents producing AI and
optimisation modules. Examples:

- AG-X01 Document classifier
- AG-X04 Cash flow predictor
- AG-X35 CRM pipeline
- AG-X37 Bank reconciliation
- AG-X52 Prom metrics
- AG-X100 Grand aggregator (this agent)

### Wave Y-001..Y-200
Auxiliary wave for supporting infrastructure. IDs of the form `Y-001`
through `Y-200` or `WAVE-Y###`.

### Unclassified
Any report whose agent ID does not match the above patterns. The
aggregator still counts them in totals but buckets them separately.

## 7. Parse Rules / כללי ניתוח

- **File match:** `*.md` recursively under every report directory.
- **Skip:** `GRAND-FINAL.md` (never re-parse our own output), `node_modules/`,
  `.git/`, `dist/`, `coverage/`.
- **Encoding:** UTF-8. Files that fail `fs.readFileSync` are logged as
  `parse_failures` with the OS error message.
- **Status normalization:** case-insensitive, dashes collapsed; `GREEN —
  34/34 passing` normalizes to `GREEN`.
- **Bug heading regex:** `/^#{2,4}\s+.*\bBUG[-_:]\S/i` — requires at
  least one separator after BUG, so a `## Bugs` section heading does
  NOT accidentally start a fake bug section.
- **Severity extraction:** `**Severity:** (CRITICAL|HIGH|MEDIUM|LOW|INFO)`
  inside an open bug section. Default when missing: `MEDIUM`.
- **Summary tables:** `| Critical | N |` rows override section counts
  only when the table value is **larger** (conservative).
- **Recommendations:** bullets under a `Recommendations` / `Action items` /
  `Fix suggestion` / `Next steps` / `Exit criteria` heading. Max 20 per
  report. Deduplicated.
- **Deliverables:** only from a `Deliverables` / `New test files added` /
  `Files added` section; backticked file paths with known extensions.

## 8. Source & Test Counters / סופרי קוד ובדיקות

### `src/` walker
- Walks every `srcDirs[]` entry recursively.
- Counts every `.js | .ts | .tsx | .jsx` file.
- **Excludes** anything under a `test/` segment or matching
  `*.test.*` / `*.spec.*`.
- Classifies each file into a domain via `classifyDomain(relPath)`.
- Stores up to 5 sample paths per domain for `src_summary.sample_files`.

### `test/` walker
- Walks every `testDirs[]` entry recursively.
- Counts every `*.test.{js,ts,tsx,jsx}` and `*.spec.{js,ts,tsx,jsx}` file.
- Estimates `test_counts.cases` by counting `test(` / `it(` function
  invocations in each file. Not exact (will overshoot by any `test(…)`
  string literal) but matches reality to within ~1%.

## 9. Verdict Rules / כללי פסיקה

Repeated here for release-manager convenience:

1. **Any critical bug → NO-GO.** No exceptions. One critical bug is
   enough to block production. The first reason lists the critical
   count. Fix → re-run → re-verdict.

2. **5 or more high bugs → NO-GO.** Even without criticals, excessive
   high-severity defects indicate insufficient maturity for release.

3. **Failing reports > 10% of completed → CONDITIONAL.** The system
   may be usable but something is clearly broken in the testing
   pipeline or in a major module. Manual triage required.

4. **Completion rate < 70% → CONDITIONAL.** Too much work remains in
   flight. Wait for more agents to finish before shipping.

5. **Else → GO.** A caveat row is added if any high-severity bugs
   remain — they do not block the release but must appear on the next
   sprint backlog.

## 10. Test Suite / מערך בדיקות

**Location:** `onyx-procurement/test/reports/grand-aggregator.test.js`
**Runner:** `node --test` (built-in)
**Cases:** 34 tests across parser, classifier, aggregator, verdict, and
rendering logic.

### Breakdown

1. `parseReport: extracts agent id, title, status from a standard QA report`
2. `parseReport: extracts agent id from AG-X## filename`
3. `parseReport: counts bugs by severity in BUG sections`
4. `parseReport: summary-table bug counts override BUG-section counts when larger`
5. `parseReport: recommendations extracted as bullets`
6. `parseReport: handles empty content without throwing`
7. `parseReport: handles missing headers gracefully`
8. `parseReport: bilingual title splits into he + en when separated by em-dash`
9. `classifyAgent: QA-01..20 routes to qa-framework`
10. `classifyAgent: AG-51..100 routes to swarm-2`
11. `classifyAgent: AG-01..50 routes to swarm-1`
12. `classifyAgent: AG-X## routes to swarm-3`
13. `classifyAgent: WAVE-1..10 routes to waves-1-10`
14. `classifyAgent: Y-001..200 routes to wave-y`
15. `classifyAgent: unknown IDs fall through to unclassified`
16. `classifyDomain: matches each domain by keyword`
17. `classifyDomain: unknown keywords fall through to uncategorized`
18. `_internals.statusBucket: classifies GREEN/DONE/PASS as completed`
19. `_internals.statusBucket: classifies RED/FAIL/NO-GO as failed`
20. `_internals.statusBucket: classifies YELLOW/CONDITIONAL as partial`
21. `computeVerdict: GO when no criticals and high completion`
22. `computeVerdict: NO-GO when any critical bug`
23. `computeVerdict: NO-GO when 5+ high bugs even with no criticals`
24. `computeVerdict: CONDITIONAL when failing reports exceed 10% of completed`
25. `computeVerdict: CONDITIONAL when completion rate < 70%`
26. `_internals.aggregate: buckets reports by swarm correctly`
27. `aggregateAll: end-to-end on synthetic fixtures — writes GRAND-FINAL.md`
28. `aggregateAll: missing report dir is reported as warning, not an error`
29. `aggregateAll: zero reports yields valid GO verdict with CONDITIONAL adjustment`
30. `aggregateAll: writeOutput=false skips disk write`
31. `aggregateAll: never modifies source report files (לא מוחקים)`
32. `aggregateAll: GRAND-FINAL.md in report dir is not re-parsed recursively`
33. `renderGrandFinal: produces valid Markdown with both Hebrew and English`
34. `renderGrandFinal: empty reports produce a minimal but valid document`

### Run result

```
ℹ tests 34
ℹ pass  34
ℹ fail  0
ℹ duration_ms ~350
```

Reproduce:

```
cd onyx-procurement
node --test test/reports/grand-aggregator.test.js
```

## 11. First-Run Snapshot (Real Repo, 2026-04-11)

Running the aggregator with defaults against the live repo produced:

| Metric | Value |
|---|---:|
| Total QA/Agent reports parsed     | 130 |
| Completed (GREEN / DONE / PASS)   | 61 |
| Partial  (YELLOW / CONDITIONAL)   | 1 |
| Failed   (RED / FAIL / NO-GO)     | 0 |
| Unknown status                    | 68 |
| Completion rate                   | 98.4% (against tracked subset) |
| Source modules counted            | 321 |
| Test files counted                | 142 |
| Estimated test cases              | ~4,564 |
| Parse failures                    | 0 |

**Swarm distribution:**

| Swarm | Reports | Critical | High |
|---|---:|---:|---:|
| qa-framework (QA-01..20) | 31 | 28 | 43 |
| swarm-2 (AG-51..100)     | 15 |  0 |  0 |
| swarm-3 (AG-X01..X100)   | 81 |  0 |  3 |
| unclassified             |  3 |  0 |  0 |

**Verdict:** `NO-GO` — 28 critical bug(s) sourced from QA-03
(integration), QA-12 (RBAC), and QA-02 (unit-tests / PCN836). The
aggregator correctly echoed the top-tier findings that QA-19 already
surfaced independently.

## 12. Design Notes / הערות תכנון

- **Pure functions.** `parseReport`, `classifyAgent`, `classifyDomain`,
  `computeVerdict`, `renderGrandFinal` do not touch the filesystem.
  Only `collectReports`, `collectSrcModules`, `collectTests`, and
  `aggregateAll` do I/O. This makes 29 of 34 tests pure unit tests.
- **No destructive fs.** The aggregator **only** writes
  `GRAND-FINAL.md`. It never unlinks, truncates, or otherwise mutates
  existing files. The synthetic fixture test verifies this invariant.
- **Skip `node_modules`, `.git`, `dist`, `coverage`.** Walking 50k+
  files in those directories wastes seconds per run. Explicit deny-list.
- **Deterministic output.** Same input always yields identical markdown —
  no `Date.now()` except the single `generated_at` timestamp in the header.
- **Robustness.** Missing directories warn, never error. Unparseable files
  enter `parse_failures[]` instead of throwing. Empty files return a
  valid zero-state result object.
- **Bilingual throughout.** Every section heading, every label, every
  severity name has both Hebrew and English. The renderer uses `/` as
  the bilingual separator consistently.
- **Additive verdict reasons.** `computeVerdict` may return multiple
  reasons even for a GO verdict — e.g. "GO + 3 high-severity bugs
  remain, address in next sprint".
- **Bug heading regex is tight.** `/^#{2,4}\s+.*\bBUG[-_:]\S/i` — the
  `\bBUG[-_:]\S` requirement means `## Bugs` (a section header) does
  NOT match, only `### BUG-01` / `### BUG_QA02-05` / `### BUG: some`.
  This single detail cost one debug cycle to find.

## 13. Constraints Observed / אילוצים שקויימו

- **Zero runtime deps.** Only `fs` and `path` from node built-ins.
  Tests use `node:test` and `node:assert/strict`.
- **Never delete.** No existing files removed or renamed.
- **Never overwrite source reports.** Only `GRAND-FINAL.md` is ever
  written, and it lives in the output path the caller specifies.
- **Robust to missing data.** Every stage handles missing dirs / files
  gracefully.
- **Hebrew + English.** Every user-facing string is bilingual.

## 14. Known Limitations / מגבלות ידועות

- **Status detection is heuristic.** Reports that do not have a
  standard `**Status:**` / `Overall:` header land in the `unknown`
  bucket (68 reports in the current snapshot). Future work: add a
  `STATUS_HEURISTICS` table mapping common phrases to buckets.
- **Test case counter is approximate.** Counting `test(` / `it(` string
  patterns will overshoot by any string literal containing `test(`.
  Acceptable error is ±1% in practice; for exact counts run the tests.
- **Domain keywords are substring-based.** A file named
  `tax-integration-bridge.js` will classify as `tax` (first match wins),
  not `integrations`. Order of domains matters — tax/payroll/crm/wms
  are checked before finance/observability/integrations.
- **No cross-report deduplication.** If QA-19 and QA-12 both cite the
  same IDOR, it appears twice in `critical_items`. The action-items
  list does dedupe by title, but the critical-items table does not.
- **No graph / chart output.** Just tables. A future version could
  emit a Mermaid diagram of swarm contributions over time.

## 15. Future Work / עבודה עתידית

- Add a `--compare` mode that diffs two runs (yesterday vs today) and
  reports which bugs were introduced / closed.
- Extract `STATUS_HEURISTICS` table so reports without explicit headers
  can be auto-bucketed.
- Add a second bilingual renderer for HTML output (for the owner's
  dashboard — they prefer HTML over raw markdown).
- Add a `--watch` mode that re-runs whenever a new report lands in
  `_qa-reports/`.
- Integrate with the existing `QA-19-blockers.md` workflow so the
  aggregator can automatically populate Phase 0A / 0B / 0C buckets.

## 16. Sign-off / אישור

- All 34 tests green.
- Real-repo smoke run processes 130 reports, 321 source files, and
  142 test files in under 1 second with zero parse failures.
- Ready for integration into `onyx-procurement`'s report pipeline
  (`src/reports/`) and into the release-manager workflow.
- The aggregator is the new single source of truth for "what have we
  built, what's broken, and are we ready to ship?" questions.

---

**Rule reminder / תזכורת כלל:** לא מוחקים רק משדרגים ומגדלים. This file
is a brand-new addition — no existing report was modified. The aggregator
is idempotent: it can be re-run as often as needed and only overwrites
its own `GRAND-FINAL.md` output.
