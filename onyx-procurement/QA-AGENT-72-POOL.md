# QA Agent #72 — Connection Pooling

**פרויקט:** onyx-procurement
**תאריך:** 2026-04-11
**סוג בדיקה:** Static analysis only
**ממד (Dimension):** Connection Pooling
**קבצים שנבדקו:**
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\server.js` (934 שורות)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\package.json`

---

## תקציר מנהלים (Executive Summary)

הפרויקט משתמש ב-`@supabase/supabase-js` בצורה **נכונה מבחינת pooling**: Singleton מודול-level יחיד
(שורות 23-26 של `server.js`), המשותף לכל ה-28 נקודות הקצה. ה-client של Supabase הוא ספציפית client
של PostgREST מעל HTTPS (keep-alive, לא TCP ישיר ל-Postgres), ולכן **אין סיכון של socket exhaustion
ל-Postgres**. הסיכון היחיד שנותר הוא עומס של חיבורי PostgREST במקרה של concurrency גבוה. עבור
Replit single-instance, ההגדרה הנוכחית מספיקה — אך חסרה קונפיגורציה מפורשת לניהול משאבים וחוסן.

**דירוג כללי:** PASS with observations (4/5).

---

## 1. אתחול ה-Supabase Client — Singleton או per-request?

### ממצא: ✅ **Singleton ברמת המודול (Module-level singleton)**

הקוד ב-`server.js` שורות 22-26:

```js
// ═══ SUPABASE CLIENT ═══
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
```

**ניתוח:**
- `createClient` נקרא **פעם אחת בלבד** בזמן טעינת המודול.
- המשתנה `supabase` מוגדר כ-`const` בסקופ המודול (top-level).
- כל 28 הנקודות קצה (שורות 100-888) משתמשות באותו אובייקט `supabase` דרך closure.
- **אין שום קריאה חוזרת** ל-`createClient` באף handler של route, middleware, או helper.
- `require('@supabase/supabase-js')` נקרא רק פעם אחת בשורה 13.

**הערכה:** דפוס עבודה נכון לחלוטין. זו הדרך המומלצת ב-Supabase JS SDK לפרויקטי backend.

**ציון:** 10/10 — singleton pattern implemented correctly.

---

## 2. מצב חיבור — Pooled vs Direct

### ממצא: ⚠️ **Supabase JS לא מתחבר ישירות ל-Postgres**

**הבהרה קריטית:** `@supabase/supabase-js` הוא SDK שעובד מעל **PostgREST על HTTPS** (לא `pg` / `libpq`
ישיר). אין כאן TCP pool ל-Postgres, אין pgBouncer, אין שרת DB פתוח ל-socket ישיר.

**מסלול הקריאה:**
```
Express route handler
  → supabase.from('...')
  → PostgREST JSON API (HTTPS POST/GET)
  → Supabase edge gateway
  → PgBouncer / Pooler (מנוהל ע"י Supabase, Transaction mode)
  → Postgres
```

**משמעויות:**
- ה-PgBouncer מנוהל **בצד השרת של Supabase**, לא בצד הלקוח.
- ברירת המחדל של Supabase היא **Transaction pooling mode** בפורט 6543.
- אין שום דרך בקוד הנוכחי לבחור "direct" כי `supabase-js` אינו מנהל חיבורי TCP כלל.
- הגדרת משתני הסביבה `SUPABASE_URL` + `SUPABASE_ANON_KEY` (שורות 24-25) מפנות אל PostgREST (פורט
  443 / HTTPS), לא אל Postgres ישיר.

**מה עובד כראוי:**
- ה-keep-alive של HTTPS connection ל-PostgREST מאפשר שימוש חוזר בחיבור TCP יחיד.
- מאחר שזו HTTP over keep-alive, מדובר ב-multiplexing רך (לא pooling במובן PG הקלאסי).

**הערות להעברה לפרודקשן:**
- אם בעתיד ישוחזר Postgres ישיר (למשל ל-BI / דוחות), **חובה** לעבור ל-`pg` עם `Pool` מפורש
  ו-`pgBouncer` ב-transaction mode.
- עבור workload נוכחי (כולו PostgREST), אין צורך.

**ציון:** 9/10 — המצב נכון, אך חסר תיעוד מפורש על הבחירה האדריכלית.

---

## 3. סיכון לסוקט-exhaustion לכל request

### ממצא: ✅ **סיכון נמוך עד זניח**

מכיוון ש-`supabase-js` משתמש ב-`fetch` (או ב-node http) עם keep-alive default, ה-behavior הוא:

| מצב | תוצאה |
|-----|-------|
| יצירת `supabase` פעם אחת (כמו כאן) | שיתוף keep-alive agent בין בקשות |
| יצירת `createClient` בכל request (❌ אין) | agent חדש כל פעם, דליפת sockets |
| שימוש ב-`require` inside handler | זיהום של ES module cache, אך לא חיבורים |

**בדיקה ידנית של כל 28 ה-handlers (שורות 100-900):**
- ✅ **כולם** משתמשים ב-`supabase` מה-scope העליון.
- ✅ **אין** קריאה אחת ל-`createClient` מתוך handler.
- ✅ **אין** יצירה דינמית של client לפי request headers / tenant / וכד'.

**מה יכול להיכשל בכל זאת?**
- אם Supabase Gateway יגדיר rate-limit לפי IP ויהיו burst של >500 req/sec, ייתכנו `429 Too Many
  Requests`. זה **לא socket exhaustion**, אלא rate-limit.
- אם fetch ב-node ייפלט בטעות (למשל `undici` global dispatcher עם `maxConnections` קטן), ייתכן
  queuing. לא ראיתי הגדרה כזו בקוד.

**ציון:** 9/10 — מוגן מפני socket exhaustion, אך אין הגבלה/גיבוי מפורש.

---

## 4. טיפול ב-concurrent requests

### ממצא: ✅ **Express single-process עובד היטב עם Supabase singleton**

**ניתוח concurrency:**
- Express ב-Node.js הוא single-threaded עם event loop. כל בקשה רצה על אותו process.
- ה-`supabase` object הוא immutable אחרי יצירתו — אין state משותף שזקוק ל-lock.
- כל קריאה ל-`supabase.from(...)` יוצרת **query builder חדש** (immutable per call). לכן **race
  conditions לא אפשריות** ברמת ה-client.
- ב-`async/await` של כל handler: אין `await` משותף לאותו שדה mutable.

**עומס צפוי (מההערכה):**
- מערכת רכש פנימית לחברה קטנה-בינונית. צפוי 1-50 בקשות בו-זמנית לכל היותר.
- 28 נקודות קצה, רובן read (שליפת ספקים, RFQ, PO). מעט כתיבות.
- Supabase Pro מחזיק עד 500 חיבורי Postgres (דרך pooler) — יש מרווח עצום.

**חוסרים שזוהו:**
1. **אין timeout** על קריאות ל-Supabase — אם PostgREST תוקע, ה-request יישאר תלוי עד ש-Express
   יסיים (ברירת מחדל: unlimited). המלצה: `Promise.race` עם timeout של 10-30 שניות.
2. **אין error handling גלובלי** ל-unhandled promise rejection הקשור ל-Supabase.
3. **אין retry logic** — אם PostgREST מחזיר 503 זמני, הבקשה נכשלת.

**ציון:** 7/10 — עובד, אך חסר resilience.

---

## 5. Replit Single-Instance — האם זה משנה?

### ממצא: ✅ **מתאים לסביבת Replit**

**הנחות על סביבת Replit:**
- Replit מריץ **process יחיד** של Node.js (אלא אם מופעל cluster mode, מה שלא מצאתי כאן).
- אחסון אפמרלי (ephemeral) — לא בעיה כאן כי Supabase הוא המאגר.
- התחלה מחדש של container כל כמה שעות של idle — גורם ל-supabase client חדש, אך זה בסדר.

**איך זה משפיע על pooling?**
1. **Single instance → Single singleton supabase → Single HTTPS keep-alive → Simple.** אין צורך
   בסינכרון pools בין processes.
2. **אין cluster / PM2** — לכן אין חשש ל-N processes פותחים N×connections.
3. **Cold start:** כל פעם ש-Replit מריץ מחדש, ה-`createClient` נקרא מחדש, אבל זה זול ומהיר
   (mill-seconds).
4. **Replit Always On (paid):** אם פעיל, ה-singleton נשמר לזמן ארוך ומנצל keep-alive לטובת
   performance.
5. **Replit Free (sleep):** לאחר sleep, החיבור ל-PostgREST יתחדש בבקשה הבאה. אין בעיה כי
   אין persistent TCP socket ל-Postgres מצד ה-app.

**אזהרה:**
- אם בעתיד יפעילו `cluster.fork()` או PM2 ב-Replit (נדיר אבל אפשרי), כל worker יוצר client נפרד.
  כיום זה לא המצב.

**שורה תחתונה:** Replit single-instance + Supabase singleton = שילוב טבעי ונכון.

**ציון:** 10/10.

---

