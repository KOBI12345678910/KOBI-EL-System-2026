# AG-Y150 — Legal Hold Enforcer / אכיפת עיכוב משפטי

- **Agent:** Y-150
- **Swarm:** Compliance
- **System:** Techno-Kol Uzi Mega-ERP 2026
- **Module:** `onyx-procurement/src/compliance/legal-hold.js`
- **Tests:** `onyx-procurement/test/compliance/legal-hold.test.js`
- **Date / תאריך:** 2026-04-11
- **Status:** PASS — 15 / 15 tests green, `node --test`

---

## 1. Mission / משימה

### English
Build an append-only, tamper-evident legal-hold enforcer that freezes
records from deletion or modification once a legal hold is applied, and
that always overrides retention expiry. The module must be zero-external-
dependency, produce bilingual (Hebrew/English RTL-aware) custodian notices
and court reports, and stay loosely coupled to the document manager
(Y-106) and retention engine (Y-149) via events only.

### עברית
לבנות אוכף עיכוב משפטי מסוג append-only עם שרשרת-גיבוב עמידה לזיופים,
אשר מקפיא רשומות מפני מחיקה או שינוי ברגע שהחל עיכוב משפטי, וגובר תמיד
על פקיעת שימור. המודול חייב להיות ללא תלויות חיצוניות, להפיק הודעות
לאוצרי ראיות ודוחות לבית המשפט בעברית ובאנגלית (כולל כיווניות RTL),
ולשמור על צימוד רופף למנהל המסמכים (Y-106) ולמנוע השימור (Y-149)
באמצעות אירועים בלבד.

---

## 2. Scope & Requirements / היקף ודרישות

| Requirement / דרישה                                                   | Implementation / יישום                                | Status |
|-----------------------------------------------------------------------|-------------------------------------------------------|:------:|
| `createHold(caseId, scope, custodians, keywords)`                     | `LegalHoldEnforcer.createHold()` w/ 5 scope dims      |   OK   |
| `listHolds`                                                           | filters: `status`, `source`, `custodian`, `activeOnly`|   OK   |
| `isLocked(recordId)`                                                  | `isLocked()` / `matchingHolds()` returns active holds |   OK   |
| `releaseHold(caseId, justification, approver)`                        | requires both, never hard-deletes, double-release err |   OK   |
| Audit-logged / audit trail                                            | append-only `_events` with SHA-256 hash chain         |   OK   |
| Never hard-delete hold record / לא מוחקים, רק משנים סטטוס            | release flips `status` → `released`; row preserved   |   OK   |
| `custodianNotice` bilingual template                                  | `custodianNotice()` Hebrew RTL + English LTR letter   |   OK   |
| `collectionExport` (manifest + SHA256)                                | per-item + manifest-level SHA-256, stable serialize   |   OK   |
| `overrideAlert` (when trying to modify held record)                   | `overrideAlert()` logs per matching case, returns blocked|  OK |
| `reportForCourt` (Israeli court format + English)                     | bilingual report w/ chain summary + SHA-256           |   OK   |
| scopeRules: user / date range / project / keyword                     | `userIds`, `dateRange`, `projectIds`, `keywords`, `types`, `recordIds` |   OK   |
| Append-only event log with hash chain / תמרון עמיד לזיופים            | `_appendEvent()` + `verifyChain()`                    |   OK   |
| Israeli court refs — צו עיכוב / צו חיפוש                              | `HOLD_SOURCES.STAY_ORDER`, `HOLD_SOURCES.SEARCH_WARRANT` used in notice heading |  OK |
| Bilingual custodian notice (HE + EN)                                  | `notice.hebrew` + `notice.english` + `combined`, `direction` map |  OK |
| Loose coupling with Y-106 + Y-149 (emits, does not import)            | tiny in-process emitter; `on(event, handler)`         |   OK   |
| Legal hold overrides retention expiry                                 | flag `overridesRetention: true`; test 9 verifies      |   OK   |
| Zero external dependencies                                            | uses only `node:crypto` (built-in)                    |   OK   |
| Hebrew RTL + bilingual labels                                         | headings, constants, report, notice — all bilingual   |   OK   |
| "לא מוחקים רק משדרגים ומגדלים"                                        | no path performs `delete`/`splice` on a hold or event |   OK   |

---

## 3. Test Results / תוצאות בדיקות

