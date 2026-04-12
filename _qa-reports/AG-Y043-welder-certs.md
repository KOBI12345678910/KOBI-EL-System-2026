# AG-Y043 — Welder Certification Tracker

**Agent:** Y-043 — Swarm Manufacturing
**System:** Techno-Kol Uzi Mega-ERP (Israeli metal fabrication) — Wave 2026
**Module:** `onyx-procurement/src/manufacturing/welder-certs.js`
**Test:** `onyx-procurement/test/manufacturing/welder-certs.test.js`
**Date:** 2026-04-11
**Rule:** לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.

---

## 1. Purpose — מטרת המערכת

Every load-bearing seam on the shop floor of "טכנו-קול עוזי" must be
welded by a person whose **Welder Performance Qualification (WPQ)** is
current for the specific envelope of that job — process, position,
material, thickness, and standard. A missing or expired certification is
not a paperwork issue; it is a safety and legal exposure.

This module tracks welders, their qualifications, their 6-month
continuity clock, and generates bilingual certificates that print onto
the company letterhead.

---

## 2. Standards reference — תקני הסמכה

| Standard key | Issuer | Scope | Continuity | Default validity |
|---|---|---|---|---|
| `AWS-D1.1`    | American Welding Society | Structural steel welding code | 6 months | 3 years |
| `AWS-D1.2`    | American Welding Society | Structural aluminum welding code | 6 months | 3 years |
| `ASME-IX`     | ASME BPVC Section IX | Welding & brazing qualification (pressure vessels) | 6 months | 3 years |
| `EN-ISO-9606` | ISO / CEN | European welder qualification (fabricator-level) | 6 months | 3 years with examiner confirmation |

**Legal basis in Israel:**
- Israeli Standard SI 1225 (based on ISO 3834) refers back to **EN ISO
  9606** for welder qualification; the ממונה על התקינה recognises AWS
  and ASME for imported jobs.
- פקודת הבטיחות בעבודה + תקנות הבטיחות בעבודה (עבודה בגובה) require
  documented qualification evidence for any welder working on a
  load-bearing structure.
- For pressure vessels and boilers, תקנות הבטיחות (כלי לחץ) require
  ASME-IX-equivalent qualification.

---

## 3. Welding processes — תהליכי ריתוך

| Key | ISO 4063 | Hebrew | English |
|---|---:|---|---|
| SMAW | 111 | ריתוך אלקטרודה מצופה (חשמלי ידני) | Shielded Metal Arc Welding (stick) |
| GMAW | 135 | ריתוך MIG/MAG | Gas Metal Arc Welding (MIG/MAG) |
| GTAW | 141 | ריתוך TIG | Gas Tungsten Arc Welding (TIG) |
| FCAW | 136 | ריתוך תיל תמלוגה | Flux-Cored Arc Welding |
| SAW  | 121 | ריתוך קשת מוטבלת | Submerged Arc Welding |
| PAW  |  15 | ריתוך קשת פלזמה | Plasma Arc Welding |

Each cert is process-specific: a GMAW cert does **not** cover SMAW work.

---

## 4. Position notation — סימון תנוחות

### 4.1 Plate positions (AWS/ASME)

| Code | Hebrew | English | ISO 9606 equivalent |
|---|---|---|---|
| **1G** | שטוח (קערה) | Flat groove | PA |
| **2G** | אופקי | Horizontal groove | PC |
| **3G** | אנכי | Vertical groove | PF (up) / PG (down) |
| **4G** | מעל הראש | Overhead groove | PE |
| **1F** | פילט שטוח | Flat fillet | PA |
| **2F** | פילט אופקי | Horizontal fillet | PB |
| **3F** | פילט אנכי | Vertical fillet | PF / PG |
| **4F** | פילט מעל הראש | Overhead fillet | PD |

### 4.2 Pipe positions

| Code | Hebrew | English | ISO 9606 |
|---|---|---|---|
| **5G** | צינור אופקי קבוע | Pipe horizontal fixed | PF + PC + PE |
| **6G** | צינור 45° קבוע | Pipe inclined 45° fixed | H-L045 |

### 4.3 Coverage hierarchy (AWS D1.1 Table 4.10 — simplified)

The module's `POSITION_COVERS` table encodes:

- **6G** → qualifies every plate groove + every plate fillet (universal)
- **5G** → qualifies 1G/3G/4G plate + 1F/2F/3F/4F
- **4G** → qualifies 1G/4G plate + 1F/2F/4F
- **3G** → qualifies 1G/3G plate + 1F/2F/3F
- **2G** → qualifies 1G/2G plate + 1F/2F
- **1G** → qualifies 1G only
- **4F** → qualifies 1F/2F/4F
- **3F** → qualifies 1F/2F/3F
- **2F** → qualifies 1F/2F
- **1F** → qualifies 1F only

