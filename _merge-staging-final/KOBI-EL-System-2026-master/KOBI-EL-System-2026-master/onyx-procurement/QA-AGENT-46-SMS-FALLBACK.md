# QA Agent #46 — SMS Fallback Reliability (Twilio)

מימד QA: **אמינות Fallback ל-SMS דרך Twilio**
פרויקט: `onyx-procurement`
מתודולוגיה: Static analysis בלבד (ללא הרצה).
קבצים שנסרקו: `server.js` (930 שורות), `package.json`, `.env.example`.
אזכור מקדים: ממצאים חופפים בלבד ב-QA-19/23/24/29 — כאן ננתח לעומק את **המנגנון עצמו**, לא עלויות/DR/הצפנה.

---

## ממצא ראשי (TL;DR)

המערכת **מצהירה** על קיום ערוץ SMS דרך Twilio (פונקציה `sendSMS` ב-`server.js:71-93`), אבל בפועל **אין שום מנגנון Fallback אמיתי**. הפונקציה נקראת **רק** כשבעל הרשומה ב-DB הגדיר `preferred_channel='sms'` מראש (`server.js:297`). אם WhatsApp נכשל, לא מתבצע ניסיון חוזר ב-SMS — הקוד פשוט רושם `{ success: false }` וממשיך.

כל 13 הנקודות להלן מקיפות את הפער בין הצהרה לבין מימוש.

---

## 1. שאלה: האם Twilio משולב או רק WhatsApp?

**ממצא SMS-46-01 — [HIGH]** — אינטגרציית Twilio **חלקית ודקה להחריד**:

- `package.json` **לא כולל** את חבילת `twilio` הרשמית. הקריאה מתבצעת ישירות דרך `https.request` אל `api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json` (server.js:78-91).
- **יתרון:** אין תלות נוספת, אין supply-chain risk.
- **חיסרון:** אין validation, אין retry built-in, אין SDK features (Messaging Service, Scheduled, Content API).
- `/api/status` ב-`server.js:111-122` **לא מדווח** על סטטוס Twilio — רק על WhatsApp ו-Supabase. אופרטור לא יכול לדעת אם Twilio פעיל.
- בהודעת ההפעלה (`server.js:917`) מוצג רק "WhatsApp: ✅/❌" — לא Twilio.

**מסקנה:** Twilio קיים כ-stub קוד ולא כ-integration production-ready.

---

## 2. שאלה: תנאי הפעלת ה-Fallback (האם בשל שגיאת HTTP ב-WhatsApp?)

**ממצא SMS-46-02 — [CRITICAL] — אין Fallback אמיתי**

הלוגיקה היחידה בשליחת RFQ (`server.js:289-302`):

```js
const channel = supplier.preferred_channel || 'whatsapp';
...
if (channel === 'whatsapp' && WA_TOKEN) {
  sendResult = await sendWhatsApp(address, messageText);
} else if (channel === 'sms') {
  sendResult = await sendSMS(address, messageText);
}
```

פערים:

1. **זו בחירה (election), לא נפילה (fallback).** הבחירה היא **סטטית** — נקבעת בשדה `preferred_channel` בטבלת `suppliers`. אם WhatsApp נופל ב-HTTP 500, הקוד **לא** עובר ל-SMS.
2. אין `if (!sendResult.success) sendResult = await sendSMS(...)` — **לא קיים** בקוד.
3. גם ב-`POST /api/purchase-orders/:id/send` (`server.js:660-664`) — שליחת PO מתבצעת דרך WhatsApp בלבד. אין בחירת ערוץ, אין Fallback.
4. אין בדיקת `statusCode` של Meta Graph API — הקוד מסתפק ב-`res.statusCode === 200` אבל לא מפעיל Fallback על 400/429/503.

