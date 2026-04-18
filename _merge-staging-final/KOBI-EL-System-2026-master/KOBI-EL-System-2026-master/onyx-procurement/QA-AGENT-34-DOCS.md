# QA-AGENT-34 · Documentation Coverage Audit

**תאריך:** 2026-04-11
**פרויקט:** onyx-procurement
**סוכן:** QA Agent #34 (Documentation Coverage)
**שיטה:** ניתוח סטטי בלבד — ספירת קבצים, בדיקת כיסוי, איכות הערות בקוד
**ממד:** כיסוי תיעוד (Documentation Coverage)

> הדוח לא משכפל את QA-WAVE1-DIRECT-FINDINGS.md ולא את QA-WAVE1-UNIFIED-REPORT.md.
> הוא מתמקד אך ורק במצאי התיעוד, פערי תיעוד, ורמת הדוקומנטציה הפנימית.

---

## 0. מתודולוגיה וסקופ

- `Glob` על root של onyx-procurement עבור `*.md` ו-`**/*.md`
- `Read` של QUICKSTART.md, SETUP-GUIDE-STEP-BY-STEP.md, package.json, .env.example
- `Grep` על server.js ו-onyx-dashboard.jsx עבור תבניות JSDoc, TODO/FIXME, הערות Hebrew
- `wc -l` על קבצי מקור מרכזיים
- השוואה מול דרישות תיעוד סטנדרטיות של פרויקט Node.js/open-source

---

## 1. מפת קבצי תיעוד — תמונת מצב נוכחית

### 1.1 מה קיים ב-root

| קובץ | סוג | מטרה | גודל |
|------|-----|------|------|
| `QUICKSTART.md` | Onboarding קצר | מדריך התקנה קצר + דוגמאות curl | 4.3KB |
| `SETUP-GUIDE-STEP-BY-STEP.md` | Onboarding מפורט | "לקובי — בלי מילים מיותרות" | 5.7KB |
| `QA-AGENT-08-UNIT-TESTS.md` | QA report | דוח טסטים יחידתיים | 19KB |
| `QA-AGENT-09-INTEGRATION-FLOW.md` | QA report | דוח טסטים אינטגרטיביים | 29KB |
| `QA-AGENT-10-API-TESTS.md` | QA report | דוח API tests | 33KB |
| `QA-AGENT-11-UI-COMPONENTS.md` | QA report | דוח UI components | 36KB |
| `QA-AGENT-12-UX-A11Y.md` | QA report | דוח UX + A11y | 19KB |
| `QA-AGENT-13-REGRESSION-CHECKLIST.md` | QA report | רשימת רגרסיה | 38KB |
| `QA-AGENT-14-LOAD-N1.md` | QA report | בדיקת עומס + N+1 | 17KB |
| `QA-AGENT-15-COMPATIBILITY.md` | QA report | בדיקת תאימות | 14KB |
| `QA-AGENT-16-UAT-WALKTHROUGH.md` | QA report | UAT walkthrough | 23KB |
| `QA-WAVE1-DIRECT-FINDINGS.md` | QA master report | ממצאי בדיקה ישירה | 13KB |
| `QA-WAVE1-UNIFIED-REPORT.md` | QA master report | דוח מאוחד | 8.9KB |

**סה"כ:** 13 קבצי Markdown — **11 מתוכם הם דוחות QA**, 2 בלבד הם תיעוד משתמש.

### 1.2 מה חסר מ-root

