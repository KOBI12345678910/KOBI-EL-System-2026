# AG-Y068 — Training Catalog & Learning Management System (LMS)

**Agent:** Y-068
**Owner:** Techno-Kol Uzi Mega-ERP (Kobi EL 2026)
**Date:** 2026-04-11
**Status:** DELIVERED
**Rule:** לא מוחקים רק משדרגים ומגדלים — NEVER DELETE, ONLY UPGRADE

---

## 1. Files delivered

| File | Purpose |
|------|---------|
| `onyx-procurement/src/hr/training-catalog.js` | Zero-dependency `TrainingCatalog` class (LMS core) |
| `onyx-procurement/test/hr/training-catalog.test.js` | 27 unit tests (all passing) |
| `_qa-reports/AG-Y068-training-catalog.md` | This report |

**Test result:** 27/27 passing — `node --test test/hr/training-catalog.test.js`

---

## 2. Exported API surface

`TrainingCatalog` class methods:

| Method | Description |
|--------|-------------|
| `addCourse({...})` | Create or upgrade a course (version-bump + snapshot) |
| `scheduleSession(courseId, {...})` | Open a session (in-person/online/self-paced/blended) |
| `enroll({employeeId, sessionId})` | Enroll; auto-waitlist if full |
| `cancelEnrollment({...})` | Cancel and auto-promote first from waitlist |
| `markAttendance(sessionId, {...})` | Record present/absent/late/excused |
| `attendanceSummary(sessionId)` | Aggregate counts |
| `completeCourse({...})` | Issue certificate (PDF-ready payload) on pass |
| `learningPath({role})` | Required courses for a role |
| `setLearningPath(role, ids)` | Override or extend role paths |
| `requiredCompliance({roleOrCategory?})` | Israeli legal mandatory training |
| `complianceMatrix(employees)` | Per-employee valid / expired / missing matrix |
| `certificateRepo(employeeId)` | All certs for an employee (+ expiry flags) |
| `setBudget({department, period, amount})` | Set training budget |
| `recordSpend({...})` | Append to spend ledger |
| `budgetTracking({department, period})` | Budget vs. spend, utilisation, over-budget flag |
| `studyFundUsage({employeeId, year})` | קרן השתלמות eligibility classifier |
| `submitFeedback({...})` | Per-session feedback (rating 1-5, NPS 0-10, rubric) |
| `feedbackCollection(sessionId)` | Averages, NPS calculation, all items |

Also exported: `COURSE_FORMATS`, `COURSE_LEVELS`, `ATTENDANCE_STATUSES`,
`ENROLLMENT_STATUSES`, `REQUIRED_COMPLIANCE`, `STUDY_FUND_RULES`, `LABELS`.

---

## 3. Israeli mandatory training matrix (REQUIRED_COMPLIANCE)

All mandatory training is seeded into the catalog automatically on
`new TrainingCatalog()` so the compliance matrix is always ready to query.

