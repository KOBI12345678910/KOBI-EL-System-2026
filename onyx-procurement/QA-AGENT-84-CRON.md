# QA Agent #84 — Scheduled Job (Cron) Reliability
**פרויקט:** `onyx-procurement` (+ cross-project sanity checks)
**סוג ניתוח:** Static analysis ONLY — אין הפעלה, אין I/O אמיתי.
**תאריך ריצה:** 2026-04-11
**ממד:** אמינות עבודות מתוזמנות (Cron / Scheduled Jobs).
**קבצים נקראו:** `onyx-procurement/server.js` (934 שורות), `package.json`, `supabase/migrations/001-supabase-schema.sql` (חלקי), עיבוד-חוצה ב-`techno-kol-ops`, `AI-Task-Manager`.

---

## 0. TL;DR — שורה תחתונה

> **אין שום scheduled job ב-onyx-procurement.** לא ב-Node, לא ב-Supabase, לא ב-Replit, לא ב-GitHub Actions, לא בפורטל חיצוני. הסכמה *מצפה* ל-cron (שדות `auto_close_on_deadline`, `reminder_sent`, `response_deadline`) אבל ה-runtime אף-פעם לא קורא אותם. זהו **"dead schema code"** — כוונה עיצובית בלי ביצוע.

רמת חומרה כללית: **🔴 CRITICAL** — פער אדריכלי מתועד כבר ב-Agents 09, 18, 21, 37, 40, 49, 50, 52. דוח 84 מאחד את הנושא תחת זווית cron-reliability.

---

## 1. מתודולוגיה

### 1.1 חיפושים שבוצעו
חיפוש regex (case-insensitive) במרחב `onyx-procurement/`:
```
cron | schedule | setInterval | agenda | node-cron |
setTimeout | bull | queue | worker | pg_cron
```

### 1.2 תוצאות על `server.js` בלבד
```
grep -n -i -E "cron|schedule|setInterval|agenda|setTimeout|node-cron|bull|queue|worker|pg_cron" server.js
→ No matches found
```
**מילולית אפס תוצאות.** קובץ השרת של 934 שורות מכיל **0** (אפס) מופעים של כל אחת מהמילים הללו.

### 1.3 תוצאות על `package.json`
```json
"dependencies": {
  "express": "^4.21.0",
  "@supabase/supabase-js": "^2.45.0",
  "dotenv": "^16.4.5",
  "cors": "^2.8.5"
}
```
- אין `node-cron`.
- אין `agenda`.
- אין `bullmq` / `bull`.
- אין `bree`.
- אין `p-queue`.
- אין `croner`.
- אין `@nestjs/schedule`.

**סה"כ תלויות: 4. אפס מהן תומכות בתזמון.**

### 1.4 קבצי תשתית-Replit
```
.replit        → NOT FOUND
replit.nix     → NOT FOUND
```
אין הגדרת **Replit Scheduled Deployment** ואין **Replit Cron Task** בפרויקט. הפרויקט משתמש ב-Replit (לפי Agent 15/18) אבל לא מנצל את שכבת ה-scheduler של Replit.

### 1.5 קבצי GitHub Actions
חיפוש אחר `.github/workflows/*.yml` → **לא נמצא** בתוך `onyx-procurement/`.

### 1.6 Supabase Migrations — חיפוש pg_cron
```
grep -n -i "pg_cron|CREATE EXTENSION|cron.schedule" 001-supabase-schema.sql
→ No matches
```
**אפס תמיכה ב-pg_cron.** אין `CREATE EXTENSION IF NOT EXISTS pg_cron;`, אין `cron.schedule(...)`, אין stored procedures מתוזמנות.