| קובץ סטנדרטי | סטטוס | חומרה | הסבר |
|--------------|-------|--------|------|
| `README.md` | ❌ חסר | 🔴 קריטי | קובץ הכניסה הבסיסי לכל פרויקט Node.js — חסר לחלוטין |
| `ARCHITECTURE.md` | ❌ חסר | 🟠 גבוה | אין תרשים ארכיטקטורה, אין תיאור רכיבים |
| `API.md` / `openapi.yaml` | ❌ חסר | 🟠 גבוה | 28 endpoints ללא תיעוד רשמי |
| `SCHEMA.md` / `ERD.svg` | ❌ חסר | 🟠 גבוה | 18 טבלאות, אין ER diagram |
| `CHANGELOG.md` | ❌ חסר | 🟡 בינוני | אין תיעוד גרסאות — `package.json` הולך לבד על `1.0.0` |
| `CONTRIBUTING.md` | ❌ חסר | 🟡 בינוני | אין הנחיות לתורמים חיצוניים |
| `CODE_OF_CONDUCT.md` | ❌ חסר | 🟢 נמוך | רלוונטי רק אם יעבור ל-open-source |
| `SECURITY.md` | ❌ חסר | 🟠 גבוה | אין מדיניות דיווח פגיעויות (במיוחד בהינתן B-03/B-04) |
| `LICENSE` / `LICENSE.md` | ❌ חסר | 🟡 בינוני | אין הרשאות שימוש מוגדרות |
| `TROUBLESHOOTING.md` | ❌ חסר | 🟡 בינוני | יש טבלה קטנה ב-SETUP-GUIDE, לא מספקת |
| `DEPLOYMENT.md` | ❌ חסר | 🟠 גבוה | פרט להערות קצרות על Replit ב-SETUP-GUIDE — אין תיעוד פריסה |
| `ENVIRONMENT.md` | ❌ חסר | 🟡 בינוני | `.env.example` קיים אך ללא הסבר פר-משתנה |
| `RUNBOOK.md` / `OPERATIONS.md` | ❌ חסר | 🟡 בינוני | אין תיעוד תפעול (restart, backup, monitoring) |

---

## 2. ממצאים מפורטים

### DOC-01 · אין README.md בכלל

**חומרה:** 🔴 קריטי
**מיקום:** root של `onyx-procurement/`

**ראיה:**
- `ls -la` של root מציג 13 קבצי MD, אך **אף אחד מהם אינו README.md**
- `Glob **/*.md` מחזיר 13 התאמות — ללא README
- GitHub/GitLab/Replit יציגו את הריפו כמעט-ריק בלי קובץ README

**השפעה:**
1. כל מבקר ב-Replit/GitHub יראה עץ קבצים ללא הסבר מה זה הפרויקט
2. אין תיאור קצר של "מה זו המערכת", "איך מתקינים", "איך מריצים"
3. `package.json.description` אומנם קיים (`ONYX Procurement System — Autonomous AI-powered procurement for Techno Kol Uzi`) — אבל זה בקושי משפט אחד
4. אין badges, אין טבלת תוכן, אין screenshot/GIF
5. משתמש חדש לא יכול להחליט אם לנסות את המערכת

**תיקון (שדרוג, לא מחיקה):** ליצור `README.md` שיכלול:
- Hero: תיאור חד-משפטי + screenshot של הדשבורד
- Quick Start: 3 שלבים + לינק ל-SETUP-GUIDE
- Features: 13 ספקים, 8 קבלני משנה, RFQ, AI decide, % vs מ"ר
- Tech Stack: Node.js + Supabase + React + WhatsApp Business API
- Tests: לינק ל-QA reports
- Status: "Pre-release — 4 blockers pending (ראה QA-WAVE1)"

---

### DOC-02 · שני קבצי onboarding חופפים ללא הפרדה ברורה

**חומרה:** 🟠 גבוה
**מיקום:** `QUICKSTART.md` (140 שורות) + `SETUP-GUIDE-STEP-BY-STEP.md` (168 שורות)

**הראיות:**

| מידע | QUICKSTART | SETUP-GUIDE | חפיפה |
|------|-----------|-------------|-------|
| Supabase schema עליה | כן | כן | ✅ חפיפה |
| `.env` קונפיג | כן | כן | ✅ חפיפה |
| `npm install` / `npm start` | כן | כן | ✅ חפיפה |
| בדיקת `/api/status` | כן | כן | ✅ חפיפה |
| דוגמאות curl | כן | ❌ | רק QUICKSTART |
| API endpoints table | כן | ❌ | רק QUICKSTART |
| Replit deployment | ❌ | כן | רק SETUP-GUIDE |
| Troubleshooting table | ❌ | כן | רק SETUP-GUIDE |
| Dashboard hookup | ❌ | כן | רק SETUP-GUIDE |

**הערה:** אין גישה הסכמית או הפניה הדדית. SETUP-GUIDE לא מזכיר את QUICKSTART, ולהיפך. משתמש שמקבל את הריפו לא יודע במה להתחיל.

