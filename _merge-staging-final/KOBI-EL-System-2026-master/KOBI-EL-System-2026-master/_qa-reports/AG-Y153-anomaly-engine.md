# AG-Y153 — Anomaly Alert Engine (Statistical, Zero-Dependency) / מנוע אזעקות חריגות

**Agent:** Y-153
**System:** Techno-Kol Uzi mega-ERP / ONYX AI core
**Author:** Kobi
**Date:** 2026-04-11
**Status:** GREEN — 21 / 21 tests passing, strict-mode type-check clean
**Motto / סיסמה:** *"לא מוחקים רק משדרגים ומגדלים"*

---

## 1. Mission / משימה

**EN.** Deliver a production-grade statistical anomaly-alert engine for the
ONYX AI core — six independent detectors, both streaming and batch modes,
severity classification, bilingual explanations, alert suppression, and a
downstream event bus — all with **zero external dependencies**.

**HE.** לספק מנוע אזעקות חריגות ברמה תעשייתית לליבת ONYX AI — שישה גלאים
סטטיסטיים עצמאיים, מצב זרימה ומצב אצווה, סיווג חומרה, הסברים דו-לשוניים,
דיכוי אזעקות ו-event bus לצרכנים, ללא כל תלויות חיצוניות.

---

## 2. Deliverables / תוצרים

| File | Purpose / תכלית |
|---|---|
| `onyx-ai/src/anomaly/anomaly-engine.ts` | Engine — class `AnomalyEngine`, 6 detectors, streaming + batch, event bus, suppression |
| `onyx-ai/test/anomaly/anomaly-engine.test.ts` | 21 unit tests (Node built-in test runner) |
| `_qa-reports/AG-Y153-anomaly-engine.md` | This bilingual QA report |

- **Zero new npm packages.** Works on Node ≥ 20 with the built-in `node:test`.
- **Zero files deleted.** Pure additive change — the upgrade-only philosophy
  is also enforced **inside** the engine (`addDetector` is append-only,
  built-ins cannot be overridden, history/streaming reset never removes
  subscribers or custom detectors).

---

## 3. Statistical Methods / שיטות סטטיסטיות

| # | Detector | Strength | Weakness | Best for |
|---|---|---|---|---|
| 1 | **Z-Score** (`detectZScore`) | Simple, well-understood, fast | Sensitive to outlier contamination of sample stdev | Well-behaved Gaussian-like series |
| 2 | **MAD** — Median Absolute Deviation (`detectMAD`) | Robust; breaks down only at ~50% contamination; uses consistent scale factor 1.4826 | Less sensitive than z-score on clean data | Series with heavy tails or clustered outliers |
| 3 | **IQR Tukey box-plot** (`detectIQR`) | Distribution-free, 1.5×IQR whiskers | Needs ≥ 4 points, insensitive inside the box | Exploratory / human-readable plots |
| 4 | **EWMA control chart** (`detectEWMA`) | Catches small persistent drifts that z-score misses; α tunable | Assumes stationarity of baseline | Control-chart monitoring, slow drifts |
| 5 | **Page-Hinkley** (`detectPageHinkley`) | Dedicated change-point detector for abrupt mean shifts; online | Not good for periodic noise | Regime changes, process faults |
| 6 | **Seasonal-adjusted residual** (`detectSeasonal`) | Phase-aware median baseline, falls back to global MAD when a phase is too short | Needs ≥ 2 full periods | Weekly / monthly patterns (payroll, traffic) |

Each detector returns a rich `AnomalyAlert` with: index, value, expected,
score, threshold, severity, **bilingual explanation**, timestamp, and optional tag.

### Tunable defaults / ברירות מחדל

```
zScoreThreshold        = 3.0        // classic 3σ
madThreshold           = 3.5        // ~equivalent to 3σ after 1.4826 scaling
iqrK                   = 1.5        // Tukey fences
ewmaAlpha              = 0.3        // smoothing factor
ewmaL                  = 3          // σ control-limit multiplier
phDelta                = 0.005      // Page-Hinkley minimum change
phLambda               = 50         // Page-Hinkley alarm threshold
seasonalPeriod         = 7          // weekly cycle
seasonalThreshold      = 3.5        // k·MAD on residuals
cooldownMs             = 60_000     // 1 min suppression cooldown
maxAlertsPerWindow     = 10         // rate limit per detector+tag
suppressionWindowMs    = 300_000    // 5 min window for the rate limit
historyCap             = 10_000     // streaming ring buffer size
```

