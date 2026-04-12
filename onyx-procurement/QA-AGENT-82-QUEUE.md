# QA Agent #82 — Message Queue Reliability

**מערכת:** onyx-procurement
**סוכן:** QA #82 — Queue / Background Jobs / Message Reliability
**ניתוח:** סטטי בלבד
**תאריך:** 2026-04-11
**קבצים שנבדקו:** `server.js` (934 שורות), `package.json`

---

## TL;DR (חמש שורות)

1. **אין ספריית queue** בכלל — לא `bull`, לא `bullmq`, לא `agenda`, לא `kue`, לא `amqp`, לא `sqs`, לא `p-queue`. `package.json` מכיל רק 4 dependencies: `express`, `@supabase/supabase-js`, `dotenv`, `cors`.
2. **`/api/rfq/send` (שורות 226-344)** מריץ `for (const supplier of suppliers)` synchronous עם `await sendWhatsApp()` inline בתוך ה-request handler. אם ה-process קורס באמצע לולאה — חצי מהספקים לא יקבלו, ואין דרך לחדש.
3. **אין retry בכלל** — לא exponential backoff, לא dead-letter queue, לא jitter. `sendWhatsApp()` החזרת כישלון נרשמת אבל לא נדחפת חזרה לתור.
4. **`sendWhatsApp()` (שורות 36-69)** מסמן `success: res.statusCode === 200` — אבל WhatsApp Graph API יכול להחזיר `200` גם עבור 429/503 transient errors במקרים מסוימים, ו-`status: 'delivered'` נכתב מיד בלי webhook confirmation.
5. **Replit free tier** (ה-target deployment הסביר) חותכים את ה-process אחרי ~5 דקות של inactivity + אין persistent disk ל-Redis → BullMQ לא מעשי. **המלצה: Supabase Outbox Pattern (טבלת `message_outbox`) + Edge Function כ-worker + `pg_cron` כ-trigger.**

---

## 1. האם יש ספריית Queue? — **לא**

### בדיקת `package.json`:
```json
"dependencies": {
  "express": "^4.21.0",
  "@supabase/supabase-js": "^2.45.0",
  "dotenv": "^16.4.5",
  "cors": "^2.8.5"
}
```

### בדיקת import-ים ב-`server.js`:
```js
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const https = require('https');
require('dotenv').config();
```

**ממצא:** אפס modules של queueing. `grep -i "bull|bullmq|agenda|kue|rabbit|sqs|amqp|queue"` מחזיר רק תוצאות מתוך קבצי דוחות QA אחרים — אפס מתוך הקוד המקור.

**השלכה:**
- אין persistence ל-jobs שנכשלו.
- אין concurrency control.
- אין rate limiting מובנה.
- אין retry mechanism מובנה.
- אין scheduling (cron) — כל העבודה inline על request thread.

---

## 2. לולאת שליחת RFQ — **Synchronous, Fail-Loud, No Recovery**

### מיקום: `server.js:226-344` (`POST /api/rfq/send`)

### הקוד הקריטי (שורות 287-321):

```js
// 5. Send to all suppliers
const results = [];
for (const supplier of suppliers) {
  const channel = supplier.preferred_channel || 'whatsapp';
  const address = channel === 'whatsapp' ? (supplier.whatsapp || supplier.phone) : supplier.phone;

  let sendResult = { success: false };
  try {
    if (channel === 'whatsapp' && WA_TOKEN) {
      sendResult = await sendWhatsApp(address, messageText);
    } else if (channel === 'sms') {
      sendResult = await sendSMS(address, messageText);
    }
  } catch (err) {
    sendResult = { success: false, error: err.message };
  }

  // Record recipient
  await supabase.from('rfq_recipients').insert({
    rfq_id: rfq.id,
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    sent_via: channel,
    delivered: sendResult.success,
    status: sendResult.success ? 'delivered' : 'sent',
  });

  results.push({ ... });
}
```

### בעיות:

