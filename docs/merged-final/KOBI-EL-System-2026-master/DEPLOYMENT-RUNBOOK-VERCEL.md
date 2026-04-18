# 🚀 DEPLOYMENT RUNBOOK — Vercel + Railway + Supabase

> **סוג המערכת:** אפליקציה פנימית (Dashboard) — Palantir-grade ERP לשימוש פנימי של Techno-Kol Uzi.
> **הסטאק שבחרת:** `Frontend: Vercel · Backend: Railway · DB+Auth: Supabase · Code: GitHub · Domain: Vercel`.
> **עודכן:** 2026-04-16
> **חוק ברזל:** לא מוחקים, רק משדרגים ומגדלים.

---

## למה הסטאק הזה ולא GCP?

| שיקול | GCP מלא | Vercel+Railway+Supabase |
|---|---|---|
| זמן הקמה | 2–3 ימים | **30–60 דק'** |
| עלות התחלתית | $50–150/חודש | **$0 (free tier מספיק להתחלה)** |
| תחזוקה | SSH, nginx, certbot, pm2, fail2ban | **0 — הכל managed** |
| גיבויים | להגדיר ידנית | **Supabase יומי אוטומטי** |
| SSL | certbot manual | **אוטומטי ב-Vercel** |
| CI/CD | לבנות | **push→deploy אוטומטי ב-Vercel+Railway** |

**שורה תחתונה:** עם 4 שירותים של Techno-Kol (techno-kol-ops + onyx-procurement + payroll-autonomous + onyx-ai) — סטאק Vercel/Railway/Supabase מספיק לגמרי. GCP זה over-kill. **הלך על המדריך הזה.**

---

## ⚠️ 3 טעויות קריטיות (אותן החוקים תקפים גם פה)

| # | טעות | הגנה |
|---|---|---|
| 1 | **להעלות בלי QA** | לפני push ל-GitHub, הרץ: `cd onyx-procurement && node src/reports/grand-aggregator.js` — חובה `GO` + `100%`. ✅ כרגע: 336/336 ירוק. |
| 2 | **לא להגדיר RLS ב-Supabase** | כל טבלה חייבת `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + policies מפורשות. בלי זה — `anon key` קורא את הכל! |
| 3 | **ENV VARS ב-GitHub** | לעולם לא לדחוף `.env` — הכנס הכל ל-Vercel/Railway Environment Variables UI. בדוק `.gitignore` כולל `.env*`. |

---

## שלב 0 — אפס לפני שמתחילים (5 דק')

### 0.1 QA מקומי — חובה GREEN

```bash
cd "C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement"
node -e "require('./src/reports/grand-aggregator.js').aggregateAll().then(r=>console.log('VERDICT:',r.verdict.verdict,'| COMPLETION:',((r.summary.completion_rate||0)*100).toFixed(1)+'%'))"
```
חייב: `VERDICT: GO | COMPLETION: 100.0%`.

### 0.2 גיבוי מקומי

```bash
# מהשורש
$TS = Get-Date -Format "yyyyMMdd-HHmmss"
$BD = "./backups/backup-$TS"
New-Item -ItemType Directory -Path $BD -Force | Out-Null
tar --exclude="**/node_modules" --exclude="**/dist" --exclude=".git" `
    -czf "$BD/source-code.tar.gz" `
    onyx-procurement onyx-ai techno-kol-ops payroll-autonomous paradigm_engine
Copy-Item -Recurse ./_qa-reports "$BD/_qa-reports"
Write-Host "✅ Backup: $BD"
```

### 0.3 `.gitignore` — בדיקה

וודא שיש בו:
```
node_modules/
dist/
.env
.env.*
!.env.example
*.log
/backups/
sa-key.json
.vercel
.railway
```

---

## שלב 1 — GitHub (10 דק')

### 1.1 יצירת repo פרטי

1. https://github.com/new
2. Owner: `kobi-el` (או ה-org)
3. Repository name: **`techno-kol-uzi-erp`**
4. **Private** ✅ (המערכת פנימית — לא ציבורית!)
5. Add .gitignore: None (יש לך)
6. `Create repository`

### 1.2 Push הקוד

```bash
cd "C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL"

