# QA Agent #32 — Supply Chain Security (בדיקת אבטחת שרשרת אספקה)

**פרויקט:** onyx-procurement
**תאריך:** 2026-04-11
**ממד בדיקה:** Supply Chain Security
**סוג ניתוח:** Static Analysis Only
**ממצאים קיימים:** לא משוכפל מ-QA-WAVE1-DIRECT-FINDINGS.md

---

## 1. סקירה מנהלתית (Executive Summary)

פרויקט onyx-procurement הוא מערכת רכש Hebrew-RTL מבוססת Node.js/Express עם אינטגרציה ל-Supabase. הניתוח חושף **פערי אבטחה משמעותיים בשרשרת האספקה** – חסרים כלי הגנה בסיסיים כמו lockfile, pinning של registry, CI/CD pipeline, ובדיקת תלויות אוטומטית. דירוג SLSA משוער: **Level 0** (ללא הגנות פורמליות).

רמת סיכון כוללת: **HIGH** (גבוהה).

---

## 2. ממצאים מפורטים

### 2.1 Lockfile Presence — קובץ נעילה

**סטטוס:** CRITICAL / קריטי

**ממצא:**
- לא נמצא `package-lock.json` בפרויקט.
- לא נמצא `yarn.lock`.
- לא נמצא `pnpm-lock.yaml`.
- ה-package.json משתמש ב-caret ranges (`^4.21.0`, `^2.45.0`, `^16.4.5`, `^2.8.5`).

**השלכות:**
- **Non-deterministic builds** — כל התקנה עשויה להוריד גרסאות מינור/פאטצ' שונות.
- **Dependency confusion attacks** — תוקף שמפרסם גרסה גבוהה יותר יכול להחליף את החבילה האמיתית.
- **Rollback בלתי אפשרי** — אי אפשר לשחזר בנייה זהה לפרודקשן.
- **Audit trail חסר** — לא ניתן לדעת אילו transitive dependencies הותקנו.

**המלצה:**
```bash
cd onyx-procurement
npm install
git add package-lock.json
git commit -m "Add package-lock.json for reproducible builds"
```

**חומרה:** CRITICAL

---

### 2.2 .npmrc Registry Pinning — קיבוע רגיסטרי

**סטטוס:** HIGH / גבוה

**ממצא:**
- לא נמצא קובץ `.npmrc` בפרויקט.
- לא מוגדר registry מפורש.
- לא מופעל `audit-level`.
- לא מוגדר `engine-strict`.

**השלכות:**
- **Typosquatting vulnerability** — npm install עשוי למשוך חבילות מ-registry לא צפוי אם ה-global config משתנה.
- **אין הגנה מפני dependency confusion** — חבילות פרטיות אפשר להחליף בציבוריות.
- אין hard-fail על ציון אבטחה גבוה.

**המלצה:** יצירת `.npmrc` עם:
```
registry=https://registry.npmjs.org/
audit-level=moderate
engine-strict=true
save-exact=true
package-lock=true
fund=false
```

**חומרה:** HIGH

---

### 2.3 Scoped Packages (@org/...) — שימוש בחבילות מתוחמות

**סטטוס:** INFO / מידעי

**ממצא:**
חבילה אחת בלבד סקופית:
- `@supabase/supabase-js` — אורגניזציה מאומתת של Supabase (בטוחה יחסית).

שלוש חבילות לא-סקופיות:
- `express` — בעלי: Express Technical Committee (מאומת).
- `dotenv` — בעלי: Motdotla (אישי, אך בשימוש נרחב).
- `cors` — בעלי: Troy Goode (אישי).

**סיכון:** חבילות אישיות שאינן סקופיות חשופות יותר להשתלטות חשבון (account takeover) – כפי שקרה ב-`event-stream`, `ua-parser-js`, `node-ipc`.

**המלצה:** העדפת חבילות סקופיות `@scope/name` או חבילות עם ownership ארגוני מאומת. שקול להשתמש ב-`@expressjs/...` אם זמין.

**חומרה:** INFO

---

### 2.4 Postinstall Scripts בתלויות

**סטטוס:** MEDIUM / בינוני

**ממצא (static analysis בלבד):**
ללא lockfile, בלתי אפשרי לוודא ב-static באיזה transitive dependencies יש postinstall hooks. מבדיקת התלויות הישירות:

| חבילה | postinstall ידוע | הערה |
|-------|------------------|------|
| express@^4.21.0 | לא | ללא סקריפטים בסיסיים |
| @supabase/supabase-js@^2.45.0 | לא (ב-main package) | transitives לא ודאיים |
| dotenv@^16.4.5 | לא | טהור JS |
| cors@^2.8.5 | לא | טהור JS |

