# QA Agent #19 — תכנית התאוששות מאסון (Disaster Recovery Plan)

**תאריך:** 2026-04-11
**היקף:** onyx-procurement (server.js, 001-supabase-schema.sql, SETUP-GUIDE-STEP-BY-STEP.md)
**ממד בדיקה:** Disaster Recovery Plan — יכולת המערכת לשרוד, להתאושש ולהמשיך לפעול באירוע כשל
**שיטה:** ניתוח סטטי בלבד. לא הורצו בדיקות חיות, לא בוצעו סימולציות של נפילה

---

## תקציר מנהלים

המערכת נבנתה לפי עיקרון **"אפס תכנון להתאוששות"**. אין תכנית DR בכלל — לא תיעוד, לא קוד, לא אוטומציה, לא runbook. זו אינה סוגיית **תיעוד** חסר — זו סוגיית **ארכיטקטורה** חסרה. כל מרכיב קריטי במערכת הוא נקודת כשל יחידה (SPOF) ללא גיבוי חם, ללא גיבוי קר, וללא נתיב הפעלה חלופי. במצב כשל אמיתי ב-3 לפנות בוקר (סינריו שצוין במפורש במשימה), קובי יהיה לבד, בלי מפת דרכים, בלי גיבויים, בלי איש קשר שיודע מה לעשות.

**הערכת מצב:** המערכת במצב **UNRECOVERABLE** לגבי כשלים משמעותיים. כשל בסיס נתונים ברמת region של Supabase = הפסד כל ההיסטוריה, כל ה-PO-ים, כל החלטות הרכש, כל נתוני הספקים.

---

## 1. RTO (Recovery Time Objective) — יעד זמן להתאוששות

### 1.1 מה הארכיטקטורה רומזת

**המסקנה מהקוד:** אין RTO מוגדר. אין גם תשתית שתתמוך ב-RTO מחמיר.

**ניתוח לפי שכבה:**

| שכבה | RTO אפקטיבי (לא מוגדר, אך משתמע) | הגורם |
|------|-----------------------------------|---------|
| **שרת Express (Replit)** | 5–60 דקות | תלוי ב-uptime של Replit. אין מופע שני, אין auto-restart מוגדר בקוד |
| **Supabase (בסיס נתונים)** | 4–24 שעות (במקרה הטוב) | תלוי לחלוטין ב-Supabase SLA. ב-tier חינמי — אין SLA. ב-tier Pro — best-effort בלבד |
| **Supabase disaster (region-wide)** | **∞ — המערכת לא ניתנת לשחזור** | אין גיבוי עצמאי, אין ייצוא מתוזמן, אין replica ב-region אחר |
| **WhatsApp Cloud API** | 0 (חיצוני) או ∞ (אין fallback) | אין רשת שנייה כגון Telegram, email, SMS אוטומטי |
| **Dashboard (React)** | 0 (אם מגיע ב-static) | לא רץ כ-backend, אך הוא **קשה-קוד** ל-`localhost:3100` (ראה B-02 ב-QA-WAVE1) — ולכן מתרסק ברגע שהשרת עובר לכתובת אחרת |

### 1.2 מסקנה (D-01)

**חומרה:** קריטי

אין RTO מוגדר. אין הסכם SLA עם ספקי השירות המזהים שהמערכת זקוקה ל-99.5% uptime. בסטארטאפ בשלב "הוצאה לאוויר" זה אולי סביר, אבל **קובי משתמש במערכת הזו לניהול רכש אמיתי של חברת טכנו כל עוזי בע"מ** — בקשות רכש אמיתיות, הזמנות רכש אמיתיות, מחירים אמיתיים. נפילה של יום אחד = אובדן חלונות זמן של אספקה לפרויקטים.

**המלצה:** להגדיר RTO רשמי — מוצע **RTO=4 שעות** למצב בו כל שכבה נכשלה, ו-**RTO=15 דקות** למצב בו רק השרת נפל (אם הדאטה שלמה).

---

## 2. RPO (Recovery Point Objective) — יעד אובדן נתונים מקסימלי

### 2.1 מה קיים היום

