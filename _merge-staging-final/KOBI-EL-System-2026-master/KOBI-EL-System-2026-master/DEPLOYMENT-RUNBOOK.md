# 🚀 DEPLOYMENT RUNBOOK — Techno-Kol Uzi ERP 2026

> **מטרה:** לקחת את המערכת מהמחשב המקומי (C:\Users\kobi\OneDrive\kobi\…) ל-Google Cloud פרודקשן.
> **4 שלבים:** `PRE-CLOUD` → `CLOUD-SETUP` → `DEPLOY` → `POST-LAUNCH`.
> **חוק ברזל:** לא מוחקים, רק משדרגים ומגדלים.
> **עודכן:** 2026-04-16

---

## ⚠️ 3 טעויות קריטיות — אל תעשה אותן לעולם

| # | טעות | ההשלכה | ההגנה |
|---|---|---|---|
| 1 | **להעלות בלי בדיקות QA מלאות** | המערכת תישבר בפרודקשן — פשיטות רגל של דאטה, פאניקה של אוזי | הרץ `node onyx-procurement/src/reports/grand-aggregator.js` — **חייב להחזיר `VERDICT: GO` עם 100% completion** לפני שלב DEPLOY. כרגע (2026-04-16) **המערכת במצב GO מלא — 336/336 ירוק.** |
| 2 | **לא לעשות גיבוי לפני העלאה** | אם משהו נשבר בהעברה, אובדן מוחלט של דאטה קבלני המשנה, RFQs, wage-slips, invoices | הרץ את `scripts/backup-all.sh` (נוצר ב-PRE-CLOUD step 4). שמור 2 עותקים: אחד ב-OneDrive, אחד בכונן חיצוני. |
| 3 | **לפתוח שרת ציבורי בלי אבטחה** | פריצה תוך ימים — נחשפים: wage-slips, bank accounts, RFQs, VAT filings, IDs של עובדים | **תמיד** HTTPS (LetsEncrypt), Firewall מגביל ל-80/443 בלבד, SSH רק עם key, ASADIFY env vars, rate-limit על login. פרק POST-LAUNCH §4. |

---

## שלב 1 — PRE-CLOUD (מקומי)

מטרה: לוודא שהמערכת תקינה, נקייה, עם משתמשים, ומגובה — לפני שעוזבים את המחשב.

### 1.1 בדיקות מערכת מלאות (QA)

כל הבדיקות נגזרות מ-20-agent QA framework שכבר קיים.

```bash
cd "C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement"

# הריץ את ה-X-100 grand-aggregator
node -e "const g=require('./src/reports/grand-aggregator.js'); \
  g.aggregateAll({writeOutput:true}).then(r=>{ \
    console.log('VERDICT:',r.verdict.verdict); \
    console.log('COMPLETION:',((r.summary.completion_rate||0)*100).toFixed(2)+'%'); \
    console.log('COMPLETED:',r.summary.total_completed,'/',r.summary.total_reports); \
  });"
```

**חייב להחזיר:** `VERDICT: GO`, `COMPLETION: 100.00%`, `336/336`.

בדיקות נקודתיות שצריך לעבור ידנית לפני CLOUD-SETUP:

| בדיקה | פעולה | יעד |
|---|---|---|
| **יצירת פרויקט** | `POST /api/projects` עם שם אמיתי ("שיפוץ מרמלדה 2026"), תאריכי התחלה/סוף, תקציב | 201 + ID חוזר |
| **חישוב תמחור** | `POST /api/rfq/send` → 3 ספקים → `POST /api/quotes` → `scoreQuote()` | ציון בין 0–100, ספק זוכה ברור |
| **רווחיות** | `GET /api/analytics/savings` | סכום חיסכון (₪) + אחוז חיסכון |
| **עדכון מלאי** | `POST /api/subcontractors/:id/work-completed` → trigger חישוב יתרה | יתרה עדכנית |
| **שגיאות** | `node onyx-procurement/test/security/qa-12-rbac.test.js` | `0 failed` |

