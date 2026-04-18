# AG-Y115 — Document Legal Hold Workflow Engine

## Bilingual QA Report | דו"ח QA דו-לשוני

**Agent**  : Y-115
**Swarm**  : Documents
**Module** : `onyx-procurement/src/docs/legal-hold-workflow.js`
**Tests**  : `onyx-procurement/test/docs/legal-hold-workflow.test.js`
**Report date** : 2026-04-11
**Status** : GREEN — 21/21 tests passing, 0 external dependencies
**Relationship** : Complements **Y-150** (general entity-level legal hold).
Y-115 scope = DOCUMENT level (doc-store items, revisions, attachments).

---

## 1. Rule Compliance | תאימות לכללים

| Rule | Verification |
|------|---|
| "לא מוחקים רק משדרגים ומגדלים" | `releaseHold()` flips `status` to `released` and appends an event — it **never** removes notices, acks, frozen-doc records, or collection manifests. Counters are asserted to remain stable in test 13. |
| Zero external deps | Only `node:crypto` is `require()`'d. No `package.json` additions. |
| Hebrew RTL + bilingual labels | `STATUS_LABELS`, `FORMAT_LABELS`, `HEBREW_GLOSSARY`, notice templates, and `reportToCourt()` output all expose both `he` and `en` keys. |
| Append-only event log | `_event()` increments a monotonic `_seq` and pushes a frozen record. Test 20 verifies sequential ordering and that records are immutable. |
| In-memory storage | Seven `Map`s plus one events `Array`, all instance-scoped. |

---

## 2. Hold Lifecycle | מחזור חיים של הקפאה

### State machine — חוקי מעבר

```
  initiated ─► noticed ─► acknowledged ─► scoped ─► collecting ─► collected
      │           │            │             │           │            │
      ▼           ▼            ▼             ▼           ▼            ▼
                               released  (from any state, one-way)
```

| State | Hebrew label | Trigger | Mutations allowed |
|---|---|---|---|
| `initiated` | נפתח | `initiateHold()` | Add custodians, set scope filters |
| `noticed` | הוצאה הודעה | First `sendCustodianNotice()` | Add more notices, track acks, escalate |
| `acknowledged` | אושר | All custodians `trackAcknowledgment(true)` | Scope + collect |
| `scoped` | מוגדר היקף | `scopeDocuments()` | Freeze more docs, collect |
| `collecting` | איסוף | `collectForProduction()` begins | Finalize collection |
| `collected` | נאסף | Manifest delivered | Additional collections allowed |
| `released` | שוחרר | `releaseHold()` | **Terminal** — status flip only |

**Forward-only transitions** are enforced in `_transition()`.
**`released` is a one-way escape** reachable from any state — this
is intentional so that urgent court orders (e.g., settlement) can
close a matter at any stage without rewinding workflow.

---

## 3. Custodian Workflow | מהלך עבודה עם נאמני מידע

### Step-by-step

1. **Declare custodians at initiation** —
   `initiateHold({ custodians: [{ custodianId, name, email, lang }] })`.
   Additional custodians may be added later via `sendCustodianNotice`
   (late-join is permitted and logged as a `notice.sent` event).

2. **Send bilingual notice** —
   `sendCustodianNotice({ holdId, custodianId, lang })`
   Produces a frozen notice record containing:
   - `subject.he` / `subject.en`
   - `body.he`    / `body.en` (formal letter with case facts)
   - `preferred`  (the body in the requested language)
   - `ackRequest` with `deadline`, `deadlineDays` (7), and bilingual ask.
   A `notice.sent` event is appended.

3. **Track acknowledgment** —
   `trackAcknowledgment({ holdId, custodianId, acknowledged, timestamp, notes })`
   - Always creates a NEW `ack_*` record (append-only — refusals and
     later re-acks are kept side-by-side).
   - Custodian status transitions:
     `pending → noticed → acknowledged` (or `declined` on refusal).
   - When **all** declared custodians reach `acknowledged`, the
     hold auto-advances from `noticed` to `acknowledged`.

