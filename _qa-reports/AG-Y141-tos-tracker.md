# AG-Y141 — Terms of Service Acceptance Tracker

**Agent:** Y-141
**Date:** 2026-04-11
**Scope:** TOS version lifecycle + acceptance tracking for Techno-Kol Uzi mega-ERP.
**Laws honoured:** חוק הגנת הצרכן, התשמ"א-1981 / חוק החוזים האחידים, התשמ"ג-1982 / חוק הגנת הפרטיות (תיקון 13 / 2024) / חוק המחשבים, התשנ"ה-1995.
**Status:** Delivered — **22 / 22** tests passing via `node --test`.

---

## 1. Summary / תקציר

**EN —** Delivered a zero-dependency (`node:crypto` only), Hebrew-first (RTL) Terms of Service acceptance tracker. `TOSTracker` publishes TOS versions append-only, records user acceptances with method-strength enforcement (click / signed / browse), computes per-user acceptance status against the current required version, supports bulk re-acceptance campaigns with written justification, produces a line-level bilingual diff between any two versions, generates a self-contained XSS-safe RTL modal for in-product display, emits a DSR-ready packet that plugs into Y-136, and gates downstream business actions when a user has not accepted the current required version. Every mutation is appended to a SHA-256-chained audit trail with tamper detection.

**HE —** מסופק מודול חסר-תלויות חיצוניות (`node:crypto` בלבד), עברית-ראשונה (RTL), למעקב אחר קבלת תנאי השימוש. המחלקה `TOSTracker` מפרסמת גרסאות בצורת הוסף-בלבד, רושמת קבלות משתמש תוך אכיפת עוצמת שיטת ההסכמה (לחיצה / חתימה / גלישה), מחשבת סטטוס קבלה מול הגרסה הנוכחית, תומכת בקמפיינים של קבלה מחודשת עם נימוק בכתב (חוק החוזים האחידים), מפיקה השוואת שורות דו-לשונית בין כל שתי גרסאות, מייצרת מודל RTL עצמאי ומוגן XSS, מנפקת מעטפת DSR שמתממשקת ל-Y-136, וחוסמת פעולות עסקיות כאשר המשתמש לא קיבל את הגרסה המעודכנת. כל פעולת שינוי מתווספת ליומן ביקורת חתום SHA-256 עם זיהוי שיבוש.

---

## 2. Files Delivered / קבצים שנמסרו

| File | Lines | Purpose |
|---|---:|---|
| `onyx-procurement/src/privacy/tos-tracker.js` | ~990 | `TOSTracker` class + constants + helpers |
| `onyx-procurement/test/privacy/tos-tracker.test.js` | ~500 | 22 unit tests via `node --test` |
| `_qa-reports/AG-Y141-tos-tracker.md` | this file | QA report |

Run: `node --test test/privacy/tos-tracker.test.js`

Result: **22 pass / 0 fail** (see §9).

---

## 3. Public API / API ציבורי

| Method | Purpose (EN) | Purpose (HE) | Append-only? |
|---|---|---|:---:|
| `publishVersion({...})` | Publish new TOS version | פרסום גרסה חדשה | yes |
| `recordAcceptance({...})` | Record user acceptance | רישום קבלה | yes |
| `checkAcceptance(userId)` | Latest accepted vs. required | השוואה מול הגרסה הנוכחית | — |
| `bulkRequireReacceptance(vid, {...})` | Mass re-accept campaign | קמפיין קבלה מחודשת | yes |
| `lastAcceptedVersion(userId)` | Query latest acceptance | שאילתה | — |
| `listNonAccepters(versionId?)` | Users who haven't accepted | משתמשים לא מעודכנים | — |
| `generateAcceptanceLog(period)` | Audit export per period | ייצוא יומן | — |
| `diffVersions(v1, v2)` | Bilingual line diff | השוואת שורות | — |
| `generateAcceptanceUI({...})` | Self-contained RTL modal HTML | מודל HTML עצמאי RTL | — |
| `exportForDSR(userId)` | Y-136 DSR packet | מעטפת DSR | — |
| `enforceGating({userId, action})` | Block non-accepting users | חסימת משתמשים | — |
| `currentVersion()` | Latest required version | הגרסה הנוכחית | — |
| `listVersions()` | Full version ledger | רשימת גרסאות | — |
| `registerGatedAction(action)` | Extend gated action set | הרחבת פעולות חסומות | — |
| `verifyChain()` | Tamper detection | זיהוי שיבוש | — |
| `auditLog()` | Raw audit chain | שרשרת ביקורת גולמית | — |

