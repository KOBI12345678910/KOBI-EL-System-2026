# AG-Y106 — Office Document Version Control (DocVC)
## דוח QA — בקרת גרסאות למסמכי משרד

**Agent:** Y-106 (Swarm: Office Docs)
**Run date / תאריך הרצה:** 2026-04-11
**Module under test / מודול:** `onyx-procurement/src/docs/doc-version-control.js`
**Test file / קובץ בדיקות:** `onyx-procurement/test/docs/doc-version-control.test.js`
**Command / פקודה:** `node --test test/docs/doc-version-control.test.js`
**Result / תוצאה:** **25/25 passed — PASS** (0 failures, 0 skipped, ~104 ms)

---

## 0. Scope boundary / תחום אחריות

### EN
DocVC handles **office documents only**: contracts, policies, procedures, marketing collateral, memos, and reports. It is strictly distinct from Y-045 engineering drawing VC (DWG/DXF/STEP/IGES) which uses a separate aerospace-style alpha-revision lifecycle. DocVC uses a simpler integer versioning scheme (v1, v2, v3 …) but layers on workflow features that drawings do not need: soft editing locks, approval chains, milestone tags, expiry tracking, full-text search, and bilingual watermark overlay specs.

### HE
המודול אחראי **אך ורק** למסמכי משרד: חוזים, מדיניות, נהלים, חומרי שיווק, מזכרים ודוחות. הוא מופרד במפורש ממודול שרטוטים הנדסיים Y-045 (DWG/DXF/STEP/IGES) שמשתמש במחזור גרסאות אלפא-ביתי בנוסח תעופתי. DocVC משתמש במספור פשוט של מספרים שלמים (v1, v2, v3 …) אך מוסיף יכולות תהליכיות שאינן נדרשות לשרטוטים: נעילה רכה, שרשרת אישורים, תגי אבני-דרך, מעקב תוקף, חיפוש מלא, ומפרט סימני מים דו-לשוניים.

---

## 1. Immutable rules / כללים קשיחים

| Rule | Enforcement in code | מיקום אכיפה |
|---|---|---|
| "לא מוחקים רק משדרגים ומגדלים" — never delete, only append | `checkIn` appends even if content is identical (`identicalToPrev:true`). `rollbackToVersion` creates a NEW version copying the target. `archiveDocument` flips status only. | `src/docs/doc-version-control.js` §2.4, §2.9, §2.15 |
| Zero external dependencies | `require('node:crypto')` is the only import. No npm packages. | §1 top of file |
| Hebrew RTL + bilingual labels | Every enum entry has `{id, he, en}`. Compound labels wrap Hebrew in U+202B…U+202C RTL embed marks via `_bilingualLabel()`. | §0, §1 helpers |
| In-memory only | `this.documents = new Map()` — no `fs` access. | constructor |

All four rules have automated coverage: identical-content append (test 07), rollback preserves intermediates (test 13), enums bilingual (test 25), map-backed storage (implicit across all tests).

---

## 2. Document lifecycle / מחזור חיים של מסמך

```
           upload                 checkIn                  checkIn
 (empty) ─────────▶   v1   ────────────────▶   v2   ──────────────▶   v3
                     │                          │                       │
                     │ tagVersion('draft')      │ approvalChain(...)    │
                     │ watermark(draft)         │                        │
                     ▼                          ▼                        ▼
                  status=active             tagVersion('approved')   tagVersion('published')
                                             │                         (requires all approvals)
                                             ▼
                                          rollbackToVersion(1)
                                                  ▼
                                              v4 = copy of v1
                                              (v2, v3 preserved forever)
```

### Stages / שלבים

