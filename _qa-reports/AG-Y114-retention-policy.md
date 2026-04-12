# AG-Y114 — Document Retention Policy Engine

**Agent:** Y-114
**Module:** `onyx-procurement/src/documents/retention-policy.js`
**Tests:** `onyx-procurement/test/documents/retention-policy.test.js`
**Swarm:** Documents / Techno-Kol Uzi Mega-ERP 2026
**Status:** GREEN — 40/40 tests passing, 0 deps, bilingual
**Invariant:** לא מוחקים רק משדרגים ומגדלים (never delete — only upgrade and grow)
**Integrates with:** Y-115 legal-hold registry (via optional resolver)

---

## 1. Purpose

Governs document-retention compliance for an Israeli enterprise: classifies
every document against a statutory retention class (tax, accounting,
payroll, HR, medical, real estate, permits, legal proceedings), schedules
eligibility for disposal once the lawful retention period has elapsed, and
gates every destructive action behind **explicit human approval**.

The engine is an **append-only** governance layer. It never physically
removes any record from the document store. "Disposal" is expressed as a
lifecycle transition (ARCHIVED / ANONYMIZED / DISPOSED-marker) that is
fully auditable and reversible up to the marker stage. Physical deletion,
if ever performed, is always a separate, out-of-engine runbook step that
is recorded but never executed by this module.

## 2. Exported API

| Member | Kind | Purpose |
|---|---|---|
| `RetentionPolicy` | class | primary engine |
| `ISRAELI_RETENTION_CLASSES` | frozen map | the 9 statutory classes |
| `DOC_TYPE_MATCHERS` | frozen array | Hebrew + English keyword matchers for `classify()` |
| `DOC_STATUS` | enum | `active / pending_disposal / archived / anonymized / legal_hold / disposed` |
| `DISPOSAL_MODES` | `['delete','archive','anonymize']` | allowed disposal modes |
| `QUEUE_STATUS` | enum | `pending / approved / rejected / executed / held` |

### Instance methods

| Method | Contract |
|---|---|
| `defineRetention({docType, retentionYears, lawReference, disposal, holdOverride})` | override or add a retention class; validates disposal mode; seeded constants are never mutated |
| `classify(doc)` | assigns a retention class by explicit tag → Hebrew/English keyword match → safe fallback (`contracts`); strict mode throws on unknown |
| `applyPolicy()` | scans every document, computes eligibility, appends queue entries; returns `{scanned, queued, held, skipped, permanent}` |
| `disposalQueue({status})` | returns queue entries (default `pending`, `status:'all'` for full history) |
| `approveDisposal(docId, approver, {reason})` | **REQUIRES** named approver; blocked by legal hold; executes the configured disposal path; never physically deletes |
| `rejectDisposal(docId, reviewer, reason)` | moves a pending entry to `rejected`; returns doc to ACTIVE |
| `archiveDocument(docId, meta)` | transitions to ARCHIVED; non-destructive |
| `anonymizeDocument(docId, {piiFields})` | replaces PII with `[ANONYMIZED]` placeholder; keeps analytics-relevant fields |
| `legalHold(docId, reason, expiry)` | pauses disposal; flips pending queue entries to HELD; integrates with Y-115 |
| `releaseLegalHold(docId, releaser, note)` | append-only release; restores document to ACTIVE |
| `listLegalHolds()` | clone of all active holds |
| `complianceReport({from, to})` | audit-ready report with queue/status/class/disposal breakdown + events |
| `bilingualPolicy()` | returns `{he, en, table, direction:'rtl'}` policy document |
| `ingestDocument(doc)` / `getDocument(id)` / `listDocuments()` | document-store accessors |
| `auditTrail()` | full append-only event log |

### Construction options

```js
new RetentionPolicy({
  now: () => new Date(),       // injectable clock
  documents: [],               // pre-load document records
  strict: false,               // strict classification throws on unknown
  y115Resolver: (id) => ({...})// external legal-hold bridge (Y-115)
});
```

