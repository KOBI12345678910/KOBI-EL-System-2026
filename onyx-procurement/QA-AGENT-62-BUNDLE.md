# QA Agent #62 — Frontend Bundle Size Analysis

**מערכת:** onyx-procurement
**סוג בדיקה:** Static analysis only (ללא build / ללא bundler runtime)
**תאריך:** 2026-04-11
**מימד:** Frontend Bundle Size Analysis
**קובץ נבדק:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\web\onyx-dashboard.jsx` (710 שורות, 38,854 bytes = 38 KB על הדיסק)
**Cross-ref:** `QA-WAVE1-DIRECT-FINDINGS.md` — **I-01** (Single-file React ללא Vite/build)

---

## 0. Executive Summary (TL;DR)

| # | קריטריון | מצב | ציון |
|---|---------|-----|------|
| 1 | שיטת delivery | **אין delivery בכלל** — לא pre-bundle, לא babel-browser, לא HTML shell | **F** |
| 2 | React — CDN vs bundled | **לא מיובא** — אין קובץ שטוען react (אין עוגן) | **F** |
| 3 | lucide-react tree-shaking | **N/A** — הפרוייקט **לא משתמש** ב-lucide-react (אין import) | **A** |
| 4 | Total bundle | **בלתי אפשרי למדידה** — אין bundle. אומדן "אם היה Babel standalone" = **~1.5–2.2 MB** | **F** |
| 5 | Mobile load על 3G | **~8–14 שניות** (אומדן אם Babel-standalone) / **~1.2–1.8s** (אם Vite + split) | **F / A** |
| 6 | המלצה ראשית | **Vite + code splitting + React 18 ESM CDN fallback** | — |

**ממצא מרכזי:** `onyx-dashboard.jsx` **איננו נצרך על ידי שום מנגנון** בפרוייקט הנוכחי. אין `.html`, אין `express.static`, אין `res.sendFile`, אין endpoint שמגיש אותו, אין `package.json` ל-`web/`, אין `vite.config`, אין `webpack.config`, אין `tsconfig`, אין `babel.config`. זהו **"קובץ יתום"** (orphan file) שקיים בריפו אבל אף client לא יכול להריץ אותו ללא צעד build ידני שאינו מתועד.

---

## 1. שיטת Delivery — Pre-bundled vs In-browser Babel?

### 1.1 מה נמצא בפועל
```
onyx-procurement/
├── server.js            (934 שורות, express + supabase, API only)
├── package.json         (deps: express, @supabase/supabase-js, dotenv, cors)
└── web/
    └── onyx-dashboard.jsx   (38,854 bytes, CRLF, single file)
