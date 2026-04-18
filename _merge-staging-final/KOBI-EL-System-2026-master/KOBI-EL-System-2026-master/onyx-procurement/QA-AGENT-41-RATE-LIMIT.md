# QA Agent #41 — Rate Limiting Strategy

**תאריך:** 2026-04-11
**סוכן:** QA Agent #41
**ממד:** אסטרטגיית Rate Limiting
**שיטה:** Static analysis בלבד (server.js + package.json)
**הקשר:** מערכת רכש Hebrew-RTL, ללא Auth כרגע (B-03 פתוח), Replit single-instance.

---

## TL;DR — שורה תחתונה

המערכת **ללא כל Rate Limiting**. אין `express-rate-limit`, אין `express-slow-down`, אין middleware של throttling, ואין תוכנית limits ברמת endpoint. כל API פתוח ל-DOS, לניצול לרעה של WhatsApp Cloud API (שלוקח כסף), ולהצפת Supabase. ה-webhook של WhatsApp מוגן רק ב-verify_token ב-GET ולא מוגן כלל ב-POST (אין signature verification של `X-Hub-Signature-256`). הסיכון הגדול ביותר הוא `/api/rfq/send` — endpoint יקר שיוצר לולאת `for` של קריאות HTTP ל-Graph API לפי כל ספק, ללא כל תקרת קצב.

---

## 1. ממצאי בסיס (מה קיים / מה חסר)

| # | בדיקה | מצב | מיקום | חומרה |
|---|-------|-----|--------|------|
| 1.1 | `express-rate-limit` ב-deps | חסר | `package.json:10-15` | קריטי |
| 1.2 | `express-slow-down` ב-deps | חסר | `package.json:10-15` | גבוה |
| 1.3 | `rate-limit-redis` / store מבוזר | חסר | `package.json` | בינוני (Replit = single instance, לא urgent היום) |
| 1.4 | middleware של throttle/limit ב-`app.use` | חסר | `server.js:18-20` — יש רק `cors()` ו-`express.json()` | קריטי |
| 1.5 | per-route limiter על `/api/rfq/send` | חסר | `server.js:226` | קריטי |
| 1.6 | per-route limiter על `/webhook/whatsapp` | חסר | `server.js:863, 876` | גבוה |
| 1.7 | אימות חתימת Meta (`X-Hub-Signature-256`) | חסר | `server.js:876-901` | קריטי |
| 1.8 | תגובת 429 עם `Retry-After` | לא קיימת (אין 429 בכלל) | — | גבוה |
| 1.9 | `trust proxy` ל-IP אמיתי מאחורי Replit | חסר | `server.js:18` | בינוני (ללא זה, limiter לפי IP ישבור) |
| 1.10 | טיפול ב-rate limit יוצא מול Graph API (WhatsApp Cloud) | אין backoff/retry | `server.js:36-69` | גבוה |

**מסקנה:** המערכת ב-**Tier 0** מבחינת rate limiting — "nothing at all".

---

## 2. Endpoints בסיכון — מיפוי וקטגוריזציה