## 3. Israeli Retention Table (2026)

| # | Class key | Hebrew | English | Retention | Disposal default | Trigger event | Legal basis |
|---|---|---|---|---|---|---|---|
| 1 | `tax_records` | מסמכי מס | Tax records | 7 years | archive | `fiscalYearEnd` | פקודת מס הכנסה [נוסח חדש], תשכ"א-1961 + תקנות מס הכנסה (ניהול פנקסי חשבונות), התשל"ג-1973 |
| 2 | `accounting_books` | פנקסי חשבונות | Accounting books | 7 years | archive | `fiscalYearEnd` | תקנות מס הכנסה (ניהול פנקסי חשבונות), התשל"ג-1973, תקנה 25 |
| 3 | `payroll_records` | רשומות שכר | Payroll records | 7 years | archive | `payPeriodEnd` | חוק הגנת השכר, התשי"ח-1958 + חוק שעות עבודה ומנוחה, התשי"א-1951 |
| 4 | `personnel_files` | תיקי עובדים | Personnel files | 7 years after termination | **anonymize** | `terminationDate` | חוק הודעה לעובד (תנאי עבודה), התשס"ב-2002 + חוק שוויון ההזדמנויות בעבודה |
| 5 | `contracts` | חוזים | Contracts | 7 years after expiry | archive | `contractExpiry` | חוק החוזים (חלק כללי), התשל"ג-1973 |
| 6 | `medical_records` | רשומות רפואיות | Medical records | 20 years | **anonymize** | `caseClosed` | חוק זכויות החולה, התשנ"ו-1996 + תקנות בריאות העם + ביטוח לאומי |
| 7 | `building_permits` | היתרי בנייה | Building permits | **permanent** | archive | `permitIssued` | חוק התכנון והבנייה, התשכ"ה-1965 |
| 8 | `tabu_documents` | מסמכי טאבו | Tabu / Land Registry | **permanent** | archive | `recorded` | חוק המקרקעין, התשכ"ט-1969 |
| 9 | `legal_proceedings` | הליכים משפטיים | Legal proceedings | **permanent** | archive | `caseClosed` | תקנות סדר הדין האזרחי + חוק ההתיישנות, התשי"ח-1958 |

Permanent classes have `holdOverride:true` and `retentionYears:null`. They
are **never** queued by `applyPolicy()` regardless of age.

### Retention clock triggers

Each class declares the field on the document that marks the start of the
retention clock. `applyPolicy()` reads the field by name and falls back in
this order if the primary field is absent:

1. `doc[klass.triggerEvent]`  (e.g. `fiscalYearEnd`, `terminationDate`)
2. `doc.triggerDate`
3. `doc.createdAt`
4. `doc.date`

If none resolve, the document is **skipped** (never silently queued).

## 4. Disposal Workflow

```
 ingestDocument(doc)
        │
        ▼
  classify(doc)   ← Hebrew/English keyword table, explicit tag wins
        │
        ▼
  applyPolicy()  ── permanent?       → skip (never queue)
        │         ── legal hold?      → skipped, counted as `held`
        │         ── Y-115 on hold?   → skipped, counted as `held`
        │         ── not eligible?    → skip (age < retentionYears)
        │         ── eligible?        → queue PENDING
        ▼
  disposalQueue()                        ◄── human reviews list
        │
        ├── rejectDisposal(id, reviewer, reason)
        │     → queue entry → REJECTED (append-only)
        │     → document returned to ACTIVE
        │
        └── approveDisposal(id, APPROVER, {reason})
              │  REQUIRES named approver — throws if missing
              │  BLOCKED if legalHold present
              │
              ├── disposal='archive'   → archiveDocument (ARCHIVED)
              ├── disposal='anonymize' → anonymizeDocument (ANONYMIZED, PII→[ANONYMIZED])
              └── disposal='delete'    → _markDisposed (DISPOSED **marker only**)
                                          physical removal is a separate
                                          human runbook, NEVER executed
                                          by this engine.
```

