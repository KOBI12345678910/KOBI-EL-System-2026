# AG-Y096 — Unified Customer Communication Log

**Agent:** Y-096
**Owner:** Techno-Kol Uzi Mega-ERP (Kobi EL 2026)
**Date:** 2026-04-11
**Status:** DELIVERED
**Rule:** לא מוחקים רק משדרגים ומגדלים — NEVER DELETE, ONLY UPGRADE

---

## 1. Files delivered

| File | Purpose |
|------|---------|
| `onyx-procurement/src/customer/comm-log.js` | Zero-dependency `CommLog` class — unified cross-channel customer communication log |
| `onyx-procurement/test/customer/comm-log.test.js` | 40 unit tests — all passing |
| `_qa-reports/AG-Y096-comm-log.md` | This report |

**Test result:** 40 / 40 passing

```
node --test test/customer/comm-log.test.js
...
ℹ tests 40
ℹ pass 40
ℹ fail 0
ℹ duration_ms ~130
```

Zero external dependencies. Pure Node. Runs on Node ≥ 16 (uses only
built-in `node:test` / `node:assert` / `Map` / `Set`).

---

## 2. Motivation — why a unified log

The Techno-Kol Uzi sales + support + project teams each had their own
"system of record" — Gmail threads, WhatsApp business, a call-recording
vendor, a chat widget, handwritten meeting notes. When a customer called
to follow up on an issue, nobody could see the whole picture.

`CommLog` is the single place every inbound and outbound interaction is
written to, regardless of channel. When a rep opens a customer profile,
they see ONE chronological feed.

Also — **GDPR / Israeli Privacy Law תיקון 13** explicitly requires us to
be able to:
1. Export the full subject-access record of a person (art.15 / §13).
2. Erase personal data on request (§17ה).
3. Still keep tax + legal records for statutory retention periods.

Having a single log makes all three duties actually answerable.

---

## 3. Exported API surface

`CommLog` class:

| Method | Description |
|--------|-------------|
| `logCommunication({...})` | Append a new cross-channel interaction. Validates `channel` + `direction`, normalises tags, sets sentiment, mirrors to X-21 ticket if `relatedTo.ticketId` is set and `ticketingService` injected. |
| `timeline(customerId, {limit, from, to, channel})` | Chronological desc feed across all channels for one customer. |
| `threadMessages({subject})` | Groups all messages sharing a normalised subject (strips `Re:`, `Fwd:`, `תגובה:`, bracket-tags) into one thread, sorted ascending. |
| `search({query, customerId?, channel?, dateRange?})` | Full-text search with inverted index (AND semantics). Supports Latin + Hebrew. TF-scored. |
| `sentiment({customerId, period})` | Returns `{positive, neutral, negative, score, n, trend}` where trend ∈ `improving` / `declining` / `flat`. |
| `responseTime({customerId, period})` | Average minutes between each inbound and the next outbound within 7 days. |
| `lastTouch(customerId)` | `{days, last}` — days since last non-erased comm + snapshot. |
| `summarizeInteraction(commId)` | Bilingual TL;DR: `{summary, summary_he, summary_en, length, sentiment}`. No LLM — keyword + sentence-splitting heuristic. |
| `exportHistory(customerId)` | Full JSON export with legal basis header for data-subject access requests. |
| `gdprErase(customerId, confirmErase, reason?)` | **EXPLICIT** `confirmErase=true` required. Pseudonymises content (body, subject, from, to, attachments, tags) **without deleting the row**. Updates search index, logs to history, fires `comm.gdpr_erased` event. Idempotent. |
| `assign(commId, agentId, userId?)` | Assign a specific comm to an agent for follow-up. |
| `get(commId)` | Fetch by id. |
| `stats(customerId?)` | Counts: total, by_channel, by_direction, erased_count. |

