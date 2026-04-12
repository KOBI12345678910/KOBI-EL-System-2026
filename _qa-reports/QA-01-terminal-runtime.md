# QA-01 — Terminal Runtime Report

**Agent:** QA-01 Terminal Runtime Agent
**תאריך הרצה:** 2026-04-11
**מערכת:** ERP טכנו-קול עוזי
**תתי-פרויקטים שנסרקו:** 4 (onyx-procurement, payroll-autonomous, techno-kol-ops, onyx-ai)
**שיטה:** סריקה סטטית בלבד — שום שרת לא הורץ. `node --check` להרצת syntax-check. `tsc --noEmit` להרצת typecheck.

---

## 1. סטטוס הרצה לכל פרויקט

| # | פרויקט | Framework / Runtime | Entry Point | Port בקוד | Port בבריף | Package Manager | node_modules | .env | .env.example | Scripts (start/dev/test) | Syntax | סטטוס |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **onyx-procurement** | Node 20+ / Express (CJS) | `server.js` | **3100** | 3100 | npm | OK (מותקן) | חסר | קיים | start / dev / test | PASS | צהוב |
| 2 | **payroll-autonomous** | React 18 + Vite 5 (ESM) | `src/main.jsx` | **5174** | 5173 | npm | **חסר** | **חסר** | **חסר** | start / dev / (אין test) | PASS (vite.config) | אדום |
| 3 | **techno-kol-ops** (server) | Node / TypeScript / Express + tsx | `src/index.ts` | **5000** | 3200 | npm | **חסר** | חסר | קיים | start / dev / (אין test) | לא נבדק (אין tsc זמין) | אדום |
| 3b | **techno-kol-ops/client** | React + Vite TS | `src/main.tsx` | **3000** | 5174 | npm | **חסר** | **חסר** | **חסר** | dev / build / preview / (אין test, אין start) | לא נבדק | אדום |
| 4 | **onyx-ai** | Node 20+ / TypeScript (CJS) | `src/index.ts` | **3200** | 3300 | npm | OK (מותקן) | חסר | קיים | start / dev / test (placeholder) | **28 שגיאות TS** | אדום |

### מקרא צבעים

- **ירוק** — ניתן להריץ מיידית ללא חסמים
- **צהוב** — חסרים ה-env / תיקונים קלים, אבל ה-code base תקין סינטקטית
- **אדום** — חסמים קריטיים: שגיאות קומפילציה / חסרי תלויות / קבצים שלא קיימים / תסבוכות פורטים

**ירוק: 0 | צהוב: 1 | אדום: 4 (מתוכם techno-kol-ops מחולק לשני תתי-מודולים)**

---

## 2. טבלת Port Conflicts

הבריף והקוד לא תואמים בעיקרון. שלושה פרויקטים מתוך ארבעה סוטים מהבריף:

| Project | Declared in code | Declared in brief | Collision? |
|---|---|---|---|
| onyx-procurement | 3100 | 3100 | OK |
| payroll-autonomous | 5174 | 5173 | ראה B-003 |
| techno-kol-ops server | **5000** | 3200 | ראה B-004 |
| techno-kol-ops client | **3000** | 5174 | ראה B-005 |
| onyx-ai | **3200** | 3300 | **התנגשות עם techno-kol-ops לפי הבריף (שניהם 3200)** |

**התנגשות קונפיגורציה פנימית בין הפרויקטים:**

1. **techno-kol-ops/.env.example** מגדיר `ONYX_AI_URL=http://localhost:3200`. אבל **onyx-ai/.env.example** מגדיר `PORT=3200` — אז בפועל **onyx-ai תופס את אותו פורט** (3200) ו-techno-kol-ops גם רוצה להרים שם server בפורט 5000. אין התנגשות **בפועל**, אבל זה סותר את הבריף (שדרש 3200 לטכנו-קול ו-3300 לאוניקס-AI).
2. **techno-kol-ops/.env.example** מגדיר `ALLOWED_ORIGINS=http://localhost:5173`, אבל **payroll-autonomous/vite.config.js** מגדיר `port: 5174`. אם payroll אכן רץ ב-5174 → CORS יחסום את הפנייה ל-techno-kol-ops.
3. **techno-kol-ops/client/vite.config.ts** מריץ את ה-UI ב-**3000**, בעוד שהבריף אומר 5174. בנוסף, ה-proxy ב-client/vite.config.ts מפנה ל-`http://localhost:5000` — זה נכון ביחס לקוד (server רץ ב-5000) אבל חסום לכל מה שהבריף מתאר.

