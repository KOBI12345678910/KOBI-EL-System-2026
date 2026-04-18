# AG-Y022 — Sales Leaderboard (engine + UI)

**Agent:** Y-022
**Program:** Techno-Kol Uzi mega-ERP 2026
**Date:** 2026-04-11
**Status:** GREEN — 61/61 tests passing
**Rule honored:** לא מוחקים רק משדרגים ומגדלים — all files net-new, nothing deleted or renamed.

---

## 1. Mission

Ship a zero-dependency Sales Leaderboard for the mega-ERP:

- A pure, deterministic ranking **engine** with seven metrics, tiebreaking, movement tracking, and a milestone badge system.
- A React **UI component** that renders the leaderboard in Hebrew RTL on the Palantir dark theme, with sortable columns, movement arrows, badge icons, current-user highlighting, a time-period selector, and a "Your rank: #X" banner.
- A unit-test suite that covers ranking, movement, badges, formatting, and tiebreaking.
- This report.

No existing files were modified. No features were removed.

## 2. Deliverables

| File | Role | LOC |
|---|---|---|
| `onyx-procurement/src/sales/leaderboard.js` | Ranking engine (CommonJS, zero deps) | ~520 |
| `payroll-autonomous/src/components/SalesLeaderboard.jsx` | React UI component (zero deps beyond React) | ~700 |
| `onyx-procurement/test/sales/leaderboard.test.js` | node:test unit tests | ~430 |
| `_qa-reports/AG-Y022-leaderboard.md` | This report | — |

---

## 3. Engine — `onyx-procurement/src/sales/leaderboard.js`

### 3.1 Public API

```js
const {
  rank,            // rank(salespeople, metric, period) -> ranked array
  movement,        // movement(current, previous)       -> map<id, info>
  generateBadges,  // generateBadges(salesperson)       -> badge[]
  metricValue,     // extractor for a single metric
  formatMetric,    // display formatter (he-IL locale)
  findRank,        // convenience for "your rank: #X"
  METRICS, PERIODS, BADGE_CATALOG, ...constants
} = require('./sales/leaderboard');
```

### 3.2 Supported metrics

| Constant | Key | Formula |
|---|---|---|
| `METRIC_REVENUE` | `revenue` | `sp.revenue` |
| `METRIC_MARGIN` | `margin` | `sp.revenue - sp.cogs` |
| `METRIC_DEALS_CLOSED` | `deals-closed` | `sp.dealsClosed` |
| `METRIC_CONVERSION_RATE` | `conversion-rate` | `dealsClosed / (dealsClosed + dealsLost)` (0..1) |
| `METRIC_AVG_DEAL_SIZE` | `avg-deal-size` | `revenue / dealsClosed` |
| `METRIC_NEW_CUSTOMERS` | `new-customers` | `sp.newCustomers` |
| `METRIC_ATTAINMENT` | `attainment` | `revenue / quota` (0..n) |

Every extractor is safe on zero / missing / non-numeric inputs and never throws. Unknown metrics silently fall back to revenue (forgiving policy).

### 3.3 Periods

`month` | `quarter` | `year` — the engine treats the period as metadata on each row; the caller is responsible for pre-filtering period data before calling `rank()`. Unknown periods fall back to `month`.

### 3.4 Ranking algorithm

Competition ranking ("1224" / dense ranking when metric values collide):

```
sort rows DESC by:
  1. metricValue         (primary)
  2. revenue             (universal sanity anchor)
  3. dealsClosed
  4. name  (ASC, he-IL locale-aware collation)
  5. id    (ASC, final deterministic anchor)

assign ranks:
  for each row:
    if metricValue == prev metricValue -> same rank as prev
    else                                -> rank = current position
```

So `revenue=[100, 80, 80, 50]` → ranks `[1, 2, 2, 4]`. If **all** rows tie on metricValue they all get rank `1`, but the printed order is still deterministic via the secondary tiebreakers.

### 3.5 Movement

`movement(current, previous)` walks `current` and looks up each id in `previous`, producing:

| direction | condition | delta |
|---|---|---|
| `up` | `previousRank > currentRank` | positive (how many places gained) |
| `down` | `previousRank < currentRank` | negative |
| `same` | identical rank | `0` |
| `new` | id only exists in current | `null` |

Ids that exist in `previous` but not in `current` are **not** emitted — a dropped seller isn't a ghost entry in the new period.

### 3.6 Badge catalog

| Badge | Trigger | HE | EN | Symbol | Color | Tier |
|---|---|---|---|---|---|---|
| `first-sale` | `dealsClosed >= 1` OR `firstSaleAt` set | מכירה ראשונה | First Sale | star | `#f0c674` | 1 |
| `ten-deals` | `dealsClosed >= 10` | 10 עסקאות | 10 Deals Closed | trophy | `#4a9eff` | 2 |
| `hundred-k` | `revenue >= 100,000` | ₪100K הכנסות | 100K Revenue | coin | `#3fb950` | 2 |
| `quarter-million` | `revenue >= 250,000` | ₪250K הכנסות | 250K Revenue | gem | `#a371f7` | 3 |
| `million` | `revenue >= 1,000,000` | ₪1M מועדון המיליון | Million Club | crown | `#e86bb5` | 4 |
| `beat-quota` | `quota > 0 AND revenue/quota >= 1` | יעד הושלם | Beat Quota | target | `#39c5cf` | 3 |
| `win-streak` | `winStreak >= 5` | רצף ניצחונות | Win Streak | flame | `#ff8b5b` | 2 |
| `hot-streak` | `winStreak >= 10` | רצף לוהט | Hot Streak | bolt | `#f85149` | 4 |
| `century-club` | lifetime deals (current + history) `>= 100` | מועדון המאה | Century Club | shield | `#8cb4ff` | 4 |
| `rookie-of-month` | `sp.isRookieOfMonth === true` (externally flagged) | כוכב עולה | Rookie of the Month | sparkle | `#d29922` | 3 |

The catalog is `Object.freeze`-d. `generateBadges()` always returns **copies** so a caller mutating a returned badge cannot corrupt the catalog — this is covered by a dedicated test.

Badges are returned in catalog declaration order (deterministic render). Legacy badges attached via `sp.badges = ['hot-streak', ...]` are honored by the engine, so migrated records keep their awards even if the current metrics wouldn't re-earn them.

### 3.7 Zero-dependency guarantee

The only imports in the engine are — literally none. No Node built-ins, no third-party libs, CommonJS `module.exports`. It runs anywhere JavaScript runs: Node, the browser (via a bundler), a web worker, or a Deno sandbox.

---

## 4. UI — `payroll-autonomous/src/components/SalesLeaderboard.jsx`

### 4.1 Layout (Hebrew RTL, Palantir dark)

```
┌─────────────────────────────────────────────────────────────────────┐
│  לוח מובילי המכירות                     [חודש | רבעון | שנה]        │
│  Sales Leaderboard                       month / quarter / year     │
├─────────────────────────────────────────────────────────────────────┤
│  המיקום שלך  #4                  אני: יוסי כהן — הכנסות ₪ 187,000   │
│  Your rank                                                           │
├─────────────────────────────────────────────────────────────────────┤
│  דירוג | שם       | תנועה | הכנסות | רווח | עסקאות | המרה | ... | תגים │
│ ────── + ───────── + ───── + ─────── + ───── + ─────── + ───── + ... + ───── │
│  🥇 1   | קרול     |  ▲ 2  | ₪1.2M  | ₪800K | 8      | 80%  |     | 🏆🪙💎👑 │
│  🥈 2   | אליס     |  ▲ 1  | ₪500K  | ₪300K | 15     | 75%  |     | 🏆🪙🎯 │
│  🥉 3   | בוב      |  ▼ 2  | ₪300K  | ₪200K | 20     | 66%  |     | 🏆🔥 │
│★ 4   | יוסי כהן  |  →    | ₪187K  | ₪90K  | 12     | 60%  |     | 🏆🪙 │
│  5      | איב      | חדש   | ₪150K  | ₪90K  | 10     | 100% |     | 🏆🪙🎯🔥 │
└─────────────────────────────────────────────────────────────────────┘
```

