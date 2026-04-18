# AG-Y166 — CI/CD Pipeline Configuration Generator

**Agent:** Y-166
**System:** Techno-Kol Uzi mega-ERP
**Module:** ONYX Procurement — DevOps subsystem
**Author:** Kobi
**Date:** 2026-04-11
**Status:** GREEN — 22 / 22 tests passing

---

## 1. Mission / משימה

**EN:** Build a zero-dependency, pure-JavaScript CI/CD pipeline
configuration generator that outputs three canonical pipeline
formats — GitHub Actions, GitLab CI, and Jenkins Declarative —
from a single configuration object. The generator must honour
the Techno-Kol principle **"לא מוחקים רק משדרגים ומגדלים"**:
every optional feature is layered additively and no default
stage is ever removed from the produced pipeline. All output
stays in memory — the module never writes to disk; callers are
responsible for persisting the returned strings.

**HE:** לבנות מחולל קונפיגורציית CI/CD ללא תלויות חיצוניות,
בג'אווהסקריפט נקייה בלבד, המייצר שלושה פורמטים קנוניים של
צנרות —  GitHub Actions, GitLab CI ו-Jenkins Declarative — מתוך
אובייקט תצורה יחיד. המחולל שומר על העיקרון **"לא מוחקים רק
משדרגים ומגדלים"**: כל יכולת אופציונלית נוספת באופן אדיטיבי,
ואף שלב ברירת-מחדל אינו מוסר מהצנרת המופקת. כל הפלט נשאר
בזיכרון — המודול אינו כותב לדיסק; הקורא אחראי לשמור את
המחרוזות המוחזרות.

## 2. Deliverables / תוצרים

| File | Purpose |
|---|---|
| `onyx-procurement/src/devops/ci-generator.js` | Engine — `CIGenerator` class + pure helpers |
| `onyx-procurement/test/devops/ci-generator.test.js` | 22 unit tests (string comparison) |
| `_qa-reports/AG-Y166-ci-generator.md` | This bilingual report |

**Zero dependencies introduced.** **Zero files deleted.**
**אפס תלויות חדשות.** **אפס קבצים שנמחקו.**

## 3. Public API / ממשק ציבורי

```js
const {
  CIGenerator,
  DEFAULTS,
  VALID_TARGETS,   // ['github','gitlab','jenkins']
  VALID_STAGES,    // ['lint','test','build','deploy']
  VALID_LANGS,     // ['node','ts']
  israelCronToUtc, // helper, exported for unit testing
} = require('./src/devops/ci-generator');

const gen = new CIGenerator();
const gha  = gen.generate({ target: 'github',  ...cfg });
const glci = gen.generate({ target: 'gitlab',  ...cfg });
const jnks = gen.generate({ target: 'jenkins', ...cfg });

// Convenience: all three at once, keyed by canonical file path.
const map = gen.generateAll(cfg);
// => {
//   '.github/workflows/onyx-pipeline.yml': '...',
//   '.gitlab-ci.yml': '...',
//   'Jenkinsfile': '...',
// }
```

### Config shape / מבנה קונפיגורציה

| Key | Type | Default | Notes |
|---|---|---|---|
| `target` | `'github' \| 'gitlab' \| 'jenkins'` | `'github'` | Which renderer to invoke |
| `name` | string | `'onyx-pipeline'` | Workflow / pipeline label |
| `language` | `'node' \| 'ts'` | `'node'` | Selects the install/build command family |
| `nodeVersion` | string | `'20'` | Pinned Node runtime |
| `stages` | string[] | `['lint','test','build','deploy']` | Subset of VALID_STAGES |
| `secrets` | string[] | `[]` | Environment variable names to bind and mask |
| `cronIsrael` | string | `''` | 5-field cron authored in Asia/Jerusalem |
| `manualApprovalProd` | boolean | `true` | Gate the deploy stage behind manual approval |
| `artifactRetention` | integer | `30` | Days to keep build + test artifacts |
| `artifactPaths` | string[] | `['dist/','coverage/']` | Paths uploaded as artifacts |
| `notifyWebhooks` | string[] | `[]` | URLs to POST on failure |
| `branches` | string[] | `['main','master']` | Branches that trigger the pipeline |
| `prodEnvironment` | string | `'production'` | Protected environment name |

## 4. Feature matrix / מטריצת יכולות