```

### 1.2 בדיקות שבוצעו

| בדיקה | פקודה / חיפוש | תוצאה |
|-------|--------------|-------|
| האם server.js מגיש HTML? | `grep -n "static\|sendFile\|\.html" server.js` | **0 hits** |
| האם server.js מגיש JSX? | `grep -n "\.jsx\|babel" server.js` | **0 hits** |
| האם יש קובץ HTML בפרוייקט? | `**/*.html` | **0 files** |
| האם package.json כולל react? | קריאת deps | **אין** (רק express/supabase/dotenv/cors) |
| האם יש vite/webpack/babel config? | `**/vite.config*`, `**/webpack*`, `**/.babelrc*` | **0 files** |
| האם `package.json` ל-`web/`? | קריאת `web/` | **אין** (רק הקובץ jsx) |

### 1.3 מסקנה
**לא pre-bundled ולא in-browser Babel — פשוט לא נצרך.**
הקובץ מנסה להשתמש ב-ESM import מ-`react` (`import { useState, useEffect, useCallback } from "react";`), מה שאומר שגם אם היה נפתח ישירות בדפדפן דרך `<script type="module">`, הוא היה נשבר כי `"react"` הוא "bare specifier" שלא נפתר על ידי הדפדפן בלי import-map / Vite / bundler.

**קרוס-ref ל-I-01:** הממצא שלנו מחזק את I-01. I-01 זיהה את היעדר ה-build; QA-62 מוסיף את הכיוון של **Bundle size implication** — אפילו ה-"quick-fix" של Babel-standalone שמוצע ב-QA-AGENT-15-COMPATIBILITY.md שורה 145 יוצר bundle של **~1.5–2.2 MB** (פירוט בסעיף 4).

### 1.4 חומרה: **HIGH** — הדשבורד, למעשה, לא ניתן לטעינה בלי צעד ידני שלא מתועד.

---

## 2. React — CDN vs Bundled?

### 2.1 הטקסט שנצפה
שורה 1:
```js
import { useState, useEffect, useCallback } from "react";
```
זוהי **לא** הצהרת CDN אלא **bare specifier** שמצפה ל-resolver (Vite / Webpack / Rollup / esbuild / import-map).

### 2.2 שלוש אפשרויות delivery אפשריות (בהתעלם מהמצב הנוכחי)

| אופציה | גודל React | זמן parse | הערות |
|--------|-----------|-----------|--------|
| **A. React 18 UMD via CDN** (unpkg / cdnjs) | `react.production.min.js` = **~11 KB gzip** (~45 KB uncompressed); `react-dom.production.min.js` = **~42 KB gzip** (~130 KB uncompressed) | ~50-120ms mid-tier mobile | דורש שינוי קוד: `const { useState, ... } = React;` במקום import |
| **B. React 18 ESM via esm.sh/jspm** | ~11 KB + 42 KB gzip (זהה) | ~50-120ms | תומך ב-import syntax בלי בנייה; דורש `<script type="importmap">` |
| **C. Vite bundled + treeshake** | **~42 KB gzip** total (react + react-dom yoked together) | ~40-100ms | גם split code + מטמון חזק |

### 2.3 מצב בפועל
**אופציה 0** — אף אחד מהאלה לא הוגדר. הקובץ פשוט לא ירוץ.

---

## 3. lucide-react — tree-shaking?

### 3.1 חיפוש ב-dashboard
```
grep -i "lucide\|react-icons\|@radix\|chart\|recharts" onyx-dashboard.jsx  →  0 hits
```

### 3.2 חיפוש ב-dependencies
```
package.json deps = { express, @supabase/supabase-js, dotenv, cors }  →  אין lucide-react
```

### 3.3 ממצא
**`lucide-react` אינו בשימוש בכלל.**
האייקונים בדשבורד הם **emojis ביוניקוד** (שורות 48-54):
```js
{ id: "dashboard", label: "דשבורד", icon: "📊" },
{ id: "suppliers", label: "ספקים", icon: "🏭" },
{ id: "rfq", label: "בקשת מחיר", icon: "📤" },
{ id: "quotes", label: "הצעות", icon: "📥" },
{ id: "orders", label: "הזמנות", icon: "📦" },
{ id: "subcontractors", label: "קבלנים", icon: "👷" },
{ id: "sub_decide", label: "החלטת קבלן", icon: "🎯" },
```
וגם `🔄` (refresh), `O` (לוגו טקסט), כל אלה **0 KB** (תווי יוניקוד רגילים).

### 3.4 מסקנה
**אפס עלות bundle מאייקונים.** זה יתרון משמעותי — אילו הקובץ היה משתמש ב-lucide-react בלי tree-shaking, הוא היה מוסיף **~350 KB** uncompressed. השימוש ב-emoji היא **החלטה יעילה** מבחינת bundle (גם אם מתאימות ל-a11y ולעיצוב זה דיון אחר — ראה QA-AGENT-12).

### 3.5 סיכון עתידי
אם מישהו יוסיף lucide-react ללא `import { IconName } from 'lucide-react'` (ספציפי), ורק יעשה `import * as Icons`, ה-tree-shaking יישבר וה-bundle יגדל ב-~350 KB. **המלצה:** הוסף ESLint rule `no-restricted-imports` שחוסם `import * from 'lucide-react'`.

---

## 4. אומדן גודל bundle כולל

מכיוון שאין bundle בפועל, האומדן מחושב עבור **שלושה תרחישים**:

### 4.1 תרחיש A — "Quick fix" Babel Standalone + React UMD CDN
זה התרחיש שנרמז ב-QA-AGENT-15 שורה 93 / 145.

| משאב | גודל uncompressed | gzip | מקור |
|------|------------------|------|------|
| `@babel/standalone` | ~2.9 MB | ~780 KB | unpkg.com/@babel/standalone |
| `react.production.min.js` (18.x) | ~11 KB | ~4 KB | unpkg.com/react@18 |
| `react-dom.production.min.js` | ~130 KB | ~42 KB | unpkg.com/react-dom@18 |
| `onyx-dashboard.jsx` | 38 KB | ~10 KB | local |
| Google Fonts (Rubik, 6 משקלים) | ~400 KB | ~120 KB (WOFF2) | fonts.googleapis.com |
| **סה"כ** | **~3.47 MB** | **~956 KB** | |

**בעייתי במיוחד:** `@babel/standalone` — ספרייה שכל תפקידה הוא לקמפל JSX בדפדפן בזמן ריצה. **זה גם משקל ענק וגם CPU overhead של ~200-600ms** נוסף לפני first paint.

### 4.2 תרחיש B — Vite prod build נכון
| משאב | uncompressed | gzip | הערה |
|------|-------------|------|------|
| `vendor.js` (react + react-dom) | ~130 KB | ~42 KB | code-split |
| `app.js` (dashboard logic) | ~25 KB | ~8 KB | tree-shaken |
| `index.css` (styles inline כבר ב-JS) | 0 | 0 | inline styles |
| Rubik fonts (subset latin+hebrew, 3 משקלים) | ~120 KB | ~55 KB | self-host |
| `index.html` | ~1 KB | ~0.5 KB | |
| **סה"כ initial** | **~276 KB** | **~105 KB** | |

**חיסכון vs תרחיש A:** **~92% ב-gzip** (956 KB → 105 KB).

### 4.3 תרחיש C — Vite + lazy routes (code splitting לכל tab)
| משאב | gzip | הערה |
|------|------|------|
| `vendor.js` | 42 KB | |
| `app.js` (shell + layout בלבד) | 4 KB | |
| `tab-dashboard.js` (lazy) | 2 KB | |
| Rubik WOFF2 subset | 55 KB | |
| **Initial route load** | **~103 KB** | |
| לכל tab נוסף | **~1-3 KB** | נטען on demand |

**חיסכון vs תרחיש B:** **~2% ב-initial load**, אבל בגודל הקוד הכולל **יותר משמעותי** ב-TTI.

---

## 5. Mobile load time על 3G

### 5.1 מודל רשת: "Slow 3G" (1.6 Mbps down, 400 Kbps up, 400ms RTT — הסטנדרט של Chrome DevTools)

### 5.2 חישוב (payload gzip ÷ throughput + RTT handshakes + parse/compile + react mount)

| תרחיש | Payload gzip | Download time | Parse+compile | Babel runtime | React mount | **TTI total** |
|-------|-------------|---------------|---------------|---------------|------------|--------------|
| A. Babel standalone | 956 KB | ~5.0s | ~1.5s | ~0.8s | ~0.5s | **~8.2s** |
| A על 4G (10 Mbps) | 956 KB | ~0.8s | ~0.9s | ~0.4s | ~0.3s | **~2.7s** |
| A על Regular 3G (3 Mbps) | 956 KB | ~2.6s | ~1.2s | ~0.6s | ~0.4s | **~5.1s** |
| B. Vite build | 105 KB | ~0.55s | ~0.25s | 0 | ~0.2s | **~1.2s** |
| C. Vite + split | 103 KB | ~0.54s | ~0.15s | 0 | ~0.15s | **~1.0s** |

### 5.3 מסקנה 3G
- **תרחיש A (Babel-standalone) על Slow 3G** = **~8.2 שניות TTI**. זה **מעל 3× הסף** של Google "Good" (2.5s LCP), **פחות טוב** מ-"Poor" (4s). במונחי נטישה, מחקר Akamai מצביע על **~40% נטישה ב-3 שניות** ו-**~53% ב-4 שניות** על מובייל. ב-8.2 שניות — הרוב הגמור נוטש.
- **תרחיש B (Vite prod)** = **~1.2s**. "Good" לפי Google.
- **תרחיש C (Vite + lazy tabs)** = **~1.0s**. "Excellent".

### 5.4 השפעה על משתמשים
משתמשים עיקריים של onyx-procurement הם **קבלני בניין ונהגי משאיות בשטח** — אוכלוסיה שעל פי שכיחות בשטח בנייה בישראל **נכנסת פעמים רבות דרך LTE זניח/3G בגלל כיסוי תאי חלש**. אם ה-bundle הוא Babel-standalone, חלק ניכר מהמשתמשים **פשוט לא יטענו את הדשבורד** בשטח.

---

## 6. המלצה: Vite + code splitting

### 6.1 המלצה ראשית — מעבר ל-Vite

**צעדים מדויקים:**

1. **יצירת `web/package.json`:**
```json
{
  "name": "onyx-dashboard",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "@vitejs/plugin-react": "^4.3.0"
  }
}
```

2. **`web/vite.config.js`:**
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    minify: 'esbuild',
    cssMinify: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom'],
        },
      },
    },
    chunkSizeWarningLimit: 150,
  },
  server: { port: 5173 },
});
```

