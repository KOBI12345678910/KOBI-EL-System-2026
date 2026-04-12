# AG-Y133 — Polls / Quick-Surveys Engine

**Agent:** Y-133
**System:** Techno-Kol Uzi Mega-ERP
**Date:** 2026-04-11
**Status:** DELIVERED — 25 / 25 tests passing (`node --test test/comms/polls.test.js`, minimum required: 18)
**Siblings:** Y-134 feedback-collection (deeper qualitative + NPS), Y-135 bulletin-board, Y-132 internal-wiki, Y-121 email-templates

---

## 1. Summary / סיכום

| EN | HE |
|---|---|
| Y-133 delivers a zero-dependency **lightweight polls & quick-surveys engine** that complements Y-134's deeper feedback module. It supports five poll types (single-choice, multiple-choice, yes-no, rating 1-5, emoji), append-only vote logging, single-vote enforcement with optional changeable ballots, anonymous voting via deterministic per-poll salt hashing, audience targeting, discussion threads, banning with vote annotation (never deletion), JSON + CSV export with Hebrew safety, and live streaming-friendly result snapshots. | Y-133 מספק מנוע סקרים/משאלים מיידי בלי תלויות חיצוניות, המשלים את מודול המשוב העמוק (Y-134). תומך בחמישה סוגי סקר (בחירה יחידה, בחירה מרובה, כן/לא, דירוג 1-5, אמוג׳י), יומן הצבעות הוספה-בלבד, אכיפת הצבעה יחידה עם אפשרות לשינוי הצבעה, הצבעה אנונימית באמצעות גיבוב דטרמיניסטי עם מלח-לכל-סקר, פילוח קהל, שרשור תגובות, חסימת מצביע עם סימון (בלי מחיקה), יצוא JSON+CSV תומך עברית ותמונת-מצב חיה. |

**Immutable rules respected:**
- **"לא מוחקים רק משדרגים ומגדלים"** — every vote lives forever in an append-only log. `closePoll`, `ban`, `discussionThread('hide')`, and re-voting via `allowChange` all flip status fields (`counted` / `superseded` / `excluded` / `hidden`) but never remove data. Per-poll history and a global audit trail are also append-only.
- **Zero external deps** — only `node:test` + `node:assert/strict` in tests. The module itself has zero `require` calls. Hashing is a tiny djb2 variant implemented inline.
- **Hebrew RTL + bilingual labels** — every built-in option (yes/no, rating, emoji) ships as `{ id, he, en }`. Custom options accept either a plain string (reused for HE and EN) or a full `{id, he, en}` object. Result rows carry `label: { he, en }` so the UI can render RTL Hebrew next to LTR English without any extra lookups.

---

## 2. Files Delivered

| # | Path | Purpose | LOC |
|---|---|---|---|
| 1 | `onyx-procurement/src/comms/polls.js` | Pure JS polls engine (class `Polls`) + type catalogue + helpers | ~560 |
| 2 | `onyx-procurement/test/comms/polls.test.js` | Zero-dep test suite — 25 tests (minimum required: 18) | ~420 |
| 3 | `_qa-reports/AG-Y133-polls.md` | This report (bilingual) | — |

---

## 3. Public API

```js
const { Polls } = require('./src/comms/polls');
const polls = new Polls();
```

| Method | Signature | Notes |
|---|---|---|
| `createPoll` | `({id, question_he, question_en, type, options, audience, closesAt, allowMultiple, anonymous, createdBy, allowChange, allowComments}) → Poll` | Validates type, auto-populates HE/EN options for built-in types (yes-no, rating, emoji), stores poll in `ACTIVE` state. Rejects duplicate ids. |
| `castVote` | `({pollId, voterId, choices}) → Vote` | Appends entry to the vote log. Enforces single-vote unless `allowChange`; when allowed, prior ballot is marked `superseded` (not removed). Rejects unknown choice ids, banned voters, non-active polls. Hashes voterId when poll is anonymous. |
| `results` | `(pollId) → Results` | Counts + percentages per option, bilingual labels, `ratingAverage` for rating polls, `uniqueVoters`, state snapshot. |
| `liveResults` | `(pollId) → Snapshot` | Small, flat, versioned (`v: 1`) object suitable for SSE / polling / websocket broadcast. |
| `closePoll` | `(pollId, reason) → Poll` | Flips state to `CLOSED`, preserves everything. |
| `extendPoll` | `(pollId, newClosesAt) → Poll` | Extends deadline; if the poll was `EXPIRED` and the new deadline is in the future, reactivates it to `ACTIVE`. |
| `listActive` | `(audienceFilter?) → Poll[]` | Returns active polls; `audienceFilter` matches against `poll.audience` (or `'all'` which matches any audience). |
| `export` | `(pollId, format: 'json'\|'csv') → string` | JSON includes poll, full vote log, results, comments. CSV emits one row per choice for flat analytics (Hebrew is quoted when necessary). |
| `voterParticipation` | `(pollId) → Participation` | `uniqueVoters / audienceSize` when `setAudienceSize` was called, otherwise `uniqueVoters / uniqueVoters = 100%`. |
| `discussionThread` | `(pollId, action, payload)` | `action`: `list` (default), `add {userId, text, parentId?}`, `hide {commentId, reason}`. Hide flips status, doesn't remove. |
| `ban` | `(pollId, voterId, reason) → BanResult` | Adds voter to ban set; every prior vote is annotated `status: 'excluded'` with `excludeReason`; original choices preserved verbatim. |
| `history` | `(pollId) → AuditEntry[]` | Per-poll append-only audit log (create, vote, close, extend, ban, discussion events). |
| `setAudienceSize` | `(pollId, size) → Poll` | Optional helper to record the denominator used by `voterParticipation`. |
| `getPoll` / `getVotes` / `stats` | helpers | Introspection. |

