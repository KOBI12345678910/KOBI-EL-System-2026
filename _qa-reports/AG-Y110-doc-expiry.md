# AG-Y110 — Document Expiry Alert Engine (DocExpiry)
**Agent:** Y-110 | **Swarm:** Office Docs | **Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** PASS — 23/23 tests green (`node --test test/docs/doc-expiry.test.js`)

---

## 1. Scope — היקף

A zero-dependency engine that tracks every document in the ERP whose validity
expires on a known date, grades it into a severity bucket, issues graduated
reminders, and runs renewals as append-only version upgrades. Nothing is
ever deleted: renewal = new version, expiry = status flip.

מנוע אפס-תלויות שעוקב אחר כל מסמך שיש לו תאריך תפוגה, מסווג אותו לסל חומרה,
מפיק תזכורות מדורגות, ומפעיל חידושים כהעלאות גרסה נוספות. אף פעם לא מוחקים:
חידוש = גרסה חדשה, פקיעה = שינוי סטטוס בלבד.

**Delivered files**
- `onyx-procurement/src/docs/doc-expiry.js` — the engine (`DocExpiry` class + frozen enums)
- `onyx-procurement/test/docs/doc-expiry.test.js` — 23 `node:test` tests
- `_qa-reports/AG-Y110-doc-expiry.md` — this report

**Rules respected — כללים**
- לא מוחקים רק משדרגים ומגדלים — renewal is append-only, expiry never deletes history
- Zero external deps — only `node:crypto`, `node:test`, `node:assert`
- Hebrew RTL + bilingual labels (`he` + `en`) on every public enum, alert, email, and report
- In-memory storage only (`Map<docId, record>`), append-only versions & events

---

## 2. Public API

```js
const { DocExpiry } = require('./src/docs/doc-expiry.js');
const eng = new DocExpiry({ clock: () => new Date().toISOString() });

eng.registerDocument({ docType, title_he, title_en, issueDate, expiryDate, owner,
                       autoRenew?, renewalLeadDays?, referenceNo?, metadata? })
eng.listExpiring({ days, now? })
eng.alertExpiring({ leadDays?, now? })                       // default [90,60,30,7,1]
eng.renewDocument({ docId, newIssueDate?, newExpiryDate, renewedBy, referenceNo? })
eng.markExpired(docId, 'archive' | 'block' | 'warn')
eng.bulkImport(documents[])
eng.reportByDocType(docType)                                 // rollup
eng.history(docId)                                           // full lifecycle
eng.setAutoRenewPolicy(docType, { enabled, leadDays, autoRenewBy, extendByDays })
eng.runAutoRenew({ now? })                                   // drives the policy
eng.checkExpiredCritical(now?)                               // expired & blocking
eng.generateReminderEmail(docId, 'he' | 'en')                // bilingual payload
```

Every method returns plain JSON-safe objects; internal state is defended
via deep-cloned copies so callers cannot mutate the append-only store.

---

## 3. Doc types covered — סוגי מסמכים

| id                      | he                     | en                       | blocking ops |
|-------------------------|------------------------|--------------------------|--------------|
| `contract`              | חוזה                   | Contract                 | no           |
| `license`               | רישיון עסק              | Business license         | **yes**      |
| `insurance`             | פוליסת ביטוח            | Insurance policy         | **yes**      |
| `certification`         | תעודת הסמכה             | Certification            | no           |
| `lease`                 | חוזה שכירות             | Lease                    | **yes**      |
| `permit`                | היתר                    | Permit                   | **yes**      |
| `warranty`              | אחריות יצרן             | Warranty                 | no           |
| `nda`                   | הסכם סודיות             | NDA                      | no           |
| `gdpr-dpa`              | הסכם עיבוד נתונים       | GDPR DPA                 | no           |
| `employment-agreement`  | הסכם העסקה              | Employment agreement     | no           |
| `vehicle-registration`  | רישוי רכב               | Vehicle registration     | **yes**      |

`blocking: true` means `checkExpiredCritical()` treats a past-due record of
this type as a stop-the-line issue (insurance / license / lease / permit /
vehicle registration — the categories a factory legally cannot operate
without).

---

## 4. Expiry buckets — סלי תפוגה

`listExpiring({ days })` buckets every non-archived document against the
current clock, using strict day integers (rounded half-up).

| bucket     | condition              | he               | en                | severity |
|------------|------------------------|------------------|-------------------|----------|
| `expired`  | `expiryDate < now`     | פג תוקף          | Expired           | 4        |
| `critical` | `daysUntilExpiry < 7`  | קריטי (<7)       | Critical (<7d)    | 3        |
| `urgent`   | `daysUntilExpiry < 30` | דחוף (<30)       | Urgent (<30d)     | 2        |
| `soon`     | `daysUntilExpiry < 90` | בקרוב (<90)      | Soon (<90d)       | 1        |
| `valid`    | everything else        | בתוקף            | Valid             | 0        |

