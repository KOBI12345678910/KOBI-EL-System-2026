# AG-Y074 — Employee Handbook Manager

**Agent:** Y-074
**Module:** `onyx-procurement/src/hr/handbook.js`
**Tests:** `onyx-procurement/test/hr/handbook.test.js`
**Swarm:** HR / Techno-Kol Uzi Mega-ERP 2026
**Status:** GREEN — 30/30 tests passing, 0 deps, bilingual
**Invariant:** לא מוחקים רק משדרגים ומגדלים (never delete — only upgrade and grow)

---

## 1. Purpose

Versioned, bilingual (Hebrew/English) employee-handbook manager with full
acknowledgment tracking, legal-compliance gate, diffing, searching, policy
linking, reminder rendering, and zero-dependency Hebrew-RTL PDF generation.

Every operation is append-only: publishing a new version marks the prior
version `SUPERSEDED` but keeps it in the store forever. Acknowledgments
and reminders are event logs — they cannot be removed, only added.

## 2. Exported API

| Member | Kind | Purpose |
|---|---|---|
| `EmployeeHandbook` | class | primary manager |
| `ACK_METHODS` | `['signature','click','biometric']` | allowed ack methods |
| `VERSION_STATUS` | `{DRAFT,PUBLISHED,SUPERSEDED}` | lifecycle enum |
| `REQUIRED_ISRAELI_SECTIONS` | array | mandatory-content matchers |
| `SEED_SECTIONS` | array | 17 bilingual seed sections |

### Instance methods

| Method | Contract |
|---|---|
| `createVersion({id, version, effectiveDate, sections, title_he, title_en})` | append a draft; falls back to seed sections if none supplied; throws on duplicate id against non-draft (never-delete guard) |
| `publishVersion(versionId)` | draft → published; supersedes previous active version; idempotent when called on an already-published version |
| `getActiveVersion()` / `getVersion(id)` / `listVersions()` | full history readers (all cloned) |
| `acknowledgeReceipt({employeeId, versionId, date, method, metadata})` | appends to ack log; enforces allowed methods and known version |
| `listAcknowledgments(versionId?)` | snapshot of ack log |
| `missingAcks(versionId?, allEmployeeIds?)` | gap report; defaults to active version and ack-log population |
| `diffVersions(v1, v2)` | `{added, removed, changed, unchanged, summary}` |
| `legalComplianceCheck(versionId?)` | Israeli required-sections gate |
| `searchHandbook(query, language, versionId?)` | Hebrew/English/`'both'`; nikud-insensitive |
| `linkToPolicy({section, policyId})` | cumulative idempotent linkage |
| `getPolicyLinks(sectionId)` | policyIds attached to a section |
| `sendAckReminder(employeeIds, versionId?)` | bilingual reminder objects + log append |
| `listReminders()` | full reminder log |
| `generatePDF(versionId?)` | zero-dep PDF 1.4 `{filename,mimeType,bytes,pageCount,direction:'rtl'}` |

### Static helpers

- `EmployeeHandbook.seedSections()` — fresh clone of the 17 bilingual seeds
- `EmployeeHandbook.requiredIsraeliSections()` — mandatory sections + law citations
- `EmployeeHandbook.ackMethods()` — `['signature','click','biometric']`

## 3. Required Israeli Sections (legal gate)

The `legalComplianceCheck` method verifies the version contains sections
matching all of the following keys. Each key lists its statutory basis and
the Hebrew/English matchers used for detection.

| Key | Hebrew | English | Statute |
|---|---|---|---|
| `harassment` | הטרדה מינית | Sexual harassment prevention | חוק למניעת הטרדה מינית, התשנ"ח-1998 |
| `safety` | בטיחות בעבודה | Occupational safety | חוק ארגון הפיקוח על העבודה, התשי"ד-1954 |
| `equal_opportunity` | שוויון הזדמנויות | Equal employment opportunity | חוק שוויון ההזדמנויות בעבודה, התשמ"ח-1988 |
| `hours` | שעות עבודה ומנוחה | Working hours and rest | חוק שעות עבודה ומנוחה, התשי"א-1951 |
| `wages` | שכר ותשלומים | Wages and payments | חוק הגנת השכר, התשי"ח-1958 |
| `leave` | חופשות | Leave policies | חוק חופשה שנתית, התשי"א-1951 |
| `privacy` | הגנת הפרטיות | Privacy protection | חוק הגנת הפרטיות, התשמ"א-1981 |

**Matching is accent/nikud-insensitive** — sections qualify by any of their
Hebrew or English matchers appearing in `id`, `title_he`, `title_en`,
`content_he`, or `content_en`.

## 4. Seeded Sections (17)

1. ברוכים הבאים / Welcome
2. שעות עבודה והפסקות / Working hours and breaks
3. שכר ותשלומים / Wages and payments
4. חופשות, ימי מחלה וימי חג / Vacation, sick days and holidays
5. ביטוחים (ביטוח לאומי, בריאות, פנסיה, קרן השתלמות) / Insurance (BL, health, pension, study fund)
6. מניעת הטרדה מינית / Sexual harassment prevention
7. בטיחות בעבודה / Occupational safety
8. שימוש במחשב ודואר אלקטרוני / Computer and email usage
9. אתיקה מקצועית / Professional ethics
10. סודיות / Confidentiality
11. מדיניות שעות נוספות / Overtime policy
12. חופשה במקרה משפחה / Family leave
13. נסיעות ואש"ל / Travel and per-diem
14. הגנת הפרטיות / Privacy protection
15. קוד לבוש / Dress code
16. שוויון הזדמנויות ואיסור הפליה / Equal opportunity and non-discrimination
17. תלונות ופתרון סכסוכים / Complaints and dispute resolution

