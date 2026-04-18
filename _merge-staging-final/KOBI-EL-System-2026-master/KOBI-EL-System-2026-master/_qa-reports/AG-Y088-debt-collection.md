# AG-Y088 — Debt Collection Workflow (גבייה משפטית)

**Agent:** Y-088
**Swarm:** 4F — Finance Operations
**Wave:** 2026
**Module:** `onyx-procurement/src/finance/debt-collection.js`
**Tests:** `onyx-procurement/test/finance/debt-collection.test.js`
**Status:** IMPLEMENTED — 68 / 68 passing
**Complements:** X-48 dunning (`src/collections/dunning.js`) — X-48 owns the
soft AR-aging / reminder loop; Y-088 owns the deeper legal collection side.
**Rule of the house:** לא מוחקים רק משדרגים ומגדלים —
file never to be deleted, only enhanced.

---

## 0. Legal Disclaimer / הצהרה משפטית

> **This module tracks debt-collection workflow and generates legal-letter
> templates. The generated texts are TEMPLATES ONLY and do not constitute
> legal advice. Any actual legal action — filing a claim, opening an
> Execution Office file (הוצאה לפועל), or suing in any court — must be
> performed by or under the direct supervision of a licensed Israeli
> attorney (עורך דין הרשום בלשכת עורכי הדין של ישראל).**
>
> **המודול מנהל תהליך גבייה בלבד. הטקסטים המשפטיים שמופקים הם תבניות בלבד
> ואינם מהווים ייעוץ משפטי. כל פעולה משפטית בפועל — הגשת תביעה, פתיחת תיק
> הוצאה לפועל, תביעה בבית משפט לתביעות קטנות או בכל ערכאה אחרת — מחייבת
> עורך דין מוסמך הרשום בלשכת עורכי הדין של ישראל.**

Every generated letter carries a bilingual disclaimer block; every step in
the ladder emits `legalNotice` / `legalNoticeHe` reminders. Users of the
system cannot accidentally "auto-file" a court claim — the module only
prepares the data packets.

---

## 1. Purpose

End-to-end debt-collection engine for the Israeli market, covering the
legal escalation that X-48 dunning intentionally stops short of. Implements:

- **9-step escalation ladder** (60 days → write-off) with bilingual labels,
  legal-weight scoring, and automatic clamping by debt size vs. court
  jurisdiction.
- **Action ledger** per customer — append-only, never deletes (rule of the
  house).
- **Bilingual legal-letter templates** (pre-suit / final demand / court
  summons) with embedded disclaimer and law citations.
- **Default court interest** calculator per `חוק פסיקת ריבית והצמדה,
  תשכ"א-1961` — simple, actual/365, 4% p.a.
- **Promissory notes (שטר חוב)** registry with overdue detection and
  protest guidance per פקודת השטרות.
- **Execution Office (הוצאה לפועל)** case preparation — checklist, required
  documents, citation to חוק ההוצאה לפועל, תשכ"ז-1967.
- **Escrowed settlements** (פשרה בנאמנות) — negotiated partial payment held
  in escrow until conditions are satisfied.
- **Bad-debt write-off** with balanced journal entry + tax-deductibility
  flag per § 17(4) of פקודת מס הכנסה and VAT relief per § 49 of חוק מע"מ.
- **Post-write-off recovery** — re-income event with proper split between
  reversal of the prior expense and any excess (late interest / penalty).

Designed to plug into:
- the CRM customer record (customerId join)
- the AR aging from `src/collections/dunning.js`
- the GL / accounting engine (balanced journal entries)
- the attorney portal (sends LTR-* artifacts)

---

## 2. Public API

```js
const {
  DebtCollection,
  CONSTANTS,
  LAW_CITATIONS,
  ESCALATION_LADDER,
  LETTER_TYPES,
  ACTION_OUTCOMES,
} = require('./src/finance/debt-collection');

const dc = new DebtCollection({ today: '2026-04-11' });

// 1. Ladder — recommended step for a debt
const ladder = dc.escalationLadder({
  customerId: 'C-7',
  debtAmount: 12000,
  dueDate: '2025-12-01',
});

// 2. Record an action
dc.recordAction({
  customerId: 'C-7',
  step: 1,
  date: '2026-01-30',
  outcome: 'sent',
  notes: 'soft reminder by email',
});

// 3. Generate a legal-letter template
const letter = dc.generateLegalLetter({
  customerId: 'C-7',
  debtAmount: 12000,
  type: 'pre-suit',
  dueDate: '2025-12-01',
});

// 4. Late interest
const interest = dc.computeLateInterest({
  principal: 12000,
  periodStart: '2025-12-01',
  rate: 0.04, // optional override
});

// 5. Promissory note register / query
dc.promissoryNoteHandling({
  customerId: 'C-7',
  register: { amount: 15000, issueDate: '2025-10-01', dueDate: '2026-02-01' },
});
const allNotes = dc.promissoryNoteHandling('C-7');

// 6. Execution Office
const eoCase = dc.executionOfficeRegistration({
  customerId: 'C-7',
  judgmentId: 'J-2026-0091',
  amount: 13200,
  courtName: 'בית משפט השלום תל אביב',
});

// 7. Escrowed settlement
const settlement = dc.escrowedSettlement({
  customerId: 'C-7',
  settleAmount: 8000,
  originalDebt: 12000,
  conditions: ['payment within 14 days', 'signed release'],
});

// 8. Write-off + tax
const wo = dc.writeOff({
  customerId: 'C-7',
  amount: 12000,
  reason: 'debtor insolvent — 24 months overdue',
  approver: 'cfo',
});

// 9. Later recovery
const rec = dc.recoveryLater({
  writeOffId: wo.id,
  recovered: 5000,
});
```

