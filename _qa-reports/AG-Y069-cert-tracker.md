# AG-Y069 — Professional Certification Tracker

**Agent:** Y-069 — Swarm HR
**System:** Techno-Kol Uzi Mega-ERP (Israeli Metal Fab) — Wave 2026
**Module:** `onyx-procurement/src/hr/cert-tracker.js`
**Test:** `onyx-procurement/test/hr/cert-tracker.test.js`
**Report date:** 2026-04-11
**Rule:** לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.

---

## 1. Scope — מטרת המודול

`CertTracker` is the HR-side professional-licence tracker for every Israeli
statutory and voluntary credential an employee needs to legally and safely
work inside a Techno-Kol Uzi site. It is intentionally **distinct** from
`onyx-procurement/src/manufacturing/welder-certs.js` (Agent Y-043), which
handles AWS/ASME/EN ISO shop-floor WPQ certs that bind a welder to a
**process envelope**.

| Concern | Y-043 welder-certs.js | Y-069 cert-tracker.js (this) |
|---|---|---|
| Binds to | process/position envelope | the **person** across jobs |
| Standard | AWS D1.1, ASME IX, EN ISO 9606 | Israeli regulatory + ISO 45001/9001 evidence |
| Granularity | 6-month continuity weld | 12–60 month licence cycle |
| Audit purpose | part/seam traceability | HR statutory compliance + customer audit |
| Renewal trigger | continuity break | expiry calendar + CEU count |

Both coexist. A welder who is a *רתך ראשי* (lead welder) will typically
have both a shop WPQ from Y-043 **and** a personal `RISHUY_RITUCH` from
this module.

---

## 2. Israeli Cert Catalog — קטלוג התעודות

The catalog is frozen inside `CERT_CATALOG` and exposes, per cert type,
bilingual labels, issuing registry, the grounding legal citation, default
validity, CEU requirement, renewal lead-time, and a criticality flag.

| Code | Hebrew | English | Issuer | Validity | CEUs | Critical |
|---|---|---|---|---|---|---|
| `RISHUY_MEHANDES` | רישיון מהנדס רשום | Registered Engineer Licence | רשם המהנדסים והאדריכלים — משרד העבודה | 60 mo | 120 | ✓ |
| `RISHUY_HANDASAI` | רישיון הנדסאי | Certified Practical Engineer | המועצה להנדסאים וטכנאים מוסמכים | 60 mo | 60 | ✓ |
| `RISHUY_HASHMALAI` | רישיון חשמלאי | Electrician Licence | משרד האנרגיה — מינהל החשמל | 60 mo | 40 | ✓ |
| `RISHUY_MANOF` | רישיון מפעיל מנוף | Crane Operator Licence | משרד העבודה — המפקח על העבודה | 24 mo | — | ✓ |
| `RISHUY_RITUCH` | רישיון ריתוך מקצועי | Professional Welding Licence | מכון הריתוך הישראלי / מ"ת | 36 mo | 16 | — |
| `HETER_GOVAH` | היתר עבודה בגבהים | Working-at-Heights Permit | משרד העבודה — גוף בודק מוסמך | 24 mo | — | ✓ |
| `RISHUY_NEHIGA_KAVED` | רישיון נהיגה כבדה | Heavy Vehicle Licence | משרד התחבורה — רשות הרישוי | 60 mo | — | ✓ |
| `AVTACHAT_MEYDA` | הסמכת אבטחת מידע | Information Security Cert | (ISC)² / ISACA / CompTIA | 36 mo | 120 | — |
| `TEUDAT_ZEHUT_BETICHUTIT` | ת.ז. בטיחותית | Site Safety ID | הממונה על הבטיחות / מוסד הבטיחות | 12 mo | 8 | ✓ |

### Legal backbone — חוקים ותקנות

* חוק המהנדסים והאדריכלים, תשי"ח-1958
* חוק ההנדסאים והטכנאים המוסמכים, תשע"ג-2012
* חוק החשמל, תשי"ד-1954 + תקנות החשמל (רישוי חשמלאים), תשמ"ה-1985
* תקנות הבטיחות בעבודה (עגורנאים ומפעילי מכונות הרמה), תשנ"ג-1992
* תקנות הבטיחות בעבודה (עבודה בגובה), תשס"ז-2007
* פקודת הבטיחות בעבודה [נוסח חדש], תש"ל-1970
* פקודת התעבורה [נוסח חדש]
* ISO 9001:2015 §7.2 (Competence) — customer audit evidence
* ISO 45001:2018 §7.2 (Competence — OH&S)
* ISO 27001:2022 A.6.3 (Awareness / training)

---

## 3. Role Matrix — מטריצת תפקידים

`ROLE_MATRIX` maps every job family at Techno-Kol Uzi to its mandatory
(statutory) and recommended (insurance / customer audit) certs.