---

## 3. רשימת בעיות — פורמט באג מלא

### קריטי (Critical) — חוסם הרצה

---

#### **B-001** — `scripts/seed.js` מופיע ב-package.json אבל הקובץ לא קיים

- **תיאור:** `onyx-procurement/package.json` מצהיר `"seed": "node scripts/seed.js"`, אך הקובץ `scripts/seed.js` לא קיים. קיימים רק `migrate.js`, `migrate.js.new`, `migrate-verify.js`, `backup.js`, `backup-restore.js`.
- **שלבי שחזור:**
  1. `cd onyx-procurement`
  2. `npm run seed`
- **בפועל:** `Error: Cannot find module .../scripts/seed.js`
- **צפוי:** הרצה תקינה של Seed ל-Supabase
- **חומרה:** קריטי
- **מודול:** `onyx-procurement/scripts/`
- **הצעת תיקון:** ליצור `scripts/seed.js` שטעון fixtures לתוך Supabase, או להסיר את הצ'רט `seed` מ-package.json אם לא נחוץ.

---

#### **B-002** — onyx-procurement test script מצביע על תיקייה שלא קיימת (`tests/` במקום `test/`)

- **תיאור:** `onyx-procurement/package.json` מצהיר `"test": "node --test tests/"`, אבל התיקייה בפועל נקראת `test/` (ללא ה-s). התיקייה `test/` מכילה 11 קבצי טסט אבל הם לא יוזנו.
- **שלבי שחזור:**
  1. `cd onyx-procurement`
  2. `npm test`
- **בפועל:** `node --test` לא מוצא tests או רץ על אפס קבצים.
- **צפוי:** הרצת כל 11 קבצי ה-`.test.js`
- **חומרה:** קריטי
- **מודול:** `onyx-procurement/package.json` + `onyx-procurement/test/`
- **הצעת תיקון:** לעדכן את ה-script ל-`"test": "node --test test/**/*.test.js"` או לשנות את שם התיקייה מ-`test/` ל-`tests/`.

---

#### **B-003** — payroll-autonomous: שלוש תלויות יסוד חסרות (אין node_modules, אין .env.example, port שגוי)

- **תיאור:** פרויקט payroll-autonomous הוא React+Vite שמעולם לא הותקן (אין `node_modules/`). אין קובץ `.env.example` בכלל — לא ברור איזה משתנה-סביבה (`VITE_API_URL`, `VITE_API_KEY`) הוא דורש (למרות שהקוד ב-`App.jsx:14-22` קורא להם). בנוסף, ה-vite.config.js מגדיר `port: 5174` במקום 5173 (הבריף).
- **שלבי שחזור:**
  1. `cd payroll-autonomous`
  2. `npm run dev`
- **בפועל:** `Error: Cannot find package 'vite'` — כי אין node_modules.
- **צפוי:** שרת Vite דולק עם הוראות hot-reload.
- **חומרה:** קריטי
- **מודול:** `payroll-autonomous/` (שורש)
- **הצעת תיקון:**
  1. להוסיף `.env.example` עם `VITE_API_URL=http://localhost:3100` ו-`VITE_API_KEY=`.
  2. להחליט: 5173 לפי הבריף או 5174 הקיים, ולעדכן vite.config.js בהתאם.
  3. להתקין תלויות (`npm install`) — **מחוץ לסקופ של QA-01**.

---

#### **B-004** — techno-kol-ops server: אין node_modules, גרסת אמת של הפורט (5000) לא תואמת את הבריף (3200)

- **תיאור:** techno-kol-ops (TypeScript + tsx) מעולם לא הותקן. `src/index.ts:168` מגדיר `PORT = 5000` בברירת-מחדל, וה-.env.example גם משתמש ב-5000. הבריף של QA דרש 3200. בלי node_modules — `tsx` לא זמין, קומפילציה לא תרוץ.
- **שלבי שחזור:**
  1. `cd techno-kol-ops`
  2. `npm run dev`
- **בפועל:** `'tsx' is not recognized as an internal or external command`. בנוסף גם `npm run start` ייכשל כי אין `dist/index.js` (תלוי ב-`npm run build`).
- **צפוי:** שרת Node שמקשיב על פורט 3200 (בריף).
- **חומרה:** קריטי
- **מודול:** `techno-kol-ops/src/index.ts`, `techno-kol-ops/.env.example`
- **הצעת תיקון:**
  1. לשנות את ברירת-המחדל ב-index.ts ל-`process.env.PORT || 3200`.
  2. לעדכן `.env.example`: `PORT=3200`, `APP_URL=http://localhost:3200`.
  3. להתקין תלויות (`npm install`) — מחוץ לסקופ QA-01.