---

## 4. Architecture / ארכיטקטורה

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          AnomalyEngine (class)                           │
│  ┌─────────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────────┐  ┌───────────┐  │
│  │ zScore  │  │ MAD  │  │ IQR  │  │ EWMA │  │ Page-Hinkley│  │ Seasonal │  │
│  └────┬────┘  └──┬───┘  └──┬───┘  └──┬───┘  └────┬────┘  └─────┬─────┘  │
│       └──────────┴─────────┴─────────┴───────────┴─────────────┘         │
│                                │                                        │
│                   ┌────────────┴─────────────┐                           │
│                   ▼                          ▼                           │
│            analyze(series)              update(value)                    │
│              [batch]                    [streaming]                      │
│                   │                          │                           │
│                   └──────────┬───────────────┘                           │
│                              ▼                                           │
│                   buildAlert + classifySeverity                          │
│                              │                                           │
│                              ▼                                           │
│         Emit('alert') ──► Suppression gate ──► Emit('fired')             │
│                                 ▲                                        │
│                                 │                                        │
│              cooldown / rate-limit / per-key window                      │
└──────────────────────────────────────────────────────────────────────────┘
```

### Core flows / זרימות מרכזיות

* **Batch / אצווה.** `analyze(series, tag)` runs every detector that has
  enough samples, returns a full `AnomalyReport` with descriptive stats,
  and emits `'alert'` + `'fired'` events for every alert (respecting
  suppression).
* **Streaming / זרימה.** `update(value, tag)` keeps a ring buffer,
  incrementally updates EWMA + Page-Hinkley state, and once warmup is
  complete also runs windowed z-score + MAD.
* **Event bus / צרכנים.** Downstream consumers subscribe with
  `engine.on('fired', handler)`. Subscriber errors are caught — a bad
  handler can never crash the engine.
* **Extensibility / הרחבה.** `engine.addDetector('name', fn)` adds a
  custom detector. Built-in names are **protected** — an attempt to
  override `zScore` is silently ignored (no deletion, upgrade-only).

---

## 5. Suppression model / מודל הדיכוי

Two orthogonal filters per `(detector, tag)` key:

1. **Cooldown** — after a fire, the same key is silenced for `cooldownMs`.
2. **Rate limit** — no more than `maxAlertsPerWindow` fires per
   `suppressionWindowMs` window per key.

This matches real production alerting systems (PagerDuty-style) and was
verified by tests **13**, **14**, **15**.

`clearSuppression(detector, tag)` unblocks a specific key (or all keys
when called with no args) — it resets only the tracker, it never
deletes detectors, history, or subscribers.

---

## 6. Pathological inputs handled / קלטים פתולוגיים שנבדקו

| Case | Expected behavior | Test # |
|---|---|---|
| Empty series `[]` | No alerts, stats all zero, every detector marked `ran: false` | 1 |
| Single point `[42]` | No alerts, stats reflect the singleton, no crash | 2 |
| All-zero `[0,0,…]` | No alerts (stdev=0, MAD=0, IQR=0 — all detectors early-exit) | 3 |
| Constant nonzero `[777,777,…]` | Same — zero false positives | 4 |
| NaN / ±Infinity interspersed | Silently filtered by `sanitize()`; valid points still analyzed | 17 |

---

## 7. Test summary / סיכום בדיקות

```
TS_NODE_TRANSPILE_ONLY=true npx node --test --require ts-node/register \
    test/anomaly/anomaly-engine.test.ts

✔ 1.  empty series — analyze returns zero alerts, sane stats
✔ 2.  single point — no detector triggers, no exceptions
✔ 3.  all-zero series — no false positives
✔ 4.  constant nonzero series — all detectors silent
✔ 5.  zScore — detects single spike in Gaussian-like series
✔ 6.  MAD — robust when multiple outliers inflate sample stdev
✔ 7.  IQR — flags points outside 1.5*IQR whiskers
✔ 8.  EWMA — catches gradual mean shift that z-score might miss
✔ 9.  Page-Hinkley — detects abrupt mean shift
✔ 10. Seasonal — detects break in a weekly pattern
✔ 11. alerts contain both Hebrew and English explanations
✔ 12. streaming update() — emits fired events for a spike
✔ 13. suppression — cooldown blocks repeated alerts of same key
✔ 14. suppression — maxAlertsPerWindow enforced per key
✔ 15. clearSuppression — upgrade-only reset of cooldown tracker
✔ 16. addDetector — custom detectors run; cannot override built-ins
✔ 17. sanitization — NaN/Infinity ignored, valid values retained
✔ 18. classifySeverity — ladder from info to critical
✔ 19. resetStream — clears state but keeps subscribers and detectors
✔ 20. internal stats helpers — median, quantile, MAD sanity
✔ 21. end-to-end — daily revenue stream with spike + drift