**המלצה:** יש לעטוף את השליחה ב:
```js
async function sendWithFallback(supplier, message) {
  const wa = await sendWhatsApp(supplier.whatsapp || supplier.phone, message);
  if (wa.success) return { via: 'whatsapp', ...wa };
  const sms = await sendSMS(supplier.phone, message);
  if (sms.success) return { via: 'sms', ...sms };
  return { via: 'failed', wa, sms };
}
```

---

## 3. שאלה: קידוד SMS עברי (UCS-2 — 70 תווים/segment, לא GSM-7 160)

**ממצא SMS-46-03 — [CRITICAL]** — פתיחה מלאה לכשל שקט בסגמנטציה.

הודעת ה-RFQ (`server.js:262-276`) היא מקטע **מלא עברית** עם מבנה multi-line:
```
שלום רב,

חברת טכנו כל עוזי בע"מ מבקשת הצעת מחיר:

1. {שם מוצר} — {כמות} {יח'}
   מפרט: {מפרט}
...
מספר בקשה: RFQ-XXXX
דדליין: 11.04.2026 14:30
נא לציין: מחיר ליחידה, סה"כ, משלוח, זמן אספקה, תנאי תשלום.

בברכה, טכנו כל עוזי בע"מ
```

- עברית → Twilio מקודד אוטומטית ב-**UCS-2**, שבו segment = **70 תווים** (לא 160 של GSM-7).
- הודעה טיפוסית כפי שמוצגת כוללת כ-220-350 תווים → **4-5 segments**.
- כל segment = חיוב נפרד (~$0.075 לישראל ×5 = $0.375 להודעה). סביר בקנה מידה של 20 ספקים = ~$7.5 לRFQ.
- **אין בדיקת אורך לפני שליחה** בקוד. אין חישוב segments. אין אזהרה לאופרטור.
- **אין truncation ב-URL-encoded form** (server.js:76) — משלח את כל הטקסט ל-Twilio ללא קיטוע.
- מאחר שהודעה ארוכה עם תוים כמו `—` (em-dash), `"` (double-quote יוניקוד) ו-`׳` — כולם מחייבים UCS-2 גם ללא עברית.
- אם Twilio חתך ב-1600 תווים (מגבלת הHTTP POST), חלק מההודעה **ייעלם בשקט** והספק יקבל RFQ חתוך ללא מספר בקשה/דדליין.

**המלצה:**
```js
function gsmSafe(text) {
  return /^[\x00-\x7F\u00a0-\u00ff]*$/.test(text); // not a real GSM check
}
function segments(text) {
  const unicode = !gsmSafe(text) || /[^\u0000-\u007F]/.test(text);
  return Math.ceil(text.length / (unicode ? 67 : 153)); // 70-3 / 160-7 for concat UDH
}
```
ובסוף `sendSMS` להכניס לוג של `segments` ל-`audit`.

---

## 4. שאלה: כללי Sender ID ישראליים (Alphanumeric vs short code)

**ממצא SMS-46-04 — [HIGH]** — אין תמיכה ב-Alphanumeric ID.

- הקוד (`server.js:76`) מעביר `From=${process.env.TWILIO_FROM}` — מספר בודד.
- רגולציה ישראלית (משרד התקשורת, 2019): ספקי SMS אסור להתחזות — Alphanumeric Sender ID חייב **רישום מראש** אצל הספק הסלולרי הישראלי.
- Twilio **לא תומך ב-Alphanumeric בישראל** (נכון ל-Twilio docs; ישראל ב-tier "Unsupported alphanumeric, long-code only").
- לכן `TWILIO_FROM` חייב להיות:
  - **Long-code ישראלי** (+972...) — אבל Twilio *לא מציע* long-code ישראלי rented.
  - **Toll-free US** — חלק מה-SMS לישראל נחסם.
  - **Short code שרכש הלקוח** — יקר (>$1000/חודש).
- `.env.example:17` — `# TWILIO_FROM=` — ריק, ללא הנחיה על פורמט.

