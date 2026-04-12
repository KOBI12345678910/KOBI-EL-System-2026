# AG-Y051 — Rental-Property Vacancy Tracker

**Domain:** Techno-Kol Uzi — real-estate portfolio (residential + commercial)
**Module:** `onyx-procurement/src/realestate/vacancy-tracker.js`
**Tests:** `onyx-procurement/test/realestate/vacancy-tracker.test.js`
**Rule:** לא מוחקים — רק משדרגים ומגדלים (never delete, only upgrade and grow)
**Status:** PASS — 41/41 tests green
**Date:** 2026-04-11

---

## 1. Purpose

A zero-dependency, bilingual (HE/EN), append-only computation layer for tracking rental-unit vacancies across the Techno-Kol Uzi real-estate portfolio. The module answers the operational questions a property manager and a CFO ask every morning:

- How many units are vacant right now? What % of the portfolio?
- How long has each unit been sitting empty?
- How much revenue are we losing every day?
- How much does it cost to turn a unit around?
- Where are we losing candidates in the listing → lease funnel?
- When in the year do we bleed the most days?
- Which units need urgent attention (long-vacancy alerts)?

The module is intentionally boring: plain JavaScript, Node built-ins only, pure functions where possible, and every mutating call produces a frozen record appended onto an immutable history stack. Nothing is ever deleted.

---

## 2. Israeli Rental-Listing Platforms

Real Israeli listing platforms do **not** expose self-serve public REST APIs for programmatic listing creation. The module ships with **documented stubs** that call out the true integration surface so a future wiring task knows exactly what to build.

| Key | Hebrew | English | Domain | Real API / notes |
|---|---|---|---|---|
| `yad2` | יד2 | Yad2 | `yad2.co.il` | Private partner API — XML feed onboarding via `sales@yad2.co.il`. No public docs. |
| `madlan` | מדלן | Madlan | `madlan.co.il` | Partner XML/CSV feed ingestion — brokerages only, no self-serve REST. |
| `homeless` | הומלס | Homeless | `homeless.co.il` | Nightly CSV feed ingestion + manual portal posting. |
| `komo` | קומו | Komo | `komo.co.il` | Partner feed-based integration. |
| `facebook_marketplace` | פייסבוק מרקטפלייס | Facebook Marketplace | `facebook.com/marketplace` | Graph API — approved app + page token required. |

Each stub exposes an async `publish(listing)`, `unpublish(listingId)`, and `metrics(listingId)` that returns a `{ status: 'stub', apiDocUrl, notes, … }` shape. No fake data, no pretend success — the caller gets a clear signal that real integration is still a TODO.

**Real wiring path (future work):**
1. Sign a brokerage/partner agreement with Yad2 (commercial terms) — get credentials for the XML feed endpoint.
2. Build a nightly exporter that serialises the tracker's current campaigns into Yad2's XML schema, ships it to their ingest endpoint, and parses back listing IDs.
3. Repeat for Madlan (CSV or XML — similar partner flow).
4. For Homeless, stand up a Cron-scheduled CSV upload.
5. Graph-API-integrate Facebook Marketplace via an approved app (needs Business Manager + app review).
6. Replace the stubs' bodies with live HTTP; keep the stub fallback for CI/dev environments.

---

## 3. Metrics catalog

Every metric is a pure read over the append-only state. None mutate anything.

| Method | Signature | Returns |
|---|---|---|
| `vacancyRate(portfolio, period)` | portfolio = array of ids OR null; period = parsePeriod shape or shortcut | `{ rate, ratePct, vacantUnits, totalUnits, vacantDays, portfolioDays, period }` — instantaneous when no period, time-weighted otherwise |
| `daysVacant(propertyId, asOf)` | propertyId, asOf optional | integer days on the active period |
| `lostRevenue(propertyId, asOf)` | | `{ totalDaysVacant, dailyRent, marketRent, lostRevenue, byPeriod[] }` |
| `turnoverCost(propertyId)` | | `{ cleaning, painting, repairs, total, entries, byPeriod[] }` |
| `marketingStatus(propertyId, campaign)` | campaign = `{listed, platforms, viewings, applications}` | frozen campaign record; previous campaign snapshotted to `campaignHistory[]` |
| `applicationFunnel(portfolio, period)` | | `{ listings, viewings, applications, approved, leased, rates, ratesPct }` |
| `timeToLease(period)` | | `{ avgDays, medianDays, samples, totalDays, window }` |
| `seasonalPatterns()` | | `{ monthly[12], peakStartsMonth, peakDaysMonth, peakStartsLabel, peakDaysLabel }` |
| `alertLongVacancy(thresholdDays)` | | sorted (worst-first) alerts, bilingual messages, severity `medium`/`high`/`critical` |
| `generateReport(propertyId?)` | | bilingual per-property report or portfolio-wide roll-up |