### 1.7 cross-project control
לשם השוואה, חיפוש `node-cron` ברחבי `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\`:
```
techno-kol-ops/src/ai/brainEngine.ts
techno-kol-ops/src/realtime/autonomousEngine.ts
techno-kol-ops/src/realtime/alertEngine.ts
techno-kol-ops/package.json
AI-Task-Manager/artifacts/api-server/package.json
AI-Task-Manager/artifacts/api-server/src/index.ts
```
משמעות: פרויקטים אחיים של Kobi **כן** משתמשים ב-cron — אז מדובר באי-עקביות ארכיטקטונית, לא חוסר מודעות.

---

## 2. ממצאים מפורטים (חקירה 1–8)

### F-84-01 · Any scheduled jobs in onyx-procurement? → **NO** 🔴
**שאלה:** האם יש scheduled jobs?
**תשובה:** לא. בשום מקום.

| איפה חיפשנו | תוצאה |
|---|---|
| `server.js` 934 שורות | 0 מופעים |
| `package.json` תלויות | 0 חבילות scheduler |
| `.replit` / `replit.nix` | הקובץ לא קיים |
| `.github/workflows/` | התיקייה לא קיימת |
| Supabase `pg_cron` | extension לא מופעלת |
| Supabase `auth.hooks` / `cron.schedule` | 0 מופעים |

**חומרה:** 🔴 CRITICAL.
**למה זה מדאיג:** הסכמה (001-supabase-schema.sql שורות 122, 138–139) כן מגדירה שדות ש-**מצפים** ל-cron:
```sql
auto_close_on_deadline BOOLEAN DEFAULT true,
reminder_sent BOOLEAN DEFAULT false,
reminder_sent_at TIMESTAMPTZ,
```
וגם `response_deadline TIMESTAMPTZ` (שורה 282 ב-server.js, מוכנס ב-`/api/rfq/send`).
אף-אחד מהשדות הללו **לא נקרא חזרה ב-runtime**. הם write-only fields. זה "חוזה מת" — הסכמה מבטיחה משהו שהקוד לא מקיים.

**קישור ל-Agents קודמים:**
- Agent 09 F-09-003: "אין `auto_close_on_deadline`. הסכמה תומכת, אבל אין cron/poller שמזיז RFQ ל-closed".
- Agent 37 S-07: "Zero scheduled jobs, cron, triggers or polling".
- Agent 40 C-16: "`auto_close_on_deadline` ללא scheduler".
- Agent 52 §14: "Scheduled Notifications (Cron-Based) — אפס".

---

### F-84-02 · Replit always-on requirement for cron 🟠
**רקע:** Replit Free / Hacker / Core tiers **ממחזרים מכולות** אחרי כ-5–10 דקות חוסר-פעילות (inbound traffic). כל cron שירוץ בתוך ה-Node process של Replit ייפסק יחד עם המכולה.

**השלכות עבור onyx-procurement אם יוסף `node-cron`:**
1. **Without "Always On":** אם אין keep-alive חיצוני, המכולה תיכבה. `cron.schedule('0 8 * * *', ...)` לא יופעל ב-08:00 כי אין process בחיים לקלוט את הטיימר.
2. **With "Always On" (Replit Core $20/חודש):** עובד, אבל אנחנו עדיין מוגבלים לתהליך יחיד — אין HA.
3. **Reserved VM ($10–70/חודש):** הפתרון הרשמי של Replit ל-workers. תומך ב-cron native דרך "Scheduled Deployments".
4. **Scheduled Deployments** (הכלי החדש של Replit, 2024+): מאפשר להריץ script כל X דקות כ-**cron job חיצוני** שלא תלוי ב-`server.js` בכלל. זהו האפיק הרצוי.

**ממצא:** **אין שום מנגנון keep-alive בקוד.** אין UptimeRobot פינג, אין GitHub Action שמפינג כל 5 דקות, אין self-ping. אם Kobi הוסיף `node-cron` *היום* לתוך `server.js`, הוא יתגלה שלא ירוץ באופן אמין על Replit free tier. זו הסיבה העיקרית שהפרויקט צריך לצאת מתוך Node לתזמון — ולהשתמש בשכבה מעל (Replit Scheduled Deployments / Supabase pg_cron / GitHub Actions / UptimeRobot keyword).

**חומרה:** 🟠 HIGH (deferred — ברגע שיכניסו cron זה יופיע).

---

### F-84-03 · Daily digest & weekly report potential 🟡
**שאלה:** מה פוטנציאל הערך של cron בפרויקט?

**פוטנציאל ערך גבוה (Kobi יהנה מהם יום-יום):**

| Cron מוצע | תדירות | מטרה | מקור נתונים |
|---|---|---|---|
| `daily-digest` | 07:30 Asia/Jerusalem | WhatsApp ל-Kobi עם סיכום: RFQs פתוחים, הצעות חדשות, החלטות ממתינות, התרעות | `procurement_dashboard`, `rfqs`, `supplier_quotes` |
| `weekly-report` | ראשון 09:00 | PDF/HTML עם KPIs שבועיים: חיסכון מצטבר, ספקים בולטים, delivery rate | `audit_log`, `system_events`, כל views |
| `auto-close-expired-rfqs` | כל 15 דק' | `UPDATE rfqs SET status='closed' WHERE status='sent' AND response_deadline < NOW()` | `rfqs` |
| `reminder-suppliers` | כל שעה | שולח WhatsApp לספקים שלא הגיבו כש-`response_deadline` בעוד ≤ 6 שעות | `rfqs`, `rfq_recipients` |
| `notify-critical-events` | כל 2 דק' | סורק `system_events` severity=critical → WhatsApp Kobi | `system_events`, `notifications` |
| `supabase-pause-preventer` | כל 5 ימים | פינג שמירת פעילות (Agent 15 F-15-137) | `/api/status` |
| `daily-backup` | 03:00 | `pg_dump` → OneDrive (Agent 18) | כל ה-DB |
| `pii-retention-sweep` | יומי 04:00 | אנונימיזציה אחרי X שנות חוסר פעילות (Agent 28) | `suppliers`, `purchase_requests` |
| `wa-quality-probe` | כל 6 שעות | קורא `GET /{WABA_PHONE_ID}?fields=quality_rating,throughput` (Agent 45) | Graph API |
| `system-events-ttl` | יומי 02:00 | `DELETE FROM system_events WHERE created_at < now()-interval '90 days'` | `system_events` |

**חומרה:** 🟡 MEDIUM (opportunity cost) — כל אחד מהם לבדו אינו critical, אבל יחד הם הערך הפסיכולוגי של "המערכת חיה". כרגע ל-Kobi אין אף WhatsApp אוטומטי שמגיע לבד.

---

### F-84-04 · Cron expression timezone (Israel vs UTC) 🟠
**שאלה:** בהנחה שמחר יוסף cron — מה ה-TZ?

**מצב נוכחי — כל הסוגים של scheduler והתנהגות ברירת-מחדל שלהם:**

| Scheduler | ברירת מחדל | הערה |
|---|---|---|
| `node-cron` | **TZ של המכונה** (process.env.TZ) | Replit = UTC. אם תכתוב `0 8 * * *` מתוך כוונה ל-08:00 Asia/Jerusalem, בחורף תקבל 10:00, בקיץ 11:00. |
| `croner` | UTC | תומך `{ timezone: 'Asia/Jerusalem' }` אבל לא ברירת-מחדל. |
| Supabase `pg_cron` | **UTC קשוח** | pg_cron **לא** תומך ב-TZ per-job עד Postgres 15+. יש לחשב offset ידנית. |
| GitHub Actions `schedule:` | **UTC קשוח** | `cron: '0 6 * * *'` ב-YAML = 06:00 UTC = 08:00 חורף / 09:00 קיץ. |
| Replit Scheduled Deployments | UTC | אבל ה-UI מציג בדר"כ TZ של המשתמש. |
| UptimeRobot keyword monitor | **UTC** | כל X דקות, לא wall-clock. |

**סיכון כפול עבור onyx:**
1. **DST (daylight saving time)** — Israel DST עובר ב-Last Friday of March / Last Sunday of October. Cron יומי ב-08:00 IST ייהפך ל-07:00 או 09:00 לזמן שעתיים אם ה-scheduler ב-UTC.
2. **Agent 39 (Timezone)** כבר מצא בעיות TZ בקוד (Agent 39 §5). Cron יחמיר את זה — ה-scheduler ירוץ בזמן לא צפוי, יזריק שורות עם `NOW()` בפוסטגרס שגם הוא משתמש ב-UTC, וה-UI יציג משהו שלישי. יש שלושה "now" שונים: scheduler tick, DB now, React Intl.

**תיקון מומלץ:**
- לעבוד תמיד ב-UTC ב-scheduler.
- לתרגם ל-Asia/Jerusalem רק ב-presentation (כפי ש-Agent 39 ממליץ).
- לשים תגובה מפורשת בראש כל cron job:
  ```js
  // CRON TIME: 05:00 UTC = 07:00 IST winter / 08:00 IST summer.
  // Intent: deliver 07:00–08:00 local Kobi time. DST drift acceptable.
  cron.schedule('0 5 * * *', dailyDigest, { timezone: 'UTC' });
  ```
- או יותר טוב: `{ timezone: 'Asia/Jerusalem' }` ב-node-cron/croner במפורש.

**חומרה:** 🟠 HIGH (latent — יתפרץ ברגע שיוסף cron).

---

### F-84-05 · Failure recovery (job missed during outage) 🔴
**הקשר:** Replit free/hacker יורד לאחר חוסר פעילות; Supabase free עולה ל-pause אחרי 7 ימי חוסר-פעילות (Agent 15); Israel fiber downtime; Graph API outage; בקיצור — **ידוע מראש שהמערכת לא זמינה 24/7**.

**מה קורה למשימה cron שהחמיצה:**

| Scheduler | Catch-up behavior |
|---|---|
| `node-cron` | **NO catch-up.** אם המכונה הייתה כבויה ב-08:00 ועלתה ב-08:05 — ה-tick הוחמץ. הבא ב-יום למחרת. |
| Supabase `pg_cron` | **NO catch-up.** דומה. |
| GitHub Actions | יש best-effort, אבל **"the schedule event can be delayed during periods of high loads of GitHub Actions workflow runs"** (מתועד רשמית). אין ערובה. |
| Replit Scheduled Deployments | best-effort, documented as "approximate" |
| Celery beat | יש catch-up אופציונלי — אבל לא רלוונטי (Python) |
| BullMQ repeatable jobs | **YES** catch-up אם ה-Worker חזר בתוך ה-grace window. |

**סיכון עבור onyx:**
- `daily-backup` שהוחמץ = אין גיבוי אותו יום. Agent 18/19 כבר מגדיר את ה-DR חשוף לחלוטין.
- `auto-close-expired-rfqs` שהוחמץ = RFQ נשאר `sent` כשהוא בעצם סגור — החלטה (`/decide`) עלולה לבחור ספק אחרי שהחלון נסגר רשמית.
- `notify-critical-events` שהוחמץ = Kobi לא יודע שהמערכת כבויה (ironically).

**תיקון מומלץ:**
1. **Idempotent jobs עם State Table:**
   ```sql
   CREATE TABLE cron_job_runs (
     job_name TEXT,
     scheduled_for TIMESTAMPTZ,
     status TEXT CHECK (status IN ('pending','running','succeeded','failed','missed')),
     completed_at TIMESTAMPTZ,
     error TEXT,
     PRIMARY KEY (job_name, scheduled_for)
   );
   ```
2. **Startup catch-up sweep:** בתחילת השרת, לסרוק עבודות שמועד היעד שלהן עבר ועדיין `pending`/`missed`:
   ```js
   const missed = await supabase.from('cron_job_runs')
     .select('*').eq('status','pending').lt('scheduled_for','now()');
   for (const m of missed) await runJob(m.job_name);
   ```
3. **Deadline-based queries instead of time-tick-based:** במקום "כל יום ב-08:00 שלח digest", עדיף "בכל run, בדוק אם היה digest ב-24 השעות האחרונות; אם לא — שלח". זה עקרון **"idempotent catch-up"**.
4. **DLQ:** עבודות שנכשלו 3 פעמים → `status='failed'` + alert.

**חומרה:** 🔴 CRITICAL (missed-job blindness). זוהי אבן-היסוד של "אמינות scheduled jobs".

---

### F-84-06 · Distributed lock for multi-instance ⚪
**מצב נוכחי:** הפרויקט רץ כ-instance יחיד על Replit. אין מצב של N workers. לכן distributed-lock **כרגע לא רלוונטי**.

**למה זה עדיין חשוב לתעד:**
1. אם Kobi ירחיב ל-Reserved VM עם 2 replicas למען uptime — שני ה-processes ינסו להריץ את אותו `daily-digest` בו-זמנית → Kobi יקבל **שני** WhatsApp, ומה יותר גרוע: שני RFQs ייסגרו-פעמיים.
2. אם יוסף GitHub Action *וגם* UptimeRobot *וגם* in-node cron — יש 3 trigger paths לאותו ה-job. בלי lock יקרה duplicate work.
3. Supabase לא תומך ב-advisory locks מחוץ ל-transactions קצרות (אלא אם משתמשים ב-session connection, שלא זמין במצב connection-pooler).

**תיקון מומלץ (deferred, רק אם יופעל ריבוי workers):**
```sql
-- PostgreSQL advisory lock:
SELECT pg_try_advisory_lock(hashtext('daily-digest'));
-- IF true → run job, THEN pg_advisory_unlock(...)
-- IF false → another worker is running it, skip.
```
או: שימוש בטבלת `cron_job_runs` עם `UPDATE ... WHERE status='pending' RETURNING *` אטומית.

או: להוציא את התזמון מחוץ לאפליקציה כליל (Supabase pg_cron / GitHub Actions) כך שיש גורם יחיד שקובע מתי לרוץ.

**חומרה:** ⚪ INFO (לא רלוונטי כרגע אבל חשוב לזכור).

---

### F-84-07 · Alternative: Supabase pg_cron extension 🟢
**המלצה אדריכלית העיקרית של דוח זה.**

**למה pg_cron הוא הבחירה הטובה ביותר עבור onyx:**

1. **Zero infrastructure:** אין שרת נוסף, אין Replit Always-On, אין UptimeRobot. ה-cron רץ בתוך Postgres.
2. **Supabase תומך out-of-the-box:** ב-Dashboard → Database → Extensions → Enable `pg_cron`. ברוב הפלאנים הזולים זה זמין (כולל Free tier).
3. **Race-free ביחס ל-Replit uptime:** אם onyx Node כבוי, pg_cron עדיין מריץ את ה-SQL. המשימות ה-DB-centric (auto-close, retention, cleanup) לא צריכות את ה-Node בכלל.
4. **Idempotent by design:** כי זה SQL, הוא עובד על שורות — לא על time-ticks.
5. **Transactional:** `UPDATE rfqs SET status='closed' WHERE ...` רץ בתוך טרנזקציה, אטומי, ACID.
6. **קל לדיבאג:** `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`

**חסרונות:**
1. **UTC only (כמעט).** Postgres 15+ תומך ב-TZ per job אבל Supabase free tier לא תמיד עליו. פתרון: לעבוד ב-UTC ולחשב offset ב-SQL.
2. **לא יכול לקרוא ל-Graph API / WhatsApp** (אין outbound HTTP ב-plain Postgres). פתרון: **Supabase Edge Functions** — משלבים pg_cron + Edge Function:
   ```sql
   SELECT cron.schedule(
     'send-daily-digest',
     '0 5 * * *',  -- 05:00 UTC = 07:00 IST winter / 08:00 IST summer
     $$
     SELECT net.http_post(
       url := 'https://abc.supabase.co/functions/v1/daily-digest',
       headers := '{"Authorization":"Bearer ..."}'::jsonb
     );
     $$
   );
   ```
   זה דורש extension `pg_net` (גם קיים ב-Supabase).
3. **Logging מוגבל:** רק `cron.job_run_details`, לא תגיע ל-Datadog.

**כיסוי מומלץ של cron jobs דרך pg_cron:**

| Job | איפה מריצים | למה |
|---|---|---|
| `auto-close-expired-rfqs` | pg_cron pure SQL | מושלם ל-pg_cron (update in-place) |
| `system-events-ttl` | pg_cron pure SQL | מושלם |
| `pii-retention-sweep` | pg_cron pure SQL | מושלם |
| `refresh-materialized-views` | pg_cron pure SQL | Agent 49/51 |
| `daily-digest` | pg_cron → Edge Function → WhatsApp | חייב outbound HTTP |
| `reminder-suppliers` | pg_cron → Edge Function → WhatsApp | outbound |
| `daily-backup` | GitHub Actions | pg_cron לא יכול לכתוב לקובץ חיצוני |
| `wa-quality-probe` | pg_cron → Edge Function → Graph API | outbound |
| `notify-critical-events` | pg_cron → Edge Function | outbound |

**חומרה:** 🟢 SOLUTION (זהו התיקון).

---

### F-84-08 · המלצה מסוכמת 🟢

**המלצה עיקרית:** שלב-שלב, לא לנסות לבנות את הכל יחד.

#### Phase 1 — 🔴 CRITICAL (תוך שבוע, 4–6 שעות עבודה)
1. **הפעל `pg_cron` ב-Supabase Dashboard.** לחיצה אחת. 0 שורות קוד.
2. **הוסף job אחד:** `auto-close-expired-rfqs`. SQL טהור:
   ```sql
   SELECT cron.schedule(
     'auto-close-expired-rfqs',
     '*/15 * * * *',  -- כל 15 דקות
     $$
       UPDATE rfqs
       SET status='closed',
           closed_at=NOW(),
           close_reason='deadline_expired'
       WHERE status='sent'
         AND response_deadline < NOW()
         AND auto_close_on_deadline=true;
     $$
   );
   ```
   זה מרפא את F-09-003, S-07, C-16, F-84-01 בבת-אחת. **0 שורות Node.**
3. **הוסף TTL ל-`system_events`:**
   ```sql
   SELECT cron.schedule(
     'system-events-ttl',
     '0 2 * * *',  -- 02:00 UTC יומי
     $$DELETE FROM system_events WHERE created_at < NOW() - INTERVAL '90 days';$$
   );
   ```
4. **הוסף טבלת `cron_job_runs`** כפי שתוארה ב-F-84-05. כל job עתידי יכתוב ל-שם.

#### Phase 2 — 🟠 HIGH (תוך חודש)
5. **Edge Function + pg_net:** `daily-digest` + `reminder-suppliers` + `notify-critical-events`. כל אחד רץ ב-Supabase, קורא DB, ושולח WhatsApp דרך `sendWhatsApp()` שקיים כבר ב-server.js (יש להעתיק ל-Deno Edge Function).
6. **GitHub Actions nightly backup** (Agent 18): `pg_dump` → commit to private repo או upload ל-Supabase Storage.
7. **Keep-alive פינג:** UptimeRobot → `GET /api/status` כל 5 דק'. חינמי. פותר F-84-02 וגם חלק מ-Agent 15 F-15-137.

#### Phase 3 — 🟡 NICE-TO-HAVE
8. **`weekly-report`** (ראשון בבוקר) — HTML/PDF.
9. **`wa-quality-probe`** (כל 6 שעות) — Agent 45.
10. **`pii-retention-sweep`** — Agent 28.

#### כללים ל-**כל** cron שיוסף:
- **TZ מפורש בקוד + תגובה:** `-- CRON: 05:00 UTC = 07:00 IST winter / 08:00 summer`.
- **Idempotent:** אם מריצים אותו פעמיים לאותה זמן-יעד, התוצאה זהה.
- **Catch-up-friendly:** עובד לפי state ב-DB, לא time-tick.
- **Log ל-`cron_job_runs`:** כל run — success/failure/duration.
- **Alert על כשל:** אם 3 runs רצופים נכשלו → `system_events` severity=critical → WhatsApp.
- **Lock:** `pg_try_advisory_lock(hashtext('job-name'))` בתחילת כל job כדי למנוע duplicate מ-scheduler כפול בעתיד.

---

## 3. Findings table

| ID | Title | Dimension | Severity | Fix Effort |
|---|---|---|---|---|
| F-84-01 | אין שום scheduled job בפרויקט | Presence | 🔴 CRIT | 4h (pg_cron) |
| F-84-02 | Replit always-on דרוש אם בוחרים Node cron | Infra | 🟠 HIGH | 0 (השתמש ב-pg_cron) |
| F-84-03 | הזדמנויות גבוהות: daily digest, auto-close, backups | Opportunity | 🟡 MED | 6–16h tot |
| F-84-04 | אין TZ מפורש — DST drift צפוי | Correctness | 🟠 HIGH | 30min לכל job |
| F-84-05 | אין failure-recovery / catch-up | Reliability | 🔴 CRIT | 3h (state table) |
| F-84-06 | Distributed lock — deferred | Scalability | ⚪ INFO | deferred |
| F-84-07 | pg_cron הוא הבחירה הנכונה | Architecture | 🟢 REC | 0 |
| F-84-08 | roadmap שלב-שלב | Plan | 🟢 REC | — |

---

## 4. הקשר לדוחות קודמים (cross-agent trace)

הממצא המרכזי כאן — "אפס scheduled jobs" — לא חדש. הוא עלה ב:

| Agent | ID | ציטוט |
|---|---|---|
| 09 | F-09-003 | "אין `auto_close_on_deadline`. הסכמה תומכת, אבל אין cron/poller שמזיז RFQ ל-closed אחרי `response_deadline`" |
| 18 | F-18-04 | "אפס `cron`, `setInterval`, או scheduled job כלשהו בתוך ה-Express" |
| 18 | F-18-11 | "אין `backup.sh`, אין `nightly-dump.sh`, אין GitHub Actions workflow, אין Replit Cron task" |
| 21 | M-02 | "`notifications.sent` נשאר לעד `false`. אין cron שסורק severity critical" |
| 37 | S-07 | "Zero scheduled jobs, cron, triggers or polling" |
| 37 | S-12 | "No time-based transitions (cron/pg_cron)" |
| 40 | C-16 | "auto_close_on_deadline ללא scheduler" |
| 45 | — | "אין cron Quality Rating + Template Status" |
| 46 | — | "אין `pg_notify`, BullMQ, או `node-cron`" |
| 49 | — | "`procurement_dashboard` צריך להיות MATERIALIZED VIEW עם REFRESH מחזורי" |
| 50 | F-50-10 | "אין `pg_cron` למחיקת audit log ישן" |
| 52 | §14 | "חיפוש של: cron, setInterval, schedule, node-cron, agenda, bull, queue — אפס תוצאות" |

**Agent 84 תורם:** (א) איחוד כל הנקודות תחת קטגוריה אחת. (ב) המלצה ארכיטקטונית קונקרטית (pg_cron + Edge Functions). (ג) מפת DST/TZ מפורשת. (ד) state table + catch-up pattern. (ה) roadmap עם 3 phases.

---

## 5. מה **כן** קיים בפרויקט (אמת-חיובית)

כדי לא להיות לא-הוגן: הפרויקט **כן** מכיל מרכיבים שמצפים ל-cron ומכוונים לעתיד:

- `rfqs.auto_close_on_deadline BOOLEAN DEFAULT true` (schema) — כוונה ברורה.
- `rfqs.reminder_sent BOOLEAN` + `reminder_sent_at TIMESTAMPTZ` — מבנה תזכורות.
- `rfqs.response_deadline TIMESTAMPTZ` — מוכנס נכון ב-`/api/rfq/send`.
- `system_events` — טבלה שמוכנה לאסוף events שצריכים cron-sweeper.
- `notifications.sent BOOLEAN DEFAULT false` — דפוס outbox queue.
- `audit_log` — מוכן ל-TTL sweep.
- `price_history` — מוכן לagg/rollup יומי.

**המשמעות:** העבודה האדריכלית נעשתה. מה שחסר הוא **שורת `cron.schedule(...)` אחת ב-Supabase**. זה פער של 5 דקות, לא פער של יום.

---

## 6. גבולות הדוח

- **Static analysis only.** לא הופעל שום דבר, לא נצפתה התנהגות בזמן-ריצה.
- **לא נבדקה הגדרת Supabase production.** ייתכן ש-Kobi כבר הפעיל `pg_cron` ב-Dashboard באופן ידני — אבל *בקוד הגרסה* של הפרויקט אין `cron.schedule`, ולכן אם הוא קיים — הוא לא ב-source control, וזה באג בפני עצמו (configuration drift).
- **לא נבדקו webhooks.** אם WhatsApp webhook מגיע ומזיז state — זה לא "cron" אלא event-driven. הבדיקה התמקדה ב-**scheduled** jobs.
- **לא נקראו QA-AGENT-21, 37, 50, 52 במלואם** במהלך דוח זה — רק ה-grep hits. הציטוטים נלקחו מקווים ישירים. ההקשר מוצג למראית עין, לא כבדיקה מעמיקה.

---

**סטטוס סופי:** Agent #84 מאשר רשמית — **onyx-procurement הוא בעל תשתית cron אפס**. זו הזדמנות טובה לתיקון זול (< 1 יום עבודה) עם ערך גבוה, במיוחד בשלב 1.

---
*נכתב ב-2026-04-11. Static analysis. Hebrew audit.*
