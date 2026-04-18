# 🚀 איך מעלים את המערכת לגוגל קלאוד — **מדריך לקובי (3 קליקים)**

> **כמה זמן?** 20 דקות בסך הכל.
> **כמה עולה?** Google נותן $300 credit חינם ל-90 יום. אחרי זה — כ-$15–40 לחודש אם יש שימוש אמיתי.
> **מה אתה צריך?** חשבון Google + כרטיס אשראי (רק לאימות — לא ייגבה עד שתחרוג מה-credit).

---

## 🎯 הדרך הכי פשוטה — Cloud Shell (בלי להתקין כלום במחשב)

Cloud Shell הוא טרמינל שרץ בתוך Google Cloud — בדפדפן. כל הכלים כבר מותקנים שם.

### קליק 1 — להיכנס ל-Google Cloud ולהפעיל Billing

1. פתח בדפדפן: **https://console.cloud.google.com**
2. אם זו הכניסה הראשונה:
   - תתקבל שאלה "Would you like to try Google Cloud?" → לחץ **Start Free Trial** (זה ה-$300 credit)
   - הזן פרטי כרטיס אשראי (נדרש לאימות — **לא ייגבה** כסף עד שתאשר ידנית)
3. כשאתה בקונסול הראשי:
   - בצד שמאל למעלה ליד הלוגו — **תפריט הפרויקט** → `NEW PROJECT` → שם: `BASH44` → `Create`
   - המתן 30 שניות עד שהפרויקט נוצר.

✅ עכשיו יש לך פרויקט GCP פעיל.

### קליק 2 — פתיחת Cloud Shell

1. למעלה מימין (ליד האווטאר שלך) — אייקון של טרמינל `>_`
2. לחץ עליו → נפתח חלון טרמינל בתחתית המסך.
3. בפעם הראשונה — תיקח דקה להקצות לך VM.

✅ עכשיו יש לך shell של גוגל עם `gcloud` + `git` + `docker` מותקנים.

### קליק 3 — הדבקת פקודה אחת וסיום

הדבק את **הפקודה הזאת בדיוק** ולחץ Enter:

```bash
bash <(curl -sSL https://raw.githubusercontent.com/KOBI12345678910/KOBI-EL-System-2026/master/scripts/gcp/deploy.sh)
```

