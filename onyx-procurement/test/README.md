# onyx-procurement / test

Shared test harness for all ONYX agents. Built on Node.js's built-in
`node:test` runner. **No jest, no mocha, no extra dependencies.**

Agents 04, 05, 06, 07, 08, 09, 11, 12, 13, 14 drop their `*.test.js` files
under `test/` and plug into the helpers in `test/helpers/`.

---

## Running tests

```bash
# Run everything (matches package.json "scripts.test")
npm test

# Or directly via node
node --test test/

# Aggregated JSON summary (exit code reflects result)
node test/run-all.js
node test/run-all.js --json > test-summary.json

# A single file
node --test test/wage-slip-calculator.test.js
```

Requires **Node >= 20** (hard requirement from `package.json engines`).

---

## Layout

```
test/
├── README.md              ← this file
├── run-all.js             ← aggregator, JSON summary, exit-code-correct
├── helpers/
│   ├── mock-supabase.js   ← in-memory fake of @supabase/supabase-js
│   └── fixtures.js        ← sample rows (employer, employee, invoice, …)
├── fixtures/              ← static input files (CSV, MT940, PDF)
├── *.test.js              ← unit tests (pure functions, no I/O)
└── integration/*.test.js  ← integration tests (DB-backed via mock-supabase)
```

**Unit vs integration.** Unit tests live at the top level and exercise
pure functions (calculators, parsers, validators). Integration tests
live under `test/integration/` and wire multiple modules together,
usually via `makeMockSupabase()` as the data layer.

`run-all.js` discovers both. It ignores `helpers/` and `fixtures/`.

---

## Using `mock-supabase`

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeMockSupabase } = require('./helpers/mock-supabase');
const { sampleEmployer, sampleEmployee } = require('./helpers/fixtures');

test('fetches employees by employer_id', async () => {
  const db = makeMockSupabase({
    employers: [sampleEmployer()],
    employees: [
      sampleEmployee('employer-001', { id: 1 }),
      sampleEmployee('employer-001', { id: 2, first_name: 'דני' }),
    ],
  });

  const { data, error } = await db
    .from('employees')
    .select('id, first_name')
    .eq('employer_id', 'employer-001')
    .order('id', { ascending: true });

  assert.equal(error, null);
  assert.equal(data.length, 2);
  assert.deepEqual(data[0], { id: 1, first_name: 'משה' });
});
```

### Supported chain methods

| Category | Methods                                                              |
| -------- | -------------------------------------------------------------------- |
| Read     | `select(cols)`, `order(col,{ascending})`, `limit(n)`                 |
| Filters  | `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `is`                    |
| Terminal | `single()`, `maybeSingle()`                                          |
| Write    | `insert(rows)`, `update(patch)`, `upsert(rows,{onConflict})`, `delete()` |

`await`-ing the chain resolves to `{ data, error }` — same shape as the
real client. On UNIQUE conflict (see below) `error.code === 'MOCK_ERROR'`.

### UNIQUE constraints

Not enforced by default. Pass composite keys explicitly:

```js
const db = makeMockSupabase(
  { wage_slips: [] },
  { constraints: { wage_slips: [['employee_id', 'period']] } }
);
```

Inserting `{ employee_id: 1, period: '2026-03' }` twice will return
`{ data: null, error: { code: 'MOCK_ERROR', message: 'UNIQUE violation …' } }`.

### Call log & introspection

- `db._log` — every call in order, as `{ table, action, filters, columns, payload }`
- `db._snapshot(tableName)` — deep copy of the current rows
- `db._reset()` — clear all tables and the log
- `db._tables` — live reference (use with care)

### Auto-increment IDs

Inserts without an `id` get a serial integer, starting from the highest
seeded id + 1. Override by passing `id` explicitly.

---

## Fixtures

All factories return fresh deep-copyable objects. Pass overrides as the
last argument to customise.

```js
const { sampleInvoice, sampleCsvContent } = require('./helpers/fixtures');

const overdue = sampleInvoice({ status: 'overdue', due_date: '2026-01-01' });
const csv = sampleCsvContent(); // Hebrew headers + 3 rows
```

Available:

- `sampleEmployer(overrides)`
- `sampleEmployee(employer_id, overrides)` — monthly
- `sampleHourlyEmployee(employer_id, overrides)`
- `sampleTimesheet(overrides)` — standard 182 hours
- `sampleWageSlip(employee_id, employer_id, overrides)`
- `sampleCustomer(overrides)`
- `sampleInvoice(overrides)`
- `sampleBankTransaction(overrides)`
- `sampleCsvContent()` — Hebrew-header CSV string, 3 rows
- `sampleMt940Content()` — MT940 statement string

---

## Adding a new test

1. Create `test/<module-name>.test.js` (or `test/integration/<flow>.test.js`).
2. Require the module under test via an absolute-from-root path:
   ```js
   const path = require('path');
   const target = require(path.resolve(__dirname, '..', 'src', 'payroll', 'x.js'));
   ```
3. Pull shared helpers:
   ```js
   const { makeMockSupabase } = require('./helpers/mock-supabase');
   const { sampleEmployee }   = require('./helpers/fixtures');
   ```
4. Use `node:test` + `node:assert/strict`:
   ```js
   const { test } = require('node:test');
   const assert = require('node:assert/strict');
   test('something', async () => { /* ... */ });
   ```
5. Verify it runs in isolation: `node --test test/<your-file>.test.js`
6. Verify it runs in the suite: `node test/run-all.js`

**Conventions.**

- Keep unit tests pure — no real network, no real filesystem writes
  outside of `os.tmpdir()`.
- Integration tests should reset state with `db._reset()` between cases
  (or build a fresh `db` per test).
- Use the fixtures factories instead of hand-rolling rows — that keeps
  the data shape consistent across agents.
- Don't import from another agent's `*.test.js` — put shared code in
  `test/helpers/` instead.
