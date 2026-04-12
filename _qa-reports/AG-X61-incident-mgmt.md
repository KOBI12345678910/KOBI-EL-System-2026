# AG-X61 — Incident Management (Swarm 3D)

**Agent:** X-61
**Swarm:** 3D — Techno-Kol Uzi / ONYX Procurement
**Date:** 2026-04-11
**Module:** `src/ops/incident-mgmt.js`
**Tests:**  `test/payroll/incident-mgmt.test.js`
**Status:** GREEN — 37 / 37 tests pass
**Dependencies added:** 0 (zero-deps, node built-ins only)

---

## 1. Summary / תקציר

**EN:** End-to-end incident-management engine for the Kobi mega-ERP: declaration, on-call commander routing, war-room spin-up, stakeholder broadcasts with severity-aware cadence, timeline capture, root-cause analysis, bilingual postmortem template generation, and action items — all blameless, all zero-deps.

**HE:** מנוע ניהול אירועים מקצה-לקצה עבור המערכת: הכרזה, מינוי מפקד תורנות, פתיחת חדר מלחמה, שידורי סטטוס לפי דחיפות, לכידת ציר זמן, ניתוח גורמי שורש, הפקת תבנית תחקיר דו-לשונית ופריטי פעולה — ללא האשמה, ללא תלויות חיצוניות.

---

## 2. Files touched / קבצים

| File | Action | LoC |
|---|---|---:|
| `onyx-procurement/src/ops/incident-mgmt.js`       | **created** | ~650 |
| `onyx-procurement/test/payroll/incident-mgmt.test.js` | **created** | ~590 |

Only the two files above were touched. Zero deletions. Zero modifications to existing modules.

---

## 3. Exported API / ממשק

```js
const im = require('./src/ops/incident-mgmt');
```

| Export | Signature | Purpose |
|---|---|---|
| `declareIncident`     | `({title, severity, description, reporter, service?, alert_id?}) → incidentId` | Declare a new incident, auto-assign commander, spin war-room, broadcast |
| `assignCommander`     | `(incidentId, userId) → void` | Override on-call commander |
| `updateStatus`        | `(incidentId, status, message) → void` | Transition + broadcast to stakeholders |
| `addTimelineEntry`    | `(incidentId, {action, actor, notes}) → void` | Append manual entry |
| `addContributingFactor` | `(incidentId, factor) → void` | Record contributing factor |
| `resolveIncident`     | `(incidentId, rootCause) → void` | Mark resolved + record root cause |
| `addActionItem`       | `(incidentId, {description, owner, due}) → ai` | Add follow-up action |
| `addWhatWentWell`     | `(incidentId, note) → void` | Populate "what went well" section |
| `addWhatWentWrong`    | `(incidentId, note) → void` | Populate "what went wrong" section |
| `generatePostmortem`  | `(incidentId) → markdown` | Auto-generate bilingual postmortem |
| `listActive`          | `() → Incident[]` | Ongoing incidents (not resolved/archived) |
| `listRecent`          | `({since?, until?}) → Incident[]` | Time-windowed history |
| `metrics`             | `({since?, until?}) → {mttr_min, mttd_min, count, by_severity}` | MTTR / MTTD / counts |
| `archiveIncident`     | `(incidentId) → void` | Never delete — archive flag only |
| `attachLogs`          | `(incidentId, {since?, until?}) → count` | Pull logs from X-54 into timeline |
| `tickBroadcasts`      | `() → void` | Scheduler-hook for cadence re-broadcast |

Also exported: `IncidentService`, `InMemoryIncidentStore`, `OnCallRoster`, `createIncidentService(opts)`, and constants `SEVERITY`, `STATUS`, `SEVERITY_RESPONSE_MIN`, `SEVERITY_BROADCAST_SEC`, `SEVERITY_LABELS`, `STATUS_LABELS`, `BLAMELESS_STATEMENT`.

---

## 4. Severity matrix / מטריצת דחיפות

| Severity | Response target | Broadcast cadence | Label (EN) | Label (HE) |
|---|---:|---:|---|---|
| SEV1 | 15 min  | every 60 s  | Critical — all users affected   | קריטי — כל המשתמשים |
| SEV2 | 30 min  | every 5 min | Major — subset, workaround exists | מהותי — תת-קבוצה, קיים מעקף |
| SEV3 | 4 h     | every 30 min | Minor — single function degraded | נמוך — פונקציה אחת במצב פגום |
| SEV4 | 16 h    | hourly      | Cosmetic or planned              | קוסמטי או מתוכנן |

---

## 5. Integration hooks / נקודות חיבור

The service takes an optional `opts` bag, every integration is pluggable and failure-safe (every integration error is caught and never reaches the host):

| Agent | Hook | Used in |
|---|---|---|
| **X-55 Alert Manager** | `alertManager.ack(alertId)` | `declareIncident` acks the originating alert if `alert_id` is passed |
| **X-54 Log Collector** | `logCollector.fetch({since, until, service})` | `attachLogs(incidentId)` pulls log entries into the timeline |
| **X-60 SLO Service**   | `sloService.getImpact(service)` | SLO impact data stored on incident, rendered into Impact section of postmortem |
| Chat provider          | `chatProvider.createChannel(opts)` / `chatProvider.invite(channelId, user)` | War-room spin-up during `declareIncident` |
| Notifier               | `notifier.broadcast({ts, incident_id, severity, status, channels, message, message_he})` | Every `updateStatus`, `declareIncident`, `resolveIncident`, and `tickBroadcasts` |

All integration failures are swallowed by `safeInvoke()` and logged via `console.error`, guaranteeing that an external system going down never breaks incident handling itself.

---

## 6. Blameless culture / תרבות ללא האשמה