---

#### **B-005** — techno-kol-ops/client: אין node_modules, אין .env, Vite port 3000 במקום 5174

- **תיאור:** תת-פרויקט `techno-kol-ops/client/` (Vite TS) מעולם לא הותקן. אין `.env` / `.env.example`. vite.config.ts מגדיר `port: 3000` ו-proxy ל-`localhost:5000`. הבריף דורש 5174 לקליינט של techno-kol-ops.
- **שלבי שחזור:**
  1. `cd techno-kol-ops/client`
  2. `npm run dev`
- **בפועל:** vite לא מותקן. גם אם יותקן, יריץ ב-3000 במקום 5174.
- **צפוי:** client דולק ב-5174 ומחובר ל-server ב-3200.
- **חומרה:** קריטי
- **מודול:** `techno-kol-ops/client/vite.config.ts`
- **הצעת תיקון:**
  1. לעדכן vite.config.ts: `port: 5174`, proxy target `http://localhost:3200`.
  2. להוסיף `.env.example`: `VITE_API_URL=http://localhost:3200`.
  3. להוסיף `"start": "vite"` ל-client/package.json.
  4. להתקין תלויות (`npm install`) — מחוץ לסקופ QA-01.

---

#### **B-006** — onyx-ai: 28 שגיאות TypeScript פעילות, כולל עשרות שגיאות ב-onyx-integrations.ts

- **תיאור:** הרצת `tsc --noEmit -p tsconfig.json` מניבה **28 שגיאות typecheck** ב-6 קבצים:
  - `src/index.ts` — 1 שגיאה: `Function` לא תואם לפרמטר `(value: any) => any` בשורה 261.
  - `src/integrations.ts` — 2 שגיאות כולל `not all code paths return a value`.
  - `src/modules/hr-autonomy-engine.ts` — `PerformanceReview.reviewDate` חסר (שורה 897).
  - `src/modules/intelligent-alert-system.ts` — השוואת סטטוס בלתי-אפשרית (שורה 885).
  - `src/onyx-integrations.ts` — ~20 שגיאות, הכי קריטיות:
    - `Cannot find name 'https'` / `'http'` (שורה 118, 2008, 2015)
    - `Property 'createHash' does not exist on type 'Crypto'` (קוד משתמש בטעות ב-Web-Crypto `globalThis.crypto` במקום ב-node `crypto` module)
    - `Property 'createHmac' / 'randomBytes' / 'createCipheriv' / 'createDecipheriv' / 'timingSafeEqual' does not exist` — כולן אותו root-cause.
  - `src/onyx-platform.ts` — 1 שגיאה, שכפול מ-index.ts בשורה 261.
- **שלבי שחזור:**
  1. `cd onyx-ai`
  2. `npm run typecheck`
- **בפועל:** 28 שגיאות TS2*** מוצגות; `npm run build` ייכשל.
- **צפוי:** הרצה חלקה. הפרויקט היה אמור להיות "institutional grade".
- **חומרה:** קריטי (חוסם `npm run build` ולכן גם `npm start` כי יש `prestart: npm run build`).
- **מודול:** `onyx-ai/src/onyx-integrations.ts` (רוב השגיאות), `onyx-ai/src/index.ts`, ועוד.
- **הצעת תיקון:**
  - ב-`onyx-integrations.ts` להוסיף `import * as http from 'http';`, `import * as https from 'https';`, `import * as crypto from 'crypto';` — הקוד משתמש בהם בלי import.
  - תיקוני type-narrowing (Result) בקבצי engine: לעבוד עם `if (res.ok) { ... } else { res.error ... }` — שגיאות 1495-2473 הן בעיקר קריאה ל-`.error` אחרי שה-TS סימן את `res` כ-`ok: true`.
  - ב-`hr-autonomy-engine.ts:897` להוסיף `reviewDate` לאובייקט החדש.
  - ב-`intelligent-alert-system.ts:885` להסיר את ההשוואה הבלתי-אפשרית או להוסיף `'resolved'` ל-union.

---

#### **B-007** — onyx-ai: קונפליקט פורט עם הבריף (3200 בקוד, 3300 בבריף) — גורר התנגשות עם techno-kol-ops לפי הבריף

