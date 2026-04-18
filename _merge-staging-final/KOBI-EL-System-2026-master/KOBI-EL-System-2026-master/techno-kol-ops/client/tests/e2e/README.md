# techno-kol-ops — End-to-End tests (Playwright)

End-to-end test suite for the **techno-kol-ops** React client
(`client/` — Vite + React 18 + React Router + Zustand + AG Grid + Recharts,
with a Hebrew / RTL dashboard UI).

All tests run fully **mocked**: HTTP requests to `/api/**` are intercepted by
`page.route()` using the helper in `fixtures/mockApi.js`, so you do **not**
need a running Express backend, Postgres, or Supabase instance. A valid
auth token is injected into `localStorage` before every test so the login
screen is skipped.

---

## Layout

```
client/
├── playwright.config.js
└── tests/
    └── e2e/
        ├── README.md              (this file)
        ├── fixtures/
        │   └── mockApi.js         (route-level mock + in-memory DB)
        ├── ops-dashboard.spec.js  (dashboard loads, metrics, charts)
        ├── tickets.spec.js        (work-order create / update / close,
        │                           alert resolve flow)
        ├── rtl-hebrew.spec.js     (dir=rtl, lang=he, Hebrew across screens)
        ├── navigation.spec.js     (sidebar links, routes, toggle)
        ├── accessibility.spec.js  (alt, aria-label, labels, focus)
        └── responsive.spec.js     (mobile / tablet / desktop breakpoints)
```

---

## Prerequisites

Playwright is not yet a dependency of `client/package.json`. Install it once:

```bash
cd client
npm install --save-dev @playwright/test
npx playwright install
```

(If you only want the Chromium browser: `npx playwright install chromium`.)

---

## Running

From `client/`:

```bash
npm run test:e2e                        # headless, chromium + firefox
npm run test:e2e -- --ui                # interactive UI mode
npm run test:e2e -- --headed            # show the browser
npm run test:e2e -- --project=chromium  # only one browser
npm run test:e2e -- tests/e2e/ops-dashboard.spec.js   # one file
```

The config boots `npm run dev` (Vite) automatically before the run and tears
it down afterwards. If you already have the dev server running on port 3000,
export `E2E_SKIP_WEBSERVER=1` and Playwright will reuse it.

Override the base URL:

```bash
E2E_BASE_URL=http://localhost:4173 npm run test:e2e
```

---

## What each spec covers

### `ops-dashboard.spec.js`
* The `/` route boots with no `pageerror`.
* The five top metric cards are rendered:
  `הזמנות פעילות`, `הכנסה חודש נוכחי`, `עובדים נוכחים`,
  `אזהרות פתוחות`, `ניצולת מפעל`.
* The active-orders table renders all seven column headers and the seeded
  rows (`TK-1001`, `TK-1002`, `TK-1003`).
* The three Recharts panels are rendered (`svg.recharts-surface`).
* The navbar shows the `LIVE / OFFLINE` connection indicator. The
  WebSocket is blocked on purpose so OFFLINE is expected.
* Clicking the "הזמנות פעילות" metric navigates to `/work-orders`.

### `tickets.spec.js`
Work-order lifecycle:
* **Create**: opens the `+ הזמנה חדשה` modal, fills the form (client,
  product, material, category, price, advance, delivery date, priority),
  clicks `שמור הזמנה`, and asserts the `POST /api/work-orders` request
  fires with the correct body.
* **Update**: clicks a row in the AG Grid, confirms the side panel opens,
  moves the progress range slider and asserts
  `PUT /api/work-orders/:id/progress` fires.
* **Close**: hides the side panel via its `×` button.

Alert lifecycle on `/alerts`:
* Open alerts are listed (`מלאי נירוסטה נמוך`, `איחור במשלוח TK-1003`).
* Clicking resolve fires `PUT /api/alerts/:id/resolve`.

### `rtl-hebrew.spec.js`
* `<html lang="he" dir="rtl">` is correct on every screen.
* Each core route (`/`, `/work-orders`, `/clients`, `/alerts`) has
  `computed style direction: rtl` and Hebrew text visible.