Exported constants / helpers: `POLL_TYPES`, `POLL_STATE`, `DEFAULT_YES_NO`, `DEFAULT_RATING`, `DEFAULT_EMOJI`, `anonymizeVoter`, `djb2Hash`, `csvEscape`, `normalizeOptions`.

---

## 4. Poll Types / סוגי סקרים

| Type | HE | EN | Options source | Multi? | Typical use |
|---|---|---|---|---|---|
| `single-choice`   | בחירה יחידה    | Single choice    | user-supplied (≥2) | no                | "איזה תפריט לבחור לאירוע?" |
| `multiple-choice` | בחירה מרובה    | Multiple choice  | user-supplied (≥2) | yes (when `allowMultiple:true`) | "אילו ימים נוחים לפגישה?" |
| `yes-no`          | כן / לא         | Yes / No         | built-in (`yes`, `no`) | no | "לאשר את פרוטוקול הישיבה?" |
| `rating`          | דירוג 1-5       | Rating 1-5       | built-in (`1..5`)  | no                | "דרג את ארוחת הצהריים" |
| `emoji`           | תגובת אמוג׳י   | Emoji reaction   | built-in (👍❤😂😮😢👎) | no              | "איך היה האירוע?" |

Custom options accept either:
- A plain string (reused as both `he` and `en` label, auto-assigned `opt-N` id), or
- A full object `{ id?, he, en }` — when `id` is omitted it defaults to `opt-N`.

Choice IDs in `castVote({choices})` must match one of the option `id`s. De-dup is applied within a single ballot.

---

## 5. Vote Rules / כללי הצבעה

| Rule | Behaviour |
|---|---|
| **Single-vote** (default) | A voter casts at most one ballot per poll. A second call throws `voter has already cast a vote for this poll`. |
| **Changeable** (`allowChange: true`) | The voter may re-vote; the prior entry's status flips to `superseded` and carries `supersededBy` / `supersededAt`. Append-only: nothing is removed. Only the newest counted ballot is tallied. |
| **Multiple selections** | Allowed only when the type is `multiple-choice` AND `allowMultiple: true`. Other types accept a single choice string or a one-element array. |
| **Validation** | Unknown choice ids, empty ballots, and votes on non-`ACTIVE` polls all throw clearly. |
| **Banned voters** | May not cast new votes; their existing votes remain in the log with `status: 'excluded'` and the supplied `reason`. |
| **State gates** | Only polls in state `ACTIVE` accept votes. Polls with a past `closesAt` are auto-flipped to `EXPIRED` on any read and new votes are rejected. `extendPoll` with a future deadline can revive them. |

**Vote status lifecycle (append-only):**
```
counted ──(allowChange re-vote)──▶ superseded
counted ──(ban annotation)──────▶ excluded
```
No transition ever removes a row.

---

## 6. Anonymous Model / מודל אנונימיות

- Opt-in via `anonymous: true` at `createPoll` time.
- On every vote, `voterId` is hashed as `anon-<djb2(pollId + '::' + voterId)>`:
  - **Per-poll salted** — the same person appears as a different key across polls, preventing cross-poll correlation.
  - **Deterministic** — the same voter on the same poll always produces the same key, so single-vote enforcement still works.
  - **Raw id is not stored** — `voterIdRaw` is set to `null` and never appears in the JSON/CSV export.
