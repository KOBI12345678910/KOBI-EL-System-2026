# AG-Y144 — Conflict of Interest Declaration & Tracking Engine

**Agent:** Y-144
**System:** Techno-Kol Uzi mega-ERP / Onyx-Procurement
**Date:** 2026-04-11
**Module:** `onyx-procurement/src/compliance/conflict-of-interest.js`
**Test file:** `onyx-procurement/test/compliance/conflict-of-interest.test.js`
**QA report:** `_qa-reports/AG-Y144-conflict-of-interest.md`
**Status:** PASS — 20 / 20 tests green
**Dependencies:** zero external (`node:crypto` only, built-in)

---

## 1. Mission / מטרה

### English
Declare, track, approve and escalate Conflicts of Interest (COI) for every
employee in the Techno-Kol Uzi group. The engine is a pure, in-memory
Node module built on top of the governance guidance published by
**רשות החברות הממשלתיות** (the Israeli Government Companies Authority),
adapted for a private-sector ERP. It covers the full lifecycle: initial
declaration, severity-based approval chain, mitigation plan, annual
attestation, material change, closure, and cross-checks against
procurement and HR — all append-only, hash-chained, and bilingual.

### עברית (RTL)
‫מנוע הצהרת ומעקב ניגודי עניינים לכל עובדי קבוצת טכנו-קול עוזי.
‫המודול מיושם בנוד נטו (ללא תלות חיצונית), מבוסס על הנחיות רשות
‫החברות הממשלתיות ומותאם לחברה פרטית. הוא מקיף את מחזור החיים המלא:
‫הצהרה ראשונית, שרשרת אישור לפי רמת חומרה, תוכנית הסדרה, הצהרה שנתית,
‫שינוי מהותי, סגירת ניגוד, והצלבה מול רכש ומשאבי אנוש — הכול בלתי ניתן
‫למחיקה, משורשר בגיבוב SHA-256 ודו-לשוני.

> כלל הברזל: **"לא מוחקים רק משדרגים ומגדלים"** — כל הצהרה, הסדרה,
> הימנעות, אישור או סגירה מתווספים ללוג בלי למחוק את הקודמים. סגירה
> היא "הפיכת סטטוס" — הרשומה נשמרת לנצח.

---

## 2. The eight interest types / שמונת סוגי האינטרסים

Per the Government Companies Authority adapted taxonomy:

| # | Type (EN) | סוג (HE) | Default severity | Notes |
|---|---|---|---|---|
| 1 | Financial interest | כספי | LOW → HIGH by amount | ≥ 10k NIS → MEDIUM; ≥ 100k NIS → HIGH |
| 2 | Familial relationship | קרבת משפחה | MEDIUM | Spouse, parent, sibling, child, first-degree |
| 3 | Outside employment | העסקה | CRITICAL | Any paid role at counterparty auto-critical |
| 4 | Ownership stake | בעלות | MEDIUM → CRITICAL by % | <5% MEDIUM; 5-25% HIGH; ≥25% CRITICAL |
| 5 | Directorship / board seat | דירקטוריון | CRITICAL | Any board seat at counterparty |
| 6 | Consulting / advisory | ייעוץ | HIGH | Paid advisory work at counterparty |
| 7 | Political activity | פוליטי | LOW | Disclosure for transparency only |
| 8 | Personal relationship | קשר אישי | LOW | Close friendships, romantic ties |

All eight types are exported as frozen constants from `INTEREST_TYPE`.

---

## 3. Severity & escalation matrix / מטריצת חומרה והסלמה

Severity is computed by `classifySeverity({ type, amount, percentage })`
and drives the approver chain returned by `requiredApproversFor(severity)`.

| Severity | חומרה | Required approver chain | שרשרת אישור נדרשת | Trigger |
|---|---|---|---|---|
| **LOW** | נמוך | `supervisor` | ממונה ישיר | Political / personal-rel / small financial |
| **MEDIUM** | בינוני | `supervisor` → `compliance` | ממונה → ציות | Familial; ownership <5%; financial ≥10k NIS |
| **HIGH** | גבוה | `supervisor` → `compliance` → `ceo` | ממונה → ציות → מנכ"ל | Consulting; ownership 5-25%; financial ≥100k NIS |
| **CRITICAL** | קריטי | `supervisor` → `compliance` → `ceo` → `board` | ממונה → ציות → מנכ"ל → דירקטוריון | Directorship; employment; ownership ≥25% |

