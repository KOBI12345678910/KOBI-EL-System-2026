# AG-Y177 — Chaos Engine (`ChaosEngine`)

**Agent**: Y-177
**Module**: `onyx-procurement/src/devops/chaos-engine.js`
**Tests**: `onyx-procurement/test/devops/chaos-engine.test.js`
**Date**: 2026-04-11
**House rule**: לא מוחקים רק משדרגים ומגדלים — Never delete, always upgrade and grow.

---

## 1. Purpose / מטרה

**EN** — `ChaosEngine` is a fault-injection chaos engineering tool for the
Techno-Kol Uzi mega-ERP. It allows operators to define experiments,
register explicit opt-in targets, and run controlled perturbations
(latency, error, drop, resource exhaustion) against ERP code paths with
hard blast-radius limits, scheduled windows, steady-state hypothesis
validation and a one-call emergency abort switch.

**HE** — `ChaosEngine` הוא כלי הנדסת כאוס (Chaos Engineering) עבור מערכת
Techno-Kol Uzi mega-ERP. הכלי מאפשר למפעילים להגדיר ניסויים, לרשום יעדים
בהסכמה מפורשת (opt-in), ולהריץ הפרעות מבוקרות (השהיה, שגיאה, ניתוק, דלדול
משאבים) נגד נתיבי קוד של ה-ERP, עם מגבלות רדיוס-פגיעה, חלונות זמן
מתוזמנים, אימות השערת מצב-יציב, ומתג עצירת חירום בקריאה אחת.

---

## 2. Scope / תחולה

| Area | Behaviour |
|---|---|
| Fault types | `latency`, `error`, `drop`, `resource_exhaust` |
| Gating | global abort → schedule → blast-radius → per-fault probability |
| Reproducibility | seeded Mulberry32 PRNG; identical `seed` + `correlationId` → identical decision |
| Audit | append-only ledger (`listLedger()`) + run log (`listRuns()`) |
| Safety gates | dry-run, sandbox-only, prod fail-safe, steady-state pre/post, emergency abort |
| Persistence | in-memory only (the tool never writes to disk or network) |
| Dependencies | Node built-ins only (`node:crypto`) — no third-party packages |
| Hebrew | bilingual glossary (`GLOSSARY`) exported for UI use |

---

## 3. API surface / ממשק

```text
new ChaosEngine({ seed?, clock?, env? })

// registration — returns an opt-in handle
registerTarget({ id, description_he?, description_en? })
  → { id, inject(ctx), deactivate() }

// experiment lifecycle
defineExperiment({
  id, targetId, faults:[ {type, probability?, ...params} ],
  blastRadiusPercent?, schedule?, steadyState?, steadyTolerancePercent?,
  hardCapCalls?, description_he?, description_en?
})
getExperiment(id)
listExperiments()

// run
run(experimentId, { dryRun?, simulateCalls?, durationMs? })
finishRun(experimentId, { reason_en?, reason_he? })
validateSteadyState(experimentId)

// emergency
abort(reason?)
clearAbort()
isAborted()
getAbortReason()

// reporting
listTargets()
listRuns()
listLedger()
```

Every read method returns deep-frozen data so the UI cannot mutate the
ledger by accident. `defineExperiment` always calls `validateFault` on
every entry before mutating engine state.

---

## 4. Safety model / מודל בטיחות

1. **Sandbox-only / ארגז-חול בלבד.** The engine never monkey-patches
   anything. It can only perturb a code path if the path itself calls
   `target.inject()`. Code paths that never wire `inject()` are
   guaranteed unaffected.
2. **Prod fail-safe / הגנת ייצור.** `run()` refuses to execute when
   `NODE_ENV === 'production'` unless `CHAOS_PROD_ALLOWED === 'true'`.
   Dry-runs always work, which lets operators plan prod chaos without
   touching prod.
3. **Blast-radius / רדיוס פגיעה.** `blastRadiusPercent ∈ [0, 100]`
   deterministically caps the share of calls that can be perturbed.
4. **Probability / הסתברות.** Each fault has a `probability ∈ [0, 1]`
   rolled independently inside the blast-radius cohort.
5. **Windows / חלונות זמן.** `schedule:[{startMs,endMs}]` scopes the
   experiment to explicit time windows (in engine-clock milliseconds).
6. **Emergency abort / עצירת חירום.** `abort(reason)` flips a global
   flag and every `inject()` thereafter returns
   `{ shouldFault:false, wasAborted:true, abortReason }`. History is
   kept — nothing is deleted.
