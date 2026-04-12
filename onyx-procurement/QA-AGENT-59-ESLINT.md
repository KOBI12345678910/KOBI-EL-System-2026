# QA Agent #59 — ESLint Configuration Audit

**פרויקט:** onyx-procurement
**תאריך:** 2026-04-11
**סוג בדיקה:** Static Analysis ONLY
**מימד:** ESLint Configuration Audit
**חומרה כללית:** CRITICAL — אפס כיסוי lint

---

## 1. תקציר מנהלים (Executive Summary)

הפרויקט `onyx-procurement` **חסר לחלוטין** כל תצורת ESLint. אין קובץ תצורה
(`.eslintrc*` או `eslint.config.*`), אין תלויות lint ב-`package.json`, אין
script של `npm run lint`, ואין אינטגרציה עם CI (אין תיקיית `.github/workflows`).
מדובר בפער איכות קוד קריטי עבור פרויקט Express/Node.js + UI JSX שנוגע
בתהליכי רכש אוטונומיים ובכסף (ראו QA Agent #38 MONEY-PRECISION).

**ציון כולל: 0/100** — אין כל מנגנון lint פעיל.

---

## 2. ממצאים (Findings)

### 2.1. בדיקה #1: האם ESLint מותקן ומוגדר?

**שאילתת Glob:**
```
.eslintrc*  → No files found
eslint.config.* → No files found
**/.eslint* → No files found
```

**בדיקת package.json:**
```json
{
  "name": "onyx-procurement",
  "version": "1.0.0",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "@supabase/supabase-js": "^2.45.0",
    "dotenv": "^16.4.5",
    "cors": "^2.8.5"
  }
}
```

**ממצא:**
- אין `devDependencies` כלל.
- אין `eslint`, `eslint-config-*`, או כל plugin.
- אין `"lint"` script.
- אין `"type": "module"` (Pure CommonJS).

**מסקנה:** ESLint **לא מותקן ולא מוגדר**. הפרויקט רץ ללא כל כלי ניתוח סטטי.

| פריט | נדרש | נמצא |
|------|------|------|
| `eslint` ב-devDependencies | V | X |
| `.eslintrc.*` | V | X |
| `eslint.config.mjs` | V | X |
| `npm run lint` | V | X |
| `.eslintignore` | V | X |

---

### 2.2. בדיקה #2: כיסוי Plugins

פרויקט מרובה-דומיינים: Express server + React/JSX UI + Node runtime.
הכיסוי הנדרש כולל:

| Plugin נדרש | סיבה | מותקן? |
|-------------|------|--------|
| `eslint-plugin-security` | server.js חשוף ל-SQL-ish strings, child_process, regex | **X לא** |
| `eslint-plugin-n` (Node) | best practices של Node | **X לא** |
| `eslint-plugin-node-security` | חלופה ל-security | **X לא** |
| `eslint-plugin-react` | `web/onyx-dashboard.jsx` | **X לא** |
| `eslint-plugin-react-hooks` | hooks validation | **X לא** |
| `eslint-plugin-jsx-a11y` | נגישות (ראו QA #12) | **X לא** |
| `eslint-plugin-jest` | בדיקות (אם יהיו) | **X לא** |
| `eslint-plugin-promise` | שימוש ב-async/await ב-server.js | **X לא** |
| `eslint-plugin-import` | import/require hygiene | **X לא** |
| `@eslint/js` או `eslint:recommended` | baseline | **X לא** |

**ציון כיסוי plugins: 0/10**

---

### 2.3. בדיקה #3: חומרת חוקים (Rules Strictness)

לא ניתן להעריך חומרת חוקים — **אין קובץ חוקים**.
ברירת המחדל של Node (ללא lint) = כל שגיאת style, unused variable,
no-undef, no-shadow, no-console — לא נתפסות בזמן פיתוח.

**משמעות מעשית מתוך server.js (40KB, 1200+ שורות):**
הקוד נכתב ללא כל חיזוק סטטי. שגיאות מסוג `console.log` בפרודקשן,
משתנים לא מוגדרים, strict equality (`==` vs `===`), unused imports —
לא נתפסו אוטומטית.

---

### 2.4. בדיקה #4: eslint-plugin-security

Plugin זה תופס:
- `detect-eval-with-expression`
- `detect-non-literal-fs-filename`
- `detect-non-literal-regexp`
- `detect-object-injection`
- `detect-possible-timing-attacks`
- `detect-unsafe-regex`
- `detect-child-process`
- `detect-non-literal-require`

**מצב נוכחי:** לא מותקן. **קריטי** עבור פרויקט הפועל על נתוני רכש
ורגיש ל-injection (cross-ref QA Agents 31, 32, 42).

---

### 2.5. בדיקה #5: יכולת Auto-fix

`eslint --fix` אינה זמינה (ESLint לא מותקן). אין:
- npm script `"lint:fix"`
- pre-commit hook (אין husky/lint-staged)
- git pre-push hook

**אין כל מנגנון תיקון אוטומטי.**

---

### 2.6. בדיקה #6: אינטגרציה עם CI (Cross-ref Agent #57)

בדיקת תיקיית `.github/`:
```
ls .github/ → No such file or directory
```

**מסקנה:**
- אין workflow של GitHub Actions.
- אין שלב `lint` ב-CI (כי אין CI כלל).
- אין gate שחוסם PR על בסיס lint errors.
- תוצאה: **lint לא רץ אוטומטית בשום שלב**.

Cross-reference ל-QA Agent #57 (CI/CD): נצפה שם ממצא זהה — היעדר pipeline.

---

## 3. רמת סיכון (Risk Level)

| ממד | רמה | הסבר |
|-----|-----|------|
| איכות קוד | **CRITICAL** | שגיאות רגרסיה לא נתפסות |
| אבטחה | **CRITICAL** | אין זיהוי דפוסי-סכנה סטטיים |
| יציבות | **HIGH** | `no-undef`, `no-unused` לא נאכפים |
| אחזקה ארוכת-טווח | **CRITICAL** | חוב טכני מצטבר |
| Dev Experience | **HIGH** | אין פידבק בזמן כתיבה |

**סיכון כולל: CRITICAL (0/100)**

---

## 4. המלצות (Recommendations)

### 4.1. תצורת מינימום מומלצת — Express + JS + JSX

**התקנה:**
```bash
npm install --save-dev \
  eslint@^9.0.0 \
  @eslint/js \
  eslint-plugin-security \
  eslint-plugin-n \
  eslint-plugin-promise \
  eslint-plugin-import \
  eslint-plugin-react \
  eslint-plugin-react-hooks \
  eslint-plugin-jsx-a11y \
  globals
```

**קובץ `eslint.config.mjs` (Flat Config, ESLint 9):**
```js
import js from '@eslint/js';
import security from 'eslint-plugin-security';
import nodePlugin from 'eslint-plugin-n';
import promisePlugin from 'eslint-plugin-promise';
import importPlugin from 'eslint-plugin-import';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

export default [
  // 1. Server (CommonJS Node)
  {
    files: ['server.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    plugins: {
      security,
      n: nodePlugin,
      promise: promisePlugin,
      import: importPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...security.configs.recommended.rules,
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'eqeqeq': ['error', 'always'],
      'no-throw-literal': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'security/detect-object-injection': 'warn',
      'security/detect-non-literal-fs-filename': 'error',
      'security/detect-child-process': 'error',
      'security/detect-unsafe-regex': 'error',
      'security/detect-eval-with-expression': 'error',
      'n/no-deprecated-api': 'error',
      'n/no-missing-require': 'error',
      'promise/catch-or-return': 'error',
      'promise/no-return-wrap': 'error',
      'import/no-unresolved': 'error',
      'import/order': 'warn',
    },
  },

  // 2. Browser JSX (Dashboard)
  {
    files: ['web/**/*.jsx', 'web/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'no-console': 'warn',
      'jsx-a11y/label-has-associated-control': 'error',
      'jsx-a11y/lang': 'error',
      'jsx-a11y/no-autofocus': 'warn',
    },
  },

  // 3. התעלמות
  {
    ignores: [
      'node_modules/**',
      'supabase/**',
      'QA-AGENT-*.md',
      '*.md',
    ],
  },
];
```

**הוספה ל-package.json:**
```json
"scripts": {
  "start": "node server.js",
  "dev": "node --watch server.js",
  "lint": "eslint .",
  "lint:fix": "eslint . --fix",
  "lint:ci": "eslint . --max-warnings 0 --format stylish"
}
```

---

### 4.2. שלב CI מומלץ (בעת הקמת pipeline)

**קובץ `.github/workflows/ci.yml` (כדי לחבר ל-QA #57):**
```yaml
name: CI
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint:ci
```

### 4.3. pre-commit (husky + lint-staged)

```bash
npm install --save-dev husky lint-staged
npx husky init
```

**ב-package.json:**
```json
"lint-staged": {
  "*.{js,jsx}": ["eslint --fix", "git add"]
}
```

---

## 5. פעולות מיידיות (Action Items)

| # | פעולה | עדיפות | אחראי | DoD |
|---|------|--------|-------|-----|
| 1 | הוספת ESLint 9 + plugins | **P0** | DevOps | `npx eslint --version` רץ |
| 2 | יצירת `eslint.config.mjs` | **P0** | Backend Lead | `npm run lint` רץ |
| 3 | תיקון כל השגיאות שיעלו ב-server.js | **P0** | Backend Lead | 0 errors |
| 4 | הוספת `npm run lint` ל-CI (עם #57) | **P1** | DevOps | Gate פעיל |
| 5 | pre-commit hook (husky + lint-staged) | **P2** | DevOps | commit חוסם שגיאות |
| 6 | תיעוד חוקי-lint ב-CONTRIBUTING.md | **P2** | Tech Writer | מסמך קיים |

---

## 6. מסקנות (Conclusions)

`onyx-procurement` הוא פרויקט **Greenfield** (גרסה 1.0.0) שעדיין לא
הוסיף אפילו את כלי האיכות הבסיסיים ביותר. ללא ESLint, כל שגיאה
של `no-undef`, `no-unused-vars`, שימוש ב-`==`, או דפוס-סכנה
(`eval`, regex לא-בטוח, child_process) **תיכנס לפרודקשן ללא כל מחסום**.

זהו **ממצא חוסם-שחרור** (Release Blocker). מומלץ בחום ליישם את
תצורת-המינימום המוצעת בסעיף 4.1 לפני כל deploy נוסף.

**ציון סופי: 0/100 — CRITICAL**

---

**נוצר ע"י:** QA Agent #59 (Static Analysis, Hebrew)
**Cross-ref:** QA #57 (CI/CD), QA #33 (Code Quality), QA #31 (Deps CVE), QA #42 (CSRF)
