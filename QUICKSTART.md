# QUICKSTART — התקנה והרצה ב-5 דקות | 5-Minute Onboarding

> **Bilingual Guide / מדריך דו-לשוני** — עברית + English
> **For:** Kobi El, Techno-Kol Uzi (metal fabrication + real estate)
> **System:** Mega ERP 2026 (onyx-procurement + payroll-autonomous + techno-kol-ops + onyx-ai)

---

## 1. דרישות מוקדמות / Prerequisites

### עברית
- Windows 10 / 11, macOS, או Linux.
- Node.js 20.x ומעלה.
- Python 3.11+ (עבור onyx-ai ו-payroll-autonomous).
- Git.
- PostgreSQL 15+ (או SQLite בפיתוח).
- חיבור אינטרנט יציב (נדרש רק להגשה לרשות המסים).
- דפדפן Chrome / Edge / Firefox עדכני.

### English
- Windows 10/11, macOS, or Linux.
- Node.js 20.x or later.
- Python 3.11+ (for onyx-ai and payroll-autonomous).
- Git.
- PostgreSQL 15+ (SQLite OK for dev).
- Stable internet (only needed for רשות המסים submissions).
- Modern Chrome / Edge / Firefox.

**Check versions / בדיקת גרסאות:**
```bash
node --version     # v20.x.x
python --version   # Python 3.11.x
git --version
psql --version
```

---

## 2. שכפול והתקנה / Clone + Install

### עברית — שכפל את כל ה-5 פרויקטים
```bash
# גש לתיקיית הבסיס
cd "C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL"

# התקן תלויות בכל פרויקט
cd onyx-procurement && npm install && cd ..
cd payroll-autonomous && pip install -r requirements.txt && cd ..
cd techno-kol-ops && npm install && cd ..
cd onyx-ai && pip install -r requirements.txt && cd ..
```

### English — Install dependencies for all 5 projects
```bash
cd "C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL"

cd onyx-procurement && npm install && cd ..
cd payroll-autonomous && pip install -r requirements.txt && cd ..
cd techno-kol-ops && npm install && cd ..
cd onyx-ai && pip install -r requirements.txt && cd ..
```

---

## 3. הגדרת `.env` / Environment Setup

### עברית
1. העתק את `.env.example` לקובץ חדש בשם `.env` בכל פרויקט:
   ```bash
   cp .env.example .env
   ```
2. פתח את `.env` בעורך ומלא את הערכים:
   - `DB_URL` — כתובת מסד הנתונים.
   - `SHAAM_API_KEY` — מפתח רשות המסים.
   - `WHATSAPP_API_TOKEN` — אסימון WhatsApp Business.
   - `BANK_CONNECTOR_KEY` — מפתח Open Banking.
   - `JWT_SECRET` — מחרוזת סודית (מינימום 32 תווים).
   - `ADMIN_USER` / `ADMIN_PASS` — משתמש ראשון.

> **Placeholder:** קובץ `.env.example` נמצא בשורש כל פרויקט. אם לא קיים — בקש מהמפתח או צור ריק לפי התבנית לעיל.

### English
1. Copy `.env.example` to `.env` in each project:
   ```bash
   cp .env.example .env
   ```
2. Fill values — see above list. Never commit `.env` to git.

---

## 4. הרצת מיגרציות / Run Migrations

### Node projects (onyx-procurement, techno-kol-ops)
```bash
cd onyx-procurement && npm run migrate && cd ..
cd techno-kol-ops && npm run migrate && cd ..
```

### Python projects (payroll-autonomous, onyx-ai)
```bash
cd payroll-autonomous && python manage.py migrate && cd ..
cd onyx-ai && python manage.py migrate && cd ..
```

> **אם הפקודה לא עובדת / If the command fails:** בדוק את ה-README של הפרויקט לפקודה המדויקת. הפקודות לעיל הן Placeholder — עקוב אחר הוראות ה-README לכל פרויקט בנפרד.

---

## 5. הרצת שרת / Start Server

### פרויקט יחיד / Single project
```bash
cd onyx-procurement && npm run dev
```

### כל הפרויקטים במקביל / All projects in parallel (recommended)
פתח 4 חלונות טרמינל וריץ בכל אחד:
```bash
# Terminal 1
cd onyx-procurement && npm run dev          # Port 3000

# Terminal 2
cd payroll-autonomous && python manage.py runserver 8001   # Port 8001

# Terminal 3
cd techno-kol-ops && npm run dev             # Port 3002

# Terminal 4
cd onyx-ai && python manage.py runserver 8003  # Port 8003
```

---

## 6. פתיחת Dashboard / Open Dashboard

פתח בדפדפן / Open in browser:

| מודול / Module | URL |
|---|---|
| רכש / Procurement | http://localhost:3000 |
| שכר / Payroll | http://localhost:8001 |
| ops / Techno-Kol Ops | http://localhost:3002 |
| מס ומע"מ / Tax & VAT | http://localhost:8003 |

התחבר עם `ADMIN_USER` / `ADMIN_PASS` שהוגדרו ב-`.env`.

---

## 7. בדיקת עשן מהירה / Quick Smoke Test

בצע את 3 הפעולות הבאות כדי לוודא שהכול עובד:

### א. צור RFQ אחד / Create one RFQ
1. `http://localhost:3000` → רכש → **"+ בקשת מחיר חדשה"**.
2. שם פריט: "בדיקה — פלטת פלדה 5 מ"מ".
3. כמות: 10.
4. בחר ספק דמה.
5. שמור.
6. **ציפייה / Expected:** RFQ מופיע ברשימה עם סטטוס "ממתין להצעות".

### ב. הוסף עובד אחד / Add one employee
1. `http://localhost:8001` → שכר → עובדים → **"+ עובד חדש"**.
2. שם: "עובד בדיקה".
3. ת.ז.: `000000000`.
4. שכר בסיס: `10,000`.
5. שמור.
6. **ציפייה:** העובד מופיע ברשימה.

### ג. חשב תלוש שכר אחד / Compute one wage slip
1. `http://localhost:8001` → שכר → חישוב חודשי.
2. בחר חודש נוכחי.
3. לחץ **"חשב הכל"**.
4. **ציפייה:** תלוש נוצר, נטו מחושב, סטטוס "draft".
5. לחץ **"הפק PDF"** — וודא שהקובץ יורד.

**אם 3 הבדיקות עוברות — המערכת פועלת! / If all 3 pass, you're good to go!**

---

## 8. מה הלאה? / What's Next?

- קרא את [`USER_GUIDE_HE.md`](./USER_GUIDE_HE.md) למדריך המלא.
- קרא את [`FAQ.md`](./FAQ.md) לתשובות לשאלות נפוצות.
- הגדר **פרופיל עוסק** במודול מע"מ לפני יצירת חשבוניות.
- הוסף את המעסיק **Techno-Kol Uzi** במודול שכר.

---

## פתרון תקלות מהיר / Quick Troubleshooting

| שגיאה / Error | פתרון / Fix |
|---|---|
| `EADDRINUSE :3000` | יציאה תפוסה — סגור את הרץ הקיים או שנה פורט ב-`.env` |
| `ECONNREFUSED postgres` | PostgreSQL לא רץ — הפעל `pg_ctl start` |
| `Module not found` | הרץ שוב `npm install` / `pip install -r requirements.txt` |
| `Migration failed` | מחק את ה-DB ובנה מחדש: ראה README של הפרויקט |

---

**Version:** 1.0 | **Date:** 2026-04-11 | **Author:** Agent-32 for Kobi El