| Endpoint | שורה | סוג פעולה | עלות | סיכון | דחיפות תיקון |
|---------|------|----------|-----|------|-------------|
| `GET /api/status` | 111 | Read | נמוך (1 שאילתה לדשבורד) | DOS קל | 2 |
| `GET /api/suppliers` | 130 | Read | נמוך-בינוני (אין pagination) | scraping + DOS | 2 |
| `GET /api/suppliers/:id` | 140 | Read | בינוני (3 שאילתות) | DOS | 2 |
| `POST /api/suppliers` | 149 | Write | בינוני | spam ספקים מזויפים + audit bloat | 1 |
| `PATCH /api/suppliers/:id` | 157 | Write | בינוני | tampering | 1 |
| `POST /api/suppliers/:id/products` | 166 | Write | בינוני | spam | 1 |
| `GET /api/suppliers/search/:category` | 173 | Read (heavy) | בינוני (JOIN) | DOS | 2 |
| `POST /api/purchase-requests` | 192 | Write | בינוני | spam | 1 |
| `GET /api/purchase-requests` | 213 | Read (heavy) | גבוה (JOIN עם items, בלי `.limit()`) | scraping + DOS | 2 |
| **`POST /api/rfq/send`** | **226** | **Write (HIGH COST)** | **מאוד גבוה — שולח WhatsApp לכל הספקים + INSERT לכל ספק + UPDATE ל-purchase_requests** | **$$$ שריפת מכסת Meta + DOS טבעי על Graph API + spam ספקים אמיתיים** | **0 — הכי דחוף** |
| `GET /api/rfq/:id` | 347 | Read | בינוני | DOS | 2 |
| `GET /api/rfqs` | 355 | Read | בינוני | DOS | 2 |
| `POST /api/quotes` | 365 | Write | בינוני (לולאת price_history) | zip injection + spam | 1 |
| **`POST /api/rfq/:id/decide`** | **425** | **Compute-heavy** | **גבוה — שאילתות מרובות + חישוב ציונים** | **DOS דרך CPU** | **1** |
| `POST /api/purchase-orders/:id/approve` | 614 | Write | בינוני | מעקף לוגיקה עסקית | 1 |
| **`POST /api/purchase-orders/:id/send`** | **626** | **Write (HIGH COST)** | **שולח WhatsApp/SMS לספק** | **$$$** | **0** |
| `POST /api/subcontractors/decide` | 712 | Compute-heavy | גבוה | DOS דרך CPU | 1 |
| `GET /api/analytics/*` | 805, 825, 834 | Read (heavy) | גבוה (aggregations) | DOS דרך DB | 2 |
| `GET /api/audit` | 852 | Read | בינוני (יש `.limit(req.query.limit)` — **לא validated!**) | DOS דרך `?limit=999999999` | 2 |
| `GET /webhook/whatsapp` | 863 | Verify | נמוך | DOS קל | 3 |
| **`POST /webhook/whatsapp`** | **876** | **Write (INGEST)** | **בינוני** | **spoofing (אין signature check) + injection ל-`system_events` ללא תקרה — log poisoning** | **0** |

---

## 3. ממצאים לפי הממדים שהוגדרו

### 3.1 האם יש rate limiter מותקן?
**לא.** `package.json` מכיל רק `express`, `@supabase/supabase-js`, `dotenv`, `cors`. חסרים:
- `express-rate-limit` (החבילה הסטנדרטית)
- `express-slow-down` (השהייה הדרגתית)
- `rate-limiter-flexible` (אלטרנטיבה עם תמיכת Redis)

**המלצה:** התקנה מיידית:
```bash
npm install express-rate-limit
```

### 3.2 Per-IP limit על `/api/*` — הגנת DOS
**אין.** כל טווח `/api/*` חשוף. קל לתקוף עם עשרות בקשות/שנייה ולגרום ל-Replit instance להקריס או לשרוף מכסת Supabase.

**המלצה:** global limiter עם `windowMs: 60_000`, `max: 100` לפי IP לכל הראוטים `/api/*`.

### 3.3 Per-endpoint limits — במיוחד RFQ send
**אין. קריטי.** `/api/rfq/send` (server.js:226-344) מבצע:
1. שאילתת Supabase ל-purchase_request + items
2. שאילתת Supabase ל-supplier_products
3. INSERT ל-rfqs
4. **לולאת `for` על כל הספקים** (שורות 289-321) — כל איטרציה:
   - `sendWhatsApp()` → `https.request` ל-Graph API (עלות כספית!)
   - `sendSMS()` → Twilio אם מוגדר (עלות כספית!)
   - INSERT ל-rfq_recipients
5. UPDATE ל-purchase_requests
6. INSERT ל-audit_log
7. INSERT ל-system_events

**אם תוקף יקרא 100 פעמים לשנייה → תוך דקה שילמת $$$ ל-Meta + פוצץ את מכסת ה-WABA + spam לעשרות ספקים אמיתיים.** זה לא רק DOS — זה **financial DOS**.

**המלצה:** limiter ייעודי:
- `windowMs: 60_000`, `max: 5` (5 RFQs לדקה)
- יישום נפרד: `rfqLimiter` מותקן רק על `/api/rfq/send`
- בעתיד (כשמוסיפים auth) — לפי `user_id` ולא לפי IP

### 3.4 Webhook `/webhook/whatsapp` — limit + signature
**בעיה כפולה:**

1. **אין limit.** `POST /webhook/whatsapp` (server.js:876) כותב ל-`system_events` לכל `messages[*]`. תוקף יכול לשגר JSON כזה עם 10,000 הודעות → הצפת DB ו-log poisoning.

