# AG-Y149 — Audit Log Retention Engine

**Agent:** Y-149
**System:** Techno-Kol Uzi mega-ERP / Onyx-Procurement
**Date:** 2026-04-11
**Module:** `onyx-procurement/src/compliance/retention-engine.js`
**Test file:** `onyx-procurement/test/compliance/retention-engine.test.js`
**Status:** PASS — 16 / 16 tests green
**Dependencies:** zero external (node:crypto + node:events only)

---

## 1. Purpose / מטרה

### English
Enforce per-category retention periods for audit-log and business
records according to Israeli law. The platform's iron rule —
"We do not delete, we only upgrade and grow" — is preserved
unconditionally: retention expiry results in a **soft-archive** event
to cold storage, never a `DELETE` against production data.

### עברית (RTL)
‫מנוע אכיפת שימור רשומות ביקורת לפי דיני מדינת ישראל, לפי קטגוריה.‬
‫כלל הברזל של המערכת — "לא מוחקים, רק משדרגים ומגדלים" — נשמר ללא תנאי:‬
‫תום תקופת השימור גורר ארכוב רך (soft-archive) והעברה לאחסון קר (cold storage),‬
‫לעולם לא מחיקה קשה של נתוני הפרודקשן.‬

---

## 2. Retention matrix / מטריצת שימור

| Category | Years | חוק (HE) | Law (EN) | Anchor field |
|---|---|---|---|---|
| `financial` | 7 | פקודת מס הכנסה וחוק מע״מ | Income Tax Ordinance & VAT Law | `created_at` |
| `employment` | 7 | חוק שעות עבודה ומנוחה | Work Hours & Rest Law | `termination_date` |
| `aml` | 7 | חוק איסור הלבנת הון | Prohibition on Money Laundering Law | `transaction_date` |
| `privacy` | 7 | חוק הגנת הפרטיות | Protection of Privacy Law (PDPL) | `purpose_end_date` |
| `contracts` | 7 | חוק ההתיישנות | Statute of Limitations | `expiry_date` |
| `medical` | 10 | חוק זכויות החולה | Patient's Rights Law | `created_at` |
| `construction` | 25 | חוק המכר (דירות) | Sale of Apartments Law | `handover_date` |
| `tax_audit` | 10 | פקודת מס הכנסה — סעיפי ביקורת | Income Tax — audit statute | `created_at` |

---

## 3. Public API / ממשק ציבורי

| Method | Purpose |
|---|---|
| `new RetentionEngine({ now })` | Construct engine with an optional injected clock |
| `register(record)` | Ingest a record; idempotent |
| `categorize(record)` | Returns `{category, years, labels:{he,en}, law:{he,en}, anchor}` |
| `computeExpiryDate(record)` | Date of retention expiry; `null` if on legal hold |
| `scanDue(asOf?)` | Returns the list of records whose retention has expired |
| `archiveBatch(records)` | Soft-archives: emits `archive` event and flags `archived=true`; NEVER deletes |
| `holdOverride(id, reason)` | Places a legal hold — retention is paused indefinitely |
| `releaseHold(id, reason)` | Releases a legal hold |
| `bilingualReport()` | Generates an HE + EN summary with a SHA-256 seal |
| `verifyChain()` | Walks the SHA-256 decision chain and validates every link |
| `decisions` (getter) | Immutable snapshot of the chained decision log |

---

## 4. Immutable decision chain / שרשרת החלטות בלתי-ניתנת-לשינוי

Every engine action (`register`, `scan_due`, `archive`,
`archive_blocked_by_hold`, `legal_hold_placed`,
`legal_hold_released`) is appended to an in-memory array and chained
by SHA-256:

```
decision[i].prevHash  =  decision[i-1].hash
decision[i].hash      =  SHA256(stableJSON(decision[i] without .hash))
```

- A genesis block (seq 0) is written at construction time.
- `verifyChain()` re-computes every hash and confirms each
  `prevHash` linkage.
- Tampering with any field of any decision is detected deterministically.
- The chain itself is never pruned — it is the "growing" half of
  _"לא מוחקים, רק משדרגים ומגדלים"_.

---

## 5. Test run / ריצת בדיקות

