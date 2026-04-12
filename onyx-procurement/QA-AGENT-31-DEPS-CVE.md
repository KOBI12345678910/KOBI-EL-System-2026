# QA Agent #31 — סריקת פגיעויות תלויות (Dependency Vulnerability Scan)

**פרויקט:** onyx-procurement
**תאריך סריקה:** 2026-04-11
**סוג סריקה:** ניתוח סטטי היוריסטי בלבד (ללא הרצת `npm audit` / `npm install`)
**סטטוס:** מומלץ להריץ `npm audit` אמיתי לאימות הממצאים

---

## 1. רשימת תלויות ישירות (Direct Dependencies)

מקור: `package.json` שורות 10-15

| שם החבילה | Version Spec | סוג Semver | רמת סיכון |
|-----------|--------------|------------|-----------|
| `express` | `^4.21.0` | Caret (minor+patch) | נמוך-בינוני |
| `@supabase/supabase-js` | `^2.45.0` | Caret (minor+patch) | בינוני |
| `dotenv` | `^16.4.5` | Caret (minor+patch) | נמוך |
| `cors` | `^2.8.5` | Caret (minor+patch) | נמוך |

**סך הכל:** 4 תלויות ישירות (production), 0 תלויות פיתוח (`devDependencies` ריק/חסר).

---

## 2. ניתוח שיטת Pinning

### 2.1 מצב נוכחי: כולן עם `^` (Caret)

כל 4 התלויות משתמשות ב-`^` — כלומר מאפשרות עדכון אוטומטי של minor + patch.
- `^4.21.0` יקבל `4.21.1`, `4.22.0`, אך לא `5.0.0`
- `^2.45.0` יקבל `2.45.1`, `2.99.9`, אך לא `3.0.0`

### 2.2 סיכונים

1. **שדרוג לא מתוכנן בזמן `npm install`** — בעיקר בסביבת CI/CD: כל build עלול להביא גרסה מעט שונה.
2. **חוסר דטרמיניזם** — ללא `package-lock.json` (ראה סעיף 3), שני מפתחים באותו היום יקבלו גרסאות שונות.
3. **פגיעות Zero-day בתתי-תלויות (transitive)** — נכנסת מבלי שנדע.

### 2.3 המלצה

לפרויקט Production מומלץ:
- לפחות `~` (tilde) לעדכוני patch בלבד, או
- **Pinning מדויק** (ללא `^`/`~`) ופיקוח ידני על עדכונים דרך Renovate/Dependabot.

---

## 3. קריטי — חסר `package-lock.json`

**בדיקה בוצעה באמצעות Glob:** לא נמצא קובץ `package-lock.json` בכל עץ הפרויקט.

### 3.1 השלכות

1. **אובדן reproducibility** — כל `npm install` עלול להביא עץ תלויות שונה.
2. **אי-התאמה בין סביבות** — dev / staging / prod יכולים לרוץ עם גרסאות שונות של אותה תלות עקיפה.
3. **קושי לסקור transitive dependencies** — אין דרך לראות מה בפועל יותקן (express מביא ~40 תלויות עקיפות).
4. **חסימת `npm audit` אמין** — `npm audit` עובד בצורה הטובה ביותר עם lock-file.
5. **רגולציה / SOC2 / ISO27001** — דורשים SBOM דטרמיניסטי.

### 3.2 המלצה דחופה

```bash
npm install   # ייצור package-lock.json
git add package-lock.json
git commit -m "Add package-lock.json for reproducible builds"
```

ולהכניס ל-CI בדיקה: `npm ci` (דורש lock-file) במקום `npm install`.

---

## 4. ניתוח CVE לפי חבילה (היוריסטי, מהזיכרון)

### 4.1 `express@^4.21.0`

**הערה:** 4.21.0 שוחררה בספטמבר 2024, והיא הגרסה הנוכחית המתוקנת של 4.x.