**הפער הקריטי:** אם מישהו יגדיר `TWILIO_FROM=ONYX` (חשב שזה מותג), ה-API של Twilio יחזיר 400 והקוד **לא מטפל** בזה באופן גלוי — רק רושם ב-DB `status='sent'` גם כששגה (ראה ממצא SMS-46-06).

---

## 5. שאלה: Twilio Messaging Service vs raw From number

**ממצא SMS-46-05 — [MEDIUM]** — השימוש ב-raw `From` בלבד, ללא Messaging Service.

- הקוד קורא ל-`Messages.json` עם `From=...` ישיר.
- Twilio ממליץ ב-`Messaging Service SID` (`MG...`) כי זה מספק:
  - Sender pool (מספרים מרובים) — מקטין rate-limiting.
  - Geomatch / Geo-permissions אוטומטיים — שחיתה קריטית למדינות עם regulation.
  - Advanced Opt-Out — compliance עם STOP/HELP.
  - Retry ו-Smart Encoding אוטומטי.
  - Fallback של sender אם אחד נופל.
- הקוד **לא תומך** ב-`MessagingServiceSid` כ-alt לשדה `From`.

**המלצה:** להוסיף לוגיקה:
```js
const senderField = process.env.TWILIO_MESSAGING_SERVICE_SID
  ? `MessagingServiceSid=${process.env.TWILIO_MESSAGING_SERVICE_SID}`
  : `From=${encodeURIComponent(process.env.TWILIO_FROM)}`;
```

---

## 6. שאלה: האם מטופלים Delivery Receipts (DLR)?

**ממצא SMS-46-06 — [HIGH]** — אין webhook DLR, אין verification.

- הקוד ב-`server.js:87`:
  ```js
  res.on('end', () => resolve({ success: res.statusCode === 201, data: JSON.parse(body) }));
  ```
  בודק רק status 201 (accepted) — שזה **רק קבלה ב-Twilio**, לא Delivery.
- Twilio מחזיר את רשומת ה-Message עם `status: queued/accepted` בתחילה. ה-status האמיתי (`delivered`/`failed`/`undelivered`) מגיע דרך **webhook callback** לשדה `StatusCallback`.
- הקוד **לא מעביר** `StatusCallback` ב-form data.
- אין endpoint כמו `/webhook/twilio/status` — בזמן שקיים `/webhook/whatsapp` (שורה 876).
- התוצאה: טבלת `rfq_recipients` מסמנת `delivered=true` כבר כשה-SMS רק הוכנס לתור Twilio — **שקר לאופרטור**.

**המלצה:**
1. להוסיף `StatusCallback=${BASE_URL}/webhook/twilio/status` ל-form data.
2. ליצור endpoint שמקבל POST מ-Twilio ומעדכן `rfq_recipients.delivered` לפי `MessageStatus`.
3. לשמור את `sid` שחוזר מ-Twilio ב-`rfq_recipients.external_message_id`.

---

## 7. שאלה: עלות SMS לישראל (~$0.075)

**ממצא SMS-46-07 — [MEDIUM]** — אין הגנה מפני blow-up עלות.

- Twilio SMS לישראל: בערך $0.0745/segment (נכון 2026, MNO-dependent).
- כפי שהודגם בסעיף 3: RFQ טיפוסי = 4-5 segments → ~$0.30-$0.375 להודעה.
- אם RFQ נשלח ל-20 ספקים ב-SMS: ~$7.50 לRFQ.
- הקוד **לא מגביל** מספר ספקים ב-RFQ. לולאה `for (const supplier of suppliers)` (server.js:289) פעילה ללא capping.
- **אין בדיקת יומית** — אם באג גורם ללולאה אינסופית (נאמר, bug ב-pagination של `supplier_products`), אפשר לשרוף $100+ בדקות.
- אין `RATE_LIMIT_SMS_PER_DAY`, אין counter ב-Supabase.

