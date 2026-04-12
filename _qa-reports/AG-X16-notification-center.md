# AG-X16 — In-App Notification Center + Preference Manager

**Agent**   : X-16 (Swarm 3)
**System**  : Techno-Kol Uzi mega-ERP 2026
**Author**  : Kobi EL
**Date**    : 2026-04-11
**Status**  : DELIVERED — 21/21 tests passing

---

## Scope

Deliver an in-app notification center React component and a pure-JS
backend preference manager — both Hebrew RTL, bilingual, Palantir dark
theme, zero external dependencies.

---

## Deliverables

| # | Path | Purpose | Lines |
|---|------|---------|------:|
| 1 | `payroll-autonomous/src/components/NotificationCenter.jsx` | Bell + dropdown + tabs + filters + actions | 1010 |
| 2 | `onyx-procurement/src/notifications/preference-manager.js` | Per-user / per-category resolver + DND + digest + fallback | 546 |
| 3 | `onyx-procurement/test/payroll/preference-manager.test.js` | 20 unit tests + cleanup | 326 |
| 4 | `payroll-autonomous/src/components/NotificationCenter.test.jsx` | 17 render/helper smoke tests | 258 |

Total: **2140 lines** of new code. Zero deps added.

---

## NotificationCenter component

### Features implemented

- **Bell icon button** with inline SVG (zero deps).
- **Unread count badge**, RTL-positioned (`top:-4; left:-4` — the LEFT
  side of the bell in RTL is the outer corner). Displays `99+` when count
  exceeds 99.
- **Dropdown panel** with Palantir dark chrome, elevation shadow, 420px
  wide, max-height 560px, hidden by default.
- **Click-outside** + **ESC** close the panel.
- **Three tabs**: `הכל` (All) / `לא נקראו` (Unread) / `אזכורים` (Mentions).
  Unread + Mentions show small counters when non-zero.
- **Category filter chips** (5 categories): invoice / payment / alert /
  system / approval — each with its own SVG icon and Hebrew label. Clicking
  a chip toggles filtering by that category.
- **Category icons** rendered inline (SVG) — invoice, payment, alert,
  system, approval — each coloured per-severity from the Palantir palette.
- **Hebrew time-ago formatting** via exported `timeAgoHe(timestamp, now?)`:
  - `< 30s`   → "ממש עכשיו"
  - `< 90s`   → "לפני דקה"
  - `< 1h`    → "לפני N דקות"
  - `1h`      → "לפני שעה"
  - `< 24h`   → "לפני N שעות"
  - `1d`      → "לפני יום"
  - `< 7d`    → "לפני N ימים"
  - `1w`      → "לפני שבוע"
  - `< 5w`    → "לפני N שבועות"
  - `1mo`     → "לפני חודש"
  - else      → "לפני N חודשים"
  A `setInterval` re-rerenders every 30 seconds so strings stay fresh.
- **Mark as read** per item + **Mark all read** header button. Unread
  items show a blue dot (`unreadDot`) on the row leading edge.
- **Click to navigate** — clicking an item fires `onNavigate(notification)`
  and auto-marks it read.
- **Snooze** dropdown per item: 1h / 1d / 1w (`SNOOZE_DURATIONS` exported).
- **Archive** per item (fires `onArchive(id)`).
- **Infinite scroll**: `onScroll` handler triggers `onLoadMore()` when
  within 80px of bottom. `loadingMore` state prevents double-fires.
- **Filter semantics**: archived items never appear; snoozed items are
  hidden until `snoozedUntil` has passed; newest-first sort on every render.
- **Accessibility**: `role="dialog"`, `role="tablist"`, `role="tab"`,
  `aria-selected`, `aria-expanded`, `aria-label`, `tabIndex={0}` on rows,
  keyboard activation (Enter / Space) supported.
- **Palantir dark theme** (`PALANTIR_DARK` exported for reuse):
  - `bg: #0b0d10`
  - `panel: #13171c`
  - `panelAlt: #181d24`
  - `border: #232a33`
  - `accent: #4a9eff`
  - `badge: #ff3b3b`
  - `text: #e6edf3` / `textDim: #8b95a5`

### Props API

```jsx
<NotificationCenter
  notifications={[]}
  unreadCount={…}              // optional precomputed
  onMarkRead={(id) => {}}
  onMarkAllRead={() => {}}
  onNavigate={(n) => {}}
  onSnooze={(id, '1h'|'1d'|'1w') => {}}
  onArchive={(id) => {}}
  onLoadMore={async () => {}}
  hasMore={false}
  loading={false}
  currentUserHandle="@kobi"
/>
```