#### 2.1 Sequential Await — Blocks Request Thread
הלולאה היא `for...of` עם `await` בכל איטרציה. אם יש 50 ספקים × 500ms לכל WhatsApp call = **25 שניות** של HTTP request פתוח. ה-client (frontend של קובי) יראה loading spinner 25 שניות, וסביר ש:
- Cloudflare/ALB יעשה 504 timeout אחרי 30 שניות.
- Replit יעשה worker timeout.
- אפליקציית המובייל של קובי תחזיר "Network Error".

#### 2.2 Partial Failure = Lost Work
אם אחרי ספק #12 מתוך 50 ה-process קורס (OOM, SIGTERM מ-Replit, crash, restart):
- `rfq_recipients` מכיל רק 12 רשומות.
- 38 ספקים **לא קיבלו הודעה ואין שום דרך לדעת** מה נשלח ומה לא.
- אין resume mechanism — אם הלקוח (frontend) ינסה POST מחדש, תיווצר `rfq` חדשה ו-12 הספקים הראשונים יקבלו **פעמיים** (duplicate send).

#### 2.3 No Idempotency Key
אין `idempotency_key` ב-request body, אין UNIQUE constraint שמונע כפילויות, אין check של "האם כבר שלחתי לספק הזה עבור RFQ הזה". הלקוח יכול ללחוץ "שלח" פעמיים → duplicate WhatsApp לכל ספק.

#### 2.4 Status Marked `delivered` Pre-Webhook
שורה 311: `status: sendResult.success ? 'delivered' : 'sent'` — זה שקר. `sendWhatsApp()` מחזירה `success=true` כשה-API החזיר 200, שפירושו "קיבלתי את ההודעה ל-queue שלי", לא שהיא **נמסרה**. ה-status האמיתי (`delivered` / `read` / `failed`) מגיע ב-webhook של WhatsApp Business API עם סוגי statuses: `sent`, `delivered`, `read`, `failed`. ה-webhook handler (שורות 876-901) **רק מ-console.log ומכניס ל-`system_events`** — הוא לא מעדכן את `rfq_recipients.status` בחזרה. התוצאה: הטבלה משקרת על מה שהיה.

#### 2.5 PO Send באותה תבנית
`POST /api/purchase-orders/:id/send` (שורות 626-679) זהה מבנית: `await sendWhatsApp()` inline, אין retry, אין persistence. הבעיה חריפה במיוחד כי PO = התחייבות משפטית. אם ה-process קורס אחרי update status='sent' אבל לפני שה-HTTP response חזר — המערכת חושבת ששלחה, הספק לא קיבל, ואף אחד לא יודע.

---

## 3. מדיניות Retry ל-WhatsApp — **אין**

### `sendWhatsApp()` (שורות 36-69):

```js
async function sendWhatsApp(to, message) {
  const data = JSON.stringify({ ... });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      path: `/v21.0/${WA_PHONE_ID}/messages`,
      method: 'POST',
      headers: { ... },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ success: res.statusCode === 200, messageId: parsed?.messages?.[0]?.id, status: res.statusCode });
        } catch { resolve({ success: false, status: res.statusCode }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}
```

### ממצאים:
- **אין retry לולאה.** אין `while (attempt < MAX_ATTEMPTS)`.
- **אין exponential backoff.** אין `setTimeout(r, 2 ** attempt * 1000 + jitter)`.
- **אין דיפרנציאציה בין שגיאות.** WhatsApp מחזיר:
  - `400` — bad request (לא לנסות שוב — זו שגיאת פורמט)
  - `401` — token expired (לא לנסות שוב — צריך refresh)
  - `403` — user blocked / spam (לא לנסות שוב)
  - `429` — rate limit (**חייב retry with backoff**)
  - `500`/`502`/`503`/`504` — transient (**חייב retry with backoff**)
  - `131026` — recipient does not have WhatsApp (לא לנסות שוב)
  - `131047` — re-engagement window (24h) — לא לנסות שוב בלי template
  - `131051` — unsupported message type (לא לנסות שוב)
  
  הקוד מתייחס לכל השגיאות באופן זהה: `success = false`. אין קטגוריזציה.