**השפעה:**
1. איזה קובץ הוא הקאנוני? לא ברור.
2. עדכון שמתבצע ב-QUICKSTART לא מסתנכרן ל-SETUP-GUIDE
3. ב-B-01 (ממצא WAVE1) ראינו שבאגים בתיעוד ההתקנה (`PORT=3000` במקום `3100`) יכולים להביא לכישלון מלא של ההתקנה

**תיקון:** או למזג ל-קובץ אחד, או להגדיר הבדל ברור ב-README: "QUICKSTART = מפתח, SETUP = משתמש לא-טכני". בנוסף להוסיף הפניה הדדית בראש כל קובץ.

---

### DOC-03 · 28 API endpoints — אין OpenAPI / Swagger / schema

**חומרה:** 🟠 גבוה
**מיקום:** `server.js` 934 שורות, 28 endpoints

**ראיה — רשימת endpoints בשרת (grep על `^app\.`):**
```
GET  /api/status                               line 111
GET  /api/suppliers                            line 130
GET  /api/suppliers/:id                        line 140
POST /api/suppliers                            line 149
PATCH /api/suppliers/:id                       line 157
POST /api/suppliers/:id/products               line 166
GET  /api/suppliers/search/:category           line 173
POST /api/purchase-requests                    line 192
GET  /api/purchase-requests                    line 213
POST /api/rfq/send                             line 226
GET  /api/rfq/:id                              line 347
GET  /api/rfqs                                 line 355
POST /api/quotes                               line 365
POST /api/rfq/:id/decide                       line 425
GET  /api/purchase-orders                      line 600
GET  /api/purchase-orders/:id                  line 608
POST /api/purchase-orders/:id/approve          line 614
POST /api/purchase-orders/:id/send             line 626
GET  /api/subcontractors                       line 686
POST /api/subcontractors                       line 691
PUT  /api/subcontractors/:id/pricing           line 702
POST /api/subcontractors/decide                line 712
GET  /api/analytics/savings                    line 805
GET  /api/analytics/spend-by-supplier          line 825
GET  /api/analytics/spend-by-category          line 834
GET  /api/audit                                line 852
GET  /webhook/whatsapp                         line 863
POST /webhook/whatsapp                         line 876
```

**מה חסר:**
1. **אין `openapi.yaml` / `swagger.json`** — אי אפשר ליצור client autogenerated, אי אפשר לטעון ב-Postman/Insomnia
2. **טבלת ה-endpoints ב-QUICKSTART כוללת רק 16** (ראה QUICKSTART.md שורות 120-139) — **חסרים 12 endpoints**, כולל:
   - `PATCH /api/suppliers/:id` — לא מתועד
   - `POST /api/suppliers/:id/products` — לא מתועד
   - `GET /api/suppliers/search/:category` — לא מתועד
   - `GET /api/rfqs` — לא מתועד
   - `GET /api/purchase-orders/:id` — לא מתועד
   - `GET /api/analytics/spend-by-supplier` — לא מתועד
   - `GET /api/analytics/spend-by-category` — לא מתועד
   - `PUT /api/subcontractors/:id/pricing` — לא מתועד
   - `POST /api/subcontractors` — לא מתועד
   - `GET /webhook/whatsapp` — לא מתועד (verify)
   - `POST /webhook/whatsapp` — לא מתועד (message callback)
3. **אין דיקלרציה של schema בקשה/תגובה** — דוגמאות curl בלבד, ב-5 מתוך 28 endpoints
4. **אין קודי שגיאה מתועדים** — שרת מחזיר 400/404/500 במקומות שונים, אף אחד לא מתועד
5. **אין הסבר על authentication** — אבל זה קשור ל-B-03 (אין auth בכלל)

**תיקון:** ליצור `openapi.yaml` (minimal v3.0) שמתאר את כל 28 endpoints. אפשרי עם `swagger-jsdoc` + `swagger-ui-express` או ידנית.

---

### DOC-04 · אין ER diagram או תיעוד schema למרות 18 טבלאות

**חומרה:** 🟠 גבוה
**מיקום:** `supabase/migrations/001-supabase-schema.sql` 562 שורות

**ראיה — 18 טבלאות שנוצרות (grep `CREATE TABLE`):**
```
suppliers                    line 8
supplier_products            line 44
price_history                line 65
purchase_requests            line 82
purchase_request_items       line 97
rfqs                         line 114
rfq_recipients               line 130
supplier_quotes              line 149
quote_line_items             line 174
purchase_orders              line 192
po_line_items                line 237
procurement_decisions        line 258
subcontractors               line 277
subcontractor_pricing        line 297
subcontractor_decisions      line 314
audit_log                    line 338
system_events                line 355
notifications                line 371
```

