# QA Agent #52 — Notification Routing & Delivery Strategy
## ניתוח סטטי של ניתוב התראות ואסטרטגיית מסירה — onyx-procurement

**תאריך:** 2026-04-11
**סוכן:** QA-52 (Notification Routing)
**מתודולוגיה:** Static Analysis בלבד (ללא הרצה)
**קבצים שנבדקו:**
- `server.js` (935 שורות)
- `supabase/migrations/001-supabase-schema.sql` (563 שורות)

---

## תקציר מנהלים (Executive Summary)

המערכת onyx-procurement מכילה **שלד בסיסי מאוד** של ניתוב התראות עם תמיכה ב-WhatsApp ו-SMS, אך **חסרה כמעט לחלוטין** את התשתית הנדרשת למערכת הפקה פרודקשנית: אין Fallback Chain, אין Quiet Hours, אין Retry Logic, אין DLQ, אין דדופליקציה, אין Scheduled Jobs, אין Preview, אין כיבוד חוק שעות העבודה הישראלי. הקוד מציג "Happy Path Only" — כל כשל שליחה נרשם ב-DB אך לא מטופל.

**ציון כללי:** 2.5 / 10 (CRITICAL GAPS)
**Severity:** HIGH — לא מתאים לייצור

---

## 1. Notification Preferences Per Supplier (Preferred Channel)

### מצב קיים
נמצא שדה `preferred_channel` ב-`suppliers` table (שורות 17 ב-schema):
```sql
preferred_channel TEXT DEFAULT 'whatsapp' CHECK (preferred_channel IN ('whatsapp', 'email', 'sms'))
```
שימוש ב-`server.js:290`:
```js
const channel = supplier.preferred_channel || 'whatsapp';
```

### ממצאים
- **חיובי:** קיים שדה DB עם CHECK constraint (3 ערכים: whatsapp/email/sms).
- **שלילי קריטי:** אין ממשק API לעדכון preferred_channel (אין endpoint ייעודי).
- **שלילי:** הערך המוגדר ל-`email` **לא ממומש בקוד** — אם ספק מעדיף email, הקוד ב-`/api/rfq/send` לא שולח כלום (שורות 295-299).
- **שלילי:** אין היסטוריה של שינויי channel (אין audit לשינויים).
- **שלילי:** אין בדיקת "opt-out" (האם הספק מעוניין לקבל בכלל?).

### סיכון
**HIGH** — ספק עם `preferred_channel='email'` לא יקבל שום התראה, בלי שגיאה.

---

## 2. Notification Preferences Per Event Type (RFQ vs PO vs Reminder)

### מצב קיים
**אין בכלל.** אין שום שדה או טבלה שמגדירה העדפות לפי סוג אירוע.

### ממצאים
- הערוץ מוחלט ברמת הספק בלבד, לא לפי event type.
- `RFQ` נשלח לפי `preferred_channel` (שורה 290).
- `PO` נשלח **תמיד דרך WhatsApp** (שורה 664: `sendWhatsApp(address, message)`), מתעלם לחלוטין מ-`preferred_channel`!
- אין הבחנה בין:
  - RFQ (יכול להמתין)
  - PO (דחוף)
  - Reminder (שנשלח אוטומטית)
  - Quality Alert
  - Delivery Confirmation

### סיכון
**CRITICAL** — **באג חמור:** אם ספק העדיף SMS, ה-PO יישלח בכל זאת ב-WhatsApp (שורה 664). זה **סותר את הגדרת `preferred_channel`** של המשתמש.

### הוכחה (Evidence)
```js
// server.js:660-665
const address = supplier.whatsapp || supplier.phone;
let sendResult = { success: false };
if (WA_TOKEN && address) {
  sendResult = await sendWhatsApp(address, message);  // ← הארדקוד ל-WhatsApp
}
```

---

## 3. Routing Logic: How is Channel Chosen?

### מצב קיים
לוגיקה פשוטה מאוד ב-`/api/rfq/send`:
```js
// server.js:290-299
const channel = supplier.preferred_channel || 'whatsapp';
const address = channel === 'whatsapp' ? (supplier.whatsapp || supplier.phone) : supplier.phone;

if (channel === 'whatsapp' && WA_TOKEN) {
  sendResult = await sendWhatsApp(address, messageText);
} else if (channel === 'sms') {
  sendResult = await sendSMS(address, messageText);
}
```