**Escalation rule:** `approvalChain()` validates that the exact roles,
in order, appear in the supplied approvers array. Any gap throws and
emits a `declaration.escalated` audit event with
`reason: 'insufficient-approvers'`.

**Re-escalation on material change:** if `materialChange()` raises the
severity (e.g. ownership % grows from 3% to 40%), the status is
automatically flipped back to `pending_approval` and the
`requiredApprovers` list regrows — previously-collected approvals are
kept in the log but the declaration must now walk the full higher chain.

---

## 4. Mitigation options / אפשרויות הסדרה

`MITIGATION` constants — one must be chosen when filing a
`mitigationPlan({declarationId, plan:{option, ...}, approver})`:

| Option | עברית | Description (EN) | תיאור (HE) |
|---|---|---|---|
| `recusal` | הימנעות מהשתתפות | Employee abstains from the specific decision(s) | העובד נמנע מהחלטה ספציפית |
| `divestment` | מימוש החזקות | Employee sells/transfers the interest within a window | מכירה או העברה של ההחזקה בתוך חלון זמן |
| `supervision` | פיקוח מוגבר | Enhanced supervision by supervisor + compliance | פיקוח מוגבר של ממונה וציות |
| `reassignment` | שינוי תפקיד | Reassign the employee to a non-conflicting role | הסטת העובד לתפקיד ללא ניגוד |
| `chinese_wall` | מחיצת סינית | Information barrier: cut off data flow to the employee | חסימת זרימת מידע לעובד |
| `disclosure_only` | גילוי בלבד | Disclosure is the only safeguard (LOW severity only) | הגילוי הוא הסעד היחיד (חומרה נמוכה) |

When a plan is approved the declaration status flips to **`mitigated`**
(עברית: *בהסדרה*).

---

## 5. Public API / ממשק ציבורי

```js
const {
  ConflictOfInterest,
  INTEREST_TYPE,
  DECLARATION_STATUS,
  SEVERITY,
  MITIGATION,
  EVENT_TYPES,
  classifySeverity,
  requiredApproversFor,
} = require('./src/compliance/conflict-of-interest');

const coi = new ConflictOfInterest({ now: () => new Date('2026-04-11') });
coi.setEmployeeDirectory(new Map([['E-001', { department: 'Procurement' }]]));
coi.setVendorDirectory(new Map([['V-900', { name: 'Helios Ltd.' }]]));
```

| Method | Purpose (EN) | מטרה (HE) |
|---|---|---|
| `declareInterest(...)` | File a new declaration | רישום הצהרה חדשה |
| `annualAttestation(...)` | Annual signed attestation row | הצהרה שנתית חתומה |
| `listOpenDeclarations({employeeId})` | All ongoing declarations for employee | כל ההצהרות הפתוחות |
| `checkDecision(...)` | Warn if decision touches a declared interest | אזהרה אם החלטה פוגעת באינטרס מוצהר |
| `recuseFrom(...)` | Append-only recusal log | תיעוד הימנעות |
| `approvalChain(...)` | Walk severity-based approver chain | שרשרת אישור לפי חומרה |
| `mitigationPlan(...)` | Register management/mitigation plan | תוכנית הסדרה |
| `materialChange(...)` | Append-only declaration amendment | תיקון הצהרה (רק בתוספת) |
| `listByDepartment(dept)` | Department-level roll-up | ריכוז מחלקתי |
| `boardReporting(period)` | Anonymised bilingual board report | דוח דירקטוריון מנוטרל שמות |
| `crossCheckWithProcurement(vendorId)` | Flag COI vs a vendor | הצלבה מול ספק |
| `crossCheckWithHR(candidateId)` | Flag familial / personal COI vs a candidate | הצלבה מול מועמד |
| `closure({declarationId, reason, date})` | End an interest (status flip) | סגירת אינטרס (היפוך סטטוס) |
| `auditLog(filter?)` | Append-only SHA-256 chained events | לוג ביקורת משורשר |
| `verifyChain()` | Verify the whole hash chain | אימות שלמות השרשרת |
| `on(event, handler)` | Tiny event emitter | מנוי לאירועים |

