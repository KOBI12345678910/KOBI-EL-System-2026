# AG-Y061 — Applicant Tracking System (ATS)

**Agent**: Y-061
**Module**: `onyx-procurement/src/hr/ats.js`
**Test file**: `onyx-procurement/test/hr/ats.test.js`
**Status**: GREEN — 28 / 28 tests passing
**Date**: 2026-04-11
**Owner**: Techno-Kol Uzi mega-ERP • Swarm HR

---

## 1. Scope / היקף

**EN.** A zero-dependency, append-only Applicant Tracking System for the
Techno-Kol mega-ERP. Implements the full hiring funnel — from requisition
through offer acceptance — with bilingual UI labels and built-in
anti-discrimination guards. No external libraries used; only Node built-ins
(`crypto`, `node:test`, `node:assert`).

**HE.** מערכת מעקב מועמדים (ATS) ללא תלויות חיצוניות, אך-ורק תוספות (append-only),
המכסה את כל המסלול: יצירת דרישת תפקיד, פרסום, קליטת מועמדות, מיון, ראיונות,
משוב, הצעת עבודה, החלטה. תוויות דו-לשוניות (עברית RTL + אנגלית), ומגנים
מובנים נגד אפליה ע"פ חוק שוויון ההזדמנויות בעבודה, התשמ"ח-1988.

---

## 2. Pipeline Stages / שלבי המסלול

The hiring funnel is computed from each candidate's append-only
`stageHistory` array, so a later rejection never erases the fact that
the candidate reached an earlier stage.

| # | Stage (EN) | Stage (HE)              | Code              | Notes                                         |
|---|------------|-------------------------|-------------------|-----------------------------------------------|
| 1 | Applied    | הוגשה מועמדות           | `applied`         | `receiveApplication()` entry point            |
| 2 | Screened   | עבר מיון                | `screened`        | `screenCandidate({ passed:true, … })`         |
| 3 | Interviewed| רואיין                  | `interviewed`     | `scheduleInterview(...)` auto-transitions     |
| 4 | Offered    | הוצעה הצעה              | `offered`         | `makeOffer(...)` writes a bilingual letter    |
| 5 | Hired      | נקלט                    | `hired`           | `recordDecision({ status:'accepted' })`       |
| — | Rejected   | נדחה                    | `rejected`        | `rejectCandidate(...)` — record preserved     |
| — | Withdrawn  | נסוג ביוזמתו            | `withdrawn`       | Candidate-initiated; record preserved         |

**Conversion ratios** computed by `pipeline(reqId)`:
- `applied → screened`
- `screened → interviewed`
- `interviewed → offered`
- `offered → hired`

---

## 3. Public API surface / API חיצוני

| Method                                | Purpose (EN)                          | מטרה (HE)                              |
|---------------------------------------|---------------------------------------|----------------------------------------|
| `createRequisition(input)`            | Create a job req, version 1           | יצירת דרישת תפקיד, גרסה 1              |
| `editRequisition(id, patch, by)`      | Append new version, never overwrite   | תוספת גרסה חדשה, ללא דריסה             |
| `publishJob(reqId, channels)`         | Publish to one or more channels       | פרסום לערוצים נבחרים                   |
| `receiveApplication(input)`           | Accept new applicant                  | קליטת מועמדות חדשה                     |
| `candidateView(id, {audience})`       | Staff or blind reviewer view          | תצוגה לעובד / לבוחן עיוור              |
| `screenCandidate(id, decision)`       | Pass/fail screening, append-only      | מיון מקצועי, אך-ורק תוספות             |
| `scheduleInterview(input)`            | Book an interview slot                | קביעת ראיון                            |
| `recordFeedback(input)`               | Append-only 1-5 score feedback        | תיעוד משוב סולם 1-5                    |
| `candidateAverage(id)`                | Mean score across all feedback        | ממוצע משוב מצרפי                       |
| `makeOffer(input)`                    | Generate bilingual offer letter       | יצירת הצעת עבודה דו-לשונית             |
| `recordDecision(input)`               | Accepted / declined / negotiating     | החלטה: התקבל / סורב / במו"מ            |
| `rejectCandidate(input)`              | Flip status, never delete             | שינוי סטטוס, ללא מחיקה                 |
| `pipeline(reqId)`                     | Funnel counts + conversion ratios     | מונים למשפך + יחסי המרה                |
| `diversityReport(reqId)`              | k-anonymous gender breakdown          | פילוח מגדר ב-k-anonymity               |
| `timeToHire(reqId)`                   | Days opening → first acceptance       | ימים מפתיחה ועד קבלה ראשונה            |
| `cohortReport(period)`                | Hires by source/department in window  | קליטות לפי מקור/מחלקה לתקופה           |
| `getEvents(candId)`                   | Read-only event log                   | יומן אירועים לקריאה בלבד               |

