# AG-Y099 — Customer Health Score Engine

**Agent:** Y-099
**Module:** `onyx-procurement/src/customer/health-score.js`
**Tests:** `onyx-procurement/test/customer/health-score.test.js`
**Status:** DELIVERED — 36/36 tests passing
**Rule:** לא מוחקים רק משדרגים ומגדלים (never delete, only upgrade and grow)
**Date:** 2026-04-11
**Dependencies:** zero (pure JavaScript, Node built-ins only)

---

## 1. Scope

A zero-dependency customer health score engine that combines seven pillars of
customer signal into a composite 0..100 score. All history is append-only —
no deletions, no mutations of past records. Bilingual (Hebrew + English) on
every label, message, alert, playbook, and recommendation.

### Public API

| Method | Purpose |
|---|---|
| `defineModel({factors, thresholds})` | Register factors + status bands |
| `ingestData(customerId, source, payload)` | Feed raw signal (additive, timestamped) |
| `computeScore(customerId)` | Weighted composite + status + trend delta |
| `trendAnalysis(customerId, period)` | Slope, min/max, delta, direction over window |
| `alertDecline({threshold})` | Customers whose last score dropped ≥ N points |
| `explainScore(customerId)` | Top bilingual drivers (strengths + weaknesses) |
| `playbookTrigger(customerId)` | Auto-fire intervention playbook on status/decline |
| `registerPlaybook(status, playbook)` | Plug custom playbooks |
| `correlateChurn(churnedCustomers)` | Back-test precision / recall / F1 / accuracy |
| `segmentHealth(segment)` | Avg health per segment + distribution |
| `assignSegment(customerId, segment)` | Tag a customer with a segment |
| `visualizeHealth(customerId)` | Inline SVG — dial + trend sparkline |
| `whatIfSimulator({customerId, factor, newValue})` | Shadow projection (no state mutation) |
| `getHistory(customerId)` | Snapshot copy of append-only score history |
| `listCustomers()` | Every customer touched |
| `status(total)` | Map a raw 0..100 to status band |

---

## 2. Default Factors (7 pillars)

Weights sum to **1.00** after normalization in `defineModel`.

| # | Factor (key) | Hebrew | English | Weight | Data Source | Daily Decay |
|---|---|---|---|---|---|---|
| 1 | `product_usage` | שימוש במוצר | Product Usage | **0.22** | `usage` | 0.02 |
| 2 | `payment_health` | בריאות תשלומים | Payment Health | **0.18** | `payments` | 0.01 |
| 3 | `support_tickets` | קריאות שירות | Support Tickets | **0.14** | `support` | 0.03 |
| 4 | `nps_csat` | NPS/שביעות רצון | NPS / CSAT | **0.14** | `survey` | 0.015 |
| 5 | `engagement` | מעורבות | Engagement | **0.12** | `engagement` | 0.025 |
| 6 | `commercial_signals` | סיגנלים מסחריים | Commercial Signals | **0.12** | `commercial` | 0.01 |
| 7 | `relationship` | יחסים | Relationship | **0.08** | `csm` | 0.02 |

**Sum:** 1.00

### Sub-metric anatomy per factor

**Product Usage (22%)**
- Login frequency (logins/month, cap 30) → up to 40 pts
- Feature adoption (0..1) → up to 35 pts
- Active users ratio (0..1) → up to 25 pts

**Payment Health (18%)**
- On-time rate (0..1) → up to 70 pts baseline
- Credit issues (count, penalty −7 pts each, cap 10)
- Days past due (0..90, linear penalty up to −30 pts)

**Support Tickets (14%)**
- Monthly volume (cap 20, inverse scoring) → up to 50 pts
- Average severity (1..5, inverse scoring) → up to 30 pts
- Oldest open ticket age (days, cap 60) → up to 20 pts

**NPS / CSAT (14%)**
- NPS (−100..+100) → up to 60 pts
- CSAT (0..5) → up to 40 pts

**Engagement (12%)**
- Meetings per quarter (cap 12) → up to 40 pts
- Response rate (0..1) → up to 30 pts
- Exec engagement (0..1) → up to 30 pts

**Commercial Signals (12%)**
- Expansion signal (0..1) → up to 40 pts
- Upsell opportunities (count, cap 5) → up to 30 pts
- Contract length (months, cap 60) → up to 30 pts

