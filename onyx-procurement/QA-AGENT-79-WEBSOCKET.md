# QA Agent #79 — WebSocket / Real-time Security

**פרויקט:** `onyx-procurement` (+ השוואה cross-project)
**תאריך:** 2026-04-11
**ממד בדיקה:** אבטחת WebSocket וערוצי Real-time
**מתודולוגיה:** ניתוח סטטי בלבד (Static Analysis)
**סוכן:** QA #79

---

## 1. סיכום מנהלים (TL;DR)

**ב-`onyx-procurement` אין שימוש ב-WebSocket או Supabase Realtime — בכלל.** ה-stack הוא Express HTTP עם polling מצד הלקוח (`setInterval(30000)` ב-`web/onyx-dashboard.jsx:45`). כלומר, **כל ממדי האבטחה של WS לא רלוונטיים לפרויקט הזה כיום** — אין surface area של ws auth, אין channel ACL, אין message size, אין connection rate limiting.

**החשיבות:** זו תוצאה **חיובית מבחינת אבטחה** (אין וקטור התקפה ws כלל), אבל **שלילית מבחינת ארכיטקטורה/latency** — ה-30s polling כבר הופיע כ-issue ב-QA #23 (SLA-SLO), QA #36 (MOBILE), QA #49 (REPORTING).

---

## 2. ממצאי חיפוש סטטי

### 2.1 `server.js` (934 שורות)

Grep-ים שבוצעו על `server.js`:

| דפוס | תוצאות | הערה |
|---|---|---|
| `ws` (word boundary) | 0 | (`res.on('data'...)` הוא Node streams, לא WS) |
| `socket.io` | 0 | |
| `websocket` / `WebSocket` | 0 | |
| `realtime` | 0 | |
| `pusher` | 0 | |
| `ably` | 0 | |
| `supabase.channel(` | 0 | |
| `.subscribe(` | 0 | |
| `postgres_changes` | 0 | |
| `broadcast` | 0 | |

הדפוס היחיד של `subscribe` הוא **שורה 869**:
```js
if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
```
— זה ה-verification challenge של **WhatsApp webhook** (GET `/webhook/whatsapp`), **לא** WebSocket subscribe. זהו HTTP קלאסי (שורות 863-874).

### 2.2 `package.json`

```json
{
  "dependencies": {
    "express": "^4.21.0",
    "@supabase/supabase-js": "^2.45.0",
    "dotenv": "^16.4.5",
    "cors": "^2.8.5"
  }
}
```

**ממצאים:**