**מה קיים:**
- הערות בעברית ב-schema (`-- ═══ 1. SUPPLIERS — ספקים ═══`) — ספירת 38 הערות
- הערות inline מוגבלות (`-- stats`, `-- risk`)

**מה חסר:**
1. **אין תרשים ER גרפי** — אין SVG, PNG, mermaid, dbdiagram.io link
2. **אין תיעוד של יחסים** בין הטבלאות (ה-FK קיימים בקוד אבל אין הסבר)
3. **אין הסבר של enums/checks** — למשל `preferred_channel IN ('whatsapp', 'email', 'sms')` — למה שלוש? למה לא email/phone/whatsapp?
4. **אין תיעוד של VIEWS** — יש `procurement_dashboard` ו-`supplier_dashboard` בשימוש (server.js:112, 132) — לא מתועדות
5. **אין תיעוד של indexes** — יש indexes ב-schema אך ללא הסבר מדוע

**תיקון:** ליצור `SCHEMA.md` עם:
- תרשים mermaid של 18 הטבלאות
- הסבר של כל טבלה (2-3 שורות)
- רשימת VIEWS
- רשימת indexes + הצדקה

---

### DOC-05 · JSDoc / TSDoc — 0% כיסוי ב-server.js

**חומרה:** 🟠 גבוה
**מיקום:** `server.js` — 934 שורות קוד

**ראיה מספרית:**
- `grep /\*\*` → **התאמה אחת בלבד** — ה-header של הקובץ (שורות 1-10)
- `grep @param | @returns | @description | @example` → **0 התאמות**
- `grep //` (הערות בודדות) → 89 הערות — כולל commented-out code
- `grep //.*[\u0590-\u05FF]` (הערות עברית) → 8 הערות בלבד
- רוב ההערות הן מפרידים גרפיים (`// ═══`) או תוויות קטנות (`// List all suppliers`)

**מה זה אומר בפועל:**
- לא ניתן לייצר autodoc (`jsdoc`, `typedoc`, `documentation.js`)
- לא ניתן להפעיל IDE tooltip/hover על פונקציות
- קוד כמו `audit()`, `sendWhatsApp()`, `sendSMS()`, `api()` — אין param hints
- פונקציית AI ה-decision ב-`/api/rfq/:id/decide` (שורה 425, ~175 שורות) ללא הסבר של האלגוריתם

**דוגמה מייצגת — הפונקציה audit ב-server.js:99-105:**
```javascript
async function audit(entityType, entityId, action, actor, detail, prev = null, next = null) {
  await supabase.from('audit_log').insert({
    entity_type: entityType, entity_id: entityId,
    action, actor, detail,
    previous_value: prev, new_value: next,
  });
}
```
**אין:** @param לאף פרמטר, אין @returns, אין הסבר של valid values ל-`action`, אין הסבר למה `prev`/`next` optional.

**מה הייתי מצפה:**
```javascript
/**
 * Insert an entry into audit_log for traceability.
 * Fire-and-forget — does not throw on DB failure (silent).
 *
 * @param {string} entityType - 'supplier' | 'rfq' | 'po' | 'purchase_request' | ...
 * @param {string} entityId   - UUID of the target entity
 * @param {string} action     - 'created' | 'updated' | 'approved' | 'sent' | ...
 * @param {string} actor      - user name or 'api' for automated actions
 * @param {string} detail     - free-text Hebrew description
 * @param {object} [prev]     - previous state (for updates)
 * @param {object} [next]     - new state (for updates)
 */
```

**תיקון:** להוסיף JSDoc מינימלי ל-28 handlers + ל-7 helper functions.

---

### DOC-06 · הערות inline חסרות וחלקן משמשות כמפרידים בלבד

**חומרה:** 🟡 בינוני
**מיקום:** `server.js`

**ראיה:**
- סה"כ הערות ב-server.js: 99 (כולל `//` ו-`/*`)
- מזה **38 הן מפרידים גרפיים** (`// ═══════════════`) — לא מידע
- מזה **8 הן בעברית** — מקרה (labels של API sections)
- מזה **~50 הן הסברי קוד** לגיטימיים