- אין תהליך גיבוי מתוזמן. אין `pg_dump` אוטומטי. אין export ל-S3, ל-Google Drive, ל-OneDrive.
- Supabase Pro מבצע PITR (Point-In-Time Recovery) ב-retention של 7 ימים — אבל **רק אם קובי משלם על tier Pro, ורק אם הוא יודע להפעיל את זה**. זה לא מוזכר ב-`SETUP-GUIDE-STEP-BY-STEP.md`. קובי עשוי להיות ב-Free tier בלי לדעת שאין לו PITR בכלל.
- ב-Free tier של Supabase — **אין שום גיבוי אוטומטי של בסיס הנתונים**. הנתונים יכולים להימחק ללא גיבוי.

### 2.2 אובדן audit_log

**D-02 — חומרה: גבוה**

קובץ `server.js:99-105` מכיל את פונקציית `audit()`. היא כותבת ל-`audit_log` דרך **fire-and-forget** ללא טיפול בשגיאות:

```js
async function audit(entityType, entityId, action, actor, detail, prev, next) {
  await supabase.from('audit_log').insert({
    entity_type: entityType, entity_id: entityId,
    action, actor, detail,
    previous_value: prev, new_value: next,
  });
}
```

אין `try/catch`. אין retry. אין dead-letter queue. אם Supabase לא זמין בזמן שהקריאה נעשית:
- ה-`await` יזרוק exception שלא נתפסת
- ה-HTTP response יקרוס ב-500
- אבל **הפעולה הקודמת שעליה הודיעו (update, insert, decide) כבר בוצעה ב-DB**
- ולכן ה-audit_log חסר רשומה שמעידה על פעולה שאכן קרתה

**השלכה:** חוסר עקביות בלוג הביקורת. ברגע של כשל, יש סיכוי גבוה שרשומות ל-PO-ים יהיו קיימות אבל audit_log ריק לגביהן — בדיוק הנקודה שבה קובי יזדקק להוכחה משפטית או לחיפוש סיבה לפעולה, ולא יהיה.

**המלצה:** לעטוף את `audit()` ב-try/catch, לכתוב לקובץ מקומי כ-fallback (`/tmp/audit-fallback.jsonl`), ולהעלות מהקובץ לאחר שהחיבור חזר.

### 2.3 RPO אפקטיבי

| סינריו | RPO (נתונים שיאבדו) |
|---------|---------------------|
| Supabase נפל לשעה (tier Pro עם PITR) | 0–5 דקות |
| Supabase נפל לשעה (tier Free) | **כל השעה האחרונה או כל הדאטה, תלוי מזל** |
| Supabase region disaster (כל ה-region ירד) | **∞ — כל הנתונים אבודים** |
| שרת Replit נפל | 0 (שום נתון לא מתפרסם מקומית) |
| WhatsApp Cloud API נפל | הודעות יוצאות אבודות, אבל הדאטה של ה-PO קיימת |

### 2.4 מסקנה

**D-03 — חומרה: קריטי**

אין RPO מוגדר. אין תיאור ב-SETUP-GUIDE על מה הוא יקבל מ-Supabase כ-default, ואין תיאור מה קורה אם הוא בתצורת Free.

**המלצה:** להוסיף ל-SETUP-GUIDE סעיף "מה קורה בכשל" — וליצור סקריפט קצר `backup.js` שרץ cron (או GitHub Action) ומוציא `pg_dump` ל-Google Drive/OneDrive פעם ביום.

---

## 3. נקודות כשל יחידות (Single Points of Failure)

### 3.1 מיפוי מלא של SPOFs