- אין `ws`
- אין `socket.io` / `socket.io-client`
- אין `pusher` / `pusher-js`
- אין `ably`
- אין `@supabase/realtime-js` (ישיר) — **אבל** הוא נטען כ-transitive dependency של `@supabase/supabase-js` (QA #31:94 כבר זיהה).

### 2.3 Supabase Client Init (server.js:23-26)

```js
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
```

**אין** קונפיגורציה של `realtime: { params: ... }`, אין קריאות ל-`supabase.channel(...)`, אין `.subscribe(...)`. ה-realtime client נטען אך **לא מופעל**.

### 2.4 Frontend (`web/onyx-dashboard.jsx`)

Grep רלוונטי:

| דפוס | תוצאה |
|---|---|
| `WebSocket` / `new WebSocket` | 0 |
| `supabase.channel` | 0 |
| `subscribe` (event) | 0 |
| `setInterval` | שורה 45: `setInterval(refresh, 30000)` |
| `fetch` | שורה 10: REST API calls בלבד |

**המשמעות:** ה-dashboard **polling בלבד** — כל 30 שניות קריאה ל-`/api/status`. אין long-lived connection מהלקוח לשרת.

---

## 3. תשובות לשאלות המקוריות

### ש1. שימוש ב-WebSocket ב-onyx-procurement?

**לא. אין בכלל.** לא ב-server.js, לא ב-client jsx, לא ב-dependencies.
(להבדיל, ב-`techno-kol-ops` יש `src/realtime/websocket.ts`, וב-`AI-Task-Manager` יש 6+ שימושים. זה cross-project ולא רלוונטי ל-onyx.)

### ש2. Supabase Realtime subscriptions בשימוש?

**לא.** Supabase client מאותחל עם ההגדרות ברירת-מחדל, אבל **אפס קריאות** ל-`supabase.channel(...)`, `.on('postgres_changes', ...)`, `.subscribe()`. ה-realtime client נטען אך dormant.

### ש3. Auth על WS connection?

**לא רלוונטי — אין WS.** לא קיים `upgrade` handler, לא קיים middleware ש-intercept-יב handshake.

**אזהרה להמשך:** אם יוחלט בעתיד לאמץ Supabase Realtime (בעקבות QA #23 / #36 / #49), נדרש להחליף את `SUPABASE_ANON_KEY` (שעל ה-frontend גלוי לכולם) בסכימת JWT אמיתית, כי ה-Realtime של Supabase לא מפריד בין clients תחת אותו anon key — אם ה-RLS לא מוגדר כראוי, כל client יקבל את כל האירועים.

### ש4. Per-channel access control?

**לא רלוונטי — אין channels.** עם זאת, ה-channels ה**עתידיים** (אם ייווצרו) חייבים לשבת על Supabase RLS:
- `purchase_orders` — רק admin / RBAC
- `audit_log` — רק admin
- `rfqs` — רק מי ששייך לפרויקט
- `suppliers` (public/admin split)

היום, ללא WS, הנושא לא אקוטי, אבל **אין תשתית RLS ראויה גם לפעילות ה-REST** (ראה QA Agents קודמים על RLS).

### ש5. Message size limits?

**לא רלוונטי — אין WS.** לציון: ב-REST יש `express.json()` ברירת מחדל של 100KB (שורה 20), ללא קונפיגורציה של `limit`. זה לא מוגן מול payload מסיבי — אבל זה issue של HTTP POST, לא WS.

### ש6. Connection rate limiting?

**אין rate limiting בכלל בפרויקט** — לא ל-HTTP (צוין בסוכנים קודמים), ולא ל-WS (כי אין WS).
- אין `express-rate-limit`
- אין `express-slow-down`
- אין `rate-limiter-flexible`
- אין Cloudflare / Nginx front (לפי מה שרואים)

### ש7. Origin validation?

**ה-CORS פתוח לרווחה (wide open):**
```js
app.use(cors());  // server.js:19
```
זהו `cors()` ללא options — שמשמעותו `Access-Control-Allow-Origin: *` לכל origin. **אין Origin validation** לא ל-REST ולא (כי אין) WS. זה **Finding נפרד** שיכסה QA של Headers/CORS (לא אני), אבל קריטי לדעת כשחושבים על WS עתידי: ה-`WebSocketServer` של `ws` **אינו בודק Origin ברירת מחדל** — צריך לממש `verifyClient` ידנית.

### ש8. המלצות

#### המלצות להיום (ללא WS):

1. **לא להכניס ws/socket.io/Supabase Realtime ללא תכנית אבטחה שלמה.** היום המערכת "בטוחה" ביחס ל-WS כי אין WS. הכנסה של WS ללא תכנון = רגרסיה אבטחתית.
2. **אם מוסיפים Supabase Realtime** (הפתרון הפשוט ביותר, כי כבר יש supabase-js):
   - חובה להגדיר **RLS מלא** על `purchase_orders`, `rfqs`, `suppliers`, `audit_log`, `system_events` — כי Realtime של Supabase מכבד RLS **רק** אם הוא מופעל.
   - להחליף `SUPABASE_ANON_KEY` בצד הלקוח בטוקן JWT מותאם-משתמש (`auth.signInWithPassword` או `signInWithOtp`).
   - לא להרשות `supabase.channel('*')` או wildcard.
3. **אם מוסיפים `ws` נטו (WebSocketServer):**
   - Auth ב-`handshake` (query param `?token=` או header `Authorization`) — ראה דוגמה ב-`techno-kol-ops/src/realtime/websocket.ts:18-27` (אבל שים לב: שם ה-try/catch בולע שגיאות ונופל ל-`anonymous` — **חולשה**).
   - `verifyClient({ origin })` למנוע CSRF על WS (Cross-Site WebSocket Hijacking).
   - `perMessageDeflate: false` או limit ל-`maxPayload` (ברירת מחדל של `ws` היא `100 * 1024 * 1024` = 100MB — מסוכן).
   - Rate limit לחיבורים לפי IP (לפחות 1/sec לעלייה חדשה).
   - Heartbeat/ping כל 30s ו-kill של חיבורים שלא עונים.
   - Per-room ACL: לבדוק ב-`JOIN_ROOM` שה-user רשאי לצפות באותו room.

#### המלצות cross-project (למי שכן משתמש ב-WS):

עיון מהיר ב-`techno-kol-ops/src/realtime/websocket.ts` חשף **4 חולשות** שיש לתקן אצלהם (לא אצלנו):

1. **`catch {}` בולע JWT errors** — טוקן לא תקין = התחזות כ-`anonymous` ובהצלחה מתחבר. (שורה 26)
2. **אין `verifyClient` לבדיקת Origin** — חשוף ל-CSWSH.
3. **אין `maxPayload`** ב-`WebSocketServer` — ברירת המחדל 100MB.
4. **אין `per-room` ACL** ב-`JOIN_ROOM` (שורה 40) — לקוח מתחבר ו-join לכל חדר שרוצה.

**אלה ממצאים לסוכני QA של אותם פרויקטים**, לא לכאן — אבל מעלים אותם כי המשימה כוללת "cross-project" context.

---

## 4. טבלת סיכום ממצאים

| # | ממד | סטטוס ב-onyx | הסיכון היום | הסיכון אם יוסיפו WS ללא תכנון |
|---|---|---|---|---|
| 79.01 | WebSocket usage | ❌ אין | 0 | גבוה |
| 79.02 | Supabase Realtime | ❌ אין | 0 | גבוה ללא RLS |
| 79.03 | WS Auth handshake | N/A | 0 | קריטי |
| 79.04 | Per-channel ACL | N/A | 0 | קריטי (מידע רגיש: הצעות מחיר, PO) |
| 79.05 | Message size limit | N/A | 0 | בינוני (DoS) |
| 79.06 | Connection rate limit | ❌ אין אפילו ל-HTTP | בינוני (על HTTP) | גבוה |
| 79.07 | Origin validation | ❌ `cors()` פתוח | בינוני (CSRF על REST) | קריטי (CSWSH) |
| 79.08 | Heartbeat/idle kill | N/A | 0 | בינוני |

---

## 5. קבצים שנבדקו

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\server.js` (934 שורות)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\package.json` (16 שורות)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\web\onyx-dashboard.jsx` (grep בלבד)

### Cross-project (לעיון — לא מחייב):

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\techno-kol-ops\src\realtime\websocket.ts` (80 שורות) — 4 חולשות שזוהו
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\AI-Task-Manager\artifacts\kobi-agent\src\ws\socket.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\AI-Task-Manager\artifacts\kobi-agent\src\flows\realtimeFlow.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\AI-Task-Manager\artifacts\api-server\src\lib\websocket-server.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\enterprise_palantir_core\README.md:165`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\palantir_realtime_core\README.md:112`

---

## 6. הגבלות בדיקה

- **ניתוח סטטי בלבד** — לא הורץ `netstat`/`ss` לאמת שאין listener על פורטים אחרים, לא הורץ `nmap` על השרת.
- לא נבדק Supabase Dashboard (צד השרת המנוהל של Supabase) לראות האם Realtime מופעל שם. התצורה ההיסטורית של Supabase היא ש-Realtime מופעל ב-project level, אבל **הקוד לא מפעיל אותו**.
- לא נבדק `.env` בפועל (לא קיים לא ב-repo).
- לא הורץ `npm ls @supabase/realtime-js` לאשר גרסת transitive dep.

---

## 7. מסקנה סופית

**onyx-procurement פטור מכל האיומים של WebSocket Security — לא כי הוא מאובטח, אלא כי הוא לא משתמש ב-WS כלל.** זו "אבטחה במחדל" (security by absence). הסיכון היחיד הרלוונטי הוא **עתידי**: כשקובי או מפתח אחר יחליט להחליף את ה-30s polling ב-Realtime/WS — יש צורך ב-QA אבטחה מלא לפני הדפלוי, כי הקוד ה-baseline של Supabase Realtime (אפילו עם anon key) חושף את כל השינויים בטבלאות שאין להן RLS מדויק.

**המלצה אופרטיבית:** עד שיוחלט אחרת — **להשאיר WebSocket מחוץ למערכת**. Polling כל 30s מספיק לצרכים הנוכחיים של קובי (dashboard desktop ב-office). אם יעלה צורך ל-real-time אמיתי (לוח תצוגה במפעל), יש לפתוח ticket נפרד "Add Realtime" שכולל:
1. הגדרת RLS מלא.
2. JWT auth לצד הלקוח.
3. בחינה: Supabase Realtime (פשוט) vs. WebSocketServer נטו (שליטה מלאה).
4. QA חוזר של ממד זה.

---

*סוכן #79 — WebSocket / Real-time Security · 2026-04-11 · סטטוס סופי: onyx-procurement **עובר** — בגלל היעדר WS.*
