# AG-Y178 — Blue/Green Deployment Orchestrator / מתאם פריסות כחול-ירוק

**Status:** PASS (28/28 tests green)
**Date:** 2026-04-11
**Agent:** Y-178 — Techno-Kol Uzi mega-ERP DevOps pack
**Module:** `onyx-procurement/src/devops/blue-green.js`
**Tests:** `onyx-procurement/test/devops/blue-green.test.js`
**Rule enforced:** לא מוחקים רק משדרגים ומגדלים (never delete — only upgrade and grow)
**Dependencies:** Node.js built-ins only (`node:events`, `node:crypto`) — zero external packages.

---

## 1. Purpose / מטרה

**EN —** A dedicated, stateful blue/green deployment orchestrator for a single ONYX service. Distinct from Y-167 (`rollout-strategies.js`), which plans abstract rollout strategies for any target; Y-178 owns the live blue/green slot pair and enforces the expand-contract database-migration pattern before any atomic traffic cut-over. Its contract is: never tear anything down, always keep the previous slot hot and ready for an instant rollback, and refuse to switch if the DB migrations would break the old slot.

**HE —** מתאם יעודי עם מצב-לקוח לפריסות כחול/ירוק לשירות בודד ב-ONYX. שונה מ-Y-167 (`rollout-strategies.js`) שמייצר תוכניות אסטרטגיית פריסה כלליות; Y-178 מחזיק בצמד החריצים החי (כחול וירוק) של השירות, ואוכף את דפוס ה-expand-contract של מיגרציית ה-DB לפני כל מעבר אטומי של תעבורה. החוזה שלו: לא לפרק כלום, לשמור את החריץ הקודם חם ומוכן למעבר אחורה מיידי, ולסרב להחליף אם מיגרציות ה-DB עלולות לשבור את הצד הישן.

## 2. Public API / ממשק ציבורי

```js
const { BlueGreenDeployer, SLOTS, STATE, PHASES } = require('./blue-green');

const dep = new BlueGreenDeployer({
  initialSlot       : 'blue',          // 'blue' | 'green'
  warmupMs          : 5000,            // injectable sleep for tests
  smokeTimeoutMs    : 30000,
  requiredSmokeTests: ['/health', '/ready', '/api/version'],
  adapter           : infraAdapter,    // mockable
  clock             : () => Date.now(),
  sleep             : (ms) => Promise,
});
```

| Method / מתודה                          | EN                                                               | HE                                                              |
|-----------------------------------------|------------------------------------------------------------------|-----------------------------------------------------------------|
| `activeSlot()`                          | returns the slot currently serving live traffic                  | מחזיר את החריץ שמשרת תעבורה פעילה                               |
| `standbySlot()`                         | returns the idle slot — target of next deploy                    | מחזיר את חריץ ההמתנה — יעד הפריסה הבאה                          |
| `deployToStandby(version)`              | push version to standby (never touches active)                   | פריסת גרסה לחריץ ההמתנה (לא נוגע בפעיל)                         |
| `smokeTests(slot)`                      | run required path probes against slot                            | הרצת בדיקות עשן על החריץ                                         |
| `dbMigrationGuard(bundle)`              | block switch if CONTRACT verbs present                           | חסימת המעבר אם קיימות פקודות הרסניות                            |
| `warmup(ms?)`                           | warmup window on standby before switch                           | חלון חימום על חריץ ההמתנה לפני המעבר                            |
| `cachePreheat(keys)`                    | preheat standby cache with given keys                            | חימום מטמון חריץ ההמתנה                                          |
| `switchTraffic(opts)`                   | atomic cut-over; requires all preconditions                      | מעבר אטומי — דורש שכל התנאים התקיימו                            |
| `rollback()`                            | reverse the last switch (old slot restored)                      | החזרה לאחור — החריץ הקודם משוחזר                                |
| `runFullCycle(opts)`                    | convenience: deploy → smoke → guard → warmup → preheat → switch  | עוטף: פריסה → עשן → שומר → חימום → מטמון → מעבר                 |
| `auditTrail()`                          | append-only bilingual audit entries (immutable copy)             | יומן ביקורת דו-לשוני, append-only (עותק בלתי-משתנה)              |
| `lastGuardDecision()` / `lastSmokeResult()` | last guard / smoke result for the current cycle             | תוצאת שומר / עשן האחרונה של מחזור הפריסה הנוכחי                |

