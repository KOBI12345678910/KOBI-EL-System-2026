# AG-X55 — Alert Manager (Severity Routing + Silencing + Grouping)

**Agent:** X-55 (Swarm 3 — Techno-Kol Uzi mega-ERP 2026)
**Date:** 2026-04-11
**Files delivered:**
- `src/ops/alert-manager.js` — module (zero deps, ~880 lines)
- `test/payroll/alert-manager.test.js` — 41 unit tests, all passing
- `_qa-reports/AG-X55-alert-manager.md` — this report

**Test run:** `node --test test/payroll/alert-manager.test.js`
**Result:** 41 / 41 pass, 0 fail, duration ≈ 148 ms

---

## 1. Scope

A Prometheus-Alertmanager-compatible alert router purpose-built for the
Techno-Kol Uzi mega-ERP, with **Israeli business awareness** (Shabbat,
holidays, Sunday–Thursday working week) and **bilingual Hebrew/English**
operator payloads. Delivered as a pure-JS, zero-dependency module that
drops into the existing `src/ops/` folder next to `metrics.js` and
`error-tracker.js`.

### Public API (createManager)

| Method | Purpose |
|---|---|
| `fire(alert)` | Receive an alert; dedupe, group, suppress, route, dispatch |
| `ack(alertId, userId)` | Acknowledge (stops escalation) |
| `resolve(alertId)` | Mark resolved; clear dedupe index |
| `silence({matchers, duration, reason, createdBy})` | Create a silence; returns `silenceId` |
| `unsilence(id)` | Remove a silence |
| `defineRoute(matcher, channels, opts?)` | Add a severity/label→channel route |
| `defineInhibit(sourceMatcher, targetMatcher, {equal})` | Suppress downstream on upstream |
| `listActive()` | Firing + acked + silenced + inhibited alerts (critical first) |
| `listSilenced()` | Non-expired silences |
| `listGrouped()` | Active groups |
| `stats()` | Counters + active/silence/group sizes |
| `tick(now?)` | Drives escalation, silence expiry, digest flush |
| `setOnCall(schedule)` / `getCurrentOnCall(now?)` | Weekly rotation |
| `flushDigest(now?)` | Manual daily-digest flush |
| `close()` | Clear all state (for tests / shutdown) |

All methods except `tick`/`setOnCall`/`close` are safe to call from
request handlers. The module never throws on channel-adapter errors —
broken transports degrade quietly (each adapter call is try/caught).

## 2. Feature coverage

| # | Requirement | Implementation |
|---|---|---|
| 1 | Receive alerts from metrics / log rules / health checks | `fire(input)` — accepts labels + summary + annotations + runbook |
| 2 | Deduplicate (same labels → one alert) | `fingerprint(labels)` — SHA-1 of sorted `k=v` pairs; `fpIndex` map |
| 3 | Group (similar alerts combined into a digest) | `groupKeyFor()` = `alertname|service|severity`; 5-min window |
| 4 | Silence (mute rules for N hours) | Matcher-based silences with expiry + `listSilenced()` + `sweepSilences()` |
| 5 | Inhibit (upstream suppresses downstream) | `defineInhibit(source, target, {equal})` — Prom-style `equal` key constraint |
| 6 | Route by labels (severity → channel) | Ordered `routes[]`; first-match or `continue:true` for multi-match |
| 7 | Escalation if not ack'd in X min | `escalationGraceMs`; levels 0→1 (secondary)→2 (broadcast)→3 (pagerduty) |
| 8 | On-call schedule (rotation) | `pickRotationMember` — round-robin weekly rotation with Friday handoff advance |
| 9 | Acknowledge + resolve flow | `ack(id, userId)` + `resolve(id)` with state machine `firing→ack→resolved` |
| 10 | Post-alert runbook reference | `runbook` field on every dispatched payload, default `runbookBase/alertname` |

## 3. Severity routing matrix (defaults)

| Severity | Default channels |
|---|---|
| `critical` | `phone` + `sms` + `slack` + `pagerduty` (24/7 paging) |
| `high` + `service=payroll` | `slack` + `email` |
| `high` | `slack` + `email` |
| `medium` | `email` + `slack` |
| `low` | `__digest__` (daily flush via email) |
| `info` | `dashboard` only |