All records returned from the API are `Object.freeze`-d (deeply). Attempting to mutate them throws in strict mode (covered by test 01).

---

## 4. Acceptance Methods / שיטות קבלה

| Key | Hebrew | English | Evidentiary weight | Permitted for material version? |
|---|---|---|:---:|:---:|
| `click` | לחיצה על "אני מסכים" | Click-wrap | 2 | yes |
| `signed` | חתימה אלקטרונית | Electronic signature | 3 (strongest) | yes |
| `browse` | הסכמה על-ידי גלישה | Browse-wrap | 1 (weakest) | **no** — rejected at `recordAcceptance` |

**Rationale.** חוק החוזים האחידים סעיף 4 creates a rebuttable presumption that unilateral modification clauses are unfair. Browse-wrap cannot carry the evidentiary burden for a material change — the user may not have seen the new text at all. `recordAcceptance` therefore throws a `Error` with the citation embedded when a caller attempts `method: 'browse'` against a version whose `requiresReacceptance: true` flag is set. The other two methods pass unchanged.

PII (IP + user agent) is stored twice: plaintext for forensic replay AND as a SHA-256 hash (`ipHash`, `userAgentHash`) for the DSR export path — §6 confirms the plaintext IP never leaves the tracker via `exportForDSR`.

---

## 5. Version Lifecycle / מחזור חיי גרסה

```
        ┌─────────────┐
 call → │ publishV.   │ → PUBLISH record appended (immutable) ─┐
        └─────────────┘                                         │
                                                                │
        ┌─────────────┐                                         │
 call → │ recordAccept│ → ACCEPT record appended (immutable) ←──┤
        └─────────────┘                                         │
                                                                │
        ┌─────────────┐                                         │
 call → │ bulkRequire │ → REREQUIRE record appended ────────────┤
        └─────────────┘                                         │
                                                                ▼
                                                       ┌─────────────────┐
                                                       │ append-only     │
                                                       │   _ledger       │
                                                       │ + SHA-256 audit │
                                                       └─────────────────┘
```

Key invariants:

1. **Publishing is additive.** Duplicate `versionId` throws — we never overwrite.
2. **Acceptance is additive.** Each acceptance is a new record; re-accepting after a new version creates a second record without touching the first.
3. **Bulk re-require is additive.** `_rerequired` is an effective-date pointer; it does NOT mutate any acceptance record. Users whose last acceptance predates the effective date flip to `rerequired` via the computed status in `checkAcceptance`.
4. **Deletion is impossible.** No API surface removes from `_versions`, `_ledger`, `_acceptancesByUser`, `_acceptancesByVersion`, or `_audit`.

This is the `"לא מוחקים רק משדרגים ומגדלים"` invariant: historical acceptance of v1.0 remains queryable forever, which is exactly the chain-of-custody that חוק המחשבים §10 (electronic evidence) wants you to be able to produce.

---

## 6. Israeli Consumer Law Compliance / ציות לחוקי צרכנות

### 6.1 חוק הגנת הצרכן, התשמ"א-1981

* **סעיף 2 — איסור הטעיה.** The tracker requires both `content_he` and `content_en` at publication time (test 03). A single-language publication is rejected. The bilingual modal generated by `generateAcceptanceUI` always shows both languages when `lang: 'both'` — the user cannot be "informed only in a language they don't speak".
* **סעיף 14ג — זכות ביטול עסקה.** Not directly implemented (that belongs to the order module), but the acceptance log (`generateAcceptanceLog`) is the upstream evidence any consumer would need to prove they did or did not accept the amended terms at the time of the transaction.

### 6.2 חוק החוזים האחידים, התשמ"ג-1982

* **סעיף 3 — בית הדין לחוזים אחידים.** The tracker's `lawCitations` array on every `PUBLISH` record embeds this section; the modal's `legalFooter` displays it to the user at acceptance time.
* **סעיף 4 — חזקות תניות מקפחות.** The statute presumes a unilateral-modification clause is unfair. The tracker neutralises that presumption in three ways:
  1. `requiresReacceptance: true` forces a new explicit acceptance (not a silent browse).
  2. `bulkRequireReacceptance` REQUIRES a written `reason` string — calling it without one throws a `Error` citing the section (test 13).
  3. Browse-wrap is rejected on material versions (test 06).

### 6.3 חוק הגנת הפרטיות (תיקון 13 / 2024)

