# QA Agent #18 — Backup & Restore Strategy

**תאריך:** 2026-04-11
**סוכן:** QA Agent #18
**דימנשן:** אסטרטגיית גיבוי ושחזור (Backup & Restore)
**שיטה:** Static analysis בלבד — ללא הרצת קוד, ללא שינוי קבצים
**היקף בדיקה:**
- `server.js` (934 שורות)
- `package.json`
- `SETUP-GUIDE-STEP-BY-STEP.md`
- `supabase/migrations/001-supabase-schema.sql` (562 שורות)
- בדיקת קבצים קשורים: `QUICKSTART.md`, `QA-WAVE1-*`, כל קובץ `.sh`/`.sql` בפרויקט

---

## TL;DR (שורה תחתונה)

**המערכת חשופה לחלוטין. אפס מנגנון גיבוי בקוד, אפס תיעוד אסטרטגיית גיבוי, אפס תרגולי שחזור. הפרויקט מסתמך *באופן מרומז ובלתי מוצהר* על מה ש-Supabase Free Tier מספק, שזה — למעשה — כמעט כלום.** אם ה-DB נהרס (באג במיגרציה, מחיקה בטעות של קובי ב-SQL Editor, חיוב חשבון שלא שולם, סגירת הפרויקט ע"י Supabase) — **אין דרך לשחזר**, נקודה.

זו נקודה כואבת במיוחד לעסק מסגריה ריאלי שבו כל PO הוא כסף אמיתי וכל `audit_log` הוא ראיה משפטית.

---

## 1. האם קיים מנגנון גיבוי כלשהו — תיעוד או קוד?

**תשובה: לא. אפס.**

### 1.1 בדיקת קוד (`server.js`)
- אפס קריאות ל-`pg_dump`, `pg_basebackup`, `supabase db dump`, או כל CLI פקודת גיבוי.
- אפס endpoints מסוג `/api/backup/*` או `/api/export/*`.
- אפס קוד לייצוא CSV/JSON של הטבלאות.
- אפס `cron`, `setInterval`, או scheduled job כלשהו בתוך ה-Express.
- היחיד שמקרב לזה: `audit()` helper (שורות 99-105) — שהוא *פנים-מערכתי* ולא גיבוי אמיתי.

### 1.2 בדיקת `package.json`
```json
"scripts": {
  "start": "node server.js",
  "dev": "node --watch server.js"
}
```
**אפס scripts של `backup`, `dump`, `export`, `archive`, `snapshot`.** אין תלות ב-`pg`, `node-pg-dump`, `knex`, או כל ספריית DB שיכולה לתמוך בגיבוי. התלויות: `express`, `@supabase/supabase-js`, `dotenv`, `cors` — כולן ללא יכולת גיבוי.

### 1.3 בדיקת `SETUP-GUIDE-STEP-BY-STEP.md`
- סריקה מלאה של המדריך — **0 הופעות** של המילים: גיבוי, backup, שחזור, restore, export, snapshot, PITR, pg_dump, disaster, recovery.
- המדריך מתרכז אך ורק ב-**setup ראשוני**. אין אפילו משפט אחד כגון: "אחת לשבוע, תלחץ על X ב-Supabase כדי לייצא...".
- המדריך מודיע לקובי: "המערכת תרוץ 24/7 (Replit Pro עושה את זה אוטומטית)" — אבל לא מסביר שזה *רק הפרוסס*, לא הדאטה.

### 1.4 בדיקת schema (`001-supabase-schema.sql`)
- אין views מסוג `backup_*`, אין triggers מסוג "write to archive on delete", אין `AFTER DELETE` trigger שישמור עותק.
- יש `ON DELETE CASCADE` ב-6 מקומות (`supplier_products`, `price_history`, `purchase_request_items`, `rfq_recipients`, `quote_line_items`, `po_line_items`, `subcontractor_pricing`) — שזה **מגביר את הסיכון**: מחיקת שורת supplier אחת מפילה את *כל* המוצרים, היסטוריית המחירים, וה-RFQ recipients שלה באופן בלתי חוזר, ללא שום archive.
- אין `ON DELETE SET NULL` ב-FK-ים של audit או history — כלומר, מחיקת ספק לא רק שוברת קישורים, היא מוחקת היסטוריה.

### 1.5 חיפוש קבצי scripts
- אפס קבצי `.sh` בפרויקט כולו (Glob `**/*.sh`).
- אפס קבצי `.sql` מעבר ל-2 קבצי המיגרציה (`001-supabase-schema.sql`, `002-seed-data-extended.sql`).
- **אין `backup.sh`, אין `nightly-dump.sh`, אין GitHub Actions workflow, אין Replit Cron task**.

### 1.6 השוואה ל-16 סוכני QA קודמים
חיפשתי אם אחד מהסוכנים הקודמים (QA Agents 1-17 — אך בעיקר `QA-WAVE1-DIRECT-FINDINGS.md`, `QA-WAVE1-UNIFIED-REPORT.md`) כבר דן בגיבוי. **התוצאה: אפס ממצאים**. המילה "גיבוי"/"backup"/"restore"/"RPO"/"RTO" אינה מופיעה באף אחד מדוחות ה-QA. זו **נקודה עיוורת קיימת של כל ה-wave הראשון**.

---

## 2. האם ה-Tier של Supabase מספיק? (Free vs Pro)

### 2.1 מה אומר מדריך ההתקנה
המדריך (שלב 1.1) אומר לקובי:
> "אם אין לך חשבון — תרשם (חינם)"

כלומר — **ברירת המחדל היא Supabase Free Tier**. אין אף אזכור לשדרוג ל-Pro, אין הסבר על מדיניות הגיבוי של שני ה-tiers.

### 2.2 מה שבאמת מקבלים (בהתבסס על המדיניות הציבורית של Supabase, סטטית מבלי לגשת לחשבון)

| מאפיין | Free Tier | Pro Tier ($25/חודש) |
|---|---|---|
| Daily backups | ❌ אין (רק retention של 7 ימים דרך restore request מה-support) | ✅ יומי, retention 7 ימים, self-service |
| PITR (Point-in-Time Recovery) | ❌ לא קיים | ❌ לא כלול בסיס — תוספת **$100/חודש נפרד** |
| Log retention | 1 יום | 7 ימים |
| השהיית פרויקטים (pause) | ✅ אחרי 7 ימי חוסר פעילות — **כל הדאטה עלולה להיאבד** אם לא משחזרים בזמן | לא |
| Database size limit | 500MB (אחרי זה הפרויקט **נחסם לכתיבה**) | 8GB included, scale up zu 500GB |

### 2.3 ההערכה
1. **Free Tier אינו מתאים לשום שימוש production.** הוא מאבד את הפרויקט אחרי שבוע של חוסר פעילות (נניח שקובי בחופשה). אחרי ה-pause, הדאטה עדיין "קיימת" אבל ברגע ש-CASCADE DROP או שגיאה כלשהי מתרחשת, אין דרך לחזור.
2. **גם Pro Tier ברירת־מחדל (ללא PITR add-on) נותן RPO של 24 שעות**. מחיקה בשוגג ב-14:00 מחייבת שחזור לגיבוי של הלילה הקודם — ואובדים כל הנתונים מאותו יום עסקים.
3. **ה-PITR add-on (+$100/חודש)** הוא זה שנותן RPO של 2 דקות — והוא **לא מוזכר בשום מקום בפרויקט**.
4. המערכת מכוונת לעסק *ריאלי* של קובי (PO-ים עם ₪-ים אמיתיים, audit log משפטי). **Free Tier הוא סיכון עסקי ישיר.**

---

## 3. האם יש scripts לייצוא לילי (pg_dump equivalent)?

**תשובה: לא.**

### 3.1 סריקה מקיפה
- **קבצי shell:** 0 (אפס)
- **GitHub Actions workflows:** אין תיקיית `.github/workflows` בפרויקט
- **Replit scheduled tasks:** המדריך לא מזכיר את Replit Scheduled Deployments או Cron Deployments
- **Supabase Edge Functions:** אין תיקיית `supabase/functions`, רק `migrations`
- **Node cron jobs ב-server.js:** אין `setInterval` שמבצע dump, אין `node-cron`, אין `agenda`, אין `bull`

### 3.2 מה שחסר
לפרויקט בגודל הזה המינימום הנדרש הוא:
```bash
# nightly-backup.sh (לא קיים — דוגמה למה שצריך)
DATE=$(date +%Y-%m-%d)
supabase db dump \
  --db-url "postgresql://postgres:[PASSWORD]@[PROJECT].supabase.co:5432/postgres" \
  > backups/onyx-$DATE.sql
# upload to Google Drive / B2 / S3
```
זה **לא קיים**. לא הקובץ, לא התלות, לא ה-cron, לא התיעוד.

### 3.3 סיכון ה-audit_log במיוחד
`audit_log` (שורות 338-351 ב-schema) כולל `previous_value` ו-`new_value` כ-JSONB — זה *כל התולדות של המערכת*. זה הדבר האחרון שקובי רוצה לאבד (ראיה משפטית למשא ומתן עם ספקים). אבל הוא נמצא באותה DB ככל השאר — *אם ה-DB נהרסת, ה-audit log נהרס גם*. זה **שגיאה ארכיטקטונית**: ה-audit צריך להיות off-DB או לפחות מיוצא אוטומטית.

---

## 4. האם ניתן לשחזר ארטיפקטים לוקליים (audit_log JSONB)?

**תשובה: טכנית כן, מעשית לא. כרגע — בכלל לא.**

### 4.1 מה יש
- `audit_log.previous_value` ו-`new_value` מוגדרים כ-`JSONB` (שורות 345-346). זה אומר שניתן לבנות מחדש את המצב של ישות *אם יש את כל ה-audit entries בסדר הנכון*.
- `price_history` (שורות 65-78) מכיל היסטוריית מחירים נפרדת עם `recorded_at`.
- `procurement_decisions.reasoning` הוא JSONB (שורה 269) — יכול לשמש לשחזור חלקי של החלטות AI.

### 4.2 מה חסר
1. **אין קוד שיודע להפעיל "replay" מה-audit_log לשחזור state.** אין פונקציה `rebuildSupplierFromAuditLog(supplierId)`. אין GraphQL/REST endpoint `POST /api/restore/:entity`.
2. **ה-audit לא תמיד מכיל את ה-prev/next.** בדיקה ב-`server.js`:
   - שורה 152: `audit('supplier', data.id, 'created', ..., 'ספק חדש: ...')` — **אין prev/next**. יצירה לא מתועדת עם הערכים.
   - שורה 161: `audit('supplier', data.id, 'updated', ..., JSON.stringify(req.body), prev, data)` — ✅ כן שומר.
   - שורה 209: `audit('purchase_request', ..., 'created', ...)` — **אין prev/next**.
   - שורה 326: `audit('rfq', rfq.id, 'sent', ...)` — **אין prev/next**.
   - שורה 412: `audit('quote', ..., 'received', ...)` — **אין prev/next**.
   - שורה 582: `audit('procurement_decision', ...)` — **אין prev/next**.
   - שורה 621: `audit('purchase_order', ..., 'approved', ...)` — **אין prev/next**.
   - שורה 672: `audit('purchase_order', ..., 'sent', ...)` — **אין prev/next**.

   **רק 1 מתוך 8 הקריאות** ל-`audit()` בפועל שומרת את ה-prev/next. זה אומר שלא ניתן לבצע replay — המידע פשוט לא שם.

3. **ON DELETE CASCADE מוחק היסטוריה:** כאשר supplier נמחק, `price_history`, `supplier_products`, ו-`rfq_recipients` נמחקים. ה-`audit_log` *לא* עובר cascade, אבל ה-data עצמו נעלם ממקומות אחרים.

### 4.3 מסקנה
ה-`audit_log` במצבו הנוכחי הוא **"chat log", לא "event sourcing"**. אי אפשר לשחזר state ממנו. זה כשל תכנוני שדורש או:
- (א) חיזוק כל קריאות ה-`audit()` להכיל `prev`/`next` מלאים, או
- (ב) גיבוי חיצוני של ה-DB כולה.

מכיוון ש-(ב) לא קיים ו-(א) פועל רק לעדכוני supplier — **הדאטה לא ניתנת לשחזור**.

---

## 5. תרגול שחזור — האם קובי יכול לבצע restore תוך <1 שעה?

**תשובה: לא. אפילו לא קרוב.**

### 5.1 מה נדרש ל-restore drill
| שלב | זמן משוער | האם יש הוראות? |
|---|---|---|
| זיהוי הבעיה (איזו שורה נהרסה? מתי?) | 10-30 דקות | ❌ אין |
| איתור הגיבוי הזמין ב-Supabase Dashboard | 5 דקות | ❌ אין |
| פתיחת ticket ל-Supabase support (Free Tier חייב את זה) | 2-48 שעות | ❌ אין |
| ביצוע restore (יוצר פרויקט חדש) | 10-30 דקות | ❌ אין |
| עדכון `SUPABASE_URL` ו-`SUPABASE_ANON_KEY` ב-`.env` של Replit | 5 דקות | ❌ אין |
| אימות שהנתונים חזרו, ה-RFQ-ים לא כפולים, ה-audit log עקבי | 30-60 דקות | ❌ אין |
| **סה"כ סביר ב-Free Tier** | **3-50 שעות** | |
| **סה"כ סביר ב-Pro Tier עם self-service restore** | **1-2 שעות** | |

### 5.2 ה-RTO בפועל
אפילו בתנאים האופטימליים ביותר (Pro Tier + קובי ער + יודע בדיוק מה לעשות), זמן השחזור המוערך הוא **מעל שעה אחת**. בתרחיש Free Tier + תלות בתמיכה של Supabase — **יכול להיות יום עבודה שלם**.

### 5.3 אין תרגול
לא קיים `RESTORE-DRILL.md`, אין checklist, אין סימולציה. **לקובי אין שום ניסיון מעשי במה לעשות במקרה חירום**. בפעם הראשונה שהוא יצטרך לשחזר — הוא ילמד תוך כדי הקריסה.

---

## 6. יעד RPO (Recovery Point Objective) — מה המערכת מרמזת?

### 6.1 RPO משתמע מהקוד
- `audit_log.created_at` ברזולוציה של שנייה → המערכת מרמזת על תיעוד "real-time", כלומר ציפייה ש-**RPO ≤ שניות**.
- `sent_at` ב-`purchase_orders` ו-`rfq_recipients` תלויים בסדר כרונולוגי מדויק ל-compliance.
- `price_history.recorded_at` משמש לעקומות מחיר → אובדן אפילו של יום אחד שובר את ה-trend analysis.
- `procurement_decisions` — החלטה שאבדה = PO יתכן וכבר נשלח ב-WhatsApp, אבל ה-DB לא יודע. **דאטה לא עקבית מול המציאות**.

### 6.2 RPO בפועל
- **Free Tier ללא backup scripts:** RPO בפועל = **∞** (הכל יכול להיאבד).
- **Free Tier + backup weekly manually via Supabase UI:** RPO = עד **7 ימים**.
- **Pro Tier:** RPO = **24 שעות** (daily backups).
- **Pro Tier + PITR:** RPO = **~2 דקות**.

### 6.3 פער
הציפייה מה-schema (real-time audit, immutable history) היא RPO של דקות. המציאות (שום backup) היא RPO של **שבועות או יותר**. זה פער של **factor 10,000x**.

---

## 7. הצפנת גיבויים ב-rest

### 7.1 מה שיש
- **ב-Supabase כברירת מחדל:** Supabase מצפין את הדאטה ב-rest (AES-256) דרך AWS RDS. זה אוטומטי ולא דורש קונפיגורציה. בתור שכזה, ה-*DB הראשי* מוצפן.
- **ה-gap:** אם קובי יצור backup מקומי (`pg_dump` → `.sql` → Google Drive), אין בקוד ואין בתיעוד שום הפניה להצפנת הקובץ. אין `gpg`, אין `openssl enc`, אין הגדרת password לגיבויים.
- **המפתחות של Supabase ב-`.env`:** אם ה-`.env` של Replit ידלוף (B-03 ב-QA-WAVE1 כבר מציין חשיפה חמורה), המפתח `SUPABASE_ANON_KEY` יאפשר גישה — אבל לא gives full restore access. עם זאת, המדריך לא מצביע על ההבדל בין `anon` ל-`service_role`.

### 7.2 הערכה
- **ה-primary DB מוצפן** — תקין (אך לא בזכות הפרויקט, אלא מכיוון שזה default של Supabase).
- **גיבויים מקומיים — אין, ולכן לא יכולים להיות מוצפנים.** הסיכון הוא *אפס משום שאין מה להצפין*, וזו מסכנה יותר ממצב הפוך.
- **אין רוטציית מפתחות.** אם `.env` דלף פעם אחת, המפתחות קיימים לעד.

---

## 8. עותק off-site / יתירות גיאוגרפית

### 8.1 מה שיש
- המדריך (שלב 1.2) אומר לקובי לבחור region **`West EU (Ireland)`**. זה **ב-region יחיד**.
- Supabase ב-Free Tier לא מספק multi-region replication.
- אין mention של secondary region, אין failover, אין "cross-region backup".

### 8.2 תרחישי כשל שאינם מכוסים
1. **Supabase עצמה נופלת באירלנד** (תקלת AWS Ireland — קרתה היסטורית). → הפרויקט לא זמין. אין פרויקט backup ב-region אחר.
2. **Supabase סוגרת את הפרויקט של קובי** (אי-תשלום, הפרת ToS, שגיאה). → הדאטה נעלמת בתוך 7-30 ימים. אין עותק מקומי.
3. **קובי מוחק את הפרויקט בטעות** מה-Supabase UI. → Supabase נותנים 7 ימי grace period. אחרי זה — *הכל חוזר לאפס*.
4. **Ransomware על המחשב של קובי** שמכיל `.env` → התוקף מקבל מפתחות וכותב `DROP TABLE` או `DELETE * FROM purchase_orders`. הגיבוי Supabase (אם קיים) עלול להיות מחוק גם כן אם זה בתוך אותה חשבון.

### 8.3 עלות vs סיכון
רטרוגרד off-site לפרויקט הזה היה יכול להיות פשוט:
- **Option A:** Replit cron נוסף שמריץ `pg_dump` פעם ביום → Google Drive של קובי (שהוא כבר משתמש בו — הפרויקט יושב ב-OneDrive). עלות: 0. מאמץ: 2-3 שעות הגדרה.
- **Option B:** Supabase Pro + PITR. עלות: $125/חודש. מאמץ: 30 דקות.

אף אחד מהם לא יושם.

---

## סיכום סיכונים + המלצות

### מטריצת חומרה

| סיכון | חומרה | סיכוי לקרות ב-12 חודשים | השפעה |
|---|---|---|---|
| מחיקה בטעות של שורה קריטית (PO, supplier) | 🔴 קריטי | גבוה (קובי עובד ישירות ב-Supabase UI לפי המדריך) | אובדן דאטה היסטורית, לא ניתן לשחזור |
| Supabase Free Tier pause אחרי 7 ימי חוסר פעילות | 🔴 קריטי | בינוני (בהתאם לשימוש) | projeto נסגר, שחזור דורש פעולה ידנית |
| שגיאת migration שהורסת את ה-schema | 🟡 גבוה | בינוני | downtime של 1-50 שעות תלוי בסיוע של Supabase |
| תקלה regional ב-AWS Ireland | 🟡 גבוה | נמוך | downtime עד שאמזון/Supabase פותרים |
| דליפת `.env` → גישה של זר ל-DB | 🔴 קריטי | בינוני (B-03 בפירוש) | אובדן דאטה או שינוי זדוני |
| אובדן audit_log משפטי בגלל CASCADE | 🟡 גבוה | נמוך-בינוני | חשיפה משפטית |

### המלצות ממוקדות (לפי סדר עדיפות)

1. **(מיידי, חינם)** הוסף scheduled task ב-Replit / GitHub Actions שמריץ פעם ביום `supabase db dump` → שומר ב-OneDrive של קובי או ב-Google Drive. 2-3 שעות עבודה. **זה הדבר היחיד שמחזיר את המערכת ממצב "חשופה לחלוטין" למצב "בסיסי מוגן"**.
2. **(מיידי, חינם)** כתוב `BACKUP-RESTORE.md` עם checklist ברור: איך לבצע backup ידני ב-Supabase UI, איך לשחזר מ-dashboard, מי לפנות אליו ב-Supabase support.
3. **(מיידי, חינם)** תרגיל drill — קובי צריך פעם אחת *לבצע בפועל* שחזור של עותק מקומי ל-DB טסט. לא להסתמך על התאוריה.
4. **(עד 30 יום, ₪450/חודש)** שדרוג ל-Supabase Pro + אפשר PITR add-on. עלות ~₪450/חודש, RPO יורד מ-∞ ל-2 דקות.
5. **(תוך 14 יום, קוד)** תקן את כל קריאות `audit()` ב-`server.js` לשמור `prev`/`next` מלאים, לא רק בעדכון supplier. רק אז `audit_log` הופך לכלי event-sourcing שימושי לשחזור.
6. **(תוך 14 יום, schema)** הוסף triggers של `AFTER DELETE` על הטבלאות הקריטיות (`suppliers`, `purchase_orders`, `procurement_decisions`) שכותבים שורה ל-`deleted_entities_archive` — הגנה מפני CASCADE.
7. **(אסטרטגי)** שקול העברת `audit_log` ל-storage נפרד (Supabase bucket, Google Sheets via API, או אפילו print ל-log מרוכז), כך שהוא לא שותף לגורל של ה-DB הראשי.

---

## תאימות ל-QA waves קודמות

**אין חפיפה עם ממצאי QA Agents 1-17.** חיפשתי בקבצים:
- `QA-WAVE1-DIRECT-FINDINGS.md` — דן ב-N+1, pagination, auth, אבל לא ב-backup.
- `QA-WAVE1-UNIFIED-REPORT.md` — אין אזכור.
- `QA-AGENT-08-UNIT-TESTS.md`, `QA-AGENT-09-INTEGRATION-FLOW.md`, `QA-AGENT-10-API-TESTS.md`, `QA-AGENT-12-UX-A11Y.md`, `QA-AGENT-14-LOAD-N1.md`, `QA-AGENT-15-COMPATIBILITY.md` — אין אזכור של backup/restore/DR.

הנקודה העיוורת הזו היא **ייחודית לדוח זה**. מומלץ ל-wave 2 לעקוב ולכלול גם **Tier 2** (secrets management, key rotation, GDPR retention) כהמשך טבעי.

---

**סוף דוח QA Agent #18**
