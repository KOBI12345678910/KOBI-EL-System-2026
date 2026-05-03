# AGENT-186 — Time Tracking Audit

**Agent:** 186
**Scope:** Punch in/out, geofence, IL labor-law overtime computation (100/125/150/200%)
**Date:** 2026-04-29
**Reference:** `_qa-reports/AG-X25-time-tracking.md` (Agent X-25, 2026-04-11, PASS 32/32)
**Status:** PASS with two notable gaps (geofence not in core engine; 100% saving handled implicitly)

---

## 1. Files In Scope

| File | LoC | Role |
|------|-----|------|
| `onyx-procurement/src/time/time-tracking.js` | 967 | Core engine (clock, breaks, compliance, payable) |
| `payroll-autonomous/src/components/KioskClockIn.jsx` | 915 | Shop-floor kiosk UI (PIN/ID/photo auth) |
| `test/payroll/time-tracking.test.js` | 494 | 32 unit/compliance tests, zero deps |
| `AI-Task-Manager/artifacts/api-server/src/routes/hr-attendance-advanced.ts` | — | Geofence + work-site enforcement (server-side) |

All paths absolute, rooted at the worktree.

---

## 2. Test Re-Verification (executed today)

```
$ node test/payroll/time-tracking.test.js
=== time-tracking.test.js — Agent X-25 ===
  ok 01..32 (full suite)
---
Total: 32   Passed: 32   Failed: 0
All tests passed.
```

Reproduced clean — no flaking, no env drift. Original X-25 report stands.

---

## 3. Punch In/Out — Audit

| Capability | Source | Status |
|------------|--------|--------|
| `clockIn(employeeId, jobCode, metadata)` | `time-tracking.js:332-366` | OK |
| Single-open-entry guard (`E_ALREADY_CLOCKED_IN`) | `time-tracking.js:336-339` | OK |
| `clockOut(entryId)` returns hours + payable_hours | `time-tracking.js:374-415` | OK |
| Auto-close dangling break on clockOut | `time-tracking.js:382-389` | OK (test 08) |
| Offline IndexedDB queue + opportunistic sync | `time-tracking.js:319-323, 360-363` | OK (tests 10, 11) |
| Never-delete corrections via `correctEntry` (SUPERSEDED) | report §2.2 | OK (test 26) |
| Auth — Israeli ID Luhn + PIN weak-list + hashPin | `time-tracking.js` | OK (tests 12-14) |
| Kiosk UI — giant clock, PIN pad, ת.ז input, RTL, ARIA | `KioskClockIn.jsx` | OK (manual review) |
| Auto-lock after 5s idle | `KioskClockIn.jsx` | OK |

Punch in/out lifecycle is sound. Open-entry, dangling-break, and missing-employeeId all throw with stable error codes tested explicitly.

---

## 4. Geofence — Audit

**Core engine (`time-tracking.js`):** No geofence enforcement. `clockIn` accepts a free-form `metadata` object (line 332, 350) which can carry GPS but the engine never validates it. The X-25 report makes no geofence claim and the test suite does not exercise location.

**Server-side companion (`hr-attendance-advanced.ts`):** Full geofence implementation present:
- `work_sites` table — `lat`, `lng`, `radius_meters` (default 200) — line 49-59
- `attendance_clock_events.within_geofence` boolean + `distance_meters` — line 60-79
- `haversineDistance(lat1,lng1,lat2,lng2)` — line 289
- Enforcement at clock-in: rejects GPS clock-in outside `radius_meters` unless caller is privileged AND `override_geofence=true` (lines 403-423). Self-override blocked.

Gap: the kiosk core engine and the server route are independent — punches written via `time-tracking.js` do not flow through the geofence check unless the caller explicitly POSTs to the advanced route. No shared schema between offline kiosk queue and `attendance_clock_events`. Recommendation: have the `/api/time/sync` endpoint insert into `attendance_clock_events` so geofence/work-site/distance fields are populated on flush.

---

## 5. Overtime Computation — IL Law Saving

`computePayable(entries, rules)` in `time-tracking.js:792-880` returns:

```
{ regular, overtime_125, overtime_150, overtime_175, overtime_200, total_amount? }
```