### Class `DebtCollection(options?)`

| Option   | Type   | Meaning |
|----------|--------|---------|
| `today`  | string | ISO date used as "now" — makes reports deterministic for tests |
| `logger` | object | Optional BYO logger (`info`, `warn`, `error`) |

### Methods

| Method                         | Mutates? | Returns                              |
|--------------------------------|----------|--------------------------------------|
| `escalationLadder`             | no       | frozen ladder envelope               |
| `recordAction`                 | yes      | frozen action record                 |
| `actionsFor`                   | no       | frozen array                         |
| `generateLegalLetter`          | yes*     | frozen letter (persisted)            |
| `computeLateInterest`          | no       | frozen calculation                   |
| `promissoryNoteHandling`       | yes*     | frozen envelope                      |
| `executionOfficeRegistration`  | yes      | frozen case                          |
| `escrowedSettlement`           | yes      | frozen settlement                    |
| `writeOff`                     | yes      | frozen write-off + journal           |
| `recoveryLater`                | yes      | frozen recovery + journal            |
| `snapshot`                     | no       | frozen deep snapshot of all ledgers  |

*= also appends to persistent ledger; can be called in a read-only mode.

**Append-only:** every write creates a new `Object.freeze`d record and
appends it. Nothing is ever removed. The original AR line stays flagged as
`written_off` forever, and subsequent recoveries are **new rows** rather
than mutations.

---

## 3. Escalation Ladder (9 Steps)

| # | Key                 | Day (post-due) | Hebrew                                | English                                 | Channel               |
|---|---------------------|----------------|---------------------------------------|------------------------------------------|-----------------------|
| 1 | `soft_reminder`     | 60             | תזכורת רכה                            | Soft reminder                            | email / sms           |
| 2 | `firm_letter`       | 75             | מכתב נמרץ                             | Firm letter                              | email / mail          |
| 3 | `phone_call`        | 90             | שיחת טלפון + תיעוד                    | Phone call (logged)                      | phone                 |
| 4 | `final_demand`      | 105            | מכתב דרישה סופית                      | Final demand letter                      | registered mail       |
| 5 | `legal_letter`      | 120            | מכתב התראה לפני תביעה                 | Pre-suit legal notice                    | registered + attorney |
| 6 | `small_claims`      | 135            | תביעה בבית משפט לתביעות קטנות (≤34,600)| Small Claims Court (cap 34,600)         | court filing          |
| 7 | `district_court`    | 135            | תביעה בבית משפט השלום / המחוזי        | Magistrate / District Court              | court filing          |
| 8 | `execution_office`  | 180            | פתיחת תיק בהוצאה לפועל                | Execution Office registration            | Hotza'a la-Po'al       |
| 9 | `write_off`         | 365            | מחיקה חשבונאית + טיפול מס              | Write-off and tax treatment              | internal journal      |

**Gating rules enforced by the code:**
- **Step 6** (small claims) is marked `available: false` when debt exceeds
  NIS 34,600 — system auto-routes the user to step 7 (district court).
- **Step 8** (execution office) carries the `requires: 'judgment_or_bill'`
  flag — you cannot legally open a הוצאה לפועל file without either a
  court judgment or an unpaid promissory note / bounced post-dated check.
- **Statute-of-limitations** warning fires when the debt approaches its
  7-year prescription under `חוק ההתיישנות, תשי"ח-1958`.

---

## 4. Israeli Collection Process — Summary for Users

### 4.1 Phase 1 — Private (steps 1-4, days 60-105)
No court involvement. These are the escalating reminders. Track every
touch with `recordAction()` — attorneys will ask for this paper trail
later when filing suit (evidence of good-faith collection efforts).

### 4.2 Phase 2 — Legal notice (step 5, day 120)
`מכתב התראה לפני תביעה` — sent by registered mail (preferably through an
attorney so the letterhead has legal weight). Standard Israeli practice:
**14 days** from receipt to settle. The letter recites the debt, the
interest calculation, and the law (`חוק פסיקת ריבית והצמדה`).

### 4.3 Phase 3 — Court filing (steps 6-7)
Two tracks based on debt size:

**Small Claims Court (בית משפט לתביעות קטנות)**
- Jurisdiction cap: **NIS 34,600 (2026)** — updated annually by the
  Minister of Justice; current value lives in `CONSTANTS.SMALL_CLAIMS_CAP_ILS`.
- Private individuals only; **a corporation can NOT sue in small claims**
  except in very narrow circumstances. Caller must verify.
- Max **5 claims per year** per plaintiff in this forum.
- No lawyer required — specifically designed to be accessible to
  individuals. Filing fee ≈ 1% of claim, minimum NIS 50.
- Governed by `תקנות שיפוט בתביעות קטנות (סדרי דין), תשל"ז-1976`.

**Magistrate / District Court (בית משפט השלום / המחוזי)**
- Magistrate (שלום): claims up to NIS 2.5M (as of 2024 reform).
- District (מחוזי): claims above NIS 2.5M.
- Attorney strongly recommended; more complex procedure.
- Governed by `חוק בתי המשפט [נוסח משולב], תשמ"ד-1984`.

### 4.4 Phase 4 — Execution Office (step 8)
After a **judgment** is issued (or when holding an **unpaid promissory
note / bounced check**), the creditor can open a file at the
`לשכת ההוצאה לפועל`. The Execution Office has real teeth:
- Wage attachment (עיקול משכורת).
- Bank account attachment (עיקול חשבון בנק).
- Vehicle attachment (עיקול רכב).
- Asset seizure (עיקול מטלטלין).
- Travel ban (צו עיכוב יציאה מהארץ).
- In extreme cases — bankruptcy proceedings.

Governed by `חוק ההוצאה לפועל, תשכ"ז-1967`.

**The module prepares a case packet (checklist, required documents,
citation) but does NOT actually file.** Filing must be done by an
attorney or an authorized clerk.

### 4.5 Phase 5 — Write-off (step 9)
When the legal process is exhausted or the debtor is verifiably
uncollectible, the creditor may write off the debt:
- Booked as `bad_debt_expense` (debit) / `ar_<customerId>` (credit).
- **Income-tax deductible** under `§ 17(4) of פקודת מס הכנסה` provided:
  (a) the amount was previously included in taxable income, and
  (b) un-collectability is proven.
- **VAT relief** under `§ 49 of חוק מע"מ` — the vendor may recover the
  VAT paid on the unpaid invoice, subject to conditions (18+ months
  overdue, documented collection attempts, statutory notice to the
  buyer). The module marks VAT relief as `conditional` — the bookkeeper
  must file form 38 and certify compliance.

---

## 5. Interest Rules — חוק פסיקת ריבית והצמדה

Israeli default interest for judgment debts is governed by
`חוק פסיקת ריבית והצמדה, תשכ"א-1961`. Key points:

- The **Accountant-General** (החשב הכללי) publishes the official rate
  periodically. As of 2026, the **default court rate is 4% per annum**
  simple interest.
- `CONSTANTS.DEFAULT_COURT_INTEREST_RATE = 0.04` — caller may override
  via the `rate` parameter for commercial-contract rates.
- **Day count basis**: actual/365 (the Israeli convention matches the
  existing dunning module).
- **Basis**: simple interest (not compounding). Linkage to CPI is
  handled separately by the cash / inflation module and is NOT computed
  here.
- Interest accrues from the **original due date** (not the date the
  letter goes out) through the **date of actual payment** (or
  `periodEnd`, whichever is earlier).

`computeLateInterest()` returns a frozen breakdown including the
citation so that the caller can paste the rate + law into any document.

### Worked example

```
principal    = 10,000 ILS
periodStart  = 2025-04-11
periodEnd    = 2026-04-11
days         = 365
rate         = 0.04
interest     = 10,000 × 0.04 × 365/365 = 400.00
totalDue     = 10,400.00
```

---

## 6. Hebrew Glossary / מילון עברית ←→ English

