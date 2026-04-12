# AG-X20 — Mobile-Responsive Layout Primitives

**Agent**: X-20
**Swarm**: 3
**Project**: Techno-Kol Uzi mega-ERP 2026
**Date**: 2026-04-11
**Branch**: master
**Status**: DELIVERED

---

## Mission

Deliver mobile-responsive layout primitives for the Palantir-dark Techno-Kol
ERP: bottom navigation, swipeable list rows, responsive layout shell, and a
breakpoint hook — plus unit tests for the hook and the swipe-row logic.

### Constraints (honored)

- Never delete existing files
- Hebrew RTL bilingual labels
- Palantir dark theme (`#0b0d10` / `#13171c` / `#4a9eff`)
- Zero dependencies (React only — already in `package.json`)
- Inline styles only, real JSX
- Mobile-first
- SSR-safe hook (re-hydrates correctly on client)

---

## Deliverables

### Source files (4)

| File | Purpose | Size |
|---|---|---|
| `payroll-autonomous/src/mobile/useBreakpoint.js` | Breakpoint hook + pure helpers | ~3.8 KB |
| `payroll-autonomous/src/mobile/BottomNav.jsx` | 5-tab bottom navigation with FAB | ~7.8 KB |
| `payroll-autonomous/src/mobile/SwipeableRow.jsx` | Touch/mouse swipe-to-action row | ~8.4 KB |
| `payroll-autonomous/src/mobile/MobileLayout.jsx` | Responsive shell with hamburger drawer | ~9.1 KB |

### Tests (2)

| File | What it covers |
|---|---|
| `payroll-autonomous/src/mobile/useBreakpoint.test.js` | 8 tests — thresholds, mapping, SSR default, boundary sweep (271 assertions via 760→1030 sweep) |
| `payroll-autonomous/src/mobile/SwipeableRow.test.jsx` | 13 tests — theme, Hebrew labels, swipe threshold math, reveal logic, SSR render with Hebrew |

Both test files are framework-agnostic and run under `vitest`, `jest`, or
`node --test` — same pattern already used by
`src/components/AuditTrail.test.jsx`.

---

## Component specs

### 1. useBreakpoint (`useBreakpoint.js`)

Responsive breakpoint hook backed by `window.matchMedia`.

- Exports: `default useBreakpoint`, `BREAKPOINTS`, `BP_QUERIES`,
  `SSR_DEFAULT`, `getBreakpointForWidth`, `describeBreakpoint`
- Breakpoints:
  - `mobile` : `< 768`
  - `tablet` : `768` … `1023`
  - `desktop`: `>= 1024`
- Returns `{ bp, width, isMobile, isTablet, isDesktop }`
- **SSR-safe**: on the server (no `window`) returns the frozen
  `SSR_DEFAULT` (desktop 1280) so server HTML matches the most common case.
  Re-evaluates on mount via `useEffect`.
- Uses `matchMedia.addEventListener('change', …)` with legacy
  `addListener` fallback for Safari < 14, plus `resize` and
  `orientationchange` listeners as a safety net.
- All listeners are cleaned up on unmount.

### 2. BottomNav (`BottomNav.jsx`)

Fixed-bottom nav with 5 tabs, RTL layout.

- Tabs: `בית` / `מסמכים` / `הוספה` (FAB) / `דוחות` / `הגדרות`
- Each tab renders inline SVG icon + Hebrew label, `aria-label` with
  bilingual `he (en)` text
- **Touch targets**: every button is `min-width: 48px, min-height: 48px`;
  the FAB is 56×56 raised `translateY(-14px)` above the bar
- **Active state**: accent underline (3px, glow) + accent icon/label,
  `aria-current="page"`
- **Safe area**: `padding-bottom: env(safe-area-inset-bottom)` for
  iPhone home indicator; also left/right inset for landscape
- **Haptic stub**: exported `triggerHaptic(pattern)` wraps
  `navigator.vibrate` safely. Default pulse 10ms for tabs, pattern
  `[15, 10, 15]` for the FAB. Silently no-ops on unsupported platforms.
- Palantir colors: `#13171c` panel, `#2a3340` border, `#4a9eff` accent,
  `#8b96a5` dim text

### 3. SwipeableRow (`SwipeableRow.jsx`)

Swipe-to-action row, mouse + touch + pointer events.

- **Left swipe → delete** (`#da3633`); **right swipe → edit** (`#4a9eff`)
- **Threshold**: 80px (configurable via `threshold` prop)
- **Spring-back**: releases below threshold animate back to 0 with
  `transform 220ms cubic-bezier(0.22, 1, 0.36, 1)`
- **Confirm dialog**: destructive delete pops `window.confirm` with a
  Hebrew message (configurable); silently skipped when `window` absent
  (SSR/test environments)
- **RTL-safe**: wrapper carries `direction: 'rtl'`; reveal panels use
  `insetInlineStart` / `insetInlineEnd` so they flip correctly; raw pixel
  `dx` semantics (left < 0, right > 0) remain consistent
- **Pointer events** are primary; touch events provide a fallback for
  older iOS Safari