### ממצאים
- **חסר:** טיפול במקרה `channel === 'email'` (מוגדר ב-DB, לא ממומש).
- **חסר:** אם `WA_TOKEN` לא הוגדר ו-channel הוא `whatsapp`, שום דבר לא קורה (silent failure).
- **חסר:** לא בודקים אם לספק יש בכלל מספר WhatsApp / טלפון / email — אפשר להגיע למצב של `sendWhatsApp(undefined, ...)`.
- **חסר:** אין Strategy Pattern / Router Object — הקוד hardcoded בתוך ה-endpoint.

### Null-Safety Gap
```js
const address = channel === 'whatsapp' ? (supplier.whatsapp || supplier.phone) : supplier.phone;
```
אם `supplier.phone` גם null (email-only supplier) — `address === null`, אבל לא נבדק לפני השליחה.

---

## 4. Fallback Chain: WhatsApp → SMS → Email → Manual

### מצב קיים
**אין שום Fallback.** בדיקה מלאה של 935 שורות — אין שום לוגיקה של:
- "נסה WhatsApp; אם נכשל → נסה SMS"
- "אם SMS נכשל → שלח email"
- "אם הכול נכשל → OPEN INCIDENT / NOTIFY ADMIN"

### מצב נוכחי
```js
// server.js:300-302
} catch (err) {
  sendResult = { success: false, error: err.message };
}
```
הכשל נרשם ב-`rfq_recipients.delivered = false`, **ושם זה נגמר.**

### ממצאים
- **CRITICAL GAP** — אם WhatsApp Business API חסום / השרת של Meta למטה / הטוקן פג תוקף → כל ה-RFQ נכשל **בלי התראה**.
- אין re-route אוטומטי.
- אין alert ל-Kobi ("שים לב: 5/5 ספקים לא קיבלו").
- **אין "manual" fallback** (למשל: הוסף ל-queue של "להתקשר ידנית").

### השלכה עסקית
ייתכן מצב שבו Kobi חושב ש-RFQ נשלח → ממתין לתשובות → אין תשובות → מתחיל panic → בודק → מגלה ש-WA_TOKEN פג תוקף לפני 3 ימים.

---

## 5. Quiet Hours Respect (אין PO ב-3 לפנות בוקר)

### מצב קיים
**אין בכלל.** חיפוש של `quiet`, `hours`, `night`, `time.*check` — אפס תוצאות.

### ממצאים
- ה-endpoint `/api/rfq/send` שולח **מיידית**, ללא קשר לשעה.
- `/api/purchase-orders/:id/send` שולח **מיידית**.
- אין שדה `quiet_hours_start` / `quiet_hours_end` בטבלת ה-suppliers.
- אין שדה `do_not_disturb` או `respect_hours`.
- אין בדיקה של `new Date().getHours() < 7 || > 20`.

### סיכון
**HIGH** — קריאה אוטומטית מקרון ב-3 לפנות בוקר תשלח WhatsApp לספקים בשעות השינה. זה יזיק ליחסי לקוח ולמוניטין.

### דוגמה לבעיה
נניח Kobi מקים `/api/rfq/send` דרך cron `0 3 * * *` (3 AM nightly digest) — כל הספקים יקבלו WhatsApp בשעות השינה.

---

## 6. Israeli Labor Law Compliance (חוק שעות העבודה)

### מצב קיים
**אין שום התייחסות.**

### חוקי הרלוונטי
לפי חוק שעות עבודה ומנוחה (1951) + תיקונים:
- יום שבת (החל משקיעה יום שישי עד מוצאי שבת) — **אסור** לשלוח תקשורת עסקית רשמית לספקים דתיים.
- חגים יהודיים (ר"ה, יו"כ, סוכות, פסח, שבועות) — אין שליחה.
- שעות הפעילות המקובלות: א'-ה' 08:00-17:00, ו' 08:00-13:00.

### ממצאים
- **אין** טבלת "חגים" (holidays_calendar).
- **אין** בדיקה של יום בשבוע (`dayOfWeek() !== 6` = שבת).
- **אין** שדה `is_shabbat_observer` ב-suppliers.
- **אין** הגדרת `business_hours_only` flag.
- אין `timezone` (מניח שכולם ב-ישראל — אבל בכל זאת לא בודקים שעה).

### סיכון
**MEDIUM-HIGH** — חשיפה משפטית חלקית + נזק ליחסי ספקים (שליחת PO בשבת לספק שומר שבת = פגיעה חמורה).

---

## 7. Notification Deduplication (לא לשלוח את אותו PO פעמיים)

### מצב קיים
**אין דדופליקציה.**

