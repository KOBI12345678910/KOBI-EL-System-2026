# AG-Y077 — Capital Projects Tracker (CIP + Capex Approvals)

**Agent:** Y-077 (Swarm Finance)
**System:** Techno-Kol Uzi mega-ERP (Kobi Elimelech, 2026)
**Date:** 2026-04-11
**Status:** DELIVERED — 45 / 45 tests passing, zero external dependencies.
**Rule enforced:** לא מוחקים — רק משדרגים ומגדלים (append-only ledgers, kill-switch never deletes).

---

## 1. Scope

Build a production-grade Capital Projects Tracker for the Techno-Kol Uzi
mega-ERP that covers the full lifecycle of a capital expenditure project:

1. Business case initiation with financial justification
2. Multi-tier approval routing based on requested budget
3. CIP (Construction-In-Progress) sub-ledger for in-flight capex
4. Capitalization (CIP → Fixed Asset register) integrating with Y-076 (X-34
   asset-manager)
5. Budget vs actual variance tracking
6. Milestones (planned vs actual, progress payments)
7. Post-implementation NPV / IRR / payback analysis
8. Kill-switch cancellation that preserves full history
9. 12-month post-installation lookback

Zero third-party dependencies, bilingual (Hebrew / English) throughout.

### Files produced

| Path | Purpose | LOC |
|---|---|---|
| `onyx-procurement/src/finance/capital-projects.js` | Core engine (`CapitalProjectsTracker`) | ~780 |
| `onyx-procurement/test/finance/capital-projects.test.js` | Unit tests (45 cases, `node --test`) | ~570 |
| `_qa-reports/AG-Y077-capital-projects.md` | This report | — |

Both directories (`src/finance/`, `test/finance/`) are created as additive
upgrades; no existing files were deleted or overwritten.

---

## 2. Public API surface — `CapitalProjectsTracker`

| Method | Purpose |
|---|---|
| `initiateProject({ id?, name_he, name_en, sponsor, budgetRequested, useCase, estimatedPayback?, estimatedNPV?, estimatedIRR? })` | Create a new project in status `INITIATED` with a full business case |
| `approvalWorkflow(projectId)` | Assign the approval route by budget tier and (for AUTO tier) auto-approve |
| `decide(projectId, { approver, decision, role?, note? })` | Record a decision on a pending approval slot; multi-signature is supported for the CEO + Board tier |
| `recordExpenditure({ projectId, invoice, vendor, amount, category, memo?, date? })` | Post a cost to the CIP sub-ledger; bumps project to `IN_PROGRESS` |
| `capitalize(projectId, { completionDate, assetCategories })` | Transfer the CIP balance into one or more fixed-asset register entries via the Y-076 / X-34 asset store |
| `budgetVsActual(projectId)` | Return `{ budget, actual, variance, variance_pct, overrun }` |
| `milestone(projectId, { name, name_he?, plannedDate?, actualDate?, payment? })` | Create or upgrade a milestone — planned date preserved on updates |
| `npvReview({ projectId, cashflows, discountRate })` | Record a discounted cashflow review with NPV / IRR / payback results |
| `paybackAnalysis(projectId)` | Compare estimated vs actual payback from the most recent review |
| `postInstallationReview(projectId, monthsOrOpts)` | 12-month lookback; synthesizes cashflows from milestones if none supplied |
| `killSwitch({ projectId, reason })` | Cancel a non-capitalized project, write off any CIP balance, preserve full history |
| `getProject(projectId)` | Frozen deep-clone of the current project state |
| `listProjects(filter?)` | Enumerate all projects (including cancelled / rejected) |
| `exportCIPSubledger()` | Full append-only CIP ledger for GL / audit feeds |
| `exportJournal()` | Full append-only audit journal (approvals, postings, capitalizations, write-offs) |

### 2.1 Exported helpers (pure math)

`npv(cashflows, rate)`, `irr(cashflows, guess?)`, `payback(cashflows)`,
`round2`, `round4` — plus the constants `APPROVAL_TIERS`, `STATUSES`,
`USE_CASES`, `DEFAULT_ACCOUNTS`.

All ledgers (`_projects`, `_cipLedger`, `_journal`, each project's
`history` / `expenditures` / `milestones` / `reviews`) are **append-only**
JavaScript arrays. Nothing the class exposes can shrink state — even the
`killSwitch` only sets `status: CANCELLED` and writes an offsetting journal
entry.

---

## 3. Approval thresholds (₪)

| Tier | Budget band | Roles required | Auto? | `STATUSES` transition |
|---|---|---|---|---|
| **AUTO** | < 50,000 ₪ | `SYSTEM` | ✔ | `INITIATED → APPROVED` |
| **MANAGER** — מנהל מחלקה | 50,000 – 500,000 ₪ | Department manager | ✘ | `INITIATED → PENDING_APPROVAL → APPROVED` |
| **CFO** — סמנכ"ל כספים | 500,001 – 5,000,000 ₪ | CFO | ✘ | `INITIATED → PENDING_APPROVAL → APPROVED` |
| **CEO_BOARD** — מנכ"ל + דירקטוריון | > 5,000,000 ₪ | **CEO + Board of Directors** (two signatures) | ✘ | Both signatures required before status flips to `APPROVED` |