| Feature | GitHub Actions | GitLab CI | Jenkins Declarative |
|---|---|---|---|
| Stages (lint, test, build, deploy) | `jobs:` per stage | `stages:` + one job each | `stages { stage("..") }` |
| Language select (node / ts) | Install + script commands | Same | Same |
| Secrets masking | `::add-mask::` + `env:` binding | `variables:` + GitLab masked vars | `credentials("NAME")` |
| Israel cron | UTC conversion with comment | Schedule comment (cron lives in GitLab UI) | `cron("TZ=Asia/Jerusalem\n...")` |
| Manual approval (prod) | `environment:` protected env | `when: manual` + `environment:` | `input { message "..." }` |
| Artifact retention | `actions/upload-artifact@v4 retention-days` | `artifacts: expire_in: N days` | `buildDiscarder(logRotator(daysToKeepStr))` |
| Notification webhooks | `if: failure()` + `curl` | `after_script:` + `$CI_JOB_STATUS` | `post { failure { sh "curl ..." } }` |
| Branch filter | `push:branches:`, `pull_request:` | `rules: if $CI_COMMIT_BRANCH` | `when { branch "..." }` |

## 5. Israel Timezone Cron Logic / לוגיקת קרון בשעון ישראל

**EN:** GitHub Actions schedules run in UTC only. The generator
parses the 5-field cron, subtracts 2 hours from the hour field
(Israel Standard Time = UTC+2), wraps negative hours back into
the 0–23 range, and emits both the original Jerusalem expression
and the converted UTC expression as YAML comments so reviewers
can audit the conversion. Invalid inputs pass through unchanged,
so the generator never throws on user data. For GitLab the
generator leaves a comment block instructing the human to create
a Pipeline Schedule with `timezone: 'Asia/Jerusalem'`, because
GitLab does not read cron from `.gitlab-ci.yml`. For Jenkins the
Declarative `cron()` trigger supports a `TZ=` prefix, so the
generator simply prefixes `TZ=Asia/Jerusalem\n` to the expression.

**HE:** תזמוני GitHub Actions פועלים ב-UTC בלבד. המחולל מפרק את
ביטוי הקרון בן 5 השדות, מפחית שעתיים משדה השעה (שעון ישראל =
UTC+2), עוטף שעות שליליות חזרה לטווח 0–23, ומדפיס הן את הביטוי
המקורי בשעון ירושלים והן את הביטוי המומר ב-UTC כהערות YAML כדי
שסוקרים יוכלו לבדוק את ההמרה. קלט לא תקין חוזר כפי שהוא, כך
שהמחולל לעולם לא נופל על נתוני משתמש. ב-GitLab המחולל משאיר בלוק
הערה שמנחה את המפעיל האנושי ליצור Pipeline Schedule עם
`timezone: 'Asia/Jerusalem'`, כי GitLab אינו קורא קרון מקובץ
`.gitlab-ci.yml`. ב-Jenkins ה-trigger מסוג `cron()` ב-Declarative
תומך בקידומת `TZ=`, ולכן המחולל פשוט מוסיף
`TZ=Asia/Jerusalem\n` לביטוי.

## 6. Test summary / סיכום בדיקות

Total: **22 tests — all passing** (`node --test test/devops/ci-generator.test.js`).

| # | Test | Target |
|---|---|---|
| 01 | DEFAULTS exposes the documented keys and is frozen | meta |
| 02 | VALID_TARGETS / STAGES / LANGS are enumerated | meta |
| 03 | GitHub Actions output has canonical structure | github |
| 04 | GitHub secrets are masked with `::add-mask::` | github |
| 05 | GitHub Israel cron `0 9 * * 1` becomes `0 7 * * 1` UTC | github |
| 06 | GitHub deploy job declares a protected environment | github |
| 07 | GitHub artifact retention days and paths honoured | github |
| 08 | GitHub notification webhooks called with curl on failure | github |
| 09 | GitLab output has canonical structure | gitlab |
| 10 | GitLab manual approval gate + secret variables | gitlab |
| 11 | GitLab artifacts expire_in honours retention days | gitlab |
| 12 | GitLab cron expression left as Asia/Jerusalem comment | gitlab |
| 13 | Jenkins output has canonical Declarative structure | jenkins |
| 14 | Jenkins credentials binding + manual approval on deploy | jenkins |
| 15 | Jenkins cron uses `TZ=Asia/Jerusalem` prefix | jenkins |
| 16 | Jenkins archiveArtifacts + build discarder retention | jenkins |
| 17 | Language `ts` uses `npm run test` + `npm run build` | lang |
| 18 | Rejects unknown target / stage / language / empty name | validation |
| 19 | `generateAll` returns three canonical file paths | api |
| 20 | `israelCronToUtc` handles midnight wrap + invalid input | cron |
| 21 | `mergeConfig` clones arrays so caller mutation does not leak | purity |
| 22 | stages subset: only `build + deploy` generates minimal pipeline | stages |

