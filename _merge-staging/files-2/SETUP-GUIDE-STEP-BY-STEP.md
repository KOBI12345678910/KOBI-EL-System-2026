# 🚀 מדריך התקנה — צעד אחר צעד
# לקובי — בלי מילים מיותרות, רק מה ללחוץ

---

## שלב 1: SUPABASE — יצירת המחסן (5 דקות)

### 1.1 פתח את Supabase
- לך לכתובת: https://supabase.com
- אם אין לך חשבון — תרשם (חינם)
- אם יש לך — תתחבר

### 1.2 צור פרויקט חדש
- לחץ "New Project"
- שם: `onyx-procurement`
- סיסמה: תבחר סיסמה חזקה (שמור אותה!)
- Region: בחר `West EU (Ireland)` — הכי קרוב לישראל
- לחץ "Create new project"
- חכה דקה-שתיים עד שהפרויקט מוכן

### 1.3 תעתיק את הפרטים
- בצד שמאל לחץ ⚙️ "Project Settings"
- לחץ "API" 
- תראה:
  - **Project URL** — נראה כמו: `https://abcdefg.supabase.co`
  - **anon public** key — טקסט ארוך שמתחיל ב-`eyJ`
- 📋 העתק את שניהם לצד — תצטרך אותם בשלב 2

### 1.4 תריץ את הקוד שבונה את הטבלאות
- בצד שמאל לחץ על "SQL Editor" (אייקון של </> )
- לחץ "New Query"
- פתח את הקובץ `001-supabase-schema.sql` שהורדת
- תעתיק את הכל (Ctrl+A → Ctrl+C)
- תדביק בחלון ב-Supabase (Ctrl+V)
- לחץ "Run" (או Ctrl+Enter)
- צריך לראות: ✅ "Success" + "ONYX Database Schema created successfully!"

### 1.5 תריץ את הנתונים
- לחץ "New Query" (שוב)
- פתח את `002-seed-data-extended.sql`
- תעתיק הכל → תדביק → Run
- צריך לראות: ✅ Success

### 1.6 תבדוק שזה עבד
- בצד שמאל לחץ "Table Editor"
- צריך לראות רשימת טבלאות: suppliers, supplier_products, subcontractors...
- לחץ על "suppliers" — צריך לראות 15+ ספקים ברשימה
- אם אתה רואה את זה — ✅ שלב 1 הצליח!

---

## שלב 2: REPLIT — הפעלת המנוע (5 דקות)

### 2.1 פתח Replit
- לך ל: https://replit.com
- תתחבר (יש לך חשבון Pro)

### 2.2 צור פרויקט חדש
- לחץ "Create Repl"
- Template: **Node.js**
- שם: `onyx-procurement`
- לחץ "Create Repl"

### 2.3 העלה את הקבצים
- בצד שמאל ב-Replit תראה עץ קבצים
- **מחק** את `index.js` שנוצר אוטומטית
- לחץ על 3 הנקודות (⋮) ליד "Files" ובחר "Upload file"
- העלה:
  - `server.js`
  - `package.json`

### 2.4 צור קובץ .env
- לחץ "+" (New File)
- שם: `.env`
- תכתוב בתוכו (עם הפרטים שלך מ-1.3):

```
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_ANON_KEY=eyJ...YOUR_KEY_HERE
PORT=3000
```

(בינתיים בלי WhatsApp — נוסיף אחר כך)

### 2.5 התקן חבילות
- למטה ב-Replit יש חלון "Shell" (טרמינל)
- תכתוב: `npm install`
- תחכה שזה יסיים

### 2.6 הפעל!
- תכתוב בטרמינל: `npm start`
- צריך לראות:
```
🚀 ONYX PROCUREMENT API SERVER
Port: 3000
Supabase: ✅ Connected
```

### 2.7 תבדוק
- Replit יראה לך URL בחלק העליון
- נראה כמו: `https://onyx-procurement.YOUR_USER.repl.co`
- פתח אותו בדפדפן ותוסיף `/api/status`
- כלומר: `https://onyx-procurement.YOUR_USER.repl.co/api/status`
- צריך לראות:
```json
{
  "engine": "ONYX Procurement System",
  "status": "operational",
  "supabase": "connected"
}
```

🎉 אם אתה רואה את זה — **המערכת חיה!**

---

## שלב 3: בדיקה ראשונה — שלח RFQ (2 דקות)

### 3.1 תפתח את ה-Dashboard
- ה-Dashboard (onyx-dashboard.jsx) כבר רץ כאן ב-Claude
- או: פתח את ה-URL של Replit בדפדפן

### 3.2 נסה את ה-API
פתח טאב חדש בדפדפן וכתוב:

`https://YOUR-REPLIT-URL/api/suppliers`

צריך לראות את כל הספקים!

---

## מה עוד נשאר (אחרי ששלב 1-2 עובד):

- [ ] חיבור WhatsApp Business API (שהמערכת תשלח הודעות אמיתיות)
- [ ] Domain (כתובת www יפה — אופציונלי)
- [ ] המערכת תרוץ 24/7 (Replit Pro עושה את זה אוטומטית)

---

## אם משהו לא עובד:

| בעיה | פתרון |
|------|--------|
| "Error: Could not find relation" | תריץ שוב את 001-supabase-schema.sql |
| "Error: SUPABASE_URL not defined" | תבדוק ש-.env נכון ושאין רווחים |
| "Cannot find module 'express'" | תריץ `npm install` שוב |
| "Port already in use" | תשנה PORT ב-.env ל-3001 |
| הדף ריק | תוסיף /api/status לכתובת |

---

## סיכום — מה יש לך:

✅ מאגר 15 ספקים + 80 מוצרים עם מחירים
✅ 8 קבלני משנה עם מחירון % ומ"ר  
✅ שליחת RFQ לכל הספקים במכה אחת
✅ הזנת הצעות מחיר
✅ AI שבוחר את ההצעה הטובה ביותר
✅ הפקת הזמנת רכש
✅ החלטת קבלן: % vs מ"ר
✅ דוח חיסכון
✅ Dashboard מלא