- **אין timeout על ה-request.** `https.request()` בלי `timeout` option → אם Facebook תלוי ל-5 דקות, הלולאה תקועה 5 דקות.
- **אין circuit breaker.** אם ה-API down, ה-process ימשיך לדפוק על ה-API 50 פעמים ולהיכשל 50 פעמים.
- **אין rate limiting client-side.** WhatsApp Business API יש לה rate limits (1k-80k msgs/day תלוי tier). שליחה של 50 הודעות רצוף יכולה לעבור את ה-burst limit של 20/second.

### `sendSMS()` (שורות 71-93):
אותה בעיה בדיוק. אין retry, אין backoff, אין error categorization. Twilio מחזיר `201` ל-`queued` (לא `delivered`) — הקוד בודק `statusCode === 201` כ-success מבלי להבין שזה רק אישור שהודעה נכנסה לתור של Twilio.

---

## 4. Background Job Framework — **דרוש דחוף**

### הסיבות שהמערכת הנוכחית לא תעבוד בפרודקשן אמיתי:

| תרחיש | מצב נוכחי | תוצאה |
|---|---|---|
| RFQ ל-100 ספקים | synchronous loop בתוך HTTP request | Gateway timeout (30s) |
| Process restart באמצע send | אין persistence | חצי שליחות נעלמות |
| WhatsApp API 429 | `success: false`, end | הודעה אבודה לנצח |
| WhatsApp API 503 ב-3 שניות ה-API יעבוד שוב | `success: false`, end | הודעה אבודה |
| Duplicate request מה-frontend | אין idempotency | כפילויות ל-ספקים |
| Scheduled RFQ close on deadline | אין scheduler | לא מתבצע |
| Hourly supplier stats refresh | אין cron | מתפספס |
| Retry backlog אחרי outage | לא קיים | work lost |

### מה שחייב להיות:

#### 4.1 Outbox Table (persistence layer)
טבלה חדשה (Supabase) בשם `message_outbox`:
```sql
CREATE TABLE message_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT UNIQUE NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','sms','email')),
  recipient_id UUID NOT NULL,
  recipient_address TEXT NOT NULL,
  payload JSONB NOT NULL,
  rfq_id UUID REFERENCES rfqs(id),
  po_id UUID REFERENCES purchase_orders(id),
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending','in_flight','delivered','failed','dead_letter')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  last_status_code INT,
  provider_message_id TEXT,
  locked_by TEXT,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

CREATE INDEX idx_outbox_pending ON message_outbox (status, next_attempt_at) 
  WHERE status IN ('pending','in_flight');

CREATE INDEX idx_outbox_dlq ON message_outbox (status) 
  WHERE status = 'dead_letter';
```

#### 4.2 Worker Loop (dequeue, send, update)
תהליך שיקרא כל N שניות:
```sql
WITH claimed AS (
  SELECT id FROM message_outbox
  WHERE status = 'pending' 
    AND next_attempt_at <= NOW()
    AND (locked_until IS NULL OR locked_until < NOW())
  ORDER BY next_attempt_at
  LIMIT 10
  FOR UPDATE SKIP LOCKED
)
UPDATE message_outbox 
SET status = 'in_flight', 
    locked_by = $worker_id, 
    locked_until = NOW() + INTERVAL '2 minutes',
    attempts = attempts + 1
WHERE id IN (SELECT id FROM claimed)
RETURNING *;
```
`FOR UPDATE SKIP LOCKED` הוא קריטי — זה מאפשר לכמה workers לרוץ במקביל בלי race condition.

#### 4.3 Retry Schedule (exponential backoff + jitter)
```
attempt 1: fail → next_attempt_at = NOW() + 30s  + rand(0-15s)
attempt 2: fail → next_attempt_at = NOW() + 2m   + rand(0-30s)
attempt 3: fail → next_attempt_at = NOW() + 15m  + rand(0-5m)
attempt 4: fail → next_attempt_at = NOW() + 1h   + rand(0-30m)
attempt 5: fail → status = 'dead_letter', notify admin
```

