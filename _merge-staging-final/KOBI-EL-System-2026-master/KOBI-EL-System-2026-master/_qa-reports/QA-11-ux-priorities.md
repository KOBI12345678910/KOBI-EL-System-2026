# QA-11 — Top 10 UX Priorities (ROI-Sorted)

**Agent:** QA-11 (UX/Usability)
**Date:** 2026-04-11
**Source Report:** `_qa-reports/QA-11-ux.md`
**Sorting:** ROI = (Value × Urgency × Users Affected) / Dev Effort

**Legend:**
- **Value:** 1-5 — כמה פאנישיש הוא מציל (compliance / money / confusion)
- **Effort:** 1-5 — ימי פיתוח (5 = אחד, 1 = שבועיים)
- **Users:** משתמשים מושפעים בפועל
- **Risk if NOT done:** מה קורה אם נשאיר כמו שזה

---

## ROI Ranking

### #1. Confirmation + Preview על פעולות הגשה/הנפקה (PDF / PCN836)

**Bugs:** BUG-UX-A04 (Payroll WageSlips), BUG-UX-C01 (VAT PCN836)
**Value:** 5 (Compliance — קנסות מס הכנסה/מע"מ)
**Effort:** 4 (~1 יום — modal כללי לחיזוק פעולות)
**Users:** כל משתמש פיננסי/HR (הבעלים, רו"ח, מנהל חשבונות)
**ROI:** ★★★★★

**Actions:**
1. הוסף `ConfirmSubmitModal` (component כללי) שמציג:
   - סכום סופי (לפני PDF/PCN).
   - מספר שורות/רשומות כלולות.
   - תקופה/תאריך.
   - "הבנתי, שלח" (primary, אדום) + "ביטול".
2. חייב double-click explicit ל־"הנפק PDF" ול־"ייצא PCN836".
3. לפני submission מע"מ — הצג ברשימה את כל החשבוניות הכלולות עם checkboxes לסינון.

**Files:**
- `payroll-autonomous/src/App.jsx` — `WageSlipsTab`, `handleIssue`
- `onyx-procurement/web/vat-dashboard.jsx` — `apiDownload` call for PCN836
- (חדש) `components/ConfirmSubmitModal.tsx` — רכיב משותף

**Risk if NOT done:** הנפקת תלוש/הגשה שגויה = קנס רשות המסים (₪1,500-₪10,000) + הפרת חוק הגנת השכר תיקון 24.

---

### #2. Fix Dead Buttons (Employees / Clients / Excel Export / Status Update)

**Bugs:** BUG-UX-B08, BUG-UX-B09, WorkOrders export, WorkOrders side panel buttons
**Value:** 4 (user trust — המשתמש מרגיש שהמערכת שבורה)
**Effort:** 4 (חצי יום — חיבור handlers או הסתרת כפתורים)
**Users:** כל משתמש שיגיע לעמוד עובדים/לקוחות
**ROI:** ★★★★★

**Actions:**
1. `techno-kol-ops/client/src/pages/Employees.tsx:22` — הוסף `onClick` או הסר את הכפתור עד שהמודל מוכן.
2. `techno-kol-ops/client/src/pages/Clients.tsx:14` — אותו דבר.
3. `WorkOrders.tsx:85` — "ייצוא Excel" — חבר או הסר.
4. `WorkOrders.tsx:156-161` — "עדכן סטטוס" / "הדפס" ב־side panel.
5. **עקרון כללי:** הוסף rule ב־ESLint/lint או ב־PR review — אסור `<button>` ללא `onClick` או ללא `type="submit"`.

**Risk if NOT done:** המשתמש חושב "המערכת שבורה" ומתקשר לתמיכה → CS cost. אובדן אמון כללי.

---

### #3. Form State Persistence (localStorage על כל הטפסים הארוכים)

**Bugs:** BUG-UX-A09, BUG-UX-A12, BUG-UX-B06
**Value:** 4 (שימור עבודה + הפחתת תסכול)
**Effort:** 3 (1-2 ימים — hook כללי `usePersistedForm`)
**Users:** HR, Sales, Operations — כל משתמש שממלא טפסים
**ROI:** ★★★★☆

**Actions:**
1. צור `hooks/usePersistedForm.ts` — `useState` שנשמר אוטומטית ל־localStorage תחת מפתח ייחודי.
2. החל על:
   - Payroll `ComputeTab` (17 שדות)
   - Payroll `EmployeesTab` form (13 שדות)
   - Payroll `EmployersTab` form (7 שדות)
   - Techno-Kol `NewOrderModal` (8 שדות)
   - Techno-Kol `HRAutonomy` inline forms (~10)
3. נקה localStorage רק אחרי submit מוצלח.
4. **הוסף banner:** "יש לך טיוטה לא שמורה — שחזר / מחק."

**Risk if NOT done:** משתמש שממלא טופס 17 שדות ורענן את הדף = 5 דקות עבודה באשפה. חוזר על עצמו עשרות פעמים בשבוע → תסכול מתמשך.

---

### #4. Field-Level Help / Tooltips על שדות חוקיים ותקניים

**Bugs:** BUG-UX-A10, BUG-UX-A13, BUG-UX-B10
**Value:** 4 (מניעת טעויות חישוב שכר/מס)
**Effort:** 3 (יום-יומיים — תיאורים + component Tooltip)
**Users:** כל מי שאינו אקטוארי/רו"ח — 80% מהמשתמשים
**ROI:** ★★★★☆

**Actions:**
1. צור `components/FieldHelp.tsx` — small ℹ icon שפותח tooltip.
2. הוסף ל:
   - `נקודות זיכוי` (רשות המסים, ברירת מחדל 2.25 לרווק/2.75 לנשוי)
   - `שעות/חודש 182` (תקן ישראלי 2026)
   - `תיק ניכויים` (מספר מרשות המסים, 9 ספרות)
   - `אחוז משרה` (% מתקן 182 שעות)
   - `נוספות 125% / 150% / 175% / 200%` (מתי כל רמה חלה)
   - `רווח גולמי` (הנוסחה המדויקת שבה שימוש)
3. קישור לדף חוק רלוונטי במקום שאפשר.

**Risk if NOT done:** משתמש שלא מבין "נקודות זיכוי" → הזנה שגויה → תלוש שגוי → תיקון למפרע → בעיה מול עובד או מס.

---

### #5. Client-Side Validation על שדות ישראליים (ת.ז, ח.פ, בנק)

**Bug:** BUG-UX-A14 + כללי
**Value:** 4 (מניעת רשומות פגומות ב־DB → scrap)
**Effort:** 3 (יום — ספריית validation קיימת: `israeli-id-validator`)
**Users:** כל משתמש אדמינ'
**ROI:** ★★★★☆

**Actions:**
1. התקן `israeli-id-validator` או כתוב 10-שורות (check-digit algorithm).
2. החל על:
   - `national_id` (Payroll Employees)
   - `company_id` / `tax_file_number` (Payroll Employers)
   - `national_id` ב־Techno-Kol (כשטופס עובד יתחבר)
3. הצג שגיאה אדומה מתחת לשדה במקום toast/banner.
4. Disable submit button כאשר יש שדה לא תקין.

**Risk if NOT done:** רשומת עובד עם ת.ז לא חוקית — חסימה בהמשך מול מס הכנסה/ביטוח לאומי (כשילובים API יופעלו).

---

### #6. HRAutonomy Megapage Split

**Bug:** BUG-UX-B15 (CRITICAL)
**Value:** 4 (usability יומיומי)
**Effort:** 2 (2-3 ימים — refactor sub-routes)
**Users:** HR, מנהלים — ~5 משתמשים אבל כל יום
**ROI:** ★★★☆☆

**Actions:**
1. פצל `pages/HRAutonomy.tsx` ל־8 sub-routes:
   - `/hr/dashboard`
   - `/hr/employees`
   - `/hr/recruitment`
   - `/hr/onboarding`
   - `/hr/attendance`
   - `/hr/payroll`
   - `/hr/performance`
   - `/hr/compliance`
2. כל sub-route טוען מה שהוא צריך.
3. Tab bar הופך ל־NavLinks ב־`Outlet`.
4. אותו דבר לעשות ל־FinancialAutonomy ו־HoursAttendance (5 tabs).

**Risk if NOT done:** משתמש HR יומיומי נאלץ לגלול דרך 1500 שורות של DOM בכל פתיחה. Render slowdown + UX sluggish.

---

### #7. Confirmation על פעולות הרסניות ב־Kanban / Slider / Alert Close

**Bugs:** BUG-UX-B05, BUG-UX-B07, BUG-UX-B11, BUG-UX-B13
**Value:** 3 (menos חמור מקומפליאנס, אבל הרסני לעבודה)
**Effort:** 4 (חצי יום עם ConfirmSubmitModal קיים)
**Users:** רבים
**ROI:** ★★★☆☆

**Actions:**
1. `ProductionFloor.tsx` Kanban drag → פתח modal "העבר X מ־Y ל־Z?".
2. `WorkOrders.tsx` range slider → debounce 2 שניות + undo toast.
3. `AlertCenter.tsx` "✓ סגור" → `confirm("סגור התראה? לא ניתן לפתוח מחדש בקלות")`.
4. `Documents.tsx` "sendDoc" → preview + confirm.

**Risk if NOT done:** שינויים אקראיים בסטטוס = דו"חות שגויים + בלבול צוות.

---

### #8. Loading States — Skeleton Screens במקום "טוען נתונים..."

**Bug:** BUG-UX-B04
**Value:** 3 (perception — מערכת מרגישה מהירה יותר)
**Effort:** 3 (יום — skeleton components)
**Users:** כולם
**ROI:** ★★★☆☆

**Actions:**
1. צור `components/Skeleton.tsx` — בלוקים אפורים מהבהבים.
2. החלף את `Loading()` function ב־Dashboard, HRAutonomy, Materials, Finance.
3. הוסף loading state גם ל־form submits (disabled + spinner).

**Risk if NOT done:** מערכת מרגישה איטית למרות שהיא לא (perception > reality).

---

### #9. Breadcrumbs + Back Button (Navigation Aid)

**Bug:** BUG-UX-B03
**Value:** 2 (orientation)
**Effort:** 4 (יום-יומיים — component `Breadcrumbs`)
**Users:** כולם
**ROI:** ★★☆☆☆

**Actions:**
1. צור `components/Breadcrumbs.tsx`.
2. הזן פרמטרים בכל `Route` (label, parent).
3. הצג בטופ של `Outlet`.
4. הוסף `<BackButton/>` ל־modal/side-panels במקום רק × sign.
5. הצלה קוגניטיבית חשובה במיוחד ב־Pipeline 20-stages, HRAutonomy.

**Risk if NOT done:** משתמש חדש מתבלבל, זמן onboarding ארוך.

---

### #10. Keyboard Shortcuts (Esc / Ctrl+S / Ctrl+Enter / Ctrl+B)

**Bug:** BUG-UX-A08, Cross-cutting Pattern #2
**Value:** 2 (power user productivity)
**Effort:** 4 (יום אחד — global hook)
**Users:** power users (מנהלים יומיומיים)
**ROI:** ★★☆☆☆

**Actions:**
1. צור `hooks/useKeyboardShortcut.ts`.
2. רשום global:
   - `Esc` — סגור modal/panel.
   - `Ctrl+S` — submit טופס הנוכחי.
   - `Ctrl+Enter` — primary action (preview/submit).
   - `Ctrl+B` — toggle sidebar.
   - `Ctrl+K` — command palette (nice-to-have).
3. הצג רשימת shortcuts ב־`?` או ב־Help modal.

**Risk if NOT done:** power users לא יגדילו מהירות עבודה; מערכת מרגישה "amateur".

---

## Backlog (Below Top 10 but Noted)

11. **Sidebar consolidation** — 25→16 פריטים (Pipeline+SupplyChain+Purchasing+Procurement).
12. **a11y (aria-label)** — כל הכפתורים עם אייקונים בלבד.
13. **Tooltip על אייקוני אמוג'י** ב־sidebar.
14. **Translate API errors to Hebrew + next-step guidance** (עקבי).
15. **Dashboard CTAs** — שימוש ב־MetricCard onClick יותר ברור + פעולה ראשונה proposer.
16. **Compliance alerts** — Payroll Dashboard צריך לפרסם "טופס 101 חסר ל־N עובדים".
17. **Preview ב־Documents.tsx** — הצג חוזה לפני שליחה.
18. **Replace all `alert()` with Toast** — 14 שימושים.
19. **Pipeline 20→7 stages collapsed** — הצג רק שלבים פעילים.
20. **Client detail panel** (Clients.tsx) — drill-down חסר.

---

## Implementation Plan (5-Day Sprint)

| Day | Tasks | Scope |
|-----|-------|-------|
| 1 | #1 Confirmation+Preview Modal (Payroll PDF + VAT PCN836) | Critical unblock |
| 2 | #2 Dead Buttons + #5 Israeli Validation | Quick wins |
| 3 | #3 Form Persistence (usePersistedForm) + migrate 5 forms | Medium unblock |
| 4 | #4 Tooltips + #7 Destructive-action confirmations | Trust |
| 5 | #6 HRAutonomy split + #8 Skeleton loading | Polish |

**Day 6 (QA-11 re-run):** אם כל ה־criticals ירדו ל־0 ו־HIGHs ירדו ל־<6 → GO.

---

## Success Metrics (Post-Fix)

| Metric | Pre | Target |
|--------|:---:|:---:|
| Criticals | 5 | **0** |
| Highs | 16 | **≤5** |
| Screens avg score | 2.7 | **≥3.5** |
| Dead buttons | 4 | **0** |
| Forms with persistence | 0 | **≥7** |
| Destructive actions with confirm | ~10% | **100%** |
| Fields with help text | ~5% | **≥80%** |
| Pages with breadcrumb | 1/25 | **25/25** |

---

**Signed:** QA-11 Agent — UX/Usability
**Date:** 2026-04-11