### States / מצבים

`IDLE → DEPLOYING → SMOKE_TESTING → GUARDING → WARMING → PREHEATING → READY_TO_SWITCH → SWITCHING → SWITCHED` (happy path)

Error branches: `BLOCKED` (guard refused), `FAILED` (fatal), `ROLLING_BACK → ROLLED_BACK` (reverse).

## 3. Expand-Contract Migration Guard / שומר מיגרציה expand-contract

The guard classifies every SQL statement in the submitted bundle into one of three phases:

| Phase       | EN                                                        | HE                                                           |
|-------------|-----------------------------------------------------------|--------------------------------------------------------------|
| `EXPAND`    | additive only — safe to apply before switching            | הרחבה בלבד — בטוח להפעיל לפני המעבר                          |
| `MIGRATE`   | data changes, no schema destruction — generally safe      | שינויי נתונים, ללא הריסת סכמה — בדרך כלל בטוח                |
| `CONTRACT`  | destructive — **blocks the switch**                       | הרסני — **חוסם את המעבר**                                    |

### Classification rules

**EXPAND verbs (allowed pre-switch):**
`CREATE TABLE`, `CREATE INDEX`, `CREATE VIEW`, `CREATE MATERIALIZED VIEW`, `ADD COLUMN`, `ADD CONSTRAINT`, `ALTER TABLE ADD`, `ALTER TABLE VALIDATE`

