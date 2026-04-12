# AG-X57 — Uptime Monitor / משגיח זמינות

**Agent:** X-57
**Swarm:** 3D (Techno-Kol Uzi mega-ERP)
**Date:** 2026-04-11
**Status:** GREEN — 23/23 tests passing
**Scope:** Uptime monitoring — ping targets + alert on outage

---

## 1. Overview / סקירה

ONYX now ships a zero-dependency **uptime monitor** that runs HTTP(S), TCP, and
DNS probes on a schedule, tracks response-time percentiles, computes uptime %
over standard windows, and pushes state-change alerts to the Agent X-55 alert
manager and Agent X-52 metrics pipeline.

מערכת ניטור זמינות אפס-תלויות המריצה בדיקות HTTP/TCP/DNS בלוח זמנים, עוקבת
אחרי זמני תגובה (P50/P95/P99), מחשבת אחוזי זמינות ומדווחת למנהל ההתרעות.

**Files added**

| File | Purpose |
|------|---------|
| `src/ops/uptime-monitor.js` | Engine, probes, state machine, metrics, seeds |
| `test/payroll/uptime-monitor.test.js` | 23 unit tests (node --test) |
| `_qa-reports/AG-X57-uptime-monitor.md` | This report |

**Zero-dependency proof:** the module's only `require()` calls are Node
built-ins — `node:http`, `node:https`, `node:net`, `node:dns`, `node:tls`,
`node:url`, `node:events`.

---

## 2. Feature Checklist / רשימת תכונות

| # | Spec item | Status | Notes |
|---|-----------|--------|-------|
| 1 | Register monitors (URL, interval, timeout, expected_status, body_contains) | DONE | `engine.register()` — see test #1, #2 |
| 2 | Check types HTTP(S), TCP ping, DNS lookup | DONE | `probeHttp` / `probeTcp` / `probeDns`; tests #3-#9 |
| 3 | Multi-region stub | DONE | `opts.region` tagged on every sample + metric; test #19 |
| 4 | Retry logic → DOWN after N failures | DONE | `consecutive_failures` counter; test #10 |
| 5 | SSL certificate expiry checks | DONE | `cert_days_left` on HTTPS + `probeSslExpiry`; test #17 |
| 6 | Response time P50/P95/P99 | DONE | `getLatency()` + `_percentile`; test #13 |
| 7 | Uptime % (24h/7d/30d/90d/365d) | DONE | `getUptime()`; test #12 |
| 8 | Downtime log with duration | DONE | `downtimeHistory()`; test #11 |
| 9 | Maintenance windows suppress alerts | DONE | `scheduleMaintenance()`; tests #14, #21 |
| 10 | Status-change webhook | DONE | EventEmitter + HTTP POST; test #15 |

---

## 3. Public API

```js
const { createMonitor } = require('./src/ops/uptime-monitor');

const engine = createMonitor({
  region: 'il-tlv',
  alertManager,          // Agent X-55 — { emit?, fire? }
  metricsSink,           // Agent X-52 — fn | { observe() }
  webhooks: ['https://hooks.example/alert'],
});

engine.register({
  id: 'tax-authority',
  url: 'https://www.misim.gov.il/',
  type: 'https',
  interval: 300_000,
  timeout: 10_000,
  expected_status: [200, 301, 302],
  body_contains: null,
  retries: 3,
});

engine.start();
await engine.runCheck('tax-authority');
engine.getStatus('tax-authority');       // { up, consecutive_failures, ... }
engine.getUptime('tax-authority', '30d'); // 99.97
engine.getLatency('tax-authority', '24h'); // { p50, p95, p99 }
engine.downtimeHistory('tax-authority', '7d');
engine.scheduleMaintenance('tax-authority', { from, to, reason });
engine.stop();
```

---

## 4. State Machine / מכונת מצבים

```
unknown ──fail──▶ unknown ──fail (N in a row)──▶ down
   │                                              │
   └──────────── success ────────────▶ up ◀───────┘
                                         │
                                     maintenance (sample in window)
```

- `retries` (default 3) is the consecutive-failure threshold before an UNKNOWN or
  UP monitor transitions to DOWN.
- A maintenance window short-circuits the probe entirely: the sample is tagged
  `maintenance`, alerts are suppressed, and the uptime denominator excludes it.
- Every transition emits:
  - `engine.emit('status_change', payload)`
  - POST to every configured webhook (fire-and-forget, 5s timeout)
  - `alertManager.emit(...) / .fire(...)` if wired

---

## 5. Default Seed Monitors

`engine.seedDefaults()` registers the five mandatory targets:

| ID | Target | Type |
|----|--------|------|
| `self-healthz` | `http://127.0.0.1:3000/healthz/ready` | HTTP |
| `tax-authority` | `https://www.misim.gov.il/` | HTTPS |
| `boi-currency` | `https://www.boi.org.il/PublicApi/GetExchangeRates` | HTTPS |
| `gmail-smtp` | `smtp.gmail.com:587` | TCP |
| `supabase` | `https://api.supabase.com/platform/status` | HTTPS |

