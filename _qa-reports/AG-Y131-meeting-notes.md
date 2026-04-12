# AG-Y131 — Meeting Notes Capture + Action-Item Extraction Engine

**Agent:** Y-131
**Module:** `onyx-procurement/src/comms/meeting-notes.js`
**Tests:** `onyx-procurement/test/comms/meeting-notes.test.js`
**Status:** DELIVERED — 28/28 tests passing
**Rule:** לא מוחקים רק משדרגים ומגדלים (never delete, only upgrade and grow)
**Date:** 2026-04-11
**Dependencies:** zero (Node built-ins only — `node:events`, `node:crypto`)

---

## 1. Scope — היקף

**HE:**
מנוע לכידת סיכומי פגישות, מיצוי משימות והחלטות, סיכום אוטומטי
וחיפוש, לגרעין התקשורת של Techno-Kol Uzi. המודול מטפל בשבעה סוגי
פגישות, מזהה משימות והחלטות בעברית ובאנגלית באמצעות כללים מפורשים,
מייצא Markdown דו-לשוני ו־payload ל־PDF, ומחשב נוכחות ושעות לפי
משתתף. כל ההערות והמשימות הן append-only — לא מוחקים, רק מעלים
דגל `retracted`.

**EN:**
A zero-dependency meeting-notes engine for the Techno-Kol Uzi ERP
comms stack. It tracks seven meeting types, extracts action items
and decisions from bilingual (Hebrew / English) free-text notes via
an explicit rule grammar, produces RTL-safe bilingual Markdown and
a structured PDF payload, runs a tiny TF-IDF search over the
meeting corpus, finds related meetings via attendee Jaccard + topic
cosine, schedules follow-up checks, and rolls up attendance hours
per person. All notes and action items are append-only; retraction
is a soft flag, never a delete.

### Public API — ממשק ציבורי

| Method | Purpose (EN) | תיאור (HE) |
|---|---|---|
| `createMeeting({id,title_he,title_en,date,attendees,organizer,meetingType})` | Create a meeting record | יצירת פגישה |
| `addNote({meetingId,content,author,timestamp})` | Append a note (extracts actions+decisions inline) | הוספת הערה |
| `listNotes(meetingId, {includeRetracted})` | Read notes for a meeting | רשימת הערות |
| `retractNote(noteId, reason)` | Soft retraction — history preserved | ביטול הערה (רכה) |
| `extractActionItems(meetingId)` | All live action items | מיצוי משימות |
| `extractDecisions(meetingId)` | All live decisions | מיצוי החלטות |
| `linkToTasks(meetingId, taskSystem)` | Emit tasks to mockable system | קישור למערכת משימות |
| `summarize(meetingId, {maxLength})` | Extractive summary | סיכום |
| `exportMarkdown(meetingId)` | Bilingual RTL markdown | יצוא Markdown דו-לשוני |
| `exportPDF(meetingId)` | PDF-renderer payload | יצוא PDF מובנה |
| `followUp(meetingId, days)` | Schedule a reminder | מעקב המשך |
| `searchMeetings(query, filters)` | TF-IDF ranked search | חיפוש TF-IDF |
| `relatedMeetings(meetingId)` | Find sibling meetings | פגישות קשורות |
| `attendance({attendeeId, period})` | Roll up minutes + hours | נוכחות (שעות) |

---

## 2. Meeting Types — סוגי פגישות

Seven types are shipped. Every type has bilingual labels and a
default duration (used by the attendance roll-up).

| Key | Hebrew | English | Default minutes | Typical use |
|---|---|---|---|---|
| `standup` | סטנדאפ יומי | Daily Standup | 15 | יומי — סטטוס קצר של הצוות |
| `planning` | תכנון ספרינט | Planning | 60 | תחילת ספרינט — קביעת יעדים ומשימות |
| `review` | סקירה | Review | 45 | הצגת תוצרים / דמו |
| `retro` | רטרוספקטיבה | Retro | 60 | שיפור מתמשך — מה עבד ומה לא |
| `customer` | פגישת לקוח | Customer Meeting | 45 | לקוח חיצוני / POC / אסקלציה |
| `board` | ישיבת דירקטוריון | Board Meeting | 90 | דירקטוריון / בעלי עניין |
| `1-on-1` | שיחה אישית | 1-on-1 | 30 | מנהל-עובד |