7. **Steady state / מצב יציב.** Optional `steadyState()` function is
   called before the experiment (pre-condition gate) and after it
   (verdict). A failing post-state flips the run to `aborted` with
   reason `steady_state_violated`.
8. **Never delete / אסור למחוק.** Targets deactivate, experiments
   upgrade, aborts clear — every state transition is appended to the
   ledger.

---

## 5. Israeli operations safety note / הערת בטיחות לצוות ישראל

**EN** — Chaos runs against the Techno-Kol Uzi ERP can affect real
Israeli business deadlines: VAT reports (מע״מ), payroll (101/106),
monthly 102 filings to רשות המיסים, and supplier payment cycles. Before
running any live experiment:

1. **Never run during a tax-window day**: the 15th and the 23rd of
   every month (VAT / income-tax-withholding deadlines) must be
   blocked. Consult `locales/tax-calendar.he.json` before scheduling.
2. **Check the business calendar** — chaos is forbidden on Friday
   afternoons (ערב שבת) from 13:00 IST onward, on all Shabbat and
   Jewish holidays (חגים) per `locales/holidays.il.json`, and on
   public-sector bill-of-lading cutoff days (ימי תעודת משלוח).
3. **Coordinate with the back-office** — call the shift lead at the
   Techno-Kol Uzi headquarters in Rosh Ha'ayin before pulling the
   `CHAOS_PROD_ALLOWED=true` switch. Every prod run must have a named
   human incident commander (מפקד אירוע).
4. **Keep the abort key hot** — the operator running chaos must have
   the `abort()` invocation on the terminal one keystroke away, with
   a pager open to on-call SRE and the procurement duty manager.
5. **Respect blast-radius ceilings** — Israeli ops policy caps live
   blast-radius at 10% during business hours (08:00-18:00 IST) and
   25% outside business hours. Higher radii require written approval
   from the CTO and documentation in `_qa-reports/`.
6. **Bilingual incident reports** — every chaos incident that causes
   a user-visible failure must be written up in Hebrew AND English
   within 24 hours and filed under `_qa-reports/incidents/`.
7. **No chaos during month-end close** — the last two business days
   of each Hebrew/Gregorian month are **forbidden** for live injection.
   Dry-runs only. This protects the CFO's close cycle and
   reconciliation workflows.

**HE** — הרצת ניסויי כאוס נגד Techno-Kol Uzi ERP עלולה לפגוע בדדליינים
עסקיים ישראליים אמיתיים: דיווחי מע״מ, שכר (טפסי 101/106), דיווח 102
חודשי לרשות המיסים, ומחזור תשלום ספקים. לפני כל הרצה חיה:

1. **אסור להריץ בימי חלון מס**: ה-15 וה-23 בכל חודש (מע״מ /
   ניכוי מס הכנסה) חסומים. יש להיוועץ ב-`locales/tax-calendar.he.json`
   לפני קביעת לוח זמנים.
2. **בדקו את לוח העסקים** — כאוס אסור ביום שישי אחרי 13:00 (ערב שבת),
   בכל שבת וחגי ישראל לפי `locales/holidays.il.json`, וביום תעודת
   המשלוח של המגזר הציבורי.
3. **תיאום עם ה-Back-Office** — טלפן לראש המשמרת במשרדי Techno-Kol Uzi
   בראש העין לפני הפעלת המתג `CHAOS_PROD_ALLOWED=true`. בכל הרצת
   ייצור חייב להיות מפקד אירוע אנושי בעל שם.
4. **מתג החירום קרוב** — המפעיל חייב שהקריאה `abort()` תהיה במרחק
   הקשה אחת, עם פייג׳ר פתוח ל-SRE התורן ומנהל מבצעי הרכש.
5. **כיבוד תקרות רדיוס** — מדיניות התפעול הישראלית מגבילה רדיוס-פגיעה
   חי ל-10% בשעות העבודה (08:00-18:00 שעון ישראל) ול-25% מחוץ לשעות
   אלו. רדיוסים גבוהים יותר דורשים אישור בכתב של ה-CTO ותיעוד ב-
   `_qa-reports/`.
6. **דוחות אירוע דו-לשוניים** — כל אירוע כאוס שגרם לתקלה גלויה למשתמש
   חייב תיעוד בעברית וגם באנגלית תוך 24 שעות תחת
   `_qa-reports/incidents/`.
7. **אסור כאוס בסגירת חודש** — שני ימי העסקים האחרונים של כל חודש
   גרגוריאני/עברי **אסורים** להזרקה חיה. הרצות יבשות בלבד. זאת על מנת
   להגן על מחזור הסגירה של ה-CFO ותהליכי ההתאמות.

---