#### 4.4 Error Classification
```js
function classifyWhatsAppError(statusCode, body) {
  if (statusCode === 200) return 'success';
  if (statusCode === 401) return 'fatal_auth';  // don't retry
  if (statusCode === 400) return 'fatal_format'; // don't retry
  if (statusCode === 403) return 'fatal_policy'; // don't retry
  if (statusCode === 429) return 'transient_rate_limit'; // retry w/ longer backoff
  if (statusCode >= 500)  return 'transient_server'; // retry
  // WhatsApp error codes
  const code = body?.error?.code;
  if ([131026, 131047, 131051].includes(code)) return 'fatal_recipient';
  return 'transient_unknown';
}
```

---

## 5. Replit Limitations — **חוסמים BullMQ**

הסביבה הפוטנציאלית (לפי סגנון הפרויקט — package.json מינימלי, server.js single-file, `.env`-based):

### 5.1 Free/Hacker tier:
- **No persistent file system across restarts** — לא באמת true לכל tier, אבל:
- **Auto-sleep after inactivity** — ~5 דקות בלי traffic והקונטיינר נכבה. Worker loop מת.
- **No background worker process** — אין way להגדיר `worker: node worker.js` נפרד מ-`web: node server.js`. הכל רץ בתהליך אחד של `node server.js`.
- **No Redis** — אין Redis-as-a-service חינמי מובנה. BullMQ **חייב Redis**. צריך חיבור חיצוני (Upstash / Redis Cloud) → latency + עלות.
- **Ephemeral storage** — redisdb.rdb / AOF files עלולים להימחק.
- **No cron** — אין `crontab`. `node-cron` יעבוד רק כל עוד ה-process חי, וכשהוא ישן (5min) ה-cron מת.

### 5.2 השלכה:
**BullMQ לא מעשי על Replit free tier.** הוא דורש:
1. Redis מתמשך (עלות חודשית $10+)
2. Worker process נפרד מ-web (לא אפשרי)
3. Process שלא נרדם (Replit Always-On = $7/חודש)

**Agenda.js** (MongoDB-backed) — אותה בעיה.
**Bree.js** (in-process cron) — חסר persistence ומת עם ה-process.

### 5.3 מה כן אפשרי על Replit:
- Always-On subscription ($7/חודש) — פותר sleep.
- External Redis (Upstash free tier: 10k commands/day).
- Worker בתוך אותו process (setInterval → poll outbox).

---

## 6. Supabase Edge Functions — **חלופה מומלצת**

### למה זה הפתרון הנכון כאן:

#### 6.1 Why Supabase (already in stack):
פרויקט **כבר משתמש ב-Supabase** (`@supabase/supabase-js` ב-package.json, מופיע 40+ פעמים ב-server.js). אין תלות חדשה. אין spend חדש.

#### 6.2 Architecture:
```
┌──────────────┐       ┌────────────────────┐       ┌──────────────┐
│ server.js    │─────▶ │  message_outbox    │◀───── │ Edge Function│
│ POST /rfq    │ INSERT│  (Postgres table)  │ SELECT│ send-outbox  │
│ returns 202  │       │                    │       │ (Deno)       │
└──────────────┘       └────────────────────┘       └──────┬───────┘
                                ▲                          │
                                │                          ▼
                       ┌────────┴────────┐          ┌──────────────┐
                       │ pg_cron trigger │          │ WhatsApp API │
                       │ every 15 sec    │          │ Twilio API   │
                       │ POST edge func  │          └──────────────┘
                       └─────────────────┘
```

#### 6.3 Implementation sketch:

**1. `server.js:POST /api/rfq/send` — שונה ל-enqueue-only:**
```js
// Instead of for-loop with awaits:
const outboxRows = suppliers.map(s => ({
  idempotency_key: `rfq-${rfq.id}-supplier-${s.id}`,
  channel: s.preferred_channel || 'whatsapp',
  recipient_id: s.id,
  recipient_address: s.whatsapp || s.phone,
  payload: { message: messageText, rfq_id: rfq.id },
  rfq_id: rfq.id,
}));
await supabase.from('message_outbox').insert(outboxRows);
return res.status(202).json({ 
  rfq_id: rfq.id, 
  enqueued: suppliers.length,
  message: 'RFQ בתור לשליחה' 
});
```
— **חוזר ב-<100ms** במקום 25 שניות, ללא קשר למספר הספקים. Gateway timeout פתור. Crash mid-loop פתור.

**2. Edge Function `send-outbox/index.ts` (Deno):**
```ts
import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Claim pending jobs
  const { data: jobs } = await supabase.rpc('claim_outbox_jobs', { p_limit: 10 });

  for (const job of jobs || []) {
    try {
      const result = await sendViaChannel(job.channel, job.recipient_address, job.payload);
      if (result.success) {
        await supabase.from('message_outbox').update({
          status: 'delivered',
          delivered_at: new Date().toISOString(),
          provider_message_id: result.messageId,
        }).eq('id', job.id);
      } else {
        const category = classifyError(result.statusCode, result.body);
        if (category.startsWith('fatal') || job.attempts >= job.max_attempts) {
          await supabase.from('message_outbox').update({
            status: 'dead_letter',
            last_error: result.error,
            last_status_code: result.statusCode,
          }).eq('id', job.id);
        } else {
          const backoff = Math.min(3600, 30 * Math.pow(2, job.attempts)) + Math.random() * 30;
          await supabase.from('message_outbox').update({
            status: 'pending',
            next_attempt_at: new Date(Date.now() + backoff * 1000).toISOString(),
            last_error: result.error,
            last_status_code: result.statusCode,
          }).eq('id', job.id);
        }
      }
    } catch (err) {
      // release lock, will retry
      await supabase.from('message_outbox').update({
        status: 'pending',
        locked_by: null,
        locked_until: null,
        last_error: err.message,
      }).eq('id', job.id);
    }
  }

  return new Response(JSON.stringify({ processed: jobs?.length || 0 }));
});
```

**3. `pg_cron` trigger (Supabase Dashboard → Database → Extensions → pg_cron):**
```sql
SELECT cron.schedule(
  'send-outbox',
  '*/1 * * * *',  -- every minute (minimum cron granularity)
  $$
  SELECT net.http_post(
    url := 'https://<project>.supabase.co/functions/v1/send-outbox',
    headers := '{"Authorization": "Bearer <service-role-key>"}'::jsonb
  );
  $$
);
```

#### 6.4 יתרונות של הגישה:
- **zero extra cost** — Edge Functions חינמיות עד 500k invocations/month.
- **Persistent** — Postgres לא נרדם.
- **Horizontal** — יותר ממופע אחד של Edge Function יכול לרוץ ב-parallel בזכות `SKIP LOCKED`.
- **Observable** — ניתן לעשות `SELECT * FROM message_outbox WHERE status = 'dead_letter'` מתי שרוצים.
- **Replay** — DLQ items ניתנים ל-`UPDATE status = 'pending'` → הם יישלחו שוב.
- **Consistent with existing stack** — אין Redis, אין BullMQ, אין תלויות חדשות ב-npm.

#### 6.5 חסרונות:
- **pg_cron minimum interval = 1 minute** — לשליחות ממש דחופות (POs חשובים) זה עלול להיות איטי מדי. פתרון: `server.js` יכול גם לקרוא ל-edge function ישירות אחרי insert (fire-and-forget) כ-hot path, ו-cron משמש כ-backup.
- **Edge Functions cold start** — 200-500ms latency ראשון. פתרון: keep-alive ping מ-cron.
- **Deno runtime** — שונה מ-Node. צריך לכתוב את `sendWhatsApp` פעמיים (גרסת Node ב-server.js לא-נחוץ-יותר, וגרסת Deno ב-edge function). פתרון: להעביר את כל ה-sending ל-edge function ולמחוק מ-server.js.

---

## 7. המלצה — **Hybrid Outbox + Edge Function**