| Code | Hebrew | English | Legal basis | Renewal | Applies to |
|------|--------|---------|-------------|---------|------------|
| `safety-general` | הדרכת בטיחות כללית | General Safety Training | תקנות ארגון הפיקוח על העבודה (מסירת מידע והדרכת עובדים), תשנ"ט-1999 | 12 mo | ALL employees |
| `harassment-prevention` | מניעת הטרדה מינית | Sexual Harassment Prevention | חוק למניעת הטרדה מינית, תשנ"ח-1998 § 7(ב) | 24 mo | ALL (manager addendum) |
| `fire-safety` | בטיחות אש ומילוט | Fire Safety & Evacuation | חוק הרשות הארצית לכבאות והצלה, תש"ע-2010 | 12 mo | ALL |
| `first-aid` | עזרה ראשונה | First Aid | צו רישוי עסקים + תקנות הבטיחות בעבודה | 24 mo | Designated first-aiders |
| `hazmat` | חומרים מסוכנים (חומ"ס) | Hazardous Materials | חוק החומרים המסוכנים, התשנ"ג-1993 | 12 mo | Warehouse, construction, painter, hazmat handler |
| `privacy-gdpr` | הגנת הפרטיות ואבטחת מידע | Privacy Protection & Data Security | חוק הגנת הפרטיות, תשמ"א-1981 + תקנות אבטחת מידע 2017 | 24 mo | HR, IT, finance, management |
| `working-at-heights` | עבודה בגובה | Working at Heights | תקנות הבטיחות בעבודה (עבודה בגובה), תשס"ז-2007 | 24 mo | Construction, painter, maintenance |

### Key legal requirements

- **§ 7(ב) חוק למניעת הטרדה מינית, תשנ"ח-1998** — every employer must
  deliver prevention training and maintain a documented procedure.
  Repeat training recommended every 24 months with a dedicated
  addendum for managers.
- **תקנות ארגון הפיקוח על העבודה, תשנ"ט-1999** — general safety
  training is mandatory on hire and annually thereafter.
- **תקנות הבטיחות בעבודה (עבודה בגובה), תשס"ז-2007** — any work above
  2 m on construction sites requires a certified "עובד גובה", renewable
  every 2 years.
- **חוק החומרים המסוכנים, התשנ"ג-1993** — hazmat workers must hold a
  valid annual certification.
- **חוק הגנת הפרטיות, תשמ"א-1981 + תקנות 2017** — data handlers in
  HR/IT/finance require periodic privacy training.

### Matrix behaviour

`complianceMatrix(employees)` returns per-employee rows, each with:
- `status: 'valid' | 'missing' | 'expired' | 'n/a'`
- `issuedAt`, `expiresAt` where applicable
- `compliant: true|false` flag

"n/a" means the training does not apply to the role (e.g. hazmat for
office staff).

---

## 4. קרן השתלמות (Study Fund) rules

Encoded in `STUDY_FUND_RULES` and classified per-course by
`studyFundUsage({employeeId, year})`.

### 4.1 Eligible (זכאי למימון קרן השתלמות)

Courses that enrich the employee's current role or qualify them for a
new role in the organisation:

- `professional` — הכשרה מקצועית
- `certification` — תעודות הסמכה מוכרות (ISTQB, PMP, AWS, CFA, ...)
- `academic` — תואר אקדמי (BA/BSc/MA/MSc/PhD/MBA)
- `technical` — הנדסי / טכני
- `management` — ניהול
- `safety` — בטיחות (לא מספיק עצמו, אך מוכר)
- `language` — שפות לצורכי עבודה
- `compliance` — ציות ורגולציה
- `leadership` — פיתוח מנהיגות
- `it` — טכנולוגיות מידע

### 4.2 Disallowed (אסור למימון)

- `hobby` — תחביב אישי
- `leisure` — פנאי
- `vacation` — טיולים / חופשות
- `personal-interest` — עניין אישי לא תעסוקתי

### 4.3 Financial parameters (2026)

| Parameter | Value | Source |
|-----------|-------|--------|
| Annual tax-exempt deposit ceiling | **₪ 15,712** | תקנות מס הכנסה – הגבלת תקרת ההפרשות |
| Employer contribution rate | 7.5% of gross | Standard industry practice |
| Employee contribution rate | 2.5% of gross | Standard industry practice |
| Ripening period (no tax) | 6 years | כללי משיכה של קרן השתלמות |
| Ripening period (retirement) | 3 years | כללי משיכה של קרן השתלמות |

### 4.4 Classifier decision flow

```
category → disallowed list?  → NOT eligible (hobby/leisure)
         → allowed list?     → eligible (professional/...)
         → unknown?          → NOT eligible (manual review flag)
```

Each classification is returned bilingually:
`{ eligible, reason_he, reason_en, review? }`.

---

## 5. Course formats

| Format | Hebrew | Use case |
|--------|--------|----------|
| `in-person` | פרונטלי | Classroom / workshop |
| `online` | מקוון (לייב) | Live webinar / Zoom |
| `self-paced` | עצמי | Recorded video on demand |
| `blended` | משולב | Hybrid (e.g. recorded theory + in-person lab) |

---

## 6. Certificate payload schema

Certificates issued by `completeCourse` include a `pdf` field with a
structured template, NOT a real PDF buffer (zero-deps rule). A
downstream PDF generator (e.g. `src/pdf/pdf-generator.js`) can render
it. Fields:

- `template: 'training-certificate-v1'`
- `title_he: 'תעודת סיום קורס'`, `title_en: 'Course Completion Certificate'`
- Bilingual field list: שם העובד / Employee, שם הקורס / Course, ציון / Score,
  תאריך הנפקה / Issued, בתוקף עד / Expires, אסמכתא חוקית / Legal basis
- `issuedAt`, `expiresAt` (based on `renewalMonths`), `complianceCode`,
  `law_he`, `law_en`

Certificates are never deleted. Re-issuance appends a new record.

---

## 7. Policy — לא מוחקים רק משדרגים

Every "delete-like" operation is implemented as an upgrade:

- `addCourse` on an existing id → bumps `version`, stores the previous
  snapshot in `previousVersions[]`.
- `cancelEnrollment` → appends a cancellation record to the append-only
  `enrollments[]` log; the original enrollment is preserved.
- Expired certificates → flagged `expired: true` but never purged.
- Feedback, attendance, completions, spend records → all append-only.
- `auditLog[]` records every mutation with timestamp.

---

## 8. Hebrew glossary (מילון עברי)

| Hebrew | English | Code |
|--------|---------|------|
| קטלוג הדרכות | Training catalog | `TrainingCatalog` |
| קורס | Course | `course` |
| מפגש | Session | `session` |
| רישום | Enrollment | `enroll` |
| רשימת המתנה | Waitlist | `waitlist` |
| נוכחות | Attendance | `attendance` |
| נוכח | Present | `present` |
| נעדר | Absent | `absent` |
| מאחר | Late | `late` |
| פטור | Excused | `excused` |
| השלמת קורס | Course completion | `complete` |
| תעודה | Certificate | `certificate` |
| מסלול למידה | Learning path | `learningPath` |
| הדרכות חובה לפי חוק | Mandatory compliance training | `requiredCompliance` |
| מטריצת עמידה בחוק | Compliance matrix | `complianceMatrix` |
| מאגר תעודות | Certificate repository | `certificateRepo` |
| תקציב הדרכה | Training budget | `budgetTracking` |
| קרן השתלמות | Study fund | `studyFundUsage` |
| משוב | Feedback | `feedbackCollection` |
| מדריך | Instructor | `instructor` |
| מיקום | Location | `location` |
| מקומות | Seats | `seats` |
| פרונטלי | In-person | `in-person` |
| מקוון | Online | `online` |
| עצמי | Self-paced | `self-paced` |
| משולב | Blended | `blended` |
| בסיסי | Beginner | `beginner` |
| מתקדם | Intermediate | `intermediate` |
| מומחה | Advanced | `advanced` |
| מאסטר | Expert | `expert` |
| הדרכת בטיחות כללית | General Safety Training | `safety-general` |
| מניעת הטרדה מינית | Harassment Prevention | `harassment-prevention` |
| בטיחות אש ומילוט | Fire Safety & Evacuation | `fire-safety` |
| עזרה ראשונה | First Aid | `first-aid` |
| חומרים מסוכנים | Hazardous Materials | `hazmat` |
| עבודה בגובה | Working at Heights | `working-at-heights` |
| הגנת הפרטיות | Privacy Protection | `privacy-gdpr` |

---

## 9. Test coverage breakdown (27 tests)

| # | Area | Test |
|---|------|------|
| 1-3 | Course lifecycle | Creation, invalid format rejection, version upgrade |
| 4-6 | Session & enrollment | Session open, seat fill + waitlist, cancel + auto-promote |
| 7-8 | Attendance | Present/absent/late/excused summary, invalid status rejected |
| 9-10 | Completion | Certificate on pass, NO cert on fail (<60) |
| 11-12 | Learning path | Construction-worker + painter role defaults |
| 13-15 | Compliance | Mandatory list, legal citation, missing/valid/n-a matrix |
| 16-17 | Certificate repo | Multi-cert retrieval, empty for unknown employee |
| 18-20 | Budget | Zero-spend, aggregation, over-budget flag |
| 21-23 | Study fund | Professional eligible, hobby rejected, over-ceiling |
| 24-26 | Feedback | NPS + avg, rating range rejection, empty-session behaviour |
| 27 | Enum | COURSE_FORMATS completeness |

**Pass rate:** 27 / 27 = **100%**

---

## 10. Integration notes

- **Zero dependencies** — runs under any Node 18+ without installing anything.
- **HR analytics** — `src/hr/analytics.js` already provides `trainingHours()`;
  this module complements it by owning the catalog and compliance state.
- **PDF generation** — certificates ship with a structured payload; a
  consumer calls the existing `src/pdf/pdf-generator.js` to render.
- **Payroll** — study-fund eligibility can feed into payroll to drive
  קרן השתלמות payouts.
- **Construction PM** — working-at-heights + hazmat certs feed into the
  construction project manager for crew assignment gating.

---

## 11. Future enhancements (non-blocking)

- Localised date formatting (יום/חודש/שנה vs. ISO)
- iCal export for scheduled sessions
- Webhook integration into Slack/WhatsApp for enrollment confirmations
- Integration with bituach-leumi / MOITAL online portals for mandatory
  safety training attestation
- "Micro-learning" format for ≤ 5-minute compliance refreshers

---

**לא מוחקים רק משדרגים ומגדלים — agent Y-068 signing off.**