Invalid `meetingType` throws `MeetingError` with code `BAD_TYPE` and
bilingual `message_he` + `message_en` fields.

---

## 3. Action-Item Syntax — תחביר משימות

The extractor is **rule-based** and fully auditable. Every rule is a
simple case-insensitive token lookup with Unicode-safe boundary checks
for English tokens (so `owner` does not match inside `downer`). The
grammar has four dimensions: **action markers**, **owner**,
**due-date**, and **priority**, plus a free-form **urgent token** set
that bumps priority implicitly.

### 3.1 Action markers — סמני משימה

| HE | EN |
|---|---|
| פעולה | action |
| לעשות | todo |
| משימה | task |
| צריך לעשות | ai *(action item, shorthand)* |

### 3.2 Owner markers — סמני אחראי

| HE | EN |
|---|---|
| אחראי | owner |
| אחראית | assignee |
| בעלים | resp |
| מבצע | responsible |

### 3.3 Due-date markers — סמני דדליין

| HE | EN |
|---|---|
| עד | by |
| דדליין | due |
| תאריך יעד | deadline |
| | target |

### 3.4 Priority markers — סמני עדיפות

| HE | EN |
|---|---|
| עדיפות | priority |
| דחיפות | prio |

### 3.5 Urgent tokens (implicit high-priority)

| HE | EN |
|---|---|
| דחוף | urgent |
| דחופה | asap |
| בהול | critical |
| | p0 |

### 3.6 Due-date parser

The `parseDueDate` helper accepts:

| Form | Example (EN) | Example (HE) |
|---|---|---|
| ISO-8601 | `2026-04-15` | `2026-04-15` |
| dd.mm.yyyy / dd/mm/yyyy | `15.04.2026` | `15/04/2026` |
| Tomorrow | `tomorrow` | `מחר` |
| Today | `today` | `היום` |
| Next week | `next week` | `שבוע הבא` |
| End of month | `end of month` | `סוף חודש` |
| Relative | `in 3 days` / `3 days` | `בעוד 3 ימים` |

### 3.7 Worked examples

```
פעולה: להכין דוח מכירות רבעוני. אחראי: @dani. עד: 2026-04-15
  → { text: "להכין דוח מכירות רבעוני",
      owner: "dani",
      dueDate: "2026-04-15T00:00:00.000Z",
      priority: "medium" }

Action: ship the new dashboard. Owner: @liora. By: 2026-05-01. Priority: high
  → { text: "ship the new dashboard",
      owner: "liora",
      dueDate: "2026-05-01T00:00:00.000Z",
      priority: "high" }

todo: fix the login page (URGENT). owner: mario
  → { text: "fix the login page",
      owner: "mario",
      priority: "high"  // urgent token triggered it
    }

לעשות: לסגור דוח מע"מ דחוף. אחראי: avi
  → { text: "לסגור דוח מע\"מ",
      owner: "avi",
      priority: "high"  // דחוף triggered it
    }
```

### 3.8 Decision syntax — תחביר החלטה

| HE | EN |
|---|---|
| החלטה | decision |
| הוחלט | decided |
| סוכם | agreed |
| מחליטים | resolution |

Decisions have no owner/due/priority; they are captured as raw text
plus `author` (the note's author) and `timestamp`.

---

## 4. Summarization Algorithm — אלגוריתם סיכום

**Type:** extractive (no generative ML; everything is auditable).

**Steps:**

1. Walk the meeting's **active** notes in insertion order.
2. For each note, pick the **first sentence** — a sentence is
   delimited by `.`, `!`, `?`, newline, or Hebrew sof-pasuk (`׃`).
3. Deduplicate by lowercased signature (so a note whose first sentence
   already appeared is skipped).
4. Join with the ` • ` bullet separator.
5. Append a compact actions tail: up to 5 `[priority] text` pairs,
   prefixed with ` :: משימות/Actions: `.
6. If the result exceeds `maxLength` (default 500), truncate on the
   last word boundary ≥ 60% of the cap and append `…`.
7. Return `{ meetingId, title_he, title_en, summary, sentenceCount,
   actionCount, truncated }`.

**Why extractive?** The ERP rule requires zero external deps. An
extractive approach gives us deterministic output, is trivially
testable, preserves the user's exact wording (important for legal /
board records), and never hallucinates.

**Limitations (acknowledged):**