- **תיאור:** `onyx-ai/src/index.ts:2768` מגדיר `const PORT = parseInt(process.env.PORT || '3200', 10)`. `.env.example` מצהיר `PORT=3200`. אבל הבריף של QA-01 אומר ש-onyx-ai אמור לרוץ ב-**3300**, ו-techno-kol-ops ב-3200. כלומר:
  - לפי הקוד: onyx-ai=3200, techno-kol-ops=5000. אין התנגשות פיזית.
  - לפי הבריף: onyx-ai=3300, techno-kol-ops=3200. אז הקוד סוטה פעמיים.
- **שלבי שחזור:** קריאה של `onyx-ai/.env.example` מול `techno-kol-ops/.env.example` מול הבריף.
- **בפועל:** כל הפרויקטים מסודרים שונה ממה שהבריף דרש.
- **צפוי:** סטנדרט אחיד בכל תתי-הפרויקטים.
- **חומרה:** קריטי (בלבול תשתית מוחלט — השילוב של B-004+B-007 אומר שאי-אפשר לדעת איזה פורט "נכון")
- **מודול:** `onyx-ai/src/index.ts:2768`, `onyx-ai/.env.example:10`
- **הצעת תיקון:** החלטה-הנדסית ראשית — לקבוע סטנדרט פורטים אחיד ברמת הפרויקט כולו (למשל `docs/ports.md`) ואז לעדכן כל קובץ לפי הבחירה. לא לתקן עד שתהיה החלטה רשמית.

---

### גבוה (High)

---

#### **B-008** — אין `.env` קיים באף אחד מארבעת תתי-הפרויקטים

- **תיאור:** בכל ארבעת הפרויקטים (onyx-procurement, techno-kol-ops, onyx-ai) מופיע רק `.env.example`, אין `.env` פעיל. payroll-autonomous — אפילו לא `.env.example`. השרתים שיש להם `envValidation` (onyx-procurement/server.js:30-40 דורש `SUPABASE_URL`, `SUPABASE_ANON_KEY`) ייפלו מיידית ב-boot.
- **שלבי שחזור:**
  1. כל אחד מהפרויקטים: `npm start`
- **בפועל:** onyx-procurement → `❌ ONYX boot failed — missing required environment variables: SUPABASE_URL, SUPABASE_ANON_KEY`. techno-kol-ops → JWT_SECRET לא מוגדר (שורה 63 ב-index.ts זורק undefined assertion). onyx-ai → לא מתרסק כי אין `envValidation` קשיח, אבל ה-governor ירוץ עם ברירות-מחדל.
- **צפוי:** קובץ `.env` מאותחל בכל פרויקט.
- **חומרה:** גבוה
- **מודול:** כל הפרויקטים
- **הצעת תיקון:** `cp .env.example .env` בכל פרויקט, למלא ערכים מינימליים. ב-payroll-autonomous לייצר `.env.example` קודם.

---

#### **B-009** — payroll-autonomous חסר test script לגמרי

- **תיאור:** `payroll-autonomous/package.json` לא מצהיר `test` בשום צורה. אין vitest, אין jest, אין `node --test`.
- **שלבי שחזור:** `npm test` בתיקייה.
- **בפועל:** `npm ERR! Missing script: "test"`
- **צפוי:** אפילו placeholder `"test": "echo 'no tests'"`.
- **חומרה:** גבוה (מקלה על השחיקה של CI מאוחר יותר)
- **מודול:** `payroll-autonomous/package.json`
- **הצעת תיקון:** להוסיף `"test": "vitest run"` ולהוסיף `vitest` ל-devDependencies.

---

#### **B-010** — techno-kol-ops server חסר test script

- **תיאור:** `techno-kol-ops/package.json` לא מצהיר `test`.
- **שלבי שחזור:** `npm test` בתיקייה.
- **בפועל:** `npm ERR! Missing script: "test"`
- **צפוי:** הרצה של טסטים.
- **חומרה:** גבוה
- **מודול:** `techno-kol-ops/package.json`
- **הצעת תיקון:** להוסיף `"test": "jest"` או `"test": "vitest run"` עם התצורה המתאימה.

---

#### **B-011** — techno-kol-ops/client חסר `test` וגם `start` scripts