| # | EN | HE |
|---|---|---|
| 1 | `uploadDocument` creates v1 with SHA-256 checksum, auto-tags `draft`, status=`active`. | יוצר v1 עם סכום ביקורת SHA-256, מתייג אוטומטית `draft`, סטטוס `active`. |
| 2 | Authors optionally `checkOut` → soft lock. | עורכים יכולים לנעול לעריכה (`checkOut`). |
| 3 | `checkIn` appends a new version. Auto-releases lock if the same author holds it. Stores signed `diffSize`. | `checkIn` מוסיף גרסה חדשה, משחרר נעילה של אותו משתמש, שומר `diffSize` חתום. |
| 4 | `approvalChain` defines required signers (role + userId). Each signoff is appended to `rev.approvals[]` (never unapprove). | `approvalChain` מגדיר את שרשרת האישורים. כל אישור נוסף ל־`rev.approvals[]` (אין ביטול). |
| 5 | `tagVersion(v, 'published')` validates every required approver signed that specific version. | `tagVersion` לגרסה `published` מאמת שכל המאשרים הנדרשים חתמו על אותה גרסה. |
| 6 | `rollbackToVersion(n)` copies the target rev into a brand-new higher-numbered version. Intermediate revisions stay. | `rollbackToVersion(n)` מעתיק את הגרסה לגרסה חדשה. כל הגרסאות הביניים נשמרות. |
| 7 | `archiveDocument(reason)` flips status → `archived`. Versions remain retrievable. | `archiveDocument` הופך סטטוס ל`archived`. הגרסאות נשארות נגישות. |
| 8 | `legal_hold` tag flips status → `legal_hold`; blocks checkout and archive. | תיוג `legal_hold` מקפיא את המסמך: חוסם נעילה וארכיון. |

---

## 3. Lock semantics / סמנטיקת נעילה

### EN
The lock is a **soft lock** — advisory, not kernel-level. It is held per docId (not per version) because office documents are typically edited whole, not per-chunk.

| Operation | Unlocked | Held by me | Held by other | Notes |
|---|---|---|---|---|
| `checkOut` | acquires lock | refresh timestamp (idempotent) | `LOCK_CONFLICT` — needs `{override:true}` | Override audits previous holder. |
| `checkIn` | allowed | allowed, auto-releases | **rejected** unless override was used | Holder-only write policy. |
| `releaseLock` | noop (`released:false`) | released | rejected | Caller must be holder. |
| `checkOut` while `legal_hold` | rejected | rejected | rejected | Status gate supersedes lock state. |

Lock override is a loud audit event (`AUDIT_ACTIONS.override`) capturing previous holder, since-timestamp, and reason string. Covered by tests 08–11 and 24.

### HE
הנעילה **רכה** (מייעצת, לא כופה ברמת מערכת ההפעלה). מוחזקת לפי `docId` ולא לפי גרסה, כי מסמכי משרד נערכים כיחידה שלמה.

| פעולה | לא נעול | מחזיק אני | מחזיק אחר | הערות |
|---|---|---|---|---|
| `checkOut` | משיג נעילה | רענון חותמת זמן (אידמפוטנטי) | `LOCK_CONFLICT` — דורש `{override:true}` | הדריסה נרשמת בלוג. |
| `checkIn` | מותר | מותר, משחרר אוטומטית | **נדחה** אלא אם נעשתה דריסה | מדיניות כותב-יחיד. |
| `releaseLock` | no-op | משחרר | נדחה | רק המחזיק יכול לשחרר. |
| `checkOut` תחת `legal_hold` | נדחה | נדחה | נדחה | סטטוס קובע מעל נעילה. |

---

## 4. Approval workflow / תהליך אישורים

### EN
Approvals are **append-only** (never unapprove). The chain is defined once via `approvalChain(docId, [{role, userId}, ...])` and may later be extended (call again with a larger array — old definitions are overwritten atomically but the per-version `approvals[]` arrays never shrink).

To sign off: `approvalChain(docId, null, { approve: { version, role, userId, comment } })`. Every signoff is appended to `rev.approvals[]` with server-clock timestamp.

The `tagVersion(v, 'published')` call enforces the chain: it verifies that every `(role, userId)` pair in `record.approvalChain.required` has at least one entry in `rev.approvals[]` for that specific version. If any are missing, the call throws with `err.code === 'APPROVAL_INCOMPLETE'` and `err.missing` listing the unmet approvers. Covered by tests 14, 15, 16.

### HE
אישורים הם **רק תוספתיים** (אין "ביטול אישור"). השרשרת מוגדרת פעם אחת דרך `approvalChain(docId, [...])` וניתן להרחיב אותה מאוחר יותר.

לחתימה: `approvalChain(docId, null, { approve: { version, role, userId, comment } })`. כל חתימה נרשמת ל־`rev.approvals[]` עם חותמת זמן שרת.

קריאת `tagVersion(v, 'published')` אוכפת את השרשרת: מאמתת שכל זוג `(role, userId)` שנדרש חתם על הגרסה הספציפית. אם חסר חותם, נזרק שגיאה עם קוד `APPROVAL_INCOMPLETE` ורשימת החסרים ב־`err.missing`. מכוסה על ידי בדיקות 14, 15, 16.