### 1.2 ניקוי נתונים (DELETE test rows — BUT archive, never drop)

**⚠️ חוק ברזל: אנחנו לא מוחקים.** מה שנראה כ"מחיקת נתוני טסט" הוא בעצם העברה לטבלת `*_archive`.

הרץ:
```sql
-- onyx-procurement/supabase/migrations/003-archive-test-rows.sql
-- (יוצרים אם אין)
BEGIN;
-- העבר רשומות עם שם שמכיל "test" / "demo" / "דוגמא" לטבלת archive
INSERT INTO projects_archive SELECT * FROM projects
  WHERE lower(name) LIKE ANY (ARRAY['%test%','%demo%','%דוגמא%','%lorem%']);
DELETE FROM projects
  WHERE lower(name) LIKE ANY (ARRAY['%test%','%demo%','%דוגמא%','%lorem%']);
-- חזור על זה לכל טבלה עם נתוני פרוד: suppliers, employees, invoices, rfqs, quotes, pos
COMMIT;
```

### 1.3 SSOT — Single Source of Truth — וידוא חיבורים

הרץ את `AG-58-connection-audit.md` (Agent 58 כבר בדק — DB pools, leaks, timeouts — GREEN).
**וידוא כפילויות:**
```sql
-- חייב לחזור 0 שורות
SELECT email, COUNT(*) FROM employees GROUP BY email HAVING COUNT(*) > 1;
SELECT business_id, COUNT(*) FROM suppliers GROUP BY business_id HAVING COUNT(*) > 1;
SELECT invoice_no, COUNT(*) FROM vat_invoices GROUP BY invoice_no HAVING COUNT(*) > 1;
```

### 1.4 משתמשים והרשאות

תבנית admin-seed — **הרחב לקובץ נפרד ב-`scripts/seed-users.js`**:

```javascript
// scripts/seed-users.js — הרץ פעם אחת לפני CLOUD-SETUP
const users = [
  { email: 'kobi@technokoluzi.co.il',  role: 'admin',      employee_id: 'U-001', display_name: 'קובי אלקיים' },
  { email: 'uzi@technokoluzi.co.il',   role: 'admin',      employee_id: 'U-002', display_name: 'אוזי' },
  { email: 'accountant@…',             role: 'accountant', employee_id: 'U-010', display_name: 'רואה חשבון' },
  { email: 'site-mgr@…',               role: 'manager',    employee_id: 'U-020', display_name: 'מנהל אתר' },
  { email: 'employee1@…',              role: 'employee',   employee_id: 'U-100', display_name: 'עובד 1' },
  { email: 'viewer@…',                 role: 'viewer',     employee_id: null,    display_name: 'צפייה בלבד' },
];

// מי רואה מחירים:
//   admin      → הכל (gross/net/taxes/ספקים/PO/costs/RFQ amounts)
//   manager    → ספקים + PO + RFQ amounts (בלי payroll)
//   accountant → הכל פיננסי (כולל payroll + VAT + bank) אבל בלי approve PO
//   employee   → wage-slip שלו בלבד, balances שלו בלבד, אין access ל-prices
//   viewer     → read-only על הכל חוץ מ-payroll details
//
// Server-side enforcement: src/payroll/payroll-routes.js → denyIfNotOwnerOrAdmin()
// Env vars נדרשים ב-production:
//   PAYROLL_ADMIN_KEYS=key1,key2,key3
//   PAYROLL_EMPLOYEE_KEY_MAP=U-100:empKey1,U-101:empKey2
```

הרשאות גישה — **חסומים ברמת Server (src/payroll/payroll-routes.js + server.js)** כבר תוקנו במסגרת QA-12 (7 באגים RESOLVED).

### 1.5 גיבוי ראשון (הקריטי ביותר!)

**פקודה אחת מעתיקה הכל:**