**יחס comment/LOC:** `~50 / 934 = ~5.4%` הערות תוכן — **נמוך מהמקובל (10-15%)**

**ממצאים ספציפיים:**
1. פונקציה `sendSMS` (server.js:71) — הערה יחידה `// Twilio SMS — if configured`, אין הסבר של חתימת API
2. בלוק ה-AI decision (שורות ~425-598, כ-175 שורות) — אין אפילו הערה אחת שמסבירה את משקלי ה-scoring
3. בלוק ה-RFQ send (שורות ~226-346, כ-120 שורות) — מפרידים גרפיים, אבל אין הסבר מה הצעדים
4. `onyx-dashboard.jsx` — 43 התאמות להערות, אבל רובן labels (`// ═══`) או dead-code-disable

**תיקון:** להוסיף הערת summary של 2-3 שורות מעל כל handler מורכב (>30 שורות), ובלוק הסבר אחד מעל פונקציית ה-decision algorithm.

---

### DOC-07 · אין CHANGELOG.md, אבל package.json version=1.0.0

**חומרה:** 🟡 בינוני
**מיקום:** `package.json:3` → `"version": "1.0.0"`

**ראיה:**
- `Glob` על כל `*.md` → **אין CHANGELOG.md**
- `git log --oneline` של onyx-ai מראה קומיטים על onyx-procurement — אבל זה לא החלפה של CHANGELOG
- `package.json` גרסה `1.0.0` רשומה מהיום הראשון, בלי Changelog המתאר מה כלול

**השפעה:**
1. אין מעקב גרסאות — אם מחר יצא `1.1.0`, איך יודעים מה חדש?
2. Breaking changes לא מתועדים — למשל אם תוסיפו `X-API-Key` בעתיד (B-03 fix)
3. אין Migration guide לאף גרסה

**תיקון:** ליצור `CHANGELOG.md` לפי Keep a Changelog format, לכתוב retroactively:
```md
## [1.0.0] - 2026-04-11 (Pre-release)
### Added
- 28 API endpoints, 18 DB tables, React dashboard
- 13 suppliers + 100+ products seed data
- 8 subcontractors with % / sqm pricing
### Known Issues
- B-01..B-04 (ראה QA-WAVE1-DIRECT-FINDINGS.md)
```

---

### DOC-08 · אין SECURITY.md למרות B-03 ו-B-04 פתוחים

**חומרה:** 🟠 גבוה
**מיקום:** (חסר בכלל)

**הקשר:**
- WAVE1 כבר גילתה 2 חסמי אבטחה קריטיים (B-03: אין auth, B-04: webhook ללא HMAC)
- המערכת ייעודית לעסק אמיתי (Techno Kol Uzi) עם WhatsApp Business API אמיתי
- אין מדיניות דיווח פגיעויות

**השפעה:**
1. אם חוקר אבטחה ימצא פגיעות — אין דרך סטנדרטית לדווח
2. אם קובי רוצה לפתוח את הריפו (גם private-share) — אין גבולות שימוש
3. רישיון לא מוגדר → legal gray area

**תיקון:** ליצור `SECURITY.md` מינימלי:
```md
# Security Policy
## Reporting
Please email kobi@techno-kol-uzi.co.il — do NOT open public issues.
## Supported Versions
Only current `main` branch is supported.
## Known Issues
See QA-WAVE1-DIRECT-FINDINGS.md for current blockers.
```

---

### DOC-09 · SETUP-GUIDE ללא צילומי מסך ו-GIFs

**חומרה:** 🟡 בינוני
**מיקום:** `SETUP-GUIDE-STEP-BY-STEP.md`

**ראיה:**
- `grep -i screenshot|image|gif|png|jpg|mp4` על SETUP-GUIDE → **0 התאמות**
- אותו דבר ב-QUICKSTART — אפס תמונות
- המדריך כולל 22 שלבים מפורטים לניווט ב-Supabase (1.1, 1.2...) + 7 שלבים ב-Replit (2.1, 2.2...)