Also exported:
`InMemoryCommStore`, `CHANNELS`, `CHANNEL_LIST`, `DIRECTIONS`,
`DIRECTION_LIST`, `OUTCOMES`, `SENTIMENTS`, `SENTIMENT_LEXICON`,
`COMM_LABELS_HE`, helpers (`normalizeSubject`, `tokenize`,
`computeSentiment`, `shortSummary`, `hasHebrew`, `toMs`), plus `__smoke`.

---

## 4. Record schema

Every row produced by `logCommunication()`:

```js
{
  id:          'comm_<base36>_<seq>',       // never reused
  customer_id: 'cust_001',
  channel:     'email' | 'phone' | 'sms' | 'whatsapp'
             | 'meeting' | 'chat' | 'letter' | 'in-person',
  direction:   'inbound' | 'outbound',
  from:        'dana@example.co.il',
  to:          'support@technokol.co.il',
  subject:     'Invoice issue — חשבונית שגויה',
  body:        '...free text, Hebrew or English...',
  outcome:     'answered' | 'no-answer' | 'voicemail' | 'bounced'
             | 'delivered' | 'read'      | 'replied'   | 'scheduled'
             | 'cancelled' | 'completed' | 'unknown',
  duration:    300,                         // seconds — calls / meetings
  tags:        ['billing', 'urgent'],       // lowercased, dashed
  attachments: [
    { id, name, ref, mime, size }           // no blobs stored — refs only
  ],
  related_to: {
    opp_id:     'opp_12'  | null,           // CRM pipeline
    ticket_id:  'tkt_42'  | null,           // X-21 ticketing
    project_id: 'prj_07'  | null,           // project management
  },
  created_at:  '2026-04-11T10:30:00.000Z',  // when interaction occurred
  logged_at:   '2026-04-11T10:31:02.000Z',  // when we wrote the row
  created_by:  'agent_dan',
  assignee:    'agent_lea'  | null,
  thread_key:  'invoice issue',             // derived — stable across re:/fwd:
  sentiment:   'positive' | 'neutral' | 'negative',

  // PDPL — never delete, only pseudonymise
  erased_at:     null,
  erased_by:     null,
  erase_reason:  null,

  history: [
    { at, by, action: 'logged' | 'assign' | 'gdpr_erase', note }
  ],
}
```

---

## 5. Search indexing strategy

Pure-JS inverted index, maintained in-memory by `CommLog._index`:

- **Tokeniser:** `/[a-z0-9\u00C0-\u024F\u0590-\u05FF]{2,}/gi`
  Covers Latin, extended Latin (accented), digits, and the full Hebrew
  block (U+0590 – U+05FF). Minimum token length 2 drops noise like `a`,
  `to`, `ב` but keeps `bi`, `ok`, `בי`.
- **Fields indexed:** `subject` + `body` + stringified `tags`.
- **Posting lists:** `Map<token, Set<commId>>` — O(1) lookup, O(k)
  intersection for AND queries.
- **Query semantics:** AND — every term in the query must appear in
  the row. Empty query returns everything (then filtered).
- **Scoring:** simple TF over the query string. Subject hits weighted
  3×, body hits 1×, per-token bonuses for subject (1) and body (0.5).
- **Auxiliary indexes:**
  - `_byCustomer: Map<customer_id, Set<commId>>` — O(1) timeline lookup.
  - `_threads: Map<thread_key, Set<commId>>` — `threadMessages()` fetch.
- **Re-indexing:** `gdprErase()` calls `_reindexRow()` so erased content
  is immediately removed from the search index (verified by tests
  `gdprErase removes content from search index`).

### Complexity

| Operation | Time |
|-----------|------|
| `logCommunication` | O(tokens) |
| `search(single-term)` | O(posting-list) |
| `search(multi-term AND)` | O(k) where k = size of smallest posting list |
| `timeline` | O(customer_size + sort) |
| `threadMessages` | O(thread_size + sort) |

No RegExp scans over the full store on the hot path.

---