4. **Escalation on silence** —
   `escalation(holdId)` — scans every declared custodian; if
   `(now - noticedAt) ≥ 7 days` and status ≠ `acknowledged`,
   the custodian flips to `escalated` and a `custodian.escalated`
   event carries the elapsed days. Idempotent (escalated flag
   prevents re-escalation within one cycle).

### Hebrew notice template — extract

```
הודעת הקפאה משפטית / Legal Hold Notice

שלום {custodianName},

ברצוננו להודיעך כי נפתח תיק משפטי בנושא: {caseTitle}
מספר תיק: {caseId}
בית המשפט: {court}
עניין: {matter}

בהתאם להוראות הדין ובכפוף לנוהלי Techno-Kol Uzi,
עליך לשמר כל מסמך, הודעה, קובץ, או מידע הקשורים לתיק זה.
אין למחוק, לשנות או להעביר מסמכים אלה.

מזהה הקפאה: {holdId}
מועד אחרון לאישור קבלת ההודעה: {ISO deadline}
```

---

## 4. Document Scoping | היקף מסמכים

`scopeDocuments(holdId, docStore)` accepts any adapter implementing:

```js
{
  findAll(): DocRecord[]           // required
  markHold?(docId, flag, holdId)   // optional — soft-mark helper
  getRaw?(docId) / get?(docId)     // used by collection
}
```

**Match predicate** (AND across dimensions):

| Dimension | Filter | Field(s) on doc |
|---|---|---|
| `docType` | equality | `doc.docType` |
| `department` | equality | `doc.department` |
| `owner` | equality | `doc.owner` |
| `tags` | any-of intersection | `doc.tags[]` |
| `dateRange` | `from ≤ createdAt ≤ to` | `doc.createdAt` |
| `keywords` | substring OR (case-insensitive) | `doc.title`, `doc.title_he`, `doc.title_en`, `doc.content`, `doc.body` |

Every matched document is:
1. Flagged on the source store (`legalHold = true`, `legalHoldId`).
2. Entered into the engine's own `_frozenDocs` Map (authoritative).
3. Stamped with a `freeze` entry in its chain-of-custody log.

The hold transitions to `scoped` and a `scope.applied` event captures
the matched count + id list for audit replay.

---

## 5. Freezing & Immutability Guard | נעילת מסמכים

### `freezeDocument(holdId, docId)`

- Creates a frozen-doc record keyed `${holdId}::${docId}`.
- Idempotent: a re-freeze logs a `freeze.reaffirm` event without
  double-counting.
- Opens the chain-of-custody trail with a `freeze` entry.

### `assertMutable(docId, op, actor)` — the guardrail

External systems (doc-search index rebuilds, doc-vc revisions,
watermark stamping, archival jobs) MUST call this before any write.
On a hit against a frozen doc:

1. A `blocked:${op}` entry is appended to the chain of custody.
2. A `doc.mutation.blocked` event is appended to the engine log.
3. An `Error` with `code: 'HOLD_IMMUTABLE'` and the offending
   `holdId` is thrown.

This gives legal review a defensible audit trail of every attempted
spoliation, even if the attempt itself was automatic and benign.

---

## 6. Production Format | פורמט הגשה

### `collectForProduction(holdId, { format, docStore })`

| Parameter | Allowed | Hebrew label |
|---|---|---|
| `format: 'PDF'` | Yes | PDF מסמך |
| `format: 'native'` | Yes | פורמט מקורי |
| `format: 'image'` | Yes | תמונה/TIFF |
| other | **rejected** with `INVALID_INPUT` | — |

### Manifest shape (frozen)

```
{
  collectionId: 'coll_…',
  holdId, caseId, caseTitle,
  format, formatLabel: { he, en },
  generatedAt: ISO,
  entryCount: N,
  entries: [                     ← frozen array, frozen items
    {
      docId,
      format,
      bytes,
      checksum:       <64 hex>,  ← SHA-256 of serialized payload
      checksumAlgo:   'SHA-256',
      frozenAt, collectedAt,
    },
    …
  ],
  manifestChecksum: <64 hex>,    ← SHA-256 of the concatenation
  manifestAlgo:     'SHA-256',   ←   of all per-entry checksums
}
```

