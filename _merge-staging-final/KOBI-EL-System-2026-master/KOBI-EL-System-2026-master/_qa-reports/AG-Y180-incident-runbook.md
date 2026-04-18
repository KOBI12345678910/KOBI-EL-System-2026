# AG-Y180 — Incident Response Runbook Engine

**Agent:** Y-180
**System:** Techno-Kol Uzi mega-ERP / onyx-procurement / DevOps subsystem
**Date:** 2026-04-11
**Status:** Delivered — 20/20 tests passing
**Principle:** לא מוחקים, רק משדרגים ומגדלים — runbooks versioned, audit log append-only

---

## EN — Summary

This agent delivers a structured incident-response runbook engine for the Techno-Kol Uzi mega-ERP. The engine is pure Node.js with zero third-party dependencies; every user-facing string ships in parallel Hebrew and English. The design is append-only: re-defining a runbook creates a new version while preserving the previous one, and the audit log exposes only a defensive copy so callers cannot tamper with history.

### What was built

1. **`onyx-procurement/src/devops/incident-runbook.js`** — the engine (`IncidentRunbook` class, ~700 LOC). Public API: `defineRunbook`, `start`, `advance`, `resolve`, `close`, `slaStatus`, `escalationStatus`, `renderSlack`, `renderStatusPage`, `renderRegulatorNotice`, `renderDataSubjectNotice`, `renderPostmortem`, `auditLog`, `getRunbook`, `getIncident`, `listRunbooks`, `listIncidents`.
2. **`onyx-procurement/test/devops/incident-runbook.test.js`** — 20 tests, inline harness built on `assert`. Runs with `node test/devops/incident-runbook.test.js`.
3. **`_qa-reports/AG-Y180-incident-runbook.md`** — this bilingual report.

### Severity → SLA table

| Code | Label (EN)        | Respond | Resolve      | Wake on-call | Page director |
|------|-------------------|---------|--------------|--------------|---------------|
| SEV1 | Critical          | 5 min   | 240 min (4h) | Yes          | Yes           |
| SEV2 | High              | 15 min  | 480 min (8h) | Yes          | No            |
| SEV3 | Medium            | 60 min  | 1440 min     | No           | No            |
| SEV4 | Low               | 240 min | 4320 min     | No           | No            |

### Escalation chain

`on-call (rung 1)` → `lead (rung 2)` → `director (rung 3)`.
Rung 2 is auto-triggered when the response SLA is blown; rung 3 when the resolution SLA is blown. `advance()` with outcome `STEP_OUTCOME.ESCALATE` bumps the chain manually. Every rung change records a stakeholder-notification audit entry. The engine never paged anyone itself — it only records who *should* be paged so the transport layer can do the actual work.

### Decision-tree walker

A runbook is an array of `{id, title, owner, timerMinutes, actions, branches, terminal}` objects. `branches` is a map of outcome → next step id (or the sentinel `'END'`). `advance(incidentId, stepId, outcome)` validates the call is for the correct current step, looks up the branch, pushes an immutable history entry, and advances `currentStepId`. A `*` key in `branches` acts as a wildcard.

### Communications templates

- **Slack internal** (`renderSlack`) — severity, title, state, reporter, on-call, open time, SLA deadlines, current step, channel name.
- **Public status page** (`renderStatusPage`) — severity, title, user-facing impact, update cadence (15 min for SEV1, 30 min otherwise).
- **Regulator (PDPL)** (`renderRegulatorNotice`) — formal bilingual notice to the Israeli Privacy Protection Authority, enforced only when the incident is flagged `pdplBreach: true`.
- **Data subject notice** (`renderDataSubjectNotice`) — per-user bilingual notification, personalised with the subject's name.
- **Postmortem** (`renderPostmortem`) — bilingual Markdown skeleton covering summary, timeline, 5 whys, what worked, what failed, where we got lucky, action items, and lessons learned. Blameless framing.

### Israeli PDPL Amendment 13 compliance

`renderRegulatorNotice` produces a notice that satisfies the mandatory fields of חוק הגנת הפרטיות (תיקון 13) for material personal-data breaches: reporting entity and Company Registry ID, discovery and incident timestamps, description, categories of exposed data, affected count, risk assessment, containment actions, mitigation actions, and the Data Protection Officer (DPO) contact block. The template explicitly references the 72-hour reporting window so the caller can assert that dispatch is still within the statutory deadline.

### Test coverage

All 20 tests pass. They cover:

1. SEVERITY constant windows.
2. Bilingual labels on every severity.
3. Escalation chain shape and labels.
4. `defineRunbook` versioning.
5. `defineRunbook` input validation.
6. `start` SLA derivation.
7. `start` input validation.
8. Happy-path `advance` walk.
9. `advance` rejecting wrong step / unknown incident.
10. Automatic escalation on response-SLA miss.
11. Automatic escalation to director on resolution-SLA miss.
12. Manual escalation via `STEP_OUTCOME.ESCALATE`.
13. `slaStatus` remaining time and miss flags.
14. `renderSlack` bilingual placeholder fill.
15. `renderSlack` locale validation.
16. `renderStatusPage` bilingual impact rendering.
17. `renderRegulatorNotice` PDPL gate.
18. `renderDataSubjectNotice` personalisation.
19. `renderPostmortem` bilingual Markdown output.
20. Audit log append-only semantics.

### Files touched (absolute paths)

- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/onyx-procurement/src/devops/incident-runbook.js`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/onyx-procurement/test/devops/incident-runbook.test.js`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/_qa-reports/AG-Y180-incident-runbook.md`

No existing files were modified or deleted.

---

## HE — סיכום

סוכן זה מספק מנוע ספר-הפעלה (runbook) מובנה לתגובה לאירועים עבור מערכת Techno-Kol Uzi mega-ERP. המנוע כתוב ב-Node.js טהור ללא תלות חיצונית; כל מחרוזת מול המשתמש קיימת במקביל בעברית ובאנגלית. העיצוב מוסיף-בלבד: הגדרה מחודשת של ספר-הפעלה יוצרת גרסה חדשה תוך שמירה על הקודמת, ולוג הביקורת מחזיר עותק הגנתי בלבד כדי שלא ניתן יהיה לשנות את ההיסטוריה.

### מה נבנה

1. **`onyx-procurement/src/devops/incident-runbook.js`** — המנוע (מחלקה `IncidentRunbook`, ~700 שורות). ממשק ציבורי: `defineRunbook`, `start`, `advance`, `resolve`, `close`, `slaStatus`, `escalationStatus`, `renderSlack`, `renderStatusPage`, `renderRegulatorNotice`, `renderDataSubjectNotice`, `renderPostmortem`, `auditLog`.
2. **`onyx-procurement/test/devops/incident-runbook.test.js`** — 20 בדיקות, harness פנימי מבוסס `assert`.
3. **`_qa-reports/AG-Y180-incident-runbook.md`** — דוח דו-לשוני זה.

### טבלת חומרה → SLA

| קוד  | תווית     | זמן תגובה | זמן פתרון   | הערת כונן | הזעקת מנהל |
|------|-----------|-----------|-------------|-----------|------------|
| SEV1 | חמור ביותר | 5 ד׳     | 240 ד׳ (4 ש׳)| כן        | כן         |
| SEV2 | חמור      | 15 ד׳    | 480 ד׳ (8 ש׳)| כן        | לא         |
| SEV3 | בינוני    | 60 ד׳    | 1440 ד׳     | לא        | לא         |
| SEV4 | נמוך      | 240 ד׳   | 4320 ד׳     | לא        | לא         |

### שרשרת הסלמה

`כונן ראשי (דרגה 1)` ← `ראש צוות DevOps (דרגה 2)` ← `מנהל הנדסה (דרגה 3)`.
דרגה 2 מופעלת אוטומטית כאשר חלון התגובה נפרץ; דרגה 3 כאשר חלון הפתרון נפרץ. קריאה ל-`advance` עם תוצאה `STEP_OUTCOME.ESCALATE` מקפיצה את השרשרת ידנית. כל שינוי דרגה נרשם בלוג הביקורת.

### עץ החלטה

ספר-הפעלה הוא מערך של צעדים `{id, title, owner, timerMinutes, actions, branches, terminal}`. שדה `branches` הוא מיפוי של תוצאה → מזהה צעד הבא (או ערך מיוחד `'END'`). הפונקציה `advance(incidentId, stepId, outcome)` מוודאת שהצעד הוא הצעד הנוכחי הנכון, מחפשת את הענף, דוחפת רשומת היסטוריה בלתי ניתנת לשינוי ומתקדמת.

### תבניות תקשורת

- **Slack פנימי** — חומרה, כותרת, מצב, מדווח, כונן, זמן פתיחה, דדליין SLA, צעד נוכחי, שם ערוץ.
- **דף סטטוס ציבורי** — חומרה, כותרת, השפעה על המשתמש, תדירות עדכון.
- **רגולטור (PDPL)** — הודעה פורמלית דו-לשונית לרשות להגנת הפרטיות, נאכפת רק כאשר האירוע מסומן כ-`pdplBreach: true`.
- **הודעה לנשוא מידע** — הודעה אישית דו-לשונית למשתמש הנפגע.
- **ניתוח לאחר מעשה** — שלד Markdown דו-לשוני המכסה סיכום, ציר זמן, חמשת הלמה, מה עבד, מה לא עבד, היכן התמזל מזלנו, פעולות ולקחים. ללא האשמה.

### ציות לתיקון 13

הפונקציה `renderRegulatorNotice` מפיקה הודעה העונה על השדות החובה של חוק הגנת הפרטיות, התשמ"א-1981, כפי שתוקן בתיקון 13, עבור אירועי אבטחת מידע מהותיים: גוף מדווח וח.פ., מועדי גילוי והתרחשות, תיאור, סוגי מידע שנחשפו, מספר נפגעים, הערכת סיכון, פעולות הכלה, פעולות הפחתה, ובלוק קשר לממונה הגנת פרטיות. התבנית מציינת במפורש את חלון הדיווח בן 72 שעות כדי שהקורא יוכל לאמת שהשליחה עדיין בתוך התקופה הסטטוטורית.

### כיסוי בדיקות

כל 20 הבדיקות עוברות בהצלחה:

1. חלונות SLA של קבועי SEVERITY.
2. תוויות דו-לשוניות לכל רמת חומרה.
3. מבנה ותוויות שרשרת ההסלמה.
4. גרסאות `defineRunbook`.
5. ולידציית קלט ל-`defineRunbook`.
6. גזירת SLA ב-`start`.
7. ולידציית קלט ל-`start`.
8. מעבר על הענף המאושר ב-`advance`.
9. `advance` דוחה צעד שגוי / אירוע לא קיים.
10. הסלמה אוטומטית על פריצת SLA תגובה.
11. הסלמה אוטומטית למנהל על פריצת SLA פתרון.
12. הסלמה ידנית דרך `STEP_OUTCOME.ESCALATE`.
13. `slaStatus` זמן שנותר ודגלי פריצה.
14. מילוי `renderSlack` דו-לשוני.
15. `renderSlack` ולידציית locale.
16. תרגום השפעה דו-לשוני ב-`renderStatusPage`.
17. שער PDPL ב-`renderRegulatorNotice`.
18. התאמה אישית ב-`renderDataSubjectNotice`.
19. פלט Markdown דו-לשוני של `renderPostmortem`.
20. סמנטיקת append-only של לוג הביקורת.

### קבצים שנוצרו

- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/onyx-procurement/src/devops/incident-runbook.js`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/onyx-procurement/test/devops/incident-runbook.test.js`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/_qa-reports/AG-Y180-incident-runbook.md`