### 7.1 שלבים למימוש (לפי סדר עדיפות):

#### Phase 1 — Outbox Persistence (Week 1) — קריטי
1. יצירת טבלת `message_outbox` (SQL migration).
2. יצירת stored procedure `claim_outbox_jobs(p_limit int)` עם `SKIP LOCKED`.
3. שינוי `POST /api/rfq/send` ו-`POST /api/purchase-orders/:id/send` ל-**enqueue only** (INSERT → return 202).
4. הוספת idempotency keys (ייחודיים לכל (rfq_id, supplier_id)).

**תוצאה:** אבדן עבודה נפתר אפילו לפני שיש worker — ה-outbox נשמר, וכל worker עתידי יוכל לעבד אותו.

#### Phase 2 — Temporary In-Process Worker (Week 1) — ביניים
1. `setInterval(pollOutbox, 5000)` בתוך `server.js`.
2. `pollOutbox` מריץ `claim_outbox_jobs`, שולח, מעדכן status.
3. exponential backoff כפי שהוגדר למעלה.
4. error classification.
5. circuit breaker (אם 5 שגיאות ברצף → השהה 60s).

**תוצאה:** retries + backoff פעילים, גם על Replit. יש לוודא Always-On (או Uptime-Robot pings).

#### Phase 3 — Move to Edge Function (Week 2-3) — אופטימלי
1. יצירת Edge Function `send-outbox`.
2. `pg_cron` מפעיל אותה כל דקה.
3. `server.js` גם קורא אותה direct (fire-and-forget) אחרי enqueue לרווחי latency.
4. הסרת ה-setInterval הזמני מ-server.js.
5. ניקוי `sendWhatsApp()` / `sendSMS()` מ-server.js (נשארים רק ב-edge function).

**תוצאה:** Replit יכול להיות חינמי (ישן), השליחה עדיין עובדת דרך Supabase.

#### Phase 4 — Observability (Week 3) — חובה תפעולית
1. `/api/outbox/stats` — endpoint עם counts לפי status.
2. `/api/outbox/dlq` — list DLQ items, retry/discard actions.
3. Alert אוטומטי (Slack/WhatsApp לקובי) אם `dead_letter` count > 0.
4. Webhook handler `/webhook/whatsapp` יעדכן `message_outbox.status` מ-`delivered`→`read`→`failed` לפי ה-callback מ-Meta.

#### Phase 5 — WhatsApp Webhook → Truthful Status (Week 3)
שדרוג ה-`/webhook/whatsapp` handler (server.js:876-901). כרגע הוא רק קורא `messages` field, אבל WhatsApp גם שולח `statuses` field:
```json
{
  "entry": [{
    "changes": [{
      "value": {
        "statuses": [{
          "id": "wamid.XXX",
          "status": "delivered" | "read" | "failed",
          "timestamp": "...",
          "recipient_id": "..."
        }]
      }
    }]
  }]
}
```
הטיפול:
```js
const statuses = changes?.value?.statuses;
if (statuses?.length) {
  for (const s of statuses) {
    await supabase.from('message_outbox')
      .update({ 
        status: s.status === 'failed' ? 'failed' : 'delivered',
        // for failed, bump attempts / requeue
      })
      .eq('provider_message_id', s.id);
    
    // And also rfq_recipients
    await supabase.from('rfq_recipients')
      .update({ status: s.status })
      .eq('whatsapp_message_id', s.id); // (needs column added)
  }
}
```

---

## 8. טבלת ליקויים מסוכמת