## 6. Test coverage / כיסוי בדיקות

27 tests in `test/devops/chaos-engine.test.js` — all passing locally
with Node 20 built-in test runner. Groups:

| # | Area | Focus |
|---|---|---|
| 1-2 | `validateFault` | defaults and type/range rejection |
| 3-5 | `registerTarget` | opt-in handle shape, re-register = upgrade, no-experiment case |
| 6-7 | `defineExperiment` | bad inputs, happy-path storage |
| 8 | dry-run | plan math, no injection counted |
| 9-11 | blast-radius gating | 0%, 100%, 25% over large N |
| 12 | schedule window | outside/inside/after window |
| 13-14 | emergency abort | global flag + history preserved |
| 15-17 | prod fail-safe | default refuse, opt-in allow, dry-run bypass |
| 18-20 | steady-state | precondition block, OK path, error surface |
| 21 | determinism | same seed → identical fault count |
| 22 | experiment upgrade | old state kept in ledger |
| 23 | target deactivation | `target_inactive` reason, record kept |
| 24 | bilingual glossary | all keys present, HE + EN non-empty |
| 25-26 | helpers | `mulberry32`, `safeStringHash`, `isProdEnv`, `prodAllowed` |
| 27 | end-to-end | define → dryRun → simulate → abort → ledger intact |

### Latest run

```text
ℹ tests 27
ℹ pass 27
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 104.79
```

---

## 7. Usage examples / דוגמאות שימוש

### Plan a prod experiment without touching prod

```js
const { ChaosEngine } = require('./src/devops/chaos-engine');
const engine = new ChaosEngine({ env: { NODE_ENV: 'production' } });

const target = engine.registerTarget({
  id: 'vat-report-generator',
  description_he: 'מחולל דו"ח מע"מ',
  description_en: 'VAT report generator',
});

engine.defineExperiment({
  id: 'exp-vat-latency-2026-q2',
  targetId: 'vat-report-generator',
  faults: [{ type: 'latency', latencyMs: 1500, probability: 1.0 }],
  blastRadiusPercent: 10,
  steadyState: async () => ({ ok: true, metric: 'healthy' }),
});

const plan = await engine.run('exp-vat-latency-2026-q2', { dryRun: true });
console.log(plan.plan); // expected_faulted, fault_mix, sample_size...
```

### Wire into a code path (opt-in only)

```js
async function generateVATReport(payload) {
  const decision = target.inject({ correlationId: payload.requestId });
  if (decision.shouldFault) {
    switch (decision.fault.type) {
      case 'latency': await new Promise(r => setTimeout(r, decision.fault.latencyMs)); break;
      case 'error':   throw new Error(decision.fault.errorMessage);
      case 'drop':    throw new Error('connection_dropped');
      case 'resource_exhaust':
        // e.g. short-circuit with 503 in the caller
        throw new Error('resource_exhaust');
    }
  }
  // ... actual report generation
}
```

### Pull the emergency brake

```js
engine.abort('sre-pagerduty-P1-2026-04-11');
// every subsequent inject() returns { shouldFault:false, wasAborted:true, ... }
```

---

## 8. Known limitations / מגבלות

- **No disk or network I/O** — everything is in-memory. Operators who
  need durable ledgers must wrap the engine with their own exporter.
- **No worker-thread isolation** — injection runs on the same event
  loop as the caller. This is by design: the engine is a decision
  oracle, not an executor.
- **`schedule` uses absolute epoch ms** — human-readable CRON strings
  (Asia/Jerusalem timezone) must be converted by the caller or by
  pairing with `ci-generator.js`'s `israelCronToUtc`.
- **Steady-state is caller-supplied** — the engine has no built-in
  metric collector. This is deliberate: the user's own Prometheus /
  Grafana integration is the source of truth.

---

## 9. House-rule compliance / עמידה בכלל הבית

| Rule | Status |
|---|---|
| Never delete | yes — targets deactivate, experiments upgrade, aborts clear, ledger append-only |
| Node built-ins only | yes — only `node:crypto` + `node:test` in tests |
| Bilingual | yes — `GLOSSARY` exported, descriptions HE+EN, report is HE+EN |
| Sandbox only | yes — engine never monkey-patches; `inject()` is opt-in |
| Prod fail-safe | yes — `CHAOS_PROD_ALLOWED=true` gate documented and tested |
| Deterministic | yes — Mulberry32 seeded PRNG, same seed ⇒ same trace |
| Auditable | yes — `listLedger()` + `listRuns()` both deep-frozen |

**Signed** — Agent Y-177, 2026-04-11, Techno-Kol Uzi mega-ERP swarm.
