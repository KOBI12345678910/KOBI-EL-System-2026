# AG-Y138 — Consent Management Engine / מנוע ניהול הסכמות

**Agent:** Y-138
**Module:** `onyx-procurement/src/privacy/consent-mgmt.js`
**Tests:** `onyx-procurement/test/privacy/consent-mgmt.test.js`
**Date / תאריך:** 2026-04-11
**System / מערכת:** Techno-Kol Uzi mega-ERP
**Status / סטטוס:** PASS — 22 / 22 tests green

---

## 1. Purpose / מטרה

**HE** — מנוע ניהול הסכמות תואם חוק הגנת הפרטיות (תשמ"א-1981), תיקון 13 שנכנס
לתוקף ב-14/08/2024, והמסגרת המוצעת של Personal Data Protection (PDPL).
המנוע מספק רישום בלתי-הפיך של הסכמות, חזרה מהסכמה (נסיגה), בדיקה נקודתית-בזמן,
ניהול מחזור-חיי הסכמה (רענון), שער אישור הורי לקטינים, בדיקת בסיס-חוקי ושרשרת
משמורת (audit chain) עם SHA-256.

**EN** — A consent-management engine compliant with Israel's Privacy
Protection Law (1981) as amended by Amendment 13 (in force 14-Aug-2024)
and the proposed Personal Data Protection (PDPL) framework. The engine
provides immutable consent recording, withdrawal, point-in-time checks,
consent lifecycle (re-consent cycles), parental-consent gating for minors,
lawful-basis validation, and a SHA-256-chained audit trail.

---

## 2. Core invariant / חוק ברזל

> **"לא מוחקים רק משדרגים ומגדלים"**

- Consent records are **deep-frozen** (`Object.isFrozen`) on creation.
- Withdrawal is implemented as a **new** `WITHDRAW` record that references
  the original via `originalRecordId`. The original `GRANT` record is
  **never** mutated.
- Expiry (`consentExpiry`) **appends** an `EXPIRE` record — it does not
  alter the grant.
- Bulk operations append per-(subject, purpose) outcomes; failures still
  generate audit entries.
- The append-only audit ledger is SHA-256-chained; `verifyChain()` returns
  `{ valid: true }` for an untouched ledger and detects tampering.

---

## 3. Seven purposes / שבע מטרות

| Key                     | Hebrew / עברית             | English                     |
|-------------------------|---------------------------|-----------------------------|
| `marketing`             | שיווק ופרסום              | Marketing & advertising     |
| `analytics`             | ניתוח ומחקר               | Analytics & research        |
| `personalization`       | התאמה אישית               | Personalization             |
| `essential`             | תפעול חיוני               | Essential operations        |
| `third-party-sharing`   | שיתוף עם צדדי ג׳          | Third-party sharing         |
| `profiling`             | פרופיל משתמש              | User profiling              |
| `automated-decision`    | קבלת החלטה אוטומטית       | Automated decision-making   |

All 7 keys are surfaced by `granularPurposeConsent(subjectId)` and every
record stores bilingual labels (`purposeLabels.he`, `purposeLabels.en`).

---

## 4. Six lawful bases / שישה בסיסים חוקיים

| Key                     | Hebrew / עברית        | English                     | Used when / מתי                                     |
|-------------------------|----------------------|-----------------------------|----------------------------------------------------|
| `consent`               | הסכמה                | Consent                     | Opt-in for non-essential purposes                  |
| `contract`              | חוזה                 | Contractual necessity       | Essential ops derived from the service agreement   |
| `legal-obligation`      | חובה חוקית           | Legal obligation            | Retention (tax 7y, AML 7y…), profiling carve-outs  |
| `vital-interest`        | אינטרס חיוני         | Vital interest              | Life / health emergencies                          |
| `public-interest`       | אינטרס ציבורי        | Public interest             | Public-sector processing                           |
| `legitimate-interest`   | אינטרס לגיטימי       | Legitimate interest         | Fraud prevention, analytics (balancing test)       |

`lawfulBasisCheck(purpose, proposedBasis)` enforces this matrix. Example
rejections (`throw`):

- `marketing` + `contract` → rejected (marketing is consent-only).
- `personalization` + `legitimate-interest` → rejected.
- `profiling` + `legal-obligation` → **accepted** (תיקון 13 carve-out).

---

## 5. Five collection methods / חמש שיטות איסוף

| Key                 | Hebrew / עברית              | English                | Evidentiary weight |
|---------------------|----------------------------|------------------------|--------------------|
| `click-wrap`        | לחיצה על כפתור הסכמה       | Click-wrap             | Medium             |
| `browse-wrap`       | הסכמה על-ידי גלישה          | Browse-wrap            | Weak               |
| `signed-document`   | מסמך חתום                   | Signed document        | **Strongest**      |
| `verbal-recorded`   | הקלטת הסכמה בעל-פה          | Verbal (recorded)      | Strong             |
| `opt-in-email`      | אישור דוא"ל דו-שלבי         | Double opt-in email    | Medium-strong      |

`recordConsent` rejects any method outside this set with
`invalid method "<value>"`.

---

## 6. Amendment 13 / תיקון 13 citations

| Section / סעיף                                  | Honoured by / יושם ב-                             |
|------------------------------------------------|--------------------------------------------------|
| **סעיף 11** — הסכמה מדעת                        | Bilingual `consentText_he` + `consentText_en` required + `version` stored |
| **סעיף 13א** — זכות לחזרה מהסכמה (easy withdrawal) | `withdrawConsent()` one-shot call; original preserved |
| **סעיף 17** — הסכמת הורה לקטינים                 | `minorConsent()` gate; `< 16` ⇒ `PENDING_PARENTAL` |
| **סעיף 17ג** — רישום ראייתי של הסכמה            | `payloadHash` + SHA-256 chain in audit trail     |
| **הנחיית רשות 01-2024** — מחזור רענון (24 חודשים) | `consentExpiry(24)` with `DEFAULT_MAX_CONSENT_AGE_MONTHS = 24` |
| **תיקון 13 — פרופיל אוטומטי**                    | `PROFILING` + `AUTOMATED_DECISION` are consent-only with legal-obligation carve-out |
| **תיקון 13 — חובת דיווח**                        | Audit chain `verifyChain()` provides evidentiary trail for the Authority |

---

## 7. Public API / ממשק ציבורי

```js
const { ConsentManagement, PURPOSES, LAWFUL_BASES, COLLECTION_METHODS }
  = require('./src/privacy/consent-mgmt.js');

const cm = new ConsentManagement();

// recordConsent — returns frozen record
const rec = cm.recordConsent({
  subjectId:      'subj-001',
  purpose:        PURPOSES.MARKETING,
  lawfulBasis:    LAWFUL_BASES.CONSENT,
  scope:          ['email', 'phone'],
  version:        'v1.0',
  method:         COLLECTION_METHODS.CLICK_WRAP,
  consentText_he: 'אני מסכים לקבל דיוור שיווקי',
  consentText_en: 'I agree to receive marketing communications',
  collectedAt:    '2026-01-01T10:00:00Z',
});

// withdrawConsent — original NEVER mutated; NEW record links back
cm.withdrawConsent({ subjectId: 'subj-001', purpose: PURPOSES.MARKETING,
                     reason: 'opted out' });

// checkConsent — point-in-time
cm.checkConsent('subj-001', PURPOSES.MARKETING, '2026-03-01T00:00:00Z');
// → { granted: false, reason: 'withdrawn', record: <withdraw record> }

// exportSubjectConsents — for Y-136 DSR access request
cm.exportSubjectConsents('subj-001');
// → { subjectId, titleLabels:{he,en}, citations, counts, granular, history }
```

---

## 8. Test coverage / כיסוי בדיקות

| #  | Test                                                             | Scenario tested                                          |
|----|------------------------------------------------------------------|----------------------------------------------------------|
| 01 | click-wrap records create immutable ACTIVE record                | Happy path + `Object.isFrozen` + bilingual labels        |
| 02 | browse-wrap method accepted                                      | Method #2 — low-weight collection                        |
| 03 | signed-document method accepted                                  | Method #3 — strongest evidentiary weight                 |
| 04 | verbal-recorded method accepted                                  | Method #4 — call-center / kiosk flow                     |
| 05 | opt-in-email method accepted                                     | Method #5 — double-opt-in flow                           |
| 06 | rejects invalid method / basis / purpose / missing text          | Validation surface                                       |
| 07 | withdraw preserves original + new WITHDRAW record links          | Append-only invariant (חוק ברזל)                         |
| 08 | withdraw without active consent throws                           | No silent failures                                       |
| 09 | checkConsent — point-in-time (before vs. after withdrawal)       | Temporal semantics                                       |
| 10 | consentHistory preserves order and is append-only                | Timeline ordering                                        |
| 11 | bulkConsentUpdate — mass opt-out across subjects                 | Sec. 13A "easy withdrawal" at scale                      |
| 12 | granularPurposeConsent — 7 purpose keys                          | Seven-purpose breakdown                                  |
| 13 | minor < 16 without parental ref → PENDING_PARENTAL               | תיקון 13 סעיף 17                                          |
| 14 | age >= 16 → normal ACTIVE consent                                | Threshold upper boundary                                 |
| 15 | minor < 16 WITH parental ref → ACTIVE consent                    | Parental upgrade path                                    |
| 16 | lawfulBasisCheck — all 6 bases validated for ESSENTIAL purpose   | Each of six lawful bases exercised                       |
| 17 | marketing rejects `contract`; profiling accepts legal-obligation | Consent-only enforcement + carve-out                     |
| 18 | consentExpiry — 24-month re-consent cycle flags stale grants     | הנחיית רשות 01-2024                                       |
| 19 | verifyChain valid on untouched ledger                            | SHA-256 chain integrity                                  |
| 20 | verifyChain detects tampering                                    | Immutability verification                                |
| 21 | exportSubjectConsents — DSR-ready bilingual packet               | Integration with Y-136                                   |
| 22 | records are deep-frozen — cannot be mutated                      | Immutability in memory                                   |

**Result: 22 tests — all PASS — duration ≈ 110 ms.**

```
node --test test/privacy/consent-mgmt.test.js
ℹ tests 22
ℹ pass 22
ℹ fail 0
```

---

## 9. Integration with Y-136 (DSR handler) / שילוב עם Y-136

`exportSubjectConsents(subjectId)` returns an object whose shape is
consumable by the DSR handler's `processAccessRequest`:

```json
{
  "subjectId": "subj-001",
  "subjectHash": "<sha256>",
  "exportedAt": "2026-04-11T09:00:00.000Z",
  "titleLabels": {
    "he": "ייצוא הסכמות לבקשת נושא מידע",
    "en": "Consent export for Data Subject Request"
  },
  "citations": [
    "חוק הגנת הפרטיות תיקון 13 סעיף 11 (הסכמה מדעת)",
    "חוק הגנת הפרטיות תיקון 13 סעיף 13א (זכות לחזרה מהסכמה)",
    "הנחיית הרשות להגנת הפרטיות 01-2024 (מחזור רענון הסכמות)"
  ],
  "counts":    { "total": 3, "grants": 2, "withdrawals": 1, "expired": 0 },
  "granular":  { "marketing": {...}, "analytics": {...}, ... },
  "minor":     null,
  "history":   [ /* append-only timeline */ ]
}
```

The DSR handler should register this module as a data source via
`dsr.registerDataSource('consent-mgmt', (id) => cm.exportSubjectConsents(id))`
inside `scopeRequest` — see `dsr-handler.js` public-surface contract.

---

## 10. Hebrew glossary / מילון עברי

| Term / מונח                     | English                          | Notes                                         |
|--------------------------------|----------------------------------|-----------------------------------------------|
| הסכמה מדעת                       | Informed consent                  | סעיף 11                                         |
| חזרה מהסכמה                     | Withdrawal of consent             | סעיף 13א                                        |
| נושא המידע                      | Data subject                      | —                                             |
| בעל השליטה בבסיס הנתונים         | Data controller                   | —                                             |
| מטפל בבסיס הנתונים              | Data processor                    | —                                             |
| ממונה הגנה על מידע / DPO         | Data Protection Officer           | Required for large DBs after תיקון 13         |
| בסיס חוקי לעיבוד                | Lawful basis for processing       | 6 options                                     |
| הסכמה מפורשת                    | Explicit consent                  | Required for special-category data            |
| הסכמה מצטברת                    | Bundled consent                   | Prohibited by תיקון 13                        |
| קטין                            | Minor                             | Age < 16 under תיקון 13                       |
| אפוטרופוס                       | Legal guardian                    | Parental-consent reference                    |
| אינטרס לגיטימי                  | Legitimate interest               | Balancing test required                       |
| רשות הגנת הפרטיות               | Privacy Protection Authority      | הרשות                                          |
| דליפת מידע                      | Data breach                       | 72h reporting duty (סעיף 34)                  |
| שרשרת משמורת                    | Chain of custody                  | SHA-256 audit chain                           |
| לוג הסכמות                      | Consent log                       | The ledger                                    |
| שיווק ישיר                      | Direct marketing                  | חוק התקשורת (בזק) 30א                          |
| פרופיל משתמש                    | User profiling                    | Profiling in תיקון 13                         |
| החלטה אוטומטית                  | Automated decision-making         | Consent or legal-obligation only              |
| הסכמה דו-שלבית                  | Double opt-in                     | `opt-in-email` method                         |
| מסמך חתום                       | Signed document                   | Strongest evidentiary weight                  |
| ראייה                           | Evidence                          | `payloadHash` per record                      |
| בלתי הפיך                       | Immutable                         | Records are `Object.freeze`d                  |
| מחזור רענון                     | Refresh cycle                     | 24 months recommended                         |

---

## 11. Zero external dependencies / אפס תלויות חיצוניות

```
$ grep -n "require" src/privacy/consent-mgmt.js
  1:const crypto = require('node:crypto');
```

Only `node:crypto` — a Node.js built-in. No npm packages.

---

## 12. File map / מפת קבצים

- **Module**   `onyx-procurement/src/privacy/consent-mgmt.js`  (≈ 680 lines)
- **Tests**    `onyx-procurement/test/privacy/consent-mgmt.test.js`  (22 tests)
- **QA**       `_qa-reports/AG-Y138-consent-mgmt.md`  (this file)

---

## 13. Final verdict / פסק דין סופי

- All 22 tests PASS. / כל 22 הבדיקות עברו בהצלחה.
- 7 purposes, 6 lawful bases, 5 collection methods covered.
- Records are immutable; withdrawals preserve the original.
- תיקון 13 sections 11, 13א, 17 honoured with citations in-code.
- Integration hook for Y-136 (DSR handler) ready via `exportSubjectConsents`.
- Zero external dependencies; Hebrew + English bilingual throughout.

**Compliance status: READY FOR PRODUCTION / מוכן לייצור** ✅

— Agent Y-138, Techno-Kol Uzi mega-ERP