* **סעיף 11 — הסכמה מדעת.** The tracker's acceptance record contains the full `content_he` / `content_en` hash at the moment of acceptance. An audit can prove exactly what text the user saw by comparing `a.versionHash` against `v.payloadHash`.
* **סעיף 13 — זכות עיון.** `exportForDSR(userId)` returns a bilingual packet that Y-136 DSR-handler plugs directly into a right-of-access response. The packet is `Object.freeze`-d and includes `titleLabels`, `citations`, `counts`, `versions`, and `acceptances` — one step away from a printable letter.
* **סעיף 13א — זכות לחזרה מהסכמה.** A user's decline is implicit: if the latest record is an old version and `requiresReacceptance: true`, the status flips to `stale` and gated actions block. No hard delete is needed — the original acceptance stays in the ledger forever and `exportForDSR` shows the full chronology.

### 6.4 חוק המחשבים, התשנ"ה-1995

* The audit trail is a SHA-256 hash chain: every event links to the previous via `prevHash = sha256(prev.hash)` and has its own `hash = sha256(seq|event|payloadHash|prevHash)`. `verifyChain()` recomputes the chain deterministically; any swap of an event (test 22) is detected in O(n). This is the electronic-evidence shape that courts have accepted under §10 (computer records admissible when chain-of-custody is preserved).

---

## 7. Hebrew Glossary / מילון עברית-אנגלית

| HE | EN | Notes |
|---|---|---|
| תנאי שימוש | Terms of Service (TOS) | The document itself |
| קבלה / אישור | Acceptance | A user's "I agree" click / signature |
| פרסום גרסה | Publish version | Adding a new TOS to the ledger |
| קבלה מחודשת | Re-acceptance | Required after a material change |
| נימוק בכתב | Written justification | Required by חוק החוזים האחידים סעיף 4 |
| חתימה אלקטרונית | Electronic signature | Strongest method |
| לחיצה על "אני מסכים" | Click-wrap | Standard method |
| הסכמה על-ידי גלישה | Browse-wrap | Weakest; rejected for material changes |
| הסכם אחיד | Standard (adhesion) contract | The legal category TOS falls under |
| תניה מקפחת | Unfair term / abusive clause | Void under חוק החוזים האחידים |
| הגנת הפרטיות | Privacy Protection | תיקון 13 framework |
| בקשת נושא מידע | Data Subject Request (DSR) | Exported via `exportForDSR` |
| שרשרת ביקורת | Audit chain | SHA-256 hash chain |
| יומן אירועים | Event log | Append-only ledger |
| זיהוי שיבוש | Tamper detection | `verifyChain()` |
| חסימת פעולה | Action gating | `enforceGating({...})` |
| יומן קבלות | Acceptance log | `generateAcceptanceLog(period)` |
| השוואת גרסאות | Version diff | `diffVersions(v1, v2)` |
| נושא מידע | Data subject | The user under PDPL |
| ממונה הגנה על מידע | Data Protection Officer (DPO) | Escalation target for Y-136 |

---

## 8. Integration with Y-136 (DSR Handler) / אינטגרציה עם Y-136

`exportForDSR(userId)` returns a packet with the same shape used by `consent-mgmt.js#exportSubjectConsents`:

```js
{
  subjectId,         // plaintext userId for the response letter
  subjectHash,       // sha256(userId) for hashed audit
  exportedAt,        // ISO-8601
  titleLabels: { he, en },
  citations: [
    'חוק הגנת הפרטיות תיקון 13 סעיף 13 (זכות עיון)',
    'חוק המחשבים, התשנ"ה-1995',
    'חוק הגנת הצרכן, התשמ"א-1981, סעיף 2',
  ],
  currentRequired: { versionId, effectiveDate },
  status: { status, current, acceptedVersionId, acceptedAt, reason },
  counts: { total, uniqueVersions },
  versions: [{ versionId, effectiveDate, contentHash_he, contentHash_en, requiresReacceptance }],
  acceptances: [{ recordId, versionId, method, methodLabels, ipHash, userAgentHash, timestamp }],
}
```

**PII minimisation.** Test 21 asserts that the packet contains only `ipHash` (SHA-256 hex) and never the plaintext IP. Likewise for `userAgentHash`. A DSR letter can show the user "we have N acceptance records and the IPs are hashed" without leaking infrastructure detail to a malicious subject.

Y-136's `processAccessRequest` can call `tosTracker.exportForDSR(userId)` inside its source-registry and fold the result into the bilingual export — no adapter needed.