---

## 4. Anti-discrimination notes / הערות שוויון הזדמנויות

The module is designed around the constraints of **חוק שוויון ההזדמנויות
בעבודה, התשמ"ח-1988** (Israeli Equal Employment Opportunities Law, 1988)
and its amendments. The law forbids discrimination on the basis of: sex,
race, religion, nationality, country of origin, viewpoint, party,
military reserve service, age, sexual orientation, marital status,
parental status, and disability — among others.

### 4.1 Schema-level guards

- The `candidate.raw` object has **only four PII slots**: `name`, `email`,
  `phone`, `source`. Any disallowed field passed by the caller is
  silently dropped — see test
  `candidate schema has no protected-class slots (age, religion, etc.)`.
- The schema has **no top-level slot at all** for: age, date of birth,
  religion, nationality, country of origin, marital status, parental
  status, sexual orientation, disability, medical history, or pregnancy.
  These cannot be stored even by accident, because there is nowhere to
  put them.

### 4.2 Blind review (`blindReview=true`)

- When the application flag `blindReview=true` is set, the reviewer view
  returned by `candidateView(id, { audience:'reviewer' })` strips the
  candidate's `name`, `email`, `phone`, and `source`. The `name` field is
  replaced with a stable pseudonym (`CAND-XXXXXXXX`) derived from the
  email via SHA-256 with a per-instance salt.
- The pseudonym is **deterministic** so the same person referenced from
  two different reviewer screens shows the same code, but **not
  reversible** without the salt and underlying email.
- Resume and cover letter content is preserved as-is: the reviewer can
  still evaluate skill and experience.

### 4.3 Voluntary self-reporting

- The only protected attribute the system can ingest is `voluntary_gender`
  on a single optional field (`female` / `male` / `other`). It is stored
  on the application but never on the reviewer-visible record.
- It is consumed **only** by `diversityReport(reqId)`, which returns
  aggregate counts and applies **k-anonymity (k=5 by default)**: any
  bucket smaller than 5 is reported as `<5` so individuals cannot be
  re-identified.

### 4.4 Offer letter

- Every offer letter rendered by `makeOffer()` includes a bilingual
  EEO clause (`LABELS.OFFER_EEO_NOTE`) confirming the company's
  compliance with the law. This is asserted in the
  `makeOffer — generates bilingual letter with EEO clause and salary` test.

### 4.5 No deletion (לא מוחקים)

- The in-memory store has no `delete`, `remove`, or `clear` method.
- Rejection flips `status` and appends a `rejection` record but never
  removes the candidate. This is deliberate: under Israeli labor law a
  rejected candidate may file a complaint up to several years later, and
  the company must be able to demonstrate the basis of the decision was
  not discriminatory. Append-only history is the audit trail.

---

## 5. Test coverage / כיסוי בדיקות

```
✔ createRequisition — creates v1 with all fields and append-only versions
✔ createRequisition — required fields enforced
✔ editRequisition — appends new version, never overwrites v1
✔ publishJob — multi-channel publish + idempotent re-publish
✔ publishJob — rejects unknown channels
✔ receiveApplication — stores PII separately and starts at APPLIED stage
✔ receiveApplication — blind review pseudonymizes reviewer view
✔ pseudonymize — deterministic across calls, unique per email
✔ screenCandidate — pass advances stage and stores append-only history
✔ screenCandidate — fail rejects but preserves record
✔ scheduleInterview — creates interview, transitions stage to INTERVIEWED
✔ scheduleInterview — rejects unknown type and missing interviewers
✔ recordFeedback — accepts 1-5 scores, computes average, append-only
✔ recordFeedback — out-of-range scores rejected
✔ makeOffer — generates bilingual letter with EEO clause and salary
✔ recordDecision — accepted moves candidate to HIRED
✔ recordDecision — declined keeps record but does not promote to hired
✔ rejectCandidate — flips status, preserves record + resume + history
✔ pipeline — counts each stage reached, even after rejection
✔ diversityReport — aggregates only, suppresses small buckets
✔ timeToHire — days from opening_date to first acceptance
✔ timeToHire — null when no acceptance yet
✔ cohortReport — aggregates hires by source and department in window
✔ event log — every action appends, never mutates
✔ candidate schema has no protected-class slots (age, religion, etc.)
✔ store has no delete/remove/clear method — לא מוחקים
✔ every label and competency has bilingual {he,en}
✔ blindCopy — strips email, phone, source; preserves resume

tests 28 / pass 28 / fail 0
duration ~124 ms
```