### ממצאים
- אין idempotency key ב-`/api/purchase-orders/:id/send`.
- קריאה כפולה ל-endpoint תשלח **פעמיים** את אותו ה-WhatsApp.
- בעדכון `purchase_orders.status = 'sent'` (שורה 668), לא נבדק קודם האם ה-status **כבר** היה 'sent'.
- אין טבלת `notification_dedupe_log` או constraint ייחודי.
- `rfq_recipients` לא מוגדר UNIQUE על `(rfq_id, supplier_id)`, לכן אם `/api/rfq/send` נקרא פעמיים → 2 recipients + 2 WhatsApp messages לאותו ספק.

### הוכחה
```js
// server.js:625-679 — /api/purchase-orders/:id/send
// אין בדיקת "already sent"
// אין idempotency_key
// אין lock
```

### סיכון
**HIGH** — ספקים יכולים לקבל את אותו PO 3-4 פעמים (race condition, retry, manual re-click של Kobi).

---

## 8. Read Receipts Tracking

### מצב קיים
שדה `rfq_recipients.status` מכיל ערכים:
```sql
CHECK (status IN ('sent', 'delivered', 'viewed', 'quoted', 'declined', 'no_response'))
```

### ממצאים
- **חיובי:** הסטטוס `'viewed'` קיים בסכמה — סביר שהכוונה הייתה read receipts.
- **שלילי:** אין שום קוד שמעדכן את הסטטוס ל-`'viewed'`.
- **שלילי:** ה-WhatsApp webhook (`server.js:876-901`) מקבל incoming messages אבל **לא מטפל** באירועי `statuses` (delivered/read) מ-Meta.
- **חסר:** Meta WhatsApp Business API שולח אירועים מסוג `statuses` (delivered, read, failed). הקוד מתעלם מהם לחלוטין.

### הוכחה
```js
// server.js:876-901
app.post('/webhook/whatsapp', async (req, res) => {
  const messages = changes?.value?.messages;  // ← רק incoming messages
  // ← אין טיפול ב-changes?.value?.statuses (delivery/read receipts)
```

### סיכון
**MEDIUM** — Kobi לא יודע אם ספק ראה את ה-RFQ שלו, ולכן לא יכול להחליט אם לשלוח reminder או לוותר.

---

## 9. Delivery Status Table — Exists?

### מצב קיים
קיימות 2 טבלאות:

#### 9.1 `rfq_recipients` (schema:130-145)
```sql
sent_via TEXT DEFAULT 'whatsapp',
sent_at TIMESTAMPTZ DEFAULT NOW(),
delivered BOOLEAN DEFAULT false,
reminder_sent BOOLEAN DEFAULT false,
reminder_sent_at TIMESTAMPTZ,
status TEXT (sent, delivered, viewed, quoted, declined, no_response)
```

#### 9.2 `notifications` (schema:371-389)
```sql
recipient TEXT,
channel TEXT,
title, message, severity,
related_entity_type, related_entity_id,
sent BOOLEAN DEFAULT false,
sent_at TIMESTAMPTZ,
delivered BOOLEAN DEFAULT false,
acknowledged BOOLEAN DEFAULT false
```

### ממצאים
- **חיובי:** קיימות 2 טבלאות רלוונטיות.
- **שלילי CRITICAL:** **הטבלה `notifications` לא נכתבת על ידי שום קוד ב-server.js** — חיפוש של `.from('notifications')` מחזיר 0 תוצאות.
- **שלילי:** `rfq_recipients.delivered` נקבע מיידית לפי `sendResult.success` (שורה 310), אבל `sendResult.success` בכלל מציין `res.statusCode === 200` מ-Meta API, שזה רק "received by Meta" — לא "delivered to supplier".
- **שלילי:** אין תאריך עדכון אחרון (`updated_at`) ב-`rfq_recipients`.
- **שלילי:** אין תיעוד של ניסיונות שליחה חוזרים (אין `retry_count`).
- **שלילי:** אין `error_code` / `error_message` לתיעוד למה נכשל.

### Gap Critical
טבלת `notifications` יתומה. יש schema ואין writer. כנראה שיורי ארכיטקטורלי — נוצר ב-schema עם כוונה לעתיד אבל לא חובר לקוד.

---

## 10. Retry on Transient Failure

### מצב קיים
**אין שום retry.**

