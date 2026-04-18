# AG-Y056 — Construction Progress Billing (חיוב התקדמות)

**Domain:** Techno-Kol Uzi — construction general-contracting
**Module:** `onyx-procurement/src/construction/progress-billing.js`
**Tests:** `onyx-procurement/test/construction/progress-billing.test.js`
**Rule:** לא מוחקים רק משדרגים ומגדלים (never delete, only upgrade and grow)
**Status:** PASS — 30 / 30 tests green (`node --test test/construction/progress-billing.test.js`)

---

## 1. Purpose

Implements **progress-billing** (חשבונות חלקיים) for construction projects run
by Techno-Kol Uzi — adapting the AIA **G702 "Application and Certificate for
Payment"** and **G703 "Continuation Sheet"** to Israeli practice. Every BOQ
(כתב כמויות) line is tracked draw-by-draw; every draw passes through
submit → architect approval → payment → lien-waiver, with retention and
pay-when-paid subcontractor tracking baked in.

Zero dependencies. Bilingual (he/en). Append-only audit log.

---

## 2. Public API

| Method                                                    | Purpose                                                  |
|-----------------------------------------------------------|----------------------------------------------------------|
| `defineContract({projectId, client, contractor, ...})`    | Open a contract with BOQ + retention                    |
| `submitPayment({contractId, period, completedToDate})`    | Monthly draw (חשבון חלקי N)                             |
| `computeG702(contractId, period)`                         | 9-line AIA G702 payment certificate                     |
| `computeG703(contractId, period)`                         | Line-item Schedule of Values (10 columns A–J)           |
| `approveBilling(billingId, approver, notes)`              | Engineer/architect certification                        |
| `changeOrder({contractId, description, amount, days})`    | הזמנת שינויים + schedule impact                          |
| `approveChangeOrder(contractId, coId, approver)`          | Flip pending CO → approved                              |
| `retentionRelease(contractId, {pct, date, conditions})`   | Release ערבות ביצוע (partial or final)                  |
| `lienWaiver(billingId, type)`                             | Issue a lien waiver (4 types)                           |
| `subcontractorPayments(contractId[, registration])`       | Pay-when-paid tracker for קבלני משנה                    |
| `markBillingPaid(billingId)`                              | approved → paid (unlocks eligible sub draws)            |

---

## 3. G702 Layout (9 lines, Hebrew + English)

| # | Hebrew                                    | English                               | Formula               |
|---|-------------------------------------------|---------------------------------------|-----------------------|
| 1 | סכום חוזה מקורי                            | Original contract sum                 | `contract.totalAmount`|
| 2 | שינויים נטו (הזמנות שינויים מאושרות)        | Net change by change orders           | `Σ approved COs`      |
| 3 | סכום חוזה מעודכן                            | Contract sum to date                  | `(1) + (2)`           |
| 4 | סה״כ עבודה שבוצעה וחומר במחסן              | Total completed + stored              | `(4a) + (4b)`         |
| 4a| עבודה שבוצעה                               | Work completed                        | `Σ line.qty × price`  |
| 4b| חומר במחסן                                  | Stored materials                      | `billing.stored`      |
| 5a| עיכבון על ביצוע                             | Retention on work                     | `(4a) × ret%`         |
| 5b| עיכבון על חומר                              | Retention on stored                   | `(4b) × ret%`         |
| 5 | סה״כ עיכבון                                 | Total retention                       | `(5a) + (5b)`         |
| 6 | נטו צבור בניכוי עיכבון                     | Total earned less retention           | `(4) − (5)`           |
| 7 | חשבונות קודמים                              | Less previous certificates            | `Σ prior (4−5)`       |
| 8 | לתשלום בחשבון זה                            | **Current payment due**               | `(6) − (7)`           |
| 9 | יתרה לגמר כולל עיכבון                      | Balance to finish incl. retention     | `(3) − (6)`           |

The module emits the nine lines as an object keyed `line1..line9` plus
explicit `labels_he` / `labels_en` maps — so a front-end can render the
certificate bilingually without hard-coding strings.

---

## 4. G703 Layout (10 columns per BOQ line)

| Col | Hebrew                    | English                    |
|-----|---------------------------|----------------------------|
| A   | מס׳ סעיף                    | Line / BOQ ID              |
| B   | תיאור העבודה                | Description                |
| C   | ערך מתוכנן                  | Scheduled Value            |
| D   | בוצע בחשבונות קודמים        | From Previous certificates |
| E   | בתקופה זו                    | This Period                |
| F   | חומר במחסן                   | Stored Materials           |
| G   | סה״כ מצטבר                   | Total Completed & Stored   |
| H   | אחוז ביצוע                    | % Complete                 |
| I   | יתרה לגמר                     | Balance to Finish          |
| J   | עיכבון                        | Retention                  |

**Invariant:** `G703.totals.colG == G702.line4_totalCompletedAndStored`
(verified in test `row totals equal line-item sum and tie to G702`).

