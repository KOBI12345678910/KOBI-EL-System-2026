# AG-Y134 — Internal Employee Feedback Collection Engine
**Agent:** Y-134
**System:** Techno-Kol Uzi • Onyx-Procurement / HR
**Scope:** Lightweight pulse surveys, suggestion box, team retros
**Distinct from:** Y-067 (360° feedback) — that one is a formal multi-rater review cycle; this one is fast-cycle employee voice.
**Status:** GREEN — 23/23 tests passing (minimum required: 18)
**Run:** `node --test test/hr/feedback-collection.test.js`
**Date:** 2026-04-11

---

## 1. Files delivered / קבצים שהוגשו

| Path | Role / תפקיד |
|---|---|
| `onyx-procurement/src/hr/feedback-collection.js` | Engine — class + helpers |
| `onyx-procurement/test/hr/feedback-collection.test.js` | 23 unit tests on `node:test` |
| `_qa-reports/AG-Y134-feedback-collection.md` | This report |

**Zero external deps** — only `node:crypto` (stdlib).
**Append-only** — every store is a `Map` / `Array`; no delete path exists.
**Immutable rule:** לא מוחקים רק משדרגים ומגדלים.

---

## 2. Architecture / ארכיטקטורה

```
FeedbackCollection
├── Pulse surveys   (≤ 5 questions, TTL, anonymous option)
├── Suggestion box  (category, vote, append-only review history)
├── Retros          (start / stop / continue / action — action → tasks)
├── Analytics       (sentiment, trend, escalation)
└── anonymityGuard  (k=3 self-audit)
```

In-memory stores:

| Map | Purpose |
|---|---|
| `surveys` | survey definitions |
| `responses` | response rows per survey |
| `suggestions` | suggestion definitions |
| `suggestionVotes` | voter-hash → vote (one per user) |
| `suggestionReviews` | append-only review history |
| `retros` | retro session definitions |
| `retroItems` | retro items per session |
| `retroByTeam` | team → retroId ordering |
| `escalations` | append-only HR alert log |
| `tasks` | action items promoted from closed retros |

---

## 3. Pulse-survey guidelines / הנחיות לסקרי דופק

**עברית:**
- סקר דופק הוא קצר ותדיר — עד 5 שאלות, תדירות שבועית / דו-שבועית.
- מומלץ לפחות שאלת דירוג אחת (1..5) + שאלת טקסט חופשי.
- במצב אנונימי (`anonymous: true`) לא נשמר מזהה עובד אלא רק האש חד-כיווני עם מלח ייחודי לסקר.
- מינימום 3 משיבים (k=3) כדי להציג תוצאות בסקר אנונימי — אחרת האגרגציה מוחזרת כ-`redacted`.
- `ttlDays` קובע את תאריך התפוגה — הסקר נשאר במערכת לצורך היסטוריה גם אחרי שפג.

**English:**
- A pulse is short and frequent — max 5 questions, weekly / bi-weekly cadence.
- Prefer at least one rating question (1..5) plus one open-text question for qualitative signal.
- In anonymous mode no employee ID is stored on responses — only a salted one-way hash.
- At least 3 respondents (k=3) are needed to reveal results from an anonymous pulse; otherwise aggregates return `redacted=true`.
- `ttlDays` sets the expiration date; the survey stays in the store for historical trend analysis after expiry (append-only).

### Example / דוגמה
```js
fb.launchPulseSurvey({
  id: 'pulse-2026-w15',
  questions: [
    { id: 'q1', text_he: 'איך הרגשת השבוע?',   text_en: 'How did you feel this week?', type: 'rating', scale: 5 },
    { id: 'q2', text_he: 'האם עומס העבודה סביר?', text_en: 'Is your workload reasonable?', type: 'rating', scale: 5 },
    { id: 'q3', text_he: 'הערות חופשיות',       text_en: 'Open comments',                type: 'text' },
  ],
  audienceFilter: { team: 'ops' },
  anonymous: true,
  ttlDays: 7,
});
```

---

## 4. Anonymity model / מודל האנונימיות

**Guarantees / הבטחות:**

1. **Hash-only storage (אחסון האש בלבד):**
   Anonymous response rows never carry a raw `employeeId`. Only `anonymousHash = HMAC-SHA256(salt || ':' || surveyId, employeeId).slice(0,24)` is persisted. The salt is random per engine instance (injectable in tests).

2. **k-Anonymity (k=3):**
   `CONSTANTS.K_ANONYMITY = 3`. Any anonymous aggregate with fewer than 3 responses is returned with `redacted: true` and null averages/distributions. The UI must display the bilingual notice `LABELS.*.anonymity_note`.

