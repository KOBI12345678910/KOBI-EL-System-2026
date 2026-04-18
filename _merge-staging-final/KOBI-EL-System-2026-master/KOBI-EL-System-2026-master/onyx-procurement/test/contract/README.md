# API Contract Testing Framework

Zero-dependency contract testing for the onyx-procurement HTTP API.
Built by **Agent 54**.

This folder defines the expected shape of every HTTP endpoint and
provides a lightweight runner that can validate the real server's
responses against those shapes — status code, headers, and body.

---

## Why contract tests?

Unit tests pin individual functions. Integration tests pin flows.
**Contract tests pin the public API surface** — the shape other teams
(and the frontend, and any client SDK) actually rely on.

A contract test asks exactly one question for every endpoint:

> *"Does the server still return what the schema says it returns?"*

If the answer is no, either the server changed (bug) or the contract
changed (breaking change that should be communicated). Either way the
test fails loudly before the change ships.

---

## Files in this folder

| File | Purpose |
| --- | --- |
| `contract-schema.js` | Data-only registry of 20 endpoints. Each one declares request shape, response shape per status code, and success/error examples. |
| `contract-runner.js` | Zero-dep HTTP client + schema-lite validator + `ContractRunner` class. |
| `contract-runner.test.js` | `node:test` suite that exercises the runner and validates the registry is internally consistent. |
| `fixtures/expected-shapes.json` | Snapshot of the registry used for diffing and drift detection. |
| `README.md` | This file. |

No npm packages, no AJV, no supertest. Everything runs on Node >= 18
with only `node:http`, `node:https`, and `node:test`.

---

## Quick start

### Run the runner's own tests

```bash
node --test test/contract/contract-runner.test.js
```

Or via the repo's existing runner:

```bash
node test/run.js --only contract
```

All tests are pure (they use an injected stub `httpClient`), so they
pass without a running server.

### Validate the live server

```js
const { ContractRunner } = require('./test/contract/contract-runner');
const { schemas } = require('./test/contract/contract-schema');

const runner = new ContractRunner({
  baseUrl: 'http://localhost:3000',
  defaultHeaders: { 'x-api-key': process.env.QA_API_KEY },
  schemas,
});

(async () => {
  // Run one endpoint.
  const r = await runner.runEndpoint('GET /api/suppliers', { query: { page: 1 } });
  if (!r.ok) {
    console.error('CONTRACT BROKEN:', r.errors);
    process.exit(1);
  }

  // Or run every endpoint in the registry against the live server.
  const report = await runner.runAll();
  console.log(`${report.passed}/${report.total} endpoints pass`);
})();
```

---

## Schema-lite dialect

The registry uses a tiny, self-contained schema DSL defined in
`contract-runner.js`. It intentionally avoids JSON Schema / OpenAPI
so you never have to touch YAML or pull an external validator.

### Primitive tags

| Tag            | Matches                                    |
| -------------- | ------------------------------------------ |
| `string`       | `typeof v === 'string'`                    |
| `number`       | finite number                              |
| `integer`      | `Number.isInteger`                         |
| `boolean`      | `true`/`false`                             |
| `array`        | `Array.isArray`                            |
| `object`       | plain object (not array, not null)         |
| `null`         | exactly `null`                             |
| `uuid`         | RFC4122 UUID                               |
| `iso-date`     | `YYYY-MM-DD`                               |
| `iso-datetime` | RFC3339, with `Z` or `+hh:mm`              |
| `email`        | `a@b.c`                                    |
| `url`          | `http(s)://...`                            |
| `any`          | anything (including null/undefined)        |

Append `?` to mark a field as optional: `'email?'`, `'integer?'`,
`'object?'`, etc.

### Composite shapes

**Nested objects** — just nest a plain object:

```js
{
  id: 'uuid',
  user: {
    email: 'email',
    name: 'string',
  },
}
```

**Arrays** — use `[T]` where `T` is any schema:

```js
{ items: [ { id: 'uuid', qty: 'integer' } ] }
```

An empty array template `[]` means "any array, don't validate items".

**Custom predicate** — pass a function that returns `true` or an error message:

```js
{ amount: (v) => v > 0 || 'must be positive' }
```

### Header expectations

Headers use case-insensitive regex strings:

```js
{
  'content-type': '^application/json',
  'x-ratelimit-*': '^\\d+$',   // wildcard: matches every X-RateLimit-* header
}
```