### 3.1 Routing contract

- Exactly **50,000 ₪** falls in the MANAGER band (strict `<` threshold for AUTO).
- Exactly **500,000 ₪** falls in the MANAGER band.
- **500,001 ₪** routes to CFO.
- **5,000,000 ₪** falls in the CFO band.
- **5,000,001 ₪** routes to CEO_BOARD.
- A REJECTED decision is terminal — no retries within the same project
  record (open a new project to re-request, preserving the rejected one).
- Approval and rejection decisions are both recorded in `history` and in
  `_journal` for audit.

---

## 4. CIP accounting (Construction In Progress)

### 4.1 GL postings

| Event | DR | CR | Comment |
|---|---|---|---|
| `recordExpenditure` | `1520 — Construction In Progress` | `2105 — AP Capital` | Per-invoice posting, append-only to `_cipLedger` |
| `capitalize` | `1500 — Property, Plant & Equipment` | `1520 — Construction In Progress` | Zeros the project's CIP balance; one asset per `assetCategories` entry |
| `killSwitch` (with open CIP) | `1599 — Capex Clearing` | `1520 — Construction In Progress` | Preserves history; no amount is lost from the trial balance |

Account numbers are the defaults — every instance can override via
`new CapitalProjectsTracker({ accounts: { CIP: 'xxxx', ... } })`.

### 4.2 CIP balance invariants

- A project's `cip_balance` is monotonically non-decreasing until
  `capitalize()` (which zeros it) or `killSwitch()` (which leaves the
  balance on the project record but books the offsetting write-off via
  the journal).
- `exportCIPSubledger()` returns a shallow clone — consumer mutations
  cannot affect internal state (guaranteed by dedicated test).
- CIP-to-FA transfers are validated with a ±0.01 ₪ tolerance; any
  mismatch between the sum of `assetCategories[].amount` and the project's
  `cip_balance` throws, preventing silent leakage.

### 4.3 Integration with Y-076 (X-34 asset-manager)

`capitalize()` accepts an optional `assetStore` adapter at construction
time. When provided, each entry in `assetCategories` is forwarded to
`assetStore.addAsset()` with the X-34 field contract:

```js
{
  category,            // matches CATEGORY_RATES key in asset-manager
  name, name_he,
  cost,                // = assetCategory.amount
  salvage_value,       // default 0
  acquisition_date,    // = completionDate
  useful_life_years,   // optional — defaults to category's implied life
  depreciation_method, // default 'straight_line'
  location, custodian, serial_no,
}
```

When no `assetStore` is supplied the engine records a shadow asset id
(`SHADOW-FA-nnnnnn`) so the capitalization flow remains self-testable
without pulling in the full asset-manager module.

---

## 5. Review cadence

| Trigger | Method | Typical timing | Discount rate default |
|---|---|---|---|
| Business-case gate (pre-approval) | `initiateProject` stores `estimatedNPV/IRR/Payback` | At initiation | Sponsor-supplied |
| Mid-project sanity check | `budgetVsActual` | Monthly close, or on milestone delivery | n/a (variance only) |
| Pre-capitalization readiness | `npvReview` | Just before `capitalize()` | Sponsor-supplied |
| **Post-installation lookback (12 mo)** | `postInstallationReview(projectId, 12)` | 12 months after `capitalized_at` | **8% (Israeli cost-of-capital default, 2026)** |
| Extended lookbacks (24 / 36 mo) | `postInstallationReview(projectId, { months: 24, ... })` | Annual thereafter | Sponsor-supplied |
| Ad-hoc re-forecast | `npvReview` / `paybackAnalysis` | On demand | Sponsor-supplied |

The post-installation review compares realized NPV, IRR and payback
against the original estimates and tags the verdict as `ON_TRACK` or
`UNDERPERFORMING`.

---

## 6. Pure financial math

### 6.1 NPV

```
NPV = Σ_{i=0..N} CF_i / (1 + r)^i
```

- `cashflows[0]` is the initial outflow (typically negative).
- `rate` is a decimal period rate (0.10 = 10% per period).
- `r <= -1` throws.
- Rounds to 2 decimals.

### 6.2 IRR

Solved via Newton-Raphson seeded at `guess` (default 0.10), with a
bisection fallback on the interval `[-0.9999, 10]` (widened if needed).
Returns `null` when the cashflow series has no sign change (no IRR
possible). Rounds to 4 decimals.

### 6.3 Payback

Linear pro-rata of the final partial year. Returns `null` when recovery
is never achieved within the supplied series. Rounds to 4 decimals.

Test coverage on the math module:
- classic textbook example `[-1000, 500, 500, 500] @ 10%` → NPV ≈ 243.43, IRR ≈ 0.2338
- zero-rate NPV collapses to sum
- all-positive / all-negative cashflows → IRR `null`
- 4-year even recovery → payback 4.0
- pro-rated partial year → `[-1000, 400, 400, 400]` → payback 2.5
- never-recovered series → payback `null`

---

## 7. Test matrix (45 cases, 100% passing)

