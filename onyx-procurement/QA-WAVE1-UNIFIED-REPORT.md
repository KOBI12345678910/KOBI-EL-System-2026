# 📋 QA WAVE 1 — דוח אבחון מאוחד (Unified Diagnostic Report)

**תאריך:** 2026-04-11
**פרויקט:** onyx-procurement (13 ספקים, 100+ מוצרים, 8 קבלני משנה)
**סקופ:** Wave 1 — ניתוח סטטי, תקינות קוד, אבטחה ברמה ראשונית, עקביות DB/UI

---

## 📊 מקורות הדוח

| מקור | סטטוס | פרטים |
|------|-------|-------|
| Direct Code Inspection (ידני) | ✅ הושלם | 18 ממצאים ב-`QA-WAVE1-DIRECT-FINDINGS.md` |
| Agent 1 — Terminal Runtime Diagnostic | ⚠️ לא-מחובר | task ID התחדש בין sessions |
| Agent 2 — Menu Completeness + Smoke | 🔄 ברקע | output=0 bytes נכון לעכשיו |
| Agent 3 — System E2E Flow Audit | 🔄 ברקע | output=0 bytes נכון לעכשיו |
| Agent 4 — DB Integrity + Demo vs Real | 🔄 ברקע | output=0 bytes נכון לעכשיו |
| Agent 5 — Security Audit (Wave 1.5) | 🔄 ברקע | output=0 bytes נכון לעכשיו |
| Agent 6 — Role & Permission Audit | 🔄 ברקע | output=0 bytes נכון לעכשיו |
| Agent 7 — Performance Static Audit | 🔄 ברקע | output=0 bytes נכון לעכשיו |

**הערה:** 6 סוכנים רצים ברקע לפי system reminders, אך output שלהם ריק (0 bytes) בבדיקה האחרונה. ככל שהם יסתיימו, הממצאים שלהם יצטרפו לדוח זה כנספח.

---

## 🎯 סיכום מנהלים (Executive Summary)

- **נמצאו 4 חסמים קריטיים** שמונעים שחרור (🔴). 2 מהם אבטחתיים (אפס auth, webhook ללא signature), 2 תפעוליים (port mismatch, localhost hardcoded).
- **נמצאו 4 באגים פונקציונליים גבוהי חומרה** (🟠) שמשפיעים על שימוש יומיומי — הבולט ביניהם: PO מסומן `sent` גם כששליחה נכשלה.
- **נמצאו 5 ממצאים בינוניים** (🟡) שרובם נוגעים לעקביות dev→prod (re-run של 002, timing attack, dashboard ללא build).
- **2 תיקונים יושמו כבר בתוך הסשן הנוכחי** (✅): port 3100 בסטאפ גייד, troubleshooting rows על באגים מתועדים.

**Go/No-Go ראשוני:** ⛔ **NO-GO** לשחרור production עד תיקון B-01..B-04. הדשבורד + שרת עובדים במקומי בפיתוח — **אפשר להמשיך לפתח**, אבל אסור להרים למקום שחשוף לאינטרנט הפתוח.

---

## 🔴 חסמים קריטיים (Blockers) — חייב תיקון לפני Go-Live

### B-01 · PORT mismatch (Dashboard 3100 ↔ Setup Guide 3000) — תוקן ✅
**סטטוס:** תוקן בקומיט `ff6df91` — SETUP-GUIDE עודכן ל-`PORT=3100`.

### B-02 · Dashboard `localhost:3100` hardcoded
**מיקום:** `web/onyx-dashboard.jsx:3`
**השפעה:** הדשבורד לא יעבוד על Replit/VPS כי הוא מנסה להגיע למכונה הקצה.
**פעולה מוצעת:** שדרוג `const API` לקרוא מ-env var או מ-`window.location.origin`.

### B-03 · אפס Authentication על ה-API
**מיקום:** `server.js` — אין middleware auth.
**השפעה:** כל מי שמכיר URL יכול לשלוח RFQ, לאשר PO, לקרוא audit log.
**פעולה מוצעת:** Middleware API key (`X-API-Key` מול `process.env.ONYX_API_KEY`).

### B-04 · WhatsApp Webhook ללא HMAC verification
**מיקום:** `server.js:876-901`
**השפעה:** זריקת הודעות מזויפות ל-`system_events` ולאודיט.
**פעולה מוצעת:** verify `X-Hub-Signature-256` עם App Secret.

---

## 🟠 באגים פונקציונליים (Functional Bugs)

### F-01 · ב-`SubDecideTab` — חוסר validation של `> 0`
**מיקום:** `web/onyx-dashboard.jsx:530` — "סכום ושטח חובה" אבל לא מוודא > 0.
**תיקון:** להוסיף `parseFloat(...) > 0` ב-validation.

### F-02 · PO `status='sent'` גם כשנכשל
**מיקום:** `server.js:661-671`
**תיקון:** להתנות `.update({status:'sent'})` על `sendResult.success`.

### F-03 · `.single()` ללא error guard
**מיקומים:** `server.js:279-285, 524-539, 569-570`
**תיקון:** לעטוף כל קריאה ב-`if (error || !data) return res.status(500)`.

### F-06 · 002-seed re-run ייכשל אחרי שימוש אמיתי
**מיקום:** `002-seed-data-extended.sql:8-10`
**תיקון:** להוסיף `DELETE FROM price_history; DELETE FROM subcontractor_decisions;` לפני הקיימים.