Routes are overridable — call `createManager({ defaultRoutes: false })`
and wire your own with `defineRoute(matcher, [channels])`.

## 4. Israeli temporal awareness

The module imports a minimal holiday calendar (default `DEFAULT_HOLIDAYS_2026`
— passover, memorial day, independence day, shavuot, rosh hashana, yom kippur,
sukkot, simchat torah). Extend per-year via `createManager({ holidays: [...] })`.

| Rule | Behaviour |
|---|---|
| Friday ≥ 14:00 → Saturday < 20:00 | "Shabbat" flag set |
| Sunday–Thursday, 08:00–18:00, non-holiday | "Business hours" flag set |
| Holiday (exact date) | Suppresses business-hours flag |
| Friday ≥ 14:00 | Rotation clock advanced +24h (early handoff before Shabbat) |

### Channel adjustment by time

- **Shabbat / holidays**: only `critical` pages through normal channels.
  Everything else is routed to `dashboard` + `__digest__` (no emails, no
  slack pings, no phone).
- **Off-hours (weekday night)**: `high` drops `phone`/`pagerduty`; keeps
  `slack`/`email`/`sms`. `low` → digest.
- **Business hours**: unchanged — routes fire as configured.

## 5. Grouping + digest flow

- First alert in a group dispatches normally.
- Additional alerts within the 5-minute window (configurable via
  `groupWindowMs`) are added to the group silently — no extra slack / email
  noise. Their `count` still increments via dedupe if labels match.
- Low-severity alerts go into a `digestBuffer` that flushes every 24 hours
  via the `email` channel. `tick()` drives the flush; `flushDigest()` is
  exposed for tests and manual runs.

## 6. Channel adapters (stub)

Each channel adapter is a plain object `{name, sent[], send(payload), reset()}`.
The default `defaultChannels()` returns zero-deps stubs that record every
call to the `sent[]` array. In production the factory should be replaced
with real adapters via `createManager({ channels: {...} })`:

- `slack` → outgoing webhook POST
- `email` → wire to **Agent 73** (email service)
- `sms` → wire to **Agent 75** (SMS gateway)
- `whatsapp` → wire to **Agent 74** (WhatsApp Business API)
- `pagerduty` → outgoing webhook POST
- `dashboard` → wire to the existing SSE hub (`src/realtime/sse-hub.js`)
- `phone` → voice paging gateway

All adapter errors are caught; a failed adapter never blocks the rest of
the dispatch chain.

## 7. Bilingual payload

Every notification payload carries both English and Hebrew fields:

```
{
  title, title_he,
  summary, summary_he,
  severity, severity_he,      // 'critical' / 'קריטי'
  sms_text,                   // "[CRITICAL] DBDown — Connection refused | RB: https://…"
  sms_text_he,                // "[קריטי] מסד הנתונים נפל — ...  | ספר ריצה: …"
  runbook,                    // https://kb.technokol.co.il/runbook/<alertname>
  onCall: {id, name},         // the primary on duty at dispatch time
  labels, annotations, startsAt, state
}
```

`SEVERITY_HE = {critical:'קריטי', high:'גבוה', medium:'בינוני', low:'נמוך', info:'מידע'}`
is exported for direct reuse by UI code.

## 8. Test plan

The test file `test/payroll/alert-manager.test.js` runs on the built-in
`node:test` runner (no deps). A clock harness (`makeClock`) injects a
fake `now` so time-sensitive behaviour (silences expiry, digest flush,
escalation grace) is deterministic.

### Covered test groups (41 tests total)

| Suite | Tests | What it proves |
|---|---|---|
| Fingerprinting & matching | 5 | Stable fingerprint, exact/regex matchers, missing label = no match |
| Fire + dedupe | 4 | fire returns id, dedupe increments count, invalid severity throws |
| Routing by severity | 4 | critical→phone/sms/slack/pd, medium→email/slack, info→dashboard, overrides |
| Silences | 4 | mutes, expires, unsilence, input validation |
| Inhibition | 2 | upstream suppresses downstream, `equal` key enforces label match |
| Grouping + digest | 2 | multiple alerts → one dispatch, low→digest flushes after 24h |
| Ack + resolve | 3 | state transitions, resolve clears dedupe index |
| Escalation | 2 | escalates past grace, acked does not escalate |
| Israeli time awareness | 7 | Shabbat, Saturday, business hours, holidays, channel adjust |
| On-call rotation | 3 | member picking, getCurrentOnCall, Friday handoff |
| Bilingual + runbook | 2 | Hebrew fields present, custom runbook wins |
| Housekeeping + stats | 3 | counters, sorting, close() |