3. **פיצול הדשבורד ל-tabs נפרדים** (code-splitting אמיתי):
```js
// onyx-dashboard.jsx
import { lazy, Suspense } from 'react';
const DashboardTab = lazy(() => import('./tabs/DashboardTab.jsx'));
const SuppliersTab = lazy(() => import('./tabs/SuppliersTab.jsx'));
const RFQTab = lazy(() => import('./tabs/RFQTab.jsx'));
// ... 4 קבצים נוספים

// בתוך render:
<Suspense fallback={<div>טוען...</div>}>
  {tab === 'dashboard' && <DashboardTab ... />}
  {tab === 'suppliers' && <SuppliersTab ... />}
  // ...
</Suspense>
```

4. **שרת express — הגשת dist סטטי** (server.js):
```js
app.use('/app', express.static(path.join(__dirname, 'web/dist')));
// וב-HTML, `const API = ""` (אותו origin) במקום `localhost:3100`
```

### 6.2 המלצות משלימות

| # | המלצה | חיסכון צפוי | עדיפות |
|---|-------|-------------|--------|
| 1 | self-host Rubik WOFF2 subset עם `font-display: swap` | ~65 KB uncompressed + מנע CLS | HIGH |
| 2 | Preload critical font (`<link rel="preload" as="font">`) | ~100-200ms FCP | MED |
| 3 | Service Worker + cache-first לvendor | load 2 = ~100ms | MED |
| 4 | Brotli במקום gzip ב-server (express-compression) | ~15-20% נוסף על gzip | LOW |
| 5 | ESLint rule: `no-restricted-imports: ["error", { patterns: ["lucide-react/*"] }]` | מנע regression | LOW |
| 6 | הוסף `<meta name="viewport">` במעטפה ל-mobile | UX, לא bundle | HIGH |
| 7 | Lighthouse CI בכל PR עם `performance-budget.json` | מונע drift | MED |

