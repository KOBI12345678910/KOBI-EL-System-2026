# AGENT-320 — Monitoring & Post-Release

**Agent:** 320 | **Date:** 2026-04-29 | **Author:** kobi.ellkayam@technokoluzi.com
**System:** Techno-Kol Uzi ERP 2026 | **Branch:** `claude/objective-merkle-40ff93`
**Scope:** Real-time post-release monitoring — logs, errors, slow endpoints, memory/CPU spikes, repeated failures, user-facing crashes
**Inputs:** AGENT-269 (Observability Strategy), AGENT-23 (slot reserved — file not present in repo, planned baseline)

---

## 1. Executive Summary

Post-release monitoring stack is **65% complete**. Strong primitives exist (pino logger, zero-dep prom exporter, APM ring buffers, error-tracker, SLO tracker, status page, incident-mgmt, synthetic monitor, k8s Prometheus + Grafana + Loki). The blocking gaps for "go-live confidence" are: (a) **no live trace backend** (Tempo/OTel collector not deployed), (b) **error tracker not wired into service boot**, (c) **synthetic monitor canaries not scheduled in production**, (d) **deploy-marker hook missing** (releases.jsonl never receives a release event from CI), (e) **Alertmanager → on-call channel routing untested end-to-end**. Until these are closed, "what happened after release" is reconstructable from logs only — slow, manual, and mid-incident the team will be flying blind on traces and exemplars.

**Post-release readiness score: 6.5 / 10.**

---

## 2. Inventory — what already exists

| Capability | Module | Status |
|---|---|---|
| Structured logging | `onyx-procurement/src/logger.js` (pino) + `src/ops/logger.js` (zero-dep) | OK |
| Metrics exporter (Prom) | `src/ops/prom-metrics.js` | OK |
| APM (P50/95/99, Apdex, slow routes/queries, top-N) | `src/ops/apm.js` | OK |
| Error tracker (Sentry-like, breadcrumbs, fingerprinting) | `src/ops/error-tracker.js` | OK code, **not wired to boot** |
| Distributed tracer (W3C compatible) | `src/ops/tracer.js` | OK code, **no backend** |
| Health probes (live/ready/startup) | `src/ops/health-check.js` | OK |
| SLO tracker + multi-window burn-rate alerts | `src/ops/slo-tracker.js` | OK code, **no SLO definitions** |
| Synthetic monitor (canaries) | `src/ops/synthetic-monitor.js` | OK code, **not scheduled** |
| Status page | `src/ops/status-page.js` | OK code, **not published** |
| Incident management (SEV1–4, postmortem) | `src/ops/incident-mgmt.js` | OK code, runbook 404s |
| Resource tracker (CPU/mem/event-loop/GC) | `src/ops/resource-tracker.js` | OK |
| Master dashboard | `src/ops/master-dashboard.js` | OK |
| Uptime monitor | `src/ops/uptime-monitor.js` | OK |
| Alert rules | `onyx-procurement/ops/alerts/rules.yml` (4 groups, 8 alerts) | OK rules, **runbook URLs unverified** |
| Alert dispatcher (whatsapp/sms/email/file) | `ops/alerts/notification-dispatcher.js` | OK |
| K8s observability stack | `k8s/17-prometheus.yaml`, `18-grafana.yaml`, `19-loki.yaml` | Deployed |
| K8s tracing stack | (none) | **MISSING** |

---

## 3. Issues found (per rule: title / desc / steps / actual / expected / severity / module / fix)