```
$ node --test test/compliance/legal-hold.test.js

✔ LegalHoldEnforcer — create / list / status
  ✔ 1) createHold stores an active hold with full scope
  ✔ 2) createHold refuses duplicate caseId
  ✔ 3) listHolds filters by activeOnly, source, custodian
✔ LegalHoldEnforcer — isLocked / scope rules
  ✔ 4) isLocked returns true for a record inside scope (user+project+type+date+keyword)
  ✔ 5) isLocked returns false when any scope dimension misses
  ✔ 6) isLocked honours explicit recordIds (highest precedence)
  ✔ 7) released holds do NOT lock records any more
✔ LegalHoldEnforcer — release + never-delete invariant
  ✔ 8) releaseHold requires justification + approver and never removes the row
  ✔ 9) legal hold overrides retention expiry
✔ LegalHoldEnforcer — custodian notice (bilingual)
  ✔ 10) custodianNotice produces Hebrew + English letter with stay-order heading
✔ LegalHoldEnforcer — collection export & manifest
  ✔ 11) collectionExport returns manifest with per-item + manifest SHA256
✔ LegalHoldEnforcer — override alert + audit chain
  ✔ 12) overrideAlert is blocked=true when a hold applies and recorded in the log
  ✔ 13) audit log is append-only with a valid hash chain
✔ LegalHoldEnforcer — court report + events (loose coupling)
  ✔ 14) reportForCourt returns bilingual Israeli+English report with chain summary
  ✔ 15) enforcer emits events for loose coupling with Y-106 / Y-149

ℹ tests 15
ℹ pass  15
ℹ fail  0
```

**15/15 green — requirement was at least 12.**

### Test coverage map / מפת כיסוי בדיקות

| # | Area / תחום                              | Proves / מוכיח                                           |
|---|------------------------------------------|----------------------------------------------------------|
| 1 | Hold creation                            | fields stored, keywords merged & deduped, `overridesRetention` set |
| 2 | Idempotency                              | duplicate `caseId` throws                                |
| 3 | List filters                             | `activeOnly`, `source`, `custodian` filter correctly     |
| 4 | Scope match — all dims                   | user + project + type + date-range + keyword all match   |
| 5 | Scope mismatch — any dim                 | wrong project / type / date / keyword → not locked       |
| 6 | Explicit `recordIds` precedence          | listed → locked; not listed (id-only scope) → not locked |
| 7 | Released holds release lock              | after release, `isLocked` returns `false`                |
| 8 | Release gate + never-delete              | empty justification/approver throws; row preserved; double-release throws |
| 9 | Retention override                       | `retentionExpired: true` still locked; `overridesRetention` flag |
| 10| Custodian notice bilingual               | Hebrew RTL + English LTR, stay-order headings, event logged |
| 11| Collection manifest                      | per-item + manifest SHA-256 hex-64, item count, event logged |
| 12| Override alert — blocked                 | `blocked=true`, `matchingCaseIds`, audit event recorded  |
| 13| Tamper-evident chain                     | monotone seq, `verifyChain().valid`, post-mutation detection |
| 14| Court report bilingual                   | Hebrew + English, chain summary, SHA-256, blocked count  |
| 15| Loose coupling events                    | `on(type, handler)` + wildcard `*` fire on lifecycle     |

---

## 4. Architecture Notes / הערות ארכיטקטורה

### Data model
- `_holds: Map<caseId, holdRecord>` — in-process; hold records are
  mutated only to set `status`, `releasedAt`, `releasedBy`,
  `releaseJustification`, and to append `historyIds`. No entry is
  ever removed.
- `_events: Event[]` — append-only array. Every event is frozen with
  `Object.freeze` immediately after construction.
- `_lastHash: string` — rolling SHA-256 of `prevHash + stableStringify(body)`.

### Scope rule semantics
Scope combines with logical AND across supplied dimensions. Precedence
rules:
1. If `scope.recordIds` is non-empty and contains the target id → lock.
2. If `scope.recordIds` is non-empty and does NOT contain the target id,
   and no other structural dimension is set → the hold is id-only and
   does not match.
3. If at least one structural dimension is set, ALL supplied dimensions
   must match (user, project, type, date range, keywords).
4. Empty-scope hold = catch-all (supported for org-wide freezes).

### Hash chain (tamper-evident)
```
prevHash₀ = "0"×64
hashₙ = SHA256( prevHashₙ₋₁  +  "|"  +  stableStringify({seq,type,timestamp,payload}) )
prevHashₙ = hashₙ
```
`verifyChain()` walks the array, recomputes each hash, and reports
`{ valid: false, brokenAt: seq }` at the first mismatch. Used by test 13
which mutates a past event's payload and asserts detection.

### Loose coupling with Y-106 (document manager) and Y-149 (retention)
The enforcer **emits** events (`hold.created`, `hold.released`,
`notice.issued`, `collection.exported`, `override.attempt`,
`court.report.generated`, and a wildcard `*`). It **does not** `require()`
either module. Wiring example (lives in the host app, not here):

