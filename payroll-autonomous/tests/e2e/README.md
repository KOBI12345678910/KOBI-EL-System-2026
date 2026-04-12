# payroll-autonomous — E2E tests

End-to-end tests for the `payroll-autonomous` React/Vite client, written in
[Playwright](https://playwright.dev/) (`@playwright/test`).

The suite is fully self-contained: every `/api/payroll/**` call is mocked via
`page.route`, so **no live backend server is required** to run the tests.
Only the Vite dev server (started automatically by `playwright.config.js`) is
needed on `http://localhost:5174`.

## Layout

```
tests/e2e/
  fixtures/
    mockData.js          # shared mock payload + installPayrollMocks() helper
  dashboard.spec.js      # dashboard KPIs + global theme/RTL/Hebrew checks
  employers.spec.js      # create-employer flow
  employees.spec.js      # create-employee flow
  compute-wage-slip.spec.js  # fill timesheet + preview calculated slip
  navigation.spec.js     # tab switching + keyboard accessibility
  README.md              # you are here
```

The Playwright config lives at the repo root: `../../playwright.config.js`.

## The five scenarios

1. **Dashboard** — four KPI cards (`עובדים פעילים`, `תלושים החודש`,
   `ברוטו חודשי`, `נטו חודשי`) render with the expected values derived from
   the mock dataset.
2. **Create employer** — open the "מעסיקים" tab, fill the form, submit, and
   verify the new employer shows up in the list and that the correct POST
   body was sent.
3. **Create employee** — same flow on the "עובדים" tab.
4. **Compute wage-slip preview** — pick an employee, fill overtime hours and
   a bonus, press "חשב תצוגה מקדימה", and verify the preview panel renders
   the calculated fields returned from the mock.
5. **Tab navigation** — click through all five tabs and verify each tab
   becomes active, plus verify the `Tab` key reaches the main action button
   on the employees screen.

## App-wide invariants asserted on every screen

- `html[dir="rtl"]`
- `body` background equals `#0b0d10` (dark Palantir theme)
- At least one Hebrew character (Unicode block U+0590–U+05FF) is rendered

These checks live in `fixtures/mockData.js` (`HEBREW_CHAR_RE`) and are
duplicated into each spec for isolation.

## Running locally

The repo does **not** declare `@playwright/test` as a dependency — install it
manually the first time you run the tests:

```bash
cd payroll-autonomous
npm install --save-dev @playwright/test
npx playwright install chromium    # downloads the headless Chromium binary
npm run test:e2e
```

To see the HTML report after a run:

```bash
npx playwright show-report
```

## Configuration highlights

From `playwright.config.js`:

- **Chromium only**, headless.
- **Screenshots on failure** (`screenshot: 'only-on-failure'`).
- **Trace retained on failure** for easier debugging (`trace: 'retain-on-failure'`).
- **Automatic webServer** — the config runs `npm run dev` and waits for
  port `5174`. Re-uses an already-running dev server when not in CI.
- Locale `he-IL`, timezone `Asia/Jerusalem`.

## Mock strategy

`installPayrollMocks(page)` is called inside each test's `beforeEach`. It
installs a single `page.route('**/api/payroll/**', ...)` handler that
answers all collection GETs, the compute preview, the create-employee,
create-employer, create-wage-slip, approve, and issue endpoints. Create
operations push onto an in-memory array so the subsequent reload shows the
new row — this is how the "verify in list" assertions succeed.

## Notes

- Tests are designed to be resilient to locale-specific number formatting by
  stripping commas/spaces before substring matches on money values.
- The `compute-wage-slip` spec intentionally does not hardcode tax values —
  it verifies that the labeled rows render and that the net value returned
  from the mock appears on the page.
- No backend, no DB, no network. If something fails, it's a client bug.
