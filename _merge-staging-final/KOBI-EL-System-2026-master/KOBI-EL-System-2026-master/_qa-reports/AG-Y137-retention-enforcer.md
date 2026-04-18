# AG-Y137 — Retention Enforcer / אוכף מדיניות שימור

**Agent**: Y-137
**System**: Techno-Kol Uzi mega-ERP — Onyx-Procurement
**Module**: `onyx-procurement/src/privacy/retention-enforcer.js`
**Tests**: `onyx-procurement/test/privacy/retention-enforcer.test.js`
**Date**: 2026-04-11
**Status**: PASS — 30 / 30 tests green
**Dependencies**: Zero external (`node:crypto` + `node:events` only)
**Companions**: Y-149 (audit-retention engine, defines rules) / Y-150 (legal-hold registry)

---

## 1. Mission / משימה

| EN | HE |
|---|---|
| Apply retention policies by scanning records whose retention expired and moving them to cold storage, **never hard-deleting** production data. | להחיל מדיניות שימור ע״י סריקת רשומות שתקופת שימורן פגה והעברתן לאחסון קר, **ללא מחיקה פיזית** של נתוני ייצור. |

Y-149 **defines** the retention rules. Y-137 **enforces** them. Y-150 **pauses** them (legal hold). All three communicate via events — no direct imports.

---

## 2. Core Invariant / עיקרון יסוד

> **"לא מוחקים — רק משדרגים ומגדלים"**
> *"We do not delete — we only upgrade and grow"*

Every archival path in the API ends in a **soft** action:

1. Status flip in the in-memory `Map` (the record stays in place).
2. A companion archive row in a parallel map with `hardDeleted: false`.
3. An append-only audit event on the SHA-256 chain.
4. For tombstones, an additional append-only ledger entry.

There is **no code path** that calls `.delete()`, `DROP`, `DELETE FROM`, or equivalent on any production store. This is enforced by test `26 — invariant: no path in the API produces a hard delete`.

---

## 3. Archival Methods / שיטות ארכוב

| Method | Token | HE | Behavior | Reversible? |
|---|---|---|---|---|
| Cold Storage | `cold-storage` | אחסון קר | Full record snapshot, moved to segregated tier, ref kept in archive map | Yes — via `restoreFromArchive` |
| Pseudonymize | `pseudonymize` | פסאודונימיזציה | PII replaced by deterministic SHA-256-derived token (`first char + *** + hash`) | Partial — row stays live, but original PII cannot be recovered without salt |
| Tombstone | `tombstone` | אבן-זיכרון | Metadata-only entry appended to append-only SHA-256 chain, row stays (flagged) | No — tombstone is final (closest this system gets to deletion) |

**None of the three methods hard-deletes anything.** Tombstone is metaphorical: we write a marker and flag the row; the row itself is preserved in the classification map.

---

## 4. Legal Basis Table / טבלת בסיס משפטי

Pre-seeded on construction (can be overridden via `definePolicy`):

| Category | Years | Law (HE) | Law (EN) | Default Method |
|---|---:|---|---|---|
| `tax` | 7 | פקודת מס הכנסה | Income Tax Ordinance | cold-storage |
| `vat` | 7 | חוק מס ערך מוסף | VAT Law | cold-storage |
| `hr` | 7 | חוק שעות עבודה ומנוחה | Work Hours & Rest Law | cold-storage |
| `aml` | 7 | חוק איסור הלבנת הון | Prohibition on Money Laundering Law | cold-storage |
| `contracts` | 7 | חוק ההתיישנות | Limitation Law | cold-storage |
| `medical` | 10 | חוק זכויות החולה | Patient Rights Law | cold-storage |
| `construction` | 25 | חוק המכר (דירות) | Sale (Apartments) Law | cold-storage |
| `marketing` | 2 | חוק הגנת הפרטיות (תיקון 13) | Protection of Privacy Law (Amendment 13) | cold-storage |

All three legally mandated minimums from the task brief are honored:
- **7 y** tax / HR
- **10 y** medical
- **25 y** construction