## 6. Sentiment analysis

Zero-ML, deterministic, bilingual lexicon under `SENTIMENT_LEXICON`:

- **Positive EN:** thanks, great, excellent, perfect, love, awesome,
  pleased, happy, satisfied, resolved, solved, appreciate, wonderful,
  amazing, best, good, nice, fine, smooth, fantastic.
- **Positive HE:** תודה, מעולה, מצוין, מושלם, נהדר, אוהב, שמח, מרוצה,
  נפתר, פתרון, נעים, טוב, יפה, יופי, סבבה, מדהים, מקצועי, מומלץ,
  בסדר, סחתיין, תותחים.
- **Negative EN:** angry, terrible, awful, broken, bad, worst, delay,
  problem, issue, bug, error, fail, disappointed, complaint, refund,
  cancel, not working, useless, poor, unacceptable.
- **Negative HE:** כועס, זועם, גרוע, איום, נורא, רע, בעיה, באג, תקלה,
  שגיאה, איחור, עיכוב, מאוכזב, תלונה, החזר, ביטול, לא עובד, חוצפה,
  לא מקצועי.

Scoring: count substring hits from each list → positive if `pos > neg`,
negative if `neg > pos`, neutral otherwise.

Trend detection (inside `sentiment()`): if ≥ 4 samples in the period,
compute average sentiment score of first half vs second half of the
chronological window; delta > 0.15 → `improving`, < -0.15 → `declining`,
else `flat`. Verified by test `sentiment detects improving trend`.

---

## 7. PDPL / GDPR erase note — תיקון 13 compliance

This is the load-bearing bit of the module and why the rule
"**לא מוחקים רק משדרגים ומגדלים**" and Israeli Privacy Law §17ה are
not in tension.

### The legal framing

- **חוק הגנת הפרטיות, התשמ"א-1981** (Protection of Privacy Law, 1981)
  §17ה requires a database owner to honour a data-subject's request
  to delete their personal data, **subject to statutory retention
  duties** (tax, audit, legal holds, ongoing disputes).
- **תיקון 13** (Amendment 13, 2024→2025) strengthens enforcement and
  increases administrative penalties for non-compliance, and requires
  documented handling of every erase request.
- **GDPR art.17** (right to erasure) is the analogous EU framework.
- **תיקון 13 §17ה(ב)** explicitly preserves the right to keep data for
  statutory retention — e.g. invoices must be kept 7 years (פקודת מס
  הכנסה, §130א & תקנה 25 לתקנות מס הכנסה).

### How `gdprErase()` implements this

1. **Explicit confirmation flag.** Calling
   `gdprErase(customerId)` or `gdprErase(customerId, false)` throws
   with an explicit error message — no accidental mass-erase.
   Verified by test `gdprErase REFUSES without explicit confirmErase=true`.

2. **Pseudonymisation, NOT deletion.** Every personal content field
   on every matching row is replaced with `[erased]`:
   - `subject`, `body`, `from`, `to`
   - `attachments` → empty array
   - `tags` → empty array

   The row itself — id, customer_id, channel, direction, timestamps,
   history, related_to — stays in place so audit, legal, tax, and the
   rule *"never delete"* are all satisfied.

3. **`erased_at`, `erased_by`, `erase_reason`** are set so the state
   is machine-checkable (e.g. `sentiment` and `responseTime` both skip
   erased rows; `search()` returns zero hits after erase).

4. **Search-index re-sync.** `_reindexRow()` removes the erased row's
   tokens from the inverted index. Verified by test
   `gdprErase removes content from search index`.

5. **History log entry.** A `gdpr_erase` history row with the reason
   is appended so we can prove in an audit when and why the erase
   was performed.

6. **Idempotent.** A second call is a no-op (`erased_count = 0`).
   Verified by test `gdprErase is idempotent`.

