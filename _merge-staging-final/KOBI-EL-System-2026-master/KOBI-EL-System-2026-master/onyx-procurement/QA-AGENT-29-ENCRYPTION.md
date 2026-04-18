# QA-AGENT-29 — Encryption Audit (ONYX Procurement)

**סוכן:** QA Agent #29
**ממד:** ביקורת הצפנה (in transit + at rest + key management)
**תאריך:** 2026-04-11
**שיטה:** Static analysis בלבד
**קבצים שנסקרו:** `server.js` (934 שורות), `package.json`, `supabase/migrations/001-supabase-schema.sql`, `.env.example`

---

## תקציר מנהלים (TL;DR)

מערכת ONYX נסמכת כמעט לחלוטין על **הצפנה מובלעת של פלטפורמות צד שלישי** (Supabase TLS+disk encryption, Meta Graph API HTTPS, Twilio HTTPS) ללא שכבת הגנה עצמאית. אין אכיפת HTTPS ב-Express, אין HSTS, אין הצפנה ברמת-עמודה לנתונים רגישים (טלפוני ספקים, tokens ב-audit_log), ואין מדיניות סיבוב מפתחות מתועדת. אין קוד קריפטוגרפי ביתי — זו נקודה חיובית. הסיכון הקריטי: סודות (`WHATSAPP_TOKEN`, `SUPABASE_ANON_KEY`, `TWILIO_AUTH_TOKEN`) מנוהלים דרך `.env` בלבד, ללא Replit Secrets מוגדרים, וללא מסלול סיבוב.

---

## 1. TLS in Transit

### 1.1 Express לא אוכף HTTPS
**מיקום:** `server.js:18-20, 908-909`

```js
const app = express();
app.use(cors());
app.use(express.json());
// ...
app.listen(PORT, () => { ... });
```

**ממצא:** Express מאזין ב-HTTP רגיל (`app.listen`) ללא `https.createServer` ו-ללא middleware מסוג `express-enforces-ssl` / `req.secure` redirect. המערכת מסתמכת לחלוטין על **Replit TLS termination** (reverse proxy) להצפנת תעבורה.

**השלכות:**
- כשמריצים מקומית (`node server.js`) — התעבורה בטקסט גלוי
- אם deployment מתבצע מאחורי proxy אחר (לא Replit) — אין guarantee ל-HTTPS
- לקוח שיוצר חיבור HTTP ישיר לפורט 3100 לא יופנה ל-HTTPS

**חומרה:** HIGH (אם יעלה ל-production מחוץ ל-Replit)
**תיקון מוצע:**
```js
// Trust proxy + force HTTPS
app.set('trust proxy', 1);
app.use((req, res, next) => {
  if (req.header('x-forwarded-proto') !== 'https' && process.env.NODE_ENV === 'production') {
    return res.redirect(301, `https://${req.header('host')}${req.url}`);
  }
  next();
});
```

### 1.2 HSTS Header לא מוגדר
**מיקום:** `server.js:18-20` (absence)

**ממצא:** אין `helmet`, אין `Strict-Transport-Security` header. הלקוח לא מקבל הנחיה לכפות HTTPS ב-requests הבאים.

**חומרה:** MEDIUM
**תיקון מוצע:**
```js
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  next();
});
```
או להתקין `helmet`:
```bash
npm install helmet
```
```js
const helmet = require('helmet');
app.use(helmet({ hsts: { maxAge: 31536000, includeSubDomains: true, preload: true } }));
```

### 1.3 חיבור Supabase — HTTPS Only (Confirmed)
**מיקום:** `server.js:23-26`, `.env.example:6`

```
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
```

**ממצא:** Supabase SDK (`@supabase/supabase-js ^2.45.0`) בונה את הלקוח מ-`SUPABASE_URL`. ה-template ב-`.env.example` משתמש ב-`https://` מראש — Supabase לא תומך ב-HTTP בפרויקטים ציבוריים, והחיבור מוצפן ב-TLS אוטומטית.