| Area | Tests |
|---|---|
| Pure math (NPV / IRR / payback) | 8 |
| Project initiation + validation | 4 |
| Approval routing (AUTO / MANAGER / CFO / CEO_BOARD) | 6 |
| Approval decisions (approve, reject, multi-sig) | 3 |
| CIP expenditure posting | 3 |
| Capitalize (shadow + store adapter) | 3 |
| Budget vs actual variance | 3 |
| Milestones | 2 |
| NPV / payback reviews | 3 |
| Post-installation review | 2 |
| Kill-switch | 3 |
| Append-only / bilingual / journal invariants | 5 |
| **Total** | **45** |

Run with:

```sh
node --test onyx-procurement/test/finance/capital-projects.test.js
```

---

## 8. Hebrew glossary (מילון מונחים)

| English | עברית | Context |
|---|---|---|
| Capital project | פרויקט הוני | Root entity of this module |
| Capital expenditure (capex) | הוצאות הוניות | Project cost classification |
| Construction in Progress (CIP) | בהקמה / רכוש בהקמה | Asset-side sub-ledger `1520` |
| Property, Plant & Equipment (PP&E) | רכוש קבוע | Target GL account `1500` on capitalization |
| Capitalization | היוון / הכרה כנכס | Transfer of CIP into the FA register |
| Approval workflow | תהליך אישור | Budget-tiered routing |
| Auto-approved | אישור אוטומטי | Tier `AUTO`, `< 50,000 ₪` |
| Department manager | מנהל מחלקה | Tier `MANAGER`, `≤ 500,000 ₪` |
| Chief Financial Officer | סמנכ"ל כספים | Tier `CFO`, `≤ 5,000,000 ₪` |
| Board of Directors | דירקטוריון | Second signature at the `CEO_BOARD` tier |
| Kill switch | מתג ביטול | Project cancellation preserving history |
| Cancel / cancelled | ביטול / בוטל | Terminal state for killed project |
| Milestone | אבן דרך | Planned / actual delivery checkpoint |
| Progress payment | תשלום התקדמות | Milestone-linked payment |
| Business case | תיק פרויקט / הצדקה עסקית | Content of `initiateProject` |
| Net Present Value (NPV) | ערך נוכחי נקי | Discounted cashflow |
| Internal Rate of Return (IRR) | שיעור תשואה פנימי | Discount rate at which NPV = 0 |
| Payback period | תקופת החזר | Time to recover the investment |
| Discount rate | שיעור היוון | Cost of capital |
| Variance | סטייה / הפרש | Budget vs actual |
| Overrun | חריגה מתקציב | Positive variance |
| Under-run | חיסכון בתקציב | Negative variance |
| Post-installation review | סקירה שלאחר הטמעה | 12-month lookback |
| On track | בהלימה לתכנון | Verdict when NPV ≥ 0 post-install |
| Underperforming | מתחת לציפיות | Verdict when NPV < 0 post-install |
| Use case — growth | צמיחה / הרחבת תפוקה | Project classification |
| Use case — replacement | החלפת רכוש קיים | Project classification |
| Use case — regulatory | ציות רגולטורי | Project classification |
| Use case — cost reduction | הפחתת עלויות | Project classification |
| Use case — capacity | הגדלת קיבולת | Project classification |
| Write-off | מחיקה חשבונאית | Applied to CIP when a project is killed |
| Audit trail | מסלול ביקורת | `history` array, append-only |
| Append-only ledger | ספר רישום הוספה בלבד | Core design invariant |
| Never delete | לא מוחקים | Project rule — state is upgraded, never removed |

---

## 9. Compliance references

- **IAS 16** §§16–22 — Cost of PP&E and directly attributable costs
- **IAS 23** — Capitalization of borrowing costs on qualifying assets
- **IAS 36** — Impairment testing (post-implementation trigger)
- **תקנות מס הכנסה (פחת), תשל"א-1941** — Israeli depreciation schedule
  (applied downstream via the Y-076 / X-34 asset-manager)
- **COSO ERM** — Design inspiration for the tiered approval matrix

---

## 10. Guarantees

- **Never deletes.** `CANCELLED` and `REJECTED` are terminal sinks, not
  removal operations. `listProjects()` returns them just like active
  projects. The CIP sub-ledger, audit journal, and per-project history are
  all append-only and tested as such.
- **Bilingual everywhere.** Every enum (`STATUSES`, `USE_CASES`,
  `APPROVAL_TIERS`) exposes `he` + `en` fields; every project record
  carries `name_he` + `name_en` + `status_he` + `use_case_he` +
  `use_case_en`.
- **Zero dependencies.** Only `node:test` + `node:assert/strict` for tests,
  nothing else from `package.json`. Runs on Node ≥ 18 with no install step.
- **Deterministic math.** NPV / IRR / payback produce identical outputs for
  identical inputs; bisection IRR is bounded at 200 iterations; no
  randomness.
- **Y-076 ready.** `capitalize()` forwards to `assetStore.addAsset()` with
  the X-34 field contract when an `assetStore` is supplied, and records
  shadow asset ids otherwise so the pipeline is always testable.