All five are asserted present in test #20.

---

## 6. Metrics (Agent X-52)

Every check emits a Prometheus-shaped snapshot:

```
uptime_monitor_up{id,type,region}                = 0 | 1
uptime_monitor_latency_ms{id,type,region}        = float
uptime_monitor_consecutive_failures{id}          = int
uptime_monitor_cert_days_left{id}                = int | -1
```

The snapshot is passed to a user-supplied `metricsSink(snap)` function (or
`metricsSink.observe(snap)` if an object is provided) and re-emitted as an
`engine.emit('metrics', snap)` event. Test #16 verifies both shapes.

`engine.snapshotMetrics()` returns a synchronous array that the Agent X-52
exporter can poll on `/metrics` scrape.

---

## 7. Test Results / תוצאות בדיקות

```
✔ register adds a monitor with defaults                         (1.6ms)
✔ register rejects missing id / url / unknown type              (0.5ms)
✔ HTTP probe: UP when server returns expected status            (26.2ms)
✔ HTTP probe: DOWN when body_contains does not match            (8.2ms)
✔ HTTP probe: DOWN when status is unexpected                    (6.3ms)
✔ HTTP probe: expected_status accepts an array                  (6.5ms)
✔ TCP probe: UP against a live listener                         (4.5ms)
✔ TCP probe: DOWN against a closed port                         (1.8ms)
✔ DNS probe: resolves localhost                                 (6.3ms)
✔ retry logic: DOWN after N consecutive failures                (0.5ms)
✔ downtime log captures duration once monitor recovers          (0.3ms)
✔ getUptime computes uptime % from in-window samples            (0.1ms)
✔ getLatency returns percentiles and pure percentile helper     (0.2ms)
✔ maintenance windows suppress probing and keep uptime clean    (0.2ms)
✔ status_change event fires on DOWN and recovery transitions    (0.2ms)
✔ metrics snapshot exposes uptime_monitor_up + latency labels   (0.1ms)
✔ cert_days_left ≤ warn threshold emits cert_expiring_soon      (0.1ms)
✔ alertManager.emit/fire hooks fire on status change            (0.1ms)
✔ multi-region stub: two engines produce distinct region labels (0.1ms)
✔ default seed monitors include the mandatory set               (0.2ms)
✔ scheduleMaintenance rejects invalid ranges                    (0.1ms)
✔ helpers: parseTarget + inferType + real HTTP round-trip       (8.0ms)
✔ start/stop manage timers without crashing                     (0.3ms)

tests 23 | pass 23 | fail 0 | duration 203 ms
```

Run locally with:

```
node --test test/payroll/uptime-monitor.test.js
```

Live servers are spun up via `http.createServer` / `net.createServer` on port 0
inside the test process — no external network access required.

---

## 8. Never-Delete Guarantees

- Samples live in a **ring buffer** (`MAX_SAMPLES = 525 600`, ~365 days @ 60s).
  The oldest sample is recycled, never explicitly deleted; history is
  preserved for the full retention window.
- Downtime events live in a second ring buffer (`MAX_DOWNTIME_EVENTS = 4 096`).
- Re-registering an existing monitor **preserves** its samples, downtime log,
  maintenance windows, and current outage state. Only the spec fields are
  updated.
- `stop()` cancels timers but never touches state — calling `start()` again
  resumes where the previous run left off.

---

## 9. Hebrew Bilingual Coverage

Every alert payload and `status_change` event carries a `messages: {he, en}`
object, e.g.

```json
{
  "he": "המוניטור tax-authority נפל: unexpected_status:503",
  "en": "Monitor is DOWN: unexpected_status:503"
}
```

Monitor specs accept `name: {he, en}` and the five seed monitors all ship with
Hebrew labels.

---

## 10. Risk Log / יומן סיכונים

| Risk | Mitigation |
|------|------------|
| Self-DDoS from very short intervals | `interval` clamped to ≥ 1 000 ms in `register()`. |
| Certificate inspection throws in old Node | Wrapped in `try/catch`; returns `null` gracefully. |
| Webhook endpoint hangs | 5 s timeout + `.destroy()`, errors swallowed. |
| Alert spam on flapping monitors | `consecutive_failures` threshold (default 3) gates DOWN alerts. |
| Maintenance-window misconfig | Range validated in `scheduleMaintenance()` (from < to, finite). |
| Test pollution from real DNS | `dns.lookup('localhost')` only; no external endpoints are hit. |

---

## 11. Sign-off

All acceptance criteria met, 23/23 tests green, zero external deps, Hebrew
bilingual surface, never-delete guarantees honoured. Ready for integration
with Agent X-55 (alert manager) and Agent X-52 (metrics exporter).

— Agent X-57