The `days` window controls the **forward** horizon — past-due docs always
surface regardless of window, so nothing slips silently off the report.

---

## 5. Lead-day reminder schedule — לוח תזכורות

`alertExpiring()` emits a graduated cascade of reminders. The default
ladder is `[90, 60, 30, 7, 1]` and can be overridden per call.

| lead tag | window          | typical usage                                |
|----------|-----------------|----------------------------------------------|
| `T-90`   | 30 < d ≤ 90     | procurement scouts replacement supplier      |
| `T-60`   | 7 < d ≤ 60      | legal starts negotiating renewal terms       |
| `T-30`   | 7 < d ≤ 30      | CFO approval + vendor signature loop opens   |
| `T-7`    | 1 < d ≤ 7       | critical escalation to CEO mailbox           |
| `T-1`    | 0 ≤ d ≤ 1       | final day banner on the dashboard            |
| `post-expiry` | d < 0      | emitted daily until `markExpired` runs       |

The algorithm picks the **tightest** matching lead tag (the soonest lead
day that is still ≥ the remaining days). A 14-day-out contract fires `T-30`
with a custom ladder `[30,14,3]` — `T-14` wins because the ladder is
descended and the last match wins.

---

## 6. Lifecycle & append-only invariant

```
                 ┌───────────────┐      renewDocument()
registerDocument │   v1 valid    │────────────────────────┐
 ───────────────▶│  (createdAt)  │                        │
                 └───────────────┘                        ▼
                         │                       ┌───────────────┐
                         │                       │   v2 valid    │
                         │                       │ parentVersion=1│
                         ▼                       └───────────────┘
                 ┌───────────────┐                        │
                 │ expiryDate<now│◀───(clock advances)────┘
                 └───────────────┘
                         │
             markExpired('archive'|'block'|'warn')
                         │
                         ▼
                 ┌───────────────┐
                 │  status flip  │ versions array is never touched
                 └───────────────┘
```

Key invariants (enforced by tests 10, 11, 13, 18):
1. `versions[]` is append-only — `renewDocument` pushes a new frozen entry.
2. A renewed version carries `parentVersion` → full chain traceable via
   `history(docId)`.
3. `markExpired` flips `record.status` only; `versions.length` never
   decreases.
4. `history()` returns deep copies so mutation by callers is a no-op.
5. Renewal cannot *shrink* coverage — `newExpiryDate` must be strictly
   greater than the previous `expiryDate`.

---

## 7. Auto-renew policy

`setAutoRenewPolicy(docType, { enabled, leadDays, autoRenewBy, extendByDays })`
stores a per-type policy. `runAutoRenew({ now })` walks every non-archived
document of that type whose `daysUntilExpiry ≤ policy.leadDays` and calls
`renewDocument` on its behalf, tagging the event as `auto_renew_trigger`
and linking the originating policy so auditors can reconstruct *why* the
bot touched the file. Test 19 exercises this end-to-end.

Policy defaults:
- `leadDays` — 30 days before expiry
- `extendByDays` — 365 days forward from the prior `expiryDate`
- `autoRenewBy` — `system@tko`

---

## 8. Bilingual email templates

`generateReminderEmail(docId, lang)` returns a bilingual payload whose
`language` / `direction` / `subject` / `body` surface the caller's
requested language, while the `he` and `en` sub-objects always carry
*both* languages so dashboards can render side-by-side. Severity is
recomputed on the spot using the same thresholds as `listExpiring`
buckets, so the subject line reads:

| severity  | he                     | en                           |
|-----------|------------------------|------------------------------|
| expired   | `[פג תוקף] …`          | `[EXPIRED] …`                |
| critical  | `[תזכורת קריטית] …`    | `[CRITICAL reminder] …`      |
| urgent    | `[תזכורת דחופה] …`     | `[URGENT reminder] …`        |
| soon      | `[תזכורת מוקדמת] …`    | `[SOON reminder] …`          |

Every email is also recorded as a `reminder_email` event on the document's
append-only log (test 21).

---

## 9. Test coverage — 23/23 PASS