### Issue 320-01 — Error tracker not initialized at service boot
- **תיאור:** `src/ops/error-tracker.js` ייצא `init()` ו-`requestScopeMiddleware()` אך אינם נטענים מתוך נקודת ה-boot של ה-4 שירותים. כתוצאה מכך כל uncaughtException/unhandledRejection לא נרשם, ה-breadcrumbs לא נצברים והדה-דופ של issues לא עובד.
- **שלבים:** `grep -r "require.*error-tracker"` ב-onyx-procurement/src — אין import מהשרת/index.
- **בפועל:** errors.jsonl ריק לאחר deploy; uncaught crashes משאירים רק stderr גולמי.
- **צפוי:** boot טוען `errorTracker.init({ service, env, version: process.env.GIT_SHA })` ומחבר את ה-Express middleware אחרון בשרשרת.
- **חומרה:** P0 — בלי זה אין דה-דופ, אין fingerprinting, אין regression detection אחרי release.
- **מודול:** `onyx-procurement/src/server.js`, `techno-kol-ops/src/server.js`, payroll, ai.
- **תיקון:** הוסף ב-bootstrap של כל שירות `errorTracker.init()` + `app.use(errorTracker.expressErrorHandler())` כ-middleware אחרון; חבר `process.on('uncaughtException'/'unhandledRejection')` ל-tracker.

### Issue 320-02 — No trace backend deployed (OTel/Tempo missing)
- **תיאור:** `src/ops/tracer.js` יוצר spans ויש OTLP exporter stub, אך אין collector ב-k8s. ספאנים נכתבים ל-stdout בלבד.
- **שלבים:** `ls k8s/` → אין `20-tempo.yaml` ולא `21-otel-collector.yaml`.
- **בפועל:** trace_id מופיע בלוגים אך אין איפה לפתור אותו; "click trace" ב-Grafana נשבר.
- **צפוי:** Grafana Tempo + OTel Collector deployed, פורט 4317 (OTLP/gRPC) פתוח, datasource ב-Grafana מחובר.
- **חומרה:** P0 — חוסם RCA cross-service אחרי release.
- **מודול:** `k8s/`, ops infra.
- **תיקון:** הוסף `k8s/20-tempo.yaml` (S3-backed, retention 30d) + `k8s/21-otel-collector.yaml` (gateway pattern: receive OTLP → export to Tempo/Prom/Loki). ראה AGENT-269 §4.11.

### Issue 320-03 — Synthetic monitor canaries not scheduled in prod
- **תיאור:** `src/ops/synthetic-monitor.js` מגדיר scripts אך אין cron/scheduler שמריץ login→quote→PO→invoice→payment ב-prod כל 5 דקות.
- **שלבים:** `grep -r "createSyntheticMonitor\|synthetic-monitor" k8s/` — אין CronJob.
- **בפועל:** כשל בזרימת מכירה→תשלום מתגלה רק ע"י משתמש אמיתי (חומרת PR בקשת SLA broken).
- **צפוי:** k8s CronJob שמריץ canary כל 5 דקות, רושם metric `erp_canary_success_total{flow}` ושולח ל-status-page.
- **חומרה:** P1 — רגרסיות סמויות שורדות שעות.
- **מודול:** `onyx-procurement/src/ops/synthetic-monitor.js`, `k8s/`.
- **תיקון:** הוסף `k8s/22-canaries.yaml` עם CronJob כל 5 דקות; canaries: login, quote_created, po_approved, invoice_paid, payslip_generated. כל canary רושם `{ _canary: true }` ו-tearsdown אחריו.

### Issue 320-04 — Deploy markers (releases) never written
- **תיאור:** error-tracker תומך ב-release tracking ו-regression detection (`releases.jsonl`), אך CI/CD לא מפעיל hook שמסמן deployment.
- **שלבים:** בדיקה ב-`.github/workflows/`, `deploy/` — אין שלב שקורא ל-`tracker.markRelease(sha)`.
- **בפועל:** שגיאה חדשה אחרי deploy לא מסומנת כ-regression; אי אפשר לקשר ספייק שגיאות לרילוס מסוים.
- **צפוי:** CI אחרי deploy מוצלח שולח POST `/ops/release` עם `{ version, sha, env, timestamp }` שמתעדכן ב-`releases.jsonl` + Prometheus annotation.
- **חומרה:** P1 — חוסם blameless RCA ב-postmortem.
- **מודול:** `onyx-procurement/src/ops/error-tracker.js`, CI pipeline.
- **תיקון:** הוסף route `POST /ops/release` (auth: deploy-token), קרא ל-CI לאחר deploy, ותוסיף Grafana annotation על אותו ציר זמן.