---

## 5. Public API / API ציבורי

```
class RetentionEnforcer extends EventEmitter
  ─ definePolicy({id, category, retentionDays, purpose,
                  legalBasis_he, legalBasis_en, archivalMethod})
  ─ getPolicy(id) / policyForCategory(cat) / listPolicies()
  ─ classifyRecord({recordId, category, createdAt})
  ─ getClassification(id) / listClassifications()
  ─ scanDue(now, {category?})
  ─ dryRun(now, {category?})                      ← pure preview
  ─ enforceArchive(recordId, {method, approvedBy, reason?})
  ─ enforceBatch(records[], {approvedBy})
  ─ legalHoldOverride(recordId, {reason, placedBy, matterId?})
  ─ releaseLegalHold(recordId, {reason, releasedBy})
  ─ isOnLegalHold(id)
  ─ exportTombstone(recordId, reason)
  ─ tombstoneLedger() / verifyTombstoneChain()
  ─ restoreFromArchive(recordId, justification, approver)
  ─ rollbackLastBatch({approvedBy, reason})
  ─ listBatches()
  ─ auditReport({from, to})
  ─ auditEvents() / verifyAuditChain()
```

### 5.1 Event Stream / זרם אירועים

Y-137 is an `EventEmitter`. Downstream consumers subscribe to:

| Event | When fired |
|---|---|
| `policy:defined` | New policy added or existing overridden |
| `record:classified` | Record tagged with a policy |
| `record:archived` | Cold-storage enforcement succeeded |
| `record:pseudonymized` | Pseudonymize enforcement succeeded |
| `record:tombstoned` | Tombstone enforcement succeeded (also on `exportTombstone`) |
| `record:restored` | Record un-archived |
| `hold:placed` | Legal hold placed (integration point with Y-150) |
| `hold:released` | Legal hold released |
| `batch:enforced` | A batch enforcement finished |
| `batch:rolledback` | The last batch was reverted |

**Integration contract**: consumers MUST NOT rely on synchronous event delivery. The enforcer emits after the state mutation is done, which means a subscriber can trust that `getClassification()` reflects the new state at the moment of emission.

---

## 6. Hash Chain Format / פורמט שרשרת ההאשים

Two separate chains protect different concerns:

### 6.1 Audit chain (`_auditChain`)

Every mutation produces one entry:

```
entry = {
  seq:      integer (0-based),
  type:     one of EVENTS.*,
  ts:       ISO-8601 timestamp,
  payload:  frozen event-specific body,
  prevHash: SHA-256 of previous entry,
  hash:     SHA-256(prevHash + '|' + stableStringify({type, payload, ts}))
}
```

Genesis hash: `sha256("retention-enforcer-genesis")`.

### 6.2 Tombstone ledger (`_tombstoneLedger`)

Append-only, separate chain. Every entry contains **both** a content hash and a chain hash so tampering with the body or with the link is detected:

```
entry = {
  seq:             integer (0-based),
  recordId:        source record id,
  pseudonymousTag: first-char + '***' + sha256(salt|id)[0..12],
  reason:          free-text reason,
  ts:              ISO-8601 timestamp,
  category:        category token or null,
  policyId:        policy id or null,
  prevHash:        SHA-256 of previous entry,
  contentHash:     SHA-256(stableStringify({recordId, reason, ts, policyId, category})),
  hash:            SHA-256(prevHash + '|' + contentHash),
  hardDeleted:     false,   ← always
  note_he:         'אבן זיכרון בלבד — הרשומה לא נמחקה פיזית',
  note_en:         'Tombstone only — record was NOT hard-deleted'
}
```

Genesis hash: `sha256("retention-enforcer-tombstone-genesis")`.

### 6.3 Verification

Both chains expose `verify*()` methods that walk the array top-down and return `{valid, brokenAt, reason}`. Tampering is caught either at the `prevHash` link or at the `contentHash`. Tests 17 (valid chain) and 18 (tamper detection) cover both cases.