* Non-first sentences may hold the "real" meat — but the summary
  preserves full fidelity via `exportMarkdown` / `exportPDF`.
* Language-neutral sentence splitting: Hebrew prose that uses `,`
  heavily may produce long pseudo-sentences. Acceptable trade-off.
* Actions appended after the sentence bullets may push truncation
  closer to the start; the `truncated` flag flags the caller.

---

## 5. Storage Model — מודל אחסון

All storage is **in-memory** via `Map`/`Array` structures seeded in
the constructor. Nothing is ever purged.

| Store | Shape | Rule |
|---|---|---|
| `meetings` | `Map<string, Meeting>` | append-only; `status` transitions only |
| `notes` | `Map<meetingId, Note[]>` | append-only; `retracted` is a flag |
| `actions` | `Map<meetingId, Action[]>` | append-only; derived from notes |
| `decisions` | `Map<meetingId, Decision[]>` | append-only; derived from notes |
| `followUps` | `Map<meetingId, FollowUp[]>` | append-only schedule records |
| `taskEmissions` | `Array<Emission>` | full audit trail of task-system calls |

`retractNote(id)` flips `retracted = true`, sets `retractedReason`
and `retractedAt`, and emits `note.retracted`. The underlying object
stays in storage forever. `extractActionItems` and `extractDecisions`
automatically hide anything whose source note has been retracted;
passing `{ includeRetracted: true }` to `listNotes` surfaces them
for audit / UI "show history" toggles.

---

## 6. Events — אירועים

The class extends `EventEmitter`. Listeners can bind to:

| Event | Payload |
|---|---|
| `meeting.created` | meeting record |
| `note.added` | note record |
| `note.retracted` | note record (with `retracted=true`) |
| `action.extracted` | action record |
| `decision.extracted` | decision record |
| `task.emitted` | `{ taskId, actionId, meetingId, payload }` |
| `followup.scheduled` | follow-up record |

This hooks cleanly into the X-13 SSE hub for live UI updates without
imposing a transport dependency.

---

## 7. Search & Related Meetings — חיפוש ופגישות קשורות

### 7.1 TF-IDF search

Every meeting is flattened to a single document: `title_he` +
`title_en` + concatenated note contents. The `tokenize` helper:

1. Strips Hebrew niqqud (`U+0591..U+05C7`).
2. Lowercases.
3. Normalises Hebrew final letters (`ך→כ`, `ם→מ`, `ן→נ`, `ף→פ`, `ץ→צ`).
4. Splits on whitespace and common punctuation.
5. Drops Hebrew + English stopwords and tokens shorter than 2 chars.

Scoring: `Σ tf(term) * log(1 + N/df(term))` — a simple, stable scorer.

Filters supported: `type`, `organizer`, `attendees`, `dateRange`.

### 7.2 Related meetings

`relatedMeetings(meetingId)` scores every other meeting with:

* **Jaccard** over the attendee sets (weight 0.6).
* **Cosine** over the TF vectors (weight 0.4).

Returns the top 10 sorted descending. Self is excluded.

---

## 8. Task-System Linking — קישור למערכות משימות

`linkToTasks(meetingId, taskSystem)` produces a `create` payload per
action item:

```json
{
  "title": "...action text...",
  "owner": "...handle...",
  "dueDate": "ISO-8601",
  "priority": "high|medium|low",
  "source": {
    "system": "meeting-notes",
    "meetingId": "mtg_...",
    "meetingTitle_he": "...",
    "meetingTitle_en": "...",
    "actionId": "act_..."
  }
}
```

`taskSystem` is any object with a `createTask(payload)` method
returning `{id}` (or `{taskId}`). When none is supplied the module
generates a local `task_...` id and logs the emission to
`taskEmissions` for later replay. Every call is also emitted as
`task.emitted` for live listeners.

This design is mock-friendly — tests use a 2-line stub. In
production the task system can be the existing X-15 workflow engine,
Jira bridge, Asana bridge, etc.

---

## 9. Bilingual Markdown & PDF Export — יצוא

### 9.1 Markdown

Generated with explicit `<div dir="rtl">` wrappers around Hebrew
sections so RTL-aware renderers (GitLab, Gitea, Obsidian, Notion via
import) honour the text direction. Every header is bilingual
(`HE / EN`). The action-items section is a Markdown table so the
Hebrew column labels stay aligned.

Sections in order:

1. Title block: `# HE / EN`
2. Meta (type, date, organizer, attendees)
3. Notes (HE-primary with RTL wrapper)
4. Decisions (bilingual header)
5. Action items (bilingual table)
6. Generator timestamp footer

### 9.2 PDF payload

A `format: 'pdf-payload-v1'` JSON object with `dir: 'rtl'`, full
metadata, and three sections (`notes`, `decisions`, `actions`). The
action section includes a bilingual `columns` descriptor so a
downstream renderer (PDFKit, wkhtmltopdf, the onyx-procurement
printing stack) can build a proper RTL table without any further
processing of the content.

---

## 10. Follow-up Scheduling — תזמון מעקב

`followUp(meetingId, days)` records a reminder:

* `daysAhead` is clamped to ≥ 1 (never scheduled in the past).
* `openActionCount` and `actions[]` snapshot the live action list at
  schedule time, so a late retraction of a note still leaves a
  historic snapshot for auditors.
* Returns `message_he` and `message_en` ready for the reminder /
  notification system.

---

## 11. Attendance — נוכחות

`attendance({attendeeId, period})` walks every meeting the person
attended (filtered by ISO date range if supplied) and rolls up
`totalMinutes` and `totalHours`. Labels are emitted bilingually:

```
label_he: "3 פגישות, 2 שעות"
label_en: "3 meetings, 2 hours"
```

Duration comes from the meeting type's `defaultMinutes`. If a future
version needs to track the actual elapsed time of a meeting, we can
add an optional `actualMinutes` field and fall back to `expectedMinutes`
when absent — fully additive, zero breakage.

---

## 12. Hebrew Glossary — מילון מונחים עברי

Operators, auditors, and anyone picking up this module later will
need these terms. Sorted Hebrew-first.

| Hebrew | English | Context |
|---|---|---|
| אחראי | owner / assignee | אחד מסמני משימה |
| אחראית | assignee (f) | וריאנט נקבה |
| בעלים | responsible | כמו "owner" |
| בהול | critical | סמן עדיפות מרומז |
| דדליין | deadline | סמן תאריך יעד |
| דחוף | urgent | סמן עדיפות מרומז |
| דחיפות | priority | סמן עדיפות מפורש |
| דירקטוריון | board | סוג פגישה `board` |
| החלטה | decision | סמן החלטה |
| הוחלט | decided | סמן החלטה |
| היום | today | תאריך יעד יחסי |
| הערה | note | יחידת תוכן בפגישה |
| ישיבה / פגישה | meeting | רשומת הפגישה |
| לעשות | todo | סמן משימה |
| מארגן | organizer | יוצר הפגישה |
| מבצע | responsible | סמן אחראי |
| מחר | tomorrow | תאריך יעד יחסי |
| מחליטים | resolution | סמן החלטה |
| משימה | task | סמן משימה |
| משתתף | attendee | משתתף בפגישה |
| נוכחות | attendance | דוח שעות משתתף |
| סוכם | agreed | סמן החלטה |
| סוף חודש | end of month | תאריך יעד יחסי |
| סטנדאפ | standup | סוג פגישה `standup` |
| סקירה | review | סוג פגישה `review` |
| עד | by / due | סמן תאריך יעד |
| עדיפות | priority | סמן עדיפות מפורש |
| עדיפות גבוהה / בינונית / נמוכה | high / medium / low | ערכי עדיפות |
| פגישת לקוח | customer meeting | סוג פגישה `customer` |
| פעולה | action | סמן משימה ראשי |
| צריך לעשות | todo (phrase) | סמן משימה תיאורי |
| רטרוספקטיבה | retro | סוג פגישה `retro` |
| שבוע הבא | next week | תאריך יעד יחסי |
| שיחה אישית | 1-on-1 | סוג פגישה `1-on-1` |
| תאריך יעד | target date | סמן תאריך יעד |
| תכנון ספרינט | sprint planning | סוג פגישה `planning` |

---

## 13. Test Coverage — כיסוי בדיקות

28/28 tests passing. Run with:

```bash
cd onyx-procurement
node --test test/comms/meeting-notes.test.js
```