```bash
# scripts/backup-all.sh
#!/bin/bash
set -euo pipefail

TS=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="./backups/backup-${TS}"
mkdir -p "${BACKUP_DIR}"

# 1. דאטה Supabase (אם SUPABASE_DB_URL מוגדר, אחרת SQLite-like export)
if [ -n "${SUPABASE_DB_URL:-}" ]; then
  pg_dump "${SUPABASE_DB_URL}" --no-owner --no-acl -Fc > "${BACKUP_DIR}/supabase-dump.backup"
fi

# 2. קבצי קוד — tarball של כל הפרויקט חוץ מ-node_modules/dist/.git
tar --exclude='**/node_modules' --exclude='**/dist' --exclude='.git' \
    -czf "${BACKUP_DIR}/source-code.tar.gz" \
    onyx-procurement onyx-ai techno-kol-ops payroll-autonomous paradigm_engine

# 3. מסמכים / PDFs / uploads
if [ -d "./uploads" ]; then
  tar -czf "${BACKUP_DIR}/uploads.tar.gz" ./uploads
fi

# 4. .env* files (אם לא מוצפנים — לשים ב-vault נפרד!)
find . -maxdepth 3 -name '.env*' -not -path '*/node_modules/*' \
  -exec cp --parents {} "${BACKUP_DIR}/env-files/" \;

# 5. _qa-reports — כל הדוחות
cp -r ./_qa-reports "${BACKUP_DIR}/_qa-reports"

# 6. checksum
(cd "${BACKUP_DIR}" && sha256sum * > checksums.txt)

echo "✅ Backup written to: ${BACKUP_DIR}"
ls -lah "${BACKUP_DIR}"
```

**שני עותקים:**
1. `./backups/backup-YYYYMMDD-HHMMSS/` (מקומי)
2. Copy ל-OneDrive או כונן חיצוני: `robocopy ./backups D:\backups-kobi /E`

**אימות:** אל תמשיך לשלב 2 לפני שראית את ה-`checksums.txt` ואת גודל הקבצים תקין (supabase-dump > 1MB, source-code > 10MB).

---

## שלב 2 — CLOUD-SETUP (Google Cloud)

### 2.1 פתיחת חשבון + פרויקט

1. היכנס: https://console.cloud.google.com
2. `Select a project` → `NEW PROJECT`
3. Project name: **`BASH44`** (כפי שהמשתמש ביקש)
4. Billing: חבר כרטיס אשראי (Google נותן $300 credit ל-90 יום)
5. **שמור את `PROJECT_ID`** — תצטרך אותו הרבה.

```bash
# אחרי התקנת gcloud CLI:
gcloud auth login
gcloud config set project BASH44-<suffix>
export PROJECT_ID=$(gcloud config get-value project)
echo "PROJECT_ID=${PROJECT_ID}"
```

### 2.2 Cloud SQL — PostgreSQL

```bash
gcloud services enable sqladmin.googleapis.com

gcloud sql instances create bash44-db \
  --database-version=POSTGRES_15 \
  --region=europe-west3 \
  --tier=db-g1-small \
  --storage-size=20GB \
  --storage-auto-increase \
  --backup-start-time=02:00 \
  --maintenance-window-day=SUN \
  --maintenance-window-hour=03

# סיסמה חזקה — השתמש ב-password manager
DB_PWD=$(openssl rand -base64 32)
gcloud sql users set-password postgres --instance=bash44-db --password="${DB_PWD}"

# צור DB ספציפי לאפליקציה
gcloud sql databases create erp_prod --instance=bash44-db

# שמור פרטי חיבור:
echo "SUPABASE_DB_URL=postgresql://postgres:${DB_PWD}@$(gcloud sql instances describe bash44-db --format='value(ipAddresses[0].ipAddress)')/erp_prod?sslmode=require" > .env.prod
```

**⚠️ אל תשים את `.env.prod` ב-git.** הוסף ל-`.gitignore`.