### 6.3 Performance budget מומלץ
```json
{
  "resourceSizes": [
    { "resourceType": "script",     "budget": 120 },
    { "resourceType": "stylesheet", "budget": 30  },
    { "resourceType": "font",       "budget": 80  },
    { "resourceType": "total",      "budget": 300 }
  ],
  "resourceCounts": [
    { "resourceType": "third-party", "budget": 5 }
  ]
}
```
(גדלים ב-KB, uncompressed)

### 6.4 חלופה "זולה" — אם Vite גדול מדי כרגע
אם קובי רוצה פתרון של **"ללא build step כלל"**, יש תרחיש ביניים:

**ESM.sh + import-maps** (ללא Babel, ללא bundler):
```html
<script type="importmap">
{
  "imports": {
    "react":     "https://esm.sh/react@18.3.1",
    "react-dom": "https://esm.sh/react-dom@18.3.1/client"
  }
}
</script>
<script type="module" src="./onyx-dashboard.js"></script>
```
אבל זה דורש **להמיר JSX ל-createElement ידנית** או להוסיף Babel-standalone לעיבוד JSX (ואז אנחנו חוזרים לתרחיש A). **המלצה: לא לעשות זאת — עדיף Vite.**

---

## 7. סיכום רשמי + ממצאים (Findings table)