### Queue entry shape

```js
{
  queueId: 'q-<docId>-<iso>',
  docId: 'doc-tax-2018',
  retentionClass: 'tax_records',
  classification: { label_he, label_en, lawReference },
  disposal: 'archive' | 'anonymize' | 'delete',
  triggerEvent: 'fiscalYearEnd',
  triggerDate: '2018-12-31T00:00:00.000Z',
  eligibleDate: '2025-12-31T00:00:00.000Z',
  queuedAt: '2026-04-11T09:00:00.000Z',
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'held',
  approver: null | { id, name?, role? },
  approvedAt: null | iso,
  executedAt: null | iso,
  reason: null | string,
}
```

## 5. Safety Rules (enforced by the engine)

1. **Default disposal mode is `archive`**, never `delete`. Any class
   created via `defineRetention` without an explicit `disposal` falls
   back to `archive`.
2. **`approveDisposal` requires a named approver** — passing `undefined`,
   `null`, or `''` throws. This is the single mandatory gate between a
   queued item and any lifecycle transition.
3. **Legal hold is absolute.** `approveDisposal` throws if the document
   is under a local hold. `applyPolicy` counts held documents separately
   and never queues them.
4. **Y-115 integration is fail-safe.** If the external `y115Resolver`
   throws, the engine defaults to treating the document as held (never
   the other way around). This keeps disposal safe during registry
   outages.
5. **Permanent classes can never be queued.** `building_permits`,
   `tabu_documents`, and `legal_proceedings` all carry
   `holdOverride:true` and `retentionYears:null`.
6. **"Delete" is a marker, not an action.** Even when a class is
   explicitly configured with `disposal:'delete'`, the engine only
   marks the document as `DISPOSED` and records the approver. The
   underlying record remains queryable via `getDocument(id)` and
   `listDocuments()`. Physical removal is a separate, audited runbook
   that must be performed by a human operator outside this engine.
7. **Personal data → anonymize, not delete.** `personnel_files` and
   `medical_records` default to `anonymize` so analytics value is
   retained while PII is stripped (`[ANONYMIZED]` placeholder).
8. **Queue is append-only.** Rejected and executed entries are
   preserved in history and retrievable via
   `disposalQueue({status:'all'})`.
9. **Audit trail is append-only.** Every state transition emits a
   compliance event recorded in `auditTrail()` and exposed through
   `complianceReport()`.
10. **Seeded constants are immutable.** `ISRAELI_RETENTION_CLASSES` and
    `DOC_TYPE_MATCHERS` are deep-frozen at module load; overrides live
    in per-instance custom maps.

## 6. Classification Heuristics

`classify()` resolves a retention class by trying, in order:

1. **Explicit tag** — `doc.retentionClass` pointing at a known key.
2. **Keyword match** over a normalized haystack built from
   `docType + type + category + title + title_he + title_en + filename + tags`.
   Normalization applies case-fold, nikud removal (U+0591..U+05C7),
   and separator unification (space/hyphen/slash → `-`).
3. **Fallback** — non-strict mode returns the generic `contracts`
   class (Israeli 7-year default). Strict mode throws.

### Keyword matcher coverage (excerpt)