| רכיב | סוג הכשל | יש fallback? | הערה |
|------|-----------|---------------|-------|
| **Supabase project URL** (single project) | מלא | ❌ | כל הסכימה, הנתונים, ה-views, ה-triggers חיים במופע אחד |
| **Supabase region** (West EU – Ireland — לפי SETUP-GUIDE שלב 1.2) | region-wide outage | ❌ | אין multi-region replica. אירלנד מת = המערכת מתה |
| **Replit instance** (single repl) | pod restart/crash | חלקי | Replit עושה auto-restart, אבל אם הפרויקט מושהה מסיבה חיצונית (חיוב לא שולם, חשבון מושעה) — אין לאן לעבור |
| **WhatsApp Cloud API** (Meta Graph API) | rate limit / API outage | ❌ | יש קוד שלא משתמש (`sendSMS` דרך Twilio) אך לא מופעל כ-fallback. אם WhatsApp נופל, RFQs לא יוצאים |
| **`WHATSAPP_TOKEN`** (24h for dev, longer for prod) | פקיעת תוקף | ❌ | אין אזהרה לפני פקיעה. קובי יגלה רק כשהודעה תיכשל |
| **`WHATSAPP_PHONE_ID`** (single sender) | חסימת Meta | ❌ | אם Meta חוסם את המספר של קובי (על ספאם חשוד), אין מספר שני |
| **`SUPABASE_ANON_KEY`** | rotation/חילוף | ❌ | אין תהליך rotation מתועד |
| **משתמשים בפעולה** (קובי יחיד) | אדם אחד לא זמין | ❌ | אין שני משתמשים. אם קובי בחו"ל או חולה — אין מי שינהל כשל |

### 3.2 מסקנה

**D-04 — חומרה: קריטי**

כל רכיב במערכת הוא SPOF. המילה "fallback" לא מופיעה בקוד אפילו פעם אחת. קיים `sendSMS` אבל הוא מופעל רק כשה-`preferred_channel` של הספק מוגדר ל-`'sms'` — **הוא לא fallback ל-WhatsApp**. אם WhatsApp נופל, קוד השרת כותב `sendResult = { success: false }` וזהו — אין retry, אין ניסיון ב-SMS.

**המלצה:** ב-`/api/rfq/send` (server.js:289-321), להוסיף fallback שרשור:
```
WhatsApp fail → SMS (Twilio) → Email (SendGrid) → log to audit + alert
```

---

## 4. מה קורה בכשל של Supabase? האם יש degradation graceful?

### 4.1 ניתוח

הפעם התשובה פשוטה: **אין.**

**הוכחה מהקוד:**

- `server.js:111-122` — `GET /api/status` קורא ל-`supabase.from('procurement_dashboard').select('*').single()`. אם Supabase נפל — ה-`.single()` יזרוק שגיאה שלא נתפסת (ראה F-03 ב-QA-WAVE1-DIRECT-FINDINGS). התוצאה: 500 Internal Server Error, בלי הודעה ברורה למה.
- `server.js:130-136` — `GET /api/suppliers` — אותו דבר. כל endpoint תלוי ב-Supabase ללא cache מקומי, בלי מצב "read-only mode", בלי "offline mode".
- אין שירות מטמון (Redis, memory cache, sqlite fallback).
- אין circuit breaker.
- אין הודעת שגיאה תרגום לעברית למשתמש ("הבסיס נתונים לא זמין, נא לנסות בעוד דקה").

### 4.2 השלכות מעשיות

כשל של Supabase למשך 10 דקות = **10 דקות בהן המערכת כולה לא עובדת, ה-Dashboard ריק, כל בקשת API חוזרת 500, ואין כל אינדיקציה לקובי מה קורה**. הוא יפנה ל-שרת, ישלח `/api/status`, יקבל 500, ולא ידע אם זה בגלל השרת, או הרשת, או Supabase.

### 4.3 מסקנה

**D-05 — חומרה: גבוה**

אין graceful degradation. לא קיימת אפילו הודעת שגיאה ידידותית. בכשל של Supabase כל המערכת מגיבה עם 500.

**המלצות:**
1. להוסיף middleware לזיהוי שגיאת Supabase: `if (error?.code === 'PGRST' || error?.message?.includes('fetch failed')) return res.status(503).json({ error: 'בסיס הנתונים לא זמין כרגע. נא לנסות שוב בעוד מספר דקות.' })`.
2. להוסיף endpoint `/api/health` נפרד שבודק את כל התלויות (Supabase, WhatsApp, Twilio) ומחזיר status מסכם.
3. להטמיע cache in-memory לנתונים קריאים-בלבד כגון רשימת ספקים (TTL = 5 דקות), כדי שלפחות תצוגת הספקים תעבוד בזמן כשל קצר.