| Hebrew                           | English                               | Context                         |
|-----------------------------------|---------------------------------------|---------------------------------|
| גבייה                              | Collection                             | general                         |
| חייב / לקוח חייב                   | Debtor                                 | AR side                         |
| נושה                               | Creditor                               | AR side                         |
| חוב רע                             | Bad debt                               | accounting                      |
| תזכורת רכה                         | Soft reminder                          | step 1                          |
| מכתב נמרץ                          | Firm letter                            | step 2                          |
| מכתב דרישה                         | Demand letter                          | step 4                          |
| מכתב התראה לפני תביעה              | Pre-suit notice letter                 | step 5                          |
| כתב תביעה                          | Statement of claim                     | court filing                    |
| בית משפט לתביעות קטנות             | Small Claims Court                     | step 6                          |
| תקרת תביעות קטנות                  | Small-claims ceiling                   | NIS 34,600 (2026)               |
| בית משפט השלום                     | Magistrate Court                       | step 7 (≤ NIS 2.5M)             |
| בית המשפט המחוזי                   | District Court                         | step 7 (> NIS 2.5M)             |
| הוצאה לפועל                        | Execution Office                       | step 8                          |
| לשכת ההוצאה לפועל                  | Execution Office bureau                | filing location                 |
| תיק הוצאה לפועל                    | Execution file                         | case number                     |
| עיקול                              | Attachment / seizure                   | execution tool                  |
| עיקול משכורת                       | Wage garnishment                       | execution tool                  |
| עיקול חשבון בנק                    | Bank account attachment                | execution tool                  |
| צו עיכוב יציאה מהארץ               | Travel ban order                       | execution tool                  |
| פסק דין                            | Judgment                               | required for step 8             |
| שטר חוב                            | Promissory note                        | direct-to-execution instrument  |
| שטר                                | Bill / note                            | generic                         |
| ריבית פיגורים                      | Default interest                       | late-payment interest           |
| ריבית פסיקה                        | Adjudication interest                  | court interest                  |
| הצמדה                              | Linkage (to CPI)                       | indexation                      |
| חוק פסיקת ריבית והצמדה             | Interest & Linkage Adjudication Law    | 5721-1961                       |
| חוק ההוצאה לפועל                   | Execution Law                          | 5727-1967                       |
| חוק ההתיישנות                      | Prescription Law                       | 5718-1958 (7 years)             |
| פקודת השטרות                       | Bills of Exchange Ordinance            | promissory notes                |
| פשרה                               | Settlement / compromise                | negotiated resolution           |
| פשרה בנאמנות                       | Escrowed settlement                    | funds held by trustee           |
| נאמן                               | Trustee                                | escrow agent                    |
| מחיקת חוב                          | Write-off                              | step 9                          |
| חוב אבוד                           | Lost debt                              | VAT relief vocabulary           |
| הקלה במע"מ על חוב אבוד             | VAT bad-debt relief                    | § 49 VAT Law                    |
| ניכוי חוב רע                       | Bad-debt deduction                     | § 17(4) Income Tax              |
| עורך דין                           | Attorney                               | required for actual filing      |
| לשכת עורכי הדין                    | Bar Association                        | license authority               |
| אגרת בית משפט                      | Court filing fee                       | ≈ 1% of claim                   |
| כתב ערעור                          | Notice of appeal                       | post-judgment                   |
| פרעון                              | Payment / settlement                   | actual payment                  |
| יתרת חוב                           | Debt balance                           | outstanding amount              |

---

## 7. Test Matrix

**Test file:** `onyx-procurement/test/finance/debt-collection.test.js`
**Run:** `node --test test/finance/debt-collection.test.js`
**Result:** **68 / 68 passing**, zero external deps.

| Suite                              | Tests | Coverage                                      |
|------------------------------------|-------|-----------------------------------------------|
| constants & shape                  | 13    | Ladder shape, bilingual labels, frozen exports|
| escalationLadder                   | 10    | Day-count progression 60→120, smallclaim cap, SoL warning |
| recordAction                       | 5     | Validation, append-only history, step bumping |
| generateLegalLetter                | 6     | 3 letter types, bilingual, disclaimer, citation, interest |
| computeLateInterest                | 8     | 4% default, override, zero days, ACT/365, citation |
| promissoryNoteHandling             | 4     | Register, retrieve, overdue detect, citation  |
| executionOfficeRegistration        | 3     | Checklist shape, validation, snapshot         |
| escrowedSettlement                 | 3     | Discount pct, condition array, validation     |
| writeOff                           | 6     | Balanced journal, tax flags, approver role, retention |
| recoveryLater                      | 6     | Full / partial / over-recovery, 3-line journal, citation |
| integration: 60→120 escalation     | 1     | Full 5-step sequence → ladder reflects state  |

**Key assertions:**
- Small-claims threshold is **exactly** NIS 34,600 — rejected at 34,601.
- Default interest is **exactly** 4% — 10,000 × 4% × 365/365 = 400.00.
- Journal entries are **always balanced** (total debits = total credits).
- Over-recovery (e.g. recovering 11,000 on a 10,000 write-off) is split
  into recovery income (10,000) + other income (1,000) — three lines.
- Append-only: no method ever removes a record; frozen records cannot be
  mutated by callers (verified via assertion on frozen throw).
- Unknown approver role (`intern`) is **flagged** (warning array) but
  does not reject the write-off — the AR ledger must always balance.

---

## 8. Law Citations — Index