---

## 🟡 ממצאים בינוניים

| ID | תיאור | מיקום | פעולה |
|----|------|-------|-------|
| B-05 | timing attack ב-verify_token | `server.js:869` | `crypto.timingSafeEqual` |
| F-04 | הצעה יחידה → priceScore=0 | `server.js:460` | fallback = 100 |
| D-01 | 001-schema יש seed ישן של 5 ספקים | `001:498-556` | פיצול קובץ |
| I-01 | Dashboard ללא Vite/build process | `web/onyx-dashboard.jsx` | הוספת Vite config |
| I-04 | `rfq_code` לא שמור ב-DB | `server.js:256` | הוספת `code TEXT UNIQUE` |

---

## 🟢 ממצאים נמוכים

| ID | תיאור | מיקום |
|----|------|-------|
| F-05 | status color codes — חסר shipped/inspected/disputed | `dashboard:452` |
| I-02 | `cors()` פתוח לגמרי | `server.js:19` |
| I-03 | `delivery_address` hardcoded | `001-schema:204` |

---

## ✅ כבר תוקן בסשן הנוכחי

1. **D-02** · Setup guide 15→13 ספקים (קומיט `0986c81`)
2. **D-03** · Dashboard workTypes — הוספת "צביעה" (קומיט `1a55d03`)
3. **B-01** · SETUP-GUIDE `PORT=3000` → `PORT=3100` (קומיט `ff6df91`)
4. **Troubleshooting rows** · הוספת שורות לתקלות B-02 ו-F-02 במדריך (קומיט `ff6df91`)
5. **Wave 1 findings** · קובץ `QA-WAVE1-DIRECT-FINDINGS.md` (קומיט `ff6df91`)

---

## 📐 תסריטי בדיקה ב-Wave 2 (חייב לכלול)

1. **RFQ Smoke Test** · צור PR → שלח RFQ → קבל 2 הצעות → החלט → וודא PO נוצר
2. **Subcontractor Decision** · work_type=צביעה + project_value=50000 + area_sqm=100 → בחירה שהיא אכן ברוך צביעה
3. **Multi-quote tie** · הזן 2 הצעות זהות לחלוטין — מי מנצח?
4. **Single quote** · הזן רק הצעה אחת — וודא ש-priceScore לא 0 (F-04)
5. **Invalid inputs** · area_sqm=0, project_value=-1, quantity="abc"
6. **WhatsApp failure path** · אל תגדיר WA_TOKEN → שלח PO → וודא ש-status נשאר `approved` (F-02)
7. **Re-run 002 after usage** · אחרי הפעלת המערכת, הרץ שוב את seed — וודא שלא קורס (F-06)
8. **Concurrent RFQ** · שלח 2 RFQ בו-זמנית מאותו PR — וודא שאין duplicate decisions
9. **XSS payload ב-product name** · `<script>alert(1)</script>` — וודא escape
10. **SQL injection attempt** · `'; DROP TABLE suppliers; --` ב-category — Supabase מסנן אבל וודא

---

## 🔐 תסריטי אבטחה ב-Wave 1.5 (חייב לכלול)

1. **API access ללא אימות** · curl ל-`/api/suppliers` ללא header → חייב 401 (אחרי B-03)
2. **Webhook זר** · POST ל-`/webhook/whatsapp` עם body מזויף → חייב 401 (אחרי B-04)
3. **Rate limit** · 1000 בקשות ב-10 שניות → 429
4. **CORS** · בקשה מ-origin זר → reject
5. **Secret scan** · git log + all files → ✅ נקי (מאומת)

---

## 🎯 המלצות Go-Forward

### מיידי (לפני Wave 2):
1. **תקן B-02** — Dashboard API URL חייב להיות דינמי.
2. **תקן B-03** — הוסף API key middleware (30 שורות).
3. **תקן B-04** — הוסף HMAC verification ל-webhook.
4. **תקן F-02** — פשוט `if (sendResult.success)` לפני update status.
5. **תקן F-03** — עטוף את כל `.single()` קריאות.

### בצע Wave 2 רק אחרי שיש:
- ✅ Auth middleware פעיל
- ✅ Dashboard מתחבר לשרת ב-localhost
- ✅ PO status accurate

### דילוג לWave 3:
- רק אחרי Wave 2 ירוק.

---

## 📎 נספח — ממצאי סוכני רקע (יתווסף כשייסתיימו)

*סוכני הרקע טרם סיימו. output קבצים ב-0 bytes נכון להפעלה האחרונה. כאשר יסיימו, הממצאים שלהם ייתוספו כאן.*

### Agent 2 — Menu Completeness + Smoke
_בהמתנה_

### Agent 3 — System E2E Flow Audit
_בהמתנה_

### Agent 4 — DB Integrity + Demo-vs-Real
_בהמתנה_

### Agent 5 — Security Audit
_בהמתנה_

### Agent 6 — Role & Permission Audit
_בהמתנה_

### Agent 7 — Performance Static Audit
_בהמתנה_

---

**סיום Wave 1 diagnostic:** 18 ממצאים (4 קריטיים, 4 גבוהים, 5 בינוניים, 3 נמוכים, 2 תוקנו ב-session הנוכחי).
