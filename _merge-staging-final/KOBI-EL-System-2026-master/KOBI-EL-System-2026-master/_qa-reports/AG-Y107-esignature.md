# QA Report — Agent Y-107 · Electronic Signature Workflow Engine
## דוח QA — סוכן Y-107 · מנוע חתימה אלקטרונית

**Date / תאריך:** 2026-04-11
**Module / מודול:** `onyx-procurement/src/docs/esignature.js`
**Tests / בדיקות:** `onyx-procurement/test/docs/esignature.test.js`
**Legal basis / בסיס חוקי:** חוק חתימה אלקטרונית, התשס"א-2001
**Charter rule / כלל אמנה:** "לא מוחקים רק משדרגים ומגדלים"
**Dependencies / תלויות:** Zero external — Node built-ins only (`node:crypto`)

---

## 1. Summary / תקציר

- **EN —** A fully in-memory, append-only e-signature workflow engine covering envelope creation, parallel and sequential signer routing, the three signature levels recognized by Israeli law, tamper-evident SHA-256 hash chain audit, RFC-3161 structured timestamp payloads, bilingual reminders, certificate of completion, reject and void paths that preserve the full record, and a self-describing archival export bundle. All 25 tests pass on `node --test`.
- **HE —** מנוע חתימה אלקטרונית מלא בזיכרון בלבד, append-only, המכסה יצירת מעטפות, ניתוב חותמים מקבילי וסדרתי, שלושת רמות החתימה הקבועות בחוק הישראלי, שרשרת ביקורת SHA-256 עמידה לזיוף, חותמות זמן במבנה RFC-3161, תזכורות דו-לשוניות, תעודת השלמה, מסלולי דחייה וביטול המשמרים את כל הרישום, וחבילת ייצוא לארכיון עם checksum. כל 25 הבדיקות עוברות.

---

## 2. Three signature levels — חוק חתימה אלקטרונית §1–§3