git init
git add .
git commit -m "chore: initial commit — ERP 2026 baseline, QA GO verdict 336/336"
git branch -M main
git remote add origin https://github.com/kobi-el/techno-kol-uzi-erp.git
git push -u origin main
```

**וידוא:** חזור ל-GitHub → Code → אתה רואה את כל התיקיות. **אבל אין `.env` — רק `.env.example`**.

### 1.3 Branch Protection (חשוב!)

ב-GitHub: `Settings → Branches → Add rule` על `main`:
- ☑ Require pull request before merging
- ☑ Require status checks to pass
- ☑ Do not allow bypassing

ככה אף אחד (גם לא אתה בטעות) לא דוחף שבור ל-main.

---

## שלב 2 — Supabase (15 דק') — **הבסיס!**

### 2.1 יצירת פרויקט

1. https://supabase.com → Sign in (GitHub)
2. `New project`
3. Name: **`techno-kol-erp`**
4. DB password: `openssl rand -base64 32` → שמור בpassword manager
5. Region: **Frankfurt (eu-central-1)** — הכי קרוב לישראל
6. Plan: Free (אפשר לשדרג בהמשך ל-Pro $25/חודש)
7. `Create new project` — לוקח 2 דק'.

### 2.2 בדיקת DB — טבלאות + קשרים

**אחרי שהפרויקט רץ:**

1. Supabase Dashboard → `SQL Editor` → `New query`
2. הדבק את התוכן של:
   - `onyx-procurement/supabase/migrations/001-supabase-schema.sql`
   - לחץ `Run` → חייב `Success. No rows returned`.
3. שנית — שאילתה 002:
   - `onyx-procurement/supabase/migrations/002-seed-data-extended.sql`
   - `Run`

**וידוא טבלאות:**
1. Dashboard → `Table Editor` → חייב לראות:
   ```
   suppliers, purchase_orders, rfqs, quotes, subcontractors,
   employees, employers, wage_slips, balances,
   vat_periods, vat_invoices, projects, customers,
   bank_accounts, bank_transactions, audit_log
   ```
2. לחץ על כל טבלה → `Definition` tab → וודא:
   - PK + FKs קיימים
   - עמודות `created_at`, `updated_at` קיימות
   - אין עמודות נילוס חסרות

**וידוא קשרים (relations):**
```sql
-- ב-SQL Editor:
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name;
```
חייב לחזור עם ≥ 30 שורות (כל ה-FK מ-QA-09 Database Integrity Audit).

**וידוא אין שדות חסרים:**
```sql
-- בדיקה ש-employees מכיל את כל השדות
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'employees' ORDER BY ordinal_position;
-- חייב: id, employee_id, full_name, id_number, employer_id, role,
--        start_date, hourly_rate, tax_credits_units, work_percentage, …
```

### 2.3 🔴 Row Level Security (RLS) — הכי קריטי!

**ברירת מחדל של Supabase: `anon key` קורא את כל הטבלאות — פריצה מושלמת.**
**חובה** להפעיל RLS על כל טבלה עם דאטה רגיש.

ב-SQL Editor — הרץ את הבלוק הזה:

```sql
-- ========================================
-- RLS — Techno-Kol Uzi ERP
-- ========================================

-- 1. הפעל RLS על כל הטבלאות
ALTER TABLE employees              ENABLE ROW LEVEL SECURITY;
ALTER TABLE employers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE wage_slips             ENABLE ROW LEVEL SECURITY;
ALTER TABLE balances               ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfqs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontractors         ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_periods            ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_invoices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects               ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log              ENABLE ROW LEVEL SECURITY;

-- 2. policies — עובד רואה רק את עצמו, admin רואה הכל
-- ה-JWT של Supabase Auth מכיל: auth.uid() + raw_user_meta_data.role + employee_id

-- 2a. wage-slips — עובד רואה את שלו בלבד, admin/accountant הכל
CREATE POLICY "wage_slips_employee_own" ON wage_slips
  FOR SELECT USING (
    (auth.jwt() ->> 'role') IN ('admin','accountant','manager') OR
    employee_id = (auth.jwt() ->> 'employee_id')
  );