A welder who wants to weld everything in a fabricator shop should
normally go for a 6G test — it is the hardest, and once it is passed,
the welder is cleared for all production positions.

---

## 5. Thickness envelope — טווח עובי (ASME IX QW-451, simplified)

| Test coupon thickness T (mm) | Min qualified (mm) | Max qualified (mm) |
|---|---|---|
| T < 1.5  | 0 | 2 × T |
| 1.5 ≤ T < 10 | 1.5 | 2 × T |
| T ≥ 10 | 5 | **unlimited** (`UNLIMITED_MM = 9999`) |

> **Implementation note.** The "unlimited" sentinel is `9999` not
> `Infinity`, because `JSON.stringify(Infinity) === 'null'` and every
> record in this module round-trips through `JSON.parse(JSON.stringify)`
> for deep copy, audit log, and PDF generation. Callers should treat
> any `maxMm >= UNLIMITED_MM` as effectively unlimited.

---

## 6. The 6-month continuity rule — כלל ההמשכיות

**The most commonly-failed rule on an audit.** All four standards in
the module require that a welder perform the qualified process within
any rolling 6-month window, or the qualification lapses until a renewal
test is performed.

| Standard | Clause |
|---|---|
| AWS D1.1 | §4.2.3.1 |
| ASME IX  | QW-322.1 |
| EN ISO 9606-1 | §9.2 / 9.3 |
| AWS D1.2 | §5.2 (mirrors D1.1) |

**Implementation:** `recordContinuity(welderId, { date, process })`
appends an entry to `continuityLog`. `checkValidity(...)` walks the log
backwards and asks "is there any entry for (welderId, process) whose
date is within the last `continuityMonths` of the query date?"

**Per-process lockout.** A welder who does SMAW daily but hasn't touched
GMAW in 7 months has a *lapsed GMAW* cert even though they are welding
constantly. The test `continuity per-process — SMAW continuity does not
save a GMAW cert` locks this behaviour in.

**Renewal path.** The motto "לא מוחקים רק משדרגים ומגדלים" forbids
deleting the lapsed cert. Instead the welder takes a renewal test and
a new cert is issued via `issueCertification(...)`, which marks the old
record `status: 'superseded'` and cross-links `supersededBy` /
`supersededFromId`.

---

## 7. API surface — ממשק

| Method | Returns | Notes |
|---|---|---|
| `createWelder({id, name, ת.ז, photo, hireDate})` | welder record | Accepts the Hebrew key `ת.ז` directly. Validates 9 digits. |
| `deactivateWelder(id, reason)` | welder record | Keeps the record, just flips `active:false`. |
| `issueCertification({...})` | cert record | Supersedes any active cert with the same (welder, standard, process, position). |
| `recordContinuity(welderId, {date, process, jobId?, witness?})` | continuity entry | |
| `checkValidity(welderId, process, position, material, asOf?)` | `{valid, reason, reason_he, expiresIn, certId}` | Position+expiry+continuity+material+thickness all checked. |
| `expiringCerts(days, asOf?)` | sorted array | Alerts for operations dashboard. |
| `weldingProcedureSpec(idOrPayload)` | WPS record | Dual use: pass string to read, object to upsert. Upsert bumps version. |
| `procedureQualificationRecord(idOrPayload)` | PQR record | Back-links into the WPS. |
| `generateCertificate(certId)` | `{meta, header_he, header_en, body, footer_he, footer_en, textBlock}` | Bilingual printable block; deterministic; ready for PDF printer. |
| `getWelder(id)` / `getCertification(id)` / `listCertifications(welderId?)` | read helpers | |

All mutations append to `this.auditLog`. The audit log is append-only
and is never trimmed (motto).

---

## 8. Hebrew glossary — מונחון

| Hebrew | English | Notes |
|---|---|---|
| מרתך | Welder | |
| הסמכת מרתך | Welder qualification | The cert we are tracking |
| WPQ / תעודת הסמכה | Welder Performance Qualification | Per-welder test result |
| WPS / מפרט ריתוך | Welding Procedure Specification | The shop-floor recipe |
| PQR / רשומת הסמכה | Procedure Qualification Record | Evidence that the WPS was qualified |
| תנוחת ריתוך | Welding position | 1G..6G, 1F..4F |
| פילט | Fillet | Right-angle join |
| גרוב / קערה | Groove | Butt-joint prep |
| טווח עובי | Thickness range | minMm..maxMm envelope |
| המשכיות | Continuity | 6-month window rule |
| תפוגה | Expiry | Cert end date |
| חידוש | Renewal | Post-expiry re-test |
| מחליף | Supersedes | Link from new cert to old |
| בודק ריתוך / מבקר איכות | Welding inspector (CWI) / QA inspector | Second signature |
| ריתוך מבני | Structural welding | AWS D1.1 scope |
| ריתוך אלומיניום | Aluminum welding | AWS D1.2 scope |
| כלי לחץ | Pressure vessel | ASME IX scope |
| תעודת זהות / ת.ז | National ID | 9 digits, stored as string |