| Class | Hebrew triggers | English triggers |
|---|---|---|
| `tax_records` | מס, מע"מ, ניכויים, מס-הכנסה | tax, vat, income-tax, withholding, form126, form102, form1301, form6111 |
| `accounting_books` | פנקס, חשבון, חשבונאות, מאזן, יומן | ledger, journal, trial-balance, balance-sheet, pnl, gl, accounting |
| `payroll_records` | שכר, תלוש, משכורת, שעות-עבודה | payroll, payslip, salary, wage, timesheet |
| `personnel_files` | תיק-עובד, עובדים, משאבי-אנוש, משוב | personnel, employee, hr-file, performance-review |
| `contracts` | חוזה, הסכם, תקנון, סודיות, שכירות | contract, agreement, nda, mou, lease |
| `medical_records` | רפואי, רפואה, בריאות, אבחון, מרפאה | medical, health, diagnosis, clinic |
| `building_permits` | היתר, היתר-בנייה, רישוי-בנייה, תכנון-ובנייה | building-permit, permit, heter |
| `tabu_documents` | טאבו, נסח, נסח-טאבו, רישום-מקרקעין, מקרקעין, גוש-חלקה | tabu, land-registry, deed |
| `legal_proceedings` | משפט, תביעה, בית-משפט, פסק-דין, הליך-משפטי | lawsuit, litigation, court, judgment, claim |

## 7. Y-115 Legal-Hold Integration

`RetentionPolicy` can operate as a standalone hold registry **and** as a
slave to an external Y-115 hold registry. The two modes compose:

- **Local holds** — placed via `legalHold(docId, reason, expiry)`. Stored
  in an in-memory map keyed by `docId`. Immediately flip any pending
  queue entry for that document to `HELD` with the reason string.
- **External holds (Y-115)** — supplied via the optional
  `y115Resolver` constructor option. `applyPolicy()` calls the resolver
  for every non-permanent document; `{onHold:true}` blocks queueing.
  A resolver exception is **treated as a hold** (fail-safe default),
  which ensures disposal can never run through during a Y-115 outage.

Release is append-only: `releaseLegalHold()` does not erase the hold
history — it marks the record `status:'released'` with a releaser and
timestamp before removing it from the active map.

## 8. PII Anonymization

`anonymizeDocument(docId, {piiFields})` replaces each PII field with the
deterministic placeholder `[ANONYMIZED]`. The default field list is:

- `personName`, `fullName`, `name`
- `idNumber`, `teudatZehut`
- `email`, `phone`, `address`, `birthdate`
- `bankAccount`, `iban`

Non-PII fields (`salary`, `department`, `terminationDate`, aggregates)
are **preserved**, so analytics and workforce reporting still work.
Removed fields are tracked in `doc.piiRemoved[]` for audit. The document
transitions to `ANONYMIZED` and is never removed from the store.

## 9. Compliance Report Shape

```js
{
  period: { from: iso, to: iso },
  totals: {
    documents, legalHolds, queueEntries, eventsInRange,
  },
  queue: {
    byStatus:   { pending, approved, rejected, executed, held },
    byClass:    { tax_records: n, ... },
    byDisposal: { archive, anonymize, delete },
    entries:    [ <queueEntry> ],
  },
  documentsByStatus: {
    active, pending_disposal, archived, anonymized, legal_hold, disposed
  },
  events: [ { at, kind, payload } ],
  invariant: 'לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade and grow',
  generatedAt: iso,
}
```

## 10. Bilingual Policy Output

`bilingualPolicy()` returns the full policy as both Hebrew and English
markdown plus a structured `table` suitable for UI rendering:

```js
{
  he: '# מדיניות שימור מסמכים — מערכת Techno-Kol Uzi...',
  en: '# Document Retention Policy — Techno-Kol Uzi ERP...',
  table: [
    {
      key: 'tax_records',
      label_he: 'מסמכי מס',
      label_en: 'Tax records',
      retentionYears: 7,
      retention_he: '7 שנים',
      retention_en: '7 years',
      lawReference: 'פקודת מס הכנסה...',
      disposal: 'archive',
      disposal_he: 'העברה לארכיון קר',
      disposal_en: 'cold-storage archive',
      holdOverride: false,
      triggerEvent: 'fiscalYearEnd',
    },
    // ...
  ],
  direction: 'rtl',
  invariant: 'לא מוחקים רק משדרגים ומגדלים',
  generatedAt: iso,
}
```