Legend: current user row is highlighted with `rgba(74, 158, 255, 0.14)` + an "אני" pill next to the name; rank 1-3 show a colored medal (gold / silver / bronze).

### 4.2 Theme

```js
export const LEADERBOARD_THEME = {
  bg:      '#0b0d10',  // app bg
  panel:   '#13171c',  // panel / table
  panel2:  '#1a2028',  // zebra stripe
  border:  '#2a3340',
  text:    '#e6edf3',
  textDim: '#8b96a5',
  accent:  '#4a9eff',  // active column, accent borders
  success: '#3fb950',  // "up" arrow
  warning: '#d29922',
  danger:  '#f85149',  // "down" arrow
  highlightRow: 'rgba(74, 158, 255, 0.14)',
};
```

Matches `BIDashboard.jsx` / `LiveDashboard.jsx` — same Palantir palette.

### 4.3 Interactions

- **Sortable columns** — click any metric header to re-sort. Active column is painted in `accent`, aria-sort `descending`, keyboard accessible via Enter / Space.
- **Period selector** — a segmented control (tab list) with three tabs: חודש / רבעון / שנה. Emits `onPeriodChange(period)`. Works controlled or uncontrolled.
- **Movement arrows** — up (green triangle), down (red inverted triangle), same (dim dash + `0`), new (accent "חדש" pill). Every arrow exposes an `aria-label` like `"עלייה של 3 מקומות"`.
- **Rank medals** — rank 1 gold, rank 2 silver, rank 3 bronze (filled circles with contrasting digit); 4+ is a neutral circle. All pure inline SVG.
- **Badges** — pure inline SVG glyphs (star / trophy / coin / gem / crown / target / flame / bolt / shield / sparkle), `<title>` tooltip in Hebrew. Zero icon fonts, zero image assets.
- **Highlight current user** — `currentUserId` prop highlights the row, flips the name to bold, adds an "אני" pill, and drives the "Your rank: #X" banner at the top. If the user is not found in the current period, the banner degrades to a dashed-border "לא נמצאו נתונים" card instead.
- **Empty state** — "אין נתוני מכירות להצגה" with English subtitle.

### 4.4 Accessibility

- Root `dir="rtl"` with bilingual labels (HE primary, EN subtitle via `direction: ltr`).
- Table uses `<th scope="col">`, `aria-sort`, `role="columnheader"`, `role="table"`, `aria-label`.
- Current-user row carries `aria-current="true"`.
- "Your rank" banner uses `role="status" aria-live="polite"` so assistive tech announces rank changes.
- Movement arrows and badges all have `aria-label` / `<title>` elements.
- `fontVariantNumeric: 'tabular-nums'` prevents digit-width jitter when values update.
- System font stack includes Heebo / Assistant / Rubik for proper Hebrew rendering.

### 4.5 Engine wiring

The component imports the engine via `require('../../../onyx-procurement/src/sales/leaderboard.js')`, wrapped in a `try/catch`. If the require fails (e.g. the file is used standalone in a Storybook or a unit test that mocks the engine), the component falls back to **local mirrors** of `rank`, `movement`, `generateBadges`, and `formatMetric`. This keeps the component renderable in isolation and makes it robust to bundler configuration — which is critical for an ERP that's deployed in heterogeneous environments.

The defensive fallback is intentional: when the bundler *does* resolve the path (normal deployment), the engine wins automatically. The mirror exists purely as a safety net.

### 4.6 Zero-dependency guarantee

Nothing beyond React (`useState`, `useMemo`, `useCallback`). All icons, arrows, medals, and charts are inline `<svg>` elements generated at render time. No `lucide-react`, no `heroicons`, no `@radix-ui`, no CSS framework.

---

## 5. Tests — `onyx-procurement/test/sales/leaderboard.test.js`

Run with:

```
cd onyx-procurement
node --test test/sales/leaderboard.test.js
```

### 5.1 Results

```
ℹ tests    61
ℹ suites   0
ℹ pass     61
ℹ fail     0
ℹ duration_ms ~165
```