**Cumulative convention:** `completedToDate` on every draw is **cumulative**
(AIA standard), not incremental. Col E (this-period) is computed by the
module as `cumulative − max(prior cumulative)` per line. This matches how
Israeli engineers (מהנדסי פרויקט) read the כתב כמויות חלקי.

---

## 5. Israeli construction-law context

### 5.1 Retention (עיכבון / ערבות ביצוע)

| Aspect              | Value / Rule                                                    |
|---------------------|-----------------------------------------------------------------|
| Default %           | **10 %** (`DEFAULT_RETENTION_PCT`)                              |
| Min seen in market  | 5 % (private single-family custom work)                        |
| Max seen in market  | 15 % (public-works tenders: משכ"ל, משב"ש, עיריות)                |
| Legal basis         | חוק חוזה קבלנות, תשל"ד-1974                                      |
| Trigger for release | תעודת גמר / תעודת השלמה (certificate of completion)             |
| Typical split       | 50% at substantial completion, 50% at end of bedek period       |
| Bedek period        | תקופת בדק — usually 12 months; may be 24 for structural work    |
| Enforcement         | ערבות בנקאית autonomous or withheld cash in escrow              |

The module stores retention percent per-contract and per-draw (draws can
override for a one-off adjustment), computes retention on *both* work
completed and stored materials (G702 lines 5a / 5b separately), and keeps
release events in `retentionEvents[contractId]` with a cumulative-% cap at
100 %.

### 5.2 Change orders (הזמנות שינויים)

| Aspect               | Value / Rule                                               |
|----------------------|------------------------------------------------------------|
| Legal requirement    | Written + signed by client and contractor                 |
| Schedule impact      | Must be agreed before execution (`scheduleImpactDays`)    |
| Approval flow        | Usually: supervising engineer → project manager → owner   |
| Default state        | `approved: false` — G702 line 2 only includes approved    |
| Credit COs           | Negative `amount` allowed (value engineering savings)      |

The module auto-shifts the contract `endDate` forward by
`scheduleImpactDays` when a CO is registered (positive or negative). Audit
log entry `changeOrder` is written on every call; `approveChangeOrder`
updates state without overwriting history.

### 5.3 Lien waivers (שעבוד בנאים / ויתור שעבוד)

| Type          | AIA form | Hebrew                | Effective?          |
|---------------|----------|-----------------------|---------------------|
| Conditional   | G706     | ויתור מותנה            | only after payment  |
| Unconditional | G706     | ויתור ללא תנאי        | immediately         |
| Partial       | G706     | ויתור חלקי             | this draw only      |
| Final         | G706A    | ויתור סופי             | all further claims  |

Israeli law treats a properly executed lien waiver as an estoppel against
future mechanics-lien claims (שעבוד בנאים) once the underlying payment has
cleared. The module stamps every waiver with:

- `effective: true` only for `unconditional` / `final`
- `pendingPayment: true` for `conditional` / `partial`
- `coveredAmount = workCompleted + storedMaterials` from the parent draw
- `legalBasis_he = 'חוק חוזה קבלנות, התשל"ד-1974 — ויתור שעבוד בנאים'`

### 5.4 Pay-when-paid (שלם כאשר שולם)

Israeli contractors routinely flow a "pay-when-paid" clause down to
subcontractors (קבלני משנה) — the sub gets paid only when the main
contractor has received payment from the project owner. Enforceability
varies by jurisdiction, but the accounting discipline is universal.

The module tracks this with `subcontractorPayments(contractId, reg)`:

```js
pb.subcontractorPayments(contractId, {
  billingId: 'B-...',              // parent draw
  sub: { id: 'SUB-ELEC-001' },     // subcontractor reference
  amount: 40000,                    // ILS
  scope: 'Electrical rough-in',
});
```

Query mode (`subcontractorPayments(contractId)` with no second arg) returns
`{ draws, eligible, waiting, settled, eligibleTotal, waitingTotal, settledTotal }`
re-partitioned every call based on the parent billing's current `paid`
state.

---

## 6. BOQ Units (9-entry catalog)

| id    | Hebrew         | English         |
|-------|----------------|-----------------|
| `m`   | מטר            | Linear meter    |
| `m2`  | מ״ר             | Square meter    |
| `m3`  | מ״ק             | Cubic meter     |
| `ton` | טון             | Metric ton      |
| `kg`  | ק״ג             | Kilogram        |
| `unit`| יחידה           | Each / unit     |
| `lump`| סכום גלובלי     | Lump sum        |
| `hr`  | שעה             | Hour            |
| `day` | יום             | Day             |

Unknown unit strings are accepted (no reject) but the module will mirror
them untranslated into `unit_he` / `unit_en`.

---

## 7. Hebrew glossary