---

## 7. Hebrew Glossary / מילון מונחים

| Term (HE) | Term (EN) | Meaning in this module |
|---|---|---|
| שימור | Retention | Keeping a record until its legal period expires |
| אכיפה | Enforcement | Applying the retention policy after expiry |
| ארכוב רך | Soft archive | Status flip + cold-storage event, not deletion |
| אחסון קר | Cold storage | Segregated tier where the soft-archived copy lives |
| פסאודונימיזציה | Pseudonymization | One-way replacement of PII with deterministic tokens |
| אבן-זיכרון | Tombstone | Metadata marker appended to an append-only chain |
| הקפאה משפטית | Legal hold | Y-150-placed freeze that blocks any enforcement |
| קטגוריה | Category | Record class — `tax`, `hr`, `medical`, ... |
| בסיס משפטי | Legal basis | The law that mandates the retention period |
| שרשרת ציות | Compliance chain | The SHA-256-chained append-only audit log |
| הרצת יבש | Dry run | Preview of enforcement with no mutation |
| שחזור | Restore | Un-archive with justification and a human approver |
| גלגול לאחור | Rollback | Undo the last enforcement batch |
| דו״ח ציות | Compliance report | Bilingual per-period summary |
| אישור | Approver | Human who signed off on the enforcement |
| הצדקה | Justification | Written reason for a restore |

---

## 8. Test Coverage / כיסוי בדיקות

**30 tests, 100% passing.** Run command:

```
node --test test/privacy/retention-enforcer.test.js
```

### 8.1 Test Matrix

| # | Test | Covers |
|---:|---|---|
| 01 | definePolicy creates immutable policy | Policy define |
| 02 | definePolicy validates inputs | Negative inputs |
| 03 | Israeli-law defaults seeded (7y tax, 10y medical, 25y construction) | Legal constants |
| 04 | classifyRecord computes `expiresAt` | Classify |
| 05 | classifyRecord rejects unknown category | Classify negative |
| 06 | scanDue finds only expired records | scanDue |
| 07 | scanDue filters by category | scanDue filter |
| 08 | scanDue respects legal hold | Legal hold wins |
| 09 | dryRun does NOT mutate state | dryRun purity |
| 10 | dryRun totals per method / per category | dryRun totals |
| 11 | enforceArchive emits event, no hard delete | enforceArchive + event |
| 12 | enforceArchive refuses held records | Hold wins over enforce |
| 13 | enforceArchive pseudonymize method | Pseudonymize path |
| 14 | enforceArchive tombstone method | Tombstone path |
| 15 | legalHoldOverride / releaseLegalHold happy path | Legal hold lifecycle |
| 16 | releaseLegalHold throws when no hold | Negative |
| 17 | tombstone ledger prevHash chain valid | Hash chain |
| 18 | tombstone chain detects tampering | Tamper detection |
| 19 | restoreFromArchive with full audit | Restore |
| 20 | restoreFromArchive refuses tombstoned records | Restore negative |
| 21 | rollbackLastBatch reverts all actions | Rollback |
| 22 | rollbackLastBatch throws when no batch | Rollback negative |
| 23 | auditReport bilingual counts per category | Report |
| 24 | auditReport period window filters | Report window |
| 25 | audit chain valid through full workflow | Chain integrity |
| 26 | invariant: no hard delete anywhere | Core invariant |
| 27 | classifyRecord rejects invalid dates | Negative |
| 28 | enforceArchive refuses already-archived | State guard |
| 29 | policy:defined event fires | Event wiring |
| 30 | Bilingual labels on defaults (HE + EN) | i18n |

### 8.2 Mandatory Coverage from Task Brief

| Requirement | Covered by |
|---|---|
| policy define | 01, 02, 29 |
| classify | 04, 05, 27 |
| scan due (respects legal hold) | 06, 07, 08 |
| enforceArchive emits event | 11, 13, 14 |
| legal hold override | 08, 12, 15, 16 |
| dryRun doesn't mutate | 09, 10 |
| audit report | 23, 24 |
| tombstone hash chain | 17, 18 |
| restore from archive | 19, 20 |
| rollback | 21, 22 |