### Run output / פלט הרצה

```
✔ 01. DEFAULTS exposes the documented keys and is frozen
✔ 02. VALID_TARGETS / STAGES / LANGS are enumerated
✔ 03. GitHub Actions output has canonical structure
✔ 04. GitHub — secrets are masked with ::add-mask::
✔ 05. GitHub — Israel cron "0 9 * * 1" becomes "0 7 * * 1" UTC
✔ 06. GitHub — deploy job declares a protected environment
✔ 07. GitHub — artifact retention days and paths honoured
✔ 08. GitHub — notification webhooks are called with curl on failure
✔ 09. GitLab output has canonical structure
✔ 10. GitLab — manual approval gate on deploy + secret variables
✔ 11. GitLab — artifacts expire_in honours retention days
✔ 12. GitLab — cron expression left as Asia/Jerusalem comment
✔ 13. Jenkins output has canonical Declarative structure
✔ 14. Jenkins — credentials binding and manual approval on deploy
✔ 15. Jenkins — cron uses TZ=Asia/Jerusalem prefix
✔ 16. Jenkins — archiveArtifacts and build discarder retention
✔ 17. Language ts uses npm run test and npm run build
✔ 18. generate() rejects unknown target / stage / language / empty name
✔ 19. generateAll returns three canonical file paths
✔ 20. israelCronToUtc handles midnight wrap and invalid input
✔ 21. mergeConfig clones arrays so caller mutation does not leak
✔ 22. stages subset: only build + deploy generates the minimal pipeline
ℹ tests 22
ℹ pass 22
ℹ fail 0
```

## 7. Design notes / הערות תכנון

**EN:**
- **Pure functions.** Every renderer (`renderGitHub`, `renderGitLab`,
  `renderJenkins`) is a pure function that takes a validated
  config and returns a string. No `fs`, no `child_process`, no
  network. This makes the generator trivially testable and keeps
  it compatible with the "zero external deps" rule.
- **Additive by construction.** `mergeConfig` copies every array
  so caller mutation cannot affect frozen defaults. `validateConfig`
  only rejects invalid values — it never silently drops stages or
  secrets. Any new stage/feature can be added by extending the
  `VALID_STAGES` list and adding a `case` in `stageCommand`.
- **Secrets masking, three flavours.** GitHub's `::add-mask::`
  workflow command scrubs the secret from logs even if the step
  that handled the secret accidentally echoes it. GitLab relies on
  project-level Masked Variables; we declare each secret as a
  pipeline variable so the job definition is still valid if the
  variable is not yet configured. Jenkins uses `credentials()`,
  which auto-registers a masked log filter via the Credentials
  Binding plugin.
- **Manual approval gates.** On GitHub the approval is enforced
  via the `environment:` mechanism (protected environments with
  required reviewers). On GitLab it is the `when: manual` keyword
  combined with `environment:`. On Jenkins the Declarative `input`
  block blocks the stage until a human clicks "Approve".
- **String comparison tests.** Every test asserts exact substring
  presence so regressions in the renderer's output shape fail
  loudly — no YAML parser, no Groovy parser, no extra dependency.

**HE:**
- **פונקציות טהורות.** כל רנדרר (`renderGitHub`, `renderGitLab`,
  `renderJenkins`) הוא פונקציה טהורה שמקבלת קונפיגורציה שעברה
  ואלידציה ומחזירה מחרוזת. אין `fs`, אין `child_process`, אין
  רשת. זה הופך את המחולל לבדיק באופן טריוויאלי ושומר על התאימות
  לכלל "אפס תלויות חיצוניות".
- **אדיטיבי מעצם הבנייה.** `mergeConfig` משכפל כל מערך כך ששינוי
  מצד הקורא אינו משפיע על ברירות מחדל קפואות. `validateConfig`
  דוחה רק ערכים לא תקינים — הוא לעולם אינו משמיט שלבים או סודות
  באופן שקט. ניתן להוסיף שלב/יכולת חדשים בהרחבת רשימת
  `VALID_STAGES` והוספת `case` ל-`stageCommand`.