### 2.3 Cloud Storage — Bucket לקבצים

```bash
gcloud services enable storage.googleapis.com

# bucket פרטי לחלוטין
gcloud storage buckets create gs://bash44-uploads \
  --location=europe-west3 \
  --uniform-bucket-level-access \
  --public-access-prevention

# Service Account שיעלה קבצים
gcloud iam service-accounts create erp-app --display-name="ERP App"
gcloud storage buckets add-iam-policy-binding gs://bash44-uploads \
  --member=serviceAccount:erp-app@${PROJECT_ID}.iam.gserviceaccount.com \
  --role=roles/storage.objectAdmin

# הורד key ל-VM (שלב DEPLOY ישתמש בו)
gcloud iam service-accounts keys create ./sa-key.json \
  --iam-account=erp-app@${PROJECT_ID}.iam.gserviceaccount.com
```

### 2.4 Compute Engine — VM

```bash
gcloud services enable compute.googleapis.com

gcloud compute instances create bash44-vm \
  --zone=europe-west3-a \
  --machine-type=e2-small \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --tags=http-server,https-server

# Firewall: רק 80, 443, ו-SSH (22) — הכל אחר חסום
gcloud compute firewall-rules create allow-http \
  --allow=tcp:80 --target-tags=http-server
gcloud compute firewall-rules create allow-https \
  --allow=tcp:443 --target-tags=https-server
gcloud compute firewall-rules create allow-ssh \
  --allow=tcp:22 --source-ranges=<YOUR_IP>/32  # רק מה-IP שלך!

# חבר כל בקשה פנימית ל-Cloud SQL via private IP
gcloud sql instances patch bash44-db --network=default
```

### 2.5 Domain

1. קנה דומיין (אם אין): Namecheap / Google Domains / .co.il רשם
2. קבל את ה-IP של ה-VM:
```bash
VM_IP=$(gcloud compute instances describe bash44-vm --zone=europe-west3-a --format='get(networkInterfaces[0].accessConfigs[0].natIP)')
echo "VM_IP=${VM_IP}"
```
3. ברשם הדומיין → DNS → הוסף **A record**: `erp.technokoluzi.co.il` → `<VM_IP>`
4. המתן 5–30 דק' ל-DNS propagation. אמת עם:
```bash
dig +short erp.technokoluzi.co.il
```

---

## שלב 3 — DEPLOY

### 3.1 העלאת קוד ל-VM

```bash
# SSH ל-VM
gcloud compute ssh bash44-vm --zone=europe-west3-a

# ב-VM:
sudo apt-get update
sudo apt-get install -y nodejs npm nginx certbot python3-certbot-nginx git
sudo npm install -g pm2

# Clone / rsync הקוד (השתמש ב-git אם עולה ל-private repo, אחרת rsync)
mkdir -p /opt/erp && cd /opt/erp
# מקומי → VM (ב-shell המקומי):
#   gcloud compute scp --recurse --zone=europe-west3-a \
#     "C:/Users/kobi/.../onyx-procurement" bash44-vm:/opt/erp/
```

### 3.2 חיבור ל-Database + הרצת Backend

ב-VM:
```bash
cd /opt/erp/onyx-procurement

# .env.production
cat > .env.production <<EOF
NODE_ENV=production
PORT=3100
SUPABASE_DB_URL=postgresql://postgres:<DB_PWD>@<CLOUD_SQL_IP>/erp_prod?sslmode=require
API_KEYS=$(openssl rand -hex 32),$(openssl rand -hex 32)
PAYROLL_ADMIN_KEYS=<תן כאן 2 admin keys>
PAYROLL_EMPLOYEE_KEY_MAP=U-100:<emp-key>
AUTH_MODE=api_key
GCS_BUCKET=bash44-uploads
GOOGLE_APPLICATION_CREDENTIALS=/opt/erp/sa-key.json
EOF

npm ci --omit=dev

# הרץ migrations (או Supabase SQL)
psql "${SUPABASE_DB_URL}" -f supabase/migrations/001-supabase-schema.sql
psql "${SUPABASE_DB_URL}" -f supabase/migrations/002-seed-data-extended.sql

# הפעל backend עם pm2 (restart אוטומטי)
pm2 start server.js --name erp-api --env production
pm2 save
pm2 startup  # יריץ on reboot

# בדיקת חיבור ל-DB — 3 קריאות:
curl -s http://localhost:3100/api/health            # 200
curl -s http://localhost:3100/api/status            # 200
curl -s -H "x-api-key: <key>" http://localhost:3100/api/suppliers | head -c 200  # JSON
```