| Internal key          | Hebrew                                               | English                                          |
|-----------------------|------------------------------------------------------|--------------------------------------------------|
| `INTEREST_LAW`        | חוק פסיקת ריבית והצמדה, תשכ"א-1961                   | Interest and Linkage Adjudication Law, 5721-1961 |
| `COURTS_LAW`          | חוק בתי המשפט [נוסח משולב], תשמ"ד-1984               | Courts Law (Consolidated Version), 5744-1984     |
| `SMALL_CLAIMS_REGS`   | תקנות שיפוט בתביעות קטנות (סדרי דין), תשל"ז-1976     | Small Claims (Procedure) Regulations, 5737-1976  |
| `EXECUTION_LAW`       | חוק ההוצאה לפועל, תשכ"ז-1967                         | Execution Law, 5727-1967                         |
| `BILLS_ORDINANCE`     | פקודת השטרות [נוסח חדש]                               | Bills of Exchange Ordinance [New Version]        |
| `LIMITATIONS_LAW`     | חוק ההתיישנות, תשי"ח-1958                             | Prescription Law, 5718-1958                      |
| `INCOME_TAX_17_4`     | פקודת מס הכנסה, סעיף 17(4) — חוב רע                   | Income Tax Ordinance, § 17(4) — bad debt         |
| `VAT_49`              | חוק מע"מ, סעיף 49 — הקלה במע"מ על חוב אבוד            | VAT Law, § 49 — bad-debt VAT relief              |

All citations are attached to the relevant return values so that any
letter / report consuming this module can emit the citation alongside
the workflow data.

---

## 9. Rule of the House — Append-only Invariants

- `_actions`, `_letters`, `_promissoryNotes`, `_executionCases`,
  `_settlements`, `_writeOffs`, `_recoveries` — **all Maps** that are
  only ever added to.
- `writeOff` does **NOT** remove the original AR line — it creates a new
  write-off record and a balanced journal entry. The original invoice
  stays on the books forever, flagged `written_off`.
- `recoveryLater` does **NOT** unwind a prior write-off — it creates a
  new recovery record and a new journal entry, booked as income in the
  year of recovery per § 17(4).
- **Every return object is frozen** (deeply) to prevent callers from
  mutating ledger state in place.
- The `snapshot()` method returns a frozen deep clone for reporting.

---

## 10. Integration Hooks (Future Work)

- **Dunning hand-off:** when X-48 dunning reaches stage `legal` (day 60),
  it should call `DebtCollection.escalationLadder()` to decide whether to
  immediately jump to step 5 (pre-suit notice) based on already-completed
  reminders.
- **GL engine:** the `journalEntry` stubs emitted by `writeOff` and
  `recoveryLater` are in the exact shape expected by `src/accounting/gl.js`
  (verify when wiring).
- **Attorney portal:** `generateLegalLetter` returns a ready-to-print HTML
  template; the portal adds letterhead and signature block.
- **Execution Office e-filing:** when Hotza'a la-Po'al's e-file API opens
  to third parties, `executionOfficeRegistration` will become an
  actual submission rather than a case packet.

---

## 11. Never Delete Policy

Per the house rule **"לא מוחקים רק משדרגים ומגדלים"**:
- This report **AG-Y088-debt-collection.md** is never to be deleted.
  Future enhancements append sections; current sections may be updated
  in place but must preserve the audit trail.
- The source module **`src/finance/debt-collection.js`** is never to be
  deleted. Additional methods may be added; existing methods may be
  hardened but must remain backwards-compatible.
- The test file **`test/finance/debt-collection.test.js`** is never to
  be deleted. New tests are added; existing tests may be tightened but
  not removed.

---

**End of report — Agent Y-088, Swarm 4F, Wave 2026.**

---

# ═════════════════════════════════════════════════════════════════════
#  UPGRADE SECTION — Wave 2026-Q2 — Case-Level Workflow Engine
#  שדרוג — מנוע ניהול תיקי גבייה מלא
#  Date: 2026-04-11
#  Rule: לא מוחקים רק משדרגים ומגדלים — this section APPENDS new
#        capabilities while every legacy method above is preserved intact.
# ═════════════════════════════════════════════════════════════════════

## U-1. Scope of the Upgrade / היקף השדרוג

The earlier version of this module (Wave-1, above) implemented the 9-step
action ladder, legal letters, promissory-note registry, Execution Office
pre-filing ledger, escrow settlements, journal-entry write-off, and
recovery tracking. It served as the deep legal side complementing
X-48 dunning.

**Wave-2 adds a case-centric workflow engine on top of the same class.**
No legacy method has been renamed, re-signed, or deleted — the new API
is strictly additive, living in the same `DebtCollection` instance and
sharing the same `_today`, `_seq`, and logger machinery.

| Status           | Value                                                        |
|------------------|--------------------------------------------------------------|
| Tests (legacy)   | 68 / 68 PASS                                                 |
| Tests (new Y-088)| 36 / 36 PASS                                                 |
| **Total**        | **104 / 104 PASS**                                           |
| External deps    | Zero — `node:test` and `node:assert/strict` only             |
| Build            | `node --test test/finance/debt-collection.test.js`           |

## U-2. New Escalation Stages / שלבי הסלמה חדשים

A compact 6-stage (0..5) lifecycle is overlaid on the existing 9-step
action ladder. Cases advance strictly forward; closed cases remain in
the registry forever.