**אזהרה אופרטיבית:** אין ולידציה ב-boot שה-URL אכן מתחיל ב-`https://`. משתמש עלול להגדיר בטעות `http://` או URL פנימי לא מוצפן. רמת סיכון נמוכה אבל ראוי להוסיף:
```js
if (!process.env.SUPABASE_URL?.startsWith('https://')) {
  throw new Error('SUPABASE_URL must use HTTPS');
}
```

### 1.4 WhatsApp Graph API — HTTPS Confirmed
**מיקום:** `server.js:46-54`

```js
const req = https.request({
  hostname: 'graph.facebook.com',
  path: `/v21.0/${WA_PHONE_ID}/messages`,
  method: 'POST',
  ...
});
```

**ממצא:** השימוש הוא במודול `https` הסטנדרטי של Node (לא `http`), היעד `graph.facebook.com` — Meta תומך רק ב-HTTPS/TLS 1.2+. **תקין.**

**הערה קלה:** אין `rejectUnauthorized: true` מפורש (ברירת המחדל של Node היא `true`, אז זה תקין), ואין cert pinning. ברמה של procurement SME זה acceptable.

### 1.5 Twilio API — HTTPS Confirmed
**מיקום:** `server.js:79-86`

```js
const req = https.request({
  hostname: 'api.twilio.com',
  path: `/2010-04-01/Accounts/${sid}/Messages.json`,
  ...
});
```

**ממצא:** תקין. `api.twilio.com` חוסם HTTP. האימות דרך Basic Auth מוצפן ב-TLS.

---

## 2. Encryption at Rest

### 2.1 Supabase Postgres — Disk Encryption (Confirmed by platform)
**מיקום:** `supabase/migrations/001-supabase-schema.sql`

**ממצא:** Supabase מריץ Postgres על AWS RDS/GCP עם **AES-256 disk encryption** כברירת מחדל בכל תוכנית (Free/Pro/Enterprise). זה confirmed על ידי הפלטפורמה וללא קשר לקוד שלנו.

**מה הסכמה לא עושה:** אין עמודה אחת עם `pgcrypto` / `pgp_sym_encrypt`, אין `ENCRYPTED` keyword, אין שימוש ב-Supabase Vault.

### 2.2 עמודות רגישות לא מוצפנות ברמת-עמודה (Column-Level)
**מיקום:** `supabase/migrations/001-supabase-schema.sql:8-40, 277-293, 338-351`

הנתונים הבאים נשמרים ב-**plaintext** ב-DB (מוגן רק על ידי הצפנת-דיסק של הפלטפורמה):

| טבלה | עמודה | תוכן רגיש |
|---|---|---|
| `suppliers` | `phone`, `whatsapp`, `email`, `contact_person`, `address` | PII ספקים (חוק הגנת הפרטיות 1981) |
| `subcontractors` | `phone`, `email`, `name` | PII קבלנים |
| `audit_log` | `previous_value`, `new_value` (JSONB) | יכול להכיל tokens, secrets אם נרשם בטעות |
| `system_events` | `data` (JSONB) | WhatsApp payloads — יכול להכיל מספרי טלפון של משתמשי-קצה |
| `notifications` | `recipient`, `message` | מספרי טלפון + תוכן הודעות |

**חומרה:** MEDIUM-HIGH מבחינת Compliance (GDPR/חוק הגנת הפרטיות ישראל)

**מצב נוכחי:** מי שמשיג credentials ל-Supabase (anon key חשוף / service role key שדלף / DB dump) רואה הכל בטקסט-גלוי.

**תיקון מוצע (בסדר עדיפות):**
1. **לטווח קצר:** להפעיל RLS (השורה מופיעה ב-schema כ-comment ב-`line 490-493` ולא מופעלת):
   ```sql
   ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
   ```
2. **לטווח בינוני:** שימוש ב-Supabase Vault לעמודות רגישות:
   ```sql
   SELECT vault.create_secret('encrypted_phone_data', supplier_phone, 'supplier_phones_key');
   ```