### 5.2 Matrix

| # | Suite | Test |
|---|---|---|
| 1 | metricValue | revenue |
| 2 | metricValue | margin = revenue - cogs |
| 3 | metricValue | deals-closed |
| 4 | metricValue | conversion-rate = closed / (closed + lost) |
| 5 | metricValue | conversion-rate with zero denominator is 0 |
| 6 | metricValue | avg-deal-size = revenue / dealsClosed |
| 7 | metricValue | avg-deal-size with zero deals is 0 |
| 8 | metricValue | new-customers |
| 9 | metricValue | attainment = revenue / quota |
| 10 | metricValue | attainment with zero quota is 0 |
| 11 | metricValue | unknown metric falls back to revenue |
| 12 | metricValue | null / non-object input returns 0 |
| 13 | rank | empty / non-array input returns [] |
| 14 | rank | sorts by revenue desc |
| 15 | rank | sorts by deals-closed desc |
| 16 | rank | sorts by conversion-rate desc |
| 17 | rank | sorts by attainment desc |
| 18 | rank | sorts by margin desc |
| 19 | rank | sorts by new-customers desc |
| 20 | rank | sorts by avg-deal-size desc |
| 21 | rank | unknown metric falls back to revenue |
| 22 | rank | unknown period falls back to month |
| 23 | rank | does not mutate input array |
| 24 | rank | filters out rows with no id |
| 25 | rank | attaches metricValue / metric / period to each row |
| 26 | tiebreak | equal primary metric → revenue desc |
| 27 | tiebreak | equal primary metric AND revenue → dealsClosed desc |
| 28 | tiebreak | all numeric keys equal → name asc (he-IL) |
| 29 | tiebreak | everything equal (including name) → id asc |
| 30 | tiebreak | Hebrew names collate correctly (אבי < דני) |
| 31 | tiebreak | all-tied rows get the SAME rank, order still stable |
| 32 | tiebreak | true ties on primary metric get SAME rank |
| 33 | tiebreak | mixed ranks (1,2,2,4) when only some rows tie |
| 34 | movement | empty inputs return empty map |
| 35 | movement | up arrow when rank improved |
| 36 | movement | down arrow when rank worsened |
| 37 | movement | same when rank unchanged |
| 38 | movement | new when id only in current |
| 39 | movement | ids only in previous are ignored |
| 40 | movement | integrates with rank() across two periods |
| 41 | generateBadges | null / non-object is safe |
| 42 | generateBadges | first-sale awarded for 1+ deal |
| 43 | generateBadges | first-sale also awarded when firstSaleAt present |
| 44 | generateBadges | ten-deals requires 10+ |
| 45 | generateBadges | revenue tiers stack (100k/250k/1M) |
| 46 | generateBadges | beat-quota requires attainment >= 100% |
| 47 | generateBadges | beat-quota not awarded when quota is 0 |
| 48 | generateBadges | win-streak thresholds (5 and 10) |
| 49 | generateBadges | century-club uses lifetime deals (current + history) |
| 50 | generateBadges | returns badges in catalog order (deterministic) |
| 51 | generateBadges | honors legacy badges[] on the record |
| 52 | generateBadges | returns a copy (mutation cannot corrupt catalog) |
| 53 | formatMetric | revenue formatted with ₪ |
| 54 | formatMetric | conversion-rate formatted as percent |
| 55 | formatMetric | attainment formatted as percent |
| 56 | findRank | returns rank for known id |
| 57 | findRank | returns null for missing id |
| 58 | BADGE_CATALOG | every entry has required fields |
| 59 | BADGE_CATALOG | frozen (prevents mutation) |
| 60 | METRICS | contains all seven required metrics |
| 61 | PERIODS | month / quarter / year |

### 5.3 Coverage notes