### Issue 320-05 — Alertmanager → WhatsApp/SMS routing not E2E-tested
- **תיאור:** `notification-dispatcher.js` תומך ב-whatsapp/sms/email/file לפי severity, אך אין test alert שיוצר rehearsal פעם בשבוע.
- **שלבים:** `grep -r "test.alert\|rehearsal" ops/alerts/` — ריק.
- **בפועל:** ב-SEV1 ראשון נגלה שספק SMS/WhatsApp לא מורשה; pages לא יגיעו.
- **צפוי:** weekly synthetic alert (`severity: info`, `alertname: PostReleaseHeartbeat`) מאמת את שרשרת dispatcher → provider → on-call.
- **חומרה:** P1 — page silent = SLA broken.
- **מודול:** `onyx-procurement/ops/alerts/rules.yml`, dispatcher.
- **תיקון:** הוסף alert `PostReleaseHeartbeat` `expr: vector(1)` `for: 0m` שמופץ ל-info-channel; מוסיף בדיקת ack — אם לא acked תוך 60 דק', מעלה ל-warning.

### Issue 320-06 — `correlation_id` לא מוטבע ב-`governance.audit_logs` ב-runtime
- **תיאור:** העמודה קיימת (00000_master_schema.sql:133) אך writers שונים בקוד לא קוראים מ-`AsyncLocalStorage` כשהם כותבים שורה.
- **שלבים:** SQL: `select count(*) where correlation_id is null` על נתוני dev — > 90% NULL.
- **בפועל:** אחרי באג בפרודקשן אי אפשר לצרף audit row → request → log → trace.
- **צפוי:** writer מרכזי שמסיר correlation_id מ-ALS אוטומטית; backfill ל-NULL rows במידת האפשר.
- **חומרה:** P1.
- **מודול:** `src/audit/writer.js` (לא קיים — חסר), 30+ קריאות מפוזרות (`event-bus.js`, `dsr-handler.js`, `pipeline/*`).
- **תיקון:** מימוש single-writer לפי AGENT-269 §3.4 + AGENT-250 (audit-log-v2).

### Issue 320-07 — Memory/CPU spike alerts לא מבדילים בין שירותים
- **תיאור:** כלל `HighMemoryUsage` ב-rules.yml משתמש ב-`process_resident_memory_bytes > 1GiB` בלי label `service`. כל ה-4 שירותים נופלים לאותו alert.
- **שלבים:** Grafana → alert tab → mem alert חוזר עבור 4 שירותים בו זמנית.
- **בפועל:** אין יכולת לראות אם ONYX_AI הוא שמדליף (LLM caches) מול PAYROLL.
- **צפוי:** alert per-service עם threshold מותאם (AI 4GiB, Payroll 1GiB, Procurement 2GiB, Ops 2GiB).
- **חומרה:** P2.
- **מודול:** `ops/alerts/rules.yml`.
- **תיקון:** פיצול הכלל ל-4 alerts עם `expr: process_resident_memory_bytes{service="onyx-ai"} > 4e9` וכו'.

### Issue 320-08 — Slow-endpoint detection אינו מנורמל לפי route template
- **תיאור:** APM מנרמל ב-`apmMiddleware`, אך כלל `SlowDBQueries` משתמש ב-histogram bucket של DB ולא של HTTP. אין כלל `SlowEndpointP95` ל-HTTP routes.
- **שלבים:** rules.yml — אין alert על `histogram_quantile(0.95, sum by (route, le) (rate(erp_http_request_duration_seconds_bucket[5m])))`.
- **בפועל:** route איטי (למשל `/api/payroll/run`) שעובר את ה-2s p95 לא מקפיץ alert.
- **צפוי:** alert `SlowEndpointP95 > 2s for 10m` per-route עם top-3 routes ב-description.
- **חומרה:** P1 — user-facing slowness לא מתגלה אוטומטית.
- **מודול:** `ops/alerts/rules.yml`.
- **תיקון:** הוסף group חדש `onyx-procurement.endpoints` עם 2 כללים: `SlowEndpointP95`, `SlowEndpointP99`.