### Test run

```
$ node --test test/payroll/alert-manager.test.js

...
ℹ tests 41
ℹ suites 12
ℹ pass 41
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 148.19
```

## 9. Wiring guide

### Minimal server integration

```js
const { createManager } = require('./src/ops/alert-manager');

const alertMgr = createManager({
  runbookBase: 'https://kb.technokol.co.il/runbook',
  escalationGraceMs: 15 * 60 * 1000,
  channels: {
    slack:     realSlackAdapter,      // webhook
    email:     agent73EmailAdapter,   // existing email service
    sms:       agent75SmsAdapter,     // SMS gateway
    whatsapp:  agent74WhatsAppAdapter,
    pagerduty: realPagerDutyAdapter,
    dashboard: sseHubAdapter,         // existing SSE hub
    phone:     voicePagingAdapter,
  },
  schedule: {
    primary: { members: [...], rotationHours: 168, startAt: Date.UTC(2026,0,4) },
    secondary: { members: [...], rotationHours: 336, startAt: Date.UTC(2026,0,4) },
  },
});

// Drive tick every minute — inside the existing main loop or setInterval.
setInterval(() => alertMgr.tick(), 60_000).unref();

// Feed from metrics rule engine:
alertMgr.fire({
  labels: {
    alertname: 'PayrollSlipsFailing',
    service: 'payroll',
    severity: 'high',
    env: 'prod',
  },
  title: 'Payroll slip generation failing',
  title_he: 'הפקת תלושי שכר נכשלת',
  summary: '5% of slips failing in the last 10m',
  summary_he: '5% מהתלושים נכשלים ב-10 הדקות האחרונות',
});
```

### HTTP endpoints (suggested)

| Path | Verb | Action |
|---|---|---|
| `/api/alerts/active` | GET | `alertMgr.listActive()` |
| `/api/alerts/:id/ack` | POST | `alertMgr.ack(id, req.user.id)` |
| `/api/alerts/:id/resolve` | POST | `alertMgr.resolve(id)` |
| `/api/alerts/silences` | GET | `alertMgr.listSilenced()` |
| `/api/alerts/silences` | POST | `alertMgr.silence(body)` |
| `/api/alerts/silences/:id` | DELETE | `alertMgr.unsilence(id)` |
| `/api/alerts/stats` | GET | `alertMgr.stats()` |

## 10. Compliance + safety notes

- **PII scrubbing**: payload `annotations` may contain sensitive data. The
  module does not introspect annotations; the caller (agent 73/74/75) is
  responsible for redaction on the wire. This mirrors the Sentry-
  compatible pattern used by `src/ops/error-tracker.js`.
- **Never delete**: the module keeps a bounded `history[]` (50k entries) +
  `active` map. `close()` is only called from tests / shutdown. No
  destructive eviction beyond the MAX_HISTORY trim.
- **Rate limiting**: grouping acts as a de-facto throttle — first-in-group
  dispatches normally; subsequent alerts within the 5-minute window are
  swallowed. In a burst (100 alerts/sec) the manager dispatches ≤1
  slack/email per group per window.
- **Adapter safety**: every `send()` is wrapped in try/catch; a broken
  slack webhook does not break pagerduty.
- **Clock injection**: all timing code reads `opts.now()` — tests run
  without `setTimeout`, CI stays deterministic.

## 11. Outstanding / future work

- Wire real adapters for Agent 73 (email), Agent 74 (whatsapp), Agent 75
  (sms) as soon as those modules are stable.
- Persist silences + active alerts to disk (currently in-memory only).
  Follow-up: add JSONL backing store similar to `error-tracker.js`.
- Add a web UI page to display `listActive()` with ack/silence buttons
  (Part 12 — Ops Console).
- Extend holiday calendar per year via a separate `src/ops/il-calendar.js`
  module (will be delivered by Agent X-63).

---

**Agent X-55 — signing off.**
40/40 originally + 1 post-fix (RegExp deepClone bug) = 41/41 tests green.
Module is ready for integration into the Ops Console.
