# AG-Y136 — DSR Handler (Israeli PDPL / Amendment 13, 2024)

**Agent:** Y-136
**Date:** 2026-04-11
**Scope:** Data Subject Request handler for Techno-Kol Uzi mega-ERP, conforming to Israeli חוק הגנת הפרטיות (Privacy Protection Law) as amended by **תיקון 13 / 2024** (effective 14/08/2024).
**Status:** Delivered — 28/28 tests passing.

---

## 1. Summary / תקציר

**EN —** Delivered a zero-dependency, Hebrew-first (RTL) Data Subject Request (DSR) handler that implements every subject right catalogued in Israel's Privacy Protection Law as amended by Amendment 13 (2024). The handler exposes an injectable data-source registry so it never imports concrete storage, enforces the `"לא מוחקים רק משדרגים ומגדלים"` invariant by refusing hard deletion and instead pseudonymizing + flipping status to `erased`, honours statutory retention periods (tax 7y, HR 7y, AML 7y, medical 10y, construction 25y) as absolute overrides to the right to erasure, computes 30/60-day statutory deadlines, escalates complaints to the DPO (`ממונה הגנה על מידע`), emits a 72-hour authority notification deadline for material breaches, and records every action in a SHA-256-chained append-only audit trail with tamper detection.

**HE —** מסופק מודול חסר-תלויות חיצוניות, עברית-ראשונה (RTL), המטפל בבקשות נושא מידע (DSR) ומממש את כל הזכויות המנויות בחוק הגנת הפרטיות כפי שתוקן ב**תיקון 13 משנת 2024** (תוקף: 14/08/2024). המודול פותח נקודות הרחבה למקורות מידע, אוכף את עקרון *"לא מוחקים רק משדרגים ומגדלים"* באמצעות סירוב למחיקה קשה והחלפת סטטוס ל"נמחק" עם פסבדונימיזציה, מכבד תקופות שימור סטטוטוריות (מס 7ש, משא"ן 7ש, איסור הלבנת הון 7ש, רפואי 10ש, בנייה 25ש) כגוברות על זכות המחיקה, מחשב מועדי מענה סטטוטוריים של 30/60 יום, מנתב תלונות לממונה הגנה על מידע, ומחשב מועד הודעה לרשות להגנת הפרטיות בתוך 72 שעות עבור אירוע פריצה מהותי — כל זאת תוך כתיבת שרשרת ביקורת חתומה SHA-256 בלתי ניתנת לשינוי.

---

## 2. Files Delivered

| File | Lines | Purpose |
|---|---|---|
| `onyx-procurement/src/privacy/dsr-handler.js` | ~780 | `DSRHandler` class + constants + helpers |
| `onyx-procurement/test/privacy/dsr-handler.test.js` | ~420 | 28 unit tests via `node --test` |
| `_qa-reports/AG-Y136-dsr-handler.md` | this file | QA report |

Run: `node --test test/privacy/dsr-handler.test.js`

Result: **28 pass / 0 fail** (see §8).

---

## 3. Request Types (per תיקון 13) / סוגי בקשות

| key | Hebrew (RTL) | English | Law section |
|---|---|---|---|
| `access` | עיון במידע | Right of access | סעיף 13 לחוק הגנת הפרטיות |
| `rectification` | תיקון מידע | Right to rectification | סעיף 14 לחוק הגנת הפרטיות |
| `erasure` | מחיקת מידע | Right to erasure | סעיף 14 (תיקון 13) |
| `portability` | ניידות מידע | Right to data portability | סעיף 13א (תיקון 13) |
| `restriction` | הגבלת עיבוד | Right to restriction of processing | סעיף 14א |
| `objection` | התנגדות לעיבוד | Right to object | סעיף 17ו |
| `complaint` | תלונה לממונה | Complaint to DPO / Authority | סעיף 10 לתקנות |

Every label is frozen (`Object.freeze`) and the keys are stable machine tokens — UI layers can pick their language without renaming the underlying enum.

---

## 4. Statutory Deadline Matrix / מטריצת מועדי מענה

Per תיקון 13, **30 calendar days** is the standard response deadline for all seven subject rights. It may be extended **once** by an additional 30 days (total **60 days**) for complex requests, provided the subject receives a written notice of extension. `markComplex(id, justification)` is the only path that flips a request's active deadline — the handler throws a `TypeError` if no written justification is supplied, matching the statute's evidentiary requirement.

| Right / זכות | Standard | Extended (complex) | Extension requires |
|---|---|---|---|
| access / עיון | 30 d | 60 d | Written justification |
| rectification / תיקון | 30 d | 60 d | Written justification |
| erasure / מחיקה | 30 d | 60 d | Written justification |
| portability / ניידות | 30 d | 60 d | Written justification |
| restriction / הגבלה | 30 d | 60 d | Written justification |
| objection / התנגדות | 30 d | 60 d | Written justification |
| complaint / תלונה | 30 d | 60 d | Written justification |

---

## 5. Retention Override Matrix — never-delete wins / שימור סטטוטורי דוחה מחיקה

`processErasure` scopes the subject's data through the injectable registry, then for every category it discovers it consults this immutable matrix. If **any** category is still within retention, the erasure is **refused in writing** (per the statute), a bilingual refusal letter is generated, and the status is flipped to `refused`. Categories that are NOT under retention are soft-deleted: plaintext PII is replaced with `pseudonymize(value)` and the row is flagged `erased` — physical rows are never removed.

| Category | Years | Law (HE) | Law (EN) |
|---|---:|---|---|
| `tax` | 7 | פקודת מס הכנסה | Income Tax Ordinance |
| `vat` | 7 | חוק מס ערך מוסף | VAT Law |
| `hr` | 7 | חוק שעות עבודה ומנוחה | Hours of Work and Rest Law |
| `aml` | 7 | חוק איסור הלבנת הון | Anti-Money-Laundering Law |
| `medical` | 10 | חוק זכויות החולה | Patient Rights Law |
| `construction` | 25 | חוק המכר (דירות) | Sale (Apartments) Law — construction warranty |
| `contracts` | 7 | חוק ההתיישנות | Limitation Law |

**Legal precedent:** Amendment 13 does **not** grant a general right to erasure that overrides statutory retention. Section 14 of the Law explicitly requires a controller to "correct, complete, clarify or delete" information that is no longer required for the purpose — but the Tax Ordinance (§135), the VAT Law (§73), the AML Law (§8), and the Hours of Work and Rest Law impose positive obligations to retain. The controller's safe position is: refuse erasure in writing, cite the specific retention statute, and apply soft deletion to the residue. The handler does exactly this and emits `erasure.refused` in the audit log.

---

## 6. Breach Notification — 72 hours / הודעה על אירוע אבטחה

Under תיקון 13 a material data breach triggers two distinct notification duties:

1. **To the Authority (הרשות להגנת הפרטיות / Israeli Privacy Protection Authority)** — **within 72 hours** of discovery.
2. **To affected subjects** — "without undue delay" (`ללא דיחוי בלתי סביר`), particularly where the breach creates a risk to the subject's rights or freedoms.

`breachNotification({ incidentId, affectedSubjects, severity, discoveredAt })` implements this logic. Severity levels:

| severity | isMaterial | Authority notice | Subject notice |
|---|:-:|:-:|:-:|
| `low` | no | no | no |
| `medium` | no | no | no |
| `high` | **yes** | yes | yes |
| `critical` | **yes** | yes | yes |

For material breaches the handler computes `authorityDeadline = discoveredAt + 72h` and surfaces it in both the return value and the audit trail, ready to be handed off to the notification pipeline. Subject identifiers are stored as salted SHA-256 hash + last 4 digits only — plaintext ID never enters the breach log.

---

## 7. DPO Criteria / קריטריונים למינוי ממונה הגנה על מידע

Amendment 13 introduces a formal Database Officer / Data Protection Officer requirement. `DSRHandler.dpoCriteria()` returns a bilingual list of triggers:

**HE:**
- מאגר הכולל מעל 100,000 נושאי מידע
- מאגר ציבורי (גוף ציבורי / רשות מקומית)
- מאגר המכיל מידע בעל רגישות גבוהה (בריאות, גנטיקה, ביומטריה, הליכים פליליים)
- עיסוק עיקרי בעיבוד שיטתי ונרחב של מידע אישי

**EN:**
- Database with more than 100,000 data subjects
- Public-sector database (government / municipality)
- Database holding high-sensitivity data (health, genetic, biometric, criminal)
- Main activity is systematic large-scale processing of personal data

When a DPO is configured via `setDPO({ id, name, email })`, complaints are routed to that officer; otherwise they escalate to the Authority placeholder `dpo@justice.gov.il` so the caller is visibly aware that no internal DPO has been wired up.

---

## 8. Test Matrix / מטריצת בדיקות

Ran `node --test test/privacy/dsr-handler.test.js` — **28 tests, all passing**, duration ~107 ms.

| # | Test | Covers |
|---|---|---|
| 01 | receiveRequest — access creates record with 30d deadline | intake, deadline calc |
| 02 | receiveRequest — rectification | HE/EN labels + section |
| 03 | receiveRequest — erasure | תיקון 13 reference |
| 04 | receiveRequest — portability | intake |
| 05 | receiveRequest — restriction | intake |
| 06 | receiveRequest — objection | intake |
| 07 | receiveRequest — complaint | intake |
| 08 | receiveRequest — unknown type rejected | input validation |
| 09 | receiveRequest — plaintext ת.ז never stored, only hash + last4 | PII minimization |
| 10 | verifyIdentity — approved flips status | KYC-lite happy path |
| 11 | verifyIdentity — bad ת.ז format rejected with Hebrew reason | KYC-lite rejection |
| 12 | scopeRequest — aggregates across injected data sources | registry contract |
| 13 | processAccessRequest — bilingual export with legal basis | access right |
| 14 | processRectification — corrections pseudonymized | rectification right |
| 15 | processErasure — retention hold BLOCKS erasure | statutory override |
| 16 | processErasure — non-retention soft-delete + pseudonymize | erasure right |
| 17 | processPortability — JSON + CSV with UTF-8 BOM | portability right |
| 18 | processRestriction — freeze flag set | restriction right |
| 19 | processObjection — opt-out flag set | objection right |
| 20 | processComplaint — escalates to DPO | complaint right |
| 21 | statutoryDeadline — 30 / 60 for every type | deadline matrix |
| 22 | markComplex — requires written justification + extends to 60 | complex path |
| 23 | generateResponse — bilingual HE + EN with all sections | formal letter |
| 24 | breachNotification — critical → 72h authority deadline | breach 72h |
| 25 | breachNotification — low severity → no notification | breach threshold |
| 26 | auditLog — SHA-256 chain intact + tamper detection | immutable log |
| 27 | DPO criteria — bilingual list, const immutability | DPO, freeze |
| 28 | processAccessRequest — throws if identity not verified | verification gate |

---

## 9. Architecture Notes

- **Zero external dependencies** — only `node:crypto`. No `express`, no `zod`, no `joi`, no CSV library, no date library. Everything (UUID-ish IDs, pseudonymization, ISO dates, CSV) is handcrafted against the Node built-ins.
- **Injectable data sources** — the handler never imports concrete storage. Callers do `h.registerDataSource('hr', fn)` and the handler walks the registry in `scopeRequest`, `processAccessRequest`, and `processPortability`. A source whose fetcher throws is recorded as `ok:false` with the error message in the scope — the request never dies because of a single broken source.
- **Soft-delete-only** — `processErasure` **never** calls any mutation that could physically remove data. It flips `status` and emits `erasure.applied`; downstream consumers subscribe to that audit event to propagate the status flip to their own storage.
- **PII minimization** — ת.ז is stored only as `sha256(salt + raw)` + last-4. Verification documents are stored the same way. Names are kept plaintext for the purpose of the response letter (subject consented to this by filing the request) but are pseudonymized upon erasure.
- **Append-only audit trail** — every public method appends one or more entries to `_auditChain`. Each entry is `sha256(prevHash || serialized_entry)` so any mutation anywhere in the chain invalidates everything downstream. `verifyChain()` walks the chain and returns `{ valid, brokenAt }`.
- **Hebrew RTL everywhere** — every user-facing string has both an `he` and an `en` key. The response letter is constructed as two parallel arrays joined by `\n`, so the RTL block is semantically separate from the LTR block and can be rendered in either direction depending on the client.
- **Storage is in-memory Maps** — `_requests`, `_verifications`, `_scopes`, `_responses`, `_breaches`, `_dataSources`, `_auditChain`. Nothing is persisted to disk; persistence is the responsibility of the caller. The handler is deterministic enough for replay if the caller records and re-feeds events.

---

## 10. Hebrew Glossary / מילון מונחים

| Hebrew | English | Context |
|---|---|---|
| חוק הגנת הפרטיות | Privacy Protection Law | The core Israeli statute |
| תיקון 13 | Amendment 13 | 2024 amendment, effective 14/08/2024 |
| נושא מידע | Data subject | Individual to whom the data relates |
| בקשת נושא מידע (DSR) | Data Subject Request | Formal request to exercise a right |
| ממונה הגנה על מידע (DPO) | Data Protection Officer / Database Officer | Statutory role |
| הרשות להגנת הפרטיות | Privacy Protection Authority | Israeli supervisory authority |
| עיון במידע | Right of access | Section 13 |
| תיקון מידע | Right to rectification | Section 14 |
| מחיקת מידע | Right to erasure | Section 14 (תיקון 13) |
| ניידות מידע | Data portability | Section 13א (תיקון 13) |
| הגבלת עיבוד | Restriction of processing | Section 14א |
| התנגדות לעיבוד | Objection to processing | Section 17ו |
| תלונה | Complaint | Section 10 תקנות |
| תעודת זהות (ת.ז.) | Israeli ID card | 9-digit national ID |
| פסבדונימיזציה | Pseudonymization | Irreversible masking |
| שימור סטטוטורי | Statutory retention | Legally-mandated retention periods |
| ללא דיחוי בלתי סביר | Without undue delay | Subject notification threshold |
| אירוע אבטחה מהותי | Material security incident | Triggers 72h authority notice |
| צו עיכוב | Stay order | Court order blocking deletion |
| שרשרת ביקורת | Audit chain | Immutable SHA-256 chain of custody |
| לא מוחקים רק משדרגים ומגדלים | "We do not delete, only upgrade and grow" | Platform invariant |

---

## 11. Key Legal Points for Reviewers / נקודות משפטיות מרכזיות

1. **תיקון 13 נכנס לתוקף ב-14/08/2024** — enforcement began on 14 August 2024. All requests received from that date forward are subject to the new regime. The handler's `section` metadata already quotes the amended sections.
2. **30 days is the standard deadline; 60 days is the extended deadline**, available only for complex requests and only with written notification to the subject. `markComplex(id, justification)` is the only way to promote a request; it throws if no justification is supplied.
3. **The Database Officer / DPO (ממונה הגנה על מידע)** must be designated when any of the four criteria in §7 above is met. When a DPO is configured, complaints (`processComplaint`) are routed to that officer; otherwise the handler escalates to the Authority placeholder to force the caller to notice the gap.
4. **Material breach → 72 hours to the Authority** + subject notification "without undue delay". The handler computes the 72-hour authority deadline inline and records it in the audit trail the moment `breachNotification` is called with severity `high` or `critical`.
5. **The right to erasure does NOT override statutory retention.** The handler encodes this as an absolute rule: any in-scope category that appears in `STATUTORY_RETENTION` blocks erasure and the request is refused in writing with the specific citation. Categories outside the matrix are soft-deleted via pseudonymization + status flip — never physically removed (per the `"לא מוחקים"` invariant).
6. **Refusal of a DSR must be in writing with justification.** The bilingual response letter generated by `generateResponse` always includes a refusal body with the full list of blocking retention categories, each with its years and legal citation in both languages. The letter is SHA-256 hashed into the audit trail.
7. **Immutable audit trail (chain of custody).** Every mutation writes to `_auditChain`; `verifyChain()` returns `{ valid:false, brokenAt:N }` if any single entry has been altered. This is intended to satisfy discovery requirements in the event of an Authority audit.

---

## 12. Known Limitations / מגבלות ידועות

- **In-memory only.** Persistence and replication are the caller's responsibility. An adapter pattern (e.g. `store.append(evt)`) could be wired in without touching the handler's public API.
- **No identity-validator integration yet.** The handler performs a shape check on ת.ז (`/^\d{9}$/`) but does NOT run a Luhn-style checksum. Integration with the existing `AG-94` company-id-validator / a dedicated ת.ז validator should be wired via the `verifyIdentity` hook when available.
- **Response letter is plain text.** A richer PDF/HTML renderer can consume `resp.he` / `resp.en` — the current output is safe for any RTL-aware renderer and preserves the audit hash.
- **No automatic deadline alerts.** `activeDeadline` is computed and stored, but a cron/scheduler that notifies the operations team at day 20 / day 50 is out of scope. `listRequests({ status })` is the hook the scheduler should use.
- **DPO routing is single-tenant.** The current design stores one DPO per handler instance. For multi-tenant deployments, pass a `dpo` option per-tenant or extend `setDPO` to accept a tenant key.

---

## 13. Invariant Compliance Matrix

| Rule | Status | Evidence |
|---|---|---|
| `"לא מוחקים רק משדרגים ומגדלים"` | PASS | Test 15+16 — no call to `delete`, `splice`, or equivalent; erasure is status flip + pseudonymize |
| Zero external deps — Node built-ins only | PASS | `require('node:crypto')` only; no `package.json` touched |
| Hebrew RTL + bilingual labels | PASS | Tests 01-07, 13, 18, 19, 20, 23 — every label has `he` + `en` |
| Israeli privacy law compliance critical | PASS | תיקון 13 references in 11 places across code+tests; 72h breach, 30/60 deadlines, retention override all encoded |
| At least 20 tests | PASS | **28 tests**, all passing |
| Tests cover: each type, identity, scope, erasure soft-delete + retention block, portability JSON, 30/60 deadline, 72h breach | PASS | Tests 01-28 cover every required surface |

---

**Report ends.**