| # | חומרה | תיאור | מיקום | תיקון |
|---|-------|-------|-------|-------|
| Q-82-01 | **CRITICAL** | RFQ send loop sync inline ב-HTTP request — work lost on crash | `server.js:287-321` | Outbox table + 202 response |
| Q-82-02 | **CRITICAL** | אין idempotency key → duplicate sends בלחיצה כפולה | `server.js:226` | `idempotency_key` column + UNIQUE |
| Q-82-03 | **CRITICAL** | אין retry ל-WhatsApp/SMS transient failures | `server.js:36-93` | Worker + exponential backoff |
| Q-82-04 | **CRITICAL** | `status='delivered'` נכתב מיד — שקר מול המציאות | `server.js:311` | חכה ל-webhook status callback |
| Q-82-05 | **HIGH** | אין timeout ב-`https.request` — process יכול לתקוע 5min | `server.js:46-68` | `req.setTimeout(10000)` |
| Q-82-06 | **HIGH** | 50 ספקים × 500ms = 25s → gateway timeout | `server.js:289` | ריצה async ב-background |
| Q-82-07 | **HIGH** | אין circuit breaker — דופק על API down 50 פעמים | `server.js:289-321` | Consecutive failure tracker |
| Q-82-08 | **HIGH** | אין DLQ — הודעות שנכשלו סופית נעלמות מ-visibility | (לא קיים) | `status='dead_letter'` + alert |
| Q-82-09 | **HIGH** | PO send (שורה 626) אותה בעיה — legal risk | `server.js:626-679` | same outbox pattern |
| Q-82-10 | **MED** | אין scheduling לסגירת RFQ ב-deadline | (לא קיים) | pg_cron + auto-close |
| Q-82-11 | **MED** | `rfqs.auto_close_on_deadline` ב-schema אבל אין worker | (schema) | pg_cron trigger |
| Q-82-12 | **MED** | אין rate-limit client-side → עלול לעבור WhatsApp burst | `server.js:289` | token bucket / delay |
| Q-82-13 | **MED** | Error handling monolithic — כל error = `success: false` | `server.js:36-69` | classifyWhatsAppError() |
| Q-82-14 | **MED** | Twilio `201` נחשב success — אבל זה רק `queued`, לא `delivered` | `server.js:87` | חכה ל-StatusCallback webhook |
| Q-82-15 | **LOW** | `JSON.parse(body)` בלי try/catch ב-sendSMS שורה 87 | `server.js:87` | עטיפה ב-try/catch |
| Q-82-16 | **LOW** | `req.on('error', reject)` ב-sendWhatsApp זורק מ-Promise — לא נתפס בלולאה כראוי ב-Node 18- | `server.js:65` | resolve({success:false}) במקום reject |

---

## 9. מה שאסור לעשות

### 9.1 Anti-patterns לא להוסיף:
- **`Promise.all(suppliers.map(sendWhatsApp))`** — נראה כמו פתרון, בפועל שובר rate limits ויוצר thunderstorm על Facebook API. גם לא פותר את ה-persistence.
- **`setImmediate(() => sendRfqLoop(...))` אחרי res.json** — "fire and forget". עובד בפרודקשן יציב, אבל אם ה-process מת לפני שהלולאה מסתיימת → work lost. וב-Replit עם 5min sleep, זה יקרה.
- **Hard-coded retry בתוך `sendWhatsApp`** — כמו `for (let i = 0; i < 3; i++) { try... }` — זה דוחה את הבעיה אבל לא פותר persistence. צריך outbox.
- **`node-cron` לשליחות מעוקבות** — לא persistent, מת עם ה-process.

---

## 10. סיכום — Top 3 דברים שחייבים להיעשות מחר בבוקר

1. **טבלת `message_outbox`** + שינוי `/api/rfq/send` ו-`/api/purchase-orders/:id/send` לכתוב אליה במקום לשלוח sync. **החזרת 202** ל-client.
2. **Worker (זמני setInterval → קבוע Edge Function)** שדואג ל-exponential backoff, error classification, ו-DLQ.
3. **Webhook handler `/webhook/whatsapp`** — להוסיף טיפול ב-`statuses` field של Meta webhook כדי שה-`delivered`/`read`/`failed` יעדכנו את הטבלה במקום להניח ש-`HTTP 200` = delivered.

אלה שלושת הסעיפים שימנעו את אובדן ההודעות בפרודקשן, את ה-duplicate sends, ואת ה-false positives של `status='delivered'`.

---

**סוף QA Agent #82**