**Why a manifest-level checksum?**
The checksum-of-checksums lets court producers verify a collection's
integrity by re-hashing the per-entry SHA-256 list without having to
redeliver every payload — critical for large productions (>10k docs).

Each collected doc gets a `collect` entry in its chain of custody
tagged with the produced `format` and `checksum`.

---

## 7. Chain of Custody Model | מודל שרשרת משמורת

Every document that has ever crossed the engine carries an
append-only access trail accessible via:

```js
engine.chainOfCustody(docId)  → {
  docId,
  entryCount,
  entries: [                        ← chronological, append-only
    { at, action, actor, holdId, reason, format?, checksum? },
    …
  ],
  holdIds:      [ holdId, … ],      ← every hold that ever froze it
  manifestRefs: [ {collectionId, manifestChecksum, …}, … ],
  trailHash:    <SHA-256 of entries>,
  trailAlgo:    'SHA-256',
}
```

### Action vocabulary

| Action | Recorded by |
|---|---|
| `freeze` | `freezeDocument()` / `scopeDocuments()` |
| `read`, `view`, custom `op` | `recordAccess()` (external systems call this) |
| `blocked:<op>` | `assertMutable()` on a HOLD_IMMUTABLE hit |
| `collect` | `collectForProduction()` per-doc |

### trailHash

`trailHash = SHA-256( JSON.stringify(entries) )` — if any prior
entry is tampered with (not possible through the public API, but
included as defense-in-depth for a persistence layer), the hash
diverges and the trail becomes self-verifying.

---

## 8. Hebrew Glossary | מילון מונחים עברי-אנגלי

| עברית | English | Role |
|---|---|---|
| הקפאה משפטית | legal hold | core |
| נאמן מידע | custodian | party |
| הודעת הקפאה | hold notice | workflow |
| אישור קבלה | acknowledgment | workflow |
| הסלמה | escalation | workflow |
| היקף מסמכים | document scope | workflow |
| שרשרת משמורת | chain of custody | evidence |
| קריטריוני סינון | scope filter | scope |
| מילות מפתח | keywords | scope |
| טווח תאריכים | date range | scope |
| הגשה לבית משפט | production | output |
| מצבע בקרה (checksum) | checksum (SHA-256) | evidence |
| שחרור ההקפאה | release of hold | workflow |
| יומן גישה | access log | evidence |
| בית משפט | court | party |
| תיק | case / matter | core |
| נאמנות נתונים | data stewardship | evidence |
| תעודת הקפאה | hold certificate | output |

All 18 entries are exported via `HEBREW_GLOSSARY` and can be fed to
the global `locales/` dictionary pipeline (Y-081 i18n).

---

## 9. API Summary | סיכום API

```js
const { LegalHoldWorkflow } = require('./legal-hold-workflow');
const engine = new LegalHoldWorkflow({ now: () => Date.now() });

// Lifecycle
engine.initiateHold({ caseId, court, caseTitle, matter, custodians, scopeFilter, keywords, dateRange });
engine.sendCustodianNotice({ holdId, custodianId, lang });
engine.trackAcknowledgment({ holdId, custodianId, acknowledged, timestamp, notes });
engine.scopeDocuments(holdId, docStore);
engine.freezeDocument(holdId, docId);
engine.assertMutable(docId, op, actor);     // guardrail for external writes
engine.recordAccess(docId, { actor, op, reason });
engine.collectForProduction(holdId, { format, docStore });
engine.releaseHold(holdId, justification, approver);

// Monitoring
engine.escalation(holdId);
engine.inProgressHolds();
engine.reportToCourt(holdId);
engine.chainOfCustody(docId);
engine.listEvents();        // append-only audit log
engine.glossary();
engine.statusLabels();
```