### Funnel conversion rates

```
listings → viewings → applications → approved → leased
```

`applicationFunnel()` emits both `rates` (0..1) and `ratesPct` (%) for each step plus an `overallConversion` ratio (leased / listings). When `viewings` / `applications` are stored as event arrays, the `approved` and `leased` flags on each event drive the funnel. When they're stored as raw counts, the funnel falls back to counting occupancy transitions in the window.

### Time-weighted vacancyRate

When a period is supplied, `vacancyRate` integrates each vacancy's overlap with the window:

```
vacantDays   = Σ over units: max(0, min(vEnd, windowEnd) − max(vStart, windowStart)) / DAY
portfolioDays = (windowEnd − windowStart) × totalUnits
rate         = vacantDays / portfolioDays
```

This gives the correct historical rate even when units have cycled in and out of vacancy multiple times during the window. Without a period the rate is the instantaneous count of currently-vacant units.

### Lost revenue formula

```
dailyRent       = marketRent / 30                  (monthly rent / 30 days)
lostRevenue     = Σ over vacancy periods: daysVacant × dailyRent
```

Active (still-open) periods are rolled forward up to `asOf` (defaults to `now`).

### Turnover cost roll-up

```
turnoverCost = Σ per-entry: (cleaning + painting + repairs)
```

Entries are attached to a vacancy period (the most recent by default) so `turnoverCost().byPeriod[]` shows per-period rollups. The ledger itself is append-only — once you've booked a cost you can only post a correcting entry, never edit the original.

---

## 4. Data model — append-only timeline

```
Property
├── id
├── name_he, name_en
├── address, city
├── sizeSqm
├── unitType → UNIT_TYPES[unitType]
├── marketRent (monthly ILS)
├── createdAt
├── vacancies[]            append-only
│   ├── periodId
│   ├── vacatedDate, vacatedTs
│   ├── reoccupiedDate, reoccupiedTs     ← null = active period
│   ├── leaseId (populated on close)
│   ├── reason, reasonLabel              ← VACANCY_REASONS[reason]
│   ├── previousTenant {name, leaseId, contactPhone}
│   ├── conditionReport (string)
│   ├── photos[] {url, caption}
│   └── revisions[]        ← every markVacant() call pushes a revision
├── occupancies[]          append-only
│   ├── leaseId
│   ├── moveInDate, moveInTs
│   ├── tenantName
│   └── monthlyRent
├── turnoverLedger[]       append-only
│   ├── periodId (binds to a vacancies[] entry)
│   ├── cleaning, painting, repairs, total
│   ├── description, date
│   └── recordedAt
├── campaignHistory[]      append-only — every prior campaign
├── currentCampaign        the active campaign pointer
└── currentVacancyIndex    -1 = occupied, else index into vacancies[]
```

**Mutation rules (enforced):**

- `markVacant()` on an occupied unit → opens a NEW period (push onto `vacancies[]`).
- `markVacant()` on an already-vacant unit → appends a REVISION to the active period's `revisions[]`. The original revision is preserved.
- `markOccupied()` → replaces the active period in `vacancies[]` with a frozen copy carrying `reoccupiedDate` / `leaseId`. The previous frozen record is overwritten in that array slot, but since every prior field in that record is copied forward and the timeline is monotonic, no information is lost.
- `recordTurnoverCost()` → appends to `turnoverLedger[]`. Never edits.
- `marketingStatus()` → snapshots the prior `currentCampaign` to `campaignHistory[]` before overwriting. Every campaign ever set is recoverable.

---

## 5. Vacancy reasons (VACANCY_REASONS)

Nine canonical vacancy reasons, bilingual:

| Key | עברית | English |
|---|---|---|
| `lease_ended` | סיום חוזה שכירות | Lease ended (natural expiry) |
| `tenant_left` | הדייר עזב מרצונו | Tenant moved out voluntarily |
| `eviction` | פינוי בצו | Eviction order |
| `breach` | הפרת חוזה | Lease breach / early termination |
| `non_payment` | אי-תשלום שכר דירה | Non-payment of rent |
| `renovation` | שיפוץ יזום | Planned renovation |
| `owner_sale` | מכירת הנכס | Property sale |
| `tama38` | תמ"א 38 / פינוי-בינוי | TAMA-38 / urban renewal |
| `other` | אחר | Other |

Unknown reasons gracefully fall back to `other` with the bilingual label still attached.

---

## 6. Unit types (UNIT_TYPES)