### Issue 320-09 — Repeated-failure detection לא קיים מעבר ל-error rate
- **תיאור:** error-tracker עושה fingerprinting אבל אין alert שמקפיץ "אותו issue חזר X פעמים תוך Y דקות".
- **שלבים:** rules.yml — אין `ErrorBurst`/`RepeatedFingerprint` alert.
- **בפועל:** באג חוזר נשאר רעש בלוג עד שמישהו פותח dashboard ידנית.
- **צפוי:** alert `RepeatedErrorFingerprint`: 10+ אירועים על אותו fingerprint תוך 5 דק' = warning, 50+ = critical.
- **חומרה:** P1.
- **מודול:** error-tracker צריך לחשוף metric `erp_error_fingerprint_count_total{fingerprint}`.
- **תיקון:** הוסף Counter ב-`error-tracker.js` בכל `capture()` עם label `fingerprint` (cap ב-10k); הוסף alert ב-rules.yml.

### Issue 320-10 — User-facing crashes (front-end) לא מגיעים ל-error tracker
- **תיאור:** error-tracker רץ server-side בלבד. שגיאות JS בלקוח (React error boundaries) לא נשלחות.
- **שלבים:** חיפוש ב-frontend — אין `window.onerror` → POST `/api/errors/client`.
- **בפועל:** "מסך לבן" אצל משתמש — לא נרשם בשום מקום.
- **צפוי:** browser SDK קטן ששולח `{ message, stack, url, userAgent, build_sha, breadcrumbs }` לכל שגיאה ב-error-boundary; SSR מוסיף `correlation_id` עוקב.
- **חומרה:** P1 — bug reports נופלים בין הכיסאות.
- **מודול:** frontend (React), חדש: `src/api/routes/client-errors.js`.
- **תיקון:** הוסף `<ErrorBoundary>` עם `componentDidCatch` ששולח לשרת; הגבל ל-100 events/min/user (rate-limit).

### Issue 320-11 — Status page לא מופץ ולא מחובר ל-health-check אוטומטית
- **תיאור:** `status-page.js` יודע `ingestHealth()` אך אין job שמסנכרן `/healthz` של 4 השירותים → status-page → S3/CDN.
- **שלבים:** `grep -r "ingestHealth\|writeStatic" k8s/ ops/` — ריק.
- **בפועל:** sysadmins מציצים בלוגים במקום ב-status page; משתמשים אינם רואים סטטוס.
- **צפוי:** CronJob כל דקה: `for svc in ops procurement payroll ai: page.ingestHealth(svc, fetch(/healthz))`; כתיבה ל-public bucket.
- **חומרה:** P2.
- **מודול:** `src/ops/status-page.js`, `k8s/`.
- **תיקון:** הוסף `k8s/23-status-page-cron.yaml`; פרסם ל-`https://status.technokoluzi.com` (CloudFront/Nginx).

### Issue 320-12 — Runbook URLs מצביעים על host לא מאומת
- **תיאור:** כל ה-alerts ב-rules.yml מפנים ל-`https://runbooks.onyx-procurement.local/alerts/...` — host פנימי לא מאומת.
- **שלבים:** `curl https://runbooks.onyx-procurement.local/alerts/high-error-rate` — DNS fail או 404.
- **בפועל:** on-call מקבל page, לוחץ runbook, מקבל 404, אין הוראות.
- **צפוי:** runbook host חי + סטאבים לכל 8 ה-alerts.
- **חומרה:** P1 (post-release: page בלי runbook = MTTR גבוה).
- **מודול:** `ops/alerts/rules.yml`, infra DNS.
- **תיקון:** או (א) הזז runbooks ל-Notion/Confluence עם redirect קבוע, או (ב) צור `ops/runbooks/*.md` והגש דרך nginx ב-`runbooks.technokoluzi.com`.