The Hebrew and English outputs both include:

- the six safety rules,
- the full retention table,
- the prime directive `לא מוחקים — רק משדרגים ומגדלים` /
  `Never delete — only upgrade and grow`.

## 11. Hebrew Glossary

| Hebrew | English | Usage |
|---|---|---|
| שימור מסמכים | document retention | policy name |
| מחיקה | deletion | *forbidden* — never performed by the engine |
| סילוק | disposal | umbrella term for archive / anonymize / delete-marker |
| ארכיון קר | cold-storage archive | `archiveDocument` target |
| אנונימיזציה | anonymization | `anonymizeDocument` — strips PII, keeps analytics |
| אישור סילוק | disposal approval | `approveDisposal` — mandatory human gate |
| מאשר | approver | named human (id/name/role) recorded on every approval |
| עיכוב משפטי | legal hold | `legalHold(reason, expiry)` |
| תור סילוק | disposal queue | `disposalQueue()` output |
| דוח ציות | compliance report | `complianceReport({from,to})` |
| אירוע טריגר | trigger event | field that starts the retention clock |
| תקופת שימור | retention period | `retentionYears` |
| לצמיתות | permanent | `retentionYears:null` + `holdOverride:true` |
| היתר בנייה | building permit | permanent class |
| טאבו (נסח טאבו) | Tabu / Land Registry extract | permanent class |
| הליך משפטי | legal proceeding | permanent class |
| פנקסי חשבונות | accounting books | 7 years |
| רשומות שכר | payroll records | 7 years |
| תיק עובד | personnel file | 7 years post-termination |
| רשומה רפואית | medical record | 20 years |
| יומן ביקורת | audit trail | `auditTrail()` |
| נתוני PII | personally identifiable information | replaced with `[ANONYMIZED]` |

## 12. Test Coverage

```
node --test test/documents/retention-policy.test.js

▶ defineRetention                       7/7
▶ classify                               9/9
▶ applyPolicy                            6/6
▶ disposalQueue                          2/2
▶ approveDisposal — approval gate        5/5
▶ legalHold                              3/3
▶ complianceReport                       2/2
▶ bilingualPolicy                        3/3
▶ NEVER-DELETE invariant                 3/3
────────────────────────────────────────────
  suites 9  tests 40  pass 40  fail 0
```

Key invariants asserted end-to-end:

- `approveDisposal` throws on missing/empty approver.
- Even when a class is explicitly set to `disposal:'delete'`, the
  document is **still retrievable** after approval (status = `DISPOSED`
  marker, full record intact).
- `legalHold` blocks approval with a thrown error and flips pending
  queue entries to `HELD`.
- Y-115 resolver exceptions default to **hold**, never to disposal.
- Permanent classes are never queued regardless of age.
- The audit trail contains every lifecycle event and is monotonically
  appended.
- `DISPOSAL_MODES` exposes exactly `['anonymize','archive','delete']`.

## 13. Never Delete — Module Self-Check

The engine has **no code path** that removes a record from the document
store. Specifically:

- `archiveDocument()` only flips `status` and stamps `archivedAt`.
- `anonymizeDocument()` overwrites PII fields with `[ANONYMIZED]` but
  never calls any `delete` or `Map.delete`.
- `_markDisposed()` stamps `DISPOSED` and logs the approver — the
  record remains in `this._documents`.
- `rejectDisposal()` returns a pending entry to `REJECTED` and restores
  the document to `ACTIVE`.
- `releaseLegalHold()` stamps `released` on the hold record and only
  removes the entry from the active *holds* map (not from the
  documents map).
- `_queue` and `_events` are plain arrays and are only appended to.

The tests enforce this explicitly: after running a full cycle that
even forces `disposal:'delete'`, both `getDocument()` and
`listDocuments()` still return every ingested record.

---

**לא מוחקים — רק משדרגים ומגדלים.**
*Never delete — only upgrade and grow.*
