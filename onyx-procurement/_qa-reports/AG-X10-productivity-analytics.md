# AG-X10 — Productivity Analytics (Aggregate, Privacy-First)

**Agent:** X-10 (Swarm 3 — Techno-Kol Uzi mega-ERP)
**Date:** 2026-04-11
**Files delivered:**
- `src/analytics/productivity.js` — module (zero deps)
- `test/payroll/productivity.test.js` — 20 unit tests, all passing
- `_qa-reports/AG-X10-productivity-analytics.md` — this report

**Test run:** `node --test test/payroll/productivity.test.js`
**Result:** 20 / 20 pass, 0 fail, duration ≈ 167ms

---

## 1. Scope

A pure-JS, zero-dependency analytics module that computes **aggregated**
employee productivity metrics for Techno-Kol Uzi workshop & sales teams,
delivered through five public functions:

| Function | Purpose |
|---|---|
| `computeProductivity(employeeId, period, context)` | Full individual profile — metrics, peer benchmark (percentile-only), trend |
| `teamDashboard(teamId, period, context)` | Anonymized team aggregates with k-anonymity gate |
| `standardTimes(jobType, customStandards?)` | Benchmark minutes per job type |
| `identifyBottlenecks(workflow)` | Flags slow workflow steps and queue buildups |
| `suggestTraining(employee)` | Advisory training suggestions (never auto-assigned) |

Ten individual metric calculators are exported too, so other modules and
tests can reuse them without pulling the entire pipeline.

## 2. Metrics implemented

All ten required metrics are present:

| # | Metric | Function | Aggregation window |
|---|---|---|---|
| 1 | Jobs completed per shift | `jobsPerShift()` | shift (≥6h) |
| 2 | Quality defect rate | `defectRate()` | shift/day/week |
| 3 | Rework percentage | `reworkRate()` | shift/day/week |
| 4 | Throughput vs standard | `throughputVsStandard()` | shift/day/week |
| 5 | Overtime trends | `overtimeTrends()` | weekly buckets + linear slope |
| 6 | Absence patterns | `absencePatterns()` | period — protected reasons excluded |
| 7 | Training completion | `trainingCompletion()` | cumulative |
| 8 | Task cycle time | `taskCycleTime()` | per task (mean + median) |
| 9 | Revenue per employee | `revenuePerEmployee()` | sales role only |
| 10 | Customer satisfaction | `customerSatisfaction()` | requires n ≥ 3 |

## 3. Privacy Review (תקנות הגנת הפרטיות)

### 3.1 Legal basis

The module is designed to be defensible under:

- **חוק הגנת הפרטיות, התשמ"א-1981** — Israeli Privacy Protection Law.
- **תקנות הגנת הפרטיות (אבטחת מידע), התשע"ז-2017** — Israeli Data
  Security Regulations.
- **GDPR Art. 5** — data minimization and purpose limitation.
- **GDPR Art. 22** — no solely-automated decisions with significant
  effect on individuals.

### 3.2 Controls implemented

| Control | Implementation | Verified by test |
|---|---|---|
| No per-second tracking | `_assertPeriod()` throws if window < 6h | #12 refuses narrow window |
| No keystroke/mouse monitoring | Not implemented, explicitly refused in `perSecondTracking()` | #18 refused anti-patterns |
| Aggregation to shift/day/week | `granularity` must be one of those three | #12, `_assertPeriod` |
| Individual details HR-only (RBAC) | `meta.rbacRequired = 'hr'` + `meta.auditLog = true` | #10 — meta present |
| Opt-out per employee | `people[].opted_out=true` → empty response | #11 opt-out honored |
| Hebrew privacy notice | `PRIVACY_NOTICE_HE` in every individual response | #19 notice present |
| k-anonymity on team dashboards | Min k = 5; rejects smaller teams | #13 blocks < K, #14 allows ≥ K |
| No peer identities leaked | Peer benchmark returns **percentiles only** | #20 no peerIds/Names/Values |
| Protected absences shielded | `PROTECTED_ABSENCE_REASONS` (sick, miluim, maternity, paternity, bereavement, jury duty, workplace injury, protected strike) never count against employee | #5 protected excluded |
| No automated warnings | `automaticWarning()` throws | #18 |
| No attendance-only score | `attendanceBasedScore()` throws | #18 |
| No peer shaming | `peerRanking()` throws | #18 |

### 3.3 Privacy notice (Hebrew — exact text embedded in every individual response)