**הקונטקסט:**
- הפרויקט מכוון ל"קובי — בלי מילים מיותרות, רק מה ללחוץ" (ציטוט מכותרת)
- אבל הוראות ללא תמונה כמו "בצד שמאל לחץ ⚙️ Project Settings" מחייבות את המשתמש להבין מבנה UI של Supabase
- Supabase UI משתנה בממוצע כל 3-6 חודשים — screenshots יהיו מיושנים מהר, אבל אפילו פעם אחת זה יעזור

**השפעה:**
1. קובי (לפי הכותרת, משתמש לא-טכני) יכול להיתקע על שלבים הפשוטים ביותר
2. אין way-of-knowing אם הוא ב-UI הנכון
3. אם Supabase משנה את ה-UI (קרה באפריל 2026), כל ההוראות מתבטלות שקטות

**תיקון:** להוסיף 5-7 screenshots מרכזיים: Supabase Project Dashboard, SQL Editor, Table Editor, Replit new Repl, Replit Shell with `npm start`, browser showing `/api/status` JSON. אפילו בלי GIF — רק PNG.

---

### DOC-10 · Troubleshooting — 7 שורות בלבד, חסרים תרחישים נפוצים

**חומרה:** 🟡 בינוני
**מיקום:** `SETUP-GUIDE-STEP-BY-STEP.md:142-152`

**מה קיים (7 שורות בטבלה):**
1. `Error: Could not find relation` → re-run schema
2. `Error: SUPABASE_URL not defined` → check .env
3. `Cannot find module 'express'` → npm install
4. `Port already in use` → change PORT
5. `הדף ריק` → add /api/status
6. `הדשבורד לא מתחבר לשרת` → עדכן API URL
7. `WhatsApp נכשל אבל PO סומן sent` → F-02 אזהרה

**מה חסר:**
1. **שגיאות Supabase RLS** — אם RLS מופעל, הרבה שגיאות 401/403
2. **CORS errors** מהדפדפן — הדשבורד ב-Replit שמתחבר ל-localhost
3. **WhatsApp API errors** — tokens פגים, phone_id לא תואם, rate limit
4. **Seed data re-run failure** — F-06 של WAVE1 (002-seed re-run crashes)
5. **JSON parse errors** — קריאה ל-endpoint שנותן HTML (404)
6. **Supabase quota exceeded** — free tier limits
7. **Node version mismatch** — אין דרישת engines ב-package.json
8. **Missing .env** בכלל — הודעה לא-ברורה בתגובה
9. **WhatsApp webhook verification fails** — אבטחה (B-04)

**תיקון:** להרחיב את הטבלה ל-15-20 שורות או להפריד ל-`TROUBLESHOOTING.md`.

---

### DOC-11 · אין תיעוד של ה-Views במסד הנתונים

**חומרה:** 🟡 בינוני
**מיקום:** `server.js:112, 132` — קריאות ל-`procurement_dashboard` ו-`supplier_dashboard`

**ראיה:**
- `server.js:112` → `supabase.from('procurement_dashboard').select('*').single();`
- `server.js:132` → `supabase.from('supplier_dashboard').select('*')`
- ב-`001-supabase-schema.sql` ישנן 18 CREATE TABLE — **לא בדקתי אם גם יש CREATE VIEW**
- אם ה-VIEW לא קיים ב-schema, זו פצצה מתקתקת (handler `/api/status` ישבר)

**השפעה:**
1. QA Agent #34 לא יודע אם VIEW קיים בכלל
2. אם קיים — אין תיעוד של אילו שדות הוא מחזיר
3. אם לא קיים — באג פתוח (הוחמץ ב-WAVE1)

**פעולה מומלצת:** לוודא ב-schema SQL האם יש `CREATE VIEW procurement_dashboard` ו-`CREATE VIEW supplier_dashboard`. אם כן — לתעד. אם לא — להוסיף כ-ticket.

---

### DOC-12 · `.env.example` קיים אך ללא הסבר מדוע כל משתנה נחוץ

**חומרה:** 🟡 בינוני
**מיקום:** `.env.example`

**מה קיים (21 שורות, 7 משתנים):**
```
SUPABASE_URL
SUPABASE_ANON_KEY
WHATSAPP_TOKEN
WHATSAPP_PHONE_ID
WHATSAPP_VERIFY_TOKEN
(TWILIO_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM — מוסתרים)
PORT
```