Hard-coded bilingual `BLAMELESS_STATEMENT` is injected verbatim into every auto-generated postmortem immediately under the header. Excerpt:

> This postmortem is blameless. Our goal is to learn from what happened, not to find someone to blame. People acted on the best information available to them at the time, and their decisions were reasonable given the context. We focus on systemic factors, not individuals.
>
> תחקיר זה הוא ללא האשמה. המטרה שלנו היא ללמוד ממה שקרה, לא למצוא אשמים. אנשים פעלו על בסיס המידע הטוב ביותר שהיה בידם באותו רגע, והחלטותיהם היו סבירות בהינתן ההקשר. אנחנו מתמקדים בגורמי מערכת, לא באנשים.

Test `8.2` verifies that (a) both statements are present in generated markdown and (b) no blame-loaded words (`fault|negligence|stupid|idiot`) appear outside the canonical statement.

---

## 7. Postmortem template sections

Generated postmortem markdown contains exactly the sections required by the spec, each bilingual:

1. Summary / תקציר
2. Impact / השפעה  (who / what / when / how many + SLO burn if available)
3. Timeline / ציר זמן  (every logged entry with UTC timestamp + actor)
4. Root cause analysis — 5 Whys / ניתוח שורש — 5 למה  (auto-seeded from rootCause)
5. Contributing factors / גורמים תורמים
6. What went well / מה הלך טוב
7. What went wrong / מה הלך לא טוב
8. Action items / פריטי פעולה  (markdown table: id, desc, owner, due, status)

Front-matter includes: incident id, severity (bilingual label), status, declared/resolved timestamps, MTTD, MTTR, commander, reporter, and the blameless statement.

---

## 8. Never-delete rule / כלל אי-מחיקה

- The module exposes **no** `delete*` or `remove*` function. (Verified by test `11.2`.)
- `archiveIncident(id)` sets `archived=true`, transitions status to `closed`, sets `closed_at`, but leaves the record fully retrievable via `get(id)` and in `listRecent()`.
- Timeline entries are append-only; there is no "edit timeline" or "delete timeline" API.

---

## 9. Test report / דוח בדיקות

```
ℹ tests        37
ℹ suites       13
ℹ pass         37
ℹ fail          0
ℹ duration_ms 131.99
```

Command:
```
node --test test/payroll/incident-mgmt.test.js
```

### Test matrix

| # | Suite | Tests |
|--:|---|---:|
| 1 | declareIncident — happy path & validation                 | 6 |
| 2 | commander assignment (auto, round-robin, override)        | 4 |
| 3 | war-room spin-up (stub + failure tolerance)               | 2 |
| 4 | updateStatus — broadcasts + transitions + tick cadence    | 4 |
| 5 | timeline capture — append + coverage + validation         | 3 |
| 6 | contributing factors                                      | 1 |
| 7 | resolveIncident                                           | 2 |
| 8 | generatePostmortem (bilingual, blameless, pre-resolution) | 3 |
| 9 | action items                                              | 2 |
|10 | listActive / listRecent / metrics (MTTR, MTTD, by sev)    | 3 |
|11 | never-delete rule + export audit                         | 2 |
|12 | integrations (X-54 logs, X-55 alerts, X-60 SLO, failures) | 4 |
|13 | module-level facade                                       | 1 |
|   | **Total**                                                 | **37** |

All tests use a deterministic clock (`2026-04-11T10:00:00Z`) and a deterministic id generator for full reproducibility.

---

## 10. Design decisions / החלטות תכן

- **Zero deps:** Only `node:crypto` is required, and only for random id generation — no fs, no timers, no external packages. An optional persistence store can be swapped in via `opts.store`.
- **Safe integrations:** Every integration call goes through `safeInvoke()`. A chat outage, alert-manager outage, or notifier outage CANNOT break incident flow. Test `12.4` explicitly verifies this.
- **Deterministic:** Everything is clock-injectable and id-injectable; no hidden time or randomness in unit tests.
- **Bilingual first:** Every user-facing label (severity, status, postmortem headers, blameless statement) ships in both Hebrew and English side-by-side.
- **Append-only audit:** The timeline is the single source of truth. Every public mutator (`assignCommander`, `updateStatus`, `resolveIncident`, `addActionItem`, `addContributingFactor`, `archiveIncident`, `attachLogs`) pushes a timeline entry. Test `5.2` asserts this coverage.
- **Severity-aware broadcast cadence:** `tickBroadcasts()` can be called from any external scheduler (e.g. X-55 alert-manager tick). SEV1 re-broadcasts minutely, SEV4 hourly. Cadence honored via `last_broadcast_at` bookkeeping.
- **5-whys auto-seed:** When `resolveIncident(id, rootCause)` was called, the postmortem template seeds the first "why" with the root cause string. The remaining four are explicit "Why? / למה?" placeholders for the on-call to fill in.

---

## 11. Known non-goals / לא נכלל

- **Persistence:** `InMemoryIncidentStore` is the default. For production, inject an SQLite- or file-backed store (same save/get/all interface).
- **Real chat provider:** The war-room stub speaks an object contract `{createChannel, invite}`. A Slack/Teams adapter is a separate agent task.
- **UI:** This module is headless; the Palantir-style ops UI will surface these APIs in a separate swarm.
- **Scheduler:** `tickBroadcasts()` is designed to be called by an external timer — we deliberately did not `setInterval` inside the module to keep it timer-free and unit-test-safe.

---

## 12. Sign-off / אישור

- All 37 tests pass in 132 ms. No flakes across 5 consecutive runs.
- No external dependencies added to `package.json`.
- No existing files modified.
- Never-delete rule verified by export audit.
- Blameless wording verified in both languages.
- Integration contracts published above.

**X-61 — DONE.**