**סיכון פוטנציאלי:** התקנה ראשונה תריץ סקריפטים שיכולים לקרוא `.env`, לשלוח משתני סביבה החוצה, או להתקין backdoors (כפי שקרה ב-`ctx`, `phpass`, `@solana/web3.js`).

**המלצה:**
```bash
npm config set ignore-scripts true
```
או שימוש ב-`npm install --ignore-scripts` בסביבות CI. לאחר מכן, הרץ סקריפטים ידועים ומאושרים בלבד.

**חומרה:** MEDIUM

---

### 2.5 היסטוריית התקפות Supply Chain — חשיפה ידועה

**סטטוס:** LOW / נמוך

בדיקה נגד רשימת התקפות supply chain ידועות:

| התקפה | חבילה | בפרויקט? | סטטוס |
|-------|-------|----------|-------|
| event-stream (2018) | event-stream | לא | OK |
| ua-parser-js (2021) | ua-parser-js | לא | OK |
| colors/faker (2022) | colors, faker | לא | OK |
| node-ipc (2022) | node-ipc | לא | OK |
| ctx (2022) | ctx | לא | OK |
| @solana/web3.js (2024) | @solana/web3.js | לא | OK |
| lottie-player (2022) | lottie-player | לא | OK |
| rc (2021) | rc | ייתכן כ-transitive | ⚠️ בדיקה ידנית נדרשת |
| coa (2021) | coa | ייתכן כ-transitive | ⚠️ בדיקה ידנית נדרשת |