**המלצה:** להוסיף counter ב-Supabase, למשל `sms_sent_today` ב-`system_metrics`, ובתוך `sendSMS` לעשות:
```js
if (counter >= DAILY_LIMIT) return { success: false, reason: 'daily_limit' };
```

---

## 8. שאלה: מניעת Loop אם Twilio גם נופל

**ממצא SMS-46-08 — [LOW]** — לא רלוונטי כרגע כי אין Fallback, אבל חייב לתכנן מראש.

- מאחר שאין Fallback WhatsApp→SMS (ממצא SMS-46-02), אין סכנה של loop.
- **אך** אם יתווסף Fallback ולא ישים לב:
  - `sendSMS` נכשל → אולי מישהו יוסיף `await sendWhatsApp(...)` בתור "reverse fallback" → infinite loop.
  - אם webhook של Twilio (כשיתווסף) יקרא ל-`sendSMS` שוב בעת סטטוס "failed" → recursion.
- אין מגבלת `MAX_FALLBACK_ATTEMPTS` במשתני סביבה.

**המלצה:** לקבוע constant:
```js
const MAX_DELIVERY_ATTEMPTS = 2; // WhatsApp + SMS, no more
```
ולוודא שכל ניסיון מתועד ב-`rfq_recipients` עם `attempt_number`.

---

## 9. שאלה: ציות STOP keyword

**ממצא SMS-46-09 — [CRITICAL]** — **אין כל תמיכה ב-STOP/UNSUBSCRIBE**.

- רגולציה:
  - **TCPA (US)** — דורש טיפול אוטומטי ב-STOP/HELP.
  - **ישראל — חוק הספאם (תיקון 40, 2008)** — דורש opt-out ב-SMS מסחרי.
  - **Twilio Advanced Opt-Out** (דרך Messaging Service) מטפל אוטומטית ב-STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT.
- הקוד **לא משתמש** ב-Messaging Service (ממצא SMS-46-05), לכן Advanced Opt-Out **אינו פעיל**.
- הקוד **לא** כולל endpoint webhook לקלוט תגובה `STOP` מספק.
- טבלת `suppliers` אינה כוללת עמודה `sms_opted_out` או `unsubscribed_at`.
- ברמה הלוגית: `sendSMS` **לא** בודק אם הנמען סימן opt-out.
- טקסט ה-RFQ **אינו כולל** הוראות STOP — בעוד Twilio דורש "Reply STOP to unsubscribe" בהודעה ראשונה לפי MNO regulations.

**חשיפה משפטית:** שליחת SMS חוזר לספק שהשיב STOP = **הפרת חוק**. בישראל — קנס עד ₪1,000/הודעה.

**המלצה:**
1. להוסיף עמודה `suppliers.sms_opt_out_at TIMESTAMP NULL`.
2. הוספת guard ב-`sendSMS`: `if (supplier.sms_opt_out_at) return { success: false, reason: 'opted_out' }`.
3. יצירת `/webhook/twilio/incoming` שמטפל ב-STOP/UNSUBSCRIBE (וגם בעברית: "הסר", "הסרה", "בטל").
4. הוספה לסוף כל הודעת SMS: `\n\nלהסרה השב STOP`.

---

## 10. שאלה: נרמול פורמט מספר (+972 מול 0)

**ממצא SMS-46-10 — [HIGH]** — אין נרמול ב-`sendSMS`, רק חיטוי חלקי ב-`sendWhatsApp`.

- `sendWhatsApp` (server.js:40) עושה: `to.replace(/[^0-9+]/g, '')` — מסיר רק תווים לא-ספרתיים/`+`.
- `sendSMS` (server.js:76): `To=${encodeURIComponent(to)}` — **ללא שום נרמול**. מכניס את המספר כפי שהוא מה-DB.
- תרחישים אפשריים ב-DB:
  - `054-1234567` → Twilio יחזיר שגיאה (דש לא חוקי).
  - `0541234567` → Twilio **יחשוב** שזה US area code 541 → ייכשל או יישלח למקום הלא נכון!
  - `+972541234567` — תקין.
  - `972-54-1234567` — Twilio עלול לטעון שזה פורמט E.164 בצורה חלקית.