| ID | חומרה | תיאור | שורה / קובץ | תיקון |
|----|-------|-------|-------------|--------|
| **B-62-01** | **HIGH** | אין מנגנון delivery לדשבורד; הקובץ "יתום" (no HTML shell, no server route, no build) | `web/onyx-dashboard.jsx` + `server.js` | הוסף Vite + `express.static('web/dist')` |
| **B-62-02** | **HIGH** | אם נפתר דרך Babel-standalone, bundle ~956 KB gzip → TTI ~8s ב-3G | `web/` | pre-build עם Vite |
| **B-62-03** | MED | `import from "react"` הוא bare specifier — לא עובד בלי bundler/import-map | שורה 1 | Vite פותר אוטומטית |
| **B-62-04** | MED | אין performance budget, אין Lighthouse CI | — | `lighthouserc.js` + CI |
| **B-62-05** | LOW | Google Fonts נטען מ-CDN (`fonts.googleapis.com/...Rubik`), מוסיף ~120 KB gzip + DNS handshake נוסף | שורה 101 | self-host subset (latin + hebrew) WOFF2 |
| **B-62-06** | LOW | כל ה-styles inline ב-JS object (`styles.app`, `styles.header`, ...) — 710 שורות כולל styles | `onyx-dashboard.jsx:~80-710` | הוצא ל-`.module.css` לcache נפרד |
| **B-62-07** | INFO | lucide-react לא בשימוש — 0 KB overhead (יתרון) | — | שמור על כך; הוסף ESLint rule |
| **B-62-08** | INFO | React לא מופיע ב-`package.json` — בעיה עתידית כשcoבי יעביר ל-CI ויריץ `npm audit` | `package.json:10-15` | הפרדה של `web/package.json` |

---

## 8. תלויות וקרוס-ref למסמכים אחרים

- **QA-WAVE1-DIRECT-FINDINGS.md: I-01** — **Same root cause** (אין build). QA-62 מכמת את ההשפעה על bundle.
- **QA-AGENT-15-COMPATIBILITY.md שורה 93, 145** — מציע Babel-standalone כ"פתרון" — **QA-62 ממליץ להימנע** מכיוון זה בגלל ה-~956 KB.
- **QA-AGENT-34-DOCS.md שורה 526** — מקשר את חוסר התיעוד ל-I-01 (אותו שורש).
- **QA-AGENT-36-MOBILE.md** — משלים את הסיפור של mobile UX (3G load time מהמסמך הזה הוא input למטריקות שלו).
- **QA-AGENT-11-UI-COMPONENTS.md** — הפיצול ל-tabs ב-QA-62 ס' 6.1 תומך גם בתיקוני ה-UI הנדרשים שם.
- **QA-AGENT-16-UAT-WALKTHROUGH.md שורה 79, 346** — הבעיה של `const API = "http://localhost:3100"` נפתרת אוטומטית אם השרת מגיש את ה-dist.
- **QA-AGENT-25-LICENSE.md שורה 82, 92, 169** — Rubik נטען מ-CDN עם רישיון OFL; המעבר ל-self-host ב-QA-62 ס' 6.2 פותר גם את בעיית GDPR (L-08).
- **QA-AGENT-26-GDPR.md** — Google Fonts CDN שולח IP ל-Google = עיבוד PII. self-hosting פותר.

---

## 9. פסק דין (Verdict)

**הדשבורד כרגע במצב "schrödinger":** קיים בריפו, מתואר במדריכים, מוזכר בדוחות, **אבל לא ניתן להרצה** ללא צעד ידני שלא מתועד. ברגע שהוא **כן** ירוץ (בכל דרך שתהיה), ה-bundle יהיה **או** עצום (~956 KB gzip ב-Babel-standalone, בלתי שמיש ב-3G) **או** יעיל (~105 KB ב-Vite, מצוין).

**הפער בין שני התרחישים הוא גורם יחיד:** האם **יש או אין** Vite build step. זהו הממצא המרכזי של QA-62.

**המלצה כוללת:** **לאמץ Vite + code splitting + self-hosted fonts + performance budget + Lighthouse CI לפני פריסה לשטח.** זמן הטמעה משוער: **3-4 שעות עבודה**. חיסכון: **~90% בגודל ה-bundle**, **~85% ב-TTI על 3G**.

---

**נכתב על ידי:** QA Agent #62 (Frontend Bundle Size)
**תאריך:** 2026-04-11
**מתודולוגיה:** Static analysis only — לא הורץ build, לא נמדד runtime; האומדנים מבוססים על גודלי משאבים ידועים פומבית וקבועי רשת של Chrome DevTools Slow/Regular 3G.