| # | ID | Hebrew / עברית | English | סעיף / §Ref | Weight | Requirements / דרישות | Payload fields |
|---|----|----------------|---------|-------------|--------|----------------------|----------------|
| 1 | `electronic` | חתימה אלקטרונית | Electronic signature | סעיף 1 | 1 | נתונים אלקטרוניים המשויכים להודעה — שם מוקלד, תיבת סימון, לחיצה | `{ typedName }` |
| 2 | `advanced` | חתימה אלקטרונית מאובטחת | Advanced / secure electronic signature | סעיף 1 | 2 | ייחודית לחותם · מזהה אותו · בשליטתו הבלעדית · מגלה שינוי במסמך | `{ publicKey, signedDigest, algorithm? }` |
| 3 | `qualified` | חתימה אלקטרונית מאושרת | Qualified / certified electronic signature | סעיפים 2–3 | 3 | חתימה מאובטחת **+** תעודה מגורם מאשר מורשה (Comsign, Personal-ID, וכו') — שוות ערך לחתימה בכתב יד | `{ publicKey, signedDigest, certificate:{ serial, issuer, subject, validFrom, validTo } }` |

### Legal weight / משקל ראייתי
- `electronic` — ניתנת להוכחה בראיות נוספות, כמו כל מסמך אחר
- `advanced` — מניחה קשר ייחודי לחותם וגילוי שינויים; נדרשת הוכחה לאמיתות התעודה או המפתח
- `qualified` — סעיף 3 לחוק קובע שוות ערך לחתימה בכתב יד, וקמה **חזקה** לאמיתותה (ניתנת לסתירה)

---

## 3. Workflow lifecycle / מחזור חיי מעטפה

### States / מצבים

| ID | Hebrew | English | Allowed from |
|----|--------|---------|-------------|
| `draft` | טיוטה | Draft | *(initial)* |
| `sent` | נשלח | Sent | `draft` |
| `in_progress` | בתהליך חתימה | In progress | `sent` |
| `completed` | הושלם | Completed | `in_progress` (all signed) |
| `voided` | בוטל | Voided | any non-voided |
| `rejected` | נדחה | Rejected | `sent` / `in_progress` |
| `expired` | פג תוקף | Expired | any incomplete state |

### State diagram / דיאגרמת מצבים

```
                    createEnvelope
                         │
                         ▼
                     ┌───────┐
                     │ draft │
                     └───┬───┘
                 sendForSignature
                         │
                         ▼
                     ┌──────┐
                     │ sent │──────► signer_notified (parallel: all · sequential: first)
                     └───┬──┘
                         │
                         ▼
                   ┌─────────────┐       rejectEnvelope       ┌──────────┐
                   │ in_progress │──────────────────────────► │ rejected │
                   └──┬────────┬─┘                            └──────────┘
            signDocument      voidEnvelope
                   │                \\
                   ▼                 \\
            (all signed?)             \\
                   │                   \\
                   ▼                    ▼
             ┌────────────┐         ┌────────┐
             │ completed  │         │ voided │
             └────────────┘         └────────┘

  All terminal states remain verifiable — voided & rejected preserve
  every existing signature packet, timestamps, and audit entries.
```

### Per-signer states / מצבי חותם

| ID | Hebrew | English |
|----|--------|---------|
| `pending` | ממתין | Pending |
| `notified` | הודע | Notified |
| `signed` | חתם | Signed |
| `declined` | דחה | Declined |
| `skipped` | דולג | Skipped |

### Sequential vs parallel / סדרתי מול מקבילי

- **Parallel —** All signers receive `signer_notified` event on `sendForSignature`. Any order accepted. Envelope flips to `completed` once the last signer signs.
- **Sequential —** Only the first signer (by `order`) is notified. On each successful `signDocument`, the engine auto-notifies the next pending signer. Out-of-order attempts throw `out-of-order signature`. The `order` field is re-compacted to 1..N to eliminate gaps.

---

## 4. SHA-256 audit hash chain / שרשרת ביקורת

### Rationale / רציונל
- **EN —** Every audit event is immutably linked to its predecessor. Any external mutation — even to a single character of `actor`, `at`, or `payload` — breaks the chain at that point. `auditTrail()` returns a `verification` object that re-hashes the entire chain and reports `brokenAt` if tampering is detected.
- **HE —** כל אירוע ביקורת מקושר באופן קריפטוגרפי לקודמו. כל שינוי חיצוני — אפילו בתו בודד — שובר את השרשרת במקום השינוי.

### Entry schema / מבנה רשומה

```json
{
  "seq":        0,
  "envelopeId": "ENV-ABC123DEF456",
  "action":     "envelope_create",
  "actor":      "u_admin",
  "at":         "2026-04-11T08:00:00.000Z",
  "payload":    { "title_he": "...", "sequential": false, ... },
  "prev_hash":  "0000000000000000000000000000000000000000000000000000000000000000",
  "this_hash":  "<sha256(prev_hash || canonical(body))>",
  "label":      { "he": "יצירת מעטפה", "en": "Envelope created", "bidi": "..." }
}
```

### Hash formula / נוסחת הגיבוב

```
this_hash_i = SHA-256( this_hash_{i-1} || canonicalJSON({ seq, envelopeId, action, actor, at, payload }) )

this_hash_0 = SHA-256( "0"*64 || canonicalJSON(body_0) )
```

`canonicalJSON` sorts object keys recursively, so hashes are reproducible regardless of insertion order.

### Audit actions / פעולות ביקורת

| Action ID | Hebrew | English |
|-----------|--------|---------|
| `envelope_create` | יצירת מעטפה | Envelope created |
| `envelope_send` | שליחה לחתימה | Sent for signature |
| `signer_notified` | חותם הודע | Signer notified |
| `signer_reminded` | תזכורת נשלחה | Signer reminded |
| `signature_applied` | חתימה הוחלה | Signature applied |
| `signature_verified` | חתימה אומתה | Signature verified |
| `envelope_completed` | מעטפה הושלמה | Envelope completed |
| `envelope_voided` | מעטפה בוטלה | Envelope voided |
| `envelope_rejected` | מעטפה נדחתה | Envelope rejected |
| `timestamp_applied` | חותמת זמן הוחלה | Timestamp applied |
| `export_bundled` | ייצוא לארכיון | Exported for archival |

---

## 5. RFC 3161 timestamp payload / חותמת זמן RFC 3161

`timestamp(envelopeId)` produces a `TimeStampReq`-shaped structure that a real TSA (e.g. ComSign TSA, Personal-ID TSA) could consume directly. The engine **does not** perform any external HTTP call — it is hermetic. Operators can export the payload and submit it out-of-band.

```json
{
  "rfc": 3161,
  "TimeStampReq": {
    "version": 1,
    "messageImprint": {
      "hashAlgorithm": {
        "algorithm": "2.16.840.1.101.3.4.2.1",
        "algorithm_name": "sha256",
        "parameters": null
      },
      "hashedMessage": "<sha256 of canonical envelope snapshot>"
    },
    "reqPolicy": "1.2.3.4.5.6.7.8.1",
    "nonce": "0x<hex>",
    "certReq": true,
    "extensions": null
  },
  "producedAt": "2026-04-11T08:12:00.000Z",
  "envelopeId": "ENV-...",
  "label": { "he": "חותמת זמן (RFC 3161)", "en": "Timestamp (RFC 3161)" },
  "_notice_he": "מבנה זה אינו מכיל חתימת TSA — הוא מוכן למשלוח אל גורם מאשר מוסמך",
  "_notice_en": "This structure contains no real TSA signature — it is pre-formatted for submission to a licensed TSA"
}
```

---

## 6. Verification / אימות

`verifySignature(envelopeId, signerId)` performs three checks:

1. **Document digest check —** Recomputes `sha256(canonical(documents[]))` and compares it to the digest frozen into the signature packet at sign time. Any subsequent edit to a document's content or list order breaks this check. → `integrity` boolean.
2. **Evidence hash check —** Recomputes `sha256(canonical({signerId, level, timestamp, docDigest, data}))` and compares it to `signature.evidenceHash`. Detects tamper on the signature packet itself.
3. **Identity check —** Per-level required fields:
   - `electronic` → `typedName` non-empty
   - `advanced` → `publicKey` + `signedDigest` non-empty
   - `qualified` → `publicKey` + `signedDigest` + `certificate.serial` + `certificate.issuer` + `certificate.subject`

Every call appends a `signature_verified` audit entry regardless of outcome, preserving the verification history.

---

## 7. Preservation guarantees / הבטחות שימור

In line with the charter rule **"לא מוחקים רק משדרגים ומגדלים"**, no method on `ESignature` deletes any field or entry. All mutations are strictly additive or status-flip:

| Operation | What's preserved |
|-----------|------------------|
| `voidEnvelope()` | All prior signatures + audit log + timestamps. `voidReason` is **added**. Returns a list of `preservedSignatures` so auditors can confirm retention. |
| `rejectEnvelope()` | All prior signatures + audit log + timestamps. `rejectionReason` is **added**. Declined signer flips to `declined` but retains `signerId` and any notification history. |
| `certificateOfCompletion()` | Works on completed, voided, rejected, or in-progress envelopes — describes state at the moment of issuance, always. |
| `exportSigned()` | Bundles full envelope + certificate + audit log + timestamps + bundle checksum. No state is omitted. |

---

## 8. Test results / תוצאות בדיקות

```
node --test test/docs/esignature.test.js

  25 tests · 25 pass · 0 fail · 0 skipped
```

Full list:

| # | Test | Focus area |
|---|------|------------|
| 01 | createEnvelope creates draft with correct metadata + hashed docs | creation |
| 02 | createEnvelope rejects missing required fields | validation |
| 03 | sendForSignature parallel notifies ALL signers | parallel |
| 04 | sendForSignature sequential notifies only first signer | sequential |
| 05 | signDocument electronic records typedName and completes envelope | level 1 |
| 06 | signDocument advanced validates publicKey and signedDigest | level 2 |
| 07 | signDocument qualified requires licensed CA certificate fields | level 3 |
| 08 | sequential signing enforces ordering — out-of-order throws | sequential |
| 09 | sequential signing auto-notifies next signer | sequential |
| 10 | parallel signing allows any order and completes when all sign | parallel |
| 11 | verifySignature detects document tampering | verification |
| 12 | verifySignature detects identity metadata mismatch | verification |
| 13 | verifySignature success path returns valid=true | verification |
| 14 | voidEnvelope retains signatures for audit | preservation |
| 15 | voidEnvelope cannot void twice | preservation |
| 16 | auditTrail hash chain integrity | chain |
| 17 | auditTrail verification detects external mutation | chain |
| 18 | timestamp produces RFC-3161 shaped payload with SHA-256 OID | RFC 3161 |
| 19 | remindSigner returns bilingual reminder | i18n |
| 20 | remindSigner refuses signer who already signed | i18n |
| 21 | certificateOfCompletion includes all signers + IPs + law reference | certificate |
| 22 | certificateOfCompletion works on voided envelope | certificate |
| 23 | rejectEnvelope flips status + records reason + retains signatures | reject path |
| 24 | exportSigned bundles certificate, audit, and timestamps with checksum | export |
| 25 | signature level weights strictly ordered | levels |

---

## 9. Hebrew glossary / מילון מונחים

| Hebrew / עברית | English | Meaning / הסבר |
|----------------|---------|----------------|
| חתימה אלקטרונית | Electronic signature | נתונים אלקטרוניים הקשורים להודעה, לצורך זיהוי החותם |
| חתימה אלקטרונית מאובטחת | Advanced / secure electronic signature | חתימה ייחודית המזהה את החותם ומגלה שינויים |
| חתימה אלקטרונית מאושרת | Qualified electronic signature | חתימה מאובטחת + תעודה מגורם מאשר מורשה |
| גורם מאשר | Certification Authority (CA) | גוף מוסמך על פי החוק להנפקת תעודות אלקטרוניות |
| רשם גורמים מאשרים | Registrar of CAs | הרשם במשרד המשפטים האחראי לרישוי גורמים מאשרים |
| מעטפה | Envelope | יחידת חתימה — מכילה מסמכים, חותמים, הודעה, תפוגה |
| חותם | Signer | אדם שנדרש לחתום על מסמך |
| טיוטה | Draft | מצב התחלתי של מעטפה לפני שליחה |
| נשלח | Sent | המעטפה נשלחה לחותמים |
| בתהליך חתימה | In progress | לפחות חותם אחד יכול לחתום |
| הושלם | Completed | כל החותמים חתמו |
| בוטל | Voided | המעטפה בוטלה על ידי היוזם — כל החתימות נשמרות |
| נדחה | Rejected | חותם דחה את החתימה — כל החתימות נשמרות |
| פג תוקף | Expired | חלף זמן התפוגה |
| שרשרת ביקורת | Audit chain | רצף פעולות מקושר קריפטוגרפית |
| חותמת זמן | Timestamp | הוכחה לזמן ביצוע פעולה, בפורמט RFC 3161 |
| תעודת השלמת חתימות | Certificate of Completion | מסמך דו-לשוני המסכם את כל החתימות שבוצעו |
| תקפות | Integrity / validity | המסמך לא שונה מאז החתימה |
| אימות זהות | Identity verification | בדיקה שהחותם הוא אכן מי שטוען להיות |
| דו-לשוני | Bilingual | עברית + אנגלית |
| RTL | Right-To-Left | כיוון כתיבה של עברית וערבית |

---

## 10. Compliance checklist / רשימת בדיקה לתאימות

- [x] **לא מוחקים** — every mutation is additive, void + reject retain signatures
- [x] **Zero external deps** — only `node:crypto` (built-in)
- [x] **Hebrew RTL** — bilingual `he` + `en` + `bidi` labels on every public structure
- [x] **חוק חתימה אלקטרונית 3 levels** — electronic / advanced / qualified fully implemented
- [x] **Tamper-evident audit** — SHA-256 hash chain with verification
- [x] **RFC 3161 timestamps** — structured payload for TSA submission
- [x] **Certificate of completion** — bilingual, includes IPs, law reference, audit chain hash
- [x] **Void path preserves record** — tested in #14, #22
- [x] **Reject path preserves record** — tested in #23
- [x] **Sequential and parallel routing** — tested in #03, #04, #08, #09, #10
- [x] **Export for archival** — bundle with checksum, tested in #24
- [x] **20+ unit tests** — 25 tests, 100% pass

---

## 11. Files / קבצים

- `onyx-procurement/src/docs/esignature.js` — engine (≈900 lines)
- `onyx-procurement/test/docs/esignature.test.js` — 25 unit tests
- `_qa-reports/AG-Y107-esignature.md` — this report

---

**Agent Y-107 · Swarm Office Docs · Mega-ERP Kobi EL 2026**
**סוכן Y-107 · נחיל מסמכי משרד · מערכת ERP מגה קובי EL 2026**