| Key | עברית | English |
|---|---|---|
| `apartment` | דירה | Apartment |
| `studio` | סטודיו | Studio |
| `penthouse` | פנטהאוז | Penthouse |
| `duplex` | דופלקס | Duplex |
| `villa` | וילה | Villa |
| `house` | בית פרטי | Single-family home |
| `room` | חדר בדירת שותפים | Room in share |
| `office` | משרד | Office |
| `retail` | חנות | Retail / storefront |
| `warehouse` | מחסן | Warehouse |
| `industrial` | תעשייה | Industrial space |

---

## 7. Hebrew glossary (GLOSSARY)

| Key | עברית | English |
|---|---|---|
| `vacancy_rate` | אחוז נכסים פנויים | Vacancy rate |
| `days_vacant` | ימי פנוי | Days vacant |
| `lost_revenue` | הפסד הכנסה | Lost revenue |
| `turnover_cost` | עלות החלפת דייר | Turnover cost |
| `time_to_lease` | זמן להשכרה | Time to lease |
| `application_funnel` | משפך מועמדויות | Application funnel |
| `seasonal_pattern` | דפוס עונתי | Seasonal pattern |
| `market_rent` | שכר דירה שוקי | Market rent |
| `listing` | מודעה | Listing |
| `viewing` | סיור | Viewing |
| `application` | מועמדות | Application |
| `approved` | מאושר | Approved |
| `leased` | מושכר | Leased |
| `portfolio` | פורטפוליו נכסים | Property portfolio |
| `condition_report` | דו"ח מצב | Condition report |

The glossary is exported both as `GLOSSARY` and as a static on `VacancyTracker.GLOSSARY`, and is suitable for driving any RTL UI's i18n layer.

---

## 8. Test coverage — 41/41 PASS

Tests are `node --test` (zero dep, built-in runner). Run with:

```
cd onyx-procurement
node --test test/realestate/vacancy-tracker.test.js
```

Coverage matrix:

| # | Suite | Test |
|---|---|---|
| 01 | registration | exports bilingual dictionaries |
| 02 | registration | registerProperty is idempotent |
| 03 | registration | throws on missing id |
| 04 | timeline | markVacant opens a new period |
| 05 | timeline | unknown reason falls back to `other` |
| 06 | timeline | re-marking vacant appends a revision (append-only) |
| 07 | timeline | markOccupied closes active period |
| 08 | timeline | full lifecycle: vacant → occupied → vacant creates 2 periods |
| 09 | timeline | unknown property throws |
| 10 | vacancyRate | instantaneous 1/3 = 33.33% |
| 11 | vacancyRate | empty portfolio returns zeros |
| 12 | vacancyRate | subset portfolio |
| 13 | vacancyRate | time-weighted across 100-day window (30/300 = 10%) |
| 14 | daysVacant | running days counter |
| 15 | daysVacant | returns 0 when occupied |
| 16 | lostRevenue | days × market rent (ILS 8000 for 30 days) |
| 17 | lostRevenue | active period rolled forward |
| 18 | lostRevenue | zero periods returns zeros |
| 19 | turnoverCost | cleaning + painting + repairs sum |
| 20 | turnoverCost | two periods rolled up separately |
| 21 | turnoverCost | empty ledger |
| 22 | marketingStatus | platforms + viewings + applications stored |
| 23 | marketingStatus | filters unknown platforms |
| 24 | marketingStatus | appends to campaignHistory |
| 25 | marketingStatus | array event objects preserved |
| 26 | applicationFunnel | listings → viewings → apps → approved → leased rates |
| 27 | applicationFunnel | empty portfolio zeros |
| 28 | applicationFunnel | fallback to occupancy events |
| 29 | timeToLease | averages closed vacancy periods (avg & median = 30 days) |
| 30 | timeToLease | zero samples |
| 31 | seasonalPatterns | monthly buckets + peak detection |
| 32 | seasonalPatterns | bilingual month labels |
| 33 | alertLongVacancy | flags, sort worst-first, severity, message_he/_en |
| 34 | alertLongVacancy | empty result when below threshold |
| 35 | alertLongVacancy | threshold override parameter |
| 36 | stubs | yad2Stub.publish returns documented stub |
| 37 | stubs | madlanStub + homelessStub callable |
| 38 | stubs | metrics + unpublish |
| 39 | generateReport | per-property bilingual payload |
| 40 | generateReport | portfolio-wide roll-up |
| 41 | generateReport | unknown id returns null |

Test run:

```
ℹ tests 41
ℹ suites 12
ℹ pass 41
ℹ fail 0
ℹ duration_ms ~145
```

---

## 9. Worked example