7. **Export still returns the row** post-erase, with `body: '[erased]'`
   and `erased_at` set — so the data subject can be shown exactly what
   fields still exist under statutory retention and what has been
   purged. Verified by test `gdprErase pseudonymises content but NEVER
   removes rows`.

### Retention-compliance trail

`gdprErase()` returns:

```json
{
  "customer_id": "...",
  "erased_count": 3,
  "erased_ids": ["comm_0001", "comm_0002", "comm_0003"],
  "erased_at": "2026-04-11T10:31:02.000Z",
  "retention_note": "Records are pseudonymised, NOT deleted — legal retention duties under חוק הגנת הפרטיות §17ה continue to apply."
}
```

This payload is intended to be stored in a separate `erase_requests`
audit log (not part of this module) so the organisation can produce it
to the data-subject and to the רשות הגנת הפרטיות if asked.

---

## 8. X-21 Ticketing bridge

When `relatedTo.ticketId` is present on a new comm AND a
`ticketingService` is injected into the `CommLog` constructor, the
module automatically mirrors the comm as an **internal** comment on
the ticket:

```js
ticketingService.addComment(
  row.related_to.ticket_id,
  {
    body: `[${row.channel} · ${row.direction}] ${row.subject}\n${row.body}`,
    author: row.created_by,
  },
  true,  // internal
);
```

Mirror failures are swallowed (fail-open) — logging a comm must never
break because a downstream ticket-service is down. Verified by tests
`ticketingService receives internal comment when ticketId present`
and `ticket mirror failure does NOT break logging`.

---

## 9. Bilingual Hebrew glossary

Full bilingual coverage for Hebrew RTL UI. Exported as `COMM_LABELS_HE`.

| Code | English | Hebrew |
|------|---------|--------|
| `email` | Email | דוא"ל |
| `phone` | Phone call | שיחת טלפון |
| `sms` | SMS | הודעת SMS |
| `whatsapp` | WhatsApp | וואטסאפ |
| `meeting` | Meeting | פגישה |
| `chat` | Chat | צ'אט |
| `letter` | Letter | מכתב |
| `in-person` | In person | פגישה פרונטלית |
| `inbound` | Inbound | נכנס |
| `outbound` | Outbound | יוצא |
| `positive` | Positive | חיובי |
| `neutral` | Neutral | ניטרלי |
| `negative` | Negative | שלילי |
| `customer_id` | Customer | לקוח |
| `subject` | Subject | נושא |
| `body` | Body | תוכן |
| `outcome` | Outcome | תוצאה |
| `duration` | Duration | משך |
| `tags` | Tags | תגיות |
| `attachments` | Attachments | קבצים מצורפים |
| `created_at` | Time | זמן |
| `assignee` | Assignee | מטפל |
| `sentiment` | Sentiment | רגש |
| `related` | Related to | קשור ל |
| `erased_at` | Erased at | נמחק בתאריך |
| `log` action | Log communication | תיעוד תקשורת |
| `assign` action | Assign for follow-up | שיוך לטיפול |
| `search` action | Search | חיפוש |
| `erase` action | PDPL erase | מחיקה לפי חוק הגנת הפרטיות |
| `export` action | Export history | ייצוא היסטוריה |
| `summarize` action | Summarise | סיכום קצר |

### Channel icons (visual hint for UI layer)

The React dashboard layer should use:

| Channel | Icon hint | RTL note |
|---------|-----------|----------|
| email | ✉ | — |
| phone | 📞 | — |
| sms | 💬 | — |
| whatsapp | 🟢 | — |
| meeting | 👥 | — |
| chat | 💭 | — |
| letter | ✉️ | — |
| in-person | 🏢 | — |

(Icons not shipped in the backend module — UI layer owns presentation.)

---

## 10. Test coverage map

The 40 tests exercise every public method plus each helper:

| Area | Tests |
|------|-------|
| Helpers (normalizeSubject, tokenize, computeSentiment, shortSummary, hasHebrew, labels) | 6 |
| `logCommunication` validation + happy-path | 4 |
| `timeline` (chronology, limit, from/to, channel filter) | 3 |
| `threadMessages` (English + Hebrew) | 2 |
| `search` (basic, AND intersection, Hebrew, dateRange, channel filter) | 5 |
| `sentiment` (counts, improving trend) | 2 |
| `responseTime` (avg, empty) | 2 |
| `lastTouch` (days, unknown customer) | 2 |
| `summarizeInteraction` (Hebrew + English) | 2 |
| `exportHistory` (happy-path, missing id) | 2 |
| `gdprErase` (refuses w/o flag, pseudonymisation, index re-sync, idempotent) | 4 |
| `assign` (happy-path, missing id) | 2 |
| X-21 Ticket mirror (success + failure) | 2 |
| `stats` aggregation | 1 |
| `onEvent` audit hook | 1 |

Deterministic — every test uses an injected `clock` + `idGen` so IDs
and timestamps are stable across runs.

---

## 11. Operational notes

- **Storage pluggability.** Default in-memory store. Provide any object
  with `{insert, get, update, all}` to back the log by Supabase,
  Postgres, Redis, etc. — the class does not care.
- **Audit hook.** Pass `onEvent: (evt, payload) => …` to fan out to
  your structured logger (`src/ops/logger.js`, the one exported by
  Agent X-51).
- **Never-delete guarantee.** There is no `delete()` method anywhere
  in the module. The only way to purge content is `gdprErase()` which
  pseudonymises. Attempting `store._rows.delete(id)` is an intentional
  leak path for emergency ops and is **not** part of the public API.
- **Clock injection.** `clock` can return a number (ms) or a `Date`.
  Tests rely on this.
- **Attachments are references, not blobs.** The module stores
  `{id, name, ref, mime, size}`. Blob storage is the caller's job
  (typically Supabase Storage or S3) — good separation of concerns.

---

## 12. Rule compliance summary

| Rule | Status |
|------|--------|
| לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade | YES — `gdprErase()` pseudonymises in-place, never drops rows; no `delete()` in public API. |
| Zero external dependencies | YES — pure Node, uses only `Map`, `Set`, `Date`, `Math`, `RegExp`. |
| Bilingual (Hebrew RTL + English) | YES — `COMM_LABELS_HE`, Hebrew-aware tokeniser, bilingual sentiment lexicon, bilingual TL;DR. |
| Integrates with X-21 ticketing | YES — optional `ticketingService` opt mirrors to internal ticket comment, fail-open. |
| Test coverage: logging, timeline, threading, search, sentiment, response time, erase confirmation | YES — 40 / 40 tests passing. |
| Israeli Privacy Law תיקון 13 compliance | YES — explicit `confirmErase=true` required, structured erase response with legal-basis note, history logged. |

---

## 13. Future upgrade slots (no deletions, only upgrades)

Tracked here so the next agent continues adding rather than replacing:

- LLM-backed `summarizeInteraction()` — add `opts.summarizer` hook that
  returns `{ he, en }` when provided, falling back to the keyword
  heuristic.
- ANN / fuzzy-matching thread linker — e.g. group by embedding
  similarity rather than just normalized subject, backed by new
  `opts.threadResolver`.
- Delivery-status webhooks — accept `onUpdate({id, outcome})` patches
  from email/SMS providers to upgrade an outbound comm's `outcome`
  from `scheduled` → `delivered` → `read`.
- Attachment AV scan — pluggable `opts.avScanner` hook.
- Call transcript ingestion — extend `logCommunication()` to accept
  `transcript: { provider, segments: [...] }` and append it to `body`.
- BM25 scoring — replace the current TF heuristic in `search()` with
  a proper BM25 ranker, keeping the same inverted-index structure.

None of these remove existing behaviour. They are all additive.

---

**Delivered by Agent Y-096, 2026-04-11. Never delete — only upgrade.**