- Comments on anonymous polls are also hashed via the same function.
- **Caveat (intentional):** djb2 is not cryptographic. Y-134 (feedback-collection) handles the stronger privacy tier that involves pseudonymous tokens + longer-lived secret salts. Y-133 is explicitly the *lightweight instant-poll* flavour — fast, in-memory, good for a live shop-floor pulse.

---

## 7. Append-only Proof / הוכחת הוספה-בלבד

| Operation | What it does | What it never does |
|---|---|---|
| `closePoll` | Sets `state=CLOSED`, `closedAt`, `closedReason`. | Does not remove votes, comments, or poll row. |
| `allowChange` re-vote | Appends a fresh entry, marks the prior entry `superseded` with back-pointer. | Does not mutate the prior entry's `choices`, `ts`, or `voteId`. |
| `ban` | Adds voter to ban set, annotates each prior vote `excluded` + `excludeReason`. | Does not delete the vote or alter `choices`. |
| `discussionThread('hide')` | Flips comment `status=hidden`, records `hiddenReason` + `hiddenAt`. | Does not remove the comment row. |
| `extendPoll` on expired | Flips `state=ACTIVE`, clears `expiredAt`, updates `closesAt`. | Does not touch existing votes. |
| Auto-expiry | Flips `state=EXPIRED`, sets `expiredAt`. | Does not touch existing votes. |

Tests 9, 12, 16, 17, 19, 21 and 22 exercise these invariants directly.

---

## 8. Hebrew Glossary / מילון עברי

| HE | EN | Used in |
|---|---|---|
| סקר | poll | everywhere |
| שאלה | question | `question_he` |
| אפשרות | option | `options[]` |
| הצבעה / בלוט | vote / ballot | `castVote`, vote log |
| מצביע | voter | `voterId`, `voterKey` |
| אנונימי | anonymous | `anonymous` flag |
| בחירה יחידה | single choice | `POLL_TYPES['single-choice'].he` |
| בחירה מרובה | multiple choice | `POLL_TYPES['multiple-choice'].he` |
| כן / לא | yes / no | `POLL_TYPES['yes-no'].he` |
| דירוג 1-5 | rating 1-5 | `POLL_TYPES['rating'].he` |
| תגובת אמוג׳י | emoji reaction | `POLL_TYPES['emoji'].he` |
| פתוח / פעיל | active | `POLL_STATE.ACTIVE` |
| סגור | closed | `POLL_STATE.CLOSED` |
| פג תוקף | expired | `POLL_STATE.EXPIRED` |
| ספור | counted | vote status |
| הוחלף | superseded | vote status after re-vote |
| הוחרג | excluded | vote status after ban |
| הוסתר | hidden | comment status |
| חסימה | ban | `ban()` |
| השתתפות | participation | `voterParticipation()` |
| קהל יעד | audience | `audience[]` |
| יצוא | export | `export()` |
| תמונת מצב חיה | live snapshot | `liveResults()` |
| שרשור דיון | discussion thread | `discussionThread()` |
| יומן ביקורת | audit log | `history()` |
| הוספה-בלבד | append-only | internal invariant |

---

## 9. Test Coverage / כיסוי בדיקות

```
$ node --test test/comms/polls.test.js

✔ constants export and include all 5 poll types
✔ createPoll: single-choice with Hebrew options
✔ createPoll: multiple-choice enables allowMultiple
✔ createPoll: yes-no auto-populates HE/EN options
✔ createPoll: rating 1-5 yields 5 options and computes average
✔ createPoll: emoji yields emoji options with HE labels
✔ castVote: happy path + rejects invalid choice
✔ single-vote enforcement: second vote throws unless allowChange
✔ allowChange: re-voting supersedes (append-only) prior ballot
✔ results: counts + percentages for single-choice
✔ results: multi-select percentages are computed on total picks
✔ closePoll: flips state, preserves votes, no data loss
✔ anonymous mode: voterId is hashed, raw id not stored
✔ export: JSON contains poll, votes, results, comments
✔ export: CSV has header + one row per choice, escapes Hebrew safely
✔ ban: annotates existing vote as excluded, never deletes
✔ history: append-only audit for create, vote, close, ban
✔ listActive: filters by audience and excludes closed polls
✔ extendPoll: reactivates an expired poll with a future closesAt
✔ voterParticipation: computes % against declared audienceSize
✔ discussionThread: add + hide preserves (לא מוחקים)
✔ liveResults: streaming snapshot shape
✔ createPoll: duplicate id throws
✔ normalizeOptions: single-choice with <2 options throws
✔ stats: reports counts across lifecycle

ℹ tests 25
ℹ pass 25
ℹ fail 0
ℹ duration_ms ~96
```