3. **Application-layer encryption** לשדות קריטיים בלבד (אם יעלו דרישות רגולטוריות):
   ```js
   const crypto = require('crypto');
   function encryptPII(text) {
     const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
     // ...
   }
   ```

---

## 3. Secret Management

### 3.1 `.env` vs Replit Secrets
**מיקום:** `server.js:16` (`require('dotenv').config()`), `.env.example`

**ממצא:** הקוד טוען סודות דרך `dotenv`, כלומר מצפה לקובץ `.env` פיזי. ב-Replit הקובץ לא אמור להתקיים — Replit Secrets מוזרקים כ-environment variables. הקוד תומך בשני המסלולים (`process.env.X` עובד משניהם), אבל **אין אכיפה / אין בדיקה**.

**סיכון קונקרטי:**
1. אין `.gitignore` שנצפה (קובץ לא נמצא ברשימת הקבצים) — אם מישהו יצר `.env` מקומית וcommit-ה בטעות, הוא יידחף לגיט.
2. `.env.example:12` מכיל ערך ברירת מחדל `WHATSAPP_VERIFY_TOKEN=onyx_verify_2026` — אם מפתח יטעה ויעתיק כמו שהוא, הטוקן הזה יהיה hardcoded וגלוי.

**חומרה:** HIGH (לא בגלל הקוד עצמו אלא בגלל אי-הקיום של safeguards)

**תיקון מוצע:**
1. ליצור `.gitignore` עם `.env` (אם לא קיים).
2. לאמת ב-boot שסודות חובה הוגדרו:
   ```js
   const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'WHATSAPP_TOKEN', 'WHATSAPP_VERIFY_TOKEN'];
   for (const k of required) {
     if (!process.env[k] || process.env[k].includes('YOUR_') || process.env[k] === 'onyx_verify_2026') {
       console.error(`FATAL: ${k} not set or uses placeholder value`);
       process.exit(1);
     }
   }
   ```

### 3.2 סודות שמטופלים בקוד
מופו 7 סודות:

| # | סוד | מקור | שימוש | חשיפה |
|---|---|---|---|---|
| 1 | `SUPABASE_URL` | env | DB client | Public-safe (זה URL) |
| 2 | `SUPABASE_ANON_KEY` | env | DB client | **חשוף ב-RLS-off mode — שווה ערך לגישה מלאה** |
| 3 | `WHATSAPP_TOKEN` | env | Bearer auth ל-Meta | CRITICAL — dollar value per token |
| 4 | `WHATSAPP_PHONE_ID` | env | Meta endpoint | Low sensitivity |
| 5 | `WHATSAPP_VERIFY_TOKEN` | env | Webhook verification | Medium — determines who can register webhook |
| 6 | `TWILIO_SID` + `TWILIO_AUTH_TOKEN` | env | Basic auth ל-Twilio | CRITICAL |
| 7 | `TWILIO_FROM` | env | מספר שולח | Low |

### 3.3 WhatsApp App Secret — חסר!
**מיקום:** `server.js:876-901` (webhook handler)

**ממצא קריטי:** `app.post('/webhook/whatsapp', ...)` לא מאמת את ה-signature header `X-Hub-Signature-256` של Meta. זה אומר ש**אין שימוש ב-`META_APP_SECRET`** בכלל — הוא לא מוגדר ב-`.env.example` ולא מופיע בקוד.

```js
app.post('/webhook/whatsapp', async (req, res) => {
  const body = req.body;
  // לא נעשה crypto.createHmac('sha256', APP_SECRET) על body ה-raw
  const entry = body?.entry?.[0];
  // ...
});
```

**השלכה:** כל אחד יכול לשלוח POST מזוייף ל-`/webhook/whatsapp` ולזהם את `system_events` עם הודעות WhatsApp מזוייפות. זה לא רק אבטחה — זה גם אמינות נתונים (data integrity).