3. **Vote uniqueness (הצבעה אחת לאדם):**
   Suggestion votes are keyed by `HMAC(salt||':vote', voterId)`. A duplicate vote throws — the engine does not quietly upsert.

4. **Self-audit (`anonymityGuard()`):**
   A self-test that scans every anonymous survey, suggestion and retro item for leaks. Returns `{ ok, k, violations[] }` with violation kinds:
   - `anon-leak-employeeId` — raw employeeId on anonymous pulse row
   - `anon-missing-hash` — anonymous row with no hash
   - `k-anonymity-risk` — anonymous cohort < 3
   - `anon-leak-suggestion` — submitterId on anonymous suggestion
   - `anon-leak-retro` — author on anonymous retro item

| Threat | Mitigation |
|---|---|
| Re-identification via small cohort | k=3 redaction |
| Identity linkage across surveys | Salted HMAC per surveyId |
| Duplicate-vote ballot stuffing | Hash-keyed vote map, throw on re-vote |
| Log / audit leak | Append-only — no mutation path |
| Free-text reveal | Text samples only shown when cohort ≥ k |

---

## 5. Suggestion box / תיבת הצעות

- `submitSuggestion({category, title, description, anonymous, priority?, submitterId?})` — only `title` and `category` are required.
- Status transitions: `submitted → under-review → accepted | declined | deferred`. Each transition is recorded in `suggestionReviews[suggestionId]` with `{reviewerId, decision, comment, at}`. History is append-only — `suggestionHistory()` shows every prior decision in order.
- `voteOnSuggestion({suggestionId, voterId, vote})` — `vote` ∈ `{'up','down'}`. Second attempt from the same voter throws `voter already voted`.
- `listSuggestions({status?, category?, minVotes?})` — filters + sort newest first. Returns `{...suggestion, tally: {up, down, score}}`.

---

## 6. Retro formats / פורמטים לרטרוספקטיבה

**Primary format / פורמט ראשי: Start / Stop / Continue + Action items.**

| Category | Hebrew | Meaning |
|---|---|---|
| `start`    | להתחיל     | Things the team should begin doing |
| `stop`     | להפסיק     | Things that hurt and should stop |
| `continue` | להמשיך     | Things working well — keep doing |
| `action`   | משימה      | Concrete, owned action items — promoted to `tasks` on close |

Alternative mapping supported by the same store (for teams using "what went well / what didn't go well / what to improve"):

| Team framing | Maps to category |
|---|---|
| What went well            | `continue` |
| What didn't go well       | `stop` |
| What to improve / try     | `start` |
| Action item               | `action` |

Lifecycle:

1. `startRetroSession({teamId, sprintOrPeriod, moderator})` — returns `retroId`, state `open`.
2. `addRetroItem({retroId, category, content, author?, anonymous})` — rejected if retro is closed.
3. `closeRetro(retroId)` — state → `closed`, every `action` item is materialised into `tasks[]` with `source: 'retro'`.
4. `retroHistory(teamId)` — append-only chronological view of every retro session for the team.

Anonymity on retro items: `anonymous: true` wipes `author` and stores only `authorHash` (per-retro salt).

---

## 7. Sentiment analysis / ניתוח רגשי

Keyword-based classifier over Hebrew + English text answers:

- **Positive / חיובי:** טוב, מצוין, נהדר, מעולה, אוהב, שמח, תודה, חיובי, מרוצה, מדהים, שיפור, כיף, good, great, excellent, amazing, love, happy, thanks, positive, awesome, wonderful, helpful, win, success.
- **Negative / שלילי:** רע, גרוע, נורא, מתוסכל, כועס, בעיה, תקלה, שלילי, איטי, קשה, כישלון, עומס, bad, terrible, awful, frustrated, angry, problem, issue, slow, hard, failure, blocked, broken, overload, burnout.
- **Neutral / נייטרלי:** tie or no-match.

`sentimentAnalysis(surveyId)` returns counts, ratios and up to 5 text samples per class. Use ratios for dashboard display; raw counts for trend detection.

**Caveat:** this is an intentionally simple lexicon classifier — no ML. It's fast, explainable and deterministic; it will miss sarcasm and mixed sentences. For deeper analysis, pipe `samples` into the shared Onyx-AI sentiment model (TODO integration hook).

---

## 8. Escalation trigger / טריגר הסלמה

`triggerEscalation({surveyId?, threshold=3, pctThreshold=0.4})`

Scans pulse responses; if `lowCount / totalAnswers >= pctThreshold` where `lowCount` = numeric answers below `threshold`, an alert is pushed to `escalations[]` and returned. Each alert carries bilingual `message_he` / `message_en`, the low-count ratio, and `target: 'HR'`.