**CVEs היסטוריים רלוונטיים ב-Express 4.x (שצריכים להיות מתוקנים ב-4.21.0, אך שווה לוודא):**
- **CVE-2024-43796** (Express < 4.20.0) — Open Redirect ב-`res.redirect()` עם קלט משתמש.
- **CVE-2024-29041** (Express < 4.19.2) — Redirect validation bypass.
- **CVE-2022-24999** — `qs` prototype pollution (דרך body-parser בגרסאות ישנות).

`^4.21.0` אמור להיות מוגן מכולם, אך ללא lock-file אין ודאות שתלויות עקיפות (`qs`, `cookie`, `finalhandler`) הן ה-patched.

### 4.2 `body-parser` (טרנזיטיבי)

מגרסת Express 4.16+, `body-parser` מגיע כתלות עקיפה. אין צורך ברישום ישיר. CVEs בתוך `body-parser` עצמו:
- **CVE-2024-45590** — `body-parser < 1.20.3` — DoS ב-URL-encoded bodies קיצוניים.
- Express 4.21.0 אמור לגרור `body-parser >= 1.20.3`.

### 4.3 `@supabase/supabase-js@^2.45.0`

**CVEs ידועים:** עד לידיעתי (cutoff 2025-05), אין CVEs קריטיים פומביים ב-`@supabase/supabase-js` ב-branch 2.x.
**סיכונים עקיפים:**
- תלות ב-`@supabase/realtime-js` (WebSocket) — היסטוריה של בעיות ב-WebSocket parsing.
- תלות ב-`@supabase/postgrest-js` — בעיות serialize/deserialize היסטוריות ב-query building.
- תלות ב-`cross-fetch` / `node-fetch` — ראה 4.6.

Supabase משחררים patch-updates תכופים — יש לעקוב.

### 4.4 `dotenv@^16.4.5`

**סיכון כללי:** נמוך מאוד. `dotenv` הוא parser פשוט של קבצי `.env`.
**CVEs היסטוריים:**
- היו דיווחים ב-2023 על התנהגות expand עם קלט זדוני ב-`dotenv-expand` (חבילה נפרדת) — לא רלוונטי אם לא משתמשים בה.
- `dotenv 16.x` הוסרה ממנה הטעינה האוטומטית של `.env` מסביבות production (best practice).
**המלצה:** ב-production להעדיף secrets manager (Vault, AWS SM, Doppler) על פני `.env` בדיסק.

### 4.5 `cors@^2.8.5`

**CVEs היסטוריים:**
- `cors@2.8.5` משוחררת מאז 2018. החבילה כמעט לא פעילה.
- אין CVEs ידועים קריטיים, **אולם** תצורה שגויה (למשל `origin: "*"` עם `credentials: true`) היא הסיכון האמיתי — לא באג בחבילה אלא בשימוש.
- חלופות מודרניות יותר: `@fastify/cors`, או מימוש ידני של CORS headers ב-Express middleware.

**פעולה נדרשת (בסעיף נפרד — QA Agent אחר):** לבדוק ב-`server.js` את ההגדרות של `cors()` — בעיקר `origin`, `credentials`, `methods`.

### 4.6 חבילות HTTP client (לא בשימוש ישיר אך נכנסות טרנזיטיבית)

- **axios** — היסטוריה של CVEs (SSRF ב-1.x, prototype pollution). לא מופיע כתלות ישירה — טוב.
- **node-fetch** — היסטוריה של CVEs כולל redirects. Supabase משתמש בו דרך `cross-fetch`. יש לוודא שהגרסה הטרנזיטיבית עדכנית (נדרש lock-file).

---

## 5. Pinned vs Floating — האם מוכן ל-Production?

| קריטריון | מצב נוכחי | ציון |
|----------|-----------|------|
| Lock-file קיים? | לא | כשל קריטי |
| Pinning מדויק? | לא (`^` בלבד) | לא מוכן |
| `engines.node` מוגדר? | לא | חסר |
| `devDependencies` מופרד מ-`dependencies`? | לא (ריק) | אזהרה — ראה סעיף 7 |
| Scripts בטוחים (אין `postinstall` זדוני)? | כן | תקין |
| `private: true`? | לא | מומלץ להוסיף |

