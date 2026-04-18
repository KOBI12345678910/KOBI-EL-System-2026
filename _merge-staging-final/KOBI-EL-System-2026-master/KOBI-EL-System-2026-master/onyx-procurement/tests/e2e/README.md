# onyx-procurement · Playwright E2E tests

**Agent 52 · Notification Routing QA + full front-end E2E coverage**

End-to-end + API-contract tests for the four dashboards Agents 26, 27, 28
and 29 delivered under `onyx-procurement/web/`:

| # | Dashboard          | File                          | Agent |
|---|--------------------|-------------------------------|-------|
| 1 | Mega Index landing | `index.html`                  | 29    |
| 2 | VAT reporting      | `vat-dashboard.html / .jsx`   | 26    |
| 3 | Bank reconciliation| `bank-dashboard.html / .jsx`  | 27    |
| 4 | Annual tax         | `annual-tax-dashboard.html / .jsx` | 28    |

The test suite is fully isolated from the real backend: a tiny
zero-dependency static HTTP server (`static-server.js`) ships the `/web`
folder and answers `/api/**` requests with 200 OK. Each spec overrides
individual routes with `page.route()` using the fixtures in `fixtures.js`.

---

## Quick start

```bash
# From the onyx-procurement root
npm install --save-dev @playwright/test
npx playwright install chromium

# Run the full suite against the bundled static server (recommended)
npx playwright test

# Run only one project (viewport)
npx playwright test --project=desktop-1920
npx playwright test --project=laptop-1280
npx playwright test --project=mobile-375

# Interactive / debugging
npx playwright test --ui
npx playwright test --headed --debug
```

## Run against a live backend

Start the Express server first, then override `PW_BASE_URL`:

```bash
# Terminal 1
node server.js                # listens on :3100 by default

# Terminal 2
PW_BASE_URL=http://localhost:3100 npx playwright test
```

When `PW_BASE_URL` is set the config skips its own `webServer` entry and
the `api-contract.spec.js` suite talks directly to your running Express.

---

## File layout

```
onyx-procurement/
├── playwright.config.js                 # top-level config (3 viewport projects)
└── tests/
    └── e2e/
        ├── README.md                    # this file
        ├── static-server.js             # zero-dep static webserver used by Playwright
        ├── fixtures.js                  # 20-row mock datasets + route mocker
        ├── mega-index.spec.js           # Agent 29 · index.html
        ├── vat-dashboard.spec.js        # Agent 26 · VAT
        ├── bank-dashboard.spec.js       # Agent 27 · Bank reconciliation
        ├── annual-tax-dashboard.spec.js # Agent 28 · Annual tax
        └── api-contract.spec.js         # APIRequestContext contract tests
```

---

## What each spec covers

Every dashboard spec runs against **all three viewports** (1920×1080,
1280×800, 375×812) automatically via `playwright.config.js` projects and
verifies:

1. **No console errors** — mounts cleanly, ignores benign font/favicon 404s.
2. **KPIs / headers visible** — at least the Hebrew tab labels + header
   brand render after React mounts.
3. **20-row mock tables** — each spec seeds its module with the 20-row
   fixture from `fixtures.js` and then asserts that at least 5 distinct
   rows show up in the rendered body text (doc numbers, references,
   project codes…). This is a deliberately forgiving check because the
   JSX renders the data in many different cells.
4. **Tab navigation** — clicks every nav button in sequence and asserts
   the page survives (no crash, no stuck spinner).
5. **Hebrew + RTL** — `<html lang="he" dir="rtl">` is present.
6. **Dark theme** — computed `background-color` of `body` must have an
   RGB sum < 120 (anything darker than `#404040`).
7. **Responsive** — `documentElement.scrollWidth ≤ window.innerWidth + 12`
   at every viewport, so no horizontal overflow.

### `api-contract.spec.js`

Uses Playwright's `APIRequestContext` (no browser) to GET every endpoint
the dashboards depend on and verify the response is JSON-shaped. Also
runs a handful of **fixture self-tests** that are always executed (row
counts, severity coverage, fiscal-year 23 % rate) — these guarantee the
fixture file stays in sync with what the dashboards expect.

---

## Fixtures overview

Defined in `fixtures.js` and exported under `fixtures.*`:

| Key                    | Rows | Used by                          |
|------------------------|------|----------------------------------|
| `VAT_PROFILE`          | 1    | VAT — profile tab                |
| `VAT_PERIODS`          | 12   | VAT — periods tab (Jan–Dec 2026) |
| `VAT_INVOICES`         | 20   | VAT — invoices tab               |
| `BANK_ACCOUNTS`        | 5    | Bank — accounts tab + overview   |
| `BANK_TRANSACTIONS`    | 20   | Bank — transactions tab          |
| `BANK_MATCHES`         | 10   | Bank — reconcile tab             |
| `BANK_DISCREPANCIES`   | 6    | Bank — discrepancies tab         |
| `BANK_SUMMARY`         | —    | Bank — overview KPI cards        |
| `ANNUAL_PROJECTS`      | 20   | Annual tax — projects tab        |
| `ANNUAL_CUSTOMERS`     | 20   | Annual tax — customers tab       |
| `ANNUAL_INVOICES`      | 20   | Annual tax — invoices tab        |
| `ANNUAL_PAYMENTS`      | 20   | Annual tax — payments tab        |
| `ANNUAL_FISCAL_YEARS`  | 3    | Annual tax — fiscal-year tab     |

All amounts use `₪` formatting with `he-IL` locale. Dates are ISO
`YYYY-MM-DD`. Seeds are deterministic so snapshots stay stable.

To mock the routes in a new spec:

```js
const { installMocks, collectConsole } = require('./fixtures');

test.beforeEach(async ({ page }) => {
  await installMocks(page);       // intercepts every /api/** GET
});
```

`installMocks()` answers:

* **GET** `/api/**` → the matching fixture (or `{}` if unknown)
* **POST/PUT/DELETE/PATCH** `/api/**` → `{ ok: true, id: <ts> }`

---

## Viewports / projects

| Project         | Viewport     | Device          | What it catches              |
|-----------------|--------------|-----------------|------------------------------|
| `desktop-1920`  | 1920 × 1080  | Desktop Chrome  | Wide layout, side panels     |
| `laptop-1280`   | 1280 × 800   | Desktop Chrome  | Mid-range layout             |
| `mobile-375`    | 375 × 812    | iPhone 13       | Stacked layout, touch nav    |

All specs are authored to work at every width. The responsive test in
each spec asserts there's no horizontal overflow at the active viewport.

---

## Troubleshooting

* **Babel standalone transform is slow on first run.** The HTML bootstrap
  downloads `@babel/standalone` from `unpkg.com` on first hit and Babel
  then transpiles `*-dashboard.jsx` in the browser — this can take
  several seconds. Every spec sets `test.setTimeout(60_000)` for this
  reason. A real production build should replace this with a bundled JS
  file.
* **Tests hang at startup.** Make sure nothing else is listening on port
  4319 (or set `PW_PORT=xxxx`).
* **Hebrew text appears as question marks.** The test locale is forced to
  `he-IL` via `playwright.config.js`; if your editor shows mojibake open
  this file as UTF-8.
* **Running against the real backend times out.** The real `/api/vat/**`
  endpoints need `X-API-Key`. Set it with
  `localStorage.setItem('onyx_api_key', '…')` in a `page.addInitScript`,
  or expose the key via `VITE_API_KEY` env var.

---

## Adding a new dashboard spec

1. Drop the new HTML/JSX in `web/` following the existing bootstrap
   pattern.
2. Add a fixture entry in `fixtures.js` and register it in
   `ROUTE_FIXTURES`.
3. Copy one of the existing `*-dashboard.spec.js` files as a template
   and retarget selectors.
4. Run `npx playwright test --project=desktop-1920 <new-spec>` until
   green, then enable all three viewports.

---

## Related QA documents

This spec suite implements the E2E layer called for in the following
QA agent docs already present in `onyx-procurement/`:

* `QA-AGENT-11-UI-COMPONENTS.md`
* `QA-AGENT-35-I18N-RTL.md`
* `QA-AGENT-36-MOBILE.md`
* `QA-AGENT-140-VAT-REPORT.md`
* `QA-AGENT-142-BANK-RECON.md`
* `QA-AGENT-141-ANNUAL-TAX.md`
* `QA-AGENT-52-NOTIFY-ROUTING.md` (this agent)

---

**Author:** Agent 52 · 2026-04-11 · Rule: never delete existing files.
