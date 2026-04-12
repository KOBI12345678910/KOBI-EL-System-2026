# Onyx Procurement — Alerting

This directory contains the production alerting configuration for the
**Onyx Procurement** platform: Prometheus rule definitions and a small Node
dispatcher that turns Alertmanager webhook payloads into multi-channel
notifications (console, file, email, WhatsApp, SMS).

```
ops/alerts/
  rules.yml                     # Prometheus alerting rules (8 alerts)
  notification-dispatcher.js    # Pluggable Alertmanager webhook receiver
  README.md                     # (this file)
```

---

## 1. The rules — what we alert on and why

All rules live in `rules.yml`, grouped into four logical families. Every rule
carries a `severity`, a bilingual (Hebrew + English) `summary`, a long-form
`description`, and a `runbook_url` so the on-call engineer can jump directly
from WhatsApp/SMS to a recovery checklist.

### 1.1 API & Service Health — `onyx-procurement.api`

| Alert             | Expression                                                   | Severity | What it tells you |
|-------------------|--------------------------------------------------------------|----------|-------------------|
| `HighErrorRate`   | `rate(http_requests_total{status=~"5.."}[5m]) > 0.05`        | critical | More than 5% of API responses are 5xx over the last 5 minutes. Usually means a recent bad deploy, a DB outage, or an upstream dependency failing. Paired with a `for: 2m` debounce to avoid blips. |
| `SlowDBQueries`   | `histogram_quantile(0.95, sum by (le) (rate(db_query_duration_seconds_bucket[5m]))) > 2` | warning | The 95th percentile of DB query latency has crossed 2 seconds. Look for missing indexes, lock contention, or a noisy neighbour. |

### 1.2 Host & Resource Saturation — `onyx-procurement.host`

| Alert              | Expression                                                                                  | Severity | What it tells you |
|--------------------|---------------------------------------------------------------------------------------------|----------|-------------------|
| `HighMemoryUsage`  | `process_resident_memory_bytes > 1073741824`                                                | warning  | A process is holding more than 1 GiB RSS for 10+ minutes. Classic leak / unbounded cache / runaway job signal. |
| `LowDiskSpace`     | `node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.10` (tmpfs/overlay excluded)  | critical | Less than 10% free on a real filesystem. Rotate logs, clear temp files, or extend the volume before writes start failing. |

### 1.3 Integrations — `onyx-procurement.integrations`

| Alert                       | Expression                                                          | Severity | What it tells you |
|-----------------------------|---------------------------------------------------------------------|----------|-------------------|
| `FailedWebhookDeliveries`   | `increase(webhook_delivery_failures_total[10m]) > 5`                | warning  | More than 5 outbound webhooks failed in 10 minutes. Inspect the dead-letter queue and the retry backoff policy. |
| `MissingDailyBackup`        | `time() - backup_last_success_timestamp > 86400 + 3600`             | critical | The last successful backup is older than 25 hours (24h + 1h grace). Trigger a manual backup and check the scheduler. |

### 1.4 Business-Critical Pipelines — `onyx-procurement.business`

These are the alerts the CFO cares about. They indicate that money-moving
pipelines are failing and must be treated like a production outage.

| Alert                         | Expression                                                   | Severity | What it tells you |
|-------------------------------|--------------------------------------------------------------|----------|-------------------|
| `PayrollGenerationFailures`   | `rate(payroll_slips_generated_total{status="failed"}[5m]) > 0` | critical | At least one payroll slip failed to generate. Check the payroll worker, the Form 102/126 templates, and the employer master data. |
| `VATExportFailure`            | `rate(vat_exports_total{status="failed"}[15m]) > 0`          | critical | A VAT export (PCN874 / Form 6111) failed. Check the Tax Authority submission endpoint and the reporting-period rollup. |

---

## 2. Wiring Prometheus

In `prometheus.yml`:

```yaml
rule_files:
  - /etc/prometheus/rules/*.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - alertmanager:9093
```

Mount the file into the Prometheus container:

```yaml
# docker-compose.yml snippet
services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./ops/alerts/rules.yml:/etc/prometheus/rules/onyx.yml:ro
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.path=/prometheus
```

Validate the file before reloading:

```bash
promtool check rules ops/alerts/rules.yml
```

Hot-reload Prometheus:

```bash
curl -X POST http://prometheus:9090/-/reload
```

---