**Relationship (8%)**
- CSM rapport (0..10) → up to 50 pts
- Champion present (bool) → 25 pts
- Days since last QBR (cap 180, inverse scoring) → up to 25 pts

### Time-based decay

Each factor has a daily decay rate applied to stale data:
```
raw = scoreFn(payload) * (1 − decay)^ageDays
```
High-velocity signals (support tickets, engagement) decay fastest.
Commercial / payment signals are sticky.

---

## 3. Default Status Thresholds

| Status | Hebrew | Range | Action |
|---|---|---|---|
| `healthy` | בריא | **80 – 100** | Monitor quarterly, expansion plays |
| `watch` | מעקב | **60 – 79** | CSM ping within 72h, usage review |
| `risk` | סיכון | **40 – 59** | Exec call within 48h, root cause, 30-day save plan |
| `critical` | קריטי | **0 – 39** | War-room, exec escalation <24h, credit offer, roadmap commit |

Overridable via `defineModel({thresholds:{...}})`.

---

## 4. Default Playbooks

### Playbook: Watch (spr_playbook_watch)
1. CSM ping within 72h / יצירת קשר CSM תוך 72 שעות
2. Review usage patterns / סקירת דפוסי שימוש

### Playbook: Risk (spr_playbook_risk)
1. Executive call within 48h / שיחת מנכ"ל תוך 48 שעות
2. Root-cause analysis / ניתוח סיבת שורש
3. 30-day save plan / תוכנית שימור 30 יום

### Playbook: Critical (spr_playbook_critical)
1. Exec escalation within 24h / הסלמה להנהלה בכירה תוך 24 שעות
2. War room for retention / חדר מלחמה לשימור לקוח
3. Offer credit / compensation / הצעת פיצוי / זיכוי
4. Roadmap commitments / התחייבות למפת דרכים

Trigger conditions:
- Status is non-healthy, **OR**
- Score dropped ≥ 10 points vs previous reading (even if still healthy)

---

## 5. Alerting

`alertDecline({threshold = 10})` compares last two score records per customer.
Severity ladder:

| Drop | Severity |
|---|---|
| ≥ 30 | `critical` |
| 20 – 29 | `high` |
| 10 – 19 | `medium` |
| < 10 | `low` (filtered if below threshold) |

Alerts sorted by magnitude, descending.
Every alert carries bilingual `message_he` + `message_en`.

The class also maintains an internal **append-only `alertLog`** every time
`computeScore` detects a negative trend — consistent with the
never-delete rule.

---

## 6. Churn Correlation (Back-test)

`correlateChurn(churnedCustomerIds[])` treats any customer whose latest status
is `risk` or `critical` as a "predicted churn" and scores against ground truth:

```
precision = TP / (TP + FP)
recall    = TP / (TP + FN)
f1        = 2 * P * R / (P + R)
accuracy  = (TP + TN) / N
```

Churned customers not found in the history count as **false negatives**
(missed prediction), ensuring audit completeness.

Returns per-customer `details[]` for drill-down analysis.

---

## 7. Hebrew Glossary / מילון מונחים

| Hebrew | English | Context |
|---|---|---|
| בריאות לקוח | Customer Health | Composite 0..100 metric |
| ניקוד | Score | Weighted total |
| פירוט | Breakdown | Per-factor contribution |
| מגמה | Trend | Change direction |
| סטטוס | Status | Band (healthy/watch/risk/critical) |
| בריא | Healthy | ≥ 80 |
| מעקב | Watch | 60 – 79 |
| סיכון | Risk | 40 – 59 |
| קריטי | Critical | 0 – 39 |
| משתפר | Improving | Positive slope |
| נדרדר | Declining | Negative slope |
| יציב | Stable | Flat slope |
| ירידה | Drop / Decline | Negative delta |
| התראה | Alert | Threshold exceeded event |
| ספר משחקים | Playbook | Intervention template |
| חוזק | Strength | Top contributing factor |
| חולשה | Weakness | Bottom contributing factor |
| נטישה | Churn | Customer leaving |
| גורם | Factor | Input variable |
| משקל | Weight | Contribution share 0..1 |
| דעיכה | Decay | Time-based erosion |
| סגמנט | Segment | Customer cohort |
| QBR | Quarterly Business Review | Strategic check-in |
| CSM | Customer Success Manager | מנהל הצלחת לקוח |
| NPS | Net Promoter Score | מדד הממליצים נטו |
| CSAT | Customer Satisfaction | שביעות רצון לקוח |
| שימוש במוצר | Product Usage | Factor 1 |
| בריאות תשלומים | Payment Health | Factor 2 |
| קריאות שירות | Support Tickets | Factor 3 |
| מעורבות | Engagement | Factor 5 |
| סיגנלים מסחריים | Commercial Signals | Factor 6 |
| יחסים | Relationship | Factor 7 |
| שימור | Retention | Post-decline action |
| הרחבה | Expansion | Upsell opportunity |
| אלוף | Champion | Internal advocate |
| סימולציה | Simulation | What-if projection |