| English                               | Hebrew                           | Notes                          |
|---------------------------------------|----------------------------------|--------------------------------|
| Progress billing / draw               | חשבון חלקי                       | G702 equivalent                |
| Bill of quantities                    | כתב כמויות                       | BOQ                            |
| Line item                             | סעיף                             | G703 row                       |
| Scheduled value                       | ערך מתוכנן                        | G703 col C                     |
| Work completed                        | עבודה שבוצעה                      | G702 line 4a                   |
| Stored materials                      | חומר במחסן                        | G702 line 4b                   |
| Retention                             | עיכבון / ערבות ביצוע              | G702 line 5, G703 col J        |
| Change order                          | הזמנת שינויים                     | G702 line 2                    |
| Schedule impact                       | השפעה על לוח זמנים                 | days added/subtracted          |
| Certificate of payment                | תעודת תשלום                       | approved G702                  |
| Project engineer                      | מהנדס פרויקט                      | typical approver               |
| Architect                             | אדריכל                            | alternative approver           |
| Owner / client                        | מזמין העבודה                      | pays the draw                  |
| General contractor                    | קבלן ראשי                         | Techno-Kol Uzi                |
| Subcontractor                         | קבלן משנה                         | tracked via sub draws          |
| Pay-when-paid                         | שלם כאשר שולם                      | gating rule                    |
| Construction / mechanics lien         | שעבוד בנאים                        | statutory                      |
| Lien waiver                           | ויתור שעבוד                       | G706 / G706A equivalent        |
| Conditional                           | מותנה                            | pending payment                |
| Unconditional                         | ללא תנאי                         | immediate effect               |
| Partial                               | חלקי                             | covers this draw only          |
| Final                                 | סופי                             | closes contract lien rights    |
| Substantial completion                | השלמה מהותית                      | release half of retention      |
| Final completion                      | גמר מוחלט                         | release remaining retention    |
| Bedek (warranty / defects) period     | תקופת בדק                         | 12–24 months post-completion   |
| Certificate of completion             | תעודת השלמה                       | triggers retention release     |

---

## 8. Test coverage

30 tests, all green. Suites:

| Suite                     | # tests | Key assertions                                                     |
|---------------------------|---------|--------------------------------------------------------------------|
| `defineContract`          | 4       | BOQ normalization, retention default, reject empty/invalid         |
| `submitPayment`           | 2       | `completedPct` → `completedQty`, reject qty > BOQ                 |
| `computeG702`             | 5       | 9-line math, multi-draw, COs, stored materials + retention, labels |
| `computeG703`             | 3       | row/totals tie, col D from prior draws, bilingual labels           |
| `changeOrder`             | 3       | positive + negative amount, schedule impact, approval flip         |
| `approval workflow`       | 2       | state machine guards                                               |
| `retentionRelease`        | 3       | amount math, cumulative cap, final label                           |
| `lienWaiver`              | 4       | all 4 types, effective flag, reject invalid                        |
| `subcontractorPayments`   | 2       | pay-when-paid partition, multiple subs                             |
| `append-only audit log`   | 2       | audit coverage, re-define pushes history                           |

Run:

```bash
cd onyx-procurement
node --test test/construction/progress-billing.test.js
```

---

## 9. Append-only invariant (לא מוחקים רק משדרגים ומגדלים)

- **Contracts:** re-calling `defineContract` with the same `contractId`
  pushes the previous shape into `contract.history[]`. Unit test
  `re-define contract pushes old shape to history` asserts it.
- **Billings:** every state change (`submitted → approved → paid`) pushes
  the previous state into `billing.history[]`.
- **Change orders:** `approveChangeOrder` saves `{approved, approvedAt,
  approvedBy}` into `co.history[]` before mutating.
- **Retention events, lien waivers, sub draws:** all stored in
  per-contract arrays and never mutated or removed.
- **Audit log:** every public mutation writes an entry to `auditLog[]`
  with `{ts, action, payload}`. Tested by `every mutation leaves an audit
  entry`.

---

## 10. Known limitations / future work

- **VAT (מע"מ):** current implementation returns the G702 lines ex-VAT.
  A future agent (AG-Y057) will wrap the certificate with a מע"מ
  gross-up using `src/vat/pcn836.js` rates.
- **Multi-contract rollup:** G702/G703 are per-contract. A portfolio
  summary across projects is planned for AG-Y058.
- **Stored materials by line:** col F on G703 is currently doc-level
  (totals row only). Per-line tracking will land when we wire WMS
  locations to BOQ items.
- **PDF generation:** module returns pure JSON. A `g702-pdf-generator.js`
  twin (analogous to `invoice-pdf-generator.js`) will render the
  certificate as a signed PDF.
- **Subcontractor lien chain:** the module tracks sub draws but does not
  yet issue sub-level G706 waivers. Planned for AG-Y059.

---

## 11. File locations

| Role              | Absolute path                                                                                                  |
|-------------------|----------------------------------------------------------------------------------------------------------------|
| Module            | `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\src\construction\progress-billing.js`       |
| Tests             | `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\test\construction\progress-billing.test.js` |
| Report (this)     | `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\_qa-reports\AG-Y056-progress-billing.md`                     |

---

**Agent:** Y-056
**Swarm:** Construction
**Rule:** לא מוחקים — רק משדרגים ומגדלים