## 3. Wiring Alertmanager to the dispatcher

The dispatcher is a tiny Node program that speaks the Alertmanager webhook
schema (v4). You can run it either as a long-running HTTP receiver or as a
one-shot stdin consumer for testing.

### 3.1 Long-running HTTP receiver

```bash
# start the receiver on port 9099
node ops/alerts/notification-dispatcher.js --server --port 9099
```

`alertmanager.yml`:

```yaml
global:
  resolve_timeout: 5m

route:
  receiver: onyx-dispatcher
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - matchers:
        - severity = critical
      receiver: onyx-dispatcher
      continue: true

receivers:
  - name: onyx-dispatcher
    webhook_configs:
      - url: http://127.0.0.1:9099/alerts
        send_resolved: true
```

### 3.2 Stdin / pipe mode (for testing and cron)

```bash
cat sample-payload.json | node ops/alerts/notification-dispatcher.js
```

Example minimal payload:

```json
{
  "version": "4",
  "status": "firing",
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alertname": "HighErrorRate",
        "severity": "critical",
        "service": "api"
      },
      "annotations": {
        "summary": "High 5xx error rate on API",
        "description": "5xx rate 0.08 req/s"
      },
      "startsAt": "2026-04-11T08:00:00Z"
    }
  ]
}
```

---

## 4. Channels and routing

The dispatcher ships with five pluggable channels:

| Key        | Backend                         | Status in this repo |
|------------|---------------------------------|---------------------|
| `console`  | `console.log`                   | ready               |
| `file`     | append-only JSONL log           | ready               |
| `email`    | nodemailer / SES                | **stub**            |
| `whatsapp` | WhatsApp Business API / Twilio  | **stub**            |
| `sms`      | Twilio / 019 / Inforu           | **stub**            |

Default routing by `severity`:

```
critical -> console + file + whatsapp + sms + email
warning  -> console + file + email
info     -> console + file
```

You can override the routing globally with the `NOTIFY_CHANNELS` environment
variable (comma-separated), which is useful for local development:

```bash
NOTIFY_CHANNELS=console,file node ops/alerts/notification-dispatcher.js --server
```

Other environment variables:

| Variable            | Purpose                                  | Default                               |
|---------------------|------------------------------------------|---------------------------------------|
| `NOTIFY_FILE_PATH`  | Path for the `file` channel              | `./ops/alerts/alerts.log`             |
| `NOTIFY_EMAIL_TO`   | Recipient address (email stub)           | `oncall@onyx-procurement.local`       |
| `NOTIFY_WHATSAPP_TO`| E.164 phone number (WhatsApp stub)       | `+972500000000`                       |
| `NOTIFY_SMS_TO`     | E.164 phone number (SMS stub)            | `+972500000000`                       |

---

## 5. Replacing the stubs

The three stub channels deliberately just `console.log` the payload. To make
them real, replace the function body in `notification-dispatcher.js`:

- **Email** — drop in `nodemailer.createTransport(...).sendMail(...)` or AWS
  SES `SendEmailCommand`.
- **WhatsApp** — call the WhatsApp Business Cloud API `/v17.0/{phone-id}/messages`
  endpoint, or use Twilio's `messages.create` with the `whatsapp:` prefix.
- **SMS** — Twilio `messages.create`, 019 SMS, or Inforu's Israeli SMS gateway.

The function signature stays identical: `async (alert) => { ... }` where
`alert` is the normalised shape produced by `normaliseAlert`.

---

## 6. Local smoke test

```bash
# 1. render a payload
cat > /tmp/payload.json <<'JSON'
{
  "version": "4",
  "status": "firing",
  "alerts": [
    { "status": "firing",
      "labels": { "alertname": "MissingDailyBackup", "severity": "critical" },
      "annotations": { "summary": "Missing daily backup" } }
  ]
}
JSON

# 2. dispatch
NOTIFY_CHANNELS=console,file node ops/alerts/notification-dispatcher.js < /tmp/payload.json

# 3. inspect the log
tail -n 5 ops/alerts/alerts.log
```

---

## 7. Runbook URL convention

Every rule's `runbook_url` label points at
`https://runbooks.onyx-procurement.local/alerts/<kebab-case-alert-name>`.
On-call engineers should maintain one Markdown page per alert under that
prefix, documenting: symptoms, first checks, mitigation steps, and
escalation contacts.