---

## 10. Test Coverage | כיסוי מבחנים

Run: `node --test onyx-procurement/test/docs/legal-hold-workflow.test.js`

```
✔ 01 initiateHold — happy path
✔ 02 initiateHold — validation errors
✔ 03 sendCustodianNotice — bilingual letter + ack request
✔ 04 sendCustodianNotice — default Hebrew preferred body
✔ 05 trackAcknowledgment — append-only ack record
✔ 06 trackAcknowledgment — all custodians ack advances hold
✔ 07 scopeDocuments — filter + keywords + date range match
✔ 08 scopeDocuments — matched docs marked legalHold and frozen
✔ 09 freezeDocument — idempotent reaffirm
✔ 10 assertMutable — blocks modification on frozen docs
✔ 11 collectForProduction — manifest + per-doc SHA-256 + manifestChecksum
✔ 12 collectForProduction — rejects invalid format
✔ 13 releaseHold — preserves notices, acks, frozen docs, collections
✔ 14 releaseHold — requires justification and approver
✔ 15 escalation — triggers after 7 days of no ack
✔ 16 escalation — skips already-acknowledged custodians
✔ 17 inProgressHolds — excludes released holds
✔ 18 reportToCourt — Hebrew + English report with checksum
✔ 19 chainOfCustody — full trail ordering + manifest refs
✔ 20 event log — append-only monotonic sequence
✔ 21 glossary — Hebrew + English terms present

tests 21  pass 21  fail 0  duration ~110ms
```

**Exceeds 18-test minimum (21 tests shipped).**

---

## 11. Integration Points | נקודות אינטגרציה

| Upstream producer | How Y-115 consumes it |
|---|---|
| `doc-search.js` (Y-112) — document index | Pass an adapter to `scopeDocuments()` exposing `findAll()` |
| `doc-version-control.js` (Y-106) | Before committing any new revision, call `assertMutable(docId, 'revision', actor)` — a hold will throw `HOLD_IMMUTABLE` and preserve the prior revision untouched |
| `watermark.js` (Y-114) | Before re-stamping a watermarked copy, call `assertMutable(docId, 'watermark', actor)` |
| `audit-trail` (AG-98) | `listEvents()` returns the append-only event stream, ready to fan out into the global audit UI |
| `rbac` (AG-97) | Pass `req.user.id` to `recordAccess()` / `releaseHold()` so the actor appears in the court report |

| Downstream consumer | Output |
|---|---|
| Court production PDF pipeline | Feed `collectForProduction().entries` to the renderer |
| Legal dashboard | `inProgressHolds()` for the "active matters" widget |
| Compliance officer | `reportToCourt(holdId)` + `chainOfCustody(docId)` downloads |

---

## 12. Known Limitations & Future Work

1. **Persistence** — engine is in-memory. A future adapter layer
   could mirror `_holds`, `_notices`, `_acks`, `_frozenDocs`,
   `_collections`, and `_events` to Postgres/SQLite without
   changing the public API.
2. **Notice delivery** — `sendCustodianNotice()` produces the
   letter body but does not actually send email. Wire it to the
   existing notifier (Y-085 i18n + Y-063 mailer).
3. **Escalation cron** — `escalation()` is idempotent but must be
   invoked on a schedule (e.g., nightly) by the ops runbook.
4. **Court-specific export templates** — `reportToCourt()` returns
   a neutral bilingual summary. Specific court filing formats
   (e.g., Israeli Net HaMishpat XML) can be layered on top.

---

## 13. Sign-off

- Rule-compliance: **PASS**
- Test suite: **21/21 GREEN**
- Zero external deps: **CONFIRMED** (`node:crypto` only)
- Bilingual surface: **CONFIRMED** (notices, labels, glossary, report)
- Append-only audit: **CONFIRMED** (events, notices, acks, frozen-docs, collections)
- Complements Y-150 general hold without overlap: **CONFIRMED**

**Agent Y-115 — shipped.**