| Stage | Key          | עברית            | English / channels                                  |
|:-----:|--------------|------------------|-----------------------------------------------------|
| **0** | `new`        | תיק חדש          | New case                                            |
| **1** | `friendly`   | תזכורת ידידותית  | Friendly reminder — email / sms / call / whatsapp / postal |
| **2** | `formal`     | דרישה רשמית      | Formal demand — email / registered_mail / courier / hand_delivery |
| **3** | `lawyer`     | מכתב עורך דין    | Attorney letter — fee types: flat / hourly / contingency / statutory |
| **4** | `enforcement`| הוצאה לפועל      | Execution Office (hotza'ah la-po'al) filing — חוק ההוצאה לפועל, תשכ"ז-1967 |
| **5** | `closed`     | תיק סגור         | Closed — `paid` / `settled` / `written-off` / `uncollectible` |

The 6-stage ladder does **not** replace the 9-step `ESCALATION_LADDER`;
both coexist. The 9-step ladder remains the canonical action-level ledger
(`recordAction` / `actionsFor`), while the 6-stage ladder is the
case-level business view. The `generateCaseFile()` document embeds the
6-stage ladder; the `escalationLadder()` method continues to surface the
9-step ladder.

## U-3. Interest Formula — 4% Compound Daily / ריבית דריבית יומית

Spec requires **ריבית פיגורים של 4% שנתי, חישוב יומי בריבית דריבית**. The
Wave-1 method `computeLateInterest()` uses **simple interest** — that
method is preserved untouched for continuity with the letter engine. The
new case-level method:

```
engine.computeInterest({ caseId, asOf?, rate? })
```

implements the compound-daily formula required by spec:

```
A = P × (1 + r/365)^n − P
```

| Symbol | Meaning                                                          |
|:------:|------------------------------------------------------------------|
| `A`    | Accrued interest (ILS)                                           |
| `P`    | Principal = case `originalAmount`                                |
| `r`    | Annual rate, default **0.04** (`CONSTANTS.DEFAULT_COURT_INTEREST_RATE`) |
| `n`    | Days from case `dueDate` to `asOf` (default = engine today)      |
| `365`  | Day-count basis `ACT/365` (`CONSTANTS.DAY_COUNT_BASIS`)          |

**Worked example — 100,000 ILS, 1 year, r = 0.04, n = 365:**

```
daily_rate = 0.04 / 365        = 0.0001095890…
factor     = (1+daily_rate)^365 = 1.040808…
interest   = 100,000 × 0.040808 ≈ 4,080.85 ILS
```

The simple-interest comparison is 4,000 ILS exactly; the compound
version yields ~80.85 ILS more over one year on a 100K principal. The
returned envelope carries **both** values plus the literal formula
string `"A = P × (1 + r/365)^n − P"` so downstream BI can render a diff.

Legal anchor: **חוק פסיקת ריבית והצמדה, תשכ"א-1961** (Interest and
Linkage Adjudication Law, 5721-1961).

## U-4. Statute of Limitations / התיישנות

New method `engine.statute(caseId)` checks **חוק ההתיישנות, תשי"ח-1958**
(7-year general civil prescription).

| Elapsed    | Flag                | עברית                                       | English                        |
|------------|---------------------|---------------------------------------------|--------------------------------|
| `< 6y`     | active              | תקופת ההתיישנות בתוקף                       | Within statutory period        |
| `6y..7y`   | `warning: true`     | אזהרה — החוב קרוב להתיישנות, יש לפעול מיד   | Warning — approaching limit    |
| `≥ 7y`     | `prescribed: true`  | החוב התיישן — לא ניתן לאכוף משפטית          | Prescribed — no enforcement    |

The returned object is frozen and carries the bilingual summary plus the
`LIMITATIONS_LAW` citation. Both the 6-year warning band and the 7-year
prescription boundary are covered by dedicated unit tests.

## U-5. Enforcement Filing / הוצאה לפועל

```
engine.hotzaah({ caseId, claimNumber, court, judgmentId? })
engine.hotzaahLePoal(...)   // same method, long-form alias
```

- Validates the case is not closed and not past stage 4.
- Records `claimNumber` and `court` on the case root.
- Internally delegates to the Wave-1 `executionOfficeRegistration()` to
  stamp a legacy `EO-xxxxxx` record with the 5-item filing checklist
  (judgment copy, debtor ID, application form, fee payment, address
  verification).
- Appends a `hotzaah_filed` event to the case log carrying:
  - `citationHe: 'חוק ההוצאה לפועל, תשכ"ז-1967'`
  - `citationEn: 'Execution Law, 5727-1967'`
- Advances stage to 4.

**Legal reality:** the module **tracks** the filing in the ERP and
prepares the hand-off packet. Actual submission to the real Execution
Office still requires a licensed Israeli attorney or authorised
representative — that disclaimer is reiterated in every generated letter
and in `generateCaseFile()`.

## U-6. Write-Off — 3-Year Documented Effort Rule

Israeli Tax Authority practice under **פקודת מס הכנסה, סעיף 17(4)**
permits bad-debt deduction only after substantial, documented collection
effort. The module operationalises the commonly accepted **3-year**
effort threshold via the new method:

```
engine.writeOffCase({ caseId, reason, approver, approverRole?, effortYears? })
```

Enforcement checks:

1. Case must not already be closed.
2. Effort duration `≥ 3` years (computed as
   `daysBetween(dueDate, today) / 365.25`, overridable via `effortYears`).
3. At least one documented collection-effort event in the case log
   (`friendly_reminder` / `formal_demand` / `lawyer_letter` /
   `hotzaah_filed`).
4. Delegates to the Wave-1 `writeOff()` which creates the balanced
   journal entry (DR bad-debt expense / CR AR), attaches tax treatment
   (income-tax § 17(4) deductible, VAT § 49 conditional), and validates
   the approver role against `WRITE_OFF_APPROVER_ROLES`.
5. Records a `write_off` event on the case log.

The original case record is **not erased**. `closeCase(caseId, 'written-off')`
is still a separate explicit action performed by the operator.

## U-7. Payment Plan + Payment Recording

```
engine.paymentPlan({ caseId, installments, startDate, interestRate?, intervalDays? })
engine.recordPayment({ caseId, amount, date, method, notes? })
```

- `paymentPlan` amortises `rec.balance + simple-interest-over-plan-life`
  across `installments` equal-sized instalments; the last instalment
  absorbs any rounding drift. Default cadence is 30 days. The plan is
  append-only — multiple plans per case are allowed (the latest one
  supersedes the previous on display, but history is preserved).
- `recordPayment` appends the payment row to the case payment ledger
  and replaces the case root with a new frozen snapshot carrying
  updated `paymentsTotal` and `balance`. The balance is clamped at
  zero to handle overpayment without going negative. The case is
  **not** auto-closed; the operator must call `closeCase(..., 'paid')`.

## U-8. Bilingual Case File / תיק לקוח מלא

```
engine.generateCaseFile(caseId)
```

Returns a fully-frozen envelope containing:

- `headerHe`, `headerEn`, `summaryHe`, `summaryEn`
- `case` — the current frozen case record
- `stageLadder` — the 6-stage ladder annotated with `reached` / `current`
- `events` — full append-only event history
- `payments`, `paymentPlans`
- `interest` — result of `computeInterest(caseId)`
- `statute` — result of `statute(caseId)`
- `citations` — five bilingual legal anchors
- `disclaimer` — bilingual "not-legal-advice" stamp

Used for lawyer hand-off, court filing prep, and internal audit.

## U-9. Extended Public API Surface

Additions to the `DebtCollection` class (all Wave-1 methods remain
exported and unchanged):

| Method                                                                    | Stage Touched |
|---------------------------------------------------------------------------|:-------------:|
| `createCase({customerId, invoices, totalAmount, currency, dueDate})`       | 0             |
| `friendlyReminder({caseId, method, leadDays})`                             | 1             |
| `formalDemand({caseId, method})`                                           | 2             |
| `lawyerLetter({caseId, lawyerId, feeType})`                                | 3             |
| `hotzaah({caseId, claimNumber, court, judgmentId?})` (`hotzaahLePoal`)     | 4             |
| `paymentPlan({caseId, installments, startDate, interestRate?})`            | any           |
| `recordPayment({caseId, amount, date, method, notes?})`                    | any           |
| `computeInterest({caseId, asOf?, rate?})`                                  | any           |
| `statute(caseId)`                                                          | any           |
| `writeOffCase({caseId, reason, approver, effortYears?})`                   | any           |
| `closeCase(caseId, status, notes?)`                                        | 5             |
| `generateCaseFile(caseId)`                                                 | any           |
| `getCase(caseId)`                                                          | any           |
| `caseEvents(caseId)`                                                       | any           |
| `casePayments(caseId)`                                                     | any           |
| `casePaymentPlans(caseId)`                                                 | any           |

New exported constants:

```
CASE_STAGE_DEFS           — 6-stage bilingual ladder
CASE_CLOSE_STATUSES       — ['paid','settled','written-off','uncollectible']
FRIENDLY_REMINDER_METHODS — ['email','sms','call','whatsapp','postal']
FORMAL_DEMAND_METHODS     — ['email','registered_mail','courier','hand_delivery']
LAWYER_FEE_TYPES          — ['flat','hourly','contingency','statutory']
```

New constants added to `CONSTANTS`:

```
CASE_STAGES                 — [0,1,2,3,4,5]
WRITE_OFF_MIN_EFFORT_YEARS  — 3
DEFAULT_FRIENDLY_LEAD_DAYS  — 7
```

Wave-1 `CONSTANTS` values (default rate, small-claims cap, day count,
statute-of-limitations, approver roles, bad-debt defaults) are unchanged.

## U-10. Append-Only Enforcement / ערבויות

