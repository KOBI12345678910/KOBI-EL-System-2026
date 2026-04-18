# QA Agent #20 — Logging & Observability

**תאריך:** 2026-04-11
**היקף:** `server.js` (934 שורות), `package.json`
**מתודולוגיה:** בדיקה סטטית בלבד (static analysis)
**ממד ייעודי:** Logging & Observability
**הקשר:** ממצאים שכבר תועדו ב-`QA-WAVE1-DIRECT-FINDINGS.md` לא יחזרו כאן.

---

## תקציר מנהלים

למערכת ONYX Procurement **אין אסטרטגיית לוגינג כמעט בכלל**. לא logger structured, לא levels, לא request-id, לא /metrics, ו-console ב-stdout לא persistent. כל מה שיש: שתי קריאות `console.log` בכל 934 השורות, ו-2 הכנסות ל-`system_events` שמכסות פחות מ-3% מהזרימות. ב-Replit, stdout נמחק בכל restart, ולקובי אין דרך להשיב על השאלה "מה קרה עם RFQ-X לפני שעתיים?".

---

## L-01 · מדידה כמותית: שני console.log בלבד בכל הקודבייס

**חומרה:** כתום
**מיקומים:** `server.js:896`, `server.js:910`

```js
// server.js:896
console.log(`📱 WhatsApp from ${from}: ${text.slice(0, 100)}`);

// server.js:910 — בתוך app.listen()
console.log(`
╔══════════════════════════════════════════════════════════════╗
║   🚀 ONYX PROCUREMENT API SERVER                            ║
║   Port: ${PORT}                                             ...
```

**ממצא:**
- **0 קריאות `console.error`** — שגיאות חסרות לוג לגמרי.
- **0 קריאות `console.warn`**.
- **0 קריאות `console.info`**.
- **0 קריאות `console.debug`**.
- **2 קריאות `console.log` סה"כ** — אחת ב-startup banner, אחת ב-webhook חץ בודד.

**תוצאה:** ברגע ש-endpoint מחזיר 500, אין שום רישום מה קרה. קובי יראה "Internal Server Error" בדשבורד ואין לו דרך לדעת אם זה Supabase, WhatsApp, network, validation, או מחרוזת NaN. Postmortem = בלתי אפשרי.

---

## L-02 · אין logger library בכלל (winston/pino/bunyan) — המודולים לא מותקנים

**חומרה:** כתום
**מיקום:** `package.json:10-15`

```json
"dependencies": {
  "express": "^4.21.0",
  "@supabase/supabase-js": "^2.45.0",
  "dotenv": "^16.4.5",
  "cors": "^2.8.5"
}
```

**ממצא:** 4 תלויות בלבד. אין `winston`, `pino`, `bunyan`, `morgan`, `debug`, `roarr`, `signale`, `log4js`, או אפילו `chalk`. המערכת רצה מבלי שום תשתית לוגינג.

**השלכות:**
- לא ניתן לקבוע `LOG_LEVEL` משתני סביבה.
- לא ניתן לעבור ל-JSON logging לצורך Grafana Loki / Datadog / CloudWatch.
- לא ניתן לבצע רוטציה של קבצים.
- קריאת `console.log` חוסמת את ה-event loop (synchronous I/O) — ב-p99 זה יגלוש.

**המלצה (שדרוג בלבד, "לא מוחקים רק משדרגים"):**
הוספת `pino` (~30KB, sync + async + JSON):
```js
const pino = require('pino');
const log = pino({ level: process.env.LOG_LEVEL || 'info', base: { service: 'onyx-procurement' } });
```

---

## L-03 · אין מידרג חומרה (log levels) — הכל שטוח

**חומרה:** כתום
**מיקום:** הקודבייס כולו

**ממצא:** כל רישום הוא `console.log` — אין הבחנה בין DEBUG, INFO, WARN, ERROR, FATAL. בפועל זה אומר:
- **Startup banner** (informational) — בעדיפות זהה ל-
- **הודעת WhatsApp זדונית אפשרית** (ראוי SECURITY_WARN).
- קריסות (ERROR/FATAL) — **אין בכלל**.

**כלל זהב של logging שלא מתקיים:** סיווג לפי חומרה כדי שהתפעול יוכל לסנן/להתריע רק על WARN+ ולהתעלם מ-INFO ברגיל.

---

## L-04 · אין Correlation IDs — אי אפשר לעקוב אחרי בקשה חוצת שירותים

**חומרה:** אדום (קריטי לדיבאג בפרודקשן)
**מיקום:** `server.js` — כל ה-middleware stack

```js
app.use(cors());
app.use(express.json());
// ← חסר כאן: request-id middleware
```

**ממצא:** אין `uuid` בדיפנדנסיות, אין `express-request-id`, אין `X-Request-Id` header handling, אין `AsyncLocalStorage`. זרימה טיפוסית של `POST /api/rfq/send`:

1. Dashboard → server.js:226 (RFQ API)
2. Server → Supabase insert × 4 טבלאות (`rfqs`, `rfq_recipients`, `purchase_requests`, `system_events`)
3. Server → WhatsApp Graph API × N ספקים
4. Server → audit() → Supabase `audit_log`
5. Server → `system_events` insert

**כל אחד מהשלבים — בלי לדעת שהוא שייך לאותו RFQ מבחינת לוגים.** כש-Kobi שואל "למה ספק X לא קיבל הודעה לפני שעה?", אין שרשור אחד שמאחד את כל הפעולות. יש לו רק את `rfq_recipients.status='sent'` → אין שום מידע על השגיאה מה-Facebook Graph.

**תיקון (שדרוג):**
```js
const { v4: uuid } = require('uuid');
app.use((req, res, next) => {
  req.id = req.header('X-Request-Id') || uuid();
  res.setHeader('X-Request-Id', req.id);
  next();
});
```
וב-logger: `log.child({ reqId: req.id })`.

---

## L-05 · `system_events` — 2 הכנסות בלבד מתוך עשרות נקודות flow

**חומרה:** אדום
**מיקומים:** `server.js:329-333`, `server.js:888-894`

הכנסה #1 — **כשהן מצליחות**:
```js
await supabase.from('system_events').insert({
  type: 'rfq_sent', severity: 'info', source: 'procurement',
  message: `RFQ ${rfqId} נשלח ל-${results.filter(r => r.delivered).length}/${suppliers.length} ספקים`,
  data: { rfqId: rfq.id, supplierCount: suppliers.length, deliveredCount: results.filter(r => r.delivered).length },
});
```

הכנסה #2 — WhatsApp incoming:
```js
await supabase.from('system_events').insert({
  type: 'whatsapp_incoming', severity: 'info', source: 'whatsapp',
  message: `הודעה מ-${from}: ${text.slice(0, 200)}`,
  data: { from, text, messageId: msg.id, timestamp: msg.timestamp },
});
```

**מה חסר ב-system_events (לא נרשם בשום מקום):**

| Event | מיקום ב-server.js | חומרה |
|-------|-------------------|-------|
| `supplier_created` | 149-153 | info |
| `supplier_updated` | 156-163 | info |
| `purchase_request_created` | 192-211 | info |
| `rfq_partial_failure` (0/N delivered) | 310-321 | error |
| `whatsapp_send_failed` | 300-302 | error |
| `sms_send_failed` | (sendSMS throws) | error |
| `rfq_failed_no_suppliers` | 250-252 | warn |
| `quote_received` | 365-418 | info |
| `decision_rendered` | 559-570 | info |
| `po_approved` | 613-623 | info |
| `po_sent_success` / `po_sent_failed` | 663-678 | info/error |
| `subcontractor_decision` | 781-790 | info |
| `webhook_whatsapp_verification_failed` | 871-873 | **security_warn** |
| `webhook_whatsapp_malformed_payload` | 876-901 | warn |
| `status_endpoint_hit` | 111-122 | debug (optional) |
| `supabase_query_error` (כל ה-`.single()`) | 9+ מקומות | error |

**תוצאה:** קובי רואה אך ורק "RFQ sent" ו"WhatsApp incoming" ב-`system_events`. **כל מה שקורה סביב — שקוף לחלוטין.** זה שקול ל-gopro שמצלם רק שתי פריימים ליום.

---

## L-06 · אין Redaction — לוגים מתארחים PII/טלפונים/טוקנים עלולים לזלוג

**חומרה:** כתום (פרטיות)

**ממצאים מפורטים:**

### L-06.1 — WhatsApp webhook logger מדפיס מספר טלפון + הודעה מלאה
`server.js:896`:
```js
console.log(`📱 WhatsApp from ${from}: ${text.slice(0, 100)}`);
```
`from` הוא מספר טלפון של ספק → PII לפי GDPR/חוק הגנת הפרטיות. `text.slice(0,100)` יכול להכיל מחיר, שם לקוח, כתובת משלוח.

### L-06.2 — `system_events.data` מאחסן את הודעת ה-WhatsApp המלאה
`server.js:893`:
```js
data: { from, text, messageId: msg.id, timestamp: msg.timestamp },
```
**`text` מלא, לא slice.** אם ספק שולח "הצעה ל-{name_of_competitor}: ₪12,000", זה נשמר לצמיתות בלי מסכת. כל מי שיש לו גישת read ל-`system_events` רואה הכל.

### L-06.3 — לא קיים middleware שמוחק מפתחות סיסמה/טוקן
כשתוסיף לוגים (שתוסיף), קל להדפיס ב-debug את `req.body` של `POST /api/suppliers` ולפרוץ לוג עם `credit_terms`, `bank_account`, וכו'. **אין guard.**

**תיקון קל:** הוספת redaction list ל-pino:
```js
pino({ redact: ['req.headers.authorization', 'req.body.bank_account', '*.password', '*.token'] });
```

### L-06.4 — `WA_TOKEN`, `TWILIO_AUTH_TOKEN`, `SUPABASE_ANON_KEY` — לא מודפסים *כרגע* אבל אין guard
אם בעתיד יוסיפו `console.log('config:', process.env)` לצורך דיבאג — הכל יזלוג. אין שכבה שמגנה.

---

## L-07 · Log Retention — הכל נעלם ב-restart של Replit

**חומרה:** אדום

**ממצא:** המערכת כתובה להדפיס ל-stdout בלבד. ב-Replit:
- stdout של תהליך Node.js מגיע ל-Console של ה-Repl.
- ה-Console **מוגבל לגלילה זמנית** ולא persistent בין restart-ים.
- אם ה-Repl יושן (Replit sleep), כל ההיסטוריה נמחקת.
- אין `winston-daily-rotate-file`, אין S3 ship, אין syslog, אין Loki push.

**תוצאה אמיתית:** אם `POST /api/rfq/send` נכשל ב-21:30, והתשלום הראשון ב-`rfq_recipients.delivered = false`, וקובי בודק ב-07:00 למחרת → **אין לו שום מידע למה השליחה נכשלה**. ה-Repl כבר התעורר-הושן-התעורר, stdout נמחק, ו-`system_events` לא רושם שגיאות.

**המלצה (לא דחוף אבל קריטי):**
- לפחות: `system_events` כ-sink יחיד (אבל מצריך סידור L-05 קודם).
- מומלץ: לשלוח ל-Supabase table חדש `system_logs(id, level, ts, reqId, msg, context jsonb)` בכל לוג WARN+.
- מעולה: BetterStack/Logtail/Axiom (חינם עד 1GB/חודש).

---

## L-08 · Search/Query — קובי לא יכול למצוא "כל האירועים של PO #1234"

**חומרה:** כתום

**ממצא:** אין endpoint ציבורי/פנימי שמחזיר היסטוריה של ישות לפי ID. יש:
- `GET /api/audit?limit=50` (server.js:852) — כל האודיט, ללא פילטר לפי entity_id/entity_type.
- `GET /api/rfq/:id` — מחזיר RFQ נוכחי בלבד, לא timeline.
- `GET /api/purchase-orders/:id` — אותו דבר.

**מה חסר:**
```
GET /api/audit?entity_type=purchase_order&entity_id=123  ← לא נתמך
GET /api/events?type=rfq_sent&since=2026-04-01             ← לא נתמך
GET /api/timeline/po/:id                                    ← לא קיים
```

**תוצאה:** כדי לענות על "מה קרה עם PO #1234 בשעה האחרונה", קובי חייב להיכנס ל-Supabase SQL Editor ולכתוב:
```sql
SELECT * FROM audit_log WHERE entity_type='purchase_order' AND entity_id='1234' ORDER BY created_at;
SELECT * FROM system_events WHERE data->>'po_id'='1234';  -- ריק!
```

זה **לא מתאים לאופי של מערכת Real-Time של מנכ"ל**. צריך endpoint אחד שמחזיר timeline מאוחד של audit_log + system_events + rfqs + PO status changes.

---

## L-09 · אין /metrics endpoint — Prometheus/Datadog לא יכולים לצרוך

**חומרה:** כתום (יעדים רחוקים) / נמוך (סטארט-אפ)

**ממצא:** חיפוש `metrics`, `prom`, `observability` ב-server.js מחזיר 0. המסכת Prometheus:
```
# HELP onyx_rfq_sent_total Number of RFQs sent
# TYPE onyx_rfq_sent_total counter
onyx_rfq_sent_total 0

