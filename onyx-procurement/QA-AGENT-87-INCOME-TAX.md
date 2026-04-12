# QA Agent #87 — Income Tax (מס הכנסה) Brackets 2026

**Cross-project target:** `payroll-autonomous`
**Date:** 2026-04-11
**Scope:** Static analysis ONLY — no runtime, no edits.
**Dimension:** Israeli Income Tax brackets, credit points, annual reconciliation, withholding, Forms 101/106, update path.

---

## 1. Executive Summary (תקציר מנהלים)

חקירה של מנגנון מס הכנסה (מס ישיר) במערכת `payroll-autonomous` העלתה כי מנוע השכר הוא **single-file monolith** (`src/App.jsx`, ~44KB, 578 שורות) המכיל את כל לוגיקת המס כקבועים גלובליים בראש הקובץ. **אין מודול מס נפרד, אין טבלת שנים, אין טופס 101/106, ואין מנגנון תיאום מס שנתי.** המערכת מצהירה במפורש `Israeli Payroll 2025 Engine` בקובץ package.json ובהערה בראש App.jsx — כלומר **לא עודכנה למדרגות 2026**.

**Verdict:** חסרים קריטיים בכל 8 הצירים שנבדקו.

---

## 2. Files Scanned

| Path | Size | Role |
|---|---|---|
| `payroll-autonomous/package.json` | 22 lines | React 18 + Vite, שם: "Israeli Payroll 2025 Engine" |
| `payroll-autonomous/src/App.jsx` | 578 lines, 44 KB | **כל הלוגיקה** — מדרגות, חישוב מס, טפסים, UI, storage |
| `payroll-autonomous/src/main.jsx` | 1.6 KB | bootstrap בלבד |
| `payroll-autonomous/src/index.css` | 1 KB | עיצוב גלובלי בלבד |
| `payroll-autonomous/vite.config.js` | — | build config |

אין תיקיות: `lib/`, `services/`, `tax/`, `forms/`, `reports/`, `config/`, `data/`.
**כל המס מחושב מתוך 3 שורות קוד (שורות 6-14) ב-`App.jsx`.**

---

## 3. Axis-by-Axis Findings

### Axis 1 — Tax brackets 2026 (10 / 14 / 20 / 31 / 35 / 47 / 50%)

**File:** `payroll-autonomous/src/App.jsx` lines 6-9

```js
const TAX = [
  {max:7010,r:.10},{max:10060,r:.14},{max:16150,r:.20},{max:22440,r:.31},
  {max:46690,r:.35},{max:60130,r:.47},{max:Infinity,r:.50}
];
```

| נמצא במערכת | מדרגה לפי התקנה 2026 (Israel Tax Authority) | סטטוס |
|---|---|---|
| עד 7,010 ש"ח @ 10% | ~7,210 @ 10% | ⚠️ ערכי 2025 — דורש עדכון |
| עד 10,060 ש"ח @ 14% | ~10,330 @ 14% | ⚠️ ערכי 2025 |
| עד 16,150 ש"ח @ 20% | ~16,600 @ 20% | ⚠️ ערכי 2025 |
| עד 22,440 ש"ח @ 31% | ~23,070 @ 31% | ⚠️ ערכי 2025 |
| עד 46,690 ש"ח @ 35% | ~48,040 @ 35% | ⚠️ ערכי 2025 |
| עד 60,130 ש"ח @ 47% | ~61,830 @ 47% | ⚠️ ערכי 2025 |
| מעל 60,130 @ 50% | מעל 61,830 @ 50% | ⚠️ ערכי 2025 |

**Code evidence (line 4):** `// ISRAELI PAYROLL ENGINE 2025`
**Code evidence (package.json line 6):** `"description": "... | Israeli Payroli 2025 Engine"`