| Artifact             | Storage                            | Mutation rule                                   |
|----------------------|------------------------------------|-------------------------------------------------|
| Case root            | `Map<caseId, frozen record>`       | Replace with new frozen snapshot each update    |
| Case events          | `Map<caseId, frozen Array>`        | `Object.freeze(bucket.concat([event]))`         |
| Case payments        | `Map<caseId, frozen Array>`        | Append-only, never spliced                      |
| Case payment plans   | `Map<caseId, frozen Array>`        | Append-only, never spliced                      |
| All Wave-1 maps      | unchanged                          | unchanged                                       |

Two dedicated tests enforce the global rule **"לא מוחקים רק משדרגים
ומגדלים"**:

1. `closeCase preserves record and freezes at stage 5` — confirms the
   closed case is still retrievable, balance/stage/status are recorded,
   and the event log retains both `case_created` and `case_closed`.
2. `rule: 'לא מוחקים רק משדרגים ומגדלים' — closed case remains in registry`
   — checks the global `snapshot()` continues to include the closed case.

## U-11. Hebrew Glossary (extension) / מילון מונחים מורחב

In addition to the Wave-1 glossary above, Wave-2 introduces/reinforces:

| עברית                 | תעתיק                 | English                                   |
|-----------------------|-----------------------|-------------------------------------------|
| תיק חדש               | tik chadash           | New case (stage 0)                        |
| תזכורת ידידותית       | tizkoret yedidutit    | Friendly reminder (stage 1)               |
| דרישה רשמית           | drishah rishmit       | Formal demand (stage 2)                   |
| מכתב עורך דין         | michtav orech din     | Attorney letter (stage 3)                 |
| יתרה                  | yitrah                | Balance / remainder                       |
| תכנית תשלומים         | tochnit tashlumim     | Payment plan / arrangement                |
| תשלומים שהתקבלו       | tashlumim shehitkablu | Payments received total                   |
| ריבית דריבית יומית    | ribit d'ribit yomit   | Daily compound interest (4% p.a.)         |
| מחיקת חוב רע          | mechikat chov ra      | Bad-debt write-off                        |
| מאמץ גבייה מתועד      | ma'amatz geviyah      | Documented collection effort (≥ 3 yrs)    |
| סגירת תיק             | sgirat tik            | Case closure                              |
| לקוח לא גביה          | lakoach lo geviyah    | Uncollectible customer                    |
| סטטוס סגירה           | status sgirah         | Close status                              |
| אירוע תיק             | eiru'a tik            | Case event (event-log entry)              |

## U-12. Test Coverage Delta

```
node --test test/finance/debt-collection.test.js
```

```
ℹ tests 104
ℹ suites 19
ℹ pass 104
ℹ fail 0
```

**Wave-2 Y-088 new suites (36 new tests):**

| Suite                                                | Tests |
|------------------------------------------------------|:-----:|
| Y-088 case workflow — createCase                     | 4     |
| Y-088 case workflow — stage progression              | 8     |
| Y-088 case workflow — interest compounding           | 4     |
| Y-088 case workflow — statute of limitations         | 3     |
| Y-088 case workflow — payment plan + payments        | 6     |
| Y-088 case workflow — write-off + closeCase          | 5     |
| Y-088 case workflow — generateCaseFile               | 2     |
| Y-088 case workflow — integration & rule enforcement | 3     |
| (includes legacy integration retained)               | +1    |
| **Wave-2 Y-088 total**                               | **36**|

**Wave-1 legacy suites (68 tests, all still passing):** constants & shape,
escalationLadder, recordAction, generateLegalLetter, computeLateInterest,
promissoryNoteHandling, executionOfficeRegistration, escrowedSettlement,
writeOff, recoveryLater, integration.

**Spec checklist (required coverage):**

- [x] create — test: "opens a case at stage 0 with principal = totalAmount"
- [x] stage progression — 8 tests covering stages 0→1, 1→2, 2→3, 3→4, rejection rules, and closed-case guards
- [x] interest compounding — 4 tests (formula verified numerically: 100K × 4% × 365d ≈ 4,080.85)
- [x] statute check — 3 tests (active / warning / prescribed)
- [x] payment plan — 3 tests (0%, with-interest, invalid inputs)
- [x] payment record reduces balance — test + append-only test + overpayment clamp test
- [x] write-off requires 3-year effort — dedicated throw/success pair
- [x] closure preserves record — dedicated "לא מוחקים" test

## U-13. Sign-off (Wave-2)

| Field                  | Value                                       |
|------------------------|---------------------------------------------|
| Agent                  | Y-088                                       |
| Wave                   | 2026-Q2                                     |
| Module                 | `src/finance/debt-collection.js` (upgraded) |
| Tests                  | **104 / 104 PASS**                          |
| New tests this wave    | 36                                          |
| External deps          | 0                                           |
| Rule respected         | YES — לא מוחקים רק משדרגים ומגדלים          |
| Bilingual              | YES                                         |
| RTL-ready              | YES                                         |
| Ready for              | Wave-2026 merge                             |

— סוף השדרוג / End of upgrade section — Agent Y-088, Swarm 4F, Wave 2026-Q2.