# HELP onyx_whatsapp_send_duration_seconds ...
# TYPE onyx_whatsapp_send_duration_seconds histogram
```

**אין.** קובי לא יוכל לראות ב-Grafana:
- כמה RFQ נשלחו השבוע?
- מה ה-p95 של זמן תגובה של `POST /api/rfq/:id/decide`?
- מה אחוז כשלונות WhatsApp send?

**תיקון (שדרוג): `prom-client`** — 200 שורות קוד, מיד חוזר metrics לאנדפוינט `/metrics`. עם 3 ספקים מנטרים זה ב-chart ותו לא.

---

## L-10 · /api/status — לא מבצע health probe אמיתי

**חומרה:** כתום
**מיקום:** `server.js:111-122`

```js
app.get('/api/status', async (req, res) => {
  const { data: dashboard } = await supabase.from('procurement_dashboard').select('*').single();
  res.json({
    engine: 'ONYX Procurement System',
    version: '1.0.0',
    status: 'operational',  // ← תמיד זה!
    timestamp: new Date().toISOString(),
    dashboard: dashboard || {},
    whatsapp: !!WA_TOKEN ? 'configured' : 'not configured',
    supabase: 'connected',  // ← תמיד זה!
  });
});
```

**בעיות:**

1. **`status: 'operational'` הוא hard-coded** — גם אם Supabase נפל, ה-endpoint יחזיר `operational`.

2. **`supabase: 'connected'` הוא גם hard-coded** — אף פעם לא מחושב לפי תוצאת ה-query.

3. **אין error guard ל-`.single()`** — אם `procurement_dashboard` view שבור (ראה F-03), `dashboard` יהיה undefined אבל `.single()` עדיין יעיף שגיאה לא מטופלת → **500 במקום חזרת status honest**.

4. **`whatsapp: 'configured'`** — רק בודק את קיום `WA_TOKEN`, לא שהוא תקף. אם ה-token פג (נדיר אבל קורה), הסטטוס יישאר "configured".

5. **אין בדיקת Twilio** — למרות ש-`sendSMS` משתמש ב-`TWILIO_SID`.

6. **אין metric `uptime`** או `memory_usage`.

**תוצאה:** `/api/status` הוא vanity endpoint — חוזר 200 תמיד. לא שימושי ל-load balancer, לא ל-UptimeRobot, לא ל-Replit keepalive.

**תיקון:**
```js
app.get('/api/status', async (req, res) => {
  const checks = {};
  try {
    const { error } = await supabase.from('suppliers').select('id', { count: 'exact', head: true }).limit(1);
    checks.supabase = error ? 'down' : 'up';
  } catch (e) { checks.supabase = 'down'; }
  checks.whatsapp = WA_TOKEN ? 'configured' : 'missing';
  checks.uptime_sec = Math.floor(process.uptime());
  checks.memory_mb = Math.floor(process.memoryUsage().rss / 1024 / 1024);
  const healthy = checks.supabase === 'up';
  res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', checks });
});
```

---

## L-11 · שגיאות Supabase נזרקות ל-void ברוב ה-endpoints

**חומרה:** כתום
**מיקומים נבחרים:**

- `server.js:141-145` — `getSupplier` מפרק 3 queries (`suppliers`, `supplier_products`, `price_history`). אם 2 מהן נכשלות, ה-response עדיין מחזיר `{supplier, products, priceHistory}` עם fields חסרים ללא indication לקובי.
- `server.js:206` — הכנסת `purchase_request_items` ללא בדיקת `error`. אם ה-insert נכשל (FK/validation), ה-API מחזיר `201 Created` על ה-request ריק.
- `server.js:324` — `UPDATE purchase_requests SET status='rfq_sent'` — error מתעלמים ממנו.
- `server.js:396-399` — `UPDATE rfq_recipients SET status='quoted'` — error מתעלמים ממנו.
- `server.js:402-410` — לולאה שמוסיפה price_history פריט אחר פריט; כישלון באמצע → חלק נשמר חלק לא, בלי שום log.
- `server.js:671` — `UPDATE purchase_orders status='sent'` — ראו F-02 ב-DIRECT-FINDINGS, אבל גם כאן אין log למה ה-UPDATE נכשל.

**דפוס:** `const { data } = await supabase...` בלי `error`. ב-supabase-js כשיש error, data הוא null, והקוד ממשיך כאילו הכל בסדר. אין טריגר ללוג.

---

## L-12 · ה-try/catch היחיד בוולע את השגיאה בלי לרשום אותה

**חומרה:** כתום
**מיקום:** `server.js:294-302`

```js
try {
  if (channel === 'whatsapp' && WA_TOKEN) {
    sendResult = await sendWhatsApp(address, messageText);
  } else if (channel === 'sms') {
    sendResult = await sendSMS(address, messageText);
  }
} catch (err) {
  sendResult = { success: false, error: err.message };
}
```

**ממצא:**
- `err.message` נשמר לתוך `sendResult.error`, אבל **ה-error לא נכתב לשום מקום**: לא ל-console, לא ל-`system_events`, לא ל-`rfq_recipients`.
- השדה `rfq_recipients.error` לא קיים ב-schema (בדוק: הטבלה מקבלת `status` אבל לא `failure_reason`).
- `err.stack` — לא נשמר אף פעם. אם WhatsApp Graph API החזיר 401 Unauthorized (token פג), אף אחד לא יידע.

**תיקון:** לפחות `console.error('[rfq.send]', { reqId, supplierId: supplier.id, channel, err })` + הוספת `rfq_recipients.failure_reason TEXT` ב-schema.

---

## L-13 · אין Express error middleware — 500 מוחזר כ-HTML ברירת מחדל של Express

**חומרה:** כתום
**מיקום:** `server.js` end — לא קיים `app.use((err, req, res, next) => {...})`

**ממצא:** אם Express מזהה throw לא מטופל (למשל ב-async handler שלא עטוף ב-try), ברירת המחדל של Express היא להחזיר HTML של 500 עם stack trace (ב-dev) או ללא מידע (ב-prod). בשני המקרים:
1. Response הוא **HTML**, לא JSON — הדשבורד (שמצפה ל-JSON) יקרוס בניתוח.
2. אין רישום ללוג.

**תיקון:**
```js
app.use((err, req, res, next) => {
  console.error('[express.error]', { reqId: req.id, path: req.path, err: err.stack });
  res.status(500).json({ error: 'Internal error', reqId: req.id });
});
```

---

## L-14 · אין Access Log — אי אפשר לדעת מי ניגש ל-API

**חומרה:** כתום
**מיקום:** server.js — `app.use` stack חסר morgan/custom logger

**ממצא:** כל בקשה נכנסת (GET/POST/PATCH) לא נרשמת בכלל. לא IP, לא method, לא URL, לא status code, לא duration. משמעות — אם מחר מישהו יסרוק את ה-API (כי אין auth, ראה B-03 ב-WAVE1), **אין שום עדות בדיעבד**.

**תיקון קל (morgan):**
```js
const morgan = require('morgan');
app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));
```

---

## L-15 · audit_log table — רישום חלקי, לא כל פעולה מאוחסנת

**חומרה:** כתום
**מיקום:** `server.js:99-105` + קריאות ל-`audit()` בכל הקוד

**ממצא:** הפונקציה `audit()` קיימת אבל נקראת רק ב-7 מקומות:
- server.js:152 — `supplier created`
- server.js:161 — `supplier updated`
- server.js:209 — `purchase_request created`
- server.js:326 — `rfq sent`
- server.js:412 — `quote received`
- server.js:582 — `procurement_decision decided`
- server.js:621 — `purchase_order approved`
- server.js:672 — `purchase_order sent`

**מה חסר:**
- `supplier_products add` (166-170) — ✗
- `subcontractor create` (691-699) — ✗
- `subcontractor_pricing upsert` (702-709) — ✗
- `subcontractor_decision` (781-790) — ✗ (!!!)
- `purchase_order status→delivered/cancelled` — אין בכלל endpoints
- `rfq status change` — ✗

**הכי חמור — `subcontractor_decision` לא מאודיט.** זו החלטה כספית בשווי עשרות אלפי שקלים, ואין רישום של "AI בחר קבלן X במקום Y". זו נקודת כשל compliance רצינית.

**פגם משני:** הפונקציה `audit()` עצמה לא בודקת `error` אם ה-insert נכשל. אם ה-audit_log table נפל — **הפעולה עברה והאודיט לא.** אין fallback.

---

## L-16 · emoji-in-logs — לא חוצה platforms ולא מאפשר grep

**חומרה:** נמוך
**מיקום:** `server.js:896, 910`

```js
console.log(`📱 WhatsApp from ${from}: ...`);
console.log(`║   🚀 ONYX PROCUREMENT API SERVER ...`);
```

**ממצא:** אימוג'ים ב-log lines פוגעים ב:
- `grep` עם terminal ישן שלא תומך UTF-8.
- מנועי חיפוש (Loki, CloudWatch) שמפעילים tokenization לפי ASCII.
- ההתגוננות של Kibana/Elastic.
- תמיכת Windows PowerShell אלא אם UTF-8 code page.

לא קריטי, אבל best practice ל-logger של שרת: ASCII בלבד, אימוג'י ל-UI של הדשבורד.

---

## סיכום חמור-כלפי-לא-חמור

| ID | חומרה | תיאור |
|----|--------|-------|
| L-04 | אדום | אין Correlation IDs — לא ניתן לעקוב cross-service |
| L-05 | אדום | system_events מכסה 2 events מתוך 20+ |
| L-07 | אדום | Retention = stdout בלבד, נמחק ב-Replit restart |
| L-01 | כתום | 2 console.log בלבד, 0 console.error |
| L-02 | כתום | אין logger library (winston/pino) |
| L-03 | כתום | אין log levels |
| L-06 | כתום | אין redaction של PII/tokens |
| L-08 | כתום | אי אפשר לחפש "כל האירועים של PO #X" |
| L-10 | כתום | /api/status לא מבצע probe אמיתי |
| L-11 | כתום | שגיאות Supabase מתעלמות ברוב הנקודות |
| L-12 | כתום | try/catch בודד בולע את השגיאה |
| L-13 | כתום | אין error middleware — 500 HTML |
| L-14 | כתום | אין access log |
| L-15 | כתום | audit_log — רישום חלקי (subcontractor_decision חסר!) |
| L-09 | כתום | אין /metrics endpoint |
| L-16 | נמוך | emoji ב-logs |

---

## המלצה כוללת (מינימום לפרודקשן)

**3 שעות עבודה שיעלו את המערכת מ-"שחור" ל-"נראה":**

1. `npm install pino pino-http morgan uuid` (30 שניות).
2. `app.use((req,res,next)=>{ req.id = uuid(); next(); })` + `app.use(pinoHttp({ logger: pino() }))`.
3. החלפת כל `.single()` לקוד עם error guard שמבצע `req.log.error({err}, 'supabase error')`.
4. הוספת helper `logEvent(type, severity, source, message, data)` → כותב ל-`system_events` + log line עם reqId.
5. קריאה ל-`logEvent` בכל ה-16 נקודות ששוקפתי ב-L-05.
6. שיפוץ `/api/status` ל-probe אמיתי (ראה L-10).
7. הוספת express error middleware (L-13).

**עלות: 3 שעות. תועלת: קובי מקבל מערכת שאפשר לעשות עליה postmortem אמיתי. כרגע — היא במצב "פועלת או לא" בלי לדעת למה.**

---

**נכתב על ידי QA Agent #20 — Logging & Observability**
**Static Analysis Only — ללא ריצת קוד**