2. **אין signature verification.** Meta שולחת `X-Hub-Signature-256` עם HMAC-SHA256 של גוף הבקשה, חתום ב-`APP_SECRET`. הקוד לא בודק זאת בכלל:
```js
app.post('/webhook/whatsapp', async (req, res) => {
  const body = req.body;  // ← כל אחד יכול לשלוח את זה!
  ...
});
```

**המלצה:**
- **middleware לאימות HMAC** לפני כל טיפול בבקשה
- **limiter נפרד** (`windowMs: 60_000`, `max: 30`) — הרבה יותר מגביל מהכלל הכללי כי אין סיבה לגיטימית שספק ינסה יותר מ-5/דקה
- **cap על `messages.length`** (דחה בקשה עם >50 הודעות)

### 3.5 Login endpoint (עתידי — תלוי ב-B-03)
כשמוסיפים auth (B-03), חובה limiter נפרד ל-`/api/auth/login`:
- `windowMs: 15 * 60_000` (15 דקות)
- `max: 5` ניסיונות כושלים לפי IP + lockout
- נגד brute force
- `skipSuccessfulRequests: true` — כך שמשתמש לגיטימי לא נפגע
- לשקול `express-brute` או `rate-limiter-flexible` עם IP+username combo

### 3.6 Distributed state: Redis vs in-memory
**Replit single instance — in-memory מספיק היום.** `express-rate-limit` בברירת מחדל משתמש ב-Memory Store — טוב לעד instance אחד. **הסיכונים:**
- Replit restart → איפוס הטאבלה → window נשבר (לא קריטי)
- אם יעברו בעתיד ל-multi-instance / load balancer → limiter לא יעבוד (IP יעבור בין instances והטבלאות לא מסונכרנות)
- Replit "Always On" / Autoscale Deployment → חובה Redis store

**המלצה:** להיום — Memory Store. להוסיף TODO בקוד:
```js
// TODO: כשעוברים ל-multi-instance, להחליף ל-rate-limit-redis
```

### 3.7 איכות תגובת 429
**אין 429 בכלל במערכת.** כשיוסף limiter, חובה:
- `Retry-After: <seconds>` header
- `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` headers (RFC 6585 + draft standard)
- גוף תגובה Hebrew-RTL:
```json
{ "error": "יותר מדי בקשות. נסה שוב בעוד X שניות.", "retryAfter": 60 }
```
- `standardHeaders: 'draft-7'` ב-`express-rate-limit` — עושה את זה אוטומטית

### 3.8 Burst vs sustained limits
**נדרשים שני רבדים:**
- **Burst (מיידי):** `express-rate-limit` עם חלון של דקה — עוצר attackers במכה
- **Sustained (השהייה הדרגתית):** `express-slow-down` — משתמש לגיטימי שעובד מהר לא נחסם ב-429 אלא מקבל latency הולך וגדל. עדיף UX מאשר 429 קשיח למשתמש אחד (קובי).

**הצעה:**
```js
const slowDown = require('express-slow-down');
app.use('/api/', slowDown({
  windowMs: 60_000,
  delayAfter: 50,      // עד 50 בקשות/דקה — מהיר מלא
  delayMs: () => 100,  // לאחר מכן, +100ms לכל בקשה
  maxDelayMs: 2000,
}));
```

### 3.9 WhatsApp Cloud API outbound rate limits — מה קורה שם?
**Meta Cloud API מטיל מגבלות מצדו:**
- **Messaging limits (tier-based):** 250 / 1K / 10K / 100K / unlimited ייחודיים ב-24 שעות לפי quality rating
- **Business-initiated conversations:** קיים קאפ יומי של שיחות חדשות
- **Rate per second:** ~80 הודעות לשנייה לטלפון בודד

**מה הקוד עושה היום בלולאת RFQ (server.js:289-321):**
```js
for (const supplier of suppliers) {
  ...
  sendResult = await sendWhatsApp(address, messageText);  // ← sequential, אין backoff
  ...
}
```
- **חיובי:** sequential ולא `Promise.all`, לכן לא מפוצץ 80/sec בטעות
- **שלילי:** אין בדיקת סטטוס `429` מ-Graph API. אם Meta תחזיר 429 או `error.code === 131056` (rate limit hit), `sendWhatsApp` רק מחזיר `success:false` ולא עושה retry או backoff
- **שלילי:** אין circuit breaker. אם Graph API down, הלולאה תיתקע על כל ספק
- **שלילי:** אין בדיקת `OBO` / `Messaging limit` לפני שליחה

