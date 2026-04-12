# QA Agent #42 — הגנת CSRF (Cross-Site Request Forgery Defense)

**פרויקט:** onyx-procurement
**קובץ נבדק:** `server.js`, `web/onyx-dashboard.jsx`, `package.json`
**תאריך:** 2026-04-11
**סוג ניתוח:** Static analysis בלבד
**ממד:** CSRF Defense
**מעמד:** לא מכפיל את QA-WAVE1-DIRECT-FINDINGS.md — התמקדות ייחודית ב-CSRF vectors

---

## תקציר מנהלים

מצב ההגנה מפני CSRF בפרויקט onyx-procurement הוא כיום במצב "**ריק מהגנות אקטיביות**" אך בעצם גם חסר ווקטור התקפה אקטיבי בשל העדר Authentication. המערכת חשופה מאוד ברגע שייווסף מנגנון התחברות מבוסס-Cookie, שכן כל התשתיות הדרושות ל-CSRF (CORS פתוח, העדר middleware להגנה, endpoints שמשנים state ללא אימות source) כבר קיימות ומוכנות לניצול.

**רמת סיכון נוכחית:** נמוכה-בינונית (Medium-Low) — כיוון שאין Cookie Auth, אין CSRF classic.
**רמת סיכון עתידית (ברגע שיתווסף auth):** **CRITICAL** — ללא תיקונים, כל משתמש מחובר יכול להיות מנוצל.

---

## 1. בדיקות שבוצעו

### 1.1 חיפושי Grep שבוצעו:
```
csrf, csurf, sameSite, cookie, withCredentials, session,
X-Requested-With, Origin, Referer
```

### 1.2 תוצאות החיפוש ב-`server.js`:
- **csrf / csurf** — 0 מופעים. אין middleware כלשהו להגנת CSRF.
- **cookie** — 0 מופעים. אין שימוש ב-`cookie-parser`, אין `res.cookie()`, אין `req.cookies`.
- **sameSite** — 0 מופעים. אין הגדרה של SameSite (אין Cookie בכלל).
- **withCredentials** — 0 מופעים בצד שרת.
- **session** — 0 מופעים. אין שימוש ב-`express-session` / `cookie-session`.
- **X-Requested-With** — 0 מופעים. אין custom header check.
- **Origin / Referer** — 0 מופעים (ההתאמה היחידה הייתה False positive: `original_price` בשורה 536).

### 1.3 תוצאות ב-`package.json`:
```json
dependencies: {
  "express": "^4.21.0",
  "@supabase/supabase-js": "^2.45.0",
  "dotenv": "^16.4.5",
  "cors": "^2.8.5"
}
```
**אין תלויות הקשורות ל-CSRF, cookies או sessions.** (אין `csurf`, `csrf-csrf`, `express-session`, `cookie-parser`).

### 1.4 תוצאות ב-`web/onyx-dashboard.jsx`:
- Fetch calls משתמשים ב-`{ method, headers: { "Content-Type": "application/json" } }` בלבד.
- **אין `credentials: 'include'`** — כלומר ברירת המחדל היא `same-origin`, מה שמונע שליחת cookies cross-origin מהדפדפן.
- **אין Custom CSRF token header** נשלח מהלקוח.

---

## 2. ניתוח מפורט לפי קריטריונים

### 2.1 Cookie Usage — האם מוגדרים session cookies?
**ממצא:** לא. אין שימוש ב-cookies כלשהם. אין `res.cookie()`, אין `app.use(cookieParser())`, אין session middleware.
**השלכה:** אין CSRF classic attack vector כעת, כי אין מה לזייף (אין "ambient credentials").

### 2.2 SameSite Attribute — Strict/Lax?
**ממצא:** לא רלוונטי — אין cookies בכלל.
**השלכה:** כאשר cookies ייווספו, **חובה** להגדיר `SameSite=Strict` (או לפחות `Lax`). ללא זה — defense-in-depth חסרה.