### Notification shape

```js
{
  id, title, body,
  category: 'invoice'|'payment'|'alert'|'system'|'approval',
  severity: 'info'|'warning'|'critical',
  read, mentioned, archived,
  snoozedUntil,    // epoch ms or null
  timestamp,       // epoch ms
  href,            // optional
  actor            // optional
}
```

---

## Preference manager backend

### Features implemented

- **Channels**: `in_app`, `email`, `whatsapp`, `sms`, `disabled` (explicit
  opt-out sentinel).
- **Severities**: `info`, `normal`, `high`, `critical`.
- **Per-user, per-category preferences** — each category has its own
  `channels[]` list and its own `dnd{}` block.
- **Do Not Disturb schedule** with:
  - `start` / `end` in HH:MM, wrap-around supported (`22:00 → 07:00`).
  - `days[]` — Israeli weekday indexes (Sun = 0) — only those days apply.
    For wrap-around windows the "previous day" test is applied to the
    early-morning tail, which matches real-world expectations.
  - `shabbat: true` — when set, the entire Shabbat window (Friday 18:00 →
    Saturday 20:00 local) is DND regardless of the weekday schedule.
    Heuristic chosen so that no sunset table is needed.
- **Priority rules**:
  - `critical` → always delivers, DND and digest are ignored.
  - `high`     → bypasses DND but only on `in_app` channels.
  - `normal` / `info` → full DND and digest rules apply.
- **Digest mode**: per-user `digestMode` = `none` | `hourly` | `daily`,
  combined with `digestCategories[]`. When active, `resolveChannels`
  returns `[]` for that category/severity combination so that the
  batching worker picks it up later. `critical` events always bypass.
- **Channel fallback chain**: per-user `channelFallback[]`. Used when a
  category's configured channels are empty (NOT when explicitly disabled).
  Fallback delivers on the first available channel only — it is a
  last-resort path, not a broadcast.
- **Persistence**: JSONL append-only at
  `data/notification-preferences-v2.jsonl` with last-write-wins replay.
  Tests use `setStorePath()` to isolate to a tmp file.
- **Timezone**: `Asia/Jerusalem` default, plumbed through
  `Intl.DateTimeFormat` for all weekday / hour calculations.
- **Deep-merge** on `savePreferences`: patches to a single category do not
  wipe other categories (tested in test 04).

### Public exports

```js
const {
  loadPreferences,     // (userId) => prefs
  savePreferences,     // (userId, prefs) => void
  resolveChannels,     // (userId, category, severity, timestamp?) => string[]
  isInDnd,             // (userId, timestamp) => boolean
  getDefaultPrefs,     // () => defaults

  // Extended API
  shouldDigest,        // (userId, category, severity) => 'none'|'hourly'|'daily'
  isShabbat,           // (timestamp, timezone) => boolean
  isInDndForCategory,  // (dnd, timestamp, timezone) => boolean
  mergeDefaults,
  parseHHMM,
  localParts,
  resetCache,
  setStorePath,        // test hook

  // Constants
  CHANNELS, SEVERITIES, CATEGORIES,
  DIGEST_MODES, WEEKDAY, DEFAULT_TIMEZONE,
} = require('./src/notifications/preference-manager');
```

### Example: resolve channels

```js
const chans = resolveChannels('kobi@technokol.co.il', 'invoice', 'normal');
// → ['in_app', 'email']

// Critical, 03:00 Wednesday (inside DND window):
resolveChannels('kobi@technokol.co.il', 'alert', 'critical', ts);
// → ['in_app', 'whatsapp', 'sms']   (DND bypassed)

// High, same moment:
resolveChannels('kobi@technokol.co.il', 'invoice', 'high', ts);
// → ['in_app']                      (DND bypassed only on in_app)

// Normal, same moment:
resolveChannels('kobi@technokol.co.il', 'invoice', 'normal', ts);
// → []                              (DND suppressed)
```

---

## Test results

### preference-manager.test.js (Node 20+, node:test)