- **אין פונקציית `normalizeIsraeliPhone`** בקוד.

**המלצה:** פונקציית עזר:
```js
function normalizeIL(phone) {
  const digits = String(phone).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('972')) return '+' + digits;
  if (digits.startsWith('0')) return '+972' + digits.slice(1);
  return '+972' + digits;
}
```
ולהפעיל גם ב-`sendWhatsApp` וגם ב-`sendSMS`.

---

## 11. שאלה: הפרדה בין credentials של Test mode

**ממצא SMS-46-11 — [MEDIUM]** — אין הפרדה סביבתית.

- `.env.example:14-17`:
  ```
  # Twilio SMS (optional)
  # TWILIO_SID=
  # TWILIO_AUTH_TOKEN=
  # TWILIO_FROM=
  ```
- משתנה בודד `TWILIO_SID` — **אין** `TWILIO_TEST_SID` / `TWILIO_LIVE_SID` / `NODE_ENV`-based switch.
- Twilio מספק **Test credentials** (SID מתחיל ב-`AC` ואחריו `xxxxxxxx...` כפי שמסופק ב-Account page).
- עם Test credentials:
  - ל-Twilio SID שמתחיל ב-`AC` עם Auth token של testing — ההודעות **לא נשלחות בפועל**, אבל ה-API מחזיר 201 רגיל.
  - מאפשר לבדוק את ה-flow בלי עלויות.
- **בקוד כיום**: אם דוחפים את הכתובות של production לסביבת dev, **משלמים אמיתי**.
- אין `if (process.env.NODE_ENV === 'development') ...` בכלל בקובץ.

**המלצה:**
```js
const twilioSid = process.env.NODE_ENV === 'production'
  ? process.env.TWILIO_SID
  : process.env.TWILIO_TEST_SID || process.env.TWILIO_SID;
```

---

## 12. שאלה: מדיניות Retry לכשלים Transient

**ממצא SMS-46-12 — [HIGH]** — אין Retry בכלל.

- `sendSMS` (server.js:71-93): ניסיון **יחיד**, resolve יחיד.
- אין `while`, אין `setTimeout`, אין exponential backoff.
- אין טיפול ב:
  - `429 Too Many Requests` — כולל `Retry-After` header של Twilio.
  - `503 Service Unavailable` — flap זמני של Twilio.
  - `ECONNRESET` / `ETIMEDOUT` — network transient.
- פונקציית `req.on('error', reject)` (server.js:89) זורקת שגיאה ישירה ללא retry.
- ב-`POST /api/rfq/send` (server.js:294-302) יש `try/catch` אבל הוא רק **בולע** את השגיאה:
  ```js
  catch (err) {
    sendResult = { success: false, error: err.message };
  }
  ```
  — אין ניסיון חוזר, אין שמירה לתור אחורי, אין alert.

**המלצה:**
```js
async function sendSMSWithRetry(to, message, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await sendSMS(to, message);
      if (res.success) return res;
      if (res.data?.code >= 20000 && res.data?.code < 30000) return res; // permanent error, don't retry
    } catch (e) { /* network error, do retry */ }
    await new Promise(r => setTimeout(r, 2 ** i * 1000)); // 1s, 2s, 4s
  }
  return { success: false, reason: 'retries_exhausted' };
}
```

---

## 13. שאלה: התמדת התור (in-memory vs Supabase row)

**ממצא SMS-46-13 — [CRITICAL]** — אין תור בכלל, הכל in-memory transient.