```js
// server.js:294-302
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
נכשל? מחזיר `success: false` ו**זהו**. אין:
- Exponential backoff
- Max retries
- Retry queue
- Retry schedule

### ממצאים
- Meta WhatsApp API יכולה להחזיר 429 (rate limit) — לא מטופל.
- שגיאות רשת (timeout, ECONNREFUSED) — לא מטופלות.
- אם Twilio / Meta זמנית למטה → ה-RFQ פשוט נכשל לנצח.

### סיכון
**CRITICAL** — הכשלים הזמניים (transient failures) הם הנפוצים ביותר בייצור. בלי retry, 5-10% מההודעות ייכשלו מסיבות שאפשר היה להתאושש מהן.

---

## 11. DLQ (Dead Letter Queue) for Permanently Failed

### מצב קיים
**אין DLQ.**

### ממצאים
- אין טבלת `notifications_dlq` / `failed_notifications`.
- אין alert ל-admin על הודעות שנכשלו.
- אין דשבורד של "הודעות שהתקועות / נכשלו".
- ההודעות הנכשלות "נעלמות" פנימה לתוך `rfq_recipients.delivered=false` ו-`rfq_recipients.status='sent'` (אגב — ערך מטעה; היה אמור להיות `'failed'`).

### בעיה נוספת
```js
// server.js:311-312
status: sendResult.success ? 'delivered' : 'sent',
```
אם נכשל → `status='sent'` (לא `'failed'`!). זה **מונע** את היכולת לאתר כשלים.

### סיכון
**HIGH** — הודעות נכשלות נבלעות שקטית. אין מי שיטפל בהן.

---

## 12. Notification Preview Before Send (Kobi Review)

### מצב קיים
**אין preview.**

### ממצאים
- `/api/rfq/send` מבנה את המסר וגם שולח אותו **בקריאה אחת** (server.js:262-276 בנייה → 289-321 שליחה).
- אין `dry_run` flag.
- אין שמירת "draft" לפני שליחה.
- אין `POST /api/rfq/:id/preview` נפרד מ-`POST /api/rfq/:id/send`.
- ב-`/api/purchase-orders/:id/send` (שורה 626) — אותה בעיה: בונה את ה-message string ושולח מייד.

### Gap
Kobi לא יכול "לראות" את המסר לפני שהוא יוצא. אם יש טעות בטקסט (שם ספק שגוי, מחיר שגוי) — אין איך להתערב.

### סיכון
**MEDIUM** — טעויות בתקשורת עם ספקים (שם לקוי, פרטים שגויים) יוצאות ישר לאוויר.

---

## 13. Bulk vs Individual Send

### מצב קיים
Bulk loop ב-`/api/rfq/send`:
```js
// server.js:289-321
for (const supplier of suppliers) {
  // ... sendWhatsApp / sendSMS לכל ספק ...
}
```

### ממצאים
- **חיובי:** אכן יש לולאה על ספקים.
- **שלילי:** **לולאה סדרתית** — `await` בתוך `for`, כל שליחה ממתינה לקודמת. 100 ספקים × 2 שניות = 200 שניות (סיכון timeout של ה-HTTP request).
- **שלילי:** אין `Promise.all` / מקבילות.
- **שלילי:** אין rate limiting — 50 WhatsApp ברצף עשוי להפעיל rate limit ב-Meta (80 msg/sec).
- **שלילי:** אם אחד נכשל, אחרים ממשיכים — חיובי במובן הזה. אבל אין aggregation חכם ("X/Y succeeded").
- **שלילי:** אין מצב "bulk send" לעומת "individual send" — כל שליחה היא תמיד כאילו bulk.
- **שלילי:** PO תמיד נשלח יחידני (single endpoint לא מקבל array).

### סיכון
**MEDIUM** — RFQ ל-50+ ספקים עלול להסתבך עם timeout של ה-HTTP request.

---

## 14. Scheduled Notifications (Cron-Based)

### מצב קיים
**אין שום cron / scheduled jobs.**

חיפוש של: `cron`, `setInterval`, `schedule`, `node-cron`, `agenda`, `bull`, `queue` — **אפס תוצאות**.

### ממצאים
- אין `node-cron` / `agenda` / `bull` בדרישות.
- אין endpoint `/cron/*` / `/jobs/*` / `/tasks/*`.
- `response_deadline` ב-`rfqs` (schema:118) — קיים, אבל **אין מי שבודק אותו**.
- `reminder_after_hours` (schema:120) — מוגדר אבל לא מופעל.
- `auto_close_on_deadline` (schema:122) — flag קיים אבל אין קוד שמפעיל אותו.
- `reminder_sent` (schema:138) — שדה קיים אבל אין מי שמעדכן.

### Gap Critical
**שדות רבים בסכמה שלא ממומשים בקוד**: כל מנגנון ה-reminder מוגדר ב-DB אבל אין cron worker שמריץ אותו. זהו "dead code in schema".

### סיכון
**HIGH** — RFQs "נשכחים" — deadline עובר ואין מי שיסגור, ספקים לא מקבלים תזכורות.

---

## 15. Event-Driven vs Polling-Driven

### מצב קיים
**המערכת Request-Response בלבד.**

### ממצאים
- כל notification נוצר **כתגובה לקריאת HTTP מהלקוח** (UI).
- טבלת `system_events` (schema:355-367) **כן קיימת** — אבל:
  - אין trigger שמפעיל פעולה כשאירוע נוצר.
  - אין event listener.
  - אין subscribe/publish.
  - אין message broker (Redis / RabbitMQ / Kafka).
- טבלת `audit_log` (schema:338-351) — כתיבה בלבד, אין subscribers.

### השלכות
- אין possibility של "כאשר quote נכנס → עדכן את ה-decision ציון אוטומטית".
- אין "כאשר PO מאושר → שלח אוטומטית לספק".
- הכול ידני: Kobi צריך לקרוא ל-API בכל שלב.

### מצב בפועל
```
User clicks button → /api/rfq/send → for supplier → sendWhatsApp → done
```
אין:
```
Scheduler → rfq.deadline_check → if expired → publish 'rfq.closed' event → subscribers handle
```

### סיכון
**MEDIUM-HIGH** — מגביל את היכולת להפוך את המערכת לאוטונומית.

---

## סיכום ממצאים לפי חומרה

| # | דימנשן | Severity | סטטוס |
|---|--------|----------|-------|
| 1 | Preferred channel per supplier | MEDIUM | חלקי (email לא ממומש) |
| 2 | Per-event-type preferences | **CRITICAL** | חסר, PO מתעלם מ-preferred_channel |
| 3 | Routing logic | MEDIUM | בסיסי, hardcoded |
| 4 | Fallback chain | **CRITICAL** | חסר לחלוטין |
| 5 | Quiet hours | HIGH | חסר לחלוטין |
| 6 | Israeli labor law | MEDIUM-HIGH | חסר לחלוטין |
| 7 | Deduplication | HIGH | חסר לחלוטין |
| 8 | Read receipts | MEDIUM | חסר (Meta status webhook לא מטופל) |
| 9 | Delivery status table | MEDIUM | `notifications` טבלה יתומה |
| 10 | Retry | **CRITICAL** | אין |
| 11 | DLQ | HIGH | אין, status='sent' מטעה |
| 12 | Preview | MEDIUM | אין |
| 13 | Bulk send | MEDIUM | לולאה סדרתית |
| 14 | Scheduled jobs | **CRITICAL** | אין cron, schema dead fields |
| 15 | Event-driven | MEDIUM-HIGH | Request-Response בלבד |

**CRITICAL count:** 4
**HIGH count:** 3
**MEDIUM+ count:** 8

---

## המלצות מיידיות (Top 10)

1. **[CRITICAL]** תקן באג ב-`/api/purchase-orders/:id/send` (שורה 664) — השתמש ב-`preferred_channel` של הספק, לא hardcoded WhatsApp.
2. **[CRITICAL]** הוסף retry עם exponential backoff (3 ניסיונות לפחות) לכל `sendWhatsApp` / `sendSMS`.
3. **[CRITICAL]** ממש fallback chain: WhatsApp → SMS → email → manual queue.
4. **[CRITICAL]** הוסף cron worker (node-cron) לטיפול ב-reminders, deadlines, auto-close.
5. **[HIGH]** הוסף בדיקת quiet hours: `getHours() < 7 || > 20 || shabbat` → queue for next morning.
6. **[HIGH]** הוסף idempotency key ל-`/api/purchase-orders/:id/send` ו-`/api/rfq/send`.
7. **[HIGH]** טפל ב-Meta WhatsApp `statuses` webhook (delivered / read / failed).
8. **[HIGH]** תקן `status='sent'` → `'failed'` כשנכשל (server.js:311).
9. **[MEDIUM]** הוסף `GET /api/rfq/:id/preview` ו-`GET /api/purchase-orders/:id/preview`.
10. **[MEDIUM]** שנה `for-await` ל-`Promise.allSettled` עם rate limiting.

---

## מה לא נבדק (Out of Scope)

- בדיקת ה-UI (אין לנו גישה ל-front-end).
- Integration test (static only).
- סביבת production metrics.
- בדיקת `.env` file (סטטי בלבד).

---

**סוף דוח QA-Agent-52**