**CONTRACT verbs (block switch):**
`DROP COLUMN`, `DROP TABLE`, `DROP INDEX`, `DROP VIEW`, `DROP MATERIALIZED VIEW`, `DROP CONSTRAINT`, `RENAME COLUMN`, `RENAME TABLE`, `ALTER TYPE`, `TRUNCATE`, and the regex pattern `ALTER COLUMN ... TYPE` (catches PostgreSQL's interleaved syntax).

**Hardening —** The scanner also refuses to honor a caller-supplied `phase: 'expand'` label when the statement text contains a destructive verb. The guard emits a warning in `warnings[]` and still counts it as CONTRACT. This prevents footguns like `DROP TABLE legacy` being mis-tagged.

## 4. Never-Delete Guarantee / הבטחת אי-מחיקה

**EN —** After a successful `switchTraffic()`, the previous slot is not torn down. Its `_previousActive`, `_previousActiveVersion` and the adapter's `deployed[slot]` remain populated so that `rollback()` is a pure traffic-shift — no redeploy required. The `_audit[]` log is append-only. `auditTrail()` returns a shallow copy so external mutation is harmless.

**HE —** לאחר `switchTraffic()` מוצלח, החריץ הקודם לא מפורק. ה-`_previousActive`, ה-`_previousActiveVersion` והמצב ב-`adapter.deployed[slot]` נשמרים, כך ש-`rollback()` הוא רק הסטה של תעבורה — אין צורך לפרוס מחדש. יומן `_audit[]` הוא append-only. `auditTrail()` מחזיר עותק רדוד, כך שמוטציות חיצוניות לא פוגעות במצב הפנימי.

## 5. Test Matrix / מטריצת בדיקות

Runner: `node:test` (built-in). Command: `node --test test/devops/blue-green.test.js`.
**Result: 28 passed / 0 failed.**

| #  | Name                                                                              | Area               |
|----|-----------------------------------------------------------------------------------|--------------------|
| 1  | default initial is blue/green                                                     | state              |
| 2  | initialSlot=green flips defaults                                                  | state              |
| 3  | oppositeSlot / validateSlot helpers                                               | helpers            |
| 4  | deployToStandby writes to standby, not active                                     | deploy             |
| 5  | deployToStandby rejects empty + surfaces adapter errors                           | deploy             |
| 6  | smokeTests pass when healthProbe returns true                                     | smoke              |
| 7  | smokeTests fail when any path fails                                               | smoke              |
| 8  | guard — EXPAND-only bundle passes                                                 | DB guard           |
| 9  | guard — DROP COLUMN blocks → BLOCKED state                                        | DB guard           |
| 10 | guard — rename / type-change / truncate all blocked                               | DB guard           |
| 11 | guard — caller cannot relabel destructive as expand                               | DB guard (hard.)   |
| 12 | guard — invalid bundle rejected                                                   | DB guard           |
| 13 | scanStatement classifier sanity                                                   | classifier         |
| 14 | warmup uses injectable sleep with configured ms                                   | warmup             |
| 15 | warmup override argument                                                          | warmup             |
| 16 | cachePreheat feeds standby only                                                   | preheat            |
| 17 | cachePreheat counts partial failures                                              | preheat            |
| 18 | cachePreheat rejects non-array                                                    | preheat            |
| 19 | switchTraffic blocks when preconditions unmet                                     | switch             |
| 20 | switchTraffic atomically swaps on happy path                                      | switch             |
| 21 | switchTraffic refuses from BLOCKED                                                | switch             |
| 22 | rollback restores previous slot + version                                         | rollback           |
| 23 | rollback with no prior switch rejected                                            | rollback           |
| 24 | audit trail bilingual for every phase                                             | audit              |
| 25 | audit trail append-only (copy cannot mutate state)                                | audit              |
| 26 | runFullCycle happy path                                                           | integration        |
| 27 | never-delete — rollback metadata intact                                           | never-delete       |
| 28 | emits state + audit events for observability                                      | events             |

## 6. Edge Cases Covered / מקרי קצה שנוסו

- **EN —** Adapter deploy error surfaces as FAILED; guard refuses caller-label override; smoke test timeout vs health-probe refusal; cachePreheat partial failures; switchTraffic preconditions in every order; rollback before any switch; audit trail immutability; BLOCKED → switch refusal; runFullCycle short-circuits on smoke-fail / guard-block.
- **HE —** שגיאת פריסה מהמתאם עוברת ל-FAILED; השומר דוחה ניסיון תיוג-שגוי מהמתקשר; תפוגת זמן בדיקת עשן מול סירוב של בדיקת בריאות; כשלים חלקיים בחימום המטמון; תנאי-קדם של המעבר בכל סדר; ניסיון rollback לפני מעבר; יומן הביקורת בלתי-משתנה; סירוב מעבר ממצב BLOCKED; קיצור של המחזור השלם בכשל עשן / חסימת שומר.

## 7. Interop with Y-167 / חיבוריות עם Y-167

**EN —** Y-167's rollout-strategies engine plans any strategy (including blue-green) for many services at once. Y-178 is the runtime executor for a single service's blue/green pair, and can be invoked from inside a Y-167 BLUE_GREEN step. Y-167 is stateless planning; Y-178 holds state between calls and owns the atomic swap.

**HE —** מנוע אסטרטגיות הפריסה של Y-167 מייצר תוכניות לכל אסטרטגיה (כולל blue-green) עבור מספר שירותים בו-זמנית. Y-178 הוא המבצע-בזמן-ריצה עבור צמד החריצים של שירות בודד, וניתן להפעיל אותו מתוך שלב BLUE_GREEN של Y-167. Y-167 הוא חסר-מצב; Y-178 שומר מצב בין קריאות ובעל המעבר האטומי.

## 8. How to Run / איך להריץ

```bash
# from onyx-procurement/
node --test test/devops/blue-green.test.js
```

Expected output: `tests 28 / pass 28 / fail 0`.

## 9. Files / קבצים

- `onyx-procurement/src/devops/blue-green.js` — module (≈560 LOC)
- `onyx-procurement/test/devops/blue-green.test.js` — 28 tests, node:test
- `_qa-reports/AG-Y178-blue-green.md` — this report

## 10. Sign-off / חתימה

**EN —** Built to spec: dedicated blue/green coordinator with expand-contract DB guard, warmup, cache preheat, bilingual append-only audit trail, and 28 passing node:test cases. No dependencies beyond Node.js built-ins. Never-delete principle enforced throughout.

**HE —** נבנה לפי המפרט: מתאם כחול/ירוק יעודי עם שומר מיגרציית DB בדפוס expand-contract, חלון חימום, חימום מטמון, יומן ביקורת דו-לשוני מסוג append-only, ו-28 בדיקות עוברות ב-node:test. ללא תלויות מעבר ל-Node.js built-ins. עיקרון אי-המחיקה נאכף לכל אורך הקוד.