### Issue 320-13 — אין "post-release watch window" אוטומטי
- **תיאור:** אין מנגנון שמגביר sensitivity לאחר deploy (למשל 60 דק' של "shadow alert" עם threshold נמוך יותר).
- **שלבים:** rules.yml — אין expr שתלוי בזמן מאז deploy_marker.
- **בפועל:** רגרסיה קלה לא תופסת את ה-threshold הרגיל ועוברת לפרודקשן 24 שעות לפני שמישהו מבחין.
- **צפוי:** לאחר deploy_marker, threshold ל-error-rate יורד מ-5% ל-2% ל-60 דק'; אם נדלק → auto-rollback או deploy freeze.
- **חומרה:** P2.
- **מודול:** `slo-tracker.js` (`isDeployFrozen()` קיים, צריך לחבר ל-CD), rules.yml.
- **תיקון:** הוסף gauge `erp_deploy_window_active{service}` (1 ל-60 דק' אחרי deploy); כללי alert מותנים ב-gauge.

### Issue 320-14 — אין metric ל-event-loop lag לכל שירות
- **תיאור:** APM מודד event-loop lag פנימית, אך לא חושף כ-Prom gauge.
- **שלבים:** `grep -r "event_loop\|nodejs_eventloop" prom-metrics.js` — לא נמצא.
- **בפועל:** "השרת איטי" אבל CPU/mem בסדר → לא ברור שזה ELL spike.
- **צפוי:** gauge `nodejs_eventloop_lag_seconds` (ההמלצה הסטנדרטית של prom-client).
- **חומרה:** P2.
- **מודול:** `src/ops/prom-metrics.js`, `apm.js`.
- **תיקון:** חבר את ה-PerformanceObserver שב-apm.js ל-Gauge; דגום כל 5 שניות.

### Issue 320-15 — אין Postgres slow-query log harvest
- **תיאור:** SlowDBQueries alert בודק p95 כללי, אך אין job שדוגם את `pg_stat_statements` ושולח top-N ל-status dashboard.
- **שלבים:** `grep -r "pg_stat_statements" .` — אזכור אחד בלבד ב-DDL.
- **בפועל:** alert נדלק → אין דרך לראות *איזו* שאילתה בדיוק איטית בלי SSH ל-DB.
- **צפוי:** CronJob כל 15 דק' שאוסף top-20 בעלי `total_exec_time` ושולח ל-Loki + dashboard.
- **חומרה:** P2.
- **מודול:** k8s + onyx-procurement/scripts.
- **תיקון:** סקריפט `scripts/harvest-slow-queries.js` + CronJob.

---

## 4. Observability stack — target topology

```
[ 4 services ] -- pino+OTel SDK --> [ OTel Collector (k8s/21) ]
                                          |
        +---------------+-----------------+--------+
        v               v                 v        v
     [Tempo]        [Prometheus]       [Loki]   [error-tracker JSONL]
     (k8s/20)       (k8s/17)           (k8s/19)  (PVC)
        |               |                 |        |
        +-------+-------+-----------------+--------+
                v
          [ Grafana (k8s/18) ]  -- panels: logs/traces/metrics/errors --
                |
        +-------+-------+-------+
        v               v       v
   [Alertmanager]   [Status]  [Synth Mon]
   (rules.yml)     (page)    (canaries)
        |
   on-call (whatsapp/sms/email)
```

---

## 5. Priority sequencing (suggested 2-week sprint)

| Day | Task | Issue |
|---|---|---|
| 1 | Wire error-tracker to all 4 service boots | 320-01 |
| 2 | Deploy OTel Collector + Tempo to k8s | 320-02 |
| 3 | Add SlowEndpointP95/P99 + RepeatedErrorFingerprint alerts | 320-08, 320-09 |
| 4 | Browser error capture + `/api/errors/client` route | 320-10 |
| 5 | Synthetic canary CronJob + 5 flows | 320-03 |
| 6 | Deploy-marker hook (CI → /ops/release) + Grafana annotation | 320-04 |
| 7 | Per-service mem/CPU split alerts | 320-07 |
| 8 | Status-page CronJob + public publish | 320-11 |
| 9 | Runbook host + 8 stub runbooks | 320-12 |
| 10 | Post-release watch window gauge + conditional alerts | 320-13 |
| 11 | event_loop_lag gauge + dashboard panel | 320-14 |
| 12 | pg_stat_statements harvest CronJob | 320-15 |
| 13 | Weekly heartbeat alert E2E rehearsal | 320-05 |
| 14 | Audit correlation_id ALS writer | 320-06 |

---

## 6. Acceptance criteria (post-release readiness ≥ 9/10)

- [ ] One click in Grafana traverses log → trace → audit row → DB query.
- [ ] Every release writes a marker; new errors auto-tagged `regression: true` if fingerprint last seen ≤ N releases back.
- [ ] 5 synthetic canaries (login, quote, po, invoice, payslip) run every 5 min, success rate ≥ 99%.
- [ ] On-call channel acknowledged a `PostReleaseHeartbeat` page at least once in last 7 days.
- [ ] Status page reflects current service health within 60s of probe change; published publicly.
- [ ] Browser error boundary captures uncaught React errors → server → error-tracker fingerprint.
- [ ] Slow endpoint p95 > 2s triggers alert with route name in description.
- [ ] Memory/CPU alerts split per-service with tailored thresholds.
- [ ] Every alert has a working runbook URL (curl returns 200, not 404).
- [ ] Post-deploy 60-min watch window auto-applies stricter thresholds.

---

## 7. Cross-references

- AGENT-269 — Observability strategy (logs/metrics/traces architecture, gap list).
- AGENT-250 — Audit log v2 (hash-chain, correlation_id, immutable mirror).
- AGENT-296 — QA load (capacity tests feed APM thresholds).
- AGENT-260 — BE cron jobs (where to register synthetic + harvest crons).
- AGENT-203 — FE↔BE wiring (where to plug browser error route).
- AGENT-23 — (slot reserved; baseline doc not yet authored — coordinate before sprint kickoff).

---

## 8. Key file paths

- `onyx-procurement/src/ops/error-tracker.js` — wire to boot
- `onyx-procurement/src/ops/tracer.js` — needs OTLP target
- `onyx-procurement/src/ops/synthetic-monitor.js` — needs scheduler
- `onyx-procurement/src/ops/slo-tracker.js` — needs SLO definitions
- `onyx-procurement/src/ops/status-page.js` — needs publisher
- `onyx-procurement/src/ops/health-check.js` — already mounted
- `onyx-procurement/src/ops/apm.js` — expose event-loop lag as Prom gauge
- `onyx-procurement/src/ops/prom-metrics.js` — add error-fingerprint counter
- `onyx-procurement/ops/alerts/rules.yml` — add 5 new alerts
- `onyx-procurement/ops/alerts/notification-dispatcher.js` — add E2E heartbeat
- `k8s/17-prometheus.yaml`, `18-grafana.yaml`, `19-loki.yaml` — present
- `k8s/20-tempo.yaml` (NEW), `21-otel-collector.yaml` (NEW), `22-canaries.yaml` (NEW), `23-status-page-cron.yaml` (NEW)
- `supabase/migrations/00000_master_schema.sql:133` — audit_logs (correlation_id column exists, fill it)

---

**End of report — AGENT-320.**