### 3.3 HTTPS (LetsEncrypt)

```bash
# nginx reverse proxy
sudo tee /etc/nginx/sites-available/erp > /dev/null <<'EOF'
server {
  listen 80;
  server_name erp.technokoluzi.co.il;
  location / { proxy_pass http://127.0.0.1:3100; proxy_set_header Host $host; }
}
EOF
sudo ln -s /etc/nginx/sites-available/erp /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Certbot — אוטומטי מוסיף HTTPS + auto-renewal
sudo certbot --nginx -d erp.technokoluzi.co.il \
  --non-interactive --agree-tos -m kobi@technokoluzi.co.il

# אחרי זה:
curl -I https://erp.technokoluzi.co.il    # חייב להחזיר 200 + HSTS + TLSv1.3
```

### 3.4 בדיקות באינטרנט

```bash
# מהמחשב המקומי:
curl -I https://erp.technokoluzi.co.il                # 200, אין "Not Secure"
curl -s https://erp.technokoluzi.co.il/api/health     # {"ok":true}
curl -s -H "x-api-key: $PROD_KEY" https://erp.technokoluzi.co.il/api/suppliers | jq '.[] | .name' | head

# בדפדפן: https://erp.technokoluzi.co.il → דשבורד Palantir dark
# בדוק: לוגין, יצירת פרויקט, RFQ, approval, export PDF
```

---

## שלב 4 — POST-LAUNCH

### 4.1 גיבויים אוטומטיים

**Cloud SQL — automated daily backups** (מופעל ב-2.2 עם `--backup-start-time=02:00`). וידוא:
```bash
gcloud sql backups list --instance=bash44-db | head -5   # חייב לראות אחד ביום
```

**Cloud Storage objects — versioning:**
```bash
gcloud storage buckets update gs://bash44-uploads --versioning
```

**גיבוי שבועי מלא ל-bucket ארכיון:**
```bash
# ב-VM — crontab:
sudo crontab -e
# הוסף:
# כל יום ראשון 03:00 — dump DB + העלאה ל-bucket ארכיון
0 3 * * 0 pg_dump "$SUPABASE_DB_URL" -Fc | gzip | gcloud storage cp - gs://bash44-archive/weekly/$(date +\%Y-\%m-\%d).backup.gz
```

### 4.2 ניטור — Cloud Monitoring

```bash
gcloud services enable monitoring.googleapis.com logging.googleapis.com

# Agent ב-VM
curl -sSO https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh
sudo bash add-google-cloud-ops-agent-repo.sh --also-install
```

**Dashboards ב-Cloud Console → Monitoring:**
- CPU > 80% ל-5 דק'
- Memory > 85%
- Disk > 75%
- HTTP 5xx > 1% מהבקשות ב-5 דק'
- DB connections > 80% מה-pool

### 4.3 התראות

ב-Cloud Console → Monitoring → Alerting:

| Alert | Condition | Channel |
|---|---|---|
| שרת נופל | VM down > 2 min | SMS + Email לקובי |
| DB נופל | Cloud SQL unreachable > 1 min | SMS + Email |
| Disk full | Disk > 90% | Email |
| Error spike | 5xx > 5% ל-3 דק' | Slack + Email |
| Failed login | > 10 login failures ב-5 דק' מאותו IP | Email (potential attack) |