### 2.3 csurf / csrf-csrf middleware — נוכחות?
**ממצא:** **שלילי מוחלט.** אין ולו שורה אחת של קוד הקשורה ל-CSRF protection middleware. לא ב-`server.js`, לא ב-`package.json`.
**השלכה:** ברגע שיתווסף Authentication, המערכת תהיה חשופה מיידית לכל סוג של CSRF attack.

### 2.4 State-changing Endpoints (POST/PUT/PATCH/DELETE)
**ממצא:** מצאתי **13 endpoints רגישים ללא הגנת CSRF**:

| Method | Path | תיאור | סיכון CSRF (עתידי) |
|---|---|---|---|
| POST | `/api/suppliers` | יצירת ספק | HIGH |
| PATCH | `/api/suppliers/:id` | עדכון ספק | HIGH |
| POST | `/api/suppliers/:id/products` | הוספת מוצר | MEDIUM |
| POST | `/api/purchase-requests` | יצירת בקשת רכש | **CRITICAL** |
| POST | `/api/rfq/send` | שליחת RFQ לספקים | **CRITICAL** (שולח WhatsApp/SMS לצד ג') |
| POST | `/api/quotes` | הזנת הצעת מחיר | HIGH |
| POST | `/api/rfq/:id/decide` | בחירת ספק זוכה + יצירת PO | **CRITICAL** |
| POST | `/api/purchase-orders/:id/approve` | אישור הזמנת רכש | **CRITICAL** (כספי!) |
| POST | `/api/purchase-orders/:id/send` | שליחת PO לספק | **CRITICAL** (שולח WhatsApp לספק בפועל) |
| POST | `/api/subcontractors` | יצירת קבלן | MEDIUM |
| PUT | `/api/subcontractors/:id/pricing` | עדכון תמחור | HIGH |
| POST | `/api/subcontractors/decide` | בחירת קבלן | HIGH |
| POST | `/webhook/whatsapp` | Webhook נכנס | שונה (ראה סעיף 2.10) |

**סך הכל:** 12 endpoints עסקיים רגישים + 1 webhook.

### 2.5 Same-Origin Policy & CORS credentials
**ממצא:** שורה 19: `app.use(cors());` — CORS פתוח **ללא הגבלה** (`Access-Control-Allow-Origin: *`).
- **חיובי כרגע:** כאשר origin הוא `*`, הדפדפן לא מאפשר `credentials: 'include'` — כלומר גם אם יהיו cookies, הדפדפן יסרב לשלוח אותם cross-origin.
- **סיכון עתידי קריטי:** אם הפיתוח יעבור ל-`cors({ origin: 'https://foo.com', credentials: true })` **מבלי להוסיף CSRF protection**, המערכת תהיה חשופה מיידית.
- **ממצא מקושר:** תלוי ב-I-02 (cors פתוח) מ-WAVE1. אני לא מכפיל את הדיון על CORS, רק מציין את הקישור ל-CSRF.

### 2.6 Double-Submit Cookie Pattern — שימוש?
**ממצא:** לא בשימוש. אין token בהתעבר-cookie ואין token בפרמטר/header לאימות צולב.

### 2.7 Origin / Referer Validation — נוכחות?
**ממצא:** **שלילי.** אין ב-server.js שום בדיקה של `req.headers.origin` או `req.headers.referer`. אפילו לא ב-webhook (שדווקא שם זה מקובל לבדוק).
**השלכה:** שכבת הגנה "זולה" (cheap defense) חסרה לחלוטין.

### 2.8 Custom-Header Trick (X-Requested-With)
**ממצא:** לא בשימוש. הלקוח (`onyx-dashboard.jsx`) לא שולח custom header, והשרת לא דורש כזה.
**הערה:** זה הגנה פופולרית שמסתמכת על CORS preflight — הייתה הגנה "חינם" במודל הנוכחי.

### 2.9 Form Actions vs JSON API
**ממצא:** המערכת היא **JSON API בלבד** (`express.json()` middleware, שורה 20). אין `express.urlencoded()` ואין handling של HTML forms.
**השלכה חיובית:** CSRF דרך `<form action="...">` classic קשה יותר לביצוע כי:
1. דרפדפן יעשה preflight ל-`Content-Type: application/json` (מעבר ל-simple request).
2. אלא אם כן CORS מתיר זאת במפורש.
**אבל:** זוהי הגנה עקיפה וספציפית — לא להסתמך עליה כשבעתיד ייתכנו שינויים.

### 2.10 Webhook Endpoint — `/webhook/whatsapp` (POST)
**ממצא נפרד:** ה-webhook של WhatsApp מקבל POST ללא אימות חתימה (no HMAC signature verification, no `X-Hub-Signature-256` check).
**זה אינו CSRF קלאסי**, אבל כן **Webhook forgery** — כל אחד יכול להזריק "הודעות WhatsApp מזויפות" למערכת והן ייכתבו ל-`system_events`.
**המלצה:** לאמת את ה-signature של Meta/Facebook לפי התיעוד הרשמי.

---

## 3. ממצאים ממופים (Findings Table)

| ID | חומרה | תיאור | מיקום | מצב |
|---|---|---|---|---|
| **CSRF-01** | **HIGH** (עתידי — CRITICAL) | אין csurf/csrf-csrf middleware כלל | `server.js` גלובלי | Open |
| **CSRF-02** | MEDIUM | אין Origin/Referer validation על אף endpoint | `server.js` כל ה-POST | Open |
| **CSRF-03** | MEDIUM | אין custom header requirement (X-Requested-With) | `server.js` | Open |
| **CSRF-04** | HIGH (עתידי) | אין הכנה ל-SameSite cookies | `server.js` | Open |
| **CSRF-05** | **HIGH** | Webhook `/webhook/whatsapp` POST ללא HMAC signature verification | `server.js:876-901` | Open |
| **CSRF-06** | LOW (כרגע) → HIGH (ברגע שיהיה auth) | CORS פתוח + אפס הגנת CSRF = combo explosive | `server.js:19` | Open (מקושר I-02) |
| **CSRF-07** | MEDIUM | 12 endpoints state-changing ללא כל שכבת הגנה | רחב | Open |

---

## 4. ווקטורי התקפה פוטנציאליים (Threat Modeling)

### תרחיש 4.1 — "ההווה" (ללא Auth)
**מצב:** כל אחד שמכיר את ה-URL יכול לעשות POST. CSRF הוא לא האיום העיקרי — האיום הוא **absence of authentication**.
**אבל:** עדיין ניתן לבצע "Drive-by POST" דרך אתר זדוני (`<img src=... onerror>` + fetch), מה שיגרום ליצירת רשומות ספאם.

### תרחיש 4.2 — "העתיד הקרוב" (אחרי Auth בלי CSRF)
**מצב:** משתמש מחובר מבקר באתר זדוני `evil.com`.
- אם Auth הוא Cookie-based עם `SameSite=Lax` (ברירת מחדל בדפדפנים מודרניים) — רוב ה-POSTs יחסמו אוטומטית.
- אם Auth הוא Cookie-based עם `SameSite=None` או ללא — **זדוני יכול להפעיל**:
  - `POST /api/purchase-orders/:id/approve` → אישור הזמנה כספית גדולה!
  - `POST /api/purchase-orders/:id/send` → שליחת WhatsApp לספק אמיתי!
  - `POST /api/rfq/send` → ספאם של WhatsApp לכל הספקים!
- אם Auth הוא Bearer Token ב-Header — חסין לחלוטין מ-CSRF (אבל אז XSS הופך לאיום העיקרי).

### תרחיש 4.3 — "Webhook forgery" (כבר עכשיו)
**מצב:** תוקף שולח POST ל-`/webhook/whatsapp` עם payload מזויף.
- יוצר רשומה ב-`system_events` עם "הודעה מ-..." מזויפת.
- זיהום נתוני dashboard וגרימת סיכון לאמון במערכת.

---

## 5. המלצות (Prioritized Recommendations)

### 5.1 טווח קצר (לפני הוספת Authentication):
1. **הוסף HMAC signature verification ל-webhook** של WhatsApp — זה דחוף מ-CSRF כי זה ווקטור פעיל עכשיו.
   ```javascript
   // בשורה 877, לפני הפרוסס:
   const signature = req.headers['x-hub-signature-256'];
   const expected = crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET)
                          .update(JSON.stringify(req.body)).digest('hex');
   if (signature !== `sha256=${expected}`) return res.sendStatus(401);
   ```
2. **מגבל את CORS ל-origin מוגדר** בתכנון מראש לקראת Auth (קישור ל-I-02).

### 5.2 לפני הוספת Cookie-based Authentication (חובה):
1. **התקן `csurf` או `csrf-csrf`**:
   ```bash
   npm install csrf-csrf cookie-parser
   ```
2. **הגדר middleware גלובלי**:
   ```javascript
   const { doubleCsrf } = require('csrf-csrf');
   const { doubleCsrfProtection, generateToken } = doubleCsrf({
     getSecret: () => process.env.CSRF_SECRET,
     cookieOptions: { sameSite: 'strict', secure: true, httpOnly: true },
   });
   app.use(doubleCsrfProtection);
   ```
3. **הגדר SameSite=Strict על session cookie**:
   ```javascript
   res.cookie('session', token, {
     httpOnly: true, secure: true, sameSite: 'strict', maxAge: 3600000,
   });
   ```
4. **CORS המוגדר**: `cors({ origin: 'https://app.onyx.example', credentials: true })`.
5. **Origin/Referer validation** כ-defense-in-depth על state-changing endpoints.

### 5.3 Alternative — Bearer Token Approach:
אם בכלל מעדיפים להימנע מ-cookies:
- לעבור ל-JWT ב-`Authorization: Bearer` header.
- CSRF הופך לבלתי רלוונטי (cookies לא נשלחים אוטומטית).
- **אבל** סיכון XSS עולה — חובה CSP חזק.

### 5.4 Quick Wins (כולל ללא cookies):
- דרוש `X-Requested-With: XMLHttpRequest` על כל POST — מאלץ preflight.
- בדיקת `Origin` header מול whitelist על כל state-changing endpoint.

---

## 6. מסקנות

המערכת onyx-procurement נמצאת כרגע ב"**זון הזמני**" של אבטחת CSRF:
- **טוב:** אין מה להגן עליו כי אין auth → אין cookies → אין CSRF classic.
- **רע:** אין שום הכנה לעתיד. ברגע שיתווסף Authentication ללא תוספת csurf + SameSite, המערכת תהיה חשופה באופן קריטי.
- **דחוף מיידית:** ה-webhook של WhatsApp חשוף ל-forgery (לא CSRF בדיוק, אבל דומה — missing signature verification).

**תמצית:** הפרויקט מקבל דחוף להציב "**security debt ticket**" לקראת שלב הוספת Auth — זהו הסיכון הגדול ביותר מממד ה-CSRF.

---

## 7. קישורים לממצאים אחרים (Cross-references)

- **I-02** (CORS פתוח) ב-`QA-WAVE1-DIRECT-FINDINGS.md` — תלות ישירה.
- **QA-AGENT-26-GDPR.md** — אין log של user actions לצורך non-repudiation.
- **QA-AGENT-20-LOGGING.md** — חסר audit של CSRF attempts (N/A כרגע כי אין protection).

---

**נכתב על ידי:** QA Agent #42
**ממד:** CSRF Defense
**סוג:** Static Analysis Only
**תאריך:** 2026-04-11