**Required minimum: 18 tests.** **Delivered: 25.**

Every required coverage bucket from the spec is present:

| Required bucket | Test(s) |
|---|---|
| All 5 poll types | 1, 2, 3, 4, 5, 6 |
| Vote casting | 7 |
| Single-vote enforcement | 8, 9 |
| Results computation | 10, 11 |
| Close-poll preserves record | 12 |
| Anonymous hashing | 13 |
| Export JSON | 14 |
| Export CSV | 15 |
| Ban preserves original | 16 |

Additional coverage: audit history, audience filter, extend/expire flow, participation, discussion thread, live snapshot, duplicate-id guard, normalise-options guard, stats rollup.

---

## 10. Integration Notes / הערות אינטגרציה

- **Y-134 (feedback-collection):** Y-133 is the *light* half. Long-form surveys with conditional branching, NPS, attachments and encrypted PII belong to Y-134. Y-133 stays lean for live shop-floor pulse polls ("איזה תפריט לבחור היום?").
- **Y-135 (bulletin-board):** Polls can be embedded as bulletin-board post attachments — the board would render a `liveResults()` snapshot in place of static text, refreshed on rotation.
- **Y-121 (email-templates):** When a poll closes, Y-121 can dispatch a results digest via the standard email template pipeline using `polls.export(pollId, 'json')` as the payload.
- **Storage:** In-memory Maps only (as required). A future persistence layer should serialise the four Maps (`polls`, `votes`, `voters`, `bans`) plus the per-poll `_history` and `comments` Maps — nothing outside those containers is canonical state. The global `globalLog` is a redundancy convenience and can be derived from per-poll histories.

---

## 11. Conformance Matrix / מטריצת עמידה בדרישות

| Spec requirement | Location | Status |
|---|---|---|
| Zero external deps | `polls.js` has zero `require` calls | ✓ |
| Hebrew RTL + bilingual labels | `POLL_TYPES`, built-in options, `results()` row labels | ✓ |
| Class `Polls` with all listed methods | `src/comms/polls.js` | ✓ |
| 5 poll types | `single-choice`, `multiple-choice`, `yes-no`, `rating`, `emoji` | ✓ |
| Append-only vote log | `this.votes: Map<pollId, Array>`, no deletions anywhere | ✓ |
| Single-vote enforcement (configurable) | `allowChange` flag, prior ballot marked `superseded` | ✓ |
| Bilingual result labels | `results().options[].label = {he, en}` | ✓ |
| Streaming-friendly snapshot | `liveResults()` versioned flat object | ✓ |
| Close preserves record | `closePoll()` flips state only | ✓ |
| Extend poll | `extendPoll()` + reactivation of expired polls | ✓ |
| Audience filter in listActive | `listActive(audienceFilter)` + `'all'` wildcard | ✓ |
| Export JSON + CSV | `export(pollId, 'json'\|'csv')`, Hebrew-safe CSV quoting | ✓ |
| voterParticipation | `voterParticipation()` with optional `setAudienceSize` | ✓ |
| discussionThread | `discussionThread(pollId, action, payload)` (list/add/hide) | ✓ |
| Ban — audit-logged, preserves original | `ban()` annotates via status+reason, emits audit entry | ✓ |
| History append-only | `history(pollId)` + per-poll Map | ✓ |
| Hebrew RTL options supported | tests 2, 3, 4, 10, 15 | ✓ |
| Anonymous mode hashes voterId | `anonymizeVoter()` + test 13 | ✓ |
| `node --test` passes | 25/25 | ✓ |
| ≥18 tests | 25 tests | ✓ |
| Bilingual QA report | this file | ✓ |

---

## 12. Known Limitations / מגבלות ידועות

1. **No cryptographic anonymity** — djb2 + a per-poll salt prevents casual correlation; a motivated attacker with the voter-id space could still brute-force. This is a deliberate trade-off for the *instant-poll* tier. Use Y-134 for survey-grade privacy.
2. **In-memory only** — as required by the spec. Persistence is a layer above this module's responsibility.
3. **Comments are flat by status**, not threaded by `parentId` visibility (parentId is stored but listing doesn't nest). Y-134 owns richer threading.
4. **Audience membership is string-matched** — actual RBAC resolution is delegated to the consuming app. A poll with `audience: ['shop-floor']` simply means: "show to users whose group includes `shop-floor`".

---

## 13. How to Run / הפעלה

```bash
# From repo root
cd onyx-procurement
node --test test/comms/polls.test.js
```

Expected: `tests 25`, `pass 25`, `fail 0`.

---

**Delivered — לא מוחקים רק משדרגים ומגדלים.**
