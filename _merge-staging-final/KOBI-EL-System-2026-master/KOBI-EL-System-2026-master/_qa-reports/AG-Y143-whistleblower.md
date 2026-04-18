# AG-Y143 — Whistleblower Portal / פורטל חושפי שחיתויות

- **Agent:** Y-143
- **Swarm:** Compliance
- **System:** Techno-Kol Uzi Mega-ERP 2026
- **Module:** `onyx-procurement/src/compliance/whistleblower.js`
- **Tests:** `onyx-procurement/test/compliance/whistleblower.test.js`
- **Date / תאריך:** 2026-04-11
- **Status:** PASS — 25 / 25 tests green, `node --test`

---

## 1. Mission / משימה

### English
Build an append-only, tamper-evident, end-to-end encrypted whistleblower
portal for Techno-Kol employees and contractors to report wrongdoing with
a strict promise of anonymity and anti-retaliation protection. The portal
must be compliant with Israeli whistleblower law, must expose a clean
public API for integration with the ONYX Procurement back-end, and must
be implementable with zero external dependencies (Node built-ins only).

### עברית
לבנות פורטל חושפי שחיתויות מסוג append-only, עמיד לזיופים ומוצפן
מקצה-לקצה, לשימוש עובדים וקבלנים של טכנו-קול לצורך דיווח על עבירות,
תוך הבטחה מוחלטת של אנונימיות והגנה מפני פגיעה (retaliation). הפורטל
חייב לעמוד בחוק הגנה על עובדים (חשיפת עבירות ופגיעה בטוהר המידות או
במינהל התקין), תשנ"ז-1997, לחשוף ממשק Public API נקי לאינטגרציה עם
מערכת ONYX Procurement, וליישם באפס תלויות חיצוניות (Node built-ins
בלבד).

---

## 2. Legal Citation / ציטוט חוקי

### Primary statute / חוק ראשי
- **שם החוק:** חוק הגנה על עובדים (חשיפת עבירות ופגיעה בטוהר המידות או
  במינהל התקין), תשנ"ז-1997.
- **Name in English:** Israeli Protection of Workers (Exposure of
  Offences and Harm to Integrity or Proper Administration) Law, 5757-1997.