**המלצה:**
1. לעטוף את `sendWhatsApp` ב-retry-with-backoff (exponential: 1s, 2s, 4s) עבור תגובות 429/500/503
2. circuit breaker — אם 3 כישלונות ברצף, להפסיק את הלולאה ולהחזיר partial result
3. לוודא שסטטוס 429 מהלולאה נרשם ב-`system_events` (severity=warning)
4. לעקוב אחרי `messaging_limit_tier` ב-Business Manager ולהציג ב-`/api/status`

### 3.10 מדיניות 3-רבדית מומלצת (לפי הבקשה)

| Tier | Scope | windowMs | max | Store | הערות |
|------|-------|----------|-----|-------|------|
| **Tier-A: Read** | `GET /api/*` | 60,000 ms | **100** | Memory | תואם `app.get`-ים |
| **Tier-B: Write** | `POST/PATCH/PUT/DELETE /api/*` חוץ מ-RFQ | 60,000 ms | **30** | Memory | מגן מ-spam ו-audit bloat |
| **Tier-C: RFQ-send** | `POST /api/rfq/send` + `POST /api/purchase-orders/:id/send` | 60,000 ms | **5** | Memory | עלות כספית אמיתית |
| **Tier-D: Webhook** | `POST /webhook/whatsapp` | 60,000 ms | 30 | Memory | + HMAC verify |
| **Tier-E: Login (עתידי)** | `POST /api/auth/login` | 900,000 ms (15 דק') | 5 | Memory | אחרי B-03 |

---

## 4. דוגמת קוד מינימלית לשילוב (patch מוצע)

```js
// ═══ אחרי require('express') ב-server.js:12 ═══
const rateLimit = require('express-rate-limit');

// ═══ אחרי app.use(express.json()) ב-server.js:20 ═══

// חובה — Replit מאחורי proxy, אחרת req.ip שגוי
app.set('trust proxy', 1);

// Tier-A: קריאה רגילה
const readLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'יותר מדי בקשות קריאה. נסה שוב בעוד דקה.' },
});

// Tier-B: כתיבה
const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'יותר מדי בקשות כתיבה. נסה שוב בעוד דקה.' },
});

// Tier-C: שליחת RFQ/PO (יקר)
const rfqSendLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'הגעת לתקרת שליחות RFQ (5 לדקה). המתן ואז נסה שוב.' },
});

// Tier-D: webhook
const webhookLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: 'draft-7',
  keyGenerator: (req) => req.ip,  // בעתיד — להוסיף gov check ל-Meta IPs
});

// החלה:
// 1. כללי GET — קריאה
app.use('/api/', (req, res, next) => {
  if (req.method === 'GET') return readLimiter(req, res, next);
  return writeLimiter(req, res, next);
});

// 2. ייעודי RFQ — לפני הגנרי (express מתעלם מ-skip אחרי match)
app.use('/api/rfq/send', rfqSendLimiter);
app.use('/api/purchase-orders/:id/send', rfqSendLimiter);

// 3. webhook
app.use('/webhook/whatsapp', webhookLimiter);
```

**הערות חשובות:**
- `app.set('trust proxy', 1)` חובה ב-Replit — אחרת `req.ip` יחזיר תמיד את IP ה-proxy ו-כל המשתמשים ייחשבו כ-IP אחד (limiter לא יעבוד / יחסום את כולם)
- סדר ה-`app.use` חשוב — limiter חייב להיות לפני הראוטים שהוא מגן עליהם
- דוגמת `app.use('/api/', ...)` עם `GET` check שווה ל-`.all`-like — אבל עדיף לפצל לשני middlewares עם `rateLimit({... skip: (req) => req.method !== 'GET' })`

---

## 5. ממצאים נלווים חשובים (bonus שנחשפו תוך כדי)

### 5.1 `/api/audit` — CRITICAL: `limit` מ-query ללא validation
```js
// server.js:852-856
app.get('/api/audit', async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const { data } = await supabase.from('audit_log').select('*').order(...).limit(limit);
  res.json({ audit: data });
});
```
תוקף יכול לשלוח `GET /api/audit?limit=9999999999` → Supabase תנסה למשוך את כל הטבלה → OOM + חשיפת כל ה-audit ללא auth. זה לא רק חסר rate-limit אלא גם **missing input validation** — חובה:
```js
const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 500);
```

### 5.2 `sendWhatsApp` לא מטפל ב-timeout
`server.js:45-68` — `https.request` ללא `req.setTimeout()`. אם Graph API "תולה", הלולאה ב-`/api/rfq/send` יכולה להיתקע דקות ארוכות → DOS על ה-Express worker עצמו (Node.js single-thread).
**תיקון:** להוסיף `req.setTimeout(10_000, () => req.destroy(new Error('Timeout')))`

### 5.3 `/webhook/whatsapp` POST: log poisoning vector
שורה 888 כותבת כל `messages[i]` ל-`system_events` ללא תקרה/ולידציה. תוקף יכול לשלוח body שמכיל `entry[0].changes[0].value.messages = [...10_000 items...]` → הצפת DB. חובה:
- cap `messages.length` (למשל 20)
- HMAC verification (Meta's `X-Hub-Signature-256`)
- rate limiter ייעודי

### 5.4 אין `helmet` / security headers
גם לא rate-limit וגם אין `helmet()` — הקוד מגיש API public ללא כל middleware בטיחות. זה חורג מההיקף של agent זה (סוכן אחר ידון ב-headers) אבל שווה לציין: בלי rate-limit **וגם** בלי helmet, המערכת חשופה אפילו לסקאנרים אוטומטיים.

---

## 6. עדיפות תיקון (סדר יישום מומלץ)

| # | תיקון | שורות מושפעות | מאמץ | השפעה |
|---|------|-------------|-----|------|
| 1 | `npm i express-rate-limit` + Tier-C limiter על `/api/rfq/send` | +10 שורות | 15 דק' | מונע $$$ DOS |
| 2 | `app.set('trust proxy', 1)` | +1 שורה | 1 דק' | קריטי ל-Replit |
| 3 | HMAC verify + limiter ל-`/webhook/whatsapp` | +20 שורות | 30 דק' | מונע spoofing |
| 4 | Validation על `/api/audit?limit=` | +1 שורה | 2 דק' | מונע OOM |
| 5 | Tier-A + Tier-B global limiters על `/api/` | +20 שורות | 10 דק' | DOS כללי |
| 6 | `sendWhatsApp` timeout + retry-with-backoff | +15 שורות | 20 דק' | יציבות RFQ |
| 7 | Tier-C גם על `/api/purchase-orders/:id/send` | +1 שורה | 1 דק' | עלות כספית |
| 8 | Circuit breaker על לולאת RFQ | +25 שורות | 45 דק' | partial failure |
| 9 | `express-slow-down` כשכבה שנייה | +10 שורות | 15 דק' | UX חלק יותר |
| 10 | TODO comment על Redis store (עתיד multi-instance) | +2 שורות | 1 דק' | תיעוד |

**סך הכל: ~2 שעות עבודה עבור כיסוי מלא.**

---

## 7. סיכום

- **0** שורות של rate limiting במערכת היום
- **4** endpoints קריטיים חשופים ל-financial DOS (`rfq/send`, `purchase-orders/:id/send`, `webhook/whatsapp`, `audit`)
- **0** חבילות rate-limit ב-package.json — חובה `express-rate-limit` לפחות
- **Replit single-instance** — לא צריך Redis היום, Memory Store מספיק
- **3-Tier policy** (Read 100/min, Write 30/min, RFQ-send 5/min) — ישים ב-~2 שעות
- **תלות ב-B-03:** כשמוסיפים auth, להעביר limiter מ-`keyGenerator: req.ip` ל-`req.user.id || req.ip`
- **חובה נוספת מעבר להיקף:** HMAC verify ל-webhook, input validation ל-`/api/audit`, timeout ב-`sendWhatsApp`

**סטטוס ממצא:** HIGH RISK — **blocker ליציאה production**. B-03 (auth) דחוף, אבל rate limiting דחוף עוד יותר כי בלי auth **אין בכלל דלת** על ה-API היקר.