---

## 6. Append-only audit chain / שרשרת ביקורת בלתי ניתנת למחיקה

Every public mutation appends one row to the in-memory log. Each row is
chained by SHA-256:

```
event[i].prevHash = event[i-1].hash
event[i].hash     = SHA256(prevHash || stableJSON({seq,type,timestamp,payload}))
```

Event types:

| Constant | Meaning |
|---|---|
| `declaration.created` | `declareInterest()` — new row |
| `declaration.material_change` | `materialChange()` — append amendment |
| `declaration.approved` | `approvalChain()` success |
| `declaration.escalated` | `approvalChain()` rejected — insufficient approvers |
| `declaration.mitigated` | `mitigationPlan()` recorded |
| `declaration.closed` | `closure()` — status flip only, never delete |
| `attestation.recorded` | `annualAttestation()` |
| `decision.checked` / `decision.warned` | `checkDecision()` result |
| `recusal.recorded` | `recuseFrom()` |
| `procurement.crosscheck` | `crossCheckWithProcurement()` |
| `hr.crosscheck` | `crossCheckWithHR()` |
| `board.report.generated` | `boardReporting()` seal |

Tampering with any past event is detected deterministically by
`verifyChain()` — it returns `{valid:false, brokenAt: seq, reason}`.

---

## 7. Cross-checks / הצלבות

### Procurement cross-check
`crossCheckWithProcurement(vendorId)`:
1. Resolves vendor name + aliases from the plugged `VendorDirectory`.
2. Walks every *open* declaration and tests `relatedParty` against
   vendor id, name and aliases (case-insensitive substring match).
3. Emits `procurement.crosscheck` and returns `{flagged, matches[], messageHe, messageEn}`.

Typical call point: before approving a purchase order or signing a
new framework agreement.

### HR cross-check
`crossCheckWithHR(candidateId)`:
1. Resolves candidate name + aliases from the plugged `CandidateDirectory`.
2. Walks declarations of type `familial`, `personal-relationship`, or
   `employment` (anti-nepotism scope).
3. Emits `hr.crosscheck` and returns the same result shape.

Typical call point: during candidate shortlisting — before an offer is
drafted.

---

## 8. Board reporting / דו"ח דירקטוריון

`boardReporting(period, opts?)` returns a frozen bilingual report:

```js
const report = coi.boardReporting({ year: 2026, quarter: 2 });
// report.hebrew / report.english        — printable narratives
// report.totals / report.byType ...     — aggregated counts
// report.declarations[]                 — per-row list with pseudonyms
// report.sha256                         — full-report integrity seal
```

- **Period forms:** `{year}`, `{year, quarter}`, or `{from, to}` ISO window.
- **Anonymisation ON by default** — employee ids are replaced with
  deterministic pseudonyms `EMP-xxxxxxxxxx` (10-hex SHA-256 suffix).
  The same employee maps to the same pseudonym across runs.
- Pass `{ anonymize: false }` for the internal audit version that
  retains raw employee ids. Per governance policy this full version is
  restricted to compliance + legal, never attached to a board packet.

---

## 9. Hebrew glossary / מילון מונחים עברי