Recommended production wiring:
- Invoke nightly via scheduler, scoped to all pulses launched in the last 14 days.
- Route alerts to an HR channel (Slack/email) and the HR dashboard panel.
- Keep `escalations` append-only — never acknowledge-by-delete; add a new `acknowledged` record in a future upgrade.

---

## 9. Test matrix / מטריצת בדיקות

23 tests, `node:test`, 0 failures, ~120 ms runtime.

| # | Area | Test |
|---|---|---|
| 1 | Pulse launch | creates a survey with bilingual questions and TTL |
| 2 | Pulse guards | rejects >5 questions and duplicate ids |
| 3 | Anonymity | anonymous mode stores hash, not employeeId |
| 4 | Named mode | non-anonymous mode stores employeeId |
| 5 | Input validation | rejects answers to unknown questions |
| 6 | Aggregation | averages, distribution and text samples |
| 7 | k-anonymity | aggregate redacted below k=3 |
| 8 | Trend | trend vs prior survey in same family |
| 9 | Suggestion | submit title + category + priority |
| 10 | Voting | rejects double-vote by same voter |
| 11 | Filtering | listSuggestions by status/category/minVotes |
| 12 | Review | append-only review history + status |
| 13 | Review guards | rejects invalid decision |
| 14 | Retro | full lifecycle + action→task promotion |
| 15 | Retro history | team history append-only |
| 16 | Retro anonymity | anonymous item wipes author, stores hash |
| 17 | Sentiment | HE/EN classification |
| 18 | classifyText unit | pos/neg/neutral/empty |
| 19 | Escalation fires | ≥ pct low → alert |
| 20 | Escalation silent | healthy morale → no alert |
| 21 | Guard risk | k-anonymity risk flagged → clears at k=3 |
| 22 | Guard clean | clean engine → no violations |
| 23 | Labels | bilingual strings + constants sanity |

---

## 10. Hebrew glossary / מילון עברית

| English | עברית |
|---|---|
| Pulse survey | סקר דופק |
| Pulse response | תגובת דופק |
| Suggestion box | תיבת הצעות |
| Suggestion | הצעה |
| Category | קטגוריה |
| Priority | עדיפות |
| Upvote / Downvote | הצבעה בעד / נגד |
| Status | סטטוס |
| Submitted | התקבלה |
| Under review | בבדיקה |
| Accepted | אושרה |
| Declined | נדחתה |
| Deferred | נדחתה להמשך |
| Retro session | מפגש רטרו |
| Sprint / Period | ספרינט / תקופה |
| Moderator | מנחה |
| Start | להתחיל |
| Stop | להפסיק |
| Continue | להמשיך |
| Action item | משימה |
| Team | צוות |
| Anonymous | אנונימי |
| k-anonymity | k-אנונימיות |
| Redacted | חסוי |
| Sentiment | רגש / סנטימנט |
| Positive | חיובי |
| Negative | שלילי |
| Neutral | נייטרלי |
| Escalation | הסלמה |
| HR alert | התראת משאבי אנוש |
| Append-only | הוספה בלבד |
| Trend | מגמה |
| Distribution | התפלגות |
| Threshold | סף |
| Audit | ביקורת |
| Hash | תקציר (האש) |
| Salt | מלח קריפטוגרפי |

---

## 11. RTL / a11y checklist

- [x] Every user-facing label is mirrored in `LABELS.he` and `LABELS.en`.
- [x] No hard-coded LTR directionality in the engine (pure data).
- [x] Bilingual alert messages (`message_he`, `message_en`) on every escalation.
- [x] Dashboard consumers must set `dir="rtl"` for Hebrew and respect `LABELS.*.anonymity_note`.
- [x] Hebrew-first sentiment lexicon — classifier understands Hebrew text natively, no transliteration required.

---

## 12. Non-goals / מה המודול לא עושה

- No 360° multi-rater review — use `src/hr/360-feedback.js` (Y-067) for that.
- No grievance handling — use `src/hr/grievance.js` for formal complaints.
- No external mail / Slack delivery — the engine only records state; delivery adapters live outside.
- No ML sentiment — keyword lexicon only (by design — fast, explainable, deterministic).
- No row deletion, ever — rule enforced: לא מוחקים רק משדרגים ומגדלים.

---

**QA verdict:** GREEN
**Owner:** Agent Y-134
**Next upgrade candidates:**
1. Persistence adapter (SQLite/Postgres) behind the same interface.
2. Acknowledgement events on escalations (append-only).
3. Optional connection to Onyx-AI sentiment for nuanced text classification.