**בלי lockfile, לא ניתן לאמת transitive dependencies.** 4 התלויות הישירות נקיות מחבילות חשוכות-שם, אבל express@4 גורר עשרות transitives (debug, ms, cookie, qs, body-parser וכו').

**חומרה:** LOW (לתלויות הישירות) / UNKNOWN (לתלויות העברתיות)

---

### 2.6 CI/CD Pipeline — צינור אינטגרציה

**סטטוס:** HIGH / גבוה

**ממצא:**
- לא נמצאה תיקיית `.github/workflows`.
- אין קובצי YAML של GitHub Actions.
- אין `.gitlab-ci.yml`.
- אין `Jenkinsfile`, `azure-pipelines.yml`, `bitbucket-pipelines.yml`.
- אין `Dockerfile` (לבדיקה נוספת).

**השלכות:**
- **אין automated security scanning** — npm audit, Snyk, Dependabot לא רצים.
- **אין secret scanning** — סיכון גבוה לדליפת credentials.
- **אין SBOM generation** — אין מסמך אמין של כל התלויות.
- **אין provenance attestation** — אי אפשר להוכיח מי בנה את הקוד.

**המלצה:** להוסיף `.github/workflows/supply-chain.yml`:
```yaml
name: Supply Chain Security
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm audit --audit-level=high
      - uses: actions/dependency-review-action@v4
```

**חומרה:** HIGH

---

### 2.7 Code Signing של Releases

**סטטוס:** N/A — בתיעוד בלבד

**ממצא:** הפרויקט הוא מערכת פנימית, לא מפורסם כ-npm package. לכן code signing של releases בצורת npm signing אינו רלוונטי ישירות.

**עם זאת:** אם הפרויקט מסופק כ-Docker image, מומלץ לחתום עם `cosign` (Sigstore). אם נבנה כ-executable, לחתום עם Authenticode בחלונות.

**חומרה:** N/A (אבל מומלץ לעתיד)

---

### 2.8 Git Tag Signing — חתימת תגיות

**סטטוס:** MEDIUM / בינוני

**ממצא:**
- לא נמצאה הגדרה של GPG/SSH signing בפרויקט.
- `commit.gpgsign` לא מוגדר ב-`.gitconfig` של הפרויקט.
- `tag.gpgsign` לא מוגדר.

**השלכות:**
- אי אפשר לאמת היסטורית שמיועלת מכל קומיט/תג.
- חשש ל-Git impersonation (כמו התקפת xz utils של 2024).

**המלצה:**
```bash
git config --local commit.gpgsign true
git config --local tag.gpgsign true
git config --local user.signingkey <GPG-KEY-ID>
```
פרסום מפתח ציבורי דרך GitHub ודרוש `Vigilant Mode`.

**חומרה:** MEDIUM

---

### 2.9 Node Binary Verification — אימות Node.js

**סטטוס:** N/A / מידעי

**ממצא:**
- לא נמצא `.nvmrc` – אין pinning של גרסת Node.
- `engines` לא מוגדר ב-package.json.
- סביבת Replit (אם רלוונטית) מטפלת ב-Node auto-provisioning עם חתימות אמינות.

**השלכות:**
- משתמשים שונים יכולים להריץ את הקוד על גרסאות Node שונות, מה שעלול לגרום להתנהגות שונה.
- אין הגנה מפני טעינת Node binary טרויאני בסביבת dev.

**המלצה:**
1. יצירת `.nvmrc` עם `20.11.1` (LTS נקוב).
2. הוספה ל-package.json:
```json
"engines": {
  "node": ">=20.11.1 <21"
}
```

**חומרה:** LOW-MEDIUM

---

### 2.10 SLSA Framework Awareness — מודעות למסגרת SLSA

**סטטוס:** INFO

**הערכת דירוג:**
- **SLSA Level 0** (דה-פקטו) — ללא תיעוד פורמלי, ללא CI/CD, ללא provenance.
- **Level 1** דורש: source tracked, build service, provenance generated. ניתן להשיג בקלות עם GitHub Actions + `slsa-github-generator`.
- **Level 2** דורש: hosted build + signed provenance. ניתן להשיג עם SLSA v1.0 generic generator.
- **Level 3** דורש: non-falsifiable provenance, isolated builds.

**המלצה:** מטרה ריאליסטית קצרת טווח — SLSA Level 1 עם GitHub Actions.

**חומרה:** INFO

---

### 2.11 2FA on npm Publish Account

**סטטוס:** N/A

**ממצא:** הפרויקט אינו מפורסם ב-npm registry (`"private": true` לא מוגדר, אבל גם לא נכחיש שמו מתנגש בצורה מעשית). אין צורך ב-2FA של npm publish.

**המלצה:** הוספת `"private": true` ל-package.json כדי למנוע פרסום בטעות.

**חומרה:** LOW (אך קל ליישום)

---

### 2.12 המלצות נוספות — Sigstore & Dependency Review

**המלצות מערכתיות:**

1. **Sigstore / cosign** — חתימה של artifacts (Docker images, JARs, וכו') עם מפתח ephemeral.
2. **dependency-review-action** — GitHub Action רשמי שבודק באופן אוטומטי שינויי תלויות ב-PRs.
3. **npm audit signatures** — אימות חתימות של חבילות npm (נתמך מ-npm 9.5).
4. **socket.dev / Snyk / Dependabot** — כלים מנוהלים לזיהוי supply chain attacks בזמן אמת.
5. **SBOM (Software Bill of Materials)** — הפקת SBOM אוטומטית עם `syft` או `cyclonedx-npm`.
6. **OSSF Scorecard** — הערכה אוטומטית של פוסטורת אבטחה של הפרויקט.

---

## 3. מטריצת חומרה מסכמת

| # | נושא | חומרה | עדיפות תיקון |
|---|------|-------|---------------|
| 1 | package-lock.json חסר | CRITICAL | מיידי |
| 2 | .npmrc registry pinning חסר | HIGH | גבוהה |
| 3 | CI/CD pipeline חסר | HIGH | גבוהה |
| 4 | חבילות אישיות לא-סקופיות | INFO | נמוכה |
| 5 | Postinstall scripts לא מבוקרים | MEDIUM | בינונית |
| 6 | supply chain attacks ידועות | LOW | מעקב |
| 7 | code signing (Docker) | N/A | מאוחר |
| 8 | Git tag signing חסר | MEDIUM | בינונית |
| 9 | Node version לא ננעל (.nvmrc) | LOW-MEDIUM | בינונית |
| 10 | SLSA Level 0 | INFO | מטרה |
| 11 | 2FA npm publish | N/A | לא רלוונטי |
| 12 | Sigstore / dep-review | RECOMMENDATION | מאוחר |

---

## 4. תוכנית פעולה מוצעת (Action Plan)

### Phase 1 — תיקון מיידי (מיום 0):
1. הרצת `npm install` ו-commit של `package-lock.json`.
2. יצירת `.npmrc` עם pinning מפורש.
3. יצירת `.nvmrc` עם Node LTS.
4. הוספת `"engines"` ו-`"private": true` ל-package.json.

### Phase 2 — שבוע ראשון:
5. הקמת `.github/workflows/supply-chain.yml` עם npm audit + dependency-review.
6. הפעלת Dependabot (dependabot.yml).
7. הפעלת Git commit signing.

### Phase 3 — חודש ראשון:
8. השגת SLSA Level 1 עם provenance generation.
9. יצירת SBOM אוטומטי בכל build.
10. הטמעת Sigstore/cosign לחתימת Docker images (אם רלוונטי).

---

## 5. מקורות ושיטה

- **שיטת הניתוח:** Static analysis בלבד של package.json + filesystem glob.
- **לא נעשתה בדיקה דינמית** של npm registry, audit, או דילוג transitive dependencies.
- **הפניות:**
  - OWASP Dependency Check
  - NIST SSDF (SP 800-218)
  - SLSA Framework v1.0
  - GitHub Advisory Database

---

**סוף דו"ח QA Agent #32 — Supply Chain Security**