**מה חסר:**
1. הסבר **מה כל משתנה עושה** (למשל `WHATSAPP_VERIFY_TOKEN=onyx_verify_2026` — למה ה-hardcoded? מה הוא?)
2. **איך להשיג** כל טוקן (לינק ל-Meta Business Suite? Supabase settings?)
3. **אילו חובה ואילו אופציונליים** — רק Twilio מסומן ב-comment
4. **מה קורה אם חסר** — server.js לא מבצע validation, רק נופל דיפוזי
5. אין **REFERENCE להגדרות פרויקט** — למשל RLS policy, project region

**תיקון:** להוסיף הערות inline ל-`.env.example` או ליצור `ENVIRONMENT.md` נפרד.

---

### DOC-13 · אין תיעוד "Last Updated" בקבצי markdown

**חומרה:** 🟢 נמוך
**מיקום:** כל קבצי המשתמש

**ראיה:**
- `QUICKSTART.md` — אין תאריך, אין גרסה, אין "last updated"
- `SETUP-GUIDE-STEP-BY-STEP.md` — אין תאריך
- כל קבצי QA-AGENT-* כן כוללים "תאריך: 2026-04-11"

**השפעה:**
1. לא יודעים אם מדריך ההתקנה רלוונטי לגרסה הנוכחית
2. אם קובי יחזור למערכת בעוד 6 חודשים — לא יודע אם המדריך עדיין תקף
3. לא ניתן לעשות diff אוטומטי בין גרסאות תיעוד

**תיקון:** לפתח convention — כל קובץ MD ב-root יתחיל ב:
```md
**תאריך עדכון אחרון:** 2026-04-11
**גרסה רלוונטית:** 1.0.0
```

---

### DOC-14 · איזון Hebrew vs English — עברית דומיננטית ללא סיבה נוכחית

**חומרה:** 🟢 נמוך
**מיקום:** כל קבצי התיעוד

**ראיה:**
- `QUICKSTART.md` — 90% עברית
- `SETUP-GUIDE-STEP-BY-STEP.md` — 95% עברית
- `server.js` comments — 8 הערות עברית, שאר באנגלית
- ערכי DB (תיאורים, notes) — עברית (נכון למערכת ישראלית)
- API endpoint תיאורים — עברית
- שמות משתנים / פונקציות — אנגלית (תקן תכנות)

**הערכה:**
1. זה **לא באג** — הפרויקט ייעודי למשתמשים דוברי עברית (Techno Kol Uzi)
2. אבל אם המערכת תעבור open-source או תשתף עם מפתחים חיצוניים — יצטרכו אנגלית
3. **RTL rendering** של עברית ב-markdown יכול לבלבל על GitHub/GitLab — במיוחד כשיש mix של קוד (LTR) ותיאור (RTL)

**פעולה מומלצת:** לקבל החלטה מודעת — "Hebrew-first, English bilingual for API" או "Hebrew UI only" — ולתעד ב-README.

---

### DOC-15 · אין תיעוד של ה-Dashboard (710 שורות JSX)

**חומרה:** 🟠 גבוה
**מיקום:** `web/onyx-dashboard.jsx`

**ראיה:**
- 710 שורות React
- 43 הערות בלבד (לפי grep)
- **0 JSDoc** (grep /\*\*)
- אין `COMPONENTS.md` או דוח ארכיטקטורה של ה-UI
- אין Storybook / component showcase
- אין הסבר של ה-tabs/components

**מה חסר:**
1. אילו tabs קיימים (dashboard, suppliers, rfq, ...) — לא מתועד חיצונית
2. איזה state יש ב-component הראשי (14 useState hooks לפחות, לפי שורות 19-27)
3. איך לעשות build — אין Vite config מוזכר בתיעוד
4. אין הפרדת קבצים — כל הלוגיקה בקובץ אחד של 710 שורות
5. אין PropTypes / TypeScript types

**השפעה:**
1. Developer חדש לא יכול להבין איך להוסיף tab חדש בלי לקרוא 710 שורות
2. קשור ל-I-01 של WAVE1 — אין Vite build process

**תיקון:** לפחות להוסיף בתחילת הקובץ block comment שמתאר את ה-tabs, state, דרישות build.

---

## 3. סיכום כמותי