| # | Test | What it proves |
|---|---|---|
| 1 | `createMeeting: happy path` | basic shape + bilingual titles |
| 2 | `createMeeting: rejects invalid type` | error-path `BAD_TYPE` |
| 3 | `createMeeting: all 7 meeting types` | every type is creatable and labelled |
| 4 | `createMeeting: missing title / organizer` | error paths `MISSING_TITLE`, `MISSING_ORGANIZER` |
| 5 | `addNote: transitions meeting to in-progress` | append + lifecycle |
| 6 | `addNote + retractNote: soft retraction` | append-only rule enforced |
| 7 | `extractActionItems: Hebrew markers` | פעולה / אחראי / עד |
| 8 | `extractActionItems: English markers` | action / owner / by / priority |
| 9 | `extractActionItems: todo + urgent` | urgent token bumps priority |
| 10 | `extractActionItems: Hebrew דחוף` | Hebrew urgent token |
| 11 | `extractActionItems: multi-sentence` | 3 actions, 3 owners |
| 12 | `extractActionsFromContent` standalone | helper exported correctly |
| 13 | `parseDueDate` | ISO, dd.mm.yyyy, relative, HE |
| 14 | `extractDecisions: Hebrew markers` | החלטה / הוחלט |
| 15 | `extractDecisions: English markers` | decision / agreed |
| 16 | `extractDecisionsFromContent` standalone | helper exported correctly |
| 17 | `summarize: first-sentence + actions tail` | extractive summary works |
| 18 | `summarize: truncation` | `maxLength` respected + `truncated=true` |
| 19 | `exportMarkdown: bilingual + RTL wrapper` | sections, labels, `<div dir="rtl">` |
| 20 | `exportPDF: structured payload` | he + en on every section, rows shaped |
| 21 | `linkToTasks: mock system` | emission + taskId propagation |
| 22 | `followUp: schedules reminder` | bilingual messages + action snapshot |
| 23 | `followUp: negative days clamp to 1` | safety |
| 24 | `searchMeetings: TF-IDF ranking` | best match first |
| 25 | `searchMeetings: all filters` | type, organizer, attendees, date |
| 26 | `relatedMeetings: Jaccard + cosine` | sibling scoring |
| 27 | `attendance: rollup + period filter` | minutes + hours + filter |
| 28 | `tokenize` | niqqud, stopwords, final letters |

---

## 14. Coexistence — "לא מוחקים, רק משדרגים ומגדלים"

* Lives at `src/comms/meeting-notes.js`; doesn't touch any existing
  comms module. Sits next to `internal-chat.js`, `call-log.js`,
  `life-events.js`, `email-templates.js`.
* Nothing mutates prior notes or actions; retraction is a flag.
* `retractNote` stores `retractedAt` and `retractedReason` but keeps
  the original content byte-for-byte.
* The TF-IDF search and attendance roll-up continue to expose the
  historic records — they just filter by `retracted` for the default
  read path.
* `linkToTasks` never deletes emitted tasks; `taskEmissions` is an
  append-only audit log.
* Events are always emitted even on replay; listeners are free to
  ignore them.

---

## 15. Known Limitations — מגבלות מוכרות

1. **Storage is in-memory.** Restart = empty state. The class is a
   drop-in for a persistence wrapper; the callable `clock` option
   in the constructor already supports test-time determinism.
2. **Sentence splitting is language-neutral** — Hebrew prose that
   leans heavily on `,` rather than `.` may end up with long
   pseudo-sentences in the extractive summary. Raw markdown export
   always has full fidelity.
3. **No speaker identification.** `author` is taken from the note
   input; no diarisation / voice-to-text.
4. **Priority inference is coarse.** Four inputs → three buckets.
   For fine-grained SLAs wire the action into X-15 workflow.
5. **Rule-based extractor does not learn.** By design — the ERP
   rule forbids external deps and demands auditability. A future
   upgrade path (additive, per the golden rule) is a score-based
   fallback that runs only when the rule matcher produces no hits.

---

## 16. Next Steps — צעדים הבאים

* Wire into the X-13 SSE hub for live "action item added" toasts.
* Add a CLI helper (`onyx-procurement/src/cli/meeting-notes.js`) to
  import a `.md` transcript and print extracted actions.
* Add a REST route (`/api/meetings/:id/actions`) in the server so the
  dashboard can render an actions table without a direct require.
* Add an ICS calendar link from follow-ups to the existing calendar
  integration used by life-events.js.

---

_Signed by Agent Y-131 on 2026-04-11. לא מוחקים רק משדרגים ומגדלים._