- **Year / שנה:** 1997 (תשנ"ז).

### Principles enforced by this module
| # | Principle / עקרון                                      | Source / מקור           | Implementation / יישום                          |
|---|--------------------------------------------------------|-------------------------|-------------------------------------------------|
| 1 | Protection from harm due to reporting                  | סעיף 2 לחוק             | `retaliationProtection` + auto-escalate         |
| 2 | Right to report in good faith                          | סעיף 4                  | bona-fide `submitReport` path (no gatekeeping)  |
| 3 | Right to effective remedy                              | סעיף 3                  | `reportAdverseAction` append-only record         |
| 4 | Bona-fide reports to a "competent body"                | סעיף 4(1)               | `externalEscalation` → ombudsman / comptroller  |
| 5 | Anonymous reporting channel                            | best practice           | `anonymousToken` + opaque `tokenHash`           |
| 6 | Append-only, tamper-evident evidence trail             | good governance         | SHA-256 hash chain + `integrityCheck`           |
| 7 | Statutory aggregate reporting to ministry              | הוראות נציב             | `statutoryReport(period)`                       |

---

## 3. Category List / רשימת קטגוריות

| Code             | Hebrew / עברית       | English              |
|------------------|----------------------|----------------------|
| `fraud`          | הונאה               | Fraud                |
| `corruption`     | שחיתות              | Corruption           |
| `safety`         | בטיחות              | Safety               |
| `discrimination` | אפליה               | Discrimination       |
| `harassment`     | הטרדה               | Harassment           |
| `regulatory`     | הפרה רגולטורית      | Regulatory breach    |
| `privacy`        | פגיעה בפרטיות       | Privacy violation    |
| `financial`      | עבירה כספית         | Financial misconduct |
| `other`          | אחר                 | Other                |

All nine are enumerated in `CATEGORIES` and validated on `submitReport`.

---

## 4. Anonymity Model / מודל אנונימיות

### 4.1 Token design
- **Reporter token:** 32 bytes (256 bits) from `crypto.randomBytes` → 64
  hex chars. Returned exactly once, on `submitReport`. The portal never
  stores the token itself.
- **Stored form:** SHA-256 digest of `salt || '|' || token`, where `salt`
  is a portal-wide 16-byte random value (injectable for tests).
- **Reverse lookup:** not possible. The hash is one-way, and for
  anonymous submissions no identity field was ever captured in the first
  place — not even in ciphertext.

### 4.2 Anonymity invariant / אי-חשיפת זהות
| Field                    | Anonymous mode | Identified mode         |
|--------------------------|----------------|-------------------------|
| `contactMethod`          | **never stored**   | encrypted (AES-256-GCM) |
| `preferredContact`       | **never stored**   | encrypted (AES-256-GCM) |
| `accusedParty` (freeform)| encrypted          | encrypted               |
| `description`            | encrypted          | encrypted               |
| `evidence[]`             | encrypted each     | encrypted each          |
| `tokenHash`              | stored             | stored                  |
| reporter IP / UA         | **never captured** | **never captured**      |

Test #4 (`anonymous submission stores no contact info anywhere`)
verifies the rule by inspecting the internal report state.

### 4.3 Audit-log anonymity
The global audit-log event for `report.submitted` records only
`reportId`, `caseNumber`, `category`, `anonymous` flag, and
`accusedDept`. It never carries `tokenHash`, `description`, or any
identity. Test #23 scans every audit event and asserts no
`tokenHash`/`reporterToken` fields exist anywhere.

---

## 5. Retaliation Protection / הגנה מפני פגיעה

### Flow
1. Reporter presents their token to `retaliationProtection(token)`.
2. The portal stores an active flag keyed by `tokenHash` and marks the
   case's `retaliationFlagged = true`.
3. If the reporter later calls `reportAdverseAction({reporterToken,
   action})`, the action is stored encrypted and an
   `retaliation.escalated` event is appended.
4. If the token previously activated the retaliation flag, the
   escalation is marked `autoEscalated: true`.

### Bilingual notice embedded in the flag
```
he: "דיווח זה מוגן מפני פגיעה לפי חוק הגנה על עובדים, תשנ"ז-1997."
en: "This reporter is protected against retaliation under the Israeli
     Protection of Workers Law, 5757-1997."
```

Tests #11, #12, #13 cover flag activation, auto-escalation, and
rejection of unknown tokens.

---

## 6. Encryption Approach / גישת ההצפנה

- **Algorithm:** AES-256-GCM (authenticated encryption).
- **Key:** 32-byte master key (injected via constructor `masterKey` or
  generated per instance).
- **IV:** 12 bytes, freshly random for every ciphertext.
- **Tag:** 16 bytes, stored alongside IV and ciphertext.
- **Record shape:** `{ algo: 'aes-256-gcm', iv, tag, ct }` (all hex).
- **Payloads encrypted:** report description, every evidence item, the
  accused-party freeform field, the identified-mode contact block, every
  secure message (unless `encrypt: false`), and every investigator note.
- **Tamper detection:** `_decrypt` throws on any IV/tag/ciphertext flip
  (test #25 flips one ciphertext byte and asserts the throw).

---

## 7. Append-only & "Never Delete" / לא מוחקים, רק משדרגים

| Store                  | Type                 | Mutation model                  |
|------------------------|----------------------|---------------------------------|
| `_reports`             | `Map<reportId, rec>` | in-place flag/state updates; no row removal |
| `_messages[reportId]`  | `Array`              | push-only, frozen records       |
| `_notes[reportId]`     | `Array`              | push-only, frozen records       |
| `_statusHistory[reportId]` | `Array`          | push-only                       |
| `_retaliationFlags`    | `Map<tokenHash,flag>`| flag once, mutate flags in-place |
| `_adverseActions`      | `Map<tokenHash,arr>` | push-only, frozen records       |
| `_events`              | `Array`              | push-only, SHA-256 hash-chained |

`closeReport` flips `closed = true` and `status = 'closed'` but does not
remove the report. Test #24 proves this (dual-close is rejected with
`report already closed`; historical state remains readable).

---

## 8. RBAC / הרשאות

| Role / תפקיד              | Can see / רשאי לראות                                               |
|---------------------------|---------------------------------------------------------------------|
| `reporter` (token holder) | Status, history, `publicNotes`, finding (after close), retaliation flag — via `reporterStatus` |
| `investigator` (assigned) | Full decrypted content, messages, notes                             |
| `compliance_officer`      | Cross-case aggregates via `statutoryReport` (no content, no identity)|
| `admin`                   | `verifyChain`, `integrityCheck`, audit log (no content)             |

Enforcement is by API: reporter-only views never return encrypted blobs,
`getInvestigatorNotes` refuses non-assigned callers, and the audit-log
payload format carries zero content.

---

## 9. Integrity Chain / שרשרת עמידה לזיופים

- Every state-changing call appends one event to `_events` with fields:
  `seq`, `type`, `timestamp`, `payload`, `prevHash`, `hash`, where
  `hash = SHA256(prevHash || '|' || stableStringify(body))`.
- `verifyChain()` walks the full chain and returns
  `{ valid, brokenAt, reason }`.
- `integrityCheck(reportId)` first confirms the global chain, then
  collects all events whose payload refers to `reportId` and returns a
  per-report digest over their individual hashes (deterministic).
- Tampering with any payload breaks the next chain link (test #20).

---

## 10. Public API Surface / שטח API

| Method                           | Purpose / מטרה                                      |
|----------------------------------|-----------------------------------------------------|
| `submitReport(input)`            | Create a report. Returns `{reportId, reporterToken, caseNumber, submittedAt}` |
| `anonymousToken()`               | Generate an opaque 256-bit token (utility)          |
| `assignInvestigator(input)`      | Assign with COI check (accused dept)                |
| `secureMessaging(input)`         | Append AES-256-GCM encrypted message                |
| `readMessages(id, viewer)`       | RBAC-scoped message view                            |
| `retaliationProtection(token)`   | Raise retaliation flag                              |
| `reportAdverseAction(input)`     | Log + auto-escalate adverse action                  |
| `statusUpdate(input)`            | Append public status + notes                        |
| `reporterStatus(token)`          | Token-based public view                             |
| `investigatorNotes(input)`       | Append-only, encrypted internal note                |
| `getInvestigatorNotes(id, iid)`  | Decrypted notes (assigned only)                     |
| `closeReport(input)`             | Close with finding + actions                        |
| `externalEscalation(id, target)` | Mark escalated to external authority                |
| `statutoryReport(period)`        | Bilingual aggregate (no identities)                 |
| `integrityCheck(reportId)`       | Per-report chain verification                       |
| `verifyChain()`                  | Global chain verification                           |
| `auditLog(filter?)`              | Filtered, read-only audit events                    |

---

## 11. Test Results / תוצאות בדיקות

```
$ cd onyx-procurement && node --test test/compliance/whistleblower.test.js

▶ WhistleblowerPortal — submission & tokens
  ✔ 1) submitReport creates report with encrypted description and opaque token
  ✔ 2) submitReport rejects invalid category
  ✔ 3) submitReport rejects missing anonymous flag
  ✔ 4) anonymous submission stores no contact info anywhere
  ✔ 5) identified submission stores contact info encrypted
  ✔ 6) anonymousToken returns 64-char hex and unique tokens
▶ WhistleblowerPortal — conflict-of-interest
  ✔ 7) assignInvestigator blocks investigator from accused department
  ✔ 8) assignInvestigator succeeds for independent investigator
▶ WhistleblowerPortal — secure messaging
  ✔ 9) secureMessaging stores ciphertext, decrypts for investigator
  ✔ 10) reporter only sees messages addressed to them
▶ WhistleblowerPortal — retaliation protection
  ✔ 11) retaliationProtection flags the case for the token holder
  ✔ 12) reportAdverseAction auto-escalates when flagged
  ✔ 13) unknown token cannot trigger retaliation protection
▶ WhistleblowerPortal — status updates & reporter view
  ✔ 14) statusUpdate appends to history and reporterStatus reflects it
  ✔ 15) invalid status value is rejected
▶ WhistleblowerPortal — investigator notes (append-only)
  ✔ 16) investigatorNotes requires assigned investigator and is append-only
  ✔ 17) notes are encrypted at rest and unauthorised investigator cannot read
▶ WhistleblowerPortal — close & external escalation
  ✔ 18) closeReport requires a valid finding and updates public status
  ✔ 19) externalEscalation appends record and emits audit event
▶ WhistleblowerPortal — integrity & statutory
  ✔ 20) hash-chain integrity: verifyChain + integrityCheck detect tampering
  ✔ 21) statutoryReport returns bilingual aggregates with no identities
  ✔ 22) token-based status lookup returns only public fields
  ✔ 23) token is unlinkable — reverse lookup from tokenHash is not possible
  ✔ 24) "never delete" invariant — released/closed reports remain readable
  ✔ 25) AES-256-GCM authentication catches ciphertext tampering

ℹ tests 25
ℹ pass  25
ℹ fail  0
```

### Required-test coverage / מטריצת כיסוי הדרישות
| Required check                                | Covered by test(s)            |
|----------------------------------------------|-------------------------------|
| Anonymous submission                         | 1, 4                          |
| Encrypted content                            | 1, 5, 9, 17, 25               |
| Conflict-of-interest check                   | 7, 8                          |
| Retaliation protection                       | 11, 12, 13                    |
| Status update flow                           | 14, 15                        |
| Investigator notes append-only               | 16, 17                        |
| External escalation                          | 19                            |
| Hash chain integrity                         | 20                            |
| Statutory report (no identities)             | 21                            |
| Token-based status lookup                    | 14, 22, 23                    |

---

## 12. Hebrew Glossary / מילון מונחים עברי-אנגלי

| עברית                    | English                        | Notes                                            |
|--------------------------|--------------------------------|--------------------------------------------------|
| חושף שחיתויות            | whistleblower                  | also "מדווח על שחיתויות"                         |
| דיווח                    | report                         | `submitReport`                                   |
| אנונימי / ללא זיהוי      | anonymous                      | `anonymous: true`                                |
| אסימון (אנונימי)         | (anonymous) token              | `reporterToken` — 256-bit opaque                 |
| חקירה                    | investigation                  | status `investigating` / `בחקירה`                |
| חוקר                     | investigator                   | `assignInvestigator`                             |
| ניגוד עניינים            | conflict of interest           | COI block if same accused dept                   |
| המחלקה הנאשמת            | accused department             | `accusedDept` scoping                            |
| הטרדה                    | harassment                     | category `harassment`                             |
| אפליה                    | discrimination                 | category `discrimination`                         |
| הונאה                    | fraud                          | category `fraud`                                  |
| שחיתות                   | corruption                     | category `corruption`                             |
| בטיחות                   | safety                         | category `safety`                                 |
| רגולציה                  | regulation                     | category `regulatory`                             |
| פרטיות                   | privacy                        | category `privacy`                                |
| כספים                    | financial                      | category `financial`                              |
| עבירה                    | offence                        | חשיפת עבירות                                    |
| טוהר המידות              | integrity / proper conduct     | part of the law title                            |
| מינהל תקין               | proper administration          | part of the law title                            |
| פגיעה (נגד מדווח)        | retaliation                    | `retaliationProtection`                          |
| הסלמה                    | escalation                     | `externalEscalation` / `auto-escalate`           |
| ממצא                     | finding                        | substantiated / unsubstantiated / inconclusive   |
| מבוסס                    | substantiated                  | `finding: substantiated`                          |
| לא מבוסס                 | unsubstantiated                | `finding: unsubstantiated`                        |
| לא חד-משמעי              | inconclusive                   | `finding: inconclusive`                           |
| הועבר לגורם חיצוני       | referred externally            | `finding: referred-externally`                    |
| נציב תלונות הציבור       | public ombudsman               | `EXTERNAL_TARGETS.OMBUDSMAN`                      |
| מבקר המדינה              | State Comptroller              | `EXTERNAL_TARGETS.STATE_COMPTROLLER`              |
| רשות שוק ההון / ני"ע     | financial authority            | `EXTERNAL_TARGETS.FINANCIAL_AUTHORITY`            |
| בית הדין לעבודה          | labour court                   | `EXTERNAL_TARGETS.LABOUR_COURT`                   |
| רשות המיסים              | tax authority                  | `EXTERNAL_TARGETS.TAX_AUTHORITY`                  |
| הצפנה                    | encryption                     | AES-256-GCM                                      |
| מפתח הצפנה ראשי          | master key                     | 32-byte, injectable                              |
| שרשרת גיבוב              | hash chain                     | SHA-256 chained events                           |
| עמיד לזיופים             | tamper-evident                 | `verifyChain`                                    |
| append-only              | הוספה בלבד / ללא מחיקה        | all stores push-only                             |
| דוח סטטוטורי למשרד       | statutory report               | `statutoryReport(period)`                         |

---

## 13. Integration Notes / הערות לאינטגרציה

- **Wiring:** instantiate once per ONYX Procurement process:
  ```js
  const { WhistleblowerPortal } = require('./src/compliance/whistleblower');
  const portal = new WhistleblowerPortal({ masterKey: process.env.WB_KEY_HEX });
  ```
- **Master key management:** the master key must live outside process
  code. Use an environment variable (`WB_MASTER_KEY_HEX`) loaded from a
  secrets manager. The 32-byte key is hex-encoded. No key rotation in
  v1; future upgrade path is to prepend a version byte to ciphertexts.
- **Loose coupling:** this module is pure — no HTTP, no DB. Downstream
  transports (REST route, Slack bot, intake form) call into the public
  API. The audit log is the module's single source of truth for
  compliance reporting.
- **Never deletes:** no `delete`, no `splice`. The retention-engine
  (Y-149) and legal-hold enforcer (Y-150) can be wired to this module
  later via their own mechanisms; whistleblower data is always frozen
  under a legal-hold-equivalent invariant anyway.
- **Zero external deps:** only `node:crypto` is imported. Verified with
  static review of the file header.

---

## 14. Compliance Summary / סיכום ציות

| Requirement / דרישה                                | Status |
|----------------------------------------------------|:------:|
| Immutable rule: לא מוחקים                          |   OK   |
| Zero external deps (`node:crypto` only)            |   OK   |
| Hebrew RTL + bilingual labels                      |   OK   |
| Anonymous reporting / opaque token                 |   OK   |
| No reverse-lookup of identity                      |   OK   |
| AES-256-GCM encryption of sensitive content        |   OK   |
| Conflict-of-interest block on investigator assign  |   OK   |
| Retaliation protection + auto-escalate             |   OK   |
| Investigator notes: append-only, encrypted         |   OK   |
| Status-update flow (token-visible)                 |   OK   |
| External escalation to ombudsman/comptroller/etc.  |   OK   |
| Hash-chain integrity verification                  |   OK   |
| Statutory aggregate report (no identities)         |   OK   |
| 25 / 25 unit tests passing                         |   OK   |

---

**End of report / סוף דוח**