- **Ranking:** all seven metrics are exercised with a shared 5-person team fixture (`ALICE`, `BOB`, `CAROL`, `DAN`, `EVE`), each chosen so the ranking flips depending on which metric you pick. This catches extractor bugs that would otherwise hide behind a single metric.
- **Tiebreaking:** five-layer ladder is tested end-to-end, including Hebrew collation (אבי vs דני) and final id-order determinism when every other key is equal.
- **Movement:** up / down / same / new / dropped-from-previous paths all covered, including the full integration path where `rank()` feeds `movement()` on two shifted team snapshots.
- **Badges:** every badge trigger — including the `quota=0` guard — is covered. A mutation-safety test proves a caller can't corrupt `BADGE_CATALOG` by poking at the returned object.
- **Defensive inputs:** `null`, `undefined`, scalar-as-object, missing ids, non-array inputs — all return empty results, never throw.

---

## 6. UI screenshot notes

Screenshots are captured via a host app; this file documents *what* the screenshots should show so a reviewer can confirm parity with design intent without committing binary PNGs (per the "no binaries in docs" convention).

**S1 — leaderboard-default.png**
- Route: any host that mounts `<SalesLeaderboard salespeople={TEAM} period="month" currentUserId={...} />`.
- Expected:
  - Header "לוח מובילי המכירות" (HE) + "Sales Leaderboard" (EN subtitle) on the left (logical start).
  - Period selector (3 tabs) on the right (logical end), "חודש" active in accent blue.
  - "המיקום שלך #X" banner below, gradient from accent-blue to panel.
  - Table with sticky header, 5 rows, zebra stripes.
  - Rank 1 gold medal, rank 2 silver, rank 3 bronze.
  - Current user row highlighted in translucent accent blue.

**S2 — sort-by-deals-closed.png**
- Click the "עסקאות שנסגרו" header.
- Active header turns accent blue with a ▼ glyph.
- Rows re-sort: Bob → Alice → Eve → Carol → Dan.
- Movement column: Bob goes from ▼2 to ▲1, etc.

**S3 — period-year.png**
- Click "שנה" in the period selector.
- Year data flows in, Your-rank banner updates.

**S4 — movement-arrows.png**
- Visible up/down/same/new states in the Movement column. Green ▲ with +N, red ▼ with +N, dim — for same, accent "חדש" pill for new entries.

**S5 — badges-tooltip.png**
- Hover a badge. Native `<title>` tooltip shows the HE name (e.g. "מועדון המיליון").

**S6 — empty-state.png**
- Pass `salespeople={[]}`. Row reads "אין נתוני מכירות להצגה".

---

## 7. Hebrew glossary (נגישות + לוקליזציה)

| HE | EN | Used in |
|---|---|---|
| לוח מובילי המכירות | Sales Leaderboard | page title |
| המיקום שלך | Your rank | your-rank banner |
| דירוג | Rank | column header |
| שם | Name | column header |
| תנועה | Movement | column header |
| הכנסות | Revenue | metric column |
| רווח גולמי | Gross Margin | metric column |
| עסקאות שנסגרו | Deals Closed | metric column |
| שיעור המרה | Conversion Rate | metric column |
| גודל עסקה ממוצע | Avg Deal Size | metric column |
| לקוחות חדשים | New Customers | metric column |
| עמידה ביעד | Quota Attainment | metric column |
| תגים | Badges | column header |
| חודש | Month | period tab |
| רבעון | Quarter | period tab |
| שנה | Year | period tab |
| אני | Me | highlight pill on current-user row |
| חדש | New | movement pill for new entrants |
| עלייה | Rise | aria-label for up arrow |
| ירידה | Fall | aria-label for down arrow |
| ללא שינוי | No change | aria-label for same marker |
| אין נתוני מכירות להצגה | No sales data | empty state |
| לא נמצאו נתוני מכירות עבור המשתמש הנוכחי בתקופה זו | No sales data for current user in this period | your-rank empty state |
| מכירה ראשונה | First Sale | badge |
| 10 עסקאות | 10 Deals Closed | badge |
| ₪100K הכנסות | 100K Revenue | badge |
| ₪250K הכנסות | 250K Revenue | badge |
| מועדון המיליון | Million Club | badge |
| יעד הושלם | Beat Quota | badge |
| רצף ניצחונות | Win Streak | badge |
| רצף לוהט | Hot Streak | badge |
| מועדון המאה | Century Club | badge |
| כוכב עולה | Rookie of the Month | badge |