### Workflow diagram / תרשים זרימה

```
   define chain        partial sign        full sign           publish
 ──────────────▶    ──────────────▶    ──────────────▶    ──────────────▶
  approvalChain(       approve(legal)     approve(finance)    tagVersion(
   required:[legal,    approve(finance?)   approve(ceo)        v, 'published')
   finance,ceo])      → still blocked    → all present       → OK; otherwise
                         from publish        APPROVAL_          APPROVAL_
                                             COMPLETE           INCOMPLETE
```

---

## 5. Hebrew glossary / מילון מונחים

| EN | HE | Notes |
|---|---|---|
| Document | מסמך | generic office doc |
| Version | גרסה | integer v1, v2, v3 … |
| Revision | רוויזיה / מהדורה | alias for version in office context |
| Checksum | סכום ביקורת | SHA-256, 64 hex chars |
| Check-out (lock) | נעילה לעריכה | soft lock |
| Check-in | החזרה / הגשת גרסה | append new version |
| Release lock | שחרור נעילה | by holder only |
| Lock override | דריסת נעילה | audited; requires reason |
| Approval | אישור | append-only |
| Approval chain | שרשרת אישורים | required `[{role, userId}]` |
| Role — legal | תפקיד — משפטי / יועץ משפטי | |
| Role — finance | תפקיד — כספים | |
| Role — CEO | תפקיד — מנכ"ל | |
| Tag | תג | draft / in-review / approved / published / legal-hold / rollback |
| Milestone | אבן דרך | tagged version |
| Draft | טיוטה | initial state |
| Approved | מאושר | passed approvals |
| Published | פורסם | customer/public release |
| Legal hold | הקפאה משפטית | blocks edits and archive |
| Rollback | שחזור גרסה | creates NEW version copying target |
| Archive | ארכיון | status flip, no deletion |
| Expiry | תוקף / תפוגה | for contracts & policies |
| Review date | תאריך סקירה | periodic policy review |
| Watermark | סימן מים | overlay spec (not rendered) |
| Audit trail | יומן ביקורת | immutable append-only log |
| Full-text search | חיפוש טקסט מלא | uses injected extractor callback |
| Text extractor | מחלץ טקסט | callback `(buf, mime) → string` |
| Contract | חוזה | |
| Policy | מדיניות | |
| Procedure | נוהל עבודה | |
| Marketing | חומר שיווקי | |
| Memo | מזכר | |
| Report | דוח | |

---

## 6. Test matrix / מטריצת בדיקות

| # | Name | EN intent | HE כוונה |
|---|---|---|---|
| 01 | uploadDocument creates v1 | SHA-256 64 hex + draft tag + active status | יצירת v1 תקינה |
| 02 | reject unknown docType | validates enum | דחיית סוג לא מוכר |
| 03 | reject missing title_he | required field check | דחיית שדה חסר |
| 04 | getDocument latest/specific | version routing | קריאה לגרסה אחרונה / ספציפית |
| 05 | listVersions history | full chain w/ checksums | היסטוריית גרסאות |
| 06 | checkIn diffSize | signed delta | חישוב דלתא |
| 07 | identical content appends | append-only law | מימוש "לא מוחקים" |
| 08 | checkOut conflict | LOCK_CONFLICT code | קונפליקט נעילה |
| 09 | override audits holder | loud audit | דריסה מתועדת |
| 10 | releaseLock ownership | only holder releases | שחרור על ידי המחזיק |
| 11 | checkIn auto-release | same-author flow | שחרור אוטומטי בהחזרה |
| 12 | compareVersions | size + tags + checksum diff | השוואת גרסאות |
| 13 | rollback preserves all | v1..v4 all present | שחזור ללא מחיקה |
| 14 | publish w/o chain | throws clearly | פרסום ללא שרשרת |
| 15 | partial approval blocks | APPROVAL_INCOMPLETE | אישור חלקי חוסם |
| 16 | full approval publishes | chain satisfied | פרסום לאחר אישור מלא |
| 17 | searchByContent w/ extractor | OCR-style callback | חיפוש עם מחלץ |
| 18 | searchByContent fallback | utf-8 default | חיפוש בסיסי |
| 19 | watermark bilingual overlay | no rendering | סימן מים דו-לשוני |
| 20 | auditTrail immutable copy | caller cannot mutate | לוג חסין לשינוי |
| 21 | expiryTracking states | expiring-soon / expired | מעקב תוקף |
| 22 | archive status + legal-hold block | two paths | ארכיון + חסימה |
| 23 | all six doc types | full enum coverage | כל ששת סוגי המסמכים |
| 24 | legal-hold blocks checkOut | status gate | הקפאה חוסמת נעילה |
| 25 | enums bilingual sanity | every entry has he+en | תוויות דו-לשוניות |