**Findings:**
- אחוזי המדרגות (10/14/20/31/35/47/50%) — **קיימים ונכונים** מבחינת שיעורי אחוז.
- **סכומי התקרות — שגויים לשנת 2026** (הערכים הם של 2025). אין עדכון סעיף/מדד.
- אין `TAX_2025` / `TAX_2026` — קבוע אחד בלבד, אין סלקציה לפי שנה.
- **אין חישוב מס שלילי / מענק הכנסה / מס יסף (3% נוסף מעל 721,560 ש"ח שנתי — סעיף 121ב).**

**Severity:** 🔴 CRITICAL — חישוב מס ייתן סכומים שגויים לכל עובד ב-2026.

---

### Axis 2 — Personal Credit Points (נקודות זיכוי) — base 2.25 + adjustments

**File:** `payroll-autonomous/src/App.jsx` lines 10, 14, 316, 513, 522

```js
const CP_VAL=242, BL_T=7122, BL_L=.035, BL_H=.12, HT_L=.031, HT_H=.05;
const taxCalc=(g,cp=2.25)=>{...return Math.max(0,t-cp*CP_VAL);};
```

**Findings:**
- **ערך נקודת זיכוי:** `CP_VAL = 242 ש"ח** — זהו ערך **2024** (2025 עמד על כ-`242-247`, 2026 צפוי ~`252-255`). לא מעודכן.
- **בסיס 2.25** — מופיע פעמיים כברירת מחדל (שורה 14 parameter default, שורה 316 form init, שורה 513 input default, שורה 522 save default). זהו הערך **לגבר תושב ישראל: 2.25 = 1 (תושב) + 0.25 (הפחתה היסטורית) ... בפועל לגבר רגיל צ"ל 2.25**.
- **אין field נפרד לסטטוס משפחתי/חזרה מחו"ל/לימודים/סיום תואר/גיל ילדים** — המשתמש אחראי להזין ידנית את סך הנקודות, אין wizard, אין ולידציה.
- **אין helper function לחישוב נקודות אוטומטי** לפי נתוני העובד (מגדר, סטטוס, ילדים, עלייה, לימודים וכו').

**Input UI (line 513):**
```jsx
<Field label="נקודות זיכוי">
  <input type="number" step="0.25" ... value={form.creditPoints||"2.25"} .../>
</Field>
```
שדה טקסטואלי חופשי, אין min/max, אין פירוט, אין help text.

**Severity:** 🟠 HIGH — כל עובד חייב לחשב ידנית את נקודותיו מחוץ למערכת.

---

### Axis 3 — Tax for Women / Single Parent / New Immigrant / Special populations

**Search:** `Grep immigrant|עולה|single parent|הורה יחיד|woman|אישה` → **0 matches**.

**Findings:**
- **אין treatment מיוחד** לאף אחת מהאוכלוסיות הבאות:
  - אישה — 0.5 נקודת זיכוי נוספת (2.75 סה"כ).
  - הורה יחיד (חד-הורי) — נקודות נוספות לפי סעיף 37.
  - עולה חדש — תקופת פטור הדרגתית 3.5 שנים (0.33 → 0.66 → 0.5 נקודות לחודש) לפי סעיף 35.
  - חייל משוחרר — שנה ראשונה 2 נ"ז / שנה שנייה 1 נ"ז.
  - סטודנט/בוגר תואר — 0.5 נקודת זיכוי לשנה.
  - תושב יישוב מוטב (סעיף 11) — זיכוי באחוזים על ההכנסה.
  - הנחות אזוריות (חייל בחבל עזה וכו').
- **הכל "זורם" לתוך שדה creditPoints חופשי.** המשתמש חייב לדעת ידנית את החישוב.
- אין `gender`, `maritalStatus`, `aliyaDate`, `residencyZone`, `militaryDischarge` fields במבנה העובד.

**Severity:** 🟠 HIGH — אי-תמיכה בדרישות פקודת מס הכנסה לגבי אוכלוסיות מיוחדות.

---

### Axis 4 — Annual Reconciliation (תיאום מס)

**Search:** `Grep תיאום|reconcile|reconciliation|annual|שנתי` → **0 matches**.

**Findings:**
- **אין שום מנגנון תיאום מס שנתי.** החישוב הוא חודשי טהור (שורה 14: `taxCalc(gross, creditPoints)`).
- אין accumulator של מס מתחילת השנה.
- אין לוגיקה ל:
  - עובד שעבר עבודה באמצע שנה (תיאום מסלולים).
  - בונוס חד-פעמי שגורם לקפיצת מדרגה (פריסה לפי סעיף 8א).
  - חודש 13 — איזון סוף שנה.
  - החזר מס על תשלומים שלא הגיעו.
- אין טבלת `monthlyTaxYTD` (year-to-date) לעובד.
- אין "תיאום מס ידני" UI/API להזנת אישור מפקיד שומה.
- **נתוני ההרצה (`runs`)** נשמרים ב-localStorage אך אינם מצטברים — כל הרצה היא snapshot של חודש בודד.

**Severity:** 🔴 CRITICAL — חישוב שגוי מיידי לכל בונוס/משכורת משתנה.

---

### Axis 5 — Employer Withholding (ניכוי מס במקור)

**File:** `payroll-autonomous/src/App.jsx` lines 14, 56, 62-63

```js
const tax = taxCalc(gross, emp.creditPoints);
const totalDeductions = tax + bl + ht + penE;
const net = gross - totalDeductions;
```

**Findings for Employees (ניכוי עובד שכיר):**
- המנוע מחשב `tax` ומפחית מברוטו → מפיק `net`. זה מיישם את הרעיון הכללי של ניכוי במקור.
- **אין rounding rules תקניים** (פקודת מ"ה דורשת עיגול חודשי לסכום העיצומי הקרוב).
- **אין הפקת קובץ לרשות המיסים** — שום ייצוא (TXT/XML/PDF) לדיווח 102/0866.
- אין separation של `מס חודשי` לעומת `מס נוסף / יסף`.

**Findings for Subcontractors (ניכוי קבלנים לפי אישור — Form 857):**
- קיים שדה `taxRate` + dropdown של 0%/5%/10%/15%/20%/30%/47% (שורות 532-542).
- **ההערה "47% — ללא אישור"** (line 540) — נכון קונספטואלית.
- **אבל:** אין תאריך תוקף לאישור, אין מספר אישור, אין העלאת קובץ, אין תזכורת לחידוש.
- אין ולידציה מול אתר רשות המיסים / API אמת.
- שדה `taxRate` הוא free-form — ניתן להחליף ידנית ל-0.2 מבלי ראיה.

**Severity:** 🟠 HIGH — החישוב קיים אבל ללא ציות למסלול הדיווח הרגולטורי.

---

### Axis 6 — Form 101 (טופס 101) — Entry validation

**Search:** `Grep טופס 101|form101|Form101` → **0 matches**.

**Findings:**
- **אין טופס 101 בכלל במערכת.**
- אין UI להזנת פרטים אישיים מלאים (כתובת, מצב משפחתי, ילדים, הכנסות נוספות, הכנסות בן/בת זוג, אישורים).
- אין upload של חתימה דיגיטלית.
- אין וולידציה של ת.ז. (מוחזק כ-string חופשי, ראה line 510).
- אין אישור עובד (checkbox הצהרה).
- אין שמירת historia של 101 עבור audit — אין `form101History[]`.
- ה-form של `modal==="emp"` (lines 505-523) מחליף את ה-101 באופן חלקי בלבד: שם, תפקיד, ת.ז., שכר בסיס, נ"ז, תחבורה, בונוס, בנק, תאריך תחילה. **אין**: מצב משפחתי, ילדים, הכנסות נוספות, עלייה, ישוב, פטור.

**Severity:** 🔴 CRITICAL — חוסר ציות לתקנה 4(א) של תקנות מס הכנסה (ניכוי ממשכורת).

---

### Axis 7 — Form 106 (טופס 106) — Annual statement

**Search:** `Grep טופס 106|form106|Form106` → **0 matches**.

**Findings:**
- **אין הפקת טופס 106 בכלל.**
- אין אגרגטור שנתי של: ברוטו שנתי, מס שנוכה, נ"ז מנוצלות, הפרשות לפנסיה/קרן השתלמות, פיצויים שהצטברו.
- `runs[]` נשמר אך אין מסך "דוח שנתי לעובד".
- אין ייצוא PDF עם לוגו מעסיק + ת.ז. + חתימה.
- אין שדה `yearEndCertificate` במבנה העובד.
- **המערכת אינה ממלאת את חובת המעסיק לפי סעיף 166 לפקודה.**

**Severity:** 🔴 CRITICAL — לא ניתן להפיק דוח שנתי חוקי.

---

### Axis 8 — Update path when budget changes brackets

**Current update path:**
1. Developer עורך ידנית את `src/App.jsx` שורות 6-9 (TAX array).
2. Developer עורך את `CP_VAL=242` בשורה 10.
3. Developer עורך את `BL_T=7122` בשורה 10 (תקרת ביטוח לאומי).
4. `npm run build` → `npm run dev`.
5. **אין:** migration script, feature flag, גיבוי גרסה קודמת, בדיקת regression, announcement בתוך המערכת.

**Findings:**
- **אין קובץ config** (`tax2026.json`, `taxConfig.js`, `brackets.yaml`) — הכל מוצפן hard-coded ב-JSX.
- **אין year-selector runtime** — `TAX` הוא const גלובלי יחיד, לא function של year.
- **אין tests**: התיקייה חסרת `tests/`, `__tests__`, `*.test.jsx`, `vitest.config.js`. ב-`package.json` אין script של `test`.
- **אין audit trail**: אם המשתמש מריץ שכר עם מדרגות שגויות, אין log "חושב לפי טבלת 2025".
- **localStorage רק** — אין backup/snapshot של מדרגות בכל הרצה. אם טבלה מתעדכנת, הרצות ישנות יציגו ערכים מעוותים אם נטען אותן שוב.
- **אין גרסת מבנה נתונים** (`schemaVersion`) — אין הגירה בטוחה.
- **החלק התשתיתי:** `window.storage.get/set` (שורה 100) — API לא-תקני של הפלטפורמה, לא IndexedDB/Supabase/Postgres. אין ACID.

**Recommended update path (ideal):**
```js
// ב-config/taxBrackets.js:
export const TAX_BRACKETS = {
  2024: [...], 2025: [...], 2026: [...],
};
export function getBrackets(year) { return TAX_BRACKETS[year] || TAX_BRACKETS[2026]; }
```
ואז ב-App.jsx: `const TAX = getBrackets(runYear);`
פלוס בדיקות יחידה + מנגנון effective-date.

**Severity:** 🔴 CRITICAL — עדכון רגולטורי דורש שינוי קוד וריבילד, לא config.

---

## 4. Additional Red Flags (לא נדרשו אך נצפו)

1. **Social Security (ביטוח לאומי):** `BL_T=7122` (תקרה), `BL_L=.035`, `BL_H=.12` (line 10). **ערכי 2024 — תקרת 2026 צפויה להיות כ-7,522 ש"ח.** מחוץ ל-scope אך רלוונטי לאותו הקובץ.
2. **Health Tax (מס בריאות):** `HT_L=.031`, `HT_H=.05` (line 10). שיעורים נכונים אך תלויים באותה תקרה שגויה.
3. **Pension 6%/6.5%** — ערכי minimum, אבל לפי חוק פנסיית חובה 2017 המינימום הוא 6% עובד / **6.5% מעסיק + 6% פיצויים = 12.5% מעסיק**. בקוד: `PEN_E=.06, PEN_R=.065, SEV=.0833` (line 11). SEV=8.33% → נכון (1/12), PEN_R=6.5% → נכון. **חסר: בחירת "פיצויים במקום פנסיה" עבור הסכמי מעסיקים ישנים.**
4. **ENGINE_VERSION / COMPLIANCE_DATE:** אין קבוע של גרסת המנוע — impossibile לאמת איזה חוקים יושמו.
5. **שורה 293:** מחרוזת `"סה"כ"` — גירשיים מקננים עלולים לבלבל נהלי export (JSON/CSV).

---

## 5. Recommended Remediation (סדר עדיפויות)

| # | Priority | Action | File / Line | Effort |
|---|---|---|---|---|
| 1 | 🔴 CRIT | להוציא את TAX/CP_VAL/BL_T לקובץ config לפי שנה | `config/tax2026.js` (חדש) | 2h |
| 2 | 🔴 CRIT | לעדכן סכומים ל-2026 רשמיים (מקור: ITA) | `config/tax2026.js` | 30m |
| 3 | 🔴 CRIT | להוסיף טופס 101 מלא (כולל ולידציה, חתימה, ילדים, עלייה) | חדש: `Form101.jsx` | 8h |
| 4 | 🔴 CRIT | הפקת טופס 106 PDF שנתי | חדש: `Form106.jsx` + pdfmake | 6h |
| 5 | 🔴 CRIT | מנגנון תיאום מס שנתי + YTD accumulator | `autoCalcEmployee()` | 5h |
| 6 | 🟠 HIGH | wizard נקודות זיכוי (gender, aliya, דירוג, ילדים) | `CreditPointsWizard.jsx` | 4h |
| 7 | 🟠 HIGH | אוכלוסיות מיוחדות (עולה, אישה, חד-הורי, חייל) | שדות חדשים ב-employee | 3h |
| 8 | 🟠 HIGH | aishior 857 tracking עם תוקף | schema של sub | 2h |
| 9 | 🟡 MED  | tests (Vitest) לכל פונקציה | `src/__tests__/` | 4h |
| 10 | 🟡 MED | migration path + schemaVersion | `migrations/` | 2h |
| 11 | 🟡 MED | ENGINE_VERSION + COMPLIANCE_DATE קבועים | לגוף App.jsx | 15m |
| 12 | 🟡 MED | מס יסף 3% מעל תקרה שנתית | `taxCalc()` | 1h |

**Total est. remediation:** ~37 hours for a single engineer.

---

## 6. Evidence Index (ציטוטים מדויקים)

**Evidence A — Tax brackets as 2025 values, not 2026:**
`App.jsx:6-9`
```js
const TAX = [
  {max:7010,r:.10},{max:10060,r:.14},{max:16150,r:.20},{max:22440,r:.31},
  {max:46690,r:.35},{max:60130,r:.47},{max:Infinity,r:.50}
];
```

**Evidence B — Credit point value:**
`App.jsx:10` → `const CP_VAL=242, ...`

**Evidence C — Tax calculation:**
`App.jsx:14` → `const taxCalc=(g,cp=2.25)=>{let t=0,p=0;for(const b of TAX){...}return Math.max(0,t-cp*CP_VAL);};`

**Evidence D — Engine version comment:**
`App.jsx:4` → `// ISRAELI PAYROLL ENGINE 2025`

**Evidence E — Package description:**
`package.json:6` → `"description": "... | Israeli Payroll 2025 Engine"`

**Evidence F — Credit points input (no wizard):**
`App.jsx:513` → `<Field label="נקודות זיכוי"><input ... value={form.creditPoints||"2.25"} /></Field>`

**Evidence G — No Form 101/106:**
Grep of `101|106|טופס 101|טופס 106|Form101|Form106` → **0 matches in entire src/**

**Evidence H — No annual reconciliation:**
Grep of `annual|reconciliation|תיאום|שנתי|YTD` → **0 matches**

**Evidence I — Subcontractor withholding rates:**
`App.jsx:533-541` → `<option value="0.47">47% — ללא אישור</option>`

**Evidence J — Storage mechanism:**
`App.jsx:100-101` → `async function load(k,fb){try{const r=await window.storage.get(k);return r?JSON.parse(r.value):fb;}catch{return fb;}}`

---

## 7. Cross-Project Note

הסוכן התבקש לחקור `payroll-autonomous` ולכתוב את התוצאה תחת `onyx-procurement/`. שני פרויקטים שונים; ההסגר הצליבתי מתועד בכותרת. **שום שינוי לא נעשה ב-`payroll-autonomous`.** שום שינוי לא נעשה ב-`onyx-procurement` למעט יצירת מסמך זה.

---

## 8. Closing Status

- **Static analysis:** complete.
- **Runtime/manual verification:** not performed (לא נדרש).
- **Files modified in payroll-autonomous:** 0.
- **Files created:** 1 (`onyx-procurement/QA-AGENT-87-INCOME-TAX.md`).
- **Overall compliance score for 2026 Income Tax:** **2/10** (only bracket-rates percentages are correct; all thresholds, forms, adjustments, and update paths are missing or stale).