**חומרה:** HIGH
**תיקון מוצע:**
```js
const crypto = require('crypto');

function verifyWhatsAppSignature(req, res, next) {
  const signature = req.header('X-Hub-Signature-256');
  if (!signature) return res.sendStatus(403);
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.META_APP_SECRET)
    .update(req.rawBody)  // requires express.raw()
    .digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.sendStatus(403);
  }
  next();
}

app.post('/webhook/whatsapp', verifyWhatsAppSignature, async (req, res) => { ... });
```

**הערה:** ממצא זה חופף חלקית ל-`QA-WAVE1-DIRECT-FINDINGS.md` (שורה 73), אבל שם ההתמקדות הייתה אימות בכלל. כאן אני מוסיף את ההיבט של **ניהול מפתחות** — ה-APP_SECRET לא קיים כלל באקוסיסטם הקונפיגורציה.

### 3.4 Key Rotation Policy — חסרה לחלוטין
**ממצא:** אין מסמך / אין קוד / אין תהליך המתאר סיבוב של:
- `SUPABASE_ANON_KEY` (יכול להיות מסובב ב-Supabase dashboard, אבל צריך redeploy יחד)
- `WHATSAPP_TOKEN` (Meta token יכול להיות long-lived — מומלץ סיבוב כל 60 יום)
- `TWILIO_AUTH_TOKEN` (ניתן לסיבוב ב-Twilio console)
- `WHATSAPP_VERIFY_TOKEN` (static in code — never rotated)

**חומרה:** MEDIUM (operational risk)
**תיקון מוצע:** ליצור `SECRETS-ROTATION.md` עם runbook ותדירות. להוסיף reminder ב-system_events cron.

### 3.5 Verify Token Comparison — לא Timing-Safe
**מיקום:** `server.js:869`

```js
if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
```

**ממצא:** השוואת מחרוזות רגילה (`===`) חשופה ל-timing attack. אמנם סיכון נמוך ב-verify token קצר, אבל לא רצוי.

**חומרה:** LOW
**תיקון:**
```js
const crypto = require('crypto');
const a = Buffer.from(token || '');
const b = Buffer.from(process.env.WHATSAPP_VERIFY_TOKEN || '');
const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
```
(חופף ל-`QA-WAVE1-DIRECT-FINDINGS.md:85` — מזכיר למען שלמות, לא מוסיף ממצא חדש.)

---

## 4. Password Hashing / JWT Signing — N/A

**ממצא:** אין מערכת אימות משתמשים (תואם ל-`QA-WAVE1-DIRECT-FINDINGS.md` B-03 — authentication missing entirely). לכן:
- אין עמודת `password` → אין bcrypt needed
- אין JWT issuing → אין signing key
- אין `jsonwebtoken`, `bcrypt`, `argon2` ב-`package.json`

**המלצה לעתיד:** כשיתווסף auth:
- להשתמש ב-**Supabase Auth** (מובנה, JWT מנוהל על ידי Supabase, HS256/RS256)
- אם custom: `bcrypt` עם `rounds=12` או `argon2id`
- לא להמציא scheme ביתי

---

## 5. Custom Crypto Code — אין (Good!)

**ממצא:** חיפשתי `crypto.`, `createCipher`, `XOR`, `rot13`, `atob`, `btoa` — לא נמצא שום דבר. המודול `crypto` לא מיובא כלל. זה חדשות טובות — **אין קוד קריפטו ביתי אד-הוק** שיכול להיות שבור.

**Flag יחיד:** `Buffer.from(...).toString('base64')` ב-`server.js:75` — זה לא הצפנה, זה encoding. תקני לצורך Basic Auth של Twilio.

---

## 6. תלויות Crypto ב-package.json

**מיקום:** `package.json:10-15`

```json
"dependencies": {
  "express": "^4.21.0",
  "@supabase/supabase-js": "^2.45.0",
  "dotenv": "^16.4.5",
  "cors": "^2.8.5"
}
```