**מה יקרה:**
1. ה-script יזהה שאתה מחובר ויאשר את הפרויקט.
2. יפעיל APIs נדרשים (2 דק').
3. ייצור Artifact Registry (לתמונות דוקר).
4. ייצור סודות חזקים ב-Secret Manager (API keys, passwords).
5. ימשוך את הקוד מ-GitHub.
6. יבנה את 4 השירותים (onyx-procurement, onyx-ai, techno-kol-ops, payroll-autonomous) — 8–12 דק'.
7. יפרוס לכל אחד Cloud Run (HTTPS אוטומטי, scale-to-zero, billing רק על שימוש אמיתי).
8. יחבר את השירותים זה לזה (URLs).
9. יריץ smoke tests.
10. ידפיס לך 4 URLs — אחד לכל שירות.

**בסוף תראה משהו כזה:**

```
✅ Deployment complete.

Services:
   onyx-procurement   → https://onyx-procurement-xxxxxx-ew.a.run.app
   onyx-ai            → https://onyx-ai-xxxxxx-ew.a.run.app
   techno-kol-ops     → https://techno-kol-ops-xxxxxx-ew.a.run.app
   payroll-autonomous → https://payroll-autonomous-xxxxxx-ew.a.run.app

הכל באוויר. בהצלחה! 🚀
```

---

## ⚠ 3 דברים שאתה חייב לעשות אחרי שהסקריפט מסיים

הסקריפט שם placeholders ל-3 סודות שרק אתה יכול למלא:

### 1. חיבור ל-Supabase (DB)

אם יש לך כבר פרויקט Supabase, לך ל:
`Supabase Dashboard → Project → Settings → Database → Connection String (URI)`

העתק את ה-URI, וב-Cloud Shell הקלד:

```bash
echo -n 'postgresql://postgres:YOUR_PASSWORD@db.xxxxx.supabase.co:5432/postgres' \
  | gcloud secrets versions add supabase-db-url --data-file=-

# חדש את השירות כדי שהוא יקרא את הסיסמה החדשה
gcloud run services update onyx-procurement --region=europe-west3 \
  --set-secrets=SUPABASE_DB_URL=supabase-db-url:latest

gcloud run services update techno-kol-ops --region=europe-west3 \
  --set-secrets=SUPABASE_DB_URL=supabase-db-url:latest
```

**אם אין לך Supabase** — תוכל ליצור בחינם ב-https://supabase.com (Free tier מספיק ל-500 משתמשים).
עקוב אחרי `DEPLOYMENT-RUNBOOK-VERCEL.md` שלב 2 (Supabase) בלבד — את השאר תריץ ב-GCP.

### 2. מפתח Anthropic (אם רוצים AI)

אם יש לך API key מ-https://console.anthropic.com/settings/keys:

```bash
echo -n 'sk-ant-api03-xxxxxxxxxxxxxxxxx' \
  | gcloud secrets versions add anthropic-api-key --data-file=-

gcloud run services update onyx-ai --region=europe-west3 \
  --set-secrets=ANTHROPIC_API_KEY=anthropic-api-key:latest
```

אם אין — לא נורא, onyx-ai יעבוד בלי פיצ'רי LLM.

### 3. שמור את ה-API keys שלך

הסקריפט יצר 2 admin API keys. כדי לראות אותם:

```bash
gcloud secrets versions access latest --secret=api-keys
```

**העתק את הפלט ושמור אותו ב-password manager** (Bitwarden / 1Password / LastPass).
ה-key הראשון — לקובי (admin). השני — ל-backup / rotation.

**כדי לבדוק שהכל עובד:**

```bash
# קח את ה-KEY הראשון מהפלט שלמעלה
ADMIN_KEY="<paste-here>"

curl -H "x-api-key: ${ADMIN_KEY}" \
  https://onyx-procurement-xxxxxx-ew.a.run.app/api/suppliers
```

צריך להחזיר `[]` (ריק — כי עוד לא טענת נתונים) או רשימת ספקים.

---

## 🌐 (אופציונלי) — חיבור דומיין משלך

אם יש לך דומיין (למשל `technokoluzi.co.il`):

1. ודא שהדומיין מאומת ב-Google: https://console.cloud.google.com/apis/credentials/domainverification
2. הקלד ב-Cloud Shell:

```bash
gcloud run domain-mappings create \
  --service=onyx-procurement \
  --domain=erp.technokoluzi.co.il \
  --region=europe-west3

# גוגל יחזיר רשומת DNS (CNAME או A). העתק אותה וחבר בדומיין שלך.
```

3. ה-SSL (HTTPS) ייווצר אוטומטית תוך 15 דק'.

---

## 🆘 אם משהו נתקע

### "Billing not enabled"
לך ל: https://console.cloud.google.com/billing/linkedaccount → חבר כרטיס אשראי.

### "Permission denied" או "403"
ב-Cloud Shell:
```bash
gcloud auth login
gcloud config set project BASH44   # או שם הפרויקט שלך
```

### סקריפט קרס באמצע
פשוט הרץ שוב את אותה פקודה — הוא מזהה מה כבר קיים ומדלג עליו:
```bash
bash <(curl -sSL https://raw.githubusercontent.com/KOBI12345678910/KOBI-EL-System-2026/master/scripts/gcp/deploy.sh)
```

### לראות מה קורה בשרת
```bash
gcloud run services logs tail onyx-procurement --region=europe-west3
```

### למחוק הכל ולהתחיל מחדש (זהירות!)
```bash
# מוחק את כל 4 השירותים. ה-DB (Supabase) נשאר.
for svc in onyx-procurement onyx-ai techno-kol-ops payroll-autonomous; do
  gcloud run services delete "$svc" --region=europe-west3 --quiet
done
```

---

## 💰 כמה זה עולה באמת?

Cloud Run הוא **"scale-to-zero"** — משלמים רק כשיש טראפיק.

| רכיב | תשלום |
|---|---|
| 4 Cloud Run services (scale-to-zero) | **$0–$15/חודש** לעומס נמוך |
| Artifact Registry | $0.10 לכל GB, ~$0.50 לחודש |
| Secret Manager | 6 גרסאות חינם/חודש, אחר כך $0.06 לסוד |
| Cloud Build | 120 דק' בנייה חינם/יום |
| **סה"כ ב-free tier + $300 credit** | **$0 ל-3 החודשים הראשונים** |
| **אחרי ה-credit, לחברה קטנה** | **~$15–40/חודש** |

אם יש הרבה משתמשים — אפשר תמיד לשדרג. אם אין שימוש — זה לא עולה כלום (scale to zero!).

---

## 📞 Cheat Sheet — פקודות להיזכר בהן אחר כך

```bash
# לראות את כל השירותים
gcloud run services list --region=europe-west3

# לראות logs חיים של שירות
gcloud run services logs tail onyx-procurement --region=europe-west3

# לעדכן secret
echo -n 'new-value' | gcloud secrets versions add SECRET_NAME --data-file=-

# לעדכן ENV var ידנית
gcloud run services update SERVICE_NAME --region=europe-west3 \
  --set-env-vars=KEY=value

# לעדכן את השירות לתמונה חדשה (אחרי git push)
bash <(curl -sSL https://raw.githubusercontent.com/KOBI12345678910/KOBI-EL-System-2026/master/scripts/gcp/deploy.sh)

# סטטוס X-100 (כבר ב-100% GO)
cd ~/techno-kol-erp/onyx-procurement && node -e "require('./src/reports/grand-aggregator.js').aggregateAll().then(r=>console.log(r.verdict.verdict))"
```

---

**עודכן:** 2026-04-16
**חוק ברזל:** לא מוחקים, רק משדרגים ומגדלים.
**מצב QA:** GO 100% (336/336 דוחות ירוקים).

אם אתה תקוע בשלב כלשהו — שלח לי screenshot ואני אעזור. 🤝