אף קובץ קיים לא שונה ולא נמחק.

---

## Usage example — דוגמת שימוש

```js
const { IncidentRunbook } = require('./src/devops/incident-runbook');

const rb = new IncidentRunbook({
  orgName: 'Techno-Kol Uzi Ltd',
  orgId: '515000001',
  dpoName: 'שרה כהן',
  dpoEmail: 'dpo@techno-kol.co.il',
  dpoPhone: '+972-3-1234567',
});

rb.defineRunbook('db-outage', [
  { id: 'triage',    title: { he: 'טריאז׳', en: 'Triage' },
    branches: { ok: 'failover', fail: 'escalate' } },
  { id: 'failover',  title: { he: 'העברה', en: 'Failover' },
    branches: { ok: 'verify', fail: 'escalate' } },
  { id: 'verify',    title: { he: 'אימות', en: 'Verify' },
    branches: { ok: 'END' } },
  { id: 'escalate',  title: { he: 'הסלמה', en: 'Escalate' },
    terminal: true, branches: { ok: 'END' } },
]);

const id = rb.start({
  scenario: 'db-outage',
  severity: 'SEV1',
  title: { he: 'השבתת DB פרודקשן', en: 'Production DB outage' },
  reporter: 'alice',
  oncall: 'bob',
  impact: { he: 'כלל המשתמשים', en: 'all users' },
  pdplBreach: false,
});

console.log(rb.renderSlack(id, 'he'));
rb.advance(id, 'triage',   'ok');
rb.advance(id, 'failover', 'ok');
rb.advance(id, 'verify',   'ok');
rb.resolve(id);
const pm = rb.renderPostmortem(id, {
  executiveSummary: 'Failover succeeded, 12-minute user impact.',
  why1: 'Primary lost power',
});
console.log(pm.en);
```