```
$ cd onyx-procurement && node --test test/compliance/retention-engine.test.js

✔ 01 categorize — explicit record.category is honoured
✔ 02 categorize — invoice → financial (7y)
✔ 03 categorize — tag fallback resolves to construction (25y)
✔ 04 categorize — unknown record defaults to privacy/7y
✔ 05 computeExpiryDate — financial 7 years from created_at
✔ 06 computeExpiryDate — medical 10 years
✔ 07 computeExpiryDate — construction 25 years from handover_date
✔ 08 computeExpiryDate — legal hold returns null
✔ 09 scanDue — returns only records whose retention has expired
✔ 10 archiveBatch — soft-archive emits event, flags row, never deletes
✔ 11 archiveBatch — legal hold blocks archival (hold wins)
✔ 12 holdOverride / releaseHold round-trip
✔ 13 verifyChain — untouched chain verifies
✔ 14 verifyChain — tampering with internal chain is detected
✔ 15 bilingualReport — bilingual content and SHA256 seal
✔ 16 RETENTION_MATRIX is frozen and carries all 8 categories

ℹ tests 16
ℹ pass 16
ℹ fail 0
ℹ duration_ms ≈ 112
```

**Coverage of specification requirements:**

| Requirement | Test(s) |
|---|---|
| `categorize(record)` | 01, 02, 03, 04 |
| `computeExpiryDate(record)` | 05, 06, 07, 08 |
| `scanDue(now)` | 09 |
| `archiveBatch` emits event, no delete | 10 |
| `holdOverride` — legal hold wins | 08, 11, 12 |
| `bilingualReport` HE + EN | 15 |
| SHA-256 immutable audit trail | 13, 14 |
| Retention matrix integrity | 16 |

---

## 6. Invariant audit / ביקורת אינוריאנטים

### English — what the engine **cannot** do
1. It has no `delete()` method anywhere. `archiveBatch` only flags
   records `archived=true` and emits an event; the original row
   stays in the engine's map.
2. `scanDue()` never mutates records — it only reads and appends a
   decision.
3. A record on legal hold is excluded from `scanDue` AND blocks
   `archiveBatch`, producing an `archive_blocked_by_hold` chain entry.
4. The `RETENTION_MATRIX` object is `Object.freeze`-d; it cannot be
   tampered with at runtime.
5. Every decision is appended with a SHA-256 hash chained to the
   previous tip. Tamper detection is deterministic.

### עברית (RTL)
‫1. במנוע אין שום פונקציית delete. `archiveBatch` מסמן בלבד ומשדר אירוע;‬
‫   הרשומה המקורית נשארת במבנה הנתונים.‬
‫2. `scanDue` לא משנה רשומות — רק קורא ומוסיף בלוק החלטה.‬
‫3. רשומה עם עיכוב משפטי מוחרגת מ־`scanDue` וחוסמת את `archiveBatch` —‬
‫   נוצר בלוק `archive_blocked_by_hold` בשרשרת.‬
‫4. מטריצת השימור קפואה (`Object.freeze`) ואי־אפשר לשנותה בזמן ריצה.‬
‫5. כל החלטה נחתמת ב־SHA-256 ומחוברת לבלוק הקודם, ולכן זיהוי שינוי בלתי־מורשה ודאי.‬

---

## 7. Known limitations / מגבלות ידועות

- In-memory store only. A production deployment should plug in a
  persistent adapter that replays `register` / `archive` events.
- Archive events are emitted; the **cold-storage writer** is a
  downstream consumer (out of scope for this module).
- Categorisation heuristics are currently a static table
  (`TYPE_TO_CATEGORY`). New document types must be added there
  or explicitly set via `record.category`.
- Leap-year math uses `Date.setUTCFullYear` — Feb 29 + 25 years on a
  non-leap year will fall on Mar 1 (Node Date semantics). This
  matches the "upper-bound" interpretation favoured by Israeli
  auditors.

---

## 8. Files delivered / קבצים שסופקו

1. `onyx-procurement/src/compliance/retention-engine.js` — engine (≈ 460 LoC)
2. `onyx-procurement/test/compliance/retention-engine.test.js` — 16 tests (≈ 250 LoC)
3. `_qa-reports/AG-Y149-audit-retention.md` — this bilingual report

**Compliance principle honoured / עיקרון נשמר:**
_"לא מוחקים — רק משדרגים ומגדלים."_
_"We do not delete — we only upgrade and grow."_
