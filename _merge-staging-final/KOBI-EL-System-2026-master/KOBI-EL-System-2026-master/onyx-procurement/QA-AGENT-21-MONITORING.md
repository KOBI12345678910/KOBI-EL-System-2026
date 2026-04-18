# QA-AGENT-21 · Monitoring & Alerting
## ניתוח סטטי — ONYX Procurement (חד-איש, Replit Pro + Supabase + WhatsApp)

**סטטוס כללי:** 🔴 **BLIND SPOT מוחלט.** אין שום תשתית ניטור או התראות. כאשר המערכת תיפול — קובי יגלה את זה רק כשספק יתקשר ויצעק שלא קיבל את ה-PO.

אין כפילות עם QA-WAVE1-DIRECT-FINDINGS (שם מכסה רק נכונות קוד ואבטחה).

---

## 1. ממצאי ניטור — 10 השאלות

### M-01 · 🔴 CRITICAL — אפס Uptime Monitoring
**קובץ:** `server.js`, `SETUP-GUIDE-STEP-BY-STEP.md`
**ממצא:** אין אזכור כלל ל-UptimeRobot, Pingdom, BetterStack, Healthchecks.io, Freshping, או כל שירות חיצוני.
SETUP-GUIDE שורה 138 אפילו מבטיחה: "המערכת תרוץ 24/7 (Replit Pro עושה את זה אוטומטית)" — זאת הבטחה שקרית. Replit Reserved VM נופל בעת deploy restart, ב-OOM, וכאשר ה-hypervisor מבצע maintenance. בלי ping חיצוני כל דקה, אין שום דרך לדעת.
**השפעה:** MTTD (Mean Time To Detect) = ∞. קובי מגלה רק כשספק מתלונן.
**חומרה:** 🔴 CRITICAL
**תיקון:** UptimeRobot Free (50 מוניטורים, ping כל 5 דק') → התראת אימייל + WhatsApp ל-Kobi. 5 דק' התקנה.

---

### M-02 · 🔴 CRITICAL — אין ערוץ התראה כלל
**קובץ:** `server.js` (כל הקובץ)
**ממצא:** קיימות טבלאות `system_events` ו-`notifications` ב-SQL schema (שורות 353–389 ב-`001-supabase-schema.sql`), אבל **שום endpoint לא קורא מהן, לא שולח, ולא מודיע לאף אחד**. הטבלה היא write-only sink. אין cron שסורק `severity IN ('error','critical')` ומוציא WhatsApp ל-Kobi. `notifications.sent` נשאר לעד `false`.
**השפעה:** אירועים נרשמים, אבל אף אחד לא שומע.
**חומרה:** 🔴 CRITICAL
**תיקון:** הוספת endpoint `/api/cron/notify-critical` שסורק `system_events WHERE severity IN ('error','critical') AND acknowledged=false` ושולח WhatsApp ל-Kobi. הפעלה דרך Replit Scheduler או UptimeRobot keyword monitor כל 2 דקות.

---

### M-03 · 🔴 CRITICAL — Error Rate Alerting לא קיים
**קובץ:** `server.js`
**ממצא:** אין middleware של `app.use((err,req,res,next)=>...)`. אין express-winston, pino, או כל logger מובנה. שגיאות נופלות ל-stderr של Replit ונעלמות לאחר restart. אין counter של 5xx-per-minute. אין trigger.
**שורות בעייתיות:**
- שורה 112: `/api/status` קורא ל-`procurement_dashboard.select().single()` בלי try/catch — אם Supabase לא זמין, כל הסטטוס נשבר **וגם** ה-route הזה מחזיר 500, כלומר ה-health check עצמו שבור.
- שורות 135, 151, 160, 201: פשוט `return res.status(500).json({error: error.message})` — אין תיעוד, אין התראה, אין metric.
**השפעה:** 95% error rate במשך שעה יעבור בשקט.
**חומרה:** 🔴 CRITICAL
**תיקון:** הוספת global error handler שמכניס ל-`system_events` עם `severity='error'`. התראה אם >5 errors ב-5 דקות.

---

### M-04 · 🟠 HIGH — אין p50/p95/p99 latency baselines
**קובץ:** `server.js`
**ממצא:** אין timing. אין `console.time`, אין morgan, אין prometheus exporter. `/api/rfq/send` (שורה 226) מכיל לולאת `for (const supplier of suppliers)` **סקוונציאלית** — 15 ספקים × ~300ms Meta API + 2 inserts לכל ספק → ~10–15 שניות latency בלי שאף אחד מתריע. לולאת `for…of` ב-`await` חוסמת את ה-event loop. כאשר timeout של client yarn (ברירת מחדל 30s) — תוצאה חלקית בשרת, PO חלקי ב-DB, אין אות.
**השפעה:** אין SLO, אין baseline, אין יכולת לזהות רגרסיה.
**חומרה:** 🟠 HIGH
**תיקון:** Middleware שמודד duration → `system_events type='slow_request'` אם >2000ms. SLO התחלתי: p95 < 500ms על GET, p95 < 5000ms על `/api/rfq/send`.

---

### M-05 · 🟠 HIGH — אין Disk/Memory Alerts ב-Replit
**קובץ:** `server.js` (אין שימוש ב-`process.memoryUsage()`), `SETUP-GUIDE-STEP-BY-STEP.md`
**ממצא:** Replit Reserved VM (Pro) מגביל למעלה RAM (512MB–2GB תלוי תוכנית). אין `process.memoryUsage()`, אין `os.freemem()` ב-`/api/status`. אם memory leak ב-express (למשל כתוצאה מה-Promise chains של sendWhatsApp שלא מנוקים בזמן שגיאה בשורה 65), העמוד פשוט נופל עם OOM בלי התראה מוקדמת.
**חומרה:** 🟠 HIGH
**תיקון:** הרחבת `/api/status` עם:
```js
const mem = process.memoryUsage();
return { memory: { rss_mb: Math.round(mem.rss/1048576), heap_mb: Math.round(mem.heapUsed/1048576) }, uptime_sec: process.uptime() }
```
התראה אם `rss_mb > 400` על Replit 512MB.

---

### M-06 · 🔴 CRITICAL — WhatsApp API Quota / Rate Limit Blindness
**קובץ:** `server.js` שורות 36–69 (sendWhatsApp)
**ממצא:** Meta Graph API מחזיר error codes ספציפיים כאשר מגיעים ל-quota:
- `#80007` — rate limit hit
- `#131056` — pair rate limit
- `#368` — temporary block
- `error.code === 4` — application request limit

ה-handler ב-שורות 58–63 **מתעלם לגמרי** — פשוט `resolve({ success: statusCode === 200 })`. אין ניסיון לחלץ `error.code`, אין בידוד של rate-limit vs. temporary vs. spam block. בנוסף, ה-daily tier של Meta (תלוי verified business) — 250/1K/10K/100K הודעות ביום. ברגע ש-Kobi עובר את 250 ביום הראשון, כל ההודעות נכשלות בשקט. ה-DB מסמן `delivered=false` (שורה 310) אבל הלוגיקה ב-`/api/purchase-orders/:id/send` (F-02 — שורה 667) בכל זאת מעדכנת `status='sent'`.
**השפעה:** Kobi מאמין ש-100 POs נשלחו היום כשבמציאות רק 250 הראשונים עברו. F-02 מעצים את זה.
**חומרה:** 🔴 CRITICAL
**תיקון:**
1. חילוץ `error.code` מתגובת Meta + log ל-`system_events` עם `severity='critical'`.
2. counter יומי ב-`system_events` (type='whatsapp_sent_daily') ו-alert אם >80% מהמכסה.
3. Circuit breaker: אם 3 rate-limit ב-10 דקות → עצירת שליחה + WhatsApp ל-Kobi.

---

### M-07 · 🟠 HIGH — אין התראות על גודל Supabase / row counts
**קובץ:** `server.js`, `SETUP-GUIDE-STEP-BY-STEP.md`
**ממצא:** Supabase Free מגביל ל-500MB DB + 8GB bandwidth + 50MB file storage. אין בדיקה של `pg_total_relation_size`, אין monitoring של row count. שורה 402–410 ב-server.js מכניסה `price_history` לכל line item בכל הצעה — אין retention policy. אחרי שנה: עשרות אלפי שורות, ולאחר 2 שנים — הגעה ל-Free limit בלי התראה. המעבר ל-Pro יכול לקרות אחרי downtime (Supabase מגביל writes ב-DB מלא).
**שורות בעייתיות:** 402–409, 329–333 (system_events מתווספים בלי retention), audit שורה 99–105 (כל action יוצר entry).
**חומרה:** 🟠 HIGH
**תיקון:**
1. Daily cron שקורא `select pg_database_size(current_database())` → alert אם >400MB.
2. View `monitoring_stats` עם count לכל טבלה גדולה.
3. Retention: `DELETE FROM system_events WHERE created_at < now() - interval '90 days' AND severity='info'`.

---

### M-08 · 🔴 CRITICAL — כשלון שליחת PO — אף אחד לא שומע (מחבר ל-F-02)
**קובץ:** `server.js` שורות 626–679
**ממצא:** ב-`/api/purchase-orders/:id/send`:
- שורה 663: `if (WA_TOKEN && address) sendResult = await sendWhatsApp(...)`
- שורה 667: `status: 'sent'` מעודכן **ללא תלות** ב-`sendResult.success` (F-02 מ-Wave1 מזהה את הבעיה בנכונות הדאטה)
- שורות 674–678: התגובה כוללת `sent: sendResult.success`, אבל אין `system_events.insert` עם `severity='critical'` כאשר `sendResult.success === false`.
- audit ב-שורה 672 נרשם "PO sent..." גם בכשל — מטעה לאחור.

**השפעה:** כשלון שליחה → log אחד לצרכן UI בלבד (dashboard toast שורה 449), בלי persistence ובלי notification. 10 דק' אחר כך Kobi לא יודע ש-PO לא יצא.
**חומרה:** 🔴 CRITICAL (מתחבר ל-F-02 של Wave1 וגם מוסיף שכבה של monitoring)
**תיקון:**
```js
if (!sendResult.success) {
  await supabase.from('system_events').insert({
    type: 'po_send_failed', severity: 'critical', source: 'whatsapp',
    message: `PO ${po.id} נכשל ב-${po.supplier_name}`,
    data: { po_id: po.id, supplier_id: po.supplier_id, error: sendResult.error, status: sendResult.status }
  });
}
```
בשילוב עם M-02 → WhatsApp ל-Kobi תוך 2 דקות.

---

### M-09 · 🟠 HIGH — Dashboard לא מציג system health
**קובץ:** `web/onyx-dashboard.jsx`
**ממצא:** הדשבורד מכיל רק status dot יחיד (שורות 72–73):
```jsx
<span style={{background: status?.status === "operational" ? "#34d399" : "#f87171"}} />
```
זה pollינג חד-פעמי בטעינה (שורה 37: `api("/api/status")`). אין polling חוזר, אין אזכור של:
- Supabase latency
- WhatsApp API health
- Unacknowledged critical events count
- Memory / uptime
- Failed deliveries counter ביממה האחרונה

`DashboardTab` (שורות 115–166) מציג רק KPIs עסקיים — אין שום מקבץ "System Health".
**חומרה:** 🟠 HIGH
**תיקון:** הוספת `<HealthCard />` עם polling כל 30s ל-`/api/status` שמציגה: uptime, memory, Supabase ping, unack events count, failed-PO-last-24h.

---

### M-10 · 🟠 HIGH — אין Synthetic Monitoring
**קובץ:** `SETUP-GUIDE-STEP-BY-STEP.md`, `server.js`
**ממצא:** אין:
- Cron שמריץ `curl /api/status` כל דקה.
- Synthetic test של flow מלא (`POST /api/purchase-requests → POST /api/rfq/send` עם supplier מבודק).
- Replit Reserved VM לא שולח healthcheck אחרי deploy.

`/api/status` עצמו שורה 112 קורא ל-`procurement_dashboard.select().single()` — אם המבט הזה (view) חסר (עקב drop בטעות), ה-endpoint מחזיר 500 — מה שמבלבל synthetic check עתידי שחושב שהשרת down כאשר בפועל רק ה-view חסר.
**חומרה:** 🟠 HIGH
**תיקון:**
1. Split ל-`/api/health/live` (רק `res.json({ok:true})`) ו-`/api/health/ready` (בודק Supabase + WhatsApp token).
2. UptimeRobot keyword monitor על `/api/health/ready` עם keyword `"ready"` (failure אם חסר).
3. Synthetic: Healthchecks.io + cron שמריץ flow מלא פעם ביום ומדווח ping.

---

## 2. סיכום חומרה

| # | ממצא | חומרה | קישור לטיפול |
|---|-----|------|-------------|
| M-01 | אין Uptime Monitoring | 🔴 CRIT | UptimeRobot Free, 5 דק' |
| M-02 | אין ערוץ התראה | 🔴 CRIT | Cron → WhatsApp, 30 דק' |
| M-03 | אין Error Rate Alerting | 🔴 CRIT | Global error handler, 20 דק' |
| M-04 | אין latency baselines | 🟠 HIGH | Middleware timing, 15 דק' |
| M-05 | אין Disk/Memory alerts | 🟠 HIGH | הרחבת /api/status, 10 דק' |
| M-06 | WhatsApp quota blindness | 🔴 CRIT | Error code parse + counter, 45 דק' |
| M-07 | אין alerts על גודל Supabase | 🟠 HIGH | Daily cron + retention, 30 דק' |
| M-08 | PO send fail שקט | 🔴 CRIT | system_events insert, 10 דק' (מתחבר ל-F-02) |
| M-09 | Dashboard לא מציג health | 🟠 HIGH | HealthCard component, 30 דק' |
| M-10 | אין Synthetic Monitoring | 🟠 HIGH | Split /live + /ready, 20 דק' |

**סה"כ:** 5 × 🔴 CRITICAL, 5 × 🟠 HIGH. 0 × LOW. **כל דימנסיית ה-monitoring חסרה.**

---

## 3. Minimal Alerting Stack — לחנות של איש אחד

**עלות: $0/חודש. התקנה: ~2 שעות.**

### שכבה 1 — Probe חיצוני (חובה, 5 דק')
- **UptimeRobot Free** — https://uptimerobot.com
  - Monitor #1: HTTP(s) על `https://REPLIT_URL/api/health/live`, interval 5 דקות.
  - Monitor #2: Keyword על `/api/health/ready` עם `"ready"`.
  - Alert contacts: Email (קובי) + WhatsApp דרך webhook (דורש Zapier Free או make.com).
  - **למה:** תופס השבתות Replit, downtime Supabase, ו-crashes.

### שכבה 2 — Error Aggregation (חובה, 30 דק')
- **Supabase `system_events` כ-sink** (כבר קיים ב-schema, לא בשימוש).
- Global error middleware ב-express:
  ```js
  app.use((err, req, res, next) => {
    supabase.from('system_events').insert({
      type: 'uncaught_error', severity: 'error', source: 'express',
      message: err.message, data: { stack: err.stack, path: req.path }
    });
    res.status(500).json({ error: 'Internal error' });
  });
  ```
- Cron endpoint `/api/cron/alerts` (שורה חדשה) שסורק `system_events WHERE severity IN ('error','critical') AND acknowledged=false AND created_at > now() - interval '5 minutes'` ושולח WhatsApp ל-Kobi.
- הפעלה: UptimeRobot keyword monitor כל 2 דק' על `/api/cron/alerts` עם `"ok"` בתגובה.
- **למה:** מנצל תשתית קיימת, 0 שירותים חיצוניים.

### שכבה 3 — Synthetic (חובה, 20 דק')
- **Healthchecks.io Free** — https://healthchecks.io (20 checks, dead-man's switch).
- Cron חיצוני (UptimeRobot או Zapier) שקורא `/api/health/ready` כל דקה.
- Healthchecks.io מקבל ping אם הקריאה הצליחה; אם לא הגיע ping — שולח אלרט.
- **למה:** מגדיר גם upper-bound — מאתר גם מקרה שהשרת חי אבל לא מגיב.

### שכבה 4 — Dashboard Health Widget (מומלץ, 30 דק')
- הוספת card ל-`DashboardTab` ב-`onyx-dashboard.jsx`:
  - `status.memory.rss_mb` / `status.uptime_sec` / `status.whatsapp_ok`
  - `failed_pos_24h` / `unack_events`
- Polling כל 30 שניות עם `setInterval`.

### שכבה 5 — WhatsApp Quota Counter (חובה, 45 דק')
- Daily aggregate ב-`system_events`: type='whatsapp_quota', data={sent:N, failed:N}.
- Dashboard מציג ערך + סרגל עם threshold של 200 ביום (80% מתחת 250).
- Circuit breaker — אם 3 רצופות עם rate-limit error → flag ב-Supabase `system_config.whatsapp_paused=true`; כל `sendWhatsApp` בודק את הדגל לפני שליחה.

---

## 4. קובץ תיקוני קוד מומלצים

### 4.1 `/api/status` משופר (server.js שורה 111)
```js
app.get('/api/status', async (req, res) => {
  const start = Date.now();
  let dbOk = false, dbLatency = null;
  try {
    const s = Date.now();
    const { data } = await supabase.from('system_events').select('id').limit(1);
    dbLatency = Date.now() - s;
    dbOk = true;
  } catch (_) {}

  const { count: unackEvents } = await supabase
    .from('system_events').select('*', { count: 'exact', head: true })
    .eq('acknowledged', false).in('severity', ['error', 'critical']);

  const mem = process.memoryUsage();
  res.json({
    engine: 'ONYX Procurement System',
    version: '1.0.0',
    status: dbOk ? 'operational' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime_sec: Math.round(process.uptime()),
    memory: { rss_mb: Math.round(mem.rss/1048576), heap_mb: Math.round(mem.heapUsed/1048576) },
    supabase: { ok: dbOk, latency_ms: dbLatency },
    whatsapp: !!WA_TOKEN ? 'configured' : 'not configured',
    unack_critical_events: unackEvents || 0,
    response_ms: Date.now() - start,
  });
});
```

### 4.2 Health split
```js
// Liveness — רק "the process is alive"
app.get('/api/health/live', (req, res) => res.json({ ok: true, ready: false }));

// Readiness — מוכן לקבל תעבורה
app.get('/api/health/ready', async (req, res) => {
  try {
    await supabase.from('suppliers').select('id').limit(1);
    res.json({ ok: true, ready: true });
  } catch (e) {
    res.status(503).json({ ok: false, ready: false, error: e.message });
  }
});
```

### 4.3 Error handler גלובלי (להכניס לפני `app.listen`)
```js
app.use((err, req, res, next) => {
  console.error('[ERROR]', req.method, req.path, err.message);
  supabase.from('system_events').insert({
    type: 'express_error', severity: 'error', source: 'express',
    message: `${req.method} ${req.path}: ${err.message}`,
    data: { stack: err.stack?.slice(0,500), path: req.path, method: req.method }
  }).then(() => {}).catch(() => {});
  res.status(500).json({ error: 'Internal server error' });
});
```

### 4.4 Cron alerts endpoint
```js
app.get('/api/cron/alerts', async (req, res) => {
  // Protect with shared secret
  if (req.query.key !== process.env.CRON_KEY) return res.sendStatus(403);

  const { data: events } = await supabase
    .from('system_events').select('*')
    .eq('acknowledged', false).in('severity', ['error', 'critical'])
    .gte('created_at', new Date(Date.now() - 5*60*1000).toISOString());

  if (events?.length && WA_TOKEN && process.env.KOBI_PHONE) {
    const msg = `🚨 ONYX Alert — ${events.length} אירועים קריטיים\n` +
                events.slice(0,5).map(e => `• [${e.severity}] ${e.message}`).join('\n');
    await sendWhatsApp(process.env.KOBI_PHONE, msg);
    await supabase.from('system_events').update({ acknowledged: true })
      .in('id', events.map(e => e.id));
  }

  res.json({ ok: true, alerted: events?.length || 0 });
});
```

### 4.5 תיקון F-02 משולב עם monitoring
```js
// server.js שורה 667 — לפני update
if (!sendResult.success) {
  await supabase.from('system_events').insert({
    type: 'po_send_failed', severity: 'critical', source: 'whatsapp',
    message: `PO ${po.id} נכשל ב-${po.supplier_name}`,
    data: { po_id: po.id, supplier_id: po.supplier_id, error: sendResult.error || 'unknown', status_code: sendResult.status }
  });
  await audit('purchase_order', po.id, 'send_failed', req.body.sent_by || 'api', `Failed: ${sendResult.error}`);
  return res.json({ sent: false, message: '❌ שליחה נכשלה', error: sendResult.error });
}

// רק אם success:
await supabase.from('purchase_orders').update({
  status: 'sent', sent_at: new Date().toISOString(),
}).eq('id', po.id);
```

---

## 5. רשימת ENV חדשים נדרשים

להוסיף ל-`.env.example`:
```
# Monitoring
CRON_KEY=random_secret_32_chars_here
KOBI_PHONE=+9725XXXXXXXX
UPTIME_ROBOT_API_KEY=  # optional, for reverse query
DAILY_WA_QUOTA=250     # Meta tier
ALERT_MEMORY_MB=400    # Replit 512MB threshold
```

---

## 6. SLO/SLI מוצעים (baseline ראשוני)

| Metric | Target | איך למדוד |
|--------|--------|-----------|
| Availability | 99% חודשי (~7h downtime) | UptimeRobot |
| `/api/status` p95 | <500ms | Middleware timing → system_events |
| `/api/rfq/send` p95 | <8s לעד 20 ספקים | Middleware timing |
| Error rate | <1% מבקשות 24h | Count 5xx / total |
| PO delivery success rate | >95% | `po_line_items` where status='sent' / total |
| Unacknowledged critical events | 0 (alert אם >0 למשך 10 דק') | system_events query |
| WhatsApp daily usage | <80% מה-tier | Counter יומי |
| Supabase DB size | <400MB | `pg_database_size` |

---

## 7. ממצאי ניטור שאינם ב-Wave1

אין חפיפה. Wave1 מכסה:
- נכונות (F-01..F-09)
- אבטחה (B-01..B-05)

Agent #21 מכסה:
- M-01..M-10 — כולם חדשים, כולם על דימנסיית observability/alerting.

F-02 הוא יוצא-דופן: Wave1 מזהה את הבאג בנכונות, M-08 מוסיף את השכבה של "גם אם מתקנים — אין מי שיצעק".

---

**סיום:** המערכת רצה בעיוורון מוחלט. כל המלצות M-01..M-10 עלות $0 וזמן כולל ~2 שעות התקנה.