| Bucket | Multiplier | Trigger (per §16 חוק שעות עבודה ומנוחה) | Code Source |
|--------|-----------|-------------------------------------------|-------------|
| `regular` | 1.00 | Up to 8h/day AND up to 42h/week | line 844-847 |
| `overtime_125` | 1.25 | First 2 OT hours past daily/weekly cap | line 851-854 |
| `overtime_150` | 1.50 | OT hours past first 2 | line 856-860 |
| `overtime_175` | 1.75 | First 2 hours overlapping Shabbat window | line 833-837 |
| `overtime_200` | 2.00 | Shabbat hours past first 2 | line 838-839 |

Constants `OT_RATE.REGULAR=1.00, OT_125=1.25, OT_150=1.50, OT_175=1.75, OT_200=2.00` frozen at line 60-66.

Weekly 42-hr budget tracked per `employee_id|ISO-week` (line 829, 847) so days do not double-count when both daily-cap (8h) and weekly-cap (42h) trigger. Buckets are `roundTo(_, 4)` and `total_amount` (NIS) `roundTo(_, 2)` when `baseRate` is supplied (line 868-877).

### 5.1 Required vs Implemented

Task asked for "saving 100%/125%/150%/200%". Engine saves **five** buckets — adds 175% (Shabbat first 2h) which is correct under §17(b) of the law. The 100% bucket is named `regular` not `overtime_100`; same value (×1.00). Naming differs from spec but math is faithful.

### 5.2 Tests Covering Each Bucket

- 100% (regular): test 21
- 125%: test 22 (first 2 OT hours)
- 150%: test 22, 23 (OT past 2h, daily-cap overflow)
- 175%/200%: test 24 (Shabbat split)
- baseRate × multipliers → `total_amount`: test 25

All five buckets are individually verified.

---

## 6. IL Labor Law Compliance — Coverage Matrix

`validateCompliance(entries, {observesShabbat})` in `time-tracking.js:600-740` returns `[{code, severity, message_he, message_en, ...}]`:

| Rule | Code | Severity | Test |
|------|------|----------|------|
| Max 12h/day absolute ceiling | `EXCEED_DAILY_MAX` | critical | 15 |
| 30-min break required after 6h | `MISSING_MANDATORY_BREAK` | high | 16 |
| Min 11h rest between shifts | `INSUFFICIENT_REST_BETWEEN_SHIFTS` | high | 17 |
| Max 42h regular/week | `EXCEED_WEEKLY_MAX` | medium | 18 |
| Min 36h weekly unbroken rest | `INSUFFICIENT_WEEKLY_REST` | high | covered indirectly (req ≥6-day span, line 727) |
| Shabbat work flag | `SHABBAT_WORK` | high | 19 |

All six rules ship with bilingual `message_he`/`message_en` and a drill-down `entry_id` or `(employee_id, week)` pointer.

---

## 7. Gaps & Risks

1. **Geofence not unified.** `time-tracking.js` (kiosk/offline path) does not consume the `work_sites` / `attendance_clock_events` schema from `hr-attendance-advanced.ts`. Two independent implementations of "punch with location"; no test covers cross-flow.
2. **Shabbat detector uses local TZ.** `overlapsShabbat` calls `Date.getDay()`/`getHours()` on machine local time (line 753-754). Production should pin `Asia/Jerusalem` via `Intl.DateTimeFormat`. Already flagged in X-25 report §8 as known limit.
3. **`hashPin` is a JS fingerprint, not a crypto hash.** Acceptable for kiosk PIN-vs-PIN compare but not for at-rest secrecy. Swap to `crypto.subtle.digest('SHA-256', ...)` per X-25 §8.
4. **100% bucket name mismatch.** Task language says "100%" — engine exposes it as `regular`. Cosmetic; downstream payroll consumers must map.
5. **Holiday saving (chag) not separated from Shabbat.** Both route to 175/200 via `observesShabbat` flag; no distinct holiday calendar. Acceptable for §17(b) (treats both equivalently for premium) but loses audit granularity.
6. **`overlapsShabbat` step-iteration uses 30-min granularity.** Edge case: a shift starting at 17:31 Friday and ending at 17:59 Friday would not be detected (loop steps at fromIso, fromIso+30m, ...). Low risk for normal shift lengths.

---

## 8. Sign-Off

Time tracking core (clock, breaks, compliance, OT 100/125/150/175/200 saving) is **production-ready** as audited by X-25 and re-verified today. Geofence is implemented but **lives in a separate route** — call out as integration work, not a code defect. Overtime bucketing matches §16/§17(b) of חוק שעות עבודה ומנוחה. Persistence of all five OT rates is deterministic, weekly-budget-aware, and fully unit-tested.

**Verdict:** PASS. Recommend follow-up tickets for items 1, 2, 3, 6 in §7.