> הודעת פרטיות — לפי חוק הגנת הפרטיות, התשמ"א-1981 ותקנות הגנת הפרטיות
> (אבטחת מידע), התשע"ז-2017: נתונים אלה מחושבים בצבירה ברמת משמרת/יום/שבוע
> בלבד, ללא מעקב בזמן אמת. הנתונים מיועדים לאימון, חניכה ותכנון בלבד
> ואינם משמשים להחלטות משמעת אוטומטיות. לזכויות עיון, תיקון ומחיקה
> (סע' 13-14 לחוק), פנה/י למשאבי אנוש. הסכמתך ל-opt-out מתועדת בטבלת
> people.opted_out ותיכבד מיידית.

### 3.4 Refused features (anti-patterns)

Four exported functions throw immediately on call. They exist so
linters, tests, and future agents can *prove* they are still wired to
refuse:

```js
attendanceBasedScore() // throws
peerRanking()          // throws
automaticWarning()     // throws
perSecondTracking()    // throws
```

Each refusal message explains *why* the pattern is prohibited.

### 3.5 Residual risks

| Risk | Mitigation | Owner |
|---|---|---|
| Caller forgets to enforce RBAC | `meta.rbacRequired='hr'` in payload; add server-side gate | route layer |
| Caller forgets audit logging | `meta.auditLog=true` hint; enforce in middleware | route layer |
| Peer benchmark still allows small-n inference (3 peers) | Documented; HR should raise threshold for small teams | HR config |
| `context.people.opted_out` may be stale | Re-query immediately before each report | route layer |
| Training suggestions could feel like warnings | `meta.advisoryOnly` + `requiresHumanReview` + Hebrew "המלצות לעיון בלבד" | UI layer |

The route layer (`middleware/` and future `src/analytics/routes.js`)
should add RBAC + audit-log wrappers before this module is exposed
over HTTP.

## 4. Design highlights

- **Pure functions, no I/O.** The caller pre-loads arrays (jobs, outputs,
  hours, absences, trainings, tasks, deals, csat) and passes them in.
  This keeps the module trivially testable, database-agnostic, and
  compatible with the existing Supabase / in-memory patterns used
  elsewhere in `onyx-procurement`.

- **Never deletes data.** The module only reads arrays; there are no
  mutations, writes, or implicit side-effects.

- **Bilingual Hebrew/English.** Every user-facing message (privacy
  notice, bottleneck suggestions, training recommendations, k-anonymity
  refusals) carries `*He` and `*En` fields.

- **ISO-8601 week keys.** `_isoWeekKey()` implements the zero-dep
  standard calculation so overtime trends align with payroll weeks.

- **k-anonymity = 5** by default, exposed as `K_ANONYMITY_MIN`.
  `MIN_AGG_HOURS = 6` enforces the "no per-second tracking" rule at
  the API boundary.

- **Peer benchmark returns percentile-rank only** — never the peers'
  IDs, names, or raw metric values. This prevents re-identification
  attacks against small teams.

## 5. Test matrix

20 tests covering happy path, edge cases, privacy enforcement, and
every exported function. Notable cases:

- #11 — opt-out returns `{metrics: null, opted_out: true}` with full
  privacy notice still attached.
- #12 — 2-hour window refused with `period too narrow` error.
- #13 — team with 4 members blocked: `eligible=false, reason=k-anonymity`.
- #14 — team with 6 members returns `{mean, median, p25, p75}` only,
  no member list.
- #18 — all four refused anti-patterns throw with explanatory messages.
- #19 — Hebrew privacy notice text contains `תקנות הגנת הפרטיות` /
  `חוק הגנת הפרטיות`.
- #20 — peer benchmark payload contains percentile fields and
  **no** `peerIds`, `peerNames`, or `peerValues` keys.

## 6. Dependencies

**Zero runtime dependencies.** Only Node built-ins (`node:test`,
`node:assert/strict`, `path`) in the test file.

## 7. Compliance with task constraints

| Constraint | Status |
|---|---|
| Never delete | Pass — module only reads |
| Hebrew bilingual | Pass — every user-facing string has He + En |
| Zero deps | Pass — no `require()` outside Node built-ins |
| Respectful of employee privacy | Pass — see §3 |
| Aggregate only (no surveillance) | Pass — 6h minimum window, k-anonymity |
| All 10 metrics | Pass — §2 |
| 5 named exports | Pass — `computeProductivity`, `teamDashboard`, `standardTimes`, `identifyBottlenecks`, `suggestTraining` |
| Anti-patterns refused | Pass — throw on call |
| ≥ 12 test cases | Pass — 20 tests, all passing |

## 8. Follow-up recommendations

1. Add a route handler under `src/analytics/productivity-routes.js`
   that enforces HR-only RBAC via the existing auth middleware and
   audit-logs every individual-report access.
2. Add an integration test that exercises the route layer end-to-end
   with a real `people.opted_out` row to prove the opt-out gate fires
   before DB reads.
3. Consider exposing `K_ANONYMITY_MIN` and `MIN_AGG_HOURS` via the
   HR admin console so the legal team can tune them without a deploy.
4. Wire a nightly job to refresh `standards` from manufacturing
   engineering's master list (they change as tooling evolves).

---

**Sign-off:** Agent X-10, 2026-04-11. Zero deps, 20/20 tests, privacy
controls documented and verified.