**ממצא:**
- **אין** `helmet` (אין HSTS/CSP/X-Frame-Options)
- **אין** `express-rate-limit` (אין הגנת DoS על endpoints שמשתמשים ב-secrets)
- **אין** `bcrypt` / `argon2` / `jsonwebtoken` (תואם — אין auth)
- **אין** `crypto` מופיע (מובנה ב-Node, לא צריך dependency)
- `express ^4.21.0` — גרסה עדכנית, אין CVE ידועים נכון לאפריל 2026
- `cors ^2.8.5` — שימוש ב-`cors()` ללא הגבלת origin (`allow-all`) — לא crypto אבל רלוונטי ל-transit security

**חומרה של `cors()` open:** MEDIUM
**תיקון:**
```js
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'https://yourdomain.com',
  credentials: true,
}));
```

---

## 7. סיכום ממצאים (Risk Matrix)

| # | ממצא | חומרה | דחיפות | תיקון |
|---|---|---|---|---|
| E-01 | Express לא אוכף HTTPS — הסתמכות מוחלטת על Replit TLS | HIGH | P1 | `trust proxy` + redirect middleware |
| E-02 | אין HSTS header | MEDIUM | P2 | helmet או header ידני |
| E-03 | עמודות PII (phone/email) לא מוצפנות ברמת-עמודה | MEDIUM-HIGH | P2 | RLS + Supabase Vault |
| E-04 | `.gitignore` חסר → סכנת commit של `.env` | HIGH | P1 | יצירת `.gitignore` |
| E-05 | `WHATSAPP_VERIFY_TOKEN` placeholder hardcoded ב-`.env.example` | MEDIUM | P1 | החלפה ל-`CHANGE_ME` + boot validation |
| E-06 | Webhook לא מאמת HMAC signature → `META_APP_SECRET` לא בשימוש | HIGH | P1 | crypto.createHmac verification |
| E-07 | אין key rotation policy/runbook | MEDIUM | P2 | `SECRETS-ROTATION.md` |
| E-08 | Verify token comparison לא timing-safe | LOW | P3 | `crypto.timingSafeEqual` |
| E-09 | CORS open-to-all — לא crypto ישיר, אבל פוגע בהגנת transit | MEDIUM | P2 | whitelist origins |
| E-10 | אין ולידציה שה-`SUPABASE_URL` מתחיל ב-`https://` | LOW | P3 | startup check |

**סה"כ:** 10 ממצאים ייחודיים. **0 קוד קריפטו ביתי (good)**. רוב הסיכונים נובעים מ-absence ולא מ-bugs — כלומר תיקונים פשוטים וזולים.

---

## 8. נקודות חיוביות

1. אין DIY crypto — שימוש במודולים סטנדרטיים בלבד.
2. כל ה-outbound HTTPS calls (Meta, Twilio) דרך `https.request` — לא `http`.
3. Supabase URL ב-template משתמש ב-`https://` מראש.
4. Encryption-at-rest מובטח ע"י Supabase ללא עבודה נוספת.
5. הפרדת `.env.example` מ-`.env` (אם `.gitignore` יתוקן) היא פרקטיקה תקנית.
6. הקוד לא כותב סודות ל-console / logs (חיפשתי `console.log` + `TOKEN` + `SECRET` — נקי).

---

## 9. Cross-Reference עם QA-WAVE1-DIRECT-FINDINGS

ממצאים חופפים (מוזכרים כאן לשלמות בלבד, לא מהווים ממצאים חדשים):
- **B-02 (WhatsApp webhook לא מאומת)** — QA-WAVE1 התמקד באימות כללי; Agent-29 מוסיף את ההיבט של `META_APP_SECRET` management.
- **Timing-safe verify token** — QA-WAVE1 הזכיר, מופיע כאן בקצרה (E-08) לשלמות המטריקס.

ממצאים **ייחודיים ל-Agent-29** (לא ב-Wave 1):
- E-01 (HTTPS enforcement)
- E-02 (HSTS)
- E-03 (Column-level encryption)
- E-04 (`.gitignore`)
- E-05 (placeholder verify token)
- E-07 (Key rotation policy)
- E-09 (CORS as transit issue)
- E-10 (URL scheme validation)

---

**סיום דוח — QA Agent #29**