- הלולאה ב-`server.js:289-321` (`for (const supplier of suppliers)`) היא **sequential inline** — אין job queue, אין persistence.
- אם התהליך (node process) קורס ב-middle of loop:
  - חלק מהספקים קיבלו RFQ.
  - חלק לא.
  - ב-DB, `rfq_recipients` מציג חלקית — אין `status='pending'` שמצביע על `not_attempted`.
- אין טבלת `sms_queue` / `outbox` / `jobs`.
- אין שימוש ב-`pg_notify`, BullMQ, או `node-cron`.
- **מניעת idempotency:** אם אותו RFQ נשלח שוב (למשל לחיצה כפולה של אופרטור), הקוד יוצר RFQ **חדש** עם rfqId חדש (`RFQ-${Date.now().toString(36)}`) — הספק מקבל **שתי** הודעות.
- אין `idempotency_key` ב-request body.

**חשיפה תפעולית:** בזמן crash באמצע שליחה:
- ב-DB: `rfqs` עם `status='sent'` אבל רק 3/20 `rfq_recipients` רשומים.
- בפועל: 5/20 ספקים קיבלו SMS (2 נשלחו לפני crash ולא נרשמו ב-DB).
- אחרי restart: אי אפשר לשחזר אילו שליחות הצליחו.

**המלצה:**
1. ליצור טבלה `message_outbox (id, recipient, channel, body, status, attempts, scheduled_at, sent_at, idempotency_key)`.
2. החלפת הלולאה המיידית ב-`INSERT INTO message_outbox` (atomic).
3. Worker נפרד (setInterval או cron) שקורא שורות `pending` ושולח.
4. עמודת `idempotency_key = hash(rfq_id + supplier_id)` עם UNIQUE constraint — מונע כפילויות.

---

## סיכום ממצאים לפי חומרה

| ID | ממצא | חומרה |
|----|------|-------|
| SMS-46-01 | Twilio stub ולא SDK | HIGH |
| SMS-46-02 | **אין Fallback אמיתי WhatsApp→SMS** | **CRITICAL** |
| SMS-46-03 | אין טיפול ב-UCS-2 segmentation לעברית | **CRITICAL** |
| SMS-46-04 | אין תמיכה ב-Alphanumeric + אין guard ל-TWILIO_FROM | HIGH |
| SMS-46-05 | אין Messaging Service — מפספס Opt-Out אוטומטי | MEDIUM |
| SMS-46-06 | אין Delivery Receipts / StatusCallback | HIGH |
| SMS-46-07 | אין cost guardrails / daily limit | MEDIUM |
| SMS-46-08 | אין MAX_FALLBACK_ATTEMPTS (preventive) | LOW |
| SMS-46-09 | **אין STOP/opt-out — חשיפה משפטית** | **CRITICAL** |
| SMS-46-10 | אין נרמול מספר ישראלי | HIGH |
| SMS-46-11 | אין הפרדה Test vs Live credentials | MEDIUM |
| SMS-46-12 | אין Retry policy | HIGH |
| SMS-46-13 | **אין Queue persistence — at-least-once לא מובטח** | **CRITICAL** |

**סה"כ:** 4 CRITICAL, 5 HIGH, 3 MEDIUM, 1 LOW = **13 ממצאים**.

---

## המלצת פעולה מינימלית (MVP Fallback Safety)

לפני שמפעילים את הערוץ בפועל, הכרחי לטפל לפחות ב:

1. **SMS-46-02** — להחליף את הבחירה הסטטית בלולאת Fallback.
2. **SMS-46-09** — הוספת STOP handling וגיבוי opt-out ב-DB.
3. **SMS-46-03** — חישוב segments וlogging לעלות.
4. **SMS-46-10** — נרמול E.164 ישראלי.
5. **SMS-46-13** — טבלת outbox עם idempotency.

שאר הממצאים — אחרי שה-MVP עובד.

---

**QA Agent #46 — SMS Fallback Reliability — סיום דוח.**
נכתב: 2026-04-11.