---

## 5. מה אם Replit קרס? האם אפשר להריץ מ-host אחר?

### 5.1 ניתוח — כן, בתיאוריה. לא — בפועל

**מה שעובד לטובתנו:**
- הקוד עצמו (server.js, package.json) פשוט וגרעיני. ניתן להעלות אותו לכל Node.js host תוך 10 דקות.
- `.env.example` מתעד את כל המשתנים הנדרשים.
- אין תלויות מערכת מורכבות (אין compilers, אין native modules).

**מה שעובד נגדנו:**
1. **Dashboard קשה-קוד ל-localhost:3100** (ראה B-02). כשקובי יעבור ל-host חלופי, הדשבורד לא יידע לדבר איתו אלא אם יעדכן ידנית את `const API` ב-`onyx-dashboard.jsx`.
2. **אין אוטומציה להעברה.** אין `Dockerfile`, אין `render.yaml`, אין `fly.toml`, אין `vercel.json`, אין `netlify.toml`, אין GitHub Actions deploy. קובי צריך ב-3 לפנות בוקר להעלות את הקוד ידנית לאן שהוא.
3. **אין תיעוד מה ה-host החלופי.** אין רשימה של "אם Replit נפל, לך ל-Fly.io/Render/Railway".
4. **אין מקום שמור למשתני סביבה.** ה-secrets יחיו רק ב-Replit. אם קובי לא שמר אותם ב-1Password או דומה, הוא חייב להגיע פיזית לחשבון Meta ול-Supabase ולחלץ מחדש.
5. **`WHATSAPP_VERIFY_TOKEN` קשור ל-webhook URL.** אם קובי יעבור ל-host אחר, ה-webhook URL ישתנה, והוא יצטרך לעדכן אותו ב-Meta Business Suite. זה מתועד בשום מקום.
6. **ה-hostname של WhatsApp webhook מוגדר ב-Meta.** שינוי host = שינוי webhook = מחייב re-verification. הוא לא יודע איך לעשות את זה.

### 5.2 מסקנה

**D-06 — חומרה: גבוה**

בתיאוריה, ניתן להריץ מ-host אחר. בפועל, **אין לקובי דרך מתועדת לעשות את זה ב-3 לפנות בוקר**. הוא אמור לזכור בעל פה: איך להתחבר ל-Render, איפה ה-secrets, איך לעדכן את הדשבורד, ואיך לעדכן את ה-webhook ב-Meta. זה לא מציאותי.

**המלצה:**
1. ליצור `DEPLOY.md` קצר עם השלבים להעברה ל-Render (free tier), כולל הקוד להעתיק את `.env`, והפקודות להריץ.
2. ליצור `.github/workflows/deploy.yml` פשוט שמפרוס ל-Render/Railway ב-push ל-`master`, כך שתמיד יש מקום חי שניתן להפעיל.
3. לעדכן את ה-dashboard להשתמש ב-`window.location.origin` או env var, כדי שיעבור עם השרת החדש ללא שינוי קוד.

---

## 6. היתכנות Multi-Region

### 6.1 ניתוח

**המצב הנוכחי:** הכל ב-West EU (Ireland) — לפי SETUP-GUIDE שלב 1.2. זו בחירה לגיטימית (קרוב לישראל, latency נמוך), אבל **יוצרת תלות מוחלטת באחד ה-data centers של AWS eu-west-1**.

**אם יש צורך ב-multi-region, מה נדרש?**

| רכיב | תמיכה ב-multi-region? |
|------|------------------------|
| Supabase | כן ברמת tier Enterprise בלבד (read replicas). Pro ומעלה לא. תקציב נדרש: ~$599/חודש |
| Replit | לא ברמת single app. צריך לפרוס ל-host נוסף (Render/Fly) במקביל |
| WhatsApp Cloud API | Meta מפעיל את זה, לא קובי. אין שליטה |
| הקוד | לא תומך. אין logic שמבחין בין primary/replica, אין failover handling |