### 4.4 אבטחה (הכי חשוב!)

```bash
# 1. Firewall — רק מה שצריך פתוח
gcloud compute firewall-rules list
# חייב לראות רק: allow-http(80), allow-https(443), allow-ssh(22 מ-<YOUR_IP>)

# 2. SSH רק עם key, לא עם password
sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl reload sshd

# 3. fail2ban — חסימה אוטומטית אחרי 5 ניסיונות כושלים
sudo apt-get install -y fail2ban
sudo systemctl enable --now fail2ban

# 4. Rate limit על /api/login (onyx-procurement/server.js כבר עושה 300/15min)
#    וידוא שהמשתנה express-rate-limit מוגדר בפרודקשן

# 5. Secrets ב-Secret Manager — לא ב-.env על דיסק!
gcloud services enable secretmanager.googleapis.com
gcloud secrets create supabase-db-url --data-file=<(echo -n "$SUPABASE_DB_URL")
gcloud secrets create api-keys --data-file=<(echo -n "$API_KEYS")
# ה-VM קורא בזמן boot:
#   export SUPABASE_DB_URL=$(gcloud secrets versions access latest --secret=supabase-db-url)

# 6. HTTPS only — redirect 80 → 443 (certbot עושה אוטומטית ב-nginx)

# 7. CORS — רק מהדומיין שלך
#    ב-onyx-procurement/server.js: cors({ origin: 'https://erp.technokoluzi.co.il' })

# 8. Audit log — כל שינוי פיננסי נשמר (כבר קיים ב-onyx-procurement/src/audit/)
```

---

## 📊 צ'קליסט מוכנות לשחרור (חותמים לפני GO)

- [ ] QA X-100: `VERDICT: GO` + `COMPLETION: 100%` + 0 warnings ✅ **אושר 2026-04-16**
- [ ] גיבוי מלא נעשה ואומת (checksum + גודל)
- [ ] Cloud SQL instance רץ + daily backup מוגדר
- [ ] Storage bucket פרטי, public-access-prevention מופעל
- [ ] VM firewall: רק 80/443 פתוחים, SSH רק מ-IP שלך
- [ ] HTTPS פועל — `curl -I https://…` מחזיר 200 + HSTS
- [ ] חיבור DB מהשרת עובד (health check)
- [ ] 6 משתמשים seed נוצרו (admin × 2, accountant, manager, employee, viewer)
- [ ] Cloud Monitoring agent מותקן
- [ ] 5 Alerts מוגדרים (שרת, DB, disk, 5xx, failed login)
- [ ] Secret Manager מכיל: SUPABASE_DB_URL, API_KEYS, PAYROLL_ADMIN_KEYS
- [ ] Fail2ban רץ
- [ ] SSH password auth כבוי
- [ ] CORS מוגבל לדומיין שלך

כשכל ה-13 בצ'ק — **GO LIVE**. לפני — **אסור**.

---

## Appendix A — פקודות רזות לרפרנס מהיר

```bash
# בדיקת סטטוס X-100
cd onyx-procurement && node -e "require('./src/reports/grand-aggregator.js').aggregateAll().then(r=>console.log(r.verdict.verdict, ((r.summary.completion_rate||0)*100).toFixed(1)+'%'))"

# גיבוי ידני מיידי
bash scripts/backup-all.sh

# restart backend ב-VM
pm2 restart erp-api

# logs חיים
pm2 logs erp-api --lines 100

# rollback (אם הדיפלוי שבר משהו)
pm2 stop erp-api
gcloud sql backups restore <BACKUP_ID> --restore-instance=bash44-db --backup-instance=bash44-db
pm2 start erp-api
```

---

**עודכן:** 2026-04-16
**מחבר:** KOBI-EL System 2026 — Deployment team
**חוק ברזל:** לא מוחקים, רק משדרגים ומגדלים.