```js
const enforcer = new LegalHoldEnforcer();

// Y-106 asks before destructive ops:
docManager.beforeDelete = (rec, ctx) => {
  if (enforcer.isLocked(rec.id, ctx)) {
    enforcer.overrideAlert(rec.id, ctx.actor, 'delete', ctx);
    throw new Error('BLOCKED_BY_LEGAL_HOLD');
  }
};

// Y-149 refreshes its hold cache on lifecycle changes:
enforcer.on('hold.created',  () => retention.refreshHolds?.());
enforcer.on('hold.released', () => retention.refreshHolds?.());
```

### Israeli court references
`HOLD_SOURCES.STAY_ORDER` → "צו עיכוב" (heading in notice + report).
`HOLD_SOURCES.SEARCH_WARRANT` → "צו חיפוש" (heading in notice + report).
`hold.court` / `hold.issuedBy` fields hold the specific tribunal /
judge / counsel, rendered verbatim in both languages.

### Bilingual surfaces
Every user-visible artefact carries both languages:
- `custodianNotice()` → `{ hebrew, english, combined, languages:['he','en'], direction:{he:'rtl',en:'ltr'} }`
- `reportForCourt()`  → same shape, plus `summary`, `sha256`, and `events`.
- Titles stored as `title` (en) + `titleHe` (he).

---

## 5. Invariants verified / אינווריאנטים שאומתו

1. **No hard delete.** Grepping the module for `delete `, `splice`, or
   `.pop(`/`.shift(` on `_holds` or `_events` shows none — release flips
   the status field; events are only appended.
2. **Append-only audit log.** `verifyChain()` traverses the entire log;
   any mutation to a past event's payload or hash is detected on the
   next verify (test 13).
3. **Legal hold overrides retention expiry.** `overridesRetention: true`
   is set on creation and asserted by test 9 even when the caller passes
   `retentionExpired: true` in the context — the enforcer still returns
   a match.
4. **Zero external deps.** Only `node:crypto` (built-in) is required.
5. **Loose coupling.** The module does not `require()` Y-106 or Y-149;
   it only emits events consumed by the host wiring layer.
6. **Bilingual + RTL.** All templates render both languages and expose
   a `direction` map for the UI layer.

---

## 6. Edge cases handled / מקרי קצה שטופלו

- Empty `custodians` / `keywords` arrays (filter fallback logic).
- Duplicate / overlapping keywords between `keywords` arg and `scope.keywords` (merged + deduped).
- `scope.dateRange` given as `{ from, to }` or `{ start, end }` (aliased via `coerceRange`).
- Records with no `createdAt` against a date-range scope → no match (strict).
- Array / single-value normalisation for every list-typed argument.
- `overrideAlert` called on a non-locked record → emits with `blocked: false` and empty `matchingCaseIds`.
- Released holds: `isLocked` returns `false`, but the row and its history are preserved and still appear in `listHolds()`.
- `listHolds({ activeOnly: true })` filters out released holds.
- Listener errors are swallowed so a faulty subscriber cannot break the enforcer.
- Scope match short-circuits: any failing dimension returns `false` immediately.

---

## 7. Outstanding risks & next steps / סיכונים ופעולות המשך

| # | Risk / סיכון                                                          | Mitigation / הקטנה                                                                                      |
|---|-----------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| 1 | In-memory state is per-process — no durability across restarts.       | Y-106/Y-149 integration should persist `auditLog()` + `listHolds()` to the tamper-evident store.        |
| 2 | Case-insensitive keyword match is ASCII-lowercase only.               | Current Hebrew matching works (`String.toLowerCase` leaves Hebrew unchanged); OK for Hebrew + English.  |
| 3 | No built-in RBAC — any caller can `releaseHold`.                      | Wire via existing Y-97 RBAC middleware at the host layer (approver must be in `legal-ops` group).       |
| 4 | `collectionExport` hashes the JSON serialization only.                | Sufficient for metadata manifests; file-payload hashing happens upstream in Y-106 and is referenced.    |
| 5 | Hash chain is sequential per enforcer instance.                       | Acceptable for a single-process module; clustered deployments should persist the tail hash externally. |
| 6 | Court report is plain text.                                           | PDF rendering is the responsibility of the existing `pdf-generator` module; this report is the source. |

---

## 8. Sign-off / חתימה

| Role / תפקיד            | Name / שם        | Decision / החלטה |
|-------------------------|-----------------|------------------|
| Agent Y-150 (author)    | Compliance swarm | PASS / עבר       |
| Automated test gate     | `node --test`    | 15/15 green      |
| Never-delete invariant  | static review    | verified         |
| Bilingual + RTL gate    | manual review    | verified         |

**Final / סופי: READY FOR INTEGRATION — מוכן לשילוב.**