* Currency formatting renders with the `₪` prefix.
* All sidebar section labels are rendered in Hebrew.

### `navigation.spec.js`
* Each core route mounts its expected Hebrew header.
* Clicking sidebar items navigates and swaps the visible screen.
* The navbar hamburger collapses and expands the sidebar.
* No `pageerror` and no significant `console.error` while touring routes.
  (WebSocket-related errors are filtered since the WS is blocked.)

### `accessibility.spec.js`
A lightweight, dependency-free scan for each core route:
1. Every `<img>` has an `alt` attribute.
2. Every `<button>`, `<a>`, `role="button"` has an accessible name
   (visible text, `aria-label`, `aria-labelledby`, or an icon child).
3. Every `<input>`, `<select>`, `<textarea>` has some label association
   (`aria-label`, a `<label for>`, a wrapping `<label>`, a sibling
   `<label>`, or a `placeholder` fallback).
4. `Tab` focus cycles to an interactive element.
5. `<html>` declares a `lang`.

The scan uses **soft budgets** for the initial baseline (e.g. up to 8
controls without accessible names) — the intent is to catch regressions
from today's state. Tighten those budgets as you fix issues.

> **Upgrading to `@axe-core/playwright`**: add it to `devDependencies`, then
> inside any test:
> ```js
> const AxeBuilder = require('@axe-core/playwright').default;
> const results = await new AxeBuilder({ page }).analyze();
> expect(results.violations).toEqual([]);
> ```

### `responsive.spec.js`
Three viewports:

| Name    | Width | Height |
| ------- | ----- | ------ |
| mobile  | 375   | 812    |
| tablet  | 768   | 1024   |
| desktop | 1440  | 900    |

For each one we assert that:
* the dashboard and `/work-orders` screens still render core content,
* the document does not overflow horizontally beyond the viewport
  (24 px tolerance for scrollbars),
* the sidebar hamburger toggle still works.

A dedicated `mobile-chrome` Playwright project (Pixel 5) also runs
`responsive.spec.js` and `rtl-hebrew.spec.js` end-to-end in real mobile
emulation.

---

## Mocking strategy

`fixtures/mockApi.js` exposes a single `installMocks(page, overrides?)`
helper that:

1. Injects `tk_token` + `tk_user` into `localStorage` via
   `page.addInitScript()` so the app boots straight into `<Layout>` and
   skips the `<Login>` screen.
2. Aborts all WebSocket requests (`ws://.../ws`) — the client's
   reconnect loop stays silent and the navbar shows `OFFLINE`.
3. Routes every `/api/**` request through an in-memory fake DB with
   realistic Hebrew data (clients, work orders, alerts, financials,
   weekly reports).
4. Supports the mutating endpoints the UI calls:
   * `POST /api/auth/login`
   * `POST /api/work-orders`
   * `PUT  /api/work-orders/:id`
   * `PUT  /api/work-orders/:id/progress`
   * `PUT  /api/alerts/:id/resolve`
5. Falls back to an empty array (`[]`) with HTTP 200 for any unknown
   `/api/**` endpoint so pages that request additional data never crash.

Need a test-specific dataset? Pass overrides:

```js
await installMocks(page, {
  workOrders: [{ id: 'TK-0001', client_name: 'my client', /* ... */ }],
});
```

The function returns the mutable `db`, so after a test action you can
also assert against the fake DB directly if needed.

---

## CI tips

* `CI=1 npm run test:e2e` enables retries (2) and `forbidOnly`.
* The HTML report lives in `client/playwright-report/` —
  run `npx playwright show-report` to open it.
* Traces are collected on first retry, screenshots on failure, and video
  is retained on failure.

---

## Adding new specs

* Import `{ installMocks }` from `./fixtures/mockApi` and call it in a
  `test.beforeEach`.
* Prefer role-based locators (`getByRole`, `getByText` with Hebrew text)
  over CSS selectors — the client uses inline styles and very few `id`s.
* Mock mutating endpoints at the route level (the fixture already
  handles the common ones).
* Keep specs under `tests/e2e/` with the `.spec.js` suffix so they match
  the `testMatch` glob in `playwright.config.js`.