CREATE POLICY "wage_slips_admin_write" ON wage_slips
  FOR ALL USING ((auth.jwt() ->> 'role') IN ('admin','accountant'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('admin','accountant'));

-- 2b. balances — אותה לוגיקה
CREATE POLICY "balances_employee_own" ON balances
  FOR SELECT USING (
    (auth.jwt() ->> 'role') IN ('admin','accountant','manager') OR
    employee_id = (auth.jwt() ->> 'employee_id')
  );

-- 2c. employees — כל authenticated רואה, רק admin/manager כותב
CREATE POLICY "employees_read_authenticated" ON employees
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "employees_admin_write" ON employees
  FOR ALL USING ((auth.jwt() ->> 'role') IN ('admin','manager'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('admin','manager'));

-- 2d. financial (suppliers, POs, RFQs, bank) — accountant + admin + manager
CREATE POLICY "financial_read" ON suppliers FOR SELECT
  USING ((auth.jwt() ->> 'role') IN ('admin','accountant','manager','viewer'));
CREATE POLICY "financial_write" ON suppliers FOR ALL
  USING ((auth.jwt() ->> 'role') IN ('admin','manager'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('admin','manager'));

-- חזור על אותו דפוס ל: purchase_orders, rfqs, quotes, subcontractors
-- (העתק 4 שורות מעל, החלף suppliers)

-- 2e. VAT + bank — accountant בלבד
CREATE POLICY "vat_accountant" ON vat_periods FOR ALL
  USING ((auth.jwt() ->> 'role') IN ('admin','accountant'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('admin','accountant'));
CREATE POLICY "bank_accountant" ON bank_accounts FOR ALL
  USING ((auth.jwt() ->> 'role') IN ('admin','accountant'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('admin','accountant'));

-- 2f. audit_log — read רק admin, כתיבה אוטומטית מ-triggers
CREATE POLICY "audit_admin_read" ON audit_log FOR SELECT
  USING ((auth.jwt() ->> 'role') = 'admin');

-- 3. ביטול public access (חשוב!)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON TABLE public.suppliers TO anon;  -- רק אם רוצים קטלוג ציבורי
-- אחרת אל תעשה GRANT בכלל
```

**וידוא:**
```sql
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;
-- חייב לחזור 0 שורות! אם יש טבלה עם rowsecurity=false — כל העולם קורא אותה.
```

### 2.4 יצירת משתמשים (Auth)

Supabase → `Authentication` → `Users` → `Add user`:

| Email | Password | raw_user_meta_data |
|---|---|---|
| `kobi@technokoluzi.co.il` | חזק (20+ תווים) | `{"role":"admin","employee_id":"U-001","name":"קובי אלקיים"}` |
| `uzi@technokoluzi.co.il` | חזק | `{"role":"admin","employee_id":"U-002","name":"אוזי"}` |
| `accountant@…` | חזק | `{"role":"accountant","employee_id":"U-010"}` |
| `site-mgr@…` | חזק | `{"role":"manager","employee_id":"U-020"}` |
| `employee1@…` | חזק | `{"role":"employee","employee_id":"U-100"}` |
| `viewer@…` | חזק | `{"role":"viewer","employee_id":null}` |

**מי רואה מחירים:**
- **admin + accountant + manager** → מחירי ספקים, תמחור קבלני משנה, wage-slips
- **employee** → wage-slip של עצמו בלבד (נאכף ע"י RLS policy `wage_slips_employee_own`)
- **viewer** → Read-only על suppliers/projects, בלי payroll

### 2.5 API — בדיקה

```bash
# קבל URL + anon key: Project Settings → API
SUPABASE_URL="https://xxxxxxxxxxxxxxxxxxxx.supabase.co"
SUPABASE_ANON_KEY="eyJhbG..."

# בדיקת קריאה (צריך להחזיר [] או רשימת ספקים)
curl "${SUPABASE_URL}/rest/v1/suppliers?select=id,name" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}"

# בדיקת RLS — ללא לוגין, ניסיון לקרוא wage-slips
curl "${SUPABASE_URL}/rest/v1/wage_slips?select=*" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}"
# חייב להחזיר [] ריק — כי RLS חוסם anon!

# בדיקת login → JWT
curl -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"email":"kobi@technokoluzi.co.il","password":"<pwd>"}'
# חוזר עם access_token — שמור, תשתמש בו כ-Bearer אחר כך
```

### 2.6 גיבויים

Supabase → `Database` → `Backups`:
- Free tier: 7-day point-in-time recovery
- Pro tier ($25/month): 30-day PITR + daily logical backup

**הפעל Point-in-Time Recovery:** אוטומטי ב-Free.
**וידוא:** אחרי 24 שעות — תראה לפחות backup אחד ברשימה.

---

## שלב 3 — Vercel (Frontend — 10 דק')

### 3.1 חיבור GitHub

1. https://vercel.com → Sign up with GitHub
2. Dashboard → `Add New` → `Project`
3. Import Git Repository → בחר **`techno-kol-uzi-erp`**
4. Configure Project:
   - **Framework Preset:** `Vite` (auto-detect)
   - **Root Directory:** `techno-kol-ops` ← חשוב!
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`

### 3.2 Environment Variables

לחץ `Environment Variables` → הוסף:

| Name | Value | Environment |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://xxxxxxxxxxxxxxxxxxxx.supabase.co` | Production, Preview |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbG...` | Production, Preview |
| `VITE_API_BASE_URL` | `https://techno-kol-api.up.railway.app` | Production (אחרי שלב 4) |
| `VITE_APP_NAME` | `Techno-Kol Uzi ERP 2026` | Production |

**אל תוסיף את `SUPABASE_SERVICE_ROLE_KEY` ל-Vercel!** ה-service key הוא רק לבקאנד (Railway).

### 3.3 Deploy

לחץ `Deploy`. לוקח 2–4 דק'. בסוף תקבל URL כמו:
```
https://techno-kol-uzi-erp.vercel.app
```

### 3.4 בדיקה

1. פתח את ה-URL בדפדפן → הדשבורד הפלנטירי הכהה עולה
2. לחץ "התחבר" → השתמש ב-`kobi@technokoluzi.co.il`
3. אחרי login → רואה Sidebar + Dashboard
4. נווט בין 3 עמודים — אין errors ב-Console (F12)

### 3.5 החזקת payroll-autonomous ו-onyx-dashboard כעמודים נפרדים

payroll-autonomous ו-onyx-dashboard הן sub-apps. אפשרות:
- **אפשרות A:** פרויקט Vercel נפרד לכל אחד (Root Directory שונה). URL: `payroll.vercel.app`, `procurement.vercel.app`.
- **אפשרות B:** reverse-proxy מ-`/payroll/*` ו-`/procurement/*` דרך Vercel rewrites — `vercel.json`:

```json
{
  "rewrites": [
    { "source": "/payroll/(.*)", "destination": "https://payroll.vercel.app/$1" },
    { "source": "/procurement/(.*)", "destination": "https://procurement.vercel.app/$1" },
    { "source": "/api/(.*)", "destination": "https://techno-kol-api.up.railway.app/api/$1" }
  ]
}
```

המלצה: אפשרות B (domain אחד, חוויה אחידה).

---

## שלב 4 — Railway (Backend — 10 דק')

**למה Railway?** Vercel הוא serverless-first — לא טוב ל-backend כבד עם long-running connections (WebSocket, pg pool). Railway נותן VM מסורתי עם scale אוטומטי.

### 4.1 חיבור ל-GitHub

1. https://railway.app → Login with GitHub
2. `New Project` → `Deploy from GitHub repo` → `techno-kol-uzi-erp`
3. Railway יזהה אוטומטית 4 שירותים. לכל אחד `Add Service`:

#### 4.1a onyx-procurement (backend ראשי)
- Root Directory: `onyx-procurement`
- Build Command: `npm ci`
- Start Command: `node server.js`
- Port: `3100`

#### 4.1b onyx-ai
- Root Directory: `onyx-ai`
- Build Command: `npm ci && npm run build`
- Start Command: `node dist/index.js`
- Port: `3200`

#### 4.1c techno-kol-ops/backend
- Root Directory: `techno-kol-ops/backend`
- Build Command: `npm ci && npm run build`
- Start Command: `npm start`
- Port: `4000`

### 4.2 Environment Variables (per service)

לכל שירות — Settings → Variables:

```
NODE_ENV=production
PORT=3100  (או ה-Port הנכון)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key — לא anon!>
SUPABASE_DB_URL=postgresql://postgres:<pwd>@db.xxx.supabase.co:5432/postgres?sslmode=require

# API keys (ישירים ל-backend, לא חשופים ל-client)
API_KEYS=<openssl rand -hex 32>,<openssl rand -hex 32>
PAYROLL_ADMIN_KEYS=<admin-key-1>,<admin-key-2>
PAYROLL_EMPLOYEE_KEY_MAP=U-100:<emp-key-1>,U-101:<emp-key-2>
AUTH_MODE=api_key

# external services (אם יש)
WHATSAPP_WEBHOOK_SECRET=<hmac secret>
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
```

**Service Role Key:** Supabase Dashboard → Project Settings → API → copy `service_role` (**הכי סודי — שווה לסיסמה של ה-DB!**).

### 4.3 Deploy + Health Check

Railway deploys אוטומטית אחרי push. אחרי ~3 דק' — קבל URL כמו:
```
https://techno-kol-api.up.railway.app
```

בדיקה:
```bash
curl https://techno-kol-api.up.railway.app/api/health       # {"ok":true}
curl https://techno-kol-api.up.railway.app/api/healthz      # 200
curl -H "x-api-key: <key>" \
     https://techno-kol-api.up.railway.app/api/suppliers    # JSON
```

### 4.4 חבר לVercel

חזור ל-Vercel → Environment Variables → עדכן:
```
VITE_API_BASE_URL=https://techno-kol-api.up.railway.app
```
לחץ `Redeploy` (latest commit).

---

## שלב 5 — Domain (10 דק')

### 5.1 קניית דומיין

- **ישראלי:** dom.co.il, isoc.org.il (~80 ₪/שנה)
- **בינלאומי:** Namecheap, Cloudflare (~$12/שנה)
- המלצה: **`technokoluzi.co.il`** או **`erp.technokoluzi.co.il`** (subdomain אם הדומיין הראשי תפוס)

### 5.2 חיבור ל-Vercel

1. Vercel Dashboard → Project → `Settings` → `Domains`
2. `Add` → הקלד `erp.technokoluzi.co.il`
3. Vercel יציג לך 2 אפשרויות:

**אפשרות A (apex domain — `technokoluzi.co.il`):**
- ברשם הדומיין → DNS → הוסף `A record`:
  ```
  @    A    76.76.21.21
  ```

**אפשרות B (subdomain — `erp.technokoluzi.co.il`):**
- ברשם הדומיין → DNS → הוסף `CNAME`:
  ```
  erp    CNAME    cname.vercel-dns.com
  ```

4. המתן 5–30 דק' ל-DNS propagation. Vercel יזהה אוטומטית.
5. Vercel מפיק SSL (LetsEncrypt) אוטומטית. ב-UI תראה:
   ```
   ✅ erp.technokoluzi.co.il — SSL active
   ```

### 5.3 בדיקה

```bash
curl -I https://erp.technokoluzi.co.il
# חייב: HTTP/2 200 + strict-transport-security
```

בדפדפן: `https://erp.technokoluzi.co.il` → הדשבורד עולה. **אין "Not Secure".**

---

## שלב 6 — Security Final (5 דק')

### 6.1 וידוא כל endpoint מוגן

ב-Supabase → SQL Editor:
```sql
-- רשימת endpoints לא מוגנים (חייבת לחזור ריקה)
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;
```

ב-Railway → check lists:
```bash
# כל POST/PATCH/DELETE חייב auth middleware
curl -X POST https://techno-kol-api.up.railway.app/api/suppliers \
  -H "Content-Type: application/json" \
  -d '{"name":"attack"}'
# חייב להחזיר 401 Unauthorized
```

### 6.2 Auth Flow

בדוק ב-Frontend:
1. לחץ Logout → אתה חוזר ל-Login
2. נסה להיכנס ישירות ל-`/dashboard` — נדחה ל-`/login`
3. נסה URL של wage-slip של עובד אחר → 403 (RLS חוסם)
4. login → מבצע פעולה → logout → אותה פעולה → 401

### 6.3 Rate Limit (Railway)

פתח Dashboard → Service → Metrics → הוסף alert:
- HTTP 4xx rate > 10/sec → possible attack

---

## שלב 7 — Backup + Monitoring (5 דק')

### 7.1 Supabase backups

Supabase Dashboard → `Database` → `Backups`:
- Free: 7-day PITR (אוטומטי)
- Pro: שקול שדרוג אחרי חודש production

### 7.2 GitHub = code backup ✅

כבר ב-repo פרטי. **הוסף branch protection** (עשית בשלב 1.3).

### 7.3 Monitoring

- **Vercel Analytics** (built-in) → מציג TTFB, traffic, core web vitals
- **Railway Metrics** (built-in) → CPU, RAM, network per service
- **Supabase Logs** → Dashboard → Logs → query errors, auth failures

**3 התראות מינימום (free tier):**
1. Vercel → Integrations → **Checkly** (free 10 checks) → HTTP health check every 1min
2. Railway → Notifications → Slack/Email on crash
3. Supabase → Logs → filter `AuthError` > 10/hour → email

---

## ✅ צ'קליסט מוכנות לשחרור (7 + 6 = 13 פריטים)

**לפני שאומרים "GO LIVE":**

- [ ] QA X-100 = `GO 100%` ✅ (אושר 2026-04-16, 336/336)
- [ ] גיבוי מקומי בוצע
- [ ] Repo ב-GitHub, פרטי, branch protection פעיל
- [ ] Supabase project רץ, 001+002 migrations הורצו
- [ ] **RLS מופעל על כל הטבלאות (pg_tables rowsecurity=false → 0 שורות)**
- [ ] 6 משתמשים seeded ב-Supabase Auth עם raw_user_meta_data.role
- [ ] Supabase API החזיר [] לקריאת wage_slips ללא auth (RLS עובד)
- [ ] Vercel deploy הצליח, frontend עולה
- [ ] Railway 3 שירותים רצים (onyx-procurement, onyx-ai, techno-kol-ops/backend)
- [ ] `/api/health` ו-`/api/healthz` מחזירים 200
- [ ] Domain מחובר, SSL פעיל (`curl -I https://…` → 200 + HSTS)
- [ ] Logout ואז גישה ל-URL פרטי → נדחה
- [ ] 3 התראות מוגדרות (Vercel checks, Railway crash, Supabase AuthError)

**13 ✅ = GO LIVE.**

---

## 📞 Pocket reference — פקודות מהירות

```bash
# re-run QA locally
cd onyx-procurement && node -e "require('./src/reports/grand-aggregator.js').aggregateAll().then(r=>console.log(r.verdict.verdict, ((r.summary.completion_rate||0)*100).toFixed(1)+'%'))"

# push to prod (auto-deploys Vercel + Railway)
git add . && git commit -m "feat: <מה שינית>" && git push origin main

# rollback Vercel to previous deploy
# Vercel Dashboard → Deployments → [previous] → "Promote to Production"

# rollback Railway
# Railway Dashboard → Deployments → [previous] → "Redeploy"

# rollback Supabase DB (PITR — Pro plan)
# Dashboard → Database → Backups → pick point in time → Restore

# bypass cache (אם תקוע על deploy ישן)
# Vercel: Settings → Domains → Force HTTPS + purge
```

---

## 🆚 Vercel+Railway+Supabase vs GCP — מתי לשדרג?

| מדד | Vercel/Railway/Supabase | שדרג ל-GCP כש… |
|---|---|---|
| משתמשים במקביל | עד 500 | > 1000 concurrent |
| DB size | עד 8GB (Supabase Pro) | > 50GB |
| בקשות/חודש | עד 1M (Vercel Pro) | > 10M |
| עלות | $0–75/חודש | $150+ |
| תחזוקה | 0 | צוות DevOps |

**היום:** Vercel/Railway/Supabase מושלם.
**שנה הבאה:** אם Techno-Kol גדל ל-50+ עובדים + 1000+ פרויקטים בשנה — נדבר על מעבר.

---

**עודכן:** 2026-04-16
**מחבר:** KOBI-EL System 2026 — Deployment team
**חוק ברזל:** לא מוחקים, רק משדרגים ומגדלים.
**סטטוס קדם-דיפלוי:** QA X-100 = GO 100% (336/336 ירוק). המערכת מוכנה לדיפלוי.