**Required-by-spec coverage check (≥18 tests, all topics):**

| Spec requirement                              | Test name                                                          |
|-----------------------------------------------|--------------------------------------------------------------------|
| Requisition creation                          | `createRequisition — creates v1 with all fields …`                 |
| Blind review pseudonymization                 | `receiveApplication — blind review pseudonymizes reviewer view`    |
| Funnel metrics                                | `pipeline — counts each stage reached, even after rejection`       |
| Feedback scoring (1-5 across competencies)    | `recordFeedback — accepts 1-5 scores, computes average …`          |
| Offer letter bilingual                        | `makeOffer — generates bilingual letter with EEO clause and salary`|
| Time to hire calculation                      | `timeToHire — days from opening_date to first acceptance`          |
| Rejection preserves record                    | `rejectCandidate — flips status, preserves record + resume + history` |

All 7 spec-required test topics covered, 28 tests total (>18 required).

---

## 6. Hebrew glossary / מילון מונחים

| Hebrew                          | Transliteration         | English                              |
|---------------------------------|-------------------------|--------------------------------------|
| מערכת מעקב מועמדים              | ma'arekhet ma'akav muamadim | Applicant Tracking System (ATS)  |
| דרישת תפקיד                     | drishat tafkid          | Requisition / job opening            |
| מנהל מגייס                      | menahel megayes         | Hiring manager                       |
| מועמד / מועמדת                  | muamad / muamedet       | Candidate (m/f)                      |
| קורות חיים                      | korot khayim            | Resume / CV                          |
| מכתב מקדים                      | mikhtav makdim          | Cover letter                         |
| מיון                             | miyun                   | Screening                            |
| ראיון טלפוני                    | ra'ayon telefoni        | Phone interview                      |
| ראיון פנים-אל-פנים              | ra'ayon panim-el-panim  | On-site interview                    |
| ראיון טכני                      | ra'ayon tekhni          | Technical interview                  |
| ראיון פאנל                      | ra'ayon panel           | Panel interview                      |
| ראיון סופי                      | ra'ayon sofi            | Final interview                      |
| משוב                            | mishuv                  | Feedback                             |
| הצעת עבודה                      | hatza'at avoda          | Offer letter                         |
| מענק חתימה                      | ma'anak khatima         | Signing bonus                        |
| אופציות                         | optsiot                 | Equity / options                     |
| משכורת ברוטו                    | maskoret bruto          | Gross salary                         |
| תאריך תחילת העסקה               | ta'arikh tkhilat ha'asaka | Start date                         |
| נדחה                            | nidkhe                  | Rejected                             |
| נסוג ביוזמתו                    | nasog be-yozmato        | Withdrawn                            |
| נקלט                            | niklat                  | Hired                                |
| משפך גיוס                       | mashpekh giyus          | Recruitment funnel                   |
| יחס המרה                        | yakhas hamara           | Conversion ratio                     |
| זמן עד גיוס                     | zman ad giyus           | Time to hire                         |
| ביקורת שמורה                    | bikoret shmura          | Audit trail                          |
| בוחן עיוור                      | bokhen iver             | Blind reviewer                       |
| שם בדוי                         | shem badui              | Pseudonym                            |
| חוק שוויון ההזדמנויות בעבודה    | khok shivyon ha-hizdamnuyot ba-avoda | Equal Employment Opportunities Law |
| שוויון הזדמנויות                | shivyon hizdamnuyot     | Equal opportunity                    |
| אנונימיות-k                     | anonimiyut-k            | k-anonymity                          |
| לא מוחקים, רק משדרגים ומגדלים   | lo mokhakim, rak meshadragim u-megadlim | Never delete, only upgrade and grow |

---

## 7. How to run / איך מריצים

```bash
cd onyx-procurement
node --test test/hr/ats.test.js
```

Expected output: `tests 28 / pass 28 / fail 0`.

---

## 8. Files delivered / קבצים שנמסרו

1. `onyx-procurement/src/hr/ats.js` — ATS class, constants, store, pseudonymizer
2. `onyx-procurement/test/hr/ats.test.js` — 28 node:test cases
3. `_qa-reports/AG-Y061-ats.md` — this report

**Zero external dependencies. Node built-ins only (`crypto`, `node:test`, `node:assert`).**