All 25 tests pass.

---

## 7. Manual walk-through / הדגמה ידנית

```js
const { DocumentVC } = require('./src/docs/doc-version-control.js');
const vc = new DocumentVC();

// 1. Upload a contract
const { docId } = vc.uploadDocument({
  docType: 'contract',
  title_he: 'חוזה אספקה ספק A',
  title_en: 'Supply contract vendor A',
  fileBuffer: Buffer.from('NET-30, 12 months'),
  mimeType: 'application/pdf',
  author: 'ronen@legal',
  tags: ['supply'],
  department: 'Legal',
});

// 2. Lock, revise, check in
vc.checkOut(docId, 'ronen@legal');
vc.checkIn(docId, {
  fileBuffer: Buffer.from('NET-45, 18 months, penalty added'),
  author: 'ronen@legal',
  comment: 'renegotiated terms',
});

// 3. Approval chain
vc.approvalChain(docId, [
  { role: 'legal',   userId: 'ronen' },
  { role: 'finance', userId: 'dana'  },
  { role: 'ceo',     userId: 'uzi'   },
]);
for (const a of ['ronen', 'dana', 'uzi']) {
  vc.approvalChain(docId, null, {
    approve: { version: 2, role: { ronen:'legal', dana:'finance', uzi:'ceo' }[a], userId: a },
  });
}

// 4. Publish
vc.tagVersion(docId, 2, 'published');

// 5. Later — someone uploaded garbage as v3; roll back
vc.checkIn(docId, { fileBuffer: Buffer.from('BAD'), author: 'intern' });
vc.rollbackToVersion(docId, 2, 'cto');  // creates v4 = copy of v2

// 6. Expiry watch
vc.expiryTracking(docId, {
  set: { expiryDate: '2027-04-11', reviewDate: '2027-01-11', reviewer: 'ronen' },
});

// 7. Archive old, legal-hold the sensitive ones
vc.archiveDocument(docId, 'superseded by master agreement');
```

---

## 8. Risks, gaps, and follow-ups / סיכונים, פערים, המשך

| Item | EN | HE |
|---|---|---|
| PDF/DOCX parsing | Module intentionally NOT a parser. Integration owner must inject a `textExtractor` callback backed by e.g. `pdf.js` or `mammoth` when wiring the UI. | המודול אינו מנתח PDF/DOCX. המשלב חייב להזריק `textExtractor` משלו. |
| Binary storage | In-memory base64. For production, swap `_bufferBase64` for a storage adapter (S3 / Supabase Storage). Contract stays the same. | שמירה בזיכרון בלבד. בייצור יש להחליף ל־storage adapter; ה־API לא משתנה. |
| Concurrency | Single-process. Multi-instance deployments need Redis-backed locks. | יחיד-מופע. פריסה רב-מופעית דורשת נעילה מבוזרת (Redis). |
| No diff rendering | `compareVersions` returns size/metadata only, not inline text diffs. Can be added later via an injected diff callback. | `compareVersions` מחזיר דלתא מטא-דאטה; השוואת טקסט פנימי תושג בעתיד. |
| Retention law | Israeli contract retention (7 years) is the caller's responsibility — DocVC never deletes so compliance is a soft top-up. | שימור לפי דין (7 שנים) — באחריות הקורא; המודול לא מוחק בכלל. |

---

## 9. Sign-off / אישור מסירה

| Item | Status |
|---|---|
| Source file created | `onyx-procurement/src/docs/doc-version-control.js` — 700 LOC, zero deps beyond `node:crypto` |
| Test file created | `onyx-procurement/test/docs/doc-version-control.test.js` — 25 tests |
| Test run | `node --test test/docs/doc-version-control.test.js` → **25 pass / 0 fail** |
| Charter rule 1 — never delete | enforced + tested (tests 07, 13, 22) |
| Charter rule 2 — zero external deps | enforced (`node:crypto` only) |
| Charter rule 3 — Hebrew RTL + bilingual | enforced + tested (test 25) |
| QA report | this file (`_qa-reports/AG-Y106-doc-version-control.md`) |

**Agent Y-106 — delivery complete / מסירה הושלמה.**