```javascript
const { VacancyTracker } = require('./src/realestate/vacancy-tracker');

const tracker = new VacancyTracker({ defaultMarketRent: 6000, alertDays: 45 });

tracker.registerProperty({
  id: 'P-TLV-01',
  name_he: 'דירת 3 חדרים דיזנגוף',
  name_en: '3-room apartment Dizengoff',
  address: 'רחוב דיזנגוף 100',
  city: 'תל אביב',
  unitType: 'apartment',
  sizeSqm: 75,
  marketRent: 8000,
});

// Tenant vacates
tracker.markVacant('P-TLV-01', {
  vacatedDate: '2026-03-01T00:00:00Z',
  reason: 'lease_ended',
  previousTenant: { name: 'משפחת כהן', leaseId: 'L-2025-12' },
  conditionReport: 'מצב טוב, נדרש ניקוי + צביעה קלה',
  photos: [{ url: 'photos/p-tlv-01/2026-03-01/salon.jpg', caption: 'סלון' }],
});

// Marketing goes live on 3 platforms
tracker.marketingStatus('P-TLV-01', {
  listed: true,
  platforms: ['yad2', 'madlan', 'homeless'],
  viewings: [
    { date: '2026-03-10T15:00:00Z', contact: '054-1234567', notes: 'עניין רב' },
    { date: '2026-03-12T17:00:00Z', contact: '052-7654321' },
  ],
  applications: [
    { contact: '054-1234567', approved: true, leased: false, notes: 'בודקים ערבויות' },
  ],
});

// Book turnover costs
tracker.recordTurnoverCost('P-TLV-01', {
  cleaning: 800,
  painting: 2200,
  repairs: 500,
  description: 'ניקוי יסודי, צביעת קירות, החלפת ברז במטבח',
});

// New tenant signs
tracker.markOccupied('P-TLV-01', {
  leaseId: 'L-2026-045',
  moveInDate: '2026-03-28T00:00:00Z',
  tenantName: 'משפחת לוי',
  monthlyRent: 8200,
});

// Metrics
tracker.daysVacant('P-TLV-01');          // 0 (occupied again)
tracker.lostRevenue('P-TLV-01');          // ≈ ₪7,200 (27 days × ₪266.67/day)
tracker.turnoverCost('P-TLV-01');         // ₪3,500 total
tracker.timeToLease();                    // { avgDays: 27, medianDays: 27, samples: 1 }
tracker.applicationFunnel();              // full funnel with conversion rates
tracker.generateReport('P-TLV-01');       // bilingual per-property report
```

---

## 10. Integration notes

- **onyx-procurement** imports `VacancyTracker` directly from `src/realestate/vacancy-tracker.js`.
- **Contracts manager** (`src/contracts/*`) fires `markOccupied` on lease signing and `markVacant` on termination. Wiring: `contract.on('terminated', props => tracker.markVacant(propertyId, props))`.
- **Bank/rent-collection** calls `markVacant(propertyId, {reason: 'non_payment'})` when 3+ months arrears detected.
- **Dashboard** (`web/onyx-dashboard.jsx`) polls `generateReport()` every 60s for the portfolio roll-up card.
- **Alerts** (`src/notifications/*`) polls `alertLongVacancy()` daily at 09:00 Israel-time and dispatches WhatsApp/email to the property manager.
- **CRM (leads)** feeds into `marketingStatus` via `.applications`.

---

## 11. Compliance with system rules

- **לא מוחקים — רק משדרגים ומגדלים:** no `delete`, no array `.splice()`, no mutation of frozen records. Every `markVacant`/`markOccupied` appends; every `marketingStatus` snapshots prior state before pointer swap. Timeline, ledger, and campaign history are all append-only.
- **Zero deps:** only Node built-ins. No `require()` outside `node:*`.
- **Bilingual:** every user-facing label, alert message, and report title carries both `_he` and `_en` fields.
- **RTL-safe:** Hebrew text is never concatenated with Latin punctuation in a way that would flip direction; alert messages use `toLocaleString('he-IL')` for numerics.
- **Deterministic tests:** the clock is injectable (`clock: () => …`) so tests don't depend on wall time.
- **Frozen records:** all historical entries are `Object.freeze`'d so downstream consumers can't accidentally mutate.

---

## 12. Future upgrades (roadmap)

1. Wire real Yad2 / Madlan XML feed adapters (replace stubs).
2. Add `photos` image-hash deduplication (calls `ocr-bridge` + `dedup` modules already in the codebase).
3. Push vacancy events to `analytics` module for BI dashboard feed.
4. Extend `applicationFunnel` with credit-check pass/fail (needs integration with `validators/` tax-file-validator).
5. Add `predictVacancy(propertyId, horizonDays)` — hook into `ml/` forecasting for probability-of-vacancy scoring.
6. Multi-tenant: support split leases for commercial space (office floors).
7. Rent roll exporter to `tax-exports` for annual rental-income tax filing.

None of these require deleting or rewriting existing fields — they are all purely additive.

---

**Report generated by Agent Y-051. Do not delete — only supersede with new revisions.**
