# Unified Notification Service

**Agent-76 — Notifications**
Location: `src/notifications/`
Zero external dependencies. Pure CommonJS, Node 20+.

---

## 1. Overview

The Unified Notification Service is the single entry point for delivering
messages to users across five channels:

| Channel  | Adapter source                      | Status in v1 |
| -------- | ------------------------------------ | ------------ |
| email    | `src/emails` (Agent-73)              | auto-detected |
| whatsapp | `src/whatsapp` (Agent-74)            | auto-detected |
| sms      | `src/sms` (Agent-75)                 | auto-detected |
| push     | internal JSONL stub                  | always on    |
| in_app   | `NotificationHistory` (this module)  | always on    |

If a sibling adapter module is not installed the service silently skips that
channel — it never throws or crashes boot. This lets Agent-76 ship independently
of Agents 73/74/75.

---

## 2. Modules

```
src/notifications/
├── notification-types.js        registry of all notification types (≥20)
├── notification-queue.js        FIFO queue + retry + DLQ + batching
├── notification-preferences.js  per-user preferences + quiet hours
├── notification-history.js      audit log + inbox
├── notification-service.js      main module (this is what callers use)
├── notification-routes.js       Express router factory
└── notification-service.test.js 31 node:test unit tests
```

### notification-types.js

Defines every notification the system can emit. Each entry carries:

- `id`            — stable machine key (snake_case)
- `category`      — `finance` / `procurement` / `hr` / `ops` / `security` / `system` / `tax`
- `priority`      — `critical` / `high` / `normal` / `info`
- `defaultChans`  — ordered default channel list when user has no prefs
- `titleHe`       — human-readable Hebrew title
- `template`      — text template with `{{placeholder}}` interpolation
- `throttleSec`   — minimum seconds between two emissions of the same `(userId, type)`

Registered types (v1):

| Category    | Types |
| ----------- | ----- |
| HR          | `wage_slip_ready`, `payroll_processed`, `leave_request_submitted` |
| Finance     | `invoice_overdue`, `payment_received`, `payment_failed`, `budget_exceeded` |
| Procurement | `po_approval_needed`, `po_approved`, `po_rejected`, `rfq_quote_received`, `delivery_delayed` |
| Tax         | `vat_report_ready`, `vat_deadline_approaching`, `income_tax_annual_ready` |
| Security    | `security_alert`, `login_from_new_device`, `password_changed`, `mfa_enabled` |
| System/Ops  | `system_maintenance`, `backup_failed`, `integration_error`, `data_export_ready`, `welcome` |

**Total: 25 types.**

### notification-queue.js

JSONL-backed FIFO queue.

- **Storage**: `data/notification-queue.jsonl` (append-only log)
- **DLQ**:     `data/notification-dlq.jsonl`
- **Retry schedule**: `0, 1s, 5s, 30s, 2m, 10m, 1h`
- **Dead-letter**: after `6` retries (total 7 delivery attempts)
- **Batch size**: `10` jobs per drain pass
- **Crash-safe**: in-memory state is rebuilt by replaying the JSONL on load
- **Compaction**: `compact()` rewrites the log to only pending jobs

Every state transition (`enqueue` / `ack` / `retry` / `dlq`) is written as a
new JSONL row. The `NotificationQueue` class owns the single in-memory view.

### notification-preferences.js

Per-user preferences. Stored in:

- **Primary**:  Supabase table `notification_preferences`
- **Fallback**: `data/notification-preferences.jsonl` (survives DB outages)

Migration SQL is exported via `require('./notification-preferences').migrationSql()`:

```sql
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id          TEXT PRIMARY KEY,
  channels         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  quiet_hours      JSONB       NOT NULL DEFAULT '{"enabled":true,"start":"22:00","end":"07:00"}'::jsonb,
  timezone         TEXT        NOT NULL DEFAULT 'Asia/Jerusalem',
  frequency_cap    INTEGER     NOT NULL DEFAULT 30,
  type_overrides   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Default preferences (applied for unknown users):

```json
{
  "channels":     { "email": true, "whatsapp": true, "sms": true, "push": true, "in_app": true },
  "quietHours":   { "enabled": true, "start": "22:00", "end": "07:00" },
  "timezone":     "Asia/Jerusalem",
  "frequencyCap": 30,
  "typeOverrides": {}
}
```

### notification-history.js

Append-only audit log and user-facing inbox. Storage:

- **Primary**:  Supabase table `notification_history`
- **Fallback**: `data/notification-history.jsonl`

Migration SQL is exported via `require('./notification-history').migrationSql()`:

```sql
CREATE TABLE IF NOT EXISTS notification_history (
  id              TEXT        PRIMARY KEY,
  user_id         TEXT        NOT NULL,
  type_id         TEXT        NOT NULL,
  priority        TEXT        NOT NULL,
  title           TEXT,
  body            TEXT,
  channels        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  delivered_on    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  failed_on       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  data            JSONB,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The history module also implements:

- `countRecent(userId, windowMs)` — powers the hourly frequency cap
- `lastEmissionOfType(userId, typeId)` — powers per-type throttle

### notification-service.js

Main entry point — aggregates everything.

```js
const { NotificationService } = require('./src/notifications/notification-service');
const svc = new NotificationService({ supabase });

await svc.notify('user_42', 'wage_slip_ready', {
  employeeName: 'דנה',
  month:        '2026-03',
});
```

Returns:

```json
{
  "notificationId":    "h_abc_123",
  "requestedChannels": ["email", "whatsapp", "in_app"],
  "deliveredOn":       ["email", "in_app"],
  "failedOn":          ["whatsapp"]
}
```

Failed channels are automatically **enqueued for retry**. A long-running
worker (or cron) should call `svc.drainQueue()` periodically.

---

## 3. Priority Routing

Priority is declared on each notification type. It drives channel selection
and bypass rules.

| Priority | Channel selection                         | Quiet hours | Frequency cap | Throttle |
| -------- | ----------------------------------------- | ----------- | ------------- | -------- |
| critical | Always SMS + PUSH + in_app (+ email if enabled) | **bypassed**  | **bypassed**    | bypassed |
| high     | Intersection of defaultChans & user prefs | **bypassed**  | bypassed      | enforced |
| normal   | Intersection of defaultChans & user prefs | enforced    | enforced      | enforced |
| info     | Email + in_app only                       | enforced    | enforced      | enforced |

---

## 4. REST API

All routes require `X-API-Key` (same as the rest of `/api/`). The user id is
resolved in this order:

1. `req.actor.user` (set by auth middleware)
2. `X-User-Id` header
3. `?userId=` query
4. `body.userId`

### GET `/api/notifications`

List **unread** notifications for the current user.

```
curl -H 'X-API-Key: …' -H 'X-User-Id: u1' https://onyx/api/notifications
```

Response:

```json
{
  "userId": "u1",
  "unread": 3,
  "items": [
    {
      "id":       "h_...",
      "typeId":   "invoice_overdue",
      "priority": "high",
      "title":    "חשבונית חורגת מתאריך פרעון",
      "body":     "חשבונית INV-7 (1800 ₪) איחרה ב-4 ימים. לקוח: דנה.",
      "createdAt": 1744123456789,
      "readAt":    null
    }
  ]
}
```

### POST `/api/notifications/:id/read`

Mark a single notification as read.

```
curl -X POST -H 'X-API-Key: …' https://onyx/api/notifications/h_abc_123/read
```

### GET `/api/notifications/history`

Paged full history.

Query params: `limit` (default 100, max 1000), `offset` (default 0).

### GET `/api/notifications/preferences`

Fetch the current user's preferences.

### POST `/api/notifications/preferences`

Update preferences. The body is merged on top of the current value.

```json
{
  "prefs": {
    "channels":    { "whatsapp": false },
    "quietHours":  { "start": "23:00", "end": "06:30" },
    "frequencyCap": 10,
    "typeOverrides": { "wage_slip_ready": false }
  }
}
```

### POST `/api/notifications/send`

Emit a notification (used by internal services). Body:

```json
{
  "userId":    "u1",
  "type":      "payment_received",
  "data":      { "amount": 1800, "customerName": "דנה", "invoiceNumber": "INV-7" },
  "queueOnly": false,
  "recipient": { "email": "danah@example.com", "phone": "+972521234567" }
}
```

### GET `/api/notifications/types`

List every registered notification type. Useful for building admin UIs.

### GET `/api/notifications/stats`

Queue / history / adapter summary. Safe to expose to `/metrics` collectors.

---

## 5. Integration with Agents 73 / 74 / 75

The service loads adapters defensively at construction time:

```js
// notification-service.js _loadAdapters()
const emailMod = tryRequire('./emails')   || tryRequire('../emails');
const waMod    = tryRequire('./whatsapp') || tryRequire('../whatsapp');
const smsMod   = tryRequire('./sms')      || tryRequire('../sms');
```

Any function named `send`, `sendEmail`/`sendWhatsApp`/`sendSMS`, `dispatch`, or
`notify` is accepted. The adapter contract is simply:

```ts
async function adapter(job: {
  userId: string;
  channel: 'email' | 'whatsapp' | 'sms' | 'push';
  typeId: string;
  title: string;
  body: string;
  data: object;
  recipient: { email?: string; phone?: string; pushToken?: string } | null;
  notificationId: string;
}): Promise<{ success: boolean; error?: string }>;
```

If a sibling module is absent, the service logs the adapter matrix at boot
and silently skips that channel — failed channels still go through the retry
queue so delivery resumes automatically once the adapter is installed.

---

## 6. Running the tests

```bash
node --test src/notifications/notification-service.test.js
```

**31 tests** covering:

- Type registry (≥20 types, render, unknown handling)
- Preferences (parseHHMM, defaults, round-trip, quiet hours wrap-around, shouldDeliver rules)
- Queue (enqueue, peek, exponential backoff → DLQ, ack, tryDrain batching, replay)
- History (record / getUnread / markRead, countRecent, lastEmissionOfType)
- Service end-to-end (priority routing, critical override, adapter failure → retry,
  throttle, frequency cap, drainQueue, queueOnly, stats)
- Route shape (router paths, user-id resolution)

---

## 7. Filesystem layout

```
data/
├── notification-queue.jsonl          queue log
├── notification-dlq.jsonl            dead-letter queue
├── notification-preferences.jsonl    prefs fallback
├── notification-history.jsonl        history fallback
└── notification-push.jsonl           push stub sink
```

These files are created on demand — they do not need to exist before boot.

---

## 8. Wiring into `server.js`

The service is mounted from `server.js`:

```js
try {
  const { NotificationService } = require('./src/notifications/notification-service');
  const notificationRoutes      = require('./src/notifications/notification-routes');
  const notificationService     = new NotificationService({ supabase });
  app.use(notificationRoutes.router(notificationService));
  console.log('✓ notifications wired — /api/notifications/*');
} catch (e) {
  console.warn('⚠️  notifications wiring skipped:', e && e.message);
}
```

The wiring is wrapped in `try/catch` so a missing file never prevents boot.
