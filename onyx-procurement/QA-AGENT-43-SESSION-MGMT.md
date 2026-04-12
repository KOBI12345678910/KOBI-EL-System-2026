# QA-AGENT-43 — Session Management Design (Forward-Looking)

**פרויקט:** onyx-procurement (Techno Kol Uzi)
**תאריך:** 2026-04-11
**סוכן:** QA Agent #43
**ממד:** עיצוב ניהול הפעלות (Session Management) — ראייה קדימה
**שיטה:** Static analysis בלבד
**סטטוס קיים:** אין אימות בכלל (B-03). `server.js` משתמש ב-Supabase `ANON_KEY` ללא בדיקת זהות לפני כל endpoint, אין middleware, אין קוקיז, אין JWT, אין login/logout. WhatsApp token קיים — אבל זה token מערכת, לא משתמש.
**תלויות רלוונטיות ב-package.json:** `@supabase/supabase-js@^2.45.0`, `express@^4.21.0`, `cors@^2.8.5`. לא מותקנים: `jsonwebtoken`, `express-session`, `cookie-parser`, `bcrypt`, `helmet`, `express-rate-limit`, `speakeasy` (TOTP).

---

## תקציר מנהלים (Executive Summary)

המערכת מוכנה אדריכלית לאימוץ **Supabase Auth** כפתרון ניהול הפעלות מלא, משום ש:
1. ה-SDK כבר מותקן ובשימוש לצורך גישה לטבלאות.
2. `auth.users` הוא טבלה מובנית ב-Supabase שמספקת users table ללא עבודה.
3. RLS (Row-Level Security) של Supabase יכול להחליף באופן מלא middleware מותאם אישית — כל הרשאה תיאכף בשכבת ה-DB.
4. הפרויקט מנוהל על-ידי משתמש יחיד (Kobi) במקור, כך שניתן להתחיל פשוט ולהרחיב.