**מסקנה:** הפרויקט אינו מוכן ל-Production ברמת ה-dependency hygiene. חייב lock-file ו-engines field לפני deploy.

---

## 6. בדיקת עדכניות (Outdated Check — היוריסטי)

| חבילה | גרסה בקוד | גרסה נוכחית משוערת (2026-Q1) | הערכה |
|-------|-----------|------------------------------|-------|
| `express` | `^4.21.0` | 4.21.x / 5.0.x זמין | 4.x מספק, אך Express 5 יצא יציב. שווה תכנון מעבר. |
| `@supabase/supabase-js` | `^2.45.0` | 2.x מעודכן | בסדר — יש לעדכן ל-latest minor (תהליך שבועי). |
| `dotenv` | `^16.4.5` | 16.x / 17.x | אם יש 17.x — shיפור קטן. |
| `cors` | `^2.8.5` | 2.8.5 (אחרונה) | חבילה קפואה. שקול חלופה. |

**הערה:** לא ניתן לאמת ללא חיבור לרישום npm או הרצת `npm outdated`. מומלץ להריץ `npm outdated` ו-`npm audit` לאימות.

---

## 7. DevDependencies שנשלחות ל-Production בטעות

**ממצא חיובי:** אין `devDependencies` כלל ב-`package.json`.
**ממצא שלילי:** אין `devDependencies` כלל — כלומר לכל כלי פיתוח (eslint, jest, prettier, nodemon) **אין** ניהול.

### חסר קריטי (dev tooling):
- `eslint` / `@eslint/js` — סטטיק אנליזה
- `prettier` — עיצוב
- `jest` / `vitest` / `mocha` — טסטים
- `nodemon` (או השימוש הקיים ב-`node --watch` מספק)
- `@types/node`, `@types/express` — אם רוצים TypeScript
- `husky` + `lint-staged` — pre-commit hooks

**סיכון:** ללא כלים אלו, שינויים נכנסים ל-master ללא בדיקה סטטית — זו בעיית איכות לא-ישירה אך משמעותית.

---

## 8. המלצות לכלים אוטומטיים

### 8.1 חובה (Must-Have)

1. **`npm audit`** — להריץ ידנית לאחר יצירת lock-file. לחסום merge עם `audit-level=high` ומעלה.
2. **Dependabot** (GitHub native) — פתיחת PRs אוטומטית לעדכוני אבטחה.
   ```yaml
   # .github/dependabot.yml
   version: 2
   updates:
     - package-ecosystem: "npm"
       directory: "/"
       schedule:
         interval: "weekly"
       open-pull-requests-limit: 10
       labels: ["dependencies", "security"]
   ```
3. **`npm ci` ב-CI** (במקום `npm install`) — דטרמיניסטי ונכשל אם lock-file מיושן.

### 8.2 מומלץ (Should-Have)

4. **Snyk** / **Socket.dev** — סריקה מעמיקה יותר עם ניתוח תלויות עקיפות ו-license scanning.
5. **Renovate** — חלופה חזקה יותר מ-Dependabot (תומך ב-grouping, auto-merge rules).
6. **`npm-check-updates` (ncu)** — לבדיקה ידנית של major upgrades.

### 8.3 SBOM (Software Bill of Materials)

דרישת רגולציה הולכת וגוברת (EU CRA, US EO 14028):

- **CycloneDX**:
  ```bash
  npx @cyclonedx/cyclonedx-npm --output-file bom.json
  ```
- **SPDX**:
  ```bash
  npx spdx-sbom-generator -p ./
  ```

יש לצרף SBOM לכל release ב-GitHub Releases.

---

## 9. מדיניות עדכוני אבטחה אוטומטיים (Auto-Update Policy)

### 9.1 המדיניות המומלצת