```
✔ 01. registerDocument creates v1 with bilingual labels
✔ 02. registerDocument rejects unknown docType
✔ 03. registerDocument rejects expiryDate < issueDate
✔ 04. registerDocument rejects duplicate docId (use renewDocument)
✔ 05. listExpiring buckets: expired / critical / urgent / soon
✔ 06. listExpiring respects the days window
✔ 07. alertExpiring default 90/60/30/7/1 cascade
✔ 08. alertExpiring honours caller-supplied leadDays
✔ 09. alertExpiring emits post-expiry alerts for past-due docs
✔ 10. renewDocument creates v2 and keeps v1 immutable
✔ 11. renewDocument refuses to shrink the expiry date
✔ 12. renewDocument on unknown docId throws
✔ 13. markExpired archive — never deletes versions
✔ 14. markExpired block flips status to blocked
✔ 15. markExpired unknown action throws
✔ 16. bulkImport reports per-row success/failure
✔ 17. reportByDocType rolls up totals per doc type
✔ 18. history returns versions + events, immutable to callers
✔ 19. auto-renew policy triggers a new version when lead is reached
✔ 20. checkExpiredCritical returns only expired blocking docs
✔ 21. generateReminderEmail produces bilingual payload
✔ 22. every enum entry has he + en labels
✔ 23. registerDocument accepts all 11 documented doc types

tests 23  pass 23  fail 0  duration_ms ~110
```

Deterministic clock: every test uses an injected `clock()` advancing 1s per
call, anchored at `2026-04-11T08:00:00Z`, so no flakes on fast machines.

---

## 10. Hebrew glossary — מילון מונחים

| English                  | עברית               | notes                                       |
|--------------------------|---------------------|---------------------------------------------|
| Document                 | מסמך                | tracked by the engine                       |
| Expiry date              | תאריך תפוגה         | `expiryDate` field                          |
| Issue date               | תאריך הנפקה          | `issueDate` field                           |
| Owner                    | אחראי               | who receives reminder emails                |
| Valid                    | בתוקף               | `DOC_STATUS.valid`                          |
| Expired                  | פג תוקף             | `DOC_STATUS.expired` / bucket               |
| Renewed                  | חודש                | `DOC_STATUS.renewed`                        |
| Renewal                  | חידוש               | `renewDocument` event                       |
| Archived                 | בארכיון              | `markExpired('archive')`                    |
| Blocking operations      | חסום תפעול          | `markExpired('block')`                      |
| Warning                  | אזהרה               | `markExpired('warn')`                       |
| Version                  | גרסה                | append-only                                 |
| Lifecycle history        | היסטוריית מחזור חיים | `history(docId)`                            |
| Lead days                | ימי התראה מוקדמת    | cascade `[90,60,30,7,1]`                    |
| Critical                 | קריטי               | `<7 days`                                   |
| Urgent                   | דחוף                | `<30 days`                                  |
| Soon                     | בקרוב               | `<90 days`                                  |
| Post-expiry alert        | התראה לאחר פקיעה    | emitted until `markExpired` runs            |
| Auto renewal             | חידוש אוטומטי       | `setAutoRenewPolicy` + `runAutoRenew`       |
| Contract                 | חוזה                | doc type                                    |
| Business license         | רישיון עסק          | doc type — blocking                         |
| Insurance policy         | פוליסת ביטוח        | doc type — blocking                         |
| Certification            | תעודת הסמכה         | e.g. תעודת ריתוך, תעודת בטיחות              |
| Lease                    | חוזה שכירות         | doc type — blocking                         |
| Permit                   | היתר                | doc type — blocking                         |
| Warranty                 | אחריות יצרן         | doc type                                    |
| NDA                      | הסכם סודיות         | doc type                                    |
| GDPR DPA                 | הסכם עיבוד נתונים   | doc type — privacy-critical                 |
| Employment agreement     | הסכם העסקה          | doc type                                    |
| Vehicle registration     | רישוי רכב           | doc type — blocking                         |
| Bulk import              | ייבוא כמותי          | `bulkImport(documents[])`                   |
| Report by doc type       | דוח לפי סוג מסמך     | `reportByDocType(docType)`                  |
| Reminder email           | תזכורת במייל         | `generateReminderEmail(docId, lang)`        |

---

## 11. Out-of-scope / future

- **Persistence.** In-memory only for now. A future agent can wire the
  same API onto a SQLite/Postgres-backed store without changing the
  public surface (the record shape is already JSON-safe).
- **Calendar integration.** The reminder pipeline emits structured events;
  a downstream agent (Y-16x notification-center) can subscribe to
  `reminder_email` / `alert` events and push ICS files or Slack DMs.
- **SLA on renewal.** Not modelled — the lead-day ladder is advisory, and
  a future iteration could add a hard-fail SLA that auto-blocks the
  document on `T-0` for the blocking types.

---
*Prepared by Agent Y-110 — 2026-04-11*