**המלצה עיקרית:** אל תבנו אימות מותאם אישית (custom JWT + bcrypt + sessions table). השתמשו ב-Supabase Auth מתוך הקופסה עם מדיניות RLS לכל טבלה (`purchase_orders`, `suppliers`, `audit_log` וכו').

**חמש בעיות קריטיות שיש למנוע מראש:**
- C-01: שימוש ב-`SUPABASE_ANON_KEY` בצד-שרת ללא RLS = כל מבקר קורא את כל הנתונים.
- C-02: אחסון JWT ב-`localStorage` במקום ב-cookie `httpOnly` → חשיפה ל-XSS.
- C-03: העדר refresh token rotation → token ארוך-חיים שנגנב = גישה לצמיתות.
- C-04: העדר mechanism ל-revoke בעת logout → session ממשיך להיות תקף ברמת ה-JWT.
- C-05: העדר rate-limit על login → brute-force אפשרי מיידית (קשור ל-Agent #41).

---

## 1. מודל הפעלות מומלץ: JWT vs Server Session vs Supabase Auth

### השוואה לפי דרישות הפרויקט

| קריטריון | JWT מותאם | Server Session (express-session + Redis) | **Supabase Auth (מומלץ)** |
|---|---|---|---|
| זמן מימוש | 2-3 ימים | 3-4 ימים (+הקמת Redis) | 4-8 שעות |
| תחזוקה שוטפת | גבוהה (סיבוב מפתחות, חידוש, revocation) | בינונית (Redis ops) | נמוכה (Supabase מתחזק) |
| עלות | חינם | עלות Redis | כלול ב-Supabase Free Tier (עד 50K MAU) |
| revoke מיידי | קשה (blacklist נדרש) | קל (מחיקה מ-Redis) | קל (`supabase.auth.signOut({scope:'global'})`) |
| אינטגרציה RLS | ידנית | ידנית | **אוטומטית — `auth.uid()` זמין ב-Policies** |
| Multi-device | ידני | ידני | מובנה |
| Password reset | יש לבנות | יש לבנות | מובנה (magic link / email OTP) |
| OAuth (Google) | יש לבנות | יש לבנות | מובנה |
| 2FA | יש לבנות | יש לבנות | מובנה (TOTP/SMS בגרסת Pro) |

### המלצה סופית

**Supabase Auth** בשל:
1. **Zero-config users table:** טבלה `auth.users` קיימת כבר, מזהה UUID יציב, עמודת `email`, `encrypted_password` (bcrypt), `last_sign_in_at`, `raw_user_meta_data`.
2. **Session JWT ניתן ע"י Supabase עצמו** — חתום ב-HS256 עם `SUPABASE_JWT_SECRET`.
3. **`supabase.auth.getUser(token)`** מאמת את ה-JWT ומחזיר משתמש — ניתן להשתמש בו כ-middleware.
4. **RLS Policies** מאפשרות הפרדה בין kobi (owner) לבין ספקים/בעלי-תפקיד בעתיד — `CREATE POLICY "owner_read" ON purchase_orders FOR SELECT USING (auth.uid() = owner_id);`
5. **מפתחות:** יש להחליף את `SUPABASE_ANON_KEY` בצד-שרת ב-`SUPABASE_SERVICE_ROLE_KEY` **רק** ל-endpoints אדמיניסטרטיביים, ולחייב `Authorization: Bearer <user-jwt>` בכל השאר.

### מתי לא לבחור Supabase Auth
- אם נדרש SSO ארגוני (SAML) ללא תוכנית Pro — לשקול Auth0.
- אם הפרויקט עובר מ-Supabase לעתיד — אז JWT נייטרלי עדיף.
- בפרויקט הזה: אף אחד מהחששות לא רלוונטי.

---

## 2. אינטגרציית Supabase Auth — הדרך הקלה

### צעדים קונקרטיים (מינימום לקבלת אימות עובד):

**שלב 1 — הוסף middleware ב-`server.js`:**

```js
// חדש - אחרי יצירת ה-supabase client
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'invalid_token' });

  req.user = user;
  next();
}
```

**שלב 2 — החל על כל route של כתיבה:**

```js
app.post('/api/purchase-orders', requireAuth, async (req, res) => { ... });
app.put('/api/suppliers/:id', requireAuth, async (req, res) => { ... });
app.delete('/api/documents/:id', requireAuth, async (req, res) => { ... });
```

**שלב 3 — RLS בדשבורד Supabase:**

```sql
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_read_po" ON purchase_orders FOR SELECT
  USING (auth.uid() IS NOT NULL);  -- להתחיל רחב
CREATE POLICY "owner_write_po" ON purchase_orders FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
```

**שלב 4 — צד-לקוח (Frontend):**

```js
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'kobi@technokoluzi.co.il',
  password: '...'
});
// data.session.access_token נשלח ב-Authorization header
```

**מאמץ כולל:** 4-8 שעות לעובד, לא יותר. זה טריוויאלי.

### יצירת משתמש Kobi הראשון

דרך דשבורד Supabase: **Authentication → Users → Invite** או:
```sql
-- לא מומלץ — עדיף דרך ה-API
SELECT auth.admin_create_user('kobi@technokoluzi.co.il', 'StrongPassword1!');
```

---

## 3. Session Timeout: Idle vs Absolute

### הגדרה

- **Idle timeout** — session פג אם המשתמש לא פעיל N דקות (דורש מעקב פעילות).
- **Absolute timeout** — session פג אחרי N שעות/ימים מהלוגין, ללא קשר לפעילות (default ב-JWT).

### המלצה לפרויקט

| פרמטר | ערך מומלץ | מקום הגדרה |
|---|---|---|
| Access token TTL | **1 שעה** (ברירת מחדל של Supabase) | Supabase Dashboard → Auth Settings → JWT expiry |
| Refresh token TTL | **7 ימים** (מוגן-מכשיר) | Supabase Dashboard → Auth Settings → Refresh Token Reuse Interval |
| Idle timeout פרונט | **30 דקות ללא פעילות** → force re-login | Frontend: `onIdle` listener |
| Absolute max session | **12 שעות** ליום עבודה רגיל | Combined: idle + refresh policy |

### מדוע 1 שעה ל-access token?
- קצר דיו לצמצום נזק מגניבה.
- ארוך דיו למנוע סיבובי רענון מתמידים.
- Supabase SDK מחדש אוטומטית `refreshSession()` לפני הפקיעה.

### מימוש Idle Timeout (Frontend)

```js
let idleTimer;
function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    supabase.auth.signOut();
    location.href = '/login?reason=idle';
  }, 30 * 60 * 1000); // 30 דקות
}
['mousemove','keydown','click','scroll'].forEach(ev =>
  document.addEventListener(ev, resetIdle, { passive: true })
);
resetIdle();
```

---

## 4. Refresh Token Rotation

### הבעיה
Refresh token ארוך-חיים שנגנב = גישה לצמיתות. ללא סיבוב, התוקף יכול להשתמש בו שוב ושוב.

### הפתרון של Supabase (מובנה!)

Supabase מיישם **Refresh Token Rotation + Reuse Detection** אוטומטית:
1. כל קריאה ל-`/auth/v1/token?grant_type=refresh_token` מחזירה:
   - חדש `access_token` (1 שעה)
   - חדש `refresh_token` (ה-ישן מבוטל מיד)
2. אם תוקף מנסה להשתמש ב-refresh token ישן (reuse) → **כל family ההפעלות מבוטלות**.
3. המשתמש מתבקש להתחבר מחדש.

### מה צריך להפעיל

**ב-Supabase Dashboard → Authentication → Settings:**
- `Refresh Token Rotation Enabled` = ON (ברירת מחדל ב-v2 מופעל)
- `Refresh Token Reuse Interval` = 10 שניות (זמן חסד לתקלות רשת)

**לא נדרש קוד צד-שרת** — Supabase SDK לוקח אחריות מלאה.

### בדיקה לוודא
ב-`.env` — `SUPABASE_JWT_SECRET` חייב להיות שונה מ-`SUPABASE_ANON_KEY`. חובה לוודא שהמפתחות לא דלפו ל-git (קישור ל-Agent #03 /.gitignore).

---

## 5. Logout — מנגנון Revocation

### בעיית JWT הכללית
JWT אינו ניתן ל-revoke בשרת-less — הוא תקף עד לפקיעה. לכן logout אמיתי דורש מאחד מהבאים:
1. **Blacklist** (Redis/DB) עם `jti` של כל token מבוטל.
2. **Short-lived access tokens** + `revoked` flag ברפרש טוקן בלבד.
3. **Session ID** בטבלה מרכזית.

### פתרון Supabase — מובנה

```js
// Frontend - logout רגיל (מכשיר נוכחי בלבד)
await supabase.auth.signOut(); // scope: 'local' (default)

// Frontend - logout מכל המכשירים (global)
await supabase.auth.signOut({ scope: 'global' });

// Frontend - logout מכל המכשירים חוץ מהנוכחי
await supabase.auth.signOut({ scope: 'others' });
```

**איך זה עובד מאחורי הקלעים:**
- Supabase מנהל טבלה פנימית `auth.refresh_tokens` עם דגל `revoked`.
- ב-`signOut` ה-refresh token הנוכחי (או כל refresh tokens של המשתמש) מסומנים כ-revoked.
- ה-access token עדיין תקף עד לפקיעה (1 שעה) — זה trade-off מקובל.

### הגנה חזקה יותר (אם נדרש revoke מיידי)

הוסף בדיקה ב-middleware (דוחה tokens של משתמשים שבוצע להם global signout אחרי ה-`iat`):

```js
async function requireAuth(req, res, next) {
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return res.status(401).end();

  // בדוק אם בוצע signout גלובלי אחרי ה-token iat
  const { data: profile } = await supabase
    .from('profiles')
    .select('last_global_signout_at')
    .eq('id', user.id).single();

  const tokenIat = user.created_at; // או payload.iat אם תבדוק ידנית
  if (profile?.last_global_signout_at > tokenIat) {
    return res.status(401).json({ error: 'session_revoked' });
  }
  req.user = user;
  next();
}
```

---

## 6. Multi-Device Sessions — רשימת הפעלות פעילות

### הצורך
המשתמש (Kobi) עשוי לעבוד מ:
- מחשב משרדי
- לפטופ ביתי
- טלפון
- iPad

אם גניבת מכשיר התרחשה, צריך לראות "אילו מכשירים פעילים?" ולבצע revoke סלקטיבי.

### מימוש על Supabase

**אפשרות A — שאילתה ישירה (דורש Service Role):**
```sql
-- לא זמין ל-anon, רק admin API
SELECT id, user_id, created_at, updated_at, parent
FROM auth.refresh_tokens
WHERE user_id = '<uid>' AND revoked = false;
```

**אפשרות B — טבלת sessions מותאמת (מומלץ ל-UX טוב):**
```sql
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  device_name TEXT,        -- "Chrome on MacBook Pro"
  user_agent TEXT,
  ip_address INET,
  city TEXT,               -- מתוך GeoIP
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  revoked BOOLEAN DEFAULT false
);

CREATE INDEX idx_user_sessions_user ON user_sessions(user_id) WHERE revoked = false;
```

**עדכון middleware לכתיבת last_seen:**
```js
await supabase.from('user_sessions').upsert({
  user_id: user.id,
  user_agent: req.headers['user-agent'],
  ip_address: req.ip,
  last_seen_at: new Date().toISOString()
}, { onConflict: 'user_id,user_agent' });
```

**UI:**
```
/settings/sessions
┌──────────────────────────────────────────────┐
│ מכשירים פעילים                               │
├──────────────────────────────────────────────┤
│ Chrome on Windows · תל אביב · לפני 2 דק׳ ◉ │
│ Safari on iPhone  · חיפה   · לפני 3 שעות [נתק]│
│ Firefox on Mac    · משרד   · אתמול     [נתק]│
├──────────────────────────────────────────────┤
│ [נתק מכל המכשירים האחרים]                   │
└──────────────────────────────────────────────┘
```

---

## 7. אחסון Session: Cookie vs Authorization Header

### המלצה: **Cookie httpOnly + Secure + SameSite=Strict** (או Lax)

### השוואה

| קריטריון | Cookie httpOnly | localStorage + Authorization |
|---|---|---|
| חשיפה ל-XSS | **לא** (JS לא יכול לקרוא) | **כן** — כל XSS = גניבת token |
| חשיפה ל-CSRF | **כן** — דורש הגנה נוספת | **לא** — אין שליחה אוטומטית |
| צריך CORS credentials | כן | לא |
| קל למימוש עם SPA | בינוני | קל |
| מתאים ל-mobile app | קשה | קל |

### הגדרות קוקיז מומלצות

```js
res.cookie('sb-access-token', accessToken, {
  httpOnly: true,                  // קריטי — לא נגיש ל-JS
  secure: true,                    // רק HTTPS (production)
  sameSite: 'Strict',              // מבטל CSRF רוב המקרים
  maxAge: 60 * 60 * 1000,          // 1 שעה
  path: '/',
  domain: '.technokoluzi.co.il'    // אם יש sub-domains
});

res.cookie('sb-refresh-token', refreshToken, {
  httpOnly: true,
  secure: true,
  sameSite: 'Strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ימים
  path: '/auth/refresh'            // הגבלה ל-endpoint מסוים
});
```

### Supabase SDK default הוא localStorage — יש לעקוף!

```js
// server-side cookie handling
const supabase = createClient(url, anonKey, {
  auth: {
    storage: {
      getItem: (key) => req.cookies[key],
      setItem: (key, val) => res.cookie(key, val, { httpOnly: true, secure: true }),
      removeItem: (key) => res.clearCookie(key)
    }
  }
});
```

**חלופה פשוטה לפרויקט קטן:** אם יש רק ממשק SPA אחד ו-kobi בלבד משתמש — ניתן להישאר ב-localStorage **זמנית**, אבל יש להוסיף CSP חזקה (Content-Security-Policy) כדי לצמצם XSS (קישור ל-Agent אחר בנושא XSS).

---

## 8. הגנות Session Fixation

### הבעיה
תוקף יכול לקבוע session ID למשתמש מראש (למשל דרך URL `?session=abc`), ואז לגשת אל הקורבן.

### הגנות נדרשות

1. **רוטציית session-id אחרי login:** Supabase מייצר JWT חדש לחלוטין אחרי `signInWithPassword` → **מוגן אוטומטית**.

2. **לא לקבל tokens מ-URL params:**
   - Supabase עושה זאת ב-OAuth flow (`#access_token=...` ב-fragment), אבל זה רגע חטוף — יש להעביר מיד לאחסון מאובטח.
   - אל תקבלו access tokens מ-query strings לעולם.

3. **Regenerate אחרי הרשאה עולה:** אם משתמש עובר מ-user ל-admin — יש להוציא re-auth.

4. **Bind session ל-IP/User-Agent (אופציונלי, זהיר):**
   ```js
   if (session.ip !== req.ip) {
     await supabase.auth.signOut();
     return res.status(401).json({ error: 'ip_changed' });
   }
   ```
   **אזהרה:** לקוחות mobile/4G משנים IP תדיר — עלול לגרום ל-false positives. עדיף לבדוק רק שינוי ASN/country.

5. **Origin / Referer check ב-state-changing endpoints:**
   ```js
   const origin = req.headers.origin || req.headers.referer;
   if (!origin?.startsWith('https://onyx.technokoluzi.co.il')) {
     return res.status(403).end();
   }
   ```

---

## 9. Account Lockout לאחר N ניסיונות כושלים

### קשור ל-Agent #41 (rate-limiting)

### הבעיה
Brute-force על סיסמת kobi = 86,400 ניסיונות ביום ללא הגנה. לא קשה לשבור סיסמאות חלשות.

### מדיניות מומלצת (NIST 800-63B + פרקטיקה)

| שלב | ניסיונות כושלים | פעולה |
|---|---|---|
| 1 | 1-4 | ללא השהיה |
| 2 | 5-9 | השהיה של 2 שניות אחרי כל ניסיון |
| 3 | 10-14 | CAPTCHA נדרש |
| 4 | 15-19 | נעילה זמנית — 15 דקות |
| 5 | 20+ | נעילה ממושכת + מייל אזהרה ל-kobi |

### מימוש על Supabase

**אפשרות A — הגדרות Supabase מובנות:**
Supabase **לא** כולל lockout אוטומטי ב-Free tier. בתוכנית Pro יש Rate Limits ל-auth endpoints.

**אפשרות B — טבלת מעקב + trigger:**

```sql
CREATE TABLE auth_attempts (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  ip_address INET,
  success BOOLEAN,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_auth_attempts_email ON auth_attempts(email, attempted_at DESC);

CREATE TABLE account_lockouts (
  email TEXT PRIMARY KEY,
  locked_until TIMESTAMPTZ,
  reason TEXT
);
```

**ב-middleware של `/api/auth/login`:**
```js
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  // בדוק נעילה
  const { data: lockout } = await supabase
    .from('account_lockouts')
    .select('locked_until')
    .eq('email', email).single();
  if (lockout && new Date(lockout.locked_until) > new Date()) {
    return res.status(429).json({ error: 'account_locked', until: lockout.locked_until });
  }

  // בדוק כמה ניסיונות כושלים ב-15 דק' האחרונות
  const { count: failed } = await supabase
    .from('auth_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('email', email).eq('success', false)
    .gte('attempted_at', new Date(Date.now() - 15*60*1000).toISOString());

  if (failed >= 10) {
    await supabase.from('account_lockouts').upsert({
      email,
      locked_until: new Date(Date.now() + 15*60*1000).toISOString(),
      reason: 'brute_force_protection'
    });
    // שלח WhatsApp ל-kobi
    await sendWhatsApp(process.env.KOBI_PHONE,
      `🚨 אזהרת אבטחה: זוהו 10 ניסיונות כושלים לחשבון ${email}. הנעילה מופעלת ל-15 דקות.`);
    return res.status(429).json({ error: 'too_many_attempts' });
  }

  // נסה התחברות
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  // רשום ניסיון
  await supabase.from('auth_attempts').insert({
    email, ip_address: req.ip, success: !error
  });

  if (error) return res.status(401).json({ error: 'invalid_credentials' });
  res.json({ session: data.session });
});
```

### התרעה במערכת הקיימת
הפרויקט כבר כולל `sendWhatsApp()` ו-`audit()` — יש להשתמש בהם:
```js
await audit('auth', email, 'login_locked', 'system',
  `נעילה אחרי ${failed} ניסיונות כושלים`, null, { ip: req.ip });
```

---

## 10. Password Reset Flow — Magic Links של Supabase

### למה לא סיסמאות ב-reset?
1. Forgot password → הזנת מייל → שליחת קישור.
2. הקישור מכיל token ארוך-חיים (שעה).
3. המשתמש לוחץ → מגיע לטופס "הגדר סיסמה חדשה".
4. השרת מאמת את ה-token ומעדכן.

Supabase עושה את כל זה מובנה.

### זרימה ב-Supabase

```js
// שלב 1 - בקשת reset
const { error } = await supabase.auth.resetPasswordForEmail(
  'kobi@technokoluzi.co.il',
  { redirectTo: 'https://onyx.technokoluzi.co.il/reset-password' }
);
// Supabase שולח מייל עם magic link

// שלב 2 - אחרי שהמשתמש לוחץ ומגיע ל-/reset-password
// ה-URL מכיל #access_token=... ו-#type=recovery
const { data, error } = await supabase.auth.updateUser({
  password: newPassword
});
```

### תצורת Email Template (Supabase Dashboard → Authentication → Templates)

```html
<h2>איפוס סיסמה — ONYX Procurement</h2>
<p>שלום,</p>
<p>התקבלה בקשה לאפס את הסיסמה בחשבון שלך.</p>
<p><a href="{{ .ConfirmationURL }}">לחץ כאן לאפס סיסמה</a></p>
<p>הקישור תקף לשעה. אם לא ביקשת זאת — התעלם.</p>
<p>צוות ONYX - Techno Kol Uzi</p>
```

### הגנות נדרשות

1. **Rate limit על bcrypt:** שלח לא יותר מ-3 בקשות reset לאותו מייל ב-שעה (ב-Supabase Dashboard).
2. **Leak אם email קיים:** החזר תשובה זהה בין "מייל נשלח" ל-"מייל לא קיים" → מנע enumeration.
3. **Magic link חד-פעמי:** Supabase מבטל את ה-token אחרי שימוש ראשון.
4. **Force new password ≠ old password:** לא מובנה ב-Supabase — יש להוסיף צד-לקוח.
5. **HSTS + HTTPS בלבד:** מניעת sniffing על הקישור.

### חלופה מתקדמת — Magic Link במקום סיסמה

לפרויקט של משתמש יחיד (kobi), ניתן **לוותר על סיסמאות לגמרי**:

```js
await supabase.auth.signInWithOtp({
  email: 'kobi@technokoluzi.co.il',
  options: { emailRedirectTo: 'https://onyx.technokoluzi.co.il/callback' }
});
```

**יתרונות:** אין סיסמה לגנוב, אין reset flow, אין brute force.
**חסרונות:** תלוי במייל (אם ה-inbox פרוץ — גם המערכת פרוצה).

**המלצה:** סיסמה + 2FA → הכי חזק.

---

## 11. 2FA — TOTP מול SMS

### המלצה: **TOTP (Google Authenticator / Authy)** > SMS

### השוואה

| קריטריון | TOTP | SMS (למספר ישראלי) |
|---|---|---|
| עלות | חינם | ₪0.05-0.20 להודעה (Twilio) |
| SIM swap | חסון | **פגיע** — תוקף יכול לגנוב מספר |
| דורש אינטרנט | לא (offline) | לא (GSM) |
| חסין מ-phishing | יותר | פחות (קל לדוג OTP) |
| זמינות בישראל | 100% | חלש בהרים/מחוץ לכיסוי |
| הסטנדרט של NIST | **מומלץ** | **לא מומלץ** (דפירקטד ב-NIST 800-63B) |

### מימוש TOTP עם Supabase

Supabase תומך ב-MFA מובנה (Pro plan). ב-Free plan — יש לבנות:

**התקנה:**
```bash
npm install speakeasy qrcode
```

**טבלה:**
```sql
ALTER TABLE auth.users ADD COLUMN mfa_secret TEXT;
ALTER TABLE auth.users ADD COLUMN mfa_enabled BOOLEAN DEFAULT false;
ALTER TABLE auth.users ADD COLUMN mfa_backup_codes TEXT[];
```

**זרימת הקמה:**
```js
// שלב 1 - יצירת secret
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

app.post('/api/mfa/setup', requireAuth, async (req, res) => {
  const secret = speakeasy.generateSecret({
    name: `ONYX Procurement (${req.user.email})`,
    length: 32
  });
  await supabase.from('user_mfa').upsert({
    user_id: req.user.id,
    secret: secret.base32,
    enabled: false
  });
  const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);
  res.json({ qr: qrDataUrl, secret: secret.base32 });
});

// שלב 2 - אימות והפעלה
app.post('/api/mfa/verify', requireAuth, async (req, res) => {
  const { code } = req.body;
  const { data } = await supabase.from('user_mfa')
    .select('secret').eq('user_id', req.user.id).single();

  const valid = speakeasy.totp.verify({
    secret: data.secret, encoding: 'base32',
    token: code, window: 1
  });
  if (!valid) return res.status(401).json({ error: 'invalid_code' });

  // צור backup codes
  const backupCodes = Array.from({length: 10}, () =>
    Math.random().toString(36).slice(2, 10).toUpperCase()
  );
  await supabase.from('user_mfa').update({
    enabled: true,
    backup_codes: backupCodes.map(c => hashCode(c))
  }).eq('user_id', req.user.id);

  res.json({ backup_codes: backupCodes }); // הצג פעם אחת ודאי
});
```

**ב-login flow:**
```js
// אחרי signInWithPassword הצליח
if (user.mfa_enabled) {
  // החזר session זמני שמאפשר רק endpoint של MFA
  return res.json({ mfa_required: true, temp_token: ... });
}
```

### SMS כגיבוי

ניתן להוסיף SMS **רק כ-fallback** (אם המשתמש איבד את האפליקציה):
- הפרויקט כבר כולל `sendSMS()` דרך Twilio.
- שמור backup codes hashed.
- יידע למשתמש: "SMS פחות מאובטח — עדיף backup code."

---

## 12. Single Sign-On — Google לעתיד (ל-Kobi)

### מוטיבציה
- Kobi כבר יש Google account.
- לא צריך לזכור עוד סיסמה.
- ניצול הגנות Google (MFA, התרעות login).

### Supabase מספק OAuth מובנה

**צעדים:**
1. **Google Cloud Console:**
   - צור OAuth 2.0 Client ID
   - Authorized redirect URI: `https://<your-project>.supabase.co/auth/v1/callback`
2. **Supabase Dashboard → Authentication → Providers → Google:**
   - הפעל
   - הזן Client ID + Client Secret
3. **Frontend:**
   ```js
   await supabase.auth.signInWithOAuth({
     provider: 'google',
     options: {
       redirectTo: 'https://onyx.technokoluzi.co.il/dashboard',
       queryParams: { access_type: 'offline', prompt: 'consent' }
     }
   });
   ```

**זהו.** Supabase לוקח אחריות על:
- Exchange code → token
- יצירת `auth.users` row
- ניהול refresh

### הגבלת Domain (חשוב ל-Techno Kol Uzi)

אם בעתיד יהיו מספר עובדים — הגבל login רק ל-`@technokoluzi.co.il`:

**ב-Supabase Hook (Database Trigger):**
```sql
CREATE OR REPLACE FUNCTION public.check_email_domain()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email NOT LIKE '%@technokoluzi.co.il' AND
     NEW.email != 'kobi@gmail.com' THEN
    RAISE EXCEPTION 'Domain not allowed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_email_domain
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION check_email_domain();
```

### מעבר מ-password ל-SSO (Migration)

כשעובר ל-SSO, `auth.users` שכבר קיימים יכולים לקשר:
```sql
-- Kobi יכול לחבר את Google account למשתמש הקיים
UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data ||
  '{"provider": "google"}'::jsonb WHERE email = 'kobi@...';
```

Supabase מטפל בזה אוטומטית כש-kobi מתחבר דרך Google לראשונה.

---

## סיכום המלצות — טבלה מקוצרת

| נושא | המלצה | עדיפות | מאמץ |
|---|---|---|---|
| 1. מודל | Supabase Auth | **P0** | 8 שעות |
| 2. Users table | `auth.users` מובנה | **P0** | כלול |
| 3. Timeout | 1h access + 7d refresh + 30m idle | P0 | 2 שעות |
| 4. Refresh rotation | Supabase default (ON) | **P0** | 0 |
| 5. Logout | `signOut({scope:'global'})` | P0 | 1 שעה |
| 6. Multi-device | `user_sessions` table | P1 | 4 שעות |
| 7. Storage | Cookie httpOnly + Secure + SameSite | **P0** | 3 שעות |
| 8. Fixation | Origin check + Regenerate on privilege | P0 | 2 שעות |
| 9. Lockout | 10 ניסיונות → נעילה 15 דק' | **P0** | 4 שעות |
| 10. Password reset | Supabase magic link | P0 | 2 שעות |
| 11. 2FA | TOTP (speakeasy) | P1 | 6 שעות |
| 12. SSO Google | Supabase OAuth provider | P2 | 2 שעות |

**סה"כ מאמץ מומלץ:** ~34 שעות ליישום מלא של Session Management בסיסי מאובטח, כולל 2FA. P0 בלבד = ~20 שעות.

---

## מה חייב להיות **לפני** השקת אימות

1. **אל תשתמש ב-`ANON_KEY` ב-production ללא RLS מופעל** — כרגע המצב הוא חשיפה טוטלית.
2. **סבב מפתחות Supabase** לפני הפעלת אימות — אם MIT/secrets דלפו ב-git history.
3. **HTTPS חובה** — ללא HTTPS, cookies + JWT לא מוגנים.
4. **Rate limit על כל `/api/auth/*`** (ראה Agent #41).
5. **CSP headers** (ראה Agent XSS) — מצמצם גניבת token מ-localStorage אם נשארים שם.
6. **Audit log לכל login/logout/failed** — הפרויקט כבר יש לו `audit_log`, להשתמש.

---

## חולשות שיש למנוע — Checklist

- [ ] אין שימוש ב-`ANON_KEY` כ-Service Role
- [ ] אין JWT ב-URL query string
- [ ] אין passwords בטבלה מותאמת (השתמש ב-`auth.users`)
- [ ] אין storage של access token ב-localStorage ללא CSP
- [ ] יש `httpOnly` על כל cookie session
- [ ] יש `Secure` על כל cookie (HTTPS בלבד)
- [ ] יש `SameSite=Strict` על session cookies
- [ ] יש CSRF token ב-forms (אם משתמשים ב-cookies)
- [ ] יש rotation ל-refresh tokens
- [ ] יש revoke flow ל-logout
- [ ] יש lockout אחרי 10 ניסיונות
- [ ] יש audit log לכל login/logout/lockout
- [ ] יש headers: HSTS, X-Frame-Options, X-Content-Type-Options
- [ ] יש 2FA לפחות ל-admin (kobi)
- [ ] יש email notification ב-login ממכשיר חדש

---

**הערה חשובה — היקף:**
המסמך הזה *מעצב* את העתיד, לא מתקן את ההווה. המצב הנוכחי של `server.js` — **אפס אימות** — הוא סיכון קריטי שמסומן כ-B-03. מסמך זה הוא מפת הדרכים ליציאה מהמצב הזה בצעדים מסודרים.

**לא נבדק כאן (מחוץ להיקף Agent #43):**
- CSRF protection (Agent אחר)
- XSS/CSP (Agent אחר)
- Rate limiting טכני (Agent #41)
- SQL injection (Agent אחר)
- Secret scanning ב-git (Agent #03)

**תאריך בניית המסמך:** 2026-04-11
**גרסת Supabase JS SDK שנבדקה:** ^2.45.0 (package.json)
**גרסת Express:** ^4.21.0