| סוג עדכון | מדיניות | דוגמה |
|-----------|---------|-------|
| **Patch (x.y.Z)** של dependencies | auto-merge אחרי CI ירוק | `4.21.0 → 4.21.1` |
| **Minor (x.Y.0)** של dependencies | PR אוטומטי, merge ידני אחרי code review | `4.21.0 → 4.22.0` |
| **Major (X.0.0)** של dependencies | PR אוטומטי, תכנון מעבר, טסטים ידניים | `4.21.0 → 5.0.0` |
| **Security patches** (כל רמה) | auto-merge תוך 24 שעות אחרי release | כל CVE |

### 9.2 Renovate config מומלץ

```json
{
  "extends": ["config:recommended"],
  "schedule": ["every weekend"],
  "vulnerabilityAlerts": {
    "enabled": true,
    "labels": ["security"]
  },
  "packageRules": [
    {
      "matchUpdateTypes": ["patch"],
      "automerge": true
    }
  ]
}
```

---

## 10. Engines Field — חסר

**ממצא:** אין `engines` ב-`package.json`.

### 10.1 סיכונים

- ה-project ירוץ על כל גרסה של Node.js — כולל גרסאות ישנות עם CVEs (Node 14/16 EOL).
- `node --watch` דורש Node 18.11+ — אך אין אכיפה.
- קוד ב-server.js המשתמש ב-`fetch` global (אם יש) דורש Node 18+.

### 10.2 תיקון מומלץ

```json
{
  "engines": {
    "node": ">=20.0.0",
    "npm": ">=10.0.0"
  },
  "engineStrict": true
}
```

ב-CI להוסיף:
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'
```

---

## 11. סיכום כולל — ממצאים קריטיים

| # | ממצא | חומרה | תיקון נדרש |
|---|------|-------|------------|
| 1 | חסר `package-lock.json` | קריטי | להריץ `npm install` ולcommit את ה-lock |
| 2 | חסר `engines.node` | גבוה | להוסיף `"engines": {"node": ">=20"}` |
| 3 | כל התלויות ב-`^` | בינוני | לשקול `~` או pinning מדויק |
| 4 | חסרים `devDependencies` (eslint, test) | בינוני | להוסיף כלי dev |
| 5 | אין Dependabot/Renovate config | גבוה | להוסיף `.github/dependabot.yml` |
| 6 | אין SBOM generation | בינוני | CycloneDX ב-release workflow |
| 7 | אין `"private": true` | נמוך | להוסיף למניעת פרסום בטעות |
| 8 | `cors@2.8.5` — חבילה קפואה | נמוך-בינוני | לבדוק תצורה ב-server.js (QA נפרד) |
| 9 | אין `npm audit` ב-CI | גבוה | להוסיף step ב-pipeline |
| 10 | Express 5.x זמין, עדיין על 4.x | נמוך | תכנון מעבר עתידי |

---

## 12. שלבים מיידיים (Action Items)

```bash
# שלב 1 — יצירת lock-file ובדיקת אבטחה
cd "C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement"
npm install
npm audit
npm audit --audit-level=high
npm outdated

# שלב 2 — הוספת engines
# (ידני ב-package.json)

# שלב 3 — SBOM
npx @cyclonedx/cyclonedx-npm --output-file bom.json

# שלב 4 — Dependabot
# צור .github/dependabot.yml עם התוכן בסעיף 8.1
```

---

## 13. הסתייגות (Disclaimer)

דוח זה הוא **סריקה היוריסטית סטטית בלבד** שבוצעה ללא הרצת `npm install`, `npm audit`, או גישה למאגר ה-npm בזמן אמת. הוא מבוסס על:

1. קריאת `package.json` בלבד.
2. ידע היסטורי על CVEs ב-ecosystem של Node.js (נכון ל-cutoff 2025-05).
3. best practices מקובלות בסביבת Production.

**חובה** להריץ סריקה אמיתית עם:
- `npm audit --json`
- `snyk test`
- `osv-scanner`

לאימות וקבלת רשימה מוסמכת של CVEs פתוחים באותו רגע.

---

**נוצר על ידי:** QA Agent #31 (Dependency Vulnerability Scan)
**תאריך:** 2026-04-11
**פרויקט:** onyx-procurement