| Role | Hebrew | Required | Recommended |
|---|---|---|---|
| `site-engineer` | מהנדס ביצוע | `RISHUY_MEHANDES`, `HETER_GOVAH`, `TEUDAT_ZEHUT_BETICHUTIT` | `AVTACHAT_MEYDA` |
| `shop-foreman` | מנהל עבודה בייצור | `RISHUY_HANDASAI`, `TEUDAT_ZEHUT_BETICHUTIT` | `HETER_GOVAH` |
| `electrician` | חשמלאי | `RISHUY_HASHMALAI`, `TEUDAT_ZEHUT_BETICHUTIT` | `HETER_GOVAH` |
| `crane-operator` | מפעיל מנוף | `RISHUY_MANOF`, `TEUDAT_ZEHUT_BETICHUTIT` | — |
| `welder-lead` | רתך ראשי | `RISHUY_RITUCH`, `TEUDAT_ZEHUT_BETICHUTIT` | `HETER_GOVAH` |
| `truck-driver` | נהג רכב כבד | `RISHUY_NEHIGA_KAVED`, `TEUDAT_ZEHUT_BETICHUTIT` | — |
| `it-security` | מנהל אבטחת מידע | `AVTACHAT_MEYDA`, `TEUDAT_ZEHUT_BETICHUTIT` | — |
| `heights-rigger` | עובד עבודות גובה | `HETER_GOVAH`, `TEUDAT_ZEHUT_BETICHUTIT` | — |

`complianceGap({ required })` walks this matrix and returns two buckets:

* **blocking** — at least one missing cert is flagged `critical:true` in
  the catalog. Employee cannot legally perform the role.
* **advisory** — only non-critical certs missing. Employee is legally
  safe, but the customer audit or insurer may complain.

---

## 4. Renewal Cadence — מחזורי חידוש

Reminders are graduated through `renewalReminder({ leadDays })`, default
`[90, 60, 30, 7]`. Each cert is assigned the *smallest* lead tier it falls
into and labeled with a priority:

| Days remaining | Lead tier | Priority | UX behaviour |
|---|---|---|---|
| ≤ 7 | 7  | `critical` | red banner, blocks clock-in until resolved |
| 8 – 30 | 30 | `high` | yellow banner, notifies HR + direct manager daily |
| 31 – 60 | 60 | `medium` | weekly HR digest, auto-schedules exam booking |
| 61 – 90 | 90 | `low` | monthly reminder only |
| > 90 | —  | none | silent |

The `renewalProcess` field on every cert carries the grounding law (or a
customer-supplied SOP for non-statutory credentials), so the reminder UI
can pop the correct Hebrew paperwork pack. `CEU` counters roll into the
renewal gate: a cert with `ceusRequired > ceusCompleted` on the week of
expiry becomes `blocked` in any downstream renewal workflow.

Cert-type specific overrides:

* `RISHUY_MANOF` and `HETER_GOVAH` flip `requiresMedical: true` + a
  `requiresPracticalExam: true` flag, so the renewal workflow must book
  an occupational-health appointment 45+ days out and a practical exam
  slot 15+ days out.
* `RISHUY_NEHIGA_KAVED` also flips `requiresMedical: true`; the
  medical window tightens after age 60 (handled by payroll retention
  rules in Agent X-09, not here).

---

## 5. Public API — ממשק

```js
const { CertTracker, CERT_CATALOG, ROLE_MATRIX } =
  require('./src/hr/cert-tracker.js');

const tracker = new CertTracker({
  now: () => new Date(),           // injectable clock for tests
  authorityRegistry: new Map(),    // optional issuer->Set<certNumber>
});
```

| Method | Purpose |
|---|---|
| `addCertification(input)` | Append-only write. Never mutates prior rows. |
| `listExpiring({ days, asOf })` | Flat list of certs due within N days, bucketed `expired`/`critical`/`urgent`/`soon`. |
| `renewalReminder({ leadDays, asOf })` | Graduated `critical`/`high`/`medium`/`low` reminder batch with bilingual copy. |
| `complianceGap({ required, actual })` | Returns blocking + advisory gaps per employee vs. role matrix. |
| `certRepo(employeeId)` | Full portfolio with scan paths, live status, history. |
| `verifyAuthenticity({ cert, issuer })` | Offline stub to check against issuer registry; appends to cert history. |
| `costTracking(period)` | Exam + course spend per employee within a period. |
| `roleRequirements(role)` | Single role or full matrix lookup. |
| `exportForAudit(period)` | ISO / customer-audit bundle (`schema: techno-kol.cert-audit.v1`). |

### "Never delete" invariants

* `addCertification` always creates a new row. A new cert replaces an old
  one via `supersedes: prevCertId` — the old row stays, its `status` flips
  to `superseded`, and `supersededBy` points forward.