Every seed section is bilingual and carries the relevant Israeli statutes in
`legal_references` where applicable.

## 5. Acknowledgment Methods

| Method | Hebrew | Use case | Evidentiary strength |
|---|---|---|---|
| `signature` | חתימה | wet-signature or qualified e-signature scan | highest — stored with metadata and timestamp |
| `click` | אישור לחיצה | portal checkbox + button | medium — captured alongside session metadata |
| `biometric` | אישור ביומטרי | fingerprint / facial scan at a kiosk | high — bound to enrolled employee identity |

All methods produce an immutable ack record with `employeeId`, `versionId`,
`date`, `method`, `metadata`, and `recordedAt`. Records are append-only.
Re-acknowledging produces a second row — history is never rewritten.

## 6. Version Lifecycle & Never-Delete Invariant

```
DRAFT  ─ publishVersion ─▶  PUBLISHED  ─ (next publish) ─▶  SUPERSEDED
                                                   ▲
                                                   └── remains queryable forever
```

- `createVersion` refuses to reuse a non-draft id — upgrade by bumping the
  version id and the human `version` label instead.
- `publishVersion` on a SUPERSEDED or already-active record is handled
  gracefully: idempotent for PUBLISHED, rejected for SUPERSEDED.
- No method in the class can physically remove a version, ack, reminder,
  or policy link. Every mutation is an append.

## 7. Hebrew Glossary

| Hebrew | Translit | English |
|---|---|---|
| מדריך העובד | madrikh ha-oved | Employee handbook |
| גרסה | girsa | Version |
| פרסום | pirsum | Publication |
| אישור קבלה | ishur kabbala | Acknowledgment of receipt |
| חתימה | khatima | Signature |
| אישור לחיצה | ishur lekhitza | Click acknowledgment |
| אישור ביומטרי | ishur biometri | Biometric acknowledgment |
| הטרדה מינית | hatrada minit | Sexual harassment |
| בטיחות בעבודה | betikhut ba-avoda | Workplace safety |
| שוויון הזדמנויות | shivyon hizdamnuyot | Equal opportunity |
| הפליה אסורה | haflaya asura | Prohibited discrimination |
| סודיות | sodiyut | Confidentiality |
| ניגוד עניינים | nigud inyanim | Conflict of interest |
| שעות נוספות | sha'ot nosafot | Overtime |
| חופשה שנתית | khufsha shnatit | Annual vacation |
| ימי מחלה | yemei makhla | Sick days |
| חופשת לידה | khufsat leida | Maternity leave |
| מילואים | miluim | Reserve duty |
| פיצויי פיטורים | pitzuyei piturim | Severance pay |
| קרן השתלמות | keren hishtalmut | Study fund |
| פנסיה | pensia | Pension |
| ביטוח לאומי | bituakh le'umi | National Insurance |
| הגנת הפרטיות | haganat ha-pratiyut | Privacy protection |
| תלונה | tluna | Complaint |
| ממונה | memune | Designated officer |
| תזכורת | tizkoret | Reminder |
| מדיניות | mediniyut | Policy |
| הסכם קיבוצי | heskem kibutzi | Collective agreement |
| צו הרחבה | tzav harkhava | Extension order |

## 8. Test Coverage

`test/hr/handbook.test.js` — 30 tests, 10 suites, all passing.

```
createVersion                                  4 tests
publishVersion                                 4 tests
acknowledgeReceipt / missingAcks               5 tests
diffVersions                                   2 tests
legalComplianceCheck                           2 tests
searchHandbook                                 4 tests
linkToPolicy                                   2 tests
sendAckReminder                                2 tests
generatePDF                                    2 tests
static helpers                                 3 tests
```

Run: `node --test test/hr/handbook.test.js`

### Key regression cases

- **Never-delete:** `createVersion` rejects reuse of a published id; the
  prior record remains queryable via `getVersion`.
- **Supersession chain:** publishing v2 flips v1 to `SUPERSEDED` with
  `supersededBy='v2'` and a timestamp; v1 is still retrievable.
- **Nikud tolerance:** `searchHandbook('שלום')` matches `שָׁלוֹם` after
  stripping the cantillation block `\u0591–\u05C7`.
- **Legal gate:** seeded version is compliant; a minimal single-section
  version correctly reports `{harassment, safety, equal_opportunity, ...}` missing.
- **Diff:** detects added, removed, and `content_he`-changed sections.
- **PDF:** output starts with `%PDF-` and ends with `%%EOF`, `pageCount >= 1`,
  `direction === 'rtl'`, `mimeType === 'application/pdf'`.

## 9. Dependencies

**Zero.** Pure Node.js standard library (`node:test`, `node:assert/strict`).
No `pdfkit`, no `pdfmake`, no `html-pdf`, no framework. The PDF writer hand-
assembles a minimal PDF 1.4 document via string concatenation and a manual
xref table.

## 10. Files Touched

- `onyx-procurement/src/hr/handbook.js` — new module (~700 lines)
- `onyx-procurement/test/hr/handbook.test.js` — new test suite (30 tests)
- `_qa-reports/AG-Y074-handbook.md` — this report

## 11. Future Upgrades (all additive per house rule)

- Proper Hebrew shaping for the PDF writer (embed a UTF-8 font + bidi run).
- HTML/Markdown export alongside PDF.
- Per-section ack — currently ack is at version granularity.
- Version rollback as a *forward operation*: publish a new version whose
  sections mirror an earlier record (never mutate the SUPERSEDED record).
- SMS/email bridge for `sendAckReminder` — today it returns rendered
  objects for an upstream transport to dispatch.