---

## 9. Test coverage — כיסוי בדיקות

The test file `test/manufacturing/welder-certs.test.js` runs under zero
deps (`node test/manufacturing/welder-certs.test.js`). Current results:

```
passed: 25   failed: 0
```

### 9.1 Test groups

1. **Catalog integrity** — standards/processes/positions frozen; 6G
   coverage sanity; thickness range formula.
2. **Welder lifecycle** — create, ID validation, upgrade semantics,
   deactivation (never delete).
3. **Certification lifecycle** — issue, supersede on re-issue,
   expiry-before-issue rejection.
4. **6-month continuity** — fresh + recent weld valid, stale continuity
   invalid, per-process isolation.
5. **Position coverage** — 6G universal, 2G does not cover 3G/4G.
6. **Material & thickness envelope** — mismatch and out-of-range fail.
7. **Expiry alerts** — sorted window, excludes negatives, also
   correlates with `checkValidity`.
8. **WPS + PQR store** — register, version upsert, back-link, reject
   unknown WPS reference.
9. **Certificate generator** — bilingual block contains Hebrew name,
   position code, QR payload, motto, signatures.
10. **Audit log** — every mutating action leaves a trail.

---

## 10. Integration hooks — ווים

- **Job dispatch** — the production-router (`routing-manager.js`) should
  call `checkValidity(welderId, process, position, {name, thicknessMm})`
  before committing a welder to a work order. If `valid === false`,
  block the assignment and raise a notification to the foreman.
- **QA dashboard** — the nightly cron should call
  `expiringCerts(30)` and push the result into the welding-shop
  dashboard (and into WhatsApp alerts via the existing
  `onyx-procurement/src/whatsapp` bridge).
- **PDF printer** — `generateCertificate(certId).textBlock` is
  designed to drop straight into the existing PDF printer at
  `onyx-procurement/src/printing`. The `meta.rtl = true` flag tells the
  printer to apply the RTL run for the Hebrew columns.
- **Audit trail UI** — `auditLog` is plain array of
  `{ts, action, payload}` and flows naturally into the existing
  audit-trail viewer described in `AG-98-audit-trail-ui.md`.

---

## 11. Never-delete guarantees — הבטחת אי-מחיקה

1. `createWelder` called twice with the same id: original name snapshot
   pushed into `history`, record upgraded in place.
2. `deactivateWelder`: flips `active:false`, keeps every field.
3. `issueCertification` on an existing (welder, standard, process,
   position): previous cert → `status:'superseded'`, linked via
   `supersededBy` / `supersededFromId`. Retrievable forever via
   `getCertification(id)`.
4. `weldingProcedureSpec` upsert: previous version snapshot pushed into
   the WPS's `history` array, `version` incremented.
5. `procedureQualificationRecord` upsert: same pattern.
6. `auditLog` is only ever `.push()`-ed to — there is no API to trim
   it. Callers who need retention rollover should snapshot the whole
   array, never delete entries.

---

## 12. Known limitations & future work

- **F-number / A-number grouping** (ASME IX QW-432 filler metals) is
  not yet modelled — `material` is a free-string. A future upgrade
  should expose a `fillerF` field and cross-check it against the cert.
- **Backing / no-backing** distinction (AWS D1.1 Table 4.11 footnote 3)
  is not yet modelled — a production weld on a no-backing joint
  currently passes if the cert was on a with-backing coupon. Needs a
  `backing: 'with'|'none'` field on both cert and query.
- **Diameter range** for pipe (ASME IX QW-452.3) is not yet modelled.
- **Essential variables** change detection for WPS re-qualification is
  not yet automated — currently, a human has to decide when a WPS needs
  a new PQR.
- **PDF byte encoding** is intentionally left to the downstream
  `onyx-procurement/src/printing` module so this file stays zero-dep.

All of the above are additive (new fields, new methods) — none require
deleting anything that already exists, so they fit the "upgrade & grow"
rule.

---

**End of report — AG-Y043.**