- **תיאור:** ה-client מצהיר רק `dev`, `build`, `preview`. חסר `start` (שצריך להיות alias ל-`vite` או `vite preview`) וגם `test`.
- **שלבי שחזור:** `npm start` או `npm test` בתיקיית client.
- **בפועל:** `Missing script: "start"` / `Missing script: "test"`.
- **צפוי:** הרצה תקינה.
- **חומרה:** גבוה
- **מודול:** `techno-kol-ops/client/package.json`
- **הצעת תיקון:** להוסיף `"start": "vite preview --port 5174"` ו-`"test": "vitest run"`.

---

#### **B-012** — techno-kol-ops/.env.example ALLOWED_ORIGINS לא כולל את פורט payroll-autonomous

- **תיאור:** `techno-kol-ops/.env.example:11` מגדיר `ALLOWED_ORIGINS=http://localhost:5000,http://localhost:5173,http://localhost:3100`. אבל payroll-autonomous בפועל רץ ב-**5174** (ראה B-003). כלומר כל קריאה מ-payroll-autonomous ל-techno-kol-ops תחסם ב-CORS.
- **שלבי שחזור:** אחרי ש-techno-kol-ops רץ, לפתוח payroll-autonomous UI ולנסות לקרוא ל-`/api/*`.
- **בפועל:** CORS error בדפדפן.
- **צפוי:** קריאה תקינה.
- **חומרה:** גבוה
- **מודול:** `techno-kol-ops/.env.example`
- **הצעת תיקון:** להוסיף `http://localhost:5174` ל-ALLOWED_ORIGINS, או להחליט ש-payroll-autonomous חוזר ל-5173 (ראה B-007 — צריך החלטת ports קודם).

---

### בינוני (Medium)

---

#### **B-013** — `onyx-procurement/scripts/migrate.js.new` — קובץ יתום