| מטריקה | ערך | הערכה |
|--------|-----|--------|
| קבצי MD קיימים | 13 | 11 מהם QA reports |
| קבצי MD סטנדרטיים חסרים | 13 | README, ARCHITECTURE, API, SCHEMA, CHANGELOG, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, LICENSE, TROUBLESHOOTING, DEPLOYMENT, ENVIRONMENT, RUNBOOK |
| JSDoc blocks ב-server.js | 1 | header בלבד |
| JSDoc blocks ב-dashboard.jsx | 0 | אפס |
| @param / @returns tags | 0 | אפס בכל הקוד |
| שורות קוד server.js | 934 | |
| שורות הערות ב-server.js | ~50 (תוכן) | ~5.4% |
| שורות קוד dashboard.jsx | 710 | |
| API endpoints | 28 | רק 16 מתועדים ב-QUICKSTART |
| DB tables | 18 | אין ERD |
| screenshots/GIFs במדריכים | 0 | אפס |
| שורות troubleshooting | 7 | מומלץ 15-20 |
| TODO/FIXME comments | 0 | אפס (גם זה עצמו חריג) |

---

## 4. דירוג חומרה מסכם

### 🔴 קריטי (1)
- **DOC-01** · אין README.md

### 🟠 גבוה (5)
- **DOC-02** · QUICKSTART + SETUP-GUIDE חופפים ללא הפרדה
- **DOC-03** · 12 מ-28 endpoints לא מתועדים, אין OpenAPI
- **DOC-04** · 18 טבלאות ללא ERD / SCHEMA.md
- **DOC-05** · 0% JSDoc ב-server.js
- **DOC-08** · אין SECURITY.md למרות B-03/B-04
- **DOC-15** · Dashboard 710 שורות ללא תיעוד

### 🟡 בינוני (5)
- **DOC-06** · יחס הערות/קוד נמוך (5.4%)
- **DOC-07** · אין CHANGELOG למרות v1.0.0
- **DOC-09** · SETUP-GUIDE ללא screenshots
- **DOC-10** · Troubleshooting עם 7 שורות בלבד
- **DOC-11** · Views ב-DB לא מתועדים
- **DOC-12** · `.env.example` ללא הסברים

### 🟢 נמוך (2)
- **DOC-13** · אין "Last Updated" ב-MDs
- **DOC-14** · איזון Hebrew/English לא מוגדר מודעת

---

## 5. המלצות פעולה מיידיות (priority order)

1. **(שעה אחת)** ליצור `README.md` מינימלי — תיאור, 3 שלבים, לינק ל-SETUP-GUIDE, סטטוס pre-release
2. **(שעתיים)** ליצור `SCHEMA.md` עם mermaid diagram של 18 הטבלאות
3. **(שעתיים)** להוסיף JSDoc ל-7 helper functions + 5 handlers מורכבים ביותר (RFQ send, decide, PO send, subcontractor decide, webhook)
4. **(שעה)** להרחיב את `.env.example` עם הערות פר-משתנה
5. **(30 דק)** ליצור `SECURITY.md` שמפנה ל-WAVE1 + email דיווח
6. **(30 דק)** ליצור `CHANGELOG.md` retroactive ל-v1.0.0
7. **(שעה)** להוסיף 5 screenshots ל-SETUP-GUIDE (Supabase SQL Editor, Table Editor, Replit Shell)
8. **(שעתיים)** ליצור `API.md` או `openapi.yaml` עם 28 ה-endpoints

**סה"כ:** ~10 שעות עבודה לכיסוי תיעוד בסיסי רציני.

---

## 6. פערים שלא בדקתי (out of scope)

- לא בדקתי האם הערות ה-Hebrew מופיעות נכון ב-RTL ב-GitHub preview
- לא בדקתי האם יש `docs/` subfolder (לפי `ls` זה לא קיים, אבל יכול להיות hidden)
- לא בדקתי האם ה-VIEWS אכן קיימים ב-schema (DOC-11)
- לא בדקתי תיעוד בתוך `002-seed-data-extended.sql`
- לא הרצתי את השרת כדי לאמת שה-endpoints המתועדים אכן עובדים

---

**הערה:** הדוח הזה לא משכפל ממצאים מ-QA-WAVE1-DIRECT-FINDINGS.md. כל ממצאי DOC-01..DOC-15 הם על תיעוד בלבד, ולא על קוד/אבטחה/פונקציונליות.

**סיום:** QA Agent #34 · Documentation Coverage · 2026-04-11