* `listExpiring` and `complianceGap` skip superseded rows when computing
  the live state, but they remain queryable via `certRepo(employeeId)` and
  `exportForAudit(period)`.
* Unit test `invariant: append-only history` uses reflection to assert no
  method named `delete|remove|drop|destroy` is exposed on the prototype.

---

## 6. Test Matrix — בדיקות

Command: `node --test test/hr/cert-tracker.test.js`
**Last run: 22 tests, 22 pass, 0 fail.**

| Suite | Cases |
|---|---|
| `addCertification` | catalog-driven expiry, explicit override, supersede chain, field validation |
| `listExpiring` | bucket classification, supersede exclusion |
| `renewalReminder` | graduated 90/60/30/7 tiers, custom leadDays override |
| `complianceGap` | role-matrix gap detection, expired-cert treatment, ad-hoc typeCode list |
| `roleRequirements` | single role lookup, full matrix lookup |
| `certRepo & verifyAuthenticity` | portfolio bucketing, registry hit, registry miss |
| `costTracking` | exam+course aggregation, per-employee ranking, currency default |
| `exportForAudit` | ISO bundle schema, role-matrix embed, bilingual title |
| `invariant: append-only history` | no destructive methods, catalog completeness, ROLE_MATRIX ↔ CERT_CATALOG referential integrity |

Deterministic clock is injected via `new CertTracker({ now: () => fixed })`
in every suite so day-math is reproducible across CI runs.

---

## 7. Hebrew Glossary — מילון עברית ↔ אנגלית

| Hebrew | English |
|---|---|
| רישיון מהנדס רשום | Registered Engineer Licence |
| רישיון הנדסאי | Certified Practical Engineer (Handasai) |
| רישיון חשמלאי | Electrician Licence |
| רישיון מפעיל מנוף | Crane Operator Licence |
| רישיון ריתוך | Welding Licence |
| היתר עבודה בגבהים | Working-at-Heights Permit |
| רישיון נהיגה כבדה | Heavy Vehicle Driving Licence |
| הסמכת אבטחת מידע | Information Security Certification |
| ת.ז. בטיחותית | Site Safety ID |
| בתוקף | Active |
| עומד לפוג | Expiring soon |
| פג תוקף | Expired |
| הוחלף / שודרג | Superseded |
| בוטל | Revoked |
| ממתין לאישור | Pending |
| אומת | Verified |
| חשוד בזיוף | Suspected forgery |
| חוסר | Gap (missing cert) |
| תקין | Compliant |
| רשם המהנדסים | Registrar of Engineers |
| רשם החשמלאים | Registrar of Electricians |
| המפקח על העבודה | Commissioner of Safety at Work |
| גוף בודק מוסמך | Accredited inspection body |
| CEU / שעות השתלמות | Continuing Education Units |
| מחזור חידוש | Renewal cycle |
| מבחן מעשי | Practical exam |
| בדיקה רפואית | Medical clearance |

---

## 8. Integration notes — אינטגרציה עתידית

* **ERP boundary:** `filePath` is opaque — the caller decides whether it
  points to the local file share, an S3 key, a OneDrive link, or a Scanner
  Direct upload. This module never opens the file.
* **Reminder delivery:** Agent X-55 notification router consumes the
  `renewalReminder()` output (each item has an `employeeId`, a bilingual
  `message`, and a `priority`). The router chooses SMS vs WhatsApp vs
  email based on the cert's criticality and the employee's contact
  preferences.
* **Cost roll-up:** `costTracking()` feeds into the HR analytics
  dashboard (Agent X-12) under the "Training & Certification" cost
  centre. The currency is stamped per ledger row, so multi-currency rolls
  stay faithful if the company expands beyond ILS.
* **Customer audits:** `exportForAudit()` is the canonical input for the
  customer audit pack (Agent X-23 packet builder). It intentionally
  includes `roleMatrix` and `costSummary` in the same bundle so auditors
  have a one-file answer to "who is qualified to do what, and what have
  you invested to keep it current".
* **Authority registry:** `verifyAuthenticity` takes a `Map<issuer,
  Set<certNumber>>`. When the real rשm integrations (רשם המהנדסים,
  מינהל החשמל) come online, the registry can be hydrated from HTTP
  calls at startup — no code change inside this module.

---

## 9. Status — סטטוס

* **Code:** `onyx-procurement/src/hr/cert-tracker.js` — 650+ LOC, zero deps.
* **Tests:** `onyx-procurement/test/hr/cert-tracker.test.js` — 22 tests, all passing on `node --test`.
* **Upgrade path:** add new cert types by appending to `CERT_CATALOG`; add
  new job roles by appending to `ROLE_MATRIX`. **Never mutate existing
  entries** — frozen for a reason.
* **Never-delete rule:** enforced by the append-only API and validated by
  the reflection test in the "invariant" suite.