## 6. Long-lived vs Short-lived

### ממצא: ✅ **Long-lived (ע"י תכנון)**

**משך חיי ה-client:**
- נוצר פעם אחת בעליית המודול (module load time).
- חי לכל אורך חיי ה-process של Node.
- אין סיום/destroy מפורש — Node מסיים את ה-HTTPS agents בעת exit.

**יתרונות long-lived:**
- ✅ HTTPS keep-alive נשמר → latency נמוך יותר ב-subsequent requests.
- ✅ אין overhead של TLS handshake חוזר.
- ✅ אין זליגת משאבים, כי אין יצירה חוזרת.
- ✅ תואם ל-best practice של Supabase עבור backend services.

**חסרונות long-lived שיש לשקול:**
- ❌ **אין rotation של אסימוני auth** — כיום משתמש ב-`SUPABASE_ANON_KEY` סטטי. אם המפתח יסתובב,
  צריך restart של הקונטיינר. זה מקובל.
- ❌ **אין graceful shutdown** — בשרת אין `process.on('SIGTERM', ...)` שסוגר request פעילים.
  בעת deploy חדש, חלק מהבקשות עלולות להיקטע.

**ציון:** 9/10 — בעיקר טוב, חסר רק graceful shutdown.

---

## 7. המלצות (Recommendations)

מסודר לפי עדיפות (Priority):

### 🔴 P0 (גבוה) — חובה לפני prod production גדול

1. **הוסף timeout לקריאות Supabase:**
   ```js
   const withTimeout = (p, ms = 15000) =>
     Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('Supabase timeout')), ms))]);
   // שימוש:
   const { data, error } = await withTimeout(
     supabase.from('suppliers').select('*')
   );
   ```

2. **הוסף global error handler ל-Express:**
   ```js
   app.use((err, req, res, next) => {
     console.error('[ERROR]', err);
     res.status(500).json({ error: 'Internal server error' });
   });
   process.on('unhandledRejection', (reason) => {
     console.error('[UNHANDLED]', reason);
   });
   ```

### 🟡 P1 (בינוני) — מומלץ

3. **Graceful shutdown:**
   ```js
   const server = app.listen(PORT, () => {...});
   process.on('SIGTERM', () => {
     console.log('SIGTERM received, closing HTTP server...');
     server.close(() => process.exit(0));
   });
   ```

4. **Retry logic (פשוט) ב-wrapper:**
   הוסף helper שמבצע retry פעם אחת על שגיאות 5xx של PostgREST.

5. **תיעוד מפורש:**
   הוסף הערה ב-`server.js` שמציינת שה-client הוא singleton ולמה לא יוצרים per-request.

### 🟢 P2 (נמוך) — Nice to have

6. **Health check מעמיק:** במקום `supabase: 'connected'` סטטי בשורה 120, בצע בפועל `select 1`
   מטבלת `procurement_dashboard` ולוודא שהחיבור חי.

7. **Metrics:** רשום כמה בקשות פתוחות בכל רגע (gauge), ל-observability.

8. **שדרוג ל-service role key:** אם ה-backend צריך bypass ל-RLS, עבור מ-`SUPABASE_ANON_KEY`
   ל-`SUPABASE_SERVICE_ROLE_KEY` **אבל** רק בצד שרת, עם הערה מפורשת.

### 🔵 P3 (עתידי) — רק אם ישתנה architecture

9. **אם ייווסף Postgres ישיר:** השתמש ב-`pg.Pool` + pgBouncer transaction mode, עם
   `max: 10-20` connections בלבד. זכור ש-Replit single-instance יכול לחיות עם pool קטן.

---

## מטריקות סיכום

| קריטריון | ציון | מעמד |
|----------|------|------|
| Singleton initialization | 10/10 | ✅ PASS |
| Pooled connection mode | 9/10 | ✅ PASS |
| Socket exhaustion risk | 9/10 | ✅ PASS |
| Concurrent request handling | 7/10 | ⚠️ PASS with gaps |
| Replit fit | 10/10 | ✅ PASS |
| Long-lived management | 9/10 | ✅ PASS |
| **ציון כולל** | **9.0/10** | **✅ PASS** |

**הערה:** הפרויקט מיישם את הpractice הנכונה של Supabase JS backend. הפגמים הם רק בחוסן
(resilience) — לא ב-pooling עצמו. הסיכון האמיתי היחיד הוא timeout-less hangs במקרה של בעיה
ב-PostgREST. ההמלצות P0 מטפלות בזה.

---

*QA Agent #72 — Generated by static analysis only. No runtime verification.*