### 6.2 מסקנה

**D-07 — חומרה: בינוני (לא קריטי בשלב הנוכחי)**

Multi-region לא ריאלי ב-tier הנוכחי מבחינת עלות. אבל **גיבוי ל-region שני של Supabase** (או תמיד: ייצוא יומי ל-Google Drive / GitHub repo פרטי) **הוא כן ריאלי וחייב להיות מיושם**.

**המלצה (פתרון דל-עלות):**
1. GitHub Action יומי שמריץ `pg_dump` מ-Supabase (דרך CLI או REST API) ושומר כ-artifact או commit ל-repo פרטי. עלות: $0.
2. לעת כשל: import מ-ה-dump ל-Supabase project חדש ב-region אחר. RPO = עד 24 שעות. RTO = שעה-שעתיים (לצ'ק-אין של הנתונים).
3. לתעד את התהליך ב-runbook (ראה סעיף 7).

---

## 7. קיום runbook לאירוע ב-3 לפנות בוקר

### 7.1 ממצא

**אין runbook. בכלל.**

ספר מלא:
- אין קובץ `RUNBOOK.md`
- אין קובץ `INCIDENT-RESPONSE.md`
- אין קובץ `DR-PLAYBOOK.md`
- אין סקשן ב-`SETUP-GUIDE-STEP-BY-STEP.md` שעוסק במה לעשות אם משהו נשבר
- קיים סעיף "אם משהו לא עובד" ב-SETUP-GUIDE (שורות 142-153), אבל הוא **טבלה של 7 שגיאות התקנה**, לא runbook של כשל

### 7.2 מה צריך להיות ב-runbook של 3 לפנות בוקר

**D-08 — חומרה: קריטי**

```
1. "המערכת לא מגיבה — מאיפה להתחיל?"
   - בדוק: https://status.supabase.com
   - בדוק: https://status.replit.com
   - בדוק: https://metastatus.com/whatsapp-api

2. "הדשבורד ריק אבל Supabase עובד — מה לבדוק?"
   - הפעל שוב את `npm start` ב-Replit shell
   - בדוק את הלוגים של Replit תחת "Console"
   - בדוק שה-`.env` עדיין מוגדר

3. "Supabase עצמו נפל — מה לעשות?"
   - חכה. אין מה לעשות חוץ מלחכות (כי אין replica).
   - הודע ללקוחות/משתמשים שהמערכת לא זמינה זמנית (ראה סעיף 8)
   - לאחר שחזור: ודא שלא אבדו רשומות (השווה מונים לפני/אחרי)

4. "המספר של WhatsApp לא שולח"
   - התחבר ל-business.facebook.com
   - בדוק ש-phone number status = active
   - בדוק ש-token לא פג (24h ב-dev)
   - לאחר תיקון: הפעל מחדש את השרת
```

אף אחד מהפרטים האלה לא קיים בשום מסמך. **אם קובי יתעורר ב-3 לפנות בוקר כי לקוח מתקשר על הזמנה דחופה — הוא יחפש במקום שיש לו (Google?) ולא יידע איפה להתחיל.**

**המלצה:** ליצור `RUNBOOK.md` קצר (עמוד אחד) עם ההוראות לעיל. לצרף צילומי מסך של ה-dashboards של Supabase/Replit/Meta, כדי שקובי יכיר את המראה של כל שירות בחירום.

---

## 8. תכנית תקשורת בזמן כשל

### 8.1 ניתוח

**אין.**

- אין רשימת אנשי קשר שיש להודיע להם ("מי צריך לדעת שהמערכת למטה?").
- אין template להודעת SMS/WhatsApp לספקים/לקוחות שמודיע שהמערכת זמנית לא זמינה.
- אין status page ציבורי (כגון Statuspage, Instatus).
- אין channel ב-Slack/Discord ל-real-time updates.
- אין Point of Contact מוגדר מצד Supabase/Replit/Meta (מי זה "ה-support שלנו"?).

### 8.2 שרשרת היודעי-המערכת

קובי = יחיד. אם הוא לא זמין:
- אין אדם שני שיודע איך לפתוח את הקוד
- אין אדם שני שיודע את ה-`SUPABASE_URL`
- אין אדם שני שיודע לאן לפנות ל-support

### 8.3 מסקנה

**D-09 — חומרה: גבוה**

**המלצות:**
1. רשימת "מי צריך לדעת":
   - קובי (בעלים, ראשי)
   - דימה (משתמש שוטף — כדי שיעצור להזין בקשות חדשות בזמן כשל)
   - 2 ספקים מרכזיים (כדי שיידעו שהזמנה דחופה תגיע דרך טלפון ישיר ולא דרך WhatsApp)
2. תבנית הודעת WhatsApp בעברית (לשימוש ידני מטלפון אחר):
   > "שלום, מערכת הרכש של טכנו כל עוזי בתחזוקה קצרה. הזמנות חדשות — אנא התקשרו ישירות ל-[מספר קובי]. נעדכן בסיום."
3. להגדיר הגדרה ב-`.env`:
   ```
   INCIDENT_NOTIFY_PHONES=+972501234567,+972521234567
   INCIDENT_NOTIFY_EMAILS=kobi@example.com
   ```
   ובקוד להוסיף סקריפט `npm run incident-notify` שמנסה לשלוח SMS/WhatsApp לרשימת הנמענים.

---

## סיכום ממצאים — Disaster Recovery

| ID | נושא | חומרה | תיקון |
|----|------|--------|--------|
| **D-01** | אין RTO מוגדר | קריטי | להגדיר RTO רשמי + SLA |
| **D-02** | `audit()` fire-and-forget בלי טיפול בשגיאות | גבוה | try/catch + fallback לקובץ |
| **D-03** | אין RPO מוגדר. אין גיבוי יומי מתוזמן | קריטי | GitHub Action יומי ל-`pg_dump` |
| **D-04** | כל רכיב הוא SPOF, בלי fallback chain | קריטי | WhatsApp → SMS → Email fallback |
| **D-05** | כשל Supabase → 500 גלובלי, בלי degradation | גבוה | middleware 503 + cache קריאות |
| **D-06** | אין דרך מתועדת להעברת host בחירום | גבוה | `DEPLOY.md` + GitHub Actions workflow |
| **D-07** | אין גיבוי multi-region (אפילו לא גיבוי קר) | בינוני | ייצוא יומי ל-repo פרטי |
| **D-08** | אין runbook ל-3 לפנות בוקר | קריטי | `RUNBOOK.md` עמוד אחד + צילומי מסך |
| **D-09** | אין תכנית תקשורת בזמן כשל | גבוה | רשימת אנשי קשר + template WhatsApp |

**סה"כ:** 4 קריטיים, 4 גבוהים, 1 בינוני.

---

## המלצה סופית

לפני ש-onyx-procurement עובר להיות המערכת העיקרית של טכנו כל עוזי בע"מ לניהול רכש של פרויקטים אמיתיים, **חייבים להטמיע לפחות את המינימום הבא**:

1. **D-03** (גיבוי יומי אוטומטי) — **קריטי מעל כולם**. בלי גיבוי אוטומטי, אירוע disaster יחיד מוחק את כל החברה. GitHub Action + `pg_dump` — שעת עבודה.
2. **D-08** (runbook של עמוד אחד) — ההפרש בין שעה downtime ל-6 שעות downtime. שעתיים עבודה לכתיבה + צילומי מסך.
3. **D-02** (audit log עמיד) — כי audit log הוא הקו האחרון של הגנה משפטית. חצי שעה עבודה.
4. **D-05** (middleware 503 להודעת שגיאה) — כדי שקובי ידע מיד שזה Supabase ולא הקוד שלו. 15 דקות עבודה.

**סה"כ השקעה להעלאת המערכת לרמה מינימלית של DR-readiness:** 4–5 שעות עבודה של מתכנת אחד. זה הרבה פחות מהערך של שיחה אחת עם לקוח שאומר "איפה ההזמנה שלי?" בזמן שהמערכת בכשל ואין מה לעשות.