All labels are short enough to fit a narrow column, use the correct gender-neutral phrasing for a commercial ERP, and avoid loanwords where native Hebrew is equally clear.

---

## 8. Integration notes

### 8.1 Mounting the component

```jsx
import SalesLeaderboard from './components/SalesLeaderboard';

const TEAM = await api.getSalespeople({ period: 'month' });
const PREV = await api.getSalespeople({ period: 'month', offset: -1 });

<SalesLeaderboard
  salespeople={TEAM}
  previous={PREV}
  currentUserId={session.userId}
  period={period}
  onPeriodChange={setPeriod}
/>
```

### 8.2 Calling the engine from a backend route

```js
const { rank, movement, generateBadges } = require('./sales/leaderboard');

app.get('/api/sales/leaderboard', requireAuth, (req, res) => {
  const metric = req.query.metric  || 'revenue';
  const period = req.query.period  || 'month';
  const team = salesRepo.forPeriod(period);
  const prev = salesRepo.forPeriod(previousOf(period));

  const current = rank(team, metric, period);
  const prior   = rank(prev, metric, period);
  const move    = movement(current, prior);

  const enriched = current.map((row) => ({
    ...row,
    movement: move[row.id],
    badges:   generateBadges(row),
  }));

  res.json({ period, metric, rows: enriched });
});
```

The engine has zero server-side dependencies, so it slots into any existing route, job, or export path.

### 8.3 Extending the badge catalog

Because `BADGE_CATALOG` is frozen, new badges should be added directly to `leaderboard.js` (append-only — never delete). The UI will pick them up automatically via catalog order. A follow-up migration can read legacy `sp.badges[]` arrays so a DB-stored earned-badge history remains the source of truth.

---

## 9. Compliance checklist

| Rule | Status |
|---|---|
| לא מוחקים רק משדרגים ומגדלים — no deletions | PASS — all files net-new |
| Hebrew RTL + bilingual labels | PASS — root `dir="rtl"`, HE primary + EN subtitle everywhere |
| Palantir dark theme (#0b0d10 / #13171c / #4a9eff) | PASS — colors match BIDashboard/LiveDashboard |
| Engine exports: `rank`, `movement`, `generateBadges` | PASS |
| Metrics: revenue, margin, deals-closed, conversion-rate, avg-deal-size, new-customers, attainment | PASS — all 7 |
| Periods: month / quarter / year | PASS |
| Movement arrows up/down/same | PASS — plus `new` for entrants |
| Badges: first sale, 10 deals, 100k revenue, beat quota, win streak | PASS — plus 250k, 1M, hot-streak, century-club, rookie (growth, not deletion) |
| SVG-only badges | PASS — every glyph is pure inline `<svg>` |
| Sortable columns | PASS — click or Enter/Space, aria-sort exposed |
| Current-user highlighting | PASS — row background, bold name, "אני" pill |
| "Your rank: #X" header | PASS — gradient banner, aria-live polite |
| Period selector (month/quarter/year) | PASS — segmented tab-list control |
| Zero dependencies | PASS — engine imports nothing; UI imports only React |
| Tests cover ranking / movement / badges / tiebreaking | PASS — 61/61 |
| QA report never deleted | PASS — net-new file, will be preserved |

## 10. Follow-ups (optional, not blocking)

- Add a drill-down action on each row (wire `onRowClick(salespersonId)` to an existing CRM/HR route).
- Persist last-selected period / metric per user in `localStorage` with the existing `settings` endpoint.
- Wire live updates through the existing SSE hub (`AG-X13`) so the leaderboard refreshes in real time on new deals.
- Generate and commit screenshots once a host app route is available.
- Extend `history` ingestion to use the existing `analytics` pipeline so `century-club` reflects warehouse data instead of an embedded array.

## 11. Sign-off

- **Tests:** 61/61 passing
- **Lint:** N/A (no ESLint config change in scope)
- **Runtime:** Node >= 18 for `node:test`; React >= 17 for the component
- **Status:** READY FOR INTEGRATION

— Agent Y-022