---

## 9. Test Coverage / כיסוי בדיקות

Run: `node --test test/privacy/tos-tracker.test.js`

```
✔ 01 publishVersion — creates immutable frozen record
✔ 02 publishVersion — rejects duplicate versionId (append-only)
✔ 03 publishVersion — requires bilingual content_he + content_en
✔ 04 recordAcceptance — click method creates ACCEPT record
✔ 05 recordAcceptance — signed method permitted for material version
✔ 06 recordAcceptance — browse-wrap REJECTED for material version
✔ 07 recordAcceptance — invalid method rejected
✔ 08 recordAcceptance — unknown versionId rejected
✔ 09 checkAcceptance — status=NEVER when user has no record
✔ 10 checkAcceptance — status=CURRENT after accepting latest
✔ 11 checkAcceptance — status=STALE after publishing newer version
✔ 12 bulkRequireReacceptance — flips pre-existing acceptances to REREQUIRED
✔ 13 bulkRequireReacceptance — requires written reason (חוק החוזים האחידים)
✔ 14 lastAcceptedVersion — returns most recent acceptance versionId
✔ 15 listNonAccepters — isolates users who have not accepted the current version
✔ 16 diffVersions — detects added/removed lines in both languages
✔ 17 generateAcceptanceUI — self-contained HTML with RTL dir + bilingual labels
✔ 18 generateAcceptanceUI — HTML is XSS-safe (escapes injected change log)
✔ 19 enforceGating — blocks gated action when user has stale acceptance
✔ 20 enforceGating — non-gated action allowed regardless of TOS status
✔ 21 exportForDSR — bilingual DSR packet with full history
✔ 22 verifyChain — SHA-256 audit chain integrity + tamper detection

ℹ tests 22
ℹ pass 22
ℹ fail 0
```

**Coverage map (method → tests):**

| Method | Tests |
|---|---|
| `publishVersion` | 01, 02, 03 |
| `recordAcceptance` | 04, 05, 06, 07, 08 |
| `checkAcceptance` | 09, 10, 11, 19 (indirect) |
| `bulkRequireReacceptance` | 12, 13 |
| `lastAcceptedVersion` | 14 |
| `listNonAccepters` | 15 |
| `diffVersions` | 16 |
| `generateAcceptanceUI` | 17, 18 |
| `enforceGating` | 19, 20 |
| `exportForDSR` | 21 |
| `verifyChain` | 22 |
| `registerGatedAction` | 20 |

22 tests exceed the required minimum of 18.

---

## 10. Security Notes / הערות אבטחה

1. **HTML output escaping.** Every user-controlled string rendered by `generateAcceptanceUI` passes through `escapeHtml()` which escapes `& < > " ' /`. Test 18 asserts that `<script>`, `<img onerror>`, and `<iframe onload>` payloads injected via the change log are all neutralised.
2. **PII in audit trail.** Plaintext `ip` and `userAgent` are kept on the in-memory record (needed for litigation replay), but the DSR export path emits only the SHA-256 hashes. Callers who want to redact plaintext too can strip the `ip` field before writing to persistent storage.
3. **Frozen records.** Every returned record, log, and DSR packet is `deepFreeze`-d. Client code cannot accidentally modify the ledger by reference.
4. **Chain of custody.** `_appendAudit` is the only writer to `_audit`, and it always links `prevHash = sha256(prev.hash)`. `verifyChain()` is O(n) and detects both in-place field mutation and full event substitution.
5. **Browse-wrap hard-block.** For material versions the strongest legal protection is refusing the weakest method at the source — not warning about it in logs. `recordAcceptance` throws, so there is no path by which a misconfigured caller can smuggle a browse-wrap "acceptance" into the audit trail.

---

## 11. How to Run / הפעלה

```bash
cd onyx-procurement
node --test test/privacy/tos-tracker.test.js
```

Zero external dependencies — Node 18+ (uses `node:test` + `node:crypto`). Developed against Node v24.14.1.

---

## 12. Sign-off / אישור

* Immutable invariant `"לא מוחקים רק משדרגים ומגדלים"` — enforced
* Zero external deps — enforced (`node:crypto` only, built-in)
* Hebrew RTL + bilingual labels — enforced (every record has `he` + `en`)
* Israeli consumer law compliance — citations embedded in records and UI
* 18+ tests — 22 tests, 22 passing
* Integrates with Y-136 DSR handler — `exportForDSR` matches the contract

Agent **Y-141** — signed off 2026-04-11.