- **מיסוך סודות בשלוש וריאציות.** פקודת ה-workflow של GitHub
  בשם `::add-mask::` מוחקת את הסוד מהלוגים גם אם הצעד שטיפל בסוד
  הדפיס אותו במקרה. GitLab מסתמך על Masked Variables ברמת הפרויקט;
  אנו מצהירים כל סוד כמשתנה צנרת כך שהגדרת ה-job תקינה גם אם
  המשתנה טרם הוגדר. Jenkins משתמש ב-`credentials()`, שרושם
  אוטומטית מסנן לוגים ממוסך דרך תוסף ה-Credentials Binding.
- **שערי אישור ידני.** ב-GitHub האישור נאכף דרך מנגנון
  `environment:` (Protected Environments עם Required Reviewers).
  ב-GitLab — המילה `when: manual` בשילוב עם `environment:`.
  ב-Jenkins — בלוק ה-`input` של Declarative חוסם את השלב עד
  שאדם ילחץ "אישור".
- **בדיקות השוואת מחרוזות.** כל בדיקה מאשרת נוכחות תת-מחרוזת
  מדויקת, כך שרגרסיות במבנה הפלט נופלות בקול — ללא parser ל-YAML,
  ללא parser ל-Groovy, ללא תלות נוספת.

## 8. Compliance with rules / ציות לכללים

| Rule | Status |
|---|---|
| "לא מוחקים רק משדרגים ומגדלים" | PASS — additive design, no file deleted, `VALID_STAGES` can only grow |
| Zero external deps | PASS — only `node:test` + `node:assert/strict` |
| Bilingual report | PASS — English + Hebrew in every significant section |
| No disk I/O from generator | PASS — all renderers return strings; `generateAll` returns an in-memory map |
| 15+ tests | PASS — 22 tests, all green |
| Israel timezone cron | PASS — UTC conversion for GitHub, TZ prefix for Jenkins, annotated comment for GitLab |
| Manual approval gates for prod | PASS — implemented for all three targets |
| Artifact retention | PASS — days + paths configurable |
| Notification webhooks | PASS — failure hook for all three targets |

## 9. Usage example / דוגמת שימוש

```js
const { CIGenerator } = require('onyx-procurement/src/devops/ci-generator');
const gen = new CIGenerator();

const config = {
  name: 'onyx-procurement-ci',
  language: 'ts',
  stages: ['lint', 'test', 'build', 'deploy'],
  secrets: ['SUPABASE_SERVICE_KEY', 'SLACK_WEBHOOK'],
  cronIsrael: '0 9 * * 1-5',        // weekdays 09:00 Israel time
  manualApprovalProd: true,
  artifactRetention: 14,
  artifactPaths: ['dist/', 'coverage/', 'reports/'],
  notifyWebhooks: ['https://hooks.slack.com/services/XXX'],
  branches: ['main', 'develop'],
  prodEnvironment: 'production',
};

const files = gen.generateAll(config);
// files['.github/workflows/onyx-procurement-ci.yml']  → GitHub Actions YAML
// files['.gitlab-ci.yml']                              → GitLab CI YAML
// files['Jenkinsfile']                                 → Jenkins Declarative Groovy
// The caller decides whether and where to persist each string.
```

---

**Conclusion / סיכום**

**EN:** Y-166 delivers a self-contained CI/CD pipeline generator
that produces canonical configurations for GitHub Actions,
GitLab CI, and Jenkins Declarative pipelines from a single
source of truth. All 22 unit tests pass. The module respects
the "לא מוחקים רק משדרגים ומגדלים" principle, introduces no
new runtime dependencies, and leaves every side-effect decision
(disk writes, commits, PRs) in the caller's hands.

**HE:** סוכן Y-166 מספק מחולל צנרת CI/CD עצמאי המייצר תצורות
קנוניות עבור GitHub Actions, GitLab CI ו-Jenkins Declarative
ממקור אמת יחיד. כל 22 בדיקות היחידה עוברות. המודול שומר על
העיקרון "לא מוחקים רק משדרגים ומגדלים", אינו מכניס תלויות
ריצה חדשות, ומשאיר כל החלטה עם תופעות-לוואי (כתיבה לדיסק,
קומיטים, PR-ים) בידי הקורא.