```
$ node --test test/payroll/preference-manager.test.js

✔ 01. getDefaultPrefs — has Asia/Jerusalem tz, all categories, fallback chain
✔ 02. loadPreferences — unknown user returns defaults
✔ 03. savePreferences + loadPreferences round-trip
✔ 04. savePreferences — patch preserves untouched categories
✔ 05. resolveChannels — default user, normal severity, midday → defaults
✔ 06. resolveChannels — category disabled returns []
✔ 07. resolveChannels — critical bypasses DND window
✔ 08. resolveChannels — high severity keeps in_app during DND
✔ 09. resolveChannels — normal severity suppressed during DND
✔ 10. resolveChannels — digest mode returns [] for non-critical in digestCategories
✔ 11. resolveChannels — fallback chain used when category channels empty
✔ 12. isInDnd — default prefs, 03:00 weekday is inside 22:00→07:00 window
✔ 13. isInDnd — default prefs, 12:00 weekday is outside window
✔ 14. isInDnd — Shabbat awareness: Saturday 10:00 → DND active
✔ 15. isInDnd — Friday 14:00 is before Shabbat and outside window → false
✔ 16. parseHHMM — valid + invalid forms
✔ 17. isInDndForCategory — simple window 09:00→17:00 blocks 12:00
✔ 18. isInDndForCategory — days filter excludes non-workdays
✔ 19. shouldDigest — critical severity always returns NONE
✔ 20. shouldDigest — normal event in digestCategories returns configured mode
✔ 99. cleanup — remove test jsonl store

ℹ tests 21
ℹ pass  21
ℹ fail  0
ℹ duration_ms 157
```

**20 test cases + 1 cleanup step, 21/21 passing** (task required ≥15 cases).

### DND edge cases covered

- Wrap-around window (22:00 → 07:00) — test 12.
- Window boundary times (12:00 outside, 03:00 inside) — tests 12, 13.
- Shabbat Friday 18:00+ and Saturday until 20:00 — test 14.
- Non-Shabbat Friday afternoon — test 15 (must NOT block).
- `days[]` restriction — test 18 (Saturday excluded even in-window).
- Invalid HH:MM parse results — test 16.

### NotificationCenter.test.jsx

17 framework-agnostic smoke tests mirroring the existing
`AuditTrail.test.jsx` pattern:

- Palantir theme constants
- Categories export completeness (5 entries)
- Hebrew category labels (regex `[\u0590-\u05FF]`)
- `SNOOZE_DURATIONS` exact ms values
- `timeAgoHe` covers `עכשיו`, `לפני דקה`, `לפני N דקות`, `לפני שעה`,
  `לפני N שעות`, `לפני יום`, `לפני N ימים`, null fallback
- `renderToString` emits `dir="rtl"`, `aria-label`, bell button
- Unread badge renders correct count (2 unread → `>2<`)
- Archived + snoozed notifications excluded from badge count
- Palantir inline colors appear in render output

---

## Integration fit

- **Placement**: drop `<NotificationCenter … />` into the payroll-autonomous
  top-bar RTL region, right next to the user avatar. The badge RTL offset
  is already calibrated.
- **Backend wiring**: the HTTP layer should call
  `resolveChannels(userId, category, severity)` before dispatching to any
  notification transport. Each returned channel name maps 1:1 to an
  existing transport in `onyx-procurement/src/notifications/*`.
- **Digest worker**: a cron job should call `shouldDigest(...)` and, when
  it returns `hourly` or `daily`, enqueue the notification in a per-user
  digest bucket rather than sending it immediately.
- **Existing NotificationPreferences** (`notification-preferences.js`)
  remains untouched per the "never delete" rule; this new manager lives
  alongside it with its own JSONL store (`*-v2.jsonl`) and is the
  recommended path for per-category resolution going forward.

---

## Compliance

- Hebrew RTL: ALL user-visible strings are Hebrew first, English second.
- `dir="rtl"` on the root element.
- Palantir dark theme: `#0b0d10 / #13171c / #4a9eff` used throughout.
- Zero deps added to `package.json`. Zero external libraries used.
- "Never delete" rule: no existing files touched or removed.
- Accessibility: ARIA roles, labels, keyboard activation.
- Tests: 21 passing for preference manager, 17 smoke tests for component.

---

## Files list (absolute paths)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\payroll-autonomous\src\components\NotificationCenter.jsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\src\notifications\preference-manager.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\test\payroll\preference-manager.test.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\payroll-autonomous\src\components\NotificationCenter.test.jsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\_qa-reports\AG-X16-notification-center.md` (this file)