---

## 8. Test Coverage

Test file: `onyx-procurement/test/customer/health-score.test.js`

**Result:** 36 / 36 pass · duration ~117 ms · zero external deps.

| Section | Tests |
|---|---|
| Pure helpers (`clamp`, `slope`, `statusFromTotal`) | 3 |
| Model definition / rejection paths | 3 |
| `computeScore` — happy / sad / empty / breakdown / trend / decay | 6 |
| `trendAnalysis` — improving / declining / empty / period | 4 |
| `alertDecline` — detection / stability / sorting | 3 |
| `explainScore` — bilingual / weaknesses / sentinel | 3 |
| `playbookTrigger` — risk / healthy / sharp decline | 3 |
| `correlateChurn` — perfect / missing / guards | 3 |
| `segmentHealth` — by segment + aggregate | 1 |
| `visualizeHealth` — SVG shape + empty state | 2 |
| `whatIfSimulator` — improvement / immutability / errors | 3 |
| Rule enforcement — append-only history + customer list | 2 |

**Run command:**
```bash
cd onyx-procurement && node --test test/customer/health-score.test.js
```

---

## 9. Visualization Spec

`visualizeHealth(customerId)` returns a self-contained `<svg>` string
(320×180) with:

1. **Dial** (left half) — half-circle gauge with grey background arc and
   colored foreground arc proportional to total (0..100). Color maps to
   status (green / yellow / orange / red). Score displayed numerically in
   center, bilingual status label beneath.
2. **Sparkline** (right) — polyline of last 20 score points, auto-scaled.
3. **Header** — customer id (sanitized).

Inline SVG, no external fonts (Arial/Helvetica fallback), safe for email
and Hebrew RTL contexts. Customer id sanitized against `<>&`.

---

## 10. What-If Simulator

`whatIfSimulator({customerId, factor, newValue})` performs a **shadow
computation**:

1. Clones the current data bucket for the customer.
2. Substitutes one factor's payload with `newValue`.
3. Runs the full weighted composite in-memory.
4. Returns `{before, after, delta, status_change, recommendation_he, recommendation_en}`.

**Never touches** `history`, `data`, or `alertLog`. Honors the
never-delete rule by construction.

Recommendation thresholds:
- `delta > 5` → "Recommended" / "כדאי לבצע שינוי זה"
- `delta < -5` → "Not recommended" / "לא מומלץ — ירידה צפויה"
- otherwise → "Negligible impact" / "השפעה זניחה"

---

## 11. Compliance with the Rule

> **לא מוחקים רק משדרגים ומגדלים**

Enforced guarantees:

1. **`computeScore`** *pushes* onto `history`; never splices, shifts, or
   reassigns past records.
2. **`ingestData`** replaces only the latest snapshot for a source — prior
   computed scores captured a frozen copy of that data at the time they ran.
3. **`alertLog`** is append-only; no clear, no pop.
4. **`whatIfSimulator`** operates on a cloned bucket and returns a
   projection without mutating state.
5. **`defineModel`** creates a fresh factors array (normalized copies);
   caller's factor objects are not mutated.
6. **`getHistory`** returns a `.slice()` — the caller cannot corrupt the
   engine's internal store.

No public method removes data. The only "decay" is a computational
attenuation inside `computeScore` that leaves the raw payload untouched.

---

## 12. Files Delivered

| Path | Lines | Purpose |
|---|---|---|
| `onyx-procurement/src/customer/health-score.js` | ~520 | Engine |
| `onyx-procurement/test/customer/health-score.test.js` | ~430 | Unit tests (36 cases) |
| `_qa-reports/AG-Y099-health-score.md` | this file | QA spec |

---

*Generated by Agent Y-099 on 2026-04-11. Never delete.*