| עברית | English | הערה |
|---|---|---|
| ניגוד עניינים | Conflict of Interest (COI) | — |
| הצהרה | Declaration | מסמך רישום הניגוד |
| הצהרה שנתית | Annual attestation | חידוש חתימה שנתי |
| הסדרה / תוכנית הסדרה | Mitigation plan | — |
| הימנעות מהשתתפות | Recusal | — |
| שרשרת אישור | Approval chain | ממונה → ציות → מנכ"ל → דירקטוריון |
| שינוי מהותי | Material change | עדכון תוספתי בלבד |
| הצלבה (רכש / משא"ן) | Procurement / HR cross-check | — |
| סגירה | Closure | הפיכת סטטוס — לא מחיקה |
| חומרה | Severity | LOW / MEDIUM / HIGH / CRITICAL |
| ממונה ישיר | Supervisor | — |
| קצין ציות | Compliance officer | — |
| רשות החברות הממשלתיות | Government Companies Authority | מקור ההנחיות |
| מחיצת סינית | Chinese wall | מחסום מידע |
| מימוש החזקות | Divestment | — |
| פיקוח מוגבר | Enhanced supervision | — |
| דו"ח דירקטוריון | Board report | מנוטרל שמות כברירת מחדל |
| שרשרת גיבוב | Hash chain | SHA-256 append-only |
| רשומה בלתי ניתנת למחיקה | Append-only record | כלל הברזל |

---

## 10. Test coverage / כיסוי בדיקות — 20 / 20 PASS

```
▶ ConflictOfInterest — declare all 8 interest types
  ✔ 1) declareInterest accepts all 8 taxonomy types and stamps bilingual labels
  ✔ 2) unknown type is rejected
  ✔ 3) missing required fields throw
▶ ConflictOfInterest — annual attestation
  ✔ 4) annualAttestation records a signed attestation row and lists openDeclarations
▶ ConflictOfInterest — listOpenDeclarations
  ✔ 5) only ongoing + non-closed declarations are returned
▶ ConflictOfInterest — checkDecision warns on related parties
  ✔ 6) checkDecision emits a warning when decisionMaker has an interest in a related party
▶ ConflictOfInterest — recusal
  ✔ 7) recuseFrom records an append-only recusal row and links back to declarations
▶ ConflictOfInterest — approval escalation ladder
  ✔ 8) LOW / MEDIUM / HIGH / CRITICAL approver chains verified
  ✔ 9) approvalChain requires every mandatory role; insufficient approvers escalate and throw
▶ ConflictOfInterest — mitigation plan
  ✔ 10) mitigationPlan accepts a valid option and flips status to MITIGATED
▶ ConflictOfInterest — material change (append-only)
  ✔ 11) materialChange preserves history and re-opens approval if severity rises
▶ ConflictOfInterest — listByDepartment
  ✔ 12) listByDepartment aggregates declarations by employee department
▶ ConflictOfInterest — board reporting (anonymised, bilingual)
  ✔ 13) boardReporting returns HE + EN narrative with anonymised pseudonyms and SHA seal
▶ ConflictOfInterest — procurement cross-check
  ✔ 14) crossCheckWithProcurement flags open declarations against a vendor by id or name
▶ ConflictOfInterest — HR cross-check
  ✔ 15) crossCheckWithHR flags familial / personal matches against a candidate
▶ ConflictOfInterest — closure preserves record
  ✔ 16) closure flips status but never hard-deletes the declaration
▶ ConflictOfInterest — audit chain integrity
  ✔ 17) audit log is append-only with a valid SHA-256 hash chain
  ✔ 18) event emitter fires on declaration and closure lifecycle events
▶ ConflictOfInterest — constants & frozen snapshots
  ✔ 19) interest type constants are immutable and complete
  ✔ 20) snapshots returned by get() are frozen and cannot be mutated

ℹ tests 20
ℹ pass  20
ℹ fail  0
ℹ duration_ms 112
```

Run locally with:

```bash
node --test onyx-procurement/test/compliance/conflict-of-interest.test.js
```

---

## 11. Immutable rules (reaffirmed) / כללי הברזל

1. **"לא מוחקים רק משדרגים ומגדלים"** — all mutations are append-only.
   `closure()` flips a status flag; the original declaration row is
   preserved forever. The audit chain is never pruned.
2. **Zero external dependencies** — only `node:crypto` from the
   standard library. Runs on any Node ≥ 14.
3. **Bilingual first-class** — every public surface carries both Hebrew
   (RTL) and English strings and includes `direction.he = 'rtl'`.
4. **Israeli governance lineage** — taxonomy, severity ladder and
   approval chain are adapted from רשות החברות הממשלתיות guidance for
   government companies, re-scoped for this private-sector group.

---

**End of report — AG-Y144**