ℹ tests 21
ℹ pass  21
ℹ fail   0
ℹ duration_ms ~530
```

**Coverage map / מפת כיסוי:**

| Concern | Tests |
|---|---|
| Every built-in detector | 5, 6, 7, 8, 9, 10, 21 |
| Streaming mode | 12, 19 |
| Batch mode | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 21 |
| Pathological inputs | 1, 2, 3, 4, 17 |
| Bilingual explanations | 11 |
| Suppression | 13, 14, 15 |
| Event emission | 12, 13, 14, 15, 19, 21 |
| Severity classification | 5, 18 |
| Extensibility (append-only) | 16, 19 |
| Internal numeric helpers | 18, 20 |

---

## 8. "לא מוחקים רק משדרגים ומגדלים" — enforcement points

1. **`addDetector` is append-only.** Built-in detector names are protected;
   an override attempt is silently ignored (test 16 verifies).
2. **`resetStream` keeps subscribers and custom detectors.** Only the
   numeric streaming state is cleared (test 19 verifies).
3. **`clearSuppression` resets only the cooldown tracker.** Never touches
   detectors, event subscribers, or history (test 15 verifies).
4. **No detector is ever removed** from the engine — the class exposes
   `addDetector` but no `removeDetector`.
5. **History buffer grows with a ring-buffer cap** (`historyCap`), so old
   points are only evicted passively by the cap, never by any destructive
   API call.

---

## 9. Integration notes / שילוב במערכת

```ts
import { AnomalyEngine, AnomalyAlert } from './anomaly/anomaly-engine';

const engine = new AnomalyEngine({
  zScoreThreshold: 3,
  cooldownMs: 60_000,
  maxAlertsPerWindow: 5,
});

// Wire into the alert bus
engine.on('fired', (a) => {
  const alert = a as AnomalyAlert;
  alertBus.publish({
    severity: alert.severity,
    source: `anomaly/${alert.detector}`,
    message_he: alert.explanation.he,
    message_en: alert.explanation.en,
    context: {
      value: alert.value,
      expected: alert.expected,
      score: alert.score,
    },
  });
});

// Batch: daily revenue series
const report = engine.analyze(dailyRevenue, 'daily-revenue');

// Streaming: per-transaction risk metric
for (const tx of transactionStream) {
  engine.update(tx.riskScore, `vendor:${tx.vendorId}`);
}
```

---

## 10. Risks / סיכונים וטיפול

| Risk | Mitigation |
|---|---|
| Subscriber handler throws | Engine wraps every callback in try/catch — consumer bugs cannot crash the engine |
| High-volume streaming memory growth | `historyCap` ring buffer (default 10 000 points) bounds memory |
| Detector false positives spamming downstream | Cooldown + rate limit + bilingual severity tier allow UI to triage |
| Small-sample false positives | Each detector has a minimum-sample guard (3 / 4 / 2×period) |
| Type-check regressions | File compiles cleanly under `tsc --strict` |

---

## 11. Bilingual sign-off / אישור דו-לשוני

**EN.** AnomalyEngine v1.0 (agent Y-153) is READY for integration into the
Techno-Kol Uzi mega-ERP. 21/21 tests pass, strict-mode type-check is clean,
no new dependencies introduced, and no existing files were deleted. The
engine follows the mandated "upgrade-only" architecture.

**HE.** מנוע AnomalyEngine גרסה 1.0 (agent Y-153) **מוכן לשילוב** במערכת
ה-ERP של טכנו-קול עוזי. 21 מתוך 21 בדיקות עוברות, type-check במצב strict
נקי, ללא תלויות חדשות, ללא מחיקת קבצים קיימים. המנוע פועל לפי עיקרון
"לא מוחקים רק משדרגים ומגדלים" כנדרש.

— **Agent Y-153**, 2026-04-11