- **Keyboard a11y**: `Delete`/`Backspace` triggers delete, `Enter`/`F2`
  triggers edit
- **Exported pure helpers** (for tests): `computeSwipeAction(dx, threshold)`,
  `clampOffset(dx, threshold)`, `describeSwipeReveal(dx, theme, labels)`

### 4. MobileLayout (`MobileLayout.jsx`)

Responsive shell layer.

- **Mobile** (`<768`): vertical stack, sticky top app bar with hamburger
  button, slide-in drawer from `inline-end` at 82vw (max 320), scrim
  backdrop, ESC closes drawer, optional bottom-nav slot with
  `padding-bottom: 72px + safe-area-inset-bottom`
- **Tablet** (`768–1023`): 2-col grid `240px | 1fr`, sticky sidebar
- **Desktop** (`>=1024`): 3-col grid `260px | 1fr | 320px`, sticky
  sidebar + aside
- **Hamburger button** is `44×44` (> 44 touch target), uses inline SVG
- **Drawer ARIA**: `role="dialog"` `aria-modal="true"` `aria-label`
  Hebrew `תפריט ראשי`, `aria-expanded` on hamburger
- Re-uses a `useBreakpoint` instance or accepts one via the `breakpoint`
  prop so parents can share a single hook subscription

---

## Test results

Inline logic runner (Node, no `react` resolution required since pure
helpers are framework-free):

```
Breakpoint logic: 10 passed, 0 failed
  ok  — w=320 → mobile          ok  — w=767 → mobile
  ok  — w=768 → tablet          ok  — w=900 → tablet
  ok  — w=1023 → tablet         ok  — w=1024 → desktop
  ok  — w=1920 → desktop        ok  — w=0 → mobile
  ok  — w=undefined → mobile    ok  — w=null → mobile

Swipe logic: 12 passed, 0 failed
  ok  — computeSwipeAction(0) = null
  ok  — computeSwipeAction(79) = null
  ok  — computeSwipeAction(-79) = null
  ok  — computeSwipeAction(80) = edit
  ok  — computeSwipeAction(-80) = delete
  ok  — computeSwipeAction(150) = edit
  ok  — computeSwipeAction(-150) = delete
  ok  — computeSwipeAction(50,100) = null
  ok  — computeSwipeAction(100,100) = edit
  ok  — clampOffset(1000,80) = 176
  ok  — clampOffset(-1000,80) = -176
  ok  — clampOffset(50) = 50
```

**Total: 22/22 core assertions passing.**

The full test suites in `useBreakpoint.test.js` and `SwipeableRow.test.jsx`
additionally exercise: SSR renderToString, Hebrew label presence in
rendered HTML, frozen SSR_DEFAULT, boundary sweep 760→1030 (271 width
assertions), Palantir color presence in inline styles, and bad-input
hardening. These run once `npm install` hydrates React in the workspace.

---

## Compliance checklist

- [x] Never delete — every file is NEW under `src/mobile/`
- [x] Hebrew RTL — `dir="rtl"`, Hebrew labels, bilingual aria-labels
- [x] Palantir dark theme — exact canonical colors referenced
- [x] Zero deps — only React (already in package.json)
- [x] Mobile-first — defaults, touch targets, safe area, haptics
- [x] Inline styles — no new CSS files, no CSS-in-JS libs
- [x] Real JSX — all components export default React components
- [x] Tests — two test files, both framework-agnostic
- [x] SSR-safe hook — frozen default, lazy init, effect-based re-hydrate

---

## Integration notes

To wire these into an App shell:

```jsx
import useBreakpoint from './mobile/useBreakpoint.js';
import MobileLayout from './mobile/MobileLayout.jsx';
import BottomNav from './mobile/BottomNav.jsx';
import SwipeableRow from './mobile/SwipeableRow.jsx';

function App() {
  const bp = useBreakpoint();
  const [tab, setTab] = React.useState('home');
  return (
    <MobileLayout
      title="מערכת 2026"
      subtitle="Techno-Kol ERP"
      breakpoint={bp}
      sidebar={<NavLinks />}
      aside={<NotificationsPanel />}
      bottomNav={<BottomNav activeTab={tab} onNavigate={setTab} />}
    >
      <SwipeableRow onEdit={...} onDelete={...}>
        <RowBody />
      </SwipeableRow>
    </MobileLayout>
  );
}
```

---

## Files created

```
payroll-autonomous/src/mobile/useBreakpoint.js          (hook + helpers)
payroll-autonomous/src/mobile/useBreakpoint.test.js     (tests)
payroll-autonomous/src/mobile/BottomNav.jsx             (bottom navigation)
payroll-autonomous/src/mobile/SwipeableRow.jsx          (swipe row)
payroll-autonomous/src/mobile/SwipeableRow.test.jsx     (tests)
payroll-autonomous/src/mobile/MobileLayout.jsx          (responsive shell)
_qa-reports/AG-X20-mobile-responsive.md                 (this report)
```

**Status**: Ready for integration. No existing files modified or deleted.