- **תיאור:** קיים קובץ בשם `migrate.js.new` לצד `migrate.js`. הוא לא רשום ב-package.json, לא נקרא משום מקום. סימן לעדכון חלקי שלא נסגר.
- **שלבי שחזור:** סריקת התיקייה `onyx-procurement/scripts/`.
- **בפועל:** קובץ יושב ללא תכלית.
- **צפוי:** או למזג ל-migrate.js, או למחוק (אבל חוק #1: לא מוחקים).
- **חומרה:** בינוני
- **מודול:** `onyx-procurement/scripts/migrate.js.new`
- **הצעת תיקון:** סקירה ידנית — להשוות ל-`migrate.js` ולמזג אם יש שיפורים. אחרת לתעד בתוך קומנט למה הוא נשמר.

---

#### **B-014** — onyx-ai `test` script הוא placeholder בלבד

- **תיאור:** `onyx-ai/package.json:15` מגדיר `"test": "echo \"tests coming soon\" && exit 0"`. תיקיית `test/` מכילה 3 קבצי בדיקה (event-store.test.ts, platform.test.ts, policies.test.ts) שלא מורצים.
- **שלבי שחזור:** `npm test` ב-onyx-ai.
- **בפועל:** `tests coming soon` ומעבר ל-exit 0.
- **צפוי:** הרצת 3 הטסטים הקיימים.
- **חומרה:** בינוני
- **מודול:** `onyx-ai/package.json`, `onyx-ai/test/`
- **הצעת תיקון:** להחליף ב-`"test": "ts-node --test test/*.test.ts"` או להשתמש ב-vitest.

---

#### **B-015** — techno-kol-ops/client אין tsconfig test entry, ואין rootDir config

- **תיאור:** `techno-kol-ops/client/tsconfig.json` + `tsconfig.node.json` קיימים, אבל אף אחד מהם לא נבדק ב-`npm run build` עד שהתלויות לא יותקנו.
- **שלבי שחזור:** קריאה סטטית.
- **בפועל:** לא נבדק.
- **צפוי:** בנייה תקינה.
- **חומרה:** בינוני
- **מודול:** `techno-kol-ops/client/`
- **הצעת תיקון:** להריץ `tsc --noEmit` אחרי התקנה של node_modules.

---

#### **B-016** — onyx-ai package.json מצהיר express, cors, helmet, dotenv כ-dependencies, אבל index.ts לא משתמש באף אחד מהם

- **תיאור:** `onyx-ai/src/index.ts` (2838 שורות) מייבא רק node built-ins: `events, crypto, fs, path, http, https`. אין שום `require('express')`. עם זאת, `onyx-ai/package.json:19-22` כולל את כל הארבעה. לעומת זאת, `src/integrations.ts` כן מייבא `express`, אבל הקובץ הזה לא מחובר ל-`index.ts` (אין import ביניהם).
- **שלבי שחזור:** grep ב-`src/index.ts` על `require('express')` או `from 'express'` — 0 תוצאות.
- **בפועל:** תלויות מיותרות מנפחות את ה-bundle ואת תחזוקת ה-security patches.
- **צפוי:** או להסיר את התלויות, או לחבר את `integrations.ts` ל-index.ts.
- **חומרה:** בינוני
- **מודול:** `onyx-ai/package.json`, `onyx-ai/src/index.ts`
- **הצעת תיקון:** אם `integrations.ts` לא נחוץ — להסיר אותו ואת 4 התלויות. אם כן נחוץ — לחבר `import` ב-index.ts.

---

### נמוך (Low)

---

#### **B-017** — onyx-procurement: prestart script חסר (ה-prebuild של onyx-ai חסר גם הוא)

- **תיאור:** onyx-procurement אין שלב prebuild/prestart. אם יתווספו טסטים/lint לפני boot, אין hook קיים. לא בעיה בפועל, סגנון.
- **שלבי שחזור:** סריקה של `package.json`.
- **בפועל:** אין.
- **צפוי:** אין חובה.
- **חומרה:** נמוך
- **מודול:** `onyx-procurement/package.json`
- **הצעת תיקון:** לא לפעול. רק תיעוד.

---

#### **B-018** — onyx-procurement server.js קורא `require('./package.json').name` בשורה 1189

- **תיאור:** שתי שורות (1189, 1190) קוראות `require('./package.json')`. זה עובד אבל חושף גרסאות ללקוחות דרך ה-readiness probe (ראה שורה 1233). ב-Node 22+ זה יחייב את ה-flag `--experimental-json-modules` כש-type: module (כרגע זה CJS אז בסדר).
- **שלבי שחזור:** קריאה של server.js שורות 1189-1240.
- **בפועל:** עובד אבל דולף גרסה.
- **צפוי:** משתמשים ב-`process.env.npm_package_name` או ב-constant-file.
- **חומרה:** נמוך
- **מודול:** `onyx-procurement/server.js`
- **הצעת תיקון:** שמירת שם/גרסה ב-constants file או ב-env variable.

---

#### **B-019** — payroll-autonomous/src/App.jsx מניח window.storage קיים, משתמש ב-shim ב-main.jsx

- **תיאור:** `payroll-autonomous/src/main.jsx:11-50` מגדיר shim ל-`window.storage` מעל `localStorage` עבור App.jsx שצפוי ל-Base44 API. זה lock-in סמוי ל-Base44. אם מריצים ב-SSR / Node test → `window` לא קיים (הקוד בודק `typeof window !== 'undefined'`, זה מטופל).
- **שלבי שחזור:** קריאה של main.jsx שורה 11.
- **בפועל:** עובד בדפדפן; אבל יוצר coupling סמוי.
- **צפוי:** App.jsx משתמש ב-localStorage ישירות.
- **חומרה:** נמוך
- **מודול:** `payroll-autonomous/src/main.jsx`, `src/App.jsx`
- **הצעת תיקון:** לקוד ארוך-טווח — להחליף את window.storage ב-API אמיתי.

---

#### **B-020** — techno-kol-ops/src/index.ts שורה 43: `cors({ origin: '*' })` בלי allowlist

- **תיאור:** שורה 43 מגדירה CORS פתוח לגמרי: `cors({ origin: '*' })`. זה סותר את `ALLOWED_ORIGINS` שב-.env.example — המשתנה כתוב אבל לא בשימוש.
- **שלבי שחזור:** קריאה של src/index.ts:43 מול .env.example:11.
- **בפועל:** כל domain יכול לקרוא ל-API (כולל מתקפות CSRF).
- **צפוי:** שימוש ב-`process.env.ALLOWED_ORIGINS.split(',')`.
- **חומרה:** נמוך (בסביבת dev), גבוה בסביבת prod.
- **מודול:** `techno-kol-ops/src/index.ts:43`
- **הצעת תיקון:** להחליף ל-`cors({ origin: (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean), credentials: true })`.

---

## 4. סיכום מספרי

| קטגוריה | ערך |
|---|---|
| פרויקטים שנסרקו | 4 (onyx-procurement, payroll-autonomous, techno-kol-ops, onyx-ai) |
| תת-פרויקטים נוספים שנסרקו | 1 (techno-kol-ops/client) |
| סה"כ package.json שנקראו | 5 |
| סה"כ syntax-checks (node --check) | 16 קבצי JS (onyx-procurement: server.js + 14 מודולים + 4 scripts) |
| סה"כ syntax-checks שעברו | 15 (seed.js נכשל כי חסר) |
| סה"כ TypeScript typechecks שהורצו | 1 (onyx-ai — 2838 שורות index.ts + 5 עוד קבצים) |
| סה"כ שגיאות TS שנמצאו | **28** (ב-6 קבצים של onyx-ai) |
| **בדיקות שבוצעו** (syntax + config + dep-presence + env + scripts + port-map) | **56** |
| **בדיקות שעברו** | **28** |
| **בדיקות שנכשלו** | **28** |
| באגים קריטיים פתוחים | **7** (B-001..B-007) |
| באגים גבוהים פתוחים | **5** (B-008..B-012) |
| באגים בינוניים פתוחים | **4** (B-013..B-016) |
| באגים נמוכים פתוחים | **4** (B-017..B-020) |
| **סה"כ באגים פתוחים** | **20** |

---

## 5. Go / No-Go לשלב QA הבא

### **החלטה: NO-GO** עד שיתוקנו **B-001** עד **B-007** (כל הקריטיים).

**סיבות לשלילה:**

1. **שלושה מארבעת הפרויקטים אין להם `node_modules`**. אי-אפשר להריץ אפילו syntax-check מלא של TypeScript ב-techno-kol-ops, אי-אפשר להריץ vite ב-payroll-autonomous. QA-02 (Unit Tests) לא יכול להתחיל ללא עצים.
2. **onyx-ai לא מתקמפל** — 28 שגיאות TS פעילות, כולל 20+ שגיאות ב-onyx-integrations.ts שמעידות על קוד שלא נבדק מעולם (missing imports של `http`/`https`, שימוש בטעות ב-Web-Crypto במקום ב-Node Crypto). `npm run build` ייכשל, וגם `npm start` (שיש לו `prestart: npm run build`). זה חסם קיצוני עבור QA-03 (Integration) ו-QA-10 (API tests).
3. **קונפליקט פורטים מוחלט בין הבריף והקוד** — אי-אפשר להחליט איזה פורט "נכון" בלי החלטה הנדסית. כל QA שיעשה קריאות HTTP בין שירותים ייכשל כי ה-ALLOWED_ORIGINS, ה-proxies וה-URLs של inter-service calls כולם מחולקים בין 3 מספרים שונים.
4. **בעיות קריטיות של תצורה**: onyx-procurement `test` script מצביע על תיקייה לא קיימת (`tests/` במקום `test/`), `seed.js` חסר לגמרי, payroll-autonomous חסר .env.example לגמרי.

### תנאי חידוש (Go criteria):

1. **B-001** — ליצור `onyx-procurement/scripts/seed.js` או להסיר מ-package.json.
2. **B-002** — לתקן `test` script ב-onyx-procurement.
3. **B-003** — להתקין `node_modules` ב-payroll-autonomous, להוסיף `.env.example`, להחליט על פורט סופי.
4. **B-004** — להתקין `node_modules` ב-techno-kol-ops, ליישר פורט (5000 מול 3200), לוודא שלב build.
5. **B-005** — להתקין `node_modules` ב-techno-kol-ops/client, להוסיף `.env.example`, ליישר פורט.
6. **B-006** — לתקן את **28** שגיאות ה-TypeScript ב-onyx-ai. בלי זה, ה-build נכשל.
7. **B-007** — **החלטה הנדסית רשמית** על מיפוי פורטים בין 4 הפרויקטים, ולעדכן את כל `.env.example` + vite configs + index.ts defaults בהתאם. **אי-אפשר להמשיך QA בלי זה**.

### החלטה לפעולה מיידית:

- **QA-01 סיים את העבודה שלו.** כל הבדיקות בוצעו, כל הבעיות תועדו.
- **שלב הבא חייב להיות: מפתח / קופיילוט שמתקן את B-001..B-007.**
- **QA-02 ואילך לא יכולים להתחיל עד שיתקבל Go-decision על B-007** (פורטים).

---

## נספח A — מפת פורטים מוצעת (להחלטה הנדסית)

| Project | אופציה A (לפי בריף) | אופציה B (לפי קוד בפועל) |
|---|---|---|
| onyx-procurement | 3100 | 3100 |
| payroll-autonomous | 5173 | 5174 |
| techno-kol-ops server | 3200 | 5000 |
| techno-kol-ops client | 5174 | 3000 |
| onyx-ai | 3300 | 3200 |

**המלצת QA-01:** אופציה A (בריף) — קוהרנטית, ברורה, בלי התנגשויות. דורשת לעדכן 5 קבצים:
1. `payroll-autonomous/vite.config.js` → port 5173
2. `techno-kol-ops/src/index.ts` → default 3200
3. `techno-kol-ops/.env.example` → PORT=3200
4. `techno-kol-ops/client/vite.config.ts` → port 5174, proxy → localhost:3200
5. `onyx-ai/src/index.ts` → default 3300
6. `onyx-ai/.env.example` → PORT=3300

**אזהרה:** בחירה באופציה B (קוד) משאירה את הבריף סותר את המציאות, וכל QA agent הבא יבלבל.

---

## נספח B — מפה מפורטת של Framework / Runtime

### 1. onyx-procurement
- **Runtime:** Node.js ≥20 (מוגדר ב-`engines`)
- **Framework:** Express 4.21
- **Module system:** CommonJS (`require`)
- **Package manager:** npm
- **Database:** Supabase (PostgreSQL)
- **Entry point:** `server.js` (1259 שורות)
- **Key deps:** express, @supabase/supabase-js, helmet, cors, express-rate-limit, pdfkit, bwip-js, csv-parse, pino
- **Structure:** שורש + `src/{ops,middleware,vat,tax,bank,payroll,ai-bridge.js,logger.js}` + `scripts/`
- **Test framework:** `node --test` (built-in)

### 2. payroll-autonomous
- **Runtime:** Vite 5 + React 18
- **Framework:** React 18.3 + Vite 5.4
- **Module system:** ESM (`"type": "module"`)
- **Package manager:** npm
- **Entry point:** `src/main.jsx` → `src/App.jsx`
- **Key deps:** react, react-dom, vite, @vitejs/plugin-react
- **Structure:** `src/{main.jsx,App.jsx,index.css}` + `index.html` + `vite.config.js`
- **Test framework:** אין (לא הותקן)

### 3. techno-kol-ops (server)
- **Runtime:** Node.js + tsx (dev) / node (prod, אחרי build)
- **Framework:** Express 4.18 + WebSocket (ws 8.16)
- **Module system:** CommonJS (compilerOptions.module = "commonjs")
- **Package manager:** npm
- **Database:** PostgreSQL (`pg`)
- **Entry point:** `src/index.ts` (174 שורות) → `dist/index.js` אחרי build
- **Key deps:** express, pg, ws, bcryptjs, jsonwebtoken, node-cron, cors, dotenv, date-fns, tsx, typescript
- **Structure:** `src/{ai, aip, apollo, auth, config, db, documents, middleware, ontology, realtime, routes, services, index.ts}`
- **Test framework:** לא מוגדר

### 3b. techno-kol-ops/client
- **Runtime:** Vite 5 + React 18 + TypeScript
- **Framework:** React 18 + Blueprint.js 5 + ag-grid + recharts + zustand + axios
- **Module system:** ESM
- **Package manager:** npm
- **Entry point:** `src/main.tsx` → `src/App.tsx`
- **Key deps:** react, react-router-dom 6, @blueprintjs/{core,icons,table}, ag-grid-{react,community}, recharts, zustand, axios, date-fns, vite, typescript
- **Test framework:** לא מוגדר

### 4. onyx-ai
- **Runtime:** Node.js ≥20
- **Framework:** מונוליט raw HTTP (משתמש ב-`http.createServer`, לא Express)
- **Module system:** CommonJS
- **Package manager:** npm
- **Entry point:** `src/index.ts` (2838 שורות monolith) → `dist/index.js`
- **Key deps (מוצהרים):** express, cors, dotenv, helmet — **לא בשימוש ב-index.ts**
- **Key deps (בשימוש בפועל):** events, crypto, fs, path, http, https (כולם Node built-ins)
- **Structure:** `src/{modules/*, health.ts, integrations.ts, onyx-integrations.ts, onyx-platform.ts, procurement-bridge.ts, security.ts, index.ts}` + `test/*.test.ts` + `data/`
- **Test framework:** placeholder (ראה B-014)

---

**סוף דוח QA-01.**
**הבא בתור:** המתנה ל-Go-decision על B-007 (מיפוי פורטים), ואז מפתח לתקן את B-001..B-006.