---

## 9. Compliance Assertions / הצהרות ציות

- [x] **No hard delete**: test 26 proves classifications and archive records remain after any enforcement path. `hardDeleted: false` is hardcoded on every archive record.
- [x] **Legal hold precedence**: tests 08 and 12 prove that a held record is never returned by `scanDue` and that `enforceArchive` throws `LEGAL_HOLD`.
- [x] **Append-only history**: both audit chain and tombstone ledger are implemented as arrays with monotonic sequence numbers. The only mutating operation is `push`.
- [x] **Tamper detection**: test 18 mutates a tombstone entry and `verifyTombstoneChain()` correctly reports `{valid: false, brokenAt: 1}`.
- [x] **Hebrew RTL**: every user-visible string in defaults and reports has a Hebrew variant. Test 30 asserts presence of Hebrew characters in all default `legalBasis_he`.
- [x] **Israeli-law constants**: test 03 asserts 7-year tax retention, 10-year medical, 25-year construction.
- [x] **Zero external deps**: source imports only `node:crypto` and `node:events`; test file imports only `node:test` and `node:assert/strict`.
- [x] **Event-only integration**: no `require('../../compliance/retention-engine')` or similar. Coupling with Y-149 and Y-150 is via EventEmitter and public API only.

---

## 10. Integration Points / נקודות אינטגרציה

### 10.1 With Y-149 (retention engine — defines rules)

Y-149 owns the **rule registry**. On startup a glue layer walks Y-149 and calls `retentionEnforcer.definePolicy(rule)` for each. After that, Y-137 operates independently on its own copy.

### 10.2 With Y-150 (legal-hold registry)

Y-150 owns the **hold registry**. When Y-150 places a hold:

```
legalHold.on('placed', ({recordId, matterId, reason}) => {
  retentionEnforcer.legalHoldOverride(recordId, {
    reason, placedBy: 'y-150', matterId
  });
});

legalHold.on('released', ({recordId, releasedBy, reason}) => {
  retentionEnforcer.releaseLegalHold(recordId, {reason, releasedBy});
});
```

### 10.3 With cold-storage pipeline

On `record:archived` and `record:pseudonymized`, a downstream worker copies the row to the cold tier and acks. Y-137 does not wait for the ack — the row is already soft-archived.

---

## 11. Known Limits / מגבלות ידועות

1. **In-memory only.** On process restart, policies and classifications are lost. A host must persist the chain externally if durability is required.
2. **Pseudonymization is one-directional but not a secure hash for PII.** Use `opts.salt` to rotate it; do not rely on it for re-identification defense against an attacker who has read access to the salt.
3. **Rollback only covers the most recent batch.** Older batches are frozen and cannot be reverted by this API — by design, to keep the history append-only.
4. **Tombstoned records are not restorable.** Tombstoning is the closest thing to deletion this system supports; restore is blocked to preserve the append-only guarantee.

---

## 12. Files Touched / קבצים שנוצרו

| Path | Purpose |
|---|---|
| `onyx-procurement/src/privacy/retention-enforcer.js` | Main module (RetentionEnforcer class) |
| `onyx-procurement/test/privacy/retention-enforcer.test.js` | 30-test node:test suite |
| `_qa-reports/AG-Y137-retention-enforcer.md` | This report |

No other files were modified. Y-149 and Y-150 are untouched — integration is via events only, per the immutable rule **"no direct import"**.

---

## 13. Verification Commands / פקודות אימות

```bash
# from onyx-procurement/
node --test test/privacy/retention-enforcer.test.js

# Expected (on passing run):
#   tests 30
#   pass 30
#   fail 0
```

Last run: **2026-04-11**, all 30 tests passed in ~120 ms.

---

**Agent Y-137 — task complete. אין מחיקה — רק גידול.**