A trailing `*` turns the key into a **wildcard** that requires at
least one matching header and validates every one of them.

### Error envelope

`SHAPES.errorBody` defines the canonical error body:

```js
{
  error:      'string',    // human-readable message
  code:       'string?',   // stable machine code (e.g. "auth.invalid_credentials")
  details:    'object?',   // anything the server wants to attach
  request_id: 'string?',
}
```

`SHAPES.validationErrorBody` adds an optional `fields` array for 422s.

The helper `standardErrors({ include: [...] })` returns the full
set of 400/401/403/404/422/500 schemas so endpoints can spread them in:

```js
responses: {
  201: { status: 201, headers: HEADERS.jsonResponse, body: SHAPES.supplier },
  ...standardErrors({ include: [400, 401, 403, 422, 500] }),
},
```

---

## Adding a new endpoint

1. Open `contract-schema.js`.
2. Add a new entry to the `schemas` object keyed by `"METHOD /path"`.
3. Fill out `request`, `responses`, and both `examples.success` and
   `examples.error`.
4. Re-run the runner tests — they will catch a lot of drift for you:

   ```bash
   node --test test/contract/contract-runner.test.js
   ```

   In particular, the sanity tests enforce:
   - every endpoint has request + responses + examples,
   - every endpoint declares at least one 2xx and one 4xx,
   - every example success body validates against its own schema,
   - every example error body validates against its own schema.

5. Regenerate the fixture snapshot if you consider the new shape
   stable (see next section).

---

## Fixture snapshot (`fixtures/expected-shapes.json`)

`fixtures/expected-shapes.json` is a structural snapshot of the
registry. It's checked in so CI can detect unintended changes to the
public API contract — if a PR changes a shape, the diff shows up in
the snapshot.

The snapshot stores, per endpoint:
- every declared status code,
- the shape of every response body as a JSON-friendly tree,
- the header expectations,
- the request shape,
- and a copy of each example.

### When to regenerate

Regenerate **on purpose** — treat a snapshot change like a lockfile
change. Ideally in the same PR where you change the schema.

A tiny script to regenerate it looks like:

```js
// regenerate-snapshot.js (not committed — run manually when needed)
const fs = require('fs');
const path = require('path');
const { schemas } = require('./contract-schema');

fs.writeFileSync(
  path.join(__dirname, 'fixtures', 'expected-shapes.json'),
  JSON.stringify(schemas, null, 2),
);
```

---

## Pre-populated endpoints

The registry ships with **20** endpoints covering every domain the
procurement system currently exposes:

### Auth (3)
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET  /api/auth/me`

### Suppliers (5)
- `GET    /api/suppliers`
- `POST   /api/suppliers`
- `GET    /api/suppliers/:id`
- `PATCH  /api/suppliers/:id`
- `DELETE /api/suppliers/:id`

### Invoices (3)
- `GET  /api/invoices`
- `POST /api/invoices`
- `GET  /api/invoices/:id`

### Payroll (3)
- `GET  /api/payroll/runs`
- `POST /api/payroll/runs`
- `GET  /api/payroll/wage-slip/:employee_id`

### VAT (2)
- `GET  /api/vat/periods`
- `POST /api/vat/report`

### Bank (2)
- `POST /api/bank/statements/upload`
- `GET  /api/bank/reconciliations`

### Annual Tax (2)
- `POST /api/annual-tax/reports`
- `GET  /api/annual-tax/:year`

Every endpoint declares at least one 2xx success response **and** the
standard error responses `400`, `401`, `403`, `404`, `422`, `500`
where they apply.

---

## What the runner does NOT do

- **Does not generate fixtures from OpenAPI** — the registry is hand-written so it documents intent, not just reality.
- **Does not support `$ref`** — intentionally, to keep the validator under 200 lines.
- **Does not run against production** — meant for CI and local dev only. Tests should never hit a shared database.
- **Does not perform auth flows** — tests either use a static `x-api-key` in `defaultHeaders` or call the login endpoint explicitly and capture the token.

If you need any of the above, build a thin layer on top of
`ContractRunner` — the stub-able `httpClient` makes that straightforward.

---

## Rule: no deletion

This framework **only adds files**. It does not modify or remove any
existing test infrastructure. Per project policy
(`Agent 54 — the "never delete" rule`) the contract framework lives
side-by-side with whatever contract scaffolding may or may not have
existed before.
